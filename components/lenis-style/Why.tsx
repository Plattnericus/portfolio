"use client";

import { useRef } from "react";
import { EASE, MM_DESKTOP, NO_MOTION_PREF, ScrollTrigger, gsap, useGSAP } from "@/lib/animation";

const beats = [
  {
    title: "Interfaces that pull you in",
    copy: "Scroll choreography, WebGL scenes and motion that has a purpose. The frontend is not a form — it is the product, and it should feel like one from the first frame.",
  },
  {
    title: "One stack, every layer",
    copy: "From the component tree down to the database schema: Next.js, React and TypeScript on top, APIs and backends underneath — designed together instead of glued together.",
  },
  {
    title: "Ship it for real",
    copy: "A project only counts once it runs on a server. Docker, Linux, Cloudflare and selfhosted infrastructure turn side projects into things people actually use every day.",
  },
  {
    title: "Locked down by default",
    copy: "Security is not a feature request. Hardened deployments, sane auth and a growing offensive-security skill set keep what ships online actually safe.",
  },
];

export default function Why() {
  const sectionRef = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;
      const mm = gsap.matchMedia();

      mm.add(NO_MOTION_PREF, () => {
        gsap.utils.toArray<HTMLElement>(".why-item", section).forEach((item) => {
          gsap.fromTo(
            item,
            { y: 64, autoAlpha: 0 },
            {
              y: 0,
              autoAlpha: 1,
              duration: 0.9,
              ease: EASE.soft,
              scrollTrigger: { trigger: item, start: "top 85%" },
            },
          );
        });

        /* the title lines pull up out of their masks, like the hero letters,
           then the intro and the counter follow */
        gsap
          .timeline({ scrollTrigger: { trigger: section, start: "top 70%" } })
          .fromTo(
            ".why-title .line-in",
            { yPercent: 112 },
            { yPercent: 0, duration: 1.1, stagger: 0.1, ease: EASE.appleOut },
          )
          .fromTo(
            ".why-intro, .why-count",
            { y: 28, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.1, ease: EASE.soft },
            0.35,
          );
      });

      /* Desktop, where the title stays put beside the beats: the rule next to
         it fills as you read through them, a counter follows the beat you are
         on, and the others step back so that one has the floor. */
      mm.add(MM_DESKTOP, () => {
        const items = gsap.utils.toArray<HTMLElement>(".why-item", section);
        const fill = section.querySelector<HTMLElement>(".why-rail-fill");
        const current = section.querySelector<HTMLElement>(".why-current");
        if (items.length === 0) return;

        if (fill) {
          gsap.fromTo(
            fill,
            { scaleY: 0 },
            {
              scaleY: 1,
              ease: "none",
              scrollTrigger: {
                trigger: items[0],
                start: "top 62%",
                endTrigger: items[items.length - 1],
                end: "bottom 62%",
                scrub: 0.6,
              },
            },
          );
        }

        let active = -1;
        const setActive = (index: number) => {
          if (index === active) return;
          const direction = index > active ? 1 : -1;
          const first = active === -1;
          active = index;
          items.forEach((item, i) => item.classList.toggle("is-active", i === index));
          if (current && !first) {
            current.textContent = String(index + 1).padStart(2, "0");
            gsap.fromTo(
              current,
              { yPercent: direction * 100 },
              { yPercent: 0, duration: 0.55, ease: "power3.out", overwrite: true },
            );
          }
        };
        section.classList.add("has-active");
        setActive(0);

        items.forEach((item, index) => {
          ScrollTrigger.create({
            trigger: item,
            start: "top 62%",
            end: "bottom 38%",
            onEnter: () => setActive(index),
            onEnterBack: () => setActive(index),
          });
        });

        return () => {
          section.classList.remove("has-active");
          items.forEach((item) => item.classList.remove("is-active"));
          if (current) current.textContent = "01";
        };
      });

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section ref={sectionRef} className="why" id="why" aria-labelledby="why-title">
      <div className="why-sticky">
        <h2 className="why-title" id="why-title">
          <span className="why-rail" aria-hidden="true">
            <span className="why-rail-fill" />
          </span>
          <span className="line-mask">
            <span className="line-in">Why</span>
          </span>{" "}
          <span className="line-mask">
            <span className="line-in">full</span>
          </span>{" "}
          <span className="line-mask">
            <span className="line-in">stack?</span>
          </span>
        </h2>
        <p className="why-intro">
          Because the interesting problems live between the layers. Here is what building
          across all of them unlocks.
        </p>
        <p className="why-count" aria-hidden="true">
          <span className="why-count-mask">
            <span className="why-current">01</span>
          </span>
          <span className="why-count-total">/ {String(beats.length).padStart(2, "0")}</span>
        </p>
      </div>
      <div className="why-items">
        {beats.map((beat, index) => (
          <div key={beat.title} className="why-item">
            <span className="why-num" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3>{beat.title}</h3>
            <p>{beat.copy}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
