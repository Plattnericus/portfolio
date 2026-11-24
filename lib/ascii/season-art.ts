import type { Season } from "../seasons";

/*
 * Four seasonal scenes, drawn procedurally into a character grid. Every
 * piece of art here is made in code for this site.
 */

type RGB = [number, number, number];

export type Grid = {
  cols: number;
  rows: number;
  chars: Uint16Array;
  rgba: Uint8ClampedArray;
};

const hex = (h: string): RGB => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

function put(g: Grid, c: number, r: number, ch: string, col: RGB, a = 1) {
  c = Math.round(c);
  r = Math.round(r);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return;
  const i = r * g.cols + c;
  g.chars[i] = ch.charCodeAt(0);
  const o = i * 4;
  g.rgba[o] = col[0];
  g.rgba[o + 1] = col[1];
  g.rgba[o + 2] = col[2];
  g.rgba[o + 3] = Math.max(0, Math.min(255, a * 255));
}

function text(g: Grid, c: number, r: number, s: string, col: RGB, a = 1) {
  for (let k = 0; k < s.length; k++) if (s[k] !== " ") put(g, c + k, r, s[k], col, a);
}

/** small deterministic random so every visit draws the same tree */
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

type Particle = { x: number; y: number; vx: number; vy: number; seed: number };

export interface Scene {
  resize(cols: number, rows: number): void;
  draw(g: Grid, t: number, dt: number): void;
}

// ---------------------------------------------------------------- winter

const WHITE = hex("#efeae2");
const SNOW = hex("#cfd8e3");
const NEEDLE = [hex("#1f5f3a"), hex("#2f7a4a"), hex("#3f9a5c"), hex("#5cb878")];
const GOLD = hex("#ffd36b");
const ORNAMENTS = [hex("#e23d3d"), hex("#ffd36b"), hex("#4f8fe8"), hex("#efeae2"), hex("#ff7a3d")];
const BARK = hex("#7a4a2a");

class Winter implements Scene {
  private cols = 0;
  private rows = 0;
  private flakes: Particle[] = [];

  resize(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    const r = rng(7);
    this.flakes = Array.from({ length: Math.round(cols * rows * 0.012) }, () => ({
      x: r() * cols,
      y: r() * rows,
      vx: 0,
      vy: 2 + r() * 4,
      seed: r(),
    }));
  }

  draw(g: Grid, t: number, dt: number) {
    const { cols, rows } = this;
    const cx = Math.floor(cols / 2);
    const top = Math.round(rows * 0.14);
    const height = Math.round(rows * 0.6);
    const tiers = 4;
    const tierH = height / tiers;
    // the tree, tier by tier, each a little wider than the last
    for (let y = 0; y < height; y++) {
      const tier = Math.floor(y / tierH);
      const inTier = y - tier * tierH;
      const half = Math.round((1 + inTier * 1.15 + tier * 2.6) * 1.9);
      const row = top + y;
      for (let x = -half; x <= half; x++) {
        const c = cx + x;
        let ch = (x + y) % 2 === 0 ? "^" : "*";
        let col = NEEDLE[(Math.abs(x * 3 + y * 7) + tier) % NEEDLE.length];
        if (x === -half) ch = "/";
        else if (x === half) ch = "\\";
        // garlands wind round the tree
        const garland = (x + y * 2.2 + Math.round(t * 4)) % 11;
        if (Math.abs(garland) < 0.8 && Math.abs(x) < half) {
          ch = "~";
          col = GOLD;
        }
        put(g, c, row, ch, col, 1);
      }
      // ornaments that twinkle
      const r = rng(1000 + y);
      if (y > 1 && y % 2 === 0) {
        const n = Math.max(1, Math.floor(half / 4));
        for (let k = 0; k < n; k++) {
          const x = Math.round((r() * 2 - 1) * (half - 1));
          const blink = Math.sin(t * (2 + r() * 3) + k * 1.7) > -0.2;
          put(g, cx + x, row, r() > 0.5 ? "o" : "@", ORNAMENTS[Math.floor(r() * ORNAMENTS.length)], blink ? 1 : 0.35);
        }
      }
    }
    // star with rays
    const pulse = 0.65 + 0.35 * Math.sin(t * 3);
    put(g, cx, top - 1, "*", GOLD, 1);
    put(g, cx - 1, top - 1, "-", GOLD, pulse);
    put(g, cx + 1, top - 1, "-", GOLD, pulse);
    put(g, cx, top - 2, "|", GOLD, pulse);
    put(g, cx - 1, top - 2, "\\", GOLD, pulse * 0.8);
    put(g, cx + 1, top - 2, "/", GOLD, pulse * 0.8);
    // trunk
    const trunkTop = top + height;
    for (let y = 0; y < 3; y++) text(g, cx - 2, trunkTop + y, "|##|", BARK);
    // ground snow
    const ground = trunkTop + 3;
    for (let y = ground; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const k = Math.sin(x * 0.21 + y) + Math.sin(x * 0.07);
        if (y === ground && k < 0.4) continue;
        put(g, x, y, k > 1 ? "_" : ".", SNOW, 0.55);
      }
    }
    // falling snow
    for (const f of this.flakes) {
      f.y += f.vy * dt;
      f.x += Math.sin(t * 0.8 + f.seed * 20) * dt * 2;
      if (f.y > rows) {
        f.y = -1;
        f.x = Math.random() * cols;
      }
      put(g, f.x, f.y, f.seed > 0.7 ? "*" : f.seed > 0.35 ? "+" : ".", WHITE, 0.5 + f.seed * 0.5);
    }
  }
}

// ---------------------------------------------------------------- trees

type Twig = { x: number; y: number; ch: string };
type Bloom = { x: number; y: number; seed: number };

/** a branching tree grown from the bottom centre */
function growTree(cols: number, rows: number, seed: number) {
  const twigs: Twig[] = [];
  const blooms: Bloom[] = [];
  const r = rng(seed);
  const aspect = 2; // cells are about twice as tall as wide
  const glyph = (a: number) => {
    const d = ((a * 180) / Math.PI + 360) % 180;
    if (d < 22 || d >= 158) return "_";
    if (d < 68) return "/";
    if (d < 112) return "|";
    return "\\";
  };
  const branch = (x: number, y: number, a: number, len: number, depth: number) => {
    const steps = Math.max(2, Math.round(len));
    for (let k = 0; k < steps; k++) {
      x += Math.cos(a) * 1;
      y -= (Math.sin(a) * 1) / aspect;
      twigs.push({ x, y, ch: glyph(a) });
      if (depth >= 4) {
        twigs.push({ x: x - 1, y, ch: glyph(a) });
        twigs.push({ x: x + 1, y, ch: glyph(a) });
      }
    }
    if (depth <= 0 || len < 2) {
      // a round cluster of blossom or leaves at every tip
      for (let k = 0; k < 26; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r());
        blooms.push({ x: x + Math.cos(a) * d * 6, y: y + Math.sin(a) * d * 2.8, seed: r() });
      }
      return;
    }
    const spread = 0.45 + r() * 0.35;
    branch(x, y, a + spread, len * (0.68 + r() * 0.12), depth - 1);
    branch(x, y, a - spread, len * (0.68 + r() * 0.12), depth - 1);
    if (r() > 0.6) branch(x, y, a + (r() - 0.5) * 0.3, len * 0.55, depth - 2);
  };
  const baseY = rows * 0.86;
  const trunk = rows * 0.22 * aspect;
  branch(cols / 2, baseY, Math.PI / 2, trunk, 5);
  return { twigs, blooms, baseY };
}

// ---------------------------------------------------------------- spring

const PINKS = [hex("#fde2ea"), hex("#f7b6c8"), hex("#e98aa8"), hex("#d0668a")];
const STEM = hex("#6b4a3a");
const GRASS = [hex("#4f8a3a"), hex("#6fae4f"), hex("#8fcf6a")];

class Spring implements Scene {
  private tree = growTree(1, 1, 3);
  private petals: Particle[] = [];
  private cols = 0;
  private rows = 0;

  resize(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.tree = growTree(cols, rows, 3);
    const r = rng(11);
    this.petals = Array.from({ length: Math.round(cols * 0.5) }, () => ({
      x: r() * cols,
      y: r() * rows,
      vx: 1 + r() * 2,
      vy: 1.2 + r() * 1.8,
      seed: r(),
    }));
  }

  draw(g: Grid, t: number, dt: number) {
    const { cols, rows, tree } = this;
    for (const w of tree.twigs) put(g, w.x, w.y, w.ch, STEM);
    for (const b of tree.blooms) {
      const k = Math.sin(t * 1.5 + b.seed * 30);
      put(g, b.x, b.y, b.seed > 0.66 ? "@" : b.seed > 0.33 ? "*" : "o", PINKS[Math.floor(b.seed * PINKS.length)], 0.75 + 0.25 * k);
    }
    // grass waving along the ground
    const ground = Math.round(tree.baseY) + 1;
    for (let y = ground; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const sway = Math.sin(x * 0.4 + t * 2 + y) > 0;
        const k = (x * 7 + y * 13) % 5;
        if (k === 0) continue;
        put(g, x, y, y === ground ? (sway ? "/" : "\\") : k === 1 ? "," : "'", GRASS[(x + y) % GRASS.length], 0.8);
      }
    }
    for (const p of this.petals) {
      p.x += (p.vx + Math.sin(t + p.seed * 9) * 1.5) * dt;
      p.y += p.vy * dt;
      if (p.y > rows || p.x > cols) {
        p.y = Math.random() * rows * 0.5;
        p.x = -1;
      }
      put(g, p.x, p.y, p.seed > 0.5 ? "*" : ".", PINKS[1 + Math.floor(p.seed * 3)], 0.85);
    }
  }
}

// ---------------------------------------------------------------- summer

const SKY = [hex("#1b1440"), hex("#3a1f5c"), hex("#7a2f6a"), hex("#c8475a"), hex("#ff7a3d")];
const SUN = [hex("#ffe08a"), hex("#ffc04a"), hex("#ff9a3d"), hex("#ff6a3d")];
const SEA = [hex("#2a5a8a"), hex("#1f4570"), hex("#163256"), hex("#0f223d")];

class Summer implements Scene {
  private cols = 0;
  private rows = 0;

  resize(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
  }

  draw(g: Grid, t: number) {
    const { cols, rows } = this;
    const horizon = Math.round(rows * 0.6);
    const cx = cols / 2;
    // sky gradient, sparse up top, denser towards the horizon
    for (let y = 0; y < horizon; y++) {
      const k = y / horizon;
      const col = SKY[Math.min(SKY.length - 1, Math.floor(k * SKY.length))];
      for (let x = 0; x < cols; x++) {
        const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        if (Math.abs(n) < 0.35 + k * 0.4) put(g, x, y, k > 0.75 ? "-" : ".", col, 0.25 + k * 0.5);
      }
    }
    // the sun, cut by stripes near the horizon
    const R = rows * 0.24;
    const sy = horizon - R * 0.35;
    for (let y = Math.floor(sy - R); y < horizon; y++) {
      for (let x = Math.floor(cx - R * 2); x <= cx + R * 2; x++) {
        const dx = (x - cx) / 2;
        const dy = y - sy;
        if (dx * dx + dy * dy > R * R) continue;
        const k = (y - (sy - R)) / (R * 2);
        const stripe = k > 0.55 && Math.floor((y + t * 2) % 4) === 0;
        if (stripe) continue;
        put(g, x, y, k > 0.5 ? "#" : "@", SUN[Math.min(SUN.length - 1, Math.floor(k * SUN.length))]);
      }
    }
    // sea with moving swell and the sun's reflection
    for (let y = horizon; y < rows; y++) {
      const depth = (y - horizon) / (rows - horizon);
      const col = SEA[Math.min(SEA.length - 1, Math.floor(depth * SEA.length))];
      const reflect = R * 2 * (1 - depth * 0.6);
      for (let x = 0; x < cols; x++) {
        const w = Math.sin(x * 0.25 + t * 1.6 + y * 0.9) + Math.sin(x * 0.07 - t * 0.7);
        if (Math.abs(x - cx) < reflect * (0.5 + 0.5 * Math.sin(y * 1.7 + t * 3))) {
          if (w > -0.6) put(g, x, y, w > 0.6 ? "=" : "-", SUN[2 + (y % 2)], 0.85);
          continue;
        }
        if (w > 0.9) put(g, x, y, "~", col, 0.9);
        else if (w > 0.2) put(g, x, y, "-", col, 0.6);
      }
    }
  }
}

// ---------------------------------------------------------------- autumn

const LEAVES = [hex("#e8742a"), hex("#c94a2a"), hex("#f0b23a"), hex("#a83a22"), hex("#d98a3a")];
const BARK2 = hex("#5a3a28");

class Autumn implements Scene {
  private tree = growTree(1, 1, 5);
  private falling: Particle[] = [];
  private cols = 0;
  private rows = 0;

  resize(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.tree = growTree(cols, rows, 5);
    const r = rng(17);
    this.falling = Array.from({ length: Math.round(cols * 0.35) }, () => ({
      x: r() * cols,
      y: r() * rows,
      vx: 0,
      vy: 1.5 + r() * 2.5,
      seed: r(),
    }));
  }

  draw(g: Grid, t: number, dt: number) {
    const { cols, rows, tree } = this;
    for (const w of tree.twigs) put(g, w.x, w.y, w.ch, BARK2);
    for (const b of tree.blooms) {
      if (b.seed > 0.82) continue; // the tree is already thinning
      put(g, b.x, b.y, b.seed > 0.5 ? "&" : b.seed > 0.25 ? "%" : "*", LEAVES[Math.floor(b.seed * LEAVES.length)], 0.9);
    }
    // a pile on the ground
    const ground = Math.round(tree.baseY) + 1;
    for (let y = ground; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const k = (x * 31 + y * 17) % 7;
        if (k > 3) continue;
        put(g, x, y, k === 0 ? "%" : k === 1 ? "&" : ".", LEAVES[(x + y * 3) % LEAVES.length], 0.75);
      }
    }
    // leaves tumbling in the wind
    const wind = Math.sin(t * 0.4) * 3;
    const spin = ["/", "-", "\\", "|"];
    for (const p of this.falling) {
      p.x += (wind + Math.sin(t * 2 + p.seed * 12) * 2) * dt;
      p.y += p.vy * dt;
      if (p.y > rows) {
        p.y = -1;
        p.x = Math.random() * cols;
      }
      if (p.x < -2) p.x = cols;
      if (p.x > cols + 2) p.x = 0;
      const ch = spin[Math.floor(t * (3 + p.seed * 4) + p.seed * 10) % 4];
      put(g, p.x, p.y, ch, LEAVES[Math.floor(p.seed * LEAVES.length)]);
    }
  }
}

export function createScene(season: Season): Scene {
  if (season === "winter") return new Winter();
  if (season === "spring") return new Spring();
  if (season === "summer") return new Summer();
  return new Autumn();
}
