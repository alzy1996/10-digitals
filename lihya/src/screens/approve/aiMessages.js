// AI Final Look messages (PRD 7.5): why the AI preview cannot be offered, and what to
// say when a render fails. Pure functions, so the mapping is checked on its own.
//
// Error codes come from renderFinalLook (src/ai/render/provider.js): 'cap' (HTTP 429),
// 'offline', 'disabled', 'failed' (with err.reason 'noFace' | 'auth' | 'network').

/** How many times a failed render may be tried again from the result screen. */
export const MAX_AI_RETRIES = 1;

/** i18n key per reason the consent screen cannot offer the AI preview. */
export const UNAVAILABLE_KEYS = Object.freeze({
  disabled: 'render.error.disabled',
  offline: 'render.error.offline',
  notConfigured: 'approve.ai.notConfigured',
  noLook: 'approve.ai.noLook',
  noPhoto: 'approve.ai.noPhoto',
});

/**
 * Why the AI preview cannot be offered right now, or null when it can.
 * `available` is finalLookAvailable(settings) (AI preview on, Worker URL set, online);
 * the other inputs tell which of those failed and whether there is something to send.
 * @returns {'disabled'|'offline'|'notConfigured'|'noLook'|'noPhoto'|null}
 */
export function unavailableReason({ settings, online, available, hasLook, hasPhoto } = {}) {
  if (!settings || settings.aiPreview !== true) return 'disabled';
  if (online === false) return 'offline';
  if (!available) return 'notConfigured';
  if (!hasLook) return 'noLook';
  if (!hasPhoto) return 'noPhoto';
  return null;
}

/**
 * What the result screen says about a failed render.
 * @param {Error & { code?: string, reason?: string }} err error from renderFinalLook
 * @param {number} retriesUsed tries already used on this consent
 * @returns {{ code: 'cap'|'offline'|'disabled'|'noFace'|'failed', key: string, retry: boolean }}
 */
export function finalLookErrorInfo(err, retriesUsed = 0) {
  const code = err && typeof err.code === 'string' ? err.code : 'failed';
  const left = Math.max(0, MAX_AI_RETRIES - (Number(retriesUsed) || 0)) > 0;
  if (code === 'cap') return { code: 'cap', key: 'render.capReached', retry: false };
  if (code === 'disabled') return { code: 'disabled', key: 'render.error.disabled', retry: false };
  if (code === 'offline') return { code: 'offline', key: 'render.error.offline', retry: left };
  if (err && err.reason === 'noFace') return { code: 'noFace', key: 'render.error.noFace', retry: false };
  return { code: 'failed', key: left ? 'render.error.failed' : 'approve.ai.failedAgain', retry: left };
}
