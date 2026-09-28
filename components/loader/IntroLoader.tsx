"use client";

import { useEffect, useRef, useState } from "react";
import NexorWordmark from "@/components/brand/NexorWordmark";
import { useSmoothScroll } from "@/components/providers/SmoothScrollProvider";

/* The original ~3.3s intro spent roughly 400ms of that just standing still,
   waiting on a floor well past the point the glyphs had finished rising.
   Rather than speed the motion up to claw that back — which made the rise
   feel hurried — the time comes out of the dead pause: the glyph rise keeps
   a generous 850ms with a 35ms stagger, and the exit begins the moment the
   last glyph lands. Whole intro reads unhurried and still ends at ~1.8s.
   Every value below is measured from first paint, matching the CSS animation
   in globals.css that drives the rise — keep the two in step. */

/* The rise itself lives entirely in CSS (100ms delay + 5*35ms stagger +
   850ms), landing the last glyph at ~1125ms after paint. */
const EXIT_EARLIEST_MS = 1130;
const MERGE_DELAY_MS = 45;
/* Deliberately a touch under the 0.72s CSS exit: the curtain is already off
   screen by then, so unmounting early is invisible and trims the tail. */
const EXIT_DURATION_MS = 670;
const MAX_READY_WAIT_MS = 1900;

/**
 * Lenis-style intro architecture using the site's own NEXOR wordmark:
 * one second of colour, five staggered glyphs in two rows, then a counter-
 * moving stage under an upward curtain. The real Lenis mark is bespoke SVG,
 * so its trademark paths are intentionally not copied here.
 */
export default function IntroLoader() {
  const { completeIntro } = useSmoothScroll();
  const [gone, setGone] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const skipIntro =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 899px)").matches;

    if (skipIntro) {
      /* Mobile uses the direct hero reveal and skips the heavy intro. */
      const release = window.setTimeout(() => {
        completeIntro();
        setGone(true);
      }, 0);
      return () => window.clearTimeout(release);
    }

    const root = rootRef.current;
    if (!root) {
      completeIntro();
      setGone(true);
      return;
    }

    const signals = {
      fonts: !document.fonts,
      load: document.readyState === "complete",
      gl: false,
    };
    let earliestReached = false;
    let exiting = false;
    let mergeTimer = 0;
    let finishTimer = 0;

    const startExit = () => {
      if (exiting) return;
      exiting = true;

      root.classList.add("intro-out");
      window.dispatchEvent(new Event("intro-reveal"));

      mergeTimer = window.setTimeout(() => {
        root.classList.add("intro-merge");
      }, MERGE_DELAY_MS);

      finishTimer = window.setTimeout(() => {
        completeIntro();
        setGone(true);
      }, EXIT_DURATION_MS);
    };

    const maybeStartExit = () => {
      if (earliestReached && signals.fonts && signals.load && signals.gl) {
        startExit();
      }
    };

    document.fonts?.ready
      .then(() => {
        signals.fonts = true;
        maybeStartExit();
      })
      .catch(() => {
        signals.fonts = true;
        maybeStartExit();
      });

    const onLoad = () => {
      signals.load = true;
      maybeStartExit();
    };
    if (!signals.load) window.addEventListener("load", onLoad, { once: true });

    const onGlReady = () => {
      signals.gl = true;
      maybeStartExit();
    };
    window.addEventListener("gl-ready", onGlReady, { once: true });

    /* The glyph rise is driven by a pure CSS animation that starts the moment
       the loader paints, so it no longer waits on React. Every timer below is
       anchored to that same first paint rather than to whenever this effect
       happens to commit — hydration cost varies wildly by device, and pinning
       the schedule to it meant a fast machine saw the letters move almost at
       once while a slow one stared at a dead orange rectangle for half a
       second first. Anchoring to paint makes the intro run identically on
       both, which is what actually makes it feel deliberate. */
    /* The rise's own start is the real anchor: on a fresh load it is first
       paint, but after a client-side navigation (the 404's "Back to Nexor")
       first paint happened long ago on the other page, and anchoring to it
       made the curtain leave before a single glyph had risen. */
    const rise = root.querySelector(".intro-glyph")?.getAnimations?.()[0];
    const paint = performance
      .getEntriesByType("paint")
      .find((entry) => entry.name === "first-contentful-paint");
    /* a rise that is still pending (no start time yet) is starting right now */
    const anchor = rise
      ? typeof rise.startTime === "number"
        ? rise.startTime
        : performance.now()
      : (paint?.startTime ?? performance.now());
    const sincePaint = Math.max(0, performance.now() - anchor);
    const after = (target: number) => Math.max(0, target - sincePaint);

    const earliestTimer = window.setTimeout(() => {
      earliestReached = true;
      maybeStartExit();
    }, after(EXIT_EARLIEST_MS));

    /* Slow or failed WebGL/font loads must never hold the page hostage. */
    const capTimer = window.setTimeout(startExit, after(MAX_READY_WAIT_MS));

    return () => {
      window.removeEventListener("load", onLoad);
      window.removeEventListener("gl-ready", onGlReady);
      window.clearTimeout(earliestTimer);
      window.clearTimeout(capTimer);
      window.clearTimeout(mergeTimer);
      window.clearTimeout(finishTimer);
    };
  }, [completeIntro]);

  if (gone) return null;

  return (
    <div className="intro-loader" ref={rootRef} aria-hidden="true">
      <div className="intro-stage">
        <NexorWordmark variant="intro" />
      </div>
    </div>
  );
}
