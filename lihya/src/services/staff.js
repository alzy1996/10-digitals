// Staff: shops/{shopId}/staff/{uid} { uid, name, email, role, active, created/updated }.
// The owner sets roles and active; an owner can never change their own role or
// deactivate themselves (enforced here and in the security rules).

import { ROLES, diffFields } from './model.js';
import { auditOp, updatedStamp } from './ops.js';
import { codedError, colRef, commitOps, listenDoc, listenQuery, recall, requireShopId, requireUser } from './db.js';

const ROLE_ORDER = { owner: 0, manager: 1, barber: 2 };

function sortStaff(list) {
  return [...list].sort(
    (a, b) =>
      Number(b.active === true) - Number(a.active === true) ||
      (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
      String(a.name || a.email || a.id).localeCompare(String(b.name || b.email || b.id)),
  );
}

/** cb([staff], meta): active first, then owner, manager, barber. */
export function watchStaff(shopId, cb, onError) {
  requireShopId(shopId);
  return listenQuery(colRef(`shops/${shopId}/staff`), cb, onError, {
    remember: true,
    rememberAs: `shops/${shopId}/staff`,
    map: sortStaff,
    label: 'staff',
  });
}

/** cb(myStaffDoc|null, meta). Readable even when deactivated (to show that state). */
export function watchMyStaff(shopId, uid, cb, onError) {
  requireShopId(shopId);
  if (!uid) {
    cb(null, { hasPendingWrites: false, fromCache: false });
    return () => {};
  }
  return listenDoc(`shops/${shopId}/staff/${uid}`, cb, onError, { remember: true });
}

function changeStaff(shopId, uid, change, action) {
  requireShopId(shopId);
  const me = requireUser();
  if (!uid) throw codedError('invalid-argument', 'uid');
  const path = `shops/${shopId}/staff/${uid}`;
  const before = recall(path) || {};
  commitOps(
    [
      { path, data: { ...change, ...updatedStamp(me.uid) }, update: true },
      auditOp(shopId, me.uid, { action, path, changedFields: diffFields(before, change) }),
    ],
    action,
  );
}

/** Owner only. Throws 'staff/own-role' for my own doc. */
export function setStaffRole(shopId, uid, role) {
  if (!ROLES.includes(role)) throw codedError('invalid-argument', 'role');
  if (requireUser().uid === uid) throw codedError('staff/own-role', 'An owner cannot change their own role');
  changeStaff(shopId, uid, { role }, 'staff.role');
}

/** Owner only. Throws 'staff/own-active' for my own doc. */
export function setStaffActive(shopId, uid, active) {
  if (requireUser().uid === uid) throw codedError('staff/own-active', 'An owner cannot deactivate themselves');
  changeStaff(shopId, uid, { active: active === true }, 'staff.active');
}
