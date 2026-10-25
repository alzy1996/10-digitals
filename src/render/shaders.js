// GLSL ES 3.00 shaders for photo-real polish.
// Source texture is uploaded as SRGB8_ALPHA8 → sampling returns LINEAR light; all math is linear;
// output is re-encoded to sRGB. Real highlights already on the nail are reused, so the virtual
// polish catches the SAME lights as the real hand.

export const COPY_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

export const COPY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec3 uTint;       // light preview (salon / daylight / evening hall), linear multiplier
out vec4 outColor;
vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  outColor = vec4(encode(texture(uSrc, vUv).rgb * uTint), 1.0);
}`

export const NAIL_VS = `#version 300 es
in vec2 aLocal;           // local nail coords in px: x across (signed), y along from cuticle
uniform vec2 uRes;
uniform vec2 uCuticle;    // px position of cuticle center
uniform vec2 uAxis;       // unit vector cuticle → tip (image space, y down)
out vec2 vLocal;
out vec2 vUv;
void main() {
  vec2 perp = vec2(-uAxis.y, uAxis.x);
  vec2 p = uCuticle + perp * aLocal.x + uAxis * aLocal.y;
  vLocal = aLocal;
  vUv = p / uRes;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}`

export const NAIL_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSrc;
uniform vec2 uRes;
uniform vec2 uAxis;
uniform vec2 uCenterUv;
uniform float uLen;       // natural plate length px
uniform float uExt;       // extension px beyond natural free edge
uniform float uWid;       // full plate width px
uniform float uTipRound, uTaper, uPoint, uCoffin;
uniform vec3 uColor, uColor2, uArtColor;
uniform int uArt;         // 0 none 1 french 2 microfrench 3 ombre 4 chrometip 5 halfmoon
uniform float uOpacity, uGloss, uRough, uMetal, uSparkle, uFlake, uIrid, uApex;
uniform int uMode;        // 0 std 1 chrome 2 holo 3 cateye 4 duochrome 5 velvet 6 pearl
uniform float uAlpha, uTime, uSeed, uExposure, uMeanLod, uFrameLod;
uniform vec2 uTilt;
uniform vec3 uLightDir, uIllum;
uniform float uShowEdges;
uniform vec3 uTint;

const float PI = 3.14159265;

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 hash42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}
vec3 rainbow(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

// Half-width of the nail outline at distance y from the cuticle (px). Negative = outside.
float halfWidthAt(float y, float w, float Lt) {
  if (y < 0.0 || y > Lt) return -1.0;
  // U-shaped cuticle
  float rc = min(0.62 * w, 0.4 * Lt);
  float hw = w;
  if (y < rc) { float t = (rc - y) / rc; hw = w * sqrt(max(0.0, 1.0 - t * t)); }
  // taper toward the tip (oval / almond / coffin / stiletto)
  float tStart = mix(Lt * 0.55, Lt * 0.25, max(uPoint, uCoffin * 0.6));
  if (y > tStart) {
    float t = (y - tStart) / max(Lt - tStart, 1.0);
    hw *= 1.0 - uTaper * (uCoffin > 0.5 ? t : t * t);
  }
  // tip curve
  float wt = hw;
  float tz;
  float rr;
  if (uPoint > 0.0) { tz = min(wt * mix(1.0, 3.4, uPoint), (Lt - rc) * 0.85); rr = wt; }
  else { rr = uTipRound * wt; tz = rr; }
  float yT = Lt - tz;
  if (y > yT && tz > 0.5) {
    float t = clamp((y - yT) / tz, 0.0, 1.0);
    float a = mix(2.0, 1.15, uPoint);
    float b = mix(0.5, 1.3, uPoint);
    hw = (wt - rr) + rr * pow(max(0.0, 1.0 - pow(t, a)), b);
  }
  return hw;
}

void main() {
  float w = uWid * 0.5;
  float Lt = uLen + uExt;
  float y = vLocal.y;
  float x = vLocal.x;
  float hw = halfWidthAt(y, w, Lt);
  // implicit outline (≈ px distance) for anti-aliasing
  float f = max(abs(x) - hw, max(-y, y - Lt));
  if (hw < 0.0) f = max(f, 1.0);
  float aa = max(fwidth(f), 0.75);
  float cov = 1.0 - smoothstep(-aa, aa * 0.6, f);
  // soft cuticle edge (polish never touches the cuticle) + soft sidewalls
  cov *= smoothstep(0.0, max(2.0, uLen * 0.05), y);
  if (cov <= 0.002) discard;

  float s = clamp(x / max(hw, 1.0), -1.0, 1.0);      // transverse −1..1
  float yn = clamp(y / max(Lt, 1.0), 0.0, 1.0);      // longitudinal 0..1
  float natural = 1.0 - smoothstep(uLen * 0.92, uLen * 1.04, y);  // 1 over the real nail, 0 on extension

  // ---------- geometry: curved plate normal (C-curve + slight longitudinal arch + apex)
  vec2 perp = vec2(-uAxis.y, uAxis.x);
  float nxL = s * 0.78;
  float nyL = (yn - 0.5) * 0.32 + uApex * 0.45 * (yn - 0.42);
  vec3 N = normalize(vec3(perp * nxL + uAxis * nyL, sqrt(max(0.05, 1.0 - nxL * nxL - nyL * nyL))));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(uLightDir + vec3(uTilt * 0.35, 0.0));
  vec3 H = normalize(L + V);

  // ---------- read the real photo
  vec3 src = texture(uSrc, vUv).rgb;
  vec3 low = textureLod(uSrc, vUv, max(uMeanLod - 1.6, 0.0)).rgb;
  vec3 mean = textureLod(uSrc, uCenterUv, uMeanLod).rgb;
  float lSrc = lum(src), lLow = lum(low), lMean = max(lum(mean), 0.003);
  float shade = mix(1.0, clamp(lLow / lMean, 0.55, 1.35), natural);
  float detail = mix(1.0, clamp(lSrc / max(lLow, 0.002), 0.75, 1.3), natural);
  float realSpec = natural * clamp((lSrc - lLow * 1.1) / lMean, 0.0, 2.5);

  // ---------- choose the paint for this pixel (art)
  vec3 paint = uColor;
  float tipMask = 0.0;
  float freeEdge = uExt > 1.0 ? uLen * 0.93 : uLen * 0.8;
  if (uArt == 1 || uArt == 4) {
    float smile = (uExt > 1.0 ? freeEdge : uLen * 0.78) - 0.16 * Lt * s * s;
    tipMask = smoothstep(smile - 1.2, smile + 1.2, y);
  } else if (uArt == 2) {
    float band = Lt - max(Lt * 0.09, 3.0) - 0.05 * Lt * s * s;
    tipMask = smoothstep(band - 0.8, band + 0.8, y);
  } else if (uArt == 3) {
    tipMask = smoothstep(0.3, 1.0, yn);
  } else if (uArt == 5) {
    float moon = 0.24 * Lt * (1.0 - 0.6 * s * s);
    tipMask = 1.0 - smoothstep(moon - 1.0, moon + 1.0, y);
  }
  paint = mix(paint, uArtColor, tipMask);
  int mode = uMode;
  float metal = uMetal;
  float gloss = uGloss;
  float rough = uRough;
  if (uArt == 4 && tipMask > 0.5) { mode = 1; metal = 1.0; gloss = 1.0; rough = 0.05; }

  // ---------- environment from the camera itself (for chrome / reflections)
  vec2 rUv = clamp(uCenterUv + (vUv - uCenterUv) * -0.6 + N.xy * 0.22, 0.0, 1.0);
  vec3 env = textureLod(uSrc, rUv, uMeanLod + 1.0).rgb;
  float frameL = max(lum(textureLod(uSrc, vec2(0.5), uFrameLod).rgb), 0.02);

  // ---------- lighting
  float E = uExposure;
  vec3 illum = uIllum * E;
  float NdH = max(dot(N, H), 0.0);
  float shin = mix(6.0, 520.0, pow(1.0 - rough, 2.2));
  float specSynth = pow(NdH, shin) * (shin + 8.0) / (8.0 * PI) * 0.035;
  float fres = 0.04 + 0.96 * pow(1.0 - max(N.z, 0.0), 5.0);
  // salon "softbox" streak along the nail (classic gel highlight)
  float s0 = clamp(-L.x * 0.9 - 0.25, -0.7, 0.4);
  float sCurve = s0 + 0.08 * (yn - 0.5) * (yn - 0.5) * 4.0;
  float streak = exp(-pow((s - sCurve) / mix(0.14, 0.42, rough), 2.0)) * smoothstep(0.1, 0.38, yn) * smoothstep(0.98, 0.66, yn);
  float band = 0.55 + 0.45 * cos(s * 4.6 + 1.2 + uTilt.x * 2.0);   // cylinder mirror bands

  // ---------- base color
  vec3 albedo = paint;
  float wrapL = clamp((dot(N, L) + 0.4) / 1.4, 0.0, 1.0);
  float curvature = mix(0.6, 1.06, wrapL);                          // C-curve: sides turn away from the light
  vec3 diffuse = albedo * illum * shade * curvature * mix(1.0, detail, 0.06 + 0.3 * (1.0 - uOpacity)) * (1.0 - metal * 0.82);
  // sheer / jelly: tint the real nail like colored glass
  vec3 tint = albedo / max(max(albedo.r, max(albedo.g, albedo.b)), 0.04);
  vec3 jelly = src * mix(vec3(1.0), tint, 0.85) * 0.92;
  float op = mix(min(1.0, uOpacity + 0.3), uOpacity, natural);
  op = max(op, tipMask * 0.98);
  vec3 col = mix(jelly, diffuse, op);
  // pooling at sidewalls / cuticle
  col *= 1.0 - (0.1 * smoothstep(0.7, 1.0, abs(s)) + 0.08 * pow(abs(s), 3.0)) * op;

  // ---------- special finishes
  if (mode == 1 || mode == 2) {
    float e = lum(env) / frameL;
    float darkBand = 1.0 - 0.75 * exp(-pow((s - 0.18 - uTilt.x * 0.3) / 0.16, 2.0));
    float mirror = clamp((0.55 * pow(band, 1.6) + 0.45 * smoothstep(0.1, 1.7, e)) * darkBand, 0.0, 1.0);
    vec3 metalCol = albedo * (0.06 + 1.45 * pow(mirror, 1.5)) * illum;
    if (mode == 2) {
      float h = s * 0.9 + yn * 0.7 + dot(N.xy, vec2(1.3, 0.8)) + uTilt.x * 0.8 + uTilt.y * 0.5 + uSeed;
      metalCol = mix(metalCol, rainbow(h) * (0.35 + 0.9 * mirror) * illum, uIrid * 0.75);
    }
    col = metalCol;
  } else if (mode == 3) {
    float sc = clamp(uTilt.x * 0.9 + sin(uSeed * 6.0) * 0.15, -0.65, 0.65);
    float bandCE = exp(-pow((s - sc) / 0.17, 2.0)) * (0.55 + 0.45 * smoothstep(0.05, 0.4, yn));
    float grain = 0.7 + 0.3 * hash12(floor(vLocal * 0.9) + uSeed);
    col = col * (1.0 - bandCE * 0.3) + uColor2 * illum * bandCE * 1.5 * grain;
  } else if (mode == 4) {
    float t = clamp(1.0 - N.z * 1.05 + uTilt.x * 0.5 + s * 0.3, 0.0, 1.0);
    col = mix(col, uColor2 * illum * shade, smoothstep(0.15, 0.85, t));
  } else if (mode == 5) {
    float glow = exp(-pow(s / 0.55, 2.0)) * (0.6 + 0.4 * sin(yn * 3.0 + uTilt.y * 2.0 + uSeed));
    vec3 g2 = length(uColor2) > 0.01 ? uColor2 : albedo * 2.2;
    float grain = 0.6 + 0.4 * hash12(floor(vLocal * 1.2) + uSeed);
    col += g2 * illum * glow * 0.75 * grain;
  } else if (mode == 6) {
    float sheen = pow(NdH, 5.0);
    vec3 pearlTint = mix(vec3(1.0, 0.86, 0.92), vec3(0.85, 0.93, 1.0), s * 0.5 + 0.5);
    col += pearlTint * sheen * 0.22 * uIrid * illum + 0.04 * illum;
  }

  // ---------- glitter / shimmer flakes (twinkle as the hand moves)
  if (uSparkle > 0.0) {
    float cell = max(uFlake * uWid, 1.4);
    vec2 g = vLocal / cell;
    vec2 id = floor(g);
    vec2 fr = fract(g);
    vec4 r = hash42(id + uSeed * 17.0);
    float present = step(r.x, uSparkle * 0.92);
    vec2 c = vec2(0.2) + r.yz * 0.6;
    float d = length(fr - c);
    float flakeMask = present * (1.0 - smoothstep(0.26, 0.38, d));
    vec3 fnL = normalize(vec3((r.y - 0.5) * 1.7, (r.w - 0.5) * 1.7, 1.0));
    vec3 fn = normalize(vec3(perp * fnL.x + uAxis * fnL.y, fnL.z));
    float sp = pow(max(dot(reflect(-L, fn), V), 0.0), 18.0);
    vec3 flakeCol = mix(albedo * 1.6, vec3(1.0), 0.45);
    if (uIrid > 0.3) flakeCol = mix(flakeCol, rainbow(r.w + uSeed), 0.6);
    float intensity = uFlake > 0.06 ? 3.2 : 1.4;
    col = mix(col, flakeCol * illum * (0.25 + intensity * sp), flakeMask * (uFlake > 0.06 ? 0.9 : 0.55));
  }

  // ---------- clear coat: reuse REAL highlights + synthetic streak + Fresnel reflection
  vec3 specCol = mix(vec3(1.0), albedo * 1.8 + 0.08, metal * 0.85);
  float g = clamp(gloss, 0.0, 1.0);
  vec3 spec = specCol * illum * (realSpec * g * 0.7 + specSynth * g + streak * g * g * 0.34);
  spec += env * fres * g * 0.35;
  if (rough > 0.8) spec = vec3(0.025 * (1.0 - N.z)) * illum;   // matte: chalky soft sheen only
  col += spec;

  // optional fit-outline (fine-tune mode)
  if (uShowEdges > 0.5) {
    float edge = 1.0 - smoothstep(0.0, 1.6, abs(f + 1.0));
    col = mix(col, vec3(1.0, 0.85, 0.5), edge * 0.9);
  }

  outColor = vec4(encode(col * uTint), cov * uAlpha);
}`
