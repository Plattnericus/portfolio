"use client";

import { useEffect, useRef } from "react";
import { ArrowDown, Code } from "lucide-react";
import { EASE, NO_MOTION_PREF, gsap, useGSAP } from "@/lib/animation";
import NexorWordmark from "@/components/brand/NexorWordmark";
import PillInner from "@/components/ui/PillInner";
import { useSmoothScroll } from "@/components/providers/SmoothScrollProvider";
import { siteConfig } from "@/lib/site";

export default function Hero() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const revealRef = useRef<gsap.core.Timeline | null>(null);
  const revealRequestedRef = useRef(false);
  const { introDone } = useSmoothScroll();

  /* Everything is built ONCE, paused, at mount — the intro loader only calls
     .play() later. Rebuilding on a dependency change proved fragile (the
     recreated context killed the running tweens). */
  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;
      const mm = gsap.matchMedia();

      mm.add(NO_MOTION_PREF, () => {
        const hwLetters = section.querySelectorAll(".hw-letter");
        const hsLetters = section.querySelectorAll(".hs-letter");
        const bottom = section.querySelectorAll(".hero-bottom > *");

        /* hidden until the loader hands off, without any flash */
        gsap.set(hwLetters, { yPercent: 112 });
        gsap.set(hsLetters, { yPercent: 118 });
        gsap.set(bottom, { autoAlpha: 0 });

        /* letters pull up out of their masks in two alternating waves,
           like the lenis.dev hero reveal */
        const tl = gsap.timeline({ paused: true, defaults: { ease: EASE.appleOut } });
        tl.to(
          hwLetters,
          {
            yPercent: 0,
            duration: 1.05,
            stagger: (i) => (i % 2 === 0 ? 0 : 0.14) + i * 0.03,
          },
          0.05,
        )
          .to(
            hsLetters,
            {
              yPercent: 0,
              duration: 0.75,
              stagger: (i) => (i % 2 === 0 ? 0 : 0.09) + i * 0.016,
            },
            0.45,
          )
          .to(
            bottom,
            { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.09, startAt: { y: 26 } },
            0.9,
          );
        revealRef.current = tl;
        if (revealRequestedRef.current) tl.play();

        /* The cue draws itself: the shaft strokes on from the top, the head
           lands under it, both hold, then the whole arrow slips downward and
           out — the gesture it's asking for. Dash length is the shaft's own
           length (y 1 → 43), so the stroke reveal lines up exactly with the
           geometry rather than being eyeballed. */
        const SHAFT = 42;
        gsap.set(".hero-cue-shaft", {
          strokeDasharray: SHAFT,
          strokeDashoffset: SHAFT,
          opacity: 1,
          y: 0,
        });
        gsap.set(".hero-cue-head", { opacity: 0, y: -5 });

        gsap
          .timeline({ repeat: -1, repeatDelay: 0.5 })
          .to(".hero-cue-shaft", {
            strokeDashoffset: 0,
            duration: 0.6,
            ease: "power2.out",
          })
          .to(
            ".hero-cue-head",
            { opacity: 1, y: 0, duration: 0.32, ease: "power2.out" },
            "-=0.22",
          )
          .to(
            ".hero-cue-arrow",
            { y: 7, opacity: 0, duration: 0.42, ease: "power2.in" },
            "+=0.55",
          )
          /* Reset while invisible: a full dashoffset already hides the shaft,
             so the next cycle can start from a clean slate without a flash. */
          .set(".hero-cue-shaft", { strokeDashoffset: SHAFT })
          .set(".hero-cue-head", { opacity: 0, y: -5 })
          .set(".hero-cue-arrow", { y: 0, opacity: 1 });

        /* wordmark drifts up slightly as you leave the hero */
        gsap.to(".hero-mark-wrap", {
          yPercent: -14,
          autoAlpha: 0.25,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "bottom top",
            scrub: 1,
          },
        });

        /* the credit line has said its piece by the time you start moving —
           it lifts and fades over the first stretch of scroll rather than
           riding along until the viewport edge clips it. fromTo (not to)
           keeps it clear of the reveal tween above, which owns the same
           property while the page is still held at scroll 0. */
        gsap.fromTo(
          ".hero-by",
          { autoAlpha: 1, y: 0 },
          {
            autoAlpha: 0,
            y: -18,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: "+=260",
              scrub: 0.6,
            },
          },
        );

        return () => {
          if (revealRef.current === tl) revealRef.current = null;
        };
      });

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  useEffect(() => {
    const reveal = () => {
      revealRequestedRef.current = true;
      revealRef.current?.play();
    };

    window.addEventListener("intro-reveal", reveal);
    if (introDone) reveal();

    return () => window.removeEventListener("intro-reveal", reveal);
  }, [introDone]);

  const scrollToProjects = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.querySelector("#work")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section ref={sectionRef} className="hero" aria-label="Intro">
      <div className="hero-mark-wrap">
        <h1 className="sr-only">Nexor — fullstack developer</h1>
        <p className="hero-wordmark" aria-hidden="true">
          <NexorWordmark variant="hero" />
        </p>
        <p className="hero-sub" aria-hidden="true">
          {"FULLSTACK DEVELOPER".split("").map((letter, index) => (
            <span className="hs-mask" key={index}>
              <span className="hs-letter">{letter === " " ? "\u00A0" : letter}</span>
            </span>
          ))}
        </p>
      </div>

      <div className="hero-bottom">
        <p className="hero-cue" aria-hidden="true">
          {/* The rule that used to sit here is now the arrow's own shaft, so
              the cue reads as one mark instead of a line plus a label. */}
          <svg
            className="hero-cue-arrow"
            viewBox="0 0 14 52"
            width="14"
            height="52"
            fill="none"
            aria-hidden="true"
          >
            {/* The shaft runs past where the head's arms cross and stops at
                the tip, so the two strokes fuse into one solid arrow — ending
                it early left a notch at the inside of the V. */}
            <line
              className="hero-cue-shaft"
              x1="7"
              y1="1"
              x2="7"
              y2="43"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="hero-cue-head"
              d="M2 34 L7 44 L12 34"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="butt"
              strokeLinejoin="miter"
            />
          </svg>
          <span>
            Scroll
            <br />
            to explore
          </span>
        </p>
        <p className="hero-by">
          Fullstack · DevOps · Security
          <br />
          by{" "}
          <a href={siteConfig.github} target="_blank" rel="noreferrer">
            Nexor / Plattnericus
          </a>
        </p>
        <div className="hero-actions">
          <a className="pill" href={siteConfig.github} target="_blank" rel="noreferrer">
            <PillInner icon={Code} label="GitHub" />
          </a>
          <a className="pill" href="#work" onClick={scrollToProjects}>
            <PillInner icon={ArrowDown} label="Projects" />
          </a>
        </div>
      </div>
    </section>
  );
}
