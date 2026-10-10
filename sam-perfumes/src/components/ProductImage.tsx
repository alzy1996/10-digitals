import { useState } from 'react'
import { useI18n } from '../lib/i18n'

// ── CSS bottle silhouette ───────────────────────────────────────────
// Site-wide fallback for the 2D card grid: whenever a product image 404s
// we render this gold-glass silhouette instead, so the site never shows a
// broken icon. (The hero uses a real WebGL bottle — see HeroScene.)
export function BottleSilhouette({
  variant = 'tall',
  showLabel = true,
  className = '',
}: {
  variant?: 'tall' | 'round'
  showLabel?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const bodyRadius = variant === 'round' ? '46% 46% 42% 42% / 52% 52% 44% 44%' : '26% 26% 20% 20% / 14% 14% 10% 10%'

  return (
    <div aria-hidden className={`relative flex h-full w-full flex-col items-center justify-end ${className}`}>
      {/* cap */}
      <div
        className="relative z-10 w-[22%] rounded-[6px]"
        style={{
          height: '11%',
          background: 'linear-gradient(160deg, var(--accent) 0%, var(--accent-deep) 70%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), inset 0 -2px 4px rgba(0,0,0,.35)',
        }}
      />
      {/* neck */}
      <div
        className="w-[16%]"
        style={{
          height: '7%',
          background: 'linear-gradient(180deg, rgba(211,160,90,.55), rgba(211,160,90,.25))',
          boxShadow: 'inset 1px 0 0 rgba(255,255,255,.18)',
        }}
      />
      {/* body */}
      <div
        className="relative flex w-[72%] items-center justify-center overflow-hidden"
        style={{
          height: variant === 'round' ? '66%' : '74%',
          borderRadius: bodyRadius,
          background:
            'linear-gradient(155deg, rgba(244,234,217,.28) 0%, rgba(211,160,90,.42) 34%, rgba(138,90,43,.65) 72%, rgba(23,16,9,.72) 100%)',
          border: '1px solid rgba(244,234,217,.22)',
          boxShadow: 'inset 0 10px 30px rgba(255,255,255,.10), inset 0 -18px 34px rgba(0,0,0,.38)',
        }}
      >
        {/* glass highlight */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 42% at 28% 18%, rgba(255,255,255,.32), transparent 60%), linear-gradient(100deg, transparent 62%, rgba(255,255,255,.10) 70%, transparent 78%)',
          }}
        />
        {showLabel && (
          <div
            className="relative flex h-[34%] w-[52%] items-center justify-center rounded-[4px]"
            style={{ background: 'rgba(23,16,9,.82)', border: '1px solid rgba(211,160,90,.5)' }}
          >
            <span className="font-display text-lg italic" style={{ color: 'var(--accent)' }}>
              {t.brand.name}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Product image with automatic silhouette fallback ───────────────
export function ProductImage({
  src,
  alt,
  variant = 'tall',
  className = '',
  imgClassName = '',
  width,
  height,
  lazy = true,
  label = true,
}: {
  src: string
  alt: string
  variant?: 'tall' | 'round'
  className?: string
  imgClassName?: string
  width: number
  height: number
  lazy?: boolean
  label?: boolean
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className={className} style={{ aspectRatio: `${width} / ${height}` }}>
        <BottleSilhouette variant={variant} showLabel={label} />
      </div>
    )
  }
  return (
    <div className={className}>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={lazy ? 'lazy' : 'eager'}
        draggable={false}
        onError={() => setFailed(true)}
        className={`h-full w-full object-contain ${imgClassName}`}
      />
    </div>
  )
}
