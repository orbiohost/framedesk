import yazl from 'yazl';
import { getStorageDriver } from '../../storage/storageDriver.js';
import { logger } from '../../utils/logger.js';
import { AuditLog } from '../admin/auditLog.model.js';
import { collectBackupData } from './backupData.service.js';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MANIFEST_PATH,
  dataPath,
  readmeText,
} from './backupFormat.js';
import { createZipPathBuilder } from './zipPaths.js';

function jsonBuffer(value) {
  return Buffer.from(JSON.stringify(value, null, 2));
}

function isoRange(range) {
  return range ? { from: range.from.toISOString(), to: range.to.toISOString() } : null;
}

// The zip lists files without their storage keys; restores only ever use the bytes in the zip.
function withZipPaths(files, includeFiles, pathForFile) {
  return files.map(({ storageKey, ...file }) => ({
    file: { ...file, zipPath: includeFiles ? pathForFile(file) : null },
    storageKey,
  }));
}

function addFileEntries(zip, entries) {
  const driver = getStorageDriver();
  for (const { file, storageKey } of entries) {
    // Media is already compressed; storing it as-is keeps big backups fast.
    zip.addReadStreamLazy(
      file.zipPath,
      { size: file.size, compress: false, mtime: new Date(file.createdAt) },
      (callback) => {
        try {
          callback(null, driver.readStream(storageKey));
        } catch (err) {
          callback(err);
        }
      },
    );
  }
}

export async function writeBackupZip({ workspace, userId, range, includeFiles, output }) {
  const data = await collectBackupData(workspace._id, range, userId);
  const pathForFile = createZipPathBuilder(data);
  const fileEntries = withZipPaths(data.files, includeFiles, pathForFile);

  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    workspace: { id: String(workspace._id), name: workspace.name },
    createdAt: new Date().toISOString(),
    range: isoRange(range),
    includesFiles: includeFiles,
    counts: {
      clients: data.clients.length,
      projects: data.projects.length,
      folders: data.folders.length,
      tasks: data.tasks.length,
      events: data.events.length,
      files: data.files.length,
      notes: data.notes.length,
    },
  };

  const zip = new yazl.ZipFile();
  zip.addBuffer(jsonBuffer(manifest), MANIFEST_PATH);
  zip.addBuffer(Buffer.from(readmeText(manifest)), 'README.txt');
  for (const collection of ['clients', 'projects', 'folders', 'tasks', 'events', 'notes']) {
    zip.addBuffer(jsonBuffer(data[collection]), dataPath(collection));
  }
  zip.addBuffer(jsonBuffer(fileEntries.map((entry) => entry.file)), dataPath('files'));
  // For reference only; memberships are never restored from a zip.
  zip.addBuffer(jsonBuffer(data.members), 'data/members.json');
  if (includeFiles) addFileEntries(zip, fileEntries);
  zip.end();

  zip.outputStream.pipe(output);
  await new Promise((resolve, reject) => {
    zip.outputStream.on('end', resolve);
    zip.outputStream.on('error', reject);
  });

  await AuditLog.create({
    actorId: userId,
    action: 'workspace.backup',
    workspaceId: workspace._id,
    details: { range: manifest.range, includesFiles: includeFiles, counts: manifest.counts },
  }).catch((err) => logger.error({ err }, 'Could not record backup in audit log'));
}
