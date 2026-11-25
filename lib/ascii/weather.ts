import { REST_PIXEL, WEATHER, type Season, type Settle } from "../seasons";
import type { World } from "../world/world";

/*
 * The season's weather over the page, as pixel art: snow, blossom, fireflies
 * or falling leaves on a transparent canvas above the content (it never
 * takes a click). Every particle is a tiny sprite drawn on whole pixels, so
 * it stays crisp; nearer ones are larger, fall faster and are brighter. A
 * change of season fades the old weather out and the new one in; with
 * reduced motion one still frame is drawn. On the home page some of it
 * comes to rest on the tops of the 3D name, in the same small pixels.
 */

/** sprites, # is a pixel */
const SPRITES: Record<Season, string[][]> = {
  winter: [["#"], ["##", "##"], ["#.#.#", ".###.", "#####", ".###.", "#.#.#"]],
  spring: [[".#", "##"], [".##", "##."]],
  summer: [["#"]],
  autumn: [
    [".##", "###", "#.."],
    ["##.", "###", "..#"],
  ],
};
/** how often each sprite is picked, per season (same order as SPRITES) */
const PICK: Record<Season, number[]> = { winter: [0.55, 0.33, 0.12], spring: [0.6, 0.4], summer: [1], autumn: [1, 0] };
/** css px of screen per particle: snow is the densest, fireflies are few */
const AREA: Record<Season, number> = { winter: 11000, spring: 16000, summer: 28000, autumn: 18000 };
const FADE_IN = 0.9;
/** seconds for what rests on the name to build up */
const REST_BUILD = 3;
/** how many lumps a line of snow has along a screen's width */
const LUMPS = 0.045;
const FADE_OUT = 0.45;

type Flake = {
  x: number;
  y: number;
  /** 0 far .. 1 near */
  near: number;
  /** css px per sprite pixel */
  scale: number;
  sprite: number;
  vy: number;
  vx: number;
  sway: number;
  phase: number;
  spin: number;
  color: string;
  alpha: number;
};

export class WeatherLayer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private flakes: Flake[] = [];
  /** what is falling now, and what comes next once it has faded out */
  private kind: Season | null = null;
  private next: Season | null = null;
  private level = 0;
  /** the 3D name, to lay the season on its letters, and how much has settled */
  private world: World | null = null;
  private tops = new Float32Array(4096);
  private rest = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
  }

  /** the weather to show, or null for none */
  set(kind: Season | null) {
    this.next = kind;
    if (this.kind === null && kind) this.start(kind);
  }

  /** true while anything is still drawn */
  get active() {
    return this.kind !== null || this.level > 0;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    if (this.kind) this.seed(this.kind);
  }

  /** the world whose name the season settles on (only on the home page) */
  setWorld(world: World | null) {
    this.world = world;
  }

  private start(kind: Season) {
    this.kind = kind;
    this.rest = 0;
    this.seed(kind);
  }

  /**
   * What has settled on the name: on every column of a letter's top, a
   * shaded pixel on the edge and white ones above, lumpy, growing as it
   * falls; or, where it covers less, a single petal or leaf here and there.
   */
  private drawRest(settle: Settle, alpha: number) {
    const tops = this.world?.tops(this.tops);
    if (!tops || !tops.count) return;
    const { ctx } = this;
    const P = REST_PIXEL;
    const width = Math.max(P, Math.ceil(tops.step / P) * P);
    const holes = tops.holes;
    const rows = this.rest * 3;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < tops.count; i++) {
      const x = this.tops[i * 2];
      const y = this.tops[i * 2 + 1];
      if (holes.some((o) => Math.hypot(x - o.x, y - o.y) < o.r)) continue;
      const h = (((i + 1) * 2654435761) >>> 0) / 4294967296;
      const x0 = Math.round(x / P) * P;
      const y0 = Math.round(y / P) * P;
      if (settle.cover < 1) {
        if (h > settle.cover * this.rest) continue;
        ctx.fillStyle = h < settle.cover * 0.5 ? settle.color : settle.shade;
        ctx.fillRect(x0, y0 - P, P, P);
        continue;
      }
      // a line of snow: its depth swells and dips along the letter
      const lump = 0.6 + 0.4 * Math.sin(x * LUMPS + Math.sin(x * LUMPS * 2.7) * 1.3);
      const n = Math.max(1, Math.round(rows * lump));
      ctx.fillStyle = settle.shade;
      ctx.fillRect(x0, y0 - P, width, P);
      ctx.fillStyle = settle.color;
      ctx.fillRect(x0, y0 - P * (n + 1), width, P * n);
    }
  }

  private seed(kind: Season) {
    const n = Math.round((this.w * this.h) / AREA[kind]);
    // far ones first, so the near ones pass in front of them
    this.flakes = Array.from({ length: n }, () => this.spawn(kind, true)).sort((a, b) => a.near - b.near);
  }

  private spawn(kind: Season, anywhere: boolean, keep?: Flake): Flake {
    const { colors } = WEATHER[kind];
    const near = keep?.near ?? Math.pow(Math.random(), 1.6);
    let sprite = 0;
    for (let r = Math.random(), i = 0; i < PICK[kind].length; i++) {
      r -= PICK[kind][i];
      if (r <= 0) {
        sprite = i;
        break;
      }
    }
    const f: Flake = {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : -12,
      near,
      scale: near > 0.55 ? 2 : 1,
      sprite: keep?.sprite ?? sprite,
      vy: 0,
      vx: 0,
      sway: 0,
      phase: Math.random() * Math.PI * 2,
      spin: 0.5 + Math.random(),
      color: colors[(Math.random() * colors.length) | 0],
      alpha: 0.4 + near * 0.5,
    };
    // a single pixel is too small far away
    if (kind === "winter" && f.sprite === 0) f.scale = 2;
    if (kind === "winter") {
      f.vy = 14 + near * 40;
      f.sway = 3 + near * 10;
    } else if (kind === "spring") {
      f.vy = 10 + near * 22;
      f.vx = 8 + near * 16;
      f.sway = 8 + near * 14;
    } else if (kind === "autumn") {
      f.vy = 20 + near * 38;
      f.vx = -5 + Math.random() * 10;
      f.sway = 12 + near * 18;
    } else {
      // fireflies hover in the lower part of the screen and wander
      f.scale = 2;
      f.y = this.h * (0.3 + Math.random() * 0.7);
      f.vx = (Math.random() - 0.5) * 14;
      f.vy = (Math.random() - 0.5) * 8;
      f.sway = 6 + near * 10;
    }
    return f;
  }

  /** one frame; dt in seconds. Returns false once nothing is left to draw */
  frame(dt: number, still = false) {
    const { ctx, w, h, dpr } = this;
    // fade towards the wanted weather, swapping once the old one is gone
    if (this.next !== this.kind) {
      this.level = Math.max(0, this.level - dt / FADE_OUT);
      if (this.level === 0) {
        this.kind = null;
        if (this.next) this.start(this.next);
      }
    } else if (this.kind) this.level = Math.min(1, this.level + dt / FADE_IN);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const kind = this.kind;
    if (!kind || this.level <= 0) return this.active;
    if (still) this.level = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sprites = SPRITES[kind];
    for (const f of this.flakes) {
      if (!still) {
        f.phase += dt * f.spin;
        if (kind === "summer") {
          // a slow random walk, kept on screen
          f.vx = Math.max(-18, Math.min(18, f.vx + (Math.random() - 0.5) * 20 * dt));
          f.vy = Math.max(-12, Math.min(12, f.vy + (Math.random() - 0.5) * 20 * dt));
          f.x = (f.x + f.vx * dt + w) % w;
          f.y = Math.max(h * 0.2, Math.min(h - 4, f.y + f.vy * dt));
        } else {
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          if (f.y > h + 12 || f.x < -40 || f.x > w + 40) Object.assign(f, this.spawn(kind, false, f));
        }
      }
      let a = f.alpha * this.level;
      if (kind === "summer") a *= 0.2 + 0.8 * Math.max(0, Math.sin(f.phase * 2.2));
      if (a < 0.02) continue;
      // a leaf tumbles: it flips between its two sprites as it falls
      const sprite = kind === "autumn" ? sprites[Math.floor(f.phase * 1.4) & 1] : sprites[f.sprite];
      const s = f.scale;
      // whole pixels only, so the sprite stays sharp
      const x0 = Math.round(f.x + Math.sin(f.phase) * f.sway);
      const y0 = Math.round(f.y);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.shadowBlur = kind === "summer" ? 10 : 0;
      ctx.shadowColor = f.color;
      for (let r = 0; r < sprite.length; r++) {
        const row = sprite[r];
        for (let c = 0; c < row.length; c++) if (row[c] === "#") ctx.fillRect(x0 + c * s, y0 + r * s, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    const settle = WEATHER[kind].settle;
    if (settle) {
      this.rest = still ? 1 : Math.min(1, this.rest + dt / REST_BUILD);
      this.drawRest(settle, this.level);
      ctx.globalAlpha = 1;
    }
    return true;
  }
}
