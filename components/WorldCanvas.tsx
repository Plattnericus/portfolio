"use client";

import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { family, fontsReady } from "@/lib/fonts";
import { bindPointer, onFrame, pointer, prefersReducedMotion } from "@/lib/loop";
import { ScrollTrigger, getLenis, scrollToTarget, startLenis } from "@/lib/motion";
import { markSecret } from "@/lib/secrets";
import { projects } from "@/lib/site";
import { buildKeys, samplePath, wordSpan, type Key } from "@/lib/world/path";
import { getWorld, setWorld, worldState } from "@/lib/world/state";
import { CUTS, Z } from "@/lib/world/shaders";
import { World, type QuietRect } from "@/lib/world/world";

/**
 * The fixed canvas behind the page. Owns the world, feeds it the camera
 * from the scroll path
 * and keeps the characters calm behind any [data-quiet] text.
 */
export default function WorldCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    bindPointer();
    const reduced = prefersReducedMotion();
    const lenis = reduced ? null : startLenis();
    lenis?.stop();

    let world: World | null = null;
    let disposed = false;
    let keys: Key[] = [];
    let offFrame: (() => void) | null = null;
    const pose = { pos: new Vector3(), target: new Vector3(), fov: 50, roll: 0 };
    const lastCam = new Vector3();
    let lastT = 0;
    let fovKick = 0;
    // the quiet rects are re-measured on scroll, otherwise every few frames
    const QUIET_EVERY = 6;
    let quietY = Number.NaN;
    let quietAge = 0;
    // a click held still on open space charges a jump to the next section
    let hold: { x: number; y: number; t0: number } | null = null;
    const HOLD_DELAY = 0.2;
    const HOLD_TIME = 0.95;
    // covering this many screen heights within half a second is lightspeed
    const LIGHTSPEED = 2.5;
    const trail: { t: number; y: number }[] = [];
    let lightAt = -1e9;
    // without a GPU: what the last drawn frame showed
    let drawn = "";
    // only a scroll the visitor is doing counts, not a jump from a link
    let userAt = -1e9;
    const touched = () => (userAt = performance.now());

    const jump = (x: number, y: number) => {
      if (!world) return;
      markSecret("jump");
      world.addWave(x, y);
      setTimeout(() => world?.addWave(x, y), 140);
      world.fx.flash = Math.max(world.fx.flash, 0.08);
      worldState.boost = 1;
      const top = (getLenis()?.scroll ?? window.scrollY) + 8;
      const next = Array.from(document.querySelectorAll<HTMLElement>("main > section[id], footer[id]")).find(
        (el) => el.getBoundingClientRect().top + window.scrollY > top,
      );
      scrollToTarget(next ?? 0, 1.6);
    };

    const rebuild = () => {
      if (!world?.text) return;
      keys = buildKeys(world.text.centers[3] ?? 0, projects.length, wordSpan(world.text.centers));
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __keys?: Key[] }).__keys = keys;
      }
    };

    /*
     * Circling the name with the cursor winds it up: three full turns
     * around its middle within a few seconds and it spins once on its axis.
     */
    const WHIRL = { turns: 3, within: 6, spin: 1.6 };
    let around: number | null = null;
    /** how far the cursor has gone round the name lately: time, angle */
    let path: { t: number; d: number }[] = [];
    let spinAt = -1;
    let spinDir = 1;
    const whirl = (time: number) => {
      if (!world) return;
      if (spinAt >= 0) {
        const k = Math.min(1, (time - spinAt) / WHIRL.spin);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        world.spin = e * Math.PI * 2 * spinDir;
        if (k >= 1) {
          world.spin = 0;
          spinAt = -1;
        }
        return;
      }
      const mid = world.cutting && pointer.moved && !world.hideText && world.pose.pos.z > Z.text + 1 ? world.project(0, 0, Z.text) : null;
      if (!mid) {
        around = null;
        path = [];
        return;
      }
      const a = Math.atan2(pointer.y - mid.y, pointer.x - mid.x);
      if (around !== null && a !== around) {
        let d = a - around;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        path.push({ t: time, d });
      }
      around = a;
      // only what was circled within the last few seconds counts
      path = path.filter((s) => time - s.t < WHIRL.within);
      const wound = path.reduce((sum, s) => sum + s.d, 0);
      if (Math.abs(wound) > WHIRL.turns * Math.PI * 2) {
        spinDir = Math.sign(wound);
        path = [];
        spinAt = time;
        markSecret("whirl");
      }
    };

    const onResize = () => {
      world?.resize(window.innerWidth, window.innerHeight);
    };

    (async () => {
      // React may mount this twice in development; let the first one go first
      await Promise.resolve();
      if (disposed) return;
      // the context and the shaders do not need the fonts: they start at
      // once and compile while the loader's letters are still at rest
      let warm: Promise<unknown>;
      try {
        world = new World(canvas, family("mono"));
        warm = world.warm();
      } catch {
        return;
      }
      await fontsReady();
      if (disposed) return;
      await world.build(family("display"));
      if (disposed) return;
      world.resize(window.innerWidth, window.innerHeight);
      await warm;
      if (disposed) return;
      await world.prime();
      if (disposed) return;
      rebuild();
      ScrollTrigger.addEventListener("refresh", rebuild);
      setWorld(world);
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __world?: World }).__world = world;
      }

      offFrame = onFrame((time) => {
        if (!world) return;
        const dt = lastT ? Math.min(0.05, time - lastT) : 0.016;
        lastT = time;
        const y = getLenis()?.scroll ?? window.scrollY;
        const vel = getLenis()?.velocity ?? 0;

        if (worldState.flying) {
          samplePath(keys, y, pose);
          // the cursor nudges the camera a little
          const px = pointer.moved ? pointer.sx / window.innerWidth - 0.5 : 0;
          const py = pointer.moved ? pointer.sy / window.innerHeight - 0.5 : 0;
          world.pose.pos.set(pose.pos.x + px * 0.5, pose.pos.y - py * 0.35, pose.pos.z);
          world.pose.target.copy(pose.target);
          // speed widens the view a little, like a camera pulling away
          fovKick += (Math.min(9, Math.abs(vel) * 0.09) - fovKick) * 0.12;
          world.pose.fov = pose.fov + fovKick;
          world.pose.roll = pose.roll + px * 0.04 + worldState.roll;
        }

        // speed of the camera drives the hyperspace streaks
        const speed = world.pose.pos.distanceTo(lastCam) / Math.max(dt, 0.001);
        lastCam.copy(world.pose.pos);
        worldState.boost = Math.max(0, worldState.boost - dt * 0.45);
        const boost = worldState.boost;
        if (worldState.flying) world.fx.warp += (Math.min(0.25, speed / 160) + boost * 0.9 - world.fx.warp) * 0.15;
        world.rush += (vel + boost * 260 - world.rush) * 0.2;

        // flung hard enough, the page jumps to lightspeed
        trail.push({ t: time, y });
        while (trail.length && time - trail[0].t > 0.5) trail.shift();
        if (!reduced && worldState.flying && trail.length && performance.now() - userAt < 400) {
          const covered = Math.abs(y - trail[0].y) / window.innerHeight;
          if (covered > LIGHTSPEED && time - lightAt > 8) {
            lightAt = time;
            markSecret("lightspeed");
            worldState.boost = 1;
            world.fx.flash = Math.max(world.fx.flash, 0.1);
          }
        }

        world.morph += (worldState.morph - world.morph) * 0.06;
        // the cursor cuts through the name; every cut open at once is the
        // whole name carved up; circled three times, it spins
        world.cutting = worldState.flying && !reduced;
        if (world.openCuts >= CUTS) markSecret("sculptor");
        whirl(time);

        if (hold) {
          const held = (performance.now() - hold.t0) / 1000;
          world.charge.x = hold.x;
          world.charge.y = hold.y;
          world.charge.p = Math.min(1, Math.max(0, (held - HOLD_DELAY) / HOLD_TIME));
          if (world.charge.p >= 1) {
            const { x, y } = hold;
            hold = null;
            world.charge.p = 0;
            jump(x, y);
          }
        } else world.charge.p = Math.max(0, world.charge.p - dt * 4);

        // sections can ask for a short flash when something changes
        while (worldState.pulses.length) {
          const pl = worldState.pulses.shift();
          if (!pl || reduced) continue;
          world.fx.flash = Math.max(world.fx.flash, 0.035 * pl.strength);
        }
        world.fx.flash *= 0.88;

        // nothing to draw under an opaque overlay
        if (worldState.covered > 0) return;

        // keep the characters quiet behind visible copy: measured when the
        // page moves, and every few frames for copy fading in or out
        if (document.documentElement.classList.contains("is-zen")) world.quiet = [];
        else if (y !== quietY || ++quietAge >= QUIET_EVERY) {
          quietY = y;
          quietAge = 0;
          const rects: QuietRect[] = [];
          document.querySelectorAll<HTMLElement>("[data-quiet]").forEach((el) => {
            if (rects.length >= 4) return;
            const r = el.getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight || r.width === 0) return;
            // faded out or hidden copy does not need the world held back
            const cs = getComputedStyle(el);
            if (cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return;
            rects.push({ x: r.left - 28, y: r.top - 28, w: r.width + 56, h: r.height + 56 });
          });
          world.quiet = rects;
        }

        // without a GPU each frame is copied back on this thread; draw only
        // what changed (easing included, it changes the numbers) or what
        // still runs on its own (see World.moving)
        if (world.software) {
          const p = world.pose;
          const q = world.quiet.map((r) => `${r.x | 0},${r.y | 0},${r.w | 0},${r.h | 0}`).join(";");
          const now = [
            window.innerWidth, window.innerHeight, world.hideText, worldState.covered,
            p.pos.x, p.pos.y, p.pos.z, p.target.x, p.target.y, p.target.z, p.fov, p.roll,
            pointer.moved ? Math.round(pointer.sx) : -1, pointer.moved ? Math.round(pointer.sy) : -1,
            world.fx.flash, world.fx.implode, world.fx.warp, world.fx.sweep, world.rush / 100, world.morph,
          ]
            .map((v) => (typeof v === "number" ? v.toFixed(3) : String(v)))
            .join(" ") + q;
          const same = now === drawn && !world.moving;
          drawn = now;
          if (same) return;
        }

        world.render(time, dt, pointer.moved ? { x: pointer.sx, y: pointer.sy } : null);
      });
    })();

    window.addEventListener("resize", onResize);
    // a click sends a shock ring through the characters
    const onDown = (e: PointerEvent) => {
      if (reduced || !world || e.button !== 0) return;
      world.addWave(e.clientX, e.clientY);
      // holding only charges on open space, never on copy or controls
      if (e.pointerType === "touch" || !worldState.flying || worldState.covered > 0) return;
      const t = e.target as Element | null;
      if (t?.closest("a, button, input, textarea, select, label, p, li, figure, [role=dialog], [data-quiet], .at")) return;
      hold = { x: e.clientX, y: e.clientY, t0: performance.now() };
    };
    const onMove = (e: PointerEvent) => {
      if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) hold = null;
    };
    const onUp = () => {
      hold = null;
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("wheel", touched, { passive: true });
    window.addEventListener("touchmove", touched, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("wheel", touched);
      window.removeEventListener("touchmove", touched);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
      disposed = true;
      offFrame?.();
      window.removeEventListener("resize", onResize);
      ScrollTrigger.removeEventListener("refresh", rebuild);
      if (world && getWorld() === world) setWorld(null);
      world?.dispose();
    };
  }, []);

  return <canvas ref={ref} className="world" aria-hidden="true" />;
}
