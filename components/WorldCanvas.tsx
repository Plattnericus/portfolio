"use client";

import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { family, fontsReady } from "@/lib/fonts";
import { bindPointer, onFrame, pointer, prefersReducedMotion } from "@/lib/loop";
import { ScrollTrigger, getLenis, scrollToTarget, startLenis } from "@/lib/motion";
import { markSecret } from "@/lib/secrets";
import { projects } from "@/lib/site";
import { buildKeys, samplePath, type Key } from "@/lib/world/path";
import { setWorld, worldState } from "@/lib/world/state";
import { World, type QuietRect } from "@/lib/world/world";

/**
 * The fixed canvas behind the page. Owns the world, feeds it the camera
 * from the scroll path, switches the seasonal weather
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
    // a click held still on open space charges a jump to the next section
    let hold: { x: number; y: number; t0: number } | null = null;
    const HOLD_DELAY = 0.2;
    const HOLD_TIME = 0.95;

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
      keys = buildKeys(world.text.centers[3] ?? 0, projects.length);
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __keys?: Key[] }).__keys = keys;
      }
    };

    const onResize = () => {
      world?.resize(window.innerWidth, window.innerHeight);
    };

    (async () => {
      await fontsReady();
      if (disposed) return;
      try {
        world = new World(canvas, family("mono"));
      } catch {
        return;
      }
      world.build(family("display"));
      world.resize(window.innerWidth, window.innerHeight);
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
          world.pose.roll = pose.roll + px * 0.04;
        }

        // speed of the camera drives the hyperspace streaks
        const speed = world.pose.pos.distanceTo(lastCam) / Math.max(dt, 0.001);
        lastCam.copy(world.pose.pos);
        worldState.boost = Math.max(0, worldState.boost - dt * 0.45);
        const boost = worldState.boost;
        if (worldState.flying) world.fx.warp += (Math.min(0.25, speed / 160) + boost * 0.9 - world.fx.warp) * 0.15;
        world.rush += (vel + boost * 260 - world.rush) * 0.2;

        world.morph += (worldState.morph - world.morph) * 0.06;
        world.cutting = worldState.flying && !reduced;

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

        // seasonal weather, switched on by the secret
        const wk = worldState.weather;
        const kind = wk === "winter" ? 1 : wk === "spring" ? 2 : wk === "summer" ? 3 : wk === "autumn" ? 4 : 0;
        if (kind !== world.weather.kind) {
          world.weather.kind = kind;
          const pal: Record<number, [string, string]> = {
            1: ["#dfe7f0", "#ffffff"],
            2: ["#f7b6c8", "#fde2ea"],
            3: ["#ffd36b", "#d9f27a"],
            4: ["#e8742a", "#f0b23a"],
          };
          const [a, b] = pal[kind] ?? ["#000000", "#000000"];
          world.weather.a.set(a);
          world.weather.b.set(b);
        }

        // keep the characters quiet behind visible copy
        const rects: QuietRect[] = [];
        document.querySelectorAll<HTMLElement>("[data-quiet]").forEach((el) => {
          if (rects.length >= 4) return;
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight || r.width === 0) return;
          if (getComputedStyle(el).visibility === "hidden") return;
          rects.push({ x: r.left - 28, y: r.top - 28, w: r.width + 56, h: r.height + 56 });
        });
        world.quiet = rects;

        // nothing to draw under an opaque overlay
        if (worldState.covered > 0) return;
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
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
      disposed = true;
      offFrame?.();
      window.removeEventListener("resize", onResize);
      ScrollTrigger.removeEventListener("refresh", rebuild);
      world?.dispose();
    };
  }, []);

  return <canvas ref={ref} className="world" aria-hidden="true" />;
}
