import { useId } from 'react';
import { useT } from '../lib/i18n.js';
import { DEFAULT_GUARD_CHART, validateGuardChart } from '../lib/guards.js';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';
import Icon from '../ui/Icon.jsx';
import IconButton from '../ui/IconButton.jsx';
import { useSnackbar } from '../ui/snackbar.js';
import { Stepper } from './ui.jsx';

export const GUARD_MM = Object.freeze({ min: 0.25, max: 60, step: 0.5 });
const MAX_ROWS = 40;

let keySeq = 0;
const newKey = () => {
  keySeq += 1;
  return `g${keySeq}`;
};

/** Trim float noise: 0.75 -> "0.75", 3 -> "3", 4.5 -> "4.5". */
export function mmText(mm) {
  const n = Number(mm);
  if (!Number.isFinite(n)) return '';
  return String(Number(n.toFixed(2)));
}

/** Editable copy of a guard chart. Existing rows keep their id; `extra` keeps unknown fields. */
export function toDraft(chart) {
  const src = Array.isArray(chart) && chart.length ? chart : DEFAULT_GUARD_CHART;
  return src.map((g) => {
    const label = g.label && typeof g.label === 'object' ? g.label : { en: String(g.label ?? g.id ?? ''), ar: String(g.label ?? g.id ?? '') };
    const row = { key: newKey(), id: String(g.id ?? ''), label: { en: String(label.en ?? ''), ar: String(label.ar ?? label.en ?? '') }, mm: Number(g.mm) };
    if (Number.isFinite(Number(g.minMm))) row.minMm = Number(g.minMm);
    if (Number.isFinite(Number(g.maxMm))) row.maxMm = Number(g.maxMm);
    return row;
  });
}

function baseId(row) {
  const lbl = String(row.label.en || row.label.ar || '').trim();
  const num = /^#?\s*(\d{1,2}(?:\.\d{1,2})?)$/.exec(lbl);
  if (num) return num[1];
  const slug = lbl
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16);
  return slug || `g${mmText(row.mm).replace('.', '_')}`;
}

/** Chart rows ready for updateSettings({ guardChart }); new rows get a readable unique id. */
export function chartFromDraft(draft) {
  const taken = new Set(draft.filter((r) => r.id).map((r) => r.id));
  return draft.map((r) => {
    let id = r.id;
    if (!id) {
      const base = baseId(r);
      id = base;
      let n = 2;
      while (taken.has(id)) {
        id = `${base}-${n}`.slice(0, 20);
        n += 1;
      }
      taken.add(id);
    }
    const row = { id, label: { en: r.label.en.trim(), ar: (r.label.ar || r.label.en).trim() }, mm: Number(Number(r.mm).toFixed(2)) };
    if (Number.isFinite(r.minMm)) row.minMm = r.minMm;
    if (Number.isFinite(r.maxMm)) row.maxMm = r.maxMm;
    return row;
  });
}

const ERROR_KEYS = {
  id: 'owner.set.guards.err.label',
  'duplicate id': 'owner.set.guards.err.duplicate',
  mm: 'owner.set.guards.err.mm',
  order: 'owner.set.guards.err.order',
};

/** { chart, rowErrors: { [index]: i18nKey }, general: i18nKey|null } */
export function checkDraft(draft) {
  const chart = chartFromDraft(draft);
  const rowErrors = {};
  let general = null;
  draft.forEach((r, i) => {
    if (!String(r.label.en || r.label.ar || '').trim()) rowErrors[i] = 'owner.set.guards.err.label';
  });
  for (const e of validateGuardChart(chart)) {
    if (e === 'empty') {
      general = 'owner.set.guards.err.empty';
      continue;
    }
    const m = /^row (\d+): (.+)$/.exec(e);
    if (!m) continue;
    const i = Number(m[1]) - 1;
    if (rowErrors[i] === undefined) rowErrors[i] = ERROR_KEYS[m[2]] || 'owner.set.guards.err.mm';
  }
  if (draft.length > MAX_ROWS) general = 'owner.set.guards.err.tooMany';
  return { chart, rowErrors, general, ok: !general && !Object.keys(rowErrors).length };
}

function norm(chart) {
  return JSON.stringify(
    (Array.isArray(chart) ? chart : []).map((g) => [String(g.id ?? ''), String(g.label?.en ?? ''), String(g.label?.ar ?? ''), Number(Number(g.mm).toFixed(2))]),
  );
}

/** Same rows, labels and lengths (ids of new rows ignored). */
export function sameChart(draft, chart) {
  return norm(chartFromDraft(draft).map((r, i) => (draft[i].id ? r : { ...r, id: '' }))) === norm(chart);
}

/**
 * Guard chart editor (PRD 8.3): one row per clipper guard with its label and length in mm
 * (+/- steppers), add and remove rows, reset to the default chart. Works on a draft; the
 * screen saves it. Rows must get longer from top to bottom.
 */
export default function GuardChartEditor({ draft, onChange, rowErrors = {}, general = null }) {
  const { t, lang } = useT();
  const { show } = useSnackbar();
  const listId = useId();

  const setRow = (i, patch) => onChange(draft.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const setLabel = (i, text) => {
    const r = draft[i];
    const same = r.label.en === r.label.ar;
    const label = same || !r.id ? { en: text, ar: text } : { ...r.label, [lang]: text };
    setRow(i, { label });
  };

  const setMm = (i, mm) => {
    const r = { ...draft[i], mm };
    delete r.minMm;
    delete r.maxMm;
    onChange(draft.map((x, j) => (j === i ? r : x)));
  };

  const remove = (i) => {
    const removed = draft[i];
    const next = draft.filter((_, j) => j !== i);
    onChange(next);
    const label = removed.label[lang] || removed.label.en || removed.label.ar;
    show({
      message: t('beard.owner.set.guards.removed', { label }),
      actionLabel: t('beard.common.undo'),
      onAction: () => onChange([...next.slice(0, i), removed, ...next.slice(i)]),
    });
  };

  const add = () => {
    const last = draft[draft.length - 1];
    const mm = Math.min(GUARD_MM.max, last ? Number(last.mm) + 3 : 3);
    const lastNum = last ? /(\d+(?:\.\d+)?)/.exec(String(last.label.en || '')) : null;
    const label = lastNum ? `#${Math.floor(Number(lastNum[1])) + 1}` : '';
    onChange([...draft, { key: newKey(), id: '', label: { en: label, ar: label }, mm }]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className="hidden items-center gap-2 text-xs font-medium text-ink2 sm:flex">
        <span className="w-6" />
        <span className="w-32">{t('beard.owner.set.guards.colLabel')}</span>
        <span className="flex-1">{t('beard.owner.set.guards.colMm')}</span>
      </div>
      <ol id={listId} className="flex flex-col gap-2">
        {draft.map((r, i) => {
          const n = i + 1;
          const err = rowErrors[i];
          const errId = `${listId}-e${i}`;
          return (
            <li key={r.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="num hidden w-6 shrink-0 text-center text-sm text-ink2 sm:inline">
                  {n}
                </span>
                <Field
                  value={r.label[lang] || r.label.en || r.label.ar}
                  onChange={(v) => setLabel(i, v)}
                  aria-label={t('beard.owner.set.guards.labelAria', { n })}
                  aria-invalid={err === 'owner.set.guards.err.label' || err === 'owner.set.guards.err.duplicate' ? true : undefined}
                  aria-describedby={err ? errId : undefined}
                  maxLength={30}
                  dir="auto"
                  autoComplete="off"
                  className="w-[92px] shrink-0 sm:w-32"
                  inputClassName="text-center"
                />
                <Stepper
                  value={r.mm}
                  min={GUARD_MM.min}
                  max={GUARD_MM.max}
                  step={GUARD_MM.step}
                  onChange={(v) => setMm(i, v)}
                  format={(v) => t('beard.owner.mmValue', { v: mmText(v) })}
                  label={t('beard.owner.set.guards.mmAria', { n })}
                  decLabel={t('beard.owner.set.guards.shorter', { n })}
                  incLabel={t('beard.owner.set.guards.longer', { n })}
                  invalid={err === 'owner.set.guards.err.mm' || err === 'owner.set.guards.err.order'}
                  valueClassName="w-[68px] px-0.5 text-sm sm:w-[84px] sm:text-base"
                />
                <IconButton
                  icon="trash"
                  tone="muted"
                  label={t('beard.owner.set.guards.remove', { n })}
                  onClick={() => remove(i)}
                  disabled={draft.length <= 1}
                  className="ms-auto"
                />
              </div>
              {err ? (
                <p id={errId} className="flex items-start gap-1.5 text-sm text-risk sm:ps-8">
                  <Icon name="warning" size={16} className="mt-0.5" />
                  <span>{t(err)}</span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {general ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-risk">
          <Icon name="warning" size={16} className="mt-0.5" />
          <span>{t(general)}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="plus" onClick={add} disabled={draft.length >= MAX_ROWS}>
          {t('beard.owner.set.guards.add')}
        </Button>
        <Button variant="ghost" icon="refresh" onClick={() => onChange(toDraft(DEFAULT_GUARD_CHART))}>
          {t('beard.owner.set.guards.reset')}
        </Button>
      </div>
    </div>
  );
}
