"use client";

import { useEffect, useRef } from "react";
import { AsciiTitle, type RevealMode } from "@/lib/ascii/ascii-title";
import { family, fontsReady } from "@/lib/fonts";
import { onFrame, prefersReducedMotion } from "@/lib/loop";
import { ScrollTrigger } from "@/lib/motion";
import { quotes, site } from "@/lib/site";

/** how the words come out as the page scrolls past */
type Mode = "type" | "sort";

const MARK = ["#5a2416", "#8f3a22", "#c24a2a", "#ff5a2e", "#ff8a5e", "#ffc2a8"];
/** how many quotes, from the start of the list, are set on the page */
export const PLACED = 2;

/**
 * A line worth keeping, between two sections. The quote mark is the site's
 * own " printed in characters; the words are tied to the scroll:
 *  type        typed out behind a caret
 *  sort        the letters start shuffled and are sorted into place
 */
export default function Quote({
  index,
  mode,
  section,
  scrub = true,
  className = "",
  id,
}: {
  /** which of the quotes; left out, one at random */
  index?: number;
  mode: Mode;
  section: string;
  /** tie the words to the scroll, or play them once on arrival */
  scrub?: boolean;
  className?: string;
  /** an anchor, so the camera path can hold still over it */
  id?: string;
}) {
  const root = useRef<HTMLElement>(null);
  // a random pick is made in the browser, or the server and the page disagree
  const fixed = index === undefined ? null : quotes[index];

  useEffect(() => {
    const el = root.current;
    const host = el?.querySelector<HTMLElement>(".qt-mark");
    const out = el?.querySelector<HTMLElement>(".qt-shown");
    if (!el || !host || !out) return;
    // the ones with a place of their own on the page are not drawn again
    const pool = quotes.slice(PLACED);
    const q = fixed ?? pool[Math.floor(Math.random() * pool.length)];
    if (!q) return;
    const text = q.text;
    if (!fixed) {
      const label = el.querySelector(".sr-only");
      const by = el.querySelector(".qt-by");
      if (label) label.textContent = text;
      if (by) by.textContent = byline(q);
    }
    const reduced = prefersReducedMotion();
    let mark: AsciiTitle | null = null;
    let alive = true;
    const offs: (() => void)[] = [];

    // the letters only, so spaces and punctuation stay where they are
    const slots = [...text].map((ch, i) => (/[A-Za-z0-9]/.test(ch) ? i : -1)).filter((i) => i >= 0);
    // for sort: the letters shuffled, then a selection sort written down
    // swap by swap, so the scroll can stop anywhere in the middle of it
    const target = slots.map((i) => text[i]);
    const arr = target.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const states = [arr.slice()];
    const swaps: number[] = [-1];
    for (let d = 0; d < arr.length; d++) {
      let j = d;
      while (arr[j] !== target[d]) j++;
      [arr[d], arr[j]] = [arr[j], arr[d]];
      states.push(arr.slice());
      swaps.push(j);
    }

    let last = "";
    const render = (p: number) => {
      const n = slots.length;
      const done = Math.floor(p * (n + 1));
      const chars = [...text];
      let html = "";
      if (mode === "type") {
        // what is typed so far, the caret, and the rest kept invisible so nothing moves
        const upto = done >= n ? text.length : (slots[done] ?? text.length);
        html = `${esc(text.slice(0, upto))}<b class="qt-caret"></b><span class="qt-ghost">${esc(text.slice(upto))}</span>`;
      } else {
        const d = Math.min(n, done);
        const state = states[d];
        // the two letters of the last swap light up
        const hot = d > 0 ? [d - 1, swaps[d]] : [];
        slots.forEach((at, k) => (chars[at] = state[k]));
        html = chars
          .map((ch, i) => {
            const k = slots.indexOf(i);
            if (k < 0) return esc(ch);
            if (hot.includes(k) && d < n) return `<b>${esc(ch)}</b>`;
            return k >= d ? `<i>${esc(ch)}</i>` : esc(ch);
          })
          .join("");
      }
      if (html === last) return;
      last = html;
      out.innerHTML = html;
    };

    if (reduced) render(1);
    else if (scrub) {
      render(0);
      const st = ScrollTrigger.create({
        trigger: el,
        start: "top 75%",
        end: "center 45%",
        scrub: true,
        onUpdate: (self) => render(self.progress),
      });
      offs.push(() => st.kill());
    } else {
      render(0);
      let off: (() => void) | null = null;
      const st = ScrollTrigger.create({
        trigger: el,
        start: "top 90%",
        once: true,
        onEnter: () => {
          const t0 = performance.now();
          off = onFrame(() => {
            const k = Math.min(1, (performance.now() - t0) / 2200);
            render(k);
            if (k >= 1) {
              off?.();
              off = null;
            }
          });
        },
      });
      offs.push(() => {
        st.kill();
        off?.();
      });
    }

    fontsReady().then(() => {
      if (!alive) return;
      mark = new AsciiTitle(host, {
        fontFamily: family("mono"),
        displayFamily: family("display"),
        palette: MARK,
        knockout: site.colors.bg,
        label: false,
        reveal: (mode === "type" ? "scan" : "sweep") as RevealMode,
      });
      const st = ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: () => mark?.set('"', true),
      });
      offs.push(() => st.kill());
    });

    return () => {
      alive = false;
      offs.forEach((f) => f());
      mark?.destroy();
    };
  }, [fixed, mode, scrub]);

  return (
    <section ref={root} id={id} className={`qt qt-${mode} ${className}`} data-section={section}>
      <figure className="qt-fig" data-quiet>
        <div className="qt-mark" aria-hidden="true" />
        <blockquote className="qt-text">
          <p>
            <span className="sr-only">{fixed?.text}</span>
            <span className="qt-shown" aria-hidden="true">
              {fixed?.text}
            </span>
          </p>
        </blockquote>
        <figcaption className="qt-by">{fixed ? byline(fixed) : ""}</figcaption>
      </figure>
    </section>
  );
}

function byline(q: { by: string; year?: number }) {
  return `-- ${q.by}${q.year ? `, ${q.year}` : ""}`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
