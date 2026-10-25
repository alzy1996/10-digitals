// Parametric cut silhouettes fitted to her face landmarks (PRD 7.7), drawn as a soft dashed contour.
// All coordinates are image pixels.

const BAND_Y = {
  'very-short': (g) => g.earY,
  short: (g) => g.jawY - g.faceLen * 0.05,
  jaw: (g) => g.jawY + g.faceLen * 0.04,
  chin: (g) => g.chinY + g.faceLen * 0.06,
  collarbone: (g) => g.chinY + g.faceLen * 0.45,
  shoulder: (g) => g.shoulderY + g.faceLen * 0.1,
  long: (g) => g.shoulderY + g.faceLen * 0.9,
  'very-long': (g) => g.shoulderY + g.faceLen * 1.6,
  any: (g) => g.tipY,
};

const SHAPE = {
  // [width at ends relative to head width, A-line/inverted factor, layered]
  default: [1.05, 0, false],
  'a-line-bob': [1.0, 0.18, false],
  'stacked-bob': [1.12, -0.12, true],
  'asymmetric-bob': [1.0, 0.25, false],
  'flipped-bob': [1.3, 0, false],
  'curly-bob': [1.35, 0, true],
  'italian-bob': [1.2, 0, false],
  'french-bob': [1.1, 0, false],
  'angled-lob': [1.0, 0.15, false],
  'modern-shag': [1.25, 0, true],
  'wolf-cut': [1.3, 0, true],
  'curly-shag': [1.4, 0, true],
  'cherub-cut': [1.3, 0, true],
  jellyfish: [0.9, 0, true],
  'hime-cut': [0.95, 0, true],
  'v-cut': [0.75, 0, true],
  'u-cut': [0.85, 0, true],
  butterfly: [1.15, 0, true],
  'long-layers': [1.0, 0, true],
  'mid-layers': [1.1, 0, true],
  'hush-cut': [1.05, 0, true],
  'face-framing-long': [1.0, 0, true],
  'ghost-layers': [1.0, 0, true],
  'blunt-long': [1.0, 0, false],
  'extra-long-glossy': [0.95, 0, false],
};

export function faceGeometry(rd) {
  const p = rd.pts;
  const faceLen = p[152][1] - (rd.hairlineY ?? p[10][1]);
  const cheekW = Math.hypot(p[234][0] - p[454][0], p[234][1] - p[454][1]);
  return {
    midX: p[10][0],
    topY: rd.topY || p[10][1] - faceLen * 0.25,
    earY: (p[234][1] + p[454][1]) / 2,
    jawY: (p[172][1] + p[397][1]) / 2,
    chinY: p[152][1],
    shoulderY: rd.shoulderY || p[152][1] + faceLen * 0.55,
    tipY: rd.tipY || p[152][1] + faceLen,
    faceLen,
    headW: cheekW * 1.18,
    leftX: Math.min(p[234][0], p[454][0]),
    rightX: Math.max(p[234][0], p[454][0]),
  };
}

/** SVG path string for a cut outline (and inner layer lines when layered). */
export function silhouettePath(cut, rd, lengthY) {
  const g = faceGeometry(rd);
  const [endW, angle, layered] = SHAPE[cut.id] || SHAPE.default;
  const endY = lengthY ?? BAND_Y[cut.length]?.(g) ?? g.tipY;
  const half = g.headW / 2;
  const top = g.topY - g.faceLen * 0.04;
  const crownY = top + g.faceLen * 0.32;
  const endHalf = half * endW;
  const short = endY < g.jawY;
  const lx = g.midX - half;
  const rx = g.midX + half;
  // asymmetric/A-line: front lower than back means the outline dips toward the face
  const dip = angle * g.faceLen;
  const path = [
    `M ${g.midX} ${top}`,
    `C ${g.midX - half * 0.75} ${top} ${lx} ${crownY - g.faceLen * 0.2} ${lx} ${crownY}`,
    short
      ? `C ${lx} ${endY - g.faceLen * 0.1} ${g.midX - endHalf} ${endY} ${g.midX - half * 0.55} ${endY}`
      : `C ${lx - half * 0.05} ${g.earY} ${g.midX - endHalf} ${endY - g.faceLen * 0.35} ${g.midX - endHalf} ${endY - dip}`,
    `M ${g.midX} ${top}`,
    `C ${g.midX + half * 0.75} ${top} ${rx} ${crownY - g.faceLen * 0.2} ${rx} ${crownY}`,
    short
      ? `C ${rx} ${endY - g.faceLen * 0.1} ${g.midX + endHalf} ${endY} ${g.midX + half * 0.55} ${endY}`
      : `C ${rx + half * 0.05} ${g.earY} ${g.midX + endHalf} ${endY - g.faceLen * 0.35} ${g.midX + endHalf} ${endY - dip}`,
  ];
  if (!short) {
    // the hem: straight, V or U
    if (cut.id === 'v-cut') path.push(`M ${g.midX - endHalf} ${endY - dip} L ${g.midX} ${endY + g.faceLen * 0.25} L ${g.midX + endHalf} ${endY - dip}`);
    else if (cut.id === 'u-cut') path.push(`M ${g.midX - endHalf} ${endY - dip} Q ${g.midX} ${endY + g.faceLen * 0.3} ${g.midX + endHalf} ${endY - dip}`);
    else path.push(`M ${g.midX - endHalf} ${endY - dip} L ${g.midX + endHalf} ${endY - dip}`);
  }
  const layers = [];
  if (layered && !short) {
    const ly = [0.35, 0.6].map((f) => g.chinY + (endY - g.chinY) * f);
    for (const y of ly) {
      layers.push(`M ${g.midX - half * 1.02} ${y} q ${half * 0.12} ${g.faceLen * 0.06} ${half * 0.24} ${g.faceLen * 0.02}`);
      layers.push(`M ${g.midX + half * 1.02} ${y} q ${-half * 0.12} ${g.faceLen * 0.06} ${-half * 0.24} ${g.faceLen * 0.02}`);
    }
  }
  return { outline: path.join(' '), layers: layers.join(' '), endY };
}

export function defaultLengthY(cut, rd) {
  const g = faceGeometry(rd);
  return Math.min(g.tipY, BAND_Y[cut.length]?.(g) ?? g.tipY);
}
