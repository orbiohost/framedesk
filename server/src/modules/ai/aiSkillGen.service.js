import { AppError } from '../../utils/AppError.js';
import { assertLive, noCreditsError } from './aiChat.service.js';
import { SKILL_CATEGORIES, SKILL_EXAMPLE_MAX, SKILL_INSTRUCTIONS_MAX } from './aiSkill.model.js';
import { getAiSettings } from './aiSettings.service.js';
import { truncate } from './aiText.js';
import { creditBalance, creditsForTokens, spendCredits } from './credits.service.js';
import { generateContent, toAppError } from './gemini.client.js';

// "Generate with AI" and "Test it" for skills in the AI studio.

const DRAFT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    emoji: { type: 'STRING' },
    category: { type: 'STRING', enum: SKILL_CATEGORIES },
    description: { type: 'STRING' },
    instructions: { type: 'STRING' },
    example: { type: 'STRING' },
  },
  required: ['name', 'emoji', 'category', 'description', 'instructions', 'example'],
};

const WRITER_PROMPT = `You design "skills" for an AI assistant used by video, design and content teams (FrameDesk). A skill is a reusable instruction the assistant follows when the user picks it, e.g. "YouTube description" or "Shot list".

Write skills that produce consistently excellent answers:
- instructions: 60-200 words, imperative ("Write…", "List…"). Say exactly what to produce, the structure/format (headings, tables, bullet counts, lengths), the tone, and what to do when information is missing (use [placeholders], never invent facts about the team's files). Mention timestamps and citing files when the skill works on videos or documents.
- name: 2-4 words, Title Case. emoji: one fitting emoji. description: one line under 90 characters for a picker.
- category: the closest of ${SKILL_CATEGORIES.join(', ')}.
- example: a short but complete sample answer in Markdown (under 250 words) that shows the exact shape the instructions ask for, using realistic made-up content.
Reply in English unless the request is written in another language.`;

async function chargeable(pool) {
  const settings = await getAiSettings();
  assertLive(settings, pool);
  const balance = creditBalance(pool, settings);
  if (balance.total < Math.max(1, settings.minChatCredits)) throw noCreditsError(balance);
  return settings;
}

async function charge({ workspace, pool, user }, settings, result, note) {
  const cost = creditsForTokens(result.totalTokens, settings, settings.minChatCredits);
  const { spent, balance } = await spendCredits(pool._id, cost, {
    kind: 'skill',
    userId: user._id,
    usedInWorkspaceId: workspace._id,
    tokens: result.totalTokens,
    note: truncate(note, 200),
  });
  return { spent, balance };
}

function cleanDraft(raw) {
  const category = SKILL_CATEGORIES.includes(raw.category) ? raw.category : 'other';
  return {
    name: truncate(String(raw.name ?? '').trim(), 60) || 'New skill',
    emoji: [...String(raw.emoji ?? '').trim()].slice(0, 2).join(''),
    category,
    description: truncate(String(raw.description ?? '').trim(), 200),
    instructions: truncate(String(raw.instructions ?? '').trim(), SKILL_INSTRUCTIONS_MAX),
    example: truncate(String(raw.example ?? '').trim(), SKILL_EXAMPLE_MAX),
  };
}

/**
 * Writes a skill from a description, or improves an existing draft.
 * base: the current fields (when improving). Returns { draft, credits }.
 */
export async function generateSkill(ctx, { request, base }) {
  const settings = await chargeable(ctx.pool);
  const prompt = base
    ? `Improve this skill. What to change: ${request || 'make it clearer, more specific and more reliable'}.
Keep what already works and keep its purpose. Return the full improved skill.

CURRENT SKILL
name: ${base.name || '(none)'}
description: ${base.description || '(none)'}
category: ${base.category || 'other'}
instructions:
${truncate(base.instructions || '(none)', SKILL_INSTRUCTIONS_MAX)}
example:
${truncate(base.example || '(none)', SKILL_EXAMPLE_MAX)}`
    : `Create a skill for this request: ${request}`;

  let result;
  try {
    result = await generateContent({
      model: settings.model,
      system: WRITER_PROMPT,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.5,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: DRAFT_SCHEMA,
      },
      thinkingLevel: 'low',
      timeoutMs: 90_000,
    });
  } catch (error) {
    throw toAppError(error);
  }
  let draft;
  try {
    draft = cleanDraft(JSON.parse(result.text));
  } catch {
    throw AppError.unavailable('The AI answer could not be read. Please try again.');
  }
  if (draft.instructions.length < 10) {
    throw AppError.unavailable('The AI could not write this skill. Try describing it differently.');
  }
  const { balance } = await charge(ctx, settings, result, `Skill: ${draft.name}`);
  return { draft, credits: balance };
}

/**
 * Runs unsaved skill instructions on sample input, so the editor can show
 * what the skill produces. Nothing is stored. Returns { output, credits }.
 */
export async function testSkill(ctx, { name, instructions, example, input }) {
  const settings = await chargeable(ctx.pool);
  const system = `You are the FrameDesk AI assistant in the workspace "${ctx.workspace.name}". The user is testing a skill. Follow the skill exactly for the request below. You have no access to files in this test, so where the request needs file contents, make reasonable placeholder content and say so in one short line at the end.
Reply in the language the user writes in. Today is ${new Date().toISOString().slice(0, 10)}.

### ${name || 'Skill'}
${instructions}${example ? `\nExample of a great answer (match its structure and tone, not its facts):\n<<<\n${example}\n>>>` : ''}`;

  let result;
  try {
    result = await generateContent({
      model: settings.model,
      system,
      contents: [{ role: 'user', parts: [{ text: input }] }],
      config: { temperature: 0.4, maxOutputTokens: 4096 },
      thinkingLevel: 'minimal',
      timeoutMs: 90_000,
    });
  } catch (error) {
    throw toAppError(error);
  }
  const { balance } = await charge(ctx, settings, result, `Skill test: ${name || 'draft'}`);
  return { output: result.text.trim(), credits: balance };
}
