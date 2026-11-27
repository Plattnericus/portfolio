"use client";

import { gsap } from "gsap";
import { prefersReducedMotion } from "./loop";
import type { Project } from "./site";
import type { Stat, Stats } from "./stats";

/*
 * The numbers under the projects (lib/stats.ts): /stats.json, fetched once,
 * and /live.json, the ones with a `refresh`, asked for again on schedule.
 * And a counter that runs them up.
 */

const get = (url: string, cache: RequestCache) =>
  fetch(url, { cache })
    .then((r) => (r.ok ? (r.json() as Promise<Stats>) : null))
    .catch(() => null);

let pending: Promise<Stats | null> | null = null;

/** the counted numbers, fetched once, the first time anything asks */
export function fetchStats() {
  pending ??= get("/stats.json", "default");
  return pending;
}

/** the live numbers as they are now */
export const fetchLive = () => get("/live.json", "no-store");

/** seconds between two reads of a project's live numbers, or 0 when it has none */
export function refreshOf(p: Project | undefined) {
  const every = (p?.stats ?? []).flatMap((s) => (s.refresh ? [s.refresh] : []));
  return every.length ? Math.min(...every) : 0;
}

/**
 * Every project's numbers in the order lib/site.ts gives them, each taken
 * from the first set that has it: a number missing from one set never
 * wipes the value another set (or an earlier read) has.
 */
export function mergeStats(list: Project[], ...sets: (Stats["projects"] | null | undefined)[]) {
  const out: Stats["projects"] = {};
  for (const p of list)
    out[p.slug] = p.stats
      .map((s) => sets.map((set) => set?.[p.slug]?.find((x) => x.label === s.label)).find(Boolean))
      .filter((x): x is Stat => !!x);
  return out;
}

const whole = new Intl.NumberFormat("en-US");
const tenths = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export type CountStyle = { format?: "compact"; suffix?: string };

/**
 * 60,001 in full; from a million on, 151.9M; `compact` also shortens
 * thousands (14.3k). The final value picks the form, so a counter never
 * changes form (or width) on its way up.
 */
function formatFor(final: number, { format, suffix = "" }: CountStyle) {
  const unit = final >= 1e6 ? 1e6 : format === "compact" && final >= 1e3 ? 1e3 : 0;
  const mark = unit === 1e6 ? "M" : "k";
  return (v: number) => (unit ? `${tenths.format(v / unit)}${mark}` : whole.format(Math.round(v))) + suffix;
}
/**
 * The display face draws a comma much like a full stop, so 60,001 would read
 * as sixty point something next to 151.9M. Separators are set in the mono
 * face, where a comma is plainly a comma.
 */
const show = (el: HTMLElement, text: string) => {
  el.innerHTML = text.replace(/,/g, "<i>,</i>");
};

/** a change this soon after the last one is a fast scroll: just show the number */
const RAPID_MS = 320;
const running = new WeakMap<HTMLElement, { tween: gsap.core.Tween; at: number }>();

/** stops a counter and leaves its place empty (the space it held is kept by CSS) */
export function clearCount(el: HTMLElement) {
  running.get(el)?.tween.kill();
  running.delete(el);
  el.style.minWidth = "";
  el.textContent = "\u00a0";
}

/**
 * Counts an element up to `value`, fast first and settling on the last
 * digits. It is held at the final number's width from the first frame, so
 * nothing beside it moves while it counts. A live number that changed runs
 * on `from` the value it showed.
 */
export function countTo(el: HTMLElement, value: number, delay = 0, style: CountStyle = {}, from = 0) {
  const format = formatFor(value, style);
  const final = format(value);
  const now = performance.now();
  const prev = running.get(el);
  prev?.tween.kill();
  el.style.minWidth = "";
  show(el, final);
  const size = parseFloat(getComputedStyle(el).fontSize) || 16;
  el.style.minWidth = `${(el.getBoundingClientRect().width / size).toFixed(3)}em`;
  if (prefersReducedMotion() || (prev && now - prev.at < RAPID_MS)) {
    running.set(el, { tween: gsap.to({}, { duration: 0 }), at: now });
    return;
  }
  const state = { v: from };
  show(el, format(from));
  const tween = gsap.to(state, {
    v: value,
    duration: 1.6,
    delay,
    ease: "expo.out",
    onUpdate() {
      show(el, format(state.v));
    },
    onComplete() {
      show(el, final);
    },
    onInterrupt() {
      show(el, final);
    },
  });
  running.set(el, { tween, at: now });
}
