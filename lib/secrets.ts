"use client";

/*
 * Every hidden thing on the site, and which ones this browser has found.
 * Only the names are kept, in localStorage, nothing else and nowhere else.
 */

export const SECRETS = [
  "season",
  "konami",
  "mirror",
  "reel",
  "drop",
  "singularity",
  "sudo",
  "specimen",
  "screensaver",
  "dotfile",
  "gravity",
  "jump",
  "neofetch",
  "source",
  "fortune",
  "console",
  "lightspeed",
  "snake",
  "sculptor",
  "whirl",
  "stone",
  "vim",
  "coffee",
  "hello",
  "wave",
  "roll",
  "lights",
  "zen",
] as const;
export type SecretId = (typeof SECRETS)[number];

/*
 * How each one is found is written down once, in lib/secret-notes.json, and
 * `npm run readme` prints it into the hidden part of the README (it also runs
 * before every build, and `npm run lint` fails if the README is behind).
 */


const STORE = "plattnericus.secrets";

/** opens the ASCII cinema: the camera, the reel or a dropped file */
export const CINEMA_EVENT = "plattnericus:cinema";
export type CinemaSource = { kind: "camera" } | { kind: "reel" } | { kind: "file"; file: File };

/** opens the season picker (the Konami code, the shell, five taps in the footer) */
export const SEASONS_EVENT = "plattnericus:seasons";

/** opens or toggles the shell */
export const SHELL_EVENT = "plattnericus:shell";

export function foundSecrets(): SecretId[] {
  try {
    const raw = window.localStorage.getItem(STORE);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((k): k is SecretId => (SECRETS as readonly string[]).includes(k as string));
  } catch {
    return [];
  }
}

/** fired whenever a new secret is found */
export const FOUND_EVENT = "plattnericus:found";

export function markSecret(id: SecretId) {
  try {
    const list = new Set(foundSecrets());
    if (list.has(id)) return;
    list.add(id);
    window.localStorage.setItem(STORE, JSON.stringify([...list]));
    window.dispatchEvent(new CustomEvent(FOUND_EVENT, { detail: id }));
  } catch {
    // storage off: it still plays, it just is not remembered
  }
}

/** opens the type specimen of the site's own face */
export const SPECIMEN_EVENT = "plattnericus:specimen";

export function openCinema(source: CinemaSource) {
  window.dispatchEvent(new CustomEvent<CinemaSource>(CINEMA_EVENT, { detail: source }));
}
