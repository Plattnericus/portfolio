"use client";

import { useEffect, useRef } from "react";
import { isCoarse, onFrame, pointer, prefersReducedMotion } from "@/lib/loop";

/**
 * A terminal block for a cursor. It inverts whatever is under it, widens
 * over links and blinks once the pointer rests.
 */
export default function Cursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const block = ref.current;
    if (!block || isCoarse() || prefersReducedMotion()) return;
    document.documentElement.classList.add("has-cursor");

    let hot = 0;
    let hotTarget = 0;
    let pressed = 0;
    let lastX = -1;
    let lastY = -1;
    let idleSince = 0;
    // its resting size comes from the stylesheet (.cursor-block), so it
    // grows with the page on large screens
    let base = { w: 0, h: 0 };
    const measure = () => {
      block.style.width = "";
      block.style.height = "";
      const r = block.getBoundingClientRect();
      base = { w: r.width, h: r.height };
    };
    measure();
    window.addEventListener("resize", measure);
    const over = (e: PointerEvent) => {
      const t = e.target as Element | null;
      hotTarget = t?.closest("a, button, [data-hot]") ? 1 : 0;
    };
    window.addEventListener("pointerover", over, { passive: true });

    // it steps aside while the page scrolls, and is back as soon as the
    // mouse moves or the scrolling has stopped
    const BACK_AFTER_MS = 300;
    let scrolling = false;
    let back = 0;
    let movedAt = 0;
    const onScroll = () => {
      // a mouse that is moving wins over a page that is still gliding
      if (performance.now() - movedAt < 200) return;
      scrolling = true;
      window.clearTimeout(back);
      back = window.setTimeout(() => (scrolling = false), BACK_AFTER_MS);
    };
    const onMove = () => {
      movedAt = performance.now();
      scrolling = false;
      window.clearTimeout(back);
    };
    window.addEventListener("wheel", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });

    const off = onFrame((time) => {
      if (!pointer.moved || scrolling) {
        block.style.opacity = "0";
        return;
      }
      if (pointer.x !== lastX || pointer.y !== lastY) {
        lastX = pointer.x;
        lastY = pointer.y;
        idleSince = time;
      }
      hot += (hotTarget - hot) * 0.25;
      pressed += ((pointer.down ? 1 : 0) - pressed) * 0.3;
      const blink = time - idleSince > 0.6 ? (Math.sin(time * 7) > 0 ? 1 : 0.15) : 1;
      const w = base.w * (1 + hot * 1.6) * (1 - pressed * 0.3);
      const h = base.h * (1 - pressed * 0.3);
      block.style.opacity = String(blink);
      block.style.width = `${w.toFixed(1)}px`;
      block.style.height = `${h.toFixed(1)}px`;
      block.style.transform = `translate3d(${(pointer.x - w / 2).toFixed(1)}px,${(pointer.y - h / 2).toFixed(1)}px,0)`;
    });

    return () => {
      off();
      window.removeEventListener("pointerover", over);
      window.removeEventListener("wheel", onScroll);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      window.clearTimeout(back);
      window.removeEventListener("resize", measure);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);

  return <div ref={ref} className="cursor-block" aria-hidden="true" />;
}
