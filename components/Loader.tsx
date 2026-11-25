"use client";

import { gsap } from "gsap";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Vector3 } from "three";
import { letterArt } from "@/lib/ascii/letter-art";
import { fontsReady } from "@/lib/fonts";
import { prefersReducedMotion } from "@/lib/loop";
import { getLenis } from "@/lib/motion";
import { site } from "@/lib/site";
import { store } from "@/lib/store";
import { heroDistance, wordSpan } from "@/lib/world/path";
import { Z } from "@/lib/world/shaders";
import { whenWorld, worldState } from "@/lib/world/state";
import type { Letter } from "@/lib/world/world";
import type { World } from "@/lib/world/world";

/** the start camera, the same as the first key of the camera path */
const heroPos = (world: World) => new Vector3(0, 0.1, heroDistance(wordSpan(world.text?.centers ?? [])));
const HERO_TARGET = new Vector3(0, 0, 0);

/** the name, each letter drawn in characters from the font's own modules */
const LETTERS = [...site.name.toUpperCase()].map((ch) => letterArt(ch).join("\n"));
/** rows of a letter's art, and how many of them the letter itself fills */
const ART_ROWS = LETTERS[0]?.split("\n").length ?? 23;
const CAP_ROWS = ART_ROWS - 2;

/*
 * Timing, as on lenis.dev (keep in step with .loader in globals.css): the
 * letters rise from the first paint (100 ms delay, 35 ms stagger, 850 ms),
 * the last lands at about 1.13 s. The way out takes 0.72 s on an expo out
 * curve; the lower letters start 45 ms after the curtain. FLIGHT_MS is the
 * .loader-slot transition.
 */
const EXIT_EARLIEST_MS = 1130;
const MERGE_DELAY_MS = 45;
const FLIGHT_MS = 720;
const EXIT_MS = MERGE_DELAY_MS + FLIGHT_MS + 40;
/** never hold the page longer than this, whatever is still loading */
const MAX_WAIT_MS = 3000;
/** the front face of the wordmark (it is extruded 0.34 either side of Z.text) */
const FRONT = Z.text + 0.34;

/** lenis' curve, cubic-bezier(0.19, 1, 0.22, 1), the same the CSS uses */
function expoOut(x: number) {
  const [x1, y1, x2, y2] = [0.19, 1, 0.22, 1];
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let k = 0; k < 24; k++) {
    t = (lo + hi) / 2;
    const bx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
    if (bx < x) lo = t;
    else hi = t;
  }
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}

function Stage() {
  return (
    <div className="loader-stage" style={{ "--n": LETTERS.length } as CSSProperties}>
      {LETTERS.map((art, i) => (
        <span
          key={i}
          className={`loader-slot${i % 2 ? " is-low" : ""}`}
          style={{ "--col": i + 1, "--row": i % 2 ? 2 : 1 } as CSSProperties}
        >
          <pre className="loader-glyph" style={{ "--i": i + 1 } as CSSProperties}>
            {art}
          </pre>
        </span>
      ))}
    </div>
  );
}

/**
 * The way in, as on the very first plattnericus.dev and on lenis.dev, drawn
 * in characters. On a black curtain the letters of the name rise out of
 * their slots one after another in a zigzag over two rows, in orange. Under
 * the curtain the real 3D wordmark waits with its letters in exactly those
 * places. The curtain shoots up, and as its edge passes each letter turns
 * from the orange print into the 3D one, while every letter, on both, flies
 * into line in the same motion, the lower two rising. What lands is simply
 * the wordmark: nothing to hand over, nothing to fade.
 * It waits for the fonts and the world, never for the project films.
 */
export default function Loader() {
  const root = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = prefersReducedMotion();
    const skip = new URLSearchParams(window.location.search).has("skip");
    const timers: number[] = [];
    let world: World | null = null;
    let exiting = false;
    let disposed = false;
    const ready = { world: false, page: document.readyState === "complete", early: false };

    const fly = () => {
      worldState.flying = true;
      getLenis()?.start();
    };

    // behind the closed curtain the world has nothing to show: once it has
    // drawn a couple of frames (so everything is compiled), it rests
    let resting = false;
    const rest = (on: boolean) => {
      if (on === resting) return;
      resting = on;
      worldState.covered = Math.max(0, worldState.covered + (on ? 1 : -1));
    };

    /*
     * Where every letter of the wordmark has to start so it sits exactly
     * behind its printed letter on the curtain (world offset and scale), and
     * the screen move that takes the printed letter to the wordmark's own.
     */
    const plan = () => {
      const w = world;
      const text = w?.text;
      if (!w || !text) return null;
      const slots = Array.from(el.querySelectorAll<HTMLElement>(".loader-slot"));
      const start: Letter[] = [];
      const moves: string[] = [];
      slots.forEach((slot, i) => {
        const glyph = slot.querySelector("pre")?.getBoundingClientRect();
        const cx = text.centers[i];
        if (!glyph || cx === undefined) return;
        const gx = glyph.left + glyph.width / 2;
        const gy = glyph.top + glyph.height / 2;
        const gh = (glyph.height * CAP_ROWS) / ART_ROWS;
        const mid = w.project(cx, 0, FRONT);
        const top = w.project(cx, text.height / 2, FRONT);
        const bottom = w.project(cx, -text.height / 2, FRONT);
        const at = w.unproject(gx, gy, FRONT);
        if (!mid || !top || !bottom || !at) return;
        const h = bottom.y - top.y;
        start[i] = { x: at.x - cx, y: at.y, s: gh / h };
        moves[i] = `translate3d(${(mid.x - gx).toFixed(1)}px, ${(mid.y - gy).toFixed(1)}px, 0) scale(${(h / gh).toFixed(3)})`;
      });
      return { slots, start, moves };
    };

    /*
     * The wordmark's letters, from where they start to their own place. The
     * printed letters move on the compositor; these follow the clock of that
     * very transition, so the two can never drift apart, and they are set
     * first thing in the frame, before the world draws.
     */
    let step: (() => void) | null = null;
    const fly3d = (start: Letter[], slot: HTMLElement | undefined) => {
      const w = world;
      if (!w) return;
      const css = slot?.getAnimations().find((a) => a.effect?.getTiming().duration === FLIGHT_MS);
      const t0 = performance.now();
      step = () => {
        const t = typeof css?.currentTime === "number" ? css.currentTime : performance.now() - t0;
        const k = expoOut(Math.min(1, Math.max(0, t / FLIGHT_MS)));
        w.letters = start.map((l) => ({ x: l.x * (1 - k), y: l.y * (1 - k), s: l.s + (1 - l.s) * k }));
        if (k >= 1 || css?.playState === "finished") {
          w.letters = null;
          if (step) gsap.ticker.remove(step);
          step = null;
        }
      };
      gsap.ticker.add(step, false, true);
    };

    const exit = () => {
      if (exiting || disposed) return;
      exiting = true;
      const p = plan();
      // the wordmark appears behind the printed letters, in their places
      if (world && p) {
        world.letters = p.start;
        world.hideText = false;
      }
      rest(false);
      el.classList.add("is-out");
      timers.push(
        window.setTimeout(() => {
          if (!p) return;
          p.slots.forEach((slot, i) => {
            if (p.moves[i]) slot.style.transform = p.moves[i];
          });
          fly3d(p.start, p.slots[0]);
        }, MERGE_DELAY_MS),
      );
      // the copy of the page comes in while the name settles
      timers.push(window.setTimeout(() => store.set({ intro: true }), 300));
      timers.push(
        window.setTimeout(() => {
          fly();
          setGone(true);
          store.set({ settled: true });
        }, EXIT_MS),
      );
    };
    const maybe = () => {
      if (ready.world && ready.page && ready.early) exit();
    };

    (async () => {
      await fontsReady();
      world = await whenWorld();
      if (disposed) return;
      world.digits = null;
      world.fx.implode = 0;
      world.pose.pos.copy(heroPos(world));
      world.pose.target.copy(HERO_TARGET);
      world.pose.fov = 50;
      world.pose.roll = 0;
      if (reduced || skip) {
        fly();
        store.set({ intro: true, settled: true });
        setGone(true);
        return;
      }
      // the wordmark waits out of sight until the curtain lifts
      world.hideText = true;
      ready.world = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!exiting && !disposed) rest(true);
        }),
      );
      maybe();
    })();

    if (reduced || skip) return () => void (disposed = true);

    const onLoad = () => {
      ready.page = true;
      maybe();
    };
    if (!ready.page) window.addEventListener("load", onLoad, { once: true });

    // anchor on the rise itself: on a fresh load that is the first paint
    const rise = el.querySelector(".loader-curtain .loader-glyph")?.getAnimations?.()[0];
    const anchor = rise && typeof rise.startTime === "number" ? rise.startTime : performance.now();
    const since = Math.max(0, performance.now() - anchor);
    const after = (ms: number) => Math.max(0, ms - since);
    timers.push(
      window.setTimeout(() => {
        ready.early = true;
        maybe();
      }, after(EXIT_EARLIEST_MS)),
    );
    timers.push(window.setTimeout(exit, after(MAX_WAIT_MS)));

    return () => {
      disposed = true;
      if (step) gsap.ticker.remove(step);
      rest(false);
      if (world) {
        world.hideText = false;
        world.letters = null;
      }
      window.removeEventListener("load", onLoad);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  if (gone) return null;

  return (
    <div ref={root} className="loader" aria-hidden="true">
      <div className="loader-curtain">
        <Stage />
      </div>
    </div>
  );
}
