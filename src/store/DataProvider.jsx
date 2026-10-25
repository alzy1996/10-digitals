// Data layer: one API for the whole app. Firebase mode (live sync + offline) or Demo mode (in-memory).
// Every record carries an audit trail (who + when) and every write is logged to salons/{id}/audit.
// Public visitors read ONE document (salons/{id}/public/site) → ~1 read per visit (free-tier friendly).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  signInAnonymously,
  sendPasswordResetEmail,
  updateProfile,
  sendEmailVerification,
} from 'firebase/auth'
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  getDoc,
  increment,
  Timestamp,
} from 'firebase/firestore'
import { auth, db, firebaseEnabled, SALON_ID } from '../lib/firebase'
import { SEED_SALON, SEED_SERVICES, buildSeedInventory } from '../data/seed'
import { LIBRARY } from '../data/library'

const DataContext = createContext(null)
export const PHOTO_RETENTION_DAYS = 90

const PUBLIC_POLISH_FIELDS = ['brand', 'line', 'name', 'nameAr', 'code', 'hex', 'hex2', 'family', 'finish', 'type', 'price', 'stock', 'active']
const PUBLIC_SALON_FIELDS = ['name', 'nameAr', 'tagline', 'taglineAr', 'whatsapp', 'phone', 'instagram', 'address', 'addressAr', 'hours', 'hoursAr', 'currency', 'showPrices', 'onlyInStock', 'publicTryOn']

function pickFields(o, fields) {
  const out = {}
  for (const f of fields) if (o[f] !== undefined) out[f] = o[f]
  return out
}

function tsToMs(v) {
  if (v instanceof Timestamp) return v.toMillis()
  if (v && typeof v.toMillis === 'function') return v.toMillis()
  return v
}

function mapDoc(d) {
  const data = d.data({ serverTimestamps: 'estimate' }) || {}
  const out = { id: d.id }
  for (const k in data) out[k] = tsToMs(data[k])
  return out
}

let demoSeq = 1
const demoId = (p) => p + '-' + Date.now().toString(36) + '-' + (demoSeq++).toString(36)

function buildDemoState() {
  const now = Date.now()
  const user = { uid: 'demo', displayName: 'Demo Owner', email: 'demo@nailmirror.app' }
  const audit = (o) => ({ ...o, createdAt: now, createdBy: user.uid, createdByName: user.displayName, updatedAt: now, updatedBy: user.uid, updatedByName: user.displayName })
  return {
    salon: audit({ id: SALON_ID, ...SEED_SALON, ownerUid: 'demo' }),
    polishes: buildSeedInventory().map((p, i) => audit({ id: 'p' + (i + 1), ...p })),
    services: SEED_SERVICES.map((s, i) => audit({ id: 's' + (i + 1), ...s })),
    looks: [],
    requests: [],
    invites: [],
    members: [{ id: 'demo', role: 'owner', name: 'Demo Owner', email: user.email }],
    audit: [],
  }
}

export function DataProvider({ children }) {
  const mode = firebaseEnabled ? 'firebase' : 'demo'
  const [user, setUser] = useState(mode === 'demo' ? { uid: 'demo', displayName: 'Demo Owner', email: 'demo@nailmirror.app', isAnonymous: false } : null)
  const [authReady, setAuthReady] = useState(mode === 'demo')
  const [member, setMember] = useState(mode === 'demo' ? { id: 'demo', role: 'owner' } : null)
  const [memberReady, setMemberReady] = useState(mode === 'demo')
  const [site, setSite] = useState(null)
  const [siteReady, setSiteReady] = useState(false)
  const [salonExists, setSalonExists] = useState(mode === 'demo' ? true : null)
  const [staff, setStaff] = useState(mode === 'demo' ? buildDemoState() : { salon: null, polishes: [], services: [], looks: [], requests: [], invites: [], members: [], audit: [] })
  const [error, setError] = useState(null)
  const [staffReady, setStaffReady] = useState(mode === 'demo')
  const staffRef = useRef(staff)
  staffRef.current = staff
  const republishTimer = useRef(null)

  const isStaff = !!member && !!user && !user.isAnonymous
  const role = member?.role || null

  // ------------------------------------------------------------ auth
  useEffect(() => {
    if (mode !== 'firebase') return
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthReady(true)
    })
  }, [mode])

  // ------------------------------------------------------------ public site (1 doc)
  useEffect(() => {
    if (mode === 'demo') {
      setSiteReady(true)
      return
    }
    const ref = doc(db, 'salons', SALON_ID, 'public', 'site')
    return onSnapshot(
      ref,
      (snap) => {
        setSite(snap.exists() ? mapDoc(snap) : null)
        setSiteReady(true)
      },
      (e) => {
        console.warn('[site]', e)
        setSiteReady(true)
      },
    )
  }, [mode])

  // ------------------------------------------------------------ membership
  useEffect(() => {
    if (mode !== 'firebase') return
    setMember(null)
    setMemberReady(false)
    if (!user || user.isAnonymous) {
      setMemberReady(true)
      return
    }
    const unsubs = []
    unsubs.push(
      onSnapshot(
        doc(db, 'salons', SALON_ID),
        (s) => setSalonExists(s.exists()),
        () => setSalonExists(null),
      ),
    )
    unsubs.push(
      onSnapshot(
        doc(db, 'salons', SALON_ID, 'members', user.uid),
        (s) => {
          setMember(s.exists() ? mapDoc(s) : null)
          setMemberReady(true)
        },
        () => {
          setMember(null)
          setMemberReady(true)
        },
      ),
    )
    return () => unsubs.forEach((u) => u())
  }, [mode, user])

  // ------------------------------------------------------------ staff live data (real-time across devices)
  useEffect(() => {
    if (mode !== 'firebase' || !isStaff) return
    const base = ['salons', SALON_ID]
    const subs = []
    const listen = (key, q, single = false) =>
      subs.push(
        onSnapshot(
          q,
          (snap) => {
            setStaff((s) => ({ ...s, [key]: single ? (snap.exists() ? mapDoc(snap) : null) : snap.docs.map(mapDoc) }))
            if (key === 'polishes') setStaffReady(true)
          },
          (e) => {
            console.warn('[listen ' + key + ']', e)
            setError(e.code || e.message)
          },
        ),
      )
    listen('salon', doc(db, ...base), true)
    listen('polishes', collection(db, ...base, 'polishes'))
    listen('services', collection(db, ...base, 'services'))
    listen('looks', query(collection(db, ...base, 'looks'), orderBy('createdAt', 'desc'), limit(300)))
    listen('requests', query(collection(db, ...base, 'requests'), orderBy('createdAt', 'desc'), limit(300)))
    listen('members', collection(db, ...base, 'members'))
    listen('audit', query(collection(db, ...base, 'audit'), orderBy('at', 'desc'), limit(200)))
    if (role === 'owner') listen('invites', collection(db, ...base, 'invites'))
    return () => subs.forEach((u) => u())
  }, [mode, isStaff, role])

  // ------------------------------------------------------------ photo retention (90 days, app-run; TTL is not free on Spark)
  const purgedRef = useRef(false)
  useEffect(() => {
    if (mode !== 'firebase' || role !== 'owner' || purgedRef.current) return
    if (!staff.requests.length && !staff.looks.length) return
    purgedRef.current = true
    const cutoff = Date.now() - PHOTO_RETENTION_DAYS * 86400000
    const old = [
      ...staff.requests.filter((r) => r.thumb && r.createdAt && r.createdAt < cutoff).map((r) => ['requests', r.id]),
      ...staff.looks.filter((r) => r.thumb && r.createdAt && r.createdAt < cutoff).map((r) => ['looks', r.id]),
    ].slice(0, 400)
    if (!old.length) return
    const batch = writeBatch(db)
    const u = auth.currentUser
    for (const [col, id] of old)
      batch.update(doc(db, 'salons', SALON_ID, col, id), { thumb: '', updatedAt: serverTimestamp(), updatedBy: u.uid, updatedByName: 'Retention purge' })
    batch
      .commit()
      .then(() => addDoc(collection(db, 'salons', SALON_ID, 'audit'), { action: 'update', col: 'retention', docId: '', summary: `Removed ${old.length} photos older than ${PHOTO_RETENTION_DAYS} days`, by: u.uid, byName: 'Retention purge', at: serverTimestamp() }))
      .catch((e) => console.warn('[retention]', e))
  }, [mode, role, staff.requests, staff.looks])

  // ------------------------------------------------------------ helpers
  const who = useCallback(() => {
    const u = user || {}
    return { uid: u.uid || 'anon', name: u.displayName || u.email || 'Staff' }
  }, [user])

  const stampNew = useCallback(
    (data) => {
      const w = who()
      const t = mode === 'firebase' ? serverTimestamp() : Date.now()
      return { ...data, createdAt: t, createdBy: w.uid, createdByName: w.name, updatedAt: t, updatedBy: w.uid, updatedByName: w.name }
    },
    [mode, who],
  )
  const stampUpdate = useCallback(
    (data) => {
      const w = who()
      const t = mode === 'firebase' ? serverTimestamp() : Date.now()
      return { ...data, updatedAt: t, updatedBy: w.uid, updatedByName: w.name }
    },
    [mode, who],
  )

  const logAudit = useCallback(
    async (action, col, docId, summary) => {
      const w = who()
      const entry = { action, col, docId: docId || '', summary: String(summary || '').slice(0, 300), by: w.uid, byName: w.name }
      if (mode === 'demo') {
        setStaff((s) => ({ ...s, audit: [{ id: demoId('a'), ...entry, at: Date.now() }, ...s.audit].slice(0, 200) }))
        return
      }
      try {
        await addDoc(collection(db, 'salons', SALON_ID, 'audit'), { ...entry, at: serverTimestamp() })
      } catch (e) {
        console.warn('[audit]', e)
      }
    },
    [mode, who],
  )

  // Public projection: salon profile + active catalog + services in ONE doc.
  const buildProjection = useCallback(() => {
    const s = staffRef.current
    const polishes = s.polishes
      .filter((p) => p.active !== false)
      .map((p) => ({ id: p.id, ...pickFields(p, PUBLIC_POLISH_FIELDS) }))
    const services = s.services.filter((x) => x.active !== false).map((x) => ({ id: x.id, name: x.name, nameAr: x.nameAr, price: x.price, durationMin: x.durationMin, category: x.category }))
    return { salon: pickFields(s.salon || {}, PUBLIC_SALON_FIELDS), polishes, services }
  }, [])

  const republishNow = useCallback(async () => {
    if (mode !== 'firebase') return
    const proj = buildProjection()
    const size = JSON.stringify(proj).length
    if (size > 950_000) {
      console.warn('[republish] projection too large, trimming', size)
      proj.polishes = proj.polishes.slice(0, 2500)
    }
    await setDoc(doc(db, 'salons', SALON_ID, 'public', 'site'), { ...proj, updatedAt: serverTimestamp(), updatedBy: who().uid })
  }, [mode, buildProjection, who])

  const scheduleRepublish = useCallback(() => {
    if (mode !== 'firebase') return
    clearTimeout(republishTimer.current)
    republishTimer.current = setTimeout(() => {
      republishNow().catch((e) => setError(e.code || e.message))
    }, 1200)
  }, [mode, republishNow])

  // ------------------------------------------------------------ generic CRUD
  const saveIn = useCallback(
    async (col, data, id) => {
      if (mode === 'demo') {
        if (id) {
          const patch = stampUpdate(data)
          setStaff((s) => ({ ...s, [col]: s[col].map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
          return id
        }
        const newId = demoId(col[0])
        const rec = { id: newId, ...stampNew(data) }
        setStaff((s) => ({ ...s, [col]: [rec, ...s[col]] }))
        return newId
      }
      const colRef = collection(db, 'salons', SALON_ID, col)
      if (id) {
        await updateDoc(doc(colRef, id), stampUpdate(data))
        return id
      }
      const ref = await addDoc(colRef, stampNew(data))
      return ref.id
    },
    [mode, stampNew, stampUpdate],
  )

  const removeIn = useCallback(
    async (col, id) => {
      if (mode === 'demo') {
        setStaff((s) => ({ ...s, [col]: s[col].filter((x) => x.id !== id) }))
        return
      }
      await deleteDoc(doc(db, 'salons', SALON_ID, col, id))
    },
    [mode],
  )

  // ------------------------------------------------------------ actions
  /** Security rules require a verified email (Google accounts are verified). Refresh the token first. */
  const ensureVerified = async (u) => {
    await u.reload()
    const isPassword = u.providerData.some((p) => p.providerId === 'password')
    const isGoogle = u.providerData.some((p) => p.providerId === 'google.com')
    if (isPassword && !isGoogle && !u.emailVerified) {
      sendEmailVerification(u).catch(() => {})
      throw new Error('verify_email')
    }
    await u.getIdToken(true)
  }

  const actions = useMemo(() => {
    const a = {}

    a.savePolish = async (data, id) => {
      const rid = await saveIn('polishes', data, id)
      await logAudit(id ? 'update' : 'create', 'polishes', rid, `${data.brand || ''} ${data.name || ''} ${data.hex || ''}`)
      scheduleRepublish()
      return rid
    }
    a.deletePolish = async (id, label) => {
      await removeIn('polishes', id)
      await logAudit('delete', 'polishes', id, label)
      scheduleRepublish()
    }
    a.adjustStock = async (id, delta) => {
      if (mode === 'demo') {
        setStaff((s) => ({ ...s, polishes: s.polishes.map((p) => (p.id === id ? { ...p, ...stampUpdate({ stock: Math.max(0, (p.stock || 0) + delta) }) } : p)) }))
      } else {
        await updateDoc(doc(db, 'salons', SALON_ID, 'polishes', id), stampUpdate({ stock: increment(delta) }))
      }
      await logAudit('stock', 'polishes', id, (delta > 0 ? '+' : '') + delta)
      scheduleRepublish()
    }
    /** rows: validated polish objects; mode 'merge' (update by code) | 'append' */
    a.importPolishes = async (rows, importMode = 'merge') => {
      const existing = staffRef.current.polishes
      const byCode = new Map(existing.filter((p) => p.code).map((p) => [String(p.code).toLowerCase() + '|' + String(p.brand || '').toLowerCase(), p]))
      let created = 0
      let updated = 0
      if (mode === 'demo') {
        const updates = new Map()
        const fresh = []
        for (const r of rows) {
          const k = String(r.code || '').toLowerCase() + '|' + String(r.brand || '').toLowerCase()
          const hit = importMode === 'merge' && r.code ? byCode.get(k) : null
          if (hit) {
            updates.set(hit.id, stampUpdate(r))
            updated++
          } else {
            fresh.push({ id: demoId('p'), ...stampNew(r) })
            created++
          }
        }
        setStaff((s) => ({ ...s, polishes: [...fresh, ...s.polishes.map((p) => (updates.has(p.id) ? { ...p, ...updates.get(p.id) } : p))] }))
      } else {
        const colRef = collection(db, 'salons', SALON_ID, 'polishes')
        for (let i = 0; i < rows.length; i += 400) {
          const batch = writeBatch(db)
          for (const r of rows.slice(i, i + 400)) {
            const k = String(r.code || '').toLowerCase() + '|' + String(r.brand || '').toLowerCase()
            const hit = importMode === 'merge' && r.code ? byCode.get(k) : null
            if (hit) {
              batch.update(doc(colRef, hit.id), stampUpdate(r))
              updated++
            } else {
              batch.set(doc(colRef), stampNew(r))
              created++
            }
          }
          await batch.commit()
        }
      }
      await logAudit('import', 'polishes', '', `CSV import: ${created} new, ${updated} updated`)
      scheduleRepublish()
      return { created, updated }
    }

    a.saveService = async (data, id) => {
      const rid = await saveIn('services', data, id)
      await logAudit(id ? 'update' : 'create', 'services', rid, data.name)
      scheduleRepublish()
      return rid
    }
    a.deleteService = async (id, label) => {
      await removeIn('services', id)
      await logAudit('delete', 'services', id, label)
      scheduleRepublish()
    }

    a.saveSalon = async (data) => {
      if (mode === 'demo') {
        setStaff((s) => ({ ...s, salon: { ...s.salon, ...stampUpdate(data) } }))
      } else {
        await updateDoc(doc(db, 'salons', SALON_ID), stampUpdate(data))
      }
      await logAudit('update', 'salon', SALON_ID, 'Salon settings')
      scheduleRepublish()
    }

    a.saveLook = async (look) => {
      const id = await saveIn('looks', { status: 'saved', source: 'staff', ...look })
      await logAudit('create', 'looks', id, look.customerName || 'Look')
      return id
    }
    a.updateLook = async (id, patch) => {
      await saveIn('looks', patch, id)
      await logAudit('update', 'looks', id, Object.keys(patch).join(','))
    }
    a.deleteLook = async (id) => {
      await removeIn('looks', id)
      await logAudit('delete', 'looks', id, '')
    }

    /** Public: a customer sends her chosen look to the salon (no login needed). */
    a.submitRequest = async (req) => {
      const clean = {
        customerName: String(req.customerName || '').slice(0, 60),
        customerPhone: String(req.customerPhone || '').replace(/[^0-9+]/g, '').slice(0, 20),
        note: String(req.note || '').slice(0, 300),
        preferredDate: String(req.preferredDate || '').slice(0, 40),
        design: req.design || {},
        analysis: req.analysis || null,
        thumb: typeof req.thumb === 'string' && req.thumb.length < 180_000 ? req.thumb : '',
        status: 'new',
        source: 'customer',
        lang: req.lang === 'ar' ? 'ar' : 'en',
      }
      if (mode === 'demo') {
        const id = demoId('r')
        setStaff((s) => ({ ...s, requests: [{ id, ...clean, createdAt: Date.now(), createdBy: 'customer', createdByName: clean.customerName }, ...s.requests] }))
        return id
      }
      // Customers need no account. A silent anonymous sign-in (free) gives the request a uid for the audit trail;
      // if the Anonymous provider is not enabled the request is still accepted as 'public'.
      let uid = auth.currentUser?.uid || null
      if (!uid) {
        try {
          uid = (await signInAnonymously(auth)).user.uid
        } catch (e) {
          console.warn('[anon auth] not enabled — request saved as public', e?.code)
        }
      }
      const ref = await addDoc(collection(db, 'salons', SALON_ID, 'requests'), {
        ...clean,
        createdAt: serverTimestamp(),
        createdBy: uid || 'public',
        createdByName: clean.customerName || 'Customer',
      })
      return ref.id
    }
    a.updateRequest = async (id, patch) => {
      await saveIn('requests', patch, id)
      await logAudit('update', 'requests', id, Object.entries(patch).map(([k, v]) => k + '=' + v).join(','))
    }
    a.deleteRequest = async (id) => {
      await removeIn('requests', id)
      await logAudit('delete', 'requests', id, '')
    }

    a.inviteStaff = async (email, roleName = 'tech') => {
      const key = String(email || '').trim().toLowerCase()
      if (!key.includes('@')) throw new Error('invalid_email')
      if (mode === 'demo') {
        setStaff((s) => ({ ...s, invites: [{ id: key, email: key, role: roleName, ...stampNew({}) }, ...s.invites.filter((i) => i.id !== key)] }))
      } else {
        await setDoc(doc(db, 'salons', SALON_ID, 'invites', key), stampNew({ email: key, role: roleName }))
      }
      await logAudit('create', 'invites', key, roleName)
    }
    a.removeInvite = async (email) => {
      await removeIn('invites', email)
      await logAudit('delete', 'invites', email, '')
    }
    a.removeMember = async (uid) => {
      await removeIn('members', uid)
      await logAudit('delete', 'members', uid, '')
    }

    /** First login: claim this salon as owner and (optionally) load starter inventory + services. */
    a.claimSalon = async ({ withSeed = true } = {}) => {
      if (mode === 'demo') return
      const u = auth.currentUser
      if (!u) throw new Error('not_signed_in')
      await ensureVerified(u)
      const salonRef = doc(db, 'salons', SALON_ID)
      const existing = await getDoc(salonRef)
      if (existing.exists()) throw new Error('salon_already_claimed')
      const batch = writeBatch(db)
      const name = u.displayName || u.email
      batch.set(salonRef, { ...SEED_SALON, ownerUid: u.uid, createdAt: serverTimestamp(), createdBy: u.uid, createdByName: name, updatedAt: serverTimestamp(), updatedBy: u.uid, updatedByName: name })
      batch.set(doc(db, 'salons', SALON_ID, 'members', u.uid), { role: 'owner', name, email: u.email || '', createdAt: serverTimestamp(), createdBy: u.uid })
      await batch.commit()
      if (withSeed) await a.seedStarter()
      await logAudit('create', 'salon', SALON_ID, 'Salon claimed by owner')
    }

    /** Join as staff using an invite created by the owner. */
    a.acceptInvite = async () => {
      if (mode === 'demo') return
      const u = auth.currentUser
      if (!u || !u.email) throw new Error('not_signed_in')
      await ensureVerified(u)
      const key = u.email.toLowerCase()
      const inv = await getDoc(doc(db, 'salons', SALON_ID, 'invites', key))
      if (!inv.exists()) throw new Error('no_invite')
      const batch = writeBatch(db)
      batch.set(doc(db, 'salons', SALON_ID, 'members', u.uid), { role: inv.data().role || 'tech', name: u.displayName || u.email, email: key, createdAt: serverTimestamp(), createdBy: u.uid })
      batch.delete(doc(db, 'salons', SALON_ID, 'invites', key)) // single-use: a removed member cannot re-join with it
      await batch.commit()
    }

    a.seedStarter = async () => {
      const inv = buildSeedInventory()
      if (mode === 'demo') {
        setStaff((s) => ({ ...s, polishes: [...inv.map((p) => ({ id: demoId('p'), ...stampNew(p) })), ...s.polishes] }))
        return
      }
      const base = ['salons', SALON_ID]
      const all = [...inv.map((p) => ['polishes', p]), ...SEED_SERVICES.map((s) => ['services', s])]
      for (let i = 0; i < all.length; i += 400) {
        const batch = writeBatch(db)
        for (const [col, data] of all.slice(i, i + 400)) batch.set(doc(collection(db, ...base, col)), stampNew(data))
        await batch.commit()
      }
      await logAudit('import', 'polishes', '', `Starter catalog: ${inv.length} shades, ${SEED_SERVICES.length} services`)
      setTimeout(() => republishNow().catch(() => {}), 2500)
    }

    a.republish = republishNow
    a.resetDemo = () => mode === 'demo' && setStaff(buildDemoState())
    return a
  }, [mode, saveIn, removeIn, logAudit, scheduleRepublish, stampNew, stampUpdate, republishNow])

  // ------------------------------------------------------------ auth actions
  const authActions = useMemo(
    () => ({
      signInEmail: (email, pass) => signInWithEmailAndPassword(auth, email, pass),
      signUpEmail: async (email, pass, name) => {
        const cred = await createUserWithEmailAndPassword(auth, email, pass)
        if (name) await updateProfile(cred.user, { displayName: name })
        // Invited staff must own their email (security rules require a verified email to accept an invite)
        sendEmailVerification(cred.user).catch(() => {})
        return cred
      },
      signInGoogle: () => signInWithPopup(auth, new GoogleAuthProvider()),
      resetPassword: (email) => sendPasswordResetEmail(auth, email),
      signOut: () => (mode === 'firebase' ? fbSignOut(auth) : Promise.resolve()),
    }),
    [mode],
  )

  // ------------------------------------------------------------ what customers see
  const publicSite = useMemo(() => {
    if (mode === 'demo') {
      const s = staff
      return {
        salon: s.salon,
        polishes: s.polishes.filter((p) => p.active !== false),
        services: s.services.filter((x) => x.active !== false),
        configured: true,
      }
    }
    if (isStaff && staff.salon) {
      // staff always see their live data (no wait for republish)
      return {
        salon: staff.salon,
        polishes: staff.polishes.filter((p) => p.active !== false),
        services: staff.services.filter((x) => x.active !== false),
        configured: true,
      }
    }
    if (site) return { salon: site.salon || SEED_SALON, polishes: site.polishes || [], services: site.services || [], configured: true }
    return { salon: SEED_SALON, polishes: [], services: SEED_SERVICES.map((s, i) => ({ id: 'seed' + i, ...s })), configured: false }
  }, [mode, staff, site, isStaff])

  const value = {
    mode,
    salonId: SALON_ID,
    user,
    authReady,
    member,
    memberReady,
    role,
    isStaff,
    isOwner: role === 'owner',
    salonExists,
    site: publicSite,
    siteReady,
    staff,
    staffReady,
    error,
    clearError: () => setError(null),
    actions,
    auth: authActions,
    library: LIBRARY,
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData outside DataProvider')
  return ctx
}
