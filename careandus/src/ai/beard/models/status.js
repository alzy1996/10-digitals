// Load state of the on-device models, plus a byte-level download tracker so the
// loading screen can show one progress bar for every model being fetched.

const status = { landmarker: 'idle', segmenter: 'idle', age: 'idle' };
const statusListeners = new Set();

/** 'idle' | 'loading' | 'ready' | 'error' per model. */
export function modelStatus() {
  return { ...status };
}

export function setModelStatus(key, value) {
  if (status[key] === value) return;
  status[key] = value;
  const snap = modelStatus();
  for (const cb of statusListeners) {
    try {
      cb(snap);
    } catch (err) {
      console.error(err);
    }
  }
}

/** Calls cb(modelStatus()) on every change. Returns an unsubscribe function. */
export function subscribeModelStatus(cb) {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

const downloads = {};
const progressListeners = new Set();

function emitProgress() {
  for (const cb of progressListeners) {
    try {
      cb(downloads);
    } catch (err) {
      console.error(err);
    }
  }
}

/** Calls cb({ [key]: { loaded, total, done } }) whenever a tracked download moves. */
export function subscribeDownloads(cb) {
  progressListeners.add(cb);
  return () => progressListeners.delete(cb);
}

export function downloadState(key) {
  return downloads[key] ? { ...downloads[key] } : null;
}

/**
 * Fetches a model file as bytes and reports progress under `key`. The request goes
 * through the service worker, which answers from its CacheFirst cache after the
 * first visit. `expectedBytes` is used when the response has no Content-Length
 * (compressed or opaque responses).
 */
export async function fetchModelBytes(key, url, expectedBytes) {
  downloads[key] = { loaded: 0, total: expectedBytes || 0, done: false };
  emitProgress();
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`model download failed (${res.status}) ${url}`);
  const header = Number(res.headers.get('content-length')) || 0;
  const total = header || expectedBytes || 0;
  downloads[key].total = total;
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = new Uint8Array(await res.arrayBuffer());
    downloads[key] = { loaded: buf.length, total: buf.length, done: true };
    emitProgress();
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  let lastEmit = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    downloads[key].loaded = loaded;
    if (loaded - lastEmit > 256 * 1024) {
      lastEmit = loaded;
      emitProgress();
    }
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  downloads[key] = { loaded, total: Math.max(total, loaded), done: true };
  emitProgress();
  return out;
}
