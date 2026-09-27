import { gsap } from "@/lib/animation";

/** Where Clawd's feet are, as a share of his sprite's height (the legs end at
    146 of 192 px in every clip). Both copies of him are lined up on this line,
    and the squash & stretch pivots on it. */
const FEET = 0.76;
/** Where his visible head starts in the idle clip (49 of 192 px). */
const HEAD = 0.25;
/** How far above the higher end of the leap its apex rises — less when he
    starts right under the top edge, so he never leaves the frame mid-air. */
const HOP = 56;

type Point = { x: number; y: number; scale: number };
type Pose = Point & { hop: number };

/** Glide time grows with the distance, so a short hop and a leap across the
    whole screen both read at the same pace. */
const flightTime = (from: Point, to: Point) =>
  gsap.utils.clamp(0.75, 1.25, 0.55 + Math.hypot(to.x - from.x, to.y - from.y) / 1500);
/** How far (deg) he leans into the direction he is gliding. */
const LEAN = 16;

/**
 * An arc from `from` to `to`: x moves in step with the flight while the
 * height follows a parabola over it. `k` is solved so
 * the apex sits exactly `rise` px above the higher of the two ends:
 * height(p) = h0·(1-p) + h1·p + 4k·p·(1-p) peaks at h0 + (a + 4k)² / 16k
 * (a = h1 - h0); setting that to max(h0, h1) + rise and taking the root that
 * keeps the apex inside the flight gives the k below.
 */
function arc(from: Point, to: Point, rise: number) {
  const h0 = -from.y;
  const h1 = -to.y;
  const a = h1 - h0;
  const m = Math.max(h0, h1) + rise - h0;
  const k = Math.max(0, (2 * m - a + 2 * Math.sqrt(Math.max(0, m * (m - a)))) / 4);
  return (p: number) => ({
    x: from.x + (to.x - from.x) * p,
    y: -(h0 * (1 - p) + h1 * p + 4 * k * p * (1 - p)),
    scale: from.scale + (to.scale - from.scale) * p,
  });
}

/**
 * Clawd's glide between his corner (ClawdPet) and the GitHub mark at the end
 * of the project row: a crouch, a stretched take-off, a soft arc he leans
 * into, a squash on landing that the mark dips under, and home the same way —
 * both when the row rolls back and when the page scrolls on past it.
 * The two copies of him hand over on the exact spot and frame, so it reads as
 * one Clawd jumping across the screen.
 */
export function createPerchJump(perch: HTMLElement, disc: HTMLElement | null) {
  const spin = perch.querySelector<HTMLElement>(".endcap-clawd-spin");
  const squash = perch.querySelector<HTMLElement>(".endcap-clawd-squash");
  const fly = perch.querySelector<HTMLElement>(".endcap-clawd-fly");
  const sit = perch.querySelector<HTMLElement>(".endcap-clawd-sit");
  const setX = gsap.quickSetter(perch, "x", "px");
  const setY = gsap.quickSetter(perch, "y", "px");
  const setScale = gsap.quickSetter(perch, "scale");
  const setLean = spin ? gsap.quickSetter(spin, "rotation", "deg") : null;
  /* ClawdPet keeps the corner copy away for as long as he is in the air */
  const flying = (on: boolean) =>
    document.documentElement.toggleAttribute("data-clawd-flying", on);
  let timeline: gsap.core.Timeline | null = null;

  const showClip = (clip: "fly" | "sit") => {
    if (fly) gsap.set(fly, { autoAlpha: clip === "fly" ? 1 : 0 });
    if (sit) gsap.set(sit, { autoAlpha: clip === "sit" ? 1 : 0 });
  };

  const reset = () => {
    if (spin) gsap.set(spin, { rotation: 0 });
    if (squash) gsap.set(squash, { scaleX: 1, scaleY: 1 });
  };

  const current = (): Point => ({
    x: Number(gsap.getProperty(perch, "x")),
    y: Number(gsap.getProperty(perch, "y")),
    scale: Number(gsap.getProperty(perch, "scale")),
  });

  /** The corner Clawd's spot, as an offset from the perch's resting place
      (feet on feet, centre on centre) — null when he isn't around to jump
      from or to (not loaded yet, or a phone). */
  const cornerPose = (): Pose | null => {
    const img = document.querySelector<HTMLElement>(".clawd-pet img");
    const mark = perch.parentElement;
    if (!img || !mark) return null;
    const corner = img.getBoundingClientRect();
    if (corner.width === 0) return null;
    const markRect = mark.getBoundingClientRect();
    const size = perch.offsetWidth;
    const restLeft = markRect.left + markRect.width / 2 - size / 2;
    const restTop = markRect.top;
    return {
      x: corner.left + corner.width / 2 - (restLeft + size / 2),
      y: corner.top + corner.height * FEET - (restTop + size * FEET),
      scale: corner.width / size,
      hop: Math.max(0, Math.min(HOP, corner.top + corner.height * HEAD - 8)),
    };
  };

  /** crouch, then spring up stretched */
  const takeOff = (tl: gsap.core.Timeline) => {
    if (squash) {
      tl.to(squash, { scaleX: 1.18, scaleY: 0.76, duration: 0.16, ease: "power2.out" });
    }
    tl.addLabel("launch");
    if (squash) {
      tl.to(squash, { scaleX: 0.84, scaleY: 1.2, duration: 0.12, ease: "power2.out" }, "launch")
        .to(squash, { scaleX: 1, scaleY: 1, duration: 0.4, ease: "sine.inOut" }, "launch+=0.12");
    }
  };

  /** The glide: a soft arc eased in and out, leaning forward into the
      direction of travel and straightening up as he arrives. `target` is read
      every frame, so a destination that moves while he is in the air (the
      corner, while the page scrolls on) is still where he lands. */
  const leap = (
    tl: gsap.core.Timeline,
    from: Point,
    target: () => Point | null,
    rise: number,
  ) => {
    const first = target();
    if (!first) return;
    const time = flightTime(from, first);
    const lean = (first.x < from.x ? -1 : 1) * LEAN;
    const proxy = { p: 0 };
    tl.to(
      proxy,
      {
        p: 1,
        duration: time,
        ease: "sine.inOut",
        onUpdate: () => {
          const point = arc(from, target() ?? first, rise)(proxy.p);
          setX(point.x);
          setY(point.y);
          setScale(point.scale);
          setLean?.(lean * Math.sin(Math.PI * proxy.p));
        },
      },
      "launch",
    );
    tl.addLabel("arrive", `launch+=${time}`);
  };

  /** squash on touch-down and wobble back; the mark gives a little under him */
  const touchDown = (tl: gsap.core.Timeline) => {
    if (squash) {
      tl.to(squash, { scaleX: 1.32, scaleY: 0.68, duration: 0.08, ease: "power2.out" }, "arrive").to(
        squash,
        { scaleX: 1, scaleY: 1, duration: 0.85, ease: "elastic.out(1, 0.3)" },
        "arrive+=0.08",
      );
    }
    if (disc) {
      tl.to(disc, { y: 9, duration: 0.08, ease: "power2.out" }, "arrive").to(
        disc,
        { y: 0, duration: 0.8, ease: "elastic.out(1, 0.35)" },
        "arrive+=0.08",
      );
    }
    /* settled: he flips his laptop open */
    tl.call(() => showClip("sit"), undefined, "arrive+=0.32");
  };

  const rest: Point = { x: 0, y: 0, scale: 1 };

  /** Glide from wherever the corner Clawd is onto the mark. */
  const land = () => {
    timeline?.kill();
    const corner = cornerPose();
    const tl = gsap.timeline({ onComplete: () => flying(false) });
    timeline = tl;
    showClip("fly");
    flying(true);

    if (!corner) {
      /* nobody in the corner to glide from: drop in from above instead */
      reset();
      tl.set(perch, { x: 0, y: -150, scale: 1, autoAlpha: 0 })
        .to(perch, { autoAlpha: 1, duration: 0.1, ease: "none" })
        .addLabel("launch", 0)
        .to(perch, { y: 0, duration: 0.45, ease: "power2.in" }, "launch")
        .addLabel("arrive", 0.45);
      touchDown(tl);
      return;
    }

    /* already in the air on the way back (a scroll reversal) — turn around
       where he is instead of snapping back to the corner first */
    const airborne = Number(gsap.getProperty(perch, "autoAlpha")) > 0.5;
    let from: Point = corner;
    if (airborne) {
      from = current();
      tl.addLabel("launch");
    } else {
      reset();
      tl.set(perch, { x: corner.x, y: corner.y, scale: corner.scale, autoAlpha: 1 });
      takeOff(tl);
    }
    leap(tl, from, () => rest, airborne ? 16 : corner.hop);
    touchDown(tl);
  };

  /** Glide from the mark back to the corner; `arrived` fires on the frame he
      gets there, which is when the corner copy takes over. */
  const leave = (arrived: () => void) => {
    timeline?.kill();
    const corner = cornerPose();
    const tl = gsap.timeline({
      onComplete: () => {
        flying(false);
        arrived();
      },
    });
    timeline = tl;
    showClip("fly");

    if (!corner) {
      reset();
      tl.to(perch, { y: -60, autoAlpha: 0, duration: 0.28, ease: "power2.in" });
      return;
    }

    flying(true);
    const airborne = Number(gsap.getProperty(perch, "autoAlpha")) > 0.5;
    if (airborne) tl.addLabel("launch");
    else takeOff(tl);
    /* a flatter arc on the way up: the apex is above the corner here, right
       under the top edge of the screen */
    leap(tl, current(), cornerPose, corner.hop * 0.4);
    tl.set(perch, { autoAlpha: 0 }, "arrive").call(reset, undefined, "arrive");
  };

  /** Jump straight to either end state (reload mid-page, a resize). */
  const settle = (perched: boolean) => {
    timeline?.kill();
    timeline = null;
    flying(false);
    reset();
    if (disc) gsap.set(disc, { y: 0 });
    gsap.set(perch, { x: 0, y: 0, scale: 1, autoAlpha: perched ? 1 : 0 });
    showClip("sit");
  };

  const kill = () => {
    timeline?.kill();
    flying(false);
  };

  return { land, leave, settle, kill };
}
