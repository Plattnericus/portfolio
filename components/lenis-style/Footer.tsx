"use client";

import { useRef } from "react";
import { Heart } from "lucide-react";
import { EASE, NO_MOTION_PREF, gsap, useGSAP } from "@/lib/animation";
import PillInner from "@/components/ui/PillInner";
import { siteConfig } from "@/lib/site";

export default function Footer() {
  const sectionRef = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;
      const mm = gsap.matchMedia();

      mm.add(NO_MOTION_PREF, () => {
        gsap.fromTo(
          ".fx-type, .fx-cta-row",
          { y: 60, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 1,
            stagger: 0.14,
            ease: EASE.appleOut,
            scrollTrigger: { trigger: section, start: "top 62%" },
          },
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
          <span className="fx-l1-line">
            Nexor is <span className="fx-accent">open</span>
          </span>{" "}
          <span className="fx-l1-line fx-accent">source</span>
        </p>
        <p className="fx-type fx-l2">
          <span className="fx-l2-line">open to projects</span>
          <span className="fx-l2-line fx-l2-line-bottom">and ideas</span>
        </p>
      </div>

      <div className="fx-cta-row">
        <a className="pill" href={`mailto:${siteConfig.email}`}>
          <PillInner icon={Heart} label="Get in touch" />
        </a>

        <nav className="fx-links" aria-label="Profiles">
          <a href={siteConfig.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={siteConfig.modrinth} target="_blank" rel="noreferrer">
            Modrinth
          </a>
          <a href={`mailto:${siteConfig.email}`}>Mail</a>
        </nav>
      </div>
    </footer>
  );
}
