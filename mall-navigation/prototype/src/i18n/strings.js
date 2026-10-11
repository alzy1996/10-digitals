/**
 * UI strings and number formatting, English + Arabic (Gulf-friendly Modern Standard Arabic).
 * Formatters: formatDistance, formatDuration, and (v0.2 Walk view) formatClock, formatSteps, formatMinutesParts.
 * Pure JS, no DOM.
 *
 * - `t(key, lang, params?)`: looks up the table below; `{name}` placeholders are filled from `params`.
 *   In Arabic, numeric params are written with Arabic-Indic digits. Unknown key -> the key itself (so a
 *   missing string is visible, never blank). Missing Arabic -> English.
 * - Direction comes from a locale -> direction map (PLAN.md section 9), not from `lang === 'ar'`.
 * - Arabic numbers use Arabic-Indic digits (٠-٩) and the Arabic decimal separator (٫).
 */

/** Locale -> writing direction. Add Urdu/Farsi here later without touching callers. */
const DIRECTION = Object.freeze({ ar: 'rtl', fa: 'rtl', ur: 'rtl', he: 'rtl', en: 'ltr' })

/** Languages this prototype ships. */
export const LANGS = Object.freeze(['en', 'ar'])

/**
 * @param {string} lang
 * @returns {'rtl' | 'ltr'}
 */
export function dirFor(lang) {
  const base = String(lang ?? '').toLowerCase().split(/[-_]/)[0]
  return DIRECTION[base] ?? 'ltr'
}

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

/**
 * Replace ASCII digits 0-9 with Arabic-Indic digits. Everything else is left as it is.
 * @param {string | number} str
 * @returns {string}
 */
export function toArabicDigits(str) {
  return String(str ?? '').replace(/[0-9]/g, (d) => AR_DIGITS[d.charCodeAt(0) - 48])
}

function isArabic(lang) {
  return String(lang ?? '').toLowerCase().split(/[-_]/)[0] === 'ar'
}

/**
 * Walking distance for people, not surveyors: under 20 m to the metre, under 200 m to 5 m, then to 10 m,
 * 1 km and up in km with one decimal. "40 m" / «٤٠ م».
 * @param {number} m metres
 * @param {'en'|'ar'} lang
 */
export function formatDistance(m, lang) {
  const metres = Number.isFinite(m) ? Math.max(0, m) : 0
  const ar = isArabic(lang)
  if (metres >= 1000) {
    const km = (Math.round(metres / 100) / 10).toFixed(1).replace(/\.0$/, '')
    return ar ? `${toArabicDigits(km.replace('.', '٫'))} كم` : `${km} km`
  }
  let rounded
  if (metres < 20) rounded = Math.round(metres)
  else if (metres < 200) rounded = Math.round(metres / 5) * 5
  else rounded = Math.round(metres / 10) * 10
  return ar ? `${toArabicDigits(rounded)} م` : `${rounded} m`
}

/**
 * Rough walking time. Under 30 s -> "under 1 min"; otherwise whole minutes.
 * English: "about 1 min", "about 4 min".
 * Arabic with correct number agreement: 1 «حوالي دقيقة», 2 «حوالي دقيقتين», 3-10 «حوالي ٥ دقائق»,
 * 11+ «حوالي ١٥ دقيقة».
 * @param {number} s seconds
 * @param {'en'|'ar'} lang
 */
export function formatDuration(s, lang) {
  const seconds = Number.isFinite(s) ? Math.max(0, s) : 0
  const minutes = Math.round(seconds / 60)
  if (isArabic(lang)) {
    if (minutes < 1) return 'أقل من دقيقة'
    if (minutes === 1) return 'حوالي دقيقة'
    if (minutes === 2) return 'حوالي دقيقتين'
    if (minutes <= 10) return `حوالي ${toArabicDigits(minutes)} دقائق`
    return `حوالي ${toArabicDigits(minutes)} دقيقة`
  }
  if (minutes < 1) return 'under 1 min'
  return `about ${minutes} min`
}

/**
 * Wall-clock time "HH:MM" (24 h) in a time zone (the venue's, `Asia/Muscat`), Arabic-Indic digits in Arabic:
 * "17:42" / «١٧:٤٢». An unknown time zone falls back to the phone's own clock.
 * @param {number} epochMs
 * @param {'en'|'ar'} lang
 * @param {string} [timeZone]
 */
export function formatClock(epochMs, lang, timeZone = 'Asia/Muscat') {
  const date = new Date(Number.isFinite(epochMs) ? epochMs : Date.now())
  const pad = (n) => String(n).padStart(2, '0')
  let hh = pad(date.getHours())
  let mm = pad(date.getMinutes())
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
    hh = parts.find((p) => p.type === 'hour')?.value ?? hh
    mm = parts.find((p) => p.type === 'minute')?.value ?? mm
    if (hh === '24') hh = '00'
  } catch {
    // unknown time zone: keep the phone's clock
  }
  const s = `${hh}:${mm}`
  return isArabic(lang) ? toArabicDigits(s) : s
}

/**
 * Footsteps left, as an estimate (0.75 m a step): rounded to 5 under 100 steps, to 10 from 100.
 * Always shown with "≈" (it is an estimate): "≈ 130" / «≈ ١٣٠» (no-break space after the sign).
 * @param {number} metres
 * @param {'en'|'ar'} lang
 */
export function formatSteps(metres, lang) {
  const steps = (Number.isFinite(metres) ? Math.max(0, metres) : 0) / 0.75
  const rounded = steps < 100 ? Math.round(steps / 5) * 5 : Math.round(steps / 10) * 10
  return `≈ ${isArabic(lang) ? toArabicDigits(rounded) : rounded}`
}

/**
 * Walking minutes split for light numerals: { value: '2', unit: 'min' } / { value: '٢', unit: 'د' };
 * under half a minute '<1' / '<١'.
 * @param {number} seconds
 * @param {'en'|'ar'} lang
 */
export function formatMinutesParts(seconds, lang) {
  const minutes = Math.round((Number.isFinite(seconds) ? Math.max(0, seconds) : 0) / 60)
  const ar = isArabic(lang)
  const value = minutes < 1 ? '<1' : String(minutes)
  return { value: ar ? toArabicDigits(value) : value, unit: ar ? 'د' : 'min' }
}

/**
 * The string table. Keep both languages side by side; Arabic is written for Gulf readers in plain MSA.
 * Placeholders: {place} {level} {bay} {zone} {n} {total} {q} {time} {distance} {duration} {name}.
 */
export const STRINGS = Object.freeze({
  // App shell
  'app.name': { en: 'Dallni', ar: 'دلّني' },
  'app.tagline': { en: 'Find your way in the mall', ar: 'اعرف طريقك داخل المول' },
  'app.badge': { en: 'PROTOTYPE · SIMULATION', ar: 'نموذج أولي · محاكاة' },
  'app.fictional': { en: 'Fictional demo mall. Not a real place.', ar: 'مول تجريبي خيالي، ليس مكاناً حقيقياً.' },
  'app.loading': { en: 'Loading the mall map…', ar: 'جارٍ تحميل خريطة المول…' },
  'app.loadError': { en: "Couldn't load the mall map.", ar: 'تعذّر تحميل خريطة المول.' },
  'app.retry': { en: 'Try again', ar: 'حاول مرة أخرى' },
  'app.no3d': { en: "The 3D map can't run on this phone. Everything below still works.", ar: 'لا يمكن تشغيل الخريطة ثلاثية الأبعاد على هذا الهاتف. كل ما في الأسفل يعمل كالمعتاد.' },
  'app.no3dLoad': { en: "Couldn't load the 3D map.", ar: 'تعذّر تحميل الخريطة ثلاثية الأبعاد.' },
  'lang.toggle': { en: 'ع', ar: 'EN' },
  // The language switch is labelled in the language it switches TO, so people who cannot read the current
  // language can still find it.
  'lang.toggleLabel': { en: 'العربية', ar: 'English' },

  // Common
  'common.back': { en: 'Back', ar: 'رجوع' },
  'common.close': { en: 'Close', ar: 'إغلاق' },
  'common.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'common.done': { en: 'Done', ar: 'تم' },
  'common.undo': { en: 'Undo', ar: 'تراجع' },
  'common.level': { en: 'Level', ar: 'المستوى' },
  'common.stepFree': { en: 'Step-free', ar: 'بدون درج' },
  'common.openNow': { en: 'Open now', ar: 'مفتوح الآن' },
  'common.closedNow': { en: 'Closed now', ar: 'مغلق الآن' },
  'common.openUntil': { en: 'Open until {time}', ar: 'مفتوح حتى {time}' },
  'common.opensAt': { en: 'Opens at {time}', ar: 'يفتح الساعة {time}' },
  'common.offline': { en: 'Offline: map saved on this phone', ar: 'بدون اتصال: الخريطة محفوظة على هذا الهاتف' },

  // Home
  'home.title': { en: 'Where to?', ar: 'إلى أين؟' },
  'home.youAreHere': { en: "You're at {place}", ar: 'أنت عند {place}' },
  'home.youAreHereUnknown': { en: 'Where are you? Scan a sign', ar: 'أين أنت؟ امسح لافتة' },
  'home.searchPlaceholder': { en: 'Search shops, food…', ar: 'ابحث عن محل أو مطعم' },
  'home.searchLabel': { en: 'Search the mall', ar: 'ابحث في المول' },
  'home.myCar': { en: 'My car · {bay}', ar: 'سيارتي · {bay}' },
  'home.saveCar': { en: 'Save my car', ar: 'احفظ موقف سيارتي' },
  'home.scan': { en: 'Scan a sign', ar: 'امسح لافتة' },

  // The six home tiles
  'tile.food': { en: 'Food', ar: 'مطاعم' },
  'tile.restrooms': { en: 'Restrooms', ar: 'دورات المياه' },
  'tile.prayer': { en: 'Prayer', ar: 'المصلى' },
  'tile.pharmacy': { en: 'Pharmacy', ar: 'صيدلية' },
  'tile.kids': { en: 'Kids', ar: 'الأطفال' },
  'tile.exit': { en: 'Exit / Taxi', ar: 'مخرج/تاكسي' },

  // Search
  'search.title': { en: 'Search', ar: 'بحث' },
  'search.resultsFor': { en: 'Results for “{q}”', ar: 'نتائج «{q}»' },
  'search.noResults': { en: 'Not in this mall', ar: 'غير موجود في هذا المول' },
  'search.tryInstead': { en: 'Try one of these', ar: 'جرّب أحد هذه' },
  'search.nearest': { en: 'Nearest first', ar: 'الأقرب أولاً' },
  'search.allIn': { en: 'All {name}', ar: 'كل {name}' },

  // Categories (occupants)
  'category.fashion': { en: 'Fashion', ar: 'أزياء' },
  'category.food': { en: 'Food', ar: 'مطاعم' },
  'category.cafe': { en: 'Cafés', ar: 'مقاهي' },
  'category.electronics': { en: 'Electronics', ar: 'إلكترونيات' },
  'category.beauty': { en: 'Beauty & perfume', ar: 'تجميل وعطور' },
  'category.kids': { en: 'Kids', ar: 'أطفال' },
  'category.grocery': { en: 'Grocery', ar: 'بقالة' },
  'category.entertainment': { en: 'Entertainment', ar: 'ترفيه' },
  'category.home': { en: 'Home', ar: 'المنزل' },
  'category.health': { en: 'Health', ar: 'صحة' },
  'category.services': { en: 'Services', ar: 'خدمات' },
  'category.parking': { en: 'Parking', ar: 'المواقف' },
  'category.restrooms': { en: 'Restrooms', ar: 'دورات المياه' },
  'category.prayer': { en: 'Prayer rooms', ar: 'المصليات' },
  'category.exits': { en: 'Exits & taxi', ar: 'المخارج والتاكسي' },

  // Place
  'place.go': { en: 'GO', ar: 'انطلق' },
  'place.onLevel': { en: 'On {level}', ar: 'في {level}' },
  'place.walk': { en: '{duration} walk', ar: '{duration} مشياً' },
  'place.stepFreeToggle': { en: 'Step-free route (lifts, no stairs or escalators)', ar: 'مسار بدون درج (مصاعد فقط، بدون سلالم)' },
  'place.stepFreeOn': { en: 'Step-free route on', ar: 'المسار بدون درج مفعّل' },
  'place.noRoute': { en: 'No route found from here.', ar: 'لا يوجد مسار من هنا.' },
  'place.noRouteStepFree': { en: 'No step-free route found. Turn step-free off to see all routes.', ar: 'لا يوجد مسار بدون درج. أوقف خيار «بدون درج» لرؤية كل المسارات.' },
  'place.hours': { en: 'Hours', ar: 'ساعات العمل' },
  'place.via': { en: 'Via {name}', ar: 'عبر {name}' },

  // Navigate
  'nav.step': { en: 'Step {n} of {total}', ar: 'الخطوة {n} من {total}' },
  'nav.next': { en: 'Next', ar: 'التالي' },
  'nav.prev': { en: 'Back', ar: 'السابق' },
  'nav.end': { en: 'End route', ar: 'إنهاء المسار' },
  'nav.lost': { en: "I'm lost", ar: 'تهت' },
  'nav.wrongStep': { en: 'This step was wrong', ar: 'هذه الخطوة خاطئة' },
  'nav.remaining': { en: '{distance} · {duration} left', ar: 'متبقٍ {distance} · {duration}' },
  'nav.floorCheck': { en: 'Are you on {level} now?', ar: 'هل أنت الآن في {level}؟' },
  'nav.yes': { en: 'Yes', ar: 'نعم' },
  'nav.noOtherFloor': { en: 'No, another floor', ar: 'لا، طابق آخر' },
  'nav.stepList': { en: 'All steps', ar: 'كل الخطوات' },

  // Simulator
  'sim.label': { en: 'SIMULATION', ar: 'محاكاة' },
  'sim.notLive': { en: 'Simulated walk, not your live position', ar: 'مشي محاكى، وليس موقعك الفعلي' },
  'sim.simulate': { en: 'Simulate', ar: 'محاكاة' },
  'sim.play': { en: 'Play', ar: 'تشغيل' },
  'sim.pause': { en: 'Pause', ar: 'إيقاف مؤقت' },
  'sim.restart': { en: 'Restart', ar: 'إعادة' },
  'sim.speed': { en: 'Speed', ar: 'السرعة' },
  'sim.speed1': { en: '1×', ar: '١×' },
  'sim.speed2': { en: '2×', ar: '٢×' },
  'sim.speed4': { en: '4×', ar: '٤×' },
  'sim.onLift': { en: 'Riding the lift…', ar: 'داخل المصعد…' },
  'sim.onEscalator': { en: 'On the escalator…', ar: 'على السلم المتحرك…' },
  'sim.onStairs': { en: 'On the stairs…', ar: 'على الدرج…' },

  // Map views
  'view.overview': { en: 'Overview', ar: 'نظرة عامة' },
  'view.floor': { en: 'Floor', ar: 'الطابق' },
  'view.top': { en: '2D', ar: 'خريطة مسطحة' },
  'view.recenter': { en: 'Recentre', ar: 'إعادة التوسيط' },
  'view.zoomIn': { en: 'Zoom in', ar: 'تكبير' },
  'view.zoomOut': { en: 'Zoom out', ar: 'تصغير' },
  'view.levels': { en: 'Levels', ar: 'الطوابق' },
  'theme.sunlight': { en: 'Sunlight', ar: 'ضوء الشمس' },
  'theme.basement': { en: 'Basement', ar: 'القبو' },

  // Arrived
  'arrived.title': { en: "You've arrived", ar: 'وصلت' },
  'arrived.at': { en: "You've arrived · {place}", ar: 'وصلت · {place}' },
  'arrived.foundIt': { en: 'Found it ✓', ar: 'وجدته ✓' },
  'arrived.backToCar': { en: 'Back to my car', ar: 'العودة إلى سيارتي' },
  'arrived.anotherShop': { en: 'Another shop', ar: 'محل آخر' },

  // Car
  'car.title': { en: 'My car', ar: 'سيارتي' },
  'car.scanPlate': { en: 'Scan parking plate', ar: 'امسح لوحة الموقف' },
  'car.scanSimulated': { en: 'Simulated scan: pick the plate next to your car', ar: 'مسح محاكى: اختر اللوحة القريبة من سيارتك' },
  'car.save': { en: 'Save my car here', ar: 'احفظ سيارتي هنا' },
  'car.saved': { en: 'Car saved', ar: 'تم حفظ موقف السيارة' },
  'car.savedNote': { en: 'Kept on this phone for this visit only', ar: 'محفوظ على هذا الهاتف لهذه الزيارة فقط' },
  'car.takeMeThere': { en: 'Take me there', ar: 'خذني إليها' },
  'car.bay': { en: 'Bay {bay}', ar: 'الموقف {bay}' },
  'car.zone': { en: 'Zone', ar: 'المنطقة' },
  'car.level': { en: 'Level', ar: 'المستوى' },
  'car.none': { en: 'No car saved yet', ar: 'لم تحفظ موقف سيارتك بعد' },
  'car.change': { en: 'Change spot', ar: 'تغيير الموقف' },
  'car.forget': { en: 'Forget my car', ar: 'احذف موقف سيارتي' },

  // Scan / you-are-here
  'scan.title': { en: 'Where are you?', ar: 'أين أنت؟' },
  'scan.subtitle': { en: 'Pick the sign in front of you', ar: 'اختر اللافتة التي أمامك' },
  'scan.simNote': { en: 'Simulated: in the real app you scan the QR sign', ar: 'محاكاة: في التطبيق الفعلي تمسح رمز الاستجابة السريعة على اللافتة' },
  'scan.tapOnMap': { en: 'Or tap a QR pin on the map', ar: 'أو المس علامة اللوحة على الخريطة' },
  'scan.imHere': { en: "I'm here", ar: 'أنا هنا' },
  'scan.exact': { en: 'Exact · from a sign', ar: 'دقيق · من لافتة' },
  'scan.exactShort': { en: 'Exact', ar: 'دقيق' },
  'scan.estimated': { en: 'Estimated', ar: 'تقريبي' },
  'scan.lastSeen': { en: 'Last seen', ar: 'آخر موقع معروف' },

  // UI + simulator additions (src/ui, appended)
  'conn.escalatorUp': { en: 'the up escalator', ar: 'السلم المتحرك الصاعد' },
  'conn.escalatorDown': { en: 'the down escalator', ar: 'السلم المتحرك النازل' },
  'home.change': { en: 'Change', ar: 'تغيير' },
  'home.tiles': { en: 'Quick picks', ar: 'اختيارات سريعة' },
  'nav.nowOn': { en: 'Now on {level}', ar: 'أنت الآن في {level}' },
  'nav.total': { en: '{distance} · {duration} in total', ar: '{distance} · {duration} إجمالاً' },
  'nav.press': { en: 'Press', ar: 'اضغط' },
  'nav.stepCard': { en: 'Current step', ar: 'الخطوة الحالية' },
  'sim.walk': { en: 'Simulate walk', ar: 'محاكاة المشي' },
  'sim.resume': { en: 'Resume walk', ar: 'متابعة المشي' },
  'sim.replay': { en: 'Replay walk', ar: 'إعادة المشي' },
  'sim.waitLift': { en: 'Waiting for the lift…', ar: 'بانتظار المصعد…' },
  'sim.speedLabel': { en: 'Simulation speed', ar: 'سرعة المحاكاة' },
  'sim.arrivedNote': { en: 'Simulated arrival, not your live position', ar: 'وصول محاكى، وليس موقعك الفعلي' },
  'car.scanIntro': { en: 'Find the plate on the pillar nearest your car.', ar: 'ابحث عن اللوحة على أقرب عمود لسيارتك.' },
  'car.confirm': { en: 'Is this the plate next to your car?', ar: 'هل هذه اللوحة بجانب سيارتك؟' },
  'car.savedAt': { en: 'Saved at {time}', ar: 'حُفظ الساعة {time}' },
  'car.otherPlate': { en: 'Pick another plate', ar: 'اختر لوحة أخرى' },
  'car.fromHere': { en: '{duration} from {place}', ar: '{duration} من {place}' },
  'scan.set': { en: 'Start point: {place}', ar: 'نقطة البداية: {place}' },
  'view.label': { en: 'Map view', ar: 'عرض الخريطة' },
  'search.clear': { en: 'Clear search', ar: 'مسح البحث' },
  'search.places': { en: '{n} places', ar: 'عدد الأماكن: {n}' },
  'place.from': { en: 'From {place}', ar: 'من {place}' },
  'common.openUntilMidnight': { en: 'Open until midnight', ar: 'مفتوح حتى منتصف الليل' },
  // QA round 1 additions
  'nav.ended': { en: 'Route ended', ar: 'انتهى المسار' },
  'view.button': { en: 'View', ar: 'العرض' },
  'sim.notLiveShort': { en: 'Not your live position', ar: 'ليس موقعك الفعلي' },
  'sim.notLiveTiny': { en: 'Not live', ar: 'ليس مباشراً' },
  'sim.speedNow': { en: 'Simulation speed {speed}, tap to change', ar: 'سرعة المحاكاة {speed}، المس للتغيير' },
  'car.paintedCode': { en: 'As painted on the floor', ar: 'كما هو مكتوب على الأرض' },
  'connector.lift': { en: 'Lift', ar: 'مصعد' },
  'connector.escalator': { en: 'Escalator', ar: 'سلم متحرك' },
  'connector.stairs': { en: 'Stairs', ar: 'درج' },

  // v0.2: first-person Walk view HUD (DESIGN-GLASS.md Appendix A)
  'view.fpv': { en: 'Walk view', ar: 'منظور المشي' },
  'hud.openMap': { en: 'Map', ar: 'الخريطة' },
  'hud.end': { en: 'End', ar: 'إنهاء' },
  'hud.summaryLabel': { en: 'Trip summary', ar: 'ملخص الرحلة' },
  'hud.arrival': { en: 'Arrival', ar: 'الوصول' },
  'hud.distance': { en: 'Distance', ar: 'المسافة' },
  'hud.steps': { en: 'Steps', ar: 'الخطوات' },
  'hud.summary': { en: '{time} arrival · {distance} left', ar: 'الوصول {time} · متبقٍ {distance}' },
  'hud.turn.straight': { en: 'Keep straight', ar: 'تابع مباشرة' },
  'hud.turn.slight_left': { en: 'Bear left', ar: 'انحرف يساراً' },
  'hud.turn.slight_right': { en: 'Bear right', ar: 'انحرف يميناً' },
  'hud.turn.left': { en: 'Turn left', ar: 'انعطف يساراً' },
  'hud.turn.right': { en: 'Turn right', ar: 'انعطف يميناً' },
  'hud.turn.uturn': { en: 'Turn around', ar: 'استدر للخلف' },
  'hud.verbAt': { en: '{verb} at', ar: '{verb} عند' },
  'hud.verbPast': { en: '{verb} past', ar: '{verb} بجانب' },
  'hud.andStraight': { en: 'and {distance} straight', ar: 'ثم {distance} مباشرة' },
  'hud.thenArrive': { en: 'then you arrive', ar: 'ثم تصل' },
  'hud.face': { en: 'Face', ar: 'اتجه نحو' },
  'hud.arriveAt': { en: 'Arrive at', ar: 'الوصول إلى' },
  'hud.escalatorUp': { en: 'Escalator up', ar: 'السلم المتحرك صعوداً' },
  'hud.escalatorDown': { en: 'Escalator down', ar: 'السلم المتحرك نزولاً' },
  'hud.escalatorUpTo': { en: 'Escalator up to', ar: 'السلم المتحرك صعوداً إلى' },
  'hud.escalatorDownTo': { en: 'Escalator down to', ar: 'السلم المتحرك نزولاً إلى' },
  'hud.stairsUp': { en: 'Stairs up', ar: 'الدرج صعوداً' },
  'hud.stairsDown': { en: 'Stairs down', ar: 'الدرج نزولاً' },
  'hud.stairsTo': { en: 'Stairs to', ar: 'الدرج إلى' },
  'hud.liftTo': { en: 'Take {name} to', ar: 'استقل {name} إلى' },
  'hud.toLevel': { en: 'to {level}', ar: 'إلى {level}' },
  'hud.liftRide': { en: '{name} → {level}', ar: '{name} إلى {level}' },
  'hud.stairsRide': { en: 'Stairs → {level}', ar: 'الدرج إلى {level}' },
  'hud.side.left': { en: 'on your left', ar: 'على يسارك' },
  'hud.side.right': { en: 'on your right', ar: 'على يمينك' },
  'hud.side.ahead': { en: 'straight ahead', ar: 'أمامك مباشرة' },
  'hud.side.behind': { en: 'behind you', ar: 'خلفك' },
  'hud.behind': { en: 'The turn is behind you', ar: 'المنعطف خلفك' },
  'hud.north': { en: 'N', ar: 'ش' },
  'hud.northLabel': { en: 'North', ar: 'الشمال' },
  // v0.2 UI builder additions: the condensed turn card keeps the step text's own preposition ("towards" / "after"),
  // the lift button to press, and the Place screen's light-numeral minutes ("2" + "min walk")
  'hud.verbTowards': { en: '{verb} towards', ar: '{verb} باتجاه' },
  'hud.verbAfter': { en: '{verb} after', ar: '{verb} بعد' },
  'hud.press': { en: 'Press “{label}”', ar: 'اضغط «{label}»' },
  'hud.minWalk': { en: 'min walk', ar: 'د مشياً' },
  'hud.edgeLeft': { en: 'The next turn is to your left', ar: 'المنعطف التالي إلى يسارك' },
  'hud.edgeRight': { en: 'The next turn is to your right', ar: 'المنعطف التالي إلى يمينك' },
  // QA round 2: the turn right after a ride (the routing folds it into the connector step's text), the bar's last step
  'hud.then.left': { en: 'then turn left', ar: 'ثم انعطف يساراً' },
  'hud.then.right': { en: 'then turn right', ar: 'ثم انعطف يميناً' },
  'hud.then.slight_left': { en: 'then bear left', ar: 'ثم انحرف يساراً' },
  'hud.then.slight_right': { en: 'then bear right', ar: 'ثم انحرف يميناً' },
  'hud.then.uturn': { en: 'then turn around', ar: 'ثم استدر للخلف' },
  'hud.where.top': { en: '{turn} at the top', ar: '{turn} في الأعلى' },
  'hud.where.bottom': { en: '{turn} at the bottom', ar: '{turn} في الأسفل' },
  'hud.where.out': { en: '{turn} as you step out', ar: '{turn} عند الخروج' },
  'hud.pressThen': { en: '{press}, {then}', ar: '{press}، {then}' },
  'hud.arrived': { en: 'Arrived', ar: 'وصلت' },
  // foldable bottom sheet: the handle button says what a tap does (fold / expand the panel)
  'sheet.fold': { en: 'Fold panel', ar: 'اطوِ اللوحة' },
  'sheet.expand': { en: 'Expand panel', ar: 'وسّع اللوحة' },
  // v0.5 first screen: Find me, Map | Offers tabs, the bento home (DESIGN-MALL.md)
  'welcome.title': { en: 'Welcome to {mall}', ar: 'أهلاً بك في {mall}' },
  'welcome.where': { en: 'Where are you?', ar: 'أين أنت الآن؟' },
  'welcome.scan': { en: 'Scan the Dallni sign near you', ar: 'امسح لوحة دلّني القريبة منك' },
  'welcome.scanSub': { en: 'Every sign has a code that knows exactly where it is', ar: 'كل لوحة تحمل رمزاً يعرف مكانها بالضبط' },
  'welcome.orPick': { en: 'Or pick where you came in', ar: 'أو اختر من أين دخلت' },
  'welcome.browse': { en: 'Just look around', ar: 'تصفّح الخريطة فقط' },
  'welcome.gps': {
    en: "Indoors, GPS can't tell your floor. The sign's code tells Dallni exactly where you are.",
    ar: 'داخل المول لا يعرف نظام تحديد المواقع طابقك. رمز اللوحة يخبر دلّني بمكانك بالضبط.',
  },
  'found.toast': { en: 'Found you · {place} · {level}', ar: 'وجدناك · {place} · {level}' },
  'tabs.label': { en: 'Main sections', ar: 'الأقسام الرئيسية' },
  'tabs.map': { en: 'Map', ar: 'الخريطة' },
  'tabs.offers': { en: 'Offers', ar: 'العروض' },
  'strip.facilities': { en: 'Facilities', ar: 'المرافق' },
  'mall.open': { en: 'Open', ar: 'مفتوح' },
  'mall.closed': { en: 'Closed', ar: 'مغلق' },
  'mall.openNowUntil': { en: 'Open now · until {time}', ar: 'مفتوح الآن · حتى {time}' },
  'mall.closedOpens': { en: 'Closed now · opens {time}', ar: 'مغلق الآن · يفتح {time}' },
  'emergency.badge': { en: 'EMERGENCY', ar: 'طوارئ' },
  'home.eyebrow': { en: 'Demo quest', ar: 'تحدٍّ تجريبي' },
  'home.questPill': { en: '{n}/4 stamps', ar: '{n}/٤ أختام' },
  'home.questLabel': { en: 'Demo quest: visit the 4 new brands', ar: 'تحدٍّ تجريبي: زر العلامات الأربع الجديدة' },
  'home.where': { en: 'Where to next?', ar: 'إلى أين الآن؟' },
  'home.spots': { en: '{n} places', ar: '{n} مكان' },
  'home.dealsEyebrow': { en: 'Deals today', ar: 'عروض اليوم' },
  'home.dealsTitle': { en: '{n} offers · up to {max} off', ar: '{n} عروض · خصم حتى {max}' },
  'home.dealsTitleNoPct': { en: '{n} offers in the mall', ar: '{n} عروض في المول' },
  'home.dealsSub': { en: 'New brands from Tokyo, Paris and Seoul', ar: 'علامات جديدة من طوكيو وباريس وسيول' },
  'home.hungry': { en: 'Hungry? {n} nearby', ar: 'جائع؟ {n} قريبة' },
  'home.findMyCar': { en: 'Find my car', ar: 'أين سيارتي' },
  'home.saveSpot': { en: 'Save your spot', ar: 'احفظ موقفك' },
  'home.saveCarHint': { en: 'Scan the pillar sign in the car park', ar: 'امسح لوحة العمود في المواقف' },
  'home.newFrom': { en: 'New · {origin}', ar: 'جديد · {origin}' },
  'home.facilitiesChip': { en: 'Restrooms · {n} min', ar: 'دورات المياه · {n} د' },
  'home.facilitiesSub': { en: 'Prayer rooms, ATM, taxi', ar: 'مصليات، صراف، تاكسي' },
  'home.youAreHereEyebrow': { en: 'You are here', ar: 'أنت هنا' },
  'home.target': { en: 'Your route', ar: 'مسارك' },
  'home.findPlace': { en: 'Find a place', ar: 'ابحث عن مكان' },
  'home.start': { en: 'Start walking', ar: 'ابدأ المشي' },
  'home.minutes': { en: '{n} min', ar: '{n} د' },
  'quest.stamp': { en: 'Stamp collected · {n}/4', ar: 'حصلت على ختم · {n}/٤' },
})

/** Keys added at run time by lazy chunks (addStrings). */
const EXTRA = Object.create(null)

/**
 * Look up a UI string.
 * @param {string} key
 * @param {'en'|'ar'} lang
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function t(key, lang, params) {
  const entry = STRINGS[key] ?? EXTRA[key]
  if (!entry) return key
  const ar = isArabic(lang)
  let text = ar ? (entry.ar ?? entry.en) : entry.en
  if (params) {
    text = text.replace(/\{(\w+)\}/g, (whole, name) => {
      if (!(name in params)) return whole
      const value = params[name]
      return ar && typeof value === 'number' ? toArabicDigits(value) : String(value)
    })
  }
  return text
}

/** True when the table (or an added table) has this key (both languages are required by the i18n test). */
export function hasString(key) {
  return Object.prototype.hasOwnProperty.call(STRINGS, key) || Object.prototype.hasOwnProperty.call(EXTRA, key)
}

/**
 * Strings of the screens that load on demand (v0.5: src/i18n/strings-more.js): each lazy chunk registers its table
 * when it loads, so the first screen never carries them.
 * @param {Record<string, { en: string, ar: string }>} table
 */
export function addStrings(table) {
  for (const [k, v] of Object.entries(table)) EXTRA[k] = v
}
