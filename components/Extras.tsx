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

/**
 * Everything hidden on the home page: the shell, the cinema, the specimen,
 * the screensaver, the typed tricks and the card for found secrets. None of it is needed
 * for the first screen, so it is fetched once the loader is gone and the
 * browser is idle: nothing of it competes with the way in.
 */
export default function Extras() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let idle = 0;
    let timer = 0;
    let alive = true;
    store.when("settled").then(() => {
      if (!alive) return;
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) idle = w.requestIdleCallback(() => setOn(true), { timeout: 1500 });
      else timer = window.setTimeout(() => setOn(true), 300);
    });
    return () => {
      alive = false;
      const w = window as Window & { cancelIdleCallback?: (id: number) => void };
      if (idle) w.cancelIdleCallback?.(idle);
      window.clearTimeout(timer);
    };
  }, []);

  if (!on) return null;
  return (
    <>
      <Cinema />
      <Shell />
      <Specimen />
      <Screensaver />
      <Achievement />
      <Tricks />
    </>
  );
}
