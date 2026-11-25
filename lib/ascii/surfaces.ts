"use client";

/*
 * The places on the page where something falling would come to rest: the
 * top edges of framed things (the films, the monitor, the water, dialogs).
 * Running copy carries nothing: over letters a cap reads as an accent, not
 * as snow, and gets in the way of reading; the headlines and the 3D name
 * carry their own (AsciiTitle, World.tops). Measured when the page has
 * moved, and now and then for things that appear or change.
 */

const BOXES = [".wk-screen", ".ix-screen", ".ft-water", ".sn-panel", ".ach"];
/** without scrolling, measure again every this many frames */
const IDLE_EVERY = 24;
/** look for new elements every this many measurements (pages change) */
const FIND_EVERY = 20;

/** a top edge on screen, and a seed that stays the same while the page scrolls */
export type Ledge = { x0: number; x1: number; y: number; seed: number };

export class Surfaces {
  private boxes: Element[] = [];
  private ledges: Ledge[] = [];
  private age = IDLE_EVERY;
  private found = FIND_EVERY;

  private visible(el: Element) {
    const check = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
    return check ? check.call(el, { opacityProperty: true, visibilityProperty: true }) : true;
  }

  /** the ledges on screen now; `scrolled` is how far the page moved since the last frame */
  update(scrolled: number) {
    if (scrolled === 0 && ++this.age < IDLE_EVERY) return this.ledges;
    this.age = 0;
    if (++this.found >= FIND_EVERY) {
      this.found = 0;
      this.boxes = Array.from(document.querySelectorAll(BOXES.join(",")));
    }
    const h = window.innerHeight;
    const out: Ledge[] = [];
    this.boxes.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.bottom < 0 || r.top > h || !this.visible(el)) return;
      out.push({ x0: r.left, x1: r.right, y: r.top, seed: i * 131 + 7 });
    });
    this.ledges = out;
    return out;
  }
}
