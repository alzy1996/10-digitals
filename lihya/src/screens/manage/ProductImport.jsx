// CSV import for products (S17, PRD 11.3): pick a file -> parseProductsCsv -> preview with bad
// rows in the cut color (row number + reason) -> the screen's primary "Import N valid rows" ->
// result summary. The parent owns the state so the footer button can drive the import.

import { useMemo } from 'react';
import Button from '../../components/Button.jsx';
import ChipRow from '../../components/ChipRow.jsx';
import Icon from '../../components/Icon.jsx';
import { cx } from '../../components/kit.js';
import { formatOmr } from '../../lib/format.js';
import { assetUrl } from '../../lib/paths.js';
import { Card, Note } from './ui.jsx';
import { PRODUCT_CATEGORIES } from './util.js';

const MAX_PREVIEW = 300;
const HEADER_KEY = 'report.csv.reason.header';

function Tile({ label, value, tone = 'text-text' }) {
  return (
    <div className="flex min-w-0 flex-col rounded-ctl border border-line bg-surface-2 px-3 py-2">
      <span className="truncate text-xs text-text-2">{label}</span>
      <span className={cx('display num text-2xl font-semibold leading-tight', tone)}>
        <bdi>{value}</bdi>
      </span>
    </div>
  );
}

function PreviewRow({ item, valid, t, lang }) {
  const v = item.values || {};
  const primary = (lang === 'ar' ? v.nameAr || v.name : v.name || v.nameAr) || '';
  const other = lang === 'ar' ? v.name : v.nameAr;
  const category = valid ? t(`manage.prod.cat.${valid.category}`) : v.category;
  const price = valid ? formatOmr(valid.priceOmr, lang) : v.priceOmr;
  const parts = [category, price].filter(Boolean);
  if (valid && valid.active === false) parts.push(t('manage.prod.off'));
  return (
    <li className={cx('flex items-start gap-3 rounded-ctl border p-3', item.ok ? 'border-line bg-surface' : 'border-cut/60 bg-cut/10')}>
      <span
        className={cx(
          'num mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold',
          item.ok ? 'border-line text-text-2' : 'border-cut/60 text-cut',
        )}
      >
        {t('manage.imp.row', { n: item.row })}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cx('break-words font-medium', !primary && 'text-text-2')}>{primary || t('manage.imp.noName')}</p>
        {other && other !== primary ? (
          <p className="break-words text-sm text-text-2">
            <bdi>{other}</bdi>
          </p>
        ) : null}
        {parts.length ? (
          <p className="break-words text-sm text-text-2">
            <bdi>{parts.join(' · ')}</bdi>
          </p>
        ) : null}
        {!item.ok ? (
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-cut">
            {item.reasons.map((r) => (
              <li key={r}>{t(r)}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <Icon
        name={item.ok ? 'check' : 'warning'}
        size={20}
        className={cx('mt-0.5 shrink-0', item.ok ? 'text-keep' : 'text-cut')}
        title={item.ok ? t('manage.imp.ok') : t('manage.imp.bad')}
      />
    </li>
  );
}

export default function ProductImport({ state, inputRef, onPick, onReset, onFilter, t, lang, headingRef }) {
  const parsed = state && state.phase === 'parsed' ? state.parsed : null;
  const validByRow = useMemo(() => new Map(((parsed && parsed.rows) || []).map((r) => [r.row, r])), [parsed]);
  const headerError = Boolean(parsed && parsed.errors.some((e) => e.reasons.includes(HEADER_KEY)));
  const preview = useMemo(() => {
    if (!parsed) return [];
    const list = state.filter === 'bad' ? parsed.preview.filter((p) => !p.ok) : parsed.preview;
    return list;
  }, [parsed, state]);

  const pickButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" icon="upload" onClick={() => inputRef.current && inputRef.current.click()}>
        {parsed ? t('manage.imp.another') : t('manage.imp.choose')}
      </Button>
      <Button variant="ghost" icon="download" as="a" href={assetUrl('templates/products-template.csv')} download="products-template.csv">
        {t('manage.imp.template')}
      </Button>
    </div>
  );

  let body = null;
  if (state && state.phase === 'reading') {
    body = (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm text-text-2">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-brass motion-reduce:animate-none" />
          {t('manage.imp.reading', { file: state.file })}
        </p>
        <div aria-hidden="true" className="skeleton h-14 rounded-ctl" />
        <div aria-hidden="true" className="skeleton h-14 rounded-ctl" />
      </div>
    );
  } else if (state && state.phase === 'error') {
    body = (
      <Note tone="cut" role="alert" title={t('manage.imp.readFailed.title')}>
        {t(state.messageKey)}
      </Note>
    );
  } else if (parsed && headerError) {
    body = (
      <Note tone="cut" role="alert" title={t(HEADER_KEY)}>
        {t('manage.imp.headerHelp')}
      </Note>
    );
  } else if (parsed && !parsed.total) {
    body = (
      <Note tone="warn" role="alert" title={t('report.csv.empty')}>
        {t('manage.imp.headerHelp')}
      </Note>
    );
  } else if (parsed) {
    const bad = parsed.errors.length;
    const ok = parsed.rows.length;
    body = (
      <div className="flex flex-col gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm text-text-2">
          <Icon name="report" size={18} className="shrink-0" />
          <bdi className="truncate">{state.file}</bdi>
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Tile label={t('manage.imp.rows')} value={parsed.total} />
          <Tile label={t('manage.imp.ready')} value={ok} tone="text-keep" />
          <Tile label={t('manage.imp.problems')} value={bad} tone={bad ? 'text-cut' : 'text-text-2'} />
        </div>
        {parsed.preview.length && parsed.preview[0].row === 1 ? (
          <Note tone="warn" title={t('manage.imp.noHeader')}>
            {t('manage.imp.headerHelp')}
          </Note>
        ) : null}
        {state.garbled ? (
          <Note tone="warn" title={t('manage.imp.garbled.title')}>
            {t('manage.imp.garbled.body')}
          </Note>
        ) : null}
        {bad ? (
          <ChipRow
            label={t('manage.imp.show')}
            value={state.filter}
            onChange={onFilter}
            options={[
              { value: 'all', label: t('manage.imp.showAll') },
              { value: 'bad', label: t('manage.imp.showBad'), tone: 'cut' },
            ]}
          />
        ) : null}
        <ul className="flex flex-col gap-2" aria-label={t('manage.imp.previewLabel')}>
          {preview.slice(0, MAX_PREVIEW).map((item) => (
            <PreviewRow key={item.row} item={item} valid={validByRow.get(item.row)} t={t} lang={lang} />
          ))}
        </ul>
        {preview.length > MAX_PREVIEW ? <p className="text-sm text-text-2">{t('manage.imp.more', { n: preview.length - MAX_PREVIEW })}</p> : null}
        <div>
          <Button variant="ghost" icon="close" onClick={onReset}>
            {t('manage.imp.cancel')}
          </Button>
        </div>
      </div>
    );
  } else if (state && state.phase === 'done') {
    const r = state.result;
    body = (
      <div role="status" className="flex flex-col gap-3">
        <Note tone="keep" title={t('manage.imp.doneTitle')}>
          {t('manage.imp.doneBody')}
        </Note>
        <div className="grid grid-cols-3 gap-2">
          <Tile label={t('manage.imp.imported')} value={r.imported} tone="text-keep" />
          <Tile label={t('manage.imp.updated')} value={r.updated} tone="text-info" />
          <Tile label={t('manage.imp.skipped')} value={r.skipped} tone={r.skipped ? 'text-cut' : 'text-text-2'} />
        </div>
        <div>
          <Button variant="secondary" icon="check" onClick={onReset}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card title={t('manage.imp.title')} description={t('manage.imp.sub')} icon="upload" headingRef={headingRef}>
      <p className="text-sm text-text-2">
        {t('manage.imp.columns')}{' '}
        <code dir="ltr" className="num inline-block max-w-full break-all rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs text-text">
          name,nameAr,category,priceOmr,active
        </code>
      </p>
      <p className="text-sm text-text-2">
        {t('manage.imp.catLabel')}{' '}
        <code dir="ltr" className="num inline-block max-w-full break-all rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs text-text">
          {PRODUCT_CATEGORIES.join(' · ')}
        </code>
      </p>
      <p className="text-sm text-text-2">{t('manage.imp.catNote')}</p>
      {pickButtons}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
      {body}
    </Card>
  );
}
