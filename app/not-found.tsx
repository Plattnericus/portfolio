"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PERSPECTIVE, createStackHopper } from "@/components/clawd/stackHop";
import CursorGlow from "@/components/motion/CursorGlow";
import PillInner from "@/components/ui/PillInner";
import { EASE, NO_MOTION_PREF, gsap, useGSAP } from "@/lib/animation";
import { CLAWD_SPRITES } from "@/lib/clawd";

/* WebGL-only and purely decorative — kept out of the server render and out of
   the initial bundle, exactly like the homepage canvas. */
const NotFoundScene = dynamic(() => import("@/components/gl/NotFoundScene"), { ssr: false });

const DIGITS = ["4", "0", "4"] as const;

/** What Clawd says when he is poked, in turn. */
const LINES = ["Still 404.", "Retrying…", "Nope. Gone.", "Try the homepage?"];

/** Most the 404 tilts toward the pointer (deg). */
const TILT = 6;

/** When Clawd drops onto the 0, into the intro below (ms). */
const CLAWD_ENTERS = 1050;

/** Longest the intro waits for the WebGL scene to be ready (ms from mount) —
    a slow model or a busy GPU must never hold the page. */
const SCENE_WAIT = 1100;

/** When the homepage is prefetched: once the intro has played, so its
    download and parsing stay out of the intro's frames (ms). */
const PREFETCH_AFTER = 2600;

/** How long a line stays up (ms). */
const TALK = 2200;

/** Text Clawd can hop along: whole words (so their kerning stays), each one
    giving under him as a piece. Screen readers get the plain line. */
function HopText({ text }: { text: string }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split(" ").map((word, index) => (
          <Fragment key={index}>
            {index > 0 && " "}
            <span className="nf-word">{word}</span>
          </Fragment>
        ))}
      </span>
    </>
  );
}

export default function NotFound() {
  const rootRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const [line, setLine] = useState<string | null>(null);
  const lineIndex = useRef(0);
  const lineTimer = useRef(0);
  const leaving = useRef(false);
  const hopper = useRef<ReturnType<typeof createStackHopper>>(null);

  useEffect(() => {
    /* the way home is the one click that matters here — have it ready */
    const prefetch = window.setTimeout(() => router.prefetch("/"), PREFETCH_AFTER);
    return () => {
      window.clearTimeout(prefetch);
      window.clearTimeout(lineTimer.current);
    };
  }, [router]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_PREF, () => {
        const content = rootRef.current?.querySelector<HTMLElement>(".nf-content");
        /* same move as the homepage hero: the glyphs pull up out of their
           masks in alternating waves, then the rest of the column follows.
           Built paused — the from-states apply right away, while the column
           is still hidden (see .nf-content in globals.css) */
        const intro = gsap
          .timeline({ paused: true, defaults: { ease: EASE.appleOut } })
          .fromTo(
            ".nf-digit",
            { yPercent: 115 },
            { yPercent: 0, duration: 1.1, stagger: (i) => (i % 2 ? 0.14 : 0) + i * 0.05 },
            0.15,
          )
          .fromTo(
            ".nf-rise",
            { y: 24, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.1 },
            0.6,
          );

        /* then Clawd drops onto the 0 and starts hopping about on everything
           — the digits, the letters, the button — and over to whatever the
           pointer is on, too */
        const hop = content ? createStackHopper(content, () => setLine(null)) : null;
        hopper.current = hop;

        /* The column rises once the starfield and the arm are ready to draw.
           Loading three, making the WebGL context and compiling the arm's
           shaders used to happen in the middle of the rise and froze it —
           now they happen first, under the empty starfield. */
        let started = false;
        let cap = 0;
        const start = () => {
          if (started) return;
          started = true;
          window.clearTimeout(cap);
          window.removeEventListener("nf-scene-ready", start);
          hop?.enter(CLAWD_ENTERS);
          intro.play();
          if (content) content.style.visibility = "visible";
        };
        window.addEventListener("nf-scene-ready", start);
        cap = window.setTimeout(start, SCENE_WAIT);

        const onResize = () => hop?.resize();
        window.addEventListener("resize", onResize);
        return () => {
          window.clearTimeout(cap);
          window.removeEventListener("nf-scene-ready", start);
          window.removeEventListener("resize", onResize);
          content?.style.removeProperty("visibility");
          hop?.destroy();
          hopper.current = null;
        };
      });

      /* desktop pointers: the 404 leans toward the cursor like a card */
      mm.add(`(pointer: fine) and (min-width: 900px) and ${NO_MOTION_PREF}`, () => {
        const code = rootRef.current?.querySelector<HTMLElement>(".nf-code");
        if (!code) return;
        gsap.set(code, { transformPerspective: PERSPECTIVE });
        /* one lean, handed to the 404 and to Clawd, who leans along with it
           while he is standing on it */
        const lean = { x: 0, y: 0 };
        const apply = () => {
          if (leaving.current) return;
          gsap.set(code, { rotationX: lean.x, rotationY: lean.y });
          hopper.current?.tilt(lean.x, lean.y);
        };
        const ease = { duration: 0.9, ease: "power3.out", onUpdate: apply };
        const rotateX = gsap.quickTo(lean, "x", ease);
        const rotateY = gsap.quickTo(lean, "y", ease);
        const onMove = (event: PointerEvent) => {
          if (leaving.current) return;
          rotateY(((event.clientX / window.innerWidth) * 2 - 1) * TILT);
          rotateX(-((event.clientY / window.innerHeight) * 2 - 1) * TILT);
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        return () => {
          window.removeEventListener("pointermove", onMove);
          /* set from the tweens' updates, outside this context's record —
             straightened by hand when the lean goes away (a narrower window) */
          if (!leaving.current) {
            gsap.set(code, { rotationX: 0, rotationY: 0 });
            hopper.current?.tilt(0, 0);
          }
        };
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  const pokeClawd = () => {
    const next = LINES[lineIndex.current % LINES.length];
    lineIndex.current += 1;
    setLine(next);
    window.clearTimeout(lineTimer.current);
    lineTimer.current = window.setTimeout(() => setLine(null), TALK);
    hopper.current?.poke(TALK);
  };

  /* the bubble never leaves the screen: near an edge it slides back on, its
     tail staying on him */
  useLayoutEffect(() => {
    const bubble = rootRef.current?.querySelector<HTMLElement>(".nf-bubble");
    if (!bubble) return;
    bubble.style.removeProperty("--bubble-shift");
    /* its width as laid out: it is still scaled down in its pop-in, about
       its own centre line */
    const rect = bubble.getBoundingClientRect();
    const half = bubble.offsetWidth / 2;
    const middle = rect.left + rect.width / 2;
    const edge = 8;
    const limit = Math.max(0, half - 18);
    const over = middle + half - (window.innerWidth - edge);
    const under = edge - (middle - half);
    const shift = gsap.utils.clamp(-limit, limit, over > 0 ? -over : under > 0 ? under : 0);
    if (shift) bubble.style.setProperty("--bubble-shift", `${shift.toFixed(2)}px`);
  }, [line]);

  /* Home through the stars: the field jumps to warp, the 404 falls away into
     it and a curtain rises from below — orange on desktop, where the NEXOR
     intro that greets you is that same orange, so the two read as one move. */
  const warpHome = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    if (leaving.current) return;
    leaving.current = true;
    /* Clawd goes with whatever he is standing on: into the warp with the
       404, or up and away with the text */
    const onDigits = hopper.current?.onDigits() ?? true;
    hopper.current?.stop();
    window.dispatchEvent(new Event("nf-warp"));
    const root = rootRef.current;
    const desktop = window.matchMedia("(min-width: 900px)").matches;
    const code = root?.querySelector(".nf-code");
    const clawdTilt = root?.querySelector(".nf-clawd-tilt");
    const clawd = root?.querySelector(".nf-clawd");
    gsap
      .timeline()
      .to([code, onDigits ? clawdTilt : null].filter(Boolean), {
        rotationX: 0,
        rotationY: 0,
        scale: 1.6,
        autoAlpha: 0,
        duration: 0.7,
        ease: "power3.in",
      })
      .to(
        [...(root?.querySelectorAll(".nf-rise") ?? []), onDigits ? null : clawd].filter(Boolean),
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
        <h1 className="nf-code" aria-label="404 — page not found">
          {DIGITS.map((digit, index) => (
            <span className="nf-mask" key={index} aria-hidden="true">
              <span className="nf-digit">
                <span className="nexor-type-glyph">{digit}</span>
              </span>
            </span>
          ))}
        </h1>

        <p className="nf-title nf-rise">
          <HopText text="Lost in the stack" />
        </p>
        <p className="nf-copy nf-rise">
          <HopText text="This page doesn't exist — or it moved on." />
        </p>

        <div className="nf-actions nf-rise">
          <Link className="pill" href="/" onClick={warpHome}>
            <PillInner icon={ArrowLeft} label="Back to Nexor" roll="left" />
          </Link>
        </div>

        {/* Clawd hops about on all of it, still retrying the missing page.
            He lives beside the 404, not in it: the 404 leans toward the
            pointer and the text doesn't, and he has to stand straight on
            both (he leans along only while he is on the digits). */}
        <button
          type="button"
          className="nf-clawd"
          onClick={pokeClawd}
          aria-label="Clawd, the site mascot — click him"
        >
          <span className="nf-clawd-tilt">
            <span className="nf-clawd-body">
              {line && (
                <span className="nf-bubble" role="status">
                  {line}
                </span>
              )}
              <span className="nf-clawd-lean">
                {/* plain <img>: animated sprite */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CLAWD_SPRITES.ERROR_RETRY} alt="" width={192} height={192} draggable={false} />
              </span>
            </span>
          </span>
        </button>
      </div>

      <div className="nf-curtain" aria-hidden="true" />
    </main>
  );
}
