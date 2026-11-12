import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import yauzl from 'yauzl';
import { AppError } from '../../utils/AppError.js';

const MAX_JSON_BYTES = 200 * 1024 * 1024;

function badZip(message) {
  return AppError.badRequest(message, 'INVALID_BACKUP');
}

function readAllEntries(zipfile) {
  return new Promise((resolve, reject) => {
    const entries = new Map();
    zipfile.on('entry', (entry) => {
      entries.set(entry.fileName, entry);
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(entries));
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

// Read-only access to a backup zip. Entries are only ever streamed into memory
// (capped) or into paths the caller chooses; entry names never touch the disk.
export async function openBackupZip(zipPath) {
  const zipfile = await promisify(yauzl.open)(zipPath, {
    lazyEntries: true,
    autoClose: false,
  }).catch(() => {
    throw badZip('This file is not a valid zip');
  });
  const entries = await readAllEntries(zipfile);
  const openStream = promisify(zipfile.openReadStream.bind(zipfile));

  async function readJson(name) {
    const entry = entries.get(name);
    if (!entry) return undefined;
    if (entry.uncompressedSize > MAX_JSON_BYTES) throw badZip(`${name} is too large`);

    const chunks = [];
    for await (const chunk of await openStream(entry)) chunks.push(chunk);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw badZip(`${name} is not valid JSON`);
    }
  }

  async function extractTo(name, targetPath) {
    await pipeline(await openStream(entries.get(name)), createWriteStream(targetPath));
  }

  return {
    has: (name) => entries.has(name),
    sizeOf: (name) => entries.get(name)?.uncompressedSize ?? 0,
    readJson,
    extractTo,
    close: () => zipfile.close(),
  };
}
