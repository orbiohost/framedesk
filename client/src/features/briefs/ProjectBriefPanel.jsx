import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  ListChecks,
  Loader2,
  NotebookPen,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import { AiMessageText } from '../ai/AiMessageText.jsx';
import { BriefTranscripts } from './BriefTranscripts.jsx';
import { FileTypeIcon } from '../files/FileTypeIcon.jsx';
import {
  BUSY_STATUSES,
  useBriefTasks,
  useProjectBrief,
  useRegenerateBrief,
  useSaveBriefAsNote,
} from './hooks.js';

const COLLAPSED_KEY = 'briefs:collapsed';

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// One line on what the AI is doing with the folder right now.
function statusOf(brief) {
  const { progress } = brief;
  if (!brief.aiEnabled) return { text: 'The AI assistant is switched off', tone: 'muted' };
  switch (brief.status) {
    case 'empty':
      return { text: 'Waiting for your first notes', tone: 'muted' };
    case 'waiting':
    case 'queued':
    case 'generating':
      if (progress.stage === 'transcribing') {
        const clips = brief.clips?.transcribing ?? 0;
        return {
          text: `Transcribing ${clips ? plural(clips, 'clip') : 'clips'}…`,
          tone: 'busy',
        };
      }
      if (progress.stage === 'reading' || (!progress.stage && brief.status === 'waiting')) {
        return {
          text: `Analysing ${progress.reading ? plural(progress.reading, 'file') : 'files'}…`,
          tone: 'busy',
        };
      }
      if (progress.stage === 'writing' || brief.status === 'generating') {
        return { text: 'Writing the brief…', tone: 'busy' };
      }
      return { text: 'New material — updating in a moment…', tone: 'busy' };
    case 'failed':
      return { text: brief.error || 'The brief could not be written', tone: 'danger' };
    case 'no_credits':
      return { text: 'Out of AI credits — it updates once credits are back', tone: 'danger' };
    default:
      return {
        text: brief.generatedAt
          ? `Updated ${formatDistanceToNow(new Date(brief.generatedAt), { addSuffix: true })} · from ${plural(progress.total, 'file')}`
          : 'Ready',
        tone: 'muted',
      };
  }
}

function timeLeft(seconds) {
  if (!seconds) return '';
  if (seconds < 60) return 'under a minute left';
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} min left`;
}

// The server's percentage, shown so it never goes backwards within one update
// and keeps creeping forward between polls at the rate the server expects.
function useSmoothPercent(progress, busy) {
  const target = busy && typeof progress.percent === 'number' ? progress.percent : null;
  const run = progress.startedAt ?? null;
  // The highest value shown so far in this update ({ run, value }).
  const [ahead, setAhead] = useState({ run: null, value: 0 });

  useEffect(() => {
    if (target === null || !progress.etaSeconds) return undefined;
    const perSecond = (100 - target) / progress.etaSeconds;
    const timer = setInterval(() => {
      setAhead((current) => {
        const base = current.run === run ? Math.max(current.value, target) : target;
        // At most a few points ahead of what the server last said.
        const next = Math.max(base, Math.min(99, target + 5, base + perSecond));
        return { run, value: next };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [target, run, progress.etaSeconds]);

  if (target === null) return null;
  return Math.floor(ahead.run === run ? Math.max(ahead.value, target) : target);
}

function ProgressBar({ percent, etaSeconds }) {
  return (
    <div className="mt-3">
      <div
        role="progressbar"
        aria-label="Brief progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="bg-accent/15 h-1.5 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-accent h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
      {etaSeconds > 0 && <p className="text-muted mt-1 text-[11px]">{timeLeft(etaSeconds)}</p>}
    </div>
  );
}

function StatusLine({ brief, percent }) {
  const status = statusOf(brief);
  return (
    <p
      className={cn(
        'flex min-w-0 items-center gap-1.5 text-xs',
        status.tone === 'danger' ? 'text-danger' : 'text-muted',
      )}
      aria-live="polite"
    >
      {status.tone === 'busy' && (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
      )}
      {status.tone === 'danger' && (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{status.text}</span>
      {status.tone === 'busy' && percent !== null && (
        <span className="text-ink shrink-0 font-semibold tabular-nums">{percent}%</span>
      )}
    </p>
  );
}

// Small buttons that open the files a point came from.
function Sources({ fileIds, filesById, onOpenFile }) {
  const files = (fileIds ?? []).map((id) => filesById.get(id)).filter(Boolean);
  if (files.length === 0) return null;
  return (
    <span className="ml-1 inline-flex translate-y-[2px] flex-wrap gap-1 align-baseline">
      {files.slice(0, 4).map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => onOpenFile(file)}
          title={`Open ${file.name}`}
          aria-label={`Open ${file.name}`}
          className="border-line bg-surface text-muted hover:text-ink grid h-5 w-5 place-items-center rounded-full border"
        >
          <FileTypeIcon category={file.category} className="h-3 w-3" />
        </button>
      ))}
    </span>
  );
}

function Block({ icon: Icon, title, count, action, children }) {
  return (
    <div className="border-line/70 bg-surface/80 rounded-2xl border p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <Icon className="text-accent h-4 w-4" aria-hidden="true" />
        <h4 className="text-sm font-semibold">{title}</h4>
        {count > 0 && (
          <span className="bg-subtle text-muted rounded-full px-1.5 text-[11px] font-medium tabular-nums">
            {count}
          </span>
        )}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </div>
  );
}

function PointList({ points, filesById, onOpenFile, empty }) {
  if (points.length === 0) return <p className="text-muted text-sm">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm leading-6">
      {points.map((point, index) => (
        <li key={index} className="flex gap-2">
          <span
            className="bg-accent/60 mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full"
            aria-hidden="true"
          />
          <span className="min-w-0">
            {point.text}
            <Sources fileIds={point.fileIds} filesById={filesById} onOpenFile={onOpenFile} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function ActionItems({ workspaceId, projectId, items, filesById, onOpenFile, canEdit }) {
  const [picked, setPicked] = useState(() => new Set());
  const tasks = useBriefTasks(workspaceId, projectId);
  const open = items.filter((item) => !item.taskCreated);
  const chosen = open.filter((item) => picked.has(item.id));

  function toggle(id) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addTasks() {
    const ids = chosen.length > 0 ? chosen.map((item) => item.id) : undefined;
    tasks.mutate(ids, { onSuccess: () => setPicked(new Set()) });
  }

  return (
    <Block
      icon={ListChecks}
      title="Action items"
      count={items.length}
      action={
        canEdit &&
        open.length > 0 && (
          <Button variant="secondary" size="sm" loading={tasks.isPending} onClick={addTasks}>
            {chosen.length > 0 ? `Add ${chosen.length} to tasks` : 'Add all to tasks'}
          </Button>
        )
      }
    >
      {items.length === 0 ? (
        <p className="text-muted text-sm">No to-dos found in the notes.</p>
      ) : (
        <ul className="space-y-1.5 text-sm leading-6">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5">
              {canEdit && !item.taskCreated ? (
                <input
                  type="checkbox"
                  checked={picked.has(item.id)}
                  onChange={() => toggle(item.id)}
                  aria-label={`Choose "${item.text}"`}
                  className="accent-accent mt-1.5 h-4 w-4 shrink-0"
                />
              ) : (
                <Check
                  className={cn(
                    'mt-1.5 h-4 w-4 shrink-0',
                    item.taskCreated ? 'text-success' : 'text-muted',
                  )}
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1">
                {item.text}
                {(item.owner || item.due) && (
                  <span className="text-muted">
                    {' '}
                    — {[item.owner, item.due && `due ${item.due}`].filter(Boolean).join(', ')}
                  </span>
                )}
                <Sources fileIds={item.fileIds} filesById={filesById} onOpenFile={onOpenFile} />
                {item.taskCreated && (
                  <Badge tone="success" className="ml-1.5">
                    Task added
                  </Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tasks.error && (
        <Alert tone="error" className="mt-3">
          {tasks.error.message}
        </Alert>
      )}
      {tasks.isSuccess && (
        <p className="text-success mt-2 text-xs">
          {plural(tasks.data.length, 'task')} added to this project.
        </p>
      )}
    </Block>
  );
}

function Meetings({ meetings, filesById, onOpenFile }) {
  if (meetings.length === 0) {
    return <p className="text-muted text-sm">No separate meetings could be told apart.</p>;
  }
  return (
    <ol className="space-y-3">
      {meetings.map((meeting, index) => (
        <li key={index} className="border-line/70 bg-surface/80 rounded-2xl border p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h4 className="text-sm font-semibold">{meeting.title}</h4>
            {meeting.date && (
              <span className="text-muted inline-flex items-center gap-1 text-xs">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {meeting.date}
              </span>
            )}
            <Sources fileIds={meeting.fileIds} filesById={filesById} onOpenFile={onOpenFile} />
          </div>
          {meeting.attendees.length > 0 && (
            <p className="text-muted mt-1 flex items-center gap-1 text-xs">
              <Users className="h-3.5 w-3.5" aria-hidden="true" /> {meeting.attendees.join(', ')}
            </p>
          )}
          <p className="mt-2 text-sm leading-6">{meeting.summary}</p>
          {meeting.decisions.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm leading-6">
              {meeting.decisions.map((decision, i) => (
                <li key={i} className="flex gap-2">
                  <Check className="text-success mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                  {decision}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function Intro() {
  return (
    <div className="text-muted space-y-2 text-sm leading-6">
      <p>
        Put everything from your meetings here — photos or scans of{' '}
        <strong className="text-ink">handwritten notes</strong> and whiteboards,{' '}
        <strong className="text-ink">voice notes</strong>, call recordings, PDFs and reference
        documents.
      </p>
      <p>
        The AI reads each one as it arrives (it transcribes handwriting and speech), then writes a
        clear brief for the whole project: decisions, action items, open questions and proper
        meeting notes. It updates itself whenever you add more.
      </p>
    </div>
  );
}

/**
 * The AI brief, shown at the top of a project's "Notes & Briefs" folder.
 * onOpenFile(file): open a source file ({ id, name, category, folderId }).
 */
export function ProjectBriefPanel({ workspaceId, projectId, canEdit, onOpenFile }) {
  const { data: brief, isPending, isError, error } = useProjectBrief(workspaceId, projectId);
  const regenerate = useRegenerateBrief(workspaceId, projectId);
  const saveNote = useSaveBriefAsNote(workspaceId, projectId);
  const [tab, setTab] = useState('summary');
  const [collapsed, setCollapsed] = useState(() => readLocal(COLLAPSED_KEY) === '1');
  const working = Boolean(brief?.aiEnabled && BUSY_STATUSES.includes(brief?.status));
  const percent = useSmoothPercent(brief?.progress ?? {}, working);

  function toggleCollapsed() {
    setCollapsed((current) => {
      writeLocal(COLLAPSED_KEY, current ? '0' : '1');
      return !current;
    });
  }

  if (isPending) return <Skeleton className="mb-5 h-28 w-full rounded-2xl" />;
  if (isError) {
    return (
      <Alert tone="error" className="mb-5">
        {error.message}
      </Alert>
    );
  }

  const filesById = new Map(brief.files.map((file) => [file.id, file]));
  const hasBrief = Boolean(brief.generatedAt && (brief.overview || brief.notes));
  const busy = BUSY_STATUSES.includes(brief.status);
  const meetingCount = brief.meetings.length;
  const clipCount = brief.clips?.total ?? 0;

  return (
    <section
      aria-label="AI brief"
      className="border-accent/25 from-lavender/50 to-surface/60 mb-5 rounded-3xl border bg-gradient-to-br p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="bg-accent text-accent-ink grid h-9 w-9 shrink-0 place-items-center rounded-xl">
          <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight">AI brief</h3>
          <StatusLine brief={brief} percent={percent} />
        </div>
        <div className="flex items-center gap-1.5">
          {hasBrief && !collapsed && (
            <Button
              variant="secondary"
              size="sm"
              loading={saveNote.isPending}
              disabled={saveNote.isSuccess}
              onClick={() => saveNote.mutate()}
              title="Save the brief as a shared note linked to this project"
            >
              <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">
                {saveNote.isSuccess ? 'Saved to notes' : 'Save to notes'}
              </span>
            </Button>
          )}
          {canEdit && brief.aiEnabled && brief.progress.total > 0 && (
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              loading={regenerate.isPending}
              onClick={() => regenerate.mutate()}
              aria-label="Write the brief again"
              title="Write the brief again"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {hasBrief && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Show the brief' : 'Hide the brief'}
            >
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', collapsed && '-rotate-90')}
                aria-hidden="true"
              />
            </Button>
          )}
        </div>
      </header>

      {percent !== null && <ProgressBar percent={percent} etaSeconds={brief.progress.etaSeconds} />}

      {regenerate.error && (
        <Alert tone="error" className="mt-3">
          {regenerate.error.message}
        </Alert>
      )}
      {saveNote.error && (
        <Alert tone="error" className="mt-3">
          {saveNote.error.message}
        </Alert>
      )}

      {!hasBrief && (
        <div className="mt-4">
          {brief.progress.total === 0 ? (
            <Intro />
          ) : (
            <p className="text-muted text-sm leading-6">
              {busy
                ? `The AI is going through ${plural(brief.progress.total, 'file')}. The brief appears here in a minute or two — no need to stay on this page.`
                : 'No brief yet.'}
            </p>
          )}
          {brief.clips?.total > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-semibold">Transcripts</h4>
              <BriefTranscripts
                workspaceId={workspaceId}
                projectId={projectId}
                canEdit={canEdit}
                onOpenFile={onOpenFile}
              />
            </div>
          )}
        </div>
      )}

      {hasBrief && !collapsed && (
        <div className="mt-4 space-y-4">
          <div>
            {brief.title && <p className="font-display text-xl leading-snug">{brief.title}</p>}
            <p className="mt-1.5 text-sm leading-6">{brief.overview}</p>
          </div>

          <SegmentedControl
            label="Brief view"
            value={tab}
            onChange={setTab}
            className="max-w-full overflow-x-auto"
            options={[
              { value: 'summary', label: 'Summary' },
              {
                value: 'meetings',
                label: meetingCount ? `Meetings (${meetingCount})` : 'Meetings',
              },
              { value: 'notes', label: 'Full notes' },
              ...(clipCount ? [{ value: 'transcripts', label: `Transcripts (${clipCount})` }] : []),
            ]}
          />

          {tab === 'summary' && (
            <div className="grid gap-3 lg:grid-cols-2">
              <Block icon={Check} title="Decisions" count={brief.decisions.length}>
                <PointList
                  points={brief.decisions}
                  filesById={filesById}
                  onOpenFile={onOpenFile}
                  empty="Nothing decided yet."
                />
              </Block>
              <ActionItems
                key={brief.generatedAt}
                workspaceId={workspaceId}
                projectId={projectId}
                items={brief.actionItems}
                filesById={filesById}
                onOpenFile={onOpenFile}
                canEdit={canEdit}
              />
              <Block icon={Sparkles} title="Key points" count={brief.keyPoints.length}>
                <PointList
                  points={brief.keyPoints}
                  filesById={filesById}
                  onOpenFile={onOpenFile}
                  empty="No key points found."
                />
              </Block>
              <Block icon={CircleHelp} title="Open questions" count={brief.openQuestions.length}>
                <PointList
                  points={brief.openQuestions}
                  filesById={filesById}
                  onOpenFile={onOpenFile}
                  empty="Nothing left open."
                />
              </Block>
            </div>
          )}

          {tab === 'meetings' && (
            <Meetings meetings={brief.meetings} filesById={filesById} onOpenFile={onOpenFile} />
          )}

          {tab === 'transcripts' && clipCount > 0 && (
            <BriefTranscripts
              workspaceId={workspaceId}
              projectId={projectId}
              canEdit={canEdit}
              onOpenFile={onOpenFile}
            />
          )}

          {tab === 'notes' && (
            <div className="border-line/70 bg-surface/80 rounded-2xl border p-4 sm:p-5">
              <AiMessageText text={brief.notes} files={filesById} onOpenFile={onOpenFile} />
            </div>
          )}

          {!brief.upToDate && !busy && (
            <p className="text-muted text-xs">
              Files changed since this was written. It updates on its own shortly
              {canEdit ? ', or use the refresh button.' : '.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
