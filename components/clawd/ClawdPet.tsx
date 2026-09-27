"use client";

import { useEffect, useRef, useState } from "react";
import { MM_DESKTOP, gsap, ScrollTrigger, useGSAP } from "@/lib/animation";
import { useSmoothScroll } from "@/components/providers/SmoothScrollProvider";
import type { PerchPhase } from "./perchJump";
import {
  CLAWD_SPRITES,
  CLICK_REACTIONS,
  IDLE_FLAVOR,
  SCROLL_CLIPS,
  SECTION_CLIPS,
  type ClawdClip,
} from "@/lib/clawd";

/* Priorities: a state may only be replaced by an equal-or-higher one,
   or by anything once it expires. */
const PRIORITY: Record<string, number> = {
  idle: 0,
  flavor: 1,
  section: 2,
  velocity: 3,
  /* flying to or sitting on the GitHub mark (perchJump.ts) — only a click
     reaction may interrupt it */
  perch: 3.5,
  click: 4,
};

type PetState = {
  clip: ClawdClip;
  kind: keyof typeof PRIORITY;
  until: number;
  bubble?: string;
};

const IDLE_STATE: PetState = { clip: "IDLE", kind: "idle", until: Infinity };
/* in the air he is his calm idle self; on the mark he opens his laptop */
const FLY_STATE: PetState = { clip: "IDLE", kind: "perch", until: Infinity };
const SIT_STATE: PetState = { clip: "TYPING", kind: "perch", until: Infinity };

/** Loads the idle sprite (calls onReady once it can paint, or after a hard
    timeout) and warms the other clips off the critical path; returns a
    cancel function. */
function loadSprites(onReady: () => void) {
  let cancelled = false;
  const markReady = () => {
    if (!cancelled) onReady();
  };

  /* Absolute guarantee: reveal Clawd within 2.5s even if the sprite request
     stalls without ever firing load *or* error (a hung fetch, not a clean
     failure) — he must never be trapped permanently unmounted behind it. */
  const hardReady = window.setTimeout(markReady, 2500);

  const idleImg = new Image();
  idleImg.onload = markReady;
  idleImg.onerror = () => {
    /* one retry, then reveal the pet anyway on whatever the browser
       eventually resolves — a flaky first request must not permanently
       hide Clawd */
    window.setTimeout(() => {
      if (cancelled) return;
      const retry = new Image();
      retry.onload = markReady;
      retry.onerror = markReady;
      retry.src = CLAWD_SPRITES.IDLE;
    }, 600);
  };
  idleImg.src = CLAWD_SPRITES.IDLE;

  /* warm the rest of the clips off the critical path, but with a bounded
     timeout — a bare requestIdleCallback can get starved indefinitely
     while GSAP/ScrollTrigger/Three.js keep the main thread busy, which is
     exactly what let a freshly-clicked clip sometimes fail to have loaded
     yet. The timeout guarantees it fires within 2s regardless. */
  const rest = Object.values(CLAWD_SPRITES).filter((src) => src !== CLAWD_SPRITES.IDLE);
  const schedule = (cb: () => void) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(cb, { timeout: 2000 });
    } else {
      window.setTimeout(cb, 400);
    }
  };
  schedule(() => {
    if (cancelled) return;
    rest.forEach((src) => {
      const img = new Image();
      /* background warm-up: never ahead of the project clips or fonts */
      img.fetchPriority = "low";
      img.decoding = "async";
      img.src = src;
    });
  });

  return () => {
    cancelled = true;
    window.clearTimeout(hardReady);
  };
}

export default function ClawdPet() {
  const { lenisRef, introDone } = useSmoothScroll();
  const [state, setState] = useState<PetState>(IDLE_STATE);
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  /* what he falls back to once a reaction is over: idle, or typing while he
     sits on the GitHub mark */
  const baseRef = useRef<PetState>(IDLE_STATE);
  const phaseRef = useRef<PerchPhase>("home");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /* propose() is the single entry into the state machine */
  const proposeRef = useRef((next: PetState) => {
    const current = stateRef.current;
    const expired = performance.now() > current.until;
    if (!expired && PRIORITY[next.kind] < PRIORITY[current.kind]) return;
    setState(next);
  });

  /* appear only after the intro, and only on motion-friendly desktops. The
     media query gates the downloads too: on phones (where CSS hides Clawd
     anyway) not a single clip is fetched. It is watched live, so a window
     that grows into desktop size still gets him. */
  useEffect(() => {
    if (!introDone) return;
    const desktop = window.matchMedia(MM_DESKTOP);
    let stop: (() => void) | null = null;
    const start = () => {
      if (!stop && desktop.matches) stop = loadSprites(() => setReady(true));
    };
    start();
    desktop.addEventListener("change", start);
    return () => {
      desktop.removeEventListener("change", start);
      stop?.();
    };
  }, [introDone]);

  /* behavior loops: flavor idles, scroll velocity, section context */
  useEffect(() => {
    if (!ready) return;
    const propose = proposeRef.current;

    /* random flavor every 12–20s */
    let flavorTimer: number;
    const scheduleFlavor = () => {
      flavorTimer = window.setTimeout(() => {
        const clip = IDLE_FLAVOR[Math.floor(Math.random() * IDLE_FLAVOR.length)];
        propose({ clip, kind: "flavor", until: performance.now() + 3200 });
        scheduleFlavor();
      }, 12000 + Math.random() * 8000);
    };
    scheduleFlavor();

    /* Hero-corner hide — Clawd steps aside while the hero owns the top-right
       corner, then re-appears past it. Polled from the hero's real on-screen
       position (in the scroll interval below) rather than a ScrollTrigger
       toggle: a toggle strands Clawd invisible whenever the sprite becomes
       ready only after the user has already scrolled past the hero, or when a
       ScrollTrigger.refresh (font load, the rethink height, a resize) fires
       mid-scroll. A getBoundingClientRect read is always truthful, so the
       visibility self-heals on the very next tick and can never get stuck. */
    const heroEl = document.querySelector(".hero");
    let hidden: boolean | null = null;
    const syncHero = (instant = false) => {
      const root = rootRef.current;
      if (!root || !heroEl) return;
      const bottom = heroEl.getBoundingClientRect().bottom;
      /* Hysteresis dead-zone around the boundary: a scroll that settles right on
         the hero edge can't strobe Clawd's fade in and out. */
      let shouldHide = hidden ?? bottom > 0;
      if (bottom > 8) shouldHide = true;
      else if (bottom < -8) shouldHide = false;
      if (shouldHide === hidden) return;
      hidden = shouldHide;
      /* overwrite: a fade still running from the last poll must not carry on
         and undo this */
      if (instant) gsap.set(root, { autoAlpha: shouldHide ? 0 : 1, overwrite: true });
      else
        gsap.to(root, {
          autoAlpha: shouldHide ? 0 : 1,
          duration: 0.35,
          ease: "power2.out",
          overwrite: true,
        });
    };
    syncHero(true);

    /* the flight to and from the GitHub mark (perchJump.ts) moves this very
       element; here he only changes clip, and can't be dragged off mid-way */
    const onPerch = (event: Event) => {
      const next = (event as CustomEvent<PerchPhase>).detail;
      phaseRef.current = next;
      rootRef.current?.classList.toggle("is-flying", next === "fly");
      rootRef.current?.classList.toggle("is-perched", next === "sit");
      const base = next === "fly" ? FLY_STATE : next === "sit" ? SIT_STATE : IDLE_STATE;
      baseRef.current = next === "sit" ? SIT_STATE : IDLE_STATE;
      stateRef.current = base;
      setState(base);
    };
    window.addEventListener("clawd-perch", onPerch);
    /* tells the row he is in his corner now, in case it is already waiting
       for him at its end */
    window.dispatchEvent(new Event("clawd-ready"));

    /* fast scrolling → a random work clip per burst (IDLE stays the baseline) */
    let velocityStart = 0;
    const onScroll = () => {
      syncHero();
      const velocity = Math.abs(lenisRef.current?.velocity ?? 0);
      if (velocity > 40) {
        if (!velocityStart) velocityStart = performance.now();
        if (performance.now() - velocityStart > 250) {
          const current = stateRef.current;
          const stillScrolling =
            current.kind === "velocity" && performance.now() < current.until;
          if (stillScrolling) {
            /* same clip, just keep it alive — extending the deadline in the
               ref avoids re-rendering Clawd every 200ms of a long scroll */
            stateRef.current = { ...current, until: performance.now() + 1500 };
          } else {
            const clip = SCROLL_CLIPS[Math.floor(Math.random() * SCROLL_CLIPS.length)];
            propose({ clip, kind: "velocity", until: performance.now() + 1500 });
          }
        }
      } else {
        velocityStart = 0;
      }
    };
    const scrollInterval = window.setInterval(onScroll, 200);

    /* section context via ScrollTrigger, same pattern as DynamicFavicon —
       the line (if any) only the first time, so it never nags */
    const triggers = SECTION_CLIPS.flatMap(({ selector, clip, line }) => {
      const el = document.querySelector(selector);
      if (!el) return [];
      let said = false;
      const enter = () => {
        const bubble = line && !said ? line : undefined;
        if (bubble) said = true;
        propose({ clip, kind: "section", until: performance.now() + 4000, bubble });
      };
      return [
        ScrollTrigger.create({
          trigger: el,
          start: "top 60%",
          end: "bottom 40%",
          onEnter: enter,
          onEnterBack: enter,
        }),
      ];
    });

    /* fall back to IDLE whenever the active state expires */
    const expiry = window.setInterval(() => {
      const current = stateRef.current;
      if (current.kind !== "idle" && performance.now() > current.until) {
        setState(baseRef.current);
      }
    }, 500);

    return () => {
      window.removeEventListener("clawd-perch", onPerch);
      window.clearTimeout(flavorTimer);
      window.clearInterval(scrollInterval);
      window.clearInterval(expiry);
      triggers.forEach((trigger) => trigger.kill());
    };
  }, [ready, lenisRef]);

  /* Swapping <img src> straight to state.clip flashes a blank frame on every
     change — the browser un-paints the old bitmap before the new sprite is
     decoded, which reads as a black flicker over the dark sections. Decode
     the next clip off-screen first and only repoint the visible <img> once
     it's actually paintable, so the old frame stays put until the new one
     can replace it with nothing in between. */
  const [displaySrc, setDisplaySrc] = useState(CLAWD_SPRITES.IDLE);
  useEffect(() => {
    /* Gated on ready for the same reason the sprite itself is: with reduced
       motion (or before the intro finishes) Clawd never mounts, so this
       decode-ahead fetch would otherwise pull a sprite nobody is going to see. */
    if (!ready) return;
    const nextSrc = CLAWD_SPRITES[state.clip];
    let cancelled = false;
    const img = new Image();
    img.src = nextSrc;
    const swap = () => {
      if (!cancelled) setDisplaySrc(nextSrc);
    };
    if (typeof img.decode === "function") {
      img.decode().then(swap, swap);
    } else {
      img.onload = swap;
      img.onerror = swap;
    }
    return () => {
      cancelled = true;
    };
  }, [state.clip, ready]);

  /* speech bubble pops in, then writes itself out letter by letter.
     useGSAP (not a raw useEffect) so cleanup/rebuild on every state change
     goes through gsap's own context revert instead of manual tl.kill() calls
     — the same pattern the rest of this codebase uses for React-driven GSAP
     timelines (see Hero.tsx), and it's StrictMode-safe by construction. */
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  useGSAP(
    () => {
      const el = bubbleRef.current;
      if (!el || !state.bubble) return;
      const letters = el.querySelectorAll(".clawd-bubble-letter");

      /* prefer above the sprite; flip below only when the viewport doesn't
         leave room — Clawd's default spawn sits close to the top edge, so
         that's the common case there, while a dragged-down Clawd gets the
         bubble above like normal. */
      const spriteTop = rootRef.current?.getBoundingClientRect().top ?? Infinity;
      const below = spriteTop < el.offsetHeight + 16;
      el.classList.toggle("clawd-bubble--below", below);
      const enterY = below ? -10 : 10;
      const exitY = below ? 8 : -8;

      const tl = gsap.timeline();
      tl.fromTo(
        el,
        { y: enterY, autoAlpha: 0, scale: 0.9 },
        { y: 0, autoAlpha: 1, scale: 1, duration: 0.3, ease: "back.out(2)" },
      ).fromTo(
        letters,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.01, stagger: 0.032, ease: "none" },
        0.1,
      );

      const lead = Math.max(200, state.until - performance.now() - 320);
      gsap.to(el, {
        y: exitY,
        autoAlpha: 0,
        duration: 0.3,
        ease: "power2.in",
        delay: lead / 1000,
      });
    },
    { dependencies: [state], scope: bubbleRef },
  );

  /* drag & drop: Clawd can be carried anywhere on screen */
  const dragMoved = useRef(false);
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const root = rootRef.current;
    if (!root) return;
    dragMoved.current = false;
    /* on the mark he stays put — a click still gets a reaction */
    if (phaseRef.current !== "home") return;
    const rect = root.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const startX = event.clientX;
    const startY = event.clientY;
    const sprite = event.currentTarget;
    sprite.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent) => {
      if (Math.hypot(move.clientX - startX, move.clientY - startY) > 6) {
        dragMoved.current = true;
      }
      if (!dragMoved.current) return;
      const x = Math.min(
        Math.max(move.clientX - offsetX, 8),
        window.innerWidth - rect.width - 8,
      );
      const y = Math.min(
        Math.max(move.clientY - offsetY, 8),
        window.innerHeight - rect.height - 8,
      );
      root.style.left = `${x}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
      root.style.top = `${y}px`;
    };
    const onUp = () => {
      sprite.releasePointerCapture(event.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      /* pointer-driven focus still satisfies some browsers' :focus-visible
         heuristic (Chromium keeps the ring after a drag more readily than
         after a plain click) — drop it immediately so mouse/touch users
         never see the keyboard focus ring; real keyboard Tab focus re-shows
         it normally, since that's a separate focus event fired after this. */
      sprite.blur();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const lastReaction = useRef(-1);
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (dragMoved.current) return; // a drag is not a click
    event.currentTarget.blur();
    /* never the same one twice in a row */
    const first = lastReaction.current < 0;
    let pick = Math.floor(Math.random() * (CLICK_REACTIONS.length - (first ? 0 : 1)));
    if (!first && pick >= lastReaction.current) pick += 1;
    lastReaction.current = pick;
    const reaction = CLICK_REACTIONS[pick];
    proposeRef.current({
      clip: reaction.clip,
      kind: "click",
      until: performance.now() + 2600,
      bubble: reaction.line,
    });
  };

  if (!ready) return null;

  return (
    <div className="clawd-pet" aria-hidden={false} ref={rootRef}>
      {/* bubble is absolutely positioned off the sprite (see .clawd-bubble),
          so it can never push the sprite itself out of position */}
      <button
        type="button"
        className="clawd-sprite"
        onClick={onClick}
        onPointerDown={onPointerDown}
        aria-label="Clawd, the site mascot — click for a reaction, drag to move him"
      >
        {/* plain <img>: animated sprites must not go through next/image optimization */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={displaySrc} alt="" width={96} height={96} draggable={false} />
      </button>
      {state.bubble && (
        <span className="clawd-bubble" ref={bubbleRef}>
          {state.bubble.split("").map((char, index) => (
            <span className="clawd-bubble-letter" key={index}>
              {char === " " ? "\u00A0" : char}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
