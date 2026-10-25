// Manual entry / edit-in-place form for one product or service (S17). The Save button is
// the screen's bottom-anchored primary action (it submits this form by id).

import ChipRow from '../../components/ChipRow.jsx';
import Field from '../../components/Field.jsx';
import IconButton from '../../components/IconButton.jsx';
import Toggle from '../../components/Toggle.jsx';
import { cx } from '../../components/kit.js';
import { formatOmr } from '../../lib/format.js';
import { PRODUCT_CATEGORIES, readPrice } from './util.js';

export const PRODUCT_FORM_ID = 'manage-product-form';

export default function ProductForm({ draft, onChange, errors, onSubmit, onCancel, title, headingRef, headingLevel = 3, t, lang, className }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const set = (key) => (value) => onChange({ ...draft, [key]: value });
  const price = readPrice(draft.price);
  const priceHint = draft.price.trim() && !price.reason ? t('manage.prod.priceShows', { price: formatOmr(price.value, lang) }) : t('manage.prod.priceHint');
  return (
    <form
      id={PRODUCT_FORM_ID}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={cx('flex flex-col gap-4 rounded-card border border-brass/60 bg-surface p-4', className)}
    >
      <div className="-mt-1 flex items-center gap-2">
        <Heading ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 break-words text-lg outline-none">
          {title}
        </Heading>
        <IconButton icon="close" label={t('common.cancel')} onClick={onCancel} tone="muted" className="-me-2" />
      </div>
      <div className="flex flex-col gap-1.5">
        <ChipRow
          label={t('manage.prod.category')}
          value={draft.category}
          onChange={set('category')}
          options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: t(`manage.prod.cat.${c}`) }))}
        />
        {errors.category ? (
          <p role="alert" className="text-sm text-cut">
            {t(errors.category)}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('manage.prod.nameAr')}
          value={draft.nameAr}
          onChange={set('nameAr')}
          dir="rtl"
          lang="ar"
          maxLength={100}
          autoComplete="off"
          enterKeyHint="next"
          error={errors.name ? t(errors.name) : null}
        />
        <Field
          label={t('manage.prod.name')}
          value={draft.name}
          onChange={set('name')}
          dir="auto"
          maxLength={100}
          autoComplete="off"
          enterKeyHint="next"
          hint={t('manage.prod.nameHint')}
        />
      </div>
      <Field
        label={t('manage.prod.price')}
        value={draft.price}
        onChange={set('price')}
        inputMode="decimal"
        dir="ltr"
        autoComplete="off"
        enterKeyHint="done"
        placeholder="0.000"
        inputClassName="num text-start text-lg"
        end={<span className="pe-3 text-sm text-text-2">{lang === 'ar' ? 'ر.ع.' : 'OMR'}</span>}
        error={errors.price ? t(errors.price) : null}
        hint={priceHint}
      />
      <Toggle
        checked={draft.active}
        onChange={set('active')}
        label={t('manage.prod.active')}
        description={draft.active ? t('manage.prod.activeSub') : t('manage.prod.inactiveSub')}
      />
    </form>
  );
}
