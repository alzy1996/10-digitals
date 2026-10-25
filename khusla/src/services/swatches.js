// Swatch Scan storage (PRD 8.4): the salon's own lines and codes; nothing is preloaded.
import { collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, created, updated, snapList, newId, uid } from './base.js';
import { logAudit } from './audit.js';

export function watchLines(salonId, cb) {
  return onSnapshot(collection(db, 'salons', salonId, 'swatchLines'), (s) => cb(snapList(s)), () => cb([]));
}

export function watchSwatches(salonId, lineId, cb) {
  return onSnapshot(collection(db, 'salons', salonId, 'swatchLines', lineId, 'swatches'), (s) => cb(snapList(s).map((x) => ({ ...x, lineId }))), () => cb([]));
}

/** All swatches of all lines, keyed `${lineId}/${swatchId}` (the shade.swatchRef format). */
export function watchAllSwatches(salonId, lines, cb) {
  const byLine = {};
  const unsubs = lines.map((l) =>
    watchSwatches(salonId, l.id, (list) => {
      byLine[l.id] = list;
      const all = {};
      for (const [lineId, items] of Object.entries(byLine)) for (const sw of items) all[`${lineId}/${sw.id}`] = { ...sw, lineName: lines.find((x) => x.id === lineId)?.name };
      cb(all);
    }),
  );
  if (!lines.length) cb({});
  return () => unsubs.forEach((u) => u());
}

export function createLine(salonId, name) {
  const id = newId('ln');
  fire(setDoc(doc(db, 'salons', salonId, 'swatchLines', id), { name: name.trim(), ...created() }), 'swatchLine');
  logAudit(salonId, 'swatchLine.create', `salons/${salonId}/swatchLines/${id}`, { name: [null, name] });
  return id;
}

export function saveSwatch(salonId, lineId, swatch) {
  const id = swatch.id || newId('sw');
  const base = swatch.id ? { createdAt: swatch.createdAt, createdBy: swatch.createdBy, ...updated() } : created();
  const data = {
    code: String(swatch.code).trim().slice(0, 24),
    level: Number(swatch.level),
    tone: swatch.tone,
    labMeasured: swatch.labMeasured || null,
    scannedAt: swatch.labMeasured ? serverTimestamp() : swatch.scannedAt || null,
    scannedBy: swatch.labMeasured ? uid() : swatch.scannedBy || null,
    light: swatch.light || null,
    ...base,
  };
  fire(setDoc(doc(db, 'salons', salonId, 'swatchLines', lineId, 'swatches', id), data), 'swatch');
  logAudit(salonId, swatch.id ? 'swatch.update' : 'swatch.create', `salons/${salonId}/swatchLines/${lineId}/swatches/${id}`, { code: [null, data.code] });
  return id;
}

export function deleteSwatch(salonId, lineId, id) {
  fire(deleteDoc(doc(db, 'salons', salonId, 'swatchLines', lineId, 'swatches', id)), 'swatch');
  logAudit(salonId, 'swatch.delete', `salons/${salonId}/swatchLines/${lineId}/swatches/${id}`, {});
}

/** CSV pre-create: rows {line, code, level, tone}; lines are created by name when missing. */
export async function importSwatches(salonId, rows, lines) {
  const lineIds = Object.fromEntries(lines.map((l) => [l.name.trim().toLowerCase(), l.id]));
  const batch = writeBatch(db);
  for (const r of rows) {
    const key = r.line.trim().toLowerCase();
    if (!lineIds[key]) {
      const id = newId('ln');
      lineIds[key] = id;
      batch.set(doc(db, 'salons', salonId, 'swatchLines', id), { name: r.line.trim(), ...created() });
    }
    batch.set(doc(db, 'salons', salonId, 'swatchLines', lineIds[key], 'swatches', newId('sw')), {
      code: r.code,
      level: r.level,
      tone: r.tone,
      labMeasured: null,
      scannedAt: null,
      scannedBy: null,
      light: null,
      ...created(),
    });
  }
  fire(batch.commit(), 'swatchImport');
  logAudit(salonId, 'swatch.import', `salons/${salonId}/swatchLines`, { rows: [null, String(rows.length)] });
}
