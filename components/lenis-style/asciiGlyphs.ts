/* The glyph side of the "source code" scan (asciiScan.ts), shared by the main
   thread and the worker that normally does this work (ascii.worker.ts) — so
   nothing in here may touch the DOM, GSAP or `window`. */

/** Darkest to brightest. Code punctuation on purpose: the footage turns into
    something that reads like its own source. */
export const RAMP = " .:-=+*<>/{}[]()#%&@";
export const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace';

/* the page's own colours (globals.css :root): rust in the shadows, terracotta
   in the mids, cream in the lights */
const RUST = [124, 50, 30];
const ACCENT = [217, 119, 87];
export const LIGHT = [242, 237, 230];
/** How much of the footage's own colour survives the terracotta grade. */
const SOURCE_TINT = 0.35;
/** Least brightness a glyph keeps, in the dark background of a dark scene. */
const QUIET = 0.5;

/** One scan's grid: the frame in CSS px, the glyph cell, and the font whose
    glyphs are exactly one cell wide. */
export type Layout = {
  width: number;
  height: number;
  dpr: number;
  cell: number;
  row: number;
  font: string;
  cols: number;
  rows: number;
};

export type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A cell's colour: the terracotta grade of its brightness with a little of
    the footage's own colour in it, dimmed toward the ink by `strength`. */
function grade(r: number, g: number, b: number, light: number, strength: number) {
  const low = light < 0.5;
  const from = low ? RUST : ACCENT;
  const to = low ? ACCENT : LIGHT;
  const t = low ? light * 2 : light * 2 - 1;
  const mix = (i: number, own: number) =>
    ((from[i] + (to[i] - from[i]) * t) * (1 - SOURCE_TINT) + own * SOURCE_TINT) * strength | 0;
  return `rgb(${mix(0, r)},${mix(1, g)},${mix(2, b)})`;
}

/** The frame's dominant tone (its median brightness) and how far the rest
    of it strays from that, from a 64-bin histogram. */
function backdrop(lights: Float32Array, count: number) {
  const bins = new Uint16Array(64);
  for (let i = 0; i < count; i++) bins[Math.min(63, (lights[i] * 64) | 0)]++;
  const at = (share: number) => {
    let seen = 0;
    for (let bin = 0; bin < 64; bin++) {
      seen += bins[bin];
      if (seen >= count * share) return (bin + 0.5) / 64;
    }
    return 1;
  };
  const median = at(0.5);
  return { median, spread: Math.max(0.18, median - at(0.04), at(0.96) - median) };
}

let lights = new Float32Array(0);

/**
 * Reads a frame at one pixel per cell (`paint` draws it into `sample`) and
 * sets every cell's glyph, in its colour, into `glyphs` — a canvas the size
 * of the frame in device pixels.
 *
 * The glyph doesn't follow brightness itself but how far a cell is from the
 * frame's own background tone, so a bright scene doesn't turn into a wall of
 * "@" and the subject reads on any footage: the background becomes a field of
 * dots, the subject dense code. Brightness goes into the colour instead — a
 * bright background is a field of bright dots.
 */
export function setGlyphs(
  glyphs: Context2D,
  sample: Context2D,
  layout: Layout,
  paint: (into: Context2D) => void,
) {
  const { cols, rows, cell, row, dpr } = layout;
  if (sample.canvas.width !== cols || sample.canvas.height !== rows) {
    sample.canvas.width = cols;
    sample.canvas.height = rows;
  }
  sample.clearRect(0, 0, cols, rows);
  paint(sample);
  const pixels = sample.getImageData(0, 0, cols, rows).data;

  const count = cols * rows;
  if (lights.length < count) lights = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    lights[i] = (0.3 * pixels[i * 4] + 0.59 * pixels[i * 4 + 1] + 0.11 * pixels[i * 4 + 2]) / 255;
  }
  const { median, spread } = backdrop(lights, count);

  const pixelsW = Math.round(layout.width * dpr);
  const pixelsH = Math.round(layout.height * dpr);
  if (glyphs.canvas.width !== pixelsW || glyphs.canvas.height !== pixelsH) {
    glyphs.canvas.width = pixelsW;
    glyphs.canvas.height = pixelsH;
  }
  glyphs.setTransform(dpr, 0, 0, dpr, 0, 0);
  glyphs.clearRect(0, 0, layout.width, layout.height);
  glyphs.font = layout.font;
  glyphs.textBaseline = "top";
  const steps = RAMP.length - 2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const light = lights[i];
      const detail = Math.pow(Math.min(1, Math.abs(light - median) / spread), 0.8);
      const glow = Math.pow(Math.max(0, light - 0.06) / 0.94, 0.85);
      glyphs.fillStyle = grade(
        pixels[i * 4],
        pixels[i * 4 + 1],
        pixels[i * 4 + 2],
        light,
        QUIET + (1 - QUIET) * Math.max(detail, glow),
      );
      glyphs.fillText(RAMP[1 + Math.round(detail * steps)], x * cell, y * row);
    }
  }
}
