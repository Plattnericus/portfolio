"use client";

import { useEffect, useRef } from "react";
import { onFrame } from "@/lib/loop";
import { getLenis, scrollToTarget } from "@/lib/motion";
import { bindHoverScramble, scramble } from "@/lib/scramble";
import { SHELL_EVENT } from "@/lib/secrets";
import { store } from "@/lib/store";

const LINKS = [
  { href: "#work", label: "work" },
  { href: "#skills", label: "tools" },
  { href: "#contact", label: "contact" },
];

/** what the middle of the bar says while a section is on screen */
const CHAPTERS: Record<string, string> = {
  hero: "00 start",
  about: "01 about",
  skills: "02 tools",
  principles: "03 principles",
  enter: "04 work",
  work: "04 work",
  index: "05 all projects",
  contact: "06 contact",
};

export default function Nav() {
  const ref = useRef<HTMLElement>(null);
  const chapterRef = useRef<HTMLSpanElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const offs: (() => void)[] = [];
    offs.push(bindHoverScramble(nav));

    // the chapter is whichever section covers the middle of the screen
    let current = "";
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-section]"));
    let lastPct = -1;
    offs.push(
      onFrame(() => {
        const mid = window.innerHeight / 2;
        let id = current;
        for (const s of sections) {
          const r = s.getBoundingClientRect();
          if (r.top <= mid && r.bottom > mid) {
            id = s.dataset.section ?? id;
            break;
          }
        }
        if (id !== current && chapterRef.current) {
          current = id;
          const label = CHAPTERS[id] ?? "";
          if (store.get().intro) scramble(chapterRef.current, { text: label, duration: 0.5, spread: 0.8 });
          else chapterRef.current.textContent = label;
        }
        const l = getLenis();
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const y = l?.scroll ?? window.scrollY;
        const pct = Math.round((y / Math.max(1, max)) * 100);
        if (pct !== lastPct && pctRef.current) {
          lastPct = pct;
          pctRef.current.textContent = String(Math.min(100, Math.max(0, pct))).padStart(3, "0");
        }
      }),
    );
    store.whenIntro().then(() => {
      nav.classList.add("is-in");
      nav.querySelectorAll<HTMLElement>("[data-intro]").forEach((el, i) => {
        scramble(el, { duration: 0.9, delay: 0.5 + i * 0.08 });
      });
    });
    return () => offs.forEach((f) => f());
  }, []);

  return (
    <header ref={ref} className="nav">
      <a
        className="nav-brand"
        href="#hero"
        onClick={(e) => {
          e.preventDefault();
          scrollToTarget(0, 3);
        }}
      >
        <b data-intro>nexor</b>
        <span data-intro>/plattnericus</span>
      </a>
      <div className="nav-now" aria-hidden="true">
        <span ref={chapterRef}>00 start</span>
      </div>
      <nav className="nav-links" aria-label="sections">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            data-scramble
            onClick={(e) => {
              e.preventDefault();
              scrollToTarget(l.href, 3);
            }}
          >
            <span data-label data-intro>
              {l.label}
            </span>
          </a>
        ))}
        <button
          type="button"
          className="nav-shell"
          aria-label="open the shell"
          data-scramble
          onClick={() => window.dispatchEvent(new Event(SHELL_EVENT))}
        >
          <span data-label data-intro>
            ~$
          </span>
        </button>
        <span className="nav-pct" aria-hidden="true">
          <span ref={pctRef}>000</span>%
        </span>
      </nav>
    </header>
  );
}
