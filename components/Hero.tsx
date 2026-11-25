"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/loop";
import { ScrollTrigger, gsap, scrollToTarget } from "@/lib/motion";
import { scramble } from "@/lib/scramble";
import { site } from "@/lib/site";
import { store } from "@/lib/store";

/**
 * The wordmark itself lives in the world; under it only what this is, and
 * a falling cue that the way on is down.
 */
export default function Hero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-intro]");
    items.forEach((n) => (n.style.visibility = "hidden"));
    // the small print leaves as soon as the flight starts
    const foot = el.querySelector<HTMLElement>(".hero-foot");
    const st = foot
      ? ScrollTrigger.create({
          trigger: el,
          start: "top top",
          end: "+=180",
          scrub: true,
          animation: gsap.fromTo(foot, { opacity: 1, y: 0 }, { opacity: 0, y: 24, ease: "none" }),
        })
      : null;
    store.whenIntro().then(() => {
      items.forEach((n, i) => {
        n.style.visibility = "";
        if (!prefersReducedMotion()) scramble(n, { duration: 1.1, delay: 0.3 + i * 0.12 });
      });
    });
    return () => {
      st?.kill();
    };
  }, []);

  return (
    <section ref={root} id="hero" className="hero" data-section="hero">
      <h1 className="sr-only">Nexor / Plattnericus, fullstack developer</h1>
      <div className="hero-foot">
        <p className="hero-role">
          <span data-intro>{site.role.toLowerCase()}</span>
        </p>
        <a
          className="hero-down"
          href="#about"
          aria-label="fly in"
          onClick={(e) => {
            e.preventDefault();
            scrollToTarget("#about", 3);
          }}
        >
          <span className="hero-cue" aria-hidden="true">
            <i>{":\n:\nv"}</i>
          </span>
        </a>
      </div>
    </section>
  );
}
