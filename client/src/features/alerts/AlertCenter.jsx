import { BellRing, FolderKanban, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { useActiveAlerts, useRespondToAlert } from './hooks.js';
import { startRinging, unlockAlertAudio } from './alertSound.js';

function timeAgo(date) {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

// A push arrived while the app is open: check for the new alert at once.
function useAlertPushWakeUp(refetch) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type === 'project-alert') refetch();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [refetch]);
}

// The alarm itself, outside React: effects start and stop it (an external
// system), and the popup reads whether it is playing.
const ringer = {
  state: { on: false, blocked: false },
  handle: null,
  timer: null,
  listeners: new Set(),
  set(state) {
    this.state = state;
    for (const listener of this.listeners) listener();
  },
  start(settings) {
    this.stop();
    const handle = startRinging({
      sound: settings.sound,
      volume: settings.volume,
      seconds: settings.ringSeconds,
      vibrate: settings.vibrate,
    });
    this.handle = handle;
    this.set({ on: true, blocked: !handle.playing });
    this.timer = setTimeout(() => {
      if (this.handle === handle) this.set({ on: false, blocked: false });
    }, settings.ringSeconds * 1000);
  },
  stop() {
    clearTimeout(this.timer);
    this.handle?.stop();
    this.handle = null;
    if (this.state.on) this.set({ on: false, blocked: false });
  },
};
const subscribeRinger = (listener) => {
  ringer.listeners.add(listener);
  return () => ringer.listeners.delete(listener);
};
const ringerState = () => ringer.state;

// `${alertId}:${sends}` already rung on this device, so a poll doesn't re-ring.
const rung = new Set();

// Rings and shows a popup when a teammate alerts you about a project. It
// rings again with every repeat the server sends (every few minutes) until
// you open the project or dismiss it. Mounted once, in the app layout.
export function AlertCenter() {
  const { data, refetch } = useActiveAlerts();
  useAlertPushWakeUp(refetch);
  const respond = useRespondToAlert();
  const navigate = useNavigate();
  const sound = useSyncExternalStore(subscribeRinger, ringerState);
  // Hidden until its next repeat ("Later").
  const [hidden, setHidden] = useState(() => new Set());

  const settings = data?.settings;
  const alerts = (data?.alerts ?? []).filter(
    (alert) => !hidden.has(`${alert.id}:${alert.sends}`),
  );
  const current = alerts[0] ?? null;

  // Sound needs one tap on the page first; take the first one.
  useEffect(() => {
    const unlock = () => unlockAlertAudio();
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, []);

  // A new alert, or a repeat of one: ring (unless quiet hours or turned off).
  const allKeys = (data?.alerts ?? []).map((alert) => `${alert.id}:${alert.sends}`).join(',');
  const shouldRing = Boolean(settings?.enabled && !data?.quiet);
  useEffect(() => {
    if (!allKeys || !settings) return;
    const fresh = allKeys.split(',').filter((key) => !rung.has(key));
    for (const key of fresh) rung.add(key);
    if (!fresh.length || !shouldRing) return;
    // The sender may have set how long this alert rings.
    const first = data.alerts.find((alert) => fresh.includes(`${alert.id}:${alert.sends}`));
    ringer.start({ ...settings, ringSeconds: first?.ringSeconds ?? settings.ringSeconds });
  }, [allKeys, settings, shouldRing, data]);

  // Nothing left to answer: quiet.
  const anyLeft = Boolean(current);
  useEffect(() => {
    if (!anyLeft) ringer.stop();
  }, [anyLeft]);

  useEffect(() => () => ringer.stop(), []);

  const stopSound = () => ringer.stop();
  const ring = () =>
    settings &&
    ringer.start({ ...settings, ringSeconds: current?.ringSeconds ?? settings.ringSeconds });

  if (!current) return null;

  function open() {
    stopSound();
    respond.mutate({ alertId: current.id, action: 'opened' });
    navigate(`/w/${current.workspaceId}/projects/${current.projectId}`);
  }

  function dismiss() {
    stopSound();
    respond.mutate({ alertId: current.id, action: 'dismissed' });
  }

  function later() {
    stopSound();
    setHidden((set) => new Set(set).add(`${current.id}:${current.sends}`));
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] grid animate-[fade-in_150ms_ease-out] place-items-center bg-black/50 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="project-alert-title"
    >
      <div className="bg-surface w-full max-w-sm animate-[ai-rise_220ms_ease-out_both] rounded-3xl p-6 text-center shadow-2xl">
        <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center">
          {sound.on && (
            <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/40" />
          )}
          <span className="relative grid h-16 w-16 place-items-center rounded-full bg-amber-400 text-amber-950">
            <BellRing className={sound.on ? 'h-7 w-7 animate-bounce' : 'h-7 w-7'} aria-hidden="true" />
          </span>
        </div>
        <p className="text-muted text-xs font-medium uppercase tracking-wide">
          Project alert · {timeAgo(current.createdAt)}
          {current.sends > 1 && ` · reminder ${current.sends - 1}`}
        </p>
        <h2 id="project-alert-title" className="mt-1 text-lg font-semibold">
          {current.sender || 'A teammate'} needs you
        </h2>
        <p className="bg-subtle mx-auto mt-3 inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium">
          <FolderKanban className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{current.projectTitle}</span>
        </p>
        {current.message && (
          <p className="text-ink/80 mt-3 whitespace-pre-wrap break-words text-sm">
            “{current.message}”
          </p>
        )}
        {sound.blocked && (
          <button
            type="button"
            onClick={() => {
              unlockAlertAudio();
              ring();
            }}
            className="text-accent mt-3 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
          >
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Tap to play the alert sound
          </button>
        )}
        <div className="mt-5 space-y-2">
          <Button className="w-full" onClick={open}>
            Open project
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={later}>
              Later
            </Button>
            <Button variant="secondary" className="flex-1" onClick={dismiss}>
              Dismiss
            </Button>
          </div>
          {sound.on && (
            <button
              type="button"
              onClick={stopSound}
              className="text-muted hover:text-ink inline-flex items-center gap-1.5 pt-1 text-xs"
            >
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" /> Silence
            </button>
          )}
        </div>
        {alerts.length > 1 && (
          <p className="text-muted mt-3 text-xs">
            {alerts.length - 1} more {alerts.length === 2 ? 'alert' : 'alerts'} waiting
          </p>
        )}
        <p className="text-muted mt-3 text-[11px]">
          “Later” hides it until the next reminder. Opening the project stops it.
        </p>
      </div>
    </div>,
    document.body,
  );
}
