/**
 * UI strings and number formatting, English + Arabic (Gulf-friendly Modern Standard Arabic).
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
  'tile.exit': { en: 'Exit / Taxi', ar: 'مخرج / تاكسي' },

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
  'sim.speedNow': { en: 'Simulation speed {speed}, tap to change', ar: 'سرعة المحاكاة {speed}، المس للتغيير' },
  'car.paintedCode': { en: 'As painted on the floor', ar: 'كما هو مكتوب على الأرض' },
  'connector.lift': { en: 'Lift', ar: 'مصعد' },
  'connector.escalator': { en: 'Escalator', ar: 'سلم متحرك' },
  'connector.stairs': { en: 'Stairs', ar: 'درج' },
})

/**
 * Look up a UI string.
 * @param {string} key
 * @param {'en'|'ar'} lang
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function t(key, lang, params) {
  const entry = STRINGS[key]
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

/** True when the table has this key (both languages are required by the i18n test). */
export function hasString(key) {
  return Object.prototype.hasOwnProperty.call(STRINGS, key)
}
