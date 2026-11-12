import { z } from 'zod';

// Layout of a backup zip:
//   manifest.json          what this backup is (workspace, date range, counts)
//   README.txt             a plain explanation for whoever opens the zip
//   data/<collection>.json one JSON array per collection
//   files/<project>/<folder path>/<file name>   only when files were included

export const BACKUP_FORMAT = 'framedesk-backup';
export const BACKUP_VERSION = 1;
export const MANIFEST_PATH = 'manifest.json';

// Restored in this order, so parents exist before the records that point at them.
export const RESTORABLE_COLLECTIONS = [
  'clients',
  'projects',
  'folders',
  'tasks',
  'events',
  'files',
  'notes',
];

export function dataPath(collection) {
  return `data/${collection}.json`;
}

export const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  workspace: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.string(),
  range: z.object({ from: z.string(), to: z.string() }).nullable(),
  includesFiles: z.boolean(),
  counts: z.record(z.string(), z.number()),
});

export function readmeText(manifest) {
  return [
    `FrameDesk backup of "${manifest.workspace.name}"`,
    `Created ${manifest.createdAt}`,
    manifest.range
      ? `Covers records created or changed between ${manifest.range.from} and ${manifest.range.to}.`
      : 'Covers everything in the workspace.',
    manifest.includesFiles
      ? 'Uploaded files are in the files/ folder, arranged by project and folder.'
      : 'Uploaded files are not included; data/files.json lists them.',
    '',
    'To restore: Settings > Backup & restore > Restore from a backup, in the same workspace.',
    'Restoring brings back anything missing and never overwrites what is there now.',
  ].join('\n');
}
