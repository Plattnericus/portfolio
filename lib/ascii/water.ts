import { GlyphCanvas } from "./glyph-canvas";
import { hexToRgb } from "../palette";
import { site } from "../site";

/*
 * Still water under the name, in characters. A height field on the cell
 * grid follows the wave equation, so every touch spreads as a ring (flattened,
 * because the cells are twice as tall as wide, which reads as water seen at
 * a low angle). The name above is mirrored into it: each cell looks up the
 * reflected picture, shifted by the slope of the water there, and prints it
 * as . - ~ = streaks that fade with depth. Crests with nothing reflected in
 * them show as faint ~.
 */

const DAMP = 0.975;
/** reflection streaks, light to dense */
const STREAK = " .-~=";

export class Water {
  readonly gc: GlyphCanvas;
  private h = new Float32Array(0);
  private prev = new Float32Array(0);
  private chars = new Uint16Array(0);
  private rgba = new Uint8ClampedArray(0);
  private mirror: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, mono: string) {
    this.gc = new GlyphCanvas(canvas, { fontFamily: mono, fontSize: 8, lineHeight: 1.15, weight: 600 });
    this.mirror = document.createElement("canvas");
    const ctx = this.mirror.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.mctx = ctx;
  }

  resize(w: number, h: number) {
    if (!this.gc.resize(w, h)) return;
    const n = this.gc.cols * this.gc.rows;
    this.h = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.chars = new Uint16Array(n);
    this.rgba = new Uint8ClampedArray(n * 4);
    this.mirror.width = this.gc.cols;
    this.mirror.height = this.gc.rows;
  }

  /** a disturbance at css px (x, y) inside the canvas */
  poke(x: number, y: number, strength = 1, radius = 1) {
    const { cols, rows, cw, ch } = this.gc;
    const c0 = Math.round(x / cw);
    const r0 = Math.round(y / ch);
    const rad = Math.max(1, Math.round(radius));
    for (let r = r0 - rad; r <= r0 + rad; r++) {
      for (let c = c0 - rad * 2; c <= c0 + rad * 2; c++) {
        if (c < 1 || r < 1 || c >= cols - 1 || r >= rows - 1) continue;
        const d = Math.hypot((c - c0) / 2, r - r0) / rad;
        if (d <= 1) this.h[r * cols + c] += strength * (1 - d * d);
      }
    }
  }

  private step() {
    const { cols, rows } = this.gc;
    const { h, prev } = this;
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c;
        const v = (h[i - 1] + h[i + 1] + h[i - cols] + h[i + cols]) * 0.5 - prev[i];
        prev[i] = v * DAMP;
      }
    }
    this.h = prev;
    this.prev = h;
  }

  /**
   * One frame. `source` is the canvas of the name above, mirrored into the
   * water from its bottom edge; `share` is how much of its height shows.
   */
  render(source: HTMLCanvasElement | null, time: number, share = 0.6) {
    const { gc, mctx, chars, rgba } = this;
    const { cols, rows } = gc;
    if (!cols || !rows) return;
    this.step();
    this.step();
    let img: Uint8ClampedArray | null = null;
    if (source && source.width && source.height) {
      // the lower part of the name, upside down, one pixel per cell
      mctx.setTransform(1, 0, 0, -1, 0, rows);
      mctx.clearRect(0, 0, cols, rows);
      mctx.imageSmoothingQuality = "high";
      const sh = source.height * share;
      mctx.drawImage(source, 0, source.height - sh, source.width, sh, 0, 0, cols, rows);
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      img = mctx.getImageData(0, 0, cols, rows).data;
    }
    const h = this.h;
    const swell = Math.sin(time * 0.7);
    // deeper reflections fade into the page
    const [gr, gg, gb] = hexToRgb(site.colors.bg);
    for (let r = 0; r < rows; r++) {
      const depth = r / rows;
      // a slow swell, so it is never quite still
      const drift = Math.sin(time * 1.1 + r * 0.9) * (0.4 + depth * 1.6) + swell * 0.3;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const o = i * 4;
        const sx = c > 0 && c < cols - 1 ? h[i + 1] - h[i - 1] : 0;
        const sy = r > 0 && r < rows - 1 ? h[i + cols] - h[i - cols] : 0;
        let lit = 0;
        let R = 0;
        let G = 0;
        let B = 0;
        if (img) {
          const x = Math.min(cols - 1, Math.max(0, Math.round(c + sx * 6 + drift)));
          const y = Math.min(rows - 1, Math.max(0, Math.round(r + sy * 3)));
          const p = (y * cols + x) * 4;
          const a = img[p + 3] / 255;
          if (a > 0.05) {
            R = img[p];
            G = img[p + 1];
            B = img[p + 2];
            lit = a * 0.8 * (1 - depth * 0.75);
          }
        }
        const crest = Math.abs(sx) + Math.abs(sy);
        if (lit > 0.06) {
          chars[i] = STREAK.charCodeAt(Math.min(STREAK.length - 1, 1 + Math.floor(lit * (STREAK.length - 1.2))));
          const f = 0.25 + depth * 0.55;
          rgba[o] = R + (gr - R) * f;
          rgba[o + 1] = G + (gg - G) * f;
          rgba[o + 2] = B + (gb - B) * f;
          rgba[o + 3] = 255;
        } else if (crest > 0.12) {
          chars[i] = crest > 0.35 ? 126 : 45;
          const g = 110 + Math.min(1, crest) * 80;
          rgba[o] = g;
          rgba[o + 1] = g * 0.96;
          rgba[o + 2] = g * 0.9;
          rgba[o + 3] = 255;
        } else {
          chars[i] = 32;
          rgba[o + 3] = 0;
        }
      }
    }
    gc.drawGrid(chars, rgba);
  }
}
