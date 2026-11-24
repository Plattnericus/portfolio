"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/loop";
import { ScrollTrigger, gsap, scrollToTarget } from "@/lib/motion";
import { scramble } from "@/lib/scramble";
import { store } from "@/lib/store";

/** The wordmark itself lives in the world; this is only the small print. */
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
        <p className="hero-what">
          <span data-intro>fullstack developer</span>
          <span className="muted" data-intro>
            interfaces, servers, security
          </span>
        </p>
        <p className="hero-where muted">
          <span data-intro>typescript / next.js / three.js</span>
          <span data-intro>docker / linux / cloudflare</span>
        </p>
        <a
          className="tl hero-down"
          href="#about"
          data-scramble
          onClick={(e) => {
            e.preventDefault();
            scrollToTarget("#about", 3);
          }}
        >
          <span data-label data-intro>
            fly in
          </span>
          <span className="arrow">↓</span>
        </a>
      </div>
    </section>
  );
}
