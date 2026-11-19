import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { findUsableAgent } from './aiAgents.service.js';
import { AiMemory, AiPreference, MAX_MEMORIES, MEMORY_TEXT_MAX } from './aiMemory.model.js';
import { truncate } from './aiText.js';
import { spendCredits } from './credits.service.js';
import { generateContent } from './gemini.client.js';

// The assistant's memory: short facts about a person that every later chat
// (or one assistant's chats) starts from, like ChatGPT's and Claude's memory.

const MEMORIES_IN_PROMPT = 60;
// Only questions that sound like the person is telling us about themselves
// (or asking us to remember/forget) are worth a learning call.
const PERSONAL_CUES =
  /\b(i|i'm|im|i've|i'd|my|mine|me|we|we're|our|us|remember|forget|always|never|prefer|call me|from now on|going forward|mera|meri|mere|mujhe|main|hum|hamara|hamari|yaad)\b/i;

function toMemoryDto(memory) {
  return {
    id: String(memory._id),
    text: memory.text,
    source: memory.source,
    agentId: memory.agentId ? String(memory.agentId) : null,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

export async function getPreferences(workspaceId, userId) {
  const prefs = await AiPreference.findOne({ workspaceId, userId }).lean();
  return {
    memoryEnabled: prefs?.memoryEnabled ?? true,
    autoMemory: prefs?.autoMemory ?? true,
  };
}

export async function updatePreferences({ workspace, user }, changes) {
  await AiPreference.updateOne(
    { workspaceId: workspace._id, userId: user._id },
    { $set: changes, $setOnInsert: { workspaceId: workspace._id, userId: user._id } },
    { upsert: true, runValidators: true },
  );
  return getPreferences(workspace._id, user._id);
}

export async function listMemories({ workspace, user }) {
  const memories = await AiMemory.find({ workspaceId: workspace._id, userId: user._id })
    .sort({ updatedAt: -1 })
    .limit(MAX_MEMORIES)
    .lean();
  return memories.map(toMemoryDto);
}

async function assertRoom(workspaceId, userId) {
  const count = await AiMemory.countDocuments({ workspaceId, userId });
  if (count >= MAX_MEMORIES) {
    throw AppError.badRequest(
      `Memory is full (${MAX_MEMORIES}). Delete some memories first.`,
      'MEMORY_FULL',
    );
  }
}

export async function addMemory({ workspace, user }, { text, agentId = null }) {
  await assertRoom(workspace._id, user._id);
  if (agentId && !(await findUsableAgent(workspace._id, user._id, agentId))) {
    throw AppError.notFound('Assistant not found', 'AGENT_NOT_FOUND');
  }
  const memory = await AiMemory.create({
    workspaceId: workspace._id,
    userId: user._id,
    agentId,
    text,
    source: 'manual',
  });
  return toMemoryDto(memory.toObject());
}

export async function updateMemory({ workspace, user }, memoryId, { text }) {
  const memory = await AiMemory.findOneAndUpdate(
    { _id: memoryId, workspaceId: workspace._id, userId: user._id },
    { $set: { text } },
    { new: true, runValidators: true },
  ).lean();
  if (!memory) throw AppError.notFound('Memory not found', 'MEMORY_NOT_FOUND');
  return toMemoryDto(memory);
}

export async function deleteMemory({ workspace, user }, memoryId) {
  await AiMemory.deleteOne({ _id: memoryId, workspaceId: workspace._id, userId: user._id });
}

export async function clearMemories({ workspace, user }, { agentId } = {}) {
  await AiMemory.deleteMany({
    workspaceId: workspace._id,
    userId: user._id,
    ...(agentId !== undefined && { agentId }),
  });
}

/**
 * The memories a chat starts from: the person's general ones plus those of
 * the assistant they are talking to. [] when memory is off.
 */
export async function memoriesForChat(workspaceId, userId, { agent, prefs }) {
  if (!prefs.memoryEnabled || agent?.useMemory === false) return [];
  return AiMemory.find({
    workspaceId,
    userId,
    agentId: { $in: [null, ...(agent ? [agent._id] : [])] },
  })
    .sort({ updatedAt: -1 })
    .limit(MEMORIES_IN_PROMPT)
    .select('text agentId')
    .lean();
}

// ids: the learning call needs them to remove memories; the chat prompt doesn't.
export function memoryBlock(memories, { ids = true } = {}) {
  if (memories.length === 0) return '';
  return memories
    .map((memory) => (ids ? `- [${memory._id}] ${memory.text}` : `- ${memory.text}`))
    .join('\n');
}

function shouldLearn(text) {
  return PERSONAL_CUES.test(text) && text.trim().split(/\s+/).length >= 3;
}

const LEARN_PROMPT = `You maintain the long-term memory of an AI assistant for one person.
Read the person's latest message (and the assistant's reply for context) and decide what to remember for future chats.

Save only durable, useful facts the PERSON stated about themselves, their work or their preferences: their role, company, clients, brand style, tools, how they like answers (length, language, tone), recurring deadlines or rules. If they say "remember …", save it. If they say "forget …" or a fact changed, remove the old memory.
Never save: one-off questions, things only found in their files, the assistant's own answers, passwords, payment or ID numbers, health or other sensitive personal data.

Write each memory as one short third-person sentence under 25 words, e.g. "Prefers answers in Hinglish." Don't repeat an existing memory.
Reply with JSON only: {"add": ["..."], "remove": ["<memory id>"]}. Usually both lists are empty.`;

/**
 * After an answer: asks Gemini whether the message taught us anything worth
 * remembering, then saves it. Runs in the background; never throws.
 */
export async function learnFromChat({
  workspace,
  pool,
  user,
  settings,
  agent,
  prefs,
  threadId,
  question,
  answer,
}) {
  try {
    if (!prefs.memoryEnabled || !prefs.autoMemory || agent?.useMemory === false) return;
    if (!shouldLearn(question)) return;
    const existing = await AiMemory.find({ workspaceId: workspace._id, userId: user._id })
      .sort({ updatedAt: -1 })
      .limit(MAX_MEMORIES)
      .select('text')
      .lean();
    const result = await generateContent({
      model: settings.model,
      system: LEARN_PROMPT,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `EXISTING MEMORIES\n${memoryBlock(existing) || '(none)'}\n\nPERSON'S MESSAGE\n${truncate(question, 3000)}\n\nASSISTANT'S REPLY (context only)\n${truncate(answer, 1500)}`,
            },
          ],
        },
      ],
      config: { temperature: 0, maxOutputTokens: 600, responseMimeType: 'application/json' },
      thinkingLevel: 'minimal',
      timeoutMs: 30_000,
    });

    let parsed;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      return;
    }
    const known = new Set(existing.map((memory) => String(memory._id)));
    const remove = (Array.isArray(parsed.remove) ? parsed.remove : [])
      .map(String)
      .filter((id) => known.has(id) && Types.ObjectId.isValid(id));
    const lowerExisting = new Set(existing.map((memory) => memory.text.toLowerCase()));
    const room = MAX_MEMORIES - existing.length + remove.length;
    const add = (Array.isArray(parsed.add) ? parsed.add : [])
      .filter((text) => typeof text === 'string' && text.trim())
      .map((text) => truncate(text.trim(), MEMORY_TEXT_MAX))
      .filter((text) => !lowerExisting.has(text.toLowerCase()))
      .slice(0, Math.max(0, Math.min(5, room)));

    if (remove.length) {
      await AiMemory.deleteMany({
        workspaceId: workspace._id,
        userId: user._id,
        _id: { $in: remove },
      });
    }
    if (add.length) {
      await AiMemory.insertMany(
        add.map((text) => ({
          workspaceId: workspace._id,
          userId: user._id,
          // Facts about the person help every assistant, so they are general.
          agentId: null,
          text,
          source: 'auto',
          threadId,
        })),
      );
    }
    // A small learning call usually rounds to nothing; long ones cost a credit or so.
    const cost = Math.round((result.totalTokens || 0) / settings.tokensPerCredit);
    if (cost > 0) {
      await spendCredits(pool._id, cost, {
        kind: 'memory',
        userId: user._id,
        usedInWorkspaceId: workspace._id,
        tokens: result.totalTokens,
      });
    }
  } catch (err) {
    logger.warn({ err }, 'AI memory learning failed');
  }
}
