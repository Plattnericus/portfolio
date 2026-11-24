"use client";

import { useEffect, useRef, useState } from "react";
import { AsciiTitle } from "@/lib/ascii/ascii-title";
import { family } from "@/lib/fonts";
import { onFrame, prefersReducedMotion } from "@/lib/loop";
import { markSecret } from "@/lib/secrets";
import { site } from "@/lib/site";
import { store } from "@/lib/store";
import { worldState } from "@/lib/world/state";

const IDLE_MS = 45_000;
const PALETTES = [
  ["#3a2a22", "#6b4a3a", "#a8735a", "#e6a27f", "#ffd5bd", "#fff4ec"],
  ["#5a2416", "#8f3a22", "#c24a2a", "#ff5a2e", "#ff8a5e", "#ffc2a8"],
  ["#1c2a33", "#2f4a5a", "#4f7a8f", "#86b3c7", "#c4e0ec", "#f2fbff"],
  ["#2a2a1c", "#4a4a2f", "#7f7f4a", "#b9b97a", "#e2e2b4", "#fbfbe8"],
  ["#2e1f33", "#4f3459", "#7d558c", "#b28cc2", "#dcc4e6", "#f8f0fb"],
];

/**
 * Hidden. Leave the page alone long enough and the name starts drifting
 * around the screen, changing colour whenever it hits an edge. Any input
 * ends it.
 */
export default function Screensaver() {
  const [on, setOn] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  // idle detection
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let last = performance.now();
    const wake = () => {
      last = performance.now();
      setOn(false);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    const timer = window.setInterval(() => {
      if (document.hidden || !store.get().intro || worldState.covered > 0) {
        last = performance.now();
        return;
      }
      if (performance.now() - last > IDLE_MS) setOn(true);
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, wake));
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!on || !host) return;
    markSecret("screensaver");
    const title = new AsciiTitle(host, {
      fontFamily: family("mono"),
      displayFamily: family("display"),
      palette: PALETTES[0],
      maxCell: 7,
      label: false,
      reveal: "dissolve",
    });
    title.set(site.name);
    let x = Math.random() * (window.innerWidth - host.offsetWidth);
    let y = Math.random() * (window.innerHeight - host.offsetHeight);
    let vx = 130;
    let vy = 95;
    let pal = 0;
    const off = onFrame((_t, dms) => {
      const dt = Math.min(0.05, dms / 1000);
      const w = window.innerWidth - host.offsetWidth;
      const h = window.innerHeight - host.offsetHeight;
      x += vx * dt;
      y += vy * dt;
      let hit = false;
      if (x < 0 || x > w) {
        vx = -vx;
        x = Math.max(0, Math.min(w, x));
        hit = true;
      }
      if (y < 0 || y > h) {
        vy = -vy;
        y = Math.max(0, Math.min(h, y));
        hit = true;
      }
      if (hit) {
        pal = (pal + 1) % PALETTES.length;
        title.setPalette(PALETTES[pal]);
      }
      host.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
    return () => {
      off();
      title.destroy();
    };
  }, [on]);

  if (!on) return null;
  return (
    <div className="ss" aria-hidden="true">
      <div ref={hostRef} className="ss-logo" />
    </div>
  );
}
