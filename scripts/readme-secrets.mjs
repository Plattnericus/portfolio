#!/usr/bin/env node
/*
 * Writes the Secrets section of README.md from the list in lib/secrets.ts
 * and the notes in lib/secret-notes.json, so the README never falls behind
 * the site. Runs before every build (prebuild).
 *   node scripts/readme-secrets.mjs          rewrite the section
 *   node scripts/readme-secrets.mjs --check  fail if it is out of date
 *
 * The section is spoiler-safe by layers: a warning and a count per place up
 * front, then hints (folded), then the full solutions (folded, one table
 * per place, behind a second warning).
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
  shell: { label: "Shell", what: "typed into the shell: <kbd>`</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd>" },
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

/** a table cell: one line, no stray pipes */
const cell = (s) => s.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
const num = (id) => String(ids.indexOf(id) + 1).padStart(2, "0");
const inPlace = (key) => ids.filter((id) => notes[id].where === key);
const places = Object.keys(PLACES).filter((key) => inPlace(key).length);

const overview = [
  "| Where | How | Secrets |",
  "| --- | --- | ---: |",
  ...places.map((key) => `| **${PLACES[key].label}** | ${PLACES[key].what} | ${inPlace(key).length} |`),
  `| **Total** | | **${ids.length}** |`,
].join("\n");

const hints = [
  "| # | Where | Hint |",
  "| ---: | --- | --- |",
  // no names here: for most of them the name is the answer
  ...ids.map((id) => `| ${num(id)} | ${PLACES[notes[id].where].label} | ${cell(notes[id].hint)} |`),
].join("\n");

const solutions = places
  .map((key) => {
    const rows = inPlace(key).map((id) => `| ${num(id)} | **${cell(notes[id].title)}** | ${cell(notes[id].how)} |`);
    return `<details>
<summary><b>${PLACES[key].label}</b> &nbsp;·&nbsp; ${rows.length} ${rows.length === 1 ? "secret" : "secrets"}</summary>

<br />

| # | Secret | How |
| ---: | --- | --- |
${rows.join("\n")}

</details>`;
  })
  .join("\n\n");

const block = `${START}
## Secrets

> [!WARNING]
> **Spoilers ahead.** The site hides ${ids.length} secrets, and finding them yourself is the fun part. Everything below gives them away, one layer at a time: first where to look, then hints, then the full solutions. Open only as much as you want to know.

\`secrets\` in the shell counts the ones you have found, and a card slides in at the top right for each new one. Only their names are kept, in your browser's \`localStorage\`.

${overview}

### Hints

A nudge for each, without the answer and without the name, which for most of them would be the answer. The numbers match the solutions.

<details>
<summary><b>Show the hints</b></summary>

<br />

${hints}

</details>

### Solutions

> [!CAUTION]
> **Full spoilers.** Each list below gives away every secret in it, step by step.

${solutions}
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
