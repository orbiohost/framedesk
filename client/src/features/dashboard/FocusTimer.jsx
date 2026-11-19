import { Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { readLocal, writeLocal } from '../../lib/storage.js';

const PRESETS = [15, 25, 50];
const STORAGE_KEY = 'focusTimer';

// { durationSec, endsAt (ms, while running) | null, remainingSec (while paused) }
function loadState() {
  try {
    const saved = JSON.parse(readLocal(STORAGE_KEY));
    if (saved && typeof saved.durationSec === 'number') return saved;
  } catch {
    // Ignore a corrupt entry and start fresh.
  }
  return { durationSec: 25 * 60, endsAt: null, remainingSec: 25 * 60 };
}

function remainingOf(state, now) {
  if (state.endsAt) return Math.max(0, Math.round((state.endsAt - now) / 1000));
  return state.remainingSec;
}

function clock(totalSec) {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function chime() {
  try {
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.8);
    tone.connect(gain).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.8);
  } catch {
    // No audio available; the on-screen message is enough.
  }
}

// A focus countdown that survives reloads (kept in this browser only).
export function FocusTimer({ className }) {
  const [state, setState] = useState(loadState);
  const [now, setNow] = useState(() => Date.now());
  const running = Boolean(state.endsAt);
  const remaining = remainingOf(state, now);
  const { endsAt } = state;

  useEffect(() => {
    writeLocal(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!endsAt) return undefined;
    const tick = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at < endsAt) return;
      clearInterval(tick);
      // Only chime when it ends while the page is open, not on a later reload.
      if (at - endsAt < 5000) chime();
      setState((current) => ({ ...current, endsAt: null, remainingSec: 0 }));
    }, 250);
    return () => clearInterval(tick);
  }, [endsAt]);

  function toggle() {
    const at = Date.now();
    setNow(at);
    if (running) {
      setState({ ...state, endsAt: null, remainingSec: remainingOf(state, at) });
    } else {
      const start = state.remainingSec > 0 ? state.remainingSec : state.durationSec;
      setState({ ...state, endsAt: at + start * 1000, remainingSec: start });
    }
  }

  function choose(minutes) {
    const durationSec = minutes * 60;
    setState({ durationSec, endsAt: null, remainingSec: durationSec });
  }

  const reset = () => choose(state.durationSec / 60);
  const progress = 1 - remaining / state.durationSec;

  return (
    <section
      className={cn(
        'widget-lavender shadow-soft relative flex min-h-40 shrink-0 flex-col overflow-hidden rounded-[28px] p-5',
        className,
      )}
    >
      <header className="flex items-center gap-3">
        <span className="bg-surface/60 grid h-10 w-10 place-items-center rounded-full backdrop-blur">
          <Timer className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="font-display flex-1 text-xl">Timer</h2>
        <div className="flex gap-1" role="group" aria-label="Timer length">
          {PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => choose(minutes)}
              aria-pressed={state.durationSec === minutes * 60}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                state.durationSec === minutes * 60
                  ? 'pill-active'
                  : 'bg-surface/50 hover:bg-surface/80',
              )}
            >
              {minutes}m
            </button>
          ))}
        </div>
      </header>

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div>
          <p
            className="font-display text-5xl tabular-nums leading-none"
            role="timer"
            aria-live="off"
          >
            {clock(remaining)}
          </p>
          <p className="text-ink/60 mt-1.5 text-xs">
            {remaining === 0 ? 'Done. Take a break.' : running ? 'Focusing…' : 'Paused'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={reset}
            aria-label="Reset timer"
            title="Reset timer"
            className="bg-surface/50 hover:bg-surface/80 grid h-10 w-10 place-items-center rounded-full"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={running ? 'Pause timer' : 'Start timer'}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-b from-orange-400 to-red-500 text-white shadow-lg shadow-red-500/30 transition-transform active:scale-95"
          >
            {running ? (
              <Pause className="h-5 w-5" fill="currentColor" aria-hidden="true" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="bg-surface/40 absolute inset-x-0 bottom-0 h-1" aria-hidden="true">
        <div
          className="bg-ink/70 h-full transition-[width] duration-300"
          style={{ width: `${Math.min(progress, 1) * 100}%` }}
        />
      </div>
    </section>
  );
}
