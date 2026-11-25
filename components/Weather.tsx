"use client";

import { useEffect, useRef } from "react";
import { WeatherLayer } from "@/lib/ascii/weather";
import { onFrame, prefersReducedMotion } from "@/lib/loop";
import type { Season } from "@/lib/seasons";
import { getWorld } from "@/lib/world/state";

/** the season's weather over every page, until the page is reloaded */
export default function Weather({ season }: { season: Season | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const layer = useRef<WeatherLayer | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const still = prefersReducedMotion();
    const w = new WeatherLayer(canvas);
    layer.current = w;
    // on the home page, the season also settles on the 3D name; the world
    // is looked up every frame, since it comes and goes with the page
    const size = () => {
      w.resize(window.innerWidth, window.innerHeight);
      if (still) w.frame(1, true);
    };
    size();
    window.addEventListener("resize", size);
    let last = 0;
    const off = onFrame((t) => {
      if (still) return;
      const dt = last ? Math.min(0.05, t - last) : 0.016;
      last = t;
      w.setWorld(getWorld());
      w.frame(dt);
    });
    return () => {
      off();
      window.removeEventListener("resize", size);
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    layer.current?.set(season);
    if (prefersReducedMotion()) layer.current?.frame(1, true);
  }, [season]);

  return <canvas ref={ref} className="wx" aria-hidden="true" />;
}
