/*
 * Two passes.
 *  scene: one ray marcher for the whole world. Every zone sits somewhere
 *         along -z and the camera flies through them; output is a small
 *         colour + coverage image, two texels per character cell.
 *  ascii: turns that image into characters. Silhouettes get edge glyphs,
 *         bodies a density ramp; stars fill the void.
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
/** most letters the wordmark can move one by one (the loader's way in) */
export const CUTS = 12;
export const LETTERS = 8;

export const fullVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const f = (n: number) => n.toFixed(4);

/** the shapes the object takes, in the order form() in the scene shader has them */
export const FORMS = ["blob", "atom", "cube", "code", "containers", "cloud", "network", "lock"] as const;
export type Form = (typeof FORMS)[number];
/** a #rrggbb colour as a GLSL vec3 */
const v3 = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `vec3(${f(((n >> 16) & 255) / 255)}, ${f(((n >> 8) & 255) / 255)}, ${f((n & 255) / 255)})`;
};

export const sceneFragment = /* glsl */ `
  precision highp float;
  #define CUTS ${CUTS}
  #define LETTERS ${LETTERS}
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
  uniform float uAtYaw;
  uniform float uAtGone;
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
  // the wordmark turned about its middle: yaw, pitch (radians; the whirl)
  uniform vec2 uTilt;
  // cuts the cursor makes through the wordmark: text-local xyz, radius
  uniform vec4 uCuts[CUTS];
  uniform float uCutsOn;
  // per letter of the wordmark: world offset x, y, scale, and its centre x at rest
  uniform vec4 uLetter[LETTERS];
  // where one letter ends and the next begins, at rest (count + 1 edges)
  uniform float uLetterEdge[LETTERS + 1];
  uniform float uLetterCount;
  uniform float uLettersOn;

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
  float sdSeg2(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }
  // the centre line of a ring of radius r, from angle a0 on through span
  // (counterclockwise), with round ends
  float sdArc2(vec2 p, float r, float a0, float span) {
    float t = mod(atan(p.y, p.x) - a0, 6.2831853);
    if (t <= span) return abs(length(p) - r);
    vec2 e0 = r * vec2(cos(a0), sin(a0));
    vec2 e1 = r * vec2(cos(a0 + span), sin(a0 + span));
    return min(length(p - e0), length(p - e1));
  }
  // the @, drawn as strokes rather than taken from a font: a round a with
  // its stem, a tail out to the right, and the big ring that starts there
  // and runs all the way round, open at the lower right. Exact, so it reads
  // the same on every machine and needs no texture.
  #define AT_R 2.55
  #define AT_W 0.42
  #define AT_FOOT -0.78
  float sdAt(vec2 p) {
    float bowl = abs(length(p - vec2(-0.3, 0.0)) - 1.0);
    float stem = sdSeg2(p, vec2(0.7, 1.0), vec2(0.7, AT_FOOT));
    float a0 = asin(AT_FOOT / AT_R);
    float tail = sdSeg2(p, vec2(0.7, AT_FOOT), vec2(AT_R * cos(a0), AT_FOOT));
    float ring = sdArc2(p, AT_R, a0, 5.55);
    return min(min(bowl, stem), min(tail, ring)) - AT_W;
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

  // the wordmark's own frame, turned by uTilt about its middle
  vec3 tilted(vec3 q) {
    float cy = cos(uTilt.x);
    float sy = sin(uTilt.x);
    q.xz = mat2(cy, sy, -sy, cy) * q.xz;
    float cp = cos(uTilt.y);
    float sp = sin(uTilt.y);
    q.yz = mat2(cp, -sp, sp, cp) * q.yz;
    return q;
  }

  // a 2D field from a texture; outside its rect we only know a lower bound
  float field(sampler2D t, vec2 size, vec2 p) {
    vec2 q = abs(p) - size * 0.5;
    float outside = length(max(q, 0.0));
    if (outside > 0.0) return outside + 0.02;
    return texture2D(t, p / size + 0.5).r;
  }

  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }

  // the edges of a box only: a wireframe cube
  float sdBoxFrame(vec3 p, vec3 b, float e) {
    p = abs(p) - b;
    vec3 q = abs(p + e) - e;
    return min(min(
      length(max(vec3(p.x, q.y, q.z), 0.0)) + min(max(p.x, max(q.y, q.z)), 0.0),
      length(max(vec3(q.x, p.y, q.z), 0.0)) + min(max(q.x, max(p.y, q.z)), 0.0)),
      length(max(vec3(q.x, q.y, p.z), 0.0)) + min(max(q.x, max(q.y, p.z)), 0.0));
  }

  // the wordmark with every letter moved and scaled on its own: each is read
  // from its own slab of the field, at the place it would have at rest
  float lettersField(vec2 q) {
    float d = 1e9;
    for (int i = 0; i < LETTERS; i++) {
      if (float(i) >= uLetterCount) break;
      vec4 L = uLetter[i];
      vec2 c = vec2(L.w, 0.0);
      vec2 p = (q - c - L.xy) / L.z + c;
      float slab = max(uLetterEdge[i] - p.x, p.x - uLetterEdge[i + 1]);
      d = min(d, max(field(tText, uTextSize, p), slab) * L.z);
    }
    return d;
  }

  // ---- the shapes the object in the void takes (FORMS in this file, in
  // the same order): the drifting blob next to About, then one symbol per
  // tool, chosen in lib/site.ts
  float form(int k, vec3 q) {
    if (k == 0) {
      // blob: five drifting balls melted together
      float d = 1e9;
      for (int i = 0; i < 5; i++) {
        d = smin(d, length(q - uBalls[i].xyz) - uBalls[i].w, 0.75);
      }
      return d;
    }
    if (k == 1) {
      // atom: a nucleus, three orbits facing us, an electron on each
      float d = length(q) - 0.42;
      for (int i = 0; i < 3; i++) {
        vec3 p = q;
        p.xy *= rot(float(i) * 2.0944 + uTime * 0.12);
        float e = (length(p.xy / vec2(2.15, 0.78)) - 1.0) * 0.78;
        d = min(d, length(vec2(e, p.z)) - 0.1);
        float a = uTime * (1.2 + float(i) * 0.35) + float(i) * 2.0;
        d = min(d, length(p - vec3(cos(a) * 2.15, sin(a) * 0.78, 0.0)) - 0.17);
      }
      return d;
    }
    if (k == 2) {
      // cube: only its edges, turning
      vec3 p = q;
      p.xz *= rot(uTime * 0.35);
      p.xy *= rot(0.62);
      return sdBoxFrame(p, vec3(1.15), 0.09);
    }
    if (k == 3) {
      // code: < / >
      vec3 p = q / 1.45;
      float r = 0.13;
      float d = min(sdCapsule(p, vec3(-1.05, 0.0, 0.0), vec3(-0.45, 0.72, 0.0), r),
                    sdCapsule(p, vec3(-1.05, 0.0, 0.0), vec3(-0.45, -0.72, 0.0), r));
      d = min(d, min(sdCapsule(p, vec3(1.05, 0.0, 0.0), vec3(0.45, 0.72, 0.0), r),
                     sdCapsule(p, vec3(1.05, 0.0, 0.0), vec3(0.45, -0.72, 0.0), r)));
      return min(d, sdCapsule(p, vec3(-0.2, -0.85, 0.0), vec3(0.2, 0.85, 0.0), r)) * 1.45;
    }
    if (k == 4) {
      // containers: two on the ground, one on top, ribbed sides
      float d = 1e9;
      for (int i = 0; i < 3; i++) {
        vec3 c = i == 2 ? vec3(0.0, 0.55, 0.0) : vec3(float(i) * 1.7 - 0.85, -0.42, 0.0);
        vec3 p = q - c;
        float box = sdRoundBox(p, vec3(0.78, 0.4, 0.62), 0.04);
        box += sin(p.x * 22.0) * 0.012;
        d = min(d, box);
      }
      return d;
    }
    if (k == 5) {
      // cloud: three big bumps over a low, flat base
      vec3 p = q * vec3(1.0, 1.0, 1.6);
      float d = sdRoundBox(p - vec3(0.0, -0.62, 0.0), vec3(1.7, 0.24, 0.5), 0.22);
      d = smin(d, length(p - vec3(-1.15, -0.28, 0.0)) - 0.6, 0.1);
      d = smin(d, length(p - vec3(-0.35, 0.4, 0.0)) - 0.95, 0.1);
      d = smin(d, length(p - vec3(0.7, 0.28, 0.0)) - 0.78, 0.1);
      d = smin(d, length(p - vec3(1.35, -0.3, 0.0)) - 0.5, 0.1);
      d = max(d, -0.86 - p.y);
      return d / 1.6;
    }
    if (k == 6) {
      // network: services in a ring around a hub, every one wired to it
      vec3 hub = vec3(0.0);
      float d = length(q) - 0.42;
      for (int i = 0; i < 5; i++) {
        float a = float(i) * 1.2566 + uTime * 0.2;
        vec3 n = vec3(cos(a) * 1.75, sin(a) * 1.15, sin(a * 2.0 + uTime) * 0.3);
        d = min(d, length(q - n) - 0.27);
        d = min(d, sdCapsule(q, hub, n, 0.07));
      }
      return d;
    }
    // lock: a body with a keyhole, and the shackle over it
    float body = sdRoundBox(q - vec3(0.0, -0.5, 0.0), vec3(1.1, 0.85, 0.42), 0.12);
    float key = min(length(q.xy - vec2(0.0, -0.3)) - 0.2, sdBox(q - vec3(0.0, -0.68, 0.0), vec3(0.08, 0.3, 1.0)));
    body = max(body, -key);
    vec3 s = q - vec3(0.0, 0.4, 0.0);
    float ring = max(length(vec2(length(s.xy) - 0.7, s.z)) - 0.16, -s.y);
    float legs = min(sdCapsule(q, vec3(-0.7, 0.4, 0.0), vec3(-0.7, -0.1, 0.0), 0.16),
                     sdCapsule(q, vec3(0.7, 0.4, 0.0), vec3(0.7, -0.1, 0.0), 0.16));
    return min(body, min(ring, legs));
  }

  float blob(vec3 p) {
    vec3 q = p - vec3(0.0, 0.0, ZB);
    // turned towards the camera (uBlobSpin), so a symbol reads from the front
    q.xz *= rot(uBlobSpin);
    float m = clamp(uMorph, 0.0, 7.0);
    int a = int(floor(m));
    int b = int(min(7.0, floor(m) + 1.0));
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
      vec3 q0 = p - vec3(0.0, 0.0, ZT);
      vec3 q = tilted(q0);
      // while the letters fly on their own they can be anywhere on screen;
      // a turned wordmark reaches further in depth
      vec2 ext = uLettersOn > 0.5 ? uTextSize * vec2(0.75, 2.6) : uTextSize * 0.5;
      float deep = 0.6 + abs(sin(uTilt.x)) * ext.x + abs(sin(uTilt.y)) * ext.y;
      float bx = sdBox(q0, vec3(ext, deep));
      float d2 = uLettersOn > 0.5 ? lettersField(q.xy) : field(tText, uTextSize, q.xy);
      float d = bx > 0.5 ? bx : extrude(d2 + 0.1, q.z, 0.34) - 0.1;
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
      // turned to face the camera (uAtYaw), so it is always seen square on;
      // only a breath of sway, never enough to show its sides
      q.xz *= rot(uAtYaw + sin(uTime * 0.45) * 0.03);
      q.yz *= rot(sin(uTime * 0.31) * 0.02);
      float bx = sdBox(q, vec3(AT_R + AT_W + 0.2, AT_R + AT_W + 0.2, 0.8));
      // a thin plate: seen square on, only its face shows, no inner walls
      float d = bx > 0.5 ? bx : extrude(sdAt(q.xy) + 0.05, q.z, 0.12) - 0.05;
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

    float m = h.y;
    // the @ leaves before the footer comes in: cell by cell, at random,
    // the lower ones first (uAtGone runs 0..1; the scene has 2x2 px a cell)
    if (uAtGone > 0.0 && abs(m - 4.0) < 0.5) {
      float key = hash(floor(gl_FragCoord.xy * 0.5)) * 0.75 + vUv.y * 0.25;
      if (key < uAtGone * 1.01) {
        gl_FragColor = vec4(0.0);
        return;
      }
    }
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 v = -rd;
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
    }
    if (m > 0.5 && m < 1.5 && uCutsOn > 0.5) {
      // fresh cut walls glow and cool down as the letters grow back
      vec3 q = tilted(p - vec3(0.0, 0.0, ZT));
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
    }
    if (m > 3.5 && m < 5.5) {
      col *= vec3(1.0, 0.72, 0.6);
    } else if (m > 2.5 && m < 3.5) {
      // the object takes a little warmth
      col *= mix(vec3(1.0), vec3(1.0, 0.7, 0.55), 0.35);
    }
    col *= ao * fog;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/*
 * The ASCII pass runs in two steps. asciiCells decides, once per character
 * cell, which glyph it shows and in what colour (scene, stars, weather,
 * ripples, the charge ring...), into a small target of one texel per cell:
 * rgb the colour already multiplied by its strength, a the glyph's index in
 * the atlas plus half the strength (-1 for nothing). asciiGlyphs then only
 * looks that up per screen pixel and draws the glyph. The work happens once
 * per cell instead of once per device pixel.
 */
export const asciiCells = (fg: string, atlas: {
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

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  vec4 scene(vec2 cell) {
    return texture2D(tScene, (cell + 0.5) / uGrid);
  }

  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }


  void main() {
    // one fragment per cell of the grid
    vec2 cell = floor(gl_FragCoord.xy);
    vec2 size = uGrid * uCell;
    vec2 center = size * 0.5;
    vec2 cellMid = (cell + 0.5) * uCell + uOffset;

    // ripples from clicks (x, y, radius in device px, strength): two thin
    // rings of dots, like a drop on still water; nothing is pushed around
    float ringHit = 0.0;
    for (int i = 0; i < 3; i++) {
      vec4 w = uWaves[i];
      if (w.w <= 0.0) continue;
      float d = length(cellMid - w.xy);
      float band = uCell.x * 1.3;
      float k = max(1.0 - abs(d - w.z) / band, (1.0 - abs(d - w.z * 0.6) / band) * 0.55);
      ringHit = max(ringHit, k * w.w);
    }

    vec4 s = scene(cell);
    vec2 suv = (cell + 0.5) / uGrid;

    float idx = -1.0;
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    float quiet = 1.0;
    vec2 fp = cellMid;
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
      if (alpha < 0.5 && ringHit > 0.15) {
        idx = ${f(atlas.ramp[0])} + (ringHit > 0.6 ? 3.0 : 1.0);
        col = mix(vec3(0.55, 0.53, 0.5), ${v3(fg)}, ringHit);
        alpha = ringHit * 0.85;
      } else if (alpha > 0.0) {
        col = mix(col, ${v3(fg)}, ringHit * 0.25);
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
      gl_FragColor = vec4(0.0, 0.0, 0.0, -1.0);
      return;
    }
    col = mix(col, vec3(1.0), uFlash);
    float strength = clamp(alpha * quiet, 0.0, 0.98);
    gl_FragColor = vec4(col * strength, idx + strength * 0.5);
  }
`;

/** the second step: per screen pixel, the glyph of its cell (see asciiCells) */
export const asciiGlyphs = (tiles: number) => /* glsl */ `
  precision highp float;
  uniform sampler2D tCells;
  uniform sampler2D tAtlas;
  uniform vec2 uGrid;
  uniform vec2 uCell;
  uniform vec2 uOffset;
  uniform float uImplode;
  // a held click charging: x, y, ring radius (device px), progress 0..1
  uniform vec4 uCharge;

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

    vec2 cell = floor(px / uCell);
    if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec4 c = texture2D(tCells, (cell + 0.5) / uGrid);
    if (c.a < -0.5) {
      gl_FragColor = vec4(0.0);
      return;
    }
    float idx = floor(c.a);
    float strength = fract(c.a) * 2.0;
    vec2 local = fract(px / uCell);
    float g = texture2D(tAtlas, vec2((idx + local.x) / ${f(tiles)}, local.y)).r;
    gl_FragColor = vec4(c.rgb * g, g * strength);
  }
`;
