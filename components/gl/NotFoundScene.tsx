"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PALETTE } from "@/lib/palette";
import {
  ARM_MODEL_URL,
  NORMALIZED_ARM_HEIGHT,
  RAW_ARM_HEIGHT,
  orangeHandMaterial,
  preloadArm,
  useChromeArm,
} from "./arm";
import { GLErrorBoundary, detectWebGL2Support } from "./safety";

/* The 404 is the homepage's dark first act, frozen on one beat: the same warm
   starfield streaming toward the viewer and the same orange-lit arm reaching
   up out of the dark — here for a page that isn't there. The pointer steers
   the camera a little, so the scene answers the visitor without scrolling. */

const FIELD_RADIUS = 14;
const FAR_Z = -24;
const NEAR_Z = -1;
const SPAN = NEAR_Z - FAR_Z;
const FADE_ZONE = 3;
const DRIFT = 0.03;
const STAR_COLOR = new THREE.Color("#f0dcd2");
const STREAK_COLOR = new THREE.Color(PALETTE.accentSoft);
const STREAK_LENGTH = 0.9;

type StarSim = { x: Float32Array; y: Float32Array; z: Float32Array; glow: Float32Array };

/** 0 → 1 once "Back to Nexor" is clicked: the field jumps to lightspeed —
    faster, longer and brighter streaks — while the arm drops away. Eased in
    the frame loop, so it builds up instead of switching on. */
const warp = { target: 0, value: 0 };
const WARP_SPEED = 26;
const WARP_STREAK = 7;

function buildStars(count: number): StarSim {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const glow = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * FIELD_RADIUS;
    x[i] = Math.cos(angle) * radius;
    y[i] = Math.sin(angle) * radius * 0.72;
    z[i] = FAR_Z + Math.random() * SPAN;
    glow[i] = 0.5 + Math.random() * 0.5;
  }
  return { x, y, z, glow };
}

/** Zero-filled buffers go to the geometry once; the simulation lives in a ref
    that is only touched inside useFrame and writes through the attributes —
    the same pattern as the homepage starfield. */
function Starfield({ count }: { count: number }) {
  const dotsGeo = useRef<THREE.BufferGeometry>(null);
  const linesGeo = useRef<THREE.BufferGeometry>(null);
  const group = useRef<THREE.Group>(null);
  const sim = useRef<StarSim | null>(null);
  const buffers = useMemo(
    () => ({
      dots: new Float32Array(count * 3),
      dotColors: new Float32Array(count * 3),
      lines: new Float32Array(count * 6),
      lineColors: new Float32Array(count * 6),
    }),
    [count],
  );

  useFrame(({ clock }, delta) => {
    const dotsPos = dotsGeo.current?.attributes.position as THREE.BufferAttribute | undefined;
    const dotsCol = dotsGeo.current?.attributes.color as THREE.BufferAttribute | undefined;
    const linePos = linesGeo.current?.attributes.position as THREE.BufferAttribute | undefined;
    const lineCol = linesGeo.current?.attributes.color as THREE.BufferAttribute | undefined;
    if (!dotsPos || !dotsCol || !linePos || !lineCol) return;
    if (!sim.current || sim.current.z.length !== count) sim.current = buildStars(count);
    const { x, y, z, glow } = sim.current;
    const dots = dotsPos.array as Float32Array;
    const dotColors = dotsCol.array as Float32Array;
    const lines = linePos.array as Float32Array;
    const lineColors = lineCol.array as Float32Array;

    warp.value += (warp.target - warp.value) * Math.min(1, delta * 3.2);
    const boost = warp.value * warp.value;
    const travel = DRIFT * (1 + boost * WARP_SPEED) * Math.min(delta * 60, 3);
    const streak = STREAK_LENGTH + boost * WARP_STREAK;
    const trail = 0.35 + boost * 0.65;
    for (let i = 0; i < count; i++) {
      let depth = z[i] + travel;
      if (depth > NEAR_Z) depth -= SPAN;
      z[i] = depth;
      const fade =
        (1 - THREE.MathUtils.smoothstep(depth, NEAR_Z - FADE_ZONE, NEAR_Z)) *
        THREE.MathUtils.smoothstep(depth, FAR_Z, FAR_Z + FADE_ZONE) *
        glow[i];
      const d = i * 3;
      dots[d] = x[i];
      dots[d + 1] = y[i];
      dots[d + 2] = depth;
      dotColors[d] = STAR_COLOR.r * fade;
      dotColors[d + 1] = STAR_COLOR.g * fade;
      dotColors[d + 2] = STAR_COLOR.b * fade;
      const l = i * 6;
      lines[l] = x[i];
      lines[l + 1] = y[i];
      lines[l + 2] = depth;
      lines[l + 3] = x[i];
      lines[l + 4] = y[i];
      lines[l + 5] = depth - streak;
      /* tail stays black — additive blending turns it into a fading trail */
      lineColors[l] = STREAK_COLOR.r * fade * trail;
      lineColors[l + 1] = STREAK_COLOR.g * fade * trail;
      lineColors[l + 2] = STREAK_COLOR.b * fade * trail;
    }
    dotsPos.needsUpdate = true;
    dotsCol.needsUpdate = true;
    linePos.needsUpdate = true;
    lineCol.needsUpdate = true;
    if (group.current) group.current.rotation.z = clock.elapsedTime * 0.01;
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry ref={dotsGeo}>
          <bufferAttribute attach="attributes-position" args={[buffers.dots, 3]} />
          <bufferAttribute attach="attributes-color" args={[buffers.dotColors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.035} sizeAttenuation vertexColors transparent depthWrite={false} />
      </points>
      <lineSegments>
        <bufferGeometry ref={linesGeo}>
          <bufferAttribute attach="attributes-position" args={[buffers.lines, 3]} />
          <bufferAttribute attach="attributes-color" args={[buffers.lineColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** The homepage's first-act pose (reaching up, palm turned in), rising in from
    below over the first seconds and then breathing with the pointer.
    Its shaders are compiled up front, off the main thread where the browser
    can: three otherwise compiles a material the first time its mesh enters
    the view, and the arm rising into the frame froze the page for a moment,
    right while the 404 was landing. It waits below the frame until then, and
    the page holds its reveal for the "nf-scene-ready" this sends. */
function ReachingHand() {
  const group = useRef<THREE.Group>(null);
  const { width, height } = useThree((state) => state.viewport);
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const clock = useThree((state) => state.clock);
  const arm = useChromeArm(ARM_MODEL_URL, NORMALIZED_ARM_HEIGHT, orangeHandMaterial);
  const portrait = width < height;
  /* scene time the compile finished at; it rises from then on */
  const readyAt = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    const done = () => {
      if (!live) return;
      readyAt.current = clock.elapsedTime;
      window.dispatchEvent(new Event("nf-scene-ready"));
    };
    gl.compileAsync(scene, camera).then(done, done);
    return () => {
      live = false;
    };
  }, [gl, camera, scene, clock, arm.scene]);

  useFrame(({ clock, pointer }) => {
    const rig = group.current;
    if (!rig) return;
    const t = clock.elapsedTime;
    const from = readyAt.current === null ? Infinity : Math.max(0.35, readyAt.current);
    const rise = easeOutCubic(THREE.MathUtils.clamp((t - from) / 1.9, 0, 1));
    const sway = Math.sin(t * 0.7);
    const x = (portrait ? 0.2 : 0.24) * width + pointer.x * 0.18;
    const y =
      THREE.MathUtils.lerp(-1.25, portrait ? -0.52 : -0.47, rise) * height +
      sway * 0.05 -
      warp.value * warp.value * height * 0.9;
    const scale = (portrait ? 0.017 : 0.02) * height * (RAW_ARM_HEIGHT / NORMALIZED_ARM_HEIGHT);
    rig.position.set(x, y, 0);
    rig.rotation.set(
      -Math.PI / 4 + pointer.y * 0.08 + sway * 0.03,
      (-3 * Math.PI) / 4 + pointer.x * 0.22,
      -Math.PI / 4 + sway * 0.025,
    );
    rig.scale.setScalar(scale);
  });

  return (
    <group ref={group}>
      <group scale={arm.scale} position={arm.position}>
        <primitive object={arm.scene} />
      </group>
    </group>
  );
}

/** Eases the camera toward the pointer — a few degrees of parallax. */
function PointerCamera() {
  useFrame(({ camera, pointer }) => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.35, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, pointer.y * 0.22, 0.04);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/** Fresh canvases allowed after a lost WebGL context before giving up. */
const MAX_RESTARTS = 2;

export default function NotFoundScene() {
  const [mode, setMode] = useState<{ compact: boolean } | null>(null);
  /* React's development double mount unmounts the canvas and mounts it
     straight back — and R3F force-loses the context of an unmounted canvas
     500ms later, which then hits the one that came back. A lost context (that
     one, or a real GPU reset) gets a brand-new canvas instead of a dead one. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    warp.target = 0;
    warp.value = 0;
    const onWarp = () => {
      warp.target = 1;
    };
    window.addEventListener("nf-warp", onWarp);
    return () => window.removeEventListener("nf-warp", onWarp);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    /* no scene coming: nothing for the page to wait for */
    if (!detectWebGL2Support()) {
      window.dispatchEvent(new Event("nf-scene-ready"));
      return;
    }
    /* the model downloads while the canvas is being set up, instead of
       only once the hand asks for it — the intro waits for it */
    preloadArm();
    /* deferred a frame so setState stays out of the effect body itself */
    const raf = requestAnimationFrame(() =>
      setMode({ compact: window.matchMedia("(max-width: 899px)").matches }),
    );
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="nf-canvas" aria-hidden="true">
      {mode && (
        <GLErrorBoundary>
          <Canvas
            key={generation}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener(
                "webglcontextlost",
                () => setGeneration((count) => Math.min(count + 1, MAX_RESTARTS)),
                { once: true },
              );
            }}
            dpr={mode.compact ? [1, 1.25] : [1, 1.75]}
            camera={{ position: [0, 0, 6], fov: 42 }}
            gl={{ alpha: true, antialias: true, failIfMajorPerformanceCaveat: false }}
            /* the pointer is tracked on the whole page, not just the canvas,
               which sits underneath the text and buttons */
            eventSource={typeof document !== "undefined" ? document.body : undefined}
            eventPrefix="client"
          >
            <PointerCamera />
            <Starfield count={mode.compact ? 700 : 1400} />
            <ReachingHand />
          </Canvas>
        </GLErrorBoundary>
      )}
    </div>
  );
}
