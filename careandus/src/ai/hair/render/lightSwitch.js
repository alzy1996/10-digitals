// Light presets -> shader uniforms (PRD 7.3, 4.9).
import lights from '../../../data/lights.json';
import { lightMatrix, toGlMat3 } from '../color/bradford.js';

const cache = {};

export function lightUniforms(id = 'daylight') {
  if (!cache[id]) {
    const l = lights.find((x) => x.id === id) || lights[0];
    cache[id] = { matrix: toGlMat3(lightMatrix(l.kelvin, 0.5)), contrast: l.contrast, spec: l.specular, kelvin: l.kelvin };
  }
  return cache[id];
}
