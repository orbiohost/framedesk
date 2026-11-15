import { useSyncExternalStore } from 'react';

// Installing FrameDesk as an app (home-screen icon / desktop shortcut).
// Chrome, Edge and Samsung Internet fire `beforeinstallprompt` once, early,
// often before React has mounted, so it is caught here at start-up and kept.
// Safari (iPhone, iPad, Mac) and Firefox have no such event: the app shows
// the steps for that browser instead.

let deferredPrompt = null;
let installed = false;
const listeners = new Set();
let snapshot = { canPrompt: false, installed: false };

function emit() {
  snapshot = { canPrompt: Boolean(deferredPrompt), installed };
  listeners.forEach((listener) => listener());
}

// Already running as the installed app: home-screen PWA, desktop app window,
// iOS home-screen web app, or the Android (TWA) build.
export function isRunningInstalled() {
  if (typeof window === 'undefined') return false;
  const standalone = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches,
  );
  return (
    standalone ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}

export function initInstallState() {
  if (typeof window === 'undefined') return;
  installed = isRunningInstalled();
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own mini-bar from showing; the app offers it instead.
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
  emit();
}

// Shows the browser's install dialog. Resolves 'accepted', 'dismissed', or
// 'unavailable' when this browser can't be asked directly.
export async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  // The event can only be used once.
  deferredPrompt = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice?.outcome === 'accepted') {
      installed = true;
      emit();
    }
    return choice?.outcome ?? 'dismissed';
  } catch {
    return 'unavailable';
  }
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallState() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

// Which instructions to show. Order matters: iPad Safari reports itself as a Mac.
export function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const isIos =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Instagram, Facebook, LinkedIn, Gmail… in-app browsers can't install.
  const inApp = /FBAN|FBAV|Instagram|LinkedInApp|Line\/|GSA\/|Twitter|Snapchat/.test(ua);
  if (isIos) {
    if (inApp) return 'ios-inapp';
    if (/CriOS|FxiOS|EdgiOS/.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  if (/Android/.test(ua)) {
    if (inApp) return 'android-inapp';
    if (/Firefox/.test(ua)) return 'android-firefox';
    if (/SamsungBrowser/.test(ua)) return 'android-samsung';
    return 'android-chrome';
  }
  if (/Firefox/.test(ua)) return 'desktop-firefox';
  if (/Edg\//.test(ua)) return 'desktop-edge';
  if (/Chrome|Chromium|OPR\//.test(ua)) return 'desktop-chrome';
  if (/Safari/.test(ua) && /Macintosh/.test(ua)) return 'mac-safari';
  return 'other';
}

export function isMobilePlatform(platform) {
  return platform.startsWith('ios') || platform.startsWith('android');
}
