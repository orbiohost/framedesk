import { logger } from '../../utils/logger.js';
import { AiInsight } from '../ai/aiInsight.model.js';
import { getAiSettings, isAiLive } from '../ai/aiSettings.service.js';
import { transcriptText, truncate } from '../ai/aiText.js';
import { analyseOnDemand } from '../ai/analysisWorker.js';
import { creditBalance, creditsForTokens, spendCredits } from '../ai/credits.service.js';
import { GeminiError, generateContent } from '../ai/gemini.client.js';
import { StoredFile } from '../files/file.model.js';
import { Folder } from '../files/folder.model.js';
import { briefsFolderTree, ensureBriefsFolder } from '../files/folders.service.js';
import { Project } from '../projects/project.model.js';
import { Transcript } from '../transcripts/transcript.model.js';
import { User } from '../users/user.model.js';
import { findPoolWorkspace } from '../workspaces/storagePool.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { autoTranscribeBriefFiles } from './briefTranscribe.js';
import { ProjectBrief } from './projectBrief.model.js';

// Writes each project's brief from what is in its "Notes & Briefs" folder.
// Every file there is first read on its own by the analysis worker (handwriting
// transcribed, voice notes and recordings written up); this worker then reads
// all of those together and writes one clear set of notes for the project.

const TICK_MS = 10_000;
const ALL = { crossWorkspace: true };
// Wait this long after the last change, so a batch of uploads makes one brief.
export const BRIEF_DEBOUNCE_MS = 45_000;
const STALE_CLAIM_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 4;
const MAX_FILES = 80;
const ANALYSABLE = new Set(['video', 'audio', 'image', 'document']);
const PENDING_STATES = new Set([null, 'processing']);
const TOTAL_CHARS = 220_000;
const TRANSCRIPT_CHARS = 25_000;

const POINT = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING' },
    fileIds: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['text', 'fileIds'],
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    overview: { type: 'STRING' },
    keyPoints: { type: 'ARRAY', items: POINT },
    decisions: { type: 'ARRAY', items: POINT },
    actionItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          owner: { type: 'STRING', nullable: true },
          due: { type: 'STRING', nullable: true },
          fileIds: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['text', 'fileIds'],
      },
    },
    openQuestions: { type: 'ARRAY', items: POINT },
    meetings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          date: { type: 'STRING', nullable: true },
          attendees: { type: 'ARRAY', items: { type: 'STRING' } },
          summary: { type: 'STRING' },
          decisions: { type: 'ARRAY', items: { type: 'STRING' } },
          fileIds: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['title', 'summary', 'fileIds'],
      },
    },
    notes: { type: 'STRING' },
  },
  required: [
    'title',
    'overview',
    'keyPoints',
    'decisions',
    'actionItems',
    'openQuestions',
    'meetings',
    'notes',
  ],
};

const SYSTEM = `You are the note-taker for a creative studio's project. The team drops their raw meeting material into one folder: photos of handwritten notes and whiteboards, voice notes, meeting recordings, scanned pages and documents. Each file has already been read for you (handwriting transcribed, speech written up). Your job is to turn all of it into one clear, well-organised brief the whole team can rely on.
Rules:
- Use only what is in the material. Never invent names, dates, amounts, decisions or commitments. If something is unclear or contradictory, say so under open questions.
- When later material changes an earlier decision, the later one wins; mention the change.
- Write in clear, plain English. Keep names, brand terms and quotes in their original language.
- Cite where each point comes from with the ids of the files it is based on.`;

function instructions(today) {
  return `Today is ${today}. Return JSON with:
- title: a short title for this brief (e.g. "Launch film — client kickoff & revisions").
- overview: 3-6 sentences: what the project is about right now, where things stand, what matters most next.
- keyPoints: the important facts, requirements and ideas (up to 15).
- decisions: what was agreed or decided (up to 15).
- actionItems: concrete to-dos (up to 25). "owner" is the person responsible, only if the material names one; "due" is the deadline as written (convert to YYYY-MM-DD when the date is unambiguous), else null.
- openQuestions: unresolved questions, unclear handwriting, contradictions, missing info (up to 10).
- meetings: one entry per meeting, call or note-taking session you can tell apart (by date, recording or page), oldest first, with its date if known, attendees if named, a summary and its decisions.
- notes: the full, clean write-up as Markdown — the proper notes someone would want after the meetings. Use "##" headings per meeting or topic, bullet lists, and **bold** for key names, dates and amounts. After a statement, cite its source as [[file:<id>]] (the exact 24-character file id). Up to ~1500 words.
Every fileIds list uses the exact file ids given below.`;
}

let timer = null;
let ticking = false;
let pausedUntil = 0;

function dateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

async function finish(brief, staleAtClaim, changes) {
  // Changed again while this ran: keep it queued so the newest material gets in.
  const result = await ProjectBrief.updateOne(
    { _id: brief._id, workspaceId: brief.workspaceId, staleSince: staleAtClaim },
    { $set: { ...changes, staleSince: null, claimedAt: null, runStartedAt: null } },
  );
  if (result.matchedCount === 0) {
    const { status: _ignored, ...rest } = changes;
    await ProjectBrief.updateOne(
      { _id: brief._id, workspaceId: brief.workspaceId },
      { $set: { ...rest, status: 'queued', claimedAt: null } },
    );
  }
}

async function filesOf(brief) {
  let root = await Folder.findOne({
    _id: brief.folderId,
    workspaceId: brief.workspaceId,
    kind: 'briefs',
  }).lean();
  if (!root) root = await ensureBriefsFolder(brief.workspaceId, brief.projectId);
  const folderIds = await briefsFolderTree(brief.workspaceId, root);
  const files = await StoredFile.find({
    workspaceId: brief.workspaceId,
    folderId: { $in: folderIds },
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .limit(MAX_FILES)
    .lean();
  return { root, files: files.reverse() };
}

// Files not read yet are read now (charged to whoever uploaded them).
// Returns true while some are still being read.
async function readPending(files, settings) {
  const unread = files.filter(
    (file) => ANALYSABLE.has(file.category) && [null, 'no_credits'].includes(file.aiState),
  );
  if (unread.length > 0) await analyseOnDemand(unread, settings, { askedBy: null, waitMs: 1500 });
  const states = await StoredFile.find({
    _id: { $in: files.map((file) => file._id) },
    workspaceId: files[0].workspaceId,
  })
    .select('aiState category')
    .lean();
  return states.some((file) => ANALYSABLE.has(file.category) && PENDING_STATES.has(file.aiState));
}

function signatureOf(files, insights) {
  return files
    .map((file) => {
      const insight = insights.get(String(file._id));
      return `${file._id}:${new Date(file.updatedAt).getTime()}:${insight ? new Date(insight.updatedAt).getTime() : 0}`;
    })
    .join('|');
}

function fileBlock(file, index, insight, transcript, uploader, transcriptBudget) {
  const lines = [
    `### File ${index + 1} — id: ${file._id}`,
    `Name: ${file.displayName} (${file.category})`,
    `Added: ${dateOnly(file.createdAt)}${uploader ? ` by ${uploader}` : ''}`,
  ];
  if (file.note) lines.push(`Team note: ${truncate(file.note, 1000)}`);
  if (file.tags?.length) lines.push(`Tags: ${file.tags.join(', ')}`);
  if (insight?.summary) {
    lines.push(`Summary: ${insight.summary}`);
    if (insight.details) lines.push(`Contents:\n${insight.details}`);
    if (insight.moments?.length) {
      lines.push(
        `Key moments:\n${insight.moments.map((moment) => `- ${moment.at}: ${moment.text}`).join('\n')}`,
      );
    }
  } else {
    lines.push(`(Could not be read${insight?.note ? `: ${insight.note}` : ''}.)`);
  }
  if (transcript?.segments?.length && transcriptBudget > 500) {
    lines.push(`Transcript:\n${transcriptText(transcript.segments, transcriptBudget)}`);
  }
  return lines.join('\n');
}

async function buildPrompt(brief, project, files, insights) {
  const [transcripts, uploaders] = await Promise.all([
    Transcript.find({
      workspaceId: brief.workspaceId,
      fileId: { $in: files.map((file) => file._id) },
      status: 'done',
    })
      .select('fileId segments')
      .lean(),
    User.find({ _id: { $in: [...new Set(files.map((file) => String(file.uploadedBy)))] } })
      .select('name')
      .lean(),
  ]);
  const transcriptByFile = new Map(transcripts.map((item) => [String(item.fileId), item]));
  const names = new Map(uploaders.map((user) => [String(user._id), user.name]));

  const header = [`Project: ${project.title}`];
  if (project.description)
    header.push(`Project description: ${truncate(project.description, 2000)}`);

  // Newest files keep their full transcript first; older ones get what is left.
  let budget = TOTAL_CHARS;
  const blocks = [];
  for (let index = files.length - 1; index >= 0; index -= 1) {
    const file = files[index];
    const block = fileBlock(
      file,
      index,
      insights.get(String(file._id)),
      transcriptByFile.get(String(file._id)),
      names.get(String(file.uploadedBy)),
      Math.min(TRANSCRIPT_CHARS, Math.max(0, budget - 15_000)),
    );
    blocks.unshift(truncate(block, Math.max(800, budget)));
    budget -= block.length;
  }
  return `${header.join('\n')}\n\nThe material, oldest first:\n\n${blocks.join('\n\n')}\n\n${instructions(dateOnly(new Date()))}`;
}

function idsIn(list, known) {
  return (Array.isArray(list) ? list : [])
    .map(String)
    .filter((id) => known.has(id))
    .slice(0, 10);
}

function text(value, max) {
  return truncate(String(value ?? '').trim(), max);
}

function points(list, known, max) {
  return (Array.isArray(list) ? list : [])
    .slice(0, max)
    .map((point) => ({ text: text(point?.text, 800), fileIds: idsIn(point?.fileIds, known) }))
    .filter((point) => point.text);
}

function parse(raw, known) {
  const data = JSON.parse(raw);
  return {
    title: text(data.title, 200),
    overview: text(data.overview, 4000),
    keyPoints: points(data.keyPoints, known, 20),
    decisions: points(data.decisions, known, 20),
    openQuestions: points(data.openQuestions, known, 15),
    actionItems: (Array.isArray(data.actionItems) ? data.actionItems : [])
      .slice(0, 30)
      .map((item) => ({
        text: text(item?.text, 500),
        owner: item?.owner ? text(item.owner, 120) : null,
        due: item?.due ? text(item.due, 60) : null,
        fileIds: idsIn(item?.fileIds, known),
      }))
      .filter((item) => item.text),
    meetings: (Array.isArray(data.meetings) ? data.meetings : []).slice(0, 30).map((meeting) => ({
      title: text(meeting?.title, 200) || 'Meeting',
      date: meeting?.date ? text(meeting.date, 60) : null,
      attendees: (Array.isArray(meeting?.attendees) ? meeting.attendees : [])
        .map((name) => text(name, 80))
        .filter(Boolean)
        .slice(0, 20),
      summary: text(meeting?.summary, 3000),
      decisions: (Array.isArray(meeting?.decisions) ? meeting.decisions : [])
        .map((decision) => text(decision, 500))
        .filter(Boolean)
        .slice(0, 15),
      fileIds: idsIn(meeting?.fileIds, known),
    })),
    notes: text(data.notes, 40_000),
  };
}

const EMPTY_CONTENT = {
  title: '',
  overview: '',
  keyPoints: [],
  decisions: [],
  actionItems: [],
  openQuestions: [],
  meetings: [],
  notes: '',
  signature: null,
  sourceFileIds: [],
};

async function writeBrief(brief, settings) {
  const staleAtClaim = brief.staleSince;
  const project = await Project.findOne({ _id: brief.projectId, workspaceId: brief.workspaceId })
    .select('title description createdBy')
    .lean();
  if (!project) {
    await ProjectBrief.deleteOne({ _id: brief._id, workspaceId: brief.workspaceId });
    return;
  }

  const { root, files } = await filesOf(brief);
  if (files.length === 0) {
    await finish(brief, staleAtClaim, {
      ...EMPTY_CONTENT,
      status: 'empty',
      folderId: root._id,
      error: null,
    });
    return;
  }

  // Clips that were never looked at (put here before this existed, or missed).
  await autoTranscribeBriefFiles(files);
  if (await readPending(files, settings)) {
    // Checked again after the debounce; a finished analysis also re-queues it.
    await ProjectBrief.updateOne(
      { _id: brief._id, workspaceId: brief.workspaceId },
      { $set: { status: 'waiting', staleSince: new Date(), claimedAt: null } },
    );
    return;
  }

  const fresh = await StoredFile.find({
    _id: { $in: files.map((file) => file._id) },
    workspaceId: brief.workspaceId,
  }).lean();
  const ordered = files
    .map((file) => fresh.find((item) => String(item._id) === String(file._id)))
    .filter(Boolean);
  const insights = new Map(
    (
      await AiInsight.find({
        workspaceId: brief.workspaceId,
        fileId: { $in: ordered.map((file) => file._id) },
      }).lean()
    ).map((insight) => [String(insight.fileId), insight]),
  );
  const signature = signatureOf(ordered, insights);
  if (signature === brief.signature && brief.generatedAt) {
    await finish(brief, staleAtClaim, { status: 'ready', error: null });
    return;
  }

  const workspace = await Workspace.findById(brief.workspaceId).lean();
  const pool = workspace && (await findPoolWorkspace(workspace));
  const minimum = Math.max(1, settings.minAnalysisCredits);
  if (!pool || pool.ai?.blocked || creditBalance(pool, settings).total < minimum) {
    await finish(brief, staleAtClaim, { status: 'no_credits', error: null });
    return;
  }

  const writeStartedAt = Date.now();
  const result = await generateContent({
    model: settings.model,
    system: SYSTEM,
    contents: [
      { role: 'user', parts: [{ text: await buildPrompt(brief, project, ordered, insights) }] },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 16_384,
    },
  });
  const writeMs = Date.now() - writeStartedAt;
  const known = new Set(ordered.map((file) => String(file._id)));
  const content = parse(result.text, known);

  const credits = creditsForTokens(result.totalTokens, settings, settings.minAnalysisCredits);
  const latest = ordered.at(-1);
  const { spent } = await spendCredits(pool._id, credits, {
    kind: 'brief',
    usedInWorkspaceId: brief.workspaceId,
    userId: latest?.uploadedBy ?? project.createdBy,
    tokens: result.totalTokens,
    note: `Project brief: ${project.title}`.slice(0, 200),
  });
  await finish(brief, staleAtClaim, {
    ...content,
    status: 'ready',
    error: null,
    attempts: 0,
    retryAt: null,
    signature,
    sourceFileIds: ordered.map((file) => file._id),
    folderId: root._id,
    generatedAt: new Date(),
    model: result.model,
    tokens: result.totalTokens,
    credits: spent,
    writeMs,
    // A rewritten brief has new action items; old ids no longer match.
    tasksCreatedFor: [],
  });
}

async function retryLater(brief, error) {
  const attempts = (brief.attempts ?? 0) + 1;
  const final =
    attempts >= MAX_ATTEMPTS ||
    (error instanceof GeminiError && !error.transient) ||
    error instanceof SyntaxError;
  const message = truncate(
    error instanceof SyntaxError ? 'The AI answer could not be read' : error.message,
    300,
  );
  await ProjectBrief.updateOne(
    { _id: brief._id, workspaceId: brief.workspaceId },
    {
      $set: final
        ? {
            status: 'failed',
            error: message,
            attempts,
            staleSince: null,
            claimedAt: null,
            runStartedAt: null,
          }
        : {
            status: 'queued',
            error: message,
            attempts,
            claimedAt: null,
            retryAt: new Date(Date.now() + 2 * 60 * 1000 * 2 ** (attempts - 1)),
          },
    },
  );
}

function claimNext(now) {
  return ProjectBrief.findOneAndUpdate(
    {
      staleSince: { $ne: null, $lte: new Date(now.getTime() - BRIEF_DEBOUNCE_MS) },
      status: { $ne: 'generating' },
      $or: [{ retryAt: null }, { retryAt: { $lte: now } }],
    },
    { $set: { status: 'generating', claimedAt: now } },
    { sort: { staleSince: 1 }, new: true },
  )
    .setOptions(ALL)
    .lean();
}

export async function runBriefTick() {
  if (ticking || Date.now() < pausedUntil) return;
  ticking = true;
  let brief = null;
  try {
    const settings = await getAiSettings();
    if (!isAiLive(settings)) return;
    const now = new Date();
    // A worker that died mid-brief leaves it "generating".
    await ProjectBrief.updateMany(
      { status: 'generating', claimedAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
      { $set: { status: 'queued', claimedAt: null } },
    ).setOptions(ALL);
    brief = await claimNext(now);
    if (!brief) return;
    await writeBrief(brief, settings);
  } catch (error) {
    if (error instanceof GeminiError && error.status === 429) pausedUntil = Date.now() + 60_000;
    logger.warn(
      { err: error.message, briefId: brief && String(brief._id) },
      'Project brief failed',
    );
    if (brief) await retryLater(brief, error).catch(() => {});
  } finally {
    ticking = false;
  }
}

export function startBriefWorker() {
  if (timer) return;
  timer = setInterval(runBriefTick, TICK_MS);
  timer.unref();
  logger.info('Project brief worker started');
}

export function stopBriefWorker() {
  clearInterval(timer);
  timer = null;
}
