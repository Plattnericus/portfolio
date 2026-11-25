import type { Camera, Scene, WebGLRenderer } from "three";

/**
 * compileAsync where the browser compiles in parallel; elsewhere (WebGL
 * without a GPU) a plain compile, which is all compileAsync would do there
 * too, minus its console warning.
 */
export function compileSoon(r: WebGLRenderer, scene: Scene, camera: Camera): Promise<unknown> {
  if (r.extensions.has("KHR_parallel_shader_compile")) return r.compileAsync(scene, camera);
  r.compile(scene, camera);
  return Promise.resolve();
}
