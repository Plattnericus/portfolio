import { gsap } from "@/lib/animation";
import { CLAWD_SPRITES } from "@/lib/clawd";

/** Where Clawd's feet are, as a share of his sprite's height (the legs end at
    146 of 192 px in every clip). Both ends of a flight are lined up on this
    line, and the squash & stretch pivots on it. */
const FEET = 0.76;
/** Where his visible head starts in the idle clip (49 of 192 px). */
const HEAD = 0.25;
/** How far above the higher end of the flight its apex rises — less when he
    starts right under the top edge, so he never leaves the frame mid-air. */
const HOP = 56;
/** How far (deg) he leans into the direction he is gliding. */
const LEAN = 16;
/** Crouch before take-off (ms). */
const CROUCH = 160;
/** Keyframes per curve: enough that the piecewise-linear path between them
    is indistinguishable from the real curve at any refresh rate. */
const SAMPLES = 60;

type Pose = { x: number; y: number; scale: number };

/** Glide time (ms) grows with the distance, so a short hop and a flight
    across the whole screen read at the same pace. */
const flightTime = (from: Pose, to: Pose) =>
  1000 * gsap.utils.clamp(0.75, 1.25, 0.55 + Math.hypot(to.x - from.x, to.y - from.y) / 1500);

/**
 * An arc from `from` to `to`: x moves in step with the flight while the
 * height follows a parabola over it. `k` is solved so the apex sits exactly
 * `rise` px above the higher of the two ends:
 * height(p) = h0·(1-p) + h1·p + 4k·p·(1-p) peaks at h0 + (a + 4k)² / 16k
 * (a = h1 - h0); setting that to max(h0, h1) + rise and taking the root that
 * keeps the apex inside the flight gives the k below.
 */
function arc(from: Pose, to: Pose, rise: number) {
  const h0 = -from.y;
  const h1 = -to.y;
  const a = h1 - h0;
  const m = Math.max(h0, h1) + rise - h0;
  const k = Math.max(0, (2 * m - a + 2 * Math.sqrt(Math.max(0, m * (m - a)))) / 4);
  return (p: number): Pose => ({
    x: from.x + (to.x - from.x) * p,
    y: -(h0 * (1 - p) + h1 * p + 4 * k * p * (1 - p)),
    scale: from.scale + (to.scale - from.scale) * p,
  });
}

/** Keyframes for values going `from` → `to` under a GSAP ease — baked, so the
    browser can play them on the compositor without running any script. */
function eased(
  ease: string,
  from: number[],
  to: number[],
  toFrame: (values: number[]) => Keyframe,
  samples = 24,
): Keyframe[] {
  const curve = gsap.parseEase(ease);
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = curve(i / samples);
    return toFrame(from.map((value, j) => value + (to[j] - value) * t));
  });
}

const squashFrame = ([sx, sy]: number[]): Keyframe => ({ transform: `scale(${sx}, ${sy})` });

/**
 * Clawd's glide between his corner (ClawdPet) and the GitHub mark at the end
 * of the project row: a crouch, a stretched take-off, a soft arc he leans
 * into, a squash on landing that the mark dips under, and home the same way —
 * both when the row rolls back and when the page scrolls on past it.
 *
 * The flight itself is a separate fixed-position sprite animated with the
 * Web Animations API, so the browser runs it on the compositor at the
 * display's own refresh rate (120 Hz on a ProMotion screen) however busy the
 * main thread is with the pinned row, the clips and the 3D scene. Being
 * fixed, it is never clipped by the pin and needs no tracking while the page
 * scrolls. The perched copy in the row only swaps visibility with it at
 * either end of the flight.
 */
export function createPerchJump(perch: HTMLElement, disc: HTMLElement | null) {
  const perchSquash = perch.querySelector<HTMLElement>(".endcap-clawd-squash");
  const perchFly = perch.querySelector<HTMLImageElement>(".endcap-clawd-fly");
  const perchSit = perch.querySelector<HTMLImageElement>(".endcap-clawd-sit");

  const flyer = document.createElement("div");
  flyer.className = "clawd-flyer";
  flyer.setAttribute("aria-hidden", "true");
  flyer.innerHTML =
    '<span class="clawd-flyer-spin"><span class="clawd-flyer-squash">' +
    `<img src="${CLAWD_SPRITES.IDLE}" alt="" width="192" height="192" draggable="false">` +
    "</span></span>";
  /* the same size as the perched copy, so both ends of a flight line up */
  flyer.style.width = `${perch.offsetWidth}px`;
  document.body.appendChild(flyer);
  const flyerImg = flyer.querySelector("img")!;
  const flyerSpin = flyer.querySelector<HTMLElement>(".clawd-flyer-spin")!;
  const flyerSquash = flyer.querySelector<HTMLElement>(".clawd-flyer-squash")!;

  /* decode every sprite up front: a first frame decoded mid-flight is a
     visible hitch */
  [flyerImg, perchFly, perchSit].forEach((img) => {
    img?.decode?.().catch(() => {});
  });

  let running: Animation[] = [];
  let pending = 0;
  const stop = () => {
    running.forEach((animation) => animation.cancel());
    running = [];
    window.clearTimeout(pending);
  };
  const play = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = el.animate(keyframes, { fill: "both", easing: "linear", ...options });
    running.push(animation);
    return animation;
  };

  /* ClawdPet keeps the corner copy away for as long as he is in the air */
  const flying = (on: boolean) =>
    document.documentElement.toggleAttribute("data-clawd-flying", on);

  /* opacity, not visibility: the clip images toggle their own visibility,
     and a visible child shows straight through a hidden parent */
  const showPerch = (visible: boolean) => {
    perch.style.opacity = visible ? "1" : "0";
  };
  const showClip = (clip: "fly" | "sit") => {
    if (perchFly) perchFly.style.visibility = clip === "fly" ? "visible" : "hidden";
    if (perchSit) perchSit.style.visibility = clip === "sit" ? "visible" : "hidden";
  };
  const showFlyer = (visible: boolean) => {
    flyer.style.visibility = visible ? "visible" : "hidden";
  };
  const airborne = () => flyer.style.visibility === "visible";

  /** The flyer pose that puts Clawd exactly over `rect` (feet on feet,
      centre on centre, same size). The flyer sits at the top-left of the
      screen at the perch's size and pivots on its feet. */
  const poseFor = (rect: DOMRect): Pose => {
    const size = flyer.offsetWidth || 1;
    return {
      x: rect.left + rect.width / 2 - size / 2,
      y: rect.top + rect.width * FEET - size * FEET,
      scale: rect.width / size,
    };
  };
  const cornerRect = () => {
    const rect = document.querySelector(".clawd-pet img")?.getBoundingClientRect();
    return rect && rect.width > 0 ? rect : null;
  };
  const hopUnder = (rect: DOMRect) =>
    Math.max(0, Math.min(HOP, rect.top + rect.height * HEAD - 8));

  /** Crouch, then spring up stretched. */
  const takeOff = () => {
    play(flyerSquash, eased("power2.out", [1, 1], [1.18, 0.76], squashFrame, 8), {
      duration: CROUCH,
    });
    play(flyerSquash, eased("power2.out", [1.18, 0.76], [0.84, 1.2], squashFrame, 8), {
      duration: 120,
      delay: CROUCH,
    });
    play(flyerSquash, eased("sine.inOut", [0.84, 1.2], [1, 1], squashFrame, 16), {
      duration: 400,
      delay: CROUCH + 120,
    });
  };

  /** Squash on touch-down and wobble back; the mark gives a little under him
      (on the individual translate property, so it adds to the roll that GSAP
      writes into transform). */
  const touchDown = () => {
    if (perchSquash) {
      play(perchSquash, eased("power2.out", [1, 1], [1.32, 0.68], squashFrame, 6), {
        duration: 80,
      });
      play(perchSquash, eased("elastic.out(1, 0.3)", [1.32, 0.68], [1, 1], squashFrame, 48), {
        duration: 850,
        delay: 80,
      });
    }
    if (disc) {
      const dip = ([y]: number[]): Keyframe => ({ translate: `0 ${y}px` });
      play(disc, eased("power2.out", [0], [9], dip, 6), { duration: 80 });
      play(disc, eased("elastic.out(1, 0.35)", [9], [0], dip, 40), { duration: 800, delay: 80 });
    }
    /* settled: he flips his laptop open */
    pending = window.setTimeout(() => showClip("sit"), 320);
  };

  /** The glide itself, after `delay` ms; resolves when he arrives. */
  const glide = (from: Pose, to: Pose, rise: number, delay: number) => {
    const path = arc(from, to, rise);
    const lean = (to.x < from.x ? -1 : 1) * LEAN;
    const ease = gsap.parseEase("sine.inOut");
    const moves: Keyframe[] = [];
    const leans: Keyframe[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const p = ease(i / SAMPLES);
      const point = path(p);
      moves.push({
        transform: `translate(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px) scale(${point.scale.toFixed(4)})`,
      });
      leans.push({ transform: `rotate(${(lean * Math.sin(Math.PI * p)).toFixed(2)}deg)` });
    }
    const duration = flightTime(from, to);
    play(flyerSpin, leans, { duration, delay });
    return play(flyer, moves, { duration, delay }).finished;
  };

  /** Glide from wherever the corner Clawd is onto the mark. */
  const land = () => {
    /* already in the air on the way home (a scroll reversal): turn around
       where he is instead of going back to the corner first */
    const from = airborne() ? poseFor(flyerImg.getBoundingClientRect()) : null;
    stop();
    const corner = cornerRect();

    if (!from && !corner) {
      /* nobody in the corner to glide from: drop in from above instead */
      showFlyer(false);
      showClip("fly");
      showPerch(true);
      play(perch, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
      play(
        perch,
        eased("power2.in", [-150], [0], ([y]) => ({ transform: `translateY(${y}px)` }), 16),
        { duration: 450 },
      ).finished.then(touchDown, () => {});
      return;
    }

    flying(true);
    showPerch(false);
    showFlyer(true);
    if (!from) takeOff();
    const start = from ?? poseFor(corner!);
    const rise = from ? 16 : hopUnder(corner!);
    glide(start, poseFor(perch.getBoundingClientRect()), rise, from ? 0 : CROUCH).then(() => {
      /* hand over to the perched copy on the exact spot, mid-squash */
      stop();
      showFlyer(false);
      showClip("fly");
      showPerch(true);
      touchDown();
      flying(false);
    }, () => {});
  };

  /** Glide from the mark back to the corner; `arrived` fires on the frame he
      gets there, which is when the corner copy takes over. */
  const leave = (arrived: () => void) => {
    const from = airborne() ? poseFor(flyerImg.getBoundingClientRect()) : null;
    stop();
    const corner = cornerRect();

    if (!corner) {
      showFlyer(false);
      play(
        perch,
        [
          { transform: "translateY(0)", opacity: 1 },
          { transform: "translateY(-60px)", opacity: 0 },
        ],
        { duration: 280, easing: "ease-in" },
      ).finished.then(() => {
        stop();
        showPerch(false);
        arrived();
      }, () => {});
      return;
    }

    flying(true);
    const start = from ?? poseFor(perch.getBoundingClientRect());
    showPerch(false);
    showFlyer(true);
    if (!from) takeOff();
    /* a flatter arc on the way up: the apex is above the corner, right under
       the top edge of the screen */
    glide(start, poseFor(corner), hopUnder(corner) * 0.4, from ? 0 : CROUCH).then(() => {
      stop();
      showFlyer(false);
      flying(false);
      arrived();
    }, () => {});
  };

  /** Jump straight to either end state (reload mid-page, a resize). */
  const settle = (perched: boolean) => {
    stop();
    showFlyer(false);
    flying(false);
    showPerch(perched);
    showClip("sit");
  };

  /** Keeps the flyer the perched copy's size after a resize. */
  const resize = () => {
    flyer.style.width = `${perch.offsetWidth}px`;
  };

  const destroy = () => {
    stop();
    flying(false);
    flyer.remove();
    perch.style.removeProperty("opacity");
    perchFly?.style.removeProperty("visibility");
    perchSit?.style.removeProperty("visibility");
  };

  return { land, leave, settle, resize, destroy };
}
