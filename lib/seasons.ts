"use client";

import { markSecret } from "./secrets";
import { store } from "./store";
import { pulse } from "./world/state";

/*
 * The four seasons, each with its own weather: in the world behind the page
 * and as a light layer of falling characters over every page. Typing a
 * season's name anywhere on the site switches it on, `season` opens a picker.
 * It lasts until the page is reloaded and is never stored.
 */

export type Season = "winter" | "spring" | "summer" | "autumn";

export const SEASONS: Season[] = ["winter", "spring", "summer", "autumn"];

/**
 * What comes to rest on the tops of the letters, in small pixels: its
 * colour, the shade on its underside, and how much of an edge it covers
 * (1: a closed line of snow; less: single petals or leaves).
 */
export type Settle = { color: string; shade: string; cover: number; glow?: boolean };

/** css px per pixel of what rests on the letters */
export const REST_PIXEL = 2;

/** what each season brings: a word for it, its colours, what falls and what stays */
export const WEATHER: Record<Season, { line: string; colors: string[]; chars: string; settle: Settle | null }> = {
  winter: {
    line: "snow",
    colors: ["#dfe7f0", "#ffffff", "#cfd8e3"],
    chars: "**+.'",
    settle: { color: "#f4f8ff", shade: "#a9bfdf", cover: 1 },
  },
  spring: {
    line: "blossom",
    colors: ["#f7b6c8", "#fde2ea", "#f4a3b8"],
    chars: "*'`,",
    settle: { color: "#f7b6c8", shade: "#e88aab", cover: 0.22 },
  },
  summer: {
    line: "fireflies",
    colors: ["#ffd36b", "#d9f27a", "#fff3a0"],
    chars: ".*+",
    // a few fireflies resting on the edges, glowing on and off
    settle: { color: "#e8ff8a", shade: "#c7e25a", cover: 0.07, glow: true },
  },
  autumn: {
    line: "falling leaves",
    colors: ["#e8742a", "#f0b23a", "#c2502c", "#d9a441"],
    chars: "/\\~,",
    settle: { color: "#e8742a", shade: "#c2502c", cover: 0.28 },
  },
};

const MONTH_TO_SEASON: Season[] = [
  "winter", "winter", "spring", "spring", "spring", "summer",
  "summer", "summer", "autumn", "autumn", "autumn", "winter",
];

/** the season it is now (meteorological, northern hemisphere) */
export function seasonNow(d = new Date()): Season {
  return MONTH_TO_SEASON[d.getMonth()];
}

/** switches the weather to a season, or off */
export function chooseSeason(season: Season | null) {
  store.set({ weather: season });
  if (!season) return;
  markSecret("season");
  pulse(0.5, 0.5, 2);
}
