"use client";

export type Theme = "dark" | "light";

type State = {
  /** loader finished, page may animate in */
  intro: boolean;
  theme: Theme;
  section: string;
};

const state: State = { intro: false, theme: "dark", section: "hero" };
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
  /** resolves once the intro has played */
  whenIntro(): Promise<void> {
    if (state.intro) return Promise.resolve();
    return new Promise((res) => {
      const off = store.subscribe((s) => {
        if (s.intro) {
          off();
          res();
        }
      });
    });
  },
};
