// Per-device UI preference for the entry screens: the shop this phone opened last.
// localStorage holds UI preferences only (ARCHITECTURE 0); a private window simply
// has no preference.

import { PREF_KEYS } from '../../config/app.js';

export function readLastShop() {
  try {
    return localStorage.getItem(PREF_KEYS.lastShop) || null;
  } catch {
    return null;
  }
}

export function rememberLastShop(shopId) {
  if (!shopId) return;
  try {
    localStorage.setItem(PREF_KEYS.lastShop, shopId);
  } catch {
    // private mode: the picker just does not open it by itself next time
  }
}
