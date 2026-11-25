#!/usr/bin/env node
/*
 * Writes the end of README.md from the list in lib/secrets.ts and the notes
 * in lib/secret-notes.json, so the README never falls behind the site.
 * Runs before every build (prebuild).
 *   node scripts/readme-secrets.mjs          rewrite the block
 *   node scripts/readme-secrets.mjs --check  fail if it is out of date
 *
 * The block stays out of sight: a folded dot after the footer, no heading
 * (GitHub would list it in the outline), nothing linked from above. Inside,
 * one folded line per secret, grouped by where it is found. The line is only
 * a hint; the name and the full solution sit behind it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = join(root, "README.md");
const START = "<!-- secrets:start (written by scripts/readme-secrets.mjs from lib/secret-notes.json) -->";
const END = "<!-- secrets:end -->";

/** where a secret is found, in the order the README lists them */
const PLACES = {
  shell: { label: "Shell", what: "typed into the shell, <kbd>`</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd>" },
  keys: { label: "Typed anywhere", what: "typed on the page itself, no field needed" },
  pointer: { label: "Mouse and touch", what: "clicked, held, dragged, swiped or scrolled" },
  elsewhere: { label: "Elsewhere", what: "outside the page, or by doing nothing at all" },
};

const list = readFileSync(join(root, "lib/secrets.ts"), "utf8").match(/export const SECRETS = \[([\s\S]*?)\] as const/);
if (!list) throw new Error("SECRETS not found in lib/secrets.ts");
const ids = [...list[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
const notes = JSON.parse(readFileSync(join(root, "lib/secret-notes.json"), "utf8"));

const missing = ids.filter((id) => !notes[id]);
const extra = Object.keys(notes).filter((id) => !ids.includes(id));
if (missing.length || extra.length) {
  console.error(`secret notes out of step: missing ${missing.join(", ") || "-"}, unknown ${extra.join(", ") || "-"}`);
  process.exit(1);
}
const broken = ids.filter((id) => !PLACES[notes[id].where] || !notes[id].title || !notes[id].hint || !notes[id].how);
if (broken.length) {
  console.error(`secret notes incomplete (title, where, hint, how): ${broken.join(", ")}`);
  process.exit(1);
}

/** one line; <summary> is HTML, so markdown is not parsed there */
const line = (s) => s.replace(/\s*\n\s*/g, " ").trim();
const html = (s) => line(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const places = Object.keys(PLACES).filter((key) => ids.some((id) => notes[id].where === key));
// numbered in the order they are listed, so the list reads 01 to the end
const order = places.flatMap((key) => ids.filter((id) => notes[id].where === key));
const num = (id) => String(order.indexOf(id) + 1).padStart(2, "0");

const entry = (id) => `<details>
<summary><code>${num(id)}</code>&nbsp; ${html(notes[id].hint)}</summary>

> **${line(notes[id].title)}**<br />
> ${line(notes[id].how)}

</details>`;

const groups = places
  .map((key) => {
    const inPlace = order.filter((id) => notes[id].where === key);
    return `<br />

<b>${PLACES[key].label}</b> &nbsp;<sub>${inPlace.length} &nbsp;·&nbsp; ${PLACES[key].what}</sub>

${inPlace.map(entry).join("\n")}`;
  })
  .join("\n\n");

const block = `${START}
<details>
<summary><sub>&nbsp;.&nbsp;</sub></summary>

<br />

You looked. The site hides ${ids.length} secrets. \`secrets\` in the shell counts the ones you have found, and a card slides in at the top right for each new one.

Every line is only a hint. Open it for the answer.

${groups}

<br />

</details>
${END}`;

const readme = readFileSync(readmePath, "utf8");
if (!readme.includes(START) || !readme.includes(END)) throw new Error("no secrets markers in README.md");
const next = readme.slice(0, readme.indexOf(START)) + block + readme.slice(readme.indexOf(END) + END.length);

if (process.argv.includes("--check")) {
  if (next !== readme) {
    console.error("README.md secrets are out of date: run npm run readme");
    process.exit(1);
  }
  console.log(`README.md secrets up to date (${ids.length})`);
} else if (next !== readme) {
  writeFileSync(readmePath, next);
  console.log(`README.md secrets written (${ids.length})`);
} else console.log(`README.md secrets already up to date (${ids.length})`);
