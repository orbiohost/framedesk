import { getStorageDriver } from '../../storage/storageDriver.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { AiInsight } from '../ai/aiInsight.model.js';
import { getAiSettings, isAiLive } from '../ai/aiSettings.service.js';
import { truncate } from '../ai/aiText.js';
import { analyseOnDemand } from '../ai/analysisWorker.js';
import { creditBalance, creditsForTokens, spendCredits } from '../ai/credits.service.js';
import { generateContent, toAppError } from '../ai/gemini.client.js';
import { StoredFile } from '../files/file.model.js';
import { correctedMime } from '../files/fileTypes.js';
import { hiddenFolderIds } from '../files/folderAccess.js';
import { ensureDriveFolder } from '../files/folders.service.js';
import { Project } from '../projects/project.model.js';
import { createNote } from '../quickNotes/quickNotes.service.js';
import {
  MAX_CHAT,
  MAX_ITEMS,
  MAX_STROKE_POINTS,
  MAX_STROKES,
  Moodboard,
} from './moodboard.model.js';

// Where images and videos added to moodboards are stored (a Drive folder).
export const MOODBOARD_FOLDER = 'Moodboards';

// Images sent to Gemini as they are (the rest are described from their analysis).
const INLINE_IMAGES = 12;
const INLINE_IMAGE_BYTES = 4 * 1024 * 1024;
const INLINE_TOTAL_BYTES = 14 * 1024 * 1024;
const SKETCH_PNG_BYTES = 3 * 1024 * 1024;
const GEMINI_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function ids(list) {
  return (list ?? []).map(String);
}

// --- Reading -------------------------------------------------------------

function toSummaryDto(board, covers) {
  const images = board.items.filter((item) => item.type === 'image' && item.fileId);
  return {
    id: String(board._id),
    title: board.title,
    description: board.description,
    projects: (board.projectIds ?? [])
      .filter((project) => project?.title !== undefined)
      .map((project) => ({ id: String(project._id), title: project.title })),
    // Up to four images for the card, in the order they were added.
    coverFileIds: images
      .slice(0, 4)
      .map((item) => String(item.fileId))
      .filter((id) => covers.has(id)),
    counts: {
      items: board.items.length,
      images: images.length,
      sketches: board.strokes.length,
    },
    analysed: Boolean(board.analysis?.generatedAt),
    updatedAt: board.updatedAt,
  };
}

async function visibleFiles(workspaceId, fileIds, viewer) {
  if (fileIds.length === 0) return new Map();
  const [files, hidden] = await Promise.all([
    StoredFile.find({ _id: { $in: fileIds }, workspaceId, deletedAt: null })
      .select('displayName category mime extension size folderId aiState')
      .lean(),
    hiddenFolderIds(workspaceId, viewer),
  ]);
  return new Map(
    files
      .filter((file) => !hidden.has(String(file.folderId)))
      .map((file) => [String(file._id), file]),
  );
}

function populateProjects(query, workspaceId) {
  return query.populate({ path: 'projectIds', select: 'title', match: { workspaceId } });
}

export async function listMoodboards(workspaceId, { projectId } = {}, viewer) {
  const filter = { workspaceId };
  if (projectId) filter.projectIds = projectId;
  const boards = await populateProjects(
    Moodboard.find(filter).select('-strokes.points -chat -analysis.brief'),
    workspaceId,
  )
    .sort({ updatedAt: -1 })
    .limit(300)
    .lean();
  const fileIds = boards.flatMap((board) =>
    board.items.filter((item) => item.type === 'image' && item.fileId).map((item) => item.fileId),
  );
  const covers = await visibleFiles(workspaceId, fileIds, viewer);
  return boards.map((board) => toSummaryDto(board, covers));
}

function toBoardDto(board, files) {
  return {
    ...toSummaryDto(board, files),
    items: board.items.map((item) => {
      const file = item.fileId ? files.get(String(item.fileId)) : null;
      return {
        ...item,
        fileId: item.fileId ? String(item.fileId) : null,
        // null when the file is gone, or in a folder this viewer can't open.
        file: file
          ? {
              id: String(file._id),
              name: file.displayName,
              category: file.category,
              mime: correctedMime(file.mime, file.extension),
              size: file.size,
            }
          : null,
      };
    }),
    strokes: board.strokes,
    connectors: board.connectors ?? [],
    viewport: board.viewport ?? { x: 0, y: 0, zoom: 1 },
    version: board.version,
    analysis: board.analysis?.generatedAt ? board.analysis : null,
    chat: (board.chat ?? []).map(({ role, text, at }) => ({ role, text, at })),
    createdAt: board.createdAt,
  };
}

async function findBoard(workspaceId, boardId) {
  const board = await populateProjects(
    Moodboard.findOne({ _id: boardId, workspaceId }),
    workspaceId,
  ).lean();
  if (!board) throw AppError.notFound('Moodboard not found');
  return board;
}

export async function getMoodboard(workspaceId, boardId, viewer) {
  const board = await findBoard(workspaceId, boardId);
  const files = await visibleFiles(
    workspaceId,
    board.items.filter((item) => item.fileId).map((item) => item.fileId),
    viewer,
  );
  return toBoardDto(board, files);
}

// --- Writing -------------------------------------------------------------

async function assertProjects(workspaceId, projectIds) {
  if (!projectIds?.length) return;
  const found = await Project.countDocuments({ workspaceId, _id: { $in: projectIds } });
  if (found !== new Set(ids(projectIds)).size) {
    throw AppError.badRequest('One of those projects does not exist', 'PROJECT_NOT_FOUND');
  }
}

export async function createMoodboard(
  workspaceId,
  userId,
  { title, description, projectIds },
  viewer,
) {
  await assertProjects(workspaceId, projectIds);
  const board = await Moodboard.create({
    workspaceId,
    title,
    description: description ?? '',
    projectIds: [...new Set(ids(projectIds))],
    createdBy: userId,
    updatedBy: userId,
  });
  return getMoodboard(workspaceId, board._id, viewer);
}

export async function updateMoodboard(workspaceId, boardId, userId, input, viewer) {
  if (input.projectIds) await assertProjects(workspaceId, input.projectIds);
  const set = { updatedBy: userId };
  if (input.title !== undefined) set.title = input.title;
  if (input.description !== undefined) set.description = input.description;
  if (input.projectIds) set.projectIds = [...new Set(ids(input.projectIds))];
  const result = await Moodboard.updateOne({ _id: boardId, workspaceId }, { $set: set });
  if (result.matchedCount === 0) throw AppError.notFound('Moodboard not found');
  return getMoodboard(workspaceId, boardId, viewer);
}

/**
 * Saves the whole canvas (items, strokes, viewport). `version` is the one the
 * editor loaded or last saved; if someone else saved since, nothing is
 * written and the caller gets 409 with the newer board to merge from.
 */
export async function saveCanvas(
  workspaceId,
  boardId,
  userId,
  { items, strokes, connectors = [], viewport, version },
) {
  if (items.length > MAX_ITEMS) {
    throw AppError.badRequest(`A board holds up to ${MAX_ITEMS} items`, 'BOARD_FULL');
  }
  const pointCount = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
  if (strokes.length > MAX_STROKES || pointCount > MAX_STROKE_POINTS * 2) {
    throw AppError.badRequest('The sketch layer is full. Erase some strokes first.', 'SKETCH_FULL');
  }
  // Files must be in this workspace.
  const fileIds = [...new Set(items.filter((item) => item.fileId).map((item) => item.fileId))];
  if (fileIds.length) {
    const found = await StoredFile.countDocuments({ workspaceId, _id: { $in: fileIds } });
    if (found !== fileIds.length) {
      throw AppError.badRequest('A file on the board is not in this workspace', 'FILE_NOT_FOUND');
    }
  }
  const result = await Moodboard.updateOne(
    { _id: boardId, workspaceId, version },
    {
      $set: {
        items,
        strokes: strokes.map((stroke) => ({
          ...stroke,
          points: stroke.points.map((value) => Math.round(value)),
        })),
        // An arrow end stuck to an item that is gone becomes a free point.
        connectors: connectors.map((connector) => ({
          ...connector,
          from: unbindMissing(connector.from, items),
          to: unbindMissing(connector.to, items),
        })),
        ...(viewport && { viewport }),
        updatedBy: userId,
      },
      $inc: { version: 1 },
    },
    { runValidators: true },
  );
  if (result.matchedCount === 0) {
    const exists = await Moodboard.exists({ _id: boardId, workspaceId });
    if (!exists) throw AppError.notFound('Moodboard not found');
    throw AppError.conflict(
      'Someone else changed this board. It has been reloaded with their changes.',
      'BOARD_CHANGED',
    );
  }
  return { version: version + 1 };
}

// A sticky note sent from elsewhere (e.g. text picked in an AI answer), placed
// to the right of what is on the board. Retries if the board changed meanwhile.
export const NOTE_FROM_TEXT_COLOR = '#fef3a8';
export async function addNoteToBoard(workspaceId, boardId, userId, { text, color }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const board = await Moodboard.findOne({ _id: boardId, workspaceId })
      .select('items version title')
      .lean();
    if (!board) throw AppError.notFound('Moodboard not found');
    if (board.items.length >= MAX_ITEMS) {
      throw AppError.badRequest(`A board holds up to ${MAX_ITEMS} items`, 'BOARD_FULL');
    }
    const right = board.items.reduce((max, item) => Math.max(max, item.x + item.w), -Infinity);
    const top = board.items.reduce((min, item) => Math.min(min, item.y), Infinity);
    const lines = text
      .split('\n')
      .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 30)), 0);
    const item = {
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      type: 'note',
      x: Number.isFinite(right) ? Math.round(right + 40) : 0,
      y: Number.isFinite(top) ? Math.round(top) : 0,
      w: 260,
      h: Math.min(600, Math.max(160, 40 + lines * 20)),
      z: board.items.reduce((max, item) => Math.max(max, item.z ?? 0), 0) + 1,
      text,
      color: color ?? NOTE_FROM_TEXT_COLOR,
    };
    const result = await Moodboard.updateOne(
      { _id: boardId, workspaceId, version: board.version },
      { $push: { items: item }, $set: { updatedBy: userId }, $inc: { version: 1 } },
      { runValidators: true },
    );
    if (result.modifiedCount === 1) {
      return {
        item,
        version: board.version + 1,
        board: { id: String(board._id), title: board.title },
      };
    }
  }
  throw AppError.conflict('The board is busy being edited. Try again.', 'BOARD_CHANGED');
}

function unbindMissing(end, items) {
  if (!end.itemId || items.some((item) => item.id === end.itemId)) return end;
  return { ...end, itemId: null };
}

// The files stay in Drive → Moodboards; only the board goes.
export async function deleteMoodboard(workspaceId, boardId) {
  const result = await Moodboard.deleteOne({ _id: boardId, workspaceId });
  if (result.deletedCount === 0) throw AppError.notFound('Moodboard not found');
}

export async function unlinkProjectFromMoodboards(workspaceId, projectId) {
  await Moodboard.updateMany(
    { workspaceId, projectIds: projectId },
    { $pull: { projectIds: projectId } },
  );
}

export async function getUploadFolder(workspaceId, userId) {
  return ensureDriveFolder(workspaceId, MOODBOARD_FOLDER, userId);
}

// --- AI ------------------------------------------------------------------

const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    palette: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { hex: { type: 'STRING' }, name: { type: 'STRING' }, role: { type: 'STRING' } },
        required: ['hex', 'name'],
      },
    },
    keywords: { type: 'ARRAY', items: { type: 'STRING' } },
    typography: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, text: { type: 'STRING' } },
        required: ['title', 'text'],
      },
    },
    directions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, text: { type: 'STRING' } },
        required: ['title', 'text'],
      },
    },
    references: { type: 'ARRAY', items: { type: 'STRING' } },
    brief: { type: 'STRING' },
  },
  required: ['title', 'summary', 'palette', 'keywords', 'typography', 'directions', 'brief'],
};

const SYSTEM = `You are a creative director at a video and design studio. You read moodboards (reference images, video frames and descriptions, sticky notes, colour swatches, links and hand sketches) and turn them into clear creative direction a team can work from.
Describe what is really on the board; never invent brands, names or facts. When the board is thin or contradictory, say so.
Write in clear, practical English for designers, editors and clients.`;

async function readBytes(file) {
  const chunks = [];
  for await (const chunk of getStorageDriver().readStream(file.storageKey)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function describeItem(item) {
  switch (item.type) {
    case 'note':
      return `Sticky note: "${truncate(item.text, 1500)}"`;
    case 'text':
      return `Heading on the board: "${truncate(item.text, 300)}"`;
    case 'color':
      return `Colour swatch: ${item.color}${item.text ? ` (${item.text})` : ''}`;
    case 'link':
      return `Link: ${item.title ? `${item.title} — ` : ''}${item.url}`;
    default:
      return null;
  }
}

// Everything on the board as Gemini parts: text lines, then images.
async function boardParts(board, workspaceId, settings, { sketchPng, askedBy }) {
  const project =
    (board.projectIds ?? [])
      .filter(Boolean)
      .map((linked) => linked.title)
      .filter(Boolean)
      .join(', ') || null;
  const lines = [`Moodboard: ${board.title}`];
  if (board.description) lines.push(`Description: ${truncate(board.description, 1500)}`);
  if (project) lines.push(`For project(s): ${project}`);

  const fileItems = board.items.filter((item) => item.fileId);
  const fileIds = fileItems.map((item) => item.fileId);
  const [files, insights] = await Promise.all([
    StoredFile.find({ _id: { $in: fileIds }, workspaceId, deletedAt: null }).lean(),
    AiInsight.find({ workspaceId, fileId: { $in: fileIds } }).lean(),
  ]);
  const fileById = new Map(files.map((file) => [String(file._id), file]));
  const insightById = new Map(insights.map((insight) => [String(insight.fileId), insight]));

  // Videos not looked at yet start now, for the next analysis.
  const unread = files.filter(
    (file) => file.category === 'video' && !insightById.get(String(file._id))?.summary,
  );
  if (unread.length) {
    analyseOnDemand(unread, settings, { askedBy, waitMs: 0 }).catch(() => {});
  }

  const imageParts = [];
  let inlineBytes = 0;
  let imageNumber = 0;
  for (const item of fileItems) {
    const file = fileById.get(String(item.fileId));
    if (!file) continue;
    const insight = insightById.get(String(file._id));
    const mime = correctedMime(file.mime, file.extension);
    if (
      file.category === 'image' &&
      GEMINI_IMAGE_MIME.has(mime) &&
      imageParts.length < INLINE_IMAGES &&
      file.size <= INLINE_IMAGE_BYTES &&
      inlineBytes + file.size <= INLINE_TOTAL_BYTES
    ) {
      imageNumber += 1;
      inlineBytes += file.size;
      imageParts.push({ text: `Image ${imageNumber}: ${file.displayName}` });
      imageParts.push({
        inlineData: { mimeType: mime, data: (await readBytes(file)).toString('base64') },
      });
      continue;
    }
    lines.push(
      `${file.category === 'video' ? 'Video' : 'Image'}: ${file.displayName}` +
        (insight?.summary
          ? ` — ${insight.summary}${insight.details ? ` ${truncate(insight.details, 1200)}` : ''}`
          : ' (not described yet)'),
    );
  }
  for (const item of board.items) {
    const line = describeItem(item);
    if (line) lines.push(line);
  }
  // Arrows say how things relate ("this note → that image").
  const label = (id) => {
    const item = board.items.find((candidate) => candidate.id === id);
    if (!item) return null;
    if (item.fileId) return fileById.get(String(item.fileId))?.displayName ?? item.type;
    return item.text ? `"${truncate(item.text, 60)}"` : item.color || item.title || item.type;
  };
  for (const connector of board.connectors ?? []) {
    const from = label(connector.from.itemId);
    const to = label(connector.to.itemId);
    if (!from && !to && !connector.label) continue;
    lines.push(
      `Arrow from ${from ?? 'a point'} to ${to ?? 'a point'}${connector.label ? `, labelled "${truncate(connector.label, 200)}"` : ''}.`,
    );
  }
  if (board.strokes.length) {
    lines.push(
      `The board has ${board.strokes.length} hand-drawn sketch strokes${sketchPng ? ' (the sketch layer is attached as an image)' : ''}.`,
    );
  }
  const parts = [{ text: lines.join('\n') }, ...imageParts];
  if (sketchPng) {
    parts.push({ text: 'Sketch layer (hand drawings on the board):' });
    parts.push({ inlineData: { mimeType: 'image/png', data: sketchPng } });
  }
  return parts;
}

function sketchData(sketchPng) {
  if (!sketchPng) return null;
  const data = String(sketchPng).replace(/^data:image\/png;base64,/, '');
  if (Buffer.byteLength(data, 'base64') > SKETCH_PNG_BYTES) return null;
  return data;
}

async function chargeable(pool, settings) {
  const minimum = Math.max(1, settings.minChatCredits);
  if (pool.ai?.blocked || creditBalance(pool, settings).total < minimum) {
    throw AppError.tooManyRequests(
      'You have used your AI limit for now. It refreshes soon, or you can get more on the upgrade page.',
      'AI_LIMIT',
    );
  }
}

async function liveSettings() {
  const settings = await getAiSettings();
  if (!isAiLive(settings)) {
    throw AppError.unavailable('The AI assistant is off right now', 'AI_OFF');
  }
  return settings;
}

function cleanList(list, max, length = 120) {
  return (Array.isArray(list) ? list : [])
    .map((value) => truncate(String(value ?? '').trim(), length))
    .filter(Boolean)
    .slice(0, max);
}

function cleanPoints(list, max) {
  return (Array.isArray(list) ? list : [])
    .slice(0, max)
    .map((point) => ({
      title: truncate(String(point?.title ?? ''), 200),
      text: truncate(String(point?.text ?? ''), 1500),
    }))
    .filter((point) => point.title || point.text);
}

function parseAnalysis(raw) {
  const data = JSON.parse(raw);
  return {
    title: truncate(String(data.title ?? ''), 200),
    summary: truncate(String(data.summary ?? ''), 4000),
    palette: (Array.isArray(data.palette) ? data.palette : [])
      .filter((swatch) => /^#?[0-9a-f]{6}$/i.test(String(swatch?.hex ?? '').trim()))
      .slice(0, 10)
      .map((swatch) => {
        const hex = String(swatch.hex).trim();
        return {
          hex: (hex.startsWith('#') ? hex : `#${hex}`).toLowerCase(),
          name: truncate(String(swatch.name ?? ''), 60),
          role: truncate(String(swatch.role ?? ''), 120),
        };
      }),
    keywords: cleanList(data.keywords, 20, 40),
    typography: cleanPoints(data.typography, 6),
    directions: cleanPoints(data.directions, 6),
    references: cleanList(data.references, 10, 300),
    brief: truncate(String(data.brief ?? ''), 30_000),
  };
}

export async function analyseMoodboard(
  { workspace, pool, user, viewer },
  boardId,
  { sketchPng, focus },
) {
  const settings = await liveSettings();
  await chargeable(pool, settings);
  const board = await findBoard(workspace._id, boardId);
  if (board.items.length === 0 && board.strokes.length === 0) {
    throw AppError.badRequest('Add some images, notes or sketches first', 'BOARD_EMPTY');
  }
  const parts = await boardParts(board, workspace._id, settings, {
    sketchPng: sketchData(sketchPng),
    askedBy: user._id,
  });
  parts.push({
    text: `${focus ? `What the team wants from this: ${truncate(focus, 1000)}\n` : ''}Return JSON with:
- title: a short name for this creative direction.
- summary: 3-5 sentences on the mood, feel and story the board points to.
- palette: 4-8 colours drawn from the board (images and swatches) as hex, each with a name and its role (background, accent, text...).
- keywords: 6-15 short mood/style keywords.
- typography: 2-4 type suggestions (title: the kind of typeface or a well-known free font; text: why and where).
- directions: 2-4 concrete creative directions (title + what to shoot, design or edit).
- references: things the board recalls (eras, genres, techniques), only if clear.
- brief: a complete creative brief in Markdown with "##" sections: Overview, Mood & tone, Visual language (colour, light, composition, texture), Typography, Motion & editing (for video), Do & don't, Deliverables to consider, Open questions. Be specific to this board.`,
  });

  let result;
  try {
    result = await generateContent({
      model: settings.model,
      system: SYSTEM,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_SCHEMA,
        temperature: 0.4,
        maxOutputTokens: 12_288,
      },
    });
  } catch (error) {
    throw toAppError(error);
  }
  let analysis;
  try {
    analysis = parseAnalysis(result.text);
  } catch {
    throw AppError.unavailable('The AI answer could not be read. Please try again.');
  }
  const credits = creditsForTokens(result.totalTokens, settings, settings.minChatCredits);
  const { spent } = await spendCredits(pool._id, credits, {
    kind: 'moodboard',
    usedInWorkspaceId: workspace._id,
    userId: user._id,
    tokens: result.totalTokens,
    note: `Moodboard: ${board.title}`.slice(0, 200),
  });
  await Moodboard.updateOne(
    { _id: board._id, workspaceId: workspace._id },
    {
      $set: {
        analysis: { ...analysis, generatedAt: new Date(), model: result.model, credits: spent },
      },
    },
  );
  return getMoodboard(workspace._id, board._id, viewer);
}

export async function askMoodboard(
  { workspace, pool, user, viewer },
  boardId,
  { question, sketchPng },
) {
  const settings = await liveSettings();
  await chargeable(pool, settings);
  const board = await findBoard(workspace._id, boardId);
  const parts = await boardParts(board, workspace._id, settings, {
    sketchPng: sketchData(sketchPng),
    askedBy: user._id,
  });
  if (board.analysis?.brief) {
    parts.push({
      text: `The brief written earlier for this board:\n${truncate(board.analysis.brief, 12_000)}`,
    });
  }
  const history = (board.chat ?? []).slice(-10);
  const contents = [
    { role: 'user', parts },
    {
      role: 'model',
      parts: [{ text: 'I have looked at the whole board. What would you like to know?' }],
    },
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.text }],
    })),
    { role: 'user', parts: [{ text: question }] },
  ];

  let result;
  try {
    result = await generateContent({
      model: settings.model,
      system: `${SYSTEM}\nAnswer the team's questions about this board. Use Markdown: short paragraphs, bullet lists, **bold** for key points. Give hex codes for colours. Reply in the language the question is in.`,
      contents,
      config: { temperature: 0.5, maxOutputTokens: 4096 },
      thinkingLevel: 'minimal',
    });
  } catch (error) {
    throw toAppError(error);
  }
  const credits = creditsForTokens(result.totalTokens, settings, settings.minChatCredits);
  await spendCredits(pool._id, credits, {
    kind: 'moodboard',
    usedInWorkspaceId: workspace._id,
    userId: user._id,
    tokens: result.totalTokens,
    note: `Moodboard question: ${board.title}`.slice(0, 200),
  }).catch((err) => logger.error({ err }, 'Could not charge a moodboard question'));
  const now = new Date();
  await Moodboard.updateOne(
    { _id: board._id, workspaceId: workspace._id },
    {
      $push: {
        chat: {
          $each: [
            { role: 'user', text: truncate(question, 4000), userId: user._id, at: now },
            { role: 'assistant', text: truncate(result.text, 12_000), at: now },
          ],
          $slice: -MAX_CHAT,
        },
      },
    },
  );
  return getMoodboard(workspace._id, board._id, viewer);
}

// The brief as a shared note, linked to the board's projects.
export async function saveBriefAsNote(workspaceId, userId, boardId) {
  const board = await findBoard(workspaceId, boardId);
  const analysis = board.analysis;
  if (!analysis?.brief) throw AppError.badRequest('Analyse the board first', 'NO_BRIEF');
  const palette = analysis.palette.length
    ? `## Palette\n${analysis.palette.map((s) => `- ${s.name} ${s.hex}${s.role ? ` — ${s.role}` : ''}`).join('\n')}\n\n`
    : '';
  let body = `${analysis.summary}\n\n${palette}${analysis.brief}`;
  if (body.length > 10_000) body = `${body.slice(0, 9_999)}…`;
  return createNote(workspaceId, userId, {
    title: `${board.title}: ${analysis.title || 'Creative brief'}`.slice(0, 160),
    body,
    projectIds: ids(
      board.projectIds.filter(Boolean).map((project) => project._id ?? project),
    ).slice(0, 10),
    visibility: 'workspace',
  });
}
