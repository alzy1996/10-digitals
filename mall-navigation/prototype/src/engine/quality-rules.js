/**
 * Quality rules of the 3D engine (DESIGN-TOY.md 4).
 *
 * Soft sun shadows exist only in the toy style at Showcase quality, never in the stacked Overview (every upper slab
 * would black out the floors under it) and not while a stack <-> floor blend animates (the shadow map would be redrawn
 * on every frame of the heaviest moment; it is drawn once when the blend settles).
 * @param {'stack'|'floor'|'top'|'fpv'} mode
 * @param {'toy'|'storm'|'classic'} style
 * @param {'showcase'|'light'} quality
 * @param {number} [blend] stack blend, 0 = true scale, 1 = stacked
 */
export const shadowsFor = (mode, style, quality, blend = 0) =>
  style === 'toy' && quality === 'showcase' && mode !== 'stack' && !(blend > 0.001 && blend < 0.999)

/** Consecutive slow frames (each over SLOW_FRAME_MS apart) that drop Showcase to Light for the session. */
export const SLOW_FRAMES = 8
export const SLOW_FRAME_MS = 45

/**
 * Slow-frame counter: measured on the frame interval (requestAnimationFrame to requestAnimationFrame), so a phone
 * whose GPU is the bottleneck counts too, not only CPU time spent in render().
 * @param {number} count
 * @param {number} intervalMs
 */
export const nextSlowFrames = (count, intervalMs) => (intervalMs > SLOW_FRAME_MS ? count + 1 : 0)
