// CSV import with a preview table; bad rows marked in --risk, only valid rows import.
import { useState } from 'react';
import Button from './Button.jsx';
import Icon from './Icon.jsx';
import { useT } from '../lib/i18n/useT.js';

export default function CsvImport({ title, template, validate, columns, onImport, note }) {
  const { t } = useT();
  const [res, setRes] = useState(null);
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const text = await f.text();
    setRes(validate(text));
  };
  return (
    <section className="card p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">{title}</h2>
        <a href={template} download className="press inline-flex min-h-tap items-center gap-2 rounded-control px-3 text-sm font-semibold text-plum">
          <Icon name="download" size={18} />
          {t('csv.template')}
        </a>
      </div>
      {note ? <p className="mb-3 text-sm text-ink2">{note}</p> : null}
      <label className="press flex min-h-btn2 cursor-pointer items-center justify-center gap-2 rounded-control border border-line bg-surface font-medium">
        <Icon name="upload" />
        {t('csv.choose')}
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
      </label>
      {res?.error === 'header' ? <p className="mt-3 text-sm text-risk">{t('csv.badHeader', { cols: res.missing.join(', ') })}</p> : null}
      {res && !res.error ? (
        <div className="mt-4">
          <p className="num mb-2 text-sm">
            {t('csv.summary', { ok: res.valid.length, bad: res.invalid.length })}
            {res.duplicates?.length ? ` · ${t('csv.dupes', { n: res.duplicates.length })}` : ''}
          </p>
          <div className="max-h-[40vh] overflow-auto rounded-control border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface2">
                <tr>
                  <th className="p-2 text-start">#</th>
                  {columns.map((c) => (
                    <th key={c} className="p-2 text-start font-medium">{c}</th>
                  ))}
                  <th className="p-2 text-start">{t('csv.status')}</th>
                </tr>
              </thead>
              <tbody>
                {res.invalid.map((r) => (
                  <tr key={`b${r.line}`} className="border-t border-line text-risk">
                    <td className="num p-2">{r.line}</td>
                    {columns.map((c) => (
                      <td key={c} className="p-2">{r.row[c]}</td>
                    ))}
                    <td className="p-2">{r.reasons.map((x) => t(x)).join(' · ')}</td>
                  </tr>
                ))}
                {(res.duplicates || []).map((r) => (
                  <tr key={`d${r.line}`} className="border-t border-line text-warn">
                    <td className="num p-2">{r.line}</td>
                    {columns.map((c) => (
                      <td key={c} className="p-2">{r.row[c]}</td>
                    ))}
                    <td className="p-2">{t('csv.duplicate')}</td>
                  </tr>
                ))}
                {res.valid.slice(0, 50).map((r, i) => (
                  <tr key={`v${i}`} className="border-t border-line">
                    <td className="p-2 text-ok"><Icon name="check" size={16} /></td>
                    {columns.map((c) => (
                      <td key={c} className="p-2">{String(r[c] ?? '')}</td>
                    ))}
                    <td className="p-2 text-ok">{t('csv.ok')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Button icon="check" disabled={!res.valid.length} onClick={() => { onImport(res.valid); setRes(null); }}>
              {t('csv.import', { n: res.valid.length })}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
