import type { Season } from "../seasons";

/*
 * A small landscape per season as pixel art, drawn in code, cosy and full
 * of little things: a dithered sky with clouds, the sun, a ridge of far
 * trees, a winding path, a wooden fence, two trees framing the view, and
 * the season's own details (snow on everything, tulips, tall grass,
 * pumpkins). The still part is painted once; each frame copies it and draws
 * what falls on top. The canvas holds the real pixels (W x H) and is scaled
 * up by CSS with `image-rendering: pixelated`.
 */

export const W = 120;
export const H = 80;
const HORIZON = 54;

type Look = {
  /** sky colours from the top down to the horizon, dithered between */
  sky: string[];
  sun: { x: number; y: number; r: number; colors: string[]; stripes?: boolean };
  /** cloud colour and its shaded underside, or none */
  cloud: [string, string] | null;
  /** the far ridge and the trees standing on it */
  ridge: { hill: string; trees: string; pines: boolean };
  ground: { base: string; shade: string };
  path: [string, string];
  trunk: string;
  /** crown: light, mid, dark; null for bare branches */
  crown: [string, string, string] | null;
  /** snow lying on everything */
  snow?: string;
  fall: { colors: string[]; count: number; kind: "snow" | "petal" | "firefly" | "leaf" };
};

const WOOD: [string, string] = ["#9a6a3c", "#6b4424"];

const LOOKS: Record<Season, Look> = {
  winter: {
    sky: ["#2b1f4f", "#4a2d6b", "#7a3f82", "#b84f7f", "#e8706b", "#f59a5a", "#f7b86a"],
    sun: { x: 62, y: 30, r: 13, colors: ["#ffd27a", "#ffa04f", "#ff7a5a"] },
    cloud: ["#c98ab0", "#9a6a9a"],
    ridge: { hill: "#7c6a9c", trees: "#4a3f6e", pines: true },
    ground: { base: "#eef3fc", shade: "#b5c7e6" },
    path: ["#c9d6ee", "#a9bde0"],
    trunk: "#1a1530",
    crown: null,
    snow: "#ffffff",
    fall: { colors: ["#ffffff", "#e6eefc"], count: 34, kind: "snow" },
  },
  spring: {
    sky: ["#4f9bd8", "#6fb4e6", "#95cbef", "#bfe1f5", "#e9f2f4"],
    sun: { x: 92, y: 16, r: 8, colors: ["#fffbe6", "#fff0a8"] },
    cloud: ["#ffffff", "#cfe4f2"],
    ridge: { hill: "#8cc985", trees: "#5fa65a", pines: false },
    ground: { base: "#6dbb5a", shade: "#56a24a" },
    path: ["#d8b47a", "#b8915c"],
    trunk: "#5b3a2a",
    crown: ["#fde2ea", "#f7b6c8", "#e88aab"],
    fall: { colors: ["#f7b6c8", "#fde2ea"], count: 18, kind: "petal" },
  },
  summer: {
    sky: ["#1a2350", "#3a2d6e", "#7a3a7e", "#d2506a", "#ff8a4d", "#ffc35a"],
    sun: { x: 60, y: 46, r: 16, colors: ["#fff0a0", "#ffc94d", "#ff8a3d"], stripes: true },
    cloud: ["#ff9f8a", "#d86f7a"],
    ridge: { hill: "#2a1f45", trees: "#1c1533", pines: false },
    ground: { base: "#2b5a36", shade: "#1f4529" },
    path: ["#7a5a3a", "#5e4430"],
    trunk: "#151a1e",
    crown: ["#3c7a45", "#2a5a33", "#1a3a22"],
    fall: { colors: ["#e8ff8a", "#ffe066"], count: 14, kind: "firefly" },
  },
  autumn: {
    sky: ["#3d4f7a", "#6c6a8c", "#b9837e", "#e8a56a", "#f6c98a"],
    sun: { x: 38, y: 26, r: 10, colors: ["#ffe2a0", "#ffb35a"] },
    cloud: ["#ffe2c4", "#e0ab88"],
    ridge: { hill: "#9a6a5a", trees: "#7a4a3a", pines: false },
    ground: { base: "#9a6a34", shade: "#7c522a" },
    path: ["#c9955a", "#a8784a"],
    trunk: "#3a2618",
    crown: ["#f0b23a", "#e8742a", "#c2502c"],
    fall: { colors: ["#e8742a", "#c2502c", "#f0b23a"], count: 18, kind: "leaf" },
  },
};

/** ordered dithering, 4 x 4 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** #rrggbb as a pixel of ImageData's Uint32 view (little endian: ABGR) */
function px(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Mote = { x: number; y: number; phase: number; color: number; big: boolean };

export class Landscape {
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private out: Uint32Array;
  private still = new Uint32Array(W * H);
  private look: Look;
  private motes: Mote[];

  constructor(canvas: HTMLCanvasElement, season: Season) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.image = ctx.createImageData(W, H);
    this.out = new Uint32Array(this.image.data.buffer);
    this.look = LOOKS[season];
    const r = rng(season.length * 977 + 13);
    this.paint(season, r);
    const colors = this.look.fall.colors.map(px);
    this.motes = Array.from({ length: this.look.fall.count }, () => ({
      x: r() * W,
      y: this.look.fall.kind === "firefly" ? HORIZON - 10 + r() * 22 : r() * H,
      phase: r() * Math.PI * 2,
      color: colors[(r() * colors.length) | 0],
      big: r() < 0.3,
    }));
  }

  /** the part that does not move */
  private paint(season: Season, r: () => number) {
    const L = this.look;
    const b = this.still;
    const set = (x: number, y: number, c: number) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x >= 0 && y >= 0 && x < W && y < H) b[y * W + x] = c;
    };
    const get = (x: number, y: number) => b[Math.round(y) * W + Math.round(x)];
    const disc = (cx: number, cy: number, rad: number, color: (x: number, y: number) => number) => {
      for (let y = -rad; y <= rad; y++) {
        for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad + rad * 0.6) set(cx + x, cy + y, color(x, y));
      }
    };
    const snow = L.snow ? px(L.snow) : 0;

    // the sky, dithered from band to band
    const sky = L.sky.map(px);
    for (let y = 0; y < HORIZON; y++) {
      const t = (y / (HORIZON - 1)) * (sky.length - 1);
      const i = Math.min(sky.length - 2, Math.floor(t));
      for (let x = 0; x < W; x++) set(x, y, t - i > dither(x, y) ? sky[i + 1] : sky[i]);
    }

    // the sun, lighter at the top; a summer sun is cut by bands of sky
    const s = L.sun;
    const sun = s.colors.map(px);
    for (let y = s.y - s.r; y <= s.y + s.r; y++) {
      for (let x = s.x - s.r; x <= s.x + s.r; x++) {
        const dx = x - s.x;
        const dy = y - s.y;
        if (dx * dx + dy * dy > s.r * s.r || y >= HORIZON) continue;
        if (s.stripes && dy > 2 && dy % 4 === 1) continue;
        const t = ((dy + s.r) / (2 * s.r)) * (sun.length - 1);
        const i = Math.min(sun.length - 2, Math.floor(t));
        set(x, y, t - i > dither(x, y) ? sun[i + 1] : sun[i]);
      }
    }

    // clouds: a few puffs on a flat underside, shaded below
    if (L.cloud) {
      const [light, dark] = L.cloud.map(px);
      for (const [cx, cy, w] of [
        [24, 12, 16],
        [84, 8, 12],
        [104, 22, 9],
      ]) {
        const puffs = Math.max(2, Math.round(w / 5));
        for (let k = 0; k < puffs; k++) {
          const rad = 2 + ((k * 7 + w) % 3);
          disc(cx - w / 2 + (k + 0.5) * (w / puffs), cy - rad * 0.4, rad, (_x, y) => (y > rad * 0.3 ? dark : light));
        }
        for (let x = Math.round(cx - w / 2); x < cx + w / 2; x++) {
          set(x, cy + 1, dark);
          set(x, cy, light);
        }
      }
    }

    // the far ridge, with its trees standing against the sky
    const hill = px(L.ridge.hill);
    const far = px(L.ridge.trees);
    const ridge = (x: number) => HORIZON - 4 - Math.round(2 + 2 * Math.sin(x * 0.09 + season.length) + 1.2 * Math.sin(x * 0.23));
    for (let x = 0; x < W; x++) for (let y = ridge(x); y < HORIZON; y++) set(x, y, hill);
    for (let x = 3; x < W; x += 5 + Math.floor(r() * 4)) {
      const base = ridge(x) + 1;
      const h = 4 + Math.floor(r() * 4);
      if (L.ridge.pines) {
        // a pine: a stack of widening rows, snow on its tiers
        for (let k = 0; k < h; k++) {
          const half = Math.floor(k / 2);
          for (let dx = -half; dx <= half; dx++) set(x + dx, base - h + k, k % 3 === 0 && snow ? snow : far);
        }
      } else disc(x, base - h / 2, Math.ceil(h / 2), () => far);
    }

    // the ground
    const ground = px(L.ground.base);
    const gshade = px(L.ground.shade);
    for (let y = HORIZON; y < H; y++) {
      for (let x = 0; x < W; x++) set(x, y, ((y - HORIZON) / (H - HORIZON)) * 0.45 > dither(x, y) + 0.4 ? gshade : ground);
    }

    // a path winding from the front to the horizon
    const [path, pathShade] = L.path.map(px);
    for (let y = HORIZON; y < H; y++) {
      const t = (y - HORIZON) / (H - HORIZON);
      const mid = W * 0.5 + Math.sin(t * 3.2 + 0.6) * 10 * (1 - t * 0.4);
      const half = 1 + t * 9;
      for (let x = Math.round(mid - half); x <= mid + half; x++) set(x, y, Math.abs(x - mid) > half - 1.2 ? pathShade : path);
      // footprints in the snow, two by two
      if (snow && y % 4 === 0 && y > HORIZON + 3) set(mid + (y % 8 === 0 ? -1 : 1) * half * 0.35, y, pathShade);
    }

    // the season's details on the ground
    if (season === "winter") {
      for (let k = 0; k < 12; k++) {
        const y = HORIZON + 3 + Math.floor(r() * (H - HORIZON - 4));
        const x0 = Math.floor(r() * W);
        for (let x = x0; x < x0 + 4 + r() * 10; x++) if (get(x, y) === ground) set(x, y, gshade);
      }
    } else if (season === "spring") {
      // tulips: a petal on a stem, here and there
      const tulip = ["#f48fb1", "#fff3b0", "#ffffff", "#e85a6a"].map(px);
      const stem = px("#3f8a3a");
      for (let k = 0; k < 26; k++) {
        const x = r() * W;
        const y = HORIZON + 4 + r() * (H - HORIZON - 5);
        if (get(x, y) !== ground && get(x, y) !== gshade) continue;
        set(x, y, stem);
        set(x, y - 1, tulip[(r() * tulip.length) | 0]);
      }
    } else if (season === "summer") {
      // tall grass along the horizon and in the meadow
      const blade = px("#4f8a4a");
      for (let k = 0; k < 60; k++) {
        const x = r() * W;
        const y = HORIZON + 1 + r() * (H - HORIZON - 2);
        if (get(x, y) !== ground && get(x, y) !== gshade) continue;
        set(x, y, blade);
        set(x + (k % 2 ? 1 : -1), y - 1, blade);
      }
    } else {
      // pumpkins by the fence, leaves on the ground
      const leaves = ["#e8742a", "#c2502c", "#f0b23a"].map(px);
      for (let k = 0; k < 50; k++) {
        const x = r() * W;
        const y = HORIZON + 2 + r() * (H - HORIZON - 3);
        if (get(x, y) === ground || get(x, y) === gshade) set(x, y, leaves[(r() * leaves.length) | 0]);
      }
      const pumpkin = px("#e8742a");
      const rind = px("#b8501c");
      const stalk = px("#4f6a2a");
      for (const [x, y] of [
        [28, HORIZON + 10],
        [33, HORIZON + 11],
        [92, HORIZON + 12],
      ]) {
        for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) set(x + dx, y + dy, Math.abs(dx) === 2 || dy === 1 ? rind : pumpkin);
        set(x, y - 2, stalk);
      }
    }

    // a wooden fence across the meadow, snowed on in winter
    const [wood, woodShade] = WOOD.map(px);
    const fy = HORIZON + 6;
    for (let x = 0; x < W; x++) {
      const t = (x - W / 2) / (W / 2);
      if (Math.abs(t) < 0.22) continue;
      const y = fy + Math.round(t * t * 2);
      set(x, y, wood);
      set(x, y + 3, woodShade);
      if (snow) set(x, y - 1, snow);
      if (x % 7 === 0) {
        for (let k = -2; k <= 5; k++) set(x, y + k, k > 3 ? woodShade : wood);
        if (snow) set(x, y - 3, snow);
      }
    }

    // two trees framing the view
    this.tree(set, get, 5, -1, r);
    this.tree(set, get, W - 6, 1, r);
  }

  private tree(
    set: (x: number, y: number, c: number) => void,
    get: (x: number, y: number) => number,
    x0: number,
    side: number,
    r: () => number,
  ) {
    const L = this.look;
    const bark = px(L.trunk);
    const wood: [number, number][] = [];
    const stroke = (ax: number, ay: number, bx: number, by: number, width: number) => {
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2 + 1;
      for (let i = 0; i <= n; i++) {
        const x = Math.round(ax + ((bx - ax) * i) / n);
        const y = Math.round(ay + ((by - ay) * i) / n);
        for (let w = 0; w < width; w++) {
          set(x + w * -side, y, bark);
          wood.push([x + w * -side, y]);
        }
      }
    };
    const tips: [number, number][] = [];
    const branch = (x: number, y: number, angle: number, len: number, width: number, depth: number) => {
      const bx = x + Math.cos(angle) * len;
      const by = y - Math.sin(angle) * len;
      stroke(x, y, bx, by, width);
      if (depth === 0 || len < 3) {
        tips.push([bx, by]);
        return;
      }
      const spread = 0.5 + r() * 0.3;
      branch(bx, by, angle + spread, len * (0.62 + r() * 0.15), Math.max(1, width - 1), depth - 1);
      branch(bx, by, angle - spread * 0.8, len * (0.58 + r() * 0.15), Math.max(1, width - 1), depth - 1);
    };
    // the trunk rises along the edge, short boughs reach in, high up
    const inward = side < 0 ? 0 : Math.PI;
    stroke(x0, H, x0 - side * 2, 5, 4);
    for (const [y, len] of [
      [11, 14],
      [22, 11],
      [33, 8],
    ] as [number, number][]) {
      branch(x0 - side * 2, y, inward + (side < 0 ? 0.62 : -0.62) + (r() - 0.5) * 0.2, len, 2, 2);
    }
    branch(x0 - side * 2, 6, Math.PI / 2 - side * 0.35, 8, 2, 2);

    if (L.crown) {
      // round clusters at every tip: an outline, light on the upper left,
      // shade on the lower right
      const [light, mid, dark] = L.crown.map(px);
      const clusters = tips.map(([tx, ty]) => [tx, ty, 3 + Math.floor(r() * 2)] as const);
      for (const [tx, ty, rad] of clusters) {
        for (let y = -rad - 1; y <= rad + 1; y++) {
          for (let x = -rad - 1; x <= rad + 1; x++) {
            const d = x * x + y * y;
            if (d > (rad + 1) * (rad + 1)) continue;
            if (d > rad * rad + rad * 0.6) set(tx + x, ty + y, dark);
          }
        }
      }
      for (const [tx, ty, rad] of clusters) {
        for (let y = -rad; y <= rad; y++) {
          for (let x = -rad; x <= rad; x++) {
            if (x * x + y * y > rad * rad + rad * 0.6) continue;
            const lit = x + y < -rad * 0.5;
            const shaded = x + y > rad * 0.6;
            set(tx + x, ty + y, lit ? light : shaded ? dark : mid);
          }
        }
      }
    } else if (L.snow) {
      // snow lies on top of every branch
      const snow = px(L.snow);
      const isWood = new Set(wood.map(([x, y]) => y * W + x));
      for (const [x, y] of wood) {
        if (y > 0 && !isWood.has((y - 1) * W + x) && get(x, y - 1) !== snow && r() < 0.85) set(x, y - 1, snow);
      }
    }
  }

  /** one frame: the still part, then what falls; dt in seconds */
  frame(dt: number) {
    const o = this.out;
    o.set(this.still);
    const kind = this.look.fall.kind;
    const put = (x: number, y: number, c: number) => {
      if (x >= 0 && y >= 0 && x < W && y < H) o[y * W + x] = c;
    };
    for (const m of this.motes) {
      m.phase += dt;
      if (kind === "firefly") {
        m.x = (m.x + Math.sin(m.phase * 0.7) * dt * 3 + W) % W;
        m.y += Math.cos(m.phase * 0.5) * dt * 2;
        // it blinks
        if (Math.sin(m.phase * 2.3) < 0.1) continue;
      } else {
        const speed = kind === "snow" ? 8 : kind === "petal" ? 5 : 10;
        m.y += dt * speed * (m.big ? 1.4 : 1);
        m.x += dt * (kind === "petal" ? 5 : 0) + Math.sin(m.phase * 1.3) * dt * (kind === "leaf" ? 7 : 3);
        if (m.y > H) {
          m.y = -2;
          m.x = Math.random() * W;
        }
        if (m.x > W) m.x -= W;
      }
      const x = Math.round(m.x);
      const y = Math.round(m.y);
      const c = m.color;
      put(x, y, c);
      if (kind === "leaf") {
        // a leaf of three pixels that turns as it falls
        put(x + 1, y, c);
        put(x + (Math.floor(m.phase * 2) & 1), y + 1, c);
      } else if (m.big || kind === "firefly") {
        // a bigger flake, a petal or a glowing firefly: a small cross
        put(x - 1, y, c);
        put(x + 1, y, c);
        if (kind !== "firefly") {
          put(x, y - 1, c);
          put(x, y + 1, c);
        }
      }
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}
