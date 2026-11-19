import {
  Check,
  Copy,
  Download,
  Eye,
  Languages,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { formatTime } from '../media/MediaPlayer.jsx';
import {
  isWorking,
  LANGUAGE_OPTIONS,
  languageName,
  transcriptExportUrl,
  useDeleteTranscript,
  useRequestTranscript,
  useTranscript,
  useWatchVideo,
} from './hooks.js';

// Styled for the dark file viewer it sits in.
const darkButton =
  'inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-medium ring-1 ring-white/10 transition-colors hover:bg-white/20 disabled:opacity-50';
const darkField =
  'h-9 w-full rounded-lg bg-white/10 px-3 text-sm text-white ring-1 ring-white/15 outline-none focus:ring-2 focus:ring-white/50';

function StartForm({ request, retry = false, onStarted }) {
  const [language, setLanguage] = useState('');
  const [translate, setTranslate] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        request.mutate(
          { language, task: translate ? 'translate' : 'transcribe' },
          { onSuccess: onStarted },
        );
      }}
    >
      <label className="block space-y-1 text-xs text-white/70">
        <span>Spoken language</span>
        <select
          className={darkField}
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="text-black">
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={translate}
          onChange={(event) => setTranslate(event.target.checked)}
          className="h-4 w-4 accent-white"
        />
        Translate to English
      </label>
      {request.error && <p className="text-sm text-red-300">{request.error.message}</p>}
      <button
        type="submit"
        disabled={request.isPending}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {request.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {retry ? 'Transcribe again' : 'Transcribe'}
      </button>
    </form>
  );
}

function Progress({ transcript }) {
  const percent = Math.round((transcript.progress ?? 0) * 100);
  const waiting = transcript.status === 'queued';
  return (
    <div className="space-y-2" role="status">
      <div className="flex items-center gap-2 text-sm text-white/80">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {waiting ? 'Waiting for other files to finish…' : `Transcribing… ${percent}%`}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-white/70 transition-[width] duration-700"
          style={{ width: `${waiting ? 0 : percent}%` }}
        />
      </div>
      <p className="text-xs text-white/50">
        You can close this. Lines appear here as they are written.
      </p>
    </div>
  );
}

// Which line is being spoken, read from the player a few times a second.
function useActiveSegment(segments, getMedia) {
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (segments.length === 0) return undefined;
    const timer = setInterval(() => {
      const time = getMedia()?.currentTime;
      if (time === undefined) return;
      const index = segments.findIndex((s) => time >= s.start && time < s.end);
      setActive((current) => (current === index ? current : index));
    }, 300);
    return () => clearInterval(timer);
  }, [segments, getMedia]);
  return active;
}

function SegmentList({ segments, getMedia }) {
  const [query, setQuery] = useState('');
  const active = useActiveSegment(segments, getMedia);
  const activeRef = useRef(null);
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      segments
        .map((segment, index) => ({ ...segment, index }))
        .filter((segment) => !needle || segment.text.toLowerCase().includes(needle)),
    [segments, needle],
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  function seek(time) {
    const media = getMedia();
    if (!media) return;
    media.currentTime = time;
    media.play?.().catch(() => {});
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {segments.length > 8 && (
        <label className="relative block">
          <span className="sr-only">Search the transcript</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the transcript"
            className={cn(darkField, 'pl-9')}
          />
        </label>
      )}
      <ol className="scrollbar-thin -mx-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
        {visible.map((segment) => (
          <li key={segment.index} ref={segment.index === active ? activeRef : undefined}>
            <button
              type="button"
              onClick={() => seek(segment.start)}
              className={cn(
                'flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm leading-6 transition-colors hover:bg-white/10',
                segment.index === active ? 'bg-white/15 text-white' : 'text-white/80',
              )}
            >
              <span className="shrink-0 pt-0.5 font-mono text-xs tabular-nums text-white/50">
                {formatTime(segment.start)}
              </span>
              <span>{segment.text}</span>
            </button>
          </li>
        ))}
        {needle && visible.length === 0 && (
          <li className="px-2 py-4 text-sm text-white/50">No line mentions “{query.trim()}”.</li>
        )}
      </ol>
    </div>
  );
}

function CopyButton({ segments }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={darkButton}
      onClick={async () => {
        await navigator.clipboard.writeText(segments.map((s) => s.text).join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy text'}
    </button>
  );
}

function Toolbar({ workspaceId, file, transcript, canEdit, onRetry }) {
  const remove = useDeleteTranscript(workspaceId, file.id);
  // Both reuse the text already there (the AI translates it), so the video
  // isn't run through speech-to-text again.
  const switchText = useRequestTranscript(workspaceId, file.id);
  const translated = transcript.task === 'translate';
  return (
    <div className="flex flex-wrap gap-2">
      <CopyButton segments={transcript.segments} />
      {['txt', 'srt', 'vtt'].map((format) => (
        <a
          key={format}
          className={darkButton}
          href={transcriptExportUrl(workspaceId, file.id, format)}
          download
          title={format === 'txt' ? 'Plain text' : `Subtitles (.${format})`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />.{format}
        </a>
      ))}
      {canEdit && (
        <>
          {(!translated || transcript.hasOriginal) && (
            <button
              type="button"
              className={darkButton}
              disabled={switchText.isPending}
              title={
                translated
                  ? 'Back to the original language'
                  : 'Translate these lines to English with AI'
              }
              onClick={() =>
                switchText.mutate({
                  language: transcript.language,
                  task: translated ? 'transcribe' : 'translate',
                })
              }
            >
              <Languages className="h-3.5 w-3.5" aria-hidden="true" />
              {translated ? 'Original' : 'Translate'}
            </button>
          )}
          <button type="button" className={darkButton} onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Redo
          </button>
          <button
            type="button"
            className={cn(darkButton, 'text-red-200')}
            disabled={remove.isPending}
            onClick={() => window.confirm('Delete this transcript?') && remove.mutate()}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
        </>
      )}
      {switchText.error && (
        <p className="w-full text-xs text-red-300">{switchText.error.message}</p>
      )}
    </div>
  );
}

function summary(transcript) {
  const parts = [];
  const spoken = languageName(transcript.detectedLanguage);
  if (spoken) parts.push(spoken);
  if (transcript.task === 'translate') parts.push('translated to English');
  if (transcript.requestedBy?.name) parts.push(`by ${transcript.requestedBy.name}`);
  return parts.join(' · ');
}

/**
 * Speech-to-text for one video or audio file, shown beside the player.
 * getMedia(): the <video>/<audio> element, for seeking and following along.
 */
// How the AI read this clip, and (for a video read only from its words) a way
// to have it watch the picture too.
function AiReadNote({ workspaceId, file, transcript, canEdit }) {
  const watch = useWatchVideo(workspaceId, file.id);
  if (transcript.aiWatching || watch.isSuccess) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-white/60">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        The AI is watching the video now…
      </p>
    );
  }
  if (transcript.aiReadFrom !== 'transcript') return null;
  return (
    <div className="space-y-2 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
      <p className="flex items-start gap-1.5 text-xs leading-5 text-white/70">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {file.category === 'video'
          ? 'The AI read this video from its transcript (fast, few credits). It has not watched the picture.'
          : 'The AI read this clip from its transcript.'}
      </p>
      {file.category === 'video' && canEdit && (
        <button
          type="button"
          className={darkButton}
          disabled={watch.isPending}
          onClick={() => watch.mutate()}
          title="For shots, people, products and on-screen text. Uses more credits."
        >
          {watch.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Watch the video too
        </button>
      )}
      {watch.error && <p className="text-xs text-red-300">{watch.error.message}</p>}
    </div>
  );
}

export function TranscriptPanel({ workspaceId, file, canEdit, getMedia, className }) {
  const { data: transcript, isPending, error } = useTranscript(workspaceId, file.id);
  const request = useRequestTranscript(workspaceId, file.id);
  const [redo, setRedo] = useState(false);

  let body;
  if (isPending) {
    body = <Loader2 className="mx-auto h-6 w-6 animate-spin text-white/60" aria-hidden="true" />;
  } else if (error) {
    body = <p className="text-sm text-red-300">{error.message}</p>;
  } else if (!transcript || redo) {
    body = canEdit ? (
      <div className="space-y-3">
        <p className="text-sm text-white/70">
          Turn the speech in this {file.category} into searchable text with timestamps.
        </p>
        <StartForm request={request} retry={Boolean(transcript)} onStarted={() => setRedo(false)} />
        {redo && (
          <button type="button" className={darkButton} onClick={() => setRedo(false)}>
            Cancel
          </button>
        )}
      </div>
    ) : (
      <p className="text-sm text-white/60">No transcript yet.</p>
    );
  } else {
    const failed = transcript.status === 'failed';
    body = (
      <>
        {isWorking(transcript) && <Progress transcript={transcript} />}
        {failed && (
          <div className="space-y-3">
            <p className="text-sm text-red-300">Transcription failed: {transcript.error}</p>
            {canEdit && <StartForm request={request} retry />}
          </div>
        )}
        {transcript.status === 'done' && (
          <>
            <p className="text-xs text-white/50">{summary(transcript)}</p>
            <Toolbar
              workspaceId={workspaceId}
              file={file}
              transcript={transcript}
              canEdit={canEdit}
              onRetry={() => setRedo(true)}
            />
            <AiReadNote
              workspaceId={workspaceId}
              file={file}
              transcript={transcript}
              canEdit={canEdit}
            />
          </>
        )}
        {transcript.segments.length > 0 && (
          <SegmentList segments={transcript.segments} getMedia={getMedia} />
        )}
        {transcript.status === 'done' && transcript.segments.length === 0 && (
          <p className="text-sm text-white/60">No speech was found in this file.</p>
        )}
      </>
    );
  }

  return (
    <aside
      aria-label="Transcript"
      className={cn(
        'flex min-h-0 flex-col gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur',
        className,
      )}
    >
      <h3 className="text-sm font-semibold">Transcript</h3>
      {body}
    </aside>
  );
}
