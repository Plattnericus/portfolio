import { gsap } from "@/lib/animation";

/** Where Clawd's feet are, as a share of his sprite's height (the legs end at
    146 of 192 px in every clip). He is scaled around this point, so a flight
    between two sizes keeps his feet exactly on the line he stands on. */
const FEET = 0.76;
/** Where his visible head starts in the sprite (49 of 192 px). */
const HEAD = 0.25;
/** Highest the arc may rise above the higher end of a flight. */
const HOP = 42;
/** Closest his head may come to the top edge of the screen mid-air. */
const TOP_MARGIN = 14;
/** How far (deg) he leans into the direction he is gliding. */
const LEAN = 7;
/** Crouch before take-off (ms). */
const CROUCH = 150;
/** Keyframes per curve: enough that the piecewise-linear path between them
    is indistinguishable from the real curve at any refresh rate. */
const SAMPLES = 60;

/** Where he stands and how big he is, relative to his home in the corner. */
type Pose = { x: number; y: number; scale: number };
const HOME: Pose = { x: 0, y: 0, scale: 1 };

export type PerchPhase = "fly" | "sit" | "home";

/** Glide time (ms) grows with the distance, so a short hop and a flight
    across the whole screen read at the same pace. */
const flightTime = (from: Pose, to: Pose) =>
  1000 * gsap.utils.clamp(0.8, 1.2, 0.6 + Math.hypot(to.x - from.x, to.y - from.y) / 1600);

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
const poseFrame = ({ x, y, scale }: Pose): Keyframe => ({
  transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(4)})`,
});

/**
 * Clawd's glide between his corner (ClawdPet) and the GitHub mark at the end
 * of the project row, and home again — when the row rolls back, when the
 * page scrolls on past it, and back onto the mark when you scroll up to it.
 *
 * It moves the one real Clawd: there is no second copy to hand over to, so he
 * can never go missing or show up twice. The whole flight — crouch, arc, lean,
 * squash on landing, the mark dipping under him — is baked into keyframes and
 * played through the Web Animations API, so the browser runs it on the
 * compositor at the display's own refresh rate however busy the page is.
 * While he sits on the mark the finished flight simply holds its last frame;
 * the row is pinned there, so the mark doesn't move under him.
 */
export function createPerchJump(perch: HTMLElement, disc: HTMLElement | null) {
  /* the static copy on the mark is for phones and reduced motion, where there
     is no corner Clawd — here the real one flies over instead */
  perch.style.opacity = "0";

  let flight: Animation | null = null;
  let extras: Animation[] = [];
  /* where he is headed (or sits): drives resize and ClawdPet readiness */
  let wantPerched = false;
  let phase: PerchPhase = "home";

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
    root.style.transformOrigin = `${img.offsetLeft + size / 2}px ${img.offsetTop + size * FEET}px`;
    return { left, top, size };
  };

  /* how far the row still has to creep before the mark is at rest — the
     flight aims for where it will be, not where it is */
  let settleX = 0;

  /** The pose that puts him on the mark: feet on its sprite's feet line,
      centred, at its size. */
  const perchPose = (box: { left: number; top: number; size: number }): Pose => {
    const rect = perch.getBoundingClientRect();
    return {
      x: rect.left + settleX + rect.width / 2 - (box.left + box.size / 2),
      y: rect.top + rect.width * FEET - (box.top + box.size * FEET),
      scale: rect.width / box.size,
    };
  };

  /** Where he is right now — mid-flight included. */
  const currentPose = (root: HTMLElement): Pose => {
    const transform = getComputedStyle(root).transform;
    if (!transform || transform === "none") return HOME;
    const m = new DOMMatrixReadOnly(transform);
    return { x: m.e, y: m.f, scale: m.a };
  };

  const stop = () => {
    flight?.cancel();
    flight = null;
    extras.forEach((animation) => animation.cancel());
    extras = [];
  };
  const extra = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = el.animate(keyframes, { easing: "linear", ...options });
    extras.push(animation);
    return animation;
  };

  /** One flight from wherever he is to `to`, ending in a landing. */
  const fly = (to: () => Pose | null, onLanded: () => void) => {
    const p = parts();
    if (!p) return;
    const box = homeBox(p.root, p.img);
    const from = currentPose(p.root);
    const inAir = phase === "fly";
    stop();
    const target = to() ?? HOME;

    /* the apex stays clear of the top edge: his head must not leave the
       screen anywhere along the arc (it rises above the higher end) */
    const headTop =
      box.top + box.size * FEET + Math.min(from.y, target.y) -
      box.size * (FEET - HEAD) * Math.max(from.scale, target.scale);
    const rise = gsap.utils.clamp(0, HOP, headTop - TOP_MARGIN);
    const path = arc(from, target, inAir ? Math.min(rise, 12) : rise);
    const ease = gsap.parseEase("sine.inOut");
    const lean = (target.x < from.x ? -1 : 1) * LEAN;
    const duration = flightTime(from, target);
    const delay = inAir ? 0 : CROUCH;

    const moves: Keyframe[] = [];
    const leans: Keyframe[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = ease(i / SAMPLES);
      moves.push(poseFrame(path(t)));
      leans.push({ transform: `rotate(${(lean * Math.sin(Math.PI * t)).toFixed(2)}deg)` });
    }

    setPhase("fly");
    flight = p.root.animate(moves, { duration, delay, easing: "linear", fill: "both" });
    extra(p.sprite, leans, { duration, delay });

    if (!inAir) {
      /* a small crouch, then a light spring up */
      extra(p.img, eased("power2.out", [1, 1], [1.08, 0.9], squashFrame, 8), { duration: CROUCH });
      extra(p.img, eased("power2.out", [1.08, 0.9], [0.95, 1.06], squashFrame, 8), {
        duration: 110,
        delay: CROUCH,
      });
      extra(p.img, eased("sine.inOut", [0.95, 1.06], [1, 1], squashFrame, 12), {
        duration: 280,
        delay: CROUCH + 110,
      });
    }

    flight.finished.then(() => {
      /* touch down: a soft squash that settles with one small overshoot */
      extra(p.img, eased("power2.out", [1, 1], [1.1, 0.9], squashFrame, 6), { duration: 90 });
      extra(p.img, eased("back.out(2)", [1.1, 0.9], [1, 1], squashFrame, 24), {
        duration: 420,
        delay: 90,
      });
      onLanded();
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
      () => {
        /* the mark gives a little under his weight */
        if (disc) {
          const dip = ([y]: number[]): Keyframe => ({ translate: `0 ${y}px` });
          extra(disc, eased("power2.out", [0], [5], dip, 6), { duration: 90 });
          extra(disc, eased("back.out(2)", [5], [0], dip, 24), { duration: 480, delay: 90 });
        }
        setPhase("sit");
      },
    );
  };

  /** Glide from the mark (or mid-air) back home to his corner. */
  const leave = () => {
    wantPerched = false;
    if (phase === "home") return;
    fly(
      () => HOME,
      () => {
        /* home: let go of the flight so ClawdPet owns his position again */
        flight?.cancel();
        flight = null;
        setPhase("home");
      },
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
      flight = p.root.animate([poseFrame(perchPose(homeBox(p.root, p.img)))], {
        duration: 0,
        fill: "forwards",
      });
      setPhase("sit");
    } else {
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
    const p = parts();
    p?.root.style.removeProperty("transform-origin");
    perch.style.removeProperty("opacity");
    if (phase !== "home") setPhase("home");
  };

  return { land, leave, settle, resize, destroy };
}
