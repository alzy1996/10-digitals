// Which services this person can start, and where each chair flow begins.
import { SECTION_LIST } from '../config/app.js';
import * as nails from '../screens/nails/routes.jsx';
import * as beard from '../screens/beard/routes.jsx';

const ENTRIES = { hair: '/capture', nails: nails.ENTRY, beard: beard.ENTRY };
const HOME_ENTRIES = { hair: (salonId) => `/t/${salonId}`, nails: nails.HOME_ENTRY, beard: beard.HOME_ENTRY };

/** Services the salon offers AND this staff member works in, in the fixed order (hair, nails, beard). */
export function mySections(salon, me) {
  const on = salon?.sections || { hair: true };
  const mine = me?.sections || ['hair'];
  return SECTION_LIST.filter((s) => on[s.id] && mine.includes(s.id) && ENTRIES[s.id]).map((s) => s.id);
}

/** Services the salon offers to customers at home. */
export function homeSections(publicSalon) {
  const on = publicSalon?.sections || { hair: true };
  return SECTION_LIST.filter((s) => on[s.id] && HOME_ENTRIES[s.id]).map((s) => s.id);
}

export const sectionEntry = (id) => ENTRIES[id];
export const homeEntry = (id, salonId) => HOME_ENTRIES[id]?.(salonId) || null;
export const sectionMeta = (id) => SECTION_LIST.find((s) => s.id === id);

/** One id for the services of one visit (hair + nails share one Agreement Card). */
export function newVisitId() {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return `v${Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16)}`;
}
