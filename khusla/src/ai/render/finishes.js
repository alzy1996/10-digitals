import finishes from '../../data/finishes.json';

export function finishUniforms(id = 'satin', techniqueMask) {
  // color drenching forces glossy
  const f = finishes.find((x) => x.id === (techniqueMask === 'drench' ? 'glossy' : id)) || finishes[1];
  return { spec: f.specular, tight: f.tightness, tint: f.tint };
}
