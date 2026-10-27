// Jawline engineering (PRD 6.2). The beard is added to the face outline as a
// thickness along the face-contour normals (zone lengths in mm), and the 5.4 ratios
// are recomputed: face length over cheekbone width, the widths, and the jaw angle.
// The change is what the customer sees: "Face reads 8% longer", "Jaw reads 6%
// softer". The same numbers drive the face reason chips (reasons.js).
//
// Inputs, all optional (missing pieces degrade to population averages):
//   profile.faceShape.measures  { faceLengthMm, foreheadWidthMm, cheekboneWidthMm,
//                                 jawWidthMm, lengthToCheek, chinAngleDeg } (analysis)
//                               or the pixel forms { faceLengthPx, foreheadPx, cheekPx,
//                                 jawPx, chinWidthPx } converted with profile.scale.mmPerPx
//   profile.faceShape.jawAngleDeg, profile.faceShape.top (prototype when measures are missing)
//   params: LookParams (or a style object: zones + shape + lines)
//
// Hair does not stand straight out: short hair stands up to about 60 % of its length
// off the skin, longer hair lies down and very long hair hangs, so the silhouette
// offset grows more slowly. Chin hair hangs and adds most of its length to the face
// length. Sideburns and cheeks widen the face at cheekbone level, the jaw band, cheeks
// and (a little) sideburns at jaw level; jaw and cheek hair round the gonion corner.

const ZONES = ['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N'];

/** Population-average adult measures (mm, raw landmark widths), used when nothing was measured. */
export const DEFAULT_MEASURES = Object.freeze({ faceLength: 185, forehead: 128, cheek: 142, jaw: 122, jawAngle: 128 });

/** Shape prototypes (length / cheek, forehead / cheek, jaw / cheek, jaw angle) when only the shape is known. */
export const SHAPE_PROTOTYPES = Object.freeze({
  oval: Object.freeze({ ratio: 1.42, F: 0.93, J: 0.86, angle: 130 }),
  round: Object.freeze({ ratio: 1.2, F: 0.92, J: 0.9, angle: 141 }),
  square: Object.freeze({ ratio: 1.27, F: 0.97, J: 0.96, angle: 118 }),
  oblong: Object.freeze({ ratio: 1.62, F: 0.95, J: 0.93, angle: 126 }),
  heart: Object.freeze({ ratio: 1.4, F: 1.04, J: 0.78, angle: 133 }),
  diamond: Object.freeze({ ratio: 1.42, F: 0.8, J: 0.8, angle: 131 }),
  triangle: Object.freeze({ ratio: 1.36, F: 0.86, J: 1.04, angle: 124 }),
});

/** How much of the chin length shows as extra face length, by chin shape. */
const CHIN_LENGTH = Object.freeze({
  pointed: 1,
  round: 0.95,
  natural: 0.9,
  'wide-round': 0.9,
  flat: 0.85,
  split: 0.9,
  braided: 0.95,
  ring: 0.9,
  strip: 0.9,
});

/** Degrees taken off the jaw angle by squared shapes (flat chin, squared neckline). */
const SQUARING_DEG = 4;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pos = (v) => (isNum(v) && v > 0 ? v : null);
const round1 = (v) => Math.round(v * 10) / 10;

/** Outward silhouette thickness (mm) of hair of length L (mm): long hair hangs rather than stands out. */
export function lateralMm(L) {
  const l = Math.max(0, Number(L) || 0);
  if (l <= 10) return 0.6 * l;
  if (l <= 40) return 6 + 0.4 * (l - 10);
  return 18 + 0.2 * (l - 40);
}

/** Extra face length (mm) from chin hair of length L (mm). */
export function downMm(L) {
  return 0.85 * Math.max(0, Number(L) || 0);
}

function topShape(profile) {
  const fs = profile && profile.faceShape;
  const forced = profile && profile.overrides && profile.overrides.faceShape;
  const top = forced || (fs && fs.top);
  return SHAPE_PROTOTYPES[top] ? top : null;
}

/**
 * Face measures in mm from the profile, filled from the shape prototype or the
 * population average where missing. source: 'measures' | 'ratio' | 'shape' | 'default'.
 */
export function faceMeasures(profile) {
  const fs = (profile && profile.faceShape) || {};
  const m = fs.measures || {};
  const k = profile && profile.scale ? pos(profile.scale.mmPerPx) : null;
  const read = (mmKey, pxKeys) => {
    if (pos(m[mmKey])) return m[mmKey];
    if (!k) return null;
    for (const key of pxKeys) if (pos(m[key])) return m[key] * k;
    return null;
  };
  const shape = topShape(profile);
  const proto = shape ? SHAPE_PROTOTYPES[shape] : null;
  let cheek = read('cheekboneWidthMm', ['cheekPx', 'cheekboneWidthPx']);
  let length = read('faceLengthMm', ['faceLengthPx']);
  let jaw = read('jawWidthMm', ['jawPx', 'jawWidthPx']);
  let forehead = read('foreheadWidthMm', ['foreheadPx', 'foreheadWidthPx']);
  let source = cheek && length ? 'measures' : 'default';
  if (!cheek) cheek = DEFAULT_MEASURES.cheek;
  if (!length) {
    if (pos(m.lengthToCheek)) {
      length = m.lengthToCheek * cheek;
      source = 'ratio';
    } else if (proto) {
      length = proto.ratio * cheek;
      source = 'shape';
    } else {
      length = DEFAULT_MEASURES.faceLength;
    }
  }
  if (!jaw) jaw = proto ? proto.J * cheek : DEFAULT_MEASURES.jaw;
  if (!forehead) forehead = proto ? proto.F * cheek : DEFAULT_MEASURES.forehead;
  let jawAngle = pos(fs.jawAngleDeg) || pos(m.jawAngleDeg);
  if (!jawAngle) jawAngle = proto ? proto.angle : DEFAULT_MEASURES.jawAngle;
  return { length, cheek, jaw, forehead, jawAngle: Math.min(178, jawAngle), source, shape };
}

function zonesOf(params) {
  const z = (params && params.zones) || {};
  const out = {};
  for (const id of ZONES) out[id] = isNum(z[id]) ? Math.max(0, z[id]) : 0;
  return out;
}

/**
 * Full before / after model. Returns { lengthPct, jawSoftPct, widthPct, jawWidthPct,
 * before: { lengthMm, cheekMm, jawMm, foreheadMm, jawAngleDeg, ratio, jawToCheek },
 * after: { same }, addMm: { chin, cheekSide, jawSide }, source }.
 */
export function jawlineDetail(profile, params) {
  const base = faceMeasures(profile);
  const z = zonesOf(params);
  const shape = (params && params.shape) || {};
  const lines = (params && params.lines) || {};
  const chinShape = CHIN_LENGTH[shape.chin] !== undefined ? shape.chin : 'natural';
  const jawReach = shape.jFront ? 0.3 : 1;
  const flare = shape.flare ? 1.3 : 1;

  const chinAdd = downMm(z.C) * CHIN_LENGTH[chinShape];
  const side = (s) => {
    const B = lateralMm(z[`B_${s}`]);
    const K = lateralMm(z[`K_${s}`]);
    const J = lateralMm(z[`J_${s}`]) * jawReach * flare;
    return {
      cheek: 0.6 * B + 0.3 * K,
      jaw: 0.9 * J + 0.4 * K + 0.2 * B,
      corner: 0.7 * J + 0.3 * K,
    };
  };
  const L = side('L');
  const R = side('R');
  const cheekAdd = L.cheek + R.cheek;
  const jawAdd = L.jaw + R.jaw;
  const corner = (L.corner + R.corner) / 2;

  const after = {
    length: base.length + chinAdd,
    cheek: base.cheek + cheekAdd,
    jaw: base.jaw + jawAdd,
    forehead: base.forehead,
  };
  const soften = corner / (corner + 25);
  let angle = base.jawAngle + (180 - base.jawAngle) * soften * 0.6;
  const hasLowerBeard = z.C > 0 || z.J_L > 0 || z.J_R > 0;
  if (hasLowerBeard && (shape.chin === 'flat' || lines.neckline === 'squared')) angle -= SQUARING_DEG;
  angle = Math.max(90, Math.min(178, angle));

  const ratioBefore = base.length / base.cheek;
  const ratioAfter = after.length / after.cheek;
  const pct = (a, b) => round1((a / b - 1) * 100);
  const lengthPct = pct(ratioAfter, ratioBefore);
  const widthPct = pct(after.cheek + after.jaw, base.cheek + base.jaw);
  const jawSoftPct = round1(((angle - base.jawAngle) / base.jawAngle) * 100);
  const jawWidthPct = pct(after.jaw, base.jaw);
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    lengthPct: lengthPct === 0 ? 0 : lengthPct,
    jawSoftPct: jawSoftPct === 0 ? 0 : jawSoftPct,
    widthPct: widthPct === 0 ? 0 : widthPct,
    jawWidthPct: jawWidthPct === 0 ? 0 : jawWidthPct,
    before: {
      lengthMm: round1(base.length),
      cheekMm: round1(base.cheek),
      jawMm: round1(base.jaw),
      foreheadMm: round1(base.forehead),
      jawAngleDeg: round1(base.jawAngle),
      ratio: r2(ratioBefore),
      jawToCheek: r2(base.jaw / base.cheek),
    },
    after: {
      lengthMm: round1(after.length),
      cheekMm: round1(after.cheek),
      jawMm: round1(after.jaw),
      foreheadMm: round1(after.forehead),
      jawAngleDeg: round1(angle),
      ratio: r2(ratioAfter),
      jawToCheek: r2(after.jaw / after.cheek),
    },
    addMm: { chin: round1(chinAdd), cheekSide: round1(cheekAdd / 2), jawSide: round1(jawAdd / 2) },
    source: base.source,
  };
}

/** PRD 6.2 numbers for one look: { lengthPct, jawSoftPct, widthPct } (percent, 1 decimal). */
export function jawlineDelta(profile, params) {
  const d = jawlineDetail(profile, params);
  return { lengthPct: d.lengthPct, jawSoftPct: d.jawSoftPct, widthPct: d.widthPct };
}

/**
 * Overlay captions for a delta, as i18n keys with vars (catalog.jaw.*), biggest
 * change first. Changes under minPct are not shown; nothing left gives 'catalog.jaw.same'.
 */
export function jawlineLabels(delta, minPct = 2) {
  if (!delta) return [{ key: 'catalog.jaw.same', vars: {} }];
  const out = [];
  const add = (v, up, down) => {
    if (!isNum(v) || Math.abs(v) < minPct) return;
    out.push({ key: v > 0 ? up : down, vars: { pct: Math.round(Math.abs(v)) }, size: Math.abs(v) });
  };
  add(delta.lengthPct, 'catalog.jaw.longer', 'catalog.jaw.shorter');
  add(delta.jawSoftPct, 'catalog.jaw.softer', 'catalog.jaw.sharper');
  add(delta.widthPct, 'catalog.jaw.wider', 'catalog.jaw.narrower');
  out.sort((a, b) => b.size - a.size);
  if (!out.length) return [{ key: 'catalog.jaw.same', vars: {} }];
  return out.map(({ key, vars }) => ({ key, vars }));
}
