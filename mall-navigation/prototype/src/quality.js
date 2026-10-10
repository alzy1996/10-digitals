/**
 * 3D quality level (DESIGN-TOY.md, v0.3 spec 3.2): 'showcase' = soft shadows + pixel ratio up to 2; 'light' = no
 * shadows, pixel ratio up to 1.5. Pure and outside src/engine, so the first screen can call it without pulling in the
 * lazy 3D chunk.
 * @param {{ urlParam?: string|null, deviceMemory?: number, cores?: number, saveData?: boolean }} [p]
 * @returns {'showcase'|'light'}
 */
export function pickQuality({ urlParam, deviceMemory, cores, saveData } = {}) {
  if (urlParam === 'showcase' || urlParam === 'light') return urlParam
  if (saveData) return 'light'
  if (Number.isFinite(deviceMemory) && deviceMemory < 4) return 'light'
  // only a 1-2 core device counts: Safari caps the core count it reports, Android Chrome reports memory instead
  if (Number.isFinite(cores) && cores <= 2) return 'light'
  return 'showcase'
}
