"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { detectOS, type OS } from "./osDetect";
import type { Lang } from "./reducedMotionCopy";

type Copy = typeof import("./reducedMotionCopy");
type Shown = { os: OS; lang: Lang; copy: Copy };

/** A visitor with reduced motion enabled sees this site's calm, fully static
    page on purpose — see GLCanvas/ClawdPet/IntroLoader, which all skip
    themselves for exactly that preference. That's the right default for
    someone who set it for real accessibility reasons, but plenty of people
    have it on by accident (an OS default, a battery-saver toggle) and have
    no idea it's why a site looks "broken."

    Deliberately not persisted anywhere: it checks fresh on every page open,
    same as prefers-reduced-motion itself, so it reflects whatever's true
    right now rather than a stale "dismissed once" flag from a visit before
    the visitor actually changed the setting. Dismissing it only silences it
    for the rest of this page view (dismissedRef, not storage) — not a nag,
    but not a stale one either.

    If the media query changes live mid-visit, this reloads rather than
    just hiding the notice in place. The GL canvas mounting, every GSAP
    ScrollTrigger timeline, and Lenis are all gated on this same query but
    only ever evaluated once at load — there's no live path for any of them
    to come alive on their own. The visitor just followed this notice's own
    instructions, so a reload is what actually delivers on "flip it back on
    and see it" instead of quietly hiding the message while leaving the
    whole animated layer frozen in whatever it mounted as.

    The language is read straight from the browser, same as the motion
    preference — there's deliberately no switcher for it. */
export default function ReducedMotionNotice() {
  const [shown, setShown] = useState<Shown | null>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    /* The 50-language table is only fetched by the visitors who will
       actually see it — everyone else never downloads a byte of it. */
    let cancelled = false;
    if (mq.matches) {
      import("./reducedMotionCopy")
        .then((copy) => {
          if (!cancelled && !dismissedRef.current) {
            setShown({ os: detectOS(), lang: copy.detectLang(), copy });
          }
        })
        .catch(() => {});
    }
    const onChange = () => window.location.reload();
    mq.addEventListener("change", onChange);

    return () => {
      cancelled = true;
      mq.removeEventListener("change", onChange);
    };
  }, []);

  if (!shown) return null;

  const dismiss = () => {
    dismissedRef.current = true;
    setShown(null);
  };

  const copy = shown.copy.COPY[shown.lang];
  const rtl = shown.copy.RTL_LANGS.has(shown.lang);

  return (
    <div className="motion-notice" role="status">
      <p dir={rtl ? "rtl" : undefined}>{copy.body(shown.os)}</p>
      <button type="button" className="motion-notice-close" onClick={dismiss} aria-label={copy.dismiss}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
