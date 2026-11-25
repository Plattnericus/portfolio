import { GlyphCanvas } from "./glyph-canvas";
import { NOISE } from "./glyphs";
import { Shape } from "./shape";
import { isCoarse, onFrame, prefersReducedMotion } from "../loop";
import { C } from "../palette";
import { REST_PIXEL, WEATHER, type Settle } from "../seasons";
import { store } from "../store";

/*
 * Headlines as ASCII art. The text is set in the display face, wrapped to
 * the box, rasterised and printed as characters: outlines become - / | \ _,
 * the body is always a dense character (* # % @), so every stroke reads as
 * solid, and is lit from the top left through a bevel in its colour. New text sweeps in
 * from the left, decoding out of noise; changes in quick succession (fast
 * scrolling) are drawn at once so nothing is ever left half-way.
 * With a mouse, a magnifier follows the cursor over the letters: the cells
 * under it are drawn from closer to its middle, so the type grows there.
 */

export type TitleOptions = {
  fontFamily: string;
  displayFamily: string;
  /** light to dark is fine; index 0 darkest */
  palette?: string[];
  weight?: number;
  align?: "left" | "right" | "center";
  /** colour behind every lit cell, so nothing shows through the letters */
  knockout?: string;
  /** largest character cell font size, css px */
  maxCell?: number;
  uppercase?: boolean;
  /** add a screen-reader copy of the text (off when the page already has it) */
  label?: boolean;
  /** how new text arrives; "vary" picks a different one on every change */
  reveal?: RevealMode | "vary";
  /** called every frame of a reveal with its progress, and with 1 at the end */
  onReveal?: (k: number) => void;
};

/**
 * sweep     decodes left to right
 * scan      a scan line runs down and leaves the type behind it
 * rain      columns drop into place
 * assemble  every cell flies in from somewhere else
 * dissolve  cells pop in at random, through noise
 * outline   the outline draws itself around, then the body fills
 * radial    grows out from the middle
 * print     a print head lays it down row by row from the bottom, over a
 *           dotted plan of the outline; fresh cells glow and cool down
 */
export type RevealMode = "sweep" | "scan" | "rain" | "assemble" | "dissolve" | "outline" | "radial" | "print";

const MODES: RevealMode[] = ["sweep", "scan", "rain", "assemble", "dissolve", "outline", "radial"];

const DURATION: Record<RevealMode, number> = {
  sweep: 750,
  scan: 950,
  rain: 1150,
  assemble: 1400,
  dissolve: 850,
  outline: 1350,
  radial: 950,
  print: 950,
};

/** caps-only face: line box and where the caps sit in it, in font sizes */
const LINE = 0.92;
const CAP = 0.744;

const DEFAULT_PALETTE = ["#4a453f", "#7c766d", "#b3ada3", "#d9d3c9", "#efeae2", "#ffffff"];

/** where the top of a letter's glyph sits in its cell, as a share of the cell's height */
const SETTLE_TOP = 0.16;

/** character rows per line of type, and the smallest cell (font size, css px) for it */
const ROWS_PER_LINE = 14;
const MIN_CELL = 4;
/*
 * The inside of a letter, darkest to brightest. Only dense characters: the
 * light ones (. - = +) look like outlines and break a stroke into stripes.
 * BODY_FLOOR is how dark the bevel's shaded side gets.
 */
const BODY = "*#%@";
const BODY_FLOOR = 0.4;
const bodyLum = (diff: number) => BODY_FLOOR + diff * (1 - BODY_FLOOR) * 1.25;
const bodyCode = (lum: number) =>
  BODY.charCodeAt(Math.round(Math.min(1, Math.max(0, (lum - BODY_FLOOR) / (1 - BODY_FLOOR))) * (BODY.length - 1)));
const RAPID_MS = 320;

export class AsciiTitle {
  readonly host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private label: HTMLElement;
  private gc: GlyphCanvas;
  private shape = new Shape();
  private opts: Required<Omit<TitleOptions, "knockout" | "onReveal">> & Pick<TitleOptions, "knockout" | "onReveal">;
  /** false until the first set(); nothing is drawn before that */
  shown = false;
  private text = "";
  private reveal = 1;
  private seeds = new Float32Array(0);
  private seeds2 = new Float32Array(0);
  /** the reveal running now (resolved from "vary") */
  private mode: RevealMode = "sweep";
  /** a point light in canvas css px (e.g. under the cursor); null = fixed light */
  private point: { x: number; y: number } | null = null;
  /** 0 standing .. 1 collapsed into a heap at the bottom */
  private fall = 0;
  private drop = new Float32Array(0);
  private fallOff: (() => void) | null = null;
  /** centre of the lit cells, for radial and outline reveals */
  private cx = 0;
  private cy = 0;
  private maxD = 1;
  private off: (() => void) | null = null;
  private lastSet = 0;
  private ro: ResizeObserver;
  /** what the season has left lying on the letters, if anything */
  private settle: Settle | null = null;
  private offStore: () => void;
  private w = 0;
  private h = 0;
  /** which cells are lit, by index */
  private lit = new Uint8Array(0);
  /** the magnifier: target and eased position in canvas css px, strength */
  private lens = { tx: 0, ty: 0, x: 0, y: 0, k: 0, on: false, r: 90 };
  private lensOff: (() => void) | null = null;
  private onMove = (e: PointerEvent) => this.track(e);
  /** print reveal: when each lit cell is laid down, 0..1, and where the head is */
  private printAt = new Float32Array(0);
  private printPath = new Int32Array(0);

  constructor(host: HTMLElement, opts: TitleOptions) {
    this.host = host;
    // explicit undefineds from props must not wipe the defaults
    this.opts = {
      fontFamily: opts.fontFamily,
      displayFamily: opts.displayFamily,
      palette: opts.palette ?? DEFAULT_PALETTE,
      weight: opts.weight ?? 800,
      align: opts.align ?? "left",
      maxCell: opts.maxCell ?? 10,
      uppercase: opts.uppercase ?? true,
      label: opts.label ?? true,
      reveal: opts.reveal ?? "sweep",
      knockout: opts.knockout,
      onReveal: opts.onReveal,
    };
    // the canvas fills the host, which has to be its containing block
    host.classList.add("at");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "at-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.label = document.createElement("span");
    this.label.className = "sr-only";
    if (this.opts.label) host.append(this.label);
    host.append(this.canvas);
    this.gc = new GlyphCanvas(this.canvas, {
      fontFamily: this.opts.fontFamily,
      fontSize: 8,
      lineHeight: 1.12,
      weight: 700,
      // one more colour on top of the palette: a warm one, for fresh cells
      palette: [...this.opts.palette, C.terra],
    });
    // what the season leaves on the letters, now and whenever it changes
    const weather = store.get().weather;
    this.settle = weather ? WEATHER[weather].settle : null;
    this.offStore = store.subscribe((s, prev) => {
      if (s.weather === prev.weather) return;
      this.settle = s.weather ? WEATHER[s.weather].settle : null;
      if (this.shown && !this.off) this.draw(0);
    });
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(host);
    if (!prefersReducedMotion() && !isCoarse()) {
      window.addEventListener("pointermove", this.onMove, { passive: true });
    }
  }

  /** the lens wakes when the cursor comes near and eases off after it leaves */
  private track(e: PointerEvent) {
    if (!this.shown || e.pointerType === "touch") return;
    const b = this.canvas.getBoundingClientRect();
    const m = this.lens.r * 0.5;
    const near = e.clientX > b.left - m && e.clientX < b.right + m && e.clientY > b.top - m && e.clientY < b.bottom + m;
    const L = this.lens;
    if (!near) {
      L.on = false;
      return;
    }
    // in grid coordinates, like the cells
    L.tx = e.clientX - b.left - this.gc.ox;
    L.ty = e.clientY - b.top - this.gc.oy;
    if (!L.on && L.k < 0.01) {
      L.x = L.tx;
      L.y = L.ty;
    }
    L.on = true;
    if (this.lensOff) return;
    this.lensOff = onFrame((t) => {
      L.k += ((L.on ? 1 : 0) - L.k) * 0.14;
      L.x += (L.tx - L.x) * 0.35;
      L.y += (L.ty - L.y) * 0.35;
      const done = !L.on && L.k < 0.004;
      if (done) L.k = 0;
      // a running reveal or fall draws on its own
      if (!this.off && !this.fallOff) this.draw(t);
      if (done) {
        this.lensOff?.();
        this.lensOff = null;
      }
    });
  }

  /** wraps words into the box at the largest size that fits; returns lines and size */
  private fit(text: string, w: number, h: number) {
    const ctx = this.gc.ctx;
    const fam = this.opts.displayFamily;
    const wt = this.opts.weight;
    // words break at spaces; an address may also break after its @
    const segs: { t: string; glue: string }[] = [];
    text
      .split(/\s+/)
      .filter(Boolean)
      .forEach((word, wi) => {
        word.split(/(?<=@)/).forEach((t, pi) => segs.push({ t, glue: pi > 0 ? "" : wi > 0 ? " " : "" }));
      });
    let lo = 8;
    let hi = Math.max(12, h);
    let best = { size: lo, lines: [text] };
    for (let k = 0; k < 18; k++) {
      const size = (lo + hi) / 2;
      ctx.font = `${wt} ${size}px ${fam}`;
      const lines: string[] = [];
      let line = "";
      let ok = true;
      for (const seg of segs) {
        const test = line ? `${line}${seg.glue}${seg.t}` : seg.t;
        if (ctx.measureText(test).width <= w) line = test;
        else {
          if (!line) {
            ok = false;
            break;
          }
          lines.push(line);
          line = seg.t;
          if (ctx.measureText(seg.t).width > w) {
            ok = false;
            break;
          }
        }
      }
      if (line) lines.push(line);
      const total = (lines.length - 1) * size * LINE + size * (CAP + 0.04);
      if (ok && total <= h) {
        best = { size, lines };
        lo = size;
      } else hi = size;
    }
    return best;
  }

  private layout() {
    const w = Math.round(this.host.clientWidth);
    const h = Math.round(this.host.clientHeight);
    if (!w || !h) return;
    const changed = w !== this.w || h !== this.h;
    this.w = w;
    this.h = h;
    if (changed && this.shown) {
      this.build();
      this.reveal = 1;
      this.draw(0);
    }
  }

  private build() {
    const { w, h } = this;
    if (!w || !h) return;
    const text = this.opts.uppercase ? this.text.toUpperCase() : this.text;
    const { size, lines } = this.fit(text, w * 0.995, h);
    // ROWS_PER_LINE character rows per line of type, within limits
    const cell = Math.max(MIN_CELL, Math.min(this.opts.maxCell, (size * 0.98) / ROWS_PER_LINE / 1.12));
    this.gc.setFontSize(cell);
    this.gc.resize(w, h);
    const fam = this.opts.displayFamily;
    const wt = this.opts.weight;
    const align = this.opts.align;
    const lineH = size * LINE;
    const blockH = (lines.length - 1) * lineH + size * CAP;
    this.shape.build(
      this.gc.cols,
      this.gc.rows,
      this.gc.cw,
      this.gc.ch,
      (ctx, bw, bh) => {
        ctx.font = `${wt} ${size}px ${fam}`;
        ctx.textBaseline = "alphabetic";
        const top = (bh - blockH) / 2;
        lines.forEach((ln, i) => {
          const m = ctx.measureText(ln);
          const x = align === "right" ? bw - m.width : align === "center" ? (bw - m.width) / 2 : 0;
          ctx.fillText(ln, x, top + i * lineH + size * CAP);
        });
      },
      Math.max(6, cell * 2.2),
    );
    const n = this.gc.cols * this.gc.rows;
    this.seeds = new Float32Array(n);
    this.seeds2 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.seeds[i] = Math.random();
      this.seeds2[i] = Math.random();
    }
    const { cells, count } = this.shape;
    const cols = this.gc.cols;
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < count; k++) {
      sx += cells[k] % cols;
      sy += (cells[k] / cols) | 0;
    }
    this.cx = count ? sx / count : 0;
    this.cy = count ? sy / count : 0;
    let md = 1;
    for (let k = 0; k < count; k++) {
      const dx = (cells[k] % cols) - this.cx;
      const dy = (((cells[k] / cols) | 0) - this.cy) * 2;
      md = Math.max(md, Math.hypot(dx, dy));
    }
    this.maxD = md;
    // where every cell lands if the letters collapse: each column settles
    // into a heap on the floor, keeping its order
    this.drop = new Float32Array(n);
    const rowsN = this.gc.rows;
    const lit = new Uint8Array(n);
    for (let k = 0; k < count; k++) lit[cells[k]] = 1;
    this.lit = lit;
    // the print head runs along each row from the bottom up, turning at the
    // end of every row like a real one
    const path: number[] = [];
    for (let r = rowsN - 1; r >= 0; r--) {
      const flip = (rowsN - 1 - r) % 2 === 1;
      for (let j = 0; j < cols; j++) {
        const c = flip ? cols - 1 - j : j;
        if (lit[r * cols + c]) path.push(r * cols + c);
      }
    }
    this.printPath = Int32Array.from(path);
    this.printAt = new Float32Array(n);
    path.forEach((i, k) => (this.printAt[i] = k / Math.max(1, path.length)));
    this.lens.r = Math.max(70, Math.min(150, Math.min(w, h * 1.6) * 0.42));
    for (let c = 0; c < cols; c++) {
      let floor = rowsN - 1;
      for (let r = rowsN - 1; r >= 0; r--) {
        const i = r * cols + c;
        if (!lit[i]) continue;
        this.drop[i] = floor - r;
        floor--;
      }
    }
    this.draw(0);
  }

  /** redraw with a point light at (x, y) in canvas css px, or the fixed light */
  setLight(p: { x: number; y: number } | null) {
    this.point = p;
    if (this.shown && this.reveal >= 1 && !this.off) this.draw(0);
  }

  /** the canvas itself, for effects that copy what it shows */
  get surface() {
    return this.canvas;
  }

  setPalette(palette: string[]) {
    this.opts.palette = palette;
    this.gc.setPalette([...palette, C.terra]);
    if (this.shown && !this.off) this.draw(0);
  }

  /*
   * What the season leaves on the letters, in small pixels: on the top of
   * every column of a letter a shaded pixel row on the edge and white ones
   * above, lumpy along the line; where it covers less (blossom, leaves),
   * single pixels. Each cell decides by a fixed hash, so nothing flickers
   * when the headline is drawn again.
   */
  private drawSettle(skip: (c: number, r: number) => boolean) {
    const s = this.settle;
    const { gc, lit } = this;
    const { cells, count } = this.shape;
    const { cols, cw, ch, ctx, dpr } = gc;
    if (!s) return;
    const P = REST_PIXEL;
    // where the top of a letter's glyph sits in its cell
    const top = ch * SETTLE_TOP;
    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round((gc.ox + x) * dpr), Math.round((gc.oy + y) * dpr), Math.ceil(w * dpr), Math.ceil(h * dpr));
    };
    for (let k = 0; k < count; k++) {
      const i = cells[k];
      const c = i % cols;
      const r = (i / cols) | 0;
      if (r > 0 && lit[i - cols]) continue;
      if (skip(c, r)) continue;
      const h = (((i + 1) * 2654435761) >>> 0) / 4294967296;
      const x = c * cw;
      const y = r * ch + top;
      if (s.cover < 1) {
        if (h > s.cover) continue;
        rect(x + Math.floor((h / s.cover) * Math.max(0, cw - P)), y - P, P, P, h < s.cover * 0.5 ? s.color : s.shade);
        continue;
      }
      // the shade on the edge, the snow above it, a pixel deeper here and there
      const n = 1 + (h < 0.35 ? 1 : 0);
      rect(x, y - P, cw, P, s.shade);
      rect(x, y - P * (n + 1), cw, P * n, s.color);
    }
  }

  get collapsed() {
    return this.fall > 0.5;
  }

  /** the letters fall and heap up at the bottom; again and they stand back up */
  toggleCollapse() {
    const from = this.fall;
    const to = from > 0.5 ? 0 : 1;
    const start = performance.now();
    const dur = to ? 1700 : 1300;
    this.fallOff?.();
    this.fallOff = onFrame((t) => {
      const k = Math.min(1, (performance.now() - start) / dur);
      this.fall = from + (to - from) * k;
      this.draw(t);
      if (k >= 1) {
        this.fallOff?.();
        this.fallOff = null;
      }
    });
  }

  /** set the headline; animates unless told not to or changes come fast */
  set(text: string, animate = true) {
    const now = performance.now();
    const rapid = now - this.lastSet < RAPID_MS;
    this.lastSet = now;
    this.text = text;
    this.shown = true;
    this.label.textContent = text;
    this.layout();
    this.build();
    this.off?.();
    this.off = null;
    if (!animate || rapid || prefersReducedMotion()) {
      this.reveal = 1;
      this.draw(0);
      this.opts.onReveal?.(1);
      return;
    }
    if (this.opts.reveal === "vary") {
      const pool = MODES.filter((m) => m !== this.mode);
      this.mode = pool[(Math.random() * pool.length) | 0];
    } else this.mode = this.opts.reveal;
    this.reveal = 0;
    const start = performance.now();
    const dur = DURATION[this.mode];
    this.off = onFrame((t) => {
      const k = Math.min(1, (performance.now() - start) / dur);
      this.reveal = this.mode === "assemble" || this.mode === "rain" || this.mode === "print" ? k : 1 - (1 - k) * (1 - k);
      this.draw(t);
      this.opts.onReveal?.(this.reveal);
      if (k >= 1) {
        this.off?.();
        this.off = null;
      }
    });
  }

  private draw(time: number) {
    const { gc, shape } = this;
    gc.clear();
    if (!shape.count) return;
    const { cells, count, nx, ny, nz, edge, cov } = shape;
    const { cols, cw, ch, ctx, dpr } = gc;
    const pal = this.opts.palette.length - 1;
    const reveal = this.reveal;
    const tick = (time * 30) | 0;
    // fixed light from the top left, a little in front
    let lx = -0.45;
    let ly = -0.55;
    let lz = 0.7;
    const L = this.lens;
    const lensOn = L.k > 0.002 && reveal >= 1 && this.fall === 0;
    // the light follows the cursor too while the lens is out
    const pt = this.point ?? (L.k > 0.002 ? { x: L.x, y: L.y } : null);
    const ptMix = this.point ? 1 : L.k;
    const flx = lx;
    const fly = ly;
    const flz = lz;
    const lift = this.h * 0.6;
    const fall = this.fall;
    const R = L.r;

    const knock = this.opts.knockout;
    if (knock && reveal >= 1 && fall === 0) {
      ctx.fillStyle = knock;
      for (let k = 0; k < count; k++) {
        const i = cells[k];
        const c = i % cols;
        const r = (i / cols) | 0;
        ctx.fillRect(
          Math.floor((gc.ox + (c - 1) * cw) * dpr),
          Math.floor((gc.oy + r * ch) * dpr),
          Math.ceil(cw * 3 * dpr),
          Math.ceil(ch * dpr) + 1,
        );
      }
    }

    const mode = this.mode;
    const rows = this.gc.rows;
    // the scan line itself, across the whole width
    if (mode === "scan" && reveal < 1) {
      const front = Math.floor((reveal / 0.85) * rows);
      if (front >= 0 && front < rows) {
        for (let c = 0; c < cols; c++) gc.put(61, c * cw, front * ch, Math.min(pal, 2), 0.55);
      }
    }

    const printing = mode === "print" && reveal < 1;
    const hot = pal + 1;
    for (let k = 0; k < count; k++) {
      const i = cells[k];
      const c = i % cols;
      const r = (i / cols) | 0;
      if (printing) {
        const at = this.printAt[i];
        if (at > reveal) {
          // not printed yet: the plan shows as dots along the outline
          if (edge[i]) gc.put(46, c * cw, r * ch, Math.min(pal, 2), 0.5);
          continue;
        }
        // laid down a moment ago: still glowing, then cooling into the type
        const age = (reveal - at) * this.printPath.length;
        if (age < 28) {
          gc.put(35, c * cw, r * ch, 1 - age / 28 > 0.35 ? hot : pal, 1);
          continue;
        }
      }
      // inside the lens the cell is drawn by the lens pass below
      if (lensOn && Math.hypot((c + 0.5) * cw - L.x, (r + 0.5) * ch - L.y) < R) continue;
      const seed = this.seeds[i];
      const seed2 = this.seeds2[i];
      let scrambling = false;
      let ox = 0;
      let oy = 0;
      let alpha = 1;
      if (reveal < 1) {
        let thr: number;
        let span = 0.15;
        switch (mode) {
          case "scan":
            thr = (r / rows) * 0.85 + seed * 0.03;
            span = 0.08;
            break;
          case "rain": {
            const colSeed = ((c * 2654435761) >>> 0) / 4294967296;
            thr = colSeed * 0.45 + (r / rows) * 0.05;
            span = 0.5;
            break;
          }
          case "assemble":
            thr = seed * 0.4;
            span = 0.6;
            break;
          case "dissolve":
            thr = seed * 0.85;
            break;
          case "outline": {
            if (edge[i]) {
              const ang = Math.atan2((r - this.cy) * 2, c - this.cx);
              thr = ((ang + Math.PI) / (Math.PI * 2)) * 0.45;
              span = 0.06;
            } else {
              thr = 0.45 + seed * 0.4;
              span = 0.12;
            }
            break;
          }
          case "radial": {
            const d = Math.hypot(c - this.cx, (r - this.cy) * 2) / this.maxD;
            thr = d * 0.78 + seed * 0.07;
            break;
          }
          default:
            thr = (c / cols) * 0.75 + seed * 0.25;
        }
        const local = (reveal - thr) / span;
        if (local <= 0) continue;
        if (mode === "rain") {
          const t = Math.min(1, local);
          // a little overshoot as each column lands
          const e = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
          oy = -(1 - e) * (r + 6) * ch;
          alpha = Math.min(1, t * 3);
        } else if (mode === "assemble") {
          const t = Math.min(1, local);
          const e = 1 - Math.pow(1 - t, 4);
          ox = (seed - 0.5) * this.w * 1.4 * (1 - e);
          oy = (seed2 - 0.5) * this.h * 3 * (1 - e);
          alpha = Math.min(1, t * 2.5);
          if (t < 0.85) scrambling = true;
        } else if (local < 1) scrambling = true;
      }
      if (pt) {
        const dx = pt.x - (c + 0.5) * cw;
        const dy = pt.y - (r + 0.5) * ch;
        const inv = 1 / Math.hypot(dx, dy, lift);
        lx = flx + (dx * inv - flx) * ptMix;
        ly = fly + (dy * inv - fly) * ptMix;
        lz = flz + (lift * inv - flz) * ptMix;
      }
      if (fall > 0 && this.drop[i]) {
        // each cell lets go a little after the ones below it, then drops
        const delay = (1 - r / this.gc.rows) * 0.35 + seed * 0.15;
        const t = Math.max(0, Math.min(1, (fall - delay) / 0.5));
        oy += this.drop[i] * ch * t * t;
      }
      const diff = Math.max(0, nx[i] * lx + ny[i] * ly + nz[i] * lz);
      let lum = bodyLum(diff);
      let code: number;
      const e = edge[i];
      if (scrambling) {
        code = NOISE.charCodeAt((i * 7 + tick) % NOISE.length);
        lum = mode === "scan" ? 1 : 0.95;
      } else if (e) {
        code = e;
        lum = 0.55 + 0.4 * cov[i];
      } else code = bodyCode(lum);
      const ci = Math.min(pal, Math.max(0, Math.floor(Math.min(1, lum) * (pal + 0.999))));
      gc.put(code, c * cw + ox, r * ch + oy, ci, alpha);
    }

    if (this.settle && reveal >= 1 && fall === 0) {
      this.drawSettle((c, r) => lensOn && Math.hypot((c + 0.5) * cw - L.x, (r + 0.5) * ch - L.y) < R);
    }
    if (printing) this.drawHead(reveal, time);
    if (lensOn) this.drawLens(lift, flx, fly, flz);
  }

  /** the print head: a nozzle over the cell being laid down, on its rail, with sparks */
  private drawHead(reveal: number, time: number) {
    const { gc, printPath } = this;
    const { cols, cw, ch } = gc;
    if (!printPath.length) return;
    const at = printPath[Math.min(printPath.length - 1, Math.floor(reveal * printPath.length))];
    const c = at % cols;
    const r = (at / cols) | 0;
    const pal = this.opts.palette.length - 1;
    const hot = pal + 1;
    // a short stretch of rail either side of the carriage, fading out
    const rail = r - 3;
    if (rail >= 0) {
      for (let x = Math.max(0, c - 8); x <= Math.min(cols - 1, c + 8); x++) {
        gc.put(x === c ? 43 : 45, x * cw, rail * ch, Math.min(pal, 2), x === c ? 0.9 : 0.4 * (1 - Math.abs(x - c) / 9));
      }
    }
    if (r - 2 >= 0) gc.put(124, c * cw, (r - 2) * ch, Math.min(pal, 3), 0.9);
    if (r - 1 >= 0) gc.put(86, c * cw, (r - 1) * ch, Math.min(pal, 3), 0.9);
    // one quiet spark
    const tick = (time * 30) | 0;
    const h = ((tick * 31) % 97) / 97;
    gc.put(46, (c + Math.round((h - 0.5) * 4)) * cw, (r - (h > 0.5 ? 1 : 0)) * ch, hot, 0.6);
  }

  /**
   * Every cell under the lens shows the cell nearer its middle, so the type
   * there is drawn larger without the glyphs changing size. Lit cells only;
   * no gaps open because it samples rather than pushes.
   */
  private drawLens(lift: number, flx: number, fly: number, flz: number) {
    const { gc, shape, lit, lens: L } = this;
    const { nx, ny, nz, edge, cov } = shape;
    const { cols, rows, cw, ch, ctx, dpr } = gc;
    const pal = this.opts.palette.length - 1;
    const R = L.r;
    const k = L.k;
    const knock = this.opts.knockout;
    if (knock) {
      ctx.fillStyle = knock;
      ctx.beginPath();
      ctx.arc((gc.ox + L.x) * dpr, (gc.oy + L.y) * dpr, Math.max(0, R - cw * 0.6) * dpr * Math.min(1, k * 1.5), 0, Math.PI * 2);
      ctx.fill();
    }
    const c0 = Math.max(0, Math.floor((L.x - R) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((L.x + R) / cw));
    const r0 = Math.max(0, Math.floor((L.y - R) / ch));
    const r1 = Math.min(rows - 1, Math.ceil((L.y + R) / ch));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const px = (c + 0.5) * cw;
        const py = (r + 0.5) * ch;
        const dx = px - L.x;
        const dy = py - L.y;
        const d = Math.hypot(dx, dy);
        if (d >= R) continue;
        const f = 1 - d / R;
        // up to about 1.8x in the middle, nothing at the rim
        const s = 1 - 0.45 * k * f * f;
        const sc = Math.floor((L.x + dx * s) / cw);
        const sr = Math.floor((L.y + dy * s) / ch);
        if (sc < 0 || sr < 0 || sc >= cols || sr >= rows) continue;
        const i = sr * cols + sc;
        if (!lit[i]) continue;
        // lit by the cursor: it sits right over the middle of the lens
        const ldx = L.x - px;
        const ldy = L.y - py;
        const inv = 1 / Math.hypot(ldx, ldy, lift);
        const lx = flx + (ldx * inv - flx) * k;
        const ly = fly + (ldy * inv - fly) * k;
        const lz = flz + (lift * inv - flz) * k;
        const diff = Math.max(0, nx[i] * lx + ny[i] * ly + nz[i] * lz);
        const boost = f * k * 0.22;
        let lum = bodyLum(diff) + boost;
        let code: number;
        const e = edge[i];
        if (e) {
          code = e;
          lum = 0.55 + 0.4 * cov[i] + boost;
        } else code = bodyCode(lum);
        const ci = Math.min(pal, Math.max(0, Math.floor(Math.min(1, lum) * (pal + 0.999))));
        gc.put(code, c * cw, r * ch, ci, 1);
      }
    }
  }

  destroy() {
    this.offStore();
    this.off?.();
    this.fallOff?.();
    this.lensOff?.();
    window.removeEventListener("pointermove", this.onMove);
    this.ro.disconnect();
    this.canvas.remove();
    this.label.remove();
  }
}
