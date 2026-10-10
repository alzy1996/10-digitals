// Fixed film-grain + vignette overlay. Tiny noise tile as a data-URI —
// costs nothing, makes flat gradients read as photographed light.
const NOISE_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E"

export default function GrainOverlay() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[90]">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: `url("${NOISE_URI}")`, backgroundSize: '120px 120px' }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(130% 100% at 50% 40%, transparent 60%, rgba(23,16,9,0.18) 100%)',
        }}
      />
    </div>
  )
}
