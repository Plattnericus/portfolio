"use client";

import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export const EASE = {
  out: "expo.out",
  inOut: "expo.inOut",
  soft: "power3.out",
};

let lenis: Lenis | null = null;

export function getLenis() {
  return lenis;
}

export function startLenis(): Lenis {
  if (lenis) return lenis;
  lenis = new Lenis({
    lerp: 0.085,
    smoothWheel: true,
    wheelMultiplier: 0.9,
    touchMultiplier: 1.4,
  });
  lenis.on("scroll", ScrollTrigger.update);
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
  }
  gsap.ticker.add((t) => lenis?.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function scrollToTarget(target: string | number | HTMLElement, duration = 2.2) {
  const l = getLenis();
  if (l) {
    l.scrollTo(target, {
      duration,
      easing: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    });
  } else if (typeof target === "string") {
    document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
  }
}
