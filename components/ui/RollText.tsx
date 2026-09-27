import type { CSSProperties } from "react";

function Row({ text, next, offset }: { text: string; next?: boolean; offset: number }) {
  return (
    <span className={next ? "roll-row roll-row--next" : "roll-row"} aria-hidden="true">
      {Array.from(text).map((char, index) => (
        <span
          className="roll-char"
          key={index}
          style={{ "--i": offset + index } as CSSProperties}
        >
          {char === " " ? " " : char}
        </span>
      ))}
    </span>
  );
}

/**
 * A label whose letters roll up on hover, one after another, while an
 * identical copy rolls in from below (see .roll in globals.css — the hover
 * is driven by the nearest link or button, so no JS runs for it).
 * `offset` continues the letter stagger of a RollText that comes before this
 * one in the same link. The two rows are decoration only; assistive tech
 * reads the plain text in the sr-only span.
 */
export default function RollText({ text, offset = 0 }: { text: string; offset?: number }) {
  return (
    <span className="roll">
      <span className="sr-only">{text}</span>
      <Row text={text} offset={offset} />
      <Row text={text} next offset={offset} />
    </span>
  );
}
