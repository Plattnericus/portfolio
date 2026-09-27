"use client";

/* The arm model and the materials/sizing shared by every scene that shows it —
   the homepage canvas (GLCanvas) and the 404 page (NotFoundScene). */

import { useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { PALETTE } from "@/lib/palette";

/* react-three-fiber v9 constructs a THREE.Clock internally on every Canvas
   mount, and three r183+ prints a one-off deprecation notice from Clock's
   constructor (the switch to THREE.Timer only landed in r3f v10, still alpha).
   We can't stop r3f from creating that Clock, so we route three's own console
   output through its official hook and drop just that single line — every other
   three log/warn/error is forwarded untouched and the global console is never
   patched. Remove once react-three-fiber v10 is stable. */
if (typeof THREE.setConsoleFunction === "function") {
  THREE.setConsoleFunction((type, message, ...params) => {
    if (
      typeof message === "string" &&
      message.includes("Clock: This module has been deprecated")
    ) {
      return;
    }
    const sink =
      type === "warn" ? console.warn : type === "error" ? console.error : console.log;
    sink(message, ...params);
  });
}

export const ARM_MODEL_URL = "/models/arm/arm.glb";

/** Starts fetching and parsing the arm before any scene asks for it. Plain
    GLTFLoader through R3F's loader cache: the model uses no Draco, Meshopt or
    KTX2 compression, so drei's useGLTF would only ship their decoders. */
export function preloadArm() {
  useLoader.preload(GLTFLoader, ARM_MODEL_URL);
}

/* ------------------------------------------------------------------ */
/* Arm models — C4D exports ship without materials and at ~70 units,   */
/* so every mesh gets the shared chrome and the rig is Box3-normalized */
/* ------------------------------------------------------------------ */

const chromeMaterial = new THREE.MeshStandardMaterial({
  color: "#efefef",
  metalness: 0.6,
  roughness: 0.4,
  side: THREE.DoubleSide,
});

export const orangeHandMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uAccent: { value: new THREE.Color(PALETTE.accent) },
    uLightDirection: { value: new THREE.Vector3(-4, 3, 1).normalize() },
  },
  vertexShader: `
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uAccent;
    uniform vec3 uLightDirection;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      vec3 normal = normalize(vWorldNormal);
      if (!gl_FrontFacing) normal *= -1.0;
      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      vec3 halfDirection = normalize(uLightDirection + viewDirection);

      float diffuse = max(dot(normal, uLightDirection), 0.0);
      float specular = pow(max(dot(normal, halfDirection), 0.0), 30.0);
      float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.3);
      float light = 0.012 + diffuse * 0.045 + rim * 0.34 + specular * 0.9;

      gl_FragColor = vec4(uAccent * light, 1.0);
    }
  `,
  side: THREE.DoubleSide,
  depthWrite: true,
  transparent: false,
  toneMapped: false,
});

/** Center + scale factors so an object's longest axis spans `target` world units.
    No reparenting here — mutating the cached GLTF graph inside useMemo breaks
    under StrictMode double-invocation; transforms are applied via group props.
    The measurement is cached per object so it always reflects the bind pose,
    never a mid-animation state from an earlier mount. */
const measureCache = new WeakMap<THREE.Object3D, { size: THREE.Vector3; center: THREE.Vector3 }>();

function useNormalized(object: THREE.Object3D, target: number) {
  return useMemo(() => {
    let measured = measureCache.get(object);
    if (!measured) {
      const box = new THREE.Box3().setFromObject(object);
      measured = { size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
      measureCache.set(object, measured);
    }
    const { size, center } = measured;
    const scale = target / Math.max(size.x, size.y, size.z);
    return {
      scale,
      position: [-center.x * scale, -center.y * scale, -center.z * scale] as const,
    };
  }, [object, target]);
}

/** The arm GLBs ship without materials — every mesh gets the shared chrome.
    The cached GLTF scene is cloned per mount: attaching the shared instance
    directly breaks under StrictMode/HMR remounts (the unmounting tree detaches
    it from its new parent). */
export function useChromeArm(
  url: string,
  targetHeight: number,
  material: THREE.Material = chromeMaterial,
) {
  const { scene } = useLoader(GLTFLoader, url);
  const cloned = useMemo(() => {
    const copy = cloneSkeleton(scene);
    copy.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
        child.frustumCulled = false;
      }
    });
    return copy;
  }, [scene, material]);
  const normalized = useNormalized(cloned, targetHeight);
  return { scene: cloned, ...normalized };
}

/** Raw GLB height of arm.glb and the normalized height the rigs size it to —
    together they turn a viewport-relative scale into world units. */
export const RAW_ARM_HEIGHT = 73.3446655;
export const NORMALIZED_ARM_HEIGHT = 5.15;
