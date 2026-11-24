"use client";

/*
 * One secret per season. It can only be found while its season lasts
 * (meteorological seasons, northern hemisphere); once found it stays in the
 * visitor's collection and the season's weather drifts through the site
 * until the season ends. The record lives in localStorage on the visitor's
 * own device and never leaves it.
 */

export type Season = "winter" | "spring" | "summer" | "autumn";

export const SEASONS: Season[] = ["winter", "spring", "summer", "autumn"];

const MONTH_TO_SEASON: Season[] = [
  "winter", "winter", "spring", "spring", "spring", "summer",
  "summer", "summer", "autumn", "autumn", "autumn", "winter",
];

export type SeasonInfo = {
  season: Season;
  /** the year the season started in (December belongs to the next winter) */
  year: number;
  key: string;
  /** first day of the next season */
  next: { season: Season; date: Date };
  /** December 1 to 26 */
  holidays: boolean;
};

export function seasonOf(d = new Date()): SeasonInfo {
  const m = d.getMonth();
  const season = MONTH_TO_SEASON[m];
  const year = m <= 1 ? d.getFullYear() - 1 : d.getFullYear();
  const starts: Record<Season, [number, number]> = {
    spring: [year + (season === "winter" ? 1 : 0), 2],
    summer: [year, 5],
    autumn: [year, 8],
    winter: [year, 11],
  };
  const order = SEASONS;
  const nextSeason = order[(order.indexOf(season) + 1) % 4];
  const [ny, nm] = starts[nextSeason];
  return {
    season,
    year,
    key: `${year}-${season}`,
    next: { season: nextSeason, date: new Date(ny, nm, 1) },
    holidays: m === 11 && d.getDate() <= 26,
  };
}

const STORE = "plattnericus.seasons";

export function foundKeys(): string[] {
  try {
    const raw = window.localStorage.getItem(STORE);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function markFound(key: string) {
  try {
    const list = new Set(foundKeys());
    list.add(key);
    window.localStorage.setItem(STORE, JSON.stringify([...list]));
  } catch {
    // private mode or storage off: the secret still plays, it just is not kept
  }
}

export function isFound(key: string) {
  return foundKeys().includes(key);
}
