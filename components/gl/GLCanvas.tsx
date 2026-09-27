"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PALETTE } from "@/lib/palette";
import { RETHINK_COVER_AT } from "@/lib/rethink";
import {
  ARM_MODEL_URL,
  NORMALIZED_ARM_HEIGHT,
  preloadArm,
  RAW_ARM_HEIGHT,
  orangeHandMaterial,
  useChromeArm,
} from "./arm";
import { GLErrorBoundary, detectWebGL2Support } from "./safety";

type Progress = { value: number };

/* module-level singletons: written once per frame, read by every child */
const lightProgress: Progress = { value: 0 };
const handProgress: Progress = { value: 0 };
const earlyHandProgress: Progress = { value: 0 };
/** 1 while the rethink zoom-through-the-T is still on screen, 0 from the
    moment the cream flood is solid (the same threshold Rethink's BG_FLIP_AT
    uses to take the flood away). The silver hand is only ever shown past that
    point, and its path starts fully below the frame there, so it rises in from
    the bottom edge in one piece — never faded (a transparent chrome mesh shows
    its own inside geometry) and never sliced by the cream DOM layer above the
    canvas. */
const handHidden: Progress = { value: 1 };
const HAND_REVEAL_AT = RETHINK_COVER_AT;
/** Scroll, in viewport heights after the reveal, over which the hand rises
    from below the frame into its POINT pose. It starts on the still-pinned
    empty cream frame and settles as the Solution copy arrives. */
const HAND_RISE_VH = 1.05;
/** handProgress of the POINT keyframe the rise ends on (see HAND_KEYFRAMES). */
const HAND_POINT_AT = 0.13;
/** 0 → 1 over the first stretch of scroll after the cream flip — fades the
    light-scene particles in instead of popping them on with the flip. */
const lightReveal: Progress = { value: 0 };
/** Signed, lightly smoothed px/frame scroll speed — positive while scrolling
    down. Drives the starfield's warp-tunnel travel and streak length. */
const warpVelocity: Progress = { value: 0 };

/* Skip the eager preload under reduced motion — the Canvas below never
   mounts in that mode, so nothing would ever use this GLB. Read directly at
   module scope rather than from a hook: this file is client-only (evaluated
   once in the browser, never during SSR), and preloading needs to fire
   before any component gets a chance to render anyway. */
if (typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  preloadArm();
}

/* ------------------------------------------------------------------ */
/* Scroll sync — section offsets are measured whenever the layout      */
/* changes (resize, fonts, pin sizing), never per frame: a per-frame   */
/* getBoundingClientRect came right after GSAP's style writes and      */
/* forced a synchronous layout on every scroll frame                   */
/* ------------------------------------------------------------------ */

type PageMetrics = {
  whyTop: number;
  whyHeight: number;
  rethinkTop: number;
  rethinkHeight: number;
  heatTop: number;
  docEnd: number;
  viewportHeight: number;
};

function measurePage(): PageMetrics | null {
  const why = document.querySelector<HTMLElement>(".why");
  const rethink = document.querySelector<HTMLElement>(".rethink");
  const heat = document.querySelector<HTMLElement>(".heat");
  if (!why || !rethink || !heat) return null;
  const scrollY = window.scrollY;
  const whyBounds = why.getBoundingClientRect();
  const rethinkBounds = rethink.getBoundingClientRect();
  return {
    whyTop: whyBounds.top + scrollY,
    whyHeight: whyBounds.height,
    rethinkTop: rethinkBounds.top + scrollY,
    rethinkHeight: rethinkBounds.height,
    heatTop: heat.getBoundingClientRect().top + scrollY,
    docEnd: document.documentElement.scrollHeight - window.innerHeight,
    viewportHeight: window.innerHeight,
  };
}

function ScrollSync() {
  const metrics = useRef<PageMetrics | null>(null);
  const lastScrollY = useRef<number | null>(null);

  useEffect(() => {
    let frame = 0;
    const remeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        metrics.current = measurePage();
      });
    };
    remeasure();
    /* every section's size (and so every offset below it) plus the page
       height — the showcase sizes itself in JS, Heat by viewport units */
    const observer = new ResizeObserver(remeasure);
    observer.observe(document.body);
    document.querySelectorAll("main > *").forEach((el) => observer.observe(el));
    window.addEventListener("resize", remeasure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, []);

  useFrame(() => {
    const scrollY = window.scrollY;

    /* tracked unconditionally (not gated on the metrics below) so the
       starfield keeps reacting to scroll speed even before they exist */
    if (lastScrollY.current === null) lastScrollY.current = scrollY;
    const delta = scrollY - lastScrollY.current;
    lastScrollY.current = scrollY;
    warpVelocity.value = THREE.MathUtils.lerp(warpVelocity.value, delta, 0.18);

    const m = metrics.current;
    if (!m) return;

    const earlyEnd = m.whyTop + m.whyHeight * 0.72;
    earlyHandProgress.value = THREE.MathUtils.clamp(scrollY / Math.max(1, earlyEnd), 0, 1);

    const top = m.rethinkTop;
    const heatTop = m.heatTop;
    const viewportHeight = m.viewportHeight;
    const docEnd = m.docEnd;
    const solutionStart = top + viewportHeight * 0.05;
    const solutionEnd = top + m.rethinkHeight - viewportHeight;
    const solutionProgress = THREE.MathUtils.clamp(
      (scrollY - solutionStart) / Math.max(1, solutionEnd - solutionStart),
      0,
      1,
    );

    /* The dark scene fades out over the second half of the dive, finishing
       exactly when the cream T covers the frame. */
    lightProgress.value = THREE.MathUtils.clamp(
      (solutionProgress / RETHINK_COVER_AT - 0.545) / 0.455,
      0,
      1,
    );

    /* Hidden for the whole dive, released the moment the flood is solid. */
    handHidden.value = solutionProgress < HAND_REVEAL_AT ? 1 : 0;

    /* Lenis uses one continuous light-scene hand path. It starts at the
       reveal itself — fully below the frame — and rises in as the Solution
       copy arrives. The exact Heat pose lands at a fixed point in our rig,
       then the model completes almost two Y-axis turns between the Heat start
       and the page end. Splitting the normalization here keeps that pose
       stable even when other sections change height. */
    const revealY = solutionStart + (solutionEnd - solutionStart) * HAND_REVEAL_AT;
    const heatKeyframe = 0.42;
    lightReveal.value = THREE.MathUtils.clamp(
      (scrollY - revealY) / (viewportHeight * 0.6),
      0,
      1,
    );

    /* Two stretches: a long, unhurried rise into POINT, then the remaining
       choreography up to the exact Heat pose. The rise never takes more than
       60% of the way to Heat, so the later turns keep room on short pages. */
    const riseEnd =
      revealY + Math.min(viewportHeight * HAND_RISE_VH, (heatTop - revealY) * 0.6);
    if (scrollY < riseEnd) {
      const rise = THREE.MathUtils.clamp(
        (scrollY - revealY) / Math.max(1, riseEnd - revealY),
        0,
        1,
      );
      handProgress.value = rise * HAND_POINT_AT;
    } else if (scrollY < heatTop) {
      const toHeat = THREE.MathUtils.clamp(
        (scrollY - riseEnd) / Math.max(1, heatTop - riseEnd),
        0,
        1,
      );
      handProgress.value = THREE.MathUtils.lerp(HAND_POINT_AT, heatKeyframe, toHeat);
    } else {
      const heatToEnd = THREE.MathUtils.clamp(
        (scrollY - heatTop) / Math.max(1, docEnd - heatTop),
        0,
        1,
      );
      handProgress.value = THREE.MathUtils.lerp(
        heatKeyframe,
        1,
        heatToEnd,
      );
    }
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Starfield — a warp tunnel that answers the scroll: gentle idle drift */
/* at rest, then streaking into hyperspace-style trails while           */
/* scrolling — trail direction follows scroll direction, so scrolling   */
/* down dives forward into the site and scrolling up falls back out,    */
/* the same way the Star Wars jump-to-lightspeed stars stream past in   */
/* whichever direction the ship is travelling. One shared per-star      */
/* depth array drives both the point sprites and their streak trails,   */
/* recycling out inside a fade zone so nothing visibly pops. Still      */
/* fades out with the dark→light flip exactly as before.                */
/* ------------------------------------------------------------------ */

/* Phones get a sparser field: the per-star update runs on the CPU every frame,
   and at phone sizes 700 stars read just as dense as 1,600 do on a desktop. */
const STAR_COUNT = 1600;
const STAR_COUNT_COMPACT = 700;
const FIELD_RADIUS = 15;
const FAR_Z = -22;
const NEAR_Z = -1;
const SPAN = NEAR_Z - FAR_Z;
const FADE_ZONE = 3;
const IDLE_DRIFT = 0.004;
const WARP_TO_Z = 0.006;
const MAX_TRAVEL = 0.6;
const STREAK_TO_LEN = 0.06;
const MAX_STREAK = 6;

const STAR_COLOR = new THREE.Color("#f0dcd2");
const STREAK_COLOR = new THREE.Color(PALETTE.accentSoft);

type StarState = {
  sx: Float32Array;
  sy: Float32Array;
  sz: Float32Array;
  seed: Float32Array;
  dotPositions: Float32Array;
  dotColors: Float32Array;
  linePositions: Float32Array;
  lineColors: Float32Array;
};

/** (Re)spawns star `i` at a random point on a flattened disc. Called on
    init and every time a star recycles past either depth boundary. */
function spawnStar(
  i: number,
  sx: Float32Array,
  sy: Float32Array,
  sz: Float32Array,
  seed: Float32Array,
  z?: number,
) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * FIELD_RADIUS;
  sx[i] = Math.cos(angle) * radius;
  sy[i] = Math.sin(angle) * radius * 0.72;
  sz[i] = z ?? FAR_Z + Math.random() * SPAN;
  seed[i] = 0.55 + Math.random() * 0.45;
}

/** Writes star `i`'s current depth into both the dot and streak buffers.
    Brightness (not material opacity) carries the near/far recycle fade —
    correct here since it only has to disappear into the near-black hero
    background; the real dark→light fade stays on material opacity. */
function writeStar(i: number, s: StarState, speedGlow: number, streakLen: number) {
  const { sx, sy, sz, seed, dotPositions, dotColors, linePositions, lineColors } = s;
  const z = sz[i];
  const fadeNear = 1 - THREE.MathUtils.smoothstep(z, NEAR_Z - FADE_ZONE, NEAR_Z);
  const fadeFar = THREE.MathUtils.smoothstep(z, FAR_Z, FAR_Z + FADE_ZONE);
  const alpha = fadeNear * fadeFar * seed[i];
  const glow = 1 + speedGlow * 0.6;

  const di = i * 3;
  dotPositions[di] = sx[i];
  dotPositions[di + 1] = sy[i];
  dotPositions[di + 2] = z;
  dotColors[di] = STAR_COLOR.r * alpha * glow;
  dotColors[di + 1] = STAR_COLOR.g * alpha * glow;
  dotColors[di + 2] = STAR_COLOR.b * alpha * glow;

  const li = i * 6;
  const headAlpha = alpha * speedGlow;
  linePositions[li] = sx[i];
  linePositions[li + 1] = sy[i];
  linePositions[li + 2] = z;
  linePositions[li + 3] = sx[i];
  linePositions[li + 4] = sy[i];
  linePositions[li + 5] = z - streakLen;
  lineColors[li] = STREAK_COLOR.r * headAlpha;
  lineColors[li + 1] = STREAK_COLOR.g * headAlpha;
  lineColors[li + 2] = STREAK_COLOR.b * headAlpha;
  /* tail fades to black — the correct look for a light trail, not a cutout */
  lineColors[li + 3] = 0;
  lineColors[li + 4] = 0;
  lineColors[li + 5] = 0;
}

type SimState = {
  sx: Float32Array;
  sy: Float32Array;
  sz: Float32Array;
  seed: Float32Array;
};

function buildSimState(count: number): SimState {
  const sx = new Float32Array(count);
  const sy = new Float32Array(count);
  const sz = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) spawnStar(i, sx, sy, sz, seed);
  return { sx, sy, sz, seed };
}

/** Zero-filled placeholders for the very first commit — invisible until the
    first useFrame tick fills in real positions/colors, since a zeroed color
    buffer already reads as fully black (nothing to flash). The live per-star
    simulation (sx/sy/sz/seed, which has no Three.js-side counterpart) lives
    in a ref that's only ever touched inside useFrame, never during render —
    reading `.current` during render (even to seed JSX) is exactly what trips
    the React Compiler's "no ref access during render" check. */
function Starfield({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null);
  const dotsGeo = useRef<THREE.BufferGeometry>(null);
  const dotsMaterial = useRef<THREE.PointsMaterial>(null);
  const linesGeo = useRef<THREE.BufferGeometry>(null);
  const lineMaterial = useRef<THREE.LineBasicMaterial>(null);
  const sim = useRef<SimState | null>(null);
  const buffers = useMemo(
    () => ({
      dotPositions: new Float32Array(count * 3),
      dotColors: new Float32Array(count * 3),
      linePositions: new Float32Array(count * 2 * 3),
      lineColors: new Float32Array(count * 2 * 3),
    }),
    [count],
  );

  useFrame(({ clock }) => {
    if (!sim.current || sim.current.sx.length !== count) sim.current = buildSimState(count);
    const { sx, sy, sz, seed } = sim.current;

    const dotsAttr = dotsGeo.current?.attributes.position as THREE.BufferAttribute | undefined;
    const dotsColorAttr = dotsGeo.current?.attributes.color as THREE.BufferAttribute | undefined;
    const linesAttr = linesGeo.current?.attributes.position as THREE.BufferAttribute | undefined;
    const linesColorAttr = linesGeo.current?.attributes.color as THREE.BufferAttribute | undefined;
    if (!dotsAttr || !dotsColorAttr || !linesAttr || !linesColorAttr) return;

    const warp = THREE.MathUtils.clamp(warpVelocity.value, -140, 140);
    const travel = THREE.MathUtils.clamp(IDLE_DRIFT + warp * WARP_TO_Z, -MAX_TRAVEL, MAX_TRAVEL);
    const streakLen = THREE.MathUtils.clamp(warp * STREAK_TO_LEN, -MAX_STREAK, MAX_STREAK);
    const speedGlow = THREE.MathUtils.clamp(Math.abs(warp) / 55, 0, 1);
    /* Past the cream flip the field is invisible — skip the whole per-star
       update instead of simulating stars nobody can see. */
    const dark = handHidden.value > 0.5 ? 1 - lightProgress.value : 0;
    if (group.current) group.current.visible = dark > 0.001;
    if (dark <= 0.001) return;

    const frame: StarState = {
      sx,
      sy,
      sz,
      seed,
      dotPositions: dotsAttr.array as Float32Array,
      dotColors: dotsColorAttr.array as Float32Array,
      linePositions: linesAttr.array as Float32Array,
      lineColors: linesColorAttr.array as Float32Array,
    };

    for (let i = 0; i < count; i++) {
      const z = sz[i] + travel;
      if (z > NEAR_Z) {
        spawnStar(i, sx, sy, sz, seed, z - SPAN);
      } else if (z < FAR_Z) {
        spawnStar(i, sx, sy, sz, seed, z + SPAN);
      } else {
        sz[i] = z;
      }
      writeStar(i, frame, speedGlow, streakLen);
    }

    dotsAttr.needsUpdate = true;
    dotsColorAttr.needsUpdate = true;
    linesAttr.needsUpdate = true;
    linesColorAttr.needsUpdate = true;
    if (dotsMaterial.current) dotsMaterial.current.opacity = 0.85 * dark;
    if (lineMaterial.current) lineMaterial.current.opacity = 0.9 * dark;
    if (group.current) {
      group.current.rotation.z = clock.elapsedTime * 0.008;
      group.current.position.y = Math.sin(clock.elapsedTime * 0.12) * 0.35;
    }
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry ref={dotsGeo}>
          <bufferAttribute attach="attributes-position" args={[buffers.dotPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[buffers.dotColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={dotsMaterial}
          size={0.035}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </points>
      <lineSegments>
        <bufferGeometry ref={linesGeo}>
          <bufferAttribute
            attach="attributes-position"
            args={[buffers.linePositions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[buffers.lineColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          ref={lineMaterial}
          vertexColors
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

/* Lenis keeps a much smaller field of warm particles alive after the light
   takeover. It must be a separate draw call: making unused dark-scene stars
   black would turn all 1,600 of them into soot on the cream background. */
const LIGHT_PARTICLE_COUNT = 100;

function LightParticles() {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const { width, height } = useThree((state) => state.viewport);
  const positions = useMemo(() => {
    const values = new Float32Array(LIGHT_PARTICLE_COUNT * 3);
    const seeded = (value: number) => {
      const raw = Math.sin(value * 12.9898) * 43758.5453;
      return raw - Math.floor(raw);
    };

    for (let index = 0; index < LIGHT_PARTICLE_COUNT; index++) {
      const offset = index * 3;
      values[offset] = (seeded(offset + 1) - 0.5) * 1.12;
      values[offset + 1] = (seeded(offset + 2) - 0.5) * 1.12;
      values[offset + 2] = -0.5 - seeded(offset + 3) * 1.5;
    }

    return values;
  }, []);

  useFrame(({ clock }) => {
    if (material.current) {
      material.current.opacity = lightReveal.value * 0.4;
    }
    if (group.current) {
      group.current.rotation.z = -clock.elapsedTime * 0.006;
      group.current.position.y = Math.sin(clock.elapsedTime * 0.16) * 0.025;
    }
  });

  return (
    <group ref={group} scale={[width, height, 1]}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={material}
          color="#de886d"
          size={0.026}
          sizeAttenuation
          transparent
          opacity={0}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Arm materials — the shared chrome/orange ones and the model sizing   */
/* live in ./arm; the late silver one stays here with its environment   */
/* ------------------------------------------------------------------ */

/* The light section deliberately stays neutral silver. Only the early dark
   scene receives the orange Lenis-style lighting. */
const lateSilverHandMaterial = new THREE.MeshPhysicalMaterial({
  color: "#9f9996",
  emissive: "#000000",
  emissiveIntensity: 0,
  metalness: 1,
  roughness: 0.16,
  clearcoat: 0.15,
  clearcoatRoughness: 0.08,
  envMapIntensity: 1.45,
  side: THREE.DoubleSide,
});

function SilverChromeEnvironment() {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    /* Prefiltering the room environment is a few hundred ms of synchronous
       GPU+CPU work. Running it on mount lands it squarely inside the intro
       loader's glyph animation, stalling the main thread long enough to
       visibly stutter the reveal and push back its timers. Nothing needs
       this map until the silver hand appears in the light half of the page,
       far below the fold, so it waits for an idle gap instead. The timeout
       guarantees it still resolves on busy machines that never go idle. */
    let cancelled = false;
    let environmentTarget: THREE.WebGLRenderTarget | null = null;

    const build = () => {
      if (cancelled) return;
      const pmrem = new THREE.PMREMGenerator(gl);
      const room = new RoomEnvironment();
      environmentTarget = pmrem.fromScene(room, 0.03);

      lateSilverHandMaterial.envMap = environmentTarget.texture;
      lateSilverHandMaterial.needsUpdate = true;

      room.dispose();
      pmrem.dispose();
    };

    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(build, { timeout: 2500 })
        : window.setTimeout(build, 1200);

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function" && typeof idle === "number") {
        window.cancelIdleCallback(idle);
      }
      window.clearTimeout(idle as number);
      if (environmentTarget) {
        if (lateSilverHandMaterial.envMap === environmentTarget.texture) {
          lateSilverHandMaterial.envMap = null;
          lateSilverHandMaterial.needsUpdate = true;
        }
        environmentTarget.dispose();
      }
    };
  }, [gl]);

  return null;
}

type EarlyHandFrame = [number, number, number, number, number, number, number];

/* Lenis runtime poses, expressed as viewport-relative positions and raw-GLB
   scale ratios: progress, x/W, y/H, rawScale/H, rotation XYZ. */
const EARLY_HAND_KEYFRAMES: EarlyHandFrame[] = [
  [0, -0.1, -1.75, 0.045, 0, Math.PI / 2, 0],
  /* arrives a bit sooner (was 0.4) and settles a touch lower (was -0.4) so
     it's already in its resting reach by the time the first beat is read */
  [0.3, 0.15, -0.46, 0.02, -Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4],
  [0.8, 0.15, -0.46, 0.02, Math.PI / 4, -7 * Math.PI / 4, -Math.PI / 4],
  [1, 0.68, -0.46, 0.018, Math.PI / 4, -7 * Math.PI / 4, -Math.PI / 4],
];

function sampleEarlyHand(p: number, width: number, height: number) {
  let index = 0;
  while (index < EARLY_HAND_KEYFRAMES.length - 2 && p > EARLY_HAND_KEYFRAMES[index + 1][0]) {
    index++;
  }
  const from = EARLY_HAND_KEYFRAMES[index];
  const to = EARLY_HAND_KEYFRAMES[index + 1];
  const t = THREE.MathUtils.clamp((p - from[0]) / Math.max(0.001, to[0] - from[0]), 0, 1);
  return {
    x: THREE.MathUtils.lerp(from[1], to[1], t) * width,
    y: THREE.MathUtils.lerp(from[2], to[2], t) * height,
    scale:
      THREE.MathUtils.lerp(from[3], to[3], t) * height * RAW_ARM_HEIGHT /
      NORMALIZED_ARM_HEIGHT,
    rx: THREE.MathUtils.lerp(from[4], to[4], t),
    ry: THREE.MathUtils.lerp(from[5], to[5], t),
    rz: THREE.MathUtils.lerp(from[6], to[6], t),
  };
}

function EarlyHandRig() {
  const group = useRef<THREE.Group>(null);
  const { width, height } = useThree((state) => state.viewport);
  const arm = useChromeArm(ARM_MODEL_URL, 5.15, orangeHandMaterial);

  useFrame(() => {
    const rig = group.current;
    if (!rig) return;
    const pose = sampleEarlyHand(earlyHandProgress.value, width, height);
    rig.position.set(pose.x, pose.y, 0);
    rig.rotation.set(pose.rx, pose.ry, pose.rz);
    rig.scale.setScalar(pose.scale);
    rig.visible = earlyHandProgress.value < 0.995 && lightProgress.value < 0.02;
  });

  return (
    <group ref={group}>
      <group scale={arm.scale} position={arm.position}>
        <primitive object={arm.scene} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Later hand rig — the same exact arm.glb remains continuously present */
/* through the light half of the page. No geometry swap is allowed.     */
/* ------------------------------------------------------------------ */

/** Piecewise keyframes: [progress, x, y, rotX, rotY, rotZ, scale]. Interpolated
    with smoothstep easing between the two bracketing stops. */
const HAND_KEYFRAMES: Array<
  [number, number, number, number, number, number, number]
> = [
  [0.0, 0.95, -3.9, 0.3, 0.0, 0.03, 1.0], // just below the frame edge (it shows from ~-3.5)
  [0.13, 0.7, -0.8, 0.16, 0.05, 0.02, 1.04], // POINT pose — risen in from below
  [0.3, 0.65, -1.55, 0.08, 3.49, -0.28, 1.34], // Lenis light-start pose
  [0.42, 0.0, -1.0, 0.0, -0.244, -0.279, 1.2], // exact Heat start
  [1.0, 1.7, -1.45, 0.0, -12.217, -0.279, 1.28], // page end: -700deg Y, bigger hand, finger high-right — sits a little lower than lenis.dev's so the palm clears the footer headline (x: see endHandX)
];

/** The page-end hand x, nudged a few pixels right where the screen is wide
    enough to take it (the forearm then crosses less of the right-aligned
    footer headline). Only ever toward the edge and at most 0.2 units, and
    never so far that the hand is cut off — 16:9 and narrower keep it as is. */
const END_HAND_EDGE_GAP = 2.4;
function endHandX(viewportWidth: number) {
  const base = HAND_KEYFRAMES[HAND_KEYFRAMES.length - 1][1];
  return base + THREE.MathUtils.clamp(viewportWidth / 2 - END_HAND_EDGE_GAP - base, 0, 0.2);
}

/** On narrow (portrait) screens the entrance poses sat half off the right
    edge — they were placed for a landscape frame. This pulls the entrance
    keyframes (rise, POINT, light-start) in just far enough to keep the hand
    whole; wide screens get 0. */
const RISE_EDGE_GAP = 1.45;
const ENTRANCE_KEYFRAMES = 3;
function entranceShiftX(viewportWidth: number) {
  return THREE.MathUtils.clamp(viewportWidth / 2 - RISE_EDGE_GAP, -0.4, 0);
}

function sampleHand(p: number, endX: number, entranceShift: number) {
  const frames = HAND_KEYFRAMES;
  let i = 0;
  while (i < frames.length - 2 && p > frames[i + 1][0]) i++;
  const [p0, x0Frame, y0, rx0, ry0, rz0, s0] = frames[i];
  const [p1, x1Frame, y1, rx1, ry1, rz1, s1] = frames[i + 1];
  const x0 = x0Frame + (i < ENTRANCE_KEYFRAMES ? entranceShift : 0);
  const x1 =
    i + 1 === frames.length - 1
      ? endX
      : x1Frame + (i + 1 < ENTRANCE_KEYFRAMES ? entranceShift : 0);
  const t = p1 > p0 ? THREE.MathUtils.smoothstep((p - p0) / (p1 - p0), 0, 1) : 0;
  return {
    x: THREE.MathUtils.lerp(x0, x1, t),
    y: THREE.MathUtils.lerp(y0, y1, t),
    rotX: THREE.MathUtils.lerp(rx0, rx1, t),
    rotY: THREE.MathUtils.lerp(ry0, ry1, t),
    rotZ: THREE.MathUtils.lerp(rz0, rz1, t),
    scale: THREE.MathUtils.lerp(s0, s1, t),
  };
}

function HandRig() {
  const group = useRef<THREE.Group>(null);
  const viewportWidth = useThree((state) => state.viewport.width);
  const arm = useChromeArm(ARM_MODEL_URL, 5.05, lateSilverHandMaterial);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const p = handProgress.value;
    const { x, y, rotX, rotY, rotZ, scale } = sampleHand(
      p,
      endHandX(viewportWidth),
      entranceShiftX(viewportWidth),
    );

    const idle = Math.sin(clock.elapsedTime * 0.8);
    g.position.set(x + idle * 0.025, y + idle * 0.055, 0);
    g.rotation.set(rotX + idle * 0.012, rotY, rotZ - idle * 0.01);
    g.scale.setScalar(scale);

    g.visible = p > 0.001 && handHidden.value < 0.5;
  });

  return (
    <group ref={group} visible={false}>
      <group rotation={[0.5, Math.PI, 0]}>
        <group scale={arm.scale} position={arm.position}>
          <primitive object={arm.scene} />
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Scene + canvas                                                      */
/* ------------------------------------------------------------------ */

function Scene({ compact }: { compact: boolean }) {
  return (
    <>
      <ambientLight color="#a29a92" intensity={1} />
      <directionalLight color="#efefef" position={[-6, 5, 2]} intensity={1} />
      <directionalLight color="#efefef" position={[8, -3, 4]} intensity={1} />
      <SilverChromeEnvironment />
      <ScrollSync />
      <Starfield key={compact ? "compact" : "full"} count={compact ? STAR_COUNT_COMPACT : STAR_COUNT} />
      <LightParticles />
      <EarlyHandRig />
      <HandRig />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Frame-rate watch — drops the canvas to 1x once the device clearly    */
/* can't keep up. Averages over a few seconds so one hitch (a tab       */
/* switch, a GC pause) never counts.                                    */
/* ------------------------------------------------------------------ */

const WATCH_WINDOW_MS = 250;
const WATCH_WINDOWS = 10;
const LOW_FPS = 50;

function FrameRateWatch({ onDecline }: { onDecline: () => void }) {
  const state = useRef({ frames: 0, since: 0, samples: [] as number[], done: false });

  useFrame(() => {
    const watch = state.current;
    if (watch.done) return;
    const now = performance.now();
    if (!watch.since) watch.since = now;
    watch.frames++;
    const elapsed = now - watch.since;
    if (elapsed < WATCH_WINDOW_MS) return;
    /* a window much longer than asked for means the tab was hidden or
       throttled, not that the GPU was slow — start over */
    if (elapsed < WATCH_WINDOW_MS * 4) watch.samples.push((watch.frames * 1000) / elapsed);
    watch.frames = 0;
    watch.since = now;
    if (watch.samples.length < WATCH_WINDOWS) return;
    const average = watch.samples.reduce((sum, fps) => sum + fps, 0) / watch.samples.length;
    watch.samples.shift();
    if (average < LOW_FPS) {
      watch.done = true;
      onDecline();
    }
  });

  return null;
}

type GLPreferences = {
  reducedMotion: boolean;
  compactViewport: boolean;
  glSupported: boolean;
};

function useGLPreferences() {
  const [preferences, setPreferences] = useState<GLPreferences | null>(null);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactViewportQuery = window.matchMedia("(max-width: 899px)");
    const glSupported = detectWebGL2Support();
    const syncPreferences = () => {
      const next = {
        reducedMotion: reducedMotionQuery.matches,
        compactViewport: compactViewportQuery.matches,
        glSupported,
      };
      setPreferences((current) =>
        current?.reducedMotion === next.reducedMotion &&
        current.compactViewport === next.compactViewport &&
        current.glSupported === next.glSupported
          ? current
          : next,
      );
    };

    /* Keep the server and first client render identical (initial state is
       null, matching SSR), then resolve both media queries as soon as this
       effect commits. This used to be deferred one requestAnimationFrame,
       but rAF is throttled or never fires at all in backgrounded/prerendered
       tabs — that left `preferences` stuck at null forever and silently
       dropped the whole 3D scene with no error. Reading matchMedia straight
       from the effect body has no such dependency on the paint loop. */
    syncPreferences();
    reducedMotionQuery.addEventListener("change", syncPreferences);
    compactViewportQuery.addEventListener("change", syncPreferences);

    return () => {
      reducedMotionQuery.removeEventListener("change", syncPreferences);
      compactViewportQuery.removeEventListener("change", syncPreferences);
    };
  }, []);

  return preferences;
}

export default function GLCanvas() {
  const preferences = useGLPreferences();
  /* Sticky for the lifetime of the page: once the runtime safety net below
     trips, we stop trying to render the scene rather than bouncing back and
     forth on every subsequent rejection. */
  const [glFailed, setGlFailed] = useState(false);
  /* Sticky too: once the frame rate has dropped for a few seconds the canvas
     renders at 1x for the rest of the visit — switching back and forth would
     reallocate the drawing buffer each time and cause the very hitch this is
     meant to prevent. */
  const [lowPower, setLowPower] = useState(false);
  const canRenderScene =
    !!preferences && !preferences.reducedMotion && preferences.glSupported && !glFailed;

  useEffect(() => {
    if (!preferences || canRenderScene) return;

    /* No Canvas gets mounted below — reduced motion, no WebGL2, or the
       runtime failure caught further down — but the intro loader must still
       receive the same readiness contract it would from Canvas.onCreated. */
    const readyFrame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("gl-ready"));
    });
    return () => window.cancelAnimationFrame(readyFrame);
  }, [preferences, canRenderScene]);

  useEffect(() => {
    if (!canRenderScene) return;

    /* Safety net for a real gap in react-three-fiber: Canvas constructs the
       WebGLRenderer inside an async function that gets called without being
       awaited or given a .catch(), so a context-creation failure that slips
       past the synchronous probe above (context lost mid-init, GPU process
       killed, a driver crash on first use) surfaces as an unhandled promise
       rejection instead of a thrown render error. It never enters React's
       render/commit cycle at all, so GLErrorBoundary can't see it. Treat
       that one failure mode the same way componentDidCatch does: warn once,
       stop trying to render the scene, and unblock the intro loader. */
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const { reason } = event;
      const message = reason instanceof Error ? reason.message : String(reason ?? "");
      if (!/webgl/i.test(message)) return;
      event.preventDefault();
      console.warn("GLCanvas: WebGL context failed after mount, hiding the 3D layer.", reason);
      setGlFailed(true);
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, [canRenderScene]);

  return (
    <div className="gl-canvas" aria-hidden="true">
      {preferences && canRenderScene && (
        <GLErrorBoundary>
          <Canvas
            /* 1.5x is the ceiling: on a 2x display it is visually the same
               with MSAA on, at ~27% fewer pixels to shade than 1.75x */
            dpr={lowPower ? 1 : preferences.compactViewport ? [1, 1.25] : [1, 1.5]}
            camera={{ position: [0, 0, 6], fov: 42 }}
            gl={{
              alpha: true,
              antialias: true,
              powerPreference: "high-performance",
              /* Let the browser fall back to a software/ANGLE renderer
                 instead of refusing context creation outright — locked-down
                 corporate machines and some older mobile GPUs disable
                 hardware acceleration but can still render WebGL. */
              failIfMajorPerformanceCaveat: false,
            }}
            onCreated={() => {
              /* the intro loader listens for this to complete its progress */
              window.dispatchEvent(new CustomEvent("gl-ready"));
            }}
          >
            <FrameRateWatch onDecline={() => setLowPower(true)} />
            <Scene compact={preferences.compactViewport} />
          </Canvas>
        </GLErrorBoundary>
      )}
    </div>
  );
}
