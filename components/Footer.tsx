"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import Quote from "@/components/Quote";
import { AsciiTitle } from "@/lib/ascii/ascii-title";
import { Water } from "@/lib/ascii/water";
import { family, fontsReady } from "@/lib/fonts";
import { onFrame, pointer, prefersReducedMotion, watchVisible } from "@/lib/loop";
import { scrollToTarget } from "@/lib/motion";
import { bindHoverScramble } from "@/lib/scramble";
import { SEASONS_EVENT, SHELL_EVENT, markSecret } from "@/lib/secrets";
import { footerQuotes, site } from "@/lib/site";

const MARK = ["#3a2a22", "#6b4a3a", "#a8735a", "#e6a27f", "#ffd5bd", "#fff4ec"];

/**
 * The end of the page: a line drawn at random, where to find me as a file
 * tree, and the name once more, as large as the screen allows, lit by the
 * cursor and mirrored in water underneath that really ripples.
 */
export default function Footer() {
  const root = useRef<HTMLElement>(null);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const reduced = prefersReducedMotion();
    const host = section.querySelector<HTMLElement>(".ft-mark");
    // the box sets the size; the canvas inside follows it
    const water = section.querySelector<HTMLElement>(".ft-water");
    const waterCanvas = section.querySelector<HTMLCanvasElement>(".ft-water canvas");
    const offs: (() => void)[] = [bindHoverScramble(section)];
    let mark: AsciiTitle | null = null;
    let visible = false;
    let alive = true;
    let lastFrame = 0;
    let lastPx = -1;
    let lastPy = -1;

    offs.push(watchVisible(section, (v) => (visible = v), "0px"));

    fontsReady().then(() => {
      if (!alive || !host) return;
      mark = new AsciiTitle(host, {
        fontFamily: family("mono"),
        displayFamily: family("display"),
        palette: MARK,
        maxCell: 11,
        label: false,
        reveal: "rain",
      });
      let shown = false;
      offs.push(
        watchVisible(
          host,
          (v) => {
            if (v && !shown) {
              shown = true;
              mark?.set(site.name, !reduced);
            }
          },
          "0px 0px -15% 0px",
        ),
      );
    });

    // the water: real ripples from the cursor, a drop now and then, and a
    // stone skipped across it if you swipe fast enough
    let pool: Water | null = null;
    let nextDrop = 0;
    let trail: { x: number; y: number; t: number }[] = [];
    let skipping = false;
    fontsReady().then(() => {
      if (!alive || !water || !waterCanvas) return;
      pool = new Water(waterCanvas, family("mono"));
      pool.resize(water.clientWidth, water.clientHeight);
    });
    const ro = new ResizeObserver(() => water && pool?.resize(water.clientWidth, water.clientHeight));
    if (water) ro.observe(water);
    offs.push(() => ro.disconnect());

    const local = (e: PointerEvent) => {
      const b = water?.getBoundingClientRect();
      return b ? { x: e.clientX - b.left, y: e.clientY - b.top, w: b.width } : null;
    };
    const skip = (from: number, dir: number, y: number, w: number) => {
      // five bounces, each shorter and softer, then it sinks
      skipping = true;
      let x = from;
      let hop = w * 0.11;
      for (let k = 0; k < 6; k++) {
        const at = x;
        const strength = 1.6 - k * 0.25;
        window.setTimeout(() => pool?.poke(at, y, strength, k === 5 ? 2 : 1), k * 140);
        x += dir * hop;
        hop *= 0.72;
      }
      window.setTimeout(() => (skipping = false), 1200);
      markSecret("stone");
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (!p || !pool || reduced) return;
      const now = performance.now();
      const last = trail[trail.length - 1];
      const speed = last ? Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, now - last.t) : 0;
      pool.poke(p.x, p.y, Math.min(0.9, 0.15 + speed * 0.25), 1);
      trail = [...trail.filter((q) => now - q.t < 450), { ...p, t: now }];
      // a fast flat swipe over a good stretch of the water is a skipped stone
      const first = trail[0];
      const dx = p.x - first.x;
      if (!skipping && trail.length > 3 && Math.abs(dx) > p.w * 0.35 && Math.abs(p.y - first.y) < Math.abs(dx) * 0.25) {
        trail = [];
        skip(p.x, Math.sign(dx), p.y, p.w);
      }
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      if (p && pool && !reduced) pool.poke(p.x, p.y, 2.2, 2);
    };
    water?.addEventListener("pointermove", onMove);
    water?.addEventListener("pointerdown", onDown);
    offs.push(() => {
      water?.removeEventListener("pointermove", onMove);
      water?.removeEventListener("pointerdown", onDown);
    });

    offs.push(
      onFrame((t) => {
        if (!visible) return;
        const now = performance.now();
        // the name is lit from wherever the cursor is
        if (mark && host && pointer.moved && !reduced && now - lastFrame > 16) {
          const r = host.getBoundingClientRect();
          const px = pointer.sx - r.left;
          const py = pointer.sy - r.top;
          if (Math.abs(px - lastPx) + Math.abs(py - lastPy) > 1.5) {
            lastPx = px;
            lastPy = py;
            lastFrame = now;
            mark.setLight({ x: px, y: py });
          }
        }
        if (!pool || !water) return;
        // now and then a drop falls somewhere
        if (!reduced && now > nextDrop) {
          nextDrop = now + 1800 + Math.random() * 2600;
          pool.poke(Math.random() * water.clientWidth, Math.random() * water.clientHeight, 0.9 + Math.random() * 0.6, 1);
        }
        pool.render(mark?.surface ?? null, t);
      }),
    );

    // a click and the letters fall down, into the water; another and they
    // stand back up
    const onClick = () => {
      if (!mark || reduced) return;
      const falling = !mark.collapsed;
      if (falling) markSecret("gravity");
      mark.toggleCollapse();
      if (falling && water) {
        const w = water.clientWidth;
        for (let k = 0; k < 7; k++) {
          window.setTimeout(() => pool?.poke(w * (0.08 + k * 0.14), 4, 2.4, 2), 650 + k * 60);
        }
      }
    };
    host?.addEventListener("click", onClick);
    offs.push(() => host?.removeEventListener("click", onClick));

    return () => {
      alive = false;
      offs.forEach((f) => f());
      mark?.destroy();
    };
  }, []);

  const tap = () => {
    // five taps in a row: the way in for phones without a keyboard
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      window.dispatchEvent(new Event(SEASONS_EVENT));
    }
  };

  return (
    <footer ref={root} id="footer" className="ft" data-section="footer">
      <Quote draw={footerQuotes} mode="sort" section="footer" scrub={false} className="qt-foot" />

      <nav className="ft-tree" aria-label="elsewhere" data-quiet>
        <span className="ft-root">~/</span>
        <span className="ft-br" aria-hidden="true">|--</span>
        <span className="ft-dir">contact/</span>
        <span className="ft-items">
          <a href={`mailto:${site.email}`} className="tl" data-scramble>
            <span data-label>{site.email}</span>
          </a>
        </span>
        <span className="ft-br" aria-hidden="true">|--</span>
        <span className="ft-dir">elsewhere/</span>
        <span className="ft-items">
          <a className="tl" href={site.github} target="_blank" rel="me noreferrer" data-scramble>
            <span data-label>github</span>
            <span className="arrow">↗</span>
          </a>
          <a className="tl" href={site.modrinth} target="_blank" rel="me noreferrer" data-scramble>
            <span data-label>modrinth</span>
            <span className="arrow">↗</span>
          </a>
        </span>
        <span className="ft-br" aria-hidden="true">|--</span>
        <span className="ft-dir">site/</span>
        <span className="ft-items">
          <Link className="tl" href="/privacy" data-scramble>
            <span data-label>privacy</span>
          </Link>
          <a className="tl" href="/llms.txt" data-scramble>
            <span data-label>llms.txt</span>
          </a>
          <a className="tl" href="/.well-known/security.txt" data-scramble>
            <span data-label>security.txt</span>
          </a>
        </span>
        <span className="ft-br" aria-hidden="true">`--</span>
        <span className="ft-dir">shell/</span>
        <span className="ft-items">
          <button type="button" className="tl ft-shell" onClick={() => window.dispatchEvent(new Event(SHELL_EVENT))}>
            <span>press ` </span>
          </button>
          <button type="button" className="ft-hint" onClick={tap}>
            the weather here changes with the seasons
          </button>
        </span>
      </nav>

      <div className="ft-pool" aria-hidden="true">
        <div className="ft-mark" />
        <div className="ft-water">
          <canvas />
        </div>
      </div>

      <div className="ft-base">
        <span className="muted">
          © {new Date().getFullYear()} {site.name.toLowerCase()} / {site.handle.toLowerCase()}
        </span>
        <a
          href="#hero"
          className="tl"
          data-scramble
          onClick={(e) => {
            e.preventDefault();
            scrollToTarget(0, 4);
          }}
        >
          <span data-label>back to the stars</span>
          <span className="arrow">↑</span>
        </a>
      </div>
    </footer>
  );
}
