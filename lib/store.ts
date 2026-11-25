"use client";

import type { Season } from "./seasons";

export type Theme = "dark" | "light";

type State = {
  /** the loader is leaving, the page may animate in */
  intro: boolean;
  /** the loader is gone: anything that can wait for it may start now */
  settled: boolean;
  theme: Theme;
  section: string;
  /** the season whose weather is on; in memory only, so a reload clears it */
  weather: Season | null;
};

const state: State = { intro: false, settled: false, theme: "dark", section: "hero", weather: null };
type Listener = (s: State, prev: State) => void;
const listeners = new Set<Listener>();

export const store = {
  get: () => state,
  set(patch: Partial<State>) {
    const prev = { ...state };
    let changed = false;
    for (const k of Object.keys(patch) as (keyof State)[]) {
      if (state[k] !== patch[k]) {
        (state as Record<string, unknown>)[k] = patch[k];
        changed = true;
      }
    }
    if (changed) for (const l of listeners) l(state, prev);
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** resolves once a flag is set */
  when(key: "intro" | "settled"): Promise<void> {
    if (state[key]) return Promise.resolve();
    return new Promise((res) => {
      const off = store.subscribe((s) => {
        if (s[key]) {
          off();
          res();
        }
      });
    });
  },
  /** resolves once the intro has started */
  whenIntro(): Promise<void> {
    return store.when("intro");
  },
};
