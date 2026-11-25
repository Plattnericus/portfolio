"use client";

/*
 * Words typed anywhere on the page, outside of text fields, each bound to
 * something that happens. One keyboard listener serves all of them; it is
 * added with the first word.
 */

type Fn = () => void;

const words = new Map<string, Set<Fn>>();
/** long enough for the longest word */
const MEMORY = 16;
let typed = "";
let bound = false;

function onKey(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.key.length !== 1) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  typed = (typed + e.key.toLowerCase()).slice(-MEMORY);
  // the longest word that fits wins, so `seasons` is not read as `season` + s
  let hit = "";
  for (const w of words.keys()) if (typed.endsWith(w) && w.length > hit.length) hit = w;
  if (!hit) return;
  typed = "";
  words.get(hit)?.forEach((fn) => fn());
}

/** calls fn whenever `word` is typed on the page; returns the unbind */
export function onTyped(word: string, fn: Fn): () => void {
  if (!bound) {
    window.addEventListener("keydown", onKey);
    bound = true;
  }
  const w = word.toLowerCase();
  const set = words.get(w) ?? new Set<Fn>();
  set.add(fn);
  words.set(w, set);
  return () => {
    set.delete(fn);
    if (!set.size) words.delete(w);
  };
}
