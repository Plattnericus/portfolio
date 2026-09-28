"use client";

import type { CSSProperties } from "react";
import { useRef } from "react";
import {
  EASE,
  MM_DESKTOP,
  MM_MOBILE,
  ScrollTrigger,
  gsap,
  useGSAP,
} from "@/lib/animation";

const skills = [
  "Next.js & React",
  "Three.js & WebGL",
  "TypeScript end to end",
  "Docker & Linux",
  "Cloudflare & selfhosting",
  "Security mindset",
  "APIs & backends",
];

const TITLE_TWEEN_SECONDS = 1.05;
const CARD_TWEEN_SECONDS = {
  desktop: 0.82,
  mobile: 0.64,
} as const;

export default function Heat() {
  const sectionRef = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;

      const mm = gsap.matchMedia();

      const setupCards = ({
        duration,
        hidden,
      }: {
        duration: number;
        hidden: gsap.TweenVars;
      }) => {
        const cards = gsap.utils.toArray<HTMLElement>(".heat-card", section);
        const titleLines = gsap.utils.toArray<HTMLElement>(
          ".heat-title-line-inner",
          section,
        );

        gsap.set(cards, {
          autoAlpha: 0,
          ...hidden,
        });

        /* fromTo, not set + to: the tween owns its hidden start state, so a
           revert/re-run (React StrictMode mounts effects twice in dev) can't
           leave the title parked inside its mask after the reveal played */
        gsap.fromTo(
          titleLines,
          { yPercent: 100 },
          {
            yPercent: 0,
            duration: TITLE_TWEEN_SECONDS,
            stagger: 0.2,
            ease: EASE.lenisExpo,
            scrollTrigger: {
              trigger: section,
              start: "top 90%",
              once: true,
            },
          },
        );

        let activeCount = -1;

        const showCardsThrough = (nextCount: number, immediate = false) => {
          const clamped = gsap.utils.clamp(0, cards.length, nextCount);
          if (clamped === activeCount && !immediate) return;

          cards.forEach((card, index) => {
            const active = index < clamped;
            card.toggleAttribute("data-active", active);

            const vars = {
              autoAlpha: active ? 1 : 0,
              xPercent: active ? 0 : 100,
              yPercent: active ? 0 : 100,
              scale: active ? 1 : hidden.scale,
            };

            if (!active) Object.assign(vars, hidden);

            if (immediate) {
              gsap.set(card, vars);
            } else {
              gsap.to(card, {
                ...vars,
                duration,
                ease: EASE.lenisExpo,
                overwrite: "auto",
              });
            }
          });

          activeCount = clamped;
        };

        const stageForProgress = (progress: number) =>
          Math.min(cards.length, Math.floor(progress * cards.length) + 1);

        const cardTrigger = ScrollTrigger.create({
          trigger: section,
          // The first card is already waiting when the sticky frame locks. The
          // remaining beats are spread evenly across the shortened responsive
          // section instead of the old fixed 16-screen marathon.
          start: "top top",
          end: "bottom bottom",
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            showCardsThrough(stageForProgress(self.progress));
          },
          onRefresh: (self) => {
            showCardsThrough(stageForProgress(self.progress), true);
          },
        });

        /* the layout width: Safari's innerWidth follows a pinch zoom, and a
           forced refresh in the middle of one parks the page at 0 and back */
        const layoutWidth = () => document.documentElement.clientWidth;
        let viewportWidth = layoutWidth();
        let refreshFrame = 0;
        const refreshAfterWidthChange = () => {
          if (layoutWidth() === viewportWidth) return;
          viewportWidth = layoutWidth();
          window.cancelAnimationFrame(refreshFrame);
          refreshFrame = window.requestAnimationFrame(() => {
            ScrollTrigger.refresh();
          });
        };
        window.addEventListener("resize", refreshAfterWidthChange);

        const initialStage = stageForProgress(cardTrigger.progress);
        showCardsThrough(initialStage, true);

        return () => {
          window.removeEventListener("resize", refreshAfterWidthChange);
          window.cancelAnimationFrame(refreshFrame);
          cardTrigger.kill();
          gsap.killTweensOf([...cards, ...titleLines]);
        };
      };

      mm.add(MM_DESKTOP, () =>
        setupCards({
          duration: CARD_TWEEN_SECONDS.desktop,
          hidden: { xPercent: 72, yPercent: 72, scale: 0.96 },
        }),
      );

      mm.add(MM_MOBILE, () =>
        setupCards({
          duration: CARD_TWEEN_SECONDS.mobile,
          hidden: { xPercent: 18, yPercent: 34, scale: 0.94 },
        }),
      );

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section ref={sectionRef} className="heat" aria-labelledby="heat-title">
      <div className="heat-pin">
        <aside className="heat-title">
          <h2 id="heat-title">
            <span className="heat-title-line">
              <span className="heat-title-line-inner">Nexor brings</span>
            </span>{" "}
            <span className="heat-title-line ht-2">
              <span className="heat-title-line-inner">the heat</span>
            </span>
          </h2>
        </aside>

        <ul
          className="heat-card-stage"
          aria-label="Nexor capabilities"
          style={{ "--heat-card-count": skills.length } as CSSProperties}
        >
          {skills.map((skill, index) => (
            <li
              key={skill}
              className="heat-card"
              style={{ "--heat-card-index": index } as CSSProperties}
            >
              <p className="hc-num">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="hc-label">{skill}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
