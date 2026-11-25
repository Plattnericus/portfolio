import { ClampToEdgeWrapping, DataTexture, DataUtils, HalfFloatType, LinearFilter, RedFormat, Vector2 } from "three";

/*
 * Text to a 2D signed distance field, uploaded as a half-float texture. The
 * ray marcher extrudes it into solid 3D letters. Distances are stored in
 * world units, positive outside the ink.
 */

const INF = 1e20;

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** squared distance from every pixel to the nearest pixel where mask is true */
function edt(mask: Uint8Array, w: number, h: number): Float64Array {
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  return grid;
}

export type TextField = {
  texture: DataTexture;
  /** world size of the whole texture rect */
  size: Vector2;
  /** centres of each character in world units (x), handy for flying through */
  centers: number[];
  /** height of the set text in world units, centred on y = 0 */
  height: number;
  /**
   * Where something falling would come to rest on the text: the first place
   * each column meets a letter (its outer top), as pairs of world x, y; the
   * columns are `step` world units apart.
   */
  tops: Float32Array;
  step: number;
};

/** how many columns across the text are looked at for its tops */
const TOPS_ACROSS = 360;

/**
 * Renders `text` centred into a w x h canvas, then turns it into a signed
 * distance field whose width maps to `worldWidth`.
 */
export function textField(
  text: string,
  family: string,
  opts: { w?: number; h?: number; worldWidth: number; tracking?: number; fill?: number; weight?: number },
): TextField {
  const weight = opts.weight ?? 900;
  const w = opts.w ?? 1024;
  const h = opts.h ?? 320;
  const can = document.createElement("canvas");
  can.width = w;
  can.height = h;
  const ctx = can.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  const tracking = opts.tracking ?? 0;
  ctx.font = `${weight} 100px ${family}`;
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * 100 * (chars.length - 1);
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent || 72;
  const desc = m.actualBoundingBoxDescent || 0;
  const fill = opts.fill ?? 0.8;
  const s = Math.min((w * fill) / total, (h * fill) / (asc + desc));
  ctx.font = `${weight} ${100 * s}px ${family}`;
  let x = (w - total * s) / 2;
  const y = (h - (asc + desc) * s) / 2 + asc * s;
  const centersPx: number[] = [];
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    centersPx.push(x + (widths[i] * s) / 2);
    x += widths[i] * s + tracking * 100 * s;
  });
  const img = ctx.getImageData(0, 0, w, h).data;
  const inside = new Uint8Array(w * h);
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = img[i * 4 + 3] > 127;
    inside[i] = a ? 1 : 0;
    outside[i] = a ? 0 : 1;
  }
  const tops: number[] = [];
  const stepPx = Math.max(1, Math.round(w / TOPS_ACROSS));
  // only the outer top of each letter: the first place a column meets it
  for (let px = 0; px < w; px += stepPx) {
    for (let py = 1; py < h; py++) {
      if (inside[py * w + px] && !inside[(py - 1) * w + px]) {
        tops.push(px, py);
        break;
      }
    }
  }
  const dOut = edt(inside, w, h);
  const dIn = edt(outside, w, h);
  const scale = opts.worldWidth / w;
  const data = new Uint16Array(w * h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px;
      const sd = (Math.sqrt(dOut[i]) - Math.sqrt(dIn[i])) * scale;
      // flip rows so uv (0,0) is bottom-left like the world
      data[(h - 1 - py) * w + px] = DataUtils.toHalfFloat(sd);
    }
  }
  const tex = new DataTexture(data, w, h, RedFormat, HalfFloatType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return {
    texture: tex,
    size: new Vector2(opts.worldWidth, (opts.worldWidth * h) / w),
    centers: centersPx.map((c) => (c - w / 2) * scale),
    height: (asc + desc) * s * scale,
    tops: Float32Array.from(tops, (v, i) => (i % 2 ? (h / 2 - v) * scale : (v - w / 2) * scale)),
    step: stepPx * scale,
  };
}

/** ten digits side by side in one field, each in its own equal slot */
export function digitField(family: string, worldDigitWidth: number, weight = 900) {
  const slotW = 160;
  const h = 240;
  const can = document.createElement("canvas");
  can.width = slotW * 10;
  can.height = h;
  const ctx = can.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${weight} 118px ${family}`;
  for (let i = 0; i < 10; i++) ctx.fillText(String(i), i * slotW + slotW / 2, h / 2 + 6);
  const w = can.width;
  const img = ctx.getImageData(0, 0, w, h).data;
  const inside = new Uint8Array(w * h);
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = img[i * 4 + 3] > 127;
    inside[i] = a ? 1 : 0;
    outside[i] = a ? 0 : 1;
  }
  const dOut = edt(inside, w, h);
  const dIn = edt(outside, w, h);
  const scale = worldDigitWidth / slotW;
  const data = new Uint16Array(w * h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px;
      const sd = (Math.sqrt(dOut[i]) - Math.sqrt(dIn[i])) * scale;
      data[(h - 1 - py) * w + px] = DataUtils.toHalfFloat(sd);
    }
  }
  const tex = new DataTexture(data, w, h, RedFormat, HalfFloatType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { texture: tex, slot: new Vector2(worldDigitWidth, (worldDigitWidth * h) / slotW) };
}
