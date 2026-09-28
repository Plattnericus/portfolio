import { gsap } from "@/lib/animation";
import { HEAD, give, jump, type Jump, type Pose } from "./motion";

/** Where he stands on each glyph: how far across its box, and how far below
    the box's top the ink starts, in em — measured from the NexorBrand glyphs.
    The 4's top is a flat shelf from 48% to 84% of its width; the 0 peaks in
    its middle (the CSS puts him there to begin with). */
const SPOTS: Record<string, { across: number; top: number }> = {
  "4": { across: 0.66, top: 0.055 },
  /* the 0 is pointed: his inner feet stand just either side of the tip */
  "0": { across: 0.5, top: 0.052 },
};
/** How far (em) a digit gives under him when he lands on it. */
const GIVE = 0.016;
/** Closest his head may come to the top edge of the screen mid-hop. */
const TOP_MARGIN = 12;
/** Crouch before a hop (ms). */
const CROUCH = 110;
/** He sits for a while between hops on his own (ms). */
const PAUSE = [1700, 3300] as const;

const frame = ({ x, y }: Pose): Keyframe => ({
  transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`,
});

/**
 * Clawd on the 404: he drops onto the 0, then hops from digit to digit on his
 * own, over to whichever one the pointer is on, and on the spot when he is
 * poked. Every hop is one baked jump (motion.ts) — steady sideways, gravity
 * up and down — with the digit he lands on giving under him.
 */
export function createDigitHopper(
  code: HTMLElement,
  /** he leaves the digit he was on — whatever he was saying there ends */
  onDepart?: () => void,
) {
  const clawd = code.querySelector<HTMLElement>(".nf-clawd");
  const body = clawd?.querySelector<HTMLElement>(".nf-clawd-body");
  const lean = clawd?.querySelector<HTMLElement>(".nf-clawd-lean");
  const sprite = clawd?.querySelector<HTMLElement>("img");
  const digits = [...code.querySelectorAll<HTMLElement>(".nf-digit")];
  if (!clawd || !body || !lean || !sprite || digits.length === 0) return null;
  const parts = { body, lean, sprite };

  /* he starts on the 0, where the CSS places him */
  const home = digits.findIndex((digit) => digit.textContent?.trim() === "0");
  let at = Math.max(0, home);
  let hop: Jump | null = null;
  let squish: Animation | null = null;
  let held: Animation | null = null;
  let pending: number | null = null;
  /* the pause before his next hop on his own */
  let timer = 0;
  /* his entrance — kept apart from `timer`, which every hop clears: a
     pointer resting on a digit while the page loads calls him over before
     he has appeared, and must not cancel the appearance itself */
  let enterTimer = 0;
  let entered = false;
  let stopped = false;
  /* after a poke he stays put while he talks */
  let quietUntil = 0;

  const fontSize = () => parseFloat(getComputedStyle(code).fontSize);

  /** An element's untransformed box inside the 404 — summed up the offset
      chain, since the masks' drop shadow makes each one its digit's
      offsetParent. */
  const within = (el: HTMLElement) => {
    let left = 0;
    let top = 0;
    let node: HTMLElement | null = el;
    while (node && node !== code) {
      left += node.offsetLeft;
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return { left, top, width: el.offsetWidth, height: el.offsetHeight };
  };

  /** Where his feet go on digit `i`, relative to where the CSS puts them. */
  const pose = (i: number): Pose => {
    const fs = fontSize();
    const spot = (index: number) => {
      const digit = digits[index];
      const box = within(digit);
      const place = SPOTS[digit.textContent?.trim() ?? ""] ?? SPOTS["0"];
      return {
        x: box.left + box.width * place.across,
        y: box.top + fs * place.top,
      };
    };
    const target = spot(i);
    const origin = spot(Math.max(0, home));
    return { x: target.x - origin.x, y: target.y - origin.y, scale: 1 };
  };

  const clear = () => {
    hop?.animations.forEach((animation) => animation.cancel());
    hop = null;
    squish?.cancel();
    squish = null;
    held?.cancel();
    held = null;
  };

  /** Puts him straight onto digit `at` (first frame, a resize). */
  const place = () => {
    clear();
    held = body.animate([frame(pose(at))], { duration: 0, fill: "forwards" });
  };

  const schedule = (ms: number) => {
    window.clearTimeout(timer);
    if (stopped) return;
    timer = window.setTimeout(() => {
      /* from the 0 to either 4; from a 4 mostly back to the 0, sometimes
         the long jump right over it to the other 4 */
      const others = digits.map((_, index) => index).filter((index) => index !== at);
      const next =
        at === home
          ? others[Math.floor(Math.random() * others.length)]
          : Math.random() < 0.65
            ? home
            : others.find((index) => index !== home) ?? home;
      go(next);
    }, ms);
  };

  const idle = () =>
    schedule(Math.max(gsap.utils.random(PAUSE[0], PAUSE[1]), quietUntil - performance.now()));

  /** One hop from where he sits onto digit `to` (the same digit: a hop on
      the spot). */
  const go = (to: number, options: { from?: Pose; rise?: number; duration?: number } = {}) => {
    if (stopped) return;
    if (hop) {
      /* mid-hop: he goes there next, once he has landed */
      pending = to;
      return;
    }
    window.clearTimeout(timer);
    const from = options.from ?? pose(at);
    const target = pose(to);
    const size = clawd.offsetWidth;
    const distance = Math.hypot(target.x - from.x, target.y - from.y);
    /* high enough to clear the 0 on the long jump, never off the screen */
    const head = sprite.getBoundingClientRect().top + size * HEAD;
    const rise = Math.max(
      0,
      Math.min(options.rise ?? size * 0.45 + distance * 0.1, head - TOP_MARGIN),
    );
    const duration = options.duration ?? gsap.utils.clamp(400, 720, 300 + distance * 0.9);
    const dip = GIVE * fontSize();
    const landing = digits[to];
    /* the digit shrinks toward its baseline by exactly the px he sinks */
    const depth = Math.max(1, landing.offsetHeight - fontSize() * (SPOTS[landing.textContent?.trim() ?? ""]?.top ?? 0));

    held?.cancel();
    held = null;
    if (to !== at) onDepart?.();
    const current = jump(parts, {
      from,
      to: target,
      rise,
      duration,
      crouch: options.from ? 0 : CROUCH,
      timing: "none",
      give: dip,
      frame,
    });
    hop = current;
    at = to;
    squish = give(
      landing,
      (share) => {
        const y = 1 - (share * dip) / depth;
        return { transform: `scale(${(1 + (1 - y) * 0.6).toFixed(4)}, ${y.toFixed(4)})` };
      },
      current.touchdown,
    );
    current.body.finished.then(() => {
      if (hop !== current) return;
      hop = null;
      if (pending !== null && pending !== at) {
        const next = pending;
        pending = null;
        go(next);
      } else {
        pending = null;
        idle();
      }
    }, () => {});
  };

  /** The entrance: he falls onto the 0 from above after `delay` ms. */
  const enter = (delay: number) => {
    place();
    clawd.style.opacity = "0";
    window.clearTimeout(enterTimer);
    enterTimer = window.setTimeout(() => {
      entered = true;
      clawd.style.removeProperty("opacity");
      clawd.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
      const target = pose(at);
      go(at, {
        from: { ...target, y: target.y - clawd.offsetWidth * 1.05 },
        rise: 0,
        duration: 420,
      });
    }, delay);
  };

  /** Called over to digit `i` (the pointer is on it). Before he has
      appeared, he heads there as soon as he has landed. */
  const call = (i: number) => {
    if (!entered) pending = i;
    else if (i !== at || hop) go(i);
  };

  /** A hop on the spot, for a poke — then he stays put for `talk` ms. */
  const poke = (talk = 0) => {
    quietUntil = performance.now() + talk;
    if (entered && !hop) go(at, { rise: clawd.offsetWidth * 0.3, duration: 360 });
  };

  const resize = () => {
    if (stopped) return;
    const wasHopping = !!hop;
    place();
    if (wasHopping) idle();
  };

  /** Stops hopping where he is (the warp home). */
  const stop = () => {
    stopped = true;
    window.clearTimeout(timer);
    window.clearTimeout(enterTimer);
  };

  const destroy = () => {
    stop();
    clear();
    clawd.style.removeProperty("opacity");
  };

  return { enter, call, poke, resize, stop, destroy };
}
