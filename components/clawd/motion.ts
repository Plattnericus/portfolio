import { gsap } from "@/lib/animation";

/** Clawd's ground line, as a share of his sprite's height: the bottom of the
    shadow under him (156 of 192 px in every clip — he hovers a little above
    it, as the pixel art has him). He is scaled and squashed around this
    point, so his shadow stays on whatever he stands on. */
export const FEET = 0.8125;
/** Where his visible head starts in the sprite (48 of 192 px). */
export const HEAD = 0.25;

/** How far (deg) he leans into a jump at full speed. */
const LEAN = 8;
/** Sideways speed (px/ms) at which he is leaning most of the way. */
const LEAN_SPEED = 0.8;
/** One keyframe per frame at 120 Hz: the straight lines the browser draws
    between them are then indistinguishable from the curves they sample. */
const STEP = 1000 / 120;

/** Where he stands and how big he is, relative to where he rests. */
export type Pose = { x: number; y: number; scale: number };

type Segment = { to: number[]; ms: number; ease?: string };

/** The spot he lands on gives under him and springs back (as a share of how
    far it gives). */
const GIVE: Segment[] = [
  { to: [1], ms: 90, ease: "power2.out" },
  { to: [0], ms: 460, ease: "back.out(1.6)" },
];
const GIVE_MS = 550;

/** Touch-down: a soft squash that settles with the smallest overshoot. */
const LANDING: Segment[] = [
  { to: [1.1, 0.9], ms: 90, ease: "power2.out" },
  { to: [1, 1], ms: 420, ease: "back.out(1.4)" },
];

/** Values going `from` through each eased segment in turn, sampled at the
    frame rate — as [ms since the start, values]. */
function sample(from: number[], segments: Segment[]) {
  const points: Array<[number, number[]]> = [];
  let at = 0;
  let previous = from;
  for (const { to, ms, ease = "none" } of segments) {
    if (ms > 0) {
      const still = to.every((value, i) => value === previous[i]);
      const steps = still ? 1 : Math.max(1, Math.ceil(ms / STEP));
      const curve = gsap.parseEase(ease);
      for (let i = 1; i <= steps; i++) {
        const t = curve(i / steps);
        points.push([at + (ms * i) / steps, previous.map((value, j) => value + (to[j] - value) * t)]);
      }
    }
    at += ms;
    previous = to;
  }
  return points;
}

/** An arc from `from` to `to` over t = 0…1: the height follows a parabola
    whose apex sits exactly `rise` px above the higher end —
    height(p) = h0·(1-p) + h1·p + 4k·p·(1-p) peaks at h0 + (a + 4k)² / 16k
    (a = h1 - h0); setting that to max(h0, h1) + rise and taking the root that
    keeps the apex inside the jump gives k.
    `timing` spaces the arc out in time: linear is a real jump (steady
    sideways, gravity up and down), an in-out ease a glide.
    A jump that cuts another one short carries its `velocity` (per ms) on for
    a moment and bends round, instead of stopping dead in the air. */
function arc(
  from: Pose,
  to: Pose,
  rise: number,
  timing: string,
  duration: number,
  velocity?: Pose,
) {
  const h0 = -from.y;
  const h1 = -to.y;
  const a = h1 - h0;
  const m = Math.max(h0, h1) + rise - h0;
  const k = Math.max(0, (2 * m - a + 2 * Math.sqrt(Math.max(0, m * (m - a)))) / 4);
  const ease = gsap.parseEase(timing);
  return (t: number): Pose => {
    const p = ease(t);
    /* starts at exactly `velocity` and fades out well before the landing */
    const carry = velocity ? t * (1 - t) ** 4 * duration : 0;
    return {
      x: from.x + (to.x - from.x) * p + carry * (velocity?.x ?? 0),
      y: -(h0 * (1 - p) + h1 * p + 4 * k * p * (1 - p)) + carry * (velocity?.y ?? 0),
      scale: from.scale + (to.scale - from.scale) * p + carry * (velocity?.scale ?? 0),
    };
  };
}

export type JumpParts = {
  /** travels along the arc */
  body: HTMLElement;
  /** leans into the direction of travel */
  lean: HTMLElement;
  /** squashes and stretches about the feet */
  sprite: HTMLElement;
};

export type JumpPlan = {
  from: Pose;
  to: Pose;
  /** px the apex rises above the higher end */
  rise: number;
  /** ms in the air */
  duration: number;
  /** ms crouching before take-off; 0 when he is already in the air */
  crouch: number;
  /** "none" for a jump, an in-out ease for a glide */
  timing: string;
  /** his velocity (per ms) when this jump cuts another one short */
  velocity?: Pose;
  /** his squash right now, when this jump cuts another one short */
  squash?: number[];
  /** px the spot he lands on gives under him */
  give?: number;
  /** a pose as a keyframe on `body` */
  frame: (pose: Pose) => Keyframe;
};

export type Jump = {
  /** the body's animation — finishes once he is down and settled */
  body: Animation;
  animations: Animation[];
  /** where he is `ms` into the jump */
  at: (ms: number) => Pose;
  crouch: number;
  /** ms from the start to touch-down */
  touchdown: number;
};

const squashFrame = ([x, y]: number[]): Keyframe => ({
  transform: `scale(${x.toFixed(4)}, ${y.toFixed(4)})`,
});
const leanFrame = (deg: number): Keyframe => ({ transform: `rotate(${deg.toFixed(2)}deg)` });

/**
 * One whole jump — crouch, take-off, arc, lean, touch-down, the landing spot
 * giving under him — baked into keyframes up front and handed to the Web
 * Animations API.
 *
 * Each element gets exactly one animation for the whole jump. That is what
 * lets the browser run all of it on the compositor, at the display's own
 * refresh rate and untouched by whatever the page's script is doing: two
 * animations on the same property of one element (a crouch, then a separate
 * landing squash) are never composited, and fall back to the main thread —
 * which is where a jump starts to stutter while the page scrolls.
 */
export function jump(parts: JumpParts, plan: JumpPlan): Jump {
  const { from, to, rise, duration, crouch, timing, velocity, give = 0, frame } = plan;
  const path = arc(from, to, rise, timing, duration, velocity);
  const touchdown = crouch + duration;
  const bodyTotal = touchdown + (give ? GIVE_MS : 0);
  const steps = Math.max(2, Math.ceil(duration / STEP));
  const offset = (ms: number, total: number) => Math.min(1, ms / total);

  /* the body: still through the crouch, along the arc, down with the spot */
  const moves: Keyframe[] = [{ ...frame(from), offset: 0 }];
  if (crouch) moves.push({ ...frame(from), offset: offset(crouch, bodyTotal) });
  for (let i = 1; i <= steps; i++) {
    moves.push({ ...frame(path(i / steps)), offset: offset(crouch + (duration * i) / steps, bodyTotal) });
  }
  if (give) {
    for (const [ms, [v]] of sample([0], GIVE)) {
      moves.push({ ...frame({ ...to, y: to.y + v * give }), offset: offset(touchdown + ms, bodyTotal) });
    }
  }

  /* the lean follows his sideways speed, so it builds and eases off with the
     motion itself — and carries straight over into a jump that cuts this one
     short. A real jump moves sideways at one speed, so there it is faded in
     and out over the arc instead. */
  const glide = timing !== "none";
  const leanAt = (t: number) => {
    const a = Math.max(0, t - 0.002);
    const b = Math.min(1, t + 0.002);
    const speed = (path(b).x - path(a).x) / ((b - a) * duration);
    return LEAN * Math.tanh(speed / LEAN_SPEED) * (glide ? 1 : Math.sin(Math.PI * t));
  };
  const leans: Keyframe[] = [{ ...leanFrame(glide ? leanAt(0) : 0), offset: 0 }];
  if (crouch) leans.push({ ...leanFrame(0), offset: offset(crouch, touchdown) });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    leans.push({ ...leanFrame(i === steps ? 0 : leanAt(t)), offset: offset(crouch + duration * t, touchdown) });
  }

  /* squash and stretch: crouch, spring up, straighten out in the air, then
     the landing — or, cut short mid-air, just straighten out from wherever
     he is */
  const squashFrom = plan.squash ?? [1, 1];
  const air: Segment[] = crouch
    ? [
        { to: [1.07, 0.92], ms: crouch, ease: "power2.out" },
        { to: [0.96, 1.05], ms: 120, ease: "power2.out" },
        {
          to: [1, 1],
          ms: Math.max(60, Math.min(260, duration - 160)),
          ease: "sine.out",
        },
      ]
    : [{ to: [1, 1], ms: Math.min(160, duration * 0.4), ease: "sine.out" }];
  const airMs = air.reduce((sum, segment) => sum + segment.ms, 0);
  const squashes = sample(squashFrom, [
    ...air,
    { to: [1, 1], ms: Math.max(0, touchdown - airMs) },
    ...LANDING,
  ]);
  const squashTotal = squashes[squashes.length - 1][0];

  const animations = [
    parts.body.animate(moves, { duration: bodyTotal, easing: "linear", fill: "forwards" }),
    parts.lean.animate(leans, { duration: touchdown, easing: "linear" }),
    parts.sprite.animate(
      [
        { ...squashFrame(squashFrom), offset: 0 },
        ...squashes.map(([ms, values]) => ({ ...squashFrame(values), offset: offset(ms, squashTotal) })),
      ],
      { duration: squashTotal, easing: "linear" },
    ),
  ];

  /* started on this very frame rather than left pending until the next one:
     a jump that takes over mid-air would otherwise hold him still for a
     frame, and read as a hitch right at the turn */
  startNow(animations);

  return {
    body: animations[0],
    animations,
    at: (ms) => (ms <= crouch ? from : ms >= touchdown ? to : path((ms - crouch) / duration)),
    crouch,
    touchdown,
  };
}

/** The spot under him giving at touch-down, `delay` ms from now — in step
    with the body, which goes down and back up with it. */
export function give(el: HTMLElement, frame: (share: number) => Keyframe, delay: number) {
  const keyframes = [
    { ...frame(0), offset: 0 },
    ...sample([0], GIVE).map(([ms, [v]]) => ({ ...frame(v), offset: Math.min(1, ms / GIVE_MS) })),
  ];
  const animation = el.animate(keyframes, { duration: GIVE_MS, delay, easing: "linear" });
  startNow([animation]);
  return animation;
}

/** Pins animations to the current frame's time, so everything created
    together starts together — now, not once the compositor gets to it. */
function startNow(animations: Animation[]) {
  const now = document.timeline.currentTime;
  if (now === null) return;
  animations.forEach((animation) => {
    animation.startTime = now;
  });
}

/** Where a running jump has him now, and how fast he is going (per ms) —
    null once he is on the ground. */
export function inFlight(current: Jump | null) {
  if (!current) return null;
  const ms = Number(current.body.currentTime ?? 0);
  if (ms >= current.touchdown) return null;
  const pose = current.at(ms);
  if (ms <= current.crouch) return { pose, velocity: undefined };
  const before = current.at(ms - 4);
  return {
    pose,
    velocity: {
      x: (pose.x - before.x) / 4,
      y: (pose.y - before.y) / 4,
      scale: (pose.scale - before.scale) / 4,
    },
  };
}

/** His squash as it is on screen right now. */
export function currentSquash(sprite: HTMLElement) {
  const transform = getComputedStyle(sprite).transform;
  if (!transform || transform === "none") return [1, 1];
  const m = new DOMMatrixReadOnly(transform);
  return [m.a, m.d];
}
