"use client";

import { prefersReducedMotion } from "./loop";
import { markSecret } from "./secrets";
import type { Snippet } from "./snippets";

/*
 * A screen that prints a real excerpt of a project's code: the command that
 * would print it, then the lines, typed in one after another, lightly tinted.
 * Used by the films in Work and the monitor in All projects. The excerpts
 * come from /code.json (built from GitHub with the site); every hover picks
 * another one at random.
 */

let pending: Promise<Record<string, Snippet[]>> | null = null;

/** the excerpts, fetched once, the first time anything asks */
export function loadCode() {
  pending ??= fetch("/code.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, Snippet[]>>) : {}))
    .catch(() => ({}));
  return pending;
}

const last = new Map<string, Snippet>();

/** a random excerpt of the project, never the same one twice in a row */
export async function pickCode(slug: string) {
  const all = (await loadCode())[slug] ?? [];
  if (!all.length) return null;
  const pool = all.length > 1 ? all.filter((s) => s !== last.get(slug)) : all;
  const s = pool[Math.floor(Math.random() * pool.length)];
  last.set(slug, s);
  return s;
}

const KEYWORDS = new Set(
  (
    "const let var function return if else for while do switch case break continue class new this super " +
    "extends implements import export from async await static final public private protected void int " +
    "double bool boolean float long char String true false null undefined record sealed interface throw " +
    "try catch finally of in typeof instanceof yield factory late required override enum type"
  ).split(" "),
);

const TOKEN =
  /(\/\/.*$|\/\*.*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?[fdL]?\b|[A-Za-z_$][\w$]*)/g;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** one line as spans: comments, strings, numbers, keywords */
function tint(line: string) {
  const t = line.trimStart();
  // doc comments run over many lines; their middle lines start with *
  if (t.startsWith("*") || t.startsWith("/*")) return `<span class="tk-c">${esc(line)}</span>`;
  let out = "";
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const tok = m[0];
    const at = m.index ?? 0;
    out += esc(line.slice(last, at));
    last = at + tok.length;
    const c = tok[0];
    const cls =
      c === "/" ? "tk-c" : c === '"' || c === "'" || c === "`" ? "tk-s" : /\d/.test(c) ? "tk-n" : KEYWORDS.has(tok) ? "tk-k" : "";
    out += cls ? `<span class="${cls}">${esc(tok)}</span>` : esc(tok);
  }
  return out + esc(line.slice(last));
}

/** builds the inside of a .code element once; returns its parts */
function parts(view: HTMLElement) {
  if (!view.firstElementChild) {
    view.innerHTML = '<p class="code-head"></p><pre class="code-body"></pre>';
  }
  return {
    head: view.querySelector<HTMLElement>(".code-head"),
    body: view.querySelector<HTMLElement>(".code-body"),
  };
}

export function showCode(view: HTMLElement, snip: Snippet) {
  const { head, body } = parts(view);
  if (!head || !body) return;
  const end = snip.start + snip.lines.length - 1;
  head.textContent = `$ sed -n '${snip.start},${end}p' ${snip.path}`;
  const width = String(end).length;
  body.innerHTML = snip.lines
    .map(
      (l, i) =>
        `<span class="code-line" style="--i:${i}"><i>${String(snip.start + i).padStart(width, " ")}</i>${tint(l)}${
          i === snip.lines.length - 1 ? '<b class="code-caret"></b>' : ""
        }</span>`,
    )
    .join("");
  // as large as the screen allows, so every line fits top to bottom
  const css = getComputedStyle(view);
  const max = parseFloat(css.getPropertyValue("--code-max")) || 14;
  const fit = view.clientHeight / ((snip.lines.length + 4.5) * 1.5);
  view.style.fontSize = `${Math.max(8, Math.min(max, fit)).toFixed(2)}px`;
  view.classList.remove("is-on");
  if (!prefersReducedMotion()) void view.offsetWidth;
  view.classList.add("is-on");
}

export function hideCode(view: HTMLElement) {
  view.classList.remove("is-on");
}

/** reading the code of every project is worth a secret */
const read = new Set<string>();
export async function noteRead(slug: string) {
  read.add(slug);
  const all = await loadCode();
  const have = Object.keys(all).filter((k) => all[k]?.length);
  if (have.length > 1 && have.every((k) => read.has(k))) markSecret("source");
}
