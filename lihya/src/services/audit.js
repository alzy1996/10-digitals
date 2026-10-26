// Audit trail for owner and manager changes (shop, settings, staff, invites,
// styles, products, imports, demo data): shops/{shopId}/audit/{autoId}
// { action, path, by, at, changedFields: { field: [before, after] } }.
// Create-only in the security rules. Services add audit ops to the same batch
// as the change itself; writeAudit is for anything else.

import { auditOp } from './ops.js';
import { commitOps, requireShopId, requireUser } from './db.js';
import { diffFields } from './model.js';

export { diffFields };

/** Write one audit entry now (tracked, offline-safe). Returns the audit path. */
export function writeAudit(shopId, { action, path, changedFields } = {}) {
  requireShopId(shopId);
  const user = requireUser();
  const op = auditOp(shopId, user.uid, { action, path, changedFields });
  commitOps([op], 'audit');
  return op.path;
}
