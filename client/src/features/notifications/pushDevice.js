import { isRunningInstalled } from '../install/installState.js';

// This device's side of web push: whether it can get notifications at all,
// and turning them on or off. The server keeps one subscription per device.

const WORKER_URL = '/media-sw.js';

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * 'ready'        can ask for permission
 * 'granted'      permission given (may or may not be subscribed yet)
 * 'denied'       blocked in the browser's site settings
 * 'needs-install' iPhone/iPad: only apps added to the Home Screen get push
 * 'unsupported'  no web push in this browser
 */
export function pushSupport() {
  if (typeof window === 'undefined') return 'unsupported';
  const hasApis =
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  if (!hasApis) return isIos() && !isRunningInstalled() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return 'ready';
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  await navigator.serviceWorker.register(WORKER_URL, { scope: '/' });
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (!['granted', 'ready'].includes(pushSupport())) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function keyBytes(base64Url) {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

// "Chrome on Android", so the settings page can tell devices apart.
export function deviceLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /Firefox|FxiOS/.test(ua)
        ? 'Firefox'
        : /Chrome|CriOS/.test(ua)
          ? 'Chrome'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'Browser';
  const system = isIos()
    ? /iPhone|iPod/.test(ua)
      ? 'iPhone'
      : 'iPad'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /Linux|CrOS/.test(ua)
            ? 'Linux'
            : 'this device';
  const app = isRunningInstalled() ? ' (app)' : '';
  return `${browser} on ${system}${app}`;
}

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

// Must run from a tap (browsers only show the permission prompt then).
// Resolves the subscription as JSON, ready for the server, or throws.
export async function subscribeThisDevice(publicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    const error = new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser settings.'
        : 'Notifications were not allowed.',
    );
    error.code = permission;
    throw error;
  }
  const reg = await registration();
  let subscription = await reg.pushManager.getSubscription();
  // A subscription made with another server key can't be used: start over.
  const wanted = keyBytes(publicKey);
  const existingKey = subscription?.options?.applicationServerKey;
  if (subscription && existingKey) {
    const same =
      existingKey.byteLength === wanted.byteLength &&
      new Uint8Array(existingKey).every((byte, i) => byte === wanted[i]);
    if (!same) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  subscription ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: wanted,
  });
  return subscription.toJSON();
}

export async function unsubscribeThisDevice() {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => {});
  return endpoint;
}
