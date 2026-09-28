import { gsap } from "@/lib/animation";
import { BODY_X, FEET, HEAD, give, jump, type Jump, type Pose } from "./motion";

/** Where he stands on each glyph of the 404: how far across its box, and how
    far below the box's top the ink starts, in em — measured from the
    NexorBrand glyphs. The 4's top is a flat shelf from 48% to 84% of its
    width; the 0 peaks in its middle (the CSS puts him there to begin with). */
const SPOTS: Record<string, { across: number; top: number }> = {
  "4": { across: 0.66, top: 0.055 },
  /* the 0 is pointed: his inner feet stand just either side of the tip */
  "0": { across: 0.5, top: 0.052 },
};
/** How far (em) a digit gives under him when he lands on it. */
const GIVE = 0.016;
/** How far (em) a line of text gives under him — the text is a lot smaller
    than the 404, so it gives a lot more for its size. */
const TEXT_GIVE = 0.075;
/** How far (share of its height) the button's icon cell gives. */
const ICON_GIVE = 0.04;
/** Closest his head may come to the top edge of the screen mid-hop. */
const TOP_MARGIN = 12;
/** Crouch before a hop (ms). */
const CROUCH = 110;
/** How long he stays put after a hop (ms): anywhere from half a second to
    three, at random — never a long stand. A short rest ends in a short hop
    on along the same line, as if something caught his eye; at most two of
    those in a row. */
const REST = [500, 3000] as const;
const QUICK_BELOW = 1000;
const QUICK_RUN = 2;
/** After dropping in, and after coming over to the pointer, the rest is
    drawn from the upper part of the range. */
const SETTLED_REST = [1500, 3000] as const;
/** How long the pointer has to rest on something before he comes over
    (ms) — a pointer only passing over the text on its way somewhere must
    not send him chasing after it. A tap or a click calls him at once. */
const DWELL = 220;
/** On his own he never hops less than this share of his size — from one
    letter to the next would be a twitch, not a hop. */
const MIN_HOP = 0.35;
/** The perspective the 404 leans in; he leans the same way while he is on
    it (see `tilt`). */
export const PERSPECTIVE = 1000;

type Group = "digits" | "title" | "copy" | "button";

/** Where he heads on his own, by where he is now. The 404 stays home base. */
const NEXT: Record<Group, Array<[Group, number]>> = {
  digits: [["digits", 0.5], ["title", 0.24], ["copy", 0.1], ["button", 0.16]],
  title: [["title", 0.32], ["digits", 0.34], ["copy", 0.12], ["button", 0.22]],
  copy: [["copy", 0.28], ["title", 0.3], ["button", 0.22], ["digits", 0.2]],
  button: [["button", 0.3], ["digits", 0.3], ["title", 0.25], ["copy", 0.15]],
};

/** A place his feet go, in the content box's own (untransformed) px. */
type Point = {
  x: number;
  y: number;
  /** px from where he stands down to where the thing gives from */
  depth: number;
  /** px it gives under him */
  dip: number;
  /** x (px) inside each giving element it squashes toward */
  origin: number;
  /** the line it is on (its baseline), for picking the spot under a
      pointer on text that wraps; null where there is only the one line */
  line: number | null;
};

type Spot = {
  group: Group;
  /** on the button: what of it moves under him when the cursor's magnet
      pulls at it — the whole pill, or its label too (a letter) */
  rides?: "pill" | "label";
  /** what gives under him (a letter on the button has a twin in the row
      that rolls in on hover) */
  gives: HTMLElement[];
  measure: () => Point | null;
};

const frame = ({ x, y }: Pose): Keyframe => ({
  transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`,
});

const isLetter = (char: string) => /[\p{L}\p{N}]/u.test(char);

/** Where an element's box sits inside `root`, transforms ignored: summed up
    the offset chain (each step's offsetParent can be anything positioned,
    filtered or transformed in between). */
function offsetIn(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (parent && parent !== root) {
      x += parent.clientLeft;
      y += parent.clientTop;
    }
    node = parent;
  }
  return { x, y };
}

/** The text baseline inside `el`, in `root` px: an empty inline-block sits
    with its bottom edge — its only edge — on the baseline. */
function baselineIn(el: HTMLElement, root: HTMLElement) {
  const probe = document.createElement("span");
  probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
  el.prepend(probe);
  const y = offsetIn(probe, root).y;
  probe.remove();
  return y;
}

const shown = (char: string, transform: string) =>
  transform === "uppercase" ? char.toUpperCase() : transform === "lowercase" ? char.toLowerCase() : char;

/** Where he can stand on a glyph: its highest stretch of ink, found by
    drawing it once — the middle of the widest part of that top edge (the bar
    of a T, the stem of an L, the dot of an i, the point of an A), as px
    across from its pen position and px above its baseline. */
const inks = new Map<string, { x: number; top: number } | null>();
let inkCanvas: HTMLCanvasElement | null = null;
function inkOf(style: CSSStyleDeclaration, char: string) {
  const size = parseFloat(style.fontSize);
  const face = (px: number) => `${style.fontStyle} ${style.fontWeight} ${px}px ${style.fontFamily}`;
  const key = `${face(size)}|${char}`;
  const cached = inks.get(key);
  if (cached !== undefined) return cached;
  /* not loaded yet: the fallback face would put him in the wrong place, and
     that must not stick. Only the first family counts — it is the one the
     text is set in; the size-adjusted fallback after it (next/font's) is
     only ever loaded if it was needed, and would fail the check for good */
  const first = style.fontFamily.split(",")[0].trim();
  if (!document.fonts.check(`${style.fontStyle} ${style.fontWeight} ${size}px ${first}`, char)) {
    return null;
  }

  const scale = Math.max(2, 64 / size);
  const px = size * scale;
  const pad = Math.ceil(px * 0.3);
  const width = Math.ceil(px * 1.6) + pad * 2;
  const height = Math.ceil(px * 1.8);
  const base = Math.ceil(px * 1.3);
  inkCanvas ??= document.createElement("canvas");
  inkCanvas.width = width;
  inkCanvas.height = height;
  const ctx = inkCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  ctx.font = face(px);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#000";
  ctx.fillText(char, pad, base);
  const { data } = ctx.getImageData(0, 0, width, height);

  const tops = new Array<number>(width).fill(Infinity);
  let left = Infinity;
  let right = -Infinity;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (data[(y * width + x) * 4 + 3] > 127) {
        tops[x] = y;
        left = Math.min(left, x);
        right = Math.max(right, x);
        break;
      }
    }
  }
  const highest = Math.min(...tops);
  if (!Number.isFinite(highest)) {
    inks.set(key, null);
    return null;
  }

  /* the top edge: every column within a hair of the highest ink, in runs */
  const within = highest + Math.max(1, px * 0.03);
  const centre = (left + right + 1) / 2;
  let best: { length: number; middle: number } | null = null;
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const on = x < width && tops[x] <= within;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      const run = { length: x - start, middle: (start + x) / 2 };
      /* the widest; of two about as wide (the stems of an M, the arms of a
         V) the one nearer the middle of the glyph */
      if (
        !best ||
        run.length > best.length * 1.2 ||
        (run.length > best.length / 1.2 &&
          Math.abs(run.middle - centre) < Math.abs(best.middle - centre))
      ) {
        best = run;
      }
      start = -1;
    }
  }
  const ink = best && { x: (best.middle - pad) / scale, top: (base - highest) / scale };
  inks.set(key, ink);
  return ink;
}

/**
 * Clawd on the 404: he drops onto the 0, then hops about on everything on
 * the page — the digits, every letter of the heading and the line under it,
 * the letters and the icon of the button — on his own, over to whatever the
 * pointer is on (or a finger taps), and on the spot when he is poked. Every
 * hop is one baked jump (motion.ts) — steady sideways, gravity up and down —
 * with whatever he lands on giving under him.
 */
export function createStackHopper(
  root: HTMLElement,
  /** he leaves the spot he was on — whatever he was saying there ends */
  onDepart?: () => void,
) {
  const code = root.querySelector<HTMLElement>(".nf-code");
  const clawd = root.querySelector<HTMLElement>(".nf-clawd");
  const tiltEl = clawd?.querySelector<HTMLElement>(".nf-clawd-tilt");
  const body = clawd?.querySelector<HTMLElement>(".nf-clawd-body");
  const lean = clawd?.querySelector<HTMLElement>(".nf-clawd-lean");
  const sprite = clawd?.querySelector<HTMLElement>("img");
  const digits = [...root.querySelectorAll<HTMLElement>(".nf-digit")];
  if (!code || !clawd || !tiltEl || !body || !lean || !sprite || digits.length === 0) return null;
  const parts = { body, lean, sprite };

  const fontSize = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize);

  /* bumped whenever the layout may have moved; everything measured is kept
     for one generation */
  let generation = 0;
  const baselines = new Map<HTMLElement, { generation: number; y: number }>();
  const baseline = (el: HTMLElement) => {
    const cached = baselines.get(el);
    if (cached && cached.generation === generation) return cached.y;
    const y = baselineIn(el, root);
    baselines.set(el, { generation, y });
    return y;
  };

  /* ---- everything he can stand on ---- */
  const spots: Spot[] = digits.map((digit) => ({
    group: "digits",
    gives: [digit],
    measure: () => {
      const fs = fontSize(code);
      const box = offsetIn(digit, root);
      const place = SPOTS[digit.textContent?.trim() ?? ""] ?? SPOTS["0"];
      const y = box.y + fs * place.top;
      return {
        x: box.x + digit.offsetWidth * place.across,
        y,
        depth: box.y + digit.offsetHeight - y,
        dip: GIVE * fs,
        origin: digit.offsetWidth / 2,
        line: null,
      };
    },
  }));

  /* the heading and the line under it: one spot per letter, while the
     word — kept whole, so its kerning stays — is what gives */
  const range = document.createRange();
  root.querySelectorAll<HTMLElement>(".nf-word").forEach((word) => {
    const text = word.firstChild;
    if (!(text instanceof Text)) return;
    const group: Group = word.closest(".nf-title") ? "title" : "copy";
    Array.from(text.data).forEach((char, index) => {
      if (!isLetter(char)) return;
      spots.push({
        group,
        gives: [word],
        measure: () => {
          const style = getComputedStyle(word);
          const ink = inkOf(style, shown(char, style.textTransform));
          if (!ink) return null;
          range.setStart(text, index);
          range.setEnd(text, index + 1);
          const letter = range.getBoundingClientRect();
          const whole = word.getBoundingClientRect();
          /* the word may be mid-squash: back to its own px */
          const sx = whole.width ? word.offsetWidth / whole.width : 1;
          const box = offsetIn(word, root);
          const across = (letter.left - whole.left) * sx + ink.x;
          const line = baseline(word);
          const y = line - ink.top;
          return {
            x: box.x + across,
            y,
            depth: box.y + word.offsetHeight - y,
            dip: TEXT_GIVE * parseFloat(style.fontSize),
            origin: across,
            line,
          };
        },
      });
    });
  });

  /* the button: its letters (each with its twin in the row that rolls in
     on hover, so the one showing always gives) and the icon cell's top */
  const actions = root.querySelector<HTMLElement>(".nf-actions");
  const rows = actions ? [...actions.querySelectorAll<HTMLElement>(".roll-row")] : [];
  const shownRow = rows.find((row) => !row.classList.contains("roll-row--next"));
  const nextRow = rows.find((row) => row.classList.contains("roll-row--next"));
  const twins = nextRow ? [...nextRow.querySelectorAll<HTMLElement>(".roll-char")] : [];
  const icon = actions?.querySelector<HTMLElement>(".pill-icon");
  if (icon) {
    spots.push({
      group: "button",
      rides: "pill",
      gives: [icon],
      measure: () => {
        const box = offsetIn(icon, root);
        return {
          x: box.x + icon.offsetWidth / 2,
          y: box.y,
          depth: icon.offsetHeight,
          dip: ICON_GIVE * icon.offsetHeight,
          origin: icon.offsetWidth / 2,
          line: null,
        };
      },
    });
  }
  shownRow?.querySelectorAll<HTMLElement>(".roll-char").forEach((char, index) => {
    const glyph = char.textContent ?? "";
    if (!isLetter(glyph)) return;
    spots.push({
      group: "button",
      rides: "label",
      gives: [char, twins[index]].filter(Boolean),
      measure: () => {
        const style = getComputedStyle(char);
        const ink = inkOf(style, shown(glyph, style.textTransform));
        if (!ink) return null;
        const box = offsetIn(char, root);
        const y = baseline(char) - ink.top;
        return {
          x: box.x + ink.x,
          y,
          depth: box.y + char.offsetHeight - y,
          dip: TEXT_GIVE * parseFloat(style.fontSize),
          origin: ink.x,
          line: null,
        };
      },
    });
  });

  /* ---- where they all are, measured once per layout ---- */
  const points = new Map<Spot, { generation: number; point: Point | null }>();
  let feet: { generation: number; x: number; y: number } | null = null;

  const pointOf = (i: number) => {
    const spot = spots[i];
    const cached = points.get(spot);
    if (cached && cached.generation === generation && cached.point) return cached.point;
    const point = spot.measure();
    points.set(spot, { generation, point });
    return point;
  };

  /** Where his feet are with no transform on him — where the CSS puts him. */
  const home = () => {
    if (!feet || feet.generation !== generation) {
      const box = offsetIn(clawd, root);
      feet = {
        generation,
        x: box.x + clawd.offsetWidth * BODY_X,
        y: box.y + clawd.offsetHeight * FEET,
      };
    }
    return feet;
  };

  /** His pose on spot `i`, relative to where the CSS puts him. */
  const pose = (i: number): Pose => {
    const point = pointOf(i);
    const rest = home();
    if (!point) return { x: 0, y: 0, scale: 1 };
    return { x: point.x - rest.x, y: point.y - rest.y, scale: 1 };
  };

  /* he starts on the 0, where the CSS places him */
  const zero = Math.max(0, digits.findIndex((digit) => digit.textContent?.trim() === "0"));
  let at = zero;
  let hop: Jump | null = null;
  let squish: Animation[] = [];
  let held: Animation | null = null;
  let pending: number | null = null;
  /* the pause before his next hop on his own */
  let timer = 0;
  /* his entrance — kept apart from `timer`, which every hop clears: a
     pointer resting on the page while it loads calls him over before he has
     appeared, and must not cancel the appearance itself */
  let enterTimer = 0;
  let entered = false;
  let stopped = false;
  /* after a poke he stays put while he talks */
  let quietUntil = 0;

  /* ---- leaning with the 404 ----
     The 404 leans toward a desktop pointer. On it he leans along with it —
     the same perspective about the same point — so his feet stay on the
     digits; off it, on the text and the button, which don't lean, he stands
     straight. The share eases over during the hop between the two. */
  const weight = { value: 1 };
  let weightTween: gsap.core.Tween | null = null;
  let leanX = 0;
  let leanY = 0;
  let leaning = false;
  const tiltOrigin = () => {
    const box = offsetIn(code, root);
    const self = offsetIn(clawd, root);
    return `${box.x + code.offsetWidth / 2 - self.x}px ${box.y + code.offsetHeight / 2 - self.y}px`;
  };
  const applyTilt = () => {
    if (!leaning) return;
    gsap.set(tiltEl, { rotationX: leanX * weight.value, rotationY: leanY * weight.value });
  };
  /** The 404's lean right now (deg). */
  const tilt = (x: number, y: number) => {
    if (stopped) return;
    if (!leaning) {
      leaning = true;
      gsap.set(tiltEl, { transformPerspective: PERSPECTIVE, transformOrigin: tiltOrigin() });
    }
    leanX = x;
    leanY = y;
    applyTilt();
  };

  /* ---- riding the button ----
     A desktop pointer pulls the button toward it (the cursor's magnet in
     CursorGlow): the pill by up to 12px, its label a little further. On it,
     he rides along — springing back with it, too — instead of hanging in
     the air beside it. How much of the pull he takes eases over during the
     hop onto it and off it, like the lean. */
  const pill = actions?.querySelector<HTMLElement>(".pill") ?? null;
  const label = pill?.querySelector<HTMLElement>(".pill-label") ?? null;
  const ride = { pill: 0, label: 0 };
  let rideTween: gsap.core.Tween | null = null;
  let ridden = "";
  const shiftOf = (el: HTMLElement | null, axis: "x" | "y") =>
    el ? Number(gsap.getProperty(el, axis)) || 0 : 0;
  const follow = () => {
    let x = 0;
    let y = 0;
    if (ride.pill > 0 || ride.label > 0) {
      x = shiftOf(pill, "x") * ride.pill + shiftOf(label, "x") * ride.label;
      y = shiftOf(pill, "y") * ride.pill + shiftOf(label, "y") * ride.label;
    }
    const next = Math.abs(x) + Math.abs(y) < 0.01 ? "" : `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    if (next === ridden) return;
    ridden = next;
    clawd.style.translate = next;
  };
  gsap.ticker.add(follow);
  const rideFor = (spot: Spot) => ({
    pill: spot.rides ? 1 : 0,
    label: spot.rides === "label" ? 1 : 0,
  });

  const clear = () => {
    hop?.animations.forEach((animation) => animation.cancel());
    hop = null;
    squish.forEach((animation) => animation.cancel());
    squish = [];
    held?.cancel();
    held = null;
  };

  /** Puts him straight onto spot `at` (first frame, a resize). */
  const place = () => {
    clear();
    held = body.animate([frame(pose(at))], { duration: 0, fill: "forwards" });
    weightTween?.kill();
    weight.value = spots[at].group === "digits" ? 1 : 0;
    rideTween?.kill();
    Object.assign(ride, rideFor(spots[at]));
    if (leaning) gsap.set(tiltEl, { transformOrigin: tiltOrigin() });
    applyTilt();
    clawd.classList.toggle("is-on-button", spots[at].group === "button");
  };

  const reachable = (i: number) => pointOf(i) !== null;

  /** Where he hops next on his own — `quick`: a short hop on along the
      line he is on. */
  const choose = (quick = false) => {
    const here = spots[at].group;
    const size = clawd.offsetWidth;
    const from = pose(at);
    const far = (i: number) => {
      const to = pose(i);
      return Math.hypot(to.x - from.x, to.y - from.y);
    };

    /* the 404 as before: from the 0 to either 4; from a 4 mostly back to
       the 0, sometimes the long jump right over it to the other 4 */
    const digitTarget = () => {
      const others = digits.map((_, index) => index).filter((index) => index !== at);
      if (here !== "digits") return others[Math.floor(Math.random() * others.length)] ?? zero;
      return at === zero
        ? others[Math.floor(Math.random() * others.length)]
        : Math.random() < 0.65
          ? zero
          : (others.find((index) => index !== zero) ?? zero);
    };

    let roll = Math.random();
    let group: Group = here;
    if (!quick) {
      for (const [next, share] of NEXT[here]) {
        roll -= share;
        if (roll <= 0) {
          group = next;
          break;
        }
      }
    }
    if (group === "digits") return digitTarget();

    const options = spots
      .map((spot, index) => ({ spot, index }))
      .filter(({ spot, index }) => spot.group === group && index !== at && reachable(index))
      .map(({ index }) => ({ index, distance: far(index) }))
      .filter(({ distance }) => distance >= size * MIN_HOP);
    if (options.length === 0) return digitTarget();
    /* along the same line: a hop or two of his own size, not the whole
       line in one go; onto another line anywhere on it */
    const stride = quick ? 0.8 : 1.3;
    const weights = options.map(({ distance }) =>
      group === here ? Math.exp(-(((distance / size - stride) / 0.9) ** 2)) + 0.05 : 1,
    );
    let pick = Math.random() * weights.reduce((sum, w) => sum + w, 0);
    for (let i = 0; i < options.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return options[i].index;
    }
    return options[options.length - 1].index;
  };

  const schedule = (ms: number, quick = false) => {
    window.clearTimeout(timer);
    if (stopped) return;
    timer = window.setTimeout(() => go(choose(quick)), ms);
  };

  /* Every spot measured ahead of need, a few at a time while the page is
     idle — the first pointer over a line of text would otherwise measure
     (and draw) all of its letters at once, in the middle of a frame. */
  let warmHandle = 0;
  const warm = (from = 0) => {
    const next = (deadline?: IdleDeadline) => {
      let i = from;
      do {
        pointOf(i++);
      } while (i < spots.length && (deadline ? deadline.timeRemaining() > 4 : i % 4 !== 0));
      if (i < spots.length && !stopped) warm(i);
    };
    /* Safari has no requestIdleCallback */
    warmHandle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(next, { timeout: 1000 })
        : window.setTimeout(next, 50);
  };
  let warmed = false;

  /** Why he made the hop he just landed from — it sets how long he rests. */
  type Reason = "self" | "enter" | "call" | "poke";
  let reason: Reason = "enter";
  let quickRun = 0;
  const between = ([min, max]: readonly [number, number]) => gsap.utils.random(min, max);

  const idle = () => {
    if (!warmed) {
      warmed = true;
      warm();
    }
    let rest = between(reason === "enter" || reason === "call" ? SETTLED_REST : REST);
    if (rest < QUICK_BELOW && quickRun >= QUICK_RUN) rest = between([QUICK_BELOW, REST[1]]);
    const quick = rest < QUICK_BELOW;
    quickRun = quick ? quickRun + 1 : 0;
    const talking = quietUntil - performance.now();
    schedule(Math.max(rest, talking), quick && talking <= 0);
  };

  /** One hop from where he sits onto spot `to` (the same spot: a hop on
      the spot). */
  const go = (
    to: number,
    options: { from?: Pose; rise?: number; duration?: number; why?: Reason } = {},
  ) => {
    if (stopped) return;
    if (hop) {
      /* mid-hop: he goes there next, once he has landed */
      pending = to;
      return;
    }
    window.clearTimeout(timer);
    reason = options.why ?? "self";
    const landing = pointOf(to);
    if (!landing) {
      idle();
      return;
    }
    const from = options.from ?? pose(at);
    const target = pose(to);
    const size = clawd.offsetWidth;
    const distance = Math.hypot(target.x - from.x, target.y - from.y);
    /* high enough to clear what's in between, never off the top of the
       screen — the apex is measured from the higher of the two ends */
    const head = sprite.getBoundingClientRect().top + size * HEAD;
    const climb = Math.max(0, from.y - target.y);
    const rise = Math.max(
      0,
      Math.min(options.rise ?? size * 0.45 + distance * 0.1, head - climb - TOP_MARGIN),
    );
    const duration = options.duration ?? gsap.utils.clamp(400, 720, 300 + distance * 0.9);
    const crouch = options.from ? 0 : CROUCH;

    held?.cancel();
    held = null;
    if (to !== at) onDepart?.();
    const current = jump(parts, {
      from,
      to: target,
      rise,
      duration,
      crouch,
      timing: "none",
      give: landing.dip,
      frame,
    });
    hop = current;
    at = to;

    /* on the 404 he leans with it, off it he stands straight — eased over
       while he is in the air */
    weightTween?.kill();
    weightTween = gsap.to(weight, {
      value: spots[to].group === "digits" ? 1 : 0,
      duration: duration / 1000,
      delay: crouch / 1000,
      ease: "sine.inOut",
      onUpdate: applyTilt,
    });
    rideTween?.kill();
    rideTween = gsap.to(ride, {
      ...rideFor(spots[to]),
      duration: duration / 1000,
      delay: crouch / 1000,
      ease: "sine.inOut",
    });
    /* on the button he lets clicks through to it */
    clawd.classList.toggle("is-on-button", spots[to].group === "button");

    /* whatever he lands on shrinks toward its foot by exactly the px he
       sinks, toward the spot under his feet */
    squish = spots[to].gives.map((el) => {
      el.style.transformOrigin = `${landing.origin.toFixed(2)}px 100%`;
      return give(
        el,
        (share) => {
          const y = 1 - (share * landing.dip) / Math.max(1, landing.depth);
          return { scale: `${(1 + (1 - y) * 0.6).toFixed(4)} ${y.toFixed(4)}` };
        },
        current.touchdown,
      );
    });

    current.body.finished.then(
      () => {
        if (hop !== current) return;
        hop = null;
        if (pending !== null && pending !== at) {
          const next = pending;
          pending = null;
          go(next, { why: "call" });
        } else {
          pending = null;
          idle();
        }
      },
      () => {},
    );
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
        why: "enter",
      });
    }, delay);
  };

  /** Called over to spot `i` (the pointer is on it). Before he has
      appeared, he heads there as soon as he has landed. */
  const call = (i: number) => {
    if (!entered) pending = i;
    else if (i !== at || hop) go(i, { why: "call" });
  };

  /* ---- the pointer calls him over ---- */
  const groupOf = (target: Element | null): Group | null => {
    if (!target || target.closest(".nf-clawd")) return null;
    if (target.closest(".nf-code")) return "digits";
    if (target.closest(".nf-title")) return "title";
    if (target.closest(".nf-copy")) return "copy";
    if (target.closest(".nf-actions .pill")) return "button";
    return null;
  };
  /** The spot nearest the pointer on whatever it is over. */
  const spotAt = (event: PointerEvent) => {
    const group = groupOf(event.target as Element | null);
    if (!group) return null;
    const bounds = root.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    let best: number | null = null;
    let bestDistance = Infinity;
    spots.forEach((spot, index) => {
      if (spot.group !== group) return;
      const point = pointOf(index);
      if (!point) return;
      /* the line first (the copy may wrap onto two), then along it — by
         the line's baseline, not the letter's own top: an x-height letter
         must not win over the ascender right under the pointer */
      const distance =
        Math.abs(point.x - x) + (point.line === null ? 0 : Math.abs(point.line - y) * 3);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  };
  /* the spot the pointer is resting on, and the wait before he comes */
  let hovered: number | null = null;
  let dwell = 0;
  const fine = window.matchMedia("(pointer: fine)");
  const onPointer = (event: PointerEvent) => {
    if (event.type === "pointerdown") {
      window.clearTimeout(dwell);
      const index = spotAt(event);
      hovered = index;
      if (index !== null) call(index);
      return;
    }
    if (!fine.matches || event.pointerType !== "mouse") return;
    const index = spotAt(event);
    if (index === hovered) return;
    hovered = index;
    window.clearTimeout(dwell);
    if (index !== null) dwell = window.setTimeout(() => call(index), DWELL);
  };
  const onLeave = () => {
    window.clearTimeout(dwell);
    hovered = null;
  };
  root.addEventListener("pointermove", onPointer, { passive: true });
  root.addEventListener("pointerdown", onPointer, { passive: true });
  root.addEventListener("pointerleave", onLeave);

  /** A hop on the spot, for a poke — then he stays put for `talk` ms. */
  const poke = (talk = 0) => {
    quietUntil = performance.now() + talk;
    if (entered && !hop) go(at, { rise: clawd.offsetWidth * 0.3, duration: 360, why: "poke" });
  };

  /** The layout changed (a resize, a font arriving): measure everything
      again and put him back where he stands. */
  const resize = () => {
    if (stopped) return;
    generation += 1;
    const wasHopping = !!hop;
    place();
    if (wasHopping) idle();
  };
  /* a font arriving moves the text, not the 404: measured again, but he is
     only put back in place standing still — mid-hop that would be a jump
     cut, and the next hop starts from the new spot anyway */
  const onFonts = () => {
    if (stopped) return;
    inks.clear();
    generation += 1;
    if (entered && !hop) place();
  };
  document.fonts?.addEventListener("loadingdone", onFonts);

  /** Whether he is on the 404 itself (rather than the text or the button). */
  const onDigits = () => spots[at].group === "digits";

  /** Stops hopping where he is (the warp home). */
  const stop = () => {
    stopped = true;
    rideTween?.kill();
    window.clearTimeout(timer);
    window.clearTimeout(enterTimer);
    window.clearTimeout(dwell);
    if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(warmHandle);
    window.clearTimeout(warmHandle);
    weightTween?.kill();
  };

  const destroy = () => {
    stop();
    clear();
    gsap.ticker.remove(follow);
    clawd.style.removeProperty("translate");
    root.removeEventListener("pointermove", onPointer);
    root.removeEventListener("pointerdown", onPointer);
    root.removeEventListener("pointerleave", onLeave);
    document.fonts?.removeEventListener("loadingdone", onFonts);
    spots.forEach((spot) => spot.gives.forEach((el) => el.style.removeProperty("transform-origin")));
    clawd.classList.remove("is-on-button");
    clawd.style.removeProperty("opacity");
    gsap.set(tiltEl, { clearProps: "transform,transformOrigin" });
  };

  return { enter, call, poke, tilt, resize, onDigits, stop, destroy };
}
