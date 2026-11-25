"use client";

import { useEffect, useRef } from "react";
import { scramble } from "@/lib/scramble";
import { FOUND_EVENT, SECRETS, foundSecrets, markSecret, type SecretId } from "@/lib/secrets";
import { site } from "@/lib/site";
import { chime } from "@/lib/sound";

/*
 * Every secret's card: an icon of three lines in characters, and one line of
 * what was found. Lives here, in the lazily loaded part, not in the bundle
 * every page needs.
 */
const CARDS: Record<SecretId, { icon: [string, string, string]; line: string }> = {
  season: { icon: [" \\ | / ", "-- O --", " / | \\ "], line: "the weather is yours: snow, blossom, fireflies, leaves" },
  konami: { icon: [" ^ ^ v ", " v < > ", " < > BA"], line: "the old code still works: it opens the seasons" },
  mirror: { icon: [" .---. ", "[ (o) ]", " '---' "], line: "your camera, in characters" },
  reel: { icon: ["|o|=|o|", "| |>| |", "|o|=|o|"], line: "every film, back to back" },
  drop: { icon: ["   |   ", "  \\|/  ", " [___] "], line: "your own picture, in characters" },
  singularity: { icon: [" .---. ", "( (@) )", " '---' "], line: "you fell into /dev/null" },
  sudo: { icon: ["  .-.  ", " _|_|_ ", " |_#_| "], line: "nice try. still not root." },
  specimen: { icon: ["  /\\   ", " /__\\ a", "/    \\ "], line: "the site's own typeface" },
  screensaver: { icon: ["     z ", "   z   ", " Z     "], line: "you left it alone for a while" },
  dotfile: { icon: [" .---. ", " |.rc| ", " '---' "], line: "you read the .plan" },
  gravity: { icon: ["  | |  ", "  v v  ", "~~NEX~~"], line: "the name fell into the water" },
  jump: { icon: [" \\ | / ", "-=>>=- ", " / | \\ "], line: "held still, jumped ahead" },
  neofetch: { icon: ["@@  @@ ", "@@@ @@ ", "@@ @@@ "], line: "the system, at a glance" },
  source: { icon: [" .---. ", " |</>| ", " '---' "], line: "you read every project's code" },
  fortune: { icon: [" .--.  ", "( \"\" ) ", " '--'  "], line: "a line worth keeping" },
  console: { icon: [".-----.", "|>_   |", "'-----'"], line: "you looked under the hood" },
  lightspeed: { icon: ["--  == ", " ===>> ", "--  == "], line: "faster than the page" },
  snake: { icon: [" oooo@ ", " o     ", " ooo  *"], line: "five eaten, still hungry" },
  sculptor: { icon: ["\\  |  /", " \\ | / ", "  \\|/  "], line: "every cut open at once: the name carved up" },
  whirl: { icon: ["  .->  ", " ( N ) ", "  <-'  "], line: "circled three times, the name spins" },
  stone: { icon: [" o     ", "  ~ o  ", "~~~~~ o"], line: "skipped across the water" },
  vim: { icon: [":q!    ", "~      ", "~      "], line: "and you got out again" },
  coffee: { icon: ["  ) )  ", " [___]>", "  \\_/  "], line: "brewed. back to work." },
  hello: { icon: [" .---. ", "( hi! )", " '-v-' "], line: "it says hello back" },
  wave: { icon: ["N   O  ", " E X R ", "       "], line: "the letters of the name, in a wave" },
  roll: { icon: [" .--.  ", "(    ) ", " '-->  "], line: "a barrel roll through the world" },
  lights: { icon: ["  .-.  ", " (   ) ", "  )=(  "], line: "lights out: a torch follows the cursor" },
  zen: { icon: [" .   . ", "  zen  ", ".   .  "], line: "nothing but the world, for a while" },
};

/** how long a card stays, and how many steps its progress bar has */
/** how each one is found, shown as a small tag on the card */
const HOW: Record<SecretId, string> = {
  season: "typed",
  konami: "keys",
  mirror: "shell",
  reel: "shell",
  drop: "drop",
  singularity: "shell",
  sudo: "shell",
  specimen: "typed",
  screensaver: "idle",
  dotfile: "shell",
  gravity: "click",
  jump: "hold",
  neofetch: "shell",
  source: "hover",
  fortune: "shell",
  console: "console",
  lightspeed: "scroll",
  snake: "game",
  sculptor: "cursor",
  whirl: "cursor",
  stone: "swipe",
  vim: "shell",
  coffee: "shell",
  hello: "typed",
  wave: "typed",
  roll: "typed",
  lights: "typed",
  zen: "typed",
};

const SHOW_MS = 4800;
const OUT_MS = 420;

/**
 * When a secret is found, a small toast slides in at the top right, like an
 * advancement in a game: the secret's icon in an inventory slot, "secret
 * found!", its name with a tag for how it was found, what it does, and a
 * bar with a cell for every secret (the new one blinking), with a short
 * chime and a gleam passing over it. The last one turns it gold. Several in
 * a row queue up. It only exists while it is showing.
 * Also defines the function the console banner (Reveal) points to.
 */
export default function Achievement() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const icon = el.querySelector<HTMLElement>(".ach-icon");
    const name = el.querySelector<HTMLElement>(".ach-name");
    const line = el.querySelector<HTMLElement>(".ach-line");
    const count = el.querySelector<HTMLElement>(".ach-count");
    const head = el.querySelector<HTMLElement>(".ach-title");
    const tag = el.querySelector<HTMLElement>(".ach-tag");
    const cells = el.querySelector<HTMLElement>(".ach-cells");
    const queue: SecretId[] = [];
    let busy = false;
    let timer = 0;

    const next = () => {
      const id = queue.shift();
      if (!id) {
        busy = false;
        return;
      }
      busy = true;
      const c = CARDS[id];
      const found = foundSecrets();
      const n = found.length;
      const all = n >= SECRETS.length;
      if (icon) icon.textContent = c.icon.join("\n");
      if (name) name.textContent = id;
      if (tag) tag.textContent = HOW[id];
      if (line) line.textContent = all ? "every hidden thing, found" : c.line;
      if (head) head.textContent = all ? "all secrets found!" : "secret found!";
      if (count) count.textContent = `${String(n).padStart(2, "0")}/${SECRETS.length}`;
      if (cells) {
        // a cell for every secret: found ones lit, the new one blinking
        cells.innerHTML = SECRETS.map((s) => `<i class="${s === id ? "is-new" : found.includes(s) ? "is-found" : ""}"></i>`).join("");
      }
      el.classList.toggle("is-all", all);
      el.hidden = false;
      void el.offsetWidth;
      el.classList.add("is-on");
      void chime(all);
      if (name) scramble(name, { duration: 0.6, delay: 0.2, text: id });
      timer = window.setTimeout(() => {
        el.classList.remove("is-on");
        timer = window.setTimeout(() => {
          el.hidden = true;
          next();
        }, OUT_MS);
      }, SHOW_MS);
    };
    const onFound = (e: Event) => {
      queue.push((e as CustomEvent<SecretId>).detail);
      if (!busy) next();
    };
    window.addEventListener(FOUND_EVENT, onFound);

    // the console banner points here
    const w = window as unknown as { nexor?: () => void };
    if (!w.nexor) {
      w.nexor = () => {
        markSecret("console");
        console.log(
          `%c${foundSecrets().length} of ${SECRETS.length} secrets found. the shell knows more: press \``,
          `font-family: ui-monospace, Menlo, monospace; color: ${site.colors.accent};`,
        );
      };
    }

    return () => {
      window.removeEventListener(FOUND_EVENT, onFound);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={ref} className="ach" role="status" aria-live="polite" hidden>
      <div className="ach-slot" aria-hidden="true">
        <pre className="ach-icon" />
      </div>
      <div className="ach-text">
        <p className="ach-head">
          <span className="ach-title">secret found!</span>
          <span className="ach-count" />
        </p>
        <p className="ach-row">
          <span className="ach-name" />
          <span className="ach-tag" />
        </p>
        <p className="ach-line" />
        <p className="ach-cells" aria-hidden="true" />
      </div>
    </div>
  );
}
