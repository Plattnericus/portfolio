"use client";

import { useEffect, useRef } from "react";
import { AsciiTitle, type RevealMode } from "@/lib/ascii/ascii-title";
import { family, fontsReady } from "@/lib/fonts";
import { ScrollTrigger } from "@/lib/motion";

type Props = {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "div";
  className?: string;
  align?: "left" | "right" | "center";
  uppercase?: boolean;
  palette?: string[];
  reveal?: RevealMode;
};

/** a headline printed as ASCII art; it sweeps in the first time it scrolls into view */
export default function AsciiHeading({
  text,
  as: Tag = "h2",
  className = "",
  align = "left",
  uppercase = true,
  palette,
  reveal,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let title: AsciiTitle | null = null;
    let st: ScrollTrigger | null = null;
    let alive = true;
    fontsReady().then(() => {
      if (!alive) return;
      title = new AsciiTitle(host, {
        fontFamily: family("mono"),
        displayFamily: family("display"),
        align,
        uppercase,
        palette,
        knockout: "#08080a",
        label: false,
        reveal,
      });
      st = ScrollTrigger.create({
        trigger: host,
        start: "top 92%",
        once: true,
        onEnter: () => title?.set(text, true),
      });
    });
    return () => {
      alive = false;
      st?.kill();
      title?.destroy();
    };
  }, [text, align, uppercase, palette, reveal]);

  return (
    <Tag ref={ref as never} className={`at ${className}`} data-quiet>
      <span className="sr-only">{text}</span>
    </Tag>
  );
}
