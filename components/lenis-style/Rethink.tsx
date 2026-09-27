"use client";

import { useRef } from "react";
import { NO_MOTION_PREF, ScrollTrigger, gsap, useGSAP } from "@/lib/animation";
import { RETHINK_COVER_AT } from "@/lib/rethink";

const ZOOM_END = 0.8; // lead-in remains visible deep into ENTER NEXOR, like Lenis
const ENTER_START = 0.08; // visible seed size the ENTER NEXOR zoom grows from
                          // (opacity fades it in as it enlarges past the lead-in)
const FLOOD_SCALE = 20; // fallback cover scale until the frame has been measured

/* Panchang Bold "T", in em, straight from the font file (unitsPerEm 1000,
   advance 1054, stem x 426–629, cap height 682, ascent 970, descent 260).
   The zoom origin is the centre of the T's inline box, so the stem reaches
   0.101em to either side of it and the glyph 0.327em up to the cap top
   (0.355em down to the baseline). Changing the ENTER NEXOR font means
   re-deriving these two numbers. */
const T_STEM_HALF_EM = 0.101;
const T_HALF_HEIGHT_EM = 0.327;
/* a little extra scale past exact coverage, so no antialiased sliver of the
   dark page can survive at the frame edges */
const COVER_MARGIN = 1.04;
/* the cream latch releases only this far below RETHINK_COVER_AT — still inside
   COVER_MARGIN, so letting go of it never reveals a dark edge */
const FLIP_HYSTERESIS = 0.004;

/**
 * Faithful Lenis solution takeover: a long scroll section with one sticky
 * viewport. The lead-in composition zooms up and fades, then ENTER NEXOR
 * emerges, dwells a beat, and dives straight INTO the T — because that glyph
 * is a solid cream shape, scaling into its centre floods the frame cream and
 * hands off to the light section, so the T itself is the transition (no iris
 * circle). Scroll progress stays raw and deterministic; Lenis supplies only
 * the input smoothing.
 */
export default function Rethink() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const enterRef = useRef<HTMLHeadingElement | null>(null);
  const tRef = useRef<HTMLSpanElement | null>(null);
  const zoomRef = useRef<HTMLDivElement | null>(null);
  const firstRef = useRef<HTMLHeadingElement | null>(null);
  const secondRef = useRef<HTMLHeadingElement | null>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;
      const mm = gsap.matchMedia();

      mm.add(NO_MOTION_PREF, () => {
        const clamp = gsap.utils.clamp(0, 1);
        const enterEl = enterRef.current;
        const tEl = tRef.current;
        const zoomEl = zoomRef.current;
        const firstEl = firstRef.current;
        const secondEl = secondRef.current;

        /* Every style below is written only when its value actually changes.
           Rewriting the page background (an inherited custom property on
           <body>) or the ENTER visibility on every scroll frame invalidated
           style for the whole document each frame, even with nothing new. */
        const written = new Map<string, string>();
        const write = (el: HTMLElement | null, prop: string, value: string) => {
          if (!el) return;
          const key = `${el.className}|${prop}`;
          if (written.get(key) === value) return;
          written.set(key, value);
          el.style.setProperty(prop, value);
        };

        /* Zoom focal point is the T in "ENTER" — offsetLeft/Top/Width/Height
           are layout metrics (transform-immune), so this reads the T's real
           position even while rt-enter itself sits at scale(0). Re-measured on
           every ScrollTrigger refresh, since font-size is viewport-relative. */
        /* T-centre, kept as strings so updateProgress can build the transform
           directly (see there) as well as feed transform-origin. */
        let originX = "50%";
        let originY = "45%";
        /* Latched cream-flood state, with hysteresis, so it can't strobe. */
        let bgCream = false;
        /* Scale at which the T's stem spans the whole frame. The old curve
           used one fixed end scale, so on wide or short screens the flood only
           finished in the last percent of the section (or never, on a 21:9
           monitor — it then snapped to cream). Solving it per frame lets
           every screen reach full cream at RETHINK_COVER_AT. */
        let coverScale = FLOOD_SCALE;
        const measureOrigin = () => {
          if (!enterEl || !tEl || enterEl.offsetWidth === 0) return;
          const xPercent =
            ((tEl.offsetLeft + tEl.offsetWidth / 2) / enterEl.offsetWidth) * 100;
          const yPercent =
            ((tEl.offsetTop + tEl.offsetHeight / 2) / enterEl.offsetHeight) * 100;
          originX = `${xPercent}%`;
          originY = `${yPercent}%`;
          enterEl.style.setProperty("--rethink-origin-x", originX);
          enterEl.style.setProperty("--rethink-origin-y", originY);

          const fontSize = parseFloat(getComputedStyle(enterEl).fontSize);
          const frame = enterEl.parentElement;
          if (frame && fontSize > 0) {
            coverScale =
              Math.max(
                frame.clientWidth / (2 * T_STEM_HALF_EM * fontSize),
                frame.clientHeight / (2 * T_HALF_HEIGHT_EM * fontSize),
              ) * COVER_MARGIN;
          }
        };

        /* Section geometry comes from the trigger itself (start "top bottom",
           end "bottom top"), which ScrollTrigger re-measures on every refresh —
           no getBoundingClientRect per scroll frame, which used to force a
           synchronous layout right after the frame's other style writes. */
        const updateProgress = (self: ScrollTrigger) => {
          const viewportHeight = window.innerHeight;
          const scroll = window.scrollY;
          const sectionTop = self.start + viewportHeight;
          const sectionHeight = self.end - sectionTop;

          /* Start almost as soon as the sticky composition arrives. Lenis lets
             ENTER grow underneath the preceding words instead of waiting for
             that composition to leave first. The terminal T flood stays pinned
             to the same section end. */
          const start = sectionTop + viewportHeight * 0.05;
          const end = sectionTop + sectionHeight - viewportHeight;
          const progress = clamp((scroll - start) / Math.max(1, end - start));

          /* Lead-in: "So we built / web experiences" + "As it should be" zoom up
             as a unit and fade, exactly as before. */
          /* written straight onto the three elements rather than through a
             custom property on the section, which restyled its whole subtree */
          const zoomProgress = clamp(progress / ZOOM_END);
          write(zoomEl, "transform", `scale(${1 + zoomProgress * 3})`);
          write(firstEl, "transform", `translateY(${zoomProgress * -100}%)`);

          /* ENTER NEXOR is ONE single, continuous exponential zoom straight
             through the T. An exponential means a constant *perceived* zoom rate
             (each scroll unit multiplies the size by the same factor), so it can
             never plateau or "stick" at any size — it just flies in cleanly in
             one motion. It seeds from an invisible ENTER_START, passes through
             readable (~1) around the middle without ever pausing, and fully
             covers the frame at RETHINK_COVER_AT. No emerge/dwell/dive stages to
             create a flat spot to grind against. */
          const enterScale =
            ENTER_START *
            Math.pow(coverScale / ENTER_START, progress / RETHINK_COVER_AT);
          const enterOpacity = clamp(progress / 0.045);
          /* Write the transform straight onto the element, not only through a CSS
             custom property. A will-change:transform layer driven purely by a
             changing variable can skip a compositor update on a fast scroll-
             direction reversal and leave a stale frame — that is the "only the T
             is left" glitch on scroll-back. An explicit inline transform forces
             the update every tick, so a reversal is always clean. */
          if (enterEl) {
            enterEl.style.transform =
              `translate(calc(-1 * ${originX}), calc(-1 * ${originY})) scale(${enterScale})`;
            write(enterEl, "opacity", String(enterOpacity));
          }

          /* Keep the lead-in visible while ENTER grows. Its oversized words are
             intentionally clipped by the sticky viewport before fading near the
             end of their zoom — this is the characteristic Lenis overlap. */
          const textFade = String(1 - clamp((zoomProgress - 0.82) / 0.16));
          write(firstEl, "opacity", textFade);
          write(secondEl, "opacity", textFade);

          /* Once the cream T has fully flooded the frame, paint the page cream
             and take the flood itself away — the swap is invisible because the
             frame is already solid cream at that point. Neither the section nor
             the flood may stay painted: both sit in the DOM above the WebGL
             canvas, and a lingering cream layer sliced the returning hand off at
             a hard horizontal edge (the section's bottom) as it scrolled away.
             Hysteresis (latch on at RETHINK_COVER_AT, off a hair below it)
             stops the page background from strobing if the scroll settles
             right on the boundary. */
          if (progress >= RETHINK_COVER_AT) bgCream = true;
          else if (progress < RETHINK_COVER_AT - FLIP_HYSTERESIS) bgCream = false;
          write(document.body, "--page-bg", bgCream ? "#f2ede6" : "#0b0908");
          write(enterEl, "visibility", bgCream ? "hidden" : "visible");
          /* lets fixed chrome (the cursor) follow the page into its cream half */
          if (document.documentElement.hasAttribute("data-light") !== bgCream) {
            document.documentElement.toggleAttribute("data-light", bgCream);
          }
        };

        const trigger = ScrollTrigger.create({
          id: "rethink",
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          invalidateOnRefresh: true,
          onUpdate: updateProgress,
          /* Force a clean terminal state at both edges too, so a fast reversal
             that outran the last onUpdate can't strand a half-scaled wordmark. */
          onLeave: updateProgress,
          onLeaveBack: updateProgress,
          onRefresh: (self) => {
            measureOrigin();
            updateProgress(self);
          },
        });

        measureOrigin();
        updateProgress(trigger);

        return () => {
          trigger.kill();
          zoomEl?.style.removeProperty("transform");
          firstEl?.style.removeProperty("transform");
          firstEl?.style.removeProperty("opacity");
          secondEl?.style.removeProperty("opacity");
          document.body.style.removeProperty("--page-bg");
          document.documentElement.removeAttribute("data-light");
          enterEl?.style.removeProperty("transform");
          enterEl?.style.removeProperty("opacity");
          enterEl?.style.removeProperty("visibility");
          enterEl?.style.removeProperty("--rethink-origin-x");
          enterEl?.style.removeProperty("--rethink-origin-y");
        };
      });

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section ref={sectionRef} className="rethink" aria-label="Enter Nexor">
      <div className="rethink-inner">
        <div className="rethink-zoom" ref={zoomRef}>
          <h2 className="rt-first" ref={firstRef}>
            So we built{" "}
            <br />
            <span>web experiences</span>
          </h2>
          <h2 className="rt-second" ref={secondRef}>
            As it should be
          </h2>
        </div>
        <h2 className="rt-enter" ref={enterRef}>
          En
          <span ref={tRef}>t</span>
          er{" "}
          <br />
          Nexor
        </h2>
      </div>
    </section>
  );
}
