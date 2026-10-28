// Sharing (PRD 11.4): Web Share with files (the Cut Card PNG) where the browser
// supports it, otherwise a download. "Copy text + open WhatsApp" builds a wa.me link;
// the app never sends a message by itself, the barber or customer presses Send.

import { waLink, normalizeOmanPhone } from '../lib/format.js';
import { translate, pickLang } from '../lib/i18n.js';
import { formatDayKey } from '../lib/time.js';
import { downloadBlob } from '../lib/download.js';

function makeFile(blob, filename) {
  try {
    return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  } catch {
    return null;
  }
}

/** true when this browser can share files (Web Share Level 2). */
export function canShareFiles(blob, filename = 'file') {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || !blob) {
    return false;
  }
  const file = makeFile(blob, filename);
  try {
    return Boolean(file) && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Share a file with the system share sheet, or download it when file sharing is not
 * supported. Resolves 'shared' | 'downloaded' | 'cancelled' | 'failed'.
 */
export async function shareFile(blob, filename, text = '') {
  if (!blob) return 'failed';
  if (canShareFiles(blob, filename)) {
    const file = makeFile(blob, filename);
    try {
      await navigator.share({ files: [file], text: text || undefined, title: filename });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      console.warn('share: Web Share failed, downloading instead', err);
    }
  }
  return downloadBlob(blob, filename) ? 'downloaded' : 'failed';
}

/** Copy text to the clipboard (with a fallback for older browsers). Resolves true when copied. */
export async function copyText(text) {
  const value = String(text ?? '');
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall back below
  }
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0' });
  document.body.appendChild(ta);
  ta.select();
  let ok;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** wa.me link for a text and an optional phone (Oman numbers are normalized). */
export function whatsAppUrl(text, phone) {
  const p = phone ? normalizeOmanPhone(phone) || String(phone) : '';
  return waLink(String(text ?? ''), p || undefined);
}

/**
 * Open WhatsApp with the text ready to send (wa.me). Nothing is sent automatically.
 * Returns the URL that was opened.
 */
export function openWhatsApp(text, phone) {
  const url = whatsAppUrl(text, phone);
  if (typeof document !== 'undefined') {
    // A link click (not window.open) keeps working in installed PWAs and never
    // replaces the app page; call it straight from the tap handler.
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return url;
}

/**
 * Copy the text and open WhatsApp with it (PRD 8.1 step 11). Both start inside the
 * same tap (no await in between) so Safari keeps the user gesture for each.
 * Resolves { copied, url }.
 */
export function copyAndOpenWhatsApp(text, phone) {
  const copying = copyText(text);
  const url = openWhatsApp(text, phone);
  return copying.then((copied) => ({ copied, url }));
}

function shopNameOf(lang, shop) {
  if (!shop) return '';
  if (typeof shop === 'string') return shop;
  return pickLang(lang, { en: shop.name || '', ar: shop.nameAr || shop.name || '' });
}

/** Next-visit reminder text for "Copy reminder + open WhatsApp". */
export function reminderText({ lang = 'ar', shop, clientName, dayKey }) {
  const L = lang === 'en' ? 'en' : 'ar';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || '')) ? formatDayKey(dayKey, L) : '';
  const vars = { shop: shopNameOf(L, shop), date, name: clientName || '' };
  return translate(L, clientName ? 'report.share.reminder' : 'report.share.reminderNoName', vars);
}

/** Short text that goes with the shared Cut Card image. */
export function cutCardShareText({ lang = 'ar', shop, style, card }) {
  const L = lang === 'en' ? 'en' : 'ar';
  const styleName = style ? pickLang(L, style.name) : (card && card.styleId) || '';
  const date = card && card.nextVisitDayKey ? formatDayKey(card.nextVisitDayKey, L) : '';
  return translate(L, 'report.share.cutCardText', { shop: shopNameOf(L, shop), style: styleName, date });
}
