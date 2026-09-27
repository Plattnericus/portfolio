"use client";

import { useRef } from "react";
import { Heart } from "lucide-react";
import { EASE, NO_MOTION_PREF, gsap, useGSAP } from "@/lib/animation";
import PillInner from "@/components/ui/PillInner";
import RollText from "@/components/ui/RollText";
import { siteConfig } from "@/lib/site";

export default function Footer() {
  const sectionRef = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;
      const mm = gsap.matchMedia();

      mm.add(NO_MOTION_PREF, () => {
        /* the headline lines pull up out of their masks one after another,
           then the call to action follows */
        gsap
          .timeline({ scrollTrigger: { trigger: section, start: "top 62%" } })
          .fromTo(
            ".fx-type .line-in",
            { yPercent: 112 },
            { yPercent: 0, duration: 1.15, stagger: 0.09, ease: EASE.appleOut },
          )
          .fromTo(
            ".fx-cta-row",
            { y: 40, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.9, ease: EASE.appleOut },
            0.4,
          );
      });

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  return (
    <footer ref={sectionRef} className="footer-giant" id="contact" aria-label="Contact">
      <div>
        {/* two fixed lines, like fx-l2: the type also scales with viewport
            height, and a smaller size must not reflow this into one line */}
        <p className="fx-type fx-l1">
          <span className="line-mask">
            <span className="fx-l1-line line-in">
              Nexor is <span className="fx-accent">open</span>
            </span>
          </span>{" "}
          <span className="line-mask">
            <span className="fx-l1-line fx-accent line-in">source</span>
          </span>
        </p>
        <p className="fx-type fx-l2">
          <span className="line-mask">
            <span className="fx-l2-line line-in">open to projects</span>
          </span>{" "}
          <span className="line-mask">
            <span className="fx-l2-line line-in">and ideas</span>
          </span>
        </p>
      </div>

      <div className="fx-cta-row">
        <a className="pill" href={`mailto:${siteConfig.email}`}>
          <PillInner icon={Heart} label="Get in touch" />
        </a>

        <nav className="fx-links" aria-label="Profiles">
          <a href={siteConfig.github} target="_blank" rel="noreferrer">
            <RollText text="GitHub" />
          </a>
          <a href={siteConfig.modrinth} target="_blank" rel="noreferrer">
            <RollText text="Modrinth" />
          </a>
          <a href={`mailto:${siteConfig.email}`}>
            <RollText text="Mail" />
          </a>
        </nav>
      </div>
    </footer>
  );
}
