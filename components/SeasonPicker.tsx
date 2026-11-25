"use client";

import { useEffect, useRef } from "react";
import { onFrame, prefersReducedMotion } from "@/lib/loop";
import { getLenis } from "@/lib/motion";
import { Landscape } from "@/lib/pixel/landscape";
import { SEASONS, WEATHER, chooseSeason, seasonNow, type Season } from "@/lib/seasons";

/**
 * The four seasons to pick from, each a small landscape in pixel art. 1 to 4 (or the arrows and enter) picks one, 0 switches the
 * weather off, esc closes.
 */
export default function SeasonPicker({ current, onClose }: { current: Season | null; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const now = seasonNow();

  // the landscapes
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const still = prefersReducedMotion();
    const scenes = Array.from(el.querySelectorAll<HTMLCanvasElement>(".sn-scene")).map(
      (canvas, i) => new Landscape(canvas, SEASONS[i]),
    );
    scenes.forEach((s) => s.frame(0));
    if (still) return;
    let last = 0;
    return onFrame((t) => {
      const dt = last ? Math.min(0.05, t - last) : 0.016;
      last = t;
      scenes.forEach((s) => s.frame(dt));
    });
  }, []);

  // keys, focus and the page underneath
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const before = document.activeElement as HTMLElement | null;
    getLenis()?.stop();
    const tiles = Array.from(el.querySelectorAll<HTMLButtonElement>(".sn-tile"));
    (tiles[current ? SEASONS.indexOf(current) : SEASONS.indexOf(now)] ?? tiles[0])?.focus();
    const pick = (s: Season | null) => {
      chooseSeason(s);
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const n = Number(e.key);
      if (e.key.length === 1 && n >= 1 && n <= SEASONS.length) {
        e.preventDefault();
        pick(SEASONS[n - 1]);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        pick(null);
        return;
      }
      const at = tiles.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (step) {
        e.preventDefault();
        tiles[(Math.max(0, at) + step + tiles.length) % tiles.length]?.focus();
      }
      // keep focus inside the dialog
      if (e.key === "Tab") {
        const focusable = Array.from(el.querySelectorAll<HTMLElement>("button"));
        const i = focusable.indexOf(document.activeElement as HTMLElement);
        const j = (i + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
        e.preventDefault();
        focusable[j]?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      getLenis()?.start();
      before?.focus?.({ preventScroll: true });
    };
  }, [current, now, onClose]);

  return (
    <div ref={root} className="sn" role="dialog" aria-modal="true" aria-label="Seasons" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sn-panel">
        <p className="sn-head">
          <span className="sn-prompt">$ season</span>
          <span className="muted">pick the weather for the whole site</span>
        </p>
        <div className="sn-grid">
          {SEASONS.map((s, i) => (
            <button
              key={s}
              type="button"
              className={`sn-tile${current === s ? " is-on" : ""}`}
              aria-pressed={current === s}
              onClick={() => {
                chooseSeason(s);
                onClose();
              }}
            >
              <canvas className="sn-scene" aria-hidden="true" />
              <span className="sn-name">
                <b>{i + 1}</b> {s}
                {s === now ? <i> now</i> : null}
              </span>
              <span className="sn-what muted">{WEATHER[s].line}</span>
            </button>
          ))}
        </div>
        <div className="sn-foot">
          <button
            type="button"
            className="tl"
            onClick={() => {
              chooseSeason(null);
              onClose();
            }}
            disabled={!current}
          >
            <span>off</span>
            <span className="arrow">0</span>
          </button>
          <span className="muted sn-keys">1-4 pick, until you reload</span>
          <button type="button" className="tl" onClick={onClose}>
            <span>close</span>
            <span className="arrow">esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}
