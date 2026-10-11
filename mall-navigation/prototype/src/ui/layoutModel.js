/**
 * Wide layout (v0.5, DESIGN-MALL.md 3.10): from 900 x 560 px the sheets dock in a side panel at the start edge and
 * the map takes the rest. Pure maths for the map's free area (engine viewport padding).
 */
export const WIDE_MIN_W = 900
export const WIDE_MIN_H = 560
export const WIDE_QUERY = `(min-width: ${WIDE_MIN_W}px) and (min-height: ${WIDE_MIN_H}px)`
export const isWide = (w, h) => w >= WIDE_MIN_W && h >= WIDE_MIN_H

export function widePadding({ appW, panelRect, ctrlsBottom, levelsRect, rtl, gap = 16 }) {
  const picker = levelsRect ? (rtl ? levelsRect.right + 8 : appW - levelsRect.left + 8) : gap
  const panel = rtl ? appW - panelRect.left + gap : panelRect.right + gap
  return {
    top: Math.round(ctrlsBottom + 8),
    bottom: gap,
    left: Math.round(rtl ? picker : panel),
    right: Math.round(rtl ? panel : picker),
  }
}
