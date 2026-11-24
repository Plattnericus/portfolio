import { EDGE_LOW, edgeFor } from "./glyphs";

/** draws the shape in white into a css-px space of size w x h */
export type ShapeDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/**
 * A filled shape sampled onto a character grid, with a bevel.
 * Coverage per cell decides empty / edge / body; the distance to the
 * outline becomes a rounded height field whose normals let the body be lit
 * like an embossed surface.
 */
export class Shape {
  cols = 0;
  rows = 0;
  cw = 1;
  ch = 1;
  cov = new Float32Array(0);
  nx = new Float32Array(0);
  ny = new Float32Array(0);
  nz = new Float32Array(0);
  height = new Float32Array(0);
  /** edge glyph code, 0 when the cell is body */
  edge = new Uint16Array(0);
  /** indices of drawn cells */
  cells = new Int32Array(0);
  count = 0;

  build(cols: number, rows: number, cw: number, ch: number, draw: ShapeDraw, bevel = 28) {
    this.cols = cols;
    this.rows = rows;
    this.cw = cw;
    this.ch = ch;
    const n = cols * rows;
    const SX = 4;
    const SY = Math.max(4, Math.round((4 * ch) / cw));
    const can = document.createElement("canvas");
    can.width = cols * SX;
    can.height = rows * SY;
    const ctx = can.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    ctx.save();
    ctx.scale(SX / cw, SY / ch);
    draw(ctx, cols * cw, rows * ch);
    ctx.restore();
    const img = ctx.getImageData(0, 0, can.width, can.height).data;

    const cov = new Float32Array(n);
    const W = can.width;
    const inv = 1 / (SX * SY * 255);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        const y0 = r * SY;
        const x0 = c * SX;
        for (let y = 0; y < SY; y++) {
          let p = ((y0 + y) * W + x0) * 4 + 3;
          for (let x = 0; x < SX; x++, p += 4) sum += img[p];
        }
        cov[r * cols + c] = sum * inv;
      }
    }

    // chamfer distance (px) from each inside cell to the outside
    const INF = 1e9;
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = cov[i] > 0.5 ? INF : 0;
    const diag = Math.hypot(cw, ch);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (d[i] === 0) continue;
        let v = d[i];
        if (c > 0) v = Math.min(v, d[i - 1] + cw);
        else v = Math.min(v, cw);
        if (r > 0) {
          v = Math.min(v, d[i - cols] + ch);
          if (c > 0) v = Math.min(v, d[i - cols - 1] + diag);
          if (c < cols - 1) v = Math.min(v, d[i - cols + 1] + diag);
        } else v = Math.min(v, ch);
        d[i] = v;
      }
    }
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = cols - 1; c >= 0; c--) {
        const i = r * cols + c;
        if (d[i] === 0) continue;
        let v = d[i];
        if (c < cols - 1) v = Math.min(v, d[i + 1] + cw);
        else v = Math.min(v, cw);
        if (r < rows - 1) {
          v = Math.min(v, d[i + cols] + ch);
          if (c < cols - 1) v = Math.min(v, d[i + cols + 1] + diag);
          if (c > 0) v = Math.min(v, d[i + cols - 1] + diag);
        } else v = Math.min(v, ch);
        d[i] = v;
      }
    }

    // rounded (quarter circle) profile
    const h = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = Math.min(1, d[i] / bevel);
      h[i] = Math.sqrt(1 - (1 - t) * (1 - t));
    }

    const nx = new Float32Array(n);
    const ny = new Float32Array(n);
    const nz = new Float32Array(n);
    const edge = new Uint16Array(n);
    const cells: number[] = [];
    const k = 1.4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const cv = cov[i];
        if (cv < 0.12) continue;
        cells.push(i);
        const hl = c > 0 ? h[i - 1] : 0;
        const hr = c < cols - 1 ? h[i + 1] : 0;
        const hu = r > 0 ? h[i - cols] : 0;
        const hd = r < rows - 1 ? h[i + cols] : 0;
        const gx = ((hr - hl) / (2 * cw)) * bevel * k;
        const gy = ((hd - hu) / (2 * ch)) * bevel * k;
        const len = Math.hypot(gx, gy, 1);
        nx[i] = -gx / len;
        ny[i] = -gy / len;
        nz[i] = 1 / len;

        if (cv < 0.86) {
          const cl = c > 0 ? cov[i - 1] : 0;
          const cr = c < cols - 1 ? cov[i + 1] : 0;
          const cu = r > 0 ? cov[i - cols] : 0;
          const cd = r < rows - 1 ? cov[i + cols] : 0;
          const cgx = (cr - cl) / cw;
          const cgy = (cd - cu) / ch;
          // tangent = gradient rotated 90deg; angle in y-up space
          const tx = -cgy;
          const ty = cgx;
          const ang = (Math.atan2(-ty, tx) * 180) / Math.PI;
          let code = edgeFor(ang);
          // horizontal edge with the body below it sits low in the cell
          if (code === 45 && cgy > 0 && cv < 0.6) code = EDGE_LOW.charCodeAt(0);
          edge[i] = code;
        }
      }
    }
    this.cov = cov;
    this.height = h;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.edge = edge;
    this.cells = Int32Array.from(cells);
    this.count = cells.length;
  }
}

/** fits a line of text into w x h and draws it centred */
export function textDraw(
  text: string,
  fontFamily: string,
  weight: number | string,
  opts: {
    maxHeightRatio?: number;
    padX?: number;
    tracking?: number;
    baselineShift?: number;
    /** stretch horizontally to fill the width once the height is set */
    stretch?: boolean;
  } = {},
): ShapeDraw {
  return (ctx, w, h) => {
    const padX = opts.padX ?? 0;
    const tracking = opts.tracking ?? 0;
    ctx.font = `${weight} 100px ${fontFamily}`;
    ctx.textBaseline = "alphabetic";
    const m = ctx.measureText(text);
    const textW = m.width + tracking * 100 * (text.length - 1);
    const asc = m.actualBoundingBoxAscent || 72;
    const desc = m.actualBoundingBoxDescent || 0;
    const textH = asc + desc;
    const sx = (w - padX * 2) / textW;
    const sy = (h * (opts.maxHeightRatio ?? 0.92)) / textH;
    const s = opts.stretch ? sy : Math.min(sx, sy);
    const size = 100 * s;
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    if (opts.stretch) {
      const k = (w - padX * 2) / (textW * s);
      ctx.translate(w / 2, 0);
      ctx.scale(k, 1);
      ctx.translate(-w / 2, 0);
    }
    const realW = textW * s;
    const x0 = (w - realW) / 2;
    const y = (h - textH * s) / 2 + asc * s + (opts.baselineShift ?? 0) * h;
    if (!tracking) {
      ctx.fillText(text, x0, y);
      return;
    }
    let x = x0;
    for (const chr of text) {
      ctx.fillText(chr, x, y);
      x += ctx.measureText(chr).width + tracking * size;
    }
  };
}
