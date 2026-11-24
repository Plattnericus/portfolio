"use client";

import { gsap } from "gsap";

export type FrameFn = (time: number, deltaMs: number) => void;

/** every animated thing on the page shares GSAP's ticker, which Lenis drives too */
export function onFrame(fn: FrameFn): () => void {
  const cb = (time: number, delta: number) => fn(time, delta);
  gsap.ticker.add(cb);
  return () => gsap.ticker.remove(cb);
}

/** calls back with true/false as the element enters/leaves (with margin) */
export function watchVisible(
  el: Element,
  cb: (visible: boolean) => void,
  margin = "15% 0px 15% 0px",
): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) cb(e.isIntersecting);
    },
    { rootMargin: margin },
  );
  io.observe(el);
  return () => io.disconnect();
}

export const pointer = {
  x: -9999,
  y: -9999,
  /** smoothed */
  sx: -9999,
  sy: -9999,
  vx: 0,
  vy: 0,
  speed: 0,
  down: false,
  moved: false,
  /** clicks, page coords + time, consumed by whoever wants ripples */
  clicks: [] as { x: number; y: number; t: number }[],
};

let pointerBound = false;

export function bindPointer() {
  if (pointerBound || typeof window === "undefined") return;
  pointerBound = true;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!pointer.moved) {
        pointer.sx = e.clientX;
        pointer.sy = e.clientY;
      }
      pointer.vx = e.clientX - pointer.x;
      pointer.vy = e.clientY - pointer.y;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.moved = true;
    },
    { passive: true },
  );
  window.addEventListener("pointerdown", (e) => {
    pointer.down = true;
    pointer.clicks.push({ x: e.clientX, y: e.clientY, t: performance.now() / 1000 });
    if (pointer.clicks.length > 6) pointer.clicks.shift();
  });
  window.addEventListener("pointerup", () => {
    pointer.down = false;
  });
  document.addEventListener("pointerleave", () => {
    pointer.moved = false;
  });
  gsap.ticker.add(() => {
    pointer.sx += (pointer.x - pointer.sx) * 0.14;
    pointer.sy += (pointer.y - pointer.sy) * 0.14;
    const s = Math.hypot(pointer.vx, pointer.vy);
    pointer.speed += (s - pointer.speed) * 0.2;
    pointer.vx *= 0.8;
    pointer.vy *= 0.8;
  });
}

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function isCoarse() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
