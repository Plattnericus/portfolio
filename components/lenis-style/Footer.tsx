"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Heart } from "lucide-react";
import { EASE, NO_MOTION_PREF, gsap, useGSAP } from "@/lib/animation";
import LocalTime from "@/components/ui/LocalTime";
import PillInner from "@/components/ui/PillInner";
import RollText from "@/components/ui/RollText";
import { siteConfig } from "@/lib/site";

const COPIED_MS = 2400;

export default function Footer() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

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

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(siteConfig.email);
    } catch {
      /* no clipboard access (an old browser, a denied permission): the
         mail app is the next best thing */
      window.location.href = `mailto:${siteConfig.email}`;
      return;
    }
    setCopied(true);
    window.dispatchEvent(
      new CustomEvent("clawd-say", { detail: { clip: "COMPLETE", line: "Copied! Talk soon." } }),
    );
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

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
        <div className="fx-cta">
          <a className="pill" href={`mailto:${siteConfig.email}`}>
            <PillInner icon={Heart} label="Get in touch" />
          </a>

          <button
            type="button"
            className={copied ? "fx-copy is-copied" : "fx-copy"}
            onClick={copyEmail}
            aria-label={`Copy ${siteConfig.email}`}
          >
            <span className="fx-copy-icon" aria-hidden="true">
              <Copy />
              <Check />
            </span>
            <span className="fx-copy-label" aria-hidden="true">
              <span className="fx-copy-email">
                <RollText text={siteConfig.email} />
              </span>
              <span className="fx-copy-done">Copied to clipboard</span>
            </span>
          </button>
          <span className="sr-only" role="status">
            {copied ? "Email address copied" : ""}
          </span>
        </div>

        <div className="fx-foot">
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
          <p className="fx-time">
            <span className="status-dot" aria-hidden="true" />
            <LocalTime /> in South Tyrol
          </p>
        </div>
      </div>
    </footer>
  );
}
