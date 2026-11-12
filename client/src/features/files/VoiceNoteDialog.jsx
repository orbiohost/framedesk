import { Mic, Pause, Play, RotateCcw, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { cn } from '../../lib/cn.js';
import { LinkedProjectsField, parseTags, tagProblem } from './FileDialogs.jsx';
import { addUploads } from './uploadStore.js';

// A voice note is an ordinary audio file in the folder: it uploads (resumably)
// like any other file, plays in the preview and can be transcribed.

const MAX_SECONDS = 30 * 60;
const LEVEL_BARS = 36;
const LEVEL_TICK_MS = 80;

// Best first. Each maps to an extension the server files under "audio".
const FORMATS = [
  { mime: 'audio/webm;codecs=opus', extension: 'weba' },
  { mime: 'audio/webm', extension: 'weba' },
  { mime: 'audio/ogg;codecs=opus', extension: 'ogg' },
  { mime: 'audio/mp4', extension: 'm4a' },
];

function pickFormat() {
  return (
    FORMATS.find((format) => window.MediaRecorder?.isTypeSupported?.(format.mime)) ?? {
      mime: '',
      extension: 'weba',
    }
  );
}

// The format the browser actually used (it may ignore the one asked for).
function extensionFor(mime, fallback) {
  if (mime.startsWith('audio/mp4') || mime.startsWith('video/mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'weba';
  return fallback;
}

function clock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// "Voice note 2026-11-11 19-05": sortable, and free of characters file names refuse.
function defaultName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `Voice note ${date} ${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

export function canRecordVoice() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.MediaRecorder) &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

// Microphone → MediaRecorder, with a live level meter and pause/resume.
// state: idle | recording | paused | recorded
function useVoiceRecorder() {
  const [state, setState] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState(() => Array(LEVEL_BARS).fill(0));
  const [recording, setRecording] = useState(null); // { blob, url, extension }
  const [error, setError] = useState(null);
  const session = useRef(null);

  function releaseMicrophone() {
    const current = session.current;
    if (!current) return;
    clearInterval(current.timer);
    current.stream.getTracks().forEach((track) => track.stop());
    current.audioContext?.close().catch(() => {});
    session.current = null;
  }

  // Microphone off and the preview link freed when the dialog goes away.
  useEffect(
    () => () => {
      const current = session.current;
      if (current) {
        current.recorder.onstop = null;
        if (current.recorder.state !== 'inactive') current.recorder.stop();
      }
      releaseMicrophone();
    },
    [],
  );
  useEffect(() => () => recording && URL.revokeObjectURL(recording.url), [recording]);

  async function start() {
    setError(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError(
        window.isSecureContext
          ? 'Allow microphone access in your browser to record a voice note.'
          : 'Recording needs a secure (https) connection.',
      );
      return;
    }

    const format = pickFormat();
    const recorder = new MediaRecorder(stream, format.mime ? { mimeType: format.mime } : undefined);
    const chunks = [];
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onstop = () => {
      releaseMicrophone();
      const mime = recorder.mimeType || format.mime || 'audio/webm';
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      if (blob.size === 0) {
        setError('Nothing was recorded. Check that the right microphone is selected.');
        setState('idle');
        return;
      }
      setRecording({
        blob,
        url: URL.createObjectURL(blob),
        extension: extensionFor(mime, format.extension),
      });
      setState('recorded');
    };

    // The level meter is a nicety: recording still works without Web Audio.
    let analyser = null;
    let audioContext = null;
    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(stream).connect(analyser);
    } catch {
      analyser = null;
    }
    const samples = analyser ? new Uint8Array(analyser.fftSize) : null;

    let elapsedMs = 0;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const paused = recorder.state === 'paused';
      if (!paused) elapsedMs += now - last;
      last = now;
      const elapsed = Math.floor(elapsedMs / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS && recorder.state !== 'inactive') recorder.stop();
      if (analyser) {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        const level = paused ? 0 : Math.min(1, Math.sqrt(sum / samples.length) * 4);
        setLevels((previous) => [...previous.slice(1), level]);
      }
    }, LEVEL_TICK_MS);

    session.current = { recorder, stream, audioContext, timer };
    // Data every second, so a long note isn't one huge buffer at the end.
    recorder.start(1000);
    setSeconds(0);
    setLevels(Array(LEVEL_BARS).fill(0));
    setState('recording');
  }

  function pause() {
    session.current?.recorder.pause();
    setState('paused');
  }

  function resume() {
    session.current?.recorder.resume();
    setState('recording');
  }

  function stop() {
    const recorder = session.current?.recorder;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  function discard() {
    setRecording(null);
    setSeconds(0);
    setLevels(Array(LEVEL_BARS).fill(0));
    setState('idle');
  }

  return { state, seconds, levels, recording, error, start, pause, resume, stop, discard };
}

function LevelMeter({ levels, active }) {
  return (
    <div className="flex h-16 w-full items-center justify-center gap-[3px]" aria-hidden="true">
      {levels.map((level, index) => (
        <span
          key={index}
          className={cn(
            'w-1.5 rounded-full transition-[height] duration-75',
            active ? 'bg-danger' : 'bg-line',
          )}
          style={{ height: `${Math.max(8, level * 100)}%` }}
        />
      ))}
    </div>
  );
}

function RecorderPanel({ recorder }) {
  const { state, seconds, levels } = recorder;
  const live = state === 'recording' || state === 'paused';

  if (state === 'idle') {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <button
          type="button"
          onClick={recorder.start}
          className="bg-danger shadow-lift grid h-20 w-20 place-items-center rounded-full text-white transition-transform hover:scale-105 active:scale-95"
          aria-label="Start recording"
        >
          <Mic className="h-8 w-8" aria-hidden="true" />
        </button>
        <p className="text-sm font-medium">Tap to start recording</p>
        <p className="text-muted text-xs">Up to {MAX_SECONDS / 60} minutes. You can pause.</p>
      </div>
    );
  }

  if (live) {
    return (
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              state === 'recording' ? 'bg-danger animate-pulse' : 'bg-muted',
            )}
            aria-hidden="true"
          />
          <span className="font-display text-3xl tabular-nums">{clock(seconds)}</span>
          <span className="text-muted text-xs font-medium uppercase tracking-[0.12em]">
            {state === 'recording' ? 'Recording' : 'Paused'}
          </span>
        </div>
        <LevelMeter levels={levels} active={state === 'recording'} />
        <div className="flex items-center gap-3">
          {state === 'recording' ? (
            <Button variant="secondary" onClick={recorder.pause}>
              <Pause className="h-4 w-4" aria-hidden="true" /> Pause
            </Button>
          ) : (
            <Button variant="secondary" onClick={recorder.resume}>
              <Play className="h-4 w-4" aria-hidden="true" /> Resume
            </Button>
          )}
          <Button variant="danger" onClick={recorder.stop}>
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> Stop
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-line/80 bg-subtle/40 flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center">
      <audio src={recorder.recording.url} controls className="h-10 w-full min-w-0 flex-1" />
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="text-muted text-xs tabular-nums">{clock(seconds)}</span>
        <Button variant="ghost" size="sm" onClick={recorder.discard}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Record again
        </Button>
      </div>
    </div>
  );
}

// onCancel: asks before dropping a recording. onSaved: closes after the upload starts.
// onDirtyChange(bool): whether closing now would lose a recording.
function VoiceNoteForm({ workspaceId, projectId, folder, onCancel, onSaved, onDirtyChange }) {
  const recorder = useVoiceRecorder();
  const [name, setName] = useState(defaultName);
  const [tagText, setTagText] = useState('voice note');
  const [linkedProjectIds, setLinkedProjectIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const tags = parseTags(tagText);
  const tagError = tagProblem(tags);
  const recorded = recorder.state === 'recorded';
  const dirty = recorder.state !== 'idle' && !saving;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function save(event) {
    event.preventDefault();
    if (!recorded || tagError || !name.trim()) return;
    setSaving(true);
    setSaveError(null);
    const { blob, extension } = recorder.recording;
    const file = new File([blob], `${name.trim()}.${extension}`, { type: blob.type });
    try {
      await addUploads({
        workspaceId,
        projectId,
        folderId: folder.id,
        folderName: folder.name,
        files: [file],
        extraMetadata: {
          tags: tags.join(','),
          linkedProjectIds: linkedProjectIds.join(','),
        },
      });
      onDirtyChange(false);
      onSaved();
    } catch (error) {
      setSaveError(error.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {(recorder.error || saveError) && <Alert tone="error">{recorder.error || saveError}</Alert>}
      <RecorderPanel recorder={recorder} />
      <TextField
        id="voice-note-name"
        label="Name"
        value={name}
        maxLength={180}
        onChange={(event) => setName(event.target.value)}
      />
      <TextField
        id="voice-note-tags"
        label="Tags"
        placeholder="e.g. idea, client call, feedback"
        hint="Separate tags with commas."
        error={tagError}
        value={tagText}
        onChange={(event) => setTagText(event.target.value)}
      />
      <LinkedProjectsField
        workspaceId={workspaceId}
        ownProjectId={projectId}
        value={linkedProjectIds}
        onChange={setLinkedProjectIds}
        hint="The voice note also shows up in each linked project's Files tab."
      />
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={saving}
          disabled={!recorded || Boolean(tagError) || !name.trim()}
        >
          Save to {folder.name}
        </Button>
      </DialogActions>
    </form>
  );
}

export function VoiceNoteDialog({ open, workspaceId, projectId = null, folder, onClose }) {
  const dirty = useRef(false);
  const setDirty = useCallback((value) => {
    dirty.current = value;
  }, []);
  // Escape, the backdrop, the × and Cancel all ask before dropping a recording.
  const requestClose = useCallback(() => {
    if (dirty.current && !window.confirm('Discard this voice note? It has not been saved.')) {
      return;
    }
    dirty.current = false;
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      title="Record a voice note"
      description={folder ? `Saved as an audio file in ${folder.name}` : undefined}
    >
      {open && folder && (
        <VoiceNoteForm
          workspaceId={workspaceId}
          projectId={projectId}
          folder={folder}
          onCancel={requestClose}
          onSaved={onClose}
          onDirtyChange={setDirty}
        />
      )}
    </Dialog>
  );
}
