#version 300 es
// KHUSLA luminance-preserving hair recolor (PRD 7.1) + technique masks (7.2) + finishes (4.8)
// + Light Switcher (7.3) + regrowth (7.5) + hijab visible zone (7.8).
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSrc;   // display photo (sRGB, private-blurred background)
uniform sampler2D uAux1;  // R alpha, G root distance r, B face-frame, A outer layer
uniform sampler2D uAux2;  // R local mean L/100, G local sigma/40, B lower silhouette, A hijab-visible
uniform sampler2D uAux3;  // R fine streaks, G medium streaks, B chunky streaks, A sweep noise
uniform sampler2D uAux4;  // R money bands, G top+sides, B/A reserved

uniform int uTech;        // 0 none, 1 global, 2 root, 3 drench, 4 highlights, 5 partial, 6 babylights, 7 lowlights,
                          // 8 balayage, 9 foilyage, 10 ombre, 11 sombre, 12 reverse, 13 melt, 14 shadow,
                          // 15 money, 16 peekaboo, 17 split, 18 chunky, 19 chroma, 20 gloss
uniform float uStart;
uniform float uDensity;
uniform float uSoftness;
uniform vec3 uTarget;     // Lab, primary shade
uniform vec3 uTarget2;    // Lab, second shade (melt root / shadow root / chroma B / split B)
uniform vec3 uTarget3;    // Lab, melt middle stop
uniform vec3 uFoilEnds;   // Lab, foilyage ends (one extra level)
uniform float uHairMeanL; // mean L* of her hair
uniform float uMaxCm;     // root-distance r = 1 in cm
uniform float uPartX;     // part line x in uv
uniform float uRegrowthCm;
uniform float uRegrowthSoft;
uniform float uFinishSpec;
uniform float uFinishTight;
uniform vec3 uFinishTint;
uniform mat3 uLight;      // linear-RGB light transform (Bradford)
uniform float uContrast;
uniform float uLightSpec;
uniform float uHijab;     // 0 or 1
uniform float uShowMask;  // debug / technique preview: 0..1 tint of the mask
uniform float uAmount;    // cross-fade 0..1 (120 ms color change)

const vec3 D65 = vec3(0.95047, 1.0, 1.08883);

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 toSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float fLab(float t) {
  return t > 0.008856452 ? pow(t, 1.0 / 3.0) : (903.2963 * t + 16.0) / 116.0;
}
float fInv(float t) {
  float t3 = t * t * t;
  return t3 > 0.008856452 ? t3 : (116.0 * t - 16.0) / 903.2963;
}
vec3 linToLab(vec3 c) {
  vec3 xyz = vec3(
    dot(vec3(0.4124564, 0.3575761, 0.1804375), c),
    dot(vec3(0.2126729, 0.7151522, 0.0721750), c),
    dot(vec3(0.0193339, 0.1191920, 0.9503041), c)) / D65;
  float fx = fLab(xyz.x);
  float fy = fLab(xyz.y);
  float fz = fLab(xyz.z);
  return vec3(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}
vec3 labToLin(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  float fx = fy + lab.y / 500.0;
  float fz = fy - lab.z / 200.0;
  float yr = lab.x > 8.0 ? fy * fy * fy : lab.x / 903.2963;
  vec3 xyz = vec3(fInv(fx), yr, fInv(fz)) * D65;
  return vec3(
    dot(vec3(3.2404542, -1.5371385, -0.4985314), xyz),
    dot(vec3(-0.9692660, 1.8760108, 0.0415560), xyz),
    dot(vec3(0.0556434, -0.2040259, 1.0572252), xyz));
}

float band(float x, float a, float b) { return smoothstep(a, b, x); }

// streak threshold: density = coverage fraction (streak textures are rank-normalized)
float streaks(float s, float density, float softness) {
  float t = 1.0 - density;
  float w = 0.05 + softness * 0.18;
  // lightened strands sit among her own hair: never a flat full-strength block
  return smoothstep(t - w, t + w, s) * mix(0.75, 1.0, smoothstep(t, 1.0, s));
}

void main() {
  vec4 src = texture(uSrc, vUv);
  vec4 a1 = texture(uAux1, vUv);
  vec4 a2 = texture(uAux2, vUv);
  vec4 a3 = texture(uAux3, vUv);
  vec4 a4 = texture(uAux4, vUv);
  float alpha = a1.r;
  float r = a1.g;
  float frame = a1.b;
  float outer = a1.a;
  float cm = r * uMaxCm;
  float side = smoothstep(uPartX - 0.004, uPartX + 0.004, vUv.x);

  vec3 lin = toLinear(src.rgb);
  vec3 lab = linToLab(lin);

  // ---- technique mask m and the zone target ----
  float m = 0.0;
  vec3 tgt = uTarget;
  float soft = uSoftness;
  if (uTech == 1 || uTech == 3 || uTech == 20) {
    m = 1.0;
  } else if (uTech == 2) {
    m = 1.0 - band(cm, 2.0, 2.0 + 0.3 + soft);
  } else if (uTech == 4) {
    m = mix(0.08, 1.0, streaks(a3.g, uDensity, soft)) * band(r, uStart, uStart + 0.06);
  } else if (uTech == 5) {
    m = mix(0.06, 1.0, streaks(a3.g, uDensity, soft)) * band(r, uStart, uStart + 0.06) * a4.g;
  } else if (uTech == 6) {
    // babylights: very fine and dense, so between the strands her hair still lifts a little
    m = mix(0.22, 0.92, streaks(a3.r, uDensity, soft + 0.25)) * band(r, uStart, uStart + 0.05);
  } else if (uTech == 7) {
    m = mix(0.04, 0.9, streaks(a3.g, uDensity, soft)) * band(r, uStart, uStart + 0.06);
  } else if (uTech == 18) {
    m = streaks(a3.b, uDensity, soft * 0.5) * band(r, uStart, uStart + 0.05);
  } else if (uTech == 8 || uTech == 9 || uTech == 12) {
    float sweep = mix(1.0, smoothstep(0.15, 0.85, a3.a), 0.55);
    float painted = mix(0.45, 1.0, streaks(a3.g, clamp(uDensity + 0.2, 0.0, 1.0), 0.9));
    m = smoothstep(uStart, min(0.98, uStart + 0.6), r) * sweep * painted * mix(0.55, 1.0, outer);
    m = clamp(m * (0.8 + uDensity * 0.5), 0.0, 1.0);
    if (uTech == 9) {
      tgt = mix(uTarget, uFoilEnds, smoothstep(0.6, 0.95, r));
    }
  } else if (uTech == 10) {
    m = smoothstep(uStart, uStart + 0.15 + soft * 0.1, r);
  } else if (uTech == 11) {
    m = smoothstep(uStart, uStart + 0.4 + soft * 0.1, r);
  } else if (uTech == 13) {
    m = 1.0;
    float t = clamp(r, 0.0, 1.0);
    tgt = t < 0.5 ? mix(uTarget2, uTarget3, smoothstep(uStart, 0.5, t)) : mix(uTarget3, uTarget, smoothstep(0.5, 0.9, t));
  } else if (uTech == 14) {
    m = 1.0;
    tgt = mix(uTarget2, uTarget, band(cm, 1.5, 3.0 + soft * 1.5));
  } else if (uTech == 15) {
    m = a4.r;
  } else if (uTech == 16) {
    m = a2.b;
  } else if (uTech == 17) {
    m = 1.0;
    tgt = mix(uTarget, uTarget2, side);
  } else if (uTech == 19) {
    m = smoothstep(max(0.0, uStart - 0.1), uStart + 0.02, r);
    tgt = mix(uTarget, uTarget2, smoothstep(0.55, 0.75, r));
  }

  // regrowth: her natural root shows for the first uRegrowthCm
  if (uRegrowthCm > 0.0) {
    m *= smoothstep(uRegrowthCm - uRegrowthSoft, uRegrowthCm + uRegrowthSoft, cm);
  }
  m *= alpha;

  // ---- luminance-preserving recolor ----
  float Lbar = a2.r * 100.0;
  float sigma = max(0.5, a2.g * 40.0);
  float d = lab.x - Lbar;
  float Lt = tgt.x;
  float k = clamp(1.0 + 0.12 * abs(Lt - uHairMeanL) / 10.0, 1.0, 1.6);
  float Lnew = Lt + k * d;
  float lift = Lt - uHairMeanL;
  // synthetic strand detail when the lift exceeds 25 L* units (dark hair has little detail to lift)
  Lnew += (a3.r - 0.5) * 7.0 * smoothstep(25.0, 40.0, lift);
  if (uTech == 20) {
    // gloss / toner: deposit-only, change limited to about one level
    Lnew = clamp(Lnew, lab.x - 9.0, lab.x + 6.0);
  }
  Lnew = clamp(Lnew, 2.0, 98.0);
  vec2 ab = tgt.yz * (0.6 + 0.4 * clamp(Lnew / max(Lt, 1.0), 0.0, 1.0));

  // specular: pixels brighter than Lbar + 2 sigma keep their boost x the finish multiplier
  float hi = smoothstep(Lbar + (2.0 * uFinishTight - 0.5) * sigma, Lbar + (2.0 * uFinishTight + 1.0) * sigma, lab.x);
  float boost = max(0.0, d) * (uFinishSpec * uLightSpec - 1.0);
  Lnew = clamp(Lnew + boost * hi, 2.0, 99.0);
  ab *= 1.0 - 0.55 * hi * clamp(uFinishSpec * uLightSpec - 0.6, 0.0, 1.0);

  vec3 newLin = max(labToLin(vec3(Lnew, ab)), vec3(0.0));
  newLin = mix(newLin, newLin * uFinishTint, hi);

  float amount = m * uAmount;
  vec3 outLin = mix(lin, newLin, amount);

  // mask preview tint (technique placement view)
  outLin = mix(outLin, vec3(0.62, 0.30, 0.52), uShowMask * m * 0.45);

  // hijab visible zone: covered hair dimmed to 30%
  if (uHijab > 0.5) {
    float covered = alpha * (1.0 - a2.a);
    outLin *= mix(1.0, 0.3, covered);
  }

  // ---- Light Switcher: Bradford toward the preset white, fixed D65 display ----
  outLin = max(uLight * outLin, vec3(0.0));
  vec3 srgb = toSrgb(outLin);
  srgb = clamp((srgb - 0.5) * uContrast + 0.5, 0.0, 1.0);
  outColor = vec4(srgb, 1.0);
}
