import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { heroImages } from '../content/content'
import { useI18n } from '../lib/i18n'

// ── CSS bottle silhouette ───────────────────────────────────────────
// Site-wide fallback: whenever a product image 404s we render this
// gold-glass silhouette instead, so the site never shows a broken icon.
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
}: {
  src: string
  alt: string
  variant?: 'tall' | 'round'
  className?: string
  imgClassName?: string
  width: number
  height: number
  lazy?: boolean
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className={className} style={{ aspectRatio: `${width} / ${height}` }}>
        <BottleSilhouette variant={variant} />
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

// ── HeroVisual ──────────────────────────────────────────────────────
// Isolated visual stage: layered bottles, infinite float, mouse
// parallax via gsap.quickTo (zero React re-renders). Later Sam can swap
// the inside of this component for a 3D canvas with no outside changes.
export default function HeroVisual() {
  const stageRef = useRef<HTMLDivElement>(null)
  const mainParallaxRef = useRef<HTMLDivElement>(null)
  const backParallaxRef = useRef<HTMLDivElement>(null)
  const mainFloatRef = useRef<HTMLDivElement>(null)
  const backFloatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const ctx = gsap.context(() => {
      gsap.to(mainFloatRef.current, {
        y: 10,
        duration: 3,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        startAt: { y: -10 },
      })
      gsap.to(backFloatRef.current, {
        y: -10,
        duration: 3.4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        startAt: { y: 10 },
        delay: 0.4,
      })

      const mainX = gsap.quickTo(mainParallaxRef.current, 'x', { duration: 0.9, ease: 'power3.out' })
      const mainY2 = gsap.quickTo(mainParallaxRef.current, 'y', { duration: 0.9, ease: 'power3.out' })
      const backX = gsap.quickTo(backParallaxRef.current, 'x', { duration: 1.2, ease: 'power3.out' })
      const backY2 = gsap.quickTo(backParallaxRef.current, 'y', { duration: 1.2, ease: 'power3.out' })

      const onMove = (e: MouseEvent) => {
        const nx = (e.clientX / window.innerWidth) * 2 - 1
        const ny = (e.clientY / window.innerHeight) * 2 - 1
        mainX(nx * 14)
        mainY2(ny * 14)
        backX(nx * -26)
        backY2(ny * -26)
      }
      window.addEventListener('mousemove', onMove)
      return () => window.removeEventListener('mousemove', onMove)
    }, stageRef)

    return () => ctx.revert()
  }, [])

  return (
    <div ref={stageRef} className="relative mx-auto h-[320px] w-full max-w-[420px] sm:h-[400px] md:h-[460px]">
      {/* back bottle — GSAP owns transforms on the float/parallax divs,
          so positioning is plain offsets and rotation lives on an inner div */}
      <div ref={backParallaxRef} className="absolute inset-0 will-change-transform">
        <div ref={backFloatRef} className="absolute end-[-2%] top-[6%] h-[64%] w-[46%] will-change-transform">
          <div className="h-full w-full rotate-[10deg] opacity-80 blur-[1px]">
            <ProductImage
              src={heroImages.back}
              alt=""
              variant="round"
              width={420}
              height={560}
              lazy={false}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
      {/* main bottle */}
      <div ref={mainParallaxRef} className="absolute inset-0 will-change-transform">
        <div ref={mainFloatRef} className="absolute bottom-[6%] start-[4%] h-[84%] w-[60%] will-change-transform">
          <div className="h-full w-full rotate-[-8deg]">
            <ProductImage
              src={heroImages.main}
              alt="SAM Perfumes signature bottle"
              width={420}
              height={560}
              lazy={false}
              className="h-full w-full drop-shadow-[0_30px_40px_rgba(23,16,9,0.45)]"
            />
          </div>
        </div>
      </div>
      {/* warm elliptical shadow */}
      <div
        aria-hidden
        className="absolute bottom-[2%] left-1/2 h-[7%] w-[70%] -translate-x-1/2 rounded-[50%]"
        style={{ background: 'radial-gradient(50% 50% at 50% 50%, rgba(23,16,9,.55), transparent 70%)' }}
      />
    </div>
  )
}
