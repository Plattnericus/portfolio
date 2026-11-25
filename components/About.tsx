"use client";

import { useEffect, useRef } from "react";
import { AsciiTitle } from "@/lib/ascii/ascii-title";
import { family, fontsReady } from "@/lib/fonts";
import { ScrollTrigger } from "@/lib/motion";
import { disciplines, site } from "@/lib/site";

const BAR = 12;
const width = Math.max(...disciplines.map((d) => d.length)) + 2;

/**
 * After the flight through the O: the line is not set, it is built. A print
 * head lays it down row by row from the bottom over a dotted plan of the
 * outline, while a build log next to it runs through the four parts of the
 * job. When the last row is down, it runs.
 */
export default function About() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = root.current;
    const host = section?.querySelector<HTMLElement>(".about-title");
    const log = section?.querySelector<HTMLElement>(".about-log");
    if (!section || !host || !log) return;
    const bars = Array.from(log.querySelectorAll<HTMLElement>("[data-step]"));
    let title: AsciiTitle | null = null;
    let st: ScrollTrigger | null = null;
    let alive = true;
    let last = -1;

    // each part of the job gets a quarter of the print
    const update = (k: number) => {
      const at = k >= 1 ? 401 : Math.round(k * 400);
      if (at === last) return;
      last = at;
      bars.forEach((el, i) => {
        const f = Math.max(0, Math.min(1, k * bars.length - i));
        const n = Math.round(f * BAR);
        const fill = el.querySelector("b");
        const rest = el.querySelector("i");
        const state = el.querySelector("em");
        if (fill) fill.textContent = "#".repeat(n);
        if (rest) rest.textContent = ".".repeat(BAR - n);
        if (state) state.textContent = f >= 1 ? "ok" : f > 0 ? `${String(Math.round(f * 100)).padStart(2, " ")}%` : "";
      });
      log.classList.toggle("is-done", k >= 1);
    };

    fontsReady().then(() => {
      if (!alive) return;
      title = new AsciiTitle(host, {
        fontFamily: family("mono"),
        displayFamily: family("display"),
        knockout: site.colors.bg,
        label: false,
        reveal: "print",
        onReveal: update,
      });
      st = ScrollTrigger.create({
        trigger: host,
        // as soon as the line comes into view, so a quick scroll still sees it
        start: "top bottom",
        once: true,
        onEnter: () => {
          log.classList.add("is-on");
          title?.set(site.line, true);
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
    <section ref={root} id="about" className="about" data-section="about">
      <h2 className="about-title at" data-quiet>
        <span className="sr-only">{site.line}</span>
      </h2>
      <p className="sr-only">{disciplines.join(", ")}.</p>
      <pre className="about-log" aria-hidden="true" data-quiet>
        <span className="about-cmd">$ make things</span>
        {disciplines.map((d) => (
          <span key={d} data-step>
            {"  "}
            {d.padEnd(width)}[<b />
            <i>{".".repeat(BAR)}</i>] <em />
          </span>
        ))}
        <span className="about-run">
          {"> "}running<span className="about-caret" />
        </span>
      </pre>
    </section>
  );
}
