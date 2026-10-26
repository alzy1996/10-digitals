// Module Worker that generates beard and Outline textures off the main thread, so
// the live AR preview and the screens keep moving while a look is drawn (a full
// 1024 px beard takes about a second on a phone). Requests come from
// textureJobs.js: { id, kind: 'beard' | 'outline', params, profile, opts }; the
// answer is { id, ok, tex } with the raster buffers transferred, or { id, ok: false,
// error }.

import { generateBeardTextures } from './beardTextures.js';
import { buildOutlineTextures } from './inpaint.js';

function transferList(tex) {
  const out = [];
  const add = (arr) => {
    if (arr && arr.buffer && !out.includes(arr.buffer)) out.push(arr.buffer);
  };
  if (tex.face) {
    add(tex.face.color);
    add(tex.face.light);
  }
  if (tex.shell) {
    add(tex.shell.color);
    add(tex.shell.light);
    add(tex.shell.hangMm);
    add(tex.shell.neckMm);
  }
  return out;
}

self.onmessage = (event) => {
  const { id, kind, params, profile, opts } = event.data || {};
  try {
    const tex = kind === 'outline' ? buildOutlineTextures(params, profile, opts || {}) : generateBeardTextures(params, profile, opts || {});
    self.postMessage({ id, ok: true, tex }, transferList(tex));
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
