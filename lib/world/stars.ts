import { AdditiveBlending, BufferAttribute, BufferGeometry, HalfFloatType, LineBasicMaterial, LineSegments, Material, MathUtils, NearestFilter, PerspectiveCamera, Points, PointsMaterial, Scene, WebGLRenderTarget, WebGLRenderer } from "three";

/*
 * The hyperspace field from the first version of the site, rebuilt for
 * characters. Stars live in camera space and drift towards the viewer;
 * scrolling throws them past at speed and stretches each into a streak.
 * They are rasterised into a target with one texel per character cell and
 * the ASCII pass turns heads into . + * and streaks into - / | \ pointing
 * away from the centre.
 */

const COUNT = 520;
const NEAR = -0.6;
const FAR = -70;
const SPAN = NEAR - FAR;
const WIDTH = 34;

export class Starfield {
  readonly target: WebGLRenderTarget;
  private scene = new Scene();
  private camera = new PerspectiveCamera(50, 1, 0.1, 200);
  private x = new Float32Array(COUNT);
  private y = new Float32Array(COUNT);
  private z = new Float32Array(COUNT);
  private seed = new Float32Array(COUNT);
  private dotPos = new Float32Array(COUNT * 3);
  private dotCol = new Float32Array(COUNT * 3);
  private linePos = new Float32Array(COUNT * 6);
  private lineCol = new Float32Array(COUNT * 6);
  private dots: Points;
  private lines: LineSegments;
  /** world units per second the field rushes at, eased */
  private speed = 0;
  /** 0..1 overall visibility */
  opacity = 1;

  constructor() {
    this.target = new WebGLRenderTarget(2, 2, {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
    });
    for (let i = 0; i < COUNT; i++) this.spawn(i, FAR + Math.random() * SPAN);

    const dg = new BufferGeometry();
    dg.setAttribute("position", new BufferAttribute(this.dotPos, 3));
    dg.setAttribute("color", new BufferAttribute(this.dotCol, 3));
    this.dots = new Points(
      dg,
      new PointsMaterial({
        size: 1,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    const lg = new BufferGeometry();
    lg.setAttribute("position", new BufferAttribute(this.linePos, 3));
    lg.setAttribute("color", new BufferAttribute(this.lineCol, 3));
    this.lines = new LineSegments(
      lg,
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.dots.frustumCulled = false;
    this.lines.frustumCulled = false;
    this.scene.add(this.lines, this.dots);
  }

  private spawn(i: number, z: number) {
    // keep a clear lane in the middle so nothing sits on the copy for long
    let x = 0;
    let y = 0;
    do {
      x = (Math.random() * 2 - 1) * WIDTH;
      y = (Math.random() * 2 - 1) * WIDTH * 0.62;
    } while (Math.abs(x) < 1.2 && Math.abs(y) < 1.2);
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.seed[i] = Math.random();
  }

  resize(cols: number, rows: number, aspect: number) {
    this.target.setSize(cols, rows);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * `rush` is how fast the page is moving (scroll velocity, signed), `boost`
   * an extra push for the loader's dive.
   */
  update(renderer: WebGLRenderer, dt: number, time: number, fovDeg: number, rush: number, boost: number) {
    // three scales point size by the pixel ratio; the target is one texel per cell
    const pm = this.dots.material as PointsMaterial;
    const want1 = 1 / renderer.getPixelRatio();
    if (pm.size !== want1) pm.size = want1;
    if (this.camera.fov !== fovDeg) {
      this.camera.fov = fovDeg;
      this.camera.updateProjectionMatrix();
    }
    const want = 1.2 + rush * 1.6 + boost * 120;
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    const travel = this.speed * dt;
    const streak = MathUtils.clamp(this.speed * 0.075, -14, 14);
    const fast = Math.min(1, Math.abs(this.speed) / 30);
    const spin = time * 0.01;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    const op = this.opacity;

    for (let i = 0; i < COUNT; i++) {
      let z = this.z[i] + travel;
      if (z > NEAR) {
        this.spawn(i, z - SPAN);
        z = this.z[i];
      } else if (z < FAR) {
        this.spawn(i, z + SPAN);
        z = this.z[i];
      }
      this.z[i] = z;
      // the whole field turns very slowly
      const x = this.x[i] * cs - this.y[i] * sn;
      const y = this.x[i] * sn + this.y[i] * cs;
      // nearer stars are brighter; everything fades in from the far end
      const depth = (z - FAR) / SPAN;
      const twinkle = 0.75 + 0.25 * Math.sin(time * (1 + this.seed[i] * 3) + this.seed[i] * 40);
      const b = Math.min(1, depth * depth * depth * 1.5) * twinkle * op;
      const d = i * 3;
      this.dotPos[d] = x;
      this.dotPos[d + 1] = y;
      this.dotPos[d + 2] = z;
      this.dotCol[d] = b;
      this.dotCol[d + 1] = 1;
      this.dotCol[d + 2] = 0;
      const l = i * 6;
      this.linePos[l] = x;
      this.linePos[l + 1] = y;
      this.linePos[l + 2] = z;
      this.linePos[l + 3] = x;
      this.linePos[l + 4] = y;
      this.linePos[l + 5] = z - streak * (0.6 + this.seed[i] * 0.8);
      // the head of the streak is lit, its tail fades out
      this.lineCol[l] = b * fast;
      this.lineCol[l + 1] = 0;
      this.lineCol[l + 2] = 0;
      this.lineCol[l + 3] = 0;
      this.lineCol[l + 4] = 0;
      this.lineCol[l + 5] = 0;
    }
    (this.dots.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.dots.geometry.attributes.color as BufferAttribute).needsUpdate = true;
    (this.lines.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.lines.geometry.attributes.color as BufferAttribute).needsUpdate = true;

    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  /** compiles both shaders for the target they draw into, without waiting on them */
  warm(renderer: WebGLRenderer) {
    renderer.setRenderTarget(this.target);
    const done = renderer.compileAsync(this.scene, this.camera);
    renderer.setRenderTarget(null);
    return done;
  }

  dispose() {
    this.target.dispose();
    this.dots.geometry.dispose();
    this.lines.geometry.dispose();
    (this.dots.material as Material).dispose();
    (this.lines.material as Material).dispose();
  }
}
