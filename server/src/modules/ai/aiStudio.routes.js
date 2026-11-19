import { Router } from 'express';
import { z } from 'zod';
import { aiChatLimiter } from '../../middleware/rateLimit.js';
import { canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { objectId } from '../../utils/zodHelpers.js';
import {
  AGENT_COLORS,
  AGENT_INSTRUCTIONS_MAX,
  AGENT_KNOWLEDGE_MAX,
  AGENT_VISIBILITIES,
  MAX_AGENT_FILES,
  MAX_AGENT_NOTES,
  MAX_AGENT_SKILLS,
  MAX_AGENT_STARTERS,
} from './aiAgent.model.js';
import { createAgent, deleteAgent, listAgents, updateAgent } from './aiAgents.service.js';
import { MEMORY_TEXT_MAX } from './aiMemory.model.js';
import {
  addMemory,
  clearMemories,
  deleteMemory,
  getPreferences,
  listMemories,
  updateMemory,
  updatePreferences,
} from './aiMemory.service.js';
import {
  SKILL_CATEGORIES,
  SKILL_EXAMPLE_MAX,
  SKILL_INSTRUCTIONS_MAX,
  SKILL_VISIBILITIES,
} from './aiSkill.model.js';
import { generateSkill, testSkill } from './aiSkillGen.service.js';
import {
  createSkill,
  deleteSkill,
  isSkillId,
  listSkills,
  updateSkill,
} from './aiSkills.service.js';

// The "AI studio": custom assistants, skills and memory.
// Mounted inside the AI router at /workspaces/:workspaceId/ai.
const router = Router();

function ctx(req) {
  return {
    workspace: req.workspace,
    pool: req.storagePool,
    user: req.user,
    role: req.membership?.role,
  };
}

const unique = (ids) => [...new Set(ids)];
const skillId = z.string().trim().refine(isSkillId, 'Unknown skill');

const agentSchema = z.object({
  name: z.string().trim().min(1, 'Give your assistant a name').max(60),
  description: z.string().trim().max(200).optional(),
  emoji: z.string().trim().max(8).optional(),
  color: z.enum(AGENT_COLORS).optional(),
  instructions: z.string().trim().max(AGENT_INSTRUCTIONS_MAX).optional(),
  knowledge: z.string().trim().max(AGENT_KNOWLEDGE_MAX).optional(),
  fileIds: z
    .array(objectId)
    .max(MAX_AGENT_FILES, `Add up to ${MAX_AGENT_FILES} files`)
    .transform(unique)
    .optional(),
  noteIds: z
    .array(objectId)
    .max(MAX_AGENT_NOTES, `Add up to ${MAX_AGENT_NOTES} notes`)
    .transform(unique)
    .optional(),
  skills: z
    .array(skillId)
    .max(MAX_AGENT_SKILLS, `Pick up to ${MAX_AGENT_SKILLS} skills`)
    .transform(unique)
    .optional(),
  starters: z
    .array(z.string().trim().min(1).max(160))
    .max(MAX_AGENT_STARTERS, `Add up to ${MAX_AGENT_STARTERS} starters`)
    .optional(),
  creativity: z.number().min(0).max(1).optional(),
  useMemory: z.boolean().optional(),
  visibility: z.enum(AGENT_VISIBILITIES).optional(),
});

const skillSchema = z.object({
  name: z.string().trim().min(1, 'Give the skill a name').max(60),
  description: z.string().trim().max(200).optional(),
  emoji: z.string().trim().max(8).optional(),
  category: z.enum(SKILL_CATEGORIES).optional(),
  instructions: z
    .string()
    .trim()
    .min(10, 'Describe what the skill should do')
    .max(SKILL_INSTRUCTIONS_MAX),
  example: z.string().trim().max(SKILL_EXAMPLE_MAX).optional(),
  visibility: z.enum(SKILL_VISIBILITIES).optional(),
});

const generateSchema = z
  .object({
    // What the skill should do, or what to change about `base`.
    request: z.string().trim().max(1000).optional(),
    base: z
      .object({
        name: z.string().trim().max(60).optional(),
        description: z.string().trim().max(200).optional(),
        category: z.enum(SKILL_CATEGORIES).optional(),
        instructions: z.string().trim().max(SKILL_INSTRUCTIONS_MAX).optional(),
        example: z.string().trim().max(SKILL_EXAMPLE_MAX).optional(),
      })
      .optional(),
  })
  .refine((value) => value.base?.instructions || (value.request?.length ?? 0) >= 3, {
    message: 'Describe the skill you want',
    path: ['request'],
  });

const testSchema = z.object({
  name: z.string().trim().max(60).optional(),
  instructions: z
    .string()
    .trim()
    .min(10, 'Write the instructions first')
    .max(SKILL_INSTRUCTIONS_MAX),
  example: z.string().trim().max(SKILL_EXAMPLE_MAX).optional(),
  input: z.string().trim().min(1, 'Type something to try it on').max(4000),
});

const memorySchema = z.object({
  text: z.string().trim().min(2, 'Write something to remember').max(MEMORY_TEXT_MAX),
  agentId: objectId.nullable().optional(),
});
const memoryEditSchema = memorySchema.pick({ text: true });
const prefsSchema = z
  .object({ memoryEnabled: z.boolean().optional(), autoMemory: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');
const clearSchema = z.object({ agentId: objectId.nullable().optional() });

const agentParam = z.object({ agentId: objectId });
const skillParam = z.object({ skillId: objectId });
const memoryParam = z.object({ memoryId: objectId });

// --- Assistants ---

router.get(
  '/agents',
  canView,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { agents: await listAgents(ctx(req)) });
  }),
);

router.post(
  '/agents',
  canView,
  validate({ body: agentSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { agent: await createAgent(ctx(req), req.body) }, { status: 201 });
  }),
);

router.patch(
  '/agents/:agentId',
  canView,
  validate({ params: agentParam, body: agentSchema.partial() }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { agent: await updateAgent(ctx(req), req.params.agentId, req.body) });
  }),
);

router.delete(
  '/agents/:agentId',
  canView,
  validate({ params: agentParam }),
  asyncHandler(async (req, res) => {
    await deleteAgent(ctx(req), req.params.agentId);
    sendSuccess(res, { deleted: true });
  }),
);

// --- Skills ---

router.get(
  '/skills',
  canView,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { skills: await listSkills(ctx(req)) });
  }),
);

// "Generate with AI" / "Improve with AI": returns a draft, saves nothing.
router.post(
  '/skills/generate',
  aiChatLimiter,
  canView,
  validate({ body: generateSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await generateSkill(ctx(req), req.body));
  }),
);

// "Test it": runs unsaved instructions on a sample request.
router.post(
  '/skills/test',
  aiChatLimiter,
  canView,
  validate({ body: testSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await testSkill(ctx(req), req.body));
  }),
);

router.post(
  '/skills',
  canView,
  validate({ body: skillSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { skill: await createSkill(ctx(req), req.body) }, { status: 201 });
  }),
);

router.patch(
  '/skills/:skillId',
  canView,
  validate({ params: skillParam, body: skillSchema.partial() }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { skill: await updateSkill(ctx(req), req.params.skillId, req.body) });
  }),
);

router.delete(
  '/skills/:skillId',
  canView,
  validate({ params: skillParam }),
  asyncHandler(async (req, res) => {
    await deleteSkill(ctx(req), req.params.skillId);
    sendSuccess(res, { deleted: true });
  }),
);

// --- Memory (always private to the person) ---

router.get(
  '/memory',
  canView,
  asyncHandler(async (req, res) => {
    const [memories, preferences] = await Promise.all([
      listMemories(ctx(req)),
      getPreferences(req.workspace._id, req.user._id),
    ]);
    sendSuccess(res, { memories, preferences });
  }),
);

router.post(
  '/memory',
  canView,
  validate({ body: memorySchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { memory: await addMemory(ctx(req), req.body) }, { status: 201 });
  }),
);

router.patch(
  '/memory/preferences',
  canView,
  validate({ body: prefsSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { preferences: await updatePreferences(ctx(req), req.body) });
  }),
);

router.post(
  '/memory/clear',
  canView,
  validate({ body: clearSchema }),
  asyncHandler(async (req, res) => {
    await clearMemories(ctx(req), req.body);
    sendSuccess(res, { cleared: true });
  }),
);

router.patch(
  '/memory/:memoryId',
  canView,
  validate({ params: memoryParam, body: memoryEditSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { memory: await updateMemory(ctx(req), req.params.memoryId, req.body) });
  }),
);

router.delete(
  '/memory/:memoryId',
  canView,
  validate({ params: memoryParam }),
  asyncHandler(async (req, res) => {
    await deleteMemory(ctx(req), req.params.memoryId);
    sendSuccess(res, { deleted: true });
  }),
);

export default router;
