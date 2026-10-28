// Compare (from Nail Mirror): before / after slider + up to 4 looks side by side on the SAME frozen photo.
// The images are data URLs in memory only; closing the sheet drops them.
import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Chip from '../../components/Chip.jsx';
import { useT } from '../../lib/i18n/useT.js';
import { StudioSheet, Spinner, usePick } from './ui.jsx';

export function CompareSheet({ open, onClose, engine, variants, onApply, onRemove }) {
  const { t } = useT();
  const pick = usePick();
  const [tab, setTab] = useState('grid');
  const [shots, setShots] = useState([]);
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const [busy, setBusy] = useState(false);
  const [split, setSplit] = useState(50);
  const box = useRef(null);

  useEffect(() => {
    if (!open || !engine) return undefined;
    let cancelled = false;
    (async () => {
      setBusy(true);
      if (engine.mode === 'live') await engine.freeze();
      const out = [];
      for (const v of variants) {
        await new Promise((r) => setTimeout(r, 0)); // let the browser paint between renders
        out.push({ ...v, url: engine.capture(v.design, 0.85) });
      }
      const b = engine.capture(engine.design, 0.85, { showOriginal: true });
      const a = engine.capture(engine.design, 0.85);
      if (!cancelled) {
        setShots(out);
        setBefore(b);
        setAfter(a);
        setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, engine, variants]);

  useEffect(() => {
    if (open) return;
    setShots([]);
    setBefore(null);
    setAfter(null);
  }, [open]);

  const onDrag = (e) => {
    const r = box.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    setSplit(Math.max(0, Math.min(100, x)));
  };

  return (
    <StudioSheet open={open} onClose={onClose} title={t('nails.compare')}>
      <div className="mb-4 flex gap-2">
        <Chip selected={tab === 'grid'} onClick={() => setTab('grid')}>{t('nails.side_by_side')}</Chip>
        <Chip selected={tab === 'slider'} onClick={() => setTab('slider')}>{t('nails.before_after')}</Chip>
      </div>
      {busy ? (
        <div className="flex justify-center py-16 text-ink2">
          <Spinner size={30} />
        </div>
      ) : null}
      {!busy && tab === 'grid' ? (
        <>
          {shots.length < 2 ? <p className="mb-3 rounded-card border border-line bg-surface2 p-3 text-[14px]">{t('nails.compare_hint')}</p> : null}
          <div className={`grid gap-3 ${shots.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {shots.map((s, i) => (
              <figure key={s.id} className="card overflow-hidden">
                <img src={s.url} alt={pick(s.design.base)} className="aspect-[3/4] w-full object-cover" />
                <figcaption className="flex items-center gap-2 p-2">
                  <span className="h-6 w-6 shrink-0 rounded-full border border-line" style={{ background: s.design.base.hex }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                    {i + 1}. {pick(s.design.base)}
                  </span>
                  {onRemove ? (
                    <button type="button" onClick={() => onRemove(s.id)} className="press grid h-11 w-11 place-items-center rounded-full border border-line" aria-label={t('common.remove')}>
                      <Icon name="trash" size={18} />
                    </button>
                  ) : null}
                  <button type="button" onClick={() => onApply(s.design)} className="press grid h-11 w-11 place-items-center rounded-full bg-plum text-onplum" aria-label={t('nails.choose')}>
                    <Icon name="check" size={18} />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : null}
      {!busy && tab === 'slider' && before && after ? (
        <div
          ref={box}
          dir="ltr"
          className="relative w-full touch-none select-none overflow-hidden rounded-card bg-black"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onDrag(e);
          }}
          onPointerMove={(e) => e.buttons && onDrag(e)}
        >
          <img src={after} alt={t('nails.after')} className="block w-full" draggable={false} />
          <img src={before} alt={t('nails.before')} className="absolute inset-0 block h-full w-full" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} draggable={false} />
          <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${split}%` }}>
            <span className="absolute top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/60" />
          </div>
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[12px] font-bold text-white">{t('nails.before')}</span>
          <span className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[12px] font-bold text-white">{t('nails.after')}</span>
        </div>
      ) : null}
    </StudioSheet>
  );
}
