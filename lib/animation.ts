"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { CustomEase } from "gsap/CustomEase";

if (typeof window !== "undefined") {
  gsap.registerPlugin(
    useGSAP,
    ScrollTrigger,
    SplitText,
    CustomEase,
  );

  if (!CustomEase.get("apple")) {
    CustomEase.create("apple", "0.32, 0.72, 0, 1");
    CustomEase.create("appleOut", "0.16, 1, 0.3, 1");
  }

  if (!CustomEase.get("lenisExpo")) {
    CustomEase.create("lenisExpo", "0.19, 1, 0.22, 1");
  }
}

export { gsap, useGSAP, ScrollTrigger, SplitText };

export const EASE = {
  out: "power4.out",
  soft: "power3.out",
  inOut: "power2.inOut",
  apple: "apple",
  appleOut: "appleOut",
  lenisExpo: "lenisExpo",
} as const;

/** Pin distances (px of scroll); longer pins buy real dwell time per beat. */
export const PIN = {
  showcase: 4600,
} as const;

export const BP_DESKTOP = "(min-width: 900px)";
export const BP_MOBILE = "(max-width: 899px)";
export const NO_MOTION_PREF = "(prefers-reduced-motion: no-preference)";

export const MM_DESKTOP = `${BP_DESKTOP} and ${NO_MOTION_PREF}`;
export const MM_MOBILE = `${BP_MOBILE} and ${NO_MOTION_PREF}`;

/** Where the NEXOR intro is skipped and the page is live from the start:
    phones and reduced motion (either one). */
export const INTRO_SKIP = `(prefers-reduced-motion: reduce), ${BP_MOBILE}`;
