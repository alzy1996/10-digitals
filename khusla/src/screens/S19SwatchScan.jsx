import { useEffect, useMemo, useRef, useState } from 'react';
import OwnerLayout from '../components/OwnerLayout.jsx';
import Button from '../components/Button.jsx';
import Chip, { ChipRow, Tag } from '../components/Chip.jsx';
import Sheet from '../components/Sheet.jsx';
import SwatchChip from '../components/SwatchChip.jsx';
import CsvImport from '../components/CsvImport.jsx';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useLive } from '../hooks/useLive.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { createLine, watchSwatches, saveSwatch, deleteSwatch, importSwatches } from '../services/swatches.js';
import { decodeToCanvas, canvasToImg, cardGains, measureRegion, repeatability, labToHex } from '../ai/index.js';
import { validateSwatches } from '../reports/csv.js';
import tones from '../data/tones.json';

export default function S19SwatchScan() {
  const { t, name } = useT();
  const app = useApp();
  const snack = useSnackbar();
  const [lineId, setLineId] = useState(null);
  const [newName, setNewName] = useState('');
  const [photo, setPhoto] = useState(null); // {canvas, img, url}
  const [gains, setGains] = useState(null);
  const [grid, setGrid] = useState({ rows: 3, cols: 4 });
  const [light, setLight] = useState('salon');
  const [form, setForm] = useState(null);
  const [camera, setCamera] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [swatches] = useLive(lineId ? (cb) => watchSwatches(app.salonId, lineId, cb) : null, [app.salonId, lineId], []);
  const line = app.lines.find((l) => l.id === lineId);

  useEffect(() => () => streamRef.current?.getTracks().forEach((tr) => tr.stop()), []);

  const loadBlob = async (blob) => {
    const canvas = await decodeToCanvas(blob, 1600);
    setPhoto({ canvas, img: canvasToImg(canvas), url: canvas.toDataURL('image/jpeg', 0.9) });
    setGains(null);
  };

  const openCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
      streamRef.current = s;
      setCamera(true);
      setTimeout(() => {
        videoRef.current.srcObject = s;
        videoRef.current.play();
      }, 0);
    } catch {
      snack.show({ message: t('capture.cameraError'), tone: 'risk' });
    }
  };
  const shoot = async () => {
    const v = videoRef.current;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    setCamera(false);
    loadBlob(await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95)));
  };

  const onTap = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const W = photo.img.width;
    const H = photo.img.height;
    if (!gains) {
      const g = cardGains(photo.img, { x: fx * W, y: fy * H });
      setGains(g.gains);
      snack.show({ message: t('swatch.cardSet') });
      return;
    }
    const col = Math.min(grid.cols - 1, Math.floor(fx * grid.cols));
    const row = Math.min(grid.rows - 1, Math.floor(fy * grid.rows));
    const cw = W / grid.cols;
    const ch = H / grid.rows;
    const rect = { x: col * cw + cw * 0.3, y: row * ch + ch * 0.25, w: cw * 0.4, h: ch * 0.5 };
    const lab = measureRegion(photo.img, rect, gains);
    setForm({ code: '', level: 6, tone: 'natural', labMeasured: lab, cell: `${row + 1}-${col + 1}` });
  };

  const previous = useMemo(() => (form?.code ? (swatches || []).find((s) => s.code.trim().toLowerCase() === form.code.trim().toLowerCase()) : null), [form, swatches]);

  const save = () => {
    const base = previous ? { ...previous } : {};
    saveSwatch(app.salonId, lineId, { ...base, code: form.code, level: form.level, tone: form.tone, labMeasured: form.labMeasured, light });
    if (previous?.labMeasured) snack.show({ message: t('swatch.repeat', { de: repeatability(previous.labMeasured, form.labMeasured).toFixed(1) }) });
    else snack.show({ message: t('common.saved') });
    setForm(null);
  };

  if (!lineId) {
    return (
      <OwnerLayout title={t('swatch.title')}>
        <p className="mb-4 max-w-[60ch] text-ink2">{t('swatch.lead')}</p>
        <div className="mb-6 flex max-w-[560px] gap-2">
          <input className="field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('swatch.lineName')} aria-label={t('swatch.lineName')} />
          <Button full={false} icon="plus" disabled={!newName.trim()} onClick={() => { const id = createLine(app.salonId, newName); setNewName(''); setLineId(id); }}>
            {t('swatch.newLine')}
          </Button>
        </div>
        {app.lines.length ? (
          <ul className="mb-8 grid gap-3 tablet:grid-cols-2">
            {app.lines.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => setLineId(l.id)} className="press card flex min-h-[72px] w-full items-center gap-3 p-4 text-start">
                  <Icon name="swatch" className="text-clay" />
                  <span className="flex-1 font-medium">{l.name}</span>
                  <Icon name="chevron" className="text-ink2 rtl:-scale-x-100" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="swatch" title={t('swatch.noLines')} body={t('swatch.noLinesBody')} />
        )}
        <CsvImport
          title={t('swatch.importTitle')}
          template="/templates/swatches-template.csv"
          columns={['line', 'code', 'level', 'tone']}
          note={t('swatch.importNote')}
          validate={(text) => validateSwatches(text, tones.map((x) => x.id))}
          onImport={(rows) => { importSwatches(app.salonId, rows, app.lines); snack.show({ message: t('csv.imported', { n: rows.length }) }); }}
        />
      </OwnerLayout>
    );
  }

  return (
    <OwnerLayout title={line?.name || t('swatch.title')} actions={<Button full={false} variant="ghost" icon="back" onClick={() => { setLineId(null); setPhoto(null); }}>{t('swatch.lines')}</Button>}>
      <div className="desk:grid desk:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] desk:gap-6">
        <section>
          {!photo && !camera ? (
            <div className="card p-5">
              <h2 className="text-lg">{t('swatch.scanTitle')}</h2>
              <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-ink2">
                <li>{t('swatch.step1')}</li>
                <li>{t('swatch.step2')}</li>
                <li>{t('swatch.step3')}</li>
              </ol>
              <ChipRow label={t('swatch.light')} value={light} onChange={setLight} options={[{ value: 'daylight', label: t('light.daylight') }, { value: 'salon', label: t('light.salon') }]} />
              <div className="grid grid-cols-2 gap-2">
                <Button icon="camera" onClick={openCamera}>{t('swatch.camera')}</Button>
                <label className="press flex min-h-btn cursor-pointer items-center justify-center gap-2 rounded-control border border-line bg-surface font-medium">
                  <Icon name="upload" />
                  {t('capture.upload')}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && loadBlob(e.target.files[0])} />
                </label>
              </div>
            </div>
          ) : null}
          {camera ? (
            <div className="card overflow-hidden">
              <video ref={videoRef} playsInline muted className="block w-full" />
              <div className="p-3">
                <Button icon="camera" onClick={shoot}>{t('swatch.shoot')}</Button>
              </div>
            </div>
          ) : null}
          {photo ? (
            <div>
              <p className={`mb-2 text-sm font-semibold ${gains ? 'text-ok' : 'text-warn'}`}>{gains ? t('swatch.tapSwatch') : t('swatch.tapCard')}</p>
              <div className="relative select-none overflow-hidden rounded-card" onClick={onTap}>
                <img src={photo.url} alt="" className="block w-full" draggable={false} />
                {gains ? (
                  <svg viewBox={`0 0 ${grid.cols} ${grid.rows}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                    {Array.from({ length: grid.cols - 1 }).map((_, i) => (
                      <line key={`c${i}`} x1={i + 1} x2={i + 1} y1="0" y2={grid.rows} stroke="#FBF8F4" strokeWidth="0.015" />
                    ))}
                    {Array.from({ length: grid.rows - 1 }).map((_, i) => (
                      <line key={`r${i}`} y1={i + 1} y2={i + 1} x1="0" x2={grid.cols} stroke="#FBF8F4" strokeWidth="0.015" />
                    ))}
                  </svg>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {['rows', 'cols'].map((k) => (
                  <span key={k} className="flex items-center gap-1">
                    <span className="label">{t(`swatch.${k}`)}</span>
                    {[2, 3, 4, 5, 6].map((n) => (
                      <Chip key={n} selected={grid[k] === n} onClick={() => setGrid({ ...grid, [k]: n })}>{n}</Chip>
                    ))}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" icon="refresh" onClick={() => setGains(null)}>{t('swatch.recalibrate')}</Button>
                <Button variant="secondary" icon="camera" onClick={() => setPhoto(null)}>{t('swatch.newPhoto')}</Button>
              </div>
            </div>
          ) : null}
        </section>
        <section className="mt-6 desk:mt-0">
          <h2 className="mb-3 text-lg">{t('swatch.inLine', { n: (swatches || []).length })}</h2>
          {(swatches || []).length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {(swatches || []).map((s) => {
                const linked = app.catalog.shades.filter((sh) => sh.swatchRef === `${lineId}/${s.id}`);
                return (
                  <li key={s.id} className="flex items-center gap-3 p-3">
                    <SwatchChip color={s.labMeasured ? labToHex(s.labMeasured) : '#d9d4ce'} size={40} label={s.code} />
                    <div className="flex-1">
                      <div className="num font-semibold">{s.code}</div>
                      <div className="text-xs text-ink2">
                        {t('color.levelShort', { n: s.level })} · {name(tones.find((x) => x.id === s.tone)?.name) || s.tone}
                        {s.labMeasured ? ` · L ${s.labMeasured[0]}` : ` · ${t('catalog.notScanned')}`}
                      </div>
                      {linked.length ? <div className="text-xs text-ok">{linked.map((x) => name(x.name)).join(', ')}</div> : null}
                    </div>
                    <button type="button" aria-label={t('common.delete')} className="press grid min-h-tap min-w-tap place-items-center rounded-full text-risk" onClick={() => deleteSwatch(app.salonId, lineId, s.id)}>
                      <Icon name="trash" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon="swatch" title={t('swatch.empty')} />
          )}
          <p className="mt-3 text-xs text-ink2">{t('swatch.linkHint')}</p>
        </section>
      </div>

      <Sheet open={Boolean(form)} modal onClose={() => setForm(null)} title={t('swatch.saveTitle', { cell: form?.cell || '' })}>
        {form ? (
          <div className="max-h-[70vh] overflow-y-auto pb-2">
            <div className="mb-4 flex items-center gap-3">
              <SwatchChip color={labToHex(form.labMeasured)} size={56} label="" />
              <div className="num text-sm text-ink2">L* {form.labMeasured[0]} · a* {form.labMeasured[1]} · b* {form.labMeasured[2]}</div>
            </div>
            <label className="label mb-1 block" htmlFor="sw-code">{t('swatch.code')}</label>
            <input id="sw-code" dir="ltr" className="field mb-1" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} autoFocus />
            {previous ? (
              <p className="mb-3 text-xs text-warn">
                {t('swatch.existing')}
                {previous.labMeasured ? ` · ΔE ${repeatability(previous.labMeasured, form.labMeasured).toFixed(1)}` : ''}
              </p>
            ) : (
              <p className="mb-3 text-xs text-ink2">{t('swatch.codeHint')}</p>
            )}
            <div className="label mb-2">{t('swatch.level')}</div>
            <div className="mb-4 flex flex-wrap gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <Chip key={n} selected={form.level === n} onClick={() => setForm({ ...form, level: n })}>{n}</Chip>
              ))}
            </div>
            <div className="label mb-2">{t('swatch.tone')}</div>
            <div className="mb-5 flex flex-wrap gap-2">
              {tones.map((x) => (
                <Chip key={x.id} selected={form.tone === x.id} onClick={() => setForm({ ...form, tone: x.id })}>{name(x.name)}</Chip>
              ))}
            </div>
            <Button icon="check" disabled={!form.code.trim()} onClick={save}>{t('common.save')}</Button>
            {previous?.labMeasured ? <Tag tone="neutral">{t('swatch.repeatTarget')}</Tag> : null}
          </div>
        ) : null}
      </Sheet>
    </OwnerLayout>
  );
}
