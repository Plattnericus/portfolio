import { CanvasTexture, Color, DataTexture, HalfFloatType, LinearFilter, MathUtils, Mesh, NearestFilter, NoBlending, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderTarget, WebGLRenderer } from "three";
import { countGlyphs } from "../ascii/stats";
import { compileSoon } from "./compile";
import { site } from "../site";
import { digitField, textField, type TextField } from "./sdf-text";
import { fovFit } from "./path";
import { Starfield } from "./stars";
import { CUTS, LETTERS, Z, asciiCells, asciiGlyphs, fullVertex, sceneFragment } from "./shaders";
import { designUnit } from "../unit";

/*
 * The whole page background: one ray-marched world and a pass that prints
 * it as characters. Everything visual on the site except the
 * DOM type goes through here.
 */

const RAMP = " .,:;-=+*%#@";
const EDGES = "-/|\\";
const STARS = ".+*";
const NOISE = "#%&*+=<>/[]{}?!$@0123456789";
const ATLAS = RAMP + EDGES + STARS + NOISE;



export type CameraPose = { pos: Vector3; target: Vector3; fov: number; roll: number };

export type QuietRect = { x: number; y: number; w: number; h: number };

/** one letter of the wordmark moved from its place: world offset and scale */
export type Letter = { x: number; y: number; s: number };

export class World {
  readonly renderer: WebGLRenderer;
  private sceneRT: WebGLRenderTarget;
  /** one texel per character cell: its glyph and colour (see asciiCells) */
  private cellsRT: WebGLRenderTarget;
  private quadScene = new Scene();
  private quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: Mesh;
  private sceneMat: ShaderMaterial;
  private asciiMat: ShaderMaterial;
  private glyphMat: ShaderMaterial;
  private atlas: CanvasTexture | null = null;
  private stars = new Starfield();
  /** signed scroll speed, drives the hyperspace streaks */
  rush = 0;
  private fontFamily: string;
  private width = 1;
  private height = 1;
  private dpr = 1;
  cols = 1;
  rows = 1;
  cell = { w: 8, h: 15 };
  text: TextField | null = null;
  /** live camera pose, set by the page every frame */
  pose: CameraPose = {
    pos: new Vector3(0, 0, Z.digits + 8),
    target: new Vector3(0, 0, Z.digits),
    fov: 50,
    roll: 0,
  };
  fx = { flash: 0, implode: 0, warp: 0, sweep: 0 };
  /** click ripples: css px position and start time */
  private waves: { x: number; y: number; t: number }[] = [];
  private now = 0;

  /** the cursor cuts through the wordmark while this is on */
  cutting = false;
  /** cut points in text-local world units, with their birth time */
  private cuts: { x: number; y: number; t: number }[] = [];
  /** how many cuts are open right now */
  get openCuts() {
    return this.cuts.length;
  }
  private cutU = Array.from({ length: CUTS }, () => new Vector4());
  /** a whole turn about its upright axis, radians (the `whirl` secret) */
  spin = 0;
  /**
   * Each letter of the wordmark moved from its place (the loader flies them
   * in, the `wave` secret hops them); null while they all rest.
   */
  letters: Letter[] | null = null;
  private letterU = Array.from({ length: LETTERS }, () => new Vector4(0, 0, 1, 0));
  /** a held click charging at (x, y) css px; p 0..1 */
  charge = { x: 0, y: 0, p: 0 };

  /** a small ripple that runs out from (x, y) in css px */
  addWave(x: number, y: number) {
    this.waves.push({ x, y, t: this.now });
    if (this.waves.length > 3) this.waves.shift();
  }
  /** 0 none, 1 snow, 2 petals, 3 fireflies, 4 leaves */
  private light = new Vector3(-0.5, 0.6, 0.7);
  private lightPos = new Vector3();
  private blank: DataTexture;
  private balls = Array.from({ length: 5 }, () => new Vector4());
  morph = 0;
  /** the old loading counter; off unless a scene asks for it (see buildDigits) */
  digits: [number, number, number] | null = null;
  /** the old corridor of 3D screens; the projects play as 2D films now */
  screensOn = false;
  quiet: QuietRect[] = [];
  /**
   * WebGL without a GPU (SwiftShader, llvmpipe, a VM without acceleration).
   * There the browser copies every frame back to the page's main thread, so
   * the world draws only when something on it changes (see WorldCanvas).
   */
  readonly software: boolean;

  /** the key light has caught up with the cursor (it eases after it) */
  private lightDone = true;

  /** something on screen is still running on its own clock: ripples, cuts, letters, a spin, a charge, the light */
  get moving() {
    return (
      this.waves.length > 0 || this.cuts.length > 0 || this.letters !== null || this.spin !== 0 || this.charge.p > 0 || !this.lightDone
    );
  }

  constructor(canvas: HTMLCanvasElement, fontFamily: string) {
    this.fontFamily = fontFamily;
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.software = softwareGL(this.renderer.getContext());
    this.sceneRT = new WebGLRenderTarget(2, 2, {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });
    this.cellsRT = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
    });
    this.blank = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blank.needsUpdate = true;

    this.sceneMat = new ShaderMaterial({
      vertexShader: fullVertex,
      fragmentShader: sceneFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uCamPos: { value: new Vector3() },
        uCamF: { value: new Vector3() },
        uCamR: { value: new Vector3() },
        uCamU: { value: new Vector3() },
        uTanFov: { value: 0.5 },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uLight: { value: new Vector3() },
        uLightPos: { value: new Vector3() },
        tText: { value: this.blank },
        uTextSize: { value: new Vector2(1, 1) },
        tAt: { value: this.blank },
        uAtSize: { value: new Vector2(1, 1) },
        tDigits: { value: this.blank },
        uDigitSlot: { value: new Vector2(1, 1) },
        uDigits: { value: new Vector3(0, 0, 0) },
        uDigitsOn: { value: 0 },
        uBalls: { value: this.balls },
        uMorph: { value: 0 },
        uBlobSpin: { value: 0 },
        tVidA: { value: this.blank },
        tVidB: { value: this.blank },
        uVidA: { value: -1 },
        uVidB: { value: -1 },
        uScreensOn: { value: 1 },
        uTextOn: { value: 1 },
        uLetter: { value: this.letterU },
        uLetterEdge: { value: new Array<number>(LETTERS + 1).fill(0) },
        uLetterCount: { value: 0 },
        uLettersOn: { value: 0 },
        uTilt: { value: new Vector2() },
        uCuts: { value: this.cutU },
        uCutsOn: { value: 0 },
      },
    });

    const r0 = 0;
    const e0 = RAMP.length;
    const s0 = e0 + EDGES.length;
    const n0 = s0 + STARS.length;
    this.asciiMat = new ShaderMaterial({
      vertexShader: fullVertex,
      fragmentShader: asciiCells(site.colors.fg, {
        tiles: ATLAS.length,
        ramp: [r0, RAMP.length],
        edges: e0,
        stars: s0,
        noise: [n0, NOISE.length],
      }),
      // written as data, not blended
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        uGrid: { value: new Vector2(1, 1) },
        uCell: { value: new Vector2(8, 15) },
        uOffset: { value: new Vector2() },
        uWaves: { value: [new Vector4(), new Vector4(), new Vector4()] },
        uCharge: { value: new Vector4() },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uImplode: { value: 0 },
        uWarp: { value: 0 },
        uSweep: { value: 0 },
        uQuiet: { value: Array.from({ length: 4 }, () => new Vector4()) },
        uInk: { value: new Color(site.colors.fg) },
        tStars: { value: this.stars.target.texture },
      },
    });
    // the glyphs share the grid, the implosion and the charge with the cells
    const cu = this.asciiMat.uniforms;
    this.glyphMat = new ShaderMaterial({
      vertexShader: fullVertex,
      fragmentShader: asciiGlyphs(ATLAS.length),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      uniforms: {
        tCells: { value: this.cellsRT.texture },
        tAtlas: { value: this.blank },
        uGrid: cu.uGrid,
        uCell: cu.uCell,
        uOffset: cu.uOffset,
        uImplode: cu.uImplode,
        uCharge: cu.uCharge,
      },
    });

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.sceneMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /*
   * Every shader compiled before the first frame, all at once and, where the
   * browser can (KHR_parallel_shader_compile), off the thread that draws the
   * page: no frame waits on the compiler, so nothing that is moving (the
   * loader's letters) stutters. Each is compiled for the target it draws
   * into, since that is part of the program.
   */
  warm(): Promise<unknown> {
    const r = this.renderer;
    const geometry = this.quad.geometry;
    const into = (target: WebGLRenderTarget | null, material: ShaderMaterial) => {
      const scene = new Scene();
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      r.setRenderTarget(target);
      const done = compileSoon(r, scene, this.quadCam);
      r.setRenderTarget(null);
      return done;
    };
    const all = Promise.all([
      into(this.sceneRT, this.sceneMat),
      into(this.cellsRT, this.asciiMat),
      into(null, this.glyphMat),
      this.stars.warm(r),
    ]);
    // hand the compiles to the GPU process now, so it works on them while the
    // fonts load; unflushed they would wait for the first draw, and without
    // parallel compiling that draw would wait for all of them
    r.getContext().flush();
    return all;
  }

  /**
   * Builds the distance fields; needs the display font loaded. They are made
   * step by step in separate tasks, so none holds the page for long.
   */
  async build(displayFont: string) {
    this.text = await textField("NEXOR", displayFont, {
      worldWidth: 12,
      w: 1400,
      h: 360,
      tracking: 0.02,
      fill: 0.9,
    });
    // the @ from the mono face: its round, classic shape reads as an @ at
    // any angle; the display face's square one reads as a G in characters
    const at = await textField("@", this.fontFamily, { worldWidth: 6.4, w: 512, h: 512, fill: 0.86, weight: 800 });
    const u = this.sceneMat.uniforms;
    u.tText.value = this.text.texture;
    // where each letter's slab of the field begins and ends, for moving them one by one
    const c = this.text.centers.slice(0, LETTERS);
    const edges = u.uLetterEdge.value as number[];
    c.forEach((x, i) => (edges[i] = i === 0 ? -this.text!.size.x / 2 : (c[i - 1] + x) / 2));
    edges[c.length] = this.text.size.x / 2;
    u.uLetterCount.value = c.length;
    u.uTextSize.value.copy(this.text.size);
    u.tAt.value = at.texture;
    u.uAtSize.value.copy(at.size);
  }

  /** the 3D counter's digits, only built when something wants to show them */
  buildDigits(displayFont: string) {
    const digits = digitField(displayFont, 2.6);
    const u = this.sceneMat.uniforms;
    u.tDigits.value = digits.texture;
    u.uDigitSlot.value.copy(digits.slot);
  }

  private buildAtlas() {
    const tileW = Math.ceil(this.cell.w * this.dpr);
    const tileH = Math.ceil(this.cell.h * this.dpr);
    const can = document.createElement("canvas");
    can.width = tileW * ATLAS.length;
    can.height = tileH;
    const ctx = can.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, can.width, can.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${(this.cell.w / 0.6) * this.dpr}px ${this.fontFamily}`;
    for (let i = 0; i < ATLAS.length; i++) {
      ctx.fillText(ATLAS[i], i * tileW + tileW / 2, tileH / 2 + this.dpr * 0.5);
    }
    this.atlas?.dispose();
    const tex = new CanvasTexture(can);
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = false;
    this.atlas = tex;
    this.glyphMat.uniforms.tAtlas.value = tex;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    // without a GPU every device pixel is drawn and copied by the CPU
    this.dpr = this.software ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(width, height, false);
    // finer characters on phones, so the world keeps its detail on a small
    // screen; past 1920 they grow with the page, so a large screen looks the same
    const base = width < 520 ? 4.2 : width < 700 ? 6 : width > 1900 ? 8 * designUnit() : 7.2;
    this.cell = { w: base, h: Math.round(base * 1.9) };
    this.cols = Math.floor(width / this.cell.w);
    this.rows = Math.floor(height / this.cell.h);
    this.sceneRT.setSize(this.cols * 2, this.rows * 2);
    this.cellsRT.setSize(this.cols, this.rows);
    this.stars.resize(this.cols, this.rows, width / height);
    const u = this.asciiMat.uniforms;
    u.uGrid.value.set(this.cols, this.rows);
    u.uCell.value.set(this.cell.w * this.dpr, this.cell.h * this.dpr);
    u.uOffset.value.set(
      ((width - this.cols * this.cell.w) / 2) * this.dpr,
      ((height - this.rows * this.cell.h) / 2) * this.dpr,
    );
    this.buildAtlas();
  }

  /** keeps the wordmark out of the picture (while the loader hands over to it) */
  hideText = false;

  /** a point of the world on screen, in css px, for the current pose; null behind the camera */
  project(x: number, y: number, z: number) {
    const p = this.pose;
    const f = new Vector3().subVectors(p.target, p.pos).normalize();
    const worldUp = new Vector3(Math.sin(p.roll), Math.cos(p.roll), 0);
    const r = new Vector3().crossVectors(f, worldUp).normalize();
    const up = new Vector3().crossVectors(r, f).normalize();
    const aspect = this.width / this.height;
    const tan = Math.tan(MathUtils.degToRad(p.fov / 2)) * fovFit(aspect);
    const d = new Vector3(x, y, z).sub(p.pos);
    const depth = d.dot(f);
    if (depth <= 0.01) return null;
    return {
      x: ((1 + d.dot(r) / (depth * tan * aspect)) * this.width) / 2,
      y: ((1 - d.dot(up) / (depth * tan)) * this.height) / 2,
    };
  }

  /**
   * The tops of the wordmark's letters on screen, for drawing what rests on
   * them: pairs of css px x, y in `out`, how many, the screen width of one
   * column, and the open cuts (css px centre and radius) so nothing is
   * drawn where the cursor has cut the letters away. Null while the name is not
   * standing still on screen (hidden, flown through, its letters moving, or
   * the word spinning).
   */
  tops(out: Float32Array) {
    const text = this.text;
    const p = this.pose;
    const front = Z.text + 0.34;
    if (!text || this.hideText || this.letters || this.spin !== 0 || p.pos.z < front + 0.5) return null;
    const f = new Vector3().subVectors(p.target, p.pos).normalize();
    const worldUp = new Vector3(Math.sin(p.roll), Math.cos(p.roll), 0);
    const r = new Vector3().crossVectors(f, worldUp).normalize();
    const up = new Vector3().crossVectors(r, f).normalize();
    const aspect = this.width / this.height;
    const tan = Math.tan(MathUtils.degToRad(p.fov / 2)) * fovFit(aspect);
    const t = text.tops;
    const n = Math.min(t.length, out.length) / 2;
    let count = 0;
    let step = 0;
    for (let i = 0; i < n; i++) {
      const dx = t[i * 2] - p.pos.x;
      const dy = t[i * 2 + 1] - p.pos.y;
      const dz = front - p.pos.z;
      const depth = dx * f.x + dy * f.y + dz * f.z;
      if (depth <= 0.01) continue;
      out[count * 2] = ((1 + (dx * r.x + dy * r.y + dz * r.z) / (depth * tan * aspect)) * this.width) / 2;
      out[count * 2 + 1] = ((1 - (dx * up.x + dy * up.y + dz * up.z) / (depth * tan)) * this.height) / 2;
      if (!step) step = (text.step / (depth * tan * aspect)) * (this.width / 2);
      count++;
    }
    // where the cursor has cut the letters open, nothing can rest
    const holes: { x: number; y: number; r: number }[] = [];
    for (const u of this.cutU) {
      if (u.w <= 0.001) continue;
      const c = this.project(u.x, u.y, front);
      const edge = this.project(u.x + u.w, u.y, front);
      if (c && edge) holes.push({ x: c.x, y: c.y, r: Math.abs(edge.x - c.x) * 1.2 });
    }
    return { count, step, holes };
  }

  /** the point on the plane z = `z` under a screen point (css px), for the current pose */
  unproject(sx: number, sy: number, z: number) {
    const p = this.pose;
    const f = new Vector3().subVectors(p.target, p.pos).normalize();
    const worldUp = new Vector3(Math.sin(p.roll), Math.cos(p.roll), 0);
    const r = new Vector3().crossVectors(f, worldUp).normalize();
    const up = new Vector3().crossVectors(r, f).normalize();
    const aspect = this.width / this.height;
    const tan = Math.tan(MathUtils.degToRad(p.fov / 2)) * fovFit(aspect);
    const nx = (sx / this.width) * 2 - 1;
    const ny = 1 - (sy / this.height) * 2;
    const dir = f.add(r.multiplyScalar(nx * tan * aspect)).add(up.multiplyScalar(ny * tan));
    if (Math.abs(dir.z) < 1e-6) return null;
    const t = (z - p.pos.z) / dir.z;
    return { x: p.pos.x + dir.x * t, y: p.pos.y + dir.y * t };
  }

  /**
   * Without a GPU the shaders are really built the first time they draw
   * (SwiftShader compiles them then), and a frame on the canvas makes the
   * page's main thread wait for that, well over a second. So the first frame
   * is drawn while the canvas is hidden (a hidden canvas is not copied), and
   * this resolves once the GPU process reports it done, polled without ever
   * blocking.
   */
  async prime() {
    const gl = this.renderer.getContext();
    if (!this.software || !("fenceSync" in gl)) return;
    // the compiles from warm() first: the first draw asks for their results
    // and would otherwise sit and wait for them
    await idle(gl);
    // then one pass more each time, each in a task of its own, so no single
    // task carries every program's first use and every texture upload
    const canvas = this.renderer.domElement;
    canvas.style.visibility = "hidden";
    for (let upto = 1; upto <= 4; upto++) {
      this.render(0, 0.016, null, upto);
      await idle(gl);
    }
    canvas.style.visibility = "";
  }

  /**
   * pointer in css px, or null when there is none; `upto` stops after that
   * many of the four passes (scene, stars, cells, glyphs on the canvas)
   */
  render(time: number, dt: number, pointer: { x: number; y: number } | null, upto = 4) {
    const su = this.sceneMat.uniforms;
    const p = this.pose;
    const f = new Vector3().subVectors(p.target, p.pos).normalize();
    const worldUp = new Vector3(Math.sin(p.roll), Math.cos(p.roll), 0);
    const r = new Vector3().crossVectors(f, worldUp).normalize();
    const up = new Vector3().crossVectors(r, f).normalize();
    su.uCamPos.value.copy(p.pos);
    su.uCamF.value.copy(f);
    su.uCamR.value.copy(r);
    su.uCamU.value.copy(up);
    // narrow screens widen the view so the same scene fits across
    const aspect = this.width / this.height;
    const fit = fovFit(aspect);
    su.uTanFov.value = Math.tan(MathUtils.degToRad(p.fov / 2)) * fit;
    su.uAspect.value = aspect;
    su.uTime.value = time;

    // key light comes from where the cursor is, relative to the view
    const lx = pointer ? (pointer.x / this.width - 0.5) * 2.2 : Math.cos(time * 0.35) * 0.9;
    const ly = pointer ? -(pointer.y / this.height - 0.5) * 1.8 : 0.45 + Math.sin(time * 0.35) * 0.4;
    const target = new Vector3()
      .addScaledVector(r, lx)
      .addScaledVector(up, ly)
      .addScaledVector(f, -0.9)
      .normalize();
    this.light.lerp(target, 0.08);
    // without a cursor the light circles on the clock, which is never done
    this.lightDone = !pointer || this.light.distanceToSquared(target) < 1e-4;
    su.uLight.value.copy(this.light);
    // the point light floats a few units in front of the camera, under the cursor
    const lp = new Vector3()
      .copy(p.pos)
      .addScaledVector(f, 3.2)
      .addScaledVector(r, lx * 3.4)
      .addScaledVector(up, ly * 2.2);
    this.lightPos.lerp(lp, 0.12);
    su.uLightPos.value.copy(this.lightPos);

    if (this.digits) {
      su.uDigitsOn.value = 1;
      su.uDigits.value.set(this.digits[0], this.digits[1], this.digits[2]);
    } else su.uDigitsOn.value = 0;
    su.uScreensOn.value = this.screensOn ? 1 : 0;
    // past the O the wordmark is behind us; drawing it would only show
    // stray edges behind the copy when the camera turns around
    su.uTextOn.value = this.pose.pos.z > -10 && !this.hideText ? 1 : 0;
    const L = this.letters;
    su.uLettersOn.value = L && this.text ? 1 : 0;
    if (L && this.text) {
      const centers = this.text.centers;
      for (let i = 0; i < LETTERS; i++) {
        const l = L[i];
        this.letterU[i].set(l?.x ?? 0, l?.y ?? 0, l?.s ?? 1, centers[i] ?? 0);
      }
    }
    this.updateCuts(time, pointer, f, r, up, su.uTanFov.value, aspect);
    su.uTilt.value.set(this.spin, 0);
    su.uMorph.value = this.morph;
    // the object turns to face the camera, with a slow sway
    su.uBlobSpin.value = Math.atan2(this.pose.pos.x, this.pose.pos.z - Z.blob) + Math.sin(time * 0.4) * 0.25;
    for (let i = 0; i < 5; i++) {
      const a = time * (0.35 + i * 0.11) + i * 1.7;
      this.balls[i].set(
        Math.sin(a) * 1.1,
        Math.cos(a * 1.3) * 0.9,
        Math.sin(a * 0.7 + 1.0) * 0.8,
        0.75 + 0.18 * Math.sin(a * 1.9),
      );
    }


    this.quad.material = this.sceneMat;
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear();
    this.renderer.render(this.quadScene, this.quadCam);
    this.renderer.setRenderTarget(null);
    if (upto < 2) return;

    // hyperspace: the field's camera matches the view's vertical fov
    const fovEff = MathUtils.radToDeg(2 * Math.atan(su.uTanFov.value));
    this.stars.update(this.renderer, Math.max(dt, 0.001), time, fovEff, this.rush, this.fx.warp);
    if (upto < 3) return;

    const au = this.asciiMat.uniforms;
    au.uTime.value = time;
    this.now = time;
    const wv = au.uWaves.value as Vector4[];
    const LIFE = 1.25;
    this.waves = this.waves.filter((w) => time - w.t < LIFE);
    // a small ripple, like a drop on still water: it never crosses the screen
    const reach = Math.min(200, Math.hypot(this.width, this.height) * 0.13);
    for (let i = 0; i < 3; i++) {
      const w = this.waves[i];
      if (!w) {
        wv[i].set(0, 0, 0, 0);
        continue;
      }
      const age = time - w.t;
      const k = age / LIFE;
      const radius = (1 - Math.pow(1 - k, 2.2)) * reach;
      wv[i].set(w.x * this.dpr, (this.height - w.y) * this.dpr, radius * this.dpr, Math.pow(1 - k, 2));
    }
    const ch = this.charge;
    (au.uCharge.value as Vector4).set(
      ch.x * this.dpr,
      (this.height - ch.y) * this.dpr,
      (46 - ch.p * 10) * this.dpr,
      ch.p,
    );
    au.uFlash.value = this.fx.flash;
    au.uImplode.value = this.fx.implode;
    au.uWarp.value = this.fx.warp;
    au.uSweep.value = this.fx.sweep;
    const q = au.uQuiet.value as Vector4[];
    for (let i = 0; i < 4; i++) {
      const rect = this.quiet[i];
      if (rect) {
        // css px, y down -> device px, y up
        q[i].set(
          rect.x * this.dpr,
          (this.height - rect.y - rect.h) * this.dpr,
          rect.w * this.dpr,
          rect.h * this.dpr,
        );
      } else q[i].set(0, 0, 0, 0);
    }
    // every cell once, then the glyphs at full resolution
    this.quad.material = this.asciiMat;
    this.renderer.setRenderTarget(this.cellsRT);
    this.renderer.render(this.quadScene, this.quadCam);
    this.renderer.setRenderTarget(null);
    if (upto < 4) return;
    this.quad.material = this.glyphMat;
    this.renderer.render(this.quadScene, this.quadCam);
    countGlyphs(this.cols * this.rows);
  }

  /**
   * Where the cursor's ray meets the front of the wordmark, a cut opens. It
   * stays open for a moment, then the letters grow back over it.
   */
  private updateCuts(
    time: number,
    pointer: { x: number; y: number } | null,
    f: Vector3,
    r: Vector3,
    up: Vector3,
    tanFov: number,
    aspect: number,
  ) {
    const LIFE = 2.4;
    const R = 0.46;
    const su = this.sceneMat.uniforms;
    const text = this.text;
    const front = Z.text + 0.34;
    if (this.cutting && pointer && text && this.pose.pos.z > front + 0.5) {
      const nx = (pointer.x / this.width) * 2 - 1;
      const ny = 1 - (pointer.y / this.height) * 2;
      const dir = new Vector3()
        .copy(f)
        .addScaledVector(r, nx * tanFov * aspect)
        .addScaledVector(up, ny * tanFov);
      if (dir.z < -1e-4) {
        const k = (front - this.pose.pos.z) / dir.z;
        const x = this.pose.pos.x + dir.x * k;
        const y = this.pose.pos.y + dir.y * k;
        const inside = Math.abs(x) < text.size.x / 2 + R && Math.abs(y) < text.size.y / 2 + R;
        const last = this.cuts[this.cuts.length - 1];
        if (inside && (!last || Math.hypot(x - last.x, y - last.y) > 0.2)) {
          this.cuts.push({ x, y, t: time });
          if (this.cuts.length > CUTS) this.cuts.shift();
        }
      }
    }
    this.cuts = this.cuts.filter((c) => time - c.t < LIFE);
    for (let i = 0; i < CUTS; i++) {
      const c = this.cuts[i];
      if (!c) {
        this.cutU[i].set(0, 0, 0, 0);
        continue;
      }
      const a = (time - c.t) / LIFE;
      // opens fast, holds, then closes
      const open = 1 - Math.pow(1 - Math.min(1, (time - c.t) / 0.12), 3);
      const close = 1 - MathUtils.smoothstep(a, 0.3, 1);
      this.cutU[i].set(c.x, c.y, 0, R * open * close);
    }
    su.uCutsOn.value = this.cuts.length ? 1 : 0;
  }

  dispose() {
    this.sceneRT.dispose();
    this.cellsRT.dispose();
    this.stars.dispose();
    this.atlas?.dispose();
    this.sceneMat.dispose();
    this.asciiMat.dispose();
    this.glyphMat.dispose();
    this.renderer.dispose();
  }
}

/** true when WebGL runs on the CPU: SwiftShader, llvmpipe and the like */
function softwareGL(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

/** resolves once the GPU process has done everything asked of it so far, polled, never waited on */
function idle(gl: WebGL2RenderingContext) {
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  return new Promise<void>((done) => {
    const poll = () => {
      if (sync && gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED) return void setTimeout(poll, 30);
      if (sync) gl.deleteSync(sync);
      done();
    };
    setTimeout(poll, 30);
  });
}
