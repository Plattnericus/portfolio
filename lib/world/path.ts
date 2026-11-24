import { Vector3 } from "three";
import { SCREEN, Z } from "./shaders";

/*
 * The camera's flight. Keys are pinned to points in sections; between them
 * position and target follow a Catmull-Rom curve, fov and roll ease.
 *  - at/view: `at` is a fraction of the section height, `view` the fraction
 *    of the viewport that point sits at (0 = top)
 *  - p: progress through a pinned (sticky) section, 0..1
 */

type V3 = [number, number, number];
type KeyDef = {
  sel: string;
  at?: number;
  view?: number;
  p?: number;
  pos: V3;
  target: V3;
  fov?: number;
  roll?: number;
};

export type Key = { y: number; pos: Vector3; target: Vector3; fov: number; roll: number };

/** on narrow screens the view widens up to this much, then the camera backs off */
export const MAX_FOV_FIT = 1.9;

export function fovFit(aspect: number) {
  return Math.min(Math.max(1, 1.5 / aspect), MAX_FOV_FIT);
}

/** how much further away framing shots sit on narrow screens (1 on desktop) */
export function frameScale(aspect = window.innerWidth / window.innerHeight) {
  return Math.max(1, 1.5 / aspect) / fovFit(aspect);
}

export function screenCenter(i: number): V3 {
  const side = i % 2 === 0 ? -1 : 1;
  return [side * SCREEN.x, 0, Z.screens - i * Z.screenGap];
}

export function buildKeys(oX: number, projects: number): Key[] {
  const k = frameScale();
  const narrow = k > 1.01 ? 1.15 : 1;
  const defs: KeyDef[] = [
    { sel: "#hero", at: 0, view: 0, pos: [0, 0.1, 8.4 * k * narrow], target: [0, 0, 0], fov: 50 },
    { sel: "#about", at: 0, view: 0.6, pos: [oX * 0.7, 0, 4.2], target: [oX, 0, -4], fov: 54 },
    { sel: "#about", at: 0, view: 0.22, pos: [oX, 0, 1.2], target: [oX, 0, -10], fov: 62, roll: 0.15 },
    { sel: "#about", at: 0, view: -0.05, pos: [oX * 0.6, 0.1, -6], target: [0, 0, -24], fov: 58, roll: 0.05 },
    {
      sel: "#about",
      at: 0.55,
      view: 0.5,
      pos: [2.4 * k, 0.5, -24 + 6.4 * k],
      target: [-2.2 / k, 0.1, -24],
      fov: 50,
    },
  ];

  // skills: one orbit around the object
  const orbit = 9 * k;
  for (let n = 0; n <= 8; n++) {
    const p = n / 8;
    const a = 0.35 + p * 4.4;
    const pos: V3 = [Math.sin(a) * orbit, 0.6 + Math.sin(p * Math.PI) * 1.8, Z.blob + Math.cos(a) * orbit];
    // aim a little to the left of the object so it sits right of centre
    const fx = -Math.sin(a);
    const fz = -Math.cos(a);
    const rx = -fz;
    const rz = fx;
    const target: V3 = [(-rx * 3.3) / k, 0, Z.blob - (rz * 3.3) / k];
    defs.push({ sel: "#skills", p, pos, target, fov: 48 });
  }

  // principles: a slow drift through the empty stretch, the corridor far ahead
  defs.push({ sel: "#principles", p: 0, pos: [-1.6, 1.5, -31], target: [0.6, 0.3, -62], fov: 50, roll: -0.03 });
  defs.push({ sel: "#principles", p: 1, pos: [0.6, 0.8, -35.5], target: [0, 0.1, -64], fov: 50, roll: 0.02 });

  // work: hold on every screen, fly between them
  for (let i = 0; i < projects; i++) {
    const [cx, , cz] = screenCenter(i);
    const side = Math.sign(cx);
    const pos: V3 = [side * 0.4, 0.15, cz + 5.2 * k];
    const target: V3 = [cx * 0.62, 0, cz];
    const p0 = (i + 0.18) / projects;
    const p1 = (i + 0.78) / projects;
    defs.push({ sel: "#work", p: p0, pos, target, fov: 52 });
    defs.push({ sel: "#work", p: p1, pos: [pos[0], pos[1], pos[2] - 0.6], target, fov: 52 });
  }

  // index: the camera looks away into the stars, nothing sits behind the list
  defs.push({ sel: "#index", at: 0, view: 1, pos: [0, 0.4, -109], target: [-30, 7, -110], fov: 50, roll: 0.04 });
  // (held until the list has scrolled most of the way out, and before the
  // first contact key, or the turn to the @ starts under the list)
  defs.push({ sel: "#index", at: 1, view: 0.6, pos: [0, 0.6, -114], target: [-30, 6, -116], fov: 50, roll: 0.02 });

  // contact: it turns back to the @, which waits top right, clear of the copy
  defs.push({ sel: "#contact", at: 0, view: 0.2, pos: [1.6, -0.6, Z.at + 15 * k], target: [-3.2 / k, -1.6, Z.at], fov: 50 });
  defs.push({
    sel: "#contact",
    at: 1,
    view: 1,
    pos: [3.4, -0.9, Z.at + 11 * k * narrow],
    target: [-4.6 / k, -2.2 / k, Z.at],
    fov: 50,
  });

  // footer: the camera tips up, away from the @, into open stars
  defs.push({ sel: "#footer", at: 0, view: 0.6, pos: [3.4, -0.9, Z.at + 11 * k * narrow], target: [-4.6 / k, 4, Z.at], fov: 50 });
  defs.push({ sel: "#footer", at: 1, view: 1, pos: [3, 14, Z.at + 26], target: [-6, 90, Z.at - 20], fov: 52, roll: -0.04 });

  const sy = window.scrollY;
  const vh = window.innerHeight;
  const keys: Key[] = [];
  for (const d of defs) {
    const el = document.querySelector<HTMLElement>(d.sel);
    if (!el) continue;
    const top = el.getBoundingClientRect().top + sy;
    const y =
      d.p !== undefined
        ? top + d.p * Math.max(1, el.offsetHeight - vh)
        : top + (d.at ?? 0) * el.offsetHeight - (d.view ?? 0) * vh;
    keys.push({
      y,
      pos: new Vector3(...d.pos),
      target: new Vector3(...d.target),
      fov: d.fov ?? 50,
      roll: d.roll ?? 0,
    });
  }
  keys.sort((a, b) => a.y - b.y);
  return keys;
}

function catmull(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number, out: Vector3) {
  const t2 = t * t;
  const t3 = t2 * t;
  out.set(0, 0, 0);
  out.addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t);
  out.addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1);
  out.addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t);
  out.addScaledVector(p3, 0.5 * t3 - 0.5 * t2);
  return out;
}

export function samplePath(
  keys: Key[],
  y: number,
  out: { pos: Vector3; target: Vector3; fov: number; roll: number },
) {
  if (!keys.length) return out;
  if (y <= keys[0].y) {
    out.pos.copy(keys[0].pos);
    out.target.copy(keys[0].target);
    out.fov = keys[0].fov;
    out.roll = keys[0].roll;
    return out;
  }
  const last = keys[keys.length - 1];
  if (y >= last.y) {
    out.pos.copy(last.pos);
    out.target.copy(last.target);
    out.fov = last.fov;
    out.roll = last.roll;
    return out;
  }
  let i = 0;
  while (i < keys.length - 2 && y > keys[i + 1].y) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  let t = (y - a.y) / Math.max(1, b.y - a.y);
  t = Math.min(1, Math.max(0, t));
  const e = t * t * (3 - 2 * t);
  catmull(k0.pos, a.pos, b.pos, k3.pos, e, out.pos);
  catmull(k0.target, a.target, b.target, k3.target, e, out.target);
  out.fov = a.fov + (b.fov - a.fov) * e;
  out.roll = a.roll + (b.roll - a.roll) * e;
  return out;
}
