"use client";

/** next/font exposes each family as a CSS variable on <html>; canvas and GL
    code need the resolved family string to draw with the same faces. */
export type FontRole = "mono" | "display";

const cache = new Map<FontRole, string>();

export function family(role: FontRole): string {
  const hit = cache.get(role);
  if (hit) return hit;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--font-${role}`)
    .trim();
  const resolved = value || "monospace";
  cache.set(role, resolved);
  return resolved;
}

let ready: Promise<void> | null = null;

export function fontsReady(): Promise<void> {
  if (ready) return ready;
  ready = Promise.all([
    document.fonts.load(`400 16px ${family("mono")}`),
    document.fonts.load(`600 16px ${family("mono")}`),
    document.fonts.load(`900 100px ${family("display")}`),
    document.fonts.load(`700 100px ${family("display")}`),
  ])
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch(() => undefined);
  return ready;
}
