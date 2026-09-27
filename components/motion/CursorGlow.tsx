"use client";

import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { NO_MOTION_PREF, gsap, useGSAP } from "@/lib/animation";

/** How far (as a share of the pointer's offset from its centre) a pill leans
    toward the cursor, and the most it ever moves. */
const MAGNET_PULL = 0.28;
const MAGNET_MAX = 12;

/**
 * Custom cursor accent: a dot plus a lagging ring that grows over links. Over
 * anything with a data-cursor attribute (the project cards) both give way to
 * a terracotta badge carrying that label, and the native pointer is hidden
 * there. Colours follow the page's dark/cream halves (html[data-light], set
 * by Rethink), and pills are pulled a little toward the pointer.
 */
export default function CursorGlow() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const dot = root.querySelector<HTMLElement>(".cursor-dot");
      const ring = root.querySelector<HTMLElement>(".cursor-ring");
      const badge = root.querySelector<HTMLElement>(".cursor-badge");
      const badgeLabel = root.querySelector<HTMLElement>(".cursor-badge-label");
      if (!dot || !ring || !badge || !badgeLabel) return;
      const mm = gsap.matchMedia();

      mm.add(`(pointer: fine) and ${NO_MOTION_PREF}`, () => {
        const html = document.documentElement;
        html.classList.add("has-cursor");
        gsap.set([dot, ring, badge], { x: -200, y: -200 });
        gsap.set(badge, { scale: 0, autoAlpha: 0 });
        gsap.set(root, { autoAlpha: 0 });
        const dotX = gsap.quickTo(dot, "x", { duration: 0.1, ease: "power2.out" });
        const dotY = gsap.quickTo(dot, "y", { duration: 0.1, ease: "power2.out" });
        const ringX = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3.out" });
        const ringY = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3.out" });
        const badgeX = gsap.quickTo(badge, "x", { duration: 0.35, ease: "power3.out" });
        const badgeY = gsap.quickTo(badge, "y", { duration: 0.35, ease: "power3.out" });

        let visible = false;
        let badgeOn = false;

        /* magnet: the pill under the pointer leans toward it, its label a
           touch further for a bit of depth, and springs back on leave */
        let magnet: {
          el: HTMLElement;
          label: HTMLElement | null;
          cx: number;
          cy: number;
          x: gsap.QuickToFunc;
          y: gsap.QuickToFunc;
          lx: gsap.QuickToFunc | null;
          ly: gsap.QuickToFunc | null;
        } | null = null;
        const releaseMagnet = () => {
          if (!magnet) return;
          const { el, label } = magnet;
          gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.4)", overwrite: "auto" });
          if (label) {
            gsap.to(label, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.4)", overwrite: "auto" });
          }
          magnet = null;
        };
        const grabMagnet = (el: HTMLElement) => {
          releaseMagnet();
          const rect = el.getBoundingClientRect();
          const label = el.querySelector<HTMLElement>(".pill-label");
          magnet = {
            el,
            label,
            /* centre at rest — the pill may still be mid-spring from before */
            cx: rect.left + rect.width / 2 - Number(gsap.getProperty(el, "x")),
            cy: rect.top + rect.height / 2 - Number(gsap.getProperty(el, "y")),
            x: gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" }),
            y: gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" }),
            lx: label ? gsap.quickTo(label, "x", { duration: 0.5, ease: "power3.out" }) : null,
            ly: label ? gsap.quickTo(label, "y", { duration: 0.5, ease: "power3.out" }) : null,
          };
        };
        const clampPull = gsap.utils.clamp(-MAGNET_MAX, MAGNET_MAX);

        const onMove = (event: PointerEvent) => {
          if (!visible) {
            visible = true;
            gsap.to(root, { autoAlpha: 1, duration: 0.25, overwrite: true });
          }
          const { clientX: x, clientY: y } = event;
          dotX(x);
          dotY(y);
          ringX(x);
          ringY(y);
          badgeX(x);
          badgeY(y);
          if (magnet) {
            const dx = clampPull((x - magnet.cx) * MAGNET_PULL);
            const dy = clampPull((y - magnet.cy) * MAGNET_PULL);
            magnet.x(dx);
            magnet.y(dy);
            magnet.lx?.(dx * 0.35);
            magnet.ly?.(dy * 0.35);
          }
        };

        const onOver = (event: PointerEvent) => {
          const target = event.target as Element | null;
          const labelled = target?.closest<HTMLElement>("[data-cursor]");
          const interactive = target?.closest("a, button");

          if (labelled && !badgeOn) {
            badgeOn = true;
            badgeLabel.textContent = labelled.dataset.cursor ?? "";
            /* "auto", not true: true would also kill the quickTo tweens
               that make these follow the pointer */
            gsap.to(badge, { scale: 1, autoAlpha: 1, duration: 0.45, ease: "back.out(1.8)", overwrite: "auto" });
            gsap.to([ring, dot], { scale: 0, duration: 0.3, ease: "power3.out", overwrite: "auto" });
          } else if (!labelled && badgeOn) {
            badgeOn = false;
            gsap.to(badge, { scale: 0, autoAlpha: 0, duration: 0.3, ease: "power3.in", overwrite: "auto" });
            gsap.to(dot, { scale: 1, duration: 0.3, ease: "power3.out", overwrite: "auto" });
          }
          if (!labelled) {
            ring.classList.toggle("is-link", !!interactive);
            gsap.to(ring, {
              scale: interactive ? 1.9 : 1,
              duration: 0.35,
              ease: "power3.out",
              overwrite: "auto",
            });
          }

          const pill = target?.closest<HTMLElement>(".pill");
          if (pill && pill !== magnet?.el) grabMagnet(pill);
          else if (!pill && magnet) releaseMagnet();
        };

        /* the pointer left the window: nothing should be left hanging at the
           edge it went out through */
        const onLeave = (event: PointerEvent) => {
          if (event.relatedTarget) return;
          visible = false;
          gsap.to(root, { autoAlpha: 0, duration: 0.25, overwrite: true });
          releaseMagnet();
        };
        const onDown = () =>
          gsap.to(badgeOn ? badge : ring, { scale: badgeOn ? 0.86 : 0.75, duration: 0.15, ease: "power2.out" });
        const onUp = () =>
          gsap.to(badgeOn ? badge : ring, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" });

        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerover", onOver, { passive: true });
        document.addEventListener("pointerout", onLeave, { passive: true });
        window.addEventListener("pointerdown", onDown);
        window.addEventListener("pointerup", onUp);

        return () => {
          html.classList.remove("has-cursor");
          releaseMagnet();
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerover", onOver);
          document.removeEventListener("pointerout", onLeave);
          window.removeEventListener("pointerdown", onDown);
          window.removeEventListener("pointerup", onUp);
        };
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="cursor-layer" aria-hidden="true">
      <span className="cursor-dot" />
      <span className="cursor-ring" />
      <span className="cursor-badge">
        <span className="cursor-badge-label" />
        <ArrowUpRight />
      </span>
    </div>
  );
}
