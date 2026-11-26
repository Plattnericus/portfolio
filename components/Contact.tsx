"use client";

import { useEffect, useState } from "react";
import AsciiHeading from "@/components/AsciiHeading";
import { getLenis, ScrollTrigger } from "@/lib/motion";
import { site } from "@/lib/site";
import { worldState } from "@/lib/world/state";

/** the scroll must have come from a wheel this recently to be held, ms */
const WHEEL_MS = 250;
/** slower than this (px/s) it simply goes on */
const FAST = 600;
/** held at least this long, ms */
const HOLD_MS = 550;
/** the gesture counts as over after this long without a wheel event, ms */
const QUIET_MS = 220;

/**
 * The flight ends at a giant @, faced square on. The address is set large
 * and plain, so it reads at a glance and can be copied in one click. As the
 * footer comes in, the @ falls apart into nothing, cell by cell, before the
 * camera tips up; scrolling back builds it again.
 *
 * A fast wheel or trackpad scroll does not fly past it: it comes to rest
 * where the view is whole and stays until the gesture has run out, and one
 * more scroll goes on to the footer. Links and jumps are never held.
 */
export default function Contact() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const footer = document.querySelector<HTMLElement>("#footer");
    if (!footer) return;
    const set = (st: ScrollTrigger) => {
      worldState.atGone = st.progress;
    };
    const st = ScrollTrigger.create({
      trigger: footer,
      // from a little before the pin lets go until just after: the @ is
      // gone while the copy still stands, before anything moves up
      start: "top 118%",
      end: "top 92%",
      onUpdate: set,
      onRefresh: set,
    });

    let phase: "idle" | "landing" | "holding" = "idle";
    let armed = true;
    let lastWheel = -1e9;
    let since = 0;
    let timer = 0;
    const release = () => {
      if (phase !== "holding") return;
      const wait = HOLD_MS - (performance.now() - since);
      if (wait > 0) {
        timer = window.setTimeout(release, wait);
        return;
      }
      phase = "idle";
      getLenis()?.start();
    };
    // a click, a tap or a key while held: let go at once, never in the way
    const letGo = () => {
      if (phase === "idle") return;
      phase = "idle";
      window.clearTimeout(timer);
      getLenis()?.start();
    };
    const onWheel = () => {
      lastWheel = performance.now();
      if (phase !== "holding") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(release, QUIET_MS);
    };
    // the line sits where contact stands whole, before the @ begins to go
    const stop = ScrollTrigger.create({
      trigger: footer,
      start: "top 124%",
      onEnter: (self) => {
        const lenis = getLenis();
        if (!lenis || !armed || phase !== "idle") return;
        if (performance.now() - lastWheel > WHEEL_MS || Math.abs(self.getVelocity()) < FAST) return;
        armed = false;
        phase = "landing";
        lenis.scrollTo(self.start, {
          duration: 0.45,
          lock: true,
          force: true,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
          onComplete: () => {
            if (phase !== "landing") return;
            phase = "holding";
            since = performance.now();
            lenis.stop();
            timer = window.setTimeout(release, QUIET_MS);
          },
        });
      },
      // back above the line, the next fast pass is held again
      onLeaveBack: () => {
        armed = true;
      },
    });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("pointerdown", letGo, true);
    window.addEventListener("keydown", letGo, true);

    return () => {
      st.kill();
      stop.kill();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", letGo, true);
      window.removeEventListener("keydown", letGo, true);
      window.clearTimeout(timer);
      if (phase !== "idle") getLenis()?.start();
      worldState.atGone = 0;
    };
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(site.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${site.email}`;
    }
  };

  return (
    <section id="contact" className="ct" data-section="contact">
      <div className="ct-pin">
        <AsciiHeading text="Let's build." className="ct-title" reveal="radial" />
        <div className="ct-bottom" data-quiet>
          <p className="ct-ask muted">write me</p>
          <a className="ct-mail" href={`mailto:${site.email}`}>
            {site.email}
          </a>
          <p className="ct-actions">
            <a className="tl" href={`mailto:${site.email}`} data-scramble>
              <span data-label>open mail</span>
              <span className="arrow">↗</span>
            </a>
            <button type="button" className="tl" onClick={copy} aria-live="polite">
              <span>{copied ? "copied" : "copy"}</span>
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
