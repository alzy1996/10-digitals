// A designed manicure without any photo: five nail outlines in their colours + the recipe.
// Used on the Agreement, saved looks, booking requests and the customer's "send" sheet.
import { useT } from '../../lib/i18n/useT.js';
import { SHAPE_BY_KEY, TYPE_BY_KEY, LENGTHS } from '../../data/nails/taxonomy.js';
import { paintsOf } from '../../ai/nails/index.js';
import { NailSwatch } from './NailSwatch.jsx';
import { nailOutlinePath } from './ShapeIcon.jsx';
import { fingerPaints, lengthKey } from './lib.js';
import { usePick } from './ui.jsx';

export function HandPreview({ design, height = 64 }) {
  const fingers = fingerPaints(design);
  const sizes = [0.78, 0.92, 1, 0.94, 0.74];
  return (
    <div className="flex items-end gap-1.5" dir="ltr" aria-hidden>
      {fingers.map((f, i) => {
        const h = Math.round(height * sizes[i]);
        return (
          <svg key={f.key} width={Math.round(h * 0.6)} height={h} viewBox="0 0 24 40">
            <path d={nailOutlinePath(design.shape, design.length ?? 0.35, 24, 40)} fill={f.paint?.hex || '#ddd'} stroke="rgba(0,0,0,.25)" strokeWidth="1" />
            {design.art && design.art !== 'none' && design.artHex ? <path d="M4 8 Q12 2 20 8" stroke={design.artHex} strokeWidth="3" fill="none" /> : null}
          </svg>
        );
      })}
    </div>
  );
}

export default function DesignCard({ design, compact = false }) {
  const { t } = useT();
  const pick = usePick();
  if (!design?.base) return null;
  const paints = paintsOf(design);
  const len = LENGTHS.find((l) => l.key === lengthKey(design.length));
  return (
    <div className={compact ? '' : 'card p-4'}>
      <div className="flex items-start gap-4">
        <HandPreview design={design} height={compact ? 44 : 64} />
        <div className="min-w-0 flex-1 space-y-2">
          {paints.map((p) => (
            <div key={p.where} className="flex items-center gap-2">
              <NailSwatch hex={p.hex} hex2={p.hex2} finish={p.finish} size={compact ? 20 : 26} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{pick(p) || p.hex}</p>
                <p className="truncate text-[12px] text-ink2">
                  {p.where === 'all' ? t('nails.all_nails') : t(`nails.finger_${p.where}`)} · {t(`nails.finish_${p.finish}`)}
                  {p.brand || p.code ? ` · ${[p.brand, p.code].filter(Boolean).join(' ')}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] tablet:grid-cols-4">
        <div>
          <dt className="text-ink2">{t('nails.shape')}</dt>
          <dd className="font-semibold">{pick(SHAPE_BY_KEY[design.shape])}</dd>
        </div>
        <div>
          <dt className="text-ink2">{t('nails.length')}</dt>
          <dd className="font-semibold">{pick(len)}</dd>
        </div>
        <div>
          <dt className="text-ink2">{t('nails.art')}</dt>
          <dd className="flex items-center gap-1 font-semibold">
            {t(`nails.art_${design.art || 'none'}`)}
            {design.art && design.art !== 'none' && design.artHex ? <span className="inline-block h-3.5 w-3.5 rounded-full border border-line" style={{ background: design.artHex }} /> : null}
          </dd>
        </div>
        <div>
          <dt className="text-ink2">{t('nails.product_type')}</dt>
          <dd className="font-semibold">{design.type ? pick(TYPE_BY_KEY[design.type]) : '-'}</dd>
        </div>
      </dl>
    </div>
  );
}
