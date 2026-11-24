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
    const over = (e: PointerEvent) => {
      const t = e.target as Element | null;
      hotTarget = t?.closest("a, button, [data-hot]") ? 1 : 0;
    };
    window.addEventListener("pointerover", over, { passive: true });

    const off = onFrame((time) => {
      if (!pointer.moved) {
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
      const w = 8.4 * (1 + hot * 1.6) * (1 - pressed * 0.3);
      const h = 16 * (1 - pressed * 0.3);
      block.style.opacity = String(blink);
      block.style.width = `${w.toFixed(1)}px`;
      block.style.height = `${h.toFixed(1)}px`;
      block.style.transform = `translate3d(${(pointer.x - w / 2).toFixed(1)}px,${(pointer.y - h / 2).toFixed(1)}px,0)`;
    });

    return () => {
      off();
      window.removeEventListener("pointerover", over);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);

  return <div ref={ref} className="cursor-block" aria-hidden="true" />;
}
