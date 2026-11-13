import { addDays, format, startOfDay } from 'date-fns';
import {
  CalendarDays,
  Download,
  Eye,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  Lock,
  NotebookPen,
  Pencil,
  Play,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { FullPageMessage } from '../../components/ui/FullPageMessage.jsx';
import { Logo } from '../../components/ui/Logo.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { ThemeToggle } from '../../components/ui/ThemeToggle.jsx';
import { itemLabel } from '../../features/calendar/calendarMeta.js';
import { fileTint } from '../../features/files/FileThumbnail.jsx';
import { FileTypeIcon } from '../../features/files/FileTypeIcon.jsx';
import { dueInfo, taskPercent } from '../../features/projects/projectList.js';
import { projectTypeLabel } from '../../features/projects/projectMeta.js';
import { ProjectStatusBadge } from '../../features/projects/ProjectStatusBadge.jsx';
import {
  useSaveSharedTask,
  useSharedCalendar,
  useSharedFiles,
  useSharedNotes,
  useSharedPreviewUrls,
  useSharedProject,
  useSharedTasks,
} from '../../features/projectShare/hooks.js';
import {
  downloadSharedFile,
  SharedPreviewDialog,
} from '../../features/projectShare/SharedPreviewDialog.jsx';
import { NoteMarkdown } from '../../features/quickNotes/NoteMarkdown.jsx';
import { TASK_STATUS_OPTIONS } from '../../features/tasks/taskMeta.js';
import { cn } from '../../lib/cn.js';
import { formatDate, formatDueLabel, formatTime, isOverdue } from '../../lib/dates.js';
import { formatBytes } from '../../lib/format.js';
import { priorityLabel } from '../../lib/priorities.js';
import { showsNatively } from '../../features/files/viewers/formats.js';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'tasks', label: 'Tasks', icon: ListChecks },
  { key: 'files', label: 'Files', icon: FolderOpen },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'notes', label: 'Notes', icon: NotebookPen },
];

function Quiet({ children }) {
  return <p className="text-muted px-5 py-6 text-sm">{children}</p>;
}

function Section({ title, count, children, action }) {
  return (
    <Card className="flex flex-col">
      <header className="border-line/70 flex items-center gap-2 border-b px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {count > 0 && (
          <span className="bg-subtle text-muted rounded-full px-1.5 text-[11px] font-medium tabular-nums">
            {count}
          </span>
        )}
        {action && <div className="ml-auto">{action}</div>}
      </header>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overview

function Detail({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-muted shrink-0 text-sm">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

function OverviewTab({ project }) {
  const { done, total } = project.tasks;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Section title="Brief">
        <div className="p-5">
          {project.description ? (
            <p className="whitespace-pre-line leading-relaxed">{project.description}</p>
          ) : (
            <p className="text-muted text-sm">No brief has been added yet.</p>
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
      <Section title="Details">
        <div className="px-5 py-2">
          <dl className="divide-line/60 divide-y">
            <Detail label="Status">
              <ProjectStatusBadge status={project.status} />
            </Detail>
            <Detail label="Client">{project.client?.name ?? 'Internal'}</Detail>
            <Detail label="Type">{projectTypeLabel(project.type)}</Detail>
            <Detail label="Priority">{priorityLabel(project.priority)}</Detail>
            <Detail label="Start">{project.startDate ? formatDate(project.startDate) : '—'}</Detail>
            <Detail label="Due">{project.dueDate ? formatDate(project.dueDate) : '—'}</Detail>
            <Detail label="Progress">
              {total === 0 ? 'No tasks yet' : `${taskPercent(project)}% · ${done} of ${total} done`}
            </Detail>
          </dl>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks

function AddTaskForm({ token }) {
  const [title, setTitle] = useState('');
  const save = useSaveSharedTask(token);

  function submit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    save.mutate({ title: title.trim() }, { onSuccess: () => setTitle('') });
  }

  return (
    <form onSubmit={submit} className="border-line/70 border-b px-5 py-3">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task…"
          aria-label="New task title"
          maxLength={300}
          className="border-line bg-surface focus:ring-accent/20 h-10 min-w-0 flex-1 rounded-full border px-4 text-sm outline-none focus:ring-4"
        />
        <Button type="submit" loading={save.isPending} disabled={!title.trim()}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </Button>
      </div>
      {save.error && (
        <Alert tone="error" className="mt-2">
          {save.error.message}
        </Alert>
      )}
    </form>
  );
}

function TaskRow({ task, token, canEdit }) {
  const save = useSaveSharedTask(token);
  const late = task.status !== 'done' && isOverdue(task.dueDate);

  function toggleItem(itemId) {
    save.mutate({
      id: task.id,
      checklist: task.checklist.map((item) => ({
        text: item.text,
        done: item.id === itemId ? !item.done : item.done,
      })),
    });
  }

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm font-medium',
              task.status === 'done' && 'text-muted line-through',
            )}
          >
            {task.title}
          </p>
          <p className="text-muted text-xs">
            {task.assignee?.name ?? 'Unassigned'} · {priorityLabel(task.priority)} ·{' '}
            <span className={cn(late && 'text-danger font-medium')}>
              {task.dueDate ? formatDueLabel(task.dueDate) : 'No date'}
            </span>
          </p>
        </div>
        {canEdit ? (
          <select
            value={task.status}
            disabled={save.isPending}
            aria-label={`Status of ${task.title}`}
            onChange={(event) => save.mutate({ id: task.id, status: event.target.value })}
            className="border-line bg-surface h-8 rounded-full border px-3 text-xs font-medium"
          >
            {TASK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="bg-subtle text-muted rounded-full px-2.5 py-0.5 text-xs">
            {TASK_STATUS_OPTIONS.find((option) => option.value === task.status)?.label}
          </span>
        )}
      </div>
      {task.description && (
        <p className="text-muted mt-1.5 whitespace-pre-line text-sm">{task.description}</p>
      )}
      {task.checklist.length > 0 && (
        <ul className="mt-2 space-y-1">
          {task.checklist.map((item) => (
            <li key={item.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={!canEdit || save.isPending}
                  onChange={() => toggleItem(item.id)}
                  className="accent-accent"
                />
                <span className={cn(item.done && 'text-muted line-through')}>{item.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {save.error && (
        <Alert tone="error" className="mt-2">
          {save.error.message}
        </Alert>
      )}
    </li>
  );
}

function TasksTab({ token, canEdit }) {
  const { data: tasks, isPending, error } = useSharedTasks(token);

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <AddTaskForm token={token} />
          <p className="text-muted px-5 py-2.5 text-xs">
            This link lets you add tasks and update their status and checklists.
          </p>
        </Card>
      )}
      {error && <Alert tone="error">{error.message}</Alert>}
      {isPending && <Skeleton className="h-40 w-full" />}
      {tasks && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {TASK_STATUS_OPTIONS.map((status) => {
            const column = tasks
              .filter((task) => task.status === status.value)
              .sort((a, b) => a.order - b.order);
            return (
              <Section key={status.value} title={status.label} count={column.length}>
                {column.length === 0 ? (
                  <Quiet>Nothing here.</Quiet>
                ) : (
                  <ul className="divide-line/60 divide-y">
                    {column.map((task) => (
                      <TaskRow key={task.id} task={task} token={token} canEdit={canEdit} />
                    ))}
                  </ul>
                )}
              </Section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Files

function FileRow({ file, token, previewUrl, onOpen }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const playable = file.mime.startsWith('video/') || file.mime.startsWith('audio/');

  async function download() {
    setError(null);
    setDownloading(true);
    try {
      await downloadSharedFile(token, file.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-2.5">
      {previewUrl && showsNatively(file) ? (
        <img
          src={previewUrl}
          alt=""
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
            fileTint(file.category),
          )}
        >
          <FileTypeIcon category={file.category} className="h-[18px] w-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {file.previewable ? (
          <button
            type="button"
            onClick={() => onOpen(file)}
            className="block max-w-full truncate text-left text-sm font-medium hover:underline"
          >
            {file.name}
          </button>
        ) : (
          <p className="truncate text-sm font-medium">{file.name}</p>
        )}
        <p className="text-muted truncate text-xs tabular-nums">
          {formatBytes(file.size)} · {file.uploadedBy?.name ?? 'Unknown'} ·{' '}
          {formatDate(file.createdAt)}
        </p>
        {error && <p className="text-danger text-xs">{error}</p>}
      </div>
      <div className="flex gap-1.5">
        {file.previewable && (
          <Button variant="ghost" size="sm" onClick={() => onOpen(file)}>
            {playable ? (
              <Play className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
            {playable ? 'Play' : 'View'}
          </Button>
        )}
        <Button variant="secondary" size="sm" loading={downloading} onClick={download}>
          <Download className="h-4 w-4" aria-hidden="true" /> Download
        </Button>
      </div>
    </li>
  );
}

// Folder path like "Exports / Final", so nested folders read clearly in one list.
function folderPaths(folders) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map();
  for (const folder of folders) {
    const names = [];
    let current = folder;
    while (current && names.length < 20) {
      names.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    paths.set(folder.id, names.join(' / '));
  }
  return paths;
}

function FilesTab({ token }) {
  const query = useSharedFiles(token);
  const pages = query.data?.pages ?? [];
  const folders = pages[0]?.folders ?? [];
  const files = pages.flatMap((page) => page.files);
  const imageIds = files
    .filter((file) => file.previewable && showsNatively(file))
    .slice(0, 100)
    .map((file) => file.id);
  const { data: previewUrls } = useSharedPreviewUrls(token, imageIds);
  const [openFile, setOpenFile] = useState(null);

  if (query.isPending) return <Skeleton className="h-40 w-full" />;
  if (query.error) return <Alert tone="error">{query.error.message}</Alert>;
  if (files.length === 0) {
    return (
      <EmptyState icon={FolderOpen} title="No files yet">
        Nothing has been uploaded to this project.
      </EmptyState>
    );
  }

  const paths = folderPaths(folders);
  const groups = new Map();
  for (const file of files) {
    const key = file.folderId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    (paths.get(a) ?? '').localeCompare(paths.get(b) ?? ''),
  );

  return (
    <div className="space-y-6">
      {ordered.map(([folderId, folderFiles]) => (
        <Section key={folderId} title={paths.get(folderId) ?? 'Files'} count={folderFiles.length}>
          <ul className="divide-line/60 divide-y">
            {folderFiles.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                token={token}
                previewUrl={previewUrls?.[file.id]}
                onOpen={setOpenFile}
              />
            ))}
          </ul>
        </Section>
      ))}
      {query.hasNextPage && (
        <Button
          variant="secondary"
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          Load more files
        </Button>
      )}
      <SharedPreviewDialog
        token={token}
        file={openFile}
        files={files.filter((file) => file.previewable)}
        onNavigate={setOpenFile}
        onClose={() => setOpenFile(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar

const PAST_DAYS = 30;
const AHEAD_DAYS = 180;

function CalendarTab({ token }) {
  const [range] = useState(() => {
    const today = startOfDay(new Date());
    return { from: addDays(today, -PAST_DAYS), to: addDays(today, AHEAD_DAYS) };
  });
  const { data: items, isPending, error } = useSharedCalendar(token, range);

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (items.length === 0) {
    return (
      <EmptyState icon={CalendarDays} title="Nothing scheduled">
        No events or deadlines from {PAST_DAYS} days ago to {AHEAD_DAYS} days ahead.
      </EmptyState>
    );
  }

  const days = new Map();
  for (const item of items) {
    const key = format(new Date(item.startsAt), 'yyyy-MM-dd');
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(item);
  }

  return (
    <Card>
      <ul className="divide-line/60 divide-y">
        {[...days.entries()].map(([key, dayItems]) => (
          <li key={key} className="flex gap-4 px-5 py-3">
            <span className="bg-subtle grid h-12 w-12 shrink-0 place-items-center rounded-xl text-center leading-none">
              <span className="text-muted block text-[10px] font-semibold uppercase">
                {format(new Date(dayItems[0].startsAt), 'MMM')}
              </span>
              <span className="block text-base font-semibold tabular-nums">
                {format(new Date(dayItems[0].startsAt), 'd')}
              </span>
            </span>
            <ul className="min-w-0 flex-1 space-y-2">
              {dayItems.map((item) => (
                <li key={item.id}>
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-muted truncate text-xs">
                    {itemLabel(item)}
                    {!item.allDay && ` · ${formatTime(item.startsAt)}`}
                    {item.location && ` · ${item.location}`}
                  </p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Notes

function NotesTab({ token }) {
  const { data: notes, isPending, error } = useSharedNotes(token);

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (notes.length === 0) {
    return (
      <EmptyState icon={NotebookPen} title="No shared notes">
        The team hasn&apos;t shared any notes on this project.
      </EmptyState>
    );
  }

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      {notes.map((note) => (
        <Card key={note.id} className="p-5">
          {note.title && <h3 className="mb-2 font-semibold">{note.title}</h3>}
          <NoteMarkdown text={note.body} />
          <p className="text-muted mt-3 text-xs">
            {note.author?.name ?? 'Someone'} · {formatDate(note.updatedAt)}
          </p>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SharedHeader({ workspaceName, viewer }) {
  return (
    <header className="border-line/70 bg-surface/80 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-6">
        <Link to="/" aria-label="FrameDesk home">
          <Logo />
        </Link>
        {workspaceName && (
          <span className="text-muted hidden truncate text-sm sm:inline">· {workspaceName}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle compact />
          {viewer ? (
            <Link to="/app" className="text-sm font-medium underline underline-offset-4">
              Open FrameDesk
            </Link>
          ) : (
            <Link to="/login" className="text-sm font-medium underline underline-offset-4">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function SharedProjectPage() {
  const { token } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isPending, error } = useSharedProject(token);
  const tab = TABS.some((item) => item.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'overview';

  if (isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error?.code === 'SIGN_IN_REQUIRED') {
    return (
      <FullPageMessage title="Sign in to view">
        <p>This project is shared with signed-in FrameDesk users only.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            to="/login"
            state={{ from: location.pathname }}
            className="pill-active inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium hover:opacity-90"
          >
            <Lock className="h-4 w-4" aria-hidden="true" /> Sign in
          </Link>
          <Link
            to="/signup"
            state={{ from: location.pathname }}
            className="border-line bg-surface text-ink hover:bg-subtle inline-flex h-10 items-center rounded-full border px-5 text-sm font-medium shadow-sm"
          >
            Create an account
          </Link>
        </div>
      </FullPageMessage>
    );
  }

  if (error) {
    return (
      <FullPageMessage title={error.status === 404 ? 'Link not available' : 'Something went wrong'}>
        {error.status === 404
          ? 'This share link does not exist, was reset, or sharing was turned off. Ask the person who sent it for a new one.'
          : error.message}
      </FullPageMessage>
    );
  }

  const { project, workspace, access } = data;
  const canEdit = access.permission === 'edit';
  const due = dueInfo(project);

  return (
    <div className="bg-bg min-h-screen">
      <SharedHeader workspaceName={workspace.name} viewer={access.viewer} />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <header className="mb-5">
          <p className="text-muted mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.1em]">
            <span className="inline-flex items-center gap-1">
              {canEdit ? (
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {canEdit ? 'Shared · can edit tasks' : 'Shared · view only'}
            </span>
          </p>
          <h1 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">
            {project.title}
          </h1>
          <p className="text-muted mt-2 flex flex-wrap items-center gap-2 text-sm">
            <ProjectStatusBadge status={project.status} />
            <span>{projectTypeLabel(project.type)}</span>
            {project.client && (
              <>
                <span aria-hidden="true">·</span>
                <span>{project.client.name}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{due.label}</span>
          </p>
        </header>

        <nav
          aria-label="Project sections"
          className="-mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-current={tab === item.key ? 'page' : undefined}
              onClick={() =>
                setSearchParams(item.key === 'overview' ? {} : { tab: item.key }, {
                  replace: true,
                })
              }
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-colors',
                tab === item.key
                  ? 'pill-active font-medium'
                  : 'border-line/70 bg-surface text-muted hover:text-ink border',
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
              {item.key === 'tasks' && project.tasks.total - project.tasks.done > 0 && (
                <span className="text-[11px] tabular-nums opacity-70">
                  {project.tasks.total - project.tasks.done}
                </span>
              )}
            </button>
          ))}
        </nav>

        {tab === 'overview' && <OverviewTab project={project} />}
        {tab === 'tasks' && <TasksTab token={token} canEdit={canEdit} />}
        {tab === 'files' && <FilesTab token={token} />}
        {tab === 'calendar' && <CalendarTab token={token} />}
        {tab === 'notes' && <NotesTab token={token} />}
      </main>
    </div>
  );
}
