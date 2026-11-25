"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "@/lib/loop";
import { ScrollTrigger } from "@/lib/motion";
import { scramble } from "@/lib/scramble";
import { store } from "@/lib/store";
import { site } from "@/lib/site";

/**
 * Page-wide details that belong to no section: every [data-reveal] decodes
 * from noise the first time it scrolls in, the tab title talks when you
 * leave, and the console gets a signature.
 */
let signed = false;

export default function Reveal() {
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const triggers: ScrollTrigger[] = [];
    let alive = true;

    store.whenIntro().then(() => {
      if (!alive || reduced) return;
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        // lines of a heading go one after another
        const parts = el.querySelectorAll<HTMLElement>(":scope > span");
        const targets = parts.length ? Array.from(parts) : [el];
        const texts = targets.map((t) => t.textContent ?? "");
        targets.forEach((t) => {
          t.style.visibility = "hidden";
        });
        triggers.push(
          ScrollTrigger.create({
            trigger: el,
            start: "top 88%",
            once: true,
            onEnter: () => {
              targets.forEach((t, i) => {
                t.style.visibility = "";
                const long = texts[i].length > 40;
                scramble(t, {
                  text: texts[i],
                  duration: long ? 1.3 : 0.9,
                  delay: i * 0.12,
                  spread: long ? 0.85 : 0.5,
                });
              });
            },
          }),
        );
      });
      ScrollTrigger.refresh();
    });

    // the tab
    const title = document.title;
    let typing: ReturnType<typeof setInterval> | null = null;
    const onVis = () => {
      if (typing) clearInterval(typing);
      if (document.hidden) {
        const msg = "come back_";
        let n = 0;
        typing = setInterval(() => {
          n++;
          document.title = msg.slice(0, n);
          if (n >= msg.length && typing) clearInterval(typing);
        }, 90);
      } else document.title = title;
    };
    document.addEventListener("visibilitychange", onVis);

    if (!signed) {
      signed = true;
      console.log(
      [
        "",
        "  _   _ _______  _____  ____",
        " | \\ | | ____\\ \\/ / _ \\|  _ \\",
        " |  \\| |  _|  \\  / | | | |_) |",
        " | |\\  | |___ /  \\ |_| |  _ <",
        " |_| \\_|_____/_/\\_\\___/|_| \\_\\",
        "",
        " every pixel on this page is a character.",
        ` source: ${site.github}`,
        " there is a shell. press `",
        " or call nexor()",
        "",
      ].join("\n"),
      );
    }

    return () => {
      alive = false;
      triggers.forEach((t) => t.kill());
      document.removeEventListener("visibilitychange", onVis);
      if (typing) clearInterval(typing);
    };
  }, []);

  return null;
}
