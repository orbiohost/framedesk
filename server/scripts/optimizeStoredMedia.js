/* eslint-disable no-console -- CLI script: printing the result is its job. */
// Fixes videos and audio uploaded before the app optimised media for
// streaming: MP4/MOV/M4A files with their index at the end (slow start, wrong
// duration) get it moved to the front, and WebM/MKV files get a duration and
// seek index. Streams are copied, never re-encoded, so quality is identical.
//
//   docker compose exec api npm run optimize:media              (fix everything)
//   docker compose exec api npm run optimize:media -- --dry     (just report)
//
// Each fixed file is stored under a new key and the old object is removed,
// so a browser never mixes cached bytes of the old and new layout. Run it
// while no transcription is in progress. Safe to re-run: already-optimised
// MP4s are detected from a few header bytes without downloading them.
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { storageConfig } from '../src/config/storage.js';
import { StoredFile } from '../src/modules/files/file.model.js';
import { optimizeForStreaming } from '../src/modules/files/mediaOptimize.js';
import { releaseStorage } from '../src/modules/files/storageQuota.service.js';
import { Workspace } from '../src/modules/workspaces/workspace.model.js';
import { poolIdForWorkspaceId } from '../src/modules/workspaces/storagePool.js';
import { getStorageDriver } from '../src/storage/storageDriver.js';
import { formatBytes } from '../src/utils/bytes.js';

const { values } = parseArgs({ options: { dry: { type: 'boolean', default: false } } });
const dryRun = values.dry;

const MP4_MIMES = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'audio/mp4'];
const MATROSKA_MIMES = ['video/webm', 'audio/webm', 'video/x-matroska', 'audio/x-matroska'];

async function readRange(driver, key, start, length) {
  const chunks = [];
  for await (const chunk of driver.readStream(key, { start, end: start + length - 1 })) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// The same top-level box walk as mediaOptimize, over ranged S3 reads.
async function remoteMp4NeedsFaststart(driver, key, fileSize) {
  let offset = 0;
  let sawMdat = false;
  while (offset + 8 <= fileSize) {
    const header = await readRange(driver, key, offset, Math.min(16, fileSize - offset));
    if (header.length < 8) return false;
    let boxSize = header.readUInt32BE(0);
    const type = header.toString('latin1', 4, 8);
    if (boxSize === 1) {
      if (header.length < 16) return false;
      boxSize = Number(header.readBigUInt64BE(8));
    } else if (boxSize === 0) {
      boxSize = fileSize - offset;
    }
    if (boxSize < 8) return false;
    if (type === 'moov') return sawMdat;
    if (type === 'moof') return false;
    if (type === 'mdat') sawMdat = true;
    offset += boxSize;
  }
  return false;
}

// Small size changes from the remux, applied to the account's storage counter.
async function adjustUsage(workspaceId, delta) {
  if (delta < 0) return releaseStorage(workspaceId, -delta);
  if (delta > 0) {
    const poolId = await poolIdForWorkspaceId(workspaceId);
    await Workspace.updateOne({ _id: poolId }, { $inc: { 'storage.usedBytes': delta } });
  }
}

async function main() {
  await connectDatabase();
  const driver = getStorageDriver();
  const totals = { fixed: 0, alreadyFine: 0, failed: 0, bytes: 0 };
  await fs.mkdir(storageConfig.stagingDir, { recursive: true });

  const cursor = StoredFile.find({ mime: { $in: [...MP4_MIMES, ...MATROSKA_MIMES] } })
    .select('workspaceId storageKey size mime displayName deletedAt')
    .setOptions({ crossWorkspace: true })
    .lean()
    .cursor();

  for await (const file of cursor) {
    const label = `${file.displayName} (${formatBytes(file.size)})`;
    try {
      if (MP4_MIMES.includes(file.mime)) {
        if (!(await remoteMp4NeedsFaststart(driver, file.storageKey, file.size))) {
          totals.alreadyFine += 1;
          continue;
        }
      }
      if (dryRun) {
        console.log(`would optimise: ${label}`);
        totals.fixed += 1;
        totals.bytes += file.size;
        continue;
      }

      const localPath = path.join(storageConfig.stagingDir, `optimize-${randomUUID()}`);
      try {
        await pipeline(driver.readStream(file.storageKey), createWriteStream(localPath));
        const { size, changed } = await optimizeForStreaming(localPath, file.mime);
        // Nothing rewritten (already fine, or ffmpeg refused): leave the object alone.
        if (!changed) {
          totals.alreadyFine += 1;
          continue;
        }
        const newKey = file.storageKey.replace(/[a-f\d-]{36}$/i, randomUUID());
        await driver.uploadFile(localPath, newKey);
        const updated = await StoredFile.updateOne(
          { _id: file._id, storageKey: file.storageKey },
          { $set: { storageKey: newKey, size } },
        ).setOptions({ crossWorkspace: true });
        if (updated.modifiedCount !== 1) {
          // Deleted or changed meanwhile: drop the copy, keep whatever is there.
          await driver.delete(newKey);
          continue;
        }
        if (!file.deletedAt) await adjustUsage(file.workspaceId, size - file.size);
        await driver.delete(file.storageKey);
        console.log(`optimised: ${label}`);
        totals.fixed += 1;
        totals.bytes += size;
      } finally {
        await fs.rm(localPath, { force: true });
        await fs.rm(`${localPath}.stream`, { force: true });
      }
    } catch (err) {
      console.warn(`failed: ${label}: ${err.message}`);
      totals.failed += 1;
    }
  }

  console.log(
    `${dryRun ? 'Would optimise' : 'Optimised'} ${totals.fixed} file(s), ${formatBytes(totals.bytes)}; ` +
      `${totals.alreadyFine} already streamed well; ${totals.failed} failed.`,
  );
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
