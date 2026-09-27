"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Code } from "lucide-react";
import CursorGlow from "@/components/motion/CursorGlow";
import PillInner from "@/components/ui/PillInner";
import { EASE, NO_MOTION_PREF, gsap, useGSAP } from "@/lib/animation";
import { CLAWD_SPRITES } from "@/lib/clawd";
import { siteConfig } from "@/lib/site";

/* WebGL-only and purely decorative — kept out of the server render and out of
   the initial bundle, exactly like the homepage canvas. */
const NotFoundScene = dynamic(() => import("@/components/gl/NotFoundScene"), { ssr: false });

const DIGITS = ["4", "0", "4"] as const;

export default function NotFound() {
  const rootRef = useRef<HTMLElement | null>(null);
  /* Read after mount: the 404 HTML is prerendered once for every unknown URL,
     so the path is only known in the browser (and must not cause a hydration
     mismatch). */
  const [path, setPath] = useState("");

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPath(window.location.pathname));
    return () => cancelAnimationFrame(raf);
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF, () => {
        /* same move as the homepage hero: the glyphs pull up out of their
           masks in alternating waves, then the rest of the column follows */
        gsap
          .timeline({ defaults: { ease: EASE.appleOut } })
          .fromTo(
            ".nf-digit",
            { yPercent: 115 },
            { yPercent: 0, duration: 1.1, stagger: (i) => (i % 2 ? 0.14 : 0) + i * 0.05 },
            0.15,
          )
          .fromTo(
            ".nf-rise",
            { y: 26, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.09 },
            0.6,
          )
          .fromTo(
            ".nf-clawd",
            { y: -12, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.6, ease: "back.out(2)" },
            1.1,
          );
      });
      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <main ref={rootRef} className="nf">
      <NotFoundScene />
      <CursorGlow />

      <div className="nf-content">
        <p className="nf-eyebrow nf-rise">Error 404 · plattnericus.dev</p>

        <h1 className="nf-code" aria-label="404 — page not found">
          {DIGITS.map((digit, index) => (
            <span className="nf-mask" key={index} aria-hidden="true">
              <span className="nf-digit">
                <span className="nexor-type-glyph">{digit}</span>
              </span>
            </span>
          ))}
        </h1>

        <p className="nf-title nf-rise">Lost in the stack</p>
        <p className="nf-copy nf-rise">
          This route was never deployed — or it moved on. Everything that does exist is one
          click away.
        </p>

        <p className="nf-trace nf-rise" aria-hidden="true">
          <span className="nf-trace-method">GET</span>
          <span className="nf-trace-path">{path || "/"}</span>
          <span className="nf-trace-status">404 not found</span>
        </p>

        <div className="nf-actions nf-rise">
          <Link className="pill" href="/">
            <PillInner icon={ArrowLeft} label="Back to Nexor" roll="left" />
          </Link>
          <a className="pill" href={siteConfig.github} target="_blank" rel="noreferrer">
            <PillInner icon={Code} label="GitHub" />
          </a>
        </div>
      </div>

      {/* Clawd keeps retrying the missing page — plain <img>: animated sprite */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="nf-clawd"
        src={CLAWD_SPRITES.ERROR_RETRY}
        alt=""
        width={96}
        height={96}
        draggable={false}
      />
    </main>
  );
}
