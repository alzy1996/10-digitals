// Fine-tune overlay (photo mode): drag to move, rotate/lengthen, widen; add or remove nails.
// This is how the salon reaches a pixel-perfect fit on any hand, any light, in seconds.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2, RotateCcw, Check } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'

function useFit(canvas, photoSize) {
  const [fit, setFit] = useState(null)
  const measure = useCallback(() => {
    if (!canvas || !photoSize) return
    const r = canvas.getBoundingClientRect()
    const parent = canvas.parentElement.getBoundingClientRect()
    const scale = Math.min(r.width / photoSize.width, r.height / photoSize.height)
    const ox = r.left - parent.left + (r.width - photoSize.width * scale) / 2
    const oy = r.top - parent.top + (r.height - photoSize.height * scale) / 2
    setFit({ scale, ox, oy })
  }, [canvas, photoSize])
  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])
  return fit
}

export function FineTune({ engine, canvas, photoSize, onDone, version, bump }) {
  const { t } = useI18n()
  const fit = useFit(canvas, photoSize)
  const [selected, setSelected] = useState(null)
  const [adding, setAdding] = useState(false)
  const drag = useRef(null)
  const nails = engine ? engine.currentNails() : []
  void version

  const toPhoto = (clientX, clientY, el) => {
    const host = el.getBoundingClientRect()
    return { x: (clientX - host.left - fit.ox) / fit.scale, y: (clientY - host.top - fit.oy) / fit.scale }
  }

  const onDown = (e, nail, handle) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelected(nail.key)
    const host = e.currentTarget.closest('[data-finetune]')
    const p = toPhoto(e.clientX, e.clientY, host)
    drag.current = { key: nail.key, handle, start: p, nail: { ...nail }, host }
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const p = toPhoto(e.clientX, e.clientY, d.host)
    const n = { ...d.nail }
    if (d.handle === 'center') {
      n.cx = d.nail.cx + (p.x - d.start.x)
      n.cy = d.nail.cy + (p.y - d.start.y)
    } else if (d.handle === 'tip') {
      const dx = p.x - d.nail.cx
      const dy = p.y - d.nail.cy
      const L = Math.hypot(dx, dy)
      if (L > 3) {
        n.ux = dx / L
        n.uy = dy / L
        n.len = Math.max(6, L * 2)
      }
    } else if (d.handle === 'side') {
      const vx = -d.nail.uy
      const vy = d.nail.ux
      const w = Math.abs((p.x - d.nail.cx) * vx + (p.y - d.nail.cy) * vy)
      n.wid = Math.max(5, w * 2)
    }
    engine.setNail(d.key, n)
    bump()
  }
  const onUp = () => {
    drag.current = null
  }

  if (!fit || !engine) return null
  const S = (x, y) => ({ left: fit.ox + x * fit.scale, top: fit.oy + y * fit.scale })

  return (
    <div
      data-finetune
      className="absolute inset-0 z-20 touch-none"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClick={(e) => {
        if (!adding) return setSelected(null)
        const p = toPhoto(e.clientX, e.clientY, e.currentTarget)
        const nn = engine.addNailAt(p.x, p.y)
        setSelected(nn.key)
        setAdding(false)
        bump()
      }}
    >
      {nails.map((n) => {
        const tip = S(n.cx + n.ux * n.len * 0.5, n.cy + n.uy * n.len * 0.5)
        const side = S(n.cx - n.uy * n.wid * 0.5, n.cy + n.ux * n.wid * 0.5)
        const c = S(n.cx, n.cy)
        const sel = selected === n.key
        return (
          <div key={n.key}>
            <button
              onPointerDown={(e) => onDown(e, n, 'center')}
              onClick={(e) => e.stopPropagation()}
              className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ${sel ? 'bg-white/25' : ''}`}
              style={c}
              aria-label={t('move_nail')}
            >
              <span className={`h-4 w-4 rounded-full border-2 border-white ${sel ? 'bg-champagne' : 'bg-white/40'}`} />
            </button>
            {sel && (
              <>
                <button onPointerDown={(e) => onDown(e, n, 'tip')} onClick={(e) => e.stopPropagation()} className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={tip} aria-label={t('rotate_nail')}>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-glaze-500" />
                </button>
                <button onPointerDown={(e) => onDown(e, n, 'side')} onClick={(e) => e.stopPropagation()} className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={side} aria-label={t('widen_nail')}>
                  <span className="h-3.5 w-3.5 rounded-sm border-2 border-white bg-mocha-300" />
                </button>
              </>
            )}
          </div>
        )
      })}

      <div className="absolute inset-x-0 top-16 flex justify-center px-4" onClick={(e) => e.stopPropagation()}>
        <div className="glass-dark flex items-center gap-1 rounded-full p-1.5">
          <button onClick={() => setAdding((v) => !v)} className={`chip min-h-[42px] ${adding ? 'chip-dark-on' : 'chip-dark-off'}`}>
            <Plus size={16} />
            {adding ? t('tap_to_add') : t('add_nail')}
          </button>
          <button
            disabled={!selected}
            onClick={() => {
              engine.removeNail(selected)
              setSelected(null)
              bump()
            }}
            className="chip chip-dark-off min-h-[42px] disabled:opacity-40"
          >
            <Trash2 size={16} />
            {t('remove')}
          </button>
          <button
            onClick={() => {
              engine.resetEdits()
              setSelected(null)
              bump()
            }}
            className="chip chip-dark-off min-h-[42px]"
          >
            <RotateCcw size={16} />
          </button>
          <button onClick={onDone} className="chip chip-dark-on min-h-[42px]">
            <Check size={16} />
            {t('done')}
          </button>
        </div>
      </div>
      <p className="pointer-events-none absolute inset-x-0 top-[124px] text-center text-[12px] font-semibold text-white/80 drop-shadow">{t('finetune_hint')}</p>
    </div>
  )
}
