import { Router } from 'express';
import { z } from 'zod';
import { canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { DashboardLayout, MAX_WIDGETS, WIDGET_SPANS } from './dashboardLayout.model.js';

// The widget catalogue lives in the client, so the server only checks the shape:
// short slug ids, allowed spans, no duplicates.
const saveLayoutSchema = z.object({
  widgets: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'Invalid widget id'),
        span: z.number().refine((span) => WIDGET_SPANS.includes(span), 'Invalid widget width'),
      }),
    )
    .max(MAX_WIDGETS)
    .refine((widgets) => new Set(widgets.map((w) => w.id)).size === widgets.length, {
      message: 'Each widget can appear only once',
    }),
});

function toLayoutDto(layout) {
  return layout
    ? { widgets: layout.widgets.map(({ id, span }) => ({ id, span })), updatedAt: layout.updatedAt }
    : null;
}

const router = Router();

// null means "never customised": the client shows its default layout.
router.get(
  '/layout',
  canView,
  asyncHandler(async (req, res) => {
    const layout = await DashboardLayout.findOne({
      workspaceId: req.workspace._id,
      userId: req.user._id,
    }).lean();
    sendSuccess(res, { layout: toLayoutDto(layout) });
  }),
);

router.patch(
  '/layout',
  canView,
  validate({ body: saveLayoutSchema }),
  asyncHandler(async (req, res) => {
    const layout = await DashboardLayout.findOneAndUpdate(
      { workspaceId: req.workspace._id, userId: req.user._id },
      { $set: { widgets: req.body.widgets } },
      { new: true, upsert: true, runValidators: true },
    ).lean();
    sendSuccess(res, { layout: toLayoutDto(layout) });
  }),
);

// Back to the default layout.
router.delete(
  '/layout',
  canView,
  asyncHandler(async (req, res) => {
    await DashboardLayout.deleteOne({ workspaceId: req.workspace._id, userId: req.user._id });
    sendSuccess(res, { layout: null });
  }),
);

export default router;
