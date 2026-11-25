/** Character sets. Everything on screen is drawn from these. */

/** dark -> dense */
export const RAMP = " .:-=+*#%@";
/** the classic donut.c ramp, for lit 3D surfaces */
export const RAMP_LIT = ".,-~:;=!*#$@";
/** for footage: more steps, still readable */
export const RAMP_CLIP = " .,:;-=+*oxO0#%@";
export const RAMP_FIRE = " .,:;+=xX$&#@";
/** edges by tangent angle: 0, 45, 90, 135 degrees */
export const EDGES = "-/|\\";
export const EDGE_LOW = "_";
export const STARS = ".'+*";
/** the N of Nexor Grid on its 5 x 7 modules, # where there is ink */
export const N_MARK = ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"];
export const NOISE = "#%&*+=-:;<>/\\|[]{}()?!$@0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const ALL_GLYPHS = Array.from(
  new Set(
    (
      RAMP +
      RAMP_LIT +
      RAMP_CLIP +
      RAMP_FIRE +
      EDGES +
      EDGE_LOW +
      STARS +
      NOISE +
      "abcdefghijklmnopqrstuvwxyz.,'\"`^~_"
    ).split(""),
  ),
).join("");

export function randomGlyph(set = NOISE): string {
  return set[(Math.random() * set.length) | 0];
}

export function randomCode(set = NOISE): number {
  return set.charCodeAt((Math.random() * set.length) | 0);
}

/** angle of an edge tangent in degrees, math orientation (y up) */
export function edgeFor(angleDeg: number): number {
  let a = angleDeg % 180;
  if (a < 0) a += 180;
  const i = Math.round(a / 45) % 4;
  return EDGES.charCodeAt(i);
}
