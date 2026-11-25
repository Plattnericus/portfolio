"use client";

import { useEffect } from "react";
import { onFrame, prefersReducedMotion } from "@/lib/loop";
import { scramble } from "@/lib/scramble";
import { markSecret } from "@/lib/secrets";
import { onTyped } from "@/lib/typed";
import { whenWorld, worldState } from "@/lib/world/state";

const HELLO = "hello, you.";
/** how long the greeting, the hop and the roll take, seconds */
const HELLO_FOR = 2.6;
const HOP = { each: 0.5, gap: 0.09 };
const ROLL_FOR = 1.5;

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/**
 * Small things that happen when a word is typed anywhere on the page:
 *  hello   the bar says hello back
 *  wave    the letters of the name hop, one after the other
 *  roll    the camera does a barrel roll
 *  lights  the page goes dark and a torch follows the cursor
 *  zen     all text fades out, only the world is left
 * The last two switch off again the same way, or with esc.
 */
export default function Tricks() {
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const root = document.documentElement;
    const offs: (() => void)[] = [];

    // hello: the chapter in the bar answers (the name, where the chapter is hidden)
    let greeting = false;
    offs.push(
      onTyped("hello", () => {
        markSecret("hello");
        const now = document.querySelector<HTMLElement>(".nav-now");
        const el = now && now.offsetParent ? now : document.querySelector<HTMLElement>(".nav-brand");
        if (!el || greeting) return;
        greeting = true;
        const before = el.textContent ?? "";
        const html = el.innerHTML;
        scramble(el, { text: HELLO, duration: 0.6 });
        window.setTimeout(() => {
          greeting = false;
          // the bar may have moved on to another chapter meanwhile
          if (el.textContent !== HELLO) return;
          if (el.classList.contains("nav-brand")) el.innerHTML = html;
          else scramble(el, { text: before, duration: 0.6 });
        }, HELLO_FOR * 1000);
      }),
    );

    // wave: the 3D letters of the name hop, one after the other
    let hopping: (() => void) | null = null;
    offs.push(
      onTyped("wave", async () => {
        markSecret("wave");
        const world = await whenWorld();
        const text = world.text;
        if (!text || hopping || reduced) return;
        const height = text.height;
        const n = text.centers.length;
        const t0 = performance.now();
        hopping = onFrame(() => {
          const t = (performance.now() - t0) / 1000;
          world.letters = Array.from({ length: n }, (_, i) => {
            const k = Math.min(1, Math.max(0, (t - i * HOP.gap) / HOP.each));
            const up = Math.sin(Math.PI * k);
            return { x: 0, y: up * height * 0.42, s: 1 + up * 0.06 };
          });
          if (t > HOP.each + (n - 1) * HOP.gap) {
            world.letters = null;
            hopping?.();
            hopping = null;
          }
        });
      }),
    );

    // roll: a barrel roll of the camera
    let rolling: (() => void) | null = null;
    offs.push(
      onTyped("roll", () => {
        markSecret("roll");
        if (rolling || reduced) return;
        const t0 = performance.now();
        rolling = onFrame(() => {
          const k = Math.min(1, (performance.now() - t0) / (ROLL_FOR * 1000));
          worldState.roll = easeInOut(k) * Math.PI * 2;
          if (k >= 1) {
            worldState.roll = 0;
            rolling?.();
            rolling = null;
          }
        });
      }),
    );

    // lights: dark, but for a torch around the cursor
    let torch: HTMLDivElement | null = null;
    const aim = (e: PointerEvent) => {
      torch?.style.setProperty("--lx", `${e.clientX}px`);
      torch?.style.setProperty("--ly", `${e.clientY}px`);
    };
    const lights = (on: boolean) => {
      if (on && !torch) {
        markSecret("lights");
        torch = document.createElement("div");
        torch.className = "lights";
        torch.setAttribute("aria-hidden", "true");
        document.body.append(torch);
        window.addEventListener("pointermove", aim, { passive: true });
        requestAnimationFrame(() => torch?.classList.add("is-on"));
      } else if (!on && torch) {
        const el = torch;
        torch = null;
        window.removeEventListener("pointermove", aim);
        el.classList.remove("is-on");
        window.setTimeout(() => el.remove(), 600);
      }
    };
    offs.push(onTyped("lights", () => lights(!torch)));

    // zen: the copy fades out, the world stays
    let hint: HTMLParagraphElement | null = null;
    const zen = (on: boolean) => {
      if (on === root.classList.contains("is-zen")) return;
      root.classList.add("zen-ready");
      root.classList.toggle("is-zen", on);
      hint?.remove();
      hint = null;
      if (!on) return;
      markSecret("zen");
      hint = document.createElement("p");
      hint.className = "zen-hint";
      hint.textContent = "zen. type it again or press esc to come back";
      document.body.append(hint);
    };
    offs.push(onTyped("zen", () => zen(!root.classList.contains("is-zen"))));

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      lights(false);
      zen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      offs.forEach((off) => off());
      hopping?.();
      rolling?.();
      worldState.roll = 0;
      lights(false);
      zen(false);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return null;
}
