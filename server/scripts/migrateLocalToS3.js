/* eslint-disable no-console -- CLI script: printing the result is its job. */
// Copies files saved by older versions of the app on local disk into the S3
// bucket, under the same storage key, so nothing is lost after the move to S3.
//
//   npm run migrate:local-to-s3 -w server                      (copy from ./data/uploads)
//   npm run migrate:local-to-s3 -w server -- --dry             (just report)
//   npm run migrate:local-to-s3 -w server -- --from /old/dir   (another folder)
//
// Safe to re-run: files already in the bucket with the right size are skipped.
// Local files are never deleted; remove the old folder yourself once every
// file opens from S3. Needs the S3_* settings in .env.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { StoredFile } from '../src/modules/files/file.model.js';
import { S3Driver } from '../src/storage/s3Driver.js';
import { formatBytes } from '../src/utils/bytes.js';

const { values } = parseArgs({
  options: {
    dry: { type: 'boolean', default: false },
    from: { type: 'string', default: './data/uploads' },
  },
});
const dryRun = values.dry;
const sourceDir = path.resolve(values.from);

async function localSize(filePath) {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return null;
  }
}

async function remoteSize(s3, key) {
  try {
    return await s3.getSize(key);
  } catch {
    return null;
  }
}

async function main() {
  await connectDatabase();
  const s3 = new S3Driver();
  const totals = { copied: 0, skipped: 0, missing: 0, failed: 0, bytes: 0 };

  const cursor = StoredFile.find({})
    .select('storageKey size displayName')
    .setOptions({ crossWorkspace: true })
    .lean()
    .cursor();
  for await (const file of cursor) {
    const localPath = path.join(sourceDir, ...file.storageKey.split('/'));
    const size = await localSize(localPath);
    if (size === null) {
      console.warn(`missing on disk: ${file.displayName} (${file.storageKey})`);
      totals.missing += 1;
      continue;
    }
    if ((await remoteSize(s3, file.storageKey)) === size) {
      totals.skipped += 1;
      continue;
    }
    console.log(`${dryRun ? 'would copy' : 'copy'} ${file.displayName} (${formatBytes(size)})`);
    if (dryRun) {
      totals.copied += 1;
      totals.bytes += size;
      continue;
    }
    try {
      await s3.uploadFile(localPath, file.storageKey);
      totals.copied += 1;
      totals.bytes += size;
    } catch (err) {
      console.error(`failed: ${file.displayName}: ${err.message}`);
      totals.failed += 1;
    }
  }

  console.log(
    `${dryRun ? 'Would copy' : 'Copied'} ${totals.copied} files (${formatBytes(totals.bytes)}), ` +
      `${totals.skipped} already in the bucket, ${totals.missing} missing on disk, ${totals.failed} failed.`,
  );
  if (totals.failed > 0) process.exitCode = 1;
}

try {
  await main();
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
