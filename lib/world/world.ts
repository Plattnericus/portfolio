import { CanvasTexture, Color, DataTexture, HalfFloatType, LinearFilter, MathUtils, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderTarget, WebGLRenderer } from "three";
import { countGlyphs } from "../ascii/stats";
import { digitField, textField, type TextField } from "./sdf-text";
import { fovFit } from "./path";
import { Starfield } from "./stars";
import { CUTS, Z, asciiFragment, fullVertex, sceneFragment } from "./shaders";

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

export class World {
  readonly renderer: WebGLRenderer;
  private sceneRT: WebGLRenderTarget;
  private quadScene = new Scene();
  private quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: Mesh;
  private sceneMat: ShaderMaterial;
  private asciiMat: ShaderMaterial;
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
  /** click shockwaves: css px position and start time */
  private waves: { x: number; y: number; t: number }[] = [];
  private now = 0;

  /** the cursor cuts through the wordmark while this is on */
  cutting = false;
  /** cut points in text-local world units, with their birth time */
  private cuts: { x: number; y: number; t: number }[] = [];
  private cutU = Array.from({ length: CUTS }, () => new Vector4());
  /** a held click charging at (x, y) css px; p 0..1 */
  charge = { x: 0, y: 0, p: 0 };

  /** a ring that runs out from (x, y) in css px */
  addWave(x: number, y: number) {
    this.waves.push({ x, y, t: this.now });
    if (this.waves.length > 3) this.waves.shift();
  }
  /** 0 none, 1 snow, 2 petals, 3 fireflies, 4 leaves */
  weather = { kind: 0, a: new Color(), b: new Color() };
  private light = new Vector3(-0.5, 0.6, 0.7);
  private lightPos = new Vector3();
  private blank: DataTexture;
  private balls = Array.from({ length: 5 }, () => new Vector4());
  morph = 0;
  digits: [number, number, number] | null = [0, 0, 0];
  /** the old corridor of 3D screens; the projects play as 2D films now */
  screensOn = false;
  quiet: QuietRect[] = [];

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
    this.sceneRT = new WebGLRenderTarget(2, 2, {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: LinearFilter,
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
        uDigitsOn: { value: 1 },
        uBalls: { value: this.balls },
        uMorph: { value: 0 },
        uBlobSpin: { value: 0 },
        tVidA: { value: this.blank },
        tVidB: { value: this.blank },
        uVidA: { value: -1 },
        uVidB: { value: -1 },
        uScreensOn: { value: 1 },
        uTextOn: { value: 1 },
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
      fragmentShader: asciiFragment({
        tiles: ATLAS.length,
        ramp: [r0, RAMP.length],
        edges: e0,
        stars: s0,
        noise: [n0, NOISE.length],
      }),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        tAtlas: { value: this.blank },
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
        uInk: { value: new Color("#efeae2") },
        tStars: { value: this.stars.target.texture },
        uWeather: { value: 0 },
        uWeatherA: { value: new Color() },
        uWeatherB: { value: new Color() },
      },
    });

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.sceneMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** builds the distance fields; needs the display font loaded */
  build(displayFont: string) {
    this.text = textField("NEXOR", displayFont, {
      worldWidth: 12,
      w: 1400,
      h: 360,
      tracking: 0.02,
      fill: 0.9,
    });
    const at = textField("@", displayFont, { worldWidth: 6.4, w: 512, h: 512, fill: 0.86 });
    const digits = digitField(displayFont, 2.6);
    const u = this.sceneMat.uniforms;
    u.tText.value = this.text.texture;
    u.uTextSize.value.copy(this.text.size);
    u.tAt.value = at.texture;
    u.uAtSize.value.copy(at.size);
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
    this.asciiMat.uniforms.tAtlas.value = tex;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(width, height, false);
    const base = width < 700 ? 6 : width > 1900 ? 8 : 7.2;
    this.cell = { w: base, h: Math.round(base * 1.9) };
    this.cols = Math.floor(width / this.cell.w);
    this.rows = Math.floor(height / this.cell.h);
    this.sceneRT.setSize(this.cols * 2, this.rows * 2);
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

  /** pointer in css px, or null when there is none */
  render(time: number, dt: number, pointer: { x: number; y: number } | null) {
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
    su.uTextOn.value = this.pose.pos.z > -10 ? 1 : 0;
    this.updateCuts(time, pointer, f, r, up, su.uTanFov.value, aspect);
    su.uMorph.value = this.morph;
    su.uBlobSpin.value = time * 0.25;
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

    // hyperspace: the field's camera matches the view's vertical fov
    const fovEff = MathUtils.radToDeg(2 * Math.atan(su.uTanFov.value));
    this.stars.update(this.renderer, Math.max(dt, 0.001), time, fovEff, this.rush, this.fx.warp);

    const au = this.asciiMat.uniforms;
    au.uTime.value = time;
    this.now = time;
    const wv = au.uWaves.value as Vector4[];
    const LIFE = 2.1;
    this.waves = this.waves.filter((w) => time - w.t < LIFE);
    for (let i = 0; i < 3; i++) {
      const w = this.waves[i];
      if (!w) {
        wv[i].set(0, 0, 0, 0);
        continue;
      }
      const age = time - w.t;
      // fast at first, then easing out, like a real shock front
      const radius = (1 - Math.pow(1 - age / LIFE, 1.6)) * Math.hypot(this.width, this.height) * 0.72;
      wv[i].set(w.x * this.dpr, (this.height - w.y) * this.dpr, radius * this.dpr, Math.pow(1 - age / LIFE, 1.4));
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
    au.uWeather.value = this.weather.kind;
    au.uWeatherA.value.copy(this.weather.a);
    au.uWeatherB.value.copy(this.weather.b);
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
    this.quad.material = this.asciiMat;
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
    this.stars.dispose();
    this.atlas?.dispose();
    this.sceneMat.dispose();
    this.asciiMat.dispose();
    this.renderer.dispose();
  }
}
