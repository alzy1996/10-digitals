// Consent log (PRD 7.5 and 10.2): shops/{shopId}/consents/{autoId}
// { type: 'ai_render'|'profile_save', clientId, granted, at, by }. Who and when,
// never a photo. Create-only in the security rules.

import { serverTimestamp } from 'firebase/firestore';
import { CONSENT_TYPES, autoId } from './model.js';
import { codedError, commitOps, requireShopId, requireUser } from './db.js';

/** Consent op for a batch (used by clients.saveClientProfile). */
export function consentOp(shopId, uid, { type, clientId, granted }) {
  if (!CONSENT_TYPES.includes(type)) throw codedError('invalid-argument', 'consent type');
  return {
    path: `shops/${shopId}/consents/${autoId()}`,
    data: {
      type,
      clientId: typeof clientId === 'string' && clientId ? clientId : null,
      granted: granted === true,
      at: serverTimestamp(),
      by: uid,
    },
  };
}

/** Log one consent answer (tracked, offline-safe). Returns the consent id. */
export function logConsent(shopId, { type, clientId = null, granted } = {}) {
  requireShopId(shopId);
  const user = requireUser();
  const op = consentOp(shopId, user.uid, { type, clientId, granted });
  commitOps([op], 'consent');
  return op.path.split('/').pop();
}
