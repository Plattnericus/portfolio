import { GlyphCanvas } from "./glyph-canvas";

/*
 * Any moving picture (a clip, a webcam, a dropped file) printed as live
 * coloured characters. Each frame is shrunk to six samples per cell (two
 * across, three down). After auto levels and a little contrast inside the
 * cell, the character whose own shape is closest to those six samples is
 * picked, so an edge running through a cell gets a / or a _ or a ( that
 * actually follows it. Choices are cached by the quantised samples.
 * Nothing is uploaded anywhere: the pixels never leave this canvas.
 */

const STATIC = "#%&*+=<>/?!$@";
/** how much richer than the clip the colours are printed */
const SATURATE = 1.45;
/** flat areas, light to dense */
const RAMP = " .:-=+*#%@";
/** what a cell can become: no letters, so a picture never reads as words */
const SHAPES = " .,:;'`-_~=+*^\"!|/\\()<>[]#%@";
const SX = 2;
const SY = 3;
const SN = SX * SY;
/** levels per sample in the cache key: 8^6 entries */
const Q = 8;

type ShapeSet = { codes: Uint16Array; vec: Float32Array; cache: Int16Array };
const shapeSets = new Map<string, ShapeSet>();

/** each candidate glyph's ink in the 2 x 3 parts of its cell, in this font */
function shapesFor(font: string): ShapeSet {
  const hit = shapeSets.get(font);
  if (hit) return hit;
  const W = 24;
  const H = 48;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const codes = new Uint16Array(SHAPES.length);
  const vec = new Float32Array(SHAPES.length * SN);
  if (ctx) {
    ctx.font = `600 ${W / 0.6}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let max = 0;
    for (let g = 0; g < SHAPES.length; g++) {
      codes[g] = SHAPES.charCodeAt(g);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.fillText(SHAPES[g], W / 2, H / 2);
      const d = ctx.getImageData(0, 0, W, H).data;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const s = (((y * SY) / H) | 0) * SX + (((x * SX) / W) | 0);
          vec[g * SN + s] += d[(y * W + x) * 4 + 3] / 255;
        }
      }
      for (let s = 0; s < SN; s++) {
        vec[g * SN + s] /= (W / SX) * (H / SY);
        max = Math.max(max, vec[g * SN + s]);
      }
    }
    for (let i = 0; i < vec.length; i++) vec[i] /= max || 1;
  }
  const set = { codes, vec, cache: new Int16Array(Q ** SN).fill(-1) };
  shapeSets.set(font, set);
  return set;
}

export type Picture = HTMLVideoElement | HTMLImageElement;

/** how one picture hands over to the next */
export type Cut = "static" | "wipe" | "iris" | "interlace" | "resolve" | "push";
const CUTS: Cut[] = ["static", "wipe", "iris", "interlace", "resolve", "push"];

export class VideoAscii {
  readonly gc: GlyphCanvas;
  private sample: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private chars = new Uint16Array(0);
  private rgba = new Uint8ClampedArray(0);
  private lum = new Float32Array(0);
  private oldChars = new Uint16Array(0);
  private oldRgba = new Uint8ClampedArray(0);
  private outChars = new Uint16Array(0);
  private outRgba = new Uint8ClampedArray(0);
  private cutMode: Cut | null = null;
  private lastCut: Cut | null = null;
  private cutStart = 0;
  private cutDur = 600;
  /** the picture's background brightness (its most common one), eased */
  private bg = 0.1;
  /** how far from the background the strongest parts reach, eased */
  private reach = 0.6;
  private hist = new Uint32Array(64);
  /*
   * A film plays at 24 or 30 frames a second, the screen runs at up to 120:
   * a picture that has not changed since the last frame is not converted
   * again. These remember what was converted last.
   */
  private lastPic: Picture | null = null;
  private lastKey = -1;
  private lastColour = -1;
  /** something changed that the next frame has to draw (size, a cut, a picture still settling) */
  private stale = true;
  /** draw the picture flipped, like a mirror */
  mirror = false;
  /** 0..1 cells replaced by character static, for cuts */
  noise = 0;
  /** 0..1 how much of the real colour comes through (0 = the page's warm ramp) */
  colour = 1;
  /** sharpen inside each cell so outlines pick line glyphs; off is softer */
  edges = true;
  /** a border of + - | around the picture, like a terminal window */
  frame = false;

  private shapes: ShapeSet;
  private subs = new Float32Array(0);
  private rgb = new Float32Array(0);

  constructor(canvas: HTMLCanvasElement, fontFamily: string, fontSize = 11) {
    this.gc = new GlyphCanvas(canvas, { fontFamily, fontSize, lineHeight: 1.2, weight: 600 });
    this.shapes = shapesFor(fontFamily);
    this.sample = document.createElement("canvas");
    const ctx = this.sample.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.sctx = ctx;
  }

  resize(w: number, h: number) {
    this.gc.resize(w, h);
    this.sample.width = this.gc.cols * SX;
    this.sample.height = this.gc.rows * SY;
    const n = this.gc.cols * this.gc.rows;
    this.subs = new Float32Array(n * SN);
    this.rgb = new Float32Array(n * 3);
    this.chars = new Uint16Array(n);
    this.rgba = new Uint8ClampedArray(n * 4);
    this.lum = new Float32Array(n);
    this.oldChars = new Uint16Array(n);
    this.oldRgba = new Uint8ClampedArray(n * 4);
    this.outChars = new Uint16Array(n);
    this.outRgba = new Uint8ClampedArray(n * 4);
    this.cutMode = null;
    this.stale = true;
  }

  /**
   * Hands over to whatever picture is rendered next, keeping the current
   * frame for the transition. Without a mode, a different one from last time.
   */
  cut(mode?: Cut) {
    const pool = CUTS.filter((c) => c !== this.lastCut);
    const m = mode ?? pool[(Math.random() * pool.length) | 0];
    this.lastCut = m;
    this.oldChars.set(this.cutMode ? this.outChars : this.chars);
    this.oldRgba.set(this.cutMode ? this.outRgba : this.rgba);
    this.cutMode = m;
    this.cutStart = performance.now();
    this.cutDur = m === "static" ? 450 : m === "resolve" ? 700 : 620;
  }

  /** mixes the kept frame and the new one for the running cut */
  private compose(time: number) {
    const mode = this.cutMode;
    const { cols, rows } = this.gc;
    const k = Math.min(1, (performance.now() - this.cutStart) / this.cutDur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const C = this.chars;
    const R = this.rgba;
    const OC = this.oldChars;
    const OR = this.oldRgba;
    const XC = this.outChars;
    const XR = this.outRgba;
    const tick = (time * 24) | 0;
    const block = Math.max(1, Math.round((1 - e) * 12));
    const maxD = Math.hypot(cols / 2, rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        let src = 1; // 1 new, 0 old, 2 seam
        let si = i;
        if (mode === "wipe") {
          const front = e * (cols + 6) - 3;
          src = c < front - 1 ? 1 : c < front + 1 ? 2 : 0;
        } else if (mode === "iris") {
          const d = Math.hypot(c - cols / 2, (r - rows / 2) * 2);
          const rad = e * maxD * 1.05;
          src = d < rad - 1.5 ? 1 : d < rad + 0.5 ? 2 : 0;
        } else if (mode === "interlace") {
          const at = (r % 4) / 4 * 0.6;
          const t = (k - at) / 0.35;
          src = t >= 1 ? 1 : t > 0 ? 2 : 0;
        } else if (mode === "resolve") {
          // the new picture arrives coarse and sharpens
          si = Math.floor(r / block) * block * cols + Math.floor(c / block) * block;
        } else if (mode === "push") {
          const shift = Math.round(e * cols);
          const cc = c + shift;
          if (cc < cols) {
            src = 0;
            si = r * cols + cc;
          } else {
            src = 1;
            si = r * cols + (cc - cols);
          }
          if (cc === cols || cc === cols - 1) src = 2;
        }
        const o = i * 4;
        if (src === 2) {
          XC[i] = mode === "wipe" ? 124 : mode === "push" ? 124 : "#%*+=".charCodeAt((i + tick) % 5);
          XR[o] = 255;
          XR[o + 1] = 110;
          XR[o + 2] = 60;
          XR[o + 3] = 255;
          continue;
        }
        const A = src === 1 ? C : OC;
        const B = src === 1 ? R : OR;
        const so = si * 4;
        XC[i] = A[si];
        XR[o] = B[so];
        XR[o + 1] = B[so + 1];
        XR[o + 2] = B[so + 2];
        XR[o + 3] = B[so + 3];
      }
    }
    if (k >= 1) {
      this.cutMode = null;
      this.stale = true;
    }
  }

  private ready(p: Picture) {
    if (p instanceof HTMLVideoElement) return p.readyState >= 2 && p.videoWidth > 0;
    return p.complete && p.naturalWidth > 0;
  }

  private border(chars: Uint16Array, rgba: Uint8ClampedArray) {
    if (!this.frame) return;
    const { cols, rows } = this.gc;
    const set = (c: number, r: number, code: number) => {
      const i = r * cols + c;
      chars[i] = code;
      rgba[i * 4] = 128;
      rgba[i * 4 + 1] = 120;
      rgba[i * 4 + 2] = 112;
      rgba[i * 4 + 3] = 255;
    };
    for (let c = 0; c < cols; c++) {
      set(c, 0, 45);
      set(c, rows - 1, 45);
    }
    for (let r = 1; r < rows - 1; r++) {
      set(0, r, 124);
      set(cols - 1, r, 124);
    }
    set(0, 0, 43);
    set(cols - 1, 0, 43);
    set(0, rows - 1, 43);
    set(cols - 1, rows - 1, 43);
  }

  /** the nearest glyph to six samples, through the cache */
  private match(v: Float32Array, o: number) {
    const { vec, codes, cache } = this.shapes;
    let key = 0;
    for (let s = 0; s < SN; s++) key = key * Q + Math.min(Q - 1, (v[o + s] * Q) | 0);
    const hit = cache[key];
    if (hit >= 0) return codes[hit];
    // match against the middle of the quantisation bucket
    let best = 0;
    let bestD = Infinity;
    let k = key;
    const q = [0, 0, 0, 0, 0, 0];
    for (let s = SN - 1; s >= 0; s--) {
      q[s] = ((k % Q) + 0.5) / Q;
      k = (k / Q) | 0;
    }
    for (let g = 0; g < codes.length; g++) {
      let d = 0;
      for (let s = 0; s < SN; s++) {
        const e = vec[g * SN + s] - q[s];
        d += e * e;
      }
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    cache[key] = best;
    return codes[best];
  }

  render(p: Picture | null, time: number) {
    const { gc } = this;
    const { cols, rows, cw, ch } = gc;
    const n = cols * rows;
    const chars = this.chars;
    const rgba = this.rgba;
    const L = this.lum;
    const subs = this.subs;
    const rgb = this.rgb;
    const tick = (time * 20) | 0;
    let have = false;

    if (p && !this.cutMode && this.noise <= 0 && this.ready(p)) {
      const key = p instanceof HTMLVideoElement ? p.currentTime : 0;
      if (!this.stale && p === this.lastPic && key === this.lastKey && this.colour === this.lastColour) return;
      this.lastPic = p;
      this.lastKey = key;
      this.lastColour = this.colour;
      this.stale = false;
    } else this.lastPic = null;

    if (p && this.ready(p)) {
      const pw = p instanceof HTMLVideoElement ? p.videoWidth : p.naturalWidth;
      const ph = p instanceof HTMLVideoElement ? p.videoHeight : p.naturalHeight;
      // cover-crop to the grid's shape
      const aspect = (cols * cw) / (rows * ch);
      let sw = pw;
      let sh = pw / aspect;
      if (sh > ph) {
        sh = ph;
        sw = ph * aspect;
      }
      const W = cols * SX;
      const H = rows * SY;
      const ctx = this.sctx;
      ctx.save();
      if (this.mirror) {
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(p, (pw - sw) / 2, (ph - sh) / 2, sw, sh, 0, 0, W, H);
      ctx.restore();
      const data = ctx.getImageData(0, 0, W, H).data;
      have = true;

      const hist = this.hist;
      hist.fill(0);
      rgb.fill(0);
      for (let y = 0; y < H; y++) {
        const r = (y / SY) | 0;
        const sy = y - r * SY;
        for (let x = 0; x < W; x++) {
          const c = (x / SX) | 0;
          const o = (y * W + x) * 4;
          const i = r * cols + c;
          const l = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) / 255;
          subs[i * SN + sy * SX + (x - c * SX)] = l;
          hist[Math.min(63, (l * 64) | 0)]++;
          rgb[i * 3] += data[o];
          rgb[i * 3 + 1] += data[o + 1];
          rgb[i * 3 + 2] += data[o + 2];
        }
      }
      // the background is the brightness most of the frame has (a page, a
      // sky, a desk); everything is measured as its distance from it, so the
      // background stays empty whether it is dark or light, and the subject
      // gets the characters either way
      let mode = 0;
      for (let b = 1; b < 64; b++) if (hist[b] > hist[mode]) mode = b;
      const bg = (mode + 0.5) / 64;
      this.bg += (bg - this.bg) * (Math.abs(bg - this.bg) > 0.25 ? 0.5 : 0.08);
      // and the 97th percentile of that distance sets the full scale
      const total = W * H;
      const far = new Uint32Array(32);
      for (let b = 0; b < 64; b++) far[Math.min(31, ((Math.abs((b + 0.5) / 64 - this.bg) * 32) | 0))] += hist[b];
      let acc = 0;
      let reach = 1;
      for (let b = 0; b < 32; b++) {
        acc += far[b];
        if (acc >= total * 0.97) {
          reach = (b + 1) / 32;
          break;
        }
      }
      this.reach += (Math.max(0.18, reach) - this.reach) * 0.1;
      // still easing towards this picture's levels: draw the next frame too
      if (Math.abs(bg - this.bg) > 0.004 || Math.abs(Math.max(0.18, reach) - this.reach) > 0.004) this.stale = true;
    }

    const span = 1 / this.reach;
    // under this, a sample counts as background
    const floor = 0.1;
    // a little contrast inside each cell, so an edge through it picks a line
    const sharp = this.edges ? 1.6 : 1;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const r = ((i * 2654435761) >>> 0) / 4294967296;
      if (!have || (this.noise > 0 && ((r * 7919 + tick * 0.37) % 1) < this.noise)) {
        const k = (r * 1013 + tick * 0.618) % 1;
        if (k < 0.5 || !have) {
          if (!have && k > 0.92) {
            chars[i] = "+:.*".charCodeAt((k * 40) & 3);
            rgba[o] = rgba[o + 1] = rgba[o + 2] = 90;
            rgba[o + 3] = 255;
          } else {
            chars[i] = 32;
            rgba[o + 3] = 0;
          }
          continue;
        }
        chars[i] = STATIC.charCodeAt(((r * 977 + tick * 13) | 0) % STATIC.length);
        const g = 70 + k * 150;
        rgba[o] = g;
        rgba[o + 1] = g * 0.95;
        rgba[o + 2] = g * 0.9;
        rgba[o + 3] = 255;
        continue;
      }
      // distance from the background, past a small dead zone, on a soft curve
      const so = i * SN;
      let sum = 0;
      let mx = 0;
      let mn = 1;
      for (let s = 0; s < SN; s++) {
        let v = (Math.abs(subs[so + s] - this.bg) * span - floor) / (1 - floor);
        v = Math.pow(Math.min(1, Math.max(0, v)), 0.8);
        subs[so + s] = v;
        sum += v;
        if (v > mx) mx = v;
        if (v < mn) mn = v;
      }
      const lum = sum / SN;
      L[i] = lum;
      if (lum < 0.06 && mx < 0.3) {
        chars[i] = 32;
        rgba[o + 3] = 0;
        continue;
      }
      let code: number;
      if (mx - mn < 0.28) {
        // even inside: a plain density, so flat areas read as tone, not texture
        code = RAMP.charCodeAt(Math.min(RAMP.length - 1, Math.max(1, Math.round(lum * (RAMP.length - 1)))));
      } else {
        // an edge runs through the cell: the glyph whose shape follows it
        if (sharp !== 1) {
          for (let s = 0; s < SN; s++) subs[so + s] = Math.pow(subs[so + s] / mx, sharp) * mx;
        }
        code = this.match(subs, so);
      }
      if (code === 32) {
        chars[i] = 32;
        rgba[o + 3] = 0;
        continue;
      }
      chars[i] = code;
      // the cell's own colour, a little richer, lifted so thin glyphs
      // still carry it
      const r0 = rgb[i * 3] / SN;
      const g0 = rgb[i * 3 + 1] / SN;
      const b0 = rgb[i * 3 + 2] / SN;
      const grey = (r0 + g0 + b0) / 3;
      const R = Math.max(0, grey + (r0 - grey) * SATURATE);
      const G = Math.max(0, grey + (g0 - grey) * SATURATE);
      const B = Math.max(0, grey + (b0 - grey) * SATURATE);
      const top = Math.max(R, G, B, 1);
      const k = (120 + Math.max(lum, mx * 0.7) * 135) / top;
      const wr = 150 + lum * 105;
      const wg = 90 + lum * 140;
      const wb = 70 + lum * 120;
      const c = this.colour;
      rgba[o] = Math.min(255, R * k) * c + wr * (1 - c);
      rgba[o + 1] = Math.min(255, G * k) * c + wg * (1 - c);
      rgba[o + 2] = Math.min(255, B * k) * c + wb * (1 - c);
      rgba[o + 3] = 255;
    }
    if (this.cutMode === "static") {
      // the classic: character static over the new picture, thinning out
      const k = (performance.now() - this.cutStart) / this.cutDur;
      this.noise = Math.max(0, 1 - k);
      if (k >= 1) {
        this.cutMode = null;
        this.noise = 0;
        this.stale = true;
      }
    }
    if (this.cutMode && this.cutMode !== "static") {
      this.compose(time);
      this.border(this.outChars, this.outRgba);
      gc.drawGrid(this.outChars, this.outRgba);
    } else {
      this.border(chars, rgba);
      gc.drawGrid(chars, rgba);
    }
  }
}
