// Light Switcher: Bradford chromatic adaptation from D65 toward a preset's white point,
// shown on a fixed D65 display so warm light looks warm (PRD 7.3).
import { D65, RGB2XYZ, XYZ2RGB, inv3, matMul, mul3 } from '../analysis/color.js';

export const BRADFORD = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];
const BRADFORD_INV = inv3(BRADFORD);

/** CCT (K) -> CIE xy. Planckian locus (Kang et al. 2002) below 4000 K, CIE daylight locus at/above. */
export function cctToXy(T) {
  if (T === 6500) return [0.31271, 0.32902];
  if (T >= 4000) {
    const x =
      T <= 7000
        ? -4.607e9 / T ** 3 + 2.9678e6 / T ** 2 + 0.09911e3 / T + 0.244063
        : -2.0064e9 / T ** 3 + 1.9018e6 / T ** 2 + 0.24748e3 / T + 0.23704;
    return [x, -3 * x * x + 2.87 * x - 0.275];
  }
  const x = -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.17991;
  const y =
    T <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
  return [x, y];
}

export function xyToXyz([x, y]) {
  return [x / y, 1, (1 - x - y) / y];
}

/** Bradford adaptation matrix in XYZ from source white to destination white. */
export function bradfordXyz(srcWhite, dstWhite) {
  const s = mul3(BRADFORD, srcWhite);
  const d = mul3(BRADFORD, dstWhite);
  const D = [
    [d[0] / s[0], 0, 0],
    [0, d[1] / s[1], 0],
    [0, 0, d[2] / s[2]],
  ];
  return matMul(BRADFORD_INV, matMul(D, BRADFORD));
}

/**
 * Linear-RGB matrix that re-lights a D65 render under `kelvin`, with partial adaptation `degree`
 * (0 = no change, 1 = full illuminant shift as a fixed-white camera would see it).
 */
export function lightMatrix(kelvin, degree = 0.7) {
  if (kelvin === 6500 || degree === 0) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const target = xyToXyz(cctToXy(kelvin));
  const mixed = [0, 1, 2].map((i) => D65[i] + (target[i] - D65[i]) * degree);
  const M = bradfordXyz(D65, mixed);
  return matMul(XYZ2RGB, matMul(M, RGB2XYZ));
}

/** Column-major Float32Array(9) for a WebGL mat3 uniform. */
export function toGlMat3(m) {
  return new Float32Array([m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]]);
}

export function adaptLab(lab, kelvin, toLab, fromLab, degree = 0.7) {
  const M = lightMatrix(kelvin, degree);
  return toLab(mul3(M, fromLab(lab)));
}
