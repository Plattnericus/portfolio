"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GlyphCanvas } from "@/lib/ascii/glyph-canvas";
import { createScene, type Grid } from "@/lib/ascii/season-art";
import { family } from "@/lib/fonts";
import { onFrame, prefersReducedMotion } from "@/lib/loop";
import { getLenis } from "@/lib/motion";
import { scramble } from "@/lib/scramble";
import { SEASONS, foundKeys, isFound, markFound, seasonOf, type Season, type SeasonInfo } from "@/lib/seasons";
import { markSecret } from "@/lib/secrets";
import { pulse, worldState } from "@/lib/world/state";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

const TITLE: Record<Season, string> = {
  winter: "Winter.",
  spring: "Spring.",
  summer: "Summer.",
  autumn: "Autumn.",
};

const WEATHER: Record<Season, string> = {
  winter: "The snow stays",
  spring: "The blossom stays",
  summer: "The fireflies stay",
  autumn: "The falling leaves stay",
};

/** the open event other parts of the page can fire (the footer, on touch) */
export const SECRET_EVENT = "plattnericus:secret";

/**
 * One secret per season. Type the season's name anywhere on the page (or
 * the Konami code) and its scene plays; from then on the season's weather
 * drifts through the site until the season changes.
 */
export default function Secret() {
  const infoRef = useRef<SeasonInfo | null>(null);
  /** the season shown while the scene is open, null when closed */
  const [shown, setShown] = useState<SeasonInfo | null>(null);
  const open = shown !== null;
  const setOpen = (v: boolean) => {
    if (!v) setShown(null);
  };
  const [found, setFound] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ?season=winter previews another season while developing
    const params = new URLSearchParams(window.location.search);
    const preview = process.env.NODE_ENV !== "production" ? params.get("season") : null;
    const base = seasonOf();
    const i = preview && (SEASONS as string[]).includes(preview)
      ? { ...base, season: preview as Season, key: `${base.year}-${preview}`, holidays: preview === "winter" && base.holidays }
      : base;
    infoRef.current = i;
    if (isFound(i.key)) worldState.weather = i.season;
    console.log(
      `%c psst. something unlocks here every season. this one is ${i.season}: type its name.`,
      "color:#8a847c",
    );
  }, []);

  const trigger = useCallback((via: "season" | "konami" = "season") => {
    const info = infoRef.current;
    if (!info) return;
    markSecret(via);
    markFound(info.key);
    setFound(foundKeys());
    worldState.weather = info.season;
    pulse(0.5, 0.5, 2);
    setShown(info);
  }, []);

  // keyboard: the season's name, or the Konami code
  useEffect(() => {
    let typed = "";
    let seq: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") {
        setShown(null);
        return;
      }
      seq = [...seq, e.key].slice(-KONAMI.length);
      if (seq.join(",").toLowerCase() === KONAMI.join(",").toLowerCase()) trigger("konami");
      if (e.key.length === 1) {
        typed = (typed + e.key.toLowerCase()).slice(-12);
        const season = infoRef.current?.season;
        if (season && typed.endsWith(season)) trigger();
      }
    };
    const onEvent = () => trigger("season");
    window.addEventListener("keydown", onKey);
    window.addEventListener(SECRET_EVENT, onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SECRET_EVENT, onEvent);
    };
  }, [trigger]);

  // the scene
  useEffect(() => {
    const info = shown;
    if (!info) return;
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    getLenis()?.stop();
    worldState.covered++;
    const reduced = prefersReducedMotion();
    const gc = new GlyphCanvas(canvas, {
      fontFamily: family("mono"),
      fontSize: window.innerWidth < 700 ? 10 : 13,
      lineHeight: 1.2,
      weight: 600,
    });
    const scene = createScene(info.season);
    let grid: Grid = { cols: 0, rows: 0, chars: new Uint16Array(0), rgba: new Uint8ClampedArray(0) };
    const size = () => {
      gc.resize(window.innerWidth, window.innerHeight);
      grid = {
        cols: gc.cols,
        rows: gc.rows,
        chars: new Uint16Array(gc.cols * gc.rows),
        rgba: new Uint8ClampedArray(gc.cols * gc.rows * 4),
      };
      scene.resize(gc.cols, gc.rows);
    };
    size();
    window.addEventListener("resize", size);
    let last = 0;
    const off = onFrame((t) => {
      const dt = last ? Math.min(0.05, t - last) : 0.016;
      last = t;
      grid.chars.fill(32);
      grid.rgba.fill(0);
      scene.draw(grid, reduced ? 0 : t, reduced ? 0 : dt);
      gc.drawGrid(grid.chars, grid.rgba);
    });
    root.querySelectorAll<HTMLElement>("[data-decode]").forEach((el, i) => {
      if (!reduced) scramble(el, { duration: 0.9, delay: 0.1 + i * 0.1 });
    });
    root.querySelector<HTMLButtonElement>(".sc-close")?.focus();
    return () => {
      off();
      window.removeEventListener("resize", size);
      worldState.covered = Math.max(0, worldState.covered - 1);
      getLenis()?.start();
    };
  }, [shown]);

  const info = shown;
  if (!open || !info) return null;

  const until = info.next.date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const title = info.season === "winter" && info.holidays ? "Happy holidays." : TITLE[info.season];

  return (
    <div ref={rootRef} className="sc" role="dialog" aria-modal="true" aria-label={`${info.season} secret`}>
      <canvas ref={canvasRef} className="sc-canvas" aria-hidden="true" />
      <div className="sc-top">
        <h2 className="sc-title" data-decode>
          {title}
        </h2>
        <p className="sc-line" data-decode>
          {`You found the ${info.season} secret. ${WEATHER[info.season]} on the site until ${until}.`}
        </p>
      </div>
      <div className="sc-bottom">
        <ul className="sc-list" aria-label="seasons found">
          {SEASONS.map((s) => {
            const has = found.some((k) => k.endsWith(`-${s}`));
            return (
              <li key={s} className={has ? "is-found" : s === info.season ? "is-now" : ""}>
                {has ? "[x]" : "[ ]"} {s}
              </li>
            );
          })}
        </ul>
        <p className="sc-next muted">
          next: {info.next.season}, from {until}
        </p>
        <button type="button" className="tl sc-close" onClick={() => setOpen(false)}>
          <span>close</span>
          <span className="arrow">esc</span>
        </button>
      </div>
    </div>
  );
}
