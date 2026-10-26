// The Studio's control groups (PRD 7.2, 8.1 step 6): one group at a time, picked with
// big chips. Length (overall + per zone, customer's left / right), Lines (cheek line,
// neckline, sideburn join, edges, mustache, Gulf line-ups), Color (swatches, henna day,
// grey kept, finish, safety questions before any dye) and the Growth timeline.
//
// Sliders report every move with onDraft (the canvas follows) and the final value
// with onCommit (written to the session); chips commit at once.

import { useMemo, useRef, useState } from 'react';
import ChipRow from '../../components/ChipRow.jsx';
import Slider from '../../components/Slider.jsx';
import Toggle from '../../components/Toggle.jsx';
import Icon from '../../components/Icon.jsx';
import { cx } from '../../components/kit.js';
import { useT } from '../../lib/i18n/useT.js';
import { formatPercent } from '../../lib/format.js';
import { necklinePosition } from '../../lib/cutcard.js';
import {
  LOOK_ZONES,
  PRESETS,
  applyPreset,
  clampParams,
  getColor,
  safetyFor,
  scaleLength,
  setColor,
  setZoneLength,
} from '../../lib/look.js';
import LINES from '../../data/lines.json';
import COLORS from '../../data/colors.json';
import FINISHES from '../../data/finishes.json';
import MUSTACHES from '../../data/mustaches.json';
import { TIMELINE_STOPS } from '../../ai/index.js';
import { LINE_OFFSET_KEYS, lineOffsetText, withLineOffset } from './lineHandles.js';
import { timelineIndexAt, timelineSliderValue } from './timelineSlider.js';

export const GROUPS = Object.freeze([
  Object.freeze({ id: 'length', icon: 'ruler', labelKey: 'studio.group.length' }),
  Object.freeze({ id: 'lines', icon: 'razor', labelKey: 'studio.group.lines' }),
  Object.freeze({ id: 'color', icon: 'palette', labelKey: 'studio.group.color' }),
  Object.freeze({ id: 'timeline', icon: 'timeline', labelKey: 'studio.group.timeline' }),
]);

const LINE_TYPES = new Map(LINES.types.map((tp) => [tp.id, tp]));
const PAIRS = Object.freeze({ J: ['J_L', 'J_R'], K: ['K_L', 'K_R'], B: ['B_L', 'B_R'] });
const ZONE_ROWS = Object.freeze(['M', 'S', 'C', 'J', 'K', 'B', 'N']);
/** Mustache length given when a mustache style is picked on a shaved upper lip (mm). */
const MUSTACHE_START_MM = 8;

const maxZone = (p) => Math.max(0, ...LOOK_ZONES.map((z) => Number(p && p.zones && p.zones[z]) || 0));

/** Upper end of the length sliders: a round number above the longest zone. */
export function niceMax(mm) {
  const v = Math.min(200, Math.max(20, mm));
  const step = v <= 60 ? 10 : 20;
  return Math.min(200, Math.ceil(v / step) * step);
}

/** Every zone scaled so the longest one is `target` mm (scaleLength caps one step at x4). */
export function scaleTo(base, target) {
  const bMax = maxZone(base);
  if (!(bMax > 0)) return clampParams(base);
  let f = Math.max(0, Number(target) || 0) / bMax;
  let out = base;
  while (f > 4) {
    out = scaleLength(out, 4);
    f /= 4;
  }
  return scaleLength(out, f);
}

function Block({ title, children, className }) {
  return (
    <section className={cx('flex flex-col gap-3 py-4', className)}>
      {title ? <h3 className="text-base font-semibold text-text">{title}</h3> : null}
      {children}
    </section>
  );
}

function Note({ icon = 'info', tone = 'muted', children }) {
  return (
    <p className={cx('flex items-start gap-2 text-sm', tone === 'warn' ? 'text-warn' : tone === 'brass' ? 'text-brass' : 'text-text-2')}>
      <Icon name={icon} size={18} className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * The group picker: four big chips (one group per sheet state). layout 'row' puts the four
 * in one row of equal cells (phone), 'grid' in two columns (the Mirror Mode side panel).
 */
export function GroupChips({ value, onChange, nullable = false, layout = 'row', className }) {
  const { t } = useT();
  return (
    <ChipRow
      className={cx(
        '!gap-0 [&>[role=radiogroup]]:grid',
        layout === 'grid' ? '[&>[role=radiogroup]]:grid-cols-2' : '[&>[role=radiogroup]]:grid-cols-4 [&_[role=radio]]:px-2',
        className,
      )}
      label={<span className="sr-only">{t('studio.groups')}</span>}
      options={GROUPS.map((g) => ({ value: g.id, label: t(g.labelKey), icon: layout === 'grid' ? g.icon : undefined }))}
      value={value}
      onChange={onChange}
      nullable={nullable}
    />
  );
}

/* ------------------------------------------------------------------ length */

export function LengthControls({ params, committed, styleParams, onDraft, onCommit, onRuler, chair }) {
  const { t } = useT();
  const baseRef = useRef(null);
  const [splitPref, setSplitPref] = useState(false);
  const zones = params.zones || {};
  const longest = maxZone(params);
  const range = niceMax(Math.max(maxZone(styleParams) * 2, maxZone(committed) * 1.25));
  const uneven = Object.values(PAIRS).some(([l, r]) => Math.abs((zones[l] || 0) - (zones[r] || 0)) >= 0.5);
  const split = splitPref || uneven;

  if (longest <= 0 && maxZone(styleParams) <= 0) {
    return (
      <Block>
        <Note>{t('studio.length.shaved')}</Note>
      </Block>
    );
  }

  // Overall length: relative to the look as it was before the first move, so several
  // drags never compound rounding; any other change starts a new reference.
  const overall = (mm) => {
    if (!baseRef.current || baseRef.current.result !== params) baseRef.current = { base: params, result: null };
    const next = scaleTo(baseRef.current.base, mm);
    baseRef.current.result = next;
    return next;
  };

  // onRuler(mm, label, ended, zone): the Studio lays the barber's ruler along the jaw and
  // marks the zones this slider changes.
  const zoneSlider = (key, ids, label) => {
    const value = Number(zones[ids[0]]) || 0;
    const set = (mm) => setZoneLength(params, key, mm);
    return (
      <Slider
        key={key}
        label={label}
        value={value}
        min={0}
        max={range}
        step={0.5}
        unit="mm"
        onChange={(mm) => {
          onRuler(mm, label, false, key);
          onDraft(set(mm));
        }}
        onChangeEnd={(mm) => {
          onRuler(mm, label, true, key);
          onCommit(set(mm));
        }}
      />
    );
  };

  const rows = [];
  for (const row of ZONE_ROWS) {
    const pair = PAIRS[row];
    if (!pair) rows.push(zoneSlider(row, [row], t(`zone.${row}`)));
    else if (split) for (const z of pair) rows.push(zoneSlider(z, [z], t(`zone.${z}`)));
    else rows.push(zoneSlider(row, pair, t(`studio.length.pair.${row}`)));
  }

  const fadeMax = Math.max(10, Math.ceil(Math.max(zones.B_L || 0, zones.B_R || 0)));
  const fadeLabel = t('studio.length.fade');

  return (
    <div className="flex flex-col">
      <Block>
        <Slider
          label={t('studio.length.global')}
          value={Math.min(longest, range)}
          min={1}
          max={range}
          step={0.5}
          unit="mm"
          onChange={(mm) => {
            onRuler(mm, t('studio.length.global'), false, 'all');
            onDraft(overall(mm));
          }}
          onChangeEnd={(mm) => {
            onRuler(mm, t('studio.length.global'), true, 'all');
            onCommit(overall(mm));
          }}
        />
      </Block>
      <hr className="rule-brass" />
      <Block title={t('studio.length.zones')}>
        <Toggle
          checked={split}
          onChange={(v) => setSplitPref(v)}
          disabled={uneven}
          label={t('studio.length.split')}
          description={chair ? t('studio.length.splitHint') : t('studio.length.splitHintHome')}
        />
        {rows}
        {params.fadeStartMm !== null && params.fadeStartMm !== undefined ? (
          <Slider
            label={fadeLabel}
            value={Math.min(params.fadeStartMm, fadeMax)}
            min={0}
            max={fadeMax}
            step={0.5}
            unit="mm"
            onChange={(mm) => {
              onRuler(mm, fadeLabel, false, 'fade');
              onDraft(clampParams({ ...params, fadeStartMm: mm }));
            }}
            onChangeEnd={(mm) => {
              onRuler(mm, fadeLabel, true, 'fade');
              onCommit(clampParams({ ...params, fadeStartMm: mm }));
            }}
          />
        ) : null}
      </Block>
    </div>
  );
}

/* ------------------------------------------------------------------ lines */

function lineOptions(typeId, pick) {
  const tp = LINE_TYPES.get(typeId);
  return tp ? tp.options.map((o) => ({ value: o.id, label: pick(o.name) })) : [];
}

/**
 * dragHint: 'photo' when the cheek line and neckline can be dragged on the photo right
 * now, 'live' when they can in Photo mode, null to say nothing.
 */
export function LinesControls({ params, onDraft, onCommit, onChange, front, mmPerPx, dragHint = null }) {
  const { t, lang, pick } = useT();
  const lines = params.lines || {};

  const setLine = (type, value, offsetKey) => {
    if (!value || value === lines[type]) return;
    const nextLines = { ...lines, [type]: value };
    if (offsetKey) nextLines[offsetKey] = 0;
    onChange({ ...params, lines: nextLines, presetId: null });
  };
  const withOffset = (key, v) => withLineOffset(params, key, v);
  const offsetText = (key) => (v) => lineOffsetText({ t, lang, key, lines, value: v, front, mmPerPx });
  const cheekText = offsetText(LINE_OFFSET_KEYS.cheek);
  const neckText = offsetText(LINE_OFFSET_KEYS.neck);
  const neck = necklinePosition(lines.neckline, lines.necklineOffset);

  const setMustache = (id) => {
    const next = { ...params, mustacheId: id || null };
    if (id && !(Number(params.zones && params.zones.M) > 0)) next.zones = { ...params.zones, M: MUSTACHE_START_MM };
    onChange(clampParams(next));
  };
  const preset = PRESETS.find((p) => p.id === params.presetId) || null;

  return (
    <div className="flex flex-col divide-y divide-line">
      <Block title={t('studio.lines.presets')}>
        <ChipRow
          className="!gap-0"
          label={<span className="sr-only">{t('studio.lines.presets')}</span>}
          options={PRESETS.map((p) => ({ value: p.id, label: pick(p.name), icon: 'razor' }))}
          value={params.presetId || null}
          onChange={(id) => id && onChange(applyPreset(params, id))}
        />
        {preset ? <Note icon="check" tone="brass">{pick(preset.desc)}</Note> : null}
      </Block>

      <Block title={pick(LINE_TYPES.get('cheek').name)}>
        {dragHint ? <Note icon="hand">{t(dragHint === 'photo' ? 'studio.lines.dragHint' : 'studio.lines.dragHintLive')}</Note> : null}
        <ChipRow
          className="!gap-0"
          label={<span className="sr-only">{pick(LINE_TYPES.get('cheek').name)}</span>}
          options={lineOptions('cheek', pick)}
          value={lines.cheek}
          onChange={(v) => setLine('cheek', v, 'cheekOffset')}
        />
        <Slider
          label={t('studio.lines.cheekHeight')}
          value={Number(lines.cheekOffset) || 0}
          min={-1}
          max={1}
          step={0.05}
          format={cheekText}
          onChange={(v) => onDraft(withOffset('cheekOffset', v))}
          onChangeEnd={(v) => onCommit(withOffset('cheekOffset', v))}
        />
      </Block>

      <Block title={pick(LINE_TYPES.get('neckline').name)}>
        <ChipRow
          className="!gap-0"
          label={<span className="sr-only">{pick(LINE_TYPES.get('neckline').name)}</span>}
          options={lineOptions('neckline', pick)}
          value={lines.neckline}
          onChange={(v) => setLine('neckline', v, 'necklineOffset')}
        />
        {neck.followsJaw ? null : (
          <Slider
            label={t('studio.lines.neckHeight')}
            value={Number(lines.necklineOffset) || 0}
            min={-1}
            max={1}
            step={0.05}
            format={neckText}
            onChange={(v) => onDraft(withOffset('necklineOffset', v))}
            onChangeEnd={(v) => onCommit(withOffset('necklineOffset', v))}
          />
        )}
      </Block>

      {['sideburn', 'edge', 'mustacheEdge'].map((type) => (
        <Block key={type} title={pick(LINE_TYPES.get(type).name)}>
          <ChipRow
            className="!gap-0"
            label={<span className="sr-only">{pick(LINE_TYPES.get(type).name)}</span>}
            options={lineOptions(type, pick)}
            value={lines[type]}
            onChange={(v) => setLine(type, v, null)}
          />
        </Block>
      ))}

      <Block title={t('studio.lines.mustache')}>
        <ChipRow
          className="!gap-0"
          label={<span className="sr-only">{t('studio.lines.mustache')}</span>}
          options={MUSTACHES.map((m) => ({ value: m.id, label: pick(m.name), icon: 'mustache' }))}
          value={params.mustacheId || null}
          onChange={setMustache}
          nullable
        />
      </Block>
    </div>
  );
}

/* ------------------------------------------------------------------ color */

function Swatch({ hex }) {
  if (!hex) return <Icon name="drop" size={18} />;
  return <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border border-line" style={{ background: hex }} />;
}

const ANSWER_LABEL = { true: 'common.yes', false: 'common.no', yes: 'common.yes', no: 'common.no', unsure: 'studio.safety.unsure' };

/** Helper text for colours whose catalog note is a build note, not words for the customer. */
const COLOR_NOTE_KEYS = Object.freeze({ 'grey-blend': 'studio.color.note.greyBlend', 'salt-pepper': 'studio.color.note.saltPepper' });

function colorNote(color, t, pick) {
  if (!color || color.id === 'natural') return null;
  if (COLOR_NOTE_KEYS[color.id]) return t(COLOR_NOTE_KEYS[color.id]);
  return color.notes ? pick(color.notes) : null;
}

export function ColorControls({ params, profile, onDraft, onCommit, onChange, hennaDay, onHennaDay, live, safety, setSafety }) {
  const { t, lang, pick } = useT();
  const color = getColor(params.colorId) || getColor('natural');
  const detected = profile && profile.beard && Number.isFinite(Number(profile.beard.greyRatio)) ? Math.round(Number(profile.beard.greyRatio)) : null;
  const grey = params.greyTarget !== null && params.greyTarget !== undefined ? params.greyTarget : detected ?? 0;
  const questions = useMemo(() => safetyFor(params.colorId), [params.colorId]);
  const withGrey = (v) => clampParams({ ...params, greyTarget: v });

  return (
    <div className="flex flex-col divide-y divide-line">
      <Block title={t('studio.color.swatches')}>
        <ChipRow
          className="!gap-0"
          label={<span className="sr-only">{t('studio.color.swatches')}</span>}
          options={COLORS.map((c) => ({ value: c.id, label: pick(c.name), icon: <Swatch hex={c.hex} /> }))}
          value={color.id}
          onChange={(id) => id && onChange(setColor(params, id))}
        />
        {color.warn ? <Note icon="warning" tone="warn">{pick(color.warn)}</Note> : null}
        {colorNote(color, t, pick) ? <Note>{colorNote(color, t, pick)}</Note> : null}
      </Block>

      {color.hexDay3 ? (
        <Block title={t('studio.color.day')}>
          <ChipRow
            className="!gap-0"
            label={<span className="sr-only">{t('studio.color.day')}</span>}
            options={[
              { value: 1, label: t('render.henna.day1'), icon: <Swatch hex={color.hex} /> },
              { value: 3, label: t('render.henna.day3'), icon: <Swatch hex={color.hexDay3} /> },
            ]}
            value={hennaDay}
            onChange={(v) => v && onHennaDay(v)}
          />
          <Note>{live ? t('studio.color.dayLive') : t('render.henna.deepens')}</Note>
        </Block>
      ) : null}

      {safetyFor(color.id).length ? (
        <Block title={t('studio.safety.title')}>
          <div className="flex flex-col gap-4">
            {questions.map((q) => {
              const answer = safety && safety[q.id] !== undefined ? safety[q.id] : null;
              const risky = answer !== null && Array.isArray(q.riskWhen) && q.riskWhen.includes(answer);
              return (
                <div key={q.id} className="flex flex-col gap-2">
                  <ChipRow
                    label={<span className="text-sm font-medium text-text">{t(q.key)}</span>}
                    options={q.answers.map((a) => ({ value: a, label: t(ANSWER_LABEL[String(a)] || 'common.yes') }))}
                    value={answer}
                    onChange={(v) => setSafety(q.id, v)}
                    nullable
                  />
                  {risky ? (
                    <Note icon="warning" tone="warn">
                      {t(`${q.key}.flag`)}
                    </Note>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Block>
      ) : null}

      <Block title={Array.isArray(color.greyBlend) ? t('studio.color.blend') : null}>
        {Array.isArray(color.greyBlend) ? (
          <ChipRow
            className="!gap-0"
            label={<span className="sr-only">{t('studio.color.blend')}</span>}
            options={color.greyBlend.map((v) => ({ value: v, label: formatPercent(v, lang) }))}
            value={params.greyTarget}
            onChange={(v) => v !== null && onChange(withGrey(v))}
          />
        ) : null}
        {/* Step 1, so the value shown is the look's own (today's grey until it is moved). */}
        <Slider
          label={t('studio.color.grey')}
          value={grey}
          min={0}
          max={100}
          step={1}
          format={(v) => formatPercent(v, lang)}
          onChange={(v) => onDraft(withGrey(v))}
          onChangeEnd={(v) => onCommit(withGrey(v))}
        />
        {detected !== null ? <p className="num text-sm text-text-2">{t('studio.color.greyNow', { pct: formatPercent(detected, lang) })}</p> : null}
      </Block>

      <Block title={t('studio.color.finish')}>
        <ChipRow
          className="!gap-0"
          label={<span className="sr-only">{t('studio.color.finish')}</span>}
          options={FINISHES.map((f) => ({ value: f.id, label: pick(f.name) }))}
          value={params.finish}
          onChange={(v) => v && onChange(clampParams({ ...params, finish: v }))}
        />
      </Block>
    </div>
  );
}

/* ------------------------------------------------------------------ timeline */

export function TimelineControls({ index, onIndex, growth, rate }) {
  const { t, lang } = useT();
  const stops = TIMELINE_STOPS.length;
  const options = [
    { value: -1, label: t('studio.timeline.final'), icon: 'beard' },
    ...TIMELINE_STOPS.map((s, i) => ({ value: i, label: t(s.labelKey) })),
  ];
  return (
    <div className="flex flex-col divide-y divide-line">
      <Block>
        <Note icon="timeline">{t('studio.timeline.hint')}</Note>
        <ChipRow
          label={t('studio.timeline.stops')}
          options={options}
          value={index === null ? -1 : index}
          onChange={(v) => onIndex(v === null || v < 0 ? null : v)}
        />
        {/* The last position is the final look, so the slider always reads what the canvas shows. */}
        <Slider
          label={t('studio.timeline.slider')}
          value={timelineSliderValue(index, stops)}
          min={0}
          max={stops}
          step={1}
          format={(i) => {
            const at = timelineIndexAt(i, stops);
            return at === null ? t('studio.timeline.final') : t(TIMELINE_STOPS[at].labelKey);
          }}
          onChange={(i) => onIndex(timelineIndexAt(i, stops))}
          onChangeEnd={(i) => onIndex(timelineIndexAt(i, stops))}
        />
      </Block>
      <Block>
        {growth ? (
          <p role="status" className="text-lg font-semibold text-brass">
            {t(growth.labelKey)}
          </p>
        ) : null}
        {growth && growth.patchy.length ? (
          <Note icon="warning" tone="warn">
            {t('render.timeline.patchy')} ({growth.patchy.map((z) => t(`zone.${z}`)).join(lang === 'ar' ? '، ' : ', ')})
          </Note>
        ) : null}
        <p className="num text-sm text-text-2">{t('render.timeline.rate', { rate: Math.round(rate * 100) / 100 })}</p>
      </Block>
    </div>
  );
}
