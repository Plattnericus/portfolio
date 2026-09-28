import { gsap } from "@/lib/animation";
import { LIGHT, MONO, RAMP, setGlyphs, type Layout } from "./asciiGlyphs";

/** Roughly how many glyph columns span a clip; the cell width (px) that
    comes out of it is kept between these — fine enough for detail, never so
    small the glyphs turn to mush. */
const COLUMNS = 88;
const CELL_MIN = 4.5;
const CELL_MAX = 7;
/** Row height as a share of the glyph size: the lines of a tight terminal. */
const LEADING = 1.08;
/** Columns of random glyphs running ahead of the reveal — the scan head. */
const HEAD = 2.5;
/** Least time (ms) between two reads of the clip: its own frame rate. */
const SAMPLE_MS = 32;
const INK = "rgba(11, 9, 8, 0.94)";
const HEAD_INK = `rgb(${LIGHT.join(",")})`;

type Source = { el: CanvasImageSource; width: number; height: number };

/** "50% 30%" → [0.5, 0.3]; anything that isn't a percentage centres. */
function objectPosition(video: HTMLVideoElement): [number, number] {
  const [x, y] = getComputedStyle(video)
    .objectPosition.split(" ")
    .map((part) => (part.endsWith("%") ? parseFloat(part) / 100 : NaN));
  return [Number.isFinite(x) ? x : 0.5, Number.isFinite(y) ? y : 0.5];
}

/** Width of one monospace glyph per px of font size, measured once. */
let advance = 0;
function glyphAdvance(ctx: CanvasRenderingContext2D) {
  if (!advance) {
    ctx.font = `700 100px ${MONO}`;
    advance = ctx.measureText("0").width / 100 || 0.6;
  }
  return advance;
}

/* One worker for every card sets the glyphs (ascii.worker.ts). Undefined
   until first asked for; null where it can't run — then each scan sets its
   glyphs on the main thread instead. */
let worker: Worker | null | undefined;
let nextRequest = 1;
const waiting = new Map<number, (bitmap: ImageBitmap | null) => void>();

function glyphWorker() {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return worker;
  try {
    const started = new Worker(new URL("./ascii.worker.ts", import.meta.url));
    started.onmessage = (event: MessageEvent<{ id: number; bitmap: ImageBitmap | null }>) => {
      const done = waiting.get(event.data.id);
      waiting.delete(event.data.id);
      if (done) done(event.data.bitmap);
      else event.data.bitmap?.close();
    };
    started.onerror = () => {
      worker = null;
      started.terminate();
      waiting.forEach((done) => done(null));
      waiting.clear();
    };
    worker = started;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * The "source code" look of a project card: the clip, redrawn as glyphs on
 * the page ink, sweeping in from the left behind a flickering scan head and
 * back out again. It samples exactly what the frame shows — the clip's
 * object-fit crop, the hover zoom and the scroll parallax included — so the
 * glyphs line up with the footage underneath at the scan edge.
 *
 * The work is split by how often it has to happen. At most once per video
 * frame the clip is shrunk to one pixel per cell (createImageBitmap, off the
 * main thread) and handed to the worker, which reads it back and sets the
 * glyphs into a layer. Per animation frame there is only the sweep: that
 * layer cut off at the head, plus a few columns of random glyphs — and once
 * the sweep is done, not even that until the next set of glyphs. It only
 * runs on GSAP's ticker while the scan is (partly) showing.
 */
export function createAsciiScan(
  frame: HTMLElement,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  poster: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const state = { reveal: 0 };
  const [posX, posY] = objectPosition(video);
  let still: HTMLImageElement | null = null;
  let tween: gsap.core.Tween | null = null;
  let running = false;

  /* the finished glyphs (a bitmap from the worker, or the main-thread layer)
     and the layout they were set in */
  let layer: CanvasImageSource | null = null;
  let setIn: Layout | null = null;
  let sampledAt = -Infinity;
  let sampledTime = NaN;
  let sampledCrop = "";
  let reading = false;
  let generation = 0;
  /* the main-thread way, for when the worker (or createImageBitmap) can't */
  let mainThread: { sample: CanvasRenderingContext2D; glyphs: CanvasRenderingContext2D } | null =
    null;
  /* what the canvas shows, to skip frames where nothing changed */
  let painted = NaN;
  let dirty = true;

  /* the playing clip, or its poster while the clip hasn't decoded a frame */
  const source = (): Source | null => {
    if (video.readyState >= 2 && video.videoWidth) {
      return { el: video, width: video.videoWidth, height: video.videoHeight };
    }
    if (!still) {
      still = new Image();
      still.decoding = "async";
      still.src = poster;
    }
    if (still.complete && still.naturalWidth) {
      return { el: still, width: still.naturalWidth, height: still.naturalHeight };
    }
    return null;
  };

  const layoutFor = (width: number, height: number): Layout => {
    const cell = gsap.utils.clamp(CELL_MIN, CELL_MAX, width / COLUMNS);
    /* sized so a glyph is exactly one cell wide: a whole run of glyphs then
       lands on the grid from a single fillText (the scan head) */
    const size = cell / glyphAdvance(ctx);
    const row = size * LEADING;
    return {
      width,
      height,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      cell,
      row,
      font: `700 ${size.toFixed(2)}px ${MONO}`,
      cols: Math.ceil(width / cell),
      rows: Math.ceil(height / row),
    };
  };

  const takeLayer = (next: CanvasImageSource, layout: Layout) => {
    if (layer instanceof ImageBitmap && layer !== next) layer.close();
    layer = next;
    setIn = layout;
    dirty = true;
  };

  const onMainThread = (layout: Layout, paint: (into: CanvasRenderingContext2D) => void) => {
    if (!mainThread) {
      const sample = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const glyphs = document.createElement("canvas").getContext("2d");
      if (!sample || !glyphs) return;
      mainThread = { sample, glyphs };
    }
    setGlyphs(mainThread.glyphs, mainThread.sample, layout, (into) =>
      paint(into as CanvasRenderingContext2D),
    );
    takeLayer(mainThread.glyphs.canvas, layout);
  };

  /* Reads the frame the card shows at one pixel per cell — only for a new
     video frame or a changed crop, at most SAMPLE_MS apart. */
  const resample = (media: Source, box: DOMRect, view: DOMRect, layout: Layout) => {
    /* The crop the frame actually shows. The clip is object-fit: cover in
       its own box, and that box is scaled and shifted by the hover zoom and
       the parallax — its screen rect carries both. */
    const cover = Math.max(video.offsetWidth / media.width, video.offsetHeight / media.height);
    const scale = cover * (box.width / video.offsetWidth || 1);
    const sx = (media.width - video.offsetWidth / cover) * posX + (view.left - box.left) / scale;
    const sy = (media.height - video.offsetHeight / cover) * posY + (view.top - box.top) / scale;
    const sw = layout.width / scale;
    const sh = layout.height / scale;
    const { cols, rows } = layout;

    const offThread = typeof createImageBitmap === "function" ? glyphWorker() : null;
    if (!offThread) {
      onMainThread(layout, (into) => into.drawImage(media.el, sx, sy, sw, sh, 0, 0, cols, rows));
      return;
    }
    reading = true;
    const read = generation;
    const giveUp = () => {
      reading = false;
      worker = null;
      sampledCrop = "";
    };
    createImageBitmap(
      media.el as ImageBitmapSource,
      Math.round(sx),
      Math.round(sy),
      Math.max(1, Math.round(sw)),
      Math.max(1, Math.round(sh)),
      { resizeWidth: cols, resizeHeight: rows, resizeQuality: "medium" },
    )
      .then((shrunk) => {
        const id = nextRequest++;
        waiting.set(id, (bitmap) => {
          if (!bitmap) {
            giveUp();
            return;
          }
          reading = false;
          if (read === generation) takeLayer(bitmap, layout);
          else bitmap.close();
        });
        offThread.postMessage({ id, frame: shrunk, layout }, [shrunk]);
      })
      /* a browser that can't shrink a video this way: the main thread */
      .catch(giveUp);
  };

  const draw = () => {
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    if (!width || !height) return;
    const layout = layoutFor(width, height);
    const { cols, rows, cell, row, dpr } = layout;

    const media = source();
    if (media) {
      const box = video.getBoundingClientRect();
      const view = frame.getBoundingClientRect();
      const time = media.el === video ? video.currentTime : -1;
      /* the clip's place inside the frame — the row sliding past moves
         both together and changes nothing */
      const crop = `${box.left - view.left}|${box.top - view.top}|${box.width}|${cols}|${rows}`;
      const now = performance.now();
      if (
        !reading &&
        (time !== sampledTime || crop !== sampledCrop) &&
        now - sampledAt >= SAMPLE_MS
      ) {
        resample(media, box, view, layout);
        sampledAt = now;
        sampledTime = time;
        sampledCrop = crop;
      }
    }
    /* the head flickers while it sweeps; a finished scan only repaints for
       a new set of glyphs */
    if (!dirty && state.reveal === painted) return;
    dirty = false;
    painted = state.reveal;

    const pixelsW = Math.round(width * dpr);
    const pixelsH = Math.round(height * dpr);
    if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
      canvas.width = pixelsW;
      canvas.height = pixelsH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (state.reveal <= 0) return;

    /* the head starts off the left edge and ends off the right one */
    const head = state.reveal * (cols + HEAD * 2 + 4) - HEAD - 2;
    const edge = gsap.utils.clamp(0, width, head * cell);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, edge, height);
    if (layer && setIn && setIn.cols === cols && setIn.rows === rows && edge > 0) {
      ctx.drawImage(layer, 0, 0, Math.min(pixelsW, edge * dpr), pixelsH, 0, 0, edge, height);
    }

    const from = Math.max(0, Math.ceil(head - HEAD));
    const to = Math.min(cols - 1, Math.floor(head + HEAD));
    if (to < from) return;
    ctx.font = layout.font;
    ctx.textBaseline = "top";
    ctx.fillStyle = HEAD_INK;
    for (let y = 0; y < rows; y++) {
      let run = "";
      for (let x = from; x <= to; x++) run += RAMP[1 + ((Math.random() * (RAMP.length - 1)) | 0)];
      ctx.fillText(run, from * cell, y * row);
    }
  };

  const start = () => {
    if (running) return;
    running = true;
    gsap.ticker.add(draw);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    gsap.ticker.remove(draw);
    generation++;
    reading = false;
    if (layer instanceof ImageBitmap) layer.close();
    layer = null;
    setIn = null;
    sampledTime = NaN;
    sampledCrop = "";
    painted = NaN;
    /* hand the bitmaps back: they only exist while the scan is showing */
    canvas.width = 0;
    canvas.height = 0;
    if (mainThread) {
      mainThread.glyphs.canvas.width = 0;
      mainThread.glyphs.canvas.height = 0;
    }
  };

  return {
    show() {
      start();
      tween?.kill();
      tween = gsap.to(state, { reveal: 1, duration: 0.7, ease: "power1.inOut" });
    },
    hide() {
      if (!running) return;
      tween?.kill();
      tween = gsap.to(state, {
        reveal: 0,
        duration: 0.45,
        ease: "power2.in",
        onComplete: stop,
      });
    },
    destroy() {
      tween?.kill();
      stop();
    },
  };
}

export type AsciiScan = NonNullable<ReturnType<typeof createAsciiScan>>;
