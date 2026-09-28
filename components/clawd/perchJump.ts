import { gsap } from "@/lib/animation";
import { BODY_X, FEET, HEAD, currentSquash, give, inFlight, jump, type Jump, type Pose } from "./motion";

/** Highest the arc may rise above the higher end of a flight. */
const HOP = 42;
/** Closest his head may come to the top edge of the screen mid-air. */
const TOP_MARGIN = 14;
/** Crouch before take-off (ms). */
const CROUCH = 130;
/** How far (px) the mark gives under him when he lands on it. */
const MARK_GIVE = 5;

const HOME: Pose = { x: 0, y: 0, scale: 1 };

export type PerchPhase = "fly" | "sit" | "home";

/** Glide time (ms) grows with the distance, so a short hop and a flight
    across the whole screen read at the same pace. */
const flightTime = (from: Pose, to: Pose) =>
  1000 * gsap.utils.clamp(0.8, 1.2, 0.6 + Math.hypot(to.x - from.x, to.y - from.y) / 1600);

const poseFrame = ({ x, y, scale }: Pose): Keyframe => ({
  transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(4)})`,
});

/**
 * Clawd's glide between his corner (ClawdPet) and the GitHub mark at the end
 * of the project row, and home again — when the row rolls back, when the
 * page scrolls on past it, and back onto the mark when you scroll up to it.
 *
 * It moves the one real Clawd: there is no second copy to hand over to, so he
 * can never go missing or show up twice. Every flight is baked up front by
 * `jump()` (motion.ts), one animation per element, so the browser plays all
 * of it — crouch, arc, lean, landing, the mark giving under him — on the
 * compositor, however busy the scroll keeps the page. While he sits on the
 * mark the finished flight holds its last frame; the row is pinned there, so
 * the mark doesn't move under him.
 */
export function createPerchJump(perch: HTMLElement, disc: HTMLElement | null) {
  /* the static copy on the mark is for phones and reduced motion, where there
     is no corner Clawd — here the real one flies over instead */
  perch.style.opacity = "0";

  let flight: Jump | null = null;
  /* the mark's give, and whatever of a flight still plays out after it was
     let go (the squash of a landing at home) */
  let loose: Animation[] = [];
  /* his pose on the mark after an instant settle() */
  let held: Animation | null = null;
  /* where he is headed (or sits): drives resize and ClawdPet readiness */
  let wantPerched = false;
  let phase: PerchPhase = "home";
  /* where he rests when he isn't flying */
  let rest: Pose = HOME;

  const setPhase = (next: PerchPhase) => {
    phase = next;
    window.dispatchEvent(new CustomEvent<PerchPhase>("clawd-perch", { detail: next }));
  };

  const parts = () => {
    const root = document.querySelector<HTMLElement>(".clawd-pet");
    const sprite = root?.querySelector<HTMLElement>(".clawd-sprite");
    const img = root?.querySelector<HTMLImageElement>(".clawd-sprite img");
    if (!root || !sprite || !img || img.offsetWidth === 0) return null;
    return { root, sprite, img };
  };

  /** His sprite box at home, untransformed: offset* ignore transforms, and a
      fixed element's offsets are relative to the viewport. The flight scales
      around his feet, so the origin is pinned there first. */
  const homeBox = (root: HTMLElement, img: HTMLImageElement) => {
    const left = root.offsetLeft + img.offsetLeft;
    const top = root.offsetTop + img.offsetTop;
    const size = img.offsetWidth;
    root.style.transformOrigin = `${img.offsetLeft + size * BODY_X}px ${img.offsetTop + size * FEET}px`;
    return { left, top, size };
  };

  /* how far the row still has to creep before the mark is at rest — the
     flight aims for where it will be, not where it is */
  let settleX = 0;

  /** The pose that puts him on the mark: feet on its sprite's feet line,
      body over its body, at its size. */
  const perchPose = (box: { left: number; top: number; size: number }): Pose => {
    const rect = perch.getBoundingClientRect();
    return {
      x: rect.left + settleX + rect.width * BODY_X - (box.left + box.size * BODY_X),
      y: rect.top + rect.width * FEET - (box.top + box.size * FEET),
      scale: rect.width / box.size,
    };
  };

  const stop = () => {
    flight?.animations.forEach((animation) => animation.cancel());
    flight = null;
    loose.forEach((animation) => animation.cancel());
    loose = [];
    held?.cancel();
    held = null;
  };

  /** One flight from wherever he is to `to`, ending in a landing. */
  const fly = (to: () => Pose | null, onLanded: () => void, crouch = true) => {
    const p = parts();
    if (!p) return;
    const box = homeBox(p.root, p.img);
    /* cut short mid-air, the new flight picks up his position, speed and
       squash exactly where the old one left them */
    const now = inFlight(flight);
    const from = now?.pose ?? rest;
    const squash = now ? currentSquash(p.img) : undefined;
    stop();
    const target = to() ?? HOME;
    const onMark = target !== HOME;

    /* the apex stays clear of the top edge: his head must not leave the
       screen anywhere along the arc (it rises above the higher end) */
    const headTop =
      box.top + box.size * FEET + Math.min(from.y, target.y) -
      box.size * (FEET - HEAD) * Math.max(from.scale, target.scale);
    const rise = gsap.utils.clamp(0, HOP, headTop - TOP_MARGIN);

    setPhase("fly");
    flight = jump(
      { body: p.root, lean: p.sprite, sprite: p.img },
      {
        from,
        to: target,
        rise: now?.velocity ? Math.min(rise, 12) : rise,
        duration: flightTime(from, target),
        crouch: now || !crouch ? 0 : CROUCH,
        timing: "sine.inOut",
        velocity: now?.velocity,
        squash,
        give: onMark && disc ? MARK_GIVE : 0,
        frame: poseFrame,
      },
    );
    /* the mark gives under him on the very frame he touches down */
    if (onMark && disc) {
      loose.push(give(disc, (share) => ({ translate: `0 ${(share * MARK_GIVE).toFixed(2)}px` }), flight.touchdown));
    }
    const current = flight;
    current.body.finished.then(() => {
      if (flight === current) {
        rest = target;
        onLanded();
      }
    }, () => {});
  };

  /** Glide from wherever he is onto the mark; `remaining` is how many px the
      row still travels before it stops. */
  const land = (remaining = 0) => {
    wantPerched = true;
    settleX = -remaining;
    if (!parts()) return; /* not in his corner yet — ClawdPet calls us once he is */
    fly(
      () => {
        const p = parts();
        return p ? perchPose(homeBox(p.root, p.img)) : null;
      },
      () => setPhase("sit"),
    );
  };

  /** Glide from the mark (or mid-air) back home to his corner. `quick` skips
      the crouch — for when the page is already scrolling the mark away. */
  const leave = (quick = false) => {
    wantPerched = false;
    if (phase === "home") return;
    fly(
      () => HOME,
      () => {
        /* home: let go of the flight so ClawdPet owns his position again —
           the landing squash plays out on its own */
        if (flight) {
          flight.body.cancel();
          loose.push(...flight.animations.slice(1));
          flight = null;
        }
        setPhase("home");
      },
      !quick,
    );
  };

  /** Straight to either end state (reload mid-page, a resize, a refresh). */
  const settle = (perched: boolean) => {
    wantPerched = perched;
    settleX = 0;
    stop();
    const p = parts();
    if (!p) return;
    if (perched) {
      rest = perchPose(homeBox(p.root, p.img));
      held = p.root.animate([poseFrame(rest)], { duration: 0, fill: "forwards" });
      setPhase("sit");
    } else {
      rest = HOME;
      setPhase("home");
    }
  };

  /* ClawdPet only appears after the intro; if the page was opened (or
     reloaded) with the row already at its end, he flies over as soon as he
     is there */
  const onReady = () => {
    if (wantPerched && phase === "home") land();
  };
  window.addEventListener("clawd-ready", onReady);

  /** Keeps him on the mark after the layout changes under him. */
  const resize = () => {
    if (phase === "sit") settle(true);
  };

  const destroy = () => {
    window.removeEventListener("clawd-ready", onReady);
    stop();
    rest = HOME;
    const p = parts();
    p?.root.style.removeProperty("transform-origin");
    perch.style.removeProperty("opacity");
    if (phase !== "home") setPhase("home");
  };

  return { land, leave, settle, resize, destroy };
}
