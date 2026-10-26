// CSV import and export (PRD 11.3), all in the browser.
// - parseCsv: RFC 4180 (quoted fields with "" escapes, commas and newlines inside
//   quotes, CRLF / LF / CR line ends), UTF-8 with or without BOM, Arabic text.
//   The delimiter is detected from the header line (comma, semicolon or tab: Excel
//   in some locales saves with semicolons).
// - parseProductsCsv / parseClientsCsv: validated rows plus errors with the row number
//   (as Excel shows it: the header is row 1) and reason keys for the preview table.
// - toCsv: UTF-8 with BOM and CRLF so Excel opens Arabic correctly; text cells that
//   start with = + - @ are prefixed with ' so a spreadsheet never runs them.
// Exports carry labels only (never photos, never raw face ratios).

import { normalizeOmanPhone, roundOmr } from '../lib/format.js';
import { formatMuscat, toDate, dayKey as muscatDayKey, dayKeysBetween } from '../lib/time.js';
import { translate, pickLang } from '../lib/i18n/useT.js';
import { filterConsultations, isApproved, productNameOf, staffNameOf, styleNameOf, summarizeConsultations } from './summary.js';
import { APP } from '../config/app.js';

export const BOM = '\uFEFF';
export const CSV_MIME = 'text/csv;charset=utf-8';
export const PRODUCT_COLUMNS = Object.freeze(['name', 'nameAr', 'category', 'priceOmr', 'active']);
export const PRODUCT_CATEGORIES = Object.freeze(['service', 'dye', 'oil', 'balm', 'other']);
export const CLIENT_COLUMNS = Object.freeze(['displayName', 'phone']);
export const PRICE_MAX_OMR = 100000;
const TEXT_MAX = 100;

/* ------------------------------------------------------------------ parsing */

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Delimiter of the first record (outside quotes): ',' unless the line has only ';' or tabs. */
export function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  if (counts[','] === 0 && counts[';'] > 0) return ';';
  if (counts[','] === 0 && counts[';'] === 0 && counts['\t'] > 0) return '\t';
  return ',';
}

/**
 * Parse CSV text into records (arrays of strings). A trailing line end does not add
 * an empty record. Fields keep their spaces; callers trim.
 */
export function parseCsv(text, { delimiter } = {}) {
  const src = stripBom(String(text ?? ''));
  if (!src) return [];
  const sep = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
      fieldStarted = false;
    } else if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStarted = false;
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (fieldStarted || field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const blankRecord = (rec) => rec.every((f) => String(f).trim() === '');

function headerKey(s) {
  return String(s ?? '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[\s_\-.()]/g, '');
}

function aliasesFor(field, extra = []) {
  const keys = new Set([headerKey(field), ...extra.map(headerKey)]);
  for (const lang of ['en', 'ar']) {
    const label = translate(lang, `report.csv.col.${field}`);
    if (label && !label.startsWith('report.')) keys.add(headerKey(label));
  }
  return keys;
}

const PRODUCT_ALIASES = {
  name: aliasesFor('name', ['nameEn', 'englishName', 'product', 'الاسم', 'الاسم بالإنجليزية']),
  nameAr: aliasesFor('nameAr', ['arabicName', 'nameArabic', 'الاسم بالعربية', 'الاسم العربي']),
  category: aliasesFor('category', ['type', 'الفئة', 'النوع']),
  priceOmr: aliasesFor('priceOmr', ['price', 'priceOMR', 'السعر', 'السعر ر.ع.']),
  active: aliasesFor('active', ['enabled', 'مفعل', 'مفعّل', 'نشط']),
};
const CLIENT_ALIASES = {
  displayName: aliasesFor('displayName', ['name', 'client', 'customer', 'الاسم', 'اسم العميل']),
  phone: aliasesFor('phone', ['mobile', 'whatsapp', 'tel', 'الهاتف', 'رقم الهاتف', 'الجوال', 'واتساب']),
};

/** Map header cells to fields; null when the first record is not a header. */
function readHeader(record, aliases) {
  const map = {};
  let hits = 0;
  record.forEach((cell, idx) => {
    const k = headerKey(cell);
    for (const [field, keys] of Object.entries(aliases)) {
      if (map[field] === undefined && keys.has(k)) {
        map[field] = idx;
        hits += 1;
        break;
      }
    }
  });
  return hits ? map : null;
}

function cleanText(v, max = TEXT_MAX) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const ARABIC_DIGITS = /[٠-٩]/g;
const PERSIAN_DIGITS = /[۰-۹]/g;

function latinDigits(s) {
  return s
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const CATEGORY_WORDS = {
  service: ['service', 'services', 'خدمة', 'خدمات'],
  dye: ['dye', 'color', 'colour', 'صبغة', 'صبغات', 'لون'],
  oil: ['oil', 'oils', 'زيت', 'زيوت'],
  balm: ['balm', 'balms', 'بلسم'],
  other: ['other', 'others', 'أخرى', 'اخرى', 'آخر'],
};

function parseCategory(raw) {
  const v = cleanText(raw).toLowerCase();
  for (const [id, words] of Object.entries(CATEGORY_WORDS)) if (words.includes(v)) return id;
  return null;
}

/**
 * Price in OMR: digits with at most 3 decimals ("1.5", "1.500", "١٫٥٠٠", "2 OMR",
 * "2 ر.ع."). Commas are rejected (thousands or decimal is ambiguous).
 * @returns {{ value: number|null, reason: string|null }}
 */
export function parsePriceOmr(raw) {
  let s = latinDigits(String(raw ?? '').trim()).replace(/٫/g, '.');
  if (!s) return { value: null, reason: 'priceRequired' };
  s = s.replace(/^(omr|ر\.?\s?ع\.?)\s*/i, '').replace(/\s*(omr|ر\.?\s?ع\.?)$/i, '').trim();
  if (/^-/.test(s)) return { value: null, reason: 'priceNegative' };
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return { value: null, reason: 'price' };
  const dec = s.includes('.') ? s.split('.')[1].length : 0;
  if (dec > 3) return { value: null, reason: 'priceDecimals' };
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, reason: 'price' };
  if (n > PRICE_MAX_OMR) return { value: null, reason: 'priceRange' };
  return { value: roundOmr(n), reason: null };
}

const TRUE_WORDS = ['true', '1', 'yes', 'y', 'on', 'نعم', 'مفعل', 'مفعّل'];
const FALSE_WORDS = ['false', '0', 'no', 'n', 'off', 'لا', 'غير مفعل', 'موقوف'];

/** active column: true/false/1/0/yes/no (and Arabic yes/no); empty means true. */
export function parseActive(raw) {
  const v = cleanText(raw).toLowerCase();
  if (!v) return { value: true, reason: null };
  if (TRUE_WORDS.includes(v)) return { value: true, reason: null };
  if (FALSE_WORDS.includes(v)) return { value: false, reason: null };
  return { value: null, reason: 'active' };
}

const reasonKey = (r) => `report.csv.reason.${r}`;

/**
 * Products CSV (columns name,nameAr,category,priceOmr,active). A file without a header
 * row is read in that column order.
 * @returns {{ rows: Array<{row, name, nameAr, category, priceOmr, active}>,
 *   errors: Array<{row, reasons: string[], values}>, preview: Array<{row, values, ok, reasons}>, total: number }}
 * rows are ready for importProducts(); `name` falls back to nameAr when only the Arabic name is given.
 */
export function parseProductsCsv(text) {
  const records = parseCsv(text);
  const out = { rows: [], errors: [], preview: [], total: 0 };
  if (!records.length) return out;
  let map = readHeader(records[0], PRODUCT_ALIASES);
  let first = 1;
  if (!map) {
    map = { name: 0, nameAr: 1, category: 2, priceOmr: 3, active: 4 };
    first = 0;
  } else if (map.category === undefined || map.priceOmr === undefined || (map.name === undefined && map.nameAr === undefined)) {
    out.errors.push({ row: 1, reasons: [reasonKey('header')], values: {} });
    return out;
  }
  const seen = new Set();
  for (let i = first; i < records.length; i++) {
    const rec = records[i];
    if (blankRecord(rec)) continue;
    const row = i + 1;
    const get = (f) => (map[f] === undefined ? '' : rec[map[f]] ?? '');
    const values = { name: cleanText(get('name')), nameAr: cleanText(get('nameAr')), category: cleanText(get('category')), priceOmr: cleanText(get('priceOmr')), active: cleanText(get('active')) };
    const reasons = [];
    if (!values.name && !values.nameAr) reasons.push('nameRequired');
    const category = parseCategory(values.category);
    if (!category) reasons.push('category');
    const price = parsePriceOmr(values.priceOmr);
    if (price.reason) reasons.push(price.reason);
    const active = parseActive(values.active);
    if (active.reason) reasons.push(active.reason);
    if (!reasons.length) {
      const key = `${category}|${(values.name || values.nameAr).toLowerCase()}`;
      if (seen.has(key)) reasons.push('duplicate');
      else seen.add(key);
    }
    out.total += 1;
    const keys = reasons.map(reasonKey);
    out.preview.push({ row, values, ok: !keys.length, reasons: keys });
    if (keys.length) {
      out.errors.push({ row, reasons: keys, values });
    } else {
      out.rows.push({
        row,
        name: values.name || values.nameAr,
        nameAr: values.nameAr,
        category,
        priceOmr: price.value,
        active: active.value,
      });
    }
  }
  return out;
}

/**
 * Clients CSV (columns displayName,phone). Phone must be an Oman number (+968 and 8
 * digits). Rows whose phone is already known (existingPhones) or repeats an earlier
 * row are skipped and listed.
 * @returns {{ rows: Array<{row, displayName, phone}>, skipped: Array<{row, displayName, phone, reason}>,
 *   errors: Array<{row, reasons, values}>, preview: Array<{row, values, ok, skipped, reasons}>, total: number }}
 */
export function parseClientsCsv(text, existingPhones = []) {
  const records = parseCsv(text);
  const out = { rows: [], skipped: [], errors: [], preview: [], total: 0 };
  if (!records.length) return out;
  let map = readHeader(records[0], CLIENT_ALIASES);
  let first = 1;
  if (!map) {
    map = { displayName: 0, phone: 1 };
    first = 0;
  } else if (map.displayName === undefined || map.phone === undefined) {
    out.errors.push({ row: 1, reasons: [reasonKey('header')], values: {} });
    return out;
  }
  const known = new Set();
  for (const p of existingPhones instanceof Set ? [...existingPhones] : Array.isArray(existingPhones) ? existingPhones : []) {
    const n = normalizeOmanPhone(p);
    known.add(n || String(p));
  }
  const inFile = new Set();
  for (let i = first; i < records.length; i++) {
    const rec = records[i];
    if (blankRecord(rec)) continue;
    const row = i + 1;
    const values = { displayName: cleanText(rec[map.displayName], 80), phone: cleanText(rec[map.phone], 40) };
    const reasons = [];
    if (!values.displayName) reasons.push('displayNameRequired');
    let phone = null;
    if (!values.phone) reasons.push('phoneRequired');
    else {
      phone = normalizeOmanPhone(values.phone);
      if (!phone) reasons.push('phone');
    }
    out.total += 1;
    if (reasons.length) {
      const keys = reasons.map(reasonKey);
      out.errors.push({ row, reasons: keys, values });
      out.preview.push({ row, values, ok: false, skipped: false, reasons: keys });
      continue;
    }
    if (known.has(phone) || inFile.has(phone)) {
      const reason = reasonKey('duplicatePhone');
      out.skipped.push({ row, displayName: values.displayName, phone, reason });
      out.preview.push({ row, values, ok: false, skipped: true, reasons: [reason] });
      continue;
    }
    inFile.add(phone);
    out.rows.push({ row, displayName: values.displayName, phone });
    out.preview.push({ row, values, ok: true, skipped: false, reasons: [] });
  }
  return out;
}

/* ------------------------------------------------------------------ writing */

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString();
  // Bidi isolate marks are for on-screen RTL layout only; spreadsheets get plain text.
  const s = String(v).replace(/[\u2066-\u2069]/g, '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function quote(s) {
  return /[",\r\n;\t]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV text with a UTF-8 BOM and CRLF line ends.
 * columns: [{ key, label, value?(row) }] or ['key', ...] (key doubles as the label).
 * rows: objects (read by key / value()) or arrays (read by column index).
 */
export function toCsv(rows, columns) {
  const cols = (Array.isArray(columns) ? columns : []).map((c) => (typeof c === 'string' ? { key: c, label: c } : c));
  const lines = [cols.map((c) => quote(cellText(c.label ?? c.key))).join(',')];
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const cells = cols.map((c, idx) => {
      let v;
      if (typeof c.value === 'function') v = c.value(r);
      else if (Array.isArray(r)) v = r[idx];
      else v = r ? r[c.key] : '';
      return quote(cellText(v));
    });
    lines.push(cells.join(','));
  });
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Header-only products template (PRD 11.3). */
export function productsTemplateCsv() {
  return toCsv([], PRODUCT_COLUMNS);
}

export function csvBlob(text) {
  return new Blob([text], { type: CSV_MIME });
}

/** Save a Blob as a file through a temporary link. Returns false where downloads are impossible. */
export function downloadBlob(blob, filename) {
  if (typeof document === 'undefined' || !blob) return false;
  let url;
  try {
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  } catch (err) {
    console.error('download failed', err);
    if (url) URL.revokeObjectURL(url);
    return false;
  }
}

/* ------------------------------------------------------------------ exports */

const col = (lang, key, value) => ({ key, label: translate(lang, `report.csv.col.${key}`), value });
const yesNo = (lang, v) => translate(lang, v ? 'report.csv.yes' : 'report.csv.no');
const omr3 = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : Number(v).toFixed(3));

function timeOf(v) {
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return '';
  return formatMuscat(d, 'en', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

function rangeName(startKey, endKey) {
  return startKey === endKey ? startKey : `${startKey}_${endKey}`;
}

/** Phone as digits with the country code (968XXXXXXXX): Excel keeps it readable and never treats it as a formula. */
function phoneCell(p) {
  const n = normalizeOmanPhone(p);
  if (n) return n.slice(1);
  return p ? String(p).replace(/[^\d]/g, '') : '';
}

/**
 * Consultations of Muscat days startKey..endKey (labels only).
 * @returns {{ blob: Blob, text: string, filename: string, count: number }}
 */
export function exportConsultationsCsv({ consultations, startKey, endKey, lang = 'ar', staff = [], clients = [], products = [], styles = [], includeDemo = false } = {}) {
  const L = lang === 'en' ? 'en' : 'ar';
  const list = filterConsultations(consultations, { startKey, endKey, includeDemo });
  const clientMap = new Map((Array.isArray(clients) ? clients : []).filter((c) => c && c.id).map((c) => [c.id, c]));
  const productMap = new Map((Array.isArray(products) ? products : []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const addOnIds = (c) => (Array.isArray(c.addOns) ? c.addOns.map((x) => (typeof x === 'string' ? x : x && x.id)).filter(Boolean) : []);
  const columns = [
    col(L, 'date', (c) => c.dayKey || muscatDayKey(toDate(c.startedAt))),
    col(L, 'time', (c) => timeOf(c.startedAt)),
    col(L, 'barber', (c) => staffNameOf(c.barberUid, staff)),
    col(L, 'client', (c) => {
      if (!c.clientId) return translate(L, 'common.walkIn');
      const cl = clientMap.get(c.clientId);
      return cl && cl.displayName ? cl.displayName : '';
    }),
    col(L, 'style', (c) => (c.styleId ? pickLang(L, styleNameOf(c.styleId, styles)) : '')),
    col(L, 'status', (c) => translate(L, `report.status.${c.status || 'draft'}`)),
    col(L, 'decisionSeconds', (c) => (isApproved(c) && Number.isFinite(Number(c.decisionSeconds)) && c.decisionSeconds !== null ? Number(c.decisionSeconds) : '')),
    col(L, 'aiPreview', (c) => yesNo(L, c.aiPreviewUsed === true)),
    col(L, 'rating', (c) => (Number.isFinite(Number(c.rating)) && c.rating !== null ? Number(c.rating) : '')),
    col(L, 'nextVisitDays', (c) => (Number.isFinite(Number(c.nextVisitDays)) && c.nextVisitDays !== null ? Number(c.nextVisitDays) : '')),
    col(L, 'addOns', (c) =>
      addOnIds(c)
        .map((id) => (productMap.has(id) ? productNameOf(productMap.get(id), L) : translate(L, 'report.daily.unknownProduct')))
        .join(' | '),
    ),
    col(L, 'addOnsOmr', (c) => {
      const ids = addOnIds(c);
      if (!ids.length) return '';
      let sum = 0;
      for (const id of ids) {
        const p = productMap.get(id);
        if (p && Number.isFinite(Number(p.priceOmr))) sum += Number(p.priceOmr);
      }
      return omr3(roundOmr(sum));
    }),
    col(L, 'demo', (c) => yesNo(L, c.demo === true)),
  ];
  const text = toCsv(list, columns);
  return { blob: csvBlob(text), text, filename: `${APP.slug}-consultations-${rangeName(startKey, endKey)}.csv`, count: list.length };
}

/** Clients with their coarse labels only (no photo, no measurements). */
export function exportClientsCsv({ clients, lang = 'ar', includeDemo = false, now = new Date() } = {}) {
  const L = lang === 'en' ? 'en' : 'ar';
  const list = (Array.isArray(clients) ? clients : []).filter((c) => c && (includeDemo || c.demo !== true));
  const prof = (c) => (c && c.profile) || {};
  const label = (prefix, v) => (v ? translate(L, `${prefix}.${v}`) : '');
  const columns = [
    col(L, 'displayName', (c) => c.displayName || ''),
    col(L, 'phone', (c) => phoneCell(c.phone)),
    col(L, 'lastVisit', (c) => (c.lastVisitAt ? muscatDayKey(toDate(c.lastVisitAt)) : '')),
    col(L, 'faceShape', (c) => label('face', prof(c).faceShape)),
    col(L, 'mst', (c) => (Number.isFinite(Number(prof(c).mst)) && prof(c).mst !== null ? Number(prof(c).mst) : '')),
    col(L, 'undertone', (c) => label('undertone', prof(c).undertone)),
    col(L, 'ageBand', (c) => (prof(c).ageBand ? translate(L, `age.${prof(c).ageBand}`) : '')),
    col(L, 'growability', (c) => (Number.isFinite(Number(prof(c).growability)) && prof(c).growability !== null ? Number(prof(c).growability) : '')),
    col(L, 'growth', (c) => (Number.isFinite(Number(c.growthMmPerDay)) && c.growthMmPerDay !== null ? Number(c.growthMmPerDay) : '')),
  ];
  const text = toCsv(list, columns);
  return { blob: csvBlob(text), text, filename: `${APP.slug}-clients-${muscatDayKey(now)}.csv`, count: list.length };
}

/**
 * Daily stats for Muscat days startKey..endKey, one row per day (days without
 * activity are zeros). With `consultations` the numbers are computed from them
 * (demo left out unless includeDemo); AI previews always come from the stats docs.
 */
export function exportStatsCsv({ stats = [], consultations = null, startKey, endKey, lang = 'ar', styles = [], includeDemo = false } = {}) {
  const L = lang === 'en' ? 'en' : 'ar';
  const keys = dayKeysBetween(startKey, endKey);
  const statMap = new Map((Array.isArray(stats) ? stats : []).filter((s) => s && (s.dayKey || s.id)).map((s) => [s.dayKey || s.id, s]));
  const rows = keys.map((key) => {
    const st = statMap.get(key) || null;
    if (Array.isArray(consultations)) {
      const sum = summarizeConsultations(filterConsultations(consultations, { startKey: key, endKey: key, includeDemo }), { stats: st, styles });
      const top = sum.topStyles[0];
      return {
        date: key,
        consultations: sum.consultations,
        approvals: sum.approvals,
        conversion: sum.conversionPct ?? '',
        avgDecision: sum.avgDecisionSeconds ?? '',
        aiRenders: st ? Number(st.aiRenders) || 0 : 0,
        addOnsCount: sum.addOns.count,
        topStyle: top ? pickLang(L, top.name) : '',
      };
    }
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const consult = n(st && st.consultations);
    const approvals = n(st && st.approvals);
    const topEntry = Object.entries((st && st.topStyles) || {}).sort((a, b) => n(b[1]) - n(a[1]) || a[0].localeCompare(b[0]))[0];
    return {
      date: key,
      consultations: consult,
      approvals,
      conversion: consult ? Math.round((approvals / consult) * 100) : '',
      avgDecision: approvals ? Math.round(n(st.totalDecisionSeconds) / approvals) : '',
      aiRenders: n(st && st.aiRenders),
      addOnsCount: n(st && st.addOns),
      topStyle: topEntry ? pickLang(L, styleNameOf(topEntry[0], styles)) : '',
    };
  });
  const columns = ['date', 'consultations', 'approvals', 'conversion', 'avgDecision', 'aiRenders', 'addOnsCount', 'topStyle'].map((k) => col(L, k));
  const text = toCsv(rows, columns);
  return { blob: csvBlob(text), text, filename: `${APP.slug}-stats-${rangeName(startKey, endKey)}.csv`, count: rows.length };
}
