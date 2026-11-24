"use client";

import { useEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import { fontsReady } from "@/lib/fonts";
import { onFrame, prefersReducedMotion } from "@/lib/loop";
import { gsap, getLenis } from "@/lib/motion";
import { scramble } from "@/lib/scramble";
import { projects, site } from "@/lib/site";
import { store } from "@/lib/store";
import { frameScale } from "@/lib/world/path";
import { Z } from "@/lib/world/shaders";
import { worldReady, worldState } from "@/lib/world/state";

type Line = { label: string; state: "wait" | "run" | "ok" };

const heroPos = () => {
  const k = frameScale();
  return new Vector3(0, 0.1, 8.4 * k * (k > 1.01 ? 1.15 : 1));
};
const HERO_TARGET = new Vector3(0, 0, 0);

/**
 * The loading screen is the start of the flight: a three-digit counter
 * extruded in characters, smoke curling around it, a boot log that only
 * ticks when something really finished. At 100 the camera dives through the
 * middle zero into the world.
 */
export default function Loader() {
  const root = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([
    { label: "fonts", state: "run" },
    { label: "distance fields", state: "wait" },
    { label: `clips 0/${projects.length}`, state: "wait" },
    { label: "warm up", state: "wait" },
  ]);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = prefersReducedMotion();
    const skip = new URLSearchParams(window.location.search).has("skip");
    let disposed = false;
    const offs: (() => void)[] = [];
    const set = (i: number, patch: Partial<Line>) =>
      setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

    const finish = () => {
      worldState.flying = true;
      getLenis()?.start();
      store.set({ intro: true });
    };

    (async () => {
      const t0 = performance.now();
      const shown = { v: 0 };
      const parts = { fonts: 0, world: 0, clips: 0, time: 0 };
      const target = () => parts.fonts * 0.15 + parts.world * 0.2 + parts.clips * 0.45 + parts.time * 0.2;

      await fontsReady();
      if (disposed) return;
      parts.fonts = 1;
      set(0, { state: "ok" });
      set(1, { state: "run" });
      const world = await worldReady;
      if (disposed) return;
      parts.world = 1;
      set(1, { state: "ok" });

      if (reduced || skip) {
        world.digits = null;
        world.pose.pos.copy(heroPos());
        world.pose.target.copy(HERO_TARGET);
        finish();
        setGone(true);
        return;
      }

      let exiting = false;
      // the camera drifts around the counter while it climbs
      const drift = onFrame((t) => {
        if (worldState.flying) return;
        if (!exiting) {
          world.pose.pos.set(Math.sin(t * 0.4) * 1.1, 0.25 + Math.cos(t * 0.3) * 0.35, Z.digits + 8.5 * frameScale());
          world.pose.target.set(0, 0, Z.digits);
          world.pose.fov = 50;
          world.pose.roll = Math.sin(t * 0.25) * 0.03;
        }
        const tt = Math.min(1, (performance.now() - t0) / 2600);
        parts.time = tt;
        shown.v += (target() - shown.v) * 0.06;
        const v = Math.min(100, Math.floor(shown.v * 100 + 0.0001));
        if (!exiting) world.digits = [Math.floor(v / 100), Math.floor((v % 100) / 10), v % 10];
      });
      offs.push(drift);

      // clips: fetch them now so the corridor never waits
      set(2, { state: "run" });
      let done = 0;
      await Promise.all(
        projects.map((p) =>
          fetch(p.clip)
            .then((r) => r.blob())
            .catch(() => undefined)
            .then(() => {
              done++;
              parts.clips = done / projects.length;
              set(2, { label: `clips ${done}/${projects.length}` });
            }),
        ),
      );
      if (disposed) return;
      set(2, { state: "ok" });
      set(3, { state: "run" });
      // wait for the count to actually reach the top
      await new Promise<void>((res) => {
        const off = onFrame(() => {
          if (shown.v > 0.995) {
            off();
            res();
          }
        });
        offs.push(off);
      });
      if (disposed) return;
      set(3, { state: "ok" });
      world.digits = [1, 0, 0];

      // the dive
      exiting = true;
      const from = world.pose.pos.clone();
      const HERO_POS = heroPos();
      const fromTarget = world.pose.target.clone();
      const k = { t: 0 };
      const tl = gsap.timeline();
      tl.to(world.fx, { flash: 0.7, duration: 0.08, ease: "none" });
      tl.to(world.fx, { flash: 0, duration: 0.5, ease: "power2.out" }, 0.08);
      tl.to(
        k,
        {
          t: 1,
          duration: 2.4,
          ease: "power3.inOut",
          onUpdate: () => {
            const e = k.t;
            // straight through the hole of the middle zero, then settle
            world.pose.pos.set(
              from.x * (1 - Math.min(1, e * 3)),
              from.y * (1 - Math.min(1, e * 3)) + HERO_POS.y * e,
              from.z + (HERO_POS.z - from.z) * e,
            );
            world.pose.target.lerpVectors(fromTarget, HERO_TARGET, Math.min(1, e * 1.4));
            world.pose.fov = 50 + Math.sin(e * Math.PI) * 26;
            world.pose.roll = Math.sin(e * Math.PI) * 0.25;
            world.fx.warp = Math.sin(e * Math.PI);
            if (world.pose.pos.z < Z.digits - 0.6) world.digits = null;
          },
        },
        0.15,
      );
      tl.add(() => {
        el.classList.add("is-out");
        el.querySelectorAll<HTMLElement>("[data-out]").forEach((n) =>
          scramble(n, { duration: 0.5, text: " ".repeat(n.textContent?.length ?? 0) }),
        );
      }, 0.2);
      tl.add(() => finish(), 2.2);
      await tl.then();
      world.fx.warp = 0;
      if (!disposed) setGone(true);
    })();

    return () => {
      disposed = true;
      offs.forEach((f) => f());
    };
  }, []);

  if (gone) return null;

  return (
    <div ref={root} className="loader" aria-hidden="true">
      <p className="loader-id" data-out>
        {site.domain}
      </p>
      <ol className="loader-log">
        {lines.map((l) => (
          <li key={l.label.split(" ")[0]} className={`is-${l.state}`} data-out>
            {l.state === "ok" ? "[ok]" : l.state === "run" ? "[..]" : "[  ]"} {l.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
