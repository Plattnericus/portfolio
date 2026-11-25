"use client";

/*
 * The one sound on the site: a short chime when a secret is found, two
 * notes and a faint shimmer, synthesised on the spot (no audio file). It is
 * quiet, only plays after the visitor has interacted with the page (the
 * browser's rule), and `mute` in the shell silences it until the next load.
 */

/** the notes, Hz: a rising fifth, then the octave as a shimmer */
const NOTES = [784, 1175];
const SHIMMER = 1568;
/** the note added when every secret is found */
const FANFARE = 1568;
const VOLUME = 0.07;

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(on: boolean) {
  muted = on;
}

export function isMuted() {
  return muted;
}

function tone(c: AudioContext, freq: number, at: number, length: number, gain: number, type: OscillatorType) {
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // a soft attack and a bell-like fall
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(env).connect(c.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** the chime; `all` adds a third, higher note, for the last secret */
export async function chime(all = false) {
  if (muted || typeof window === "undefined") return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx ??= new AC();
    if (ctx.state === "suspended") await ctx.resume();
    if (ctx.state !== "running") return;
    const t = ctx.currentTime + 0.01;
    tone(ctx, NOTES[0], t, 0.32, VOLUME, "triangle");
    tone(ctx, NOTES[1], t + 0.11, 0.55, VOLUME, "triangle");
    tone(ctx, SHIMMER, t + 0.11, 0.4, VOLUME * 0.25, "sine");
    if (all) tone(ctx, FANFARE, t + 0.24, 0.8, VOLUME, "triangle");
  } catch {
    // no audio: the card still shows
  }
}
