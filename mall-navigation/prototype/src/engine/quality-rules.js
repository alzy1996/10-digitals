/**
 * Quality rules of the 3D engine (DESIGN-TOY.md 4). Soft sun shadows exist only in the toy style at Showcase quality,
 * and never in the stacked Overview, where every upper slab would black out the floors under it.
 * @param {'stack'|'floor'|'top'|'fpv'} mode
 * @param {'toy'|'storm'|'classic'} style
 * @param {'showcase'|'light'} quality
 */
export const shadowsFor = (mode, style, quality) => style === 'toy' && quality === 'showcase' && mode !== 'stack'
