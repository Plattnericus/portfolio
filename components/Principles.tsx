"use client";

import { useEffect, useRef } from "react";
import { AsciiTitle } from "@/lib/ascii/ascii-title";
import { family, fontsReady } from "@/lib/fonts";
import { ScrollTrigger } from "@/lib/motion";
import { textInVaried } from "@/lib/scramble";
import { principles, site } from "@/lib/site";

/** Pinned. Four principles, one at a time, printed large. */
export default function Principles() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const host = section.querySelector<HTMLElement>(".pr-title");
    const line = section.querySelector<HTMLElement>(".pr-line");
    const num = section.querySelector<HTMLElement>(".pr-num b");
    const steps = Array.from(section.querySelectorAll<HTMLElement>(".pr-steps li"));
    let title: AsciiTitle | null = null;
    let active = -1;
    let alive = true;

    const setActive = (i: number) => {
      if (i === active || !title) return;
      active = i;
      const p = principles[i];
      if (num) num.textContent = String(i + 1).padStart(2, "0");
      steps.forEach((s, k) => s.classList.toggle("is-on", k <= i));
      title.set(p.title);
      if (line) textInVaried(line, { text: p.line, duration: 0.7, delay: 0.2 });
    };

    let st: ScrollTrigger | null = null;
    fontsReady().then(() => {
      if (!alive || !host) return;
      title = new AsciiTitle(host, {
        fontFamily: family("mono"),
        displayFamily: family("display"),
        knockout: site.colors.bg,
        label: false,
        reveal: "vary",
      });
      st = ScrollTrigger.create({
        trigger: section,
        start: "top 80%",
        end: "bottom bottom",
        onUpdate: (self) => {
          const span = section.offsetHeight - window.innerHeight;
          const p = Math.max(0, (window.scrollY - (section.offsetTop)) / Math.max(1, span));
          setActive(Math.min(principles.length - 1, Math.floor(p * principles.length)));
          void self;
        },
      });
    });
    return () => {
      alive = false;
      st?.kill();
      title?.destroy();
    };
  }, []);

  return (
    <section ref={root} id="principles" className="pr" data-section="principles">
      <h2 className="sr-only">How I work</h2>
      <ol className="sr-only">
        {principles.map((p) => (
          <li key={p.title}>
            {p.title}: {p.line}
          </li>
        ))}
      </ol>
      <div className="pr-pin" aria-hidden="true">
        <div className="pr-copy" data-quiet>
          <p className="pr-num muted">
            <b>01</b> / {String(principles.length).padStart(2, "0")}
          </p>
          <div className="pr-title" />
          <p className="pr-line">{principles[0].line}</p>
        </div>
        <ol className="pr-steps">
          {principles.map((p) => (
            <li key={p.title} />
          ))}
        </ol>
      </div>
    </section>
  );
}
