import { AppError } from '../../utils/AppError.js';
import { ProjectBrief } from '../briefs/projectBrief.model.js';
import { StoredFile } from '../files/file.model.js';
import { hiddenFolderIds } from '../files/folderAccess.js';
import { toFileDto } from '../files/files.service.js';
import { Folder } from '../files/folder.model.js';
import { ensureDriveFolder } from '../files/folders.service.js';
import { Project } from '../projects/project.model.js';
import { createNote, loadNotesForAi, savedAnswersIn } from '../quickNotes/quickNotes.service.js';
import { Transcript } from '../transcripts/transcript.model.js';
import { AiConversation } from './aiConversation.model.js';
import { AiThread, MAX_THREAD_MESSAGES } from './aiThread.model.js';
import { AiInsight } from './aiInsight.model.js';
import { getAiSettings, isAiLive } from './aiSettings.service.js';
import { analyseOnDemand } from './analysisWorker.js';
import { clock, formatSize, transcriptText, truncate } from './aiText.js';
import { creditBalance, creditsForTokens, resetPriceFor, spendCredits } from './credits.service.js';
import { isGeminiConfigured, streamContent, toAppError } from './gemini.client.js';

// The chat: answers questions about the workspace's files from the notes the
// analysis worker made (plus transcripts), never from files the asker can't open.

const ANALYSABLE = ['video', 'audio', 'image', 'document'];
const LIBRARY_LIMIT = 500;
const FOCUS_FILES = 8;
const TRANSCRIPT_BUDGET = 120_000;
const TRANSCRIPT_PER_FILE = 40_000;
const HISTORY_TURNS = 12;
// Files studied on the spot for one question, and how long the answer waits for them.
const ON_DEMAND_FILES = 4;
const ON_DEMAND_WAIT_MS = 60_000;
// Files listed by name only, after the focus files; keeps prompts (and waits) small.
const OTHER_FILES_LISTED = 150;
const THREADS_LISTED = 60;
// Files one question can carry ("@" or uploaded in the chat), and "@" results.
export const MAX_ATTACHED = 5;
// Notes one question can carry ("#"), and how much of them the prompt holds.
export const MAX_NOTES = 5;
const NOTE_PER_NOTE = 8_000;
const NOTE_BUDGET = 24_000;
// A saved answer must fit in a note.
const NOTE_BODY_MAX = 10_000;
const ATTACH_SEARCH_LIMIT = 20;
const AI_UPLOADS_FOLDER = 'AI uploads';
const LIBRARY_FIELDS =
  'displayName extension category size mime status tags note folderId projectId createdAt uploadedBy aiState linkedProjectIds version';
const CITATION = /\[\[file:([a-f\d]{24})\]\]/gi;
const STOP_WORDS = new Set(
  'the a an and or of to in on for with is are was were be it this that what which who whom where when how why do does did my our your me i we you there their them any all show tell find about from into have has had can could please give list file files video videos clip clips'.split(
    ' ',
  ),
);

// Greetings and thanks get a quick, friendly reply: no files read, nothing analysed.
const SMALL_TALK = new Set(
  'hi hii hiii hello helo hey heya hlo yo hola namaste namaskar hai good morning afternoon evening night day thanks thank thx ty ok okay k cool nice great awesome bye goodbye see later sup whats up wassup how are doing fine well thats lot much so very again bro sir dear buddy'.split(
    ' ',
  ),
);

function isSmallTalk(text) {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return (
    words.length > 0 &&
    words.length <= 8 &&
    words.every((word) => SMALL_TALK.has(word) || STOP_WORDS.has(word))
  );
}

function firstName(user) {
  return (user.name ?? '').trim().split(/\s+/)[0] || 'there';
}

function assertLive(settings, pool) {
  if (!isAiLive(settings)) {
    throw AppError.unavailable('The AI assistant is turned off right now', 'AI_OFF');
  }
  if (pool.ai?.blocked) {
    throw AppError.forbidden('The AI assistant is not available for this account', 'AI_BLOCKED');
  }
}

function timeOfDay(date) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function noCreditsError(balance) {
  const window = balance?.limitedBy === 'weekly' ? balance.weekly : balance?.session;
  const which = balance?.limitedBy === 'weekly' ? 'weekly' : '5-hour';
  const when = window?.resetsAt ? ` It resets ${timeOfDay(new Date(window.resetsAt))}.` : '';
  return new AppError(
    402,
    'NO_CREDITS',
    `You’ve reached your ${which} AI usage limit.${when} Owners can buy extra usage on the Upgrade page.`,
    { usage: balance },
  );
}

export async function getAiStatus({ workspace, pool }) {
  const settings = await getAiSettings();
  const live = isAiLive(settings) && !pool.ai?.blocked;
  if (!live) {
    return { enabled: false, configured: isGeminiConfigured(), autoAnalyze: settings.autoAnalyze };
  }
  const base = { workspaceId: workspace._id, deletedAt: null, category: { $in: ANALYSABLE } };
  const [total, analyzed, waiting] = await Promise.all([
    StoredFile.countDocuments(base),
    StoredFile.countDocuments({ ...base, aiState: 'done' }),
    // Only files being studied right now (others wait until someone asks).
    StoredFile.countDocuments({ ...base, aiState: 'processing' }),
  ]);
  return {
    enabled: true,
    configured: true,
    autoAnalyze: settings.autoAnalyze,
    credits: creditBalance(pool, settings),
    // Rupees before GST to reset the limits now; null when it can't be bought.
    resetPrice: resetPriceFor(pool, settings),
    library: { total, analyzed, waiting },
  };
}

function terms(text) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
    ),
  ];
}

function scoreOf(entry, queryTerms, question) {
  if (queryTerms.length === 0) return 0;
  const name = entry.file.displayName.toLowerCase();
  const haystack = [
    name,
    entry.file.note,
    entry.file.tags?.join(' '),
    entry.project,
    entry.folder,
    entry.insight?.summary,
    entry.insight?.details,
    entry.insight?.tags?.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (name.includes(term)) score += 4;
    else if (haystack.includes(term)) score += 1;
  }
  const bareName = name.replace(/\.[^.]+$/, '');
  if (bareName.length > 2 && question.toLowerCase().includes(bareName)) score += 20;
  return score;
}

// project: limit the library to that project's files (its own and linked ones).
async function loadLibrary(workspaceId, viewer, project = null) {
  const hidden = await hiddenFolderIds(workspaceId, viewer);
  const filter = { workspaceId, deletedAt: null };
  if (project) filter.$or = [{ projectId: project._id }, { linkedProjectIds: project._id }];
  if (hidden.size > 0) filter.folderId = { $nin: [...hidden] };
  const [files, total] = await Promise.all([
    StoredFile.find(filter)
      .sort({ _id: -1 })
      .limit(LIBRARY_LIMIT)
      .select(LIBRARY_FIELDS)
      .populate('uploadedBy', 'name')
      .lean(),
    StoredFile.countDocuments(filter),
  ]);
  return { total, entries: await toEntries(workspaceId, files) };
}

// Library rows for files: their AI notes and where they live.
async function toEntries(workspaceId, files) {
  const ids = files.map((file) => file._id);
  const [insights, folders, projects] = await Promise.all([
    AiInsight.find({ workspaceId, fileId: { $in: ids } })
      .select('fileId summary details tags moments language source note')
      .lean(),
    Folder.find({ workspaceId }).select('name').lean(),
    Project.find({ workspaceId }).select('title').lean(),
  ]);
  const insightByFile = new Map(insights.map((row) => [String(row.fileId), row]));
  const folderName = new Map(folders.map((row) => [String(row._id), row.name]));
  const projectName = new Map(projects.map((row) => [String(row._id), row.title]));
  return files.map((file) => ({
    id: String(file._id),
    file,
    insight: insightByFile.get(String(file._id)) ?? null,
    folder: folderName.get(String(file.folderId)) ?? null,
    project: file.projectId ? (projectName.get(String(file.projectId)) ?? null) : null,
  }));
}

// Files attached to a question with "@" or uploaded in the chat. Every one must
// still exist and be open to the asker.
async function loadAttached(workspaceId, viewer, fileIds) {
  const unique = [...new Set((fileIds ?? []).map(String))];
  if (unique.length === 0) return [];
  const [hidden, files] = await Promise.all([
    hiddenFolderIds(workspaceId, viewer),
    StoredFile.find({ workspaceId, _id: { $in: unique }, deletedAt: null })
      .select(LIBRARY_FIELDS)
      .populate('uploadedBy', 'name')
      .lean(),
  ]);
  const visible = files.filter((file) => !hidden.has(String(file.folderId)));
  if (visible.length !== unique.length) {
    throw AppError.notFound(
      'An attached file was deleted or you can’t open it. Remove it and try again.',
      'FILE_NOT_FOUND',
    );
  }
  const order = new Map(unique.map((id, index) => [id, index]));
  visible.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
  return toEntries(workspaceId, visible);
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The "@" picker: files the asker can open whose name matches, newest first.
export async function searchFiles({ workspace, viewer }, { q = '', projectId = null }) {
  const hidden = await hiddenFolderIds(workspace._id, viewer);
  const filter = { workspaceId: workspace._id, deletedAt: null };
  const needle = q.trim();
  if (needle) filter.displayName = { $regex: escapeRegex(needle), $options: 'i' };
  if (projectId) filter.$or = [{ projectId }, { linkedProjectIds: projectId }];
  if (hidden.size > 0) filter.folderId = { $nin: [...hidden] };
  const files = await StoredFile.find(filter)
    .sort({ _id: -1 })
    .limit(ATTACH_SEARCH_LIMIT)
    .select('displayName category size projectId aiState')
    .lean();
  const projectIds = [
    ...new Set(files.filter((file) => file.projectId).map((file) => String(file.projectId))),
  ];
  const projects = projectIds.length
    ? await Project.find({ workspaceId: workspace._id, _id: { $in: projectIds } })
        .select('title')
        .lean()
    : [];
  const title = new Map(projects.map((row) => [String(row._id), row.title]));
  return files.map((file) => ({
    id: String(file._id),
    name: file.displayName,
    category: file.category,
    size: file.size,
    project: file.projectId ? (title.get(String(file.projectId)) ?? null) : null,
    analysed: file.aiState === 'done',
  }));
}

function describe(entry, { full }) {
  const { file, insight } = entry;
  const where = [
    entry.project && `project "${entry.project}"`,
    entry.folder && `folder "${entry.folder}"`,
  ]
    .filter(Boolean)
    .join(', ');
  const lines = [
    `[[file:${entry.id}]] ${file.displayName} — ${file.category}, ${formatSize(file.size)}, uploaded ${file.createdAt.toISOString().slice(0, 10)}${file.uploadedBy?.name ? ` by ${file.uploadedBy.name}` : ''}${where ? `, in ${where}` : ''}, status ${file.status}`,
  ];
  if (file.tags?.length) lines.push(`  Team tags: ${file.tags.join(', ')}`);
  if (file.note) lines.push(`  Team note: ${truncate(file.note, full ? 1500 : 200)}`);
  if (insight?.summary) {
    lines.push(`  Summary: ${full ? insight.summary : truncate(insight.summary, 300)}`);
    if (full) {
      if (insight.details) lines.push(`  Details: ${insight.details}`);
      if (insight.tags?.length) lines.push(`  AI tags: ${insight.tags.join(', ')}`);
      if (insight.moments?.length) {
        lines.push(
          `  Key moments: ${insight.moments.map((moment) => `${moment.at} ${moment.text}`).join(' | ')}`,
        );
      }
      if (insight.language) lines.push(`  Language: ${insight.language}`);
    }
  } else if (file.aiState === 'processing') {
    lines.push('  (Being analysed right now; ask again in a minute for its contents.)');
  } else if (!file.aiState && ANALYSABLE.includes(file.category)) {
    lines.push('  (Not analysed yet; only the details above are known.)');
  } else if (insight?.note) {
    lines.push(`  (Not analysed: ${insight.note})`);
  }
  return lines.join('\n');
}

async function transcriptsFor(workspaceId, entries) {
  if (entries.length === 0) return '';
  const rows = await Transcript.find({
    workspaceId,
    fileId: { $in: entries.map((entry) => entry.file._id) },
    status: 'done',
  })
    .select('fileId segments durationSec')
    .lean();
  let budget = TRANSCRIPT_BUDGET;
  const blocks = [];
  for (const entry of entries) {
    const row = rows.find((candidate) => String(candidate.fileId) === entry.id);
    if (!row?.segments?.length || budget <= 0) continue;
    const text = transcriptText(row.segments, Math.min(TRANSCRIPT_PER_FILE, budget));
    budget -= text.length;
    const length = row.durationSec ? `, ${clock(row.durationSec)} long` : '';
    blocks.push(`Transcript of [[file:${entry.id}]] ${entry.file.displayName}${length}:\n${text}`);
  }
  return blocks.join('\n\n');
}

function smallTalkPrompt({ workspaceName, user, fileCount }) {
  return `You are the FrameDesk AI assistant inside the workspace "${workspaceName}". You are chatting with ${user.name}; call them ${firstName(user)}.
They just greeted you or made small talk. Reply warmly in one or two short sentences, greeting them by first name. Mention that you can answer questions about their ${fileCount} files (videos, images, documents, transcripts), and that typing "/" lets them pick a project to focus on.
Reply in the language the user writes in. Don't list or describe any files.`;
}

// Notes picked with "#", as a prompt block. They are the team's own writing
// (often an earlier AI answer), so the model builds on them.
function notesBlock(notes) {
  if (notes.length === 0) return '';
  let budget = NOTE_BUDGET;
  const blocks = [];
  for (const note of notes) {
    if (budget <= 0) break;
    const body = truncate(note.body, Math.min(NOTE_PER_NOTE, budget));
    budget -= body.length;
    const projects = (note.projectIds ?? []).map((project) => project.title).filter(Boolean);
    const meta = [
      `updated ${note.updatedAt.toISOString().slice(0, 10)}`,
      projects.length && `projects: ${projects.join(', ')}`,
    ]
      .filter(Boolean)
      .join('; ');
    blocks.push(`NOTE "${note.title || 'Untitled'}" (${meta}):\n${body}`);
  }
  return blocks.join('\n\n');
}

function systemPrompt({
  workspaceName,
  user,
  project,
  library,
  focus,
  transcripts,
  attached,
  notes,
  brief = null,
}) {
  const focusIds = new Set(focus.map((entry) => entry.id));
  const rest = library.entries.filter((entry) => !focusIds.has(entry.id));
  const omitted = library.total - library.entries.length;
  let scope = project
    ? `\nThis question is limited to the project "${project.title}": the library below holds only that project's files. Answer about this project only.\n`
    : '';
  if (attached.length > 0) {
    scope += `\nThe user attached ${attached.length === 1 ? 'this file' : 'these files'} to the question: ${attached
      .map((entry) => `${entry.file.displayName} [[file:${entry.id}]]`)
      .join(
        ', ',
      )}. Words like "this", "it" or "the file" mean ${attached.length === 1 ? 'it' : 'them'}. Answer about ${attached.length === 1 ? 'it' : 'them'} first.\n`;
  }
  if (notes.length > 0) {
    scope += `\nThe user added ${notes.length === 1 ? 'a saved note' : `${notes.length} saved notes`} to the question (see NOTES below). They are the team's own notes, often an earlier answer of yours that was saved. Treat them as trusted context: analyse, build on, compare or update them as asked. Words like "this note" or "the note" mean ${notes.length === 1 ? 'it' : 'them'}.\n`;
  }
  if (brief) {
    scope += `\nThe project has an AI brief written from its "Notes & Briefs" folder (meeting notes, voice notes, recordings). See PROJECT BRIEF below; use it for questions about meetings, decisions, action items and what was agreed, and cite the files it cites.\n`;
  }
  const notesText = notesBlock(notes);
  const briefText = brief ? briefBlock(brief) : '';
  return `You are the FrameDesk AI assistant inside the workspace "${workspaceName}". You help the team find and understand the files they uploaded: videos, audio, images and documents, plus their transcripts.
You are talking to ${user.name}; call them ${firstName(user)} when greeting them.
${scope}
Rules:
- Answer only from the LIBRARY${notesText ? ', the NOTES' : ''} below and this conversation. If the answer isn't there, say so plainly and suggest what to look at. Never invent file contents.
- Every time you mention a file, put its citation right after its name, exactly as written in the library, e.g. "Interview_01.mp4 [[file:0123456789abcdef01234567]]".
- Point into clips with m:ss timestamps when you can.
- Be concise. Use short bullet lists for several files. Use **bold** sparingly.
- Reply in the language the user writes in.
- Today is ${new Date().toISOString().slice(0, 10)}.
${briefText ? `\nPROJECT BRIEF (written ${brief.generatedAt.toISOString().slice(0, 10)})\n\n${briefText}\n` : ''}${notesText ? `\nNOTES (added by the user)\n\n${notesText}\n` : ''}
LIBRARY (${library.total} files the user can open${omitted > 0 ? `; the oldest ${omitted} are not listed` : ''})

Most relevant files, in full:
${focus.map((entry) => describe(entry, { full: true })).join('\n\n') || '(none)'}

${transcripts ? `TRANSCRIPTS\n${transcripts}\n\n` : ''}Other files:
${
  rest
    .slice(0, OTHER_FILES_LISTED)
    .map((entry) => describe(entry, { full: false }))
    .join('\n') || '(none)'
}${rest.length > OTHER_FILES_LISTED ? `\n(${rest.length - OTHER_FILES_LISTED} more files not listed)` : ''}`;
}

function toMessageDto(message) {
  return {
    id: String(message._id),
    role: message.role,
    text: message.text,
    fileIds: (message.fileIds ?? []).map(String),
    credits: message.credits ?? 0,
    project: message.projectId
      ? { id: String(message.projectId), title: message.projectTitle }
      : null,
    attachments: (message.attachments ?? []).map((file) => ({
      id: String(file.fileId),
      name: file.name,
      category: file.category,
    })),
    notes: (message.notes ?? []).map((note) => ({ id: String(note.noteId), title: note.title })),
    stopped: Boolean(message.stopped),
    createdAt: message.createdAt,
  };
}

// File cards for cited files the viewer can still open.
async function citedFiles(workspaceId, fileIds, viewer) {
  const unique = [...new Set(fileIds.map(String))];
  if (unique.length === 0) return [];
  const hidden = await hiddenFolderIds(workspaceId, viewer);
  const files = await StoredFile.find({ workspaceId, _id: { $in: unique }, deletedAt: null })
    .populate('uploadedBy', 'name')
    .lean();
  return files.filter((file) => !hidden.has(String(file.folderId))).map(toFileDto);
}

function toThreadSummary(thread) {
  return {
    id: String(thread._id),
    title: thread.title,
    lastMessageAt: thread.lastMessageAt,
    messageCount: thread.messageCount ?? thread.messages?.length ?? 0,
  };
}

// The chat from before history existed becomes the first thread, once.
async function adoptLegacyConversation(workspace, user) {
  const legacy = await AiConversation.findOne({
    workspaceId: workspace._id,
    userId: user._id,
  }).lean();
  if (!legacy) return;
  if (legacy.messages?.length) {
    const first = legacy.messages.find((message) => message.role === 'user');
    await AiThread.create({
      workspaceId: workspace._id,
      userId: user._id,
      title: titleFrom(first?.text ?? 'Earlier chat'),
      messages: legacy.messages,
      lastMessageAt: legacy.messages.at(-1)?.createdAt ?? legacy.updatedAt,
    });
  }
  await AiConversation.deleteOne({ workspaceId: workspace._id, userId: user._id });
}

export async function listThreads({ workspace, user }) {
  await adoptLegacyConversation(workspace, user);
  const threads = await AiThread.aggregate([
    { $match: { workspaceId: workspace._id, userId: user._id } },
    { $sort: { lastMessageAt: -1 } },
    { $limit: THREADS_LISTED },
    { $project: { title: 1, lastMessageAt: 1, messageCount: { $size: '$messages' } } },
  ]);
  return threads.map(toThreadSummary);
}

async function findThreadOrThrow(workspace, user, threadId) {
  const thread = await AiThread.findOne({
    _id: threadId,
    workspaceId: workspace._id,
    userId: user._id,
  }).lean();
  if (!thread) throw AppError.notFound('Chat not found', 'THREAD_NOT_FOUND');
  return thread;
}

export async function getThread({ workspace, user, viewer }, threadId) {
  const thread = await findThreadOrThrow(workspace, user, threadId);
  const [files, savedNotes] = await Promise.all([
    citedFiles(
      workspace._id,
      thread.messages.flatMap((message) => message.fileIds ?? []),
      viewer,
    ),
    savedAnswersIn(workspace._id, user._id, thread._id),
  ]);
  return {
    thread: toThreadSummary(thread),
    messages: thread.messages.map(toMessageDto),
    files,
    // { messageId: noteId } for answers already saved to notes.
    savedNotes,
  };
}

// "Save to notes" on an answer: the answer becomes a quick note that links
// back to this chat. The text comes from the stored answer, not the request.
export async function saveAnswerAsNote(
  { workspace, user },
  threadId,
  messageId,
  { title, projectIds, visibility },
) {
  const thread = await findThreadOrThrow(workspace, user, threadId);
  const index = thread.messages.findIndex((message) => String(message._id) === messageId);
  const message = thread.messages[index];
  if (!message || message.role !== 'model') {
    throw AppError.notFound('That answer is no longer in this chat', 'MESSAGE_NOT_FOUND');
  }
  const question = thread.messages
    .slice(0, index)
    .findLast((candidate) => candidate.role === 'user');
  // Citations only mean something inside the chat; the file's name sits beside each one.
  const body = message.text
    .replace(CITATION, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:)])/g, '$1')
    .trim();
  if (!body || message.text === '_Stopped._') {
    throw AppError.badRequest('This answer is empty, so there is nothing to save', 'EMPTY_ANSWER');
  }
  const defaultTitle = titleFrom(question?.text ?? thread.title).slice(0, 160);
  return createNote(
    workspace._id,
    user._id,
    {
      title: title?.trim() || defaultTitle,
      body: body.length > NOTE_BODY_MAX ? `${body.slice(0, NOTE_BODY_MAX - 1).trimEnd()}…` : body,
      projectIds: projectIds ?? (question?.projectId ? [String(question.projectId)] : []),
      visibility,
    },
    {
      source: {
        kind: 'ai',
        threadId: thread._id,
        messageId: message._id,
        question: question ? truncate(question.text, 500) : null,
        fileIds: message.fileIds ?? [],
      },
    },
  );
}

export async function renameThread({ workspace, user }, threadId, { title }) {
  await findThreadOrThrow(workspace, user, threadId);
  await AiThread.updateOne(
    { _id: threadId, workspaceId: workspace._id, userId: user._id },
    { $set: { title: titleFrom(title) } },
  );
}

export async function deleteThread({ workspace, user }, threadId) {
  await AiThread.deleteOne({ _id: threadId, workspaceId: workspace._id, userId: user._id });
}

// A chat is named after its first question.
function titleFrom(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean;
}

// Everything the answer is based on: which files, read in full or by name.
// The project brief, as plain text for the system prompt.
function briefBlock(brief) {
  const list = (heading, items) =>
    items?.length ? `${heading}:\n${items.map((item) => `- ${item}`).join('\n')}` : '';
  const cite = (ids) => (ids ?? []).map((id) => ` [[file:${id}]]`).join('');
  return truncate(
    [
      brief.title,
      brief.overview,
      list(
        'Decisions',
        brief.decisions.map((point) => point.text + cite(point.fileIds)),
      ),
      list(
        'Action items',
        brief.actionItems.map(
          (item) =>
            `${item.text}${item.owner ? ` (owner: ${item.owner})` : ''}${item.due ? ` (due: ${item.due})` : ''}${cite(item.fileIds)}`,
        ),
      ),
      list(
        'Open questions',
        brief.openQuestions.map((point) => point.text),
      ),
      brief.notes,
    ]
      .filter(Boolean)
      .join('\n\n'),
    30_000,
  );
}

// A ready brief for the project, if the viewer may open its folder.
async function briefFor(workspaceId, project, viewer) {
  if (!project) return null;
  const brief = await ProjectBrief.findOne({ workspaceId, projectId: project._id }).lean();
  if (!brief?.generatedAt) return null;
  const hidden = await hiddenFolderIds(workspaceId, viewer);
  return hidden.has(String(brief.folderId)) ? null : brief;
}

async function prepareContext({
  workspace,
  user,
  viewer,
  settings,
  project,
  attached,
  notes,
  text,
  history,
  emit,
}) {
  const smallTalk = !project && attached.length === 0 && notes.length === 0 && isSmallTalk(text);
  if (smallTalk) {
    const fileCount = await StoredFile.countDocuments({
      workspaceId: workspace._id,
      deletedAt: null,
    });
    return {
      library: { total: 0, entries: [] },
      system: smallTalkPrompt({ workspaceName: workspace.name, user, fileCount }),
    };
  }

  const lastUserTurns = history
    .filter((message) => message.role === 'user')
    .slice(-2)
    .map((message) => message.text)
    .join(' ');
  const library = await loadLibrary(workspace._id, viewer, project);
  // Attached files lead the library (and can come from outside the project).
  const attachedIds = new Set(attached.map((entry) => entry.id));
  const others = library.entries.filter((entry) => !attachedIds.has(entry.id));
  library.total += attached.length - (library.entries.length - others.length);
  library.entries = [...attached, ...others];

  const queryTerms = terms(`${text} ${lastUserTurns}`);
  const ranked = others
    .map((entry) => ({ entry, score: scoreOf(entry, queryTerms, text) }))
    .sort((a, b) => b.score - a.score);
  // Nothing matched (a general question): the newest files are the focus.
  // With files attached, only real matches join them.
  const room = Math.max(FOCUS_FILES - attached.length, attached.length ? 2 : 0);
  const focus = [
    ...attached,
    ...ranked
      .filter(
        (row, index) =>
          row.score > 0 || (!attached.length && ranked[0]?.score === 0 && index < FOCUS_FILES),
      )
      .slice(0, room)
      .map((row) => row.entry),
  ];

  // Files the question is about that haven't been studied yet are studied now,
  // and only now: attached files always; without a project, other files only
  // when the question actually matches them.
  const matched = new Set(ranked.filter((row) => row.score > 0).map((row) => row.entry.id));
  const unread = focus
    .filter((entry) => attachedIds.has(entry.id) || project || matched.has(entry.id))
    .filter((entry) => !entry.insight?.summary && ANALYSABLE.includes(entry.file.category))
    .filter((entry) => [null, undefined, 'no_credits'].includes(entry.file.aiState))
    .slice(0, Math.max(ON_DEMAND_FILES, attached.length));
  if (unread.length > 0) {
    emit('status', {
      stage: 'studying',
      text:
        unread.length === 1
          ? `Studying ${unread[0].file.displayName}`
          : `Studying ${unread.length} files`,
      files: unread.map((entry) => entry.file.displayName),
    });
    const finished = await analyseOnDemand(
      unread.map((entry) => ({ _id: entry.file._id, workspaceId: workspace._id })),
      settings,
      { askedBy: user._id, waitMs: ON_DEMAND_WAIT_MS },
    );
    if (finished.size > 0) {
      const fresh = await AiInsight.find({
        workspaceId: workspace._id,
        fileId: { $in: [...finished] },
      }).lean();
      for (const insight of fresh) {
        const entry = focus.find((candidate) => candidate.id === String(insight.fileId));
        if (entry) entry.insight = insight;
      }
    }
    for (const entry of unread) {
      if (!finished.has(entry.id) && !entry.insight?.summary) entry.file.aiState = 'processing';
    }
  }
  const [transcripts, brief] = await Promise.all([
    transcriptsFor(workspace._id, focus),
    briefFor(workspace._id, project, viewer),
  ]);
  return {
    library,
    system: systemPrompt({
      workspaceName: workspace.name,
      user,
      project,
      library,
      focus,
      transcripts,
      attached,
      notes,
      brief,
    }),
  };
}

// The Drive folder files uploaded in the AI chat go to, created on first use.
export async function getUploadFolder({ workspace, user }) {
  return ensureDriveFolder(workspace._id, AI_UPLOADS_FOLDER, user._id);
}

/**
 * Answers a question, streaming the words as Gemini writes them.
 * emit(event, data) sends: 'thread' (the chat it belongs to), 'status',
 * 'delta' ({ text }), and finally 'done' ({ messages, files, credits, thread }).
 * threadId null starts a new chat. `signal` aborts when the person stops it.
 */
export async function streamAnswer(
  { workspace, pool, user, viewer },
  { threadId, text, projectId, fileIds: attachIds = [], noteIds = [] },
  { emit, signal },
) {
  const settings = await getAiSettings();
  assertLive(settings, pool);
  const minimum = Math.max(1, settings.minChatCredits);
  const balance = creditBalance(pool, settings);
  if (balance.total < minimum) throw noCreditsError(balance);

  const [existing, project, attached, notes] = await Promise.all([
    threadId ? findThreadOrThrow(workspace, user, threadId) : null,
    projectId
      ? Project.findOne({ _id: projectId, workspaceId: workspace._id }).select('title').lean()
      : null,
    loadAttached(workspace._id, viewer, attachIds.slice(0, MAX_ATTACHED)),
    loadNotesForAi(workspace._id, user._id, noteIds.slice(0, MAX_NOTES)),
  ]);
  if (projectId && !project) throw AppError.notFound('Project not found', 'PROJECT_NOT_FOUND');

  const thread =
    existing ??
    (
      await AiThread.create({
        workspaceId: workspace._id,
        userId: user._id,
        title: titleFrom(text),
        messages: [],
      })
    ).toObject();
  emit('thread', { thread: toThreadSummary(thread), created: !existing });

  const history = (thread.messages ?? []).slice(-HISTORY_TURNS);
  emit('status', { stage: 'searching', text: 'Searching your files' });
  const { library, system } = await prepareContext({
    workspace,
    user,
    viewer,
    settings,
    project,
    attached,
    notes,
    text,
    history,
    emit,
  });

  emit('status', { stage: 'writing', text: 'Writing' });
  let answer = '';
  let tokens = 0;
  let stopped = false;
  try {
    for await (const event of streamContent({
      model: settings.model,
      system,
      contents: [
        ...history.map((message) => ({ role: message.role, parts: [{ text: message.text }] })),
        { role: 'user', parts: [{ text }] },
      ],
      config: { temperature: 0.3, maxOutputTokens: 8192 },
      thinkingLevel: 'minimal',
      signal,
    })) {
      if (event.type === 'text') {
        answer += event.text;
        emit('delta', { text: event.text });
      } else if (event.type === 'done') {
        tokens = event.totalTokens;
      }
    }
  } catch (error) {
    if (!signal?.aborted) {
      // A new chat that got no answer at all is removed again.
      if (!existing) {
        await AiThread.deleteOne({ _id: thread._id, workspaceId: workspace._id });
      }
      throw toAppError(error);
    }
    stopped = true;
  }
  if (stopped && !answer.trim()) answer = '_Stopped._';

  const visible = new Set(library.entries.map((entry) => entry.id));
  const fileIds = [
    ...new Set([...answer.matchAll(CITATION)].map((match) => match[1].toLowerCase())),
  ].filter((id) => visible.has(id));
  // Citations to ids that aren't real (or not visible) are dropped from the text.
  const cleaned = answer
    .replace(CITATION, (whole, id) => (visible.has(id.toLowerCase()) ? whole.toLowerCase() : ''))
    .trim();

  // A stopped answer has no token count: charge for what was written, roughly.
  const usedTokens = tokens || Math.ceil((system.length + cleaned.length) / 4);
  const cost = creditsForTokens(usedTokens, settings, settings.minChatCredits);
  const { spent, balance: after } = await spendCredits(pool._id, cost, {
    kind: 'chat',
    userId: user._id,
    usedInWorkspaceId: workspace._id,
    tokens: usedTokens,
  });

  const now = new Date();
  const userMessage = {
    role: 'user',
    text: truncate(text, 20_000),
    projectId: project?._id ?? null,
    projectTitle: project?.title ?? null,
    attachments: attached.map((entry) => ({
      fileId: entry.file._id,
      name: truncate(entry.file.displayName, 200),
      category: entry.file.category,
    })),
    notes: notes.map((note) => ({
      noteId: note._id,
      title: truncate(note.title || titleFrom(note.body), 160),
    })),
    createdAt: now,
  };
  const modelMessage = {
    role: 'model',
    text: truncate(cleaned, 20_000),
    fileIds,
    credits: spent,
    stopped,
    createdAt: new Date(now.getTime() + 1),
  };
  const saved = await AiThread.findOneAndUpdate(
    { _id: thread._id, workspaceId: workspace._id, userId: user._id },
    {
      $push: { messages: { $each: [userMessage, modelMessage], $slice: -MAX_THREAD_MESSAGES } },
      $set: { lastMessageAt: modelMessage.createdAt },
    },
    { new: true },
  ).lean();
  const [savedUser, savedModel] = saved.messages.slice(-2);
  const result = {
    thread: toThreadSummary(saved),
    messages: [toMessageDto(savedUser), toMessageDto(savedModel)],
    files: await citedFiles(workspace._id, fileIds, viewer),
    credits: after,
  };
  emit('done', result);
  return result;
}
