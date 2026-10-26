// One product or service in the S17 list: names, price (formatOmr), active switch, edit.

import IconButton from '../../components/IconButton.jsx';
import Toggle from '../../components/Toggle.jsx';
import { cx } from '../../components/kit.js';
import { formatOmr } from '../../lib/format.js';
import { productNames } from './util.js';

export default function ProductRow({ product, onActive, onEdit, t, lang }) {
  const { primary, other } = productNames(product, lang);
  const active = product.active !== false;
  return (
    <li data-product-id={product.id} className="flex flex-col gap-1 py-3">
      <div className="flex items-baseline gap-3">
        <p className={cx('min-w-0 flex-1 break-words text-base font-medium', !active && 'text-text-2')}>{primary}</p>
        <p className={cx('num shrink-0 text-lg font-semibold', active ? 'text-text' : 'text-text-2 line-through decoration-1')}>
          <bdi>{formatOmr(product.priceOmr, lang)}</bdi>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {!active ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-warn/50 bg-warn/10 px-2 text-xs text-warn">
              {t('manage.prod.off')}
            </span>
          ) : null}
          {other ? (
            <p className="min-w-0 truncate text-sm text-text-2">
              <bdi>{other}</bdi>
            </p>
          ) : null}
        </div>
        <Toggle
          checked={active}
          onChange={(on) => onActive(product, on)}
          label={
            <>
              <span className="sr-only">{primary}: </span>
              {t('manage.prod.active')}
            </>
          }
          className="!min-h-tap !w-auto shrink-0 !gap-2 [&_span.text-base]:text-sm [&_span.text-base]:text-text-2"
        />
        <IconButton icon="edit" label={t('manage.prod.editAria', { name: primary })} onClick={() => onEdit(product)} tone="bordered" data-action="edit" />
      </div>
    </li>
  );
}
