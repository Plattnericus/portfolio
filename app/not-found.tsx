"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/** What Clawd says when he is poked, in turn. */
const LINES = ["Still 404.", "Retrying…", "Nope. Gone.", "Try the homepage?"];

/** Most the 404 tilts toward the pointer (deg). */
const TILT = 7;

export default function NotFound() {
  const rootRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  /* Read after mount: the 404 HTML is prerendered once for every unknown URL,
     so the path is only known in the browser (and must not cause a hydration
     mismatch). */
  const [path, setPath] = useState("");
  const [line, setLine] = useState<string | null>(null);
  const lineIndex = useRef(0);
  const lineTimer = useRef(0);
  const leaving = useRef(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPath(window.location.pathname));
    /* the way home is the one click that matters here — have it ready */
    router.prefetch("/");
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(lineTimer.current);
    };
  }, [router]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF, () => {
        /* same move as the homepage hero: the glyphs pull up out of their
           masks in alternating waves, then the rest of the column follows
           and Clawd drops onto the 0 */
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
            { y: -90, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.5, ease: "power2.in" },
            1.05,
          )
          .fromTo(
            ".nf-clawd img",
            { scaleX: 1.12, scaleY: 0.88 },
            { scaleX: 1, scaleY: 1, duration: 0.5, ease: "back.out(2)" },
            1.55,
          );
      });

      /* desktop pointers: the 404 leans toward the cursor like a card */
      mm.add(`(pointer: fine) and (min-width: 900px) and ${NO_MOTION_PREF}`, () => {
        const code = rootRef.current?.querySelector<HTMLElement>(".nf-code");
        if (!code) return;
        gsap.set(code, { transformPerspective: 1000 });
        const rotateX = gsap.quickTo(code, "rotationX", { duration: 0.9, ease: "power3.out" });
        const rotateY = gsap.quickTo(code, "rotationY", { duration: 0.9, ease: "power3.out" });
        const onMove = (event: PointerEvent) => {
          if (leaving.current) return;
          rotateY(((event.clientX / window.innerWidth) * 2 - 1) * TILT);
          rotateX(-((event.clientY / window.innerHeight) * 2 - 1) * TILT);
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        return () => window.removeEventListener("pointermove", onMove);
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  /* the requested path types itself into the trace, like a request going out */
  useGSAP(
    () => {
      const target = rootRef.current?.querySelector<HTMLElement>(".nf-trace-path");
      if (!target || !path) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF, () => {
        const proxy = { n: 0 };
        target.textContent = "";
        gsap.to(proxy, {
          n: path.length,
          duration: Math.min(0.9, 0.2 + path.length * 0.04),
          delay: 1.2,
          ease: "none",
          snap: { n: 1 },
          onUpdate: () => {
            target.textContent = path.slice(0, proxy.n);
          },
        });
        gsap.fromTo(
          ".nf-trace-status",
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.3, delay: 1.3 + Math.min(0.9, 0.2 + path.length * 0.04) },
        );
        return () => {
          target.textContent = path;
        };
      });
      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [path] },
  );

  const pokeClawd = () => {
    const next = LINES[lineIndex.current % LINES.length];
    lineIndex.current += 1;
    setLine(next);
    window.clearTimeout(lineTimer.current);
    lineTimer.current = window.setTimeout(() => setLine(null), 2200);
    const img = rootRef.current?.querySelector(".nf-clawd img");
    if (img && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap
        .timeline()
        .to(img, { y: "-18%", duration: 0.18, ease: "power2.out" })
        .to(img, { y: 0, duration: 0.3, ease: "bounce.out" });
    }
  };

  /* Home through the stars: the field jumps to warp, the 404 falls away into
     it and a curtain rises from below — orange on desktop, where the NEXOR
     intro that greets you is that same orange, so the two read as one move. */
  const warpHome = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    if (leaving.current) return;
    leaving.current = true;
    window.dispatchEvent(new Event("nf-warp"));
    const root = rootRef.current;
    const desktop = window.matchMedia("(min-width: 900px)").matches;
    gsap
      .timeline()
      .to(root?.querySelector(".nf-code") ?? [], {
        rotationX: 0,
        rotationY: 0,
        scale: 1.6,
        autoAlpha: 0,
        duration: 0.7,
        ease: "power3.in",
      })
      .to(
        root?.querySelectorAll(".nf-rise") ?? [],
        { y: -30, autoAlpha: 0, duration: 0.45, stagger: 0.04, ease: "power2.in" },
        0,
      )
      .set(".nf-curtain", { backgroundColor: desktop ? "#d97757" : "#0b0908" }, 0)
      /* y: 0 first — GSAP would otherwise read the CSS translateY(100%) as a
         pixel offset and keep it on top of the yPercent */
      .fromTo(
        ".nf-curtain",
        { y: 0, yPercent: 100 },
        { y: 0, yPercent: 0, duration: 0.6, ease: "expo.inOut" },
        0.4,
      )
      /* navigate while the curtain is in its last few percent: the homepage
         takes a moment to mount, and its intro opens on the same orange, so
         starting early hides that wait instead of holding a blank curtain */
      .call(() => router.push("/"), undefined, 0.78);
  };

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

          {/* Clawd keeps retrying the missing page, sitting on the 0 */}
          <button
            type="button"
            className="nf-clawd"
            onClick={pokeClawd}
            aria-label="Clawd, the site mascot — click him"
          >
            {line && (
              <span className="nf-bubble" role="status">
                {line}
              </span>
            )}
            {/* plain <img>: animated sprite */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CLAWD_SPRITES.ERROR_RETRY} alt="" width={192} height={192} draggable={false} />
          </button>
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
          <Link className="pill" href="/" onClick={warpHome}>
            <PillInner icon={ArrowLeft} label="Back to Nexor" roll="left" />
          </Link>
          <a className="pill" href={siteConfig.github} target="_blank" rel="noreferrer">
            <PillInner icon={Code} label="GitHub" />
          </a>
        </div>
      </div>

      <div className="nf-curtain" aria-hidden="true" />
    </main>
  );
}
