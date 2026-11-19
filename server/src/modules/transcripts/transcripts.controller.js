import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { viewerOf } from '../files/folderAccess.js';
import * as transcriptsService from './transcripts.service.js';
import { transliterate as transliterateWord } from './transliterate.js';

export const config = (req, res) => {
  sendSuccess(res, transcriptsService.getTranscriptionConfig());
};

export const list = asyncHandler(async (req, res) => {
  const result = await transcriptsService.listTranscripts(
    req.workspace._id,
    req.query,
    viewerOf(req),
  );
  sendSuccess(res, result);
});

export const folder = asyncHandler(async (req, res) => {
  const result = await transcriptsService.getTranscriptionsFolder(req.workspace._id, req.user._id);
  sendSuccess(res, { folder: result });
});

export const get = asyncHandler(async (req, res) => {
  const transcript = await transcriptsService.getTranscript(
    req.workspace._id,
    req.params.fileId,
    viewerOf(req),
  );
  sendSuccess(res, { transcript });
});

export const request = asyncHandler(async (req, res) => {
  const transcript = await transcriptsService.requestTranscript(
    req.workspace._id,
    req.params.fileId,
    req.user._id,
    req.body,
    viewerOf(req),
  );
  sendSuccess(res, { transcript }, { status: 202 });
});

export const remove = asyncHandler(async (req, res) => {
  await transcriptsService.deleteTranscript(req.workspace._id, req.params.fileId, viewerOf(req));
  sendSuccess(res, { deleted: true });
});

export const exportFile = asyncHandler(async (req, res) => {
  const { fileName, mime, content } = await transcriptsService.exportTranscript(
    req.workspace._id,
    req.params.fileId,
    req.query.format,
    viewerOf(req),
  );
  res.setHeader('Content-Type', `${mime}; charset=utf-8`);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fileName.replace(/[^\w.-]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  res.send(content);
});

export const dictation = asyncHandler(async (req, res) => {
  const result = await transcriptsService.transcribeDictation(req.body, {
    mime: req.get('content-type'),
    language: req.query.language,
  });
  sendSuccess(res, result);
});

export const transliterate = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, max-age=86400');
  sendSuccess(res, {
    suggestions: await transliterateWord(req.query.text, req.query.language),
  });
});

export const editSegments = asyncHandler(async (req, res) => {
  const transcript = await transcriptsService.editSegments(
    req.workspace._id,
    req.params.fileId,
    req.user._id,
    req.body.edits,
    viewerOf(req),
  );
  sendSuccess(res, { transcript });
});

export const watchVideo = asyncHandler(async (req, res) => {
  const transcript = await transcriptsService.watchVideo(
    req.workspace._id,
    req.params.fileId,
    viewerOf(req),
  );
  sendSuccess(res, { transcript });
});
