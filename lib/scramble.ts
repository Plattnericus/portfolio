"use client";

import { gsap } from "gsap";
import { NOISE } from "./ascii/glyphs";

/** the running decode per element, and when it started */
const active = new WeakMap<HTMLElement, { tween: gsap.core.Tween; at: number }>();

/** a change this soon after the last one is a fast scroll: just show the text */
const RAPID_MS = 320;

/**
 * Decodes an element's text from noise into place. Mono type keeps every
 * frame the same width, so nothing around it moves. A new decode on the same
 * element always replaces the old one, and changes that arrive in quick
 * succession skip the effect, so fast scrolling never leaves noise behind.
 */
export type TextStyle = "scramble" | "type" | "dots" | "wave";

type TextOpts = { duration?: number; delay?: number; text?: string; chars?: string; spread?: number };

/**
 * Brings text in with one of several styles, so changes never all look the
 * same: noise decoding, typing with a caret, dots filling in at random, or a
 * wave of rising glyphs. Same guarantees as `scramble`.
 */
export function textIn(el: HTMLElement, style: TextStyle, opts: TextOpts = {}) {
  if (style === "scramble") return scramble(el, opts);
  const finalText = opts.text ?? el.dataset.text ?? el.textContent ?? "";
  el.dataset.text = finalText;
  const now = performance.now();
  const prev = active.get(el);
  prev?.tween.kill();
  if (prev && now - prev.at < RAPID_MS) {
    el.textContent = finalText;
    const tween = gsap.to({}, { duration: 0 });
    active.set(el, { tween, at: now });
    return tween;
  }
  const n = finalText.length;
  const rnd = Array.from({ length: n }, () => Math.random());
  const RISE = "._-=+*#";
  const state = { p: 0 };
  const tween = gsap.to(state, {
    p: 1,
    duration: opts.duration ?? 0.9,
    delay: opts.delay ?? 0,
    ease: "none",
    onUpdate() {
      let out = "";
      const p = state.p;
      for (let i = 0; i < n; i++) {
        const ch = finalText[i];
        if (ch === " " || ch === "\n") {
          out += ch;
          continue;
        }
        const at = i / Math.max(1, n);
        if (style === "type") {
          // typed left to right, a caret riding the front
          const front = p * 1.05;
          out += at < front - 0.01 ? ch : at < front + 0.02 ? "_" : "\u00a0";
        } else if (style === "dots") {
          // every glyph waits as a dot and lands at its own time
          out += rnd[i] < p * 1.15 ? ch : rnd[i] < p * 1.15 + 0.35 ? "." : "\u00a0";
        } else {
          // a wave: each glyph climbs . _ - = + * # before it settles
          const local = (p * 1.6 - at) / 0.6;
          if (local >= 1) out += ch;
          else if (local <= 0) out += "\u00a0";
          else out += RISE[Math.min(RISE.length - 1, (local * RISE.length) | 0)];
        }
      }
      el.textContent = out;
    },
    onComplete() {
      el.textContent = finalText;
    },
    onInterrupt() {
      el.textContent = finalText;
    },
  });
  active.set(el, { tween, at: now });
  return tween;
}

const STYLES: TextStyle[] = ["scramble", "type", "dots", "wave"];

/** a different style from last time, per element */
const lastStyle = new WeakMap<HTMLElement, TextStyle>();
export function textInVaried(el: HTMLElement, opts: TextOpts = {}) {
  const prev = lastStyle.get(el);
  const pool = STYLES.filter((s) => s !== prev);
  const style = pool[(Math.random() * pool.length) | 0];
  lastStyle.set(el, style);
  return textIn(el, style, opts);
}

export function scramble(el: HTMLElement, opts: TextOpts = {}) {
  const finalText = opts.text ?? el.dataset.text ?? el.textContent ?? "";
  el.dataset.text = finalText;
  const now = performance.now();
  const prev = active.get(el);
  prev?.tween.kill();
  if (prev && now - prev.at < RAPID_MS) {
    el.textContent = finalText;
    const tween = gsap.to({}, { duration: 0 });
    active.set(el, { tween, at: now });
    return tween;
  }
  const chars = opts.chars ?? NOISE;
  const spread = opts.spread ?? 0.6;
  const n = finalText.length;
  const order = Array.from({ length: n }, (_, i) => (i / Math.max(1, n)) * spread + Math.random() * (1 - spread));
  const state = { p: 0 };
  const tween = gsap.to(state, {
    p: 1,
    duration: opts.duration ?? 0.9,
    delay: opts.delay ?? 0,
    ease: "none",
    onUpdate() {
      let out = "";
      for (let i = 0; i < n; i++) {
        const ch = finalText[i];
        if (ch === " " || ch === "\n") {
          out += ch;
          continue;
        }
        const t = order[i];
        if (state.p >= t + 0.12) out += ch;
        else if (state.p >= t - 0.25) out += chars[(Math.random() * chars.length) | 0];
        else out += "\u00a0";
      }
      el.textContent = out;
    },
    onComplete() {
      el.textContent = finalText;
    },
    onInterrupt() {
      el.textContent = finalText;
    },
  });
  active.set(el, { tween, at: now });
  return tween;
}

/** short scramble on hover for links; always lands on the current label */
export function bindHoverScramble(root: ParentNode = document) {
  const els = root.querySelectorAll<HTMLElement>("[data-scramble]");
  const offs: (() => void)[] = [];
  els.forEach((el) => {
    const label = el.querySelector<HTMLElement>("[data-label]") ?? el;
    if (!label.dataset.text) label.dataset.text = label.textContent ?? "";
    const enter = () => {
      scramble(label, { text: label.dataset.text ?? "", duration: 0.45, spread: 0.8 });
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("focus", enter);
    offs.push(() => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("focus", enter);
      label.textContent = label.dataset.text ?? label.textContent;
    });
  });
  return () => offs.forEach((f) => f());
}
