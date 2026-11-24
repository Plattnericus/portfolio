import { GlyphCanvas } from "./glyph-canvas";
import { Shape } from "./shape";

/*
 * A small black hole, printed in characters. Per cell, every frame:
 *  - background stars, bent by a point-mass lens (they smear into arcs
 *    near the Einstein radius and show a mirrored image inside it)
 *  - the accretion disk, a tilted ring with differential rotation and
 *    Doppler beaming; its far side is lensed up over the top of the shadow
 *  - the photon ring and the shadow itself
 * The 404 sits beside it as lit ASCII lettering. Its cells peel off one by
 * one, fall in on spiral paths drawn as streaks, and grow back later.
 */

const RAMP = " .,:;-=+*#%@";
const RN = RAMP.length - 1;
const SPACE = 32;
const TILT = 0.1;
const DISK_IN = 1.55;
const DISK_OUT = 4.4;
const EINSTEIN2 = 2.1 * 2.1;
const PARTICLE_COLORS = ["#efeae2", "#ffd9b8", "#ffa774", "#ff5a2e", "#b23a1e", "#5e1c10"];

/** glyph for a line running along (tx, ty), screen y down */
function lineGlyph(tx: number, ty: number) {
  let o = Math.atan2(ty, tx);
  if (o < 0) o += Math.PI;
  const s = Math.round(o / (Math.PI / 4)) % 4;
  return s === 0 ? 45 : s === 1 ? 92 : s === 2 ? 124 : 47;
}

/** blackbody-ish ramp for the disk, t = 0 cool .. 1 hot */
function heat(t: number, out: Float32Array) {
  const stops = [
    [0, 70, 22, 14],
    [0.25, 196, 62, 34],
    [0.5, 255, 110, 52],
    [0.75, 255, 190, 118],
    [1, 255, 246, 226],
  ];
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const a = stops[i];
  const b = stops[i + 1];
  const k = (t - a[0]) / (b[0] - a[0]);
  out[0] = a[1] + (b[1] - a[1]) * k;
  out[1] = a[2] + (b[2] - a[2]) * k;
  out[2] = a[3] + (b[3] - a[3]) * k;
}

function hash(x: number, y: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Layout = {
  hx: number;
  hy: number;
  R: number;
  /** box the 404 is set in, css px */
  text: { x: number; y: number; w: number; h: number };
};

export class BlackHole {
  readonly gc: GlyphCanvas;
  private chars = new Uint16Array(0);
  private rgba = new Uint8ClampedArray(0);
  private shape = new Shape();
  private displayFamily: string;
  private layout: Layout = { hx: 0, hy: 0, R: 40, text: { x: 0, y: 0, w: 1, h: 1 } };
  /** 404 cells: code and colour when at home, and whether they are */
  private homeCode = new Uint16Array(0);
  private homeRGB = new Uint8ClampedArray(0);
  private homeOn = new Uint8Array(0);
  private homeBack = new Float32Array(0);
  private homeBorn = new Float32Array(0);
  private homeList: number[] = [];
  private px: number[] = [];
  private py: number[] = [];
  private vx: number[] = [];
  private vy: number[] = [];
  private pc: number[] = [];
  private pcell: number[] = [];
  private G = 1e7;
  private hx = 0;
  private hy = 0;
  private col = new Float32Array(3);
  private time = 0;
  /** extra pull, e.g. after a click; decays */
  feed = 0;
  /** pointer in css px, or null */
  pointer: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, fontFamily: string, displayFamily: string) {
    this.gc = new GlyphCanvas(canvas, {
      fontFamily,
      fontSize: 7,
      lineHeight: 1.18,
      weight: 600,
      palette: PARTICLE_COLORS,
    });
    this.displayFamily = displayFamily;
  }

  resize(w: number, h: number, layout: Layout, fontSize: number) {
    this.gc.setFontSize(fontSize);
    this.gc.resize(w, h);
    this.layout = layout;
    this.hx = layout.hx;
    this.hy = layout.hy;
    const { cols, rows } = this.gc;
    const n = cols * rows;
    this.chars = new Uint16Array(n);
    this.rgba = new Uint8ClampedArray(n * 4);
    this.buildText();
    // fall time of about three seconds from the middle of the 404
    const t = layout.text;
    const D = Math.hypot(t.x + t.w / 2 - layout.hx, t.y + t.h / 2 - layout.hy);
    const fall = 3.2 / (Math.PI / 2);
    this.G = (D * D * D) / 2 / (fall * fall);
    this.px = [];
    this.py = [];
    this.vx = [];
    this.vy = [];
    this.pc = [];
    this.pcell = [];
  }

  private buildText() {
    const { cols, rows, cw, ch } = this.gc;
    const n = cols * rows;
    const box = this.layout.text;
    const fam = this.displayFamily;
    this.shape.build(
      cols,
      rows,
      cw,
      ch,
      (ctx) => {
        const bx = box.x - this.gc.ox;
        const by = box.y - this.gc.oy;
        let size = box.h;
        ctx.font = `800 ${size}px ${fam}`;
        const w = ctx.measureText("404").width;
        if (w > box.w) size *= box.w / w;
        ctx.font = `800 ${size}px ${fam}`;
        ctx.textBaseline = "middle";
        ctx.fillText("404", bx, by + box.h / 2);
      },
      Math.max(8, cw * 3),
    );
    this.homeCode = new Uint16Array(n);
    this.homeRGB = new Uint8ClampedArray(n * 3);
    this.homeOn = new Uint8Array(n);
    this.homeBack = new Float32Array(n);
    this.homeBorn = new Float32Array(n).fill(-10);
    this.homeList = [];
    const { cells, count, nx, ny, nz, edge, cov } = this.shape;
    for (let k = 0; k < count; k++) {
      const i = cells[k];
      const diff = Math.max(0, nx[i] * -0.5 + ny[i] * -0.55 + nz[i] * 0.67);
      let lum = Math.min(1, 0.22 + diff * 0.9);
      let code: number;
      if (edge[i]) {
        code = edge[i];
        lum = 0.5 + 0.4 * cov[i];
      } else code = RAMP.charCodeAt(Math.min(RN, Math.max(3, Math.round(lum * RN))));
      this.homeCode[i] = code;
      const g = 90 + lum * 165;
      this.homeRGB[i * 3] = g;
      this.homeRGB[i * 3 + 1] = g * 0.96;
      this.homeRGB[i * 3 + 2] = g * 0.9;
      this.homeOn[i] = 1;
      this.homeList.push(i);
    }
  }

  private detach(dt: number) {
    const { cols, cw, ch } = this.gc;
    const box = this.layout.text;
    const list = this.homeList;
    if (!list.length) return;
    const rate = (14 + this.feed * 160) * dt;
    let budget = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    let tries = budget * 6;
    while (budget > 0 && tries-- > 0) {
      const i = list[(Math.random() * list.length) | 0];
      if (!this.homeOn[i]) continue;
      const c = i % cols;
      const r = (i / cols) | 0;
      const x = this.gc.ox + (c + 0.5) * cw;
      const y = this.gc.oy + (r + 0.5) * ch;
      // the side facing the hole goes first
      const toward = (x - box.x) / box.w;
      const facing = this.layout.hx > box.x + box.w / 2 ? toward : 1 - toward;
      if (Math.random() > Math.pow(Math.max(0, facing), 4) + 0.02) continue;
      this.homeOn[i] = 0;
      this.px.push(x);
      this.py.push(y);
      this.vx.push((Math.random() - 0.5) * 30);
      this.vy.push(-20 - Math.random() * 40);
      this.pc.push(this.homeCode[i]);
      this.pcell.push(i);
      budget--;
    }
  }

  private step(dt: number) {
    const { hx, hy } = this;
    const R = this.layout.R;
    const G = this.G * (1 + this.feed * 1.5);
    for (let k = this.px.length - 1; k >= 0; k--) {
      let x = this.px[k];
      let y = this.py[k];
      let vx = this.vx[k];
      let vy = this.vy[k];
      for (let s = 0; s < 2; s++) {
        const h = dt / 2;
        const dx = hx - x;
        const dy = hy - y;
        const d2 = Math.max(dx * dx + dy * dy, R * R * 0.25);
        const d = Math.sqrt(d2);
        const a = G / d2;
        // pull inwards plus a swirl, so they spiral rather than drop
        vx += ((dx / d) * a + (-dy / d) * a * 0.42) * h;
        vy += ((dy / d) * a + (dx / d) * a * 0.42 * TILT * 2) * h;
        vx *= 1 - 0.12 * h;
        vy *= 1 - 0.12 * h;
        x += vx * h;
        y += vy * h;
      }
      const dd = Math.hypot(hx - x, hy - y);
      if (dd < R * 1.02) {
        // swallowed; the cell grows back on the letter some seconds later
        const cell = this.pcell[k];
        this.homeBack[cell] = this.time + 5 + Math.random() * 9;
        const last = this.px.length - 1;
        this.px[k] = this.px[last];
        this.py[k] = this.py[last];
        this.vx[k] = this.vx[last];
        this.vy[k] = this.vy[last];
        this.pc[k] = this.pc[last];
        this.pcell[k] = this.pcell[last];
        this.px.pop();
        this.py.pop();
        this.vx.pop();
        this.vy.pop();
        this.pc.pop();
        this.pcell.pop();
        continue;
      }
      this.px[k] = x;
      this.py[k] = y;
      this.vx[k] = vx;
      this.vy[k] = vy;
    }
  }

  render(time: number, dt: number, still = false) {
    this.time = time;
    const { gc, chars, rgba, col } = this;
    const { cols, rows, cw, ch, ox, oy } = gc;
    const L = this.layout;
    const R = L.R;
    this.feed = Math.max(0, this.feed - dt * 0.8);

    // the hole leans a little towards the pointer
    let tx = L.hx;
    let ty = L.hy;
    if (this.pointer && !still) {
      tx += Math.max(-1, Math.min(1, (this.pointer.x - L.hx) / (R * 8))) * R * 0.6;
      ty += Math.max(-1, Math.min(1, (this.pointer.y - L.hy) / (R * 8))) * R * 0.4;
    }
    this.hx += (tx - this.hx) * Math.min(1, dt * 2.5);
    this.hy += (ty - this.hy) * Math.min(1, dt * 2.5);
    const hx = this.hx;
    const hy = this.hy;

    const spin = still ? 0 : time;
    const drift = still ? 0 : time * 0.06;
    // one star cell per character cell, far from the hole
    const SX = R / cw;
    const SY = R / ch;
    const invR = 1 / R;

    for (let r = 0; r < rows; r++) {
      const y = oy + (r + 0.5) * ch;
      const dy = (y - hy) * invR;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const o = i * 4;
        const x = ox + (c + 0.5) * cw;
        const dx = (x - hx) * invR;
        const rr2 = dx * dx + dy * dy;
        const rr = Math.sqrt(rr2);
        let b = 0;
        let code = SPACE;
        let cr = 0;
        let cg = 0;
        let cb = 0;

        // far side of the disk, lensed into an arc over the shadow and a
        // thinner one under it
        if (rr > 1.03 && rr < 2) {
          const up = Math.max(0, -dy / rr);
          const down = Math.max(0, dy / rr);
          const width = 0.1 + 0.62 * Math.pow(up, 1.5) + 0.24 * Math.pow(down, 1.5);
          const band = 1 - (rr - 1.06) / width;
          if (band > 0) {
            const th = Math.atan2(dy, dx);
            const tex = 0.5 + 0.5 * Math.sin(th * 7 - spin * 1.6 + rr * 5);
            b = Math.min(1, Math.pow(band, 1.2) * (0.6 + 0.4 * tex) * (0.75 + 0.35 * Math.cos(th + Math.PI - 0.35)));
            heat(0.5 + band * 0.5, col);
            cr = col[0];
            cg = col[1];
            cb = col[2];
            code = b > 0.42 ? RAMP.charCodeAt(Math.min(RN, Math.round(3 + b * (RN - 3)))) : lineGlyph(-dy, dx);
          }
        }

        // photon ring
        if (rr > 0.97 && rr < 1.1) {
          const ring = 1 - Math.abs(rr - 1.035) / 0.065;
          if (ring > 0 && ring > b) {
            b = ring;
            cr = 255;
            cg = 236;
            cb = 210;
            code = lineGlyph(-dy, dx);
          }
        }

        // the disk itself; its near half passes in front of the shadow
        const v = dy / TILT;
        const rd = Math.sqrt(dx * dx + v * v);
        if (rd > DISK_IN && rd < DISK_OUT && (dy > 0 || rr > 1.02)) {
          const th = Math.atan2(v, dx);
          const om = 2.2 * Math.pow(rd, -1.5);
          const ph = th + spin * om;
          const tex = Math.pow(
            0.6 * (0.5 + 0.5 * Math.sin(ph * 4 + rd * 9)) + 0.4 * (0.5 + 0.5 * Math.sin(ph * 11 - rd * 17 + 1.7)),
            1.5,
          );
          const edge =
            Math.min(1, (rd - DISK_IN) / 0.35) * Math.min(1, Math.max(0, (DISK_OUT - rd) / 1.6));
          const doppler = 1 + 0.6 * Math.cos(th + 0.35);
          const bd = Math.min(1, edge * (0.3 + 0.7 * tex) * doppler * (1.25 - (rd - DISK_IN) / (DISK_OUT - DISK_IN) * 0.6));
          if (bd > 0.06 && (dy > 0 || bd > b)) {
            b = bd;
            heat(1 - (rd - DISK_IN) / (DISK_OUT - DISK_IN) * 0.85 + (doppler - 1) * 0.25, col);
            cr = col[0];
            cg = col[1];
            cb = col[2];
            // dense where it is bright, streaks along the orbit elsewhere
            code = bd > 0.5 ? RAMP.charCodeAt(Math.min(RN, Math.round(3 + bd * (RN - 3)))) : lineGlyph(-v, dx * TILT);
          }
        }

        if (rr < 1 && b < 0.06) {
          chars[i] = SPACE;
          rgba[o + 3] = 0;
          continue;
        }

        // lensed stars where nothing else is lit
        if (b < 0.06) {
          const k = 1 - EINSTEIN2 / Math.max(rr2, 0.0001);
          const sx = Math.floor((dx * k + drift) * SX);
          const sy = Math.floor(dy * k * SY);
          const h = hash(sx, sy);
          if (h < 0.005) {
            const m = h / 0.005;
            const tw = 0.7 + 0.3 * Math.sin(time * (1.5 + m * 3) + m * 50);
            b = (0.25 + 0.75 * (1 - m)) * tw;
            code = b > 0.75 ? 42 : b > 0.45 ? 43 : 46;
            cr = 200;
            cg = 210;
            cb = 232;
          } else {
            chars[i] = SPACE;
            rgba[o + 3] = 0;
            continue;
          }
        }

        chars[i] = code;
        const lift = 0.45 + 0.55 * Math.min(1, b);
        rgba[o] = cr * lift;
        rgba[o + 1] = cg * lift;
        rgba[o + 2] = cb * lift;
        rgba[o + 3] = 255;
      }
    }

    // the 404, minus whatever has fallen in
    if (!still) {
      this.detach(dt);
      this.step(Math.min(dt, 1 / 30));
    }
    const list = this.homeList;
    const tick = (time * 24) | 0;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const o = i * 4;
      if (!this.homeOn[i]) {
        const back = this.homeBack[i];
        if (back && time > back) {
          this.homeOn[i] = 1;
          this.homeBack[i] = 0;
          this.homeBorn[i] = time;
        } else continue;
      }
      // cells that just grew back flicker through a few glyphs first
      const since = time - this.homeBorn[i];
      chars[i] = since < 0.3 ? RAMP.charCodeAt(1 + ((i + tick) % RN)) : this.homeCode[i];
      rgba[o] = this.homeRGB[i * 3];
      rgba[o + 1] = this.homeRGB[i * 3 + 1];
      rgba[o + 2] = this.homeRGB[i * 3 + 2];
      rgba[o + 3] = 255;
    }

    gc.drawGrid(chars, rgba);

    // falling cells, stretched along their path and reddened as they go
    for (let k = 0; k < this.px.length; k++) {
      const x = this.px[k];
      const y = this.py[k];
      const vx = this.vx[k];
      const vy = this.vy[k];
      const sp = Math.hypot(vx, vy);
      const d = Math.hypot(hx - x, hy - y) / R;
      const ci = Math.min(PARTICLE_COLORS.length - 1, Math.max(0, Math.floor((1 - Math.min(1, (d - 1) / 6)) * 5)));
      const g = sp > 140 ? lineGlyph(vx, vy) : this.pc[k];
      gc.put(g, x - ox - cw / 2, y - oy - ch / 2, ci, Math.min(1, 0.4 + d / 3));
    }
  }
}
