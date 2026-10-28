// Small platform checks used by the model loaders. Every function takes an optional
// navigator so unit tests can pass a fake one.

function nav(n) {
  if (n) return n;
  return typeof navigator !== 'undefined' ? navigator : null;
}

/** iPhone, iPod or iPad, including iPadOS 13+ which reports a desktop Mac user agent. */
export function isIOS(n) {
  const v = nav(n);
  if (!v) return false;
  const ua = String(v.userAgent || '');
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  const platform = String(v.platform || '');
  const touch = Number(v.maxTouchPoints || 0);
  return (/Macintosh/i.test(ua) || platform === 'MacIntel') && touch > 1;
}

/** Phones and tablets (Android, iOS, iPadOS, other mobile browsers). */
export function isMobile(n) {
  const v = nav(n);
  if (!v) return false;
  if (isIOS(v)) return true;
  if (v.userAgentData && typeof v.userAgentData.mobile === 'boolean' && v.userAgentData.mobile) return true;
  return /Android|Mobile|Silk|Kindle|Opera Mini|IEMobile/i.test(String(v.userAgent || ''));
}

/** Desktop or laptop browser. */
export function isDesktop(n) {
  const v = nav(n);
  return !!v && !isMobile(v);
}

/**
 * True when a large optional download is acceptable right now: online, not in
 * data-saver mode, not on a cellular connection. When the Network Information API
 * does not say what the link is (iOS Safari, Firefox, desktop Chrome), only desktop
 * browsers are treated as unmetered.
 */
export function isUnmetered(n) {
  const v = nav(n);
  if (!v) return false;
  if (v.onLine === false) return false;
  const c = v.connection || v.mozConnection || v.webkitConnection || null;
  if (c) {
    if (c.saveData) return false;
    const type = c.type ? String(c.type) : '';
    if (type === 'cellular' || type === 'none' || type === 'bluetooth' || type === 'wimax') return false;
    if (type === 'wifi' || type === 'ethernet') return true;
  }
  return isDesktop(v);
}
