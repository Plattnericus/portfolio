"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { store } from "@/lib/store";

const Cinema = dynamic(() => import("@/components/Cinema"), { ssr: false });
const Shell = dynamic(() => import("@/components/Shell"), { ssr: false });
const Specimen = dynamic(() => import("@/components/Specimen"), { ssr: false });
const Screensaver = dynamic(() => import("@/components/Screensaver"), { ssr: false });
const Achievement = dynamic(() => import("@/components/Achievement"), { ssr: false });
const Tricks = dynamic(() => import("@/components/Tricks"), { ssr: false });

/** in the order they come in: what a visitor may reach for first, first */
const PARTS = [Tricks, Achievement, Shell, Cinema, Specimen, Screensaver];

/**
 * Everything hidden on the home page: the shell, the cinema, the specimen,
 * the screensaver, the typed tricks and the card for found secrets. None of it is needed
 * for the first screen, so it is fetched once the loader is gone and the
 * browser is idle, one part per idle moment: nothing of it competes with the
 * way in, and no single moment has to carry all of it.
 */
export default function Extras() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let idle = 0;
    let timer = 0;
    let alive = true;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const next = (n: number) => {
      if (!alive || n > PARTS.length) return;
      const go = () => {
        setCount(n);
        next(n + 1);
      };
      if (w.requestIdleCallback) idle = w.requestIdleCallback(go, { timeout: 1500 });
      else timer = window.setTimeout(go, 300);
    };
    store.when("settled").then(() => next(1));
    return () => {
      alive = false;
      if (idle) w.cancelIdleCallback?.(idle);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <>
      {PARTS.slice(0, count).map((Part, i) => (
        <Part key={i} />
      ))}
    </>
  );
}
