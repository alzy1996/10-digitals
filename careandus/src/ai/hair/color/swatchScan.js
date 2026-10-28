// Swatch Scan (PRD 3.3, 8.4): measure each swatch's real color, white-card calibrated.
import { medianLab, rgbToLab, srgbToLinear, linearToSrgb, deltaE2000 } from '../analysis/color.js';

/** Per-channel gains from a white-card sample (sRGB 0..255 mean). Gains apply in linear light. */
export function gainsFromWhite(rgbMean) {
  const lin = rgbMean.map((c) => Math.max(0.001, srgbToLinear(c / 255)));
  const mean = (lin[0] + lin[1] + lin[2]) / 3;
  return lin.map((c) => mean / c);
}

export function applyGains([r, g, b], gains) {
  return [r, g, b].map((c, i) => Math.round(linearToSrgb(srgbToLinear(c / 255) * gains[i]) * 255));
}

/** Median Lab of a rectangular region of ImageData, white-balanced with gains. Skips the brightest 10% (glare). */
export function measureRegion(imageData, rect, gains = [1, 1, 1]) {
  const { width, data } = imageData;
  const labs = [];
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(imageData.width, Math.round(rect.x + rect.w));
  const y1 = Math.min(imageData.height, Math.round(rect.y + rect.h));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4;
      labs.push(rgbToLab(applyGains([data[i], data[i + 1], data[i + 2]], gains)));
    }
  }
  labs.sort((p, q) => p[0] - q[0]);
  const kept = labs.slice(0, Math.max(1, Math.floor(labs.length * 0.9)));
  return medianLab(kept).map((v) => Math.round(v * 10) / 10);
}

export function repeatability(labA, labB) {
  return deltaE2000(labA, labB);
}
