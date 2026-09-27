"use client";

import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  EASE,
  MM_DESKTOP,
  MM_MOBILE,
  NO_MOTION_PREF,
  PIN,
  ScrollTrigger,
  gsap,
  useGSAP,
} from "@/lib/animation";
import { useSmoothScroll } from "@/components/providers/SmoothScrollProvider";
import RollText from "@/components/ui/RollText";
import { createPerchJump } from "@/components/clawd/perchJump";
import { CLAWD_SPRITES } from "@/lib/clawd";
import { projects } from "@/lib/projects";
import { siteConfig } from "@/lib/site";
import ProjectPreview from "./ProjectPreview";

/** GitHub's own mark (github-mark.svg, 98×96). */
const GITHUB_MARK =
  "M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z";

/** The chip on a card's clip: where the project is running. */
function liveLabel(url: string | null) {
  if (!url) return null;
  return url.includes("modrinth.com") ? "On Modrinth" : "Live";
}

/** Share of the pinned scroll the horizontal travel uses; the rest is a
    dwell on the finished row, where Clawd lands on the GitHub mark. */
const TRAVEL_SHARE = 0.9;
/** How close (px) to its resting spot the mark has to roll before Clawd
    jumps on — with scrub smoothing it creeps the last few px. */
const PERCH_SLACK = 4;
/** How far (% of its own width) a clip drifts inside its frame. */
const PARALLAX = 4;

export default function Showcase() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const { lenisRef } = useSmoothScroll();

  useGSAP(
    () => {
      const section = sectionRef.current;
      const track = section?.querySelector<HTMLElement>(".showcase-track");
      if (!section || !track) return;

      /* The row travels until its far end (the endcap and its GitHub mark,
         padding included) meets the right edge of the screen. */
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const media = gsap.matchMedia();

      media.add(MM_DESKTOP, () => {
        /* The pin is CSS sticky (see .showcase-pin), the same technique the
           Rethink and Heat sections use — not a GSAP pin. A GSAP pin flips the
           element to position: fixed and back, which the browser records as
           layout shifts (CLS ≈ 3.8 on every desktop scroll-through) and which
           made ScrollTrigger reset the page to the top when the viewport
           crossed the mobile breakpoint. Sticky needs the section to be as
           tall as the scroll the horizontal travel consumes, so it is sized
           here before every refresh measures it. */
        const disc = section.querySelector<HTMLElement>(".endcap-disc");
        const perch = section.querySelector<HTMLElement>(".endcap-clawd");
        const jump = perch ? createPerchJump(perch, disc) : null;
        /* travel and the mark's radius, cached per refresh — the roll below
           runs every scroll frame and must not read layout */
        const cards = gsap.utils.toArray<HTMLElement>(".showcase-card", section);
        const media = cards.map((card) => card.querySelector<HTMLElement>(".sc-media"));
        const setMedia = media.map((el) => (el ? gsap.quickSetter(el, "xPercent") : null));
        let travel = distance();
        let radius = 1;
        let half = window.innerWidth / 2;
        /* each card's centre and half-width with the row at rest (offsetLeft
           ignores the transform), for the parallax */
        let geometry: Array<{ center: number; half: number }> = [];
        const sizeSection = () => {
          travel = distance();
          radius = Math.max(1, (disc?.offsetWidth ?? 2) / 2);
          half = window.innerWidth / 2;
          geometry = cards.map((card) => ({
            center: card.offsetLeft + card.offsetWidth / 2,
            half: card.offsetWidth / 2,
          }));
          section.style.height = `${window.innerHeight + PIN.showcase + travel * 0.4}px`;
          jump?.resize();
        };
        sizeSection();
        ScrollTrigger.addEventListener("refreshInit", sizeSection);

        /* The GitHub mark rolls in like a wheel: its turn is exactly the
           distance it still has to travel over its own radius, so it comes to
           rest upright on the very frame the row stops — then Clawd hops off
           the corner and lands on top of it. */
        const setRoll = disc ? gsap.quickSetter(disc, "rotation", "deg") : null;
        /* ClawdPet reads this attribute to step out of (and back into) his
           corner, so there is only ever one of him on screen */
        const announce = (onMark: boolean) => {
          document.documentElement.toggleAttribute("data-clawd-perched", onMark);
          window.dispatchEvent(new Event("clawd-perch"));
        };
        let perched: boolean | null = null;
        /* scrolled on past the row: he glides home to his corner, and back
           onto the mark if you come back up */
        let pastEnd = false;
        const setPerched = (next: boolean, instant: boolean) => {
          if (next === perched) return;
          perched = next;
          if (instant || !jump) {
            announce(next);
            jump?.settle(next);
          } else if (next) {
            announce(true);
            jump.land();
          } else {
            /* the corner copy only comes back once he has actually got there */
            jump.leave(() => announce(false));
          }
        };
        jump?.settle(false);

        const syncMark = (instant = false) => {
          const x = Number(gsap.getProperty(track, "x"));
          const remaining = Math.max(0, x + travel);

          /* each clip drifts against its card's travel, a few percent of its
             own width, so the footage sits a little deeper than its frame */
          geometry.forEach((card, index) => {
            const offset = card.center + x - half;
            setMedia[index]?.(-gsap.utils.clamp(-1, 1, offset / (half + card.half)) * PARALLAX);
          });

          setRoll?.((remaining / radius) * (180 / Math.PI));
          /* on at the resting spot, off only once the mark is clearly rolling
             away again — scrub smoothing creeps, and he must not hop on and
             off over a few pixels */
          if (pastEnd) setPerched(false, instant);
          else if (remaining <= PERCH_SLACK) setPerched(true, instant);
          else if (remaining > PERCH_SLACK * 6 || perched === null) setPerched(false, instant);
        };

        const tween = gsap
          .timeline({
            scrollTrigger: {
              id: "showcase",
              trigger: section,
              start: "top top",
              end: "bottom bottom",
              scrub: 1,
              invalidateOnRefresh: true,
              onRefresh: (self) => {
                pastEnd = self.scroll() > self.end;
                syncMark(true);
              },
              onLeave: () => {
                pastEnd = true;
                syncMark();
              },
              onEnterBack: () => {
                pastEnd = false;
                syncMark();
              },
            },
            onUpdate: () => syncMark(),
          })
          .to(track, { x: () => -distance(), ease: "none", duration: TRAVEL_SHARE })
          /* the dwell: nothing moves, the finished row just holds */
          .to({}, { duration: 1 - TRAVEL_SHARE });

        /* Keyboard focus on a card that sits off to the side: the pin clips
           with overflow: clip, so the browser can no longer scroll it sideways
           (that used to shove the whole row — heading included — out of view
           for good). Instead the page scrolls to the point in the pin where
           that card is centred on screen. */
        const onFocusIn = (event: FocusEvent) => {
          const st = tween.scrollTrigger;
          const item = (event.target as Element | null)?.closest<HTMLElement>(
            ".showcase-card, .showcase-endcap",
          );
          const total = distance();
          if (!st || !item || total <= 0) return;
          const rect = item.getBoundingClientRect();
          const baseLeft = rect.left - Number(gsap.getProperty(track, "x"));
          const targetX = gsap.utils.clamp(
            -total,
            0,
            window.innerWidth / 2 - rect.width / 2 - baseLeft,
          );
          const y = st.start + (-targetX / total) * TRAVEL_SHARE * (st.end - st.start);
          const lenis = lenisRef.current;
          if (lenis) lenis.scrollTo(y, { duration: 0.9 });
          else window.scrollTo({ top: y, behavior: "smooth" });
        };
        section.addEventListener("focusin", onFocusIn);

        return () => {
          ScrollTrigger.removeEventListener("refreshInit", sizeSection);
          section.removeEventListener("focusin", onFocusIn);
          section.style.removeProperty("height");
          jump?.destroy();
          announce(false);
          /* quickSetter writes aren't part of the context, so clear them by
             hand before the mobile layout takes over these elements */
          [...media, disc].forEach((el) => el?.style.removeProperty("transform"));
        };
      });

      media.add(MM_MOBILE, () => {
        const items = gsap.utils.toArray<HTMLElement>(
          ".showcase-card, .showcase-endcap",
          section,
        );

        items.forEach((item) => {
          gsap.fromTo(
            item,
            { y: 48, scale: 0.97, autoAlpha: 0 },
            {
              y: 0,
              scale: 1,
              autoAlpha: 1,
              duration: 0.72,
              ease: EASE.soft,
              scrollTrigger: {
                trigger: item,
                start: "top 88%",
                once: true,
              },
            },
          );
        });
      });

      media.add(NO_MOTION_PREF, () => {
        gsap.fromTo(
          ".showcase-head > *",
          { y: 44, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.9,
            stagger: 0.12,
            ease: EASE.soft,
            scrollTrigger: { trigger: section, start: "top 72%" },
          },
        );
      });

      return () => media.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section ref={sectionRef} className="showcase" id="work" aria-labelledby="showcase-title">
      <div className="showcase-pin">
        <div className="showcase-head">
          <h2 className="showcase-title" id="showcase-title">
            Nexor{" "}
            <br />
            runs live
          </h2>
          <p className="showcase-copy">
            Not mockups — deployments. A school platform students open every morning, a
            real fruit-fly brain that gambles, a 3D portfolio, a browser desktop, a
            Minecraft mod on Modrinth. Everything here is real, and most of it is one click
            away.
          </p>
        </div>

        <div className="showcase-track">
          {projects.map((project, index) => {
            const href = project.liveUrl ?? project.githubUrl ?? siteConfig.github;
            return (
              <div key={project.slug} className="showcase-card" data-cursor="Open">
                <ProjectPreview
                  preview={project.preview}
                  name={project.name}
                  eyebrow={project.eyebrow}
                  status={liveLabel(project.liveUrl)}
                />
                <span className="sc-meta">
                  <span className="sc-name">
                    <span className="sc-index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {project.name}
                  </span>
                  <span className="sc-kind">
                    {project.eyebrow} · {project.tech.slice(0, 3).join(" · ")}
                  </span>
                </span>
                <a
                  className="sc-link"
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${project.name} — open ${project.liveUrl ? "live site" : "on GitHub"}`}
                />
              </div>
            );
          })}

          <div className="showcase-endcap">
            <p className="endcap-title">
              Want to <br />
              <span>see more?</span>
            </p>

            <div className="endcap-row">
              {/* The big mark is a second, mouse-only way to the same profile —
                  the text link next to it is the one keyboards and screen
                  readers get, so this one stays out of the tab order. */}
              <a
                className="endcap-mark"
                href={siteConfig.github}
                target="_blank"
                rel="noreferrer"
                tabIndex={-1}
                aria-hidden="true"
                data-clawd-perch
              >
                {/* three layers, one job each: the flight path (x/y), the flip
                    (turns about his middle) and the squash & stretch (pivots on
                    his feet) — one element can't have both pivots at once */}
                <span className="endcap-clawd">
                  <span className="endcap-clawd-spin">
                    <span className="endcap-clawd-squash">
                      {/* plain <img>: animated sprites must not go through
                          next/image. He flies in idle and types once seated. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="endcap-clawd-fly"
                        src={CLAWD_SPRITES.IDLE}
                        alt=""
                        width={192}
                        height={192}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="endcap-clawd-sit"
                        src={CLAWD_SPRITES.TYPING}
                        alt=""
                        width={192}
                        height={192}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    </span>
                  </span>
                </span>
                <span className="endcap-disc">
                  <svg viewBox="0 0 98 96" aria-hidden="true" focusable="false">
                    <path fillRule="evenodd" clipRule="evenodd" d={GITHUB_MARK} />
                  </svg>
                </span>
              </a>

              <a
                className="endcap-link"
                href={siteConfig.github}
                target="_blank"
                rel="noreferrer"
                aria-label="github.com/Plattnericus"
              >
                <span className="endcap-link-text">
                  <span className="endcap-link-host">
                    <RollText text="github.com/" />
                  </span>
                  <span className="endcap-link-user">
                    <RollText text="Plattnericus" offset={11} />
                  </span>
                </span>
                <ArrowUpRight className="endcap-link-arrow" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
