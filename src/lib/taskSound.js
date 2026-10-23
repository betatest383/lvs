/**
 * Task notification sound utility.
 *
 * - localStorage-backed enable/disable (default enabled).
 * - Synthesizes a 3.5-second bell chime via the Web Audio API — no external
 *   file needed.
 * - unlockAudio() resumes the AudioContext on first user interaction so iPad
 *   Chrome (which blocks autoplay until interaction) can play the chime.
 * - playTaskChime() fails silently if audio is blocked — toast and badge
 *   continue to work normally regardless.
 */

const STORAGE_KEY = 'lvc_task_sound_enabled';
const listeners = new Set();
let audioCtx = null;

function getStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

let enabled = getStored();

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(value) {
  enabled = !!value;
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    /* storage unavailable — in-memory only */
  }
  listeners.forEach((fn) => fn(enabled));
}

export function subscribeToSoundSetting(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getAudioContext() {
  if (audioCtx) return audioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

let unlocked = false;

/**
 * Call on first user interaction (click/touch) to unlock audio on
 * autoplay-restrictive browsers (iPad Chrome, Safari, etc.).
 */
export function unlockAudio() {
  if (unlocked) return;
  const ctx = getAudioContext();
  if (!ctx) {
    unlocked = true;
    return;
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  unlocked = true;
}

/**
 * Plays a pleasant 3.5-second bell chime (rising A-major arpeggio with
 * exponential decay). Returns silently if sound is disabled or audio is
 * blocked — never throws.
 */
export function playTaskChime() {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    // Bell-like tones with staggered start and exponential decay.
    const notes = [
      { freq: 880.0, start: 0.0, dur: 2.5 }, // A5
      { freq: 1108.73, start: 0.3, dur: 2.5 }, // C#6
      { freq: 1318.51, start: 0.6, dur: 2.5 }, // E6
      { freq: 1760.0, start: 1.0, dur: 2.5 }, // A6
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + start;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  } catch {
    // Audio blocked — toast and badge still work normally.
  }
}