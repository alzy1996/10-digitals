// Fine-tune overlay (photo mode, from Nail Mirror): drag to move, rotate / lengthen, widen; add or remove nails.
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { useT } from '../../lib/i18n/useT.js'
import { DarkChip } from './ui.jsx'

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
  const { t } = useT()
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
              type="button"
              onPointerDown={(e) => onDown(e, n, 'center')}
              onClick={(e) => e.stopPropagation()}
              className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ${sel ? 'bg-white/25' : ''}`}
              style={c}
              aria-label={t('nails.move_nail')}
            >
              <span className={`h-4 w-4 rounded-full border-2 border-white ${sel ? 'bg-plum' : 'bg-white/40'}`} />
            </button>
            {sel && (
              <>
                <button type="button" onPointerDown={(e) => onDown(e, n, 'tip')} onClick={(e) => e.stopPropagation()} className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={tip} aria-label={t('nails.rotate_nail')}>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-sky-500" />
                </button>
                <button type="button" onPointerDown={(e) => onDown(e, n, 'side')} onClick={(e) => e.stopPropagation()} className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={side} aria-label={t('nails.widen_nail')}>
                  <span className="h-3.5 w-3.5 rounded-sm border-2 border-white bg-amber-300" />
                </button>
              </>
            )}
          </div>
        )
      })}

      <div className="absolute inset-x-0 top-[72px] flex justify-center px-3" onClick={(e) => e.stopPropagation()}>
        <div className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-black/60 p-1.5 backdrop-blur">
          <DarkChip on={adding} onClick={() => setAdding((v) => !v)}>
            <Icon name="plus" size={18} />
            {adding ? t('nails.tap_to_add') : t('nails.add_nail')}
          </DarkChip>
          <DarkChip
            disabled={!selected}
            onClick={() => {
              engine.removeNail(selected)
              setSelected(null)
              bump()
            }}
            className="disabled:opacity-40"
          >
            <Icon name="trash" size={18} />
            {t('common.remove')}
          </DarkChip>
          <DarkChip
            aria-label={t('nails.reset')}
            onClick={() => {
              engine.resetEdits()
              setSelected(null)
              bump()
            }}
          >
            <Icon name="undo" size={18} />
          </DarkChip>
          <DarkChip on onClick={onDone}>
            <Icon name="check" size={18} />
            {t('nails.done')}
          </DarkChip>
        </div>
      </div>
      <p className="pointer-events-none absolute inset-x-0 top-[132px] text-center text-[12px] font-semibold text-white/80 drop-shadow">{t('nails.finetune_hint')}</p>
    </div>
  )
}
