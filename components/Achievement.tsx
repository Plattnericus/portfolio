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
const SHOW_MS = 4500;
const OUT_MS = 420;
const BAR = 12;

/**
 * When a secret is found, a small toast slides in at the top right, like an
 * advancement in a game: the secret's icon in its own box, "secret found",
 * its name, what it does, and how many of all there are now, with a short
 * chime. Several in a row queue up. It only exists while it is showing.
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
    const bar = el.querySelector<HTMLElement>(".ach-bar");
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
      const n = foundSecrets().length;
      const fill = Math.round((n / SECRETS.length) * BAR);
      if (icon) icon.textContent = c.icon.join("\n");
      if (name) name.textContent = id;
      if (line) line.textContent = c.line;
      if (count) count.textContent = `${String(n).padStart(2, "0")}/${SECRETS.length}`;
      if (bar) bar.textContent = `${"#".repeat(fill)}${".".repeat(BAR - fill)}`;
      el.hidden = false;
      void el.offsetWidth;
      el.classList.add("is-on");
      void chime();
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
      <pre className="ach-icon" aria-hidden="true" />
      <div className="ach-text">
        <p className="ach-head">
          <span>secret found</span>
          <span className="ach-count" />
        </p>
        <p className="ach-name" />
        <p className="ach-line" />
        <p className="ach-progress" aria-hidden="true">
          [<span className="ach-bar" />]
        </p>
      </div>
    </div>
  );
}
