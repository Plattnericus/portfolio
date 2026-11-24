"use client";

import { useEffect, useRef } from "react";
import { AsciiTitle } from "@/lib/ascii/ascii-title";
import { family, fontsReady } from "@/lib/fonts";
import { prefersReducedMotion } from "@/lib/loop";
import { ScrollTrigger } from "@/lib/motion";
import { textInVaried } from "@/lib/scramble";
import { skills } from "@/lib/site";
import { pulse, worldState } from "@/lib/world/state";

/** Pinned. The camera circles the object; every tool gives it a new shape. */
export default function Skills() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const reduced = prefersReducedMotion();
    const host = section.querySelector<HTMLElement>(".sk-name");
    const note = section.querySelector<HTMLElement>(".sk-note");
    const num = section.querySelector<HTMLElement>(".sk-num b");
    const items = Array.from(section.querySelectorAll<HTMLElement>(".sk-list li"));
    let title: AsciiTitle | null = null;
    let active = -1;
    let alive = true;

    const setActive = (i: number) => {
      if (i === active || !title) return;
      const first = active === -1;
      active = i;
      const s = skills[i];
      worldState.morph = i;
      if (!reduced && !first) pulse(0.68, 0.5, 1.2);
      if (num) num.textContent = String(i + 1).padStart(2, "0");
      items.forEach((li, k) => {
        li.classList.toggle("is-on", k === i);
        li.classList.toggle("is-past", k < i);
      });
      title.set(s.name);
      if (note) textInVaried(note, { text: s.note, duration: 0.7, delay: 0.15 });
    };

    let st: ScrollTrigger | null = null;
    fontsReady().then(() => {
      if (!alive || !host) return;
      title = new AsciiTitle(host, {
        fontFamily: family("mono"),
        displayFamily: family("display"),
        knockout: "#08080a",
        label: false,
        reveal: "vary",
      });
      st = ScrollTrigger.create({
        trigger: section,
        start: "top 80%",
        end: "bottom bottom",
        onUpdate: () => {
          const span = section.offsetHeight - window.innerHeight;
          const p = Math.max(0, (window.scrollY - section.offsetTop) / Math.max(1, span));
          setActive(Math.min(skills.length - 1, Math.floor(p * skills.length)));
        },
        onLeaveBack: () => {
          worldState.morph = 0;
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
    <section ref={root} id="skills" className="sk" data-section="skills">
      <h2 className="sr-only">Tools</h2>
      <div className="sk-pin">
        <div className="sk-copy" data-quiet>
          <p className="sk-num muted">
            <b>01</b> / {String(skills.length).padStart(2, "0")}
          </p>
          <div className="sk-name" aria-hidden="true" />
          <p className="sk-note muted">{skills[0].note}</p>
        </div>
        <ol className="sk-list" data-quiet>
          {skills.map((s, i) => (
            <li key={s.name}>
              <span className="sk-i">{String(i + 1).padStart(2, "0")}</span> {s.name}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
