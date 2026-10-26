// Clients CSV import (S20, PRD 11.3 "Import clients (optional)"): pick a CSV with the columns
// displayName,phone -> the shop's client phones are read (listClients) -> parseClientsCsv
// preview: rows with a problem and phones already in the shop (or repeated in the file) in the
// cut colour with their reasons -> "Import N clients" -> importClients -> a summary that lists
// every skipped row. The writes queue offline like every other write (services/sync.js).

import { useMemo, useRef, useState } from 'react';
import { importClients, listClients } from '../../services/clients.js';
import { CLIENT_COLUMNS, csvBlob, downloadBlob, parseClientsCsv, toCsv } from '../../reports/csv.js';
import { useOnline } from '../../hooks/useOnline.js';
import Button from '../../components/Button.jsx';
import ChipRow from '../../components/ChipRow.jsx';
import Icon from '../../components/Icon.jsx';
import { cx } from '../../components/kit.js';
import { useSnackbar } from '../../components/Snackbar.jsx';
import { Note, Section } from './ui.jsx';
import { clientImportView, clientPhones, isCsvFile } from './util.js';

const MAX_PREVIEW = 300;
const TEMPLATE_NAME = 'lihya-clients-template.csv';

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

/** One file row: row number, name, phone, and the reasons it will be skipped (cut colour). */
function RowItem({ row, name, phone, ok, skipped, reasons, t }) {
  return (
    <li className={cx('flex items-start gap-3 rounded-ctl border p-3', ok ? 'border-line bg-surface' : 'border-cut/60 bg-cut/10')}>
      <span
        className={cx(
          'num mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold',
          ok ? 'border-line text-text-2' : 'border-cut/60 text-cut',
        )}
      >
        {t('owner.cimp.row', { n: row })}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cx('break-words font-medium', !name && 'text-text-2')}>
          <bdi>{name || t('owner.cimp.noName')}</bdi>
        </p>
        {phone ? (
          <p className="num break-all text-sm text-text-2">
            <bdi dir="ltr">{phone}</bdi>
          </p>
        ) : null}
        {!ok ? (
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-cut">
            {reasons.map((r) => (
              <li key={r}>{t(r)}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <Icon
        name={ok ? 'check' : skipped ? 'copy' : 'warning'}
        size={20}
        className={cx('mt-0.5 shrink-0', ok ? 'text-keep' : 'text-cut')}
        title={ok ? t('owner.cimp.ok') : t('owner.cimp.skip')}
      />
    </li>
  );
}

/** "Import clients" card for S20 (owner and manager). */
export default function ClientImport({ shopId, t }) {
  const { show } = useSnackbar();
  const online = useOnline();
  const [state, setState] = useState(null); // { phase: 'reading'|'error'|'parsed'|'done', ... }
  const inputRef = useRef(null);
  const readSeq = useRef(0);
  // The parse result already imported: a second tap on Import (or a double tap) does nothing.
  const importedRef = useRef(null);

  const parsed = state && state.phase === 'parsed' ? state.parsed : null;
  const view = useMemo(() => (parsed ? clientImportView(parsed, state.filter) : null), [parsed, state]);

  const choose = () => inputRef.current && inputRef.current.click();

  const pick = async (file) => {
    const seq = ++readSeq.current;
    importedRef.current = null;
    if (!isCsvFile(file)) {
      setState({ phase: 'error', titleKey: 'owner.cimp.readFailed.title', messageKey: 'owner.cimp.notCsv' });
      return;
    }
    setState({ phase: 'reading', file: file.name });
    let text;
    try {
      text = await file.text();
    } catch (err) {
      console.error('clients CSV read failed', err);
      if (seq === readSeq.current) setState({ phase: 'error', titleKey: 'owner.cimp.readFailed.title', messageKey: 'owner.cimp.readFailed.body' });
      return;
    }
    let clients;
    try {
      clients = await listClients(shopId);
    } catch (err) {
      console.error('clients for the import check could not be read', err);
      if (seq === readSeq.current) setState({ phase: 'error', titleKey: 'owner.cimp.clientsFailed.title', messageKey: 'owner.cimp.clientsFailed.body' });
      return;
    }
    if (seq !== readSeq.current) return;
    setState({
      phase: 'parsed',
      file: file.name,
      parsed: parseClientsCsv(text, clientPhones(clients)),
      filter: 'all',
      garbled: text.includes('�'),
      offline: !online,
    });
  };

  const runImport = () => {
    if (!parsed || !parsed.rows.length || importedRef.current === parsed) return;
    importedRef.current = parsed;
    let res;
    try {
      res = importClients(
        shopId,
        parsed.rows.map((r) => ({ displayName: r.displayName, phone: r.phone })),
      );
    } catch (err) {
      importedRef.current = null;
      console.error('clients import failed', err);
      show({ message: t('owner.cimp.failed') });
      return;
    }
    setState({
      phase: 'done',
      file: state.file,
      imported: res.imported,
      // Rows the service itself refused (it re-checks names and phones) count as problems.
      refused: res.skipped,
      duplicates: parsed.skipped,
      problems: parsed.errors,
    });
    show({ message: t('owner.cimp.doneMsg', { n: res.imported }) });
  };

  const reset = () => {
    readSeq.current += 1;
    importedRef.current = null;
    setState(null);
  };

  const downloadTemplate = () => {
    if (!downloadBlob(csvBlob(toCsv([], CLIENT_COLUMNS)), TEMPLATE_NAME)) show({ message: t('owner.rep.csv.failed') });
  };

  let body = null;
  if (state && state.phase === 'reading') {
    body = (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm text-text-2">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-brass motion-reduce:animate-none" />
          <span className="min-w-0 break-words">{t('owner.cimp.reading', { file: state.file })}</span>
        </p>
        <div aria-hidden="true" className="skeleton h-14 rounded-ctl" />
        <div aria-hidden="true" className="skeleton h-14 rounded-ctl" />
      </div>
    );
  } else if (state && state.phase === 'error') {
    body = (
      <Note tone="cut" role="alert" title={t(state.titleKey)}>
        {t(state.messageKey)}
      </Note>
    );
  } else if (view && view.headerError) {
    body = (
      <Note tone="cut" role="alert" title={t('report.csv.reason.header')}>
        {t('owner.cimp.headerHelp')}
      </Note>
    );
  } else if (view && view.empty) {
    body = (
      <Note tone="warn" role="alert" title={t('report.csv.empty')}>
        {t('owner.cimp.headerHelp')}
      </Note>
    );
  } else if (view) {
    const { counts } = view;
    const skippedCount = counts.duplicates + counts.problems;
    const ready = counts.ready;
    body = (
      <div className="flex flex-col gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm text-text-2">
          <Icon name="report" size={18} className="shrink-0" />
          <bdi className="truncate">{state.file}</bdi>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Tile label={t('owner.cimp.rows')} value={counts.total} />
          <Tile label={t('owner.cimp.ready')} value={ready} tone={ready ? 'text-keep' : 'text-text-2'} />
          <Tile label={t('owner.cimp.duplicates')} value={counts.duplicates} tone={counts.duplicates ? 'text-cut' : 'text-text-2'} />
          <Tile label={t('owner.cimp.problems')} value={counts.problems} tone={counts.problems ? 'text-cut' : 'text-text-2'} />
        </div>
        {view.noHeader ? (
          <Note tone="warn" title={t('owner.cimp.noHeader')}>
            {t('owner.cimp.headerHelp')}
          </Note>
        ) : null}
        {state.garbled ? (
          <Note tone="warn" title={t('owner.cimp.garbled.title')}>
            {t('owner.cimp.garbled.body')}
          </Note>
        ) : null}
        {state.offline ? <Note tone="warn">{t('owner.cimp.offline')}</Note> : null}
        {skippedCount ? (
          <ChipRow
            label={t('owner.cimp.show')}
            value={state.filter}
            onChange={(filter) => setState((s) => (s && s.phase === 'parsed' ? { ...s, filter } : s))}
            options={[
              { value: 'all', label: t('owner.cimp.showAll') },
              { value: 'skipped', label: t('owner.cimp.showSkipped'), tone: 'cut' },
            ]}
          />
        ) : null}
        <ul className="flex flex-col gap-2" aria-label={t('owner.cimp.previewLabel')}>
          {view.preview.slice(0, MAX_PREVIEW).map((item) => (
            <RowItem
              key={item.row}
              row={item.row}
              name={item.values.displayName}
              phone={item.values.phone}
              ok={item.ok}
              skipped={item.skipped}
              reasons={item.reasons}
              t={t}
            />
          ))}
        </ul>
        {view.preview.length > MAX_PREVIEW ? (
          <p className="text-sm text-text-2">{t('owner.cimp.more', { n: view.preview.length - MAX_PREVIEW })}</p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button variant="secondary" icon="upload" full onClick={runImport} disabled={!ready}>
            {ready === 1 ? t('owner.cimp.importOne') : ready ? t('owner.cimp.importN', { n: ready }) : t('owner.cimp.none')}
          </Button>
          <Button variant="ghost" icon="close" onClick={reset} className="self-start">
            {t('owner.cimp.cancel')}
          </Button>
        </div>
      </div>
    );
  } else if (state && state.phase === 'done') {
    const skippedRows = [
      ...state.duplicates.map((d) => ({ row: d.row, name: d.displayName, phone: d.phone, reasons: [d.reason], skipped: true })),
      ...state.problems.map((e) => ({ row: e.row, name: e.values.displayName, phone: e.values.phone, reasons: e.reasons, skipped: false })),
    ].sort((a, b) => a.row - b.row);
    const skippedTotal = skippedRows.length + (Number(state.refused) || 0);
    body = (
      <div role="status" className="flex flex-col gap-3">
        <Note tone="keep" title={t('owner.cimp.doneTitle')}>
          {t('owner.cimp.doneBody', { n: state.imported })}
        </Note>
        <div className="grid grid-cols-2 gap-2">
          <Tile label={t('owner.cimp.added')} value={state.imported} tone="text-keep" />
          <Tile label={t('owner.cimp.skipped')} value={skippedTotal} tone={skippedTotal ? 'text-cut' : 'text-text-2'} />
        </div>
        {skippedRows.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-semibold">{t('owner.cimp.skippedList')}</h3>
            <ul className="flex flex-col gap-2" aria-label={t('owner.cimp.skippedList')}>
              {skippedRows.slice(0, MAX_PREVIEW).map((r) => (
                <RowItem key={r.row} row={r.row} name={r.name} phone={r.phone} ok={false} skipped={r.skipped} reasons={r.reasons} t={t} />
              ))}
            </ul>
            {skippedRows.length > MAX_PREVIEW ? (
              <p className="text-sm text-text-2">{t('owner.cimp.more', { n: skippedRows.length - MAX_PREVIEW })}</p>
            ) : null}
          </div>
        ) : null}
        <div>
          <Button variant="secondary" icon="check" onClick={reset}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Section title={t('owner.cimp.title')} description={t('owner.cimp.sub')} icon="users" anchor="import-clients">
      <p className="text-sm text-text-2">
        {t('owner.cimp.columns')}{' '}
        <code dir="ltr" className="num inline-block max-w-full break-all rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs text-text">
          {CLIENT_COLUMNS.join(',')}
        </code>
      </p>
      <p className="text-sm text-text-2">{t('owner.cimp.columnsNote')}</p>
      {state && (state.phase === 'parsed' || state.phase === 'done') ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon="upload" onClick={choose} disabled={Boolean(state && state.phase === 'reading')}>
            {state && state.phase === 'error' ? t('owner.cimp.another') : t('owner.cimp.choose')}
          </Button>
          <Button variant="ghost" icon="download" onClick={downloadTemplate}>
            {t('owner.cimp.template')}
          </Button>
        </div>
      )}
      {state && state.phase === 'parsed' ? (
        <div>
          <Button variant="ghost" icon="upload" onClick={choose}>
            {t('owner.cimp.another')}
          </Button>
        </div>
      ) : null}
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
          if (file) pick(file);
        }}
      />
      {body}
    </Section>
  );
}
