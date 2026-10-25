// Retention (Settings → Keep records for N days). Spark has no Cloud Functions, so an owner or
// manager device sweeps once a day when the dashboard opens: old consultations and clients not seen
// since the cutoff are deleted. Consent and audit logs are create-only and hold no photos or names.
import { collection, getDocs, query, where, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { addDaysKey, dayKey } from '../lib/time.js';
import { logAudit } from './audit.js';

const KEY = 'khusla.retentionSweep';

export async function sweepRetention(salonId, retentionDays) {
  const today = dayKey();
  try {
    if (localStorage.getItem(`${KEY}.${salonId}`) === today) return 0;
  } catch {
    // sweep anyway
  }
  const cutoffKey = addDaysKey(today, -retentionDays);
  const cutoffTs = Timestamp.fromDate(new Date(Date.now() - retentionDays * 24 * 3600 * 1000));
  let n = 0;
  const old = await getDocs(query(collection(db, 'salons', salonId, 'consultations'), where('dayKey', '<', cutoffKey)));
  const stale = await getDocs(query(collection(db, 'salons', salonId, 'clients'), where('updatedAt', '<', cutoffTs)));
  const refs = [...old.docs, ...stale.docs.filter((d) => !d.data().lastVisitAt || d.data().lastVisitAt.toMillis() < cutoffTs.toMillis())].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
    n += Math.min(400, refs.length - i);
  }
  if (n) logAudit(salonId, 'retention.sweep', `salons/${salonId}`, { deleted: [null, String(n)], days: [null, String(retentionDays)] });
  try {
    localStorage.setItem(`${KEY}.${salonId}`, today);
  } catch {
    // per-device convenience only
  }
  return n;
}
