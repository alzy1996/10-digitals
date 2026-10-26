// The Studio: live camera or photo → AI nail fit → photo-real polish. One task per screen, thumb-reachable,
// big targets, instant feedback. Works for walk-in customers (QR) and for technicians on a tablet.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  ImagePlus,
  SwitchCamera,
  Zap,
  Sparkles,
  Columns2,
  Heart,
  Save,
  Hand,
  Eye,
  SunMedium,
  Move,
  Palette,
  Droplet,
  Shapes,
  Brush,
  Pointer,
  Video,
  AlertTriangle,
  Copy,
  Pipette,
  UserPlus,
  Shield,
} from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { useData } from '../../store/DataProvider'
import { Sheet, Spinner, Toggle, LangToggle, useToast } from '../../components/ui'
import { CatalogGrid } from '../../components/CatalogGrid'
import { TryOnEngine } from './TryOnEngine'
import { webgl2Supported, LIGHT_PRESETS } from '../../render/NailRenderer'
import { useCamera, useTilt, detectInAppBrowser, cameraSupported, loadImageFile } from './hooks'
import { useCatalog } from './useCatalog'
import { DEFAULT_DESIGN, withBase, withFinger, withFinish } from './design'
import { ShadeRail, FinishRail, ShapePanel, ArtPanel, FingerPanel } from './Panels'
import { FineTune } from './FineTune'
import { AnalysisSheet } from './AnalysisSheet'
import { CompareSheet } from './CompareSheet'
import { SaveSheet } from './SaveSheet'
import { sampleWhite } from '../../ai/skinAnalysis'
import { FINISH_BY_KEY } from '../../data/taxonomy'
import { hexToLab, deltaE2000 } from '../../lib/color'

const TABS = [
  { key: 'colors', icon: Palette },
  { key: 'finish', icon: Droplet },
  { key: 'shape', icon: Shapes },
  { key: 'art', icon: Brush },
  { key: 'fingers', icon: Pointer },
]

export default function TryOnStudio() {
  const { t, pick } = useI18n()
  const { site, isStaff } = useData()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const catalog = useCatalog()
  const cam = useCamera()
  const tiltCtl = useTilt()

  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const fileRef = useRef(null)
  const [engineState, setEngineState] = useState('init') // init | loading | ready | error | nogl
  const [status, setStatus] = useState('')
  const [view, setView] = useState('start') // start | live | photo
  const [photoSize, setPhotoSize] = useState(null)
  const [tab, setTab] = useState('colors')
  const [activeFinger, setActiveFinger] = useState(null)
  const [design, setDesign] = useState(() => {
    const id = params.get('shade')
    const p = id && catalog.byId.get(id)
    return p ? withBase(DEFAULT_DESIGN, p) : DEFAULT_DESIGN
  })
  const [sheet, setSheet] = useState(null) // catalog | ai | compare | save | light
  const [fineTune, setFineTune] = useState(false)
  const [ftVersion, setFtVersion] = useState(0)
  const [favorites, setFavorites] = useState([])
  const [compareSet, setCompareSet] = useState(null)
  const [opts, setOpts] = useState({ exposure: 1, illum: [1, 1, 1], forceVisible: false, smartFit: true, perfectFit: true, tint: LIGHT_PRESETS.salon })
  const [light, setLight] = useState('salon')
  const [substitute, setSubstitute] = useState(null)
  const [white, setWhite] = useState(null)
  const [calibrating, setCalibrating] = useState(false)
  const [holdOriginal, setHoldOriginal] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [fps, setFps] = useState(0)
  const [fit, setFit] = useState(null) // AI Perfect Fit progress
  const inApp = useMemo(() => detectInAppBrowser(), [])
  const dragTilt = useRef(null)
  const panelRef = useRef(null)
  const [panelH, setPanelH] = useState(0)

  // ---------------------------------------------------------------- engine lifecycle
  useEffect(() => {
    if (!webgl2Supported()) {
      setEngineState('nogl')
      return
    }
    let eng
    try {
      eng = new TryOnEngine(canvasRef.current, { onStatus: setStatus, onFrame: (f) => setFps(f.fps), onFit: setFit })
    } catch (e) {
      console.warn(e)
      setEngineState('nogl')
      return
    }
    engineRef.current = eng
    setEngineState('loading')
    eng
      .init()
      .then(() => setEngineState('ready'))
      .catch((e) => {
        console.warn(e)
        setEngineState('error')
      })
    return () => {
      eng.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setDesign(design)
  }, [design, engineState])

  useEffect(() => {
    engineRef.current?.setOptions({ ...opts, tilt: tiltCtl.tilt, showOriginal: holdOriginal, showEdges: fineTune })
  }, [opts, tiltCtl.tilt, holdOriginal, fineTune])

  useEffect(() => {
    if (fit && (fit.stage === 'done' || fit.stage === 'none' || fit.stage === 'error')) {
      const id = setTimeout(() => setFit(null), fit.stage === 'done' ? 2600 : 0)
      return () => clearTimeout(id)
    }
  }, [fit])

  // Photo mode: fit the picture into the space ABOVE the bottom panel (live mode stays full-bleed behind glass)
  useEffect(() => {
    const el = panelRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setPanelH(el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [view, fineTune])

  // ---------------------------------------------------------------- camera / photo
  const goLive = useCallback(async () => {
    if (inApp) toast(t('inapp_warning'), 'warn', 4000)
    const ok = await cam.start(cam.facing)
    if (!ok) return
    setFineTune(false)
    setView('live')
    engineRef.current?.startLive(cam.videoRef.current)
  }, [cam, inApp, t, toast])

  useEffect(() => {
    if (view === 'live' && cam.state === 'live' && engineState === 'ready') engineRef.current?.startLive(cam.videoRef.current)
  }, [view, cam.state, cam.facing, engineState, cam.videoRef])

  const freeze = useCallback(async () => {
    const eng = engineRef.current
    if (!eng) return
    const ok = await eng.freeze()
    if (ok) {
      setPhotoSize(eng.photoSize())
      setView('photo')
      cam.stop()
    }
  }, [cam])

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const img = await loadImageFile(f)
      cam.stop()
      const size = await engineRef.current.setPhoto(img)
      setPhotoSize(size)
      setView('photo')
      setFineTune(false)
    } catch {
      toast(t('bad_image'), 'error')
    }
  }

  // Any sheet that froze the live camera (AI, compare, save) leaves us in photo mode when it closes.
  useEffect(() => {
    const eng = engineRef.current
    if (!sheet && eng?.mode === 'photo' && view === 'live') {
      setPhotoSize(eng.photoSize())
      setView('photo')
      cam.stop()
    }
  }, [sheet, view, cam])

  // auto-start from URL (?mode=live|photo)
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current || engineState !== 'ready') return
    const m = params.get('mode')
    if (m === 'live') {
      autoStarted.current = true
      goLive()
    }
  }, [engineState, params, goLive])

  // ---------------------------------------------------------------- design actions
  const pickShade = useCallback(
    (p) => {
      setDesign((d) => (activeFinger ? withFinger(d, activeFinger, p) : withBase(d, p)))
      // Shelf Sync: sold out → suggest the closest bottle that IS on the shelf (ΔE2000)
      if (typeof p.stock === 'number' && p.stock <= 0) {
        const lab = hexToLab(p.hex)
        let best = null
        let bestD = Infinity
        for (const q of catalog.inventory) {
          if (q.id === p.id || !(typeof q.stock !== 'number' || q.stock > 0)) continue
          const d = deltaE2000(lab, hexToLab(q.hex)) + (q.finish === p.finish ? 0 : 4)
          if (d < bestD) {
            bestD = d
            best = q
          }
        }
        setSubstitute(best ? { from: p, to: best, d: Math.round(bestD * 10) / 10 } : null)
      } else setSubstitute(null)
    },
    [activeFinger, catalog.inventory],
  )

  const newCustomer = useCallback(() => {
    setDesign(DEFAULT_DESIGN)
    setFavorites([])
    setAnalysis(null)
    setActiveFinger(null)
    setSubstitute(null)
    setFineTune(false)
    setSheet(null)
    engineRef.current?.stop()
    engineRef.current?.resetCalibration()
    cam.stop()
    setView('start')
    toast(t('new_customer_ready'), 'info')
  }, [cam, t, toast])
  const pickFinish = (f) => setDesign((d) => withFinish(d, f, activeFinger))
  const patchDesign = (patch) => setDesign((d) => ({ ...d, ...patch }))

  const isFav = favorites.some((f) => JSON.stringify(f.design) === JSON.stringify(design))
  const toggleFav = () => {
    if (isFav) setFavorites((l) => l.filter((f) => JSON.stringify(f.design) !== JSON.stringify(design)))
    else {
      setFavorites((l) => [{ id: 'fav' + Date.now(), design }, ...l].slice(0, 6))
      toast(t('added_to_compare'), 'info', 1600)
    }
  }
  const favShades = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const f of favorites) {
      const b = f.design.base
      if (seen.has(b.polishId)) continue
      seen.add(b.polishId)
      const p = catalog.byId.get(b.polishId)
      if (p) out.push(p)
    }
    return out
  }, [favorites, catalog.byId])

  const openCompare = (polishes) => {
    const list = polishes ? polishes.map((p) => ({ id: p.id, design: withBase(design, p) })) : favorites.length ? favorites : [{ id: 'cur', design }]
    setCompareSet(list)
    setSheet('compare')
  }

  // ---------------------------------------------------------------- calibration (tap a white tissue)
  const onCanvasClick = async (e) => {
    if (!calibrating || view !== 'photo') return
    const eng = engineRef.current
    const r = canvasRef.current.getBoundingClientRect()
    const ps = eng.photoSize()
    const sc = Math.min(r.width / ps.width, r.height / ps.height)
    const ox = r.left + (r.width - ps.width * sc) / 2
    const oy = r.top + (r.height - ps.height * sc) / 2
    const px = (e.clientX - ox) / sc
    const py = (e.clientY - oy) / sc
    const data = eng.photoImageData(900)
    const w = sampleWhite(data.img, px * data.scale, py * data.scale, 7)
    setCalibrating(false)
    if (!w || !w.ok) {
      toast(t('calib_failed'), 'warn', 3200)
      return
    }
    const lum = 0.2126 * w.rgb[0] + 0.7152 * w.rgb[1] + 0.0722 * w.rgb[2]
    const illum = w.rgb.map((c) => Math.min(1.6, Math.max(0.5, c / lum)))
    setWhite(w.rgb)
    setOpts((o) => ({ ...o, illum, calibrated: true, exposure: Math.min(1.5, Math.max(0.35, lum / 0.85)) }))
    toast(t('calib_ok'))
  }
  const resetCalibration = () => {
    setWhite(null)
    setOpts((o) => ({ ...o, illum: [1, 1, 1], calibrated: false, exposure: 1 }))
  }

  // drag on the photo = tilt (see cat-eye / glitter / chrome move)
  const onPointerDown = (e) => {
    if (view !== 'photo' || fineTune || calibrating) return
    dragTilt.current = { x: e.clientX, y: e.clientY, t0: [...tiltCtl.tilt] }
  }
  const onPointerMove = (e) => {
    const d = dragTilt.current
    if (!d) return
    const nx = Math.max(-1, Math.min(1, d.t0[0] + (e.clientX - d.x) / 160))
    const ny = Math.max(-1, Math.min(1, d.t0[1] + (e.clientY - d.y) / 160))
    tiltCtl.setTilt([nx, ny])
  }
  const onPointerUp = () => {
    dragTilt.current = null
  }

  const curFinish = FINISH_BY_KEY[(activeFinger && design.perFinger[activeFinger]?.finish) || design.base.finish]
  const dynamicFinish = curFinish && (curFinish.sparkle > 0 || curFinish.mode > 0)
  const current = (activeFinger && design.perFinger[activeFinger]) || design.base
  const salonName = pick(site.salon || {}) || t('app_name')

  const statusText = {
    loading_ai: t('st_loading_ai'),
    no_hand: t('st_no_hand'),
    no_hand_photo: t('st_no_hand_photo'),
    show_back: t('st_show_back'),
    analyzing: t('st_analyzing'),
  }[status]

  // ---------------------------------------------------------------- render
  if (site.configured && site.salon?.publicTryOn === false && !isStaff) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-night px-6 text-center text-white">
        <p className="font-display text-[34px] font-semibold">{salonName}</p>
        <p className="max-w-sm text-[15px] text-white/70">{t('tryon_staff_only')}</p>
        <Link to="/" className="btn bg-white text-ink">
          {t('go_home')}
        </Link>
      </div>
    )
  }
  return (
    <div className="fixed inset-0 overflow-hidden bg-night text-white">
      <video ref={cam.videoRef} className="hidden" playsInline muted />
      <div className="absolute inset-x-0 top-0" style={{ bottom: view === 'photo' && !fineTune ? panelH : 0 }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className={`absolute inset-0 h-full w-full ${view === 'photo' ? 'object-contain' : 'object-cover'} ${view === 'live' && cam.mirrored ? 'mirror-x' : ''} ${view === 'start' ? 'opacity-0' : ''} ${calibrating ? 'cursor-crosshair' : ''}`}
        />
        {fineTune && view === 'photo' && (
          <FineTune engine={engineRef.current} canvas={canvasRef.current} photoSize={photoSize} version={ftVersion} bump={() => setFtVersion((v) => v + 1)} onDone={() => setFineTune(false)} />
        )}
      </div>

      {/* ------------------------------------------------ top bar */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-3 pt-safe">
        <button onClick={() => navigate(-1)} className="icon-btn glass-dark" aria-label={t('back')}>
          <ArrowLeft size={22} className="rtl:rotate-180" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-display text-[20px] font-semibold drop-shadow">{salonName}</p>
          {view === 'live' && fps > 0 && <p className="text-[10px] text-white/50">{fps} fps</p>}
        </div>
        {view === 'live' && cam.torch.supported && (
          <button onClick={cam.toggleTorch} className={`icon-btn glass-dark ${cam.torch.on ? 'text-champagne' : ''}`} aria-label={t('torch')}>
            <Zap size={20} />
          </button>
        )}
        {view === 'live' && (
          <button onClick={cam.flip} className="icon-btn glass-dark" aria-label={t('flip_camera')}>
            <SwitchCamera size={20} />
          </button>
        )}
        {isStaff && view !== 'start' && (
          <button onClick={newCustomer} className="icon-btn glass-dark" aria-label={t('new_customer')}>
            <UserPlus size={20} />
          </button>
        )}
        {view !== 'start' && (
          <button onClick={() => setSheet('light')} className="icon-btn glass-dark" aria-label={t('light_accuracy')}>
            <SunMedium size={20} />
          </button>
        )}
        <LangToggle dark />
      </header>

      {/* status pill */}
      {view !== 'start' && statusText && !fineTune && (
        <div className="pointer-events-none absolute inset-x-0 top-[76px] z-20 flex justify-center px-6">
          <span className="glass-dark flex animate-rise items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold">
            {status === 'loading_ai' || status === 'analyzing' ? <Spinner size={16} /> : <Hand size={16} />}
            {statusText}
          </span>
        </div>
      )}
      {view !== 'start' && light !== 'salon' && !fineTune && (
        <div className="pointer-events-none absolute start-3 top-[132px] z-20">
          <span className="glass-dark rounded-full px-3 py-1.5 text-[12px] font-bold">{t('light_' + light)}</span>
        </div>
      )}
      {view === 'photo' && fit && !fineTune && fit.stage !== 'none' && fit.stage !== 'error' && (
        <div className="pointer-events-none absolute inset-x-0 top-[76px] z-20 flex justify-center px-6">
          <span className={`flex animate-rise items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold shadow-lift ${fit.stage === 'done' ? 'bg-ok text-white' : 'glass-dark'}`}>
            {fit.stage === 'done' ? <Sparkles size={15} /> : <Spinner size={15} />}
            {fit.stage === 'done'
              ? t('fit_done', { n: fit.fitted })
              : fit.stage === 'download'
                ? t('fit_downloading', { p: Math.round(fit.p * 100) })
                : t('fit_working')}
          </span>
        </div>
      )}
      {calibrating && (
        <div className="pointer-events-none absolute inset-x-0 top-[76px] z-20 flex justify-center px-6">
          <span className="flex items-center gap-2 rounded-full bg-champagne px-4 py-2 text-[14px] font-bold text-ink shadow-lift">
            <Pipette size={16} />
            {t('calib_tap')}
          </span>
        </div>
      )}

      {/* side tools */}
      {view !== 'start' && !fineTune && (
        <div className="absolute end-3 top-[132px] z-20 flex flex-col gap-2">
          <button onClick={toggleFav} className={`icon-btn glass-dark ${isFav ? 'text-[#FF6B8B]' : ''}`} aria-label={t('add_to_compare')} aria-pressed={isFav}>
            <Heart size={20} fill={isFav ? 'currentColor' : 'none'} />
          </button>
          <button
            onPointerDown={() => setHoldOriginal(true)}
            onPointerUp={() => setHoldOriginal(false)}
            onPointerLeave={() => setHoldOriginal(false)}
            className={`icon-btn glass-dark ${holdOriginal ? 'bg-white text-ink' : ''}`}
            aria-label={t('hold_original')}
          >
            <Eye size={20} />
          </button>
          {view === 'photo' && (
            <button onClick={() => setFineTune(true)} className="icon-btn glass-dark" aria-label={t('adjust_nails')}>
              <Move size={20} />
            </button>
          )}
        </div>
      )}
      {view === 'photo' && dynamicFinish && !fineTune && (
        <p className="pointer-events-none absolute inset-x-0 z-10 text-center text-[12px] font-semibold text-white/80 drop-shadow" style={{ bottom: panelH + 8 }}>
          {t('drag_to_tilt')}
        </p>
      )}

      {/* ------------------------------------------------ start screen */}
      {view === 'start' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-y-auto px-5 pb-10 pt-24">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_30%,rgba(169,200,232,.22),transparent_70%),radial-gradient(70%_50%_at_50%_100%,rgba(107,74,58,.45),transparent_70%)]" />
          <div className="relative w-full max-w-md animate-rise text-center">
            <p className="eyebrow !text-champagne-300">{t('virtual_try_on')}</p>
            <h1 className="mt-2 font-display text-[44px] font-semibold leading-[1.02]">{t('studio_title')}</h1>
            <p className="mx-auto mt-3 max-w-sm text-[15px] text-white/70">{t('studio_sub')}</p>

            {engineState === 'nogl' && <ErrorBox text={t('err_webgl')} />}
            {engineState === 'error' && <ErrorBox text={t('err_ai_load')} />}
            {cam.state === 'denied' && <ErrorBox text={t('err_camera_denied')} />}
            {(cam.state === 'unsupported' || cam.state === 'error') && <ErrorBox text={t('err_camera')} />}
            {inApp && (
              <div className="mt-5 rounded-3xl border border-champagne/40 bg-champagne/10 p-4 text-start text-[14px]">
                <p className="font-bold text-champagne-300">{t('inapp_title')}</p>
                <p className="mt-1 text-white/75">{t('inapp_text')}</p>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(window.location.href)
                    toast(t('link_copied'))
                  }}
                  className="btn-glass mt-3 min-h-[44px] text-[14px]"
                >
                  <Copy size={16} />
                  {t('copy_link')}
                </button>
              </div>
            )}

            <div className="mt-7 flex flex-col gap-3">
              <button className="btn h-16 w-full bg-white text-[17px] text-ink shadow-lift" onClick={goLive} disabled={engineState !== 'ready' || !cameraSupported()}>
                {engineState === 'loading' ? <Spinner size={20} /> : <Video size={22} />}
                {engineState === 'loading' ? t('loading_ai_first') : t('start_live')}
              </button>
              <button className="btn-glass h-16 w-full text-[17px]" onClick={() => fileRef.current?.click()} disabled={engineState !== 'ready'}>
                <ImagePlus size={22} />
                {t('upload_photo')}
              </button>
            </div>
            <ul className="mt-7 grid grid-cols-2 gap-2 text-start text-[13px] text-white/75">
              {['tip_back', 'tip_light', 'tip_flat', 'tip_close'].map((k) => (
                <li key={k} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  {t(k)}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[12px] text-white/50">
              <Shield size={13} className="me-1 inline" />
              {t('privacy_on_device')}{' '}
              <Link to="/privacy" className="underline underline-offset-2">
                {t('privacy_link')}
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ bottom panel */}
      {view !== 'start' && !fineTune && (
        <div ref={panelRef} className="absolute inset-x-0 bottom-0 z-20">
          <div className="glass-dark mx-auto max-w-3xl rounded-t-4xl px-4 pb-safe pt-3 sm:mb-3 sm:rounded-4xl">
            {substitute && (
              <div className="mb-2 flex items-center gap-2 rounded-2xl bg-white/10 p-2 ps-3 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="font-bold text-[#FFB4A8]">{t('sold_out')}</span> · {t('closest_in_stock')}: <span className="font-bold">{pick(substitute.to)}</span>
                </span>
                <button
                  onClick={() => {
                    pickShade(substitute.to)
                    setSubstitute(null)
                  }}
                  className="chip chip-dark-on min-h-[40px] px-3"
                >
                  {t('try')}
                </button>
              </div>
            )}
            {/* current selection */}
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">
                  {activeFinger ? t('finger_' + activeFinger) + ' · ' : ''}
                  {pick(current || {})}
                </p>
                <p className="truncate text-[12px] text-white/60">
                  {[current?.brand, current?.code, pick(FINISH_BY_KEY[current?.finish] || {})].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto" role="tablist">
                {TABS.map((tb) => (
                  <button
                    key={tb.key}
                    role="tab"
                    aria-selected={tab === tb.key}
                    onClick={() => setTab(tb.key)}
                    className={`flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-full px-2.5 text-[12px] font-bold transition ${tab === tb.key ? 'bg-white text-ink' : 'bg-white/10 text-white/80'}`}
                    aria-label={t('tab_' + tb.key)}
                  >
                    <tb.icon size={17} />
                    <span className="hidden sm:inline">{t('tab_' + tb.key)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-[118px]">
              {tab === 'colors' && <ShadeRail shades={catalog.shades} design={design} activeFinger={activeFinger} onPick={pickShade} onOpenCatalog={() => setSheet('catalog')} favorites={favShades} />}
              {tab === 'finish' && <FinishRail design={design} activeFinger={activeFinger} onPick={pickFinish} />}
              {tab === 'shape' && <ShapePanel design={design} onChange={patchDesign} />}
              {tab === 'art' && <ArtPanel design={design} onChange={patchDesign} />}
              {tab === 'fingers' && (
                <FingerPanel
                  design={design}
                  activeFinger={activeFinger}
                  setActiveFinger={(f) => {
                    setActiveFinger(f)
                    if (f) setTab('colors')
                  }}
                  onClear={() => {
                    setDesign((d) => ({ ...d, perFinger: {} }))
                    setActiveFinger(null)
                  }}
                />
              )}
            </div>

            {/* dock */}
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
              <DockButton icon={ImagePlus} label={t('photo')} onClick={() => fileRef.current?.click()} />
              <DockButton icon={Sparkles} label={t('ai_match')} onClick={() => setSheet('ai')} accent />
              <button
                onClick={view === 'live' ? freeze : goLive}
                className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-lift transition active:scale-95"
                aria-label={view === 'live' ? t('freeze') : t('back_to_live')}
              >
                <span className={`absolute inset-1 rounded-full border-2 border-ink/10 ${view === 'live' ? 'animate-pulseRing' : ''}`} />
                {view === 'live' ? <Camera size={28} /> : <Video size={26} />}
              </button>
              <DockButton icon={Columns2} label={t('compare')} onClick={() => openCompare()} badge={favorites.length || null} />
              <DockButton icon={Save} label={t('save')} onClick={() => setSheet('save')} />
            </div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {/* ------------------------------------------------ sheets */}
      <Sheet open={sheet === 'catalog'} onClose={() => setSheet(null)} title={t('catalog')} wide>
        <CatalogGrid
          shades={catalog.shades}
          library={catalog.library}
          hasInventory={catalog.hasInventory}
          salon={catalog.salon}
          selectedId={current?.polishId}
          pickLabel={t('try')}
          compact
          onPick={(p) => {
            pickShade(p)
            setSheet(null)
          }}
        />
      </Sheet>

      <AnalysisSheet
        open={sheet === 'ai'}
        onClose={() => setSheet(null)}
        engine={engineRef.current}
        white={white}
        catalog={catalog.shades}
        initial={analysis}
        onResult={setAnalysis}
        onApplyShade={(p) => {
          setDesign((d) => withBase(d, p))
          setSheet(null)
          if (engineRef.current?.mode === 'photo') {
            setPhotoSize(engineRef.current.photoSize())
            setView('photo')
            cam.stop()
          }
        }}
        onApplyShape={(shape, len) => {
          const l = { short: 0.18, medium: 0.45, long: 0.75 }[len] ?? 0.45
          setDesign((d) => ({ ...d, shape, length: l }))
          setSheet(null)
          if (engineRef.current?.mode === 'photo') {
            setPhotoSize(engineRef.current.photoSize())
            setView('photo')
            cam.stop()
          }
        }}
        onCompare={(polishes) => {
          if (engineRef.current?.mode === 'photo') {
            setPhotoSize(engineRef.current.photoSize())
            setView('photo')
            cam.stop()
          }
          openCompare(polishes)
        }}
        onCalibrate={() => {
          setSheet(null)
          if (engineRef.current?.mode === 'photo') {
            setPhotoSize(engineRef.current.photoSize())
            setView('photo')
            cam.stop()
          }
          setCalibrating(true)
        }}
      />

      <CompareSheet
        open={sheet === 'compare'}
        onClose={() => {
          setSheet(null)
          if (engineRef.current?.mode === 'photo' && view !== 'photo') {
            setPhotoSize(engineRef.current.photoSize())
            setView('photo')
            cam.stop()
          }
        }}
        engine={engineRef.current}
        variants={compareSet || []}
        onApply={(d) => {
          setDesign(d)
          setSheet(null)
        }}
        onRemove={favorites.length ? (id) => setFavorites((l) => l.filter((f) => f.id !== id)) : null}
      />

      <SaveSheet
        open={sheet === 'save'}
        onClose={() => {
          setSheet(null)
          if (engineRef.current?.mode === 'photo' && view !== 'photo') {
            setPhotoSize(engineRef.current.photoSize())
            setView('photo')
            cam.stop()
          }
        }}
        engine={engineRef.current}
        design={design}
        analysis={analysis}
      />

      <Sheet open={sheet === 'light'} onClose={() => setSheet(null)} title={t('light_accuracy')} dark>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-[14px] font-semibold">{t('see_it_under')}</p>
            <div className="flex gap-2">
              {Object.keys(LIGHT_PRESETS).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setLight(k)
                    setOpts((o) => ({ ...o, tint: LIGHT_PRESETS[k] }))
                  }}
                  className={`chip flex-1 justify-center ${light === k ? 'chip-dark-on' : 'chip-dark-off'}`}
                >
                  {t('light_' + k)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-white/55">{t('light_hint')}</p>
          </div>
          <div>
            <p className="mb-1 flex items-center justify-between text-[14px] font-semibold">
              <span>{t('brightness_match')}</span>
              <span className="text-white/60">{Math.round(opts.exposure * 100)}%</span>
            </p>
            <input type="range" min="0.35" max="1.5" step="0.01" value={opts.exposure} onChange={(e) => setOpts((o) => ({ ...o, exposure: Number(e.target.value) }))} className="w-full accent-champagne" />
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="font-bold">{t('true_color')}</p>
            <p className="mt-1 text-[13px] text-white/70">{t('true_color_text')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn bg-champagne text-ink"
                onClick={async () => {
                  if (view === 'live') await freeze()
                  setSheet(null)
                  setCalibrating(true)
                }}
              >
                <Pipette size={18} />
                {white ? t('recalibrate') : t('calibrate')}
              </button>
              {white && (
                <button className="btn-glass" onClick={resetCalibration}>
                  {t('reset')}
                </button>
              )}
            </div>
          </div>
          <Toggle
            dark
            checked={opts.forceVisible}
            onChange={async (v) => {
              setOpts((o) => ({ ...o, forceVisible: v }))
              if (view === 'photo') {
                engineRef.current.setOptions({ forceVisible: v })
                await engineRef.current.redetect()
              }
            }}
            label={t('always_show_nails')}
          />
          <Toggle
            dark
            checked={opts.perfectFit}
            onChange={(v) => {
              setOpts((o) => ({ ...o, perfectFit: v }))
              engineRef.current?.setOptions({ perfectFit: v })
              if (v && view === 'photo') engineRef.current?.perfectFit()
            }}
            label={t('perfect_fit_toggle')}
          />
          <Toggle
            dark
            checked={opts.smartFit}
            onChange={async (v) => {
              setOpts((o) => ({ ...o, smartFit: v }))
              if (view === 'photo') {
                engineRef.current.setOptions({ smartFit: v })
                await engineRef.current.redetect()
              }
            }}
            label={t('smart_fit')}
          />
          {!tiltCtl.enabled && (
            <button className="btn-glass" onClick={tiltCtl.enable}>
              {t('enable_tilt')}
            </button>
          )}
          <p className="text-[12px] text-white/50">{t('accuracy_note')}</p>
        </div>
      </Sheet>

      {view === 'start' && (
        <Link to="/catalog" className="absolute bottom-6 start-1/2 z-20 -translate-x-1/2 text-[14px] font-semibold text-white/70 underline-offset-4 hover:underline rtl:translate-x-1/2">
          {t('browse_catalog')}
        </Link>
      )}
    </div>
  )
}

function DockButton({ icon: Icon, label, onClick, accent = false, badge = null }) {
  return (
    <button onClick={onClick} className="relative flex min-w-[56px] flex-col items-center gap-1 rounded-2xl px-1 py-1 text-[11px] font-bold text-white/85 active:scale-95">
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${accent ? 'bg-gradient-to-br from-champagne to-mocha-300 text-ink' : 'bg-white/10'}`}>
        <Icon size={20} />
      </span>
      {label}
      {badge ? <span className="absolute end-1 top-0 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FF6B8B] px-1 text-[11px] text-white">{badge}</span> : null}
    </button>
  )
}

function ErrorBox({ text }) {
  return (
    <div className="mt-5 flex items-start gap-3 rounded-3xl border border-bad/40 bg-bad/15 p-4 text-start text-[14px]">
      <AlertTriangle className="mt-0.5 shrink-0 text-[#FF8A80]" size={20} />
      <span>{text}</span>
    </div>
  )
}
