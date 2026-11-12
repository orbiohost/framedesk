import { Loader2, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { dictate, useTranscriptionEnabled } from './hooks.js';

// Long enough for a thought, short enough to come back quickly from a CPU server.
const MAX_SECONDS = 120;
const MIME_CHOICES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function recorderMime() {
  return MIME_CHOICES.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) ?? '';
}

/**
 * Record → stop → text. onText(text) receives what was said; onError(message)
 * reports a problem. Renders nothing when the server has no speech-to-text or
 * the browser can't record.
 */
export function DictateButton({
  workspaceId,
  onText,
  onError,
  variant = 'pill', // pill: labelled, for widgets · icon: compact, for form fields
  label: idleLabel = 'Dictate a note',
  className,
}) {
  const enabled = useTranscriptionEnabled(workspaceId);
  const [state, setState] = useState('idle'); // idle | recording | working
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef(null);

  // Stop the microphone if the widget goes away mid-recording.
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  useEffect(() => {
    if (state !== 'recording') return undefined;
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) recorder.current?.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [state]);

  if (!enabled || typeof window === 'undefined' || !window.MediaRecorder) return null;

  async function start() {
    onError?.(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError?.('Allow microphone access in your browser to dictate.');
      return;
    }
    const mimeType = recorderMime();
    const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    media.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    media.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      setState('working');
      try {
        const blob = new Blob(chunks, { type: media.mimeType || 'audio/webm' });
        const { text } = await dictate(workspaceId, blob);
        if (text) onText(text);
        else onError?.('No speech was heard in that recording.');
      } catch (error) {
        onError?.(error.message);
      } finally {
        setState('idle');
      }
    };
    recorder.current = media;
    media.start();
    setSeconds(0);
    setState('recording');
  }

  const recording = state === 'recording';
  const working = state === 'working';
  let label = idleLabel;
  if (recording) label = 'Stop and turn into text';
  if (working) label = 'Turning speech into text…';
  const compact = variant === 'icon';

  return (
    <button
      type="button"
      // Keeps focus (and the cursor) in the field being dictated into.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => (recording ? recorder.current?.stop() : start())}
      disabled={working}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-xs font-semibold transition-colors disabled:opacity-70',
        compact
          ? cn(
              'text-muted hover:bg-subtle hover:text-ink h-8 min-w-8',
              (recording || working) && 'px-2.5',
            )
          : 'bg-surface/60 hover:bg-surface/80 h-9 px-3 backdrop-blur',
        recording && 'bg-danger hover:bg-danger/90 text-white hover:text-white',
        className,
      )}
    >
      {working && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {recording && <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
      {state === 'idle' && <Mic className="h-4 w-4" aria-hidden="true" />}
      {recording && <span className="tabular-nums">{clock(seconds)}</span>}
      {working && <span>Writing…</span>}
    </button>
  );
}
