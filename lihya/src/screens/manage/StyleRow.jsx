// One style in the catalog manager (S16): names, length, trim interval, faces, badges,
// show/hide switch, local fit chips, move up/down and "Clone as signature style".

import { memo } from 'react';
import Button from '../../components/Button.jsx';
import Chip from '../../components/Chip.jsx';
import ChipRow from '../../components/ChipRow.jsx';
import IconButton from '../../components/IconButton.jsx';
import Toggle from '../../components/Toggle.jsx';
import { cx } from '../../components/kit.js';
import { lengthClassOf } from '../../lib/look.js';
import { facesText, lengthLabelKey, styleNames, trimLabel } from './util.js';

const FIT_VALUES = [1, 2, 3, 4, 5];

function StyleRow({ style, position, lang, t, canUp, canDown, onHidden, onFit, onMove, onClone, onEdit, baseName }) {
  const { primary, other } = styleNames(style, lang);
  const hidden = style.hidden === true;
  const signature = style.signature === true;
  const fit = Math.round(Number(style.localFit));
  const fitOptions = FIT_VALUES.map((v) => ({ value: v, label: String(v) }));
  const named = (text) => (
    <>
      <span className="sr-only">{primary}: </span>
      {text}
    </>
  );

  return (
    <li data-style-id={style.id} className={cx('flex min-w-0 flex-col rounded-card border bg-surface', signature ? 'border-brass/60' : 'border-line')}>
      <div className="flex items-start gap-3 px-4 pt-4">
        <span
          className="num mt-0.5 flex h-9 min-w-9 shrink-0 items-center justify-center rounded-ctl border border-line px-1.5 text-sm font-semibold text-text-2"
          title={t('manage.cat.position', { n: position })}
        >
          <span className="sr-only">{t('manage.cat.position', { n: position })}</span>
          <span aria-hidden="true">{position}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={cx('break-words text-lg leading-snug', hidden && 'text-text-2')}>{primary}</h2>
          {other ? (
            <p className="break-words text-sm text-text-2">
              <bdi lang={lang === 'ar' ? 'en' : 'ar'}>{other}</bdi>
            </p>
          ) : null}
        </div>
        <Toggle
          checked={!hidden}
          onChange={(on) => onHidden(style, !on)}
          label={named(t('manage.cat.visible'))}
          className="!w-auto shrink-0 !gap-2 text-sm [&_span.text-base]:text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pt-2">
        {signature ? (
          <Chip size="sm" tone="info" icon="star-line">
            {t('manage.cat.signature')}
          </Chip>
        ) : null}
        {hidden ? (
          <Chip size="sm" tone="warn" icon="eye">
            {t('manage.cat.hiddenBadge')}
          </Chip>
        ) : null}
        <Chip size="sm" icon="ruler">
          {t(lengthLabelKey(lengthClassOf(style)))}
        </Chip>
        <Chip size="sm" icon="clock">
          {trimLabel(t, style.trimDays)}
        </Chip>
        <Chip size="sm" icon="face" className="max-w-full">
          {facesText(t, style.faces)}
        </Chip>
      </div>
      {signature && baseName ? <p className="px-4 pt-2 text-xs text-text-2">{t('manage.cat.basedOn', { name: baseName })}</p> : null}

      <div className="mt-3 border-t border-line px-4 py-3">
        <ChipRow
          label={named(t('manage.cat.localFit'))}
          options={fitOptions}
          value={FIT_VALUES.includes(fit) ? fit : null}
          onChange={(v) => onFit(style, v)}
        />
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <IconButton
          icon="chevron-up"
          label={t('manage.cat.moveUp', { name: primary })}
          onClick={() => onMove(style, -1)}
          disabled={!canUp}
          data-move="up"
          tone="bordered"
        />
        <IconButton
          icon="chevron-down"
          label={t('manage.cat.moveDown', { name: primary })}
          onClick={() => onMove(style, 1)}
          disabled={!canDown}
          data-move="down"
          tone="bordered"
        />
        <div className="min-w-0 flex-1" />
        {signature ? (
          <Button variant="ghost" size="sm" icon="edit" onClick={() => onEdit(style)} data-action="edit">
            {t('common.edit')}
            <span className="sr-only">: {primary}</span>
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" icon="copy" onClick={() => onClone(style)} data-action="clone">
          {t('manage.cat.clone')}
          <span className="sr-only">: {primary}</span>
        </Button>
      </div>
    </li>
  );
}

export default memo(StyleRow);
