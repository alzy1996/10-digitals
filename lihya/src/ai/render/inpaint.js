// Going shorter (PRD 7.1 / 7.2). AR cannot erase real hair, and an on-device
// inpainting model (LaMa / MI-GAN in ONNX) could not be verified for licence, size
// and format for v1, so every zone that must get shorter is shown in Outline mode:
// the target edge lines drawn on the real beard, green where hair is kept, red where
// it is removed. needsOutline decides; buildOutlineTextures draws the overlay that
// the live AR renderer and Photo Studio both put on the face mesh and the shell.

import { ZONES, LENGTH_TOLERANCE_MM, currentLengths } from './timeline.js';
import { normalizeLook, faceFields, shellColumns } from './beardTextures.js';
import { cheekLine } from './layout.js';
import { createField, fillPolygon, blurField, sampleField } from './raster.js';
import { hexToRgb } from '../analysis/color.js';
import { clamp, stableKey, smoothstep } from './util.js';

/** Overlay colours (tokens.css --keep, --cut, --brass). */
export const OUTLINE_COLORS = Object.freeze({ keep: '#3e9b6a', cut: '#c2412d', line: '#c9a35b' });
const KEEP = hexToRgb(OUTLINE_COLORS.keep);
const CUT = hexToRgb(OUTLINE_COLORS.cut);
const LINE = hexToRgb(OUTLINE_COLORS.line);

/** Natural neck growth when the beard has never been lined (mm below the jaw). */
const NATURAL_NECKLINE = '1f';

const ALL_ONE = Object.freeze(Object.fromEntries(ZONES.map((z) => [z, 1])));

/** Mean texture y of a polyline. */
const meanY = (pts) => pts.reduce((s, p) => s + p[1], 0) / pts.length;

/**
 * Which zones must get shorter than the customer's current beard (2 mm tolerance),
 * including a cheek line moved below the natural one and a neckline raised above the
 * natural neck growth.
 * @returns {{ needed: boolean, zones: string[] }} zones in ZONE_IDS order
 */
export function needsOutline(params, profile) {
  if (!profile || !profile.beard || !profile.beard.zones) return { needed: false, zones: [] };
  const P = normalizeLook(params);
  const cur = currentLengths(profile);
  const out = new Set();
  for (const z of ZONES) {
    if (cur[z] > P.zones[z] + LENGTH_TOLERANCE_MM) out.add(z);
  }
  for (const side of ['L', 'R']) {
    const id = `K_${side}`;
    if (cur[id] <= LENGTH_TOLERANCE_MM || P.zones[id] <= 0) continue;
    const target = cheekLine(side, P.lines.cheek, P.lines.cheekOffset).line;
    const natural = cheekLine(side, 'natural', 0).line;
    // Lower than the natural line by more than about 1.5 mm on average.
    if (meanY(target) - meanY(natural) > 0.0072) out.add(id);
  }
  if (cur.N > LENGTH_TOLERANCE_MM && P.zones.N > 0 && P.lines.neckline !== NATURAL_NECKLINE) out.add('N');
  const zones = ZONES.filter((z) => out.has(z));
  return { needed: zones.length > 0, zones };
}

/** The look the customer wears today: current lengths, natural lines. */
export function currentLook(params, profile) {
  const P = normalizeLook(params);
  const cur = currentLengths(profile);
  const hasProfile = !!(profile && profile.beard && profile.beard.zones);
  const zones = {};
  for (const z of ZONES) zones[z] = hasProfile ? cur[z] : Math.max(P.zones[z], 6);
  return {
    ...P,
    zones,
    lines: { cheek: 'natural', cheekOffset: 0, neckline: NATURAL_NECKLINE, necklineOffset: 0, sideburn: 'blended', edge: 'soft', mustacheEdge: 'over' },
    mustacheId: null,
    shape: { chin: 'natural', jFront: false, mustacheFloating: false, fadeB: null, flare: false },
  };
}

function put(color, o, rgb, a) {
  // "over" in sRGB space is fine for flat tints.
  const da = color[o + 3] / 255;
  const na = a + da * (1 - a);
  if (na <= 0) return;
  for (let c = 0; c < 3; c++) color[o + c] = (rgb[c] * a + color[o + c] * da * (1 - a)) / na;
  color[o + 3] = na * 255;
}

/**
 * Outline overlay textures.
 * @param {object} params target LookParams
 * @param {object|null} profile FaceProfile (current lengths)
 * @param {object} [opts]
 * @param {number} [opts.size=1024] face texture size
 * @param {string[]|null} [opts.zones] only these zones (beard mode with a few zones to
 *   shorten): red where hair goes and the target lines, no green
 * @returns {{ key, face: { width, height, color }, shell: { width, height, color, lengthMm } | null }}
 */
export function buildOutlineTextures(params, profile, { size = 1024, zones = null } = {}) {
  const P = normalizeLook(params);
  const C = currentLook(params, profile);
  const S = size;
  const R = Math.round(S / 2);
  const partial = Array.isArray(zones);
  const only = new Set(partial ? zones : ZONES);

  const tf = faceFields(P, R, ALL_ONE);
  const cf = faceFields(C, R, ALL_ONE);
  const Mt = tf.clip;
  const Mc = cf.clip;

  // Area of the zones the overlay talks about (partial mode), slightly dilated.
  let area = null;
  if (partial) {
    area = createField(R, R);
    for (const id of only) {
      if (id === 'N' || !cf.layout.zones[id]) continue;
      fillPolygon(area, cf.layout.zones[id].map((p) => [p[0] * R, p[1] * R]), 1);
    }
    blurField(area, 2.5 * tf.cellsPerMm);
    for (let i = 0; i < area.data.length; i++) area.data[i] = clamp(area.data[i] * 3, 0, 1);
  }

  // Target edge: where the target mask crosses one half, about 0.6 mm wide.
  const edge = createField(R, R);
  for (let i = 0; i < edge.data.length; i++) edge.data[i] = Mt.data[i] >= 0.5 ? 1 : 0;
  blurField(edge, 0.35 * tf.cellsPerMm);

  // Zones that stay but get shorter: diagonal hatching.
  const cur = currentLengths(profile);
  const shorter = createField(R, R);
  for (const id of ZONES) {
    if (id === 'N' || !only.has(id) || !(P.zones[id] > 0) || !(cur[id] > P.zones[id] + LENGTH_TOLERANCE_MM)) continue;
    fillPolygon(shorter, tf.layout.zones[id].map((p) => [p[0] * R, p[1] * R]), 1);
  }

  const color = new Uint8ClampedArray(S * S * 4);
  const k = R / S;
  const hatchPeriod = 2.2 * 0.0048 * S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = (x + 0.5) * k;
      const fy = (y + 0.5) * k;
      const mt = sampleField(Mt, fx, fy);
      const mc = sampleField(Mc, fx, fy);
      const ar = area ? sampleField(area, fx, fy) : 1;
      const o = (y * S + x) * 4;
      if (!partial && mt > 0.01) put(color, o, KEEP, 0.26 * mt);
      const remove = mc * (1 - mt) * ar;
      if (remove > 0.01) put(color, o, CUT, 0.4 * remove);
      const sh = sampleField(shorter, fx, fy) * mt;
      if (sh > 0.05 && ((x + y) % hatchPeriod) < hatchPeriod * 0.28) put(color, o, CUT, 0.32 * sh);
      const e = sampleField(edge, fx, fy);
      const line = smoothstep(0.18, 0.42, Math.min(e, 1 - e)) * ar;
      if (line > 0.01 && (mc > 0.05 || !partial)) put(color, o, LINE, 0.95 * line);
    }
  }

  // Shell: neck and the length below the jaw.
  let shell = null;
  const SW = S;
  const tc = shellColumns(P, ALL_ONE, SW, tf.layout, tf);
  const cc = shellColumns(C, ALL_ONE, SW, cf.layout, cf);
  const showN = !partial || only.has('N') || only.has('C') || only.has('J_L') || only.has('J_R');
  let maxMm = 0;
  for (let x = 0; x < SW; x++) maxMm = Math.max(maxMm, tc.neck[x], tc.hang[x], cc.neck[x], cc.hang[x]);
  if (showN && maxMm > 1) {
    const tpm = tc.tpm;
    const lengthMm = maxMm + 4;
    const SH = clamp(Math.ceil(lengthMm * tpm), 8, 1024);
    const sc = new Uint8ClampedArray(SW * SH * 4);
    const lineW = 0.7;
    for (let x = 0; x < SW; x++) {
      const keepTo = Math.max(tc.neck[x], tc.hang[x]);
      const curTo = Math.max(cc.neck[x], cc.hang[x]);
      for (let y = 0; y < SH; y++) {
        const mm = y / tpm;
        const o = (y * SW + x) * 4;
        if (!partial && mm < keepTo) put(sc, o, KEEP, 0.26);
        if (mm >= keepTo && mm < curTo) put(sc, o, CUT, 0.4);
        const atLine = Math.abs(mm - keepTo) < lineW && keepTo > 0.5 && (curTo > keepTo + 0.5 || !partial);
        if (atLine) put(sc, o, LINE, 0.95);
      }
    }
    shell = { width: SW, height: SH, color: sc, lengthMm: SH / tpm };
  }

  return { key: stableKey({ P, C: C.zones, size, zones }), face: { width: S, height: S, color }, shell };
}

const cache = new Map();

/** buildOutlineTextures with a small cache keyed by the look, profile and zones. */
export function getOutlineTextures(params, profile, opts = {}) {
  const key = stableKey({ params: normalizeLook(params), cur: currentLengths(profile), size: opts.size || 1024, zones: opts.zones || null, p: !!profile });
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = buildOutlineTextures(params, profile, opts);
  cache.set(key, tex);
  while (cache.size > 4) cache.delete(cache.keys().next().value);
  return tex;
}
