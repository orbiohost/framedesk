import { Check, Pause, Play } from 'lucide-react';
import { cn } from '../../../lib/cn.js';

// Small, static slices of real screens, used beside each workflow on the home page.

const UPLOADS = [
  { name: 'A001_C004_0412.MOV', size: '6.2 GB', progress: 100 },
  { name: 'A001_C005_0412.MOV', size: '4.8 GB', progress: 64 },
  { name: 'B002_C001_0412.MOV', size: '7.1 GB', progress: 0, paused: true },
];

export function UploadSnippet() {
  return (
    <ul className="divide-line divide-y text-sm">
      {UPLOADS.map((upload) => (
        <li key={upload.name} className="px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium">{upload.name}</span>
            <span className="text-muted flex items-center gap-2 text-xs tabular-nums">
              {upload.size}
              {upload.progress === 100 ? (
                <Check className="text-success h-3.5 w-3.5" aria-label="Uploaded" />
              ) : upload.paused ? (
                <Play className="h-3.5 w-3.5" aria-label="Paused" />
              ) : (
                <Pause className="h-3.5 w-3.5" aria-label="Uploading" />
              )}
            </span>
          </div>
          <div className="bg-subtle mt-2 h-1 rounded-full">
            <div
              className={cn(
                'h-full rounded-full',
                upload.progress === 100 ? 'bg-success' : 'bg-ink',
              )}
              style={{ width: `${upload.progress}%` }}
            />
          </div>
          {upload.paused && (
            <p className="text-muted mt-1.5 text-xs">
              Connection dropped. Resumes where it stopped.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

const NOTES = [
  {
    time: '00:12',
    text: 'Colour on the wide feels cooler than the close-up.',
    by: 'Meera · client',
    resolved: true,
  },
  { time: '00:42', text: 'Hold on the product two frames longer.', by: 'Meera · client' },
  { time: '00:42', text: 'Done in v04, uploading now.', by: 'Kabir · editor', reply: true },
];

export function NotesSnippet() {
  return (
    <ul className="space-y-4 px-5 py-4 text-sm">
      {NOTES.map((note) => (
        <li key={note.text} className={cn(note.reply && 'border-line ml-6 border-l pl-4')}>
          <p className={cn(note.resolved && 'text-muted line-through')}>
            <span className="text-accent mr-1.5 font-mono text-xs">{note.time}</span>
            {note.text}
          </p>
          <p className="text-muted mt-0.5 text-xs">
            {note.by}
            {note.resolved && ' · resolved'}
          </p>
        </li>
      ))}
    </ul>
  );
}

const MEMBERS = [
  { name: 'Arjun Nair', role: 'Admin', access: 'All projects' },
  { name: 'Kabir Mehta', role: 'Editor', access: 'Northlight, Saffron Tea' },
  { name: 'Riya (freelance)', role: 'Editor', access: 'Saffron Tea only', limited: true },
  { name: 'Meera, Northlight', role: 'Client', access: 'Review and approve' },
];

export function TeamSnippet() {
  return (
    <ul className="divide-line divide-y text-sm">
      {MEMBERS.map((member) => (
        <li key={member.name} className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{member.name}</p>
            <p className={cn('text-xs', member.limited ? 'text-accent' : 'text-muted')}>
              {member.access}
            </p>
          </div>
          <span className="border-line text-muted shrink-0 rounded border px-2 py-0.5 text-xs">
            {member.role}
          </span>
        </li>
      ))}
    </ul>
  );
}
