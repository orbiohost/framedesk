import {
  Compass,
  Download,
  EllipsisVertical,
  ExternalLink,
  MonitorDown,
  Share,
  Smartphone,
  SquarePlus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { cn } from '../../lib/cn.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import {
  detectPlatform,
  isMobilePlatform,
  promptInstall,
  useInstallState,
} from './installState.js';

const OPEN_EVENT = 'framedesk:install';
const SNOOZE_KEY = 'install:snoozedUntil';
const SHOW_AFTER_MS = 8000;
const SNOOZE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const APK_URL = '/downloads/framedesk.apk';

// Anywhere in the app (e.g. the account menu): offer the install now.
export function openInstall() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function Key({ icon: Icon, children }) {
  return (
    <span className="border-line bg-subtle text-ink mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-md border px-1.5 py-0.5 align-middle text-xs font-semibold">
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}

// Steps for browsers that can't show an install dialog themselves (or when
// the viewer closed it once and the browser won't offer it again yet).
function stepsFor(platform) {
  switch (platform) {
    case 'ios-safari':
      return {
        title: 'Add to your Home Screen',
        steps: [
          <>
            Tap <Key icon={Share}>Share</Key> in Safari&apos;s toolbar (bottom of the screen on
            iPhone, top on iPad).
          </>,
          <>
            Scroll down and tap <Key icon={SquarePlus}>Add to Home Screen</Key>.
          </>,
          <>
            Tap <Key>Add</Key>. FrameDesk opens from its icon, full screen, like an app.
          </>,
        ],
      };
    case 'ios-other':
      return {
        title: 'Add to your Home Screen',
        steps: [
          <>
            Tap <Key icon={Share}>Share</Key> next to the address bar (in Chrome it&apos;s at the
            top right).
          </>,
          <>
            Tap <Key icon={SquarePlus}>Add to Home Screen</Key>, then <Key>Add</Key>.
          </>,
          <>Don&apos;t see it? Open this page in Safari and do the same there.</>,
        ],
      };
    case 'ios-inapp':
    case 'android-inapp':
      return {
        title: 'Open in your browser first',
        steps: [
          <>
            Apps like Instagram or Gmail open links in their own viewer, which can&apos;t install
            apps.
          </>,
          <>
            Tap <Key icon={EllipsisVertical}>menu</Key> and choose{' '}
            <Key icon={ExternalLink}>Open in {platform === 'ios-inapp' ? 'Safari' : 'Chrome'}</Key>.
          </>,
          <>Then open FrameDesk&apos;s menu and tap “Install app” again.</>,
        ],
      };
    case 'android-chrome':
      return {
        title: 'Install on your phone',
        steps: [
          <>
            Tap <Key icon={EllipsisVertical}>menu</Key> at the top right of Chrome.
          </>,
          <>
            Tap <Key icon={Smartphone}>Install app</Key> (or{' '}
            <Key icon={SquarePlus}>Add to Home screen</Key>).
          </>,
          <>
            Tap <Key>Install</Key>. FrameDesk appears with your other apps.
          </>,
        ],
      };
    case 'android-samsung':
      return {
        title: 'Install on your phone',
        steps: [
          <>
            Tap <Key icon={EllipsisVertical}>menu</Key> (☰) at the bottom.
          </>,
          <>
            Tap <Key icon={SquarePlus}>Add page to</Key>, then <Key>Home screen</Key>.
          </>,
        ],
      };
    case 'android-firefox':
      return {
        title: 'Install on your phone',
        steps: [
          <>
            Tap <Key icon={EllipsisVertical}>menu</Key>.
          </>,
          <>
            Tap <Key icon={Smartphone}>Install</Key> or{' '}
            <Key icon={SquarePlus}>Add to Home screen</Key>.
          </>,
        ],
      };
    case 'desktop-chrome':
    case 'desktop-edge':
      return {
        title: 'Install on this computer',
        steps: [
          <>
            Click the <Key icon={MonitorDown}>Install</Key> icon at the right end of the address
            bar.
          </>,
          <>
            No icon? Open the browser menu <Key icon={EllipsisVertical} />
            {platform === 'desktop-edge' ? (
              <>
                , then <Key>Apps</Key> › <Key>Install FrameDesk</Key>.
              </>
            ) : (
              <>
                , then <Key>Cast, save and share</Key> › <Key>Install page as app</Key>.
              </>
            )}
          </>,
          <>FrameDesk opens in its own window, with a shortcut on your desktop and taskbar.</>,
        ],
      };
    case 'mac-safari':
      return {
        title: 'Add to your Dock',
        steps: [
          <>
            In the menu bar, choose <Key>File</Key> › <Key>Add to Dock…</Key> (or click{' '}
            <Key icon={Share}>Share</Key> › <Key>Add to Dock</Key>).
          </>,
          <>
            Click <Key>Add</Key>. FrameDesk opens from the Dock in its own window.
          </>,
        ],
      };
    case 'desktop-firefox':
      return {
        title: 'Keep FrameDesk one click away',
        steps: [
          <>Firefox on computers can&apos;t install web apps.</>,
          <>
            Press <Key>Ctrl/⌘ + D</Key> to bookmark this page, or right-click the tab ›{' '}
            <Key>Pin Tab</Key>.
          </>,
          <>
            For a real app window with a desktop shortcut, open FrameDesk in Chrome or Edge and
            install it there.
          </>,
        ],
      };
    default:
      return {
        title: 'Add FrameDesk to your device',
        steps: [
          <>
            Open your browser&apos;s menu and look for <Key>Install app</Key> or{' '}
            <Key>Add to Home screen</Key>.
          </>,
          <>Or bookmark this page to get back quickly.</>,
        ],
      };
  }
}

function InstallSteps({ platform }) {
  const { steps } = stepsFor(platform);
  const isAndroid = platform.startsWith('android');
  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-3 text-sm leading-relaxed">
            <span className="bg-accent text-accent-ink grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              {index + 1}
            </span>
            <span className="min-w-0 pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {isAndroid && (
        <a
          href={APK_URL}
          download
          className="border-line hover:bg-subtle flex items-center gap-3 rounded-2xl border p-3 text-sm transition-colors"
        >
          <span className="bg-subtle grid h-9 w-9 shrink-0 place-items-center rounded-xl">
            <Download className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium">Or get the Android app</span>
            <span className="text-muted block text-xs">
              Download the APK and open it to install.
            </span>
          </span>
        </a>
      )}
    </div>
  );
}

function isSnoozed() {
  const until = Number(readLocal(SNOOZE_KEY));
  return Number.isFinite(until) && until > Date.now();
}

/**
 * The install offer: a small card a few seconds into a visit (not when
 * already installed, nor for two weeks after "Not now"), and the steps
 * dialog, also opened from the account menu via openInstall().
 */
export function InstallApp() {
  const { canPrompt, installed } = useInstallState();
  const [platform] = useState(detectPlatform);
  const [cardOpen, setCardOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const mobile = isMobilePlatform(platform);
  // Browsers that can install but haven't offered a dialog (or that can't
  // install at all, like desktop Firefox) only get the card on phones, where
  // a home-screen icon matters most; the menu entry is always there.
  const worthOffering = canPrompt || mobile || platform === 'mac-safari';

  useEffect(() => {
    if (installed || !worthOffering || isSnoozed()) return undefined;
    const timer = window.setTimeout(() => setCardOpen(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [installed, worthOffering]);

  const install = useCallback(async () => {
    setCardOpen(false);
    const outcome = await promptInstall();
    if (outcome === 'unavailable') setHelpOpen(true);
    else if (outcome === 'dismissed') snooze();
  }, []);

  useEffect(() => {
    const onOpen = () => install();
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [install]);

  function snooze() {
    writeLocal(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * DAY_MS));
    setCardOpen(false);
  }

  const DeviceIcon = mobile ? Smartphone : MonitorDown;
  const help = stepsFor(platform);

  return (
    <>
      {cardOpen && !installed && (
        <div
          role="dialog"
          aria-label="Install FrameDesk"
          className={cn(
            'border-line/70 bg-surface text-ink shadow-lift fixed z-40 animate-[install-in_280ms_cubic-bezier(0.2,0.8,0.2,1)] rounded-3xl border p-4',
            // Phones: above the bottom tab bar. Larger: bottom-right corner.
            'inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[22rem]',
          )}
        >
          <button
            type="button"
            onClick={snooze}
            aria-label="Not now"
            className="text-muted hover:bg-subtle hover:text-ink absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <img
              src="/icons/icon-192.png"
              alt=""
              className="h-12 w-12 shrink-0 rounded-2xl shadow-md"
            />
            <div className="min-w-0">
              <p className="font-semibold leading-tight">
                {mobile ? 'Get the FrameDesk app' : 'Install FrameDesk'}
              </p>
              <p className="text-muted mt-1 text-sm leading-snug">
                {mobile
                  ? 'Open it from your home screen, full screen, with no address bar.'
                  : 'Its own window and a desktop shortcut, one click away.'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={snooze}>
              Not now
            </Button>
            <Button variant="accent" size="sm" onClick={install}>
              {canPrompt ? (
                <>
                  <DeviceIcon className="h-4 w-4" aria-hidden="true" /> Install
                </>
              ) : platform === 'ios-safari' ? (
                <>
                  <SquarePlus className="h-4 w-4" aria-hidden="true" /> Show me how
                </>
              ) : (
                <>
                  <Compass className="h-4 w-4" aria-hidden="true" /> Show me how
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={installed ? 'FrameDesk is installed' : help.title}
      >
        {installed ? (
          <p className="text-muted text-sm">
            You&apos;re already using the installed app on this device.
          </p>
        ) : (
          <InstallSteps platform={platform} />
        )}
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setHelpOpen(false)}>
            Done
          </Button>
        </div>
      </Dialog>
    </>
  );
}
