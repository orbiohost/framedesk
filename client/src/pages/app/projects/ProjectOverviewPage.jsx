import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { ArrowRight, Flag, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Card } from '../../../components/ui/Card.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { itemLabel } from '../../../features/calendar/calendarMeta.js';
import { useCalendarFeed } from '../../../features/calendar/hooks.js';
import { FileMarks } from '../../../features/files/FileRow.jsx';
import { fileTint } from '../../../features/files/FileThumbnail.jsx';
import { FileTypeIcon } from '../../../features/files/FileTypeIcon.jsx';
import { useFiles } from '../../../features/files/hooks.js';
import { dueInfo, taskPercent } from '../../../features/projects/projectList.js';
import { useTasks } from '../../../features/tasks/hooks.js';
import { canManage } from '../../../features/workspaces/roles.js';
import { cn } from '../../../lib/cn.js';
import { formatDate, formatDueLabel, formatTime, isOverdue } from '../../../lib/dates.js';
import { formatBytes, formatInr } from '../../../lib/format.js';
import { isPressingPriority, priorityLabel } from '../../../lib/priorities.js';

const LIST_LENGTH = 5;
const UPCOMING_DAYS = 60;

const DUE_TONES = {
  danger: 'text-danger',
  warning: 'text-warning',
  muted: 'text-muted',
  ink: 'text-ink',
};

// A card with a heading and, usually, a link to the tab that holds the full list.
function Section({ title, count, to, linkLabel, action, children, className }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <header className="border-line/70 flex items-center gap-2 border-b px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {count > 0 && (
          <span className="bg-subtle text-muted rounded-full px-1.5 text-[11px] font-medium tabular-nums">
            {count}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {action}
          {to && (
            <Link
              to={to}
              className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-medium"
            >
              {linkLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>
      {children}
    </Card>
  );
}

function Quiet({ children }) {
  return <p className="text-muted px-5 py-6 text-sm">{children}</p>;
}

function Rows({ children }) {
  return <ul className="divide-line/60 divide-y">{children}</ul>;
}

function BriefCard({ project, canEdit, onEdit }) {
  return (
    <Section
      title="Brief"
      action={
        canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-sm font-medium"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
          </button>
        )
      }
    >
      <div className="p-5">
        {project.description ? (
          <p className="whitespace-pre-line leading-relaxed">{project.description}</p>
        ) : (
          <p className="text-muted text-sm">
            No brief yet.{' '}
            {canEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="text-ink font-medium underline underline-offset-4"
              >
                Add what&apos;s being delivered, formats and references
              </button>
            ) : (
              'A manager can add what is being delivered, formats and references.'
            )}
          </p>
        )}
        {project.tags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Tags">
            {project.tags.map((tag) => (
              <li key={tag} className="bg-subtle text-muted rounded-full px-2.5 py-0.5 text-xs">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

// Soonest due first; tasks without a date go last.
function byDueDate(a, b) {
  if (!a.dueDate || !b.dueDate) return (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1);
  return new Date(a.dueDate) - new Date(b.dueDate);
}

function OpenTasksCard({ workspace, project }) {
  const { data: tasks, isPending } = useTasks(workspace.id, { projectId: project.id });
  const open = (tasks ?? []).filter((task) => task.status !== 'done').sort(byDueDate);

  return (
    <Section title="Open tasks" count={open.length} to="tasks" linkLabel="All tasks">
      {isPending && <Skeleton className="m-5 h-24" />}
      {!isPending && open.length === 0 && (
        <Quiet>
          {project.tasks.total === 0
            ? 'No tasks yet. Break the project into steps on the Tasks tab.'
            : 'Every task is done.'}
        </Quiet>
      )}
      <Rows>
        {open.slice(0, LIST_LENGTH).map((task) => {
          const late = isOverdue(task.dueDate);
          return (
            <li key={task.id} className="flex items-center gap-3 px-5 py-3">
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  task.status === 'todo' ? 'bg-line' : 'bg-accent',
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{task.title}</p>
                <p className="text-muted truncate text-xs">{task.assignee?.name ?? 'Unassigned'}</p>
              </div>
              {isPressingPriority(task.priority) && (
                <Flag
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    task.priority === 'urgent' ? 'text-danger' : 'text-warning',
                  )}
                  fill="currentColor"
                  aria-label={`${priorityLabel(task.priority)} priority`}
                />
              )}
              <span
                className={cn(
                  'shrink-0 text-xs tabular-nums',
                  late ? 'text-danger font-medium' : 'text-muted',
                )}
              >
                {task.dueDate ? formatDueLabel(task.dueDate) : 'No date'}
              </span>
            </li>
          );
        })}
      </Rows>
    </Section>
  );
}

function RecentFilesCard({ workspace, project, files, isPending, hasMore }) {
  const total = files.length;
  return (
    <Section
      title="Recent files"
      count={total}
      to="files"
      linkLabel={hasMore ? 'All files' : 'Open files'}
    >
      {isPending && <Skeleton className="m-5 h-24" />}
      {!isPending && total === 0 && (
        <Quiet>Nothing uploaded yet. Rushes, exports and references go on the Files tab.</Quiet>
      )}
      <Rows>
        {files.slice(0, LIST_LENGTH).map((file) => (
          <li key={file.id}>
            <Link
              to={`/w/${workspace.id}/projects/${project.id}/files?folder=${file.folderId}`}
              className="hover:bg-subtle/60 flex items-center gap-3 px-5 py-2.5 transition-colors"
            >
              <span
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                  fileTint(file.category),
                )}
              >
                <FileTypeIcon category={file.category} className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <FileMarks file={file} className="shrink-0" />
                </div>
                <p className="text-muted truncate text-xs tabular-nums">
                  {formatBytes(file.size)} · {file.uploadedBy?.name ?? 'Unknown'} ·{' '}
                  {formatDate(file.createdAt)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </Rows>
    </Section>
  );
}

function UpcomingCard({ workspace, project }) {
  // Fixed for the life of the page, so the query isn't re-keyed on every render.
  const [from] = useState(() => startOfDay(new Date()));
  const { data: items, isPending } = useCalendarFeed(workspace.id, {
    from,
    to: addDays(from, UPCOMING_DAYS),
    projectId: project.id,
  });
  const upcoming = [...(items ?? [])].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

  return (
    <Section title="Coming up" to="calendar" linkLabel="Calendar">
      {isPending && <Skeleton className="m-5 h-16" />}
      {!isPending && upcoming.length === 0 && (
        <Quiet>Nothing scheduled in the next {UPCOMING_DAYS} days.</Quiet>
      )}
      <Rows>
        {upcoming.slice(0, 4).map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-5 py-3">
            <span className="bg-subtle grid h-10 w-10 shrink-0 place-items-center rounded-xl text-center leading-none">
              <span className="text-muted block text-[9px] font-semibold uppercase">
                {format(new Date(item.startsAt), 'MMM')}
              </span>
              <span className="block text-sm font-semibold tabular-nums">
                {format(new Date(item.startsAt), 'd')}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="text-muted truncate text-xs">
                {itemLabel(item)}
                {!item.allDay && ` · ${formatTime(item.startsAt)}`}
              </p>
            </div>
          </li>
        ))}
      </Rows>
    </Section>
  );
}

// How far through its start-to-due window the project is today.
function timeline(project) {
  if (!project.startDate || !project.dueDate) return null;
  const total = differenceInCalendarDays(new Date(project.dueDate), new Date(project.startDate));
  const elapsed = differenceInCalendarDays(new Date(), new Date(project.startDate));
  if (total <= 0) return null;
  return { percent: Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))), total };
}

function Detail({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-muted shrink-0 text-sm">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

// Where the project stands: tasks done, the deadline, and only the facts that are filled in.
function SummaryCard({ project }) {
  const span = timeline(project);
  const due = dueInfo(project);
  const { done, total } = project.tasks;
  const percent = taskPercent(project);
  return (
    <Section title="Summary">
      <div className="px-5 pb-2 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-2xl tabular-nums leading-none">
            {total === 0 ? 'Not started' : `${percent}%`}
          </p>
          <p className="text-muted text-sm tabular-nums">
            {total === 0 ? 'No tasks yet' : `${done} of ${total} tasks done`}
          </p>
        </div>
        <div className="bg-subtle mt-3 h-2 overflow-hidden rounded-full" aria-hidden="true">
          <div
            className={cn('h-full rounded-full', percent === 100 ? 'bg-success' : 'bg-accent')}
            style={{ width: `${percent}%` }}
          />
        </div>
        <dl className="divide-line/60 mt-3 divide-y">
          <Detail label="Deadline">
            <span className={DUE_TONES[due.tone]}>{due.label}</span>
            {project.dueDate && (
              <span className="text-muted font-normal"> · {formatDate(project.dueDate)}</span>
            )}
          </Detail>
          {project.startDate && <Detail label="Started">{formatDate(project.startDate)}</Detail>}
          <Detail label="Priority">{priorityLabel(project.priority)}</Detail>
          {typeof project.budget === 'number' && (
            <Detail label="Budget">{formatInr(project.budget)}</Detail>
          )}
        </dl>
        {span && (
          <div className="border-line/60 border-t pb-3 pt-4">
            <div className="text-muted mb-1.5 flex justify-between text-xs">
              <span>Time used</span>
              <span className="tabular-nums">
                {span.percent}% of {span.total} days
              </span>
            </div>
            <div className="bg-subtle h-1.5 overflow-hidden rounded-full" aria-hidden="true">
              <div
                className="bg-ink/40 h-full rounded-full"
                style={{ width: `${span.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

export function ProjectOverviewPage() {
  const { workspace, project, editProject } = useOutletContext();
  const filesQuery = useFiles(workspace.id, { projectId: project.id });
  const files = filesQuery.data?.pages.flatMap((page) => page.files) ?? [];

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <BriefCard project={project} canEdit={canManage(workspace)} onEdit={editProject} />
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <OpenTasksCard workspace={workspace} project={project} />
          <RecentFilesCard
            workspace={workspace}
            project={project}
            files={files}
            isPending={filesQuery.isPending}
            hasMore={filesQuery.hasNextPage}
          />
        </div>
      </div>
      <div className="space-y-6">
        <SummaryCard project={project} />
        <UpcomingCard workspace={workspace} project={project} />
      </div>
    </div>
  );
}
