import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logger } from '../../utils/logger.js';
import { summarizeBackup } from './backupData.service.js';
import { writeBackupZip } from './backupExport.service.js';
import * as backups from './backups.service.js';

function rangeFrom({ from, to }) {
  return from && to ? { from, to } : null;
}

export const summary = asyncHandler(async (req, res) => {
  const result = await summarizeBackup(req.workspace._id, rangeFrom(req.query), req.user._id);
  sendSuccess(res, result);
});

export const createLink = asyncHandler(async (req, res) => {
  sendSuccess(res, backups.createDownloadLink(req.workspace._id, req.user._id, req.body));
});

export const download = asyncHandler(async (req, res) => {
  const { workspace, userId, range, includeFiles } = await backups.resolveDownload(
    req.params.token,
  );
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${backups.backupFileName(workspace)}"`,
    'Cache-Control': 'no-store',
  });
  // Headers are already sent once streaming starts; a failure can only cut the download short.
  await writeBackupZip({ workspace, userId, range, includeFiles, output: res }).catch((err) => {
    logger.error({ err, workspaceId: String(workspace._id) }, 'Backup download failed');
    res.destroy(err);
  });
});

export const restore = asyncHandler(async (req, res) => {
  const result = await backups.restoreFromUpload(req);
  sendSuccess(res, { summary: result });
});

export const history = asyncHandler(async (req, res) => {
  sendSuccess(res, { entries: await backups.listBackupHistory(req.workspace._id) });
});
