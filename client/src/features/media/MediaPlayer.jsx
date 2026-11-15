import {
  Check,
  Expand,
  Loader2,
  Maximize,
  Minimize,
  Music2,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Settings,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import { useDismiss } from '../../lib/useDismiss.js';
import { useWorkerPrefetch } from './mediaStream.js';

// A custom player around the native <video>/<audio> element. Decoding stays
// in the browser (hardware-accelerated on most devices); the server only
// answers HTTP Range requests, and only for the parts actually watched.

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SKIP_SECONDS = 10;
const ARROW_SECONDS = 5;
const FRAME_SECONDS = 1 / 30;
const HIDE_CONTROLS_MS = 2500;
// Two taps this close together on the left/right of a video skip back/forward.
const DOUBLE_TAP_MS = 280;
const SIDE_ZONE = 0.35;

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const s = String(whole % 60).padStart(2, '0');
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function readNumber(key, fallback, min, max) {
  const raw = readLocal(key);
  const value = Number(raw);
  return raw !== null && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

// Volume, mute and speed carry over between files and visits.
function usePlayerPrefs() {
  const [prefs, setPrefs] = useState(() => ({
    volume: readNumber('player:volume', 1, 0, 1),
    muted: readLocal('player:muted') === 'true',
    rate: readNumber('player:rate', 1, 0.25, 2),
  }));
  const update = useCallback((change) => {
    setPrefs((current) => {
      const next = { ...current, ...change };
      writeLocal('player:volume', String(next.volume));
      writeLocal('player:muted', String(next.muted));
      writeLocal('player:rate', String(next.rate));
      return next;
    });
  }, []);
  return [prefs, update];
}

function bufferedEnd(media) {
  const { buffered, currentTime } = media;
  for (let i = 0; i < buffered.length; i += 1) {
    if (buffered.start(i) <= currentTime + 0.5 && buffered.end(i) >= currentTime) {
      return buffered.end(i);
    }
  }
  return 0;
}

// Phones (not tablets or laptops with touch screens): a finger is the main
// pointer and the screen's short side is phone-sized.
function isPhone() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return (
    window.matchMedia('(pointer: coarse)').matches &&
    Math.min(window.screen.width, window.screen.height) < 600
  );
}

// "1080p", "4K"… from the picture's short side, so portrait clips read the same.
export function qualityLabel(width, height) {
  if (!width || !height) return null;
  const short = Math.min(width, height);
  if (short >= 4320) return '8K';
  if (short >= 2160) return '4K';
  if (short >= 1440) return '1440p';
  const steps = [1080, 720, 480, 360, 240, 144];
  const step = steps.find((value) => short >= value * 0.9);
  return step ? `${step}p` : `${short}p`;
}

function shapeLabel(width, height) {
  if (!width || !height) return null;
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.05) return 'Square';
  return ratio > 1 ? 'Landscape' : 'Portrait';
}

// Turns a phone to suit the video while it's full screen: sideways for wide
// videos, upright for tall ones. Browsers without the API ignore it.
function lockOrientationTo(media) {
  const orientation = typeof screen !== 'undefined' ? screen.orientation : null;
  if (!orientation?.lock || !media?.videoWidth || !media.videoHeight) return;
  if (media.videoWidth === media.videoHeight) return;
  orientation.lock(media.videoWidth > media.videoHeight ? 'landscape' : 'portrait').catch(() => {});
}

function unlockOrientation() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Nothing was locked.
  }
}

function isTypingTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) &&
    target.type !== 'range'
  );
}

function ControlButton({ label, onClick, children, active, className }) {
  return (
    <button
      type="button"
      data-player-control
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'player-btn grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all sm:h-10 sm:w-10',
        'hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-0 active:scale-90',
        active && 'bg-white/15',
        className,
      )}
    >
      {children}
    </button>
  );
}

function SeekBar({ mediaRef, current, duration, bufferedRatio, barRef, onScrub, tone }) {
  const [hover, setHover] = useState(null);
  const dragging = useRef(false);
  // While dragging, at most one seek is in flight. Pointer moves arriving
  // meanwhile only update the target, so the browser isn't asked to start
  // (and abandon) a byte-range fetch for every pixel the pointer crosses.
  const pendingSeek = useRef(null);
  const seekBusy = useRef(false);

  useEffect(() => {
    const bar = barRef.current;
    return () => {
      pendingSeek.current = null;
      if (bar) delete bar.dataset.scrubbing;
    };
  }, [barRef]);

  function ratioAt(event) {
    const rect = barRef.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  }

  function applyPendingSeek() {
    const media = mediaRef.current;
    const time = pendingSeek.current;
    if (!media || time === null) {
      seekBusy.current = false;
      return;
    }
    if (media.seeking) {
      media.addEventListener('seeked', () => requestAnimationFrame(applyPendingSeek), {
        once: true,
      });
      return;
    }
    pendingSeek.current = null;
    // Nearest keyframe while dragging (fast, few byte ranges) where supported.
    if (typeof media.fastSeek === 'function') media.fastSeek(time);
    else media.currentTime = time;
    seekBusy.current = false;
  }

  function seekTo(ratio, exact) {
    const media = mediaRef.current;
    if (!media || !duration) return;
    const time = ratio * duration;
    // The bar follows the pointer at once, whatever the video is still doing.
    barRef.current?.style.setProperty('--played', String(ratio));
    onScrub(time);
    if (exact) {
      // Land exactly where the pointer was released.
      pendingSeek.current = null;
      media.currentTime = time;
      return;
    }
    pendingSeek.current = time;
    if (seekBusy.current) return;
    seekBusy.current = true;
    requestAnimationFrame(applyPendingSeek);
  }

  function endDrag(event) {
    if (!dragging.current) return;
    dragging.current = false;
    seekTo(ratioAt(event), true);
    delete barRef.current.dataset.scrubbing;
  }

  function onKeyDown(event) {
    const media = mediaRef.current;
    if (!media || !duration) return;
    const steps = { Home: -Infinity, End: Infinity, PageDown: -60, PageUp: 60 };
    if (!(event.key in steps)) return;
    event.preventDefault();
    event.stopPropagation();
    media.currentTime = Math.min(duration, Math.max(0, media.currentTime + steps[event.key]));
  }

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      data-player-control
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 0}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        // Tells the player's own progress painting to leave the bar alone.
        event.currentTarget.dataset.scrubbing = 'true';
        seekTo(ratioAt(event), false);
      }}
      onPointerMove={(event) => {
        const ratio = ratioAt(event);
        setHover({ ratio });
        if (dragging.current) seekTo(ratio, false);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setHover(null)}
      // --played is painted directly by the player (no re-render per frame).
      className="group/seek relative flex h-6 cursor-pointer touch-none items-center [--played:0] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
    >
      <div
        className={cn(
          'relative h-1 w-full overflow-hidden rounded-full transition-[height] duration-150 group-hover/seek:h-2 group-focus-visible/seek:h-2',
          tone === 'light' ? 'bg-ink/10' : 'bg-white/20',
        )}
      >
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width]',
            tone === 'light' ? 'bg-ink/15' : 'bg-white/30',
          )}
          style={{ width: `${bufferedRatio * 100}%` }}
        />
        {hover && (
          <div
            className={cn(
              'absolute inset-y-0 left-0',
              tone === 'light' ? 'bg-ink/10' : 'bg-white/25',
            )}
            style={{ width: `${hover.ratio * 100}%` }}
          />
        )}
        <div
          className="bg-accent absolute inset-y-0 left-0 w-full origin-left"
          style={{ transform: 'scaleX(var(--played))' }}
        />
      </div>
      <div
        className="ring-accent pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 scale-75 rounded-full bg-white shadow-md ring-[3px] transition-transform group-hover/seek:scale-110 group-focus-visible/seek:scale-110"
        style={{ left: 'calc(var(--played) * 100%)' }}
      />
      {hover && duration > 0 && (
        <div
          className="pointer-events-none absolute bottom-full mb-2.5 -translate-x-1/2 rounded-lg bg-black/90 px-2 py-1 text-xs font-semibold tabular-nums text-white shadow-lg ring-1 ring-white/10"
          style={{ left: `clamp(1.5rem, ${hover.ratio * 100}%, calc(100% - 1.5rem))` }}
        >
          {formatTime(hover.ratio * duration)}
        </div>
      )}
    </div>
  );
}

function VolumeControl({ volume, muted, onChange, tone }) {
  const silent = muted || volume === 0;
  const Icon = silent ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="group/volume flex items-center">
      <ControlButton
        label={silent ? 'Unmute (m)' : 'Mute (m)'}
        onClick={() => onChange({ muted: !silent, volume: silent && volume === 0 ? 0.5 : volume })}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </ControlButton>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={silent ? 0 : volume}
        aria-label="Volume"
        data-player-control
        onChange={(event) => {
          const value = Number(event.target.value);
          onChange({ volume: value, muted: value === 0 });
        }}
        style={{ '--fill': `${(silent ? 0 : volume) * 100}%` }}
        className={cn(
          'player-range w-0 cursor-pointer opacity-0 transition-all duration-200',
          'group-focus-within/volume:mr-1 group-focus-within/volume:w-20 group-focus-within/volume:opacity-100 group-hover/volume:mr-1 group-hover/volume:w-20 group-hover/volume:opacity-100',
          tone === 'light' && 'player-range-light',
        )}
      />
    </div>
  );
}

function SettingsMenu({
  rate,
  loop,
  onRate,
  onLoop,
  zoom,
  onZoom,
  info,
  extras,
  onOpenChange,
  tone,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <ControlButton label="Settings" onClick={() => setOpen(!open)} active={open}>
        <Settings
          className={cn('h-[18px] w-[18px] transition-transform', open && 'rotate-45')}
          aria-hidden="true"
        />
      </ControlButton>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute bottom-full right-0 z-20 mb-3 w-60 rounded-2xl p-2 text-sm shadow-2xl',
            tone === 'light'
              ? 'bg-surface text-ink border-line border'
              : 'bg-[#141319]/95 text-white ring-1 ring-white/10 backdrop-blur-xl',
          )}
        >
          {info && (
            <p className="mb-1 flex items-center justify-between gap-2 border-b border-white/10 px-2.5 pb-2 pt-1.5 text-xs">
              <span className="font-semibold">{info.quality}</span>
              <span className="tabular-nums opacity-60">{info.detail}</span>
            </p>
          )}
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-60">
            Speed
          </p>
          <div className="grid grid-cols-4 gap-1 px-1 pb-1.5">
            {RATES.map((value) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={rate === value}
                onClick={() => onRate(value)}
                className={cn(
                  'rounded-lg py-1.5 text-xs tabular-nums transition-colors',
                  rate === value ? 'bg-accent text-accent-ink font-semibold' : 'hover:bg-white/15',
                  tone === 'light' && rate !== value && 'hover:bg-subtle',
                )}
              >
                {value}×
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={loop}
            onClick={onLoop}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left',
              tone === 'light' ? 'hover:bg-subtle' : 'hover:bg-white/15',
            )}
          >
            <Repeat className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">Loop</span>
            {loop && <Check className="h-4 w-4" aria-hidden="true" />}
          </button>
          {onZoom && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={zoom}
              onClick={onZoom}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-white/15"
            >
              <Expand className="h-4 w-4" aria-hidden="true" />
              <span className="flex-1">Zoom to fill screen</span>
              {zoom && <Check className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
          {extras?.map((extra) => (
            <button
              key={extra.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                extra.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left',
                tone === 'light' ? 'hover:bg-subtle' : 'hover:bg-white/15',
              )}
            >
              {extra.icon && <extra.icon className="h-4 w-4" aria-hidden="true" />}
              <span className="flex-1">{extra.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SHORTCUTS =
  'Space/K play · J/L ±10s · ←/→ ±5s · ↑/↓ volume · M mute · F fullscreen · , . frame · 0–9 jump';

/**
 * kind: "video" | "audio"
 * onIssue(type, detail): "unsupported" (can't play at all), "no-picture"
 *   (video track can't be decoded), or "link-expired" (worked, then the
 *   signed link stopped answering; detail.time says where to resume).
 * menuExtras: [{ label, icon, onSelect }] added to the settings menu.
 * fill: the player sits in the full-screen file viewer: it may be as tall as
 *   that stage, and on phones it opens full screen.
 * The video box always takes the video's own shape (portrait, square, wide).
 * stream: { key, url, size, mime } when src is served by the media worker,
 *   which then keeps buffering ahead of the playhead (see mediaStream.js).
 */
export function MediaPlayer({
  kind,
  src,
  title,
  startAt = 0,
  autoPlay = true,
  onIssue,
  menuExtras,
  fill = false,
  stream = null,
}) {
  const mediaRef = useRef(null);
  const containerRef = useRef(null);
  const barRef = useRef(null);
  const hasLoaded = useRef(false);
  // Whether the viewer wants it playing (survives a link renewal, unlike `paused`).
  const wantsPlay = useRef(autoPlay);
  // Where to pick up once a renewed link has loaded: { time, play }.
  const resume = useRef(null);
  // Set while the real length of a file without a duration is being found.
  const probe = useRef(null);
  const hideTimer = useRef(null);
  const tapTimer = useRef(null);
  const lastTap = useRef(null);
  // "touch" when the last press on the player came from a finger.
  const pointerType = useRef('mouse');
  const [prefs, setPrefs] = usePlayerPrefs();
  // The browser only allowed autoplay without sound; the viewer's own mute
  // setting is untouched, and one tap brings the sound back.
  const [autoMuted, setAutoMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [status, setStatus] = useState({ playing: false, waiting: true, ended: false });
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedRatio, setBufferedRatio] = useState(0);
  // How far the media worker holds the file ahead (it keeps going when paused).
  const [prefetchedRatio, setPrefetchedRatio] = useState(0);
  useWorkerPrefetch(mediaRef, stream, setPrefetchedRatio);
  const [showRemaining, setShowRemaining] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [flash, setFlash] = useState(null);
  // The picture's real size, so the box takes the video's own shape
  // (portrait phone clips, square, ultra-wide) instead of a fixed 16:9.
  const [videoSize, setVideoSize] = useState(null);
  // Full screen only: crop to fill the display instead of showing bars.
  const [zoomFill, setZoomFill] = useState(false);
  // Phones open videos full screen. If the browser refused (no recent tap),
  // the viewer's next press on play does it instead.
  const pendingFullscreen = useRef(false);
  const autoEntered = useRef(false);
  const isVideo = kind === 'video';
  const canPip =
    isVideo && typeof document !== 'undefined' && document.pictureInPictureEnabled === true;

  const paintProgress = useCallback(() => {
    const media = mediaRef.current;
    if (!media || !barRef.current || barRef.current.dataset.scrubbing) return;
    const ratio = media.duration ? media.currentTime / media.duration : 0;
    barRef.current.style.setProperty('--played', String(ratio));
  }, []);

  // Smooth progress at display refresh rate without re-rendering React.
  useEffect(() => {
    if (!status.playing) return undefined;
    let frame;
    const tick = () => {
      paintProgress();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status.playing, paintProgress]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = prefs.volume;
    media.muted = prefs.muted || autoMuted;
    media.playbackRate = prefs.rate;
    media.defaultPlaybackRate = prefs.rate;
  }, [prefs, autoMuted]);

  useEffect(() => {
    const onChange = () => {
      const active =
        (document.fullscreenElement ?? document.webkitFullscreenElement) === containerRef.current;
      setIsFullscreen(active);
      if (active) {
        lockOrientationTo(mediaRef.current);
      } else {
        autoEntered.current = false;
        setZoomFill(false);
        unlockOrientation();
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      clearTimeout(tapTimer.current);
    },
    [],
  );

  // Starts playback, falling back to muted playback where the browser blocks
  // sound without a tap (iPhone, some Android browsers). If even that is
  // refused, the big play button shows instead of a spinner.
  const startPlayback = useCallback((media) => {
    const showPaused = () => setStatus((s) => ({ ...s, playing: false, waiting: false }));
    media.play().catch((error) => {
      if (error?.name !== 'NotAllowedError' || media.muted) {
        if (error?.name !== 'AbortError') showPaused();
        return;
      }
      media.muted = true;
      setAutoMuted(true);
      media.play().catch(() => {
        setAutoMuted(false);
        showPaused();
      });
    });
  }, []);

  const toggleMute = useCallback(() => {
    if (autoMuted) {
      setAutoMuted(false);
      if (prefs.muted || prefs.volume === 0)
        setPrefs({ muted: false, volume: prefs.volume || 0.5 });
      return;
    }
    setPrefs({ muted: !prefs.muted });
  }, [autoMuted, prefs.muted, prefs.volume, setPrefs]);

  const changePrefs = useCallback(
    (change) => {
      setAutoMuted(false);
      setPrefs(change);
    },
    [setPrefs],
  );

  const showFlash = useCallback((value, seconds) => {
    setFlash({ value, seconds, key: Date.now() });
  }, []);

  // Container full screen (our own controls stay). Resolves false when the
  // browser has no such API (iPhone) or refuses without a recent tap.
  const enterFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container || document.fullscreenElement || document.webkitFullscreenElement) return false;
    try {
      if (container.requestFullscreen) {
        await container.requestFullscreen({ navigationUI: 'hide' });
        return true;
      }
      if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
        return true;
      }
    } catch {
      // Needs a user gesture; handled by the caller.
    }
    return false;
  }, []);

  const togglePlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused || media.ended) {
      if (pendingFullscreen.current) {
        pendingFullscreen.current = false;
        enterFullscreen().then((ok) => {
          autoEntered.current = ok;
        });
      }
      media.play().catch(() => {});
      showFlash('play');
    } else {
      media.pause();
      showFlash('pause');
    }
  }, [showFlash, enterFullscreen]);

  const skip = useCallback(
    (seconds) => {
      const media = mediaRef.current;
      if (!media) return;
      const end = Number.isFinite(media.duration) ? media.duration : Infinity;
      media.currentTime = Math.min(end, Math.max(0, media.currentTime + seconds));
      paintProgress();
      if (Math.abs(seconds) >= 1) showFlash(seconds > 0 ? 'forward' : 'back', Math.abs(seconds));
    },
    [paintProgress, showFlash],
  );

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    const media = mediaRef.current;
    pendingFullscreen.current = false;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen?.();
    } else if (container?.requestFullscreen) {
      container.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } else if (container?.webkitRequestFullscreen) {
      container.webkitRequestFullscreen(); // iPad / older Safari
    } else if (media?.webkitEnterFullscreen) {
      media.webkitEnterFullscreen(); // iPhone Safari
    }
  }, []);

  const togglePip = useCallback(async () => {
    const media = mediaRef.current;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await media?.requestPictureInPicture();
    } catch {
      // Not allowed right now (e.g. before metadata loads).
    }
  }, []);

  const changeVolume = useCallback(
    (delta) => {
      const volume = Math.min(1, Math.max(0, Math.round((prefs.volume + delta) * 20) / 20));
      changePrefs({ volume, muted: volume === 0 });
    },
    [prefs.volume, changePrefs],
  );

  // Keyboard shortcuts while the player is on screen.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const onOwnControl =
        event.target instanceof Element && event.target.closest('[data-player-control]');
      const media = mediaRef.current;
      if (!media) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const actions = {
        ' ': onOwnControl ? null : togglePlay,
        k: togglePlay,
        j: () => skip(-SKIP_SECONDS),
        l: () => skip(SKIP_SECONDS),
        ArrowLeft:
          onOwnControl?.getAttribute('type') === 'range' ? null : () => skip(-ARROW_SECONDS),
        ArrowRight:
          onOwnControl?.getAttribute('type') === 'range' ? null : () => skip(ARROW_SECONDS),
        ArrowUp: () => changeVolume(0.05),
        ArrowDown: () => changeVolume(-0.05),
        m: toggleMute,
        f: isVideo ? toggleFullscreen : null,
        ',': () => media.paused && skip(-FRAME_SECONDS),
        '.': () => media.paused && skip(FRAME_SECONDS),
        '<': () => setPrefs({ rate: RATES[Math.max(0, RATES.indexOf(prefs.rate) - 1)] ?? 1 }),
        '>': () =>
          setPrefs({ rate: RATES[Math.min(RATES.length - 1, RATES.indexOf(prefs.rate) + 1)] ?? 1 }),
      };
      if (/^[0-9]$/.test(key) && Number.isFinite(media.duration)) {
        event.preventDefault();
        media.currentTime = (Number(key) / 10) * media.duration;
        paintProgress();
        return;
      }
      const action = actions[key];
      if (!action) return;
      event.preventDefault();
      action();
      wakeControls();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    togglePlay,
    skip,
    changeVolume,
    toggleFullscreen,
    toggleMute,
    isVideo,
    prefs,
    setPrefs,
    paintProgress,
  ]);

  function wakeControls() {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const media = mediaRef.current;
      if (media && !media.paused) setControlsVisible(false);
    }, HIDE_CONTROLS_MS);
  }

  // Touch: a tap shows or hides the controls (it doesn't pause), and a double
  // tap on the left or right skips back or forward. Mouse: a click plays/pauses.
  function onVideoClick(event) {
    if (pointerType.current !== 'touch') {
      togglePlay();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
    const side = x < SIDE_ZONE ? -1 : x > 1 - SIDE_ZONE ? 1 : 0;
    const now = Date.now();
    const previous = lastTap.current;
    lastTap.current = { at: now, side };
    clearTimeout(tapTimer.current);
    if (side !== 0 && previous && previous.side === side && now - previous.at < DOUBLE_TAP_MS) {
      skip(side * SKIP_SECONDS);
      return;
    }
    const toggleControls = () => {
      if (!controlsVisible) wakeControls();
      else if (status.playing && !menuOpen) setControlsVisible(false);
    };
    // The middle can't be double-tapped, so it answers at once.
    if (side === 0) toggleControls();
    else tapTimer.current = setTimeout(toggleControls, DOUBLE_TAP_MS);
  }

  // Goes to the starting spot and plays (or shows the play button) once the
  // duration is known.
  function begin(media, target, shouldPlay) {
    setDuration(media.duration);
    if (target > 0 && target < media.duration) media.currentTime = target;
    else if (media.currentTime > 0 && target === 0) media.currentTime = 0;
    // Playing is started here rather than with the autoplay attribute, which
    // browsers ignore on phones and which a renewed link would re-trigger.
    // A renewed link only resumes if the viewer was watching.
    if (shouldPlay) startPlayback(media);
    // Phones (iPhone especially) load nothing more until the viewer taps,
    // so show the play button instead of a spinner that never ends.
    else setStatus((s) => ({ ...s, waiting: false }));
    paintProgress();
  }

  const mediaEvents = {
    onLoadedMetadata: (event) => {
      const media = event.currentTarget;
      const isFirstLoad = !hasLoaded.current;
      const pending = resume.current;
      hasLoaded.current = true;
      resume.current = null;
      const target = pending ? pending.time : isFirstLoad ? startAt : 0;
      const shouldPlay = pending ? pending.play : isFirstLoad && autoPlay;
      if (isFirstLoad && isVideo && media.videoWidth === 0 && media.videoHeight === 0) {
        onIssue?.('no-picture');
      }
      if (isVideo && media.videoWidth && media.videoHeight) {
        setVideoSize({ width: media.videoWidth, height: media.videoHeight });
        if (document.fullscreenElement === containerRef.current) lockOrientationTo(media);
        // Opened in the viewer on a phone: watch it full screen, like a video app.
        if (isFirstLoad && fill && isPhone()) {
          enterFullscreen().then((ok) => {
            autoEntered.current = ok;
            pendingFullscreen.current = !ok;
          });
        }
      }
      if (Number.isFinite(media.duration) && media.duration > 0) {
        begin(media, target, shouldPlay);
        return;
      }
      // Browser recordings (WebM) often carry no duration, so the player would
      // show 0:00 and a bar that can't seek. Asking for a time far past the
      // end makes the browser read the file's last cluster and report the
      // real length; durationchange then picks up from there.
      probe.current = { target, shouldPlay };
      media.currentTime = Number.MAX_SAFE_INTEGER;
    },
    onDurationChange: (event) => {
      const media = event.currentTarget;
      if (!Number.isFinite(media.duration)) return;
      const probing = probe.current;
      if (probing) {
        probe.current = null;
        begin(media, probing.target, probing.shouldPlay);
        return;
      }
      setDuration(media.duration);
    },
    onTimeUpdate: (event) => {
      if (probe.current) return; // parked at the end while the length is found
      setTime(event.currentTarget.currentTime);
      if (!status.playing) paintProgress();
    },
    onProgress: (event) => {
      const media = event.currentTarget;
      if (media.duration) setBufferedRatio(bufferedEnd(media) / media.duration);
    },
    onSeeked: (event) => {
      const media = event.currentTarget;
      // The far seek finished without a length turning up: play anyway.
      if (probe.current && !Number.isFinite(media.duration)) {
        const { shouldPlay } = probe.current;
        probe.current = null;
        media.currentTime = 0;
        if (shouldPlay) startPlayback(media);
        else setStatus((s) => ({ ...s, waiting: false }));
      }
      paintProgress();
    },
    onPlay: () => {
      wantsPlay.current = true;
      setStatus((s) => ({ ...s, playing: true, ended: false }));
      wakeControls();
    },
    onPause: () => {
      // A pause caused by a failing link isn't the viewer's choice.
      if (!resume.current) wantsPlay.current = false;
      setStatus((s) => ({ ...s, playing: false }));
      setControlsVisible(true);
    },
    onWaiting: () => setStatus((s) => ({ ...s, waiting: true })),
    onPlaying: () => setStatus((s) => ({ ...s, waiting: false })),
    onCanPlay: () => setStatus((s) => ({ ...s, waiting: false })),
    // Some streams change size mid-way (adaptive or rotated phone recordings).
    onResize: (event) => {
      const media = event.currentTarget;
      if (isVideo && media.videoWidth && media.videoHeight) {
        setVideoSize({ width: media.videoWidth, height: media.videoHeight });
      }
    },
    onEnded: () => {
      wantsPlay.current = false;
      setStatus((s) => ({ ...s, playing: false, ended: true }));
      setControlsVisible(true);
      // Full screen we opened ourselves closes when the video is over.
      if (autoEntered.current && !loop) {
        autoEntered.current = false;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else if (document.webkitFullscreenElement) document.webkitExitFullscreen?.();
      }
    },
    onError: (event) => {
      const media = event.currentTarget;
      // It played before, so the format is fine: the signed link has expired
      // (or the connection dropped). Remember the spot and wait for a new link.
      if (hasLoaded.current) {
        // A renewal that fails too keeps the first spot, not the reset 0:00.
        resume.current ??= { time: media.currentTime, play: wantsPlay.current };
        setStatus((s) => ({ ...s, playing: false, waiting: true }));
        onIssue?.('link-expired', { time: resume.current.time });
        return;
      }
      setStatus((s) => ({ ...s, playing: false, waiting: false }));
      onIssue?.('unsupported', { code: media.error?.code });
    },
  };

  const remaining = Math.max(0, duration - time);
  const tone = isVideo ? 'dark' : 'light';

  const controls = (
    <div className="space-y-1">
      <SeekBar
        mediaRef={mediaRef}
        current={time}
        duration={duration}
        bufferedRatio={Math.max(bufferedRatio, prefetchedRatio)}
        barRef={barRef}
        onScrub={setTime}
        tone={tone}
      />
      <div className="flex items-center gap-0.5">
        <ControlButton label={status.playing ? 'Pause (k)' : 'Play (k)'} onClick={togglePlay}>
          {status.playing ? (
            <Pause className="h-5 w-5" fill="currentColor" aria-hidden="true" />
          ) : status.ended ? (
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Play className="h-5 w-5" fill="currentColor" aria-hidden="true" />
          )}
        </ControlButton>
        <ControlButton
          label="Back 10 seconds (j)"
          onClick={() => skip(-SKIP_SECONDS)}
          className={isVideo && 'hidden sm:grid'}
        >
          <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />
        </ControlButton>
        <ControlButton
          label="Forward 10 seconds (l)"
          onClick={() => skip(SKIP_SECONDS)}
          className={isVideo && 'hidden sm:grid'}
        >
          <RotateCw className="h-[18px] w-[18px]" aria-hidden="true" />
        </ControlButton>
        <VolumeControl
          volume={prefs.volume}
          muted={prefs.muted || autoMuted}
          onChange={changePrefs}
          tone={tone}
        />
        <button
          type="button"
          data-player-control
          onClick={() => setShowRemaining(!showRemaining)}
          title="Show elapsed or remaining time"
          className={cn(
            'ml-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors',
            tone === 'light' ? 'hover:bg-subtle' : 'hover:bg-white/15',
          )}
        >
          {showRemaining && Number.isFinite(duration) && duration > 0
            ? `-${formatTime(remaining)}`
            : formatTime(time)}
          <span className="opacity-55">
            {' '}
            / {Number.isFinite(duration) && duration > 0 ? formatTime(duration) : '--:--'}
          </span>
        </button>
        <div className="flex-1" />
        {prefs.rate !== 1 && (
          <span
            className={cn(
              'mr-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
              tone === 'light' ? 'bg-accent/10 text-accent' : 'bg-white/15',
            )}
          >
            {prefs.rate}×
          </span>
        )}
        <SettingsMenu
          rate={prefs.rate}
          loop={loop}
          onRate={(rate) => setPrefs({ rate })}
          onLoop={() => setLoop(!loop)}
          zoom={zoomFill}
          onZoom={isVideo && isFullscreen ? () => setZoomFill(!zoomFill) : null}
          info={
            isVideo && videoSize
              ? {
                  quality: qualityLabel(videoSize.width, videoSize.height),
                  detail: `${shapeLabel(videoSize.width, videoSize.height)} · ${videoSize.width}×${videoSize.height}`,
                }
              : null
          }
          extras={menuExtras}
          onOpenChange={setMenuOpen}
          tone={tone}
        />
        {canPip && (
          <ControlButton label="Picture in picture" onClick={togglePip} className="hidden sm:grid">
            <PictureInPicture2 className="h-[18px] w-[18px]" aria-hidden="true" />
          </ControlButton>
        )}
        {isVideo && (
          <ControlButton
            label={isFullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <Maximize className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </ControlButton>
        )}
      </div>
    </div>
  );

  if (!isVideo) {
    return (
      <div
        ref={containerRef}
        className="player-light bg-surface text-ink border-line/80 shadow-lift rounded-3xl border p-4 sm:p-6"
      >
        <audio ref={mediaRef} src={src} preload="auto" loop={loop} {...mediaEvents} />
        <div className="mb-4 flex items-center gap-4">
          <div className="widget-lavender text-accent grid h-20 w-20 shrink-0 place-items-center rounded-2xl sm:h-24 sm:w-24">
            <Music2
              className={cn(
                'h-9 w-9 transition-transform duration-500',
                status.playing && 'scale-110',
              )}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold" title={title}>
              {title}
            </p>
            <div className="mt-2 flex h-5 items-end gap-[3px]" aria-hidden="true">
              {Array.from({ length: 28 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'bg-accent/60 w-[3px] rounded-full',
                    status.playing ? 'animate-[eq_1s_ease-in-out_infinite]' : 'h-1',
                  )}
                  style={{
                    height: status.playing ? undefined : 4,
                    animationDelay: `${(i * 137) % 900}ms`,
                  }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            data-player-control
            onClick={togglePlay}
            aria-label={status.playing ? 'Pause' : 'Play'}
            className="bg-accent text-accent-ink grid h-14 w-14 shrink-0 place-items-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            {status.waiting && status.playing ? (
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            ) : status.playing ? (
              <Pause className="h-6 w-6" fill="currentColor" aria-hidden="true" />
            ) : (
              <Play className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden="true" />
            )}
          </button>
        </div>
        {controls}
        <p className="text-muted border-line/70 mt-3 hidden border-t pt-3 text-[11px] sm:block">
          {SHORTCUTS}
        </p>
      </div>
    );
  }

  const hideChrome = status.playing && !controlsVisible && !menuOpen;
  // Width/height of the picture, kept to a sane range so a broken header
  // can't make a hair-thin player. 16:9 until the file says otherwise.
  const ratio = videoSize
    ? Math.min(4, Math.max(0.35, videoSize.width / videoSize.height))
    : 16 / 9;
  // The tallest the box may be: the viewer's stage, or most of the window inline.
  const maxHeight = fill ? '(100dvh - 9rem)' : '70dvh';
  const boxStyle = isFullscreen
    ? undefined
    : { aspectRatio: String(ratio), width: `min(100%, calc(${maxHeight} * ${ratio}))` };
  return (
    <div
      ref={containerRef}
      onPointerDown={(event) => {
        pointerType.current = event.pointerType;
        // Fingers on the controls keep them up; taps on the picture toggle them.
        if (event.pointerType === 'touch' && event.target.closest?.('[data-player-control]')) {
          wakeControls();
        }
      }}
      onPointerMove={(event) => event.pointerType !== 'touch' && wakeControls()}
      // Touch fires pointerleave after every tap, which would hide the controls at once.
      onPointerLeave={(event) =>
        event.pointerType === 'mouse' && status.playing && !menuOpen && setControlsVisible(false)
      }
      style={boxStyle}
      className={cn(
        'group/player relative mx-auto overflow-hidden bg-black text-white',
        isFullscreen
          ? 'h-full w-full'
          : 'rounded-2xl shadow-2xl ring-1 ring-white/10 transition-[width] duration-200',
        hideChrome && 'cursor-none',
      )}
    >
      <video
        ref={mediaRef}
        src={src}
        // The viewer opened this file: buffer ahead, not just the header.
        preload="auto"
        playsInline
        loop={loop}
        onClick={onVideoClick}
        onDoubleClick={() => pointerType.current !== 'touch' && toggleFullscreen()}
        // No double-tap zoom or 300 ms tap delay on phones.
        className={cn(
          'h-full w-full touch-manipulation',
          isFullscreen && zoomFill ? 'object-cover' : 'object-contain',
        )}
        {...mediaEvents}
      />

      {status.waiting && !status.ended && (
        // Fades in after a short delay, so brief stalls (a seek served from
        // cache, a quick rebuffer) don't flash a spinner over the picture.
        <div className="pointer-events-none absolute inset-0 grid animate-[spinner-in_200ms_ease-out_300ms_both] place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/40 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-white/90" aria-hidden="true" />
          </span>
        </div>
      )}

      {!status.playing && !status.waiting && (
        <button
          type="button"
          data-player-control
          onClick={togglePlay}
          aria-label={status.ended ? 'Replay' : 'Play'}
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white shadow-2xl ring-1 ring-white/30 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/25 sm:h-20 sm:w-20"
        >
          {status.ended ? (
            <RotateCcw className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true" />
          ) : (
            <Play className="ml-1 h-7 w-7 sm:h-8 sm:w-8" fill="currentColor" aria-hidden="true" />
          )}
        </button>
      )}

      {autoMuted && (
        <button
          type="button"
          data-player-control
          onClick={toggleMute}
          className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <VolumeX className="h-4 w-4" aria-hidden="true" /> Tap to unmute
        </button>
      )}

      {flash && (
        <div
          key={flash.key}
          className="pointer-events-none absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 animate-[flash_0.55s_ease-out_forwards] flex-col items-center justify-center rounded-full bg-black/55 ring-1 ring-white/15 backdrop-blur-sm"
          onAnimationEnd={() => setFlash(null)}
        >
          {flash.value === 'play' && <Play className="ml-1 h-7 w-7" fill="currentColor" />}
          {flash.value === 'pause' && <Pause className="h-7 w-7" fill="currentColor" />}
          {flash.value === 'forward' && <RotateCw className="h-6 w-6" />}
          {flash.value === 'back' && <RotateCcw className="h-6 w-6" />}
          {flash.seconds > 0 && (
            <span className="mt-0.5 text-[10px] font-bold tabular-nums">{flash.seconds}s</span>
          )}
        </div>
      )}

      <div
        className={cn(
          'absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 to-transparent px-[max(1.25rem,env(safe-area-inset-left))] pb-10 pt-[max(1rem,env(safe-area-inset-top))] transition-opacity duration-300',
          hideChrome ? 'opacity-0' : 'opacity-100',
          !isFullscreen && 'hidden',
        )}
      >
        <p className="truncate text-base font-semibold">{title}</p>
      </div>

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2 pt-14 transition-opacity duration-300 sm:px-4 sm:pb-3',
          // Clear of the notch, rounded corners and gesture bar in full screen.
          isFullscreen &&
            'px-[max(0.75rem,env(safe-area-inset-left),env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))]',
          hideChrome ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        {controls}
      </div>
    </div>
  );
}

export { SHORTCUTS as PLAYER_SHORTCUTS };
