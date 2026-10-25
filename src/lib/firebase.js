// Firebase bootstrap. Config comes ONLY from environment variables (.env.local) — never hard-coded.
// If config is missing the app runs in DEMO MODE (fully working, nothing saved).
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore'

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseEnabled = Boolean(cfg.apiKey && cfg.projectId && cfg.appId)
export const SALON_ID = (import.meta.env.VITE_SALON_ID || 'main').replace(/[^a-zA-Z0-9_-]/g, '') || 'main'

export let app = null
export let auth = null
export let db = null

if (firebaseEnabled) {
  app = initializeApp(cfg)
  auth = getAuth(app)
  let localCache
  try {
    // Offline mode: reads/writes work with no signal and sync when back online, across tabs.
    localCache = persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  } catch {
    localCache = memoryLocalCache()
  }
  db = initializeFirestore(app, { localCache, ignoreUndefinedProperties: true })
}
