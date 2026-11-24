"use client";

import { useEffect, useRef } from "react";
import { BlackHole } from "@/lib/ascii/black-hole";
import { family, fontsReady } from "@/lib/fonts";
import { bindPointer, onFrame, pointer, prefersReducedMotion } from "@/lib/loop";

/** The 404: a small black hole slowly eating the number. */
export default function Lost() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    bindPointer();
    const reduced = prefersReducedMotion();
    let hole: BlackHole | null = null;
    let off: (() => void) | null = null;
    let disposed = false;

    const size = () => {
      if (!hole) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const narrow = w / h < 1.1;
      if (narrow) {
        const R = Math.min(w, h) * 0.13;
        hole.resize(w, h, {
          hx: w * 0.5,
          hy: h * 0.6,
          R,
          text: { x: w * 0.08, y: h * 0.12, w: w * 0.84, h: h * 0.2 },
        }, 6);
      } else {
        const R = Math.min(w, h) * 0.105;
        hole.resize(w, h, {
          hx: w * 0.7,
          hy: h * 0.47,
          R,
          text: { x: w * 0.06, y: h * 0.25, w: w * 0.36, h: h * 0.34 },
        }, w > 1900 ? 8 : 7);
      }
    };

    // a click feeds it: everything falls faster for a moment
    const feed = () => {
      if (hole) hole.feed = Math.min(1.5, hole.feed + 0.8);
    };

    (async () => {
      await fontsReady();
      if (disposed) return;
      hole = new BlackHole(canvas, family("mono"), family("display"));
      size();
      window.addEventListener("resize", size);
      window.addEventListener("pointerdown", feed);
      let last = performance.now();
      const offFrame = onFrame(() => {
        if (!hole) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        hole.pointer = pointer.moved ? { x: pointer.x, y: pointer.y } : null;
        hole.render(now / 1000, dt, reduced);
      });
      off = () => {
        offFrame();
        window.removeEventListener("resize", size);
        window.removeEventListener("pointerdown", feed);
      };
    })();
    return () => {
      disposed = true;
      off?.();
    };
  }, []);

  return <canvas ref={ref} className="lost-hole" aria-hidden="true" />;
}
