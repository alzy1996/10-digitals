// Signature-style editor (S16 sub-view): names, per-zone lengths in mm (customer's left and
// right), line chips, face shapes, trim interval and local fit, with a live Zone Diagram that
// redraws as the sliders move. The parent owns the draft so it survives "Undo" after leaving.

import { useMemo, useState } from 'react';
import BottomAction from '../../components/BottomAction.jsx';
import Button from '../../components/Button.jsx';
import Chip from '../../components/Chip.jsx';
import ChipRow from '../../components/ChipRow.jsx';
import Field from '../../components/Field.jsx';
import IconButton from '../../components/IconButton.jsx';
import ScreenFrame from '../../components/ScreenFrame.jsx';
import Slider from '../../components/Slider.jsx';
import Toggle from '../../components/Toggle.jsx';
import ZoneDiagram from '../../components/ZoneDiagram.jsx';
import { formatMm } from '../../lib/format.js';
import { pickLang } from '../../lib/i18n/useT.js';
import { lengthClassOf, lookSummary, paramsFromStyle, validateParams } from '../../lib/look.js';
import LINES from '../../data/lines.json';
import { Card, Note, useMediaQuery } from './ui.jsx';
import {
  FACE_CODES,
  LENGTH_STOPS,
  ZONE_SLIDER_GROUPS,
  faceLabelKey,
  lengthLabelKey,
  linkDraft,
  nearestStop,
  nextFaces,
  previewStyle,
  setDraftZone,
  signaturePatch,
  stepStop,
  styleNames,
  trimLabel,
} from './util.js';

const FIT_VALUES = [1, 2, 3, 4, 5];
const MAX_STOP = LENGTH_STOPS.length - 1;

/** One zone: [-] slider in mm [+]. The slider moves over LENGTH_STOPS (fine when short). */
function ZoneSlider({ label, value, onChange, lang, t }) {
  const mm = Number(value) || 0;
  const idx = nearestStop(mm);
  const format = (i) => formatMm(i === idx ? mm : LENGTH_STOPS[i], lang);
  return (
    <div className="flex items-end gap-1 py-3">
      <IconButton
        icon="minus"
        label={t('manage.sig.shorter', { zone: label })}
        onClick={() => onChange(stepStop(mm, -1))}
        disabled={mm <= 0}
        tone="bordered"
      />
      <Slider
        className="min-w-0 flex-1"
        label={label}
        min={0}
        max={MAX_STOP}
        step={1}
        value={idx}
        format={format}
        onChange={(i) => onChange(LENGTH_STOPS[i])}
      />
      <IconButton
        icon="plus"
        label={t('manage.sig.longer', { zone: label })}
        onClick={() => onChange(stepStop(mm, 1))}
        disabled={mm >= LENGTH_STOPS[MAX_STOP]}
        tone="bordered"
      />
    </div>
  );
}

/** Live preview: one large labelled diagram on desktop, front + side thumbnails on phones. */
function Preview({ params, guardChart, lang, t, wide, view, setView, lengthKey, summary }) {
  const sideView = view === 'R' ? 'R' : 'L';
  return (
    <div aria-label={t('manage.sig.preview')} role="group" className="rounded-card border border-line bg-surface p-3 lg:p-4">
      {wide ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg">{t('manage.sig.preview')}</h2>
            <Chip size="sm" icon="ruler">
              {t(lengthKey)}
            </Chip>
          </div>
          <ChipRow
            label={t('manage.sig.view')}
            value={view}
            onChange={setView}
            options={[
              { value: 'front', label: t('manage.sig.view.front') },
              { value: 'L', label: t('manage.sig.view.L') },
              { value: 'R', label: t('manage.sig.view.R') },
            ]}
          />
          <div className="mx-auto mt-3 w-full max-w-[380px]">
            <ZoneDiagram params={params} guardChart={guardChart} view={view === 'front' ? 'front' : 'profile'} side={sideView} lang={lang} />
          </div>
        </>
      ) : (
        <div className="mx-auto grid w-full max-w-[300px] grid-cols-2 gap-2">
          <figure className="min-w-0">
            <ZoneDiagram params={params} guardChart={guardChart} view="front" lang={lang} showLabels={false} />
            <figcaption className="text-center text-xs text-text-2">{t('manage.sig.view.front')}</figcaption>
          </figure>
          <figure className="relative min-w-0">
            <ZoneDiagram params={params} guardChart={guardChart} view="profile" side={sideView} lang={lang} showLabels={false} />
            <figcaption className="text-center text-xs text-text-2">{t(`manage.sig.view.${sideView}`)}</figcaption>
            <IconButton
              icon="mirror"
              label={sideView === 'L' ? t('manage.sig.showRight') : t('manage.sig.showLeft')}
              onClick={() => setView(sideView === 'L' ? 'R' : 'L')}
              tone="bordered"
              className="absolute -top-1 end-0 bg-surface"
            />
          </figure>
        </div>
      )}
      <p className="mt-2 text-center text-sm text-text-2 lg:text-start">
        {wide ? null : (
          <span className="text-text">
            {t(lengthKey)}
            {summary ? ' · ' : ''}
          </span>
        )}
        {summary}
      </p>
    </div>
  );
}

/**
 * `guardChart` is the shop's chart (settings.guardChart), so the diagram's guard labels match
 * the Cut Card. `saving` shows the Save button busy and ignores further taps.
 */
export default function SignatureEditor({ mode, base, draft, setDraft, onSave, onCancel, saving = false, guardChart, t, lang }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [view, setView] = useState('front');
  const [tried, setTried] = useState(false);

  const style = useMemo(() => previewStyle(base, draft), [base, draft]);
  const params = useMemo(() => paramsFromStyle(style), [style]);
  const lengthKey = lengthLabelKey(lengthClassOf({ zones: draft.zones }));
  const summary = useMemo(() => lookSummary(params, lang, { ...style, name: { en: '', ar: '' } }), [params, lang, style]);

  const errors = useMemo(() => {
    const list = [];
    if (!draft.nameAr.trim() && !draft.nameEn.trim()) list.push('manage.sig.err.name');
    if (!draft.faces.length) list.push('manage.sig.err.faces');
    for (const key of validateParams(params)) list.push(key);
    return list;
  }, [draft, params]);
  const nameError = tried && errors.includes('manage.sig.err.name') ? t('manage.sig.err.name') : null;

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setZone = (zone, mm) => setDraft((d) => setDraftZone(d, zone, mm));

  const save = () => {
    if (saving) return;
    setTried(true);
    if (errors.length) return;
    onSave(signaturePatch(base, draft));
  };

  const baseName = styleNames(base, lang).primary;
  const title = mode === 'edit' ? t('manage.sig.editTitle') : t('manage.sig.newTitle');

  const footer = (
    <BottomAction>
      <Button icon="check" onClick={save} loading={saving}>
        {mode === 'edit' ? t('manage.sig.saveChanges') : t('manage.sig.save')}
      </Button>
    </BottomAction>
  );

  const lineTypes = LINES.types;

  return (
    <ScreenFrame title={title} wide onBack={onCancel} footer={footer}>
      <div className="relative flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <Note tone="plain" icon="copy">
            {mode === 'edit' ? t('manage.sig.editNote') : t('manage.sig.basedOn', { name: baseName })}
          </Note>
          {tried && errors.length ? (
            <Note tone="cut" role="alert" title={t('manage.sig.err.title')}>
              <ul className="list-disc ps-5">
                {errors.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </Note>
          ) : null}
          <Card title={t('manage.sig.names')} description={t('manage.sig.namesSub')} icon="edit">
            <Field
              label={t('manage.sig.nameAr')}
              value={draft.nameAr}
              onChange={(v) => update({ nameAr: v })}
              dir="rtl"
              lang="ar"
              maxLength={80}
              autoComplete="off"
              error={nameError}
            />
            <Field label={t('manage.sig.nameEn')} value={draft.nameEn} onChange={(v) => update({ nameEn: v })} dir="auto" maxLength={80} autoComplete="off" />
          </Card>
        </div>

        <div className="sticky top-0 z-10 -mx-[var(--gutter)] border-b border-line bg-bg px-[var(--gutter)] pb-3 pt-1 lg:top-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:border-b-0 lg:p-0">
          <Preview params={params} guardChart={guardChart} lang={lang} t={t} wide={wide} view={view} setView={setView} lengthKey={lengthKey} summary={summary} />
        </div>

        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
          <Card title={t('manage.sig.lengths')} description={t('manage.sig.lengthsSub')} icon="ruler">
            <Toggle
              checked={draft.linked}
              onChange={(on) => setDraft((d) => linkDraft(d, on))}
              label={t('manage.sig.linkSides')}
              description={t('manage.sig.linkSidesSub')}
            />
            <div className="flex flex-col divide-y divide-line border-y border-line">
              {ZONE_SLIDER_GROUPS.map((g) => {
                if (g.zones.length === 1 || draft.linked) {
                  const z = g.zones[0];
                  const label = g.zones.length === 1 ? t(`zone.${z}`) : t(`manage.zone.${g.id}`);
                  return <ZoneSlider key={g.id} label={label} value={draft.zones[z]} onChange={(mm) => setZone(z, mm)} lang={lang} t={t} />;
                }
                return g.zones.map((z) => (
                  <ZoneSlider key={z} label={t(`zone.${z}`)} value={draft.zones[z]} onChange={(mm) => setZone(z, mm)} lang={lang} t={t} />
                ));
              })}
            </div>
          </Card>

          <Card title={t('manage.sig.lines')} description={t('manage.sig.linesSub')} icon="razor">
            {lineTypes.map((type) => (
              <ChipRow
                key={type.id}
                label={pickLang(lang, type.name)}
                value={draft.lines[type.id]}
                onChange={(v) => setDraft((d) => ({ ...d, lines: { ...d.lines, [type.id]: v } }))}
                options={type.options.map((o) => ({ value: o.id, label: pickLang(lang, o.name) }))}
              />
            ))}
          </Card>

          <Card title={t('manage.sig.fitTitle')} description={t('manage.sig.fitSub')} icon="face">
            <ChipRow
              label={t('manage.sig.faces')}
              multi
              value={draft.faces}
              onChange={(v) => setDraft((d) => ({ ...d, faces: nextFaces(d.faces, v) }))}
              options={[
                { value: 'all', label: t('manage.faces.all') },
                ...FACE_CODES.map((c) => ({ value: c, label: t(faceLabelKey(c)) })),
              ]}
            />
            <Slider
              label={t('manage.sig.trim')}
              min={1}
              max={30}
              step={1}
              value={draft.trimDays}
              format={(v) => trimLabel(t, v)}
              onChange={(v) => update({ trimDays: v })}
            />
            <div className="flex flex-col gap-1">
              <ChipRow
                label={t('manage.cat.localFit')}
                value={draft.localFit}
                onChange={(v) => update({ localFit: v })}
                options={FIT_VALUES.map((v) => ({ value: v, label: String(v) }))}
              />
              <p className="text-sm text-text-2">{t('manage.cat.localFitSub')}</p>
            </div>
          </Card>
        </div>
      </div>
    </ScreenFrame>
  );
}
