import { GlyphCanvas } from "./glyph-canvas";

/*
 * A word printed in characters at any magnification. Each frame the word is
 * drawn into a mask at two samples per cell, and every cell gets its
 * coverage, an outline glyph where the coverage changes (- / | \), and a
 * light from the top left through a cheap emboss. At the end of the zoom one
 * stroke fills the whole screen; `dissolve` then takes the cells away.
 */

const RAMP = " .,:;-=+*#%@";
const RN = RAMP.length - 1;
const NOISE = "#%&*+=<>/?!$@";
const SPACE = 32;

function lineGlyph(tx: number, ty: number) {
  let o = Math.atan2(ty, tx);
  if (o < 0) o += Math.PI;
  const s = Math.round(o / (Math.PI / 4)) % 4;
  return s === 0 ? 45 : s === 1 ? 92 : s === 2 ? 124 : 47;
}

export class ZoomWord {
  readonly gc: GlyphCanvas;
  private mask: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private cov = new Float32Array(0);
  private chars = new Uint16Array(0);
  private rgba = new Uint8ClampedArray(0);
  private seeds = new Float32Array(0);
  private family: string;
  readonly word: string;

  constructor(canvas: HTMLCanvasElement, mono: string, display: string, word: string) {
    this.gc = new GlyphCanvas(canvas, { fontFamily: mono, fontSize: 7, lineHeight: 1.18, weight: 600 });
    this.mask = document.createElement("canvas");
    const ctx = this.mask.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.mctx = ctx;
    this.family = display;
    this.word = word;
  }

  resize(w: number, h: number, fontSize: number) {
    this.gc.setFontSize(fontSize);
    this.gc.resize(w, h);
    const { cols, rows } = this.gc;
    this.mask.width = cols * 2;
    this.mask.height = rows * 2;
    const n = cols * rows;
    this.cov = new Float32Array(n);
    this.chars = new Uint16Array(n);
    this.rgba = new Uint8ClampedArray(n * 4);
    this.seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) this.seeds[i] = Math.random();
  }

  /** css px per em at scale 1: the word spans half the screen, most of it on phones */
  base() {
    const share = this.gc.width < this.gc.height ? 0.86 : 0.5;
    return (this.gc.width * share) / (this.word.length * 0.758);
  }

  /** scale at which the crossing of the middle letter covers the screen */
  coverScale() {
    const em = this.base();
    // the centre module of the X is 0.168em wide and 0.148em tall
    return Math.max(this.gc.width / (0.168 * em), this.gc.height / (0.148 * em)) * 1.06;
  }

  /**
   * `heat` 0..1 tints the characters towards the accent as the dive gets
   * close; `dissolve` 0..1 opens a hole from the middle outwards.
   */
  render(scale: number, time: number, dissolve = 0, opacity = 1, heat = 0) {
    const { gc, mctx, cov, chars, rgba, seeds } = this;
    const { cols, rows, cw, ch } = gc;
    const mw = this.mask.width;
    const mh = this.mask.height;

    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mw, mh);
    // css px -> mask px, then zoom about the centre of the screen
    mctx.setTransform((2 / cw) * scale, 0, 0, (2 / ch) * scale, mw / 2, mh / 2);
    const em = this.base();
    mctx.font = `800 ${em}px ${this.family}`;
    mctx.textAlign = "center";
    mctx.textBaseline = "alphabetic";
    mctx.fillStyle = "#fff";
    // the caps are 0.744em tall: put their middle on the origin
    mctx.fillText(this.word, 0, em * 0.372);
    const img = mctx.getImageData(0, 0, mw, mh).data;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = (r * 2 * mw + c * 2) * 4 + 3;
        const b = a + mw * 4;
        cov[r * cols + c] = (img[a] + img[a + 4] + img[b] + img[b + 4]) / 1020;
      }
    }

    const tick = (time * 24) | 0;
    const hx = cols / 2;
    const hy = rows / 2;
    const maxD = Math.hypot(hx, hy * 2);
    const at = (c: number, r: number) =>
      c < 0 || r < 0 || c >= cols || r >= rows ? 0 : cov[r * cols + c];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const o = i * 4;
        const v = cov[i];
        // the way out opens from the middle, its rim breaking into noise
        const rim = (Math.hypot(c - hx, (r - hy) * 2) / maxD) * 0.92 + seeds[i] * 0.08 - dissolve * 1.15 + 0.08;
        if (v < 0.12 || rim < -0.04) {
          chars[i] = SPACE;
          rgba[o + 3] = 0;
          continue;
        }
        if (dissolve > 0 && rim < 0.03) {
          chars[i] = NOISE.charCodeAt((i + tick) % NOISE.length);
          rgba[o] = 255;
          rgba[o + 1] = 150;
          rgba[o + 2] = 110;
          rgba[o + 3] = 255 * opacity;
          continue;
        }
        const gx = at(c + 1, r - 1) + 2 * at(c + 1, r) + at(c + 1, r + 1) - at(c - 1, r - 1) - 2 * at(c - 1, r) - at(c - 1, r + 1);
        const gy = at(c - 1, r + 1) + 2 * at(c, r + 1) + at(c + 1, r + 1) - at(c - 1, r - 1) - 2 * at(c, r - 1) - at(c + 1, r - 1);
        const gyy = gy * (cw / ch);
        const mag = Math.hypot(gx, gyy);
        // lit from the top left: brighter where the shape starts on that side
        const tl = v - at(c - 2, r - 1);
        const br = v - at(c + 2, r + 1);
        // and the face itself falls off away from the light
        const slope = 0.22 - (c / cols) * 0.26 - (r / rows) * 0.18;
        const lum = Math.max(0, Math.min(1, 0.5 + slope + tl * 0.55 - br * 0.3));
        let code: number;
        if (mag > 1.2 && v < 0.97) code = lineGlyph(-gyy, gx);
        else code = RAMP.charCodeAt(Math.max(3, Math.min(RN, Math.round(lum * RN))));
        chars[i] = code;
        const g = 120 + lum * 135;
        // cream, warming to the accent (#ff5a2e) as we dive in
        rgba[o] = g + (Math.min(255, 150 + lum * 120) - g) * heat;
        rgba[o + 1] = g * 0.95 + (60 + lum * 60 - g * 0.95) * heat;
        rgba[o + 2] = g * 0.88 + (30 + lum * 40 - g * 0.88) * heat;
        rgba[o + 3] = 255 * opacity;
      }
    }
    gc.drawGrid(chars, rgba);
  }
}
