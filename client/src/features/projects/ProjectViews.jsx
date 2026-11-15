import { CalendarDays, Flag, Folder } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { isPressingPriority, priorityLabel } from '../../lib/priorities.js';
import { useAiAvailable } from '../ai/aiBridge.js';
import { ActionMenu } from '../files/ActionMenu.jsx';
import { dueInfo, projectMenuItems, taskPercent } from './projectList.js';
import { projectStatus, projectTypeLabel } from './projectMeta.js';

const DUE_TONES = {
  danger: 'text-danger font-medium',
  warning: 'text-warning font-medium',
  muted: 'text-muted',
  ink: 'text-ink',
};

function DueLabel({ project, className }) {
  const due = dueInfo(project);
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm', DUE_TONES[due.tone], className)}
    >
      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {due.label}
    </span>
  );
}

// Only high and urgent get a flag; "medium" on every row would be noise.
function PriorityFlag({ priority, className }) {
  if (!isPressingPriority(priority)) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        priority === 'urgent' ? 'text-danger' : 'text-warning',
        className,
      )}
    >
      <Flag className="h-3 w-3" fill="currentColor" aria-hidden="true" />
      {priorityLabel(priority)}
    </span>
  );
}

function Progress({ project, wide = false }) {
  const { done, total } = project.tasks;
  if (total === 0) return <span className="text-muted text-xs">No tasks yet</span>;
  const percent = taskPercent(project);
  return (
    <div className={cn('flex items-center gap-2.5', wide && 'w-full')}>
      <div
        className={cn('bg-subtle h-1.5 overflow-hidden rounded-full', wide ? 'flex-1' : 'w-20')}
        aria-hidden="true"
      >
        <div
          className={cn('h-full rounded-full', percent === 100 ? 'bg-success' : 'bg-accent')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-muted whitespace-nowrap text-xs tabular-nums">
        {done}/{total} tasks
      </span>
    </div>
  );
}

// Every project card gets the same soft pink-to-purple glow, and its folder a
// soft pastel pink-to-lilac tile, kept lighter than the bright AI icon so the
// two don't look alike.
const CARD_TINT =
  'from-rose-100/70 via-violet-50 to-surface border-violet-200/80 hover:border-violet-300 dark:from-fuchsia-500/[0.12] dark:via-violet-500/[0.06] dark:to-surface dark:border-violet-400/20 dark:hover:border-violet-400/45';

function FolderTile({ small = false }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center bg-gradient-to-br from-rose-100 to-violet-200 text-violet-600 ring-1 ring-inset ring-violet-300/50 dark:from-rose-300/20 dark:to-violet-300/20 dark:text-violet-200 dark:ring-violet-300/20',
        small ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-2xl',
      )}
      aria-hidden="true"
    >
      <Folder
        className={small ? 'h-[18px] w-[18px]' : 'h-5 w-5'}
        fill="currentColor"
        fillOpacity={0.3}
        strokeWidth={2}
      />
    </span>
  );
}

// Status as a small tinted pill with a colored dot: readable on the tinted card
// in both themes, unlike the outlined grey badge.
const STATUS_STYLES = {
  draft: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 [--dot:theme(colors.slate.400)]',
  active:
    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 [--dot:theme(colors.emerald.500)]',
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 [--dot:theme(colors.amber.500)]',
  review: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 [--dot:theme(colors.violet.500)]',
  completed: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 [--dot:theme(colors.sky.500)]',
  archived: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 [--dot:theme(colors.slate.400)]',
};

function StatusPill({ status }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        STATUS_STYLES[status] ?? STATUS_STYLES.draft,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--dot)]" aria-hidden="true" />
      {projectStatus(status).label}
    </span>
  );
}

function subtitle(project) {
  return `${project.client?.name ?? 'Internal'} · ${projectTypeLabel(project.type)}`;
}

function Menu({ project, menu, className }) {
  const askAi = useAiAvailable();
  return (
    <ActionMenu
      label={`Actions for ${project.title}`}
      title={project.title}
      items={projectMenuItems({ project, ...menu, askAi })}
      className={className}
    />
  );
}

// The whole card or row opens the project: the title's link is stretched over
// it, and the menu sits above that so it stays clickable.
const STRETCHED = 'after:absolute after:inset-0 after:rounded-[inherit] focus-visible:ring-0';

function ProjectCard({ project, workspaceId, menu }) {
  return (
    <li
      className={cn(
        'shadow-soft hover:shadow-lift focus-within:ring-accent/40 group relative flex flex-col rounded-3xl border bg-gradient-to-br p-5 transition-all duration-200 focus-within:ring-2 hover:-translate-y-0.5',
        CARD_TINT,
      )}
    >
      <div className="flex items-center gap-3">
        <FolderTile />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <PriorityFlag priority={project.priority} />
          <StatusPill status={project.status} />
        </div>
        <Menu project={project} menu={menu} className="relative z-10 -mr-2" />
      </div>
      <h3 className="mt-4 text-[17px] font-semibold leading-snug">
        <Link
          to={`/w/${workspaceId}/projects/${project.id}`}
          className={cn('line-clamp-2', STRETCHED)}
        >
          {project.title}
        </Link>
      </h3>
      <p className="text-muted mt-0.5 truncate text-sm">{subtitle(project)}</p>
      {/* Pinned to the bottom, so cards in a row line up whatever their text. */}
      <div className="mt-auto pt-5">
        {project.tasks.total > 0 && (
          <div className="mb-3">
            <Progress project={project} wide />
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-violet-200/70 pt-3 dark:border-white/[0.06]">
          <DueLabel project={project} className="min-w-0 truncate text-[13px]" />
          {project.tasks.total === 0 && <Progress project={project} />}
        </div>
      </div>
    </li>
  );
}

export function ProjectGrid({ projects, workspaceId, menu }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} workspaceId={workspaceId} menu={menu} />
      ))}
    </ul>
  );
}

const COLUMNS = 'md:grid-cols-[minmax(0,1fr)_9.5rem_9rem_11rem_2.5rem]';

function ProjectListRow({ project, workspaceId, menu }) {
  return (
    <li
      className={cn(
        'hover:bg-subtle/60 focus-within:bg-subtle/60 relative grid items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors sm:px-5',
        // Phones: title and menu on top, the facts wrapped beneath.
        'grid-cols-[minmax(0,1fr)_auto]',
        COLUMNS,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <FolderTile small />
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <Link
              to={`/w/${workspaceId}/projects/${project.id}`}
              className={cn('truncate font-semibold', STRETCHED)}
            >
              {project.title}
            </Link>
            <PriorityFlag priority={project.priority} className="shrink-0" />
          </p>
          <p className="text-muted truncate text-sm">{subtitle(project)}</p>
        </div>
      </div>
      <Menu
        project={project}
        menu={menu}
        className="relative z-10 col-start-2 row-start-1 md:col-start-5"
      />
      <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 md:contents">
        <div className="md:col-start-2 md:row-start-1">
          <StatusPill status={project.status} />
        </div>
        <DueLabel project={project} className="md:col-start-3 md:row-start-1" />
        <div className="md:col-start-4 md:row-start-1">
          <Progress project={project} />
        </div>
      </div>
    </li>
  );
}

export function ProjectList({ projects, workspaceId, menu }) {
  return (
    <div className="border-line/60 bg-surface shadow-soft overflow-hidden rounded-3xl border">
      <div
        aria-hidden="true"
        className={cn(
          'border-line bg-subtle/50 text-muted hidden gap-x-4 border-b px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] md:grid',
          COLUMNS,
        )}
      >
        <span>Project</span>
        <span>Status</span>
        <span>Due</span>
        <span>Progress</span>
      </div>
      <ul className="divide-line/70 divide-y">
        {projects.map((project) => (
          <ProjectListRow
            key={project.id}
            project={project}
            workspaceId={workspaceId}
            menu={menu}
          />
        ))}
      </ul>
    </div>
  );
}
