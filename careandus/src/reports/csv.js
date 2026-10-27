// CSV import/export (PRD 11.3). UTF-8 with or without BOM in; UTF-8 with BOM out (for Excel).
import { PRODUCT_CATEGORIES } from '../services/schema.js';

/** RFC 4180-style parser: quotes, escaped quotes, commas and newlines inside quotes, CRLF, BOM. */
export function parseCsv(text) {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

export function toObjects(rows) {
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r, i) => {
    const o = { _line: i + 2 };
    header.forEach((h, j) => {
      o[h] = (r[j] ?? '').trim();
    });
    return o;
  });
  return { header, records };
}

const BOOL_TRUE = new Set(['1', 'true', 'yes', 'y', 'نعم', 'active', 'on']);
const BOOL_FALSE = new Set(['0', 'false', 'no', 'n', 'لا', 'inactive', 'off']);

export function parseBool(v, dflt = true) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return dflt;
  if (BOOL_TRUE.has(s)) return true;
  if (BOOL_FALSE.has(s)) return false;
  return null;
}

function checkHeader(header, required) {
  const missing = required.filter((h) => !header.includes(h));
  return missing.length ? missing : null;
}

/** products: name,nameAr,category,priceOmr,active */
export function validateProducts(text) {
  const { header, records } = toObjects(parseCsv(text));
  const missing = checkHeader(header, ['name', 'nameAr', 'category', 'priceOmr', 'active']);
  if (missing) return { error: 'header', missing, valid: [], invalid: [] };
  const valid = [];
  const invalid = [];
  for (const r of records) {
    const reasons = [];
    if (!r.name && !r.nameAr) reasons.push('csv.err.name');
    const cat = r.category.toLowerCase();
    if (!PRODUCT_CATEGORIES.includes(cat)) reasons.push('csv.err.category');
    const priceStr = r.priceOmr.replace(/[^\d.,-]/g, '').replace(',', '.');
    const price = Number(priceStr);
    if (priceStr === '' || !Number.isFinite(price) || price < 0) reasons.push('csv.err.price');
    else if (!/^\d+(\.\d{1,3})?$/.test(priceStr)) reasons.push('csv.err.decimals');
    const active = parseBool(r.active, true);
    if (active === null) reasons.push('csv.err.active');
    if (reasons.length) invalid.push({ line: r._line, row: r, reasons });
    else valid.push({ name: r.name, nameAr: r.nameAr, category: cat, priceOmr: Math.round(price * 1000) / 1000, active });
  }
  return { valid, invalid };
}

/** swatches: line,code,level,tone */
export function validateSwatches(text, tones) {
  const { header, records } = toObjects(parseCsv(text));
  const missing = checkHeader(header, ['line', 'code', 'level', 'tone']);
  if (missing) return { error: 'header', missing, valid: [], invalid: [] };
  const valid = [];
  const invalid = [];
  for (const r of records) {
    const reasons = [];
    if (!r.line) reasons.push('csv.err.line');
    if (!r.code || r.code.length > 24) reasons.push('csv.err.code');
    const lv = Number(r.level);
    if (!Number.isInteger(lv) || lv < 1 || lv > 12) reasons.push('csv.err.level');
    const tone = r.tone.toLowerCase();
    if (!tones.includes(tone)) reasons.push('csv.err.tone');
    if (reasons.length) invalid.push({ line: r._line, row: r, reasons });
    else valid.push({ line: r.line, code: r.code, level: lv, tone });
  }
  return { valid, invalid };
}

/** Oman mobile/landline: +968 and 8 digits. Accepts 968xxxxxxxx, 00968..., or 8 local digits. */
export function normalizeOmanPhone(v) {
  const digits = String(v || '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  let d = digits.replace(/^\+/, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = `968${d}`;
  if (/^968\d{8}$/.test(d)) return `+${d}`;
  return undefined; // invalid
}

/** clients: displayName,phone. Duplicates (same phone or same name without phone) skipped and listed. */
export function validateClients(text, existing = []) {
  const { header, records } = toObjects(parseCsv(text));
  const missing = checkHeader(header, ['displayName', 'phone']);
  if (missing) return { error: 'header', missing, valid: [], invalid: [], duplicates: [] };
  const seenPhones = new Set(existing.map((c) => c.phone).filter(Boolean));
  const seenNames = new Set(existing.filter((c) => !c.phone).map((c) => c.displayName.trim().toLowerCase()));
  const valid = [];
  const invalid = [];
  const duplicates = [];
  for (const r of records) {
    const reasons = [];
    if (!r.displayName || r.displayName.length > 80) reasons.push('csv.err.name');
    const phone = normalizeOmanPhone(r.phone);
    if (phone === undefined) reasons.push('csv.err.phone');
    if (reasons.length) {
      invalid.push({ line: r._line, row: r, reasons });
      continue;
    }
    const dupKey = phone || r.displayName.trim().toLowerCase();
    if ((phone && seenPhones.has(phone)) || (!phone && seenNames.has(dupKey))) {
      duplicates.push({ line: r._line, row: r });
      continue;
    }
    if (phone) seenPhones.add(phone);
    else seenNames.add(dupKey);
    valid.push({ displayName: r.displayName, phone });
  }
  return { valid, invalid, duplicates };
}

function esc(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header, rows) {
  const lines = [header.map(esc).join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(filename, header, rows) {
  const blob = new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
