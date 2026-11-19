import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileAudio,
  Loader2,
  Mic,
  Pencil,
  Play,
  Search,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { featureKey } from '../../lib/workspaceKeys.js';
import { FileTypeIcon } from '../files/FileTypeIcon.jsx';
import { fetchFileUrl } from '../files/hooks.js';
import { formatTime } from '../media/MediaPlayer.jsx';
import { readLocal, writeLocal } from '../../lib/storage.js';
import {
  languageName,
  transcriptExportUrl,
  useEditTranscriptSegments,
  useRerunTranscript,
} from '../transcripts/hooks.js';
import {
  TRANSLITERATE_CODES,
  TRANSLITERATE_OPTIONS,
  TransliterateTextarea,
} from '../transcripts/TransliterateTextarea.jsx';
import { useBriefTranscripts } from './hooks.js';

function minutesLabel(seconds) {
  if (!seconds) return null;
  return formatTime(seconds);
}

// Where a clip's transcript stands, in words.
function StateNote({ clip, workspaceId, enabled }) {
  const { transcript, autoTranscribe } = clip;
  if (transcript?.status === 'queued') {
    return <Note icon={Loader2} spin text="Waiting in the transcription queue…" />;
  }
  if (transcript?.status === 'processing') {
    const percent = Math.round((transcript.progress ?? 0) * 100);
    return (
      <div className="space-y-1.5">
        <Note icon={Loader2} spin text={`Transcribing on our speech-to-text… ${percent}%`} />
        <div className="bg-accent/15 h-1 overflow-hidden rounded-full">
          <div
            className="bg-accent h-full rounded-full transition-[width] duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }
  if (transcript?.status === 'failed') {
    return (
      <Note
        icon={AlertTriangle}
        tone="danger"
        text={transcript.error || 'This clip could not be transcribed'}
      />
    );
  }
  if (!enabled) return <Note icon={Mic} text="Speech-to-text is not set up on this server." />;
  if (autoTranscribe === 'too_long') {
    return (
      <Note
        icon={Mic}
        text={
          <>
            Longer than the auto-transcribe limit, so it was not transcribed by itself.{' '}
            <Link to={`/w/${workspaceId}/account`} className="text-accent hover:underline">
              Change the limit
            </Link>
          </>
        }
      />
    );
  }
  if (autoTranscribe === 'off') {
    return <Note icon={Mic} text="Auto-transcribe is turned off for the person who added it." />;
  }
  return <Note icon={Loader2} spin text="Getting it ready for transcription…" />;
}

function Note({ icon: Icon, text, tone, spin = false }) {
  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-xs leading-5',
        tone === 'danger' ? 'text-danger' : 'text-muted',
      )}
    >
      <Icon
        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', spin && 'animate-spin')}
        aria-hidden="true"
      />
      <span>{text}</span>
    </p>
  );
}

function highlight(text, query) {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-accent/25 text-ink rounded px-0.5">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

const TYPING_KEY = 'transcripts:typeIn';

// Which script suggestions to offer: the last one picked, else the clip's language.
function initialTypingLanguage(spoken) {
  const saved = readLocal(TYPING_KEY);
  if (saved !== null && TRANSLITERATE_CODES.has(saved)) return saved;
  return TRANSLITERATE_CODES.has(spoken) ? spoken : '';
}

// One transcript line being corrected by hand.
function SegmentEditor({ workspaceId, segment, spoken, saving, error, onSave, onCancel }) {
  const [text, setText] = useState(segment.text.trim());
  const [typeIn, setTypeIn] = useState(() => initialTypingLanguage(spoken));
  const changed = text.trim() && text.trim() !== segment.text.trim();

  return (
    <div className="min-w-0 flex-1 space-y-2 py-1">
      <TransliterateTextarea
        workspaceId={workspaceId}
        language={typeIn}
        value={text}
        onChange={setText}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (changed) onSave(text.trim());
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        rows={2}
        autoFocus
        aria-label="Line text"
        className="border-line bg-surface focus:ring-accent/40 w-full resize-y rounded-xl border px-3 py-2 text-sm leading-6 outline-none focus:ring-2"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted flex items-center gap-1.5 text-xs">
          Type in
          <select
            value={typeIn}
            onChange={(event) => {
              setTypeIn(event.target.value);
              writeLocal(TYPING_KEY, event.target.value);
            }}
            className="border-line bg-surface h-7 rounded-lg border px-1.5 text-xs"
          >
            {TRANSLITERATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={saving}
            disabled={!changed}
            onClick={() => onSave(text.trim())}
          >
            Save
          </Button>
        </div>
      </div>
      {typeIn && (
        <p className="text-muted text-[11px]">
          Type in English letters (e.g. &quot;aapka&quot;) and pick the word from the list.
        </p>
      )}
      {error && <Alert tone="error">{error.message}</Alert>}
    </div>
  );
}

function ClipCard({ clip, workspaceId, projectId, enabled, canEdit, query, onOpenFile }) {
  const { file, transcript } = clip;
  const queryClient = useQueryClient();
  const rerun = useRerunTranscript(workspaceId);
  const media = useRef(null);
  const [url, setUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState(null);
  const [copied, setCopied] = useState(false);
  const isVideo = file.category === 'video';
  const segments = transcript?.segments ?? [];
  const numbered = segments.map((segment, index) => ({ ...segment, index }));
  const shown = query
    ? numbered.filter((segment) => segment.text.toLowerCase().includes(query))
    : numbered;
  const busy = ['queued', 'processing'].includes(transcript?.status);
  const [editing, setEditing] = useState(null);
  const edit = useEditTranscriptSegments(workspaceId, file.id);
  const editable = canEdit && transcript?.status === 'done';

  function saveLine(index, text) {
    edit.mutate([{ index, text }], {
      onSuccess: () => {
        setEditing(null);
        queryClient.invalidateQueries({
          queryKey: featureKey(workspaceId, 'briefs', projectId, 'transcripts'),
        });
      },
    });
  }
  const canStart = enabled && canEdit && !busy && transcript?.status !== 'done';

  // Seconds to jump to once a just-loaded clip knows its length.
  const pendingSeek = useRef(null);

  async function play(at) {
    const element = media.current;
    if (url && element) {
      if (typeof at === 'number') element.currentTime = at;
      element.play().catch(() => {});
      return;
    }
    pendingSeek.current = typeof at === 'number' ? at : null;
    setLoadingUrl(true);
    setUrlError(null);
    try {
      // The player mounts with this link and starts by itself (autoPlay).
      setUrl(await fetchFileUrl(workspaceId, file.id, 'inline'));
    } catch (error) {
      setUrlError(error.message);
    } finally {
      setLoadingUrl(false);
    }
  }

  function seekOnLoad(event) {
    if (pendingSeek.current === null) return;
    event.currentTarget.currentTime = pendingSeek.current;
    pendingSeek.current = null;
  }

  async function copy() {
    await navigator.clipboard.writeText(segments.map((segment) => segment.text.trim()).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function transcribe() {
    rerun.mutate(
      { fileId: file.id, task: 'transcribe' },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            queryKey: featureKey(workspaceId, 'briefs', projectId),
          }),
      },
    );
  }

  if (query && shown.length === 0) return null;

  return (
    <li className="border-line/70 bg-surface/80 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="bg-subtle grid h-8 w-8 shrink-0 place-items-center rounded-lg">
          <FileTypeIcon category={file.category} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={file.name}>
            {file.name}
          </p>
          <p className="text-muted flex flex-wrap gap-x-2 text-xs">
            {minutesLabel(clip.durationSec) && <span>{minutesLabel(clip.durationSec)}</span>}
            {transcript?.language && <span>{languageName(transcript.language)}</span>}
            {transcript?.status === 'done' && <span>{segments.length} lines</span>}
            {file.uploadedBy && <span>by {file.uploadedBy.name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {transcript?.status === 'done' && (
            <Badge tone="success">
              {transcript.editedAt
                ? 'Edited'
                : transcript.auto
                  ? 'Auto-transcribed'
                  : 'Transcribed'}
            </Badge>
          )}
          {!url && (
            <Button
              variant="secondary"
              size="sm"
              loading={loadingUrl}
              onClick={() => play()}
              aria-label={`Play ${file.name}`}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Play</span>
            </Button>
          )}
          {segments.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={copy}
                aria-label="Copy transcript"
                title="Copy transcript"
              >
                {copied ? (
                  <Check className="text-success h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
              <a
                href={transcriptExportUrl(workspaceId, file.id, 'txt')}
                className="text-muted hover:bg-subtle hover:text-ink grid h-8 w-8 place-items-center rounded-full"
                aria-label="Download transcript"
                title="Download transcript (.txt)"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </a>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenFile(file)}
            aria-label={`Open ${file.name}`}
            title="Open in the viewer"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {url &&
        (isVideo ? (
          <video
            ref={media}
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            onLoadedMetadata={seekOnLoad}
            className="mt-3 max-h-72 w-full rounded-xl bg-black"
          />
        ) : (
          <audio
            ref={media}
            src={url}
            controls
            autoPlay
            preload="metadata"
            onLoadedMetadata={seekOnLoad}
            className="mt-3 w-full"
          />
        ))}
      {urlError && (
        <Alert tone="error" className="mt-3">
          {urlError}
        </Alert>
      )}

      {transcript?.status !== 'done' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <StateNote clip={clip} workspaceId={workspaceId} enabled={enabled} />
          {canStart && clip.autoTranscribe && (
            <Button variant="secondary" size="sm" loading={rerun.isPending} onClick={transcribe}>
              <Mic className="h-3.5 w-3.5" aria-hidden="true" />
              {transcript?.status === 'failed' ? 'Try again' : 'Transcribe'}
            </Button>
          )}
        </div>
      )}
      {rerun.error && (
        <Alert tone="error" className="mt-2">
          {rerun.error.message}
        </Alert>
      )}

      {shown.length > 0 && (
        <ol className="border-line/60 mt-3 max-h-80 space-y-0.5 overflow-y-auto border-t pt-2 text-sm leading-6">
          {shown.map((segment) => (
            <li key={segment.index} className="group flex gap-2.5">
              <button
                type="button"
                onClick={() => play(segment.start)}
                className="text-accent shrink-0 font-mono text-xs tabular-nums leading-6 hover:underline"
                title="Play from here"
              >
                {formatTime(segment.start)}
              </button>
              {editing === segment.index ? (
                <SegmentEditor
                  workspaceId={workspaceId}
                  segment={segment}
                  spoken={transcript.language}
                  saving={edit.isPending}
                  error={edit.error}
                  onSave={(text) => saveLine(segment.index, text)}
                  onCancel={() => {
                    setEditing(null);
                    edit.reset();
                  }}
                />
              ) : (
                <>
                  <span className="min-w-0 flex-1">{highlight(segment.text.trim(), query)}</span>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => {
                        edit.reset();
                        setEditing(segment.index);
                      }}
                      aria-label={`Edit the line at ${formatTime(segment.start)}`}
                      title="Fix this line"
                      className="text-muted hover:text-ink hover:bg-subtle grid h-6 w-6 shrink-0 place-items-center rounded-md opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/**
 * The brief's Transcripts tab: every audio and video clip in the Notes &
 * Briefs folder with its transcript (local speech-to-text) and a player, on
 * one page. Clicking a timestamp plays the clip from there.
 */
export function BriefTranscripts({ workspaceId, projectId, canEdit, onOpenFile }) {
  const { data, isPending, isError, error } = useBriefTranscripts(workspaceId, projectId);
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const clips = useMemo(() => data?.clips ?? [], [data]);

  if (isPending) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (isError) return <Alert tone="error">{error.message}</Alert>;
  if (clips.length === 0) {
    return (
      <p className="text-muted flex items-center gap-2 text-sm">
        <FileAudio className="h-4 w-4" aria-hidden="true" />
        Add voice notes or meeting recordings to this folder — they are transcribed by themselves.
      </p>
    );
  }

  const matches = query
    ? clips.reduce(
        (count, clip) =>
          count +
          (clip.transcript?.segments ?? []).filter((segment) =>
            segment.text.toLowerCase().includes(query),
          ).length,
        0,
      )
    : null;

  return (
    <div className="space-y-3">
      <label className="border-line bg-surface/80 focus-within:ring-accent/40 flex h-9 items-center gap-2 rounded-xl border px-3 focus-within:ring-2">
        <Search className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search all transcripts"
          aria-label="Search all transcripts"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {matches !== null && (
          <span className="text-muted shrink-0 text-xs tabular-nums">
            {matches} {matches === 1 ? 'match' : 'matches'}
          </span>
        )}
      </label>
      <ul className="space-y-3">
        {clips.map((clip) => (
          <ClipCard
            key={clip.file.id}
            clip={clip}
            workspaceId={workspaceId}
            projectId={projectId}
            enabled={data.enabled}
            canEdit={canEdit}
            query={query}
            onOpenFile={onOpenFile}
          />
        ))}
      </ul>
    </div>
  );
}
