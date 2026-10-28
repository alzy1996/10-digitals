// A tiny nail-shaped swatch that previews colour + finish with pure CSS (from Nail Mirror).
import { mixHex, shadeHex, isHex } from '../../ai/nails/index.js'

function finishBackground(hex, hex2, finish) {
  const c = isHex(hex) ? hex : '#cccccc'
  const light = mixHex(c, '#ffffff', 0.55)
  const dark = shadeHex(c, 0.55)
  const c2 = isHex(hex2) ? hex2 : mixHex(c, '#ffffff', 0.5)
  switch (finish) {
    case 'matte':
      return `linear-gradient(160deg, ${mixHex(c, '#ffffff', 0.08)}, ${shadeHex(c, 0.85)})`
    case 'satin':
      return `radial-gradient(120% 70% at 30% 20%, ${mixHex(c, '#ffffff', 0.22)} 0%, ${c} 45%, ${shadeHex(c, 0.75)} 100%)`
    case 'sheer':
    case 'milky':
      return `linear-gradient(90deg, rgba(255,255,255,.0) 20%, rgba(255,255,255,.55) 32%, rgba(255,255,255,0) 44%), linear-gradient(180deg, ${mixHex(c, '#ffffff', 0.25)}, ${c})`
    case 'chrome':
      return `linear-gradient(100deg, ${dark} 0%, ${light} 18%, ${c} 30%, ${shadeHex(c, 0.35)} 46%, ${light} 62%, ${c} 78%, ${dark} 100%)`
    case 'holo':
      return `linear-gradient(100deg, rgba(255,255,255,.55), rgba(255,255,255,0) 40%), conic-gradient(from 210deg at 40% 60%, #ffb3c7, #ffe9a8, #b9ffcf, #a8e6ff, #d4b8ff, #ffb3c7), ${c}`
    case 'metallic':
      return `linear-gradient(100deg, ${dark} 0%, ${light} 30%, ${c} 50%, ${dark} 80%, ${c} 100%)`
    case 'glitter':
      return `radial-gradient(circle at 20% 30%, #fff 0 1.2px, transparent 1.6px), radial-gradient(circle at 70% 60%, #fff 0 1px, transparent 1.5px), radial-gradient(circle at 45% 80%, ${light} 0 1.4px, transparent 1.8px), radial-gradient(circle at 80% 20%, ${light} 0 1px, transparent 1.4px), linear-gradient(160deg, ${light}, ${c} 50%, ${dark})`
    case 'shimmer':
      return `radial-gradient(circle at 25% 35%, rgba(255,255,255,.9) 0 .6px, transparent 1px), radial-gradient(circle at 65% 55%, rgba(255,255,255,.8) 0 .6px, transparent 1px), radial-gradient(circle at 40% 75%, rgba(255,255,255,.8) 0 .5px, transparent .9px), radial-gradient(120% 80% at 30% 20%, ${light}, ${c} 55%, ${dark})`
    case 'pearl':
      return `radial-gradient(120% 80% at 30% 15%, #ffffff 0%, ${mixHex(c, '#f5e6ff', 0.4)} 35%, ${c} 70%, ${mixHex(c, '#cfe6ff', 0.35)} 100%)`
    case 'cateye':
      return `linear-gradient(100deg, ${c} 0%, ${c} 35%, ${c2} 48%, ${mixHex(c2, '#ffffff', 0.4)} 52%, ${c2} 56%, ${c} 70%, ${c} 100%)`
    case 'velvet':
      return `radial-gradient(60% 80% at 50% 50%, ${c2} 0%, ${c} 70%, ${shadeHex(c, 0.6)} 100%)`
    case 'duochrome':
      return `linear-gradient(135deg, ${c} 0%, ${mixHex(c, c2, 0.5)} 50%, ${c2} 100%)`
    case 'neon':
      return `radial-gradient(120% 80% at 30% 20%, ${mixHex(c, '#ffffff', 0.3)}, ${c} 60%)`
    default:
      // creme / gloss
      return `radial-gradient(120% 75% at 30% 18%, ${mixHex(c, '#ffffff', 0.35)} 0%, ${c} 45%, ${shadeHex(c, 0.72)} 100%)`
  }
}

export function NailSwatch({ hex, hex2, finish = 'creme', size = 44, selected = false, dark = false, className = '', title }) {
  const w = size
  const h = Math.round(size * 1.28)
  const glossy = !['matte', 'satin'].includes(finish)
  return (
    <span
      title={title}
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: w, height: h }}
      aria-hidden={title ? undefined : true}
    >
      <span
        className="absolute inset-0 overflow-hidden"
        style={{
          borderRadius: `${w / 2}px ${w / 2}px ${w * 0.32}px ${w * 0.32}px`,
          background: finishBackground(hex, hex2, finish),
          boxShadow: selected
            ? dark
              ? '0 0 0 2.5px #fff, 0 0 18px 3px rgba(255,255,255,.55)'
              : '0 0 0 2.5px #1D1A18, 0 0 16px 2px rgba(200,169,126,.75)'
            : 'inset 0 -2px 4px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.15)',
        }}
      >
        {glossy && (
          <span
            className="absolute"
            style={{
              left: '22%',
              top: '12%',
              width: '16%',
              height: '62%',
              borderRadius: 99,
              background: 'linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,0))',
              opacity: finish === 'chrome' || finish === 'holo' ? 0.9 : 0.6,
            }}
          />
        )}
      </span>
    </span>
  )
}
