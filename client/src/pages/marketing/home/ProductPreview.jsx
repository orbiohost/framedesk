import { Folder, FolderOpen, MessageSquare, Play } from 'lucide-react';
import { cn } from '../../../lib/cn.js';

// A static rendering of the file explorer, built from the same tokens as the app,
// so the hero shows the product itself rather than an illustration.

const FOLDERS = [
  { name: 'Raw', count: 48 },
  { name: 'Working Files', count: 12 },
  { name: 'Exports', count: 6, active: true },
  { name: 'References', count: 19 },
  { name: 'Client Assets', count: 7 },
];

const FILES = [
  { name: 'NLT_BrandFilm_v03.mp4', size: '812 MB', status: 'In review', selected: true },
  { name: 'NLT_BrandFilm_v02.mp4', size: '798 MB', status: 'Superseded' },
  { name: 'NLT_Teaser_15s_v01.mp4', size: '96 MB', status: 'Approved' },
  { name: 'NLT_Stills_Selects.zip', size: '1.4 GB', status: 'Final' },
];

const STATUS_STYLES = {
  'In review': 'text-accent',
  Approved: 'text-success',
  Final: 'text-ink',
  Superseded: 'text-muted line-through',
};

const NOTE_MARKERS = [18, 42, 71];

function FolderTree() {
  return (
    <div className="border-line hidden w-48 shrink-0 border-r p-3 md:block">
      <p className="text-muted mb-2 px-2 text-[11px] uppercase tracking-[0.14em]">
        Northlight · Brand film
      </p>
      <ul className="space-y-0.5 text-[13px]">
        {FOLDERS.map((folder) => {
          const Icon = folder.active ? FolderOpen : Folder;
          return (
            <li
              key={folder.name}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1.5',
                folder.active ? 'bg-subtle text-ink font-medium' : 'text-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="flex-1 truncate">{folder.name}</span>
              <span className="text-[11px] tabular-nums">{folder.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FileList() {
  return (
    <div className="min-w-0 flex-1">
      <div className="border-line text-muted grid grid-cols-[1fr_auto_auto] gap-4 border-b px-4 py-2 text-[11px] uppercase tracking-[0.12em]">
        <span>Name</span>
        <span className="hidden sm:block">Size</span>
        <span>Status</span>
      </div>
      <ul className="text-[13px]">
        {FILES.map((file) => (
          <li
            key={file.name}
            className={cn(
              'border-line grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b px-4 py-2.5',
              file.selected && 'bg-subtle',
            )}
          >
            <span className="truncate font-medium">{file.name}</span>
            <span className="text-muted hidden tabular-nums sm:block">{file.size}</span>
            <span className={cn('text-xs', STATUS_STYLES[file.status])}>{file.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewPanel() {
  return (
    <div className="border-line hidden w-72 shrink-0 border-l lg:block">
      <div className="relative m-3 aspect-video rounded bg-[#1d1c1a]">
        <Play
          className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-[#f6f4ef]/80"
          aria-hidden="true"
        />
        <span className="absolute bottom-2 left-2 font-mono text-[10px] text-[#f6f4ef]/70">
          00:00:42:11
        </span>
      </div>
      <div className="mx-3 mb-3">
        <div className="bg-subtle relative h-1.5 rounded-full">
          <div className="bg-ink absolute inset-y-0 left-0 w-[42%] rounded-full" />
          {NOTE_MARKERS.map((percent) => (
            <span
              key={percent}
              className="bg-accent absolute -top-1 h-3.5 w-0.5 rounded"
              style={{ left: `${percent}%` }}
            />
          ))}
        </div>
      </div>
      <div className="border-line border-t p-3 text-[13px]">
        <p className="text-muted mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em]">
          <MessageSquare className="h-3 w-3" aria-hidden="true" /> Notes · 3 open
        </p>
        <div className="space-y-2.5">
          <p>
            <span className="text-accent font-mono text-xs">00:42</span> Hold on the product shot
            two frames longer before the cut.
            <span className="text-muted block text-xs">Meera, client</span>
          </p>
          <p>
            <span className="text-accent font-mono text-xs">01:11</span> Logo lockup feels small on
            mobile.
            <span className="text-muted block text-xs">Arjun, creative director</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export function ProductPreview() {
  return (
    <figure className="border-line bg-surface shadow-ink/10 overflow-hidden rounded-xl border shadow-2xl">
      <div className="border-line flex items-center gap-1.5 border-b px-4 py-2.5">
        <span className="bg-line h-2.5 w-2.5 rounded-full" />
        <span className="bg-line h-2.5 w-2.5 rounded-full" />
        <span className="bg-line h-2.5 w-2.5 rounded-full" />
        <span className="text-muted ml-3 text-xs">Exports</span>
      </div>
      <div className="flex">
        <FolderTree />
        <FileList />
        <ReviewPanel />
      </div>
      <figcaption className="sr-only">
        The FrameDesk file explorer: project folders, file versions with review status, and
        timestamped client notes on a video.
      </figcaption>
    </figure>
  );
}
