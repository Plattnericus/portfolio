"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Lenis from "lenis";
import { gsap, INTRO_SKIP, ScrollTrigger } from "@/lib/animation";
import DynamicFavicon from "@/components/motion/DynamicFavicon";

type SmoothScrollContextValue = {
  lenisRef: RefObject<Lenis | null>;
  introDone: boolean;
  completeIntro: () => void;
};

const SmoothScrollContext = createContext<SmoothScrollContextValue | null>(null);

export function useSmoothScroll() {
  const value = useContext(SmoothScrollContext);
  if (!value) {
    throw new Error("useSmoothScroll must be used inside SmoothScrollProvider");
  }
  return value;
}

/** How long the page has to stand completely still before a refresh. */
const REST_MS = 300;

/**
 * ScrollTrigger.refresh(), held back until the page is truly at rest: no
 * finger on the screen and not a pixel of movement for REST_MS, sampled per
 * frame. ScrollTrigger's own `refresh(true)` isn't enough — it calls the
 * scroll over after a 200ms gap between scroll events, which a busy phone
 * produces in the middle of a fling (a long task delays the events, not the
 * scroll), and then refreshes mid-momentum anyway. Frames only run once the
 * main thread is free again, and by then scrollY has caught up.
 */
function createRestRefresh() {
  let frame = 0;
  let touching = false;
  /* a font promise can still resolve after an unmount */
  let dead = false;
  const onTouch = (event: TouchEvent) => {
    touching = event.touches.length > 0;
  };
  const touchEvents = ["touchstart", "touchend", "touchcancel"] as const;
  touchEvents.forEach((type) => window.addEventListener(type, onTouch, { passive: true }));

  const request = () => {
    if (frame || dead) return;
    let y = window.scrollY;
    let stillSince = -1;
    const step = (now: number) => {
      if (touching || window.scrollY !== y) {
        y = window.scrollY;
        stillSince = -1;
      } else if (stillSince < 0) {
        stillSince = now;
      }
      if (stillSince >= 0 && now - stillSince >= REST_MS) {
        frame = 0;
        ScrollTrigger.refresh();
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  const destroy = () => {
    dead = true;
    cancelAnimationFrame(frame);
    frame = 0;
    touchEvents.forEach((type) => window.removeEventListener(type, onTouch));
  };

  return { request, destroy };
}

export default function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const restRefreshRef = useRef<ReturnType<typeof createRestRefresh> | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const completeIntro = useCallback(() => setIntroDone(true), []);

  useEffect(() => {
    /* A ScrollTrigger.refresh() parks the page at scroll 0 while it measures
       and then writes the old position back. Mid-swipe that kills a phone's
       momentum, and the position written back is the one from the last
       scroll event — a few frames stale at speed, so the page stopped and
       slid back. Phones skip the intro, so the late load and font refreshes
       landed right in the first swipes. They now wait for the page to be at
       rest, and ScrollTrigger's own load listener (which forces one) is off. */
    ScrollTrigger.config({
      ignoreMobileResize: true,
      autoRefreshEvents: "visibilitychange,resize",
    });
    const atRest = createRestRefresh();
    restRefreshRef.current = atRest;
    const refresh = () => atRest.request();
    document.fonts?.ready.then(refresh).catch(() => {});
    if (document.readyState === "complete") refresh();
    else window.addEventListener("load", refresh, { once: true });

    /* Lenis only smooths wheels (syncTouch is off), so on a touch-only
       device it adds nothing but its touchstart/touchmove listeners — which
       are non-passive, so every swipe had to wait for the main thread (the
       WebGL scene, the clip mirrors) before the page could start to move. */
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(hover: none) and (pointer: coarse)").matches
    ) {
      return () => {
        window.removeEventListener("load", refresh);
        atRest.destroy();
        restRefreshRef.current = null;
      };
    }

    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      anchors: true,
      autoRaf: false,
    });
    lenisRef.current = lenis;

    lenis.on("scroll", () => ScrollTrigger.update());
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      window.removeEventListener("load", refresh);
      atRest.destroy();
      restRefreshRef.current = null;
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  /* Keep the reader's place when the layout crosses the desktop/mobile
     breakpoint (a rotated tablet, a resized window). gsap.matchMedia reverts
     the section timelines there, and the refresh that follows measures from
     scroll 0 without restoring the old position — the page jumped back to the
     top. The section at the top of the viewport (and how far into it) is
     tracked from real scrolls only, then restored after each refresh that
     follows the switch; sections change height between layouts, so a raw
     pixel offset would land somewhere else. */
  useEffect(() => {
    const breakpoint = window.matchMedia("(min-width: 900px)");
    let anchor: { el: Element; ratio: number } | null = null;
    let frame = 0;
    let settleTimer = 0;
    let restoreListener: (() => void) | null = null;

    const capture = () => {
      const sections = document.querySelectorAll("main > section, main > footer");
      for (const el of sections) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom > 0) {
          anchor = { el, ratio: Math.max(0, -rect.top) / Math.max(1, rect.height) };
          return;
        }
      }
    };
    /* ScrollTrigger parks the page at 0 while it measures — never record that */
    let refreshing = false;
    const onRefreshInit = () => {
      refreshing = true;
    };
    const onRefreshDone = () => {
      refreshing = false;
    };
    ScrollTrigger.addEventListener("refreshInit", onRefreshInit);
    ScrollTrigger.addEventListener("refresh", onRefreshDone);
    /* measured once the scroll comes to rest, not on every scroll frame —
       a breakpoint change only ever happens between scrolls (a resize or a
       rotation), and per-frame section reads forced extra layout work */
    const onScroll = () => {
      if (refreshing || restoreListener) return;
      window.clearTimeout(frame);
      frame = window.setTimeout(capture, 180);
    };

    const stopRestoring = () => {
      if (restoreListener) ScrollTrigger.removeEventListener("refresh", restoreListener);
      restoreListener = null;
    };
    const onBreakpoint = () => {
      const saved = anchor;
      if (!saved || (saved.el === document.querySelector("main > *") && saved.ratio === 0)) return;
      stopRestoring();
      const restore = () => {
        if (!saved.el.isConnected) return;
        const rect = saved.el.getBoundingClientRect();
        const y = Math.round(rect.top + window.scrollY + saved.ratio * rect.height);
        if (Math.abs(window.scrollY - y) < 2) return;
        const lenis = lenisRef.current;
        if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
        ScrollTrigger.update();
      };
      restoreListener = restore;
      ScrollTrigger.addEventListener("refresh", restore);
      window.clearTimeout(settleTimer);
      /* the switch triggers a short burst of refreshes; after that, normal
         scroll tracking takes over again */
      settleTimer = window.setTimeout(() => {
        restore();
        stopRestoring();
        capture();
      }, 1500);
    };

    capture();
    window.addEventListener("scroll", onScroll, { passive: true });
    breakpoint.addEventListener("change", onBreakpoint);
    return () => {
      window.removeEventListener("scroll", onScroll);
      breakpoint.removeEventListener("change", onBreakpoint);
      ScrollTrigger.removeEventListener("refreshInit", onRefreshInit);
      ScrollTrigger.removeEventListener("refresh", onRefreshDone);
      window.clearTimeout(frame);
      window.clearTimeout(settleTimer);
      stopRestoring();
    };
  }, []);

  /* hold the page still behind the intro loader, release on completion.
     Where there is no intro (phones) nothing is held: the page is already
     scrollable before hydration, and locking it for that one render stopped
     a swipe that had started on the server-rendered page. */
  useEffect(() => {
    const skipped = window.matchMedia(INTRO_SKIP).matches;
    if (introDone) {
      document.documentElement.classList.remove("no-scroll");
      lenisRef.current?.start();
      /* make sure the ticker is running for the hero handoff timeline */
      gsap.ticker.wake();
      /* behind the intro the page is held at the top; without one it may
         already be moving under a finger */
      if (skipped) restRefreshRef.current?.request();
      else ScrollTrigger.refresh();
    } else if (!skipped) {
      document.documentElement.classList.add("no-scroll");
      lenisRef.current?.stop();
    }
    return () => document.documentElement.classList.remove("no-scroll");
  }, [introDone]);

  const value = useMemo(
    () => ({ lenisRef, introDone, completeIntro }),
    [introDone, completeIntro],
  );

  return (
    <SmoothScrollContext.Provider value={value}>
      <DynamicFavicon />
      {children}
    </SmoothScrollContext.Provider>
  );
}
