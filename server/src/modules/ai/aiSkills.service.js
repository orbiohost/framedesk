import { Types } from 'mongoose';
import { ADMIN_ROLES, EDIT_ROLES } from '../members/roles.js';
import { AppError } from '../../utils/AppError.js';
import { AiSkill } from './aiSkill.model.js';

export const MAX_SKILLS_PER_QUESTION = 3;
const BUILTIN_PREFIX = 'builtin:';

// Starter skills every workspace has. Their key is stable, so assistants can
// keep them switched on.
export const BUILTIN_SKILLS = [
  {
    key: 'builtin:youtube',
    category: 'video',
    name: 'YouTube description',
    emoji: '▶️',
    description: 'Title ideas, description, chapters and tags for a video.',
    instructions:
      'Write YouTube upload copy for the video in question: 5 title ideas (under 70 characters), a description (hook in the first two lines, then a short summary and a call to action), chapters as "0:00 Title" from the transcript when there is one, and 15 comma-separated tags.',
  },
  {
    key: 'builtin:social',
    category: 'social',
    name: 'Social captions',
    emoji: '📣',
    description: 'Instagram, LinkedIn and X captions with hashtags.',
    instructions:
      'Write ready-to-post captions: one for Instagram (with line breaks, emojis used lightly, 8–12 hashtags), one for LinkedIn (professional, 80–150 words) and one for X (under 270 characters). Label each.',
  },
  {
    key: 'builtin:shotlist',
    category: 'video',
    name: 'Shot list',
    emoji: '🎬',
    description: 'Turn a script, brief or idea into a numbered shot list.',
    instructions:
      'Produce a shot list as a table: #, scene, shot type (WS/MS/CU/ECU/insert), camera movement, description, audio/dialogue, est. duration. Group by scene and end with the total runtime and any props or locations needed.',
  },
  {
    key: 'builtin:client-email',
    category: 'client',
    name: 'Client email',
    emoji: '✉️',
    description: 'A clear, polite email to a client from the context.',
    instructions:
      'Write a client email: a subject line, a warm one-line opening, the key points as short paragraphs or bullets, a clear next step or ask with a date if one is known, and a friendly sign-off. Keep it under 200 words unless asked otherwise.',
  },
  {
    key: 'builtin:meeting',
    category: 'planning',
    name: 'Meeting summary',
    emoji: '📝',
    description: 'Decisions, action items with owners, open questions.',
    instructions:
      'Summarise as: **Summary** (3 sentences), **Decisions**, **Action items** (owner, due date if mentioned), **Open questions**. Cite the files or timestamps each point comes from.',
  },
  {
    key: 'builtin:feedback',
    category: 'video',
    name: 'Edit feedback',
    emoji: '🎯',
    description: 'Structured review notes for a cut, design or script.',
    instructions:
      'Give review feedback as a numbered list. For each point: the timestamp or location, what the issue is, why it matters and a concrete fix. Order by importance, start with what works well in one line, and end with the top 3 priorities.',
  },
  {
    key: 'builtin:proposal',
    category: 'client',
    name: 'Proposal / quote',
    emoji: '💼',
    description: 'A project proposal with scope, timeline and pricing table.',
    instructions:
      'Draft a project proposal: overview, objectives, scope of work (deliverables as bullets), timeline (table of phases and dates), pricing (table: item, qty, rate, amount, with a total; leave rates as [rate] if unknown), assumptions and next steps.',
  },
  {
    key: 'builtin:simple',
    category: 'writing',
    name: 'Explain simply',
    emoji: '💡',
    description: 'Short, plain-language answer with an example.',
    instructions:
      'Explain in plain, friendly language a beginner would follow: at most 6 short sentences or bullets, no jargon (or define it), and one concrete example.',
  },
];

BUILTIN_SKILLS.push(
  {
    key: 'builtin:reel',
    category: 'video',
    name: 'Reel script',
    emoji: '🎞️',
    description: 'A 30–60 second vertical video script with hook and CTA.',
    instructions:
      'Write a short-form vertical video script (Reels/Shorts/TikTok, 30–60 s) as a table: time, visual, voiceover, on-screen text. Open with a 2-second scroll-stopping hook, keep beats under 5 seconds, and end with a clear call to action. Then give 3 alternative hooks.',
  },
  {
    key: 'builtin:hooks',
    category: 'social',
    name: 'Hook ideas',
    emoji: '🪝',
    description: '10 scroll-stopping opening lines for a post or video.',
    instructions:
      'Write 10 different opening hooks for the content in question, each under 12 words, mixing styles: question, bold claim, number, story, contrarian, curiosity gap. Mark the strongest 3 with ⭐ and say why in one line each.',
  },
  {
    key: 'builtin:calendar',
    category: 'planning',
    name: 'Content calendar',
    emoji: '🗓️',
    description: 'A posting plan with dates, formats and ideas.',
    instructions:
      'Build a content calendar as a table: date, platform, format (reel, carousel, story, long video), idea, caption angle, status. Default to the next 2 weeks starting today, 3–5 posts a week, with a mix of formats. Re-use footage from the files where possible and cite it.',
  },
  {
    key: 'builtin:translate',
    category: 'writing',
    name: 'Translate & localise',
    emoji: '🌐',
    description: 'Natural translation that keeps tone, slang and formatting.',
    instructions:
      'Translate the text into the language the user asks for (Hindi, Hinglish or English if not said). Keep the tone, emojis, hashtags and formatting; localise idioms instead of translating them word for word. Give the translation only, then one line of notes if anything was hard to translate.',
  },
);

const BUILTIN_BY_KEY = new Map(BUILTIN_SKILLS.map((skill) => [skill.key, skill]));

function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}

export function visibleSkills(userId) {
  return { $or: [{ createdBy: userId }, { visibility: 'workspace' }] };
}

function toSkillDto(skill, { userId, role }) {
  if (skill.key) {
    return { ...skill, id: skill.key, example: '', builtin: true, canEdit: false, usageCount: 0 };
  }
  const mine = String(skill.createdBy?._id ?? skill.createdBy) === String(userId);
  return {
    id: String(skill._id),
    builtin: false,
    name: skill.name,
    description: skill.description,
    emoji: skill.emoji,
    category: skill.category ?? 'other',
    instructions: skill.instructions,
    example: skill.example ?? '',
    visibility: skill.visibility,
    usageCount: skill.usageCount ?? 0,
    lastUsedAt: skill.lastUsedAt ?? null,
    createdBy: skill.createdBy?.name
      ? { id: String(skill.createdBy._id), name: skill.createdBy.name }
      : null,
    canEdit: mine || (skill.visibility === 'workspace' && isAdmin(role)),
    updatedAt: skill.updatedAt,
  };
}

export async function listSkills({ workspace, user, role }) {
  const custom = await AiSkill.find({ workspaceId: workspace._id, ...visibleSkills(user._id) })
    .sort({ usageCount: -1, updatedAt: -1 })
    .populate('createdBy', 'name')
    .lean();
  return [
    ...custom.map((skill) => toSkillDto(skill, { userId: user._id, role })),
    ...BUILTIN_SKILLS.map((skill) => toSkillDto(skill, {})),
  ];
}

function assertCanShare(visibility, role) {
  if (visibility === 'workspace' && !EDIT_ROLES.includes(role)) {
    throw AppError.forbidden('Only editors and above can share skills with the workspace');
  }
}

async function findEditableSkill({ workspace, user, role }, skillId) {
  const skill = await AiSkill.findOne({ _id: skillId, workspaceId: workspace._id }).lean();
  const dto = skill && toSkillDto(skill, { userId: user._id, role });
  if (!skill || (skill.visibility !== 'workspace' && !dto.canEdit)) {
    throw AppError.notFound('Skill not found', 'SKILL_NOT_FOUND');
  }
  if (!dto.canEdit) throw AppError.forbidden('Only its creator or an admin can change this skill');
  return skill;
}

export async function createSkill(ctx, input) {
  assertCanShare(input.visibility, ctx.role);
  const skill = await AiSkill.create({
    ...input,
    workspaceId: ctx.workspace._id,
    createdBy: ctx.user._id,
  });
  return toSkillDto({ ...skill.toObject(), createdBy: ctx.user }, ctx);
}

export async function updateSkill(ctx, skillId, input) {
  await findEditableSkill(ctx, skillId);
  if (input.visibility) assertCanShare(input.visibility, ctx.role);
  const skill = await AiSkill.findOneAndUpdate(
    { _id: skillId, workspaceId: ctx.workspace._id },
    { $set: input },
    { new: true, runValidators: true },
  )
    .populate('createdBy', 'name')
    .lean();
  return toSkillDto(skill, ctx);
}

export async function deleteSkill(ctx, skillId) {
  await findEditableSkill(ctx, skillId);
  await AiSkill.deleteOne({ _id: skillId, workspaceId: ctx.workspace._id });
}

/**
 * Skills by id or built-in key, keeping only those the person may use.
 * Unknown ids are skipped (an assistant may point at a deleted skill).
 */
export async function resolveSkills(workspaceId, userId, ids) {
  const unique = [...new Set((ids ?? []).map(String))];
  const customIds = unique.filter(
    (id) => !id.startsWith(BUILTIN_PREFIX) && Types.ObjectId.isValid(id),
  );
  const custom = customIds.length
    ? await AiSkill.find({ workspaceId, _id: { $in: customIds }, ...visibleSkills(userId) })
        .select('name emoji instructions example')
        .lean()
    : [];
  const byId = new Map(custom.map((skill) => [String(skill._id), skill]));
  return unique
    .map((id) => {
      const builtin = BUILTIN_BY_KEY.get(id);
      if (builtin)
        return { id, name: builtin.name, instructions: builtin.instructions, example: '' };
      const skill = byId.get(id);
      return skill
        ? { id, name: skill.name, instructions: skill.instructions, example: skill.example ?? '' }
        : null;
    })
    .filter(Boolean);
}

export function isSkillId(id) {
  return BUILTIN_BY_KEY.has(id) || Types.ObjectId.isValid(id);
}

// Counts skills picked for a question (built-ins aren't stored, so aren't counted).
export async function recordSkillUse(workspaceId, ids) {
  const custom = ids.filter((id) => !id.startsWith(BUILTIN_PREFIX));
  if (!custom.length) return;
  await AiSkill.updateMany(
    { workspaceId, _id: { $in: custom } },
    { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } },
    { timestamps: false },
  );
}
