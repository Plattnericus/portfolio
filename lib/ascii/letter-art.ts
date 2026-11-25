import grid from "./nexor-grid.json";

/*
 * A letter of Nexor Grid as ASCII art, built from the same module grid the
 * font is generated from (scripts/nexor-grid). Every module is a box grown
 * by the stroke weight, outer corners are cut at 45 degrees, and modules
 * that only touch at a corner are joined by a diagonal stroke. The shape is
 * sampled per character cell: the outline gets - / | \ _ by its direction,
 * the body a bevel lit from the top left.
 *
 * Pure function, no DOM: it runs during server rendering, so the art is in
 * the first HTML and can move before any script has loaded.
 */

type Glyphs = Record<string, string[]>;

const { w: MW, h: MH, grow: GROW, cut: CUT } = grid.module;
const ROWS = grid.rows;
/** characters per module: 6 across, 3 down (a mono cell is 0.6 wide) */
const CX = 6;
const CY = 3;

function shape(rows: string[]) {
  const cols = rows[0]?.length ?? 0;
  const on = (x: number, y: number) => y >= 0 && y < ROWS && x >= 0 && x < cols && rows[y][x] === "#";
  // font units, y down
  return {
    cols,
    inside(px: number, py: number) {
      const i = Math.floor(px / MW);
      const j = Math.floor(py / MH);
      for (let y = j - 1; y <= j + 1; y++) {
        for (let x = i - 1; x <= i + 1; x++) {
          if (!on(x, y)) continue;
          const x0 = x * MW - GROW;
          const x1 = (x + 1) * MW + GROW;
          const y0 = y * MH - GROW;
          const y1 = (y + 1) * MH + GROW;
          if (px < x0 || px > x1 || py < y0 || py > y1) continue;
          // an outer corner nothing touches is cut at 45 degrees
          const free = (dx: number, dy: number) => !on(x + dx, y) && !on(x, y + dy) && !on(x + dx, y + dy);
          if (free(-1, -1) && px - x0 + (py - y0) < CUT) continue;
          if (free(1, -1) && x1 - px + (py - y0) < CUT) continue;
          if (free(-1, 1) && px - x0 + (y1 - py) < CUT) continue;
          if (free(1, 1) && x1 - px + (y1 - py) < CUT) continue;
          return true;
        }
      }
      // diagonal joins: two modules touching only at a corner
      for (let y = j - 1; y <= j; y++) {
        for (let x = i - 1; x <= i; x++) {
          const down = on(x, y) && on(x + 1, y + 1) && !on(x + 1, y) && !on(x, y + 1);
          const up = on(x + 1, y) && on(x, y + 1) && !on(x, y) && !on(x + 1, y + 1);
          if (!down && !up) continue;
          // the band between the two boxes, along the diagonal of the shared corner
          const cx = (x + 1) * MW;
          const cy = (y + 1) * MH;
          const u = (px - cx) / MW;
          const v = (py - cy) / MH;
          const along = down ? u - v : u + v;
          const across = down ? u + v : u - v;
          if (Math.abs(along) < 0.62 && Math.abs(across) < 1.0) return true;
        }
      }
      return false;
    },
  };
}

function lineGlyph(gx: number, gy: number) {
  // the outline runs across the gradient
  let o = Math.atan2(gx, -gy);
  if (o < 0) o += Math.PI;
  const s = Math.round(o / (Math.PI / 4)) % 4;
  return s === 0 ? "-" : s === 1 ? "\\" : s === 2 ? "|" : "/";
}

/** one letter as lines of characters, padded by a cell all round */
export function letterArt(ch: string): string[] {
  const rows = (grid.glyphs as Glyphs)[ch];
  if (!rows) return [];
  const s = shape(rows);
  const W = s.cols * CX + 4;
  const H = ROWS * CY + 2;
  const cw = MW / CX;
  const chh = MH / CY;
  // coverage per cell from 4 x 4 samples
  const cov = new Float32Array(W * H);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = (c - 2 + (sx + 0.5) / 4) * cw;
          const py = (r - 1 + (sy + 0.5) / 4) * chh;
          if (s.inside(px, py)) n++;
        }
      }
      cov[r * W + c] = n / 16;
    }
  }
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= W || r >= H ? 0 : cov[r * W + c]);
  const out: string[] = [];
  for (let r = 0; r < H; r++) {
    let line = "";
    for (let c = 0; c < W; c++) {
      const v = at(c, r);
      if (v < 0.2) {
        line += " ";
        continue;
      }
      const gx = at(c + 1, r - 1) + 2 * at(c + 1, r) + at(c + 1, r + 1) - at(c - 1, r - 1) - 2 * at(c - 1, r) - at(c - 1, r + 1);
      const gy = at(c - 1, r + 1) + 2 * at(c, r + 1) + at(c + 1, r + 1) - at(c - 1, r - 1) - 2 * at(c, r - 1) - at(c + 1, r - 1);
      if (v < 0.9 || Math.hypot(gx, gy) > 1.6) {
        // a flat bottom edge reads better as _ than as -
        line += Math.abs(gx) < 0.5 && gy < 0 ? "_" : lineGlyph(gx, gy * 0.6);
        continue;
      }
      // body: lit from the top left, a bevel along the edges
      const lit = at(c - 1, r - 1) < 0.9 || at(c - 2, r) < 0.9 || at(c, r - 1) < 0.9;
      const shade = at(c + 1, r + 1) < 0.9 || at(c + 2, r) < 0.9 || at(c, r + 1) < 0.9;
      line += lit && !shade ? "@" : shade && !lit ? "+" : (c + r) % 2 ? "#" : "%";
    }
    out.push(line.replace(/\s+$/, ""));
  }
  return out;
}
