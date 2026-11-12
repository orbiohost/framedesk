import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as calendarService from './calendar.service.js';

export const feed = asyncHandler(async (req, res) => {
  const items = await calendarService.getCalendarFeed(req.workspace._id, req.query);
  sendSuccess(res, { items });
});

export const createEvent = asyncHandler(async (req, res) => {
  const event = await calendarService.createEvent(req.workspace._id, req.user._id, req.body);
  sendSuccess(res, { event }, { status: 201 });
});

export const updateEvent = asyncHandler(async (req, res) => {
  const event = await calendarService.updateEvent(req.workspace._id, req.params.eventId, req.body);
  sendSuccess(res, { event });
});

export const deleteEvent = asyncHandler(async (req, res) => {
  await calendarService.deleteEvent(req.workspace._id, req.params.eventId);
  sendSuccess(res, { deleted: true });
});
