import { ALL_GLYPHS } from "./glyphs";
import { countGlyphs } from "./stats";

export type GlyphCanvasOptions = {
  fontFamily: string;
  /** css px */
  fontSize: number;
  /** cell height = fontSize * lineHeight */
  lineHeight?: number;
  weight?: number;
  /** css colours for atlas drawing (put) */
  palette?: string[];
  charset?: string;
  maxDpr?: number;
};

const SPACE = 32;
const INDEX_SIZE = 0x2600;

/**
 * A canvas that only knows how to draw characters on a monospace grid.
 *
 * Two paths:
 *  - drawGrid: whole grid, one fillText per row (white), then the per-cell
 *    colours are composited in with `source-in` from a cols x rows image.
 *    Cheap enough for 10k+ cells a frame, any colour per cell.
 *  - put: single glyphs from a pre-rendered atlas, with free offsets and
 *    alpha, for shapes whose cells move.
 */
export class GlyphCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  cols = 0;
  rows = 0;
  cw = 8;
  ch = 14;
  dpr = 1;
  width = 0;
  height = 0;
  /** grid origin inside the canvas, css px (grid is centred) */
  ox = 0;
  oy = 0;
  palette: string[];

  private opts: Required<Omit<GlyphCanvasOptions, "palette">>;
  private atlases: (HTMLCanvasElement | null)[] = [];
  private index = new Int16Array(INDEX_SIZE).fill(-1);
  private tileW = 1;
  private tileH = 1;
  private colorCanvas: HTMLCanvasElement;
  private colorCtx: CanvasRenderingContext2D;
  private colorImage: ImageData | null = null;
  private rowBuf: Uint16Array = new Uint16Array(0);

  constructor(canvas: HTMLCanvasElement, options: GlyphCanvasOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.opts = {
      fontFamily: options.fontFamily,
      fontSize: options.fontSize,
      lineHeight: options.lineHeight ?? 1.2,
      weight: options.weight ?? 500,
      charset: options.charset ?? ALL_GLYPHS,
      maxDpr: options.maxDpr ?? 2,
    };
    this.palette = options.palette ?? ["#ffffff"];
    const cs = this.opts.charset;
    for (let i = 0; i < cs.length; i++) {
      const code = cs.charCodeAt(i);
      if (code < INDEX_SIZE) this.index[code] = i;
    }
    this.colorCanvas = document.createElement("canvas");
    const cctx = this.colorCanvas.getContext("2d", { willReadFrequently: false });
    if (!cctx) throw new Error("2d context unavailable");
    this.colorCtx = cctx;
    this.measure();
  }

  get fontSize() {
    return this.opts.fontSize;
  }

  font(scale = 1) {
    return `${this.opts.weight} ${this.opts.fontSize * scale}px ${this.opts.fontFamily}`;
  }

  setFontSize(size: number) {
    if (size === this.opts.fontSize) return;
    this.opts.fontSize = size;
    this.measure();
    this.atlases = [];
    // the grid depends on the cell size: make the next resize() rebuild it
    this.width = 0;
    this.height = 0;
  }

  private measure() {
    this.ctx.font = this.font();
    this.cw = this.ctx.measureText("M").width || this.opts.fontSize * 0.6;
    this.ch = Math.round(this.opts.fontSize * this.opts.lineHeight);
  }

  /** css px; grid fills it, centred */
  resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr);
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.width && h === this.height && dpr === this.dpr) return false;
    this.width = w;
    this.height = h;
    if (dpr !== this.dpr) this.atlases = [];
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.measure();
    this.cols = Math.max(1, Math.floor(w / this.cw));
    this.rows = Math.max(1, Math.floor(h / this.ch));
    this.ox = (w - this.cols * this.cw) / 2;
    this.oy = (h - this.rows * this.ch) / 2;
    this.colorCanvas.width = this.cols;
    this.colorCanvas.height = this.rows;
    this.colorImage = this.colorCtx.createImageData(this.cols, this.rows);
    this.rowBuf = new Uint16Array(this.cols);
    return true;
  }

  setPalette(palette: string[]) {
    this.palette = palette;
    this.atlases = [];
  }

  clear() {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private buildAtlas(color: number) {
    const cs = this.opts.charset;
    this.tileW = Math.ceil(this.cw * this.dpr) + 2;
    this.tileH = Math.ceil(this.ch * this.dpr) + 2;
    const atlas = document.createElement("canvas");
    atlas.width = cs.length * this.tileW;
    atlas.height = this.tileH;
    const actx = atlas.getContext("2d");
    if (!actx) throw new Error("2d context unavailable");
    actx.font = this.font(this.dpr);
    actx.fillStyle = this.palette[color] ?? "#fff";
    actx.textBaseline = "middle";
    actx.textAlign = "center";
    for (let i = 0; i < cs.length; i++) {
      actx.fillText(cs[i], i * this.tileW + this.tileW / 2, this.tileH / 2);
    }
    this.atlases[color] = atlas;
    return atlas;
  }

  /** one glyph at css px (x,y) = top-left of its cell */
  put(code: number, x: number, y: number, color: number, alpha = 1) {
    if (code === SPACE || code >= INDEX_SIZE) return;
    const t = this.index[code];
    if (t < 0) return;
    const atlas = this.atlases[color] ?? this.buildAtlas(color);
    const { ctx, dpr, tileW, tileH } = this;
    if (alpha !== 1) ctx.globalAlpha = alpha < 0 ? 0 : alpha;
    ctx.drawImage(
      atlas,
      t * tileW,
      0,
      tileW,
      tileH,
      Math.round((x + this.ox) * dpr) - 1,
      Math.round((y + this.oy) * dpr) - 1,
      tileW,
      tileH,
    );
    if (alpha !== 1) ctx.globalAlpha = 1;
    countGlyphs(1);
  }

  /**
   * Paints a solid block behind every non-empty cell onto another canvas of
   * the same size, so whatever is layered further back is hidden.
   */
  knockout(target: HTMLCanvasElement, chars: Uint16Array, color: string) {
    const { cols, rows, dpr, cw, ch } = this;
    if (target.width !== this.canvas.width || target.height !== this.canvas.height) {
      target.width = this.canvas.width;
      target.height = this.canvas.height;
      target.style.width = this.canvas.style.width;
      target.style.height = this.canvas.style.height;
    }
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.fillStyle = color;
    for (let r = 0; r < rows; r++) {
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        const on = c < cols && chars[r * cols + c] !== SPACE;
        if (on && start < 0) start = c;
        if (!on && start >= 0) {
          ctx.fillRect(
            Math.floor((this.ox + start * cw) * dpr),
            Math.floor((this.oy + r * ch) * dpr),
            Math.ceil((c - start) * cw * dpr) + 1,
            Math.ceil(ch * dpr) + 1,
          );
          start = -1;
        }
      }
    }
  }

  /**
   * Whole-grid render. `chars` holds a char code per cell (32 = empty),
   * `rgba` a colour per cell (alpha multiplies the glyph).
   */
  drawGrid(chars: Uint16Array, rgba: Uint8ClampedArray) {
    const { ctx, cols, rows, dpr, cw, ch } = this;
    if (!this.colorImage) return;
    this.clear();
    ctx.font = this.font(dpr);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const buf = this.rowBuf;
    const x0 = this.ox * dpr;
    let drawn = 0;
    for (let r = 0; r < rows; r++) {
      let any = false;
      const base = r * cols;
      for (let c = 0; c < cols; c++) {
        const code = chars[base + c];
        buf[c] = code;
        if (code !== SPACE) {
          any = true;
          drawn++;
        }
      }
      if (!any) continue;
      const line = String.fromCharCode.apply(null, buf as unknown as number[]);
      ctx.fillText(line, x0, (this.oy + r * ch + ch / 2) * dpr);
    }
    this.colorImage.data.set(rgba);
    this.colorCtx.putImageData(this.colorImage, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.colorCanvas,
      0,
      0,
      cols,
      rows,
      x0,
      this.oy * dpr,
      cols * cw * dpr,
      rows * ch * dpr,
    );
    ctx.globalCompositeOperation = "source-over";
    countGlyphs(drawn);
  }
}
