/*
 * Two passes.
 *  scene: one ray marcher for the whole world. Every zone sits somewhere
 *         along -z and the camera flies through them; output is a small
 *         colour + coverage image, two texels per character cell.
 *  ascii: turns that image into characters. Silhouettes get edge glyphs,
 *         bodies a density ramp; stars and seasonal weather fill the void.
 */

export const Z = {
  digits: 18,
  text: 0,
  blob: -24,
  screens: -46,
  screenGap: 11,
  at: -134,
};

export const SCREEN = { hw: 2.0, hh: 1.5, x: 2.7, turn: 0.55 };

/** how many cuts through the wordmark are kept open at once */
export const CUTS = 12;

export const fullVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const f = (n: number) => n.toFixed(4);

export const sceneFragment = /* glsl */ `
  precision highp float;
  #define CUTS ${CUTS}
  varying vec2 vUv;

  uniform vec3 uCamPos;
  uniform vec3 uCamF;
  uniform vec3 uCamR;
  uniform vec3 uCamU;
  uniform float uTanFov;
  uniform float uAspect;
  uniform float uTime;
  uniform vec3 uLight;
  uniform vec3 uLightPos;

  uniform sampler2D tText;
  uniform vec2 uTextSize;
  uniform sampler2D tAt;
  uniform vec2 uAtSize;
  uniform sampler2D tDigits;
  uniform vec2 uDigitSlot;
  uniform vec3 uDigits;
  uniform float uDigitsOn;

  uniform vec4 uBalls[5];
  uniform float uMorph;
  uniform float uBlobSpin;

  uniform sampler2D tVidA;
  uniform sampler2D tVidB;
  uniform float uVidA;
  uniform float uVidB;
  uniform float uScreensOn;
  uniform float uTextOn;
  // cuts the cursor makes through the wordmark: text-local xyz, radius
  uniform vec4 uCuts[CUTS];
  uniform float uCutsOn;

  #define ZD ${f(Z.digits)}
  #define ZT ${f(Z.text)}
  #define ZB ${f(Z.blob)}
  #define ZS ${f(Z.screens)}
  #define ZGAP ${f(Z.screenGap)}
  #define ZA ${f(Z.at)}
  #define SHW ${f(SCREEN.hw)}
  #define SHH ${f(SCREEN.hh)}
  #define SX ${f(SCREEN.x)}
  #define STURN ${f(SCREEN.turn)}

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }
  float sdRoundBox(vec3 p, vec3 b, float r) {
    vec3 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
  }
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }
  float extrude(float d2, float z, float h) {
    vec2 w = vec2(d2, abs(z) - h);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
  }
  // a cone through the slab, wide at the front: the walls face the camera
  // a little, so the hot cut stays visible. Not an exact distance; the
  // 0.85 keeps the marcher from stepping through it.
  float cutField(vec3 q) {
    float d = 1e9;
    for (int i = 0; i < CUTS; i++) {
      vec4 c = uCuts[i];
      if (c.w <= 0.001) continue;
      float taper = mix(0.42, 1.0, clamp((q.z + 0.45) / 0.9, 0.0, 1.0));
      d = min(d, (length(q.xy - c.xy) - c.w * taper) * 0.85);
    }
    return d;
  }
  float smax(float a, float b, float k) { return -smin(-a, -b, k); }

  // a 2D field from a texture; outside its rect we only know a lower bound
  float field(sampler2D t, vec2 size, vec2 p) {
    vec2 q = abs(p) - size * 0.5;
    float outside = length(max(q, 0.0));
    if (outside > 0.0) return outside + 0.02;
    return texture2D(t, p / size + 0.5).r;
  }

  // ---- the shapes the object in the void takes, one per skill
  float form(int k, vec3 q) {
    if (k == 0) {
      float d = 1e9;
      for (int i = 0; i < 5; i++) {
        d = smin(d, length(q - uBalls[i].xyz) - uBalls[i].w, 0.75);
      }
      return d;
    }
    if (k == 1) {
      vec3 p = q;
      p.xz *= rot(p.y * 0.9 + uTime * 0.4);
      vec2 t = vec2(length(p.xz) - 1.55, p.y);
      return length(t) - 0.55;
    }
    if (k == 2) {
      vec3 p = q;
      p.xy *= rot(uTime * 0.3);
      return sdRoundBox(p, vec3(1.25), 0.28);
    }
    if (k == 3) {
      float d = 1e9;
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec3 p = q - vec3(sin(uTime * 0.7 + fi) * 0.25, (fi - 1.5) * 0.78, 0.0);
        p.xz *= rot(fi * 0.45 + sin(uTime * 0.5 + fi * 1.7) * 0.4);
        d = min(d, sdRoundBox(p, vec3(1.45, 0.3, 0.85), 0.06));
      }
      return d;
    }
    if (k == 4) {
      vec3 p = q * 2.1;
      float g = abs(dot(sin(p + uTime * 0.6), cos(p.zxy))) / 2.1 - 0.09;
      return max(length(q) - 2.0, g);
    }
    if (k == 5) {
      vec3 p = abs(q);
      float d = (p.x + p.y + p.z - 2.1) * 0.57735;
      return d - 0.08;
    }
    // shell with a slot cut through: a lock face
    float shell = abs(length(q) - 1.75) - 0.22;
    float slot = sdBox(q - vec3(0.0, -0.2, 0.0), vec3(0.18, 0.55, 3.0));
    float hole = length(q.xy - vec2(0.0, 0.35)) - 0.32;
    return max(shell, -min(slot, max(hole, -1.0)));
  }

  float blob(vec3 p) {
    vec3 q = p - vec3(0.0, 0.0, ZB);
    q.xz *= rot(uBlobSpin);
    q.yz *= rot(0.25);
    float m = clamp(uMorph, 0.0, 6.0);
    int a = int(floor(m));
    int b = int(min(6.0, floor(m) + 1.0));
    float t = smoothstep(0.0, 1.0, fract(m));
    if (t < 0.001 || a == b) return form(a, q);
    return mix(form(a, q), form(b, q), t);
  }

  // screens alternate left and right of the corridor and turn towards it
  vec3 screenLocal(vec3 p, float i) {
    float side = mod(i, 2.0) < 0.5 ? -1.0 : 1.0;
    vec3 c = vec3(side * SX, 0.0, ZS - i * ZGAP);
    vec3 q = p - c;
    q.xz *= rot(-side * STURN);
    return q;
  }

  vec2 map(vec3 p) {
    vec2 res = vec2(1e9, 0.0);

    // loader digits
    if (uDigitsOn > 0.5) {
      vec3 q = p - vec3(0.0, 0.0, ZD);
      float bx = sdBox(q, vec3(uDigitSlot.x * 1.7, uDigitSlot.y * 0.6, 0.6));
      if (bx > 0.6) {
        res = vec2(bx, 0.0);
      } else {
        for (int i = 0; i < 3; i++) {
          float dig = uDigits[i];
          if (dig < 0.0) continue;
          vec2 lp = q.xy - vec2((float(i) - 1.0) * uDigitSlot.x * 0.84, 0.0);
          vec2 qq = abs(lp) - uDigitSlot * 0.5;
          float outside = length(max(qq, 0.0));
          float d2 = outside > 0.0
            ? outside + 0.02
            : texture2D(tDigits, vec2((dig + lp.x / uDigitSlot.x + 0.5) / 10.0, lp.y / uDigitSlot.y + 0.5)).r;
          float d = extrude(d2 + 0.08, q.z, 0.3) - 0.08;
          if (d < res.x) res = vec2(d, 2.0);
        }
      }
    }

    // the wordmark, only until the camera has flown through it
    if (uTextOn > 0.5) {
      vec3 q = p - vec3(0.0, 0.0, ZT);
      float bx = sdBox(q, vec3(uTextSize * 0.5, 0.6));
      float d = bx > 0.5 ? bx : extrude(field(tText, uTextSize, q.xy) + 0.1, q.z, 0.34) - 0.1;
      if (uCutsOn > 0.5 && bx <= 0.5) d = smax(d, -cutField(q), 0.1);
      if (d < res.x) res = vec2(d, 1.0);
    }

    // the object in the void
    {
      float bx = length(p - vec3(0.0, 0.0, ZB)) - 3.2;
      float d = bx > 0.4 ? bx : blob(p);
      if (d < res.x) res = vec2(d, 3.0);
    }

    // corridor of screens
    if (uScreensOn > 0.5) {
      float zr = (ZS + 6.0) - p.z;
      if (zr > -4.0 && zr < 7.0 * ZGAP + 6.0) {
        for (int i = 0; i < 7; i++) {
          vec3 q = screenLocal(p, float(i));
          float d = sdRoundBox(q, vec3(SHW, SHH, 0.06), 0.03);
          if (d < res.x) res = vec2(d, 10.0 + float(i));
        }
      }
    }

    // the at sign
    {
      vec3 q = p - vec3(0.0, 0.0, ZA);
      q.xz *= rot(sin(uTime * 0.45) * 0.32);
      q.yz *= rot(sin(uTime * 0.31) * 0.12);
      float bx = sdBox(q, vec3(uAtSize * 0.5, 0.8));
      float d = bx > 0.5 ? bx : extrude(field(tAt, uAtSize, q.xy) + 0.12, q.z, 0.45) - 0.12;
      if (d < res.x) res = vec2(d, 4.0);
    }
    return res;
  }

  vec3 normalAt(vec3 p) {
    vec2 e = vec2(0.003, -0.003);
    return normalize(
      e.xyy * map(p + e.xyy).x +
      e.yyx * map(p + e.yyx).x +
      e.yxy * map(p + e.yxy).x +
      e.xxx * map(p + e.xxx).x
    );
  }

  void main() {
    vec2 sp = vUv * 2.0 - 1.0;
    vec3 rd = normalize(uCamF + uCamR * sp.x * uTanFov * uAspect + uCamU * sp.y * uTanFov);
    vec3 ro = uCamPos;

    float t = 0.02;
    vec2 h = vec2(0.0);
    bool hit = false;
    int steps = 0;
    for (int i = 0; i < 120; i++) {
      vec3 p = ro + rd * t;
      h = map(p);
      if (h.x < 0.0015 * t + 0.0008) { hit = true; break; }
      t += h.x * 0.92;
      steps = i;
      if (t > 80.0) break;
    }

    if (!hit) {
      gl_FragColor = vec4(0.0);
      return;
    }

    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 v = -rd;
    float m = h.y;
    // a point light that sits where the cursor points, plus the soft key
    vec3 toL = uLightPos - p;
    float dl = length(toL);
    vec3 Lp = toL / dl;
    float att = 1.0 / (1.0 + dl * dl * 0.012);
    vec3 L = normalize(uLight);
    vec3 F = normalize(vec3(-L.x, -0.4, -abs(L.z)) + 0.3 * uCamF);
    float diff = max(dot(n, Lp), 0.0) * att * 1.6 + max(dot(n, L), 0.0) * 0.25;
    float fill = max(dot(n, F), 0.0);
    float spec = pow(max(dot(reflect(-Lp, n), v), 0.0), 36.0) * att * 1.8;
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float ao = 1.0 - float(steps) / 160.0;
    float fog = exp(-max(0.0, t - 6.0) * 0.045);

    vec3 warm = vec3(1.0, 0.86, 0.74);
    vec3 cool = vec3(0.38, 0.55, 0.78);
    vec3 col = warm * (0.04 + diff * 0.9) + cool * fill * 0.38 + vec3(1.0) * spec * 0.9 + cool * rim * 0.45;

    if (m >= 10.0) {
      float i = m - 10.0;
      vec3 q = screenLocal(p, i);
      bool face = q.z > 0.0 && abs(q.x) < SHW - 0.1 && abs(q.y) < SHH - 0.1;
      if (face) {
        vec2 uv = vec2(q.x / SHW, q.y / SHH) * 0.5 + 0.5;
        vec3 vc;
        if (abs(i - uVidA) < 0.5) vc = texture2D(tVidA, uv).rgb;
        else if (abs(i - uVidB) < 0.5) vc = texture2D(tVidB, uv).rgb;
        else {
          float nz = hash(floor(uv * vec2(80.0, 40.0)) + floor(uTime * 12.0));
          vc = vec3(nz * 0.35);
        }
        col = vc * 1.15 + spec * 0.3;
      } else {
        col = vec3(0.18, 0.17, 0.16) * (0.3 + diff) + spec * 0.6;
      }
    } else if (m > 0.5 && m < 1.5 && uCutsOn > 0.5) {
      // fresh cut walls glow and cool down as the letters grow back
      vec3 q = p - vec3(0.0, 0.0, ZT);
      float heat = 0.0;
      for (int i = 0; i < CUTS; i++) {
        vec4 c = uCuts[i];
        if (c.w <= 0.001) continue;
        float taper = mix(0.42, 1.0, clamp((q.z + 0.45) / 0.9, 0.0, 1.0));
        float w = length(q.xy - c.xy) - c.w * taper;
        heat = max(heat, smoothstep(0.16, 0.0, w) * clamp(c.w / 0.5, 0.0, 1.0));
      }
      vec3 hot = mix(vec3(1.0, 0.28, 0.1), vec3(1.0, 0.82, 0.55), heat * heat);
      col = mix(col, hot * (0.75 + diff * 0.6 + spec), heat);
    } else if (m > 3.5) {
      col *= vec3(1.0, 0.72, 0.6);
    } else if (m > 2.5) {
      // the object takes a little warmth
      col *= mix(vec3(1.0), vec3(1.0, 0.7, 0.55), 0.35);
    }
    col *= ao * fog;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const asciiFragment = (atlas: {
  tiles: number;
  ramp: [number, number];
  edges: number;
  noise: [number, number];
  stars: number;
}) => /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tStars;
  uniform sampler2D tAtlas;
  uniform vec2 uGrid;
  uniform vec2 uCell;
  uniform vec2 uOffset;
  uniform float uTime;
  uniform float uFlash;
  uniform float uImplode;
  uniform float uWarp;
  uniform float uSweep;
  uniform vec4 uQuiet[4];
  uniform vec4 uWaves[3];
  // a held click charging: x, y, ring radius (device px), progress 0..1
  uniform vec4 uCharge;
  uniform vec3 uInk;
  uniform float uWeather;
  uniform vec3 uWeatherA;
  uniform vec3 uWeatherB;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float glyph(float index, vec2 local) {
    return texture2D(tAtlas, vec2((index + local.x) / ${f(atlas.tiles)}, local.y)).r;
  }

  vec4 scene(vec2 cell) {
    return texture2D(tScene, (cell + 0.5) / uGrid);
  }

  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  void main() {
    vec2 px = gl_FragCoord.xy - uOffset;
    vec2 size = uGrid * uCell;
    vec2 center = size * 0.5;

    // implosion: the grid is pulled into the middle and twisted
    if (uImplode > 0.0) {
      vec2 rel = px - center;
      float r = length(rel) / length(center);
      float a = uImplode * (1.0 - r) * 4.0;
      rel = mat2(cos(a), -sin(a), sin(a), cos(a)) * rel;
      px = center + rel * (1.0 + uImplode * 3.0 * (1.0 - r * 0.6));
    }


    // a held click pulls the characters around it in, turning
    if (uCharge.w > 0.0) {
      vec2 rel = px - uCharge.xy;
      float reach = uCharge.z * 3.2;
      float k = clamp(1.0 - length(rel) / reach, 0.0, 1.0);
      k = k * k * uCharge.w;
      float a = k * 2.4;
      rel = mat2(cos(a), -sin(a), sin(a), cos(a)) * rel;
      px = uCharge.xy + rel * (1.0 + k * 1.6);
    }

    // shockwaves from clicks (x, y, radius in device px, strength): a ring
    // of line glyphs runs outwards and bends the characters it passes
    float ringHit = 0.0;
    vec2 ringDir = vec2(0.0);
    vec2 cellMid = (floor(px / uCell) + 0.5) * uCell + uOffset;
    for (int i = 0; i < 3; i++) {
      vec4 w = uWaves[i];
      if (w.w <= 0.0) continue;
      vec2 rel = cellMid - w.xy;
      float d = length(rel);
      float k = 1.0 - abs(d - w.z) / (uCell.x * (2.0 + w.z / 260.0));
      if (k * w.w > ringHit) {
        ringHit = k * w.w;
        ringDir = rel / max(d, 1.0);
      }
    }
    px -= ringDir * ringHit * uCell.x * 1.8;

    vec2 cell = floor(px / uCell);
    vec2 local = fract(px / uCell);
    if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) {
      gl_FragColor = vec4(0.0);
      return;
    }

    vec4 s = scene(cell);
    vec2 suv = (cell + 0.5) / uGrid;

    float idx = -1.0;
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    float quiet = 1.0;
    vec2 fp = gl_FragCoord.xy;
    for (int i = 0; i < 4; i++) {
      vec4 q = uQuiet[i];
      if (q.z > 0.0) {
        vec2 d = max(q.xy - fp, fp - (q.xy + q.zw));
        float o = max(d.x, d.y);
        float jag = hash(cell + 3.1) * 3.0 * uCell.x;
        if (o < -jag) quiet = min(quiet, 0.1);
      }
    }

    float lum = luma(s.rgb);
    if (s.a > 0.5) {
      // silhouette and crease detection on neighbouring cells
      vec4 l = scene(cell + vec2(-1.0, 0.0));
      vec4 r = scene(cell + vec2(1.0, 0.0));
      vec4 t = scene(cell + vec2(0.0, 1.0));
      vec4 b = scene(cell + vec2(0.0, -1.0));
      float ca = step(0.5, l.a) + step(0.5, r.a) + step(0.5, t.a) + step(0.5, b.a);
      vec2 ga = vec2(step(0.5, r.a) - step(0.5, l.a), step(0.5, t.a) - step(0.5, b.a));
      vec2 gl = vec2(luma(r.rgb) - luma(l.rgb), luma(t.rgb) - luma(b.rgb));
      bool sil = ca < 3.5 && length(ga) > 0.5;
      bool crease = !sil && length(gl) > 0.55;
      if (sil || crease) {
        vec2 G = sil ? ga : gl;
        G /= uCell;
        float ang = mod(degrees(atan(G.x, -G.y)), 180.0);
        idx = ${f(atlas.edges)} + mod(floor(ang / 45.0 + 0.5), 4.0);
        lum = max(lum, 0.45);
      } else {
        float k = pow(clamp(lum * 1.15, 0.0, 1.0), 0.85);
        k += (hash(cell + floor(uTime * 6.0)) - 0.5) * 0.06;
        idx = ${f(atlas.ramp[0])} + clamp(floor(k * ${f(atlas.ramp[1])}), 1.0, ${f(atlas.ramp[1] - 1)});
      }
      float mx = max(s.r, max(s.g, s.b));
      vec3 hue = mx > 0.001 ? s.rgb / mx : vec3(1.0);
      col = hue * (0.35 + 0.65 * clamp(lum * 1.3, 0.0, 1.0));
      alpha = 1.0;
    } else {
      // hyperspace: heads are points, streaks point away from the centre
      vec4 st = texture2D(tStars, (cell + 0.5) / uGrid);
      if (st.r > 0.035) {
        float b = clamp(st.r, 0.0, 1.0);
        if (st.g > 0.5) {
          idx = ${f(atlas.stars)} + (b > 0.7 ? 2.0 : b > 0.35 ? 1.0 : 0.0);
        } else {
          vec2 rel = (cell + 0.5) * uCell - center;
          float ang = mod(degrees(atan(rel.y, rel.x)), 180.0);
          idx = ${f(atlas.edges)} + mod(floor(ang / 45.0 + 0.5), 4.0);
        }
        col = mix(vec3(0.62, 0.7, 0.86), vec3(0.96, 0.95, 1.0), b);
        alpha = clamp(0.25 + b * 0.9, 0.0, 1.0);
      }
    }

    // the season's weather, once its secret has been found
    if (uWeather > 0.5 && alpha < 0.5) {
      if (uWeather < 2.5 || uWeather > 3.5) {
        bool leaves = uWeather > 3.5;
        for (int k = 0; k < 2; k++) {
          float s = hash(vec2(cell.x, 3.1 + float(k) * 7.7));
          if (s > (leaves ? 0.07 : 0.16)) continue;
          float speed = mix(3.0, 9.0, fract(s * 13.0)) * (leaves ? 0.6 : uWeather > 1.5 ? 0.7 : 1.0);
          float y = (1.0 - fract(s * 9.1 + uTime * speed / uGrid.y)) * uGrid.y;
          if (abs(cell.y - floor(y)) < 0.5) {
            if (leaves) idx = ${f(atlas.edges)} + mod(floor(uTime * 4.0 + s * 40.0), 4.0);
            else idx = ${f(atlas.ramp[0])} + (s < 0.1 ? 8.0 : s < 0.2 ? 7.0 : 1.0);
            col = mix(uWeatherA, uWeatherB, fract(s * 5.0));
            alpha = leaves ? 0.8 : 0.6;
          }
        }
      } else {
        // summer: fireflies that blink where they are
        float h = hash(cell + floor(uTime * 0.2) * 0.37);
        if (h > 0.9978) {
          idx = ${f(atlas.ramp[0])} + 7.0;
          col = mix(uWeatherA, uWeatherB, fract(h * 37.0));
          alpha = (0.5 + 0.5 * sin(uTime * 3.0 + h * 90.0)) * 0.8;
        }
      }
    }

    // a scan front for transitions
    if (uSweep > 0.0 && uSweep < 1.0) {
      float y = 1.0 - suv.y;
      float dist = abs(y - uSweep);
      if (dist < 0.03) {
        idx = ${f(atlas.noise[0])} + floor(hash(cell + floor(uTime * 40.0)) * ${f(atlas.noise[1])});
        col = mix(uInk, vec3(1.0, 0.4, 0.2), step(0.5, hash(cell)));
        alpha = 1.0 - dist / 0.03;
      }
    }

    if (ringHit > 0.04) {
      if (alpha < 0.5 && ringHit > 0.28) {
        float ang = mod(degrees(atan(ringDir.y, ringDir.x)) + 90.0, 180.0);
        idx = ${f(atlas.edges)} + mod(floor(ang / 45.0 + 0.5), 4.0);
        col = mix(vec3(1.0, 0.36, 0.18), vec3(1.0, 0.92, 0.84), ringHit);
        alpha = ringHit;
      } else if (alpha > 0.0) {
        col = mix(col, vec3(1.0, 0.6, 0.4), ringHit * 0.7);
      }
    }

    // the charge ring fills clockwise from the top; the rest is a faint track
    if (uCharge.w > 0.0) {
      vec2 rel = cellMid - uCharge.xy;
      float d = length(rel);
      vec2 nrm = rel / max(d, 1.0);
      float band = 0.5 * (abs(nrm.x) * uCell.x + abs(nrm.y) * uCell.y);
      if (abs(d - uCharge.z) < band) {
        float done = fract(atan(rel.x, rel.y) / 6.2831853 + 1.0);
        float ang = mod(degrees(atan(rel.y, rel.x)) + 90.0, 180.0);
        idx = ${f(atlas.edges)} + mod(floor(ang / 45.0 + 0.5), 4.0);
        bool lit = done <= uCharge.w;
        col = lit ? mix(vec3(1.0, 0.36, 0.18), vec3(1.0, 0.9, 0.8), uCharge.w * uCharge.w) : vec3(0.5, 0.48, 0.46);
        alpha = lit ? 1.0 : 0.4 * min(1.0, uCharge.w * 4.0);
        quiet = 1.0;
      }
    }

    if (idx < 0.0 || alpha <= 0.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float g = glyph(idx, local);
    col = mix(col, vec3(1.0), uFlash);
    float a = g * alpha * quiet * (1.0 - uFlash * 0.0);
    gl_FragColor = vec4(col * a, a);
  }
`;
