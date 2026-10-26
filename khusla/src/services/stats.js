// dailyStats/{dayKey} counters (Muscat day). Demo data never touches these.
import { collection, doc, onSnapshot, setDoc, increment, serverTimestamp, query, where, documentId } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, snapList } from './base.js';

export function bumpStats(salonId, dayKey, inc, maps = {}) {
  const data = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(inc)) data[k] = increment(v);
  for (const [mapName, entries] of Object.entries(maps)) {
    data[mapName] = {};
    for (const [k, v] of Object.entries(entries)) data[mapName][k.replace(/[.~*/[\]]/g, '_')] = increment(v);
  }
  return fire(setDoc(doc(db, 'salons', salonId, 'dailyStats', dayKey), data, { merge: true }), 'stats');
}

export function watchStatsRange(salonId, fromKey, toKey, cb) {
  const q = query(collection(db, 'salons', salonId, 'dailyStats'), where(documentId(), '>=', fromKey), where(documentId(), '<=', toKey));
  return onSnapshot(q, (s) => cb(snapList(s)), () => cb([]));
}

export function watchStatsDay(salonId, dayKey, cb) {
  return onSnapshot(doc(db, 'salons', salonId, 'dailyStats', dayKey), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
}
