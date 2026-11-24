/** How many glyphs this page has drawn since it loaded. Shown on the page. */
let total = 0;

export function countGlyphs(n: number) {
  total += n;
}

export function glyphTotal() {
  return total;
}
