"use client";

import type { World } from "./world";

/** what the sections ask of the world; the loop eases towards it */
export const worldState = {
  morph: 0,
  /** set once the loader has handed over to the scroll path */
  flying: false,
  /** the season whose weather is on, once its secret was found */
  weather: null as null | "winter" | "spring" | "summer" | "autumn",
  /** fullscreen overlays open on top; the world skips rendering while > 0 */
  covered: 0,
  /** extra hyperspace push (the shell's `warp`), decays by itself */
  boost: 0,
  /** bursts requested by sections, x/y in 0..1 (y down) */
  pulses: [] as { x: number; y: number; strength: number }[],
};

export function pulse(x: number, y: number, strength = 1) {
  worldState.pulses.push({ x, y, strength });
}

let resolveWorld: (w: World) => void = () => undefined;
export const worldReady = new Promise<World>((res) => {
  resolveWorld = res;
});
export function setWorld(w: World) {
  resolveWorld(w);
}
