import {
  BellRing,
  Check,
  Database,
  Info,
  Mic,
  Send,
  ShieldCheck,
  Smartphone,
  Volume2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { cn } from '../../lib/cn.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import { startRinging, unlockAlertAudio } from '../alerts/alertSound.js';
import {
  useEnableThisDevice,
  useNotifications,
  useSendTestNotification,
} from '../notifications/hooks.js';
import { pushSupport } from '../notifications/pushDevice.js';
import { openInstall } from './InstallApp.jsx';
import { isRunningInstalled } from './installState.js';

// "Set up this device": the permissions the app uses, each with what it is
// for, asked one tap at a time (browsers only show a prompt after a tap, and
// iPhones only offer notifications to Home Screen apps). Opens by itself the
// first time the installed app starts, and from Account → Notifications.

const OPEN_EVENT = 'framedesk:permissions';
const DONE_KEY = 'permissions:setupDone';
const SNOOZE_KEY = 'permissions:snoozedUntil';
const SHOW_AFTER_MS = 2500;
const SNOOZE_DAYS = 7;

export function openPermissions() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

async function permissionState(name) {
  try {
    const status = await navigator.permissions?.query({ name });
    return status?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const STATUS = {
  granted: { label: 'Allowed', className: 'bg-success/10 text-success border-success/30' },
  denied: { label: 'Blocked', className: 'bg-danger/10 text-danger border-danger/30' },
  prompt: { label: 'Not asked yet', className: 'border-line text-muted' },
  unknown: { label: 'Not asked yet', className: 'border-line text-muted' },
  unsupported: { label: 'Not available here', className: 'border-line text-muted' },
  install: { label: 'Install first', className: 'border-line text-muted' },
};

function StatusChip({ state }) {
  const status = STATUS[state] ?? STATUS.unknown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        status.className,
      )}
    >
      {state === 'granted' && <Check className="h-3 w-3" aria-hidden="true" />}
      {status.label}
    </span>
  );
}

// How to undo a "Block", per platform.
function unblockSteps(kind) {
  const os = platform();
  const what = kind === 'mic' ? 'Microphone' : 'Notifications';
  if (os === 'ios') {
    return `iPhone Settings → Notifications (or Privacy → ${what}) → FrameDesk → allow. Then come back here.`;
  }
  if (os === 'android') {
    return `Long-press the FrameDesk icon → App info → Permissions (or Notifications) → ${what} → Allow.`;
  }
  return `Click the icon left of the address bar (or the app window's ⋯ menu → App info) → ${what} → Allow, then reload.`;
}

function PermissionRow({ icon: Icon, title, why, state, action, extra }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        <span className="bg-subtle grid h-9 w-9 shrink-0 place-items-center rounded-xl">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold">{title}</p>
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-expanded={open}
              aria-label={`What ${title} is used for`}
              title={why}
              className="text-muted hover:text-ink grid h-5 w-5 place-items-center rounded-full"
            >
              <Info className="h-4 w-4" aria-hidden="true" />
            </button>
            <StatusChip state={state} />
          </div>
          {open && <p className="text-muted mt-1.5 text-[13px] leading-5">{why}</p>}
          {extra}
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    </li>
  );
}

function PermissionsBody({ onDone }) {
  const { data: overview } = useNotifications();
  const enable = useEnableThisDevice();
  const test = useSendTestNotification();
  const [push, setPush] = useState(pushSupport);
  const [mic, setMic] = useState('unknown');
  const [storage, setStorage] = useState('unknown');
  const [sound, setSound] = useState('unknown');
  const [micError, setMicError] = useState(null);
  const os = platform();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [micState, persisted] = await Promise.all([
        permissionState('microphone'),
        navigator.storage?.persisted?.().catch(() => false),
      ]);
      if (cancelled) return;
      setMic(micState);
      setStorage(navigator.storage?.persist ? (persisted ? 'granted' : 'prompt') : 'unsupported');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pushState =
    push === 'needs-install'
      ? 'install'
      : push === 'ready'
        ? 'prompt'
        : push === 'granted'
          ? 'granted'
          : push;

  async function allowMic() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMic('granted');
    } catch (err) {
      setMic(err?.name === 'NotAllowedError' ? 'denied' : 'unknown');
      setMicError(err?.name === 'NotAllowedError' ? unblockSteps('mic') : err.message);
    }
  }

  async function allowStorage() {
    const granted = await navigator.storage.persist().catch(() => false);
    setStorage(granted ? 'granted' : 'denied');
  }

  function testSound() {
    unlockAlertAudio();
    startRinging({ sound: 'chime', volume: 0.8, seconds: 2, vibrate: true });
    setSound('granted');
  }

  const notificationsWhy =
    'Project alerts ring this device when a teammate needs you on a project — even when the app is closed. Also deadline and calendar reminders. Tapping one opens the project.';

  return (
    <div className="space-y-4">
      <p className="text-muted text-sm leading-6">
        FrameDesk asks only for what these features need. Tap{' '}
        <Info className="inline h-3.5 w-3.5" aria-label="info" /> to see what each one is for. You
        can change any of them later in Account → Notifications.
      </p>

      <ul className="divide-line divide-y">
        <PermissionRow
          icon={BellRing}
          title="Notifications"
          why={notificationsWhy}
          state={overview?.pushAvailable === false ? 'unsupported' : pushState}
          action={
            pushState === 'install' ? (
              <Button size="sm" variant="secondary" onClick={openInstall}>
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                How to install
              </Button>
            ) : pushState === 'prompt' && overview?.publicKey ? (
              <Button
                size="sm"
                loading={enable.isPending}
                onClick={() =>
                  enable.mutate(overview.publicKey, {
                    onSettled: () => setPush(pushSupport()),
                  })
                }
              >
                Allow
              </Button>
            ) : pushState === 'granted' ? (
              <Button
                size="sm"
                variant="secondary"
                loading={test.isPending}
                onClick={() => test.mutate({ delaySeconds: 10, kind: 'alert' })}
                title="Sends a test alert in 10 seconds — close the app to see it arrive"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Test
              </Button>
            ) : null
          }
          extra={
            <>
              {pushState === 'install' && (
                <p className="text-muted mt-1 text-xs">
                  On iPhone and iPad, only apps added to the Home Screen can get notifications (iOS
                  16.4 or later).
                </p>
              )}
              {pushState === 'denied' && (
                <p className="text-danger mt-1 text-xs">{unblockSteps('push')}</p>
              )}
              {enable.error && <p className="text-danger mt-1 text-xs">{enable.error.message}</p>}
              {test.isSuccess && (
                <p className="text-success mt-1 text-xs">
                  A test alert arrives in 10 seconds. Close the app now to check it reaches you
                  while closed.
                </p>
              )}
              {test.error && <p className="text-danger mt-1 text-xs">{test.error.message}</p>}
            </>
          }
        />
        <PermissionRow
          icon={Mic}
          title="Microphone"
          why="Voice notes, dictating into notes and text boxes, and recording meetings for transcripts. Only used while you hold or press a record button — never in the background."
          state={navigator.mediaDevices?.getUserMedia ? mic : 'unsupported'}
          action={
            navigator.mediaDevices?.getUserMedia && mic !== 'granted' ? (
              <Button size="sm" variant="secondary" onClick={allowMic}>
                Allow
              </Button>
            ) : null
          }
          extra={micError && <p className="text-danger mt-1 text-xs">{micError}</p>}
        />
        <PermissionRow
          icon={Volume2}
          title="Alert sound & vibration"
          why="When the app is open, project alerts ring with a sound and vibrate. Phones only allow sound after a tap, so tap Test once."
          state={sound}
          action={
            <Button size="sm" variant="secondary" onClick={testSound}>
              Test
            </Button>
          }
        />
        <PermissionRow
          icon={Database}
          title="Keep offline data"
          why="Lets the device keep videos you watched, the spell-check dictionary and app files, so they open fast and don't download again. The browser may otherwise clear them when space is low."
          state={storage}
          action={
            storage === 'prompt' ? (
              <Button size="sm" variant="secondary" onClick={allowStorage}>
                Allow
              </Button>
            ) : null
          }
        />
      </ul>

      <div className="border-line bg-subtle/50 space-y-1.5 rounded-xl border p-3 text-[13px] leading-5">
        <p className="flex items-center gap-1.5 font-semibold">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Getting alerts while the app is closed
        </p>
        {os === 'android' && (
          <p className="text-muted">
            Alerts arrive and buzz even when FrameDesk is closed. If they come late, open phone
            Settings → Apps → FrameDesk (and Chrome) → Battery → <strong>Unrestricted</strong>.
          </p>
        )}
        {os === 'ios' && (
          <p className="text-muted">
            Alerts arrive on the lock screen when the app is closed. Check that Focus / Do Not
            Disturb allows FrameDesk, and open it from the Home Screen icon.
          </p>
        )}
        {os === 'desktop' && (
          <p className="text-muted">
            Alerts arrive even when no FrameDesk window is open, as long as the browser runs. In
            Chrome or Edge, turn on Settings → System →{' '}
            <strong>Continue running background apps when closed</strong>, and allow the browser in
            Windows/macOS notification settings.
          </p>
        )}
        <p className="text-muted">
          Phones and computers never let a website start itself: an alert shows on screen and opens
          the project when tapped.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

/** Mounted once in the app layout. */
export function DevicePermissions() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    writeLocal(DONE_KEY, '1');
    writeLocal(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 3600 * 1000));
    setOpen(false);
  }, []);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    // The installed app, the first time (and again a week later while
    // notifications were never answered).
    let timer;
    if (isRunningInstalled()) {
      const snoozed = Number(readLocal(SNOOZE_KEY) ?? 0) > Date.now();
      const unanswered = ['ready', 'needs-install'].includes(pushSupport());
      if ((readLocal(DONE_KEY) !== '1' || unanswered) && !snoozed) {
        timer = setTimeout(show, SHOW_AFTER_MS);
      }
    }
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      clearTimeout(timer);
    };
  }, []);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Set up this device"
      description="Permissions FrameDesk uses, and what each one is for."
    >
      {open && <PermissionsBody onDone={close} />}
      <button type="button" onClick={close} className="sr-only">
        <X aria-hidden="true" /> Close
      </button>
    </Dialog>
  );
}
