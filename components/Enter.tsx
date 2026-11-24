"use client";

import { useEffect, useRef } from "react";
import { ZoomWord } from "@/lib/ascii/zoom-word";
import { family, fontsReady } from "@/lib/fonts";
import { onFrame, prefersReducedMotion } from "@/lib/loop";
import { ScrollTrigger } from "@/lib/motion";
import { site } from "@/lib/site";
import { worldState } from "@/lib/world/state";

/** where the zoom has filled the screen */
const COVER_AT = 0.8;
/** from here the characters fall away */
const DISSOLVE_AT = 0.86;
const START = 0.035;

/**
 * Pinned. The name arrives as a speck and grows with every scroll step, an
 * exponential zoom so it never slows down, until the camera is inside the
 * crossing of the X and characters fill the screen. Then they fall away into
 * hyperspace and the work begins.
 */
export default function Enter() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const pin = section.querySelector<HTMLElement>(".en-pin");
    const canvas = section.querySelector<HTMLCanvasElement>(".en-canvas");
    const mag = section.querySelector<HTMLElement>(".en-mag b");
    if (!pin || !canvas) return;
    const reduced = prefersReducedMotion();
    let zoom: ZoomWord | null = null;
    let progress = 0;
    let visible = false;
    let alive = true;
    let lastMag = "";
    let boosted = false;
    const offs: (() => void)[] = [];

    const size = () => {
      if (!zoom) return;
      const w = window.innerWidth;
      zoom.resize(w, window.innerHeight, w < 700 ? 6 : w > 1900 ? 8 : 7);
    };

    fontsReady().then(() => {
      if (!alive) return;
      zoom = new ZoomWord(canvas, family("mono"), family("display"), site.name.toUpperCase());
      size();
      window.addEventListener("resize", size);
      offs.push(() => window.removeEventListener("resize", size));

      const st = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          progress = self.progress;
        },
        onToggle: (self) => {
          visible = self.isActive;
        },
      });
      offs.push(() => st.kill());

      offs.push(
        onFrame((t) => {
          if (!zoom) return;
          if (!visible && progress > 0 && progress < 1) visible = true;
          if (!visible) return;
          const cover = zoom.coverScale();
          let scale: number;
          let dissolve = 0;
          if (reduced) scale = 1;
          else {
            const k = Math.min(1, progress / COVER_AT);
            scale = START * Math.pow(cover / START, k);
            dissolve = Math.max(0, (progress - DISSOLVE_AT) / (1 - DISSOLVE_AT));
          }
          const opacity = reduced ? 1 : Math.min(1, progress / 0.04);
          const heat = reduced ? 0 : Math.max(0, Math.min(1, (progress - COVER_AT * 0.7) / (COVER_AT * 0.35)));
          zoom.render(scale, t, dissolve, opacity, heat);

          // the world goes quiet behind the word, and comes back at warp
          const quiet = progress > 0.02 && progress < DISSOLVE_AT + 0.04;
          if (quiet) pin.setAttribute("data-quiet", "");
          else pin.removeAttribute("data-quiet");
          if (!reduced && progress > DISSOLVE_AT && !boosted) {
            boosted = true;
            worldState.boost = 0.8;
          }
          if (progress < DISSOLVE_AT - 0.05) boosted = false;

          const m = `${scale.toFixed(scale < 10 ? 2 : scale < 100 ? 1 : 0)}`;
          if (mag && m !== lastMag) {
            lastMag = m;
            mag.textContent = m;
          }
        }),
      );
    });

    return () => {
      alive = false;
      offs.forEach((f) => f());
    };
  }, []);

  return (
    <section ref={root} id="enter" className="en" data-section="enter" aria-label={site.name}>
      <div className="en-pin">
        <canvas className="en-canvas" aria-hidden="true" />
        <p className="en-mag muted" aria-hidden="true">
          x <b>0.04</b>
        </p>
      </div>
    </section>
  );
}
