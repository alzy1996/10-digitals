// Invites: shops/{shopId}/invites/{email lowercased} { email, role, createdAt, createdBy }.
// The owner invites a barber or manager by email; the invitee gets a sign-in link
// that continues to /join/<shopId>, signs in with that same verified address
// (email link or Google) and acceptInvite() creates staff/{uid} with the invite's
// role. The security rules check the verified email and the role.

import { serverTimestamp } from 'firebase/firestore';
import { INVITE_ROLES, isValidEmail, normalizeEmail, cleanText } from './model.js';
import { auditOp, createdStamp } from './ops.js';
import { codedError, colRef, commitOps, listenQuery, readDoc, recall, requireShopId, requireUser } from './db.js';
import { sendLinkTo } from './auth.js';

export function joinPath(shopId) {
  return `/join/${shopId}`;
}

/** Link the owner can also share by hand (WhatsApp) if the email does not arrive. */
export function joinUrl(shopId) {
  return `${window.location.origin}${joinPath(shopId)}`;
}

/**
 * Save the invite (offline-safe) and email a sign-in link to the invitee.
 * Resolves { email, role, joinUrl, sent } — sent is false when the email could
 * not be sent (offline, quota); the invite itself is saved either way.
 */
export async function createInvite(shopId, email, role) {
  requireShopId(shopId);
  const me = requireUser();
  const address = normalizeEmail(email);
  if (!isValidEmail(address)) throw codedError('auth/invalid-email');
  if (!INVITE_ROLES.includes(role)) throw codedError('invalid-argument', 'role');
  const path = `shops/${shopId}/invites/${address}`;
  const before = recall(path);
  commitOps(
    [
      { path, data: { email: address, role, ...createdStamp(me.uid) } },
      auditOp(shopId, me.uid, {
        action: 'invite.create',
        path,
        changedFields: { role: [before ? before.role : null, role] },
      }),
    ],
    'invite.create',
  );
  let sent = false;
  try {
    await sendLinkTo(address, { next: joinPath(shopId), remember: false });
    sent = true;
  } catch (err) {
    console.warn('createInvite: the sign-in email was not sent', err);
  }
  return { email: address, role, joinUrl: joinUrl(shopId), sent };
}

/** cb([invite], meta), newest first. Owner only. */
export function watchInvites(shopId, cb, onError) {
  requireShopId(shopId);
  return listenQuery(colRef(`shops/${shopId}/invites`), cb, onError, {
    remember: true,
    label: 'invites',
    map: (list) =>
      [...list].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
  });
}

/** Withdraw an invite. */
export function deleteInvite(shopId, email) {
  requireShopId(shopId);
  const me = requireUser();
  const address = normalizeEmail(email);
  const path = `shops/${shopId}/invites/${address}`;
  const before = recall(path);
  commitOps(
    [
      { path, delete: true },
      auditOp(shopId, me.uid, { action: 'invite.delete', path, changedFields: { role: [before ? before.role : null, null] } }),
    ],
    'invite.delete',
  );
}

/**
 * Join the shop with my invite. Needs a verified email (email link and Google
 * both verify it) and a network connection for the invite read.
 * Resolves { shopId, role, already } — already is true when I was a member before.
 * Rejects with code 'invite/email-not-verified' or 'invite/not-found'.
 */
export async function acceptInvite(shopId) {
  requireShopId(shopId);
  const me = requireUser();
  const address = normalizeEmail(me.email);
  if (!address || !me.emailVerified) throw codedError('invite/email-not-verified');
  const staffPath = `shops/${shopId}/staff/${me.uid}`;
  const existing = await readDoc(staffPath);
  if (existing) return { shopId, role: existing.role, already: true };
  let invite;
  try {
    invite = await readDoc(`shops/${shopId}/invites/${address}`);
  } catch (err) {
    if (err?.code === 'permission-denied') throw codedError('invite/not-found');
    throw err;
  }
  if (!invite || !INVITE_ROLES.includes(invite.role)) throw codedError('invite/not-found');
  const name = cleanText(me.displayName, 80) || cleanText(address.split('@')[0], 80);
  commitOps(
    [
      {
        path: staffPath,
        data: { uid: me.uid, name, email: address, role: invite.role, active: true, createdAt: serverTimestamp(), createdBy: me.uid },
      },
      { path: `shops/${shopId}/invites/${address}`, delete: true },
      auditOp(shopId, me.uid, { action: 'staff.join', path: staffPath, changedFields: { role: [null, invite.role] } }),
    ],
    'invite.accept',
  );
  return { shopId, role: invite.role, already: false };
}
