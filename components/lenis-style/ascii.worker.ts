/* Sets the glyphs of the "source code" scan off the main thread: reading a
   video frame back from the GPU stalls whichever thread asks for it, and the
   thousands of fillText calls after it add up too. The main thread sends a
   frame already shrunk to one pixel per cell (createImageBitmap) and gets the
   finished glyph layer back as an ImageBitmap (asciiScan.ts). */

import { setGlyphs, type Layout } from "./asciiGlyphs";

type Request = { id: number; frame: ImageBitmap; layout: Layout };

const sample = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
const layer = new OffscreenCanvas(1, 1);
const glyphs = layer.getContext("2d");

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, frame, layout } = event.data;
  /* no 2D context in a worker here: the main thread takes the work back */
  if (!sample || !glyphs) {
    frame.close();
    self.postMessage({ id, bitmap: null });
    return;
  }
  setGlyphs(glyphs, sample, layout, (into) => into.drawImage(frame, 0, 0));
  frame.close();
  const bitmap = layer.transferToImageBitmap();
  self.postMessage({ id, bitmap }, { transfer: [bitmap] });
};
