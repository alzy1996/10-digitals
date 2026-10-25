// Compare: before/after slider + up to 4 looks side-by-side on the SAME frozen photo.
import { useEffect, useRef, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { Sheet, Spinner, Segmented } from '../../components/ui'

export function CompareSheet({ open, onClose, engine, variants, onApply, onRemove }) {
  const { t, pick } = useI18n()
  const [tab, setTab] = useState('grid')
  const [shots, setShots] = useState([])
  const [before, setBefore] = useState(null)
  const [after, setAfter] = useState(null)
  const [busy, setBusy] = useState(false)
  const [split, setSplit] = useState(50)
  const box = useRef(null)

  useEffect(() => {
    if (!open || !engine) return
    let cancelled = false
    ;(async () => {
      setBusy(true)
      if (engine.mode === 'live') await engine.freeze()
      // let the browser paint between renders
      const out = []
      for (const v of variants) {
        await new Promise((r) => setTimeout(r, 0))
        out.push({ ...v, url: engine.capture(v.design, 0.85) })
      }
      const b = engine.capture(engine.design, 0.85, { showOriginal: true })
      const a = engine.capture(engine.design, 0.85)
      if (!cancelled) {
        setShots(out)
        setBefore(b)
        setAfter(a)
        setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, engine, variants])

  const onDrag = (e) => {
    const r = box.current.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100
    setSplit(Math.max(0, Math.min(100, x)))
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('compare')} wide>
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'grid', label: t('side_by_side') },
          { value: 'slider', label: t('before_after') },
        ]}
      />
      {busy && (
        <div className="flex justify-center py-16">
          <Spinner size={30} />
        </div>
      )}
      {!busy && tab === 'grid' && (
        <>
          {shots.length < 2 && <p className="mb-3 rounded-2xl bg-glaze-50 p-3 text-[14px] text-glaze-700">{t('compare_hint')}</p>}
          <div className={`grid gap-3 ${shots.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {shots.map((s, i) => (
              <figure key={s.id} className="card overflow-hidden">
                <img src={s.url} alt={pick(s.design.base)} className="aspect-[3/4] w-full object-cover" />
                <figcaption className="flex items-center gap-2 p-2.5">
                  <span className="h-6 w-6 shrink-0 rounded-full border border-black/10" style={{ background: s.design.base.hex }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                    {i + 1}. {pick(s.design.base)}
                  </span>
                  {onRemove && (
                    <button onClick={() => onRemove(s.id)} className="icon-btn h-9 w-9 bg-ink/5" aria-label={t('remove')}>
                      <Trash2 size={15} />
                    </button>
                  )}
                  <button onClick={() => onApply(s.design)} className="icon-btn h-9 w-9 bg-ink text-white" aria-label={t('choose')}>
                    <Check size={16} />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
      {!busy && tab === 'slider' && before && after && (
        <div
          ref={box}
          className="relative w-full touch-none select-none overflow-hidden rounded-3xl bg-night"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            onDrag(e)
          }}
          onPointerMove={(e) => e.buttons && onDrag(e)}
        >
          <img src={after} alt={t('after')} className="block w-full" draggable={false} />
          <img src={before} alt={t('before')} className="absolute inset-0 block h-full w-full" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} draggable={false} />
          <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: split + '%' }}>
            <span className="absolute top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-night/60 backdrop-blur" />
          </div>
          <span className="absolute left-3 top-3 rounded-full bg-night/60 px-3 py-1 text-[12px] font-bold text-white">{t('before')}</span>
          <span className="absolute right-3 top-3 rounded-full bg-night/60 px-3 py-1 text-[12px] font-bold text-white">{t('after')}</span>
        </div>
      )}
    </Sheet>
  )
}
