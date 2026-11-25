"use client";

import type { World } from "./world";

/** what the sections ask of the world; the loop eases towards it */
export const worldState = {
  morph: 0,
  /** set once the loader has handed over to the scroll path */
  flying: false,
  /** fullscreen overlays open on top; the world skips rendering while > 0 */
  covered: 0,
  /** extra camera roll in radians on top of the path (the `roll` secret) */
  roll: 0,
  /** extra hyperspace push (the shell's `warp`), decays by itself */
  boost: 0,
  /** bursts requested by sections, x/y in 0..1 (y down) */
  pulses: [] as { x: number; y: number; strength: number }[],
};

export function pulse(x: number, y: number, strength = 1) {
  worldState.pulses.push({ x, y, strength });
}

/*
 * The world of the page now, if there is one. It comes and goes with the
 * home page (a visit to another page and back makes a new one), so ask for
 * it each time rather than keeping the first.
 */
let current: World | null = null;
let waiting: ((w: World) => void)[] = [];

/** resolves with the world as soon as there is one */
export function whenWorld(): Promise<World> {
  return current ? Promise.resolve(current) : new Promise((res) => waiting.push(res));
}

/** the world being shown, or null */
export function getWorld() {
  return current;
}

export function setWorld(w: World | null) {
  current = w;
  if (!w) return;
  const ready = waiting;
  waiting = [];
  ready.forEach((res) => res(w));
}
