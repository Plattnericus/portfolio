/** The whole site runs on these. Canvas and GL code read them from here. */
export const C = {
  night: "#0b0908",
  coal: "#1a1411",
  ember: "#4a2418",
  rust: "#8f3f27",
  terra: "#d97757",
  peach: "#f2a888",
  cream: "#f2ede6",
  ash: "#7d6f65",
} as const;

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** n colours sampled along a list of stops, as [r,g,b] triples */
export function ramp(stops: string[], n: number): [number, number, number][] {
  const rgb = stops.map(hexToRgb);
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / Math.max(1, n - 1)) * (rgb.length - 1);
    const k = Math.min(rgb.length - 2, Math.floor(t));
    const f = t - k;
    const a = rgb[k];
    const b = rgb[k + 1];
    out.push([
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f),
    ]);
  }
  return out;
}
