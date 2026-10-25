// Geometry of the Zone Diagram (PRD 9.5): a fixed line drawing of a man's face in a
// 300 x 360 viewBox, front view and profile view, with the beard zones as closed
// paths laid on the drawing. Pure data, no React, so it is testable and the same
// geometry feeds the screen and the Cut Card PDF.
//
// Left and right are the CUSTOMER'S. Front view: like looking at him, so his left
// (J_L, K_L, B_L) is on the viewer's right. Profile view, side 'L': his nose points to
// the viewer's left and we see his left cheek; side 'R' is the mirror image.

export const ZD_W = 300;
export const ZD_H = 360;
export const ZD_ZONES = Object.freeze(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']);

const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (p) => `${r1(p[0])} ${r1(p[1])}`;
const mx = (p) => [ZD_W - p[0], p[1]];

function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

function quadAt(p0, p1, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

/** Sample a chain of cubic segments (each [p0, p1, p2, p3]) into a polyline. */
function sampleCubics(segments, steps = 24) {
  const pts = [];
  segments.forEach((s, si) => {
    for (let i = si === 0 ? 0 : 1; i <= steps; i++) pts.push(cubicAt(s[0], s[1], s[2], s[3], i / steps));
  });
  return pts;
}

function sampleQuad(p0, p1, p2, steps = 24) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(quadAt(p0, p1, p2, i / steps));
  return pts;
}

/** Cubic chain to an SVG path string (exact curves, for the line drawing). */
function cubicPath(segments, close = false) {
  let d = `M${fmt(segments[0][0])}`;
  for (const s of segments) d += `C${fmt(s[1])} ${fmt(s[2])} ${fmt(s[3])}`;
  return close ? `${d}Z` : d;
}

function polyPath(points, close = true) {
  if (!points.length) return '';
  let d = `M${fmt(points[0])}`;
  for (let i = 1; i < points.length; i++) d += `L${fmt(points[i])}`;
  return close ? `${d}Z` : d;
}

/** Offset a polyline by `dist` along its normals; `side` = +1 or -1 picks the side. */
function offsetPolyline(points, dist, side) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    out.push([points[i][0] + (side * -dy * dist) / len, points[i][1] + (side * dx * dist) / len]);
  }
  return out;
}

/** Polyline part between the first index where pred becomes true and the last where it holds. */
function sliceWhere(points, startPred, endPred) {
  const out = [];
  let on = false;
  for (const p of points) {
    if (!on && startPred(p)) on = true;
    if (on) {
      out.push(p);
      if (endPred(p)) break;
    }
  }
  return out;
}

/** x of a polyline at height y (first crossing). */
function xAtY(points, y) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) return a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
  }
  return points[points.length - 1][0];
}

/** y of a polyline at x (first crossing). */
function yAtX(points, x) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return points[points.length - 1][1];
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const shiftY = (points, dy) => points.map((p) => [p[0], p[1] + dy]);

// Height of the always-clean band drawn under the neckline.
const BELOW_BAND = 26;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Pixels per millimetre of the drawing (eye line to chin: 136 px for about 120 mm).
const PX_PER_MM = 1.13;
// Moving the start and the control point of a quadratic by s moves its midpoint by 0.75 s.
const MID_GAIN = 0.75;
// Cut Card cheek-line heights (mm above the jaw at mid-cheek) drawn between the 'low' and the
// 'high' line of the drawing: the face is schematic, so the height is placed proportionally.
const CHEEK_MM_LOW = 25;
const CHEEK_MM_HIGH = 70;

/** Vertical shift that puts the cheek line's midpoint at the height `mm` stands for. */
function cheekShiftForMm(mm, { y, ctrl }, presets, end, startX) {
  const midY = (sy, c) => {
    const start = [startX(sy), sy];
    const cc = c || [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    return quadAt(start, cc, end, 0.5)[1];
  };
  const t = clamp((mm - CHEEK_MM_LOW) / (CHEEK_MM_HIGH - CHEEK_MM_LOW), 0, 1);
  const lowMid = midY(presets.low.y, presets.low.c);
  const highMid = midY(presets.high.y, presets.high.c);
  const target = lowMid + (highMid - lowMid) * t;
  return (target - midY(y, ctrl)) / MID_GAIN;
}

/* ------------------------------------------------------------------------ */
/* FRONT VIEW                                                                */
/* ------------------------------------------------------------------------ */

// Viewer-left half of the face outline (the customer's right side), top of the head to the chin.
const F_CONTOUR = [
  [[150, 50], [112, 50], [86, 76], [82, 112]],
  [[82, 112], [80, 132], [80, 150], [81, 164]],
  [[81, 164], [82, 192], [88, 218], [96, 234]],
  [[96, 234], [106, 254], [122, 272], [140, 280]],
  [[140, 280], [144, 282], [147, 283], [150, 283]],
];
const F_CONTOUR_PTS = sampleCubics(F_CONTOUR, 40);

const F_EAR = [
  [[81, 148], [70, 138], [60, 146], [62, 162]],
  [[62, 162], [64, 180], [72, 196], [85, 199]],
];
const F_EAR_IN = [[[75, 157], [70, 161], [70, 172], [76, 182]]];

function mirrorSegs(segs) {
  return segs.map((s) => s.map(mx));
}
function reverseSegs(segs) {
  return segs
    .slice()
    .reverse()
    .map((s) => [s[3], s[2], s[1], s[0]]);
}

const F_FACE_OUTLINE = cubicPath([...F_CONTOUR, ...reverseSegs(mirrorSegs(F_CONTOUR))], true);

const F_STROKES = [
  F_FACE_OUTLINE,
  cubicPath(F_EAR),
  cubicPath(mirrorSegs(F_EAR)),
  cubicPath(F_EAR_IN),
  cubicPath(mirrorSegs(F_EAR_IN)),
  // brows
  'M104 132C113 126 126 126 135 130',
  'M165 130C174 126 187 126 196 132',
  // eyes and irises
  'M107 145C112 139 128 139 133 145C128 150 112 150 107 145Z',
  'M167 145C172 139 188 139 193 145C188 150 172 150 167 145Z',
  'M120 141.5a3.5 3.5 0 1 0 0.01 0',
  'M180 141.5a3.5 3.5 0 1 0 0.01 0',
  // nose: bridge, wings and base
  'M144 152C145 165 142 176 139 186',
  'M139 186C132 190 134 199 142 199C146 202 154 202 158 199C166 199 168 190 161 186',
  // lips
  'M128 228C135 222 143 220 147 223Q150 225 153 223C157 220 165 222 172 228',
  'M128 228C138 231 162 231 172 228',
  'M131 230C138 240 162 240 169 230',
  // neck and Adam's apple
  'M112 262C113 292 111 330 104 360',
  'M188 262C187 292 189 330 196 360',
  'M145 322C148 318 152 318 155 322',
];
const F_FAINT = ['M88 104C104 78 196 78 212 104'];

// Shared zone landmarks (customer's right = viewer left; the left side is mirrored).
const F_B_TOP = 128;
const F_B_BOTTOM = 198;
const F_B_FRONT_TOP = [96, F_B_TOP];
const F_B_FRONT_BOTTOM = [98, F_B_BOTTOM];
const F_MC = [126, 212]; // mustache corner
const F_MOUTH = [128, 234]; // below the mouth corner, top of the chin zone
const F_J_WIDTH = 13;
const F_NECK_X = 112.5;
const F_ADAM_Y = 322;

const F_CHEEK_PRESETS = {
  natural: { y: 156, c: [114, 166] },
  high: { y: 147, c: [114, 156] },
  medium: { y: 166, c: [112, 180] },
  low: { y: 182, c: [106, 206] },
  curved: { y: 152, c: [121, 155] },
  straight: { y: 158, c: null },
};

function frontBFrontX(y) {
  const t = (y - F_B_TOP) / (F_B_BOTTOM - F_B_TOP);
  return F_B_FRONT_TOP[0] + t * (F_B_FRONT_BOTTOM[0] - F_B_FRONT_TOP[0]);
}

function frontJaw() {
  const outer = sliceWhere(
    F_CONTOUR_PTS,
    (p) => p[1] >= F_B_BOTTOM,
    (p) => p[0] >= 124,
  );
  const inner = offsetPolyline(outer, F_J_WIDTH, -1);
  inner[0] = F_B_FRONT_BOTTOM.slice();
  return { outer, inner };
}

function frontCheekLine(cheek) {
  const preset = F_CHEEK_PRESETS[cheek.type] || F_CHEEK_PRESETS.natural;
  let sy = preset.y;
  const end = F_MC;
  let ctrl = preset.c ? preset.c.slice() : null;
  const shift = -clamp(num(cheek.offset), -1, 1) * 14;
  sy += shift;
  if (ctrl) ctrl[1] += shift;
  const mm = Number(cheek.mmAboveJaw);
  if (Number.isFinite(mm) && mm > 0) {
    const delta = cheekShiftForMm(mm, { y: sy, ctrl }, F_CHEEK_PRESETS, end, frontBFrontX);
    sy += delta;
    if (ctrl) ctrl[1] += delta;
  }
  sy = clamp(sy, 144, F_B_BOTTOM - 6);
  if (ctrl) ctrl[1] = clamp(ctrl[1], 152, 236);
  const start = [frontBFrontX(sy), sy];
  if (!ctrl) ctrl = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  return { start, ctrl, end, points: sampleQuad(start, ctrl, end, 20) };
}

function frontNeckline(neck) {
  const type = neck.type || '2f';
  if (type === 'jaw') return { type, y: null };
  const base = { '1f': 308, '2f': 296, squared: 300 }[type] ?? 296;
  let y = base;
  const mm = Number(neck.mmAboveAdamsApple);
  if (Number.isFinite(mm) && mm > 0) y = F_ADAM_Y - mm * 0.75 * PX_PER_MM;
  y -= clamp(num(neck.offset), -1, 1) * 8;
  return { type, y: clamp(y, 288, 316) };
}

function buildFront({ cheek, neckline }) {
  const jaw = frontJaw();
  const line = frontCheekLine(cheek);
  const zones = {};

  // Sideburn: in front of the ear, from the temple down to the jaw band.
  const bBack = sliceWhere(
    F_CONTOUR_PTS,
    (p) => p[1] >= F_B_TOP,
    (p) => p[1] >= F_B_BOTTOM,
  );
  const bR = [...bBack, F_B_FRONT_BOTTOM, F_B_FRONT_TOP];
  zones.B_R = bR;

  // Jaw band.
  const jR = [...jaw.outer, ...jaw.inner.slice().reverse()];
  zones.J_R = jR;
  const jInnerEnd = jaw.inner[jaw.inner.length - 1];
  const jOuterEnd = jaw.outer[jaw.outer.length - 1];

  // Cheek: under the cheek line, over the jaw band, back to the sideburn.
  zones.K_R = [...line.points, F_MOUTH, jInnerEnd, ...jaw.inner.slice(0, -1).reverse(), line.start];

  // Mustache, soul patch, chin (centre zones are drawn whole).
  const mPath =
    'M133 199C141 202 159 202 167 199L174 212L172 228C165 222 157 220 153 223Q150 225 147 223C143 220 135 222 128 228L126 212Z';
  const sPath = 'M143 241C147 239.5 153 239.5 157 241L155 252C152 254 148 254 145 252Z';
  const chinOuter = sliceWhere(
    F_CONTOUR_PTS,
    (p) => p[0] >= jOuterEnd[0] && p[1] >= jOuterEnd[1] - 0.01,
    () => false,
  );
  const chinOuterL = chinOuter.map(mx).reverse();
  const cTop = [
    F_MOUTH,
    ...sampleCubics([[F_MOUTH, [134, 240], [139, 242], [143, 241]]], 8).slice(1),
    [145, 252],
    ...sampleCubics([[[145, 252], [148, 254], [152, 254], [155, 252]]], 6).slice(1),
    [157, 241],
    ...sampleCubics([[[157, 241], [161, 242], [166, 240], mx(F_MOUTH)]], 8).slice(1),
  ];
  const cPts = [...cTop, mx(jInnerEnd), mx(jOuterEnd), ...chinOuterL, ...chinOuter.slice(1), jOuterEnd, jInnerEnd];

  // Neck: from the jaw down to the neckline, between the sides of the neck.
  const nl = frontNeckline(neckline);
  const jawNeck = sliceWhere(
    F_CONTOUR_PTS,
    (p) => p[0] >= F_NECK_X && p[1] > 240,
    () => false,
  );
  const jawNeckFull = [...jawNeck, ...jawNeck.slice(0, -1).reverse().map(mx)];
  let nPts = null;
  let neckEdge;
  let below;
  const leftTop = jawNeck[0];
  if (nl.y == null) {
    neckEdge = jawNeckFull;
    below = [...jawNeckFull, ...shiftY(jawNeckFull, BELOW_BAND).reverse()];
  } else {
    const bottom =
      nl.type === 'squared'
        ? [
            [F_NECK_X, nl.y],
            [ZD_W - F_NECK_X, nl.y],
          ]
        : sampleQuad([F_NECK_X, nl.y], [150, nl.y + 12], [ZD_W - F_NECK_X, nl.y], 20);
    nPts = [...jawNeckFull, ...bottom.slice().reverse()];
    neckEdge = bottom;
    below = [...bottom, ...shiftY(bottom, BELOW_BAND).reverse()];
    if (leftTop[1] > nl.y) nPts = null;
  }

  const shapes = {
    M: mPath,
    S: sPath,
    C: polyPath(cPts),
    J_R: polyPath(jR),
    J_L: polyPath(jR.map(mx)),
    K_R: polyPath(zones.K_R),
    K_L: polyPath(zones.K_R.map(mx)),
    B_R: polyPath(bR),
    B_L: polyPath(bR.map(mx)),
    N: nPts ? polyPath(nPts) : null,
  };

  const nAnchor = nl.y == null ? [168, 279] : [168, (yAtX(jawNeckFull, 168) + nl.y + 6) / 2];
  const anchors = {
    B_R: [89, 164],
    B_L: [211, 164],
    K_R: [110, 202],
    K_L: [190, 202],
    J_R: [95, 228],
    J_L: [205, 228],
    M: [137, 209],
    S: [150, 247],
    C: [163, 266],
    N: nAnchor,
  };

  const edges = [
    { id: 'cheek_R', d: `M${fmt(line.start)}Q${fmt(line.ctrl)} ${fmt(line.end)}` },
    { id: 'cheek_L', d: `M${fmt(mx(line.start))}Q${fmt(mx(line.ctrl))} ${fmt(mx(line.end))}` },
    { id: 'neckline', d: polyPath(neckEdge, false) },
  ];

  return {
    strokes: F_STROKES,
    faint: F_FAINT,
    shapes,
    below: polyPath(below),
    edges,
    anchors,
    columns: {
      left: { x: 58, zones: ['B_R', 'K_R', 'M', 'J_R', 'S'] },
      right: { x: 242, zones: ['B_L', 'K_L', 'J_L', 'C', 'N'] },
    },
    sides: [
      { key: 'R', x: 14, y: 34, align: 'left' },
      { key: 'L', x: 286, y: 34, align: 'right' },
    ],
    meta: { cheekStart: line.start, necklineY: nl.y },
  };
}

/* ------------------------------------------------------------------------ */
/* PROFILE VIEW (drawn for side 'L': nose to the viewer's left)              */
/* ------------------------------------------------------------------------ */

const P_OUTLINE = [
  [[238, 360], [232, 320], [229, 282], [234, 252]],
  [[234, 252], [254, 214], [264, 160], [254, 116]],
  [[254, 116], [242, 64], [198, 40], [154, 40]],
  [[154, 40], [118, 40], [96, 60], [92, 88]],
  [[92, 88], [90, 106], [90, 120], [86, 132]],
  [[86, 132], [88, 140], [92, 146], [90, 152]],
  [[90, 152], [84, 166], [72, 180], [64, 190]],
  [[64, 190], [62, 196], [68, 200], [78, 200]],
  [[78, 200], [80, 207], [78, 213], [80, 219]],
  [[80, 219], [75, 222], [75, 227], [82, 229]],
  [[82, 229], [77, 232], [77, 238], [84, 240]],
  [[84, 240], [89, 244], [90, 248], [88, 252]],
  [[88, 252], [82, 260], [82, 274], [90, 284]],
  [[90, 284], [98, 292], [108, 293], [118, 293]],
  [[118, 293], [119, 310], [126, 322], [125, 332]],
  [[125, 332], [124, 342], [127, 352], [128, 360]],
];
// Throat (front of the neck), from under the chin to the bottom.
const P_THROAT = sampleCubics(P_OUTLINE.slice(-2), 30);
const P_CHIN_PTS = sampleCubics(P_OUTLINE.slice(12, 14), 30); // chin crease to under the chin
const P_JAW = [
  [[116, 292], [140, 290], [170, 278], [186, 260]],
  [[186, 260], [192, 246], [193, 228], [191, 210]],
];
const P_JAW_PTS = sampleCubics(P_JAW, 40); // chin side to below the ear
const P_EAR = [
  [[194, 152], [204, 140], [222, 144], [224, 162]],
  [[224, 162], [226, 182], [216, 200], [205, 207]],
  [[205, 207], [199, 211], [193, 208], [194, 202]],
];
const P_EAR_IN = [
  [[202, 162], [209, 160], [213, 167], [211, 175]],
  [[211, 175], [209, 183], [205, 187], [202, 190]],
];

const P_STROKES = [
  cubicPath(P_OUTLINE),
  cubicPath(P_JAW),
  cubicPath(P_EAR),
  cubicPath(P_EAR_IN),
  'M88 134C98 129 110 130 118 135',
  'M93 147C98 144 104 145 109 149C104 152 98 153 94 152',
  'M98 145.5C100 147 100 151 98 152.5',
  'M72 194C76 191 81 193 81 197',
  'M82 229L93 230',
  'M117 300C120 312 124 322 125 332',
];
const P_FAINT = ['M100 72C130 70 166 96 178 134'];

const P_B_TOP = 136;
const P_B_BOTTOM = 206;
const P_B_FRONT_X = 178;
const P_B_BACK_X = 192.5;
const P_MC = [96, 216];
const P_MOUTH = [97, 231];
const P_S1 = [96, 245];
const P_S2 = [95, 253];
const P_C1 = [104, 259];
const P_J_WIDTH = 13;
const P_NECK_BACK = [196, 238];
const P_ADAM_Y = 330;

const P_CHEEK_PRESETS = {
  natural: { y: 160, c: [128, 168] },
  high: { y: 148, c: [132, 150] },
  medium: { y: 170, c: [124, 186] },
  low: { y: 188, c: [116, 214] },
  curved: { y: 156, c: [126, 148] },
  straight: { y: 162, c: null },
};

function profileJaw() {
  // Outer edge runs from below the ear (sideburn bottom) down to the chin side.
  const fromEar = P_JAW_PTS.slice().reverse();
  const outer = sliceWhere(
    fromEar,
    (p) => p[1] >= P_B_BOTTOM,
    () => false,
  );
  outer.unshift([P_B_BACK_X - 1.5, P_B_BOTTOM]);
  const inner = offsetPolyline(outer, P_J_WIDTH, 1);
  inner[0] = [P_B_FRONT_X + 1, P_B_BOTTOM];
  return { outer, inner };
}

function profileCheekLine(cheek) {
  const preset = P_CHEEK_PRESETS[cheek.type] || P_CHEEK_PRESETS.natural;
  let sy = preset.y;
  let ctrl = preset.c ? preset.c.slice() : null;
  const end = P_MC;
  const shift = -clamp(num(cheek.offset), -1, 1) * 14;
  sy += shift;
  if (ctrl) ctrl[1] += shift;
  const mm = Number(cheek.mmAboveJaw);
  if (Number.isFinite(mm) && mm > 0) {
    const delta = cheekShiftForMm(mm, { y: sy, ctrl }, P_CHEEK_PRESETS, end, () => P_B_FRONT_X);
    sy += delta;
    if (ctrl) ctrl[1] += delta;
  }
  sy = clamp(sy, P_B_TOP + 6, P_B_BOTTOM - 6);
  if (ctrl) ctrl[1] = clamp(ctrl[1], 140, 246);
  const start = [P_B_FRONT_X, sy];
  if (!ctrl) ctrl = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  return { start, ctrl, end, points: sampleQuad(start, ctrl, end, 24) };
}

function profileNeckline(neck) {
  const type = neck.type || '2f';
  if (type === 'jaw') return { type, y: null };
  let y = { '1f': 314, '2f': 302, squared: 304 }[type] ?? 302;
  const mm = Number(neck.mmAboveAdamsApple);
  if (Number.isFinite(mm) && mm > 0) y = P_ADAM_Y - mm * 0.8 * PX_PER_MM;
  y -= clamp(num(neck.offset), -1, 1) * 8;
  return { type, y: clamp(y, 296, 324) };
}

function buildProfile({ cheek, neckline, side }) {
  const jaw = profileJaw();
  const line = profileCheekLine(cheek);
  const s = side === 'R' ? 'R' : 'L';

  const b = [
    [P_B_FRONT_X, P_B_TOP],
    [P_B_BACK_X, P_B_TOP],
    ...sampleCubics([[[P_B_BACK_X, P_B_TOP], [194, 160], [194, 184], [P_B_BACK_X - 1.5, P_B_BOTTOM]]], 10).slice(1),
    [P_B_FRONT_X + 1, P_B_BOTTOM],
  ];
  const j = [...jaw.outer, ...jaw.inner.slice().reverse()];
  const jInnerEnd = jaw.inner[jaw.inner.length - 1];
  const jOuterEnd = jaw.outer[jaw.outer.length - 1];
  const k = [...line.points, P_MOUTH, P_S1, P_S2, P_C1, jInnerEnd, ...jaw.inner.slice(0, -1).reverse(), line.start];
  const m = [
    [78, 201],
    ...sampleCubics([[[78, 201], [84, 201], [92, 205], [95, 209]]], 8).slice(1),
    P_MC,
    [81, 220],
    ...sampleCubics([[[81, 220], [79, 214], [80, 207], [78, 201]]], 8).slice(1),
  ];
  const sPts = [
    [84.5, 241],
    ...sampleCubics([[[84.5, 241], [89, 244], [90, 248], [88, 252]]], 8).slice(1),
    P_S2,
    P_S1,
  ];
  const chinFront = sliceWhere(
    P_CHIN_PTS,
    () => true,
    (p) => p[0] >= jOuterEnd[0] - 0.5 && p[1] > 288,
  );
  const c = [...chinFront, jOuterEnd, jInnerEnd, P_C1, P_S2];

  const nl = profileNeckline(neckline);
  const jawUnder = P_JAW_PTS.filter((p) => p[1] >= 230); // chin side to the jaw angle and up to y 230
  let n = null;
  let neckEdge;
  let below;
  const throatTop = P_THROAT[0];
  if (nl.y == null) {
    neckEdge = jawUnder;
    const lower = shiftY([...jawUnder, P_NECK_BACK], BELOW_BAND);
    lower[0] = [xAtY(P_THROAT, lower[0][1]), lower[0][1]];
    below = [...jawUnder, P_NECK_BACK, ...lower.reverse()];
  } else {
    const front = [xAtY(P_THROAT, nl.y), nl.y];
    const edge =
      nl.type === 'squared'
        ? [P_NECK_BACK, [192, nl.y], front]
        : sampleCubics([[P_NECK_BACK, [192, 278], [150, nl.y + 2], front]], 20);
    neckEdge = edge;
    const throatUpper = P_THROAT.filter((p) => p[1] < nl.y);
    n = [throatTop, ...jawUnder, P_NECK_BACK, ...edge.slice(1), ...throatUpper.slice().reverse()];
    const lower = shiftY(edge, BELOW_BAND);
    const last = lower.length - 1;
    lower[last] = [xAtY(P_THROAT, lower[last][1]), lower[last][1]];
    const throatBand = P_THROAT.filter((p) => p[1] > nl.y && p[1] < lower[last][1]);
    below = [...edge, ...throatBand, ...lower.reverse()];
  }

  const shapes = {
    M: polyPath(m),
    S: polyPath(sPts),
    C: polyPath(c),
    [`J_${s}`]: polyPath(j),
    [`K_${s}`]: polyPath(k),
    [`B_${s}`]: polyPath(b),
    N: n ? polyPath(n) : null,
  };
  const anchors = {
    M: [86, 210],
    S: [90, 247],
    C: [96, 274],
    [`B_${s}`]: [185, 176],
    [`K_${s}`]: [146, 222],
    [`J_${s}`]: [166, 258],
    N: nl.y == null ? [150, 284] : [150, (yAtX(jawUnder, 150) + nl.y) / 2 + 2],
  };
  const edges = [
    { id: `cheek_${s}`, d: `M${fmt(line.start)}Q${fmt(line.ctrl)} ${fmt(line.end)}` },
    { id: 'neckline', d: polyPath(neckEdge, false) },
  ];
  return {
    strokes: P_STROKES,
    faint: P_FAINT,
    shapes,
    below: polyPath(below),
    edges,
    anchors,
    columns: {
      left: { x: 54, zones: ['M', 'S', 'C'] },
      right: { x: 246, zones: [`B_${s}`, `K_${s}`, `J_${s}`, 'N'], minY: 238, maxY: 340 },
    },
    sides: [{ key: s, x: 14, y: 34, align: 'left' }],
    meta: { cheekStart: line.start, necklineY: nl.y },
    mirrored: s === 'R',
  };
}

/* ------------------------------------------------------------------------ */
/* LABEL LAYOUT                                                              */
/* ------------------------------------------------------------------------ */

const LABEL_GAP = 30;
const LABEL_MIN_Y = 52;
const LABEL_MAX_Y = 322;

/** Stack labels in a column near their anchors' heights, at least LABEL_GAP apart. */
export function stackLabels(items, minY = LABEL_MIN_Y, maxY = LABEL_MAX_Y, gap = LABEL_GAP) {
  minY = minY ?? LABEL_MIN_Y;
  maxY = maxY ?? LABEL_MAX_Y;
  const sorted = items.slice().sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  for (const it of sorted) {
    it.y = Math.max(it.y, prev + gap, minY);
    prev = it.y;
  }
  const overflow = prev - maxY;
  if (overflow > 0) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const limit = i === sorted.length - 1 ? maxY : sorted[i + 1].y - gap;
      sorted[i].y = Math.min(sorted[i].y, limit);
    }
  }
  return sorted;
}

/**
 * Build the whole diagram model.
 * @param {object} o
 * @param {'front'|'profile'} o.view
 * @param {'L'|'R'} [o.side] profile only
 * @param {{ type, offset, mmAboveJaw }} [o.cheek]
 * @param {{ type, offset, mmAboveAdamsApple }} [o.neckline]
 * @param {string[]} [o.labelZones] zones that get a label (default: every zone drawn)
 */
export function zoneDiagramModel({ view = 'front', side = 'L', cheek = {}, neckline = {}, labelZones } = {}) {
  const base = view === 'profile' ? buildProfile({ cheek, neckline, side }) : buildFront({ cheek, neckline });
  const flip = Boolean(base.mirrored);
  const fx = (x) => (flip ? ZD_W - x : x);
  const wanted = new Set(labelZones || Object.keys(base.shapes).filter((z) => base.shapes[z]));
  const labels = [];
  for (const [colName, col] of Object.entries(base.columns)) {
    const physical = flip ? (colName === 'left' ? 'right' : 'left') : colName;
    const x = physical === 'left' ? Math.min(col.x, ZD_W - col.x) : Math.max(col.x, ZD_W - col.x);
    const items = col.zones
      .filter((z) => wanted.has(z) && base.anchors[z])
      .map((z) => ({ zone: z, y: base.anchors[z][1], ax: fx(base.anchors[z][0]), ay: base.anchors[z][1] }));
    for (const it of stackLabels(items, col.minY, col.maxY)) labels.push({ ...it, x, column: physical });
  }
  return {
    width: ZD_W,
    height: ZD_H,
    view,
    mirrored: flip,
    strokes: base.strokes,
    faint: base.faint,
    shapes: base.shapes,
    below: base.below,
    edges: base.edges,
    anchors: Object.fromEntries(Object.entries(base.anchors).map(([z, p]) => [z, [fx(p[0]), p[1]]])),
    labels,
    sides: base.sides.map((s) => (flip ? { ...s, x: ZD_W - s.x, align: s.align === 'left' ? 'right' : 'left' } : s)),
    // Keep/remove legend in a bottom corner that no label column reaches.
    legend: { align: flip ? 'right' : 'left' },
    meta: base.meta,
  };
}

/** Tone of a zone from its target length: keep (> 0), cut (0) or none (unknown). */
export function zoneTone(mm) {
  if (mm === null || mm === undefined || mm === '') return 'none';
  const n = Number(mm);
  if (!Number.isFinite(n)) return 'none';
  return n > 0 ? 'keep' : 'cut';
}
