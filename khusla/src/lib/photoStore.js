// Session photo store. Photos live in memory and in one IndexedDB store on this device only,
// so a reload mid-consultation does not lose them. wipeAll() empties both. Never the gallery,
// never Firebase.
const DB_NAME = 'khusla-session';
const STORE = 'photos';
const memory = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no-idb'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const result = fn(store);
      t.oncomplete = () => resolve(result?.result ?? result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function putPhoto(key, blob) {
  memory.set(key, blob);
  try {
    await tx('readwrite', (s) => s.put(blob, key));
  } catch {
    // IndexedDB unavailable (private window): memory only
  }
}

export async function getPhoto(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const db = await openDb();
    const blob = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (blob) memory.set(key, blob);
    return blob;
  } catch {
    return null;
  }
}

export async function listPhotoKeys() {
  try {
    const db = await openDb();
    const keys = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return keys;
  } catch {
    return [...memory.keys()];
  }
}

/** Erase every photo from memory and IndexedDB. */
export async function wipeAll() {
  memory.clear();
  try {
    await tx('readwrite', (s) => s.clear());
  } catch {
    // nothing stored
  }
}
