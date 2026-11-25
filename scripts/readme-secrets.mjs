#!/usr/bin/env node
/*
 * Writes the hidden secrets menu at the end of README.md from the list in
 * lib/secrets.ts and the notes in lib/secret-notes.json, so the README never
 * falls behind the site. Runs before every build (prebuild).
 *   node scripts/readme-secrets.mjs          rewrite the block
 *   node scripts/readme-secrets.mjs --check  fail if it is out of date
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = join(root, "README.md");
const START = "<!-- secrets:start (written by scripts/readme-secrets.mjs from lib/secret-notes.json) -->";
const END = "<!-- secrets:end -->";

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

const items = ids
  .map((id, i) => {
    const n = notes[id];
    return `<details>\n<summary><code>${String(i + 1).padStart(2, "0")}</code> ${n.title}</summary>\n\n${n.how}\n\n</details>`;
  })
  .join("\n");

const block = `${START}
<details>
<summary><sub>&nbsp;.&nbsp;</sub></summary>

<br />

You looked. There are ${ids.length}. \`secrets\` in the shell counts the ones you have, and a card shows up in the corner whenever you find another. Open one at a time:

${items}

</details>
${END}`;

const readme = readFileSync(readmePath, "utf8");
let next;
if (readme.includes(START) && readme.includes(END)) {
  next = readme.slice(0, readme.indexOf(START)) + block + readme.slice(readme.indexOf(END) + END.length);
} else {
  // first run: replace the old hand-written section at the end
  const old = readme.indexOf("<details>\n<summary><sub>&nbsp;.&nbsp;</sub></summary>");
  if (old < 0) throw new Error("no secrets section found in README.md");
  next = `${readme.slice(0, old)}${block}\n`;
}

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
