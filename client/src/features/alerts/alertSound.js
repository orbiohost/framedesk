// Alarm sounds for project alerts, made with Web Audio (no files to load).
// Browsers only allow sound after the person has touched the page once, so
// unlockAlertAudio() runs on the first tap or key press of each visit.

export const ALERT_SOUND_OPTIONS = [
  { value: 'chime', label: 'Chime' },
  { value: 'bell', label: 'Bell' },
  { value: 'beacon', label: 'Beacon' },
  { value: 'pulse', label: 'Soft pulse' },
  { value: 'digital', label: 'Digital' },
  { value: 'siren', label: 'Siren' },
];

const VIBRATE_PATTERN = [500, 250, 500, 250, 900];

let context = null;

function audioContext() {
  if (context) return context;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  context = new Context();
  return context;
}

export function unlockAlertAudio() {
  const ctx = audioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function audioReady() {
  return context?.state === 'running';
}

function tone(ctx, out, { type = 'sine', freq, to, start, dur, gain = 0.6 }) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.linearRampToValueAtTime(to, start + dur);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

// Each sound: one cycle of `cycle` seconds, repeated for the ring time.
const SOUNDS = {
  chime: {
    cycle: 1.8,
    play: (ctx, out, t) => {
      tone(ctx, out, { freq: 880, start: t, dur: 0.9 });
      tone(ctx, out, { freq: 1318.5, start: t + 0.22, dur: 1.1, gain: 0.5 });
      tone(ctx, out, { freq: 1760, start: t + 0.44, dur: 1.2, gain: 0.35 });
    },
  },
  bell: {
    cycle: 2.2,
    play: (ctx, out, t) => {
      for (const [freq, gain] of [
        [660, 0.6],
        [1320, 0.3],
        [1980, 0.18],
        [2640, 0.1],
      ]) {
        tone(ctx, out, { freq, start: t, dur: 1.9, gain });
      }
    },
  },
  beacon: {
    cycle: 1.4,
    play: (ctx, out, t) => {
      for (let i = 0; i < 3; i += 1) {
        tone(ctx, out, { type: 'triangle', freq: 1046.5, start: t + i * 0.2, dur: 0.14, gain: 0.7 });
      }
    },
  },
  pulse: {
    cycle: 1.6,
    play: (ctx, out, t) => {
      tone(ctx, out, { freq: 523.25, start: t, dur: 0.6, gain: 0.55 });
      tone(ctx, out, { freq: 659.25, start: t + 0.6, dur: 0.6, gain: 0.45 });
    },
  },
  digital: {
    cycle: 1.0,
    play: (ctx, out, t) => {
      for (let i = 0; i < 4; i += 1) {
        tone(ctx, out, {
          type: 'square',
          freq: i % 2 ? 1600 : 1200,
          start: t + i * 0.11,
          dur: 0.08,
          gain: 0.25,
        });
      }
    },
  },
  siren: {
    cycle: 1.6,
    play: (ctx, out, t) => {
      tone(ctx, out, { type: 'sawtooth', freq: 600, to: 1200, start: t, dur: 0.8, gain: 0.22 });
      tone(ctx, out, { type: 'sawtooth', freq: 1200, to: 600, start: t + 0.8, dur: 0.8, gain: 0.22 });
    },
  },
};

/**
 * Rings for `seconds` (vibrating too, where the device can). Returns
 * { stop, playing }: playing is false when the browser blocked the sound
 * (no tap on the page yet).
 */
export function startRinging({ sound = 'chime', volume = 0.8, seconds = 20, vibrate = true }) {
  const ctx = audioContext();
  const def = SOUNDS[sound] ?? SOUNDS.chime;
  let stopped = false;
  let scheduleTimer = null;
  let vibrateTimer = null;
  let endTimer = null;
  let master = null;

  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume));
    master.connect(ctx.destination);
    const end = ctx.currentTime + seconds;
    let next = ctx.currentTime + 0.05;
    const schedule = () => {
      // Keep about a second of sound queued ahead.
      while (!stopped && next < ctx.currentTime + 1 && next < end) {
        def.play(ctx, master, next);
        next += def.cycle;
      }
    };
    schedule();
    scheduleTimer = setInterval(schedule, 250);
  }

  const canVibrate = vibrate && typeof navigator.vibrate === 'function';
  if (canVibrate) {
    navigator.vibrate(VIBRATE_PATTERN);
    vibrateTimer = setInterval(() => navigator.vibrate(VIBRATE_PATTERN), 3000);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(scheduleTimer);
    clearInterval(vibrateTimer);
    clearTimeout(endTimer);
    if (canVibrate) navigator.vibrate(0);
    if (master && ctx) {
      // Fade out instead of clicking off.
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      const node = master;
      setTimeout(() => node.disconnect(), 300);
    }
  }
  endTimer = setTimeout(stop, seconds * 1000);

  return { stop, playing: ctx?.state === 'running' };
}
