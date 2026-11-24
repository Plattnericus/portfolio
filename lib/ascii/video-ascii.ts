import { GlyphCanvas } from "./glyph-canvas";

/*
 * Any moving picture (a clip, a webcam, a dropped file) printed as live
 * coloured characters. Each frame is shrunk to one pixel per cell; its
 * brightness picks the glyph after auto levels, its colour tints it.
 * Nothing is uploaded anywhere: the pixels never leave this canvas.
 */

const RAMP = " .,:;-=+*#%@";
const STATIC = "#%&*+=<>/?!$@";
const SLASH = 47;
const BACK = 92;
const PIPE = 124;
const DASH = 45;
const UNDER = 95;

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
  private lo = 0.05;
  private hi = 0.9;
  private hist = new Uint32Array(32);
  /** draw the picture flipped, like a mirror */
  mirror = false;
  /** 0..1 cells replaced by character static, for cuts */
  noise = 0;
  /** 0..1 how much of the real colour comes through (0 = the page's warm ramp) */
  colour = 1;
  /** outlines drawn as - / | \ where the picture has strong edges */
  edges = true;
  /** 0 normal, 1 inverted; eases towards 1 for light pictures so the page stays dark */
  private inv = 0;

  constructor(canvas: HTMLCanvasElement, fontFamily: string, fontSize = 11) {
    this.gc = new GlyphCanvas(canvas, { fontFamily, fontSize, lineHeight: 1.2, weight: 600 });
    this.sample = document.createElement("canvas");
    const ctx = this.sample.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.sctx = ctx;
  }

  resize(w: number, h: number) {
    this.gc.resize(w, h);
    this.sample.width = this.gc.cols;
    this.sample.height = this.gc.rows;
    const n = this.gc.cols * this.gc.rows;
    this.chars = new Uint16Array(n);
    this.rgba = new Uint8ClampedArray(n * 4);
    this.lum = new Float32Array(n);
    this.oldChars = new Uint16Array(n);
    this.oldRgba = new Uint8ClampedArray(n * 4);
    this.outChars = new Uint16Array(n);
    this.outRgba = new Uint8ClampedArray(n * 4);
    this.cutMode = null;
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
    if (k >= 1) this.cutMode = null;
  }

  private ready(p: Picture) {
    if (p instanceof HTMLVideoElement) return p.readyState >= 2 && p.videoWidth > 0;
    return p.complete && p.naturalWidth > 0;
  }

  render(p: Picture | null, time: number) {
    const { gc } = this;
    const { cols, rows, cw, ch } = gc;
    const n = cols * rows;
    const chars = this.chars;
    const rgba = this.rgba;
    const L = this.lum;
    const tick = (time * 20) | 0;
    let data: Uint8ClampedArray | null = null;

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
      const ctx = this.sctx;
      ctx.save();
      if (this.mirror) {
        ctx.translate(cols, 0);
        ctx.scale(-1, 1);
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(p, (pw - sw) / 2, (ph - sh) / 2, sw, sh, 0, 0, cols, rows);
      ctx.restore();
      data = ctx.getImageData(0, 0, cols, rows).data;

      const hist = this.hist;
      hist.fill(0);
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        const l = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) / 255;
        L[i] = l;
        hist[Math.min(31, (l * 32) | 0)]++;
      }
      let acc = 0;
      let lo = 0;
      let hi = 1;
      for (let b = 0; b < 32; b++) {
        acc += hist[b];
        if (acc < n * 0.02) lo = (b + 1) / 32;
        if (acc < n * 0.98) hi = (b + 1) / 32;
      }
      hi = Math.max(hi, lo + 0.25);
      this.lo += (lo - this.lo) * 0.1;
      this.hi += (hi - this.hi) * 0.1;
      // a mostly light picture (a white page, a pale studio) is drawn as ink
      // on dark: the background stays empty and the subject gets the glyphs
      let mid = 0;
      acc = 0;
      for (let b = 0; b < 32; b++) {
        acc += hist[b];
        if (acc >= n * 0.5) {
          mid = (b + 0.5) / 32;
          break;
        }
      }
      const want = mid > 0.58 ? 1 : mid < 0.48 ? 0 : this.inv > 0.5 ? 1 : 0;
      this.inv += (want - this.inv) * 0.15;
    }

    const span = 1 / Math.max(0.2, this.hi - this.lo);
    const rampN = RAMP.length - 1;
    // cells are twice as tall as wide: weigh the gradient so angles come out right
    const ay = cw / ch;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const r = ((i * 2654435761) >>> 0) / 4294967296;
      if (!data || (this.noise > 0 && ((r * 7919 + tick * 0.37) % 1) < this.noise)) {
        const k = (r * 1013 + tick * 0.618) % 1;
        if (k < 0.5 || !data) {
          if (!data && k > 0.92) {
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
      const R = data[o];
      const G = data[o + 1];
      const B = data[o + 2];
      let lum = Math.min(1, Math.max(0, (L[i] - this.lo) * span));
      if (this.inv > 0.01) {
        const ink = 1 - lum * 1.15;
        lum += (ink - lum) * this.inv;
      }
      lum = Math.pow(Math.min(1, Math.max(0, lum)), 0.85);

      let code = 0;
      if (this.edges) {
        const c = i % cols;
        const row = (i / cols) | 0;
        if (c > 0 && c < cols - 1 && row > 0 && row < rows - 1) {
          const tl = L[i - cols - 1];
          const t = L[i - cols];
          const tr = L[i - cols + 1];
          const l = L[i - 1];
          const rr = L[i + 1];
          const bl = L[i + cols - 1];
          const b = L[i + cols];
          const br = L[i + cols + 1];
          const gx = (tr + 2 * rr + br - tl - 2 * l - bl) * span;
          const gy = (bl + 2 * b + br - tl - 2 * t - tr) * span * ay;
          const mag = Math.sqrt(gx * gx + gy * gy);
          if (mag > 0.9) {
            // the outline runs across the gradient
            const ang = Math.atan2(gy, gx);
            const a = ((ang + Math.PI) / Math.PI) * 4;
            const sector = Math.round(a) % 4;
            code = sector === 0 ? PIPE : sector === 2 ? (gy > 0 ? UNDER : DASH) : sector === 1 ? SLASH : BACK;
            lum = Math.max(lum, 0.55);
          }
        }
      }

      if (lum < 0.08 && !code) {
        chars[i] = 32;
        rgba[o + 3] = 0;
        continue;
      }
      chars[i] = code || RAMP.charCodeAt(Math.min(rampN, Math.round(lum * rampN)));
      // lift the real colour so thin glyphs still carry it
      const mx = Math.max(R, G, B, 1);
      const k = (120 + lum * 135) / mx;
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
      }
    }
    if (this.cutMode && this.cutMode !== "static") {
      this.compose(time);
      gc.drawGrid(this.outChars, this.outRgba);
    } else gc.drawGrid(chars, rgba);
  }
}
