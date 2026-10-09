#!/usr/bin/env node
/**
 * Deterministic generator for the FICTIONAL "Dallni Demo Mall · Muscat".
 * No randomness: the same script always writes the same bytes.
 *
 *   node tools/generate-demo-venue.mjs  ->  public/venues/demo-muscat/venue.json
 *
 * Format: CONTRACT.md section 2 (schema dallni.venue/0.1). Optional extras that the contract allows
 * (extra fields are ignored by modules that do not need them):
 *   - areas[]            walkable floor (corridor, court, passage, gallery, seating, lobby, aisle, outdoor)
 *                        and non-walkable blocks (core, ramp, bays, void, fountain, escalator)
 *   - parking.pillars[]  structural pillars carrying the zone colour band
 *   - connectors[].shaft lift / stair core footprint; connectors[].widthM for escalators
 *   - landmarks[].polygon / radius   atrium void outline, food-court seating, fountain size
 *   - amenities[].unitId room that holds the amenity
 *
 * Layout (metres, x = east, y = north, origin = south-west corner, footprint 128 x 64):
 *   G  : hypermarket (west), 8 m mall corridor y 30-38, atrium court x 46-82 with fountain,
 *        south entrance passage x 58-70, cross corridor x 108-116, east entrance x 116-128.
 *   L1 : cinema + kids play (west), same corridor, atrium void with glass rail, south gallery,
 *        food court (north-east), prayer rooms (south-east).
 *   B1/B2 : parking, aisles every 16 m, bays 2.5 x 5.0 m in 3-bay modules between pillars.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { geom, buildLevelPlan, segmentIsClear, WALKABLE_AREA_KINDS } from './validate-venue.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/venues/demo-muscat/venue.json')

const { round2, dist, projectToSegment } = geom
const W = 128
const H = 64
const FLOOR_TO_FLOOR = 5.5
const HOURS = ['10:00', '22:00']
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const arDigits = (s) => String(s).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)])
const R = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const pt = (p) => [round2(p[0]), round2(p[1])]
const bi = (en, ar) => ({ en, ar })
const pad = (n, w) => String(n).padStart(w, '0')

function roundedRect(x0, y0, x1, y1, r, seg = 4) {
  const out = []
  const corners = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]]
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = ((start + (90 * i) / seg) * Math.PI) / 180
      out.push(pt([cx + r * Math.cos(a), cy + r * Math.sin(a)]))
    }
  }
  return out
}
function circle(cx, cy, r, n = 24) {
  const out = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    out.push(pt([cx + r * Math.cos(a), cy + r * Math.sin(a)]))
  }
  return out
}
const dirVec = (deg) => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)]

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------
const LEVELS = [
  { id: 'B2', ordinal: -2, kind: 'parking', name: bi('Parking B2', 'مواقف ب٢'), shortName: bi('B2', 'ب٢'), button: bi('B2', 'ب٢') },
  { id: 'B1', ordinal: -1, kind: 'parking', name: bi('Parking B1', 'مواقف ب١'), shortName: bi('B1', 'ب١'), button: bi('B1', 'ب١') },
  { id: 'G', ordinal: 0, kind: 'retail', name: bi('Ground level', 'المستوى الأرضي'), shortName: bi('G', 'أ'), button: bi('G', 'أ') },
  { id: 'L1', ordinal: 1, kind: 'retail', name: bi('Level 1', 'المستوى الأول'), shortName: bi('L1', '١'), button: bi('1', '١') },
]
const LEVEL = Object.fromEntries(LEVELS.map((l) => [l.id, l]))

// ---------------------------------------------------------------------------
// Occupants (fictional names, no real brands)
// ---------------------------------------------------------------------------
const CATEGORY_KEYWORDS = {
  fashion: [['fashion', 'clothes', 'clothing'], ['أزياء', 'ملابس']],
  food: [['food', 'restaurant', 'eat'], ['مطعم', 'مطاعم', 'طعام', 'أكل']],
  cafe: [['cafe', 'coffee', 'drinks'], ['مقهى', 'قهوة', 'مشروبات']],
  electronics: [['electronics', 'gadgets'], ['إلكترونيات', 'أجهزة']],
  beauty: [['beauty', 'perfume', 'cosmetics'], ['تجميل', 'عطور', 'مستحضرات']],
  kids: [['kids', 'children'], ['أطفال']],
  grocery: [['grocery', 'supermarket'], ['بقالة', 'سوبرماركت']],
  entertainment: [['entertainment', 'fun'], ['ترفيه']],
  home: [['home', 'furniture', 'decor'], ['منزل', 'أثاث', 'ديكور']],
  health: [['health'], ['صحة']],
  services: [['services'], ['خدمات']],
}
function occ(id, category, nameEn, nameAr, signEn, signAr, kwEn, kwAr, landmarkScore, hours = HOURS) {
  const [cEn, cAr] = CATEGORY_KEYWORDS[category]
  return {
    id,
    category,
    name: bi(nameEn, nameAr),
    sign: bi(signEn, signAr),
    keywords: bi([...new Set([...kwEn, ...cEn])], [...new Set([...kwAr, ...cAr])]),
    hours: { open: hours[0], close: hours[1] },
    landmarkScore,
  }
}
const OCCUPANTS = {
  // Ground level
  hyper: occ('occ-sidab-fresh', 'grocery', 'Sidab Fresh Hypermarket', 'هايبرماركت سداب الطازج', 'SIDAB FRESH', 'سداب الطازج',
    ['hypermarket', 'groceries', 'vegetables', 'fruit', 'bread', 'milk'], ['هايبرماركت', 'خضار', 'فواكه', 'خبز', 'حليب'], 3, ['08:00', '24:00']),
  dates: occ('occ-batinah-dates', 'grocery', 'Batinah Dates', 'تمور الباطنة', 'BATINAH DATES', 'تمور الباطنة',
    ['dates', 'khalas', 'gifts'], ['تمور', 'خلاص', 'هدايا'], 1),
  spices: occ('occ-dhofar-spices', 'grocery', 'Dhofar Spices', 'بهارات ظفار', 'DHOFAR SPICES', 'بهارات ظفار',
    ['spices', 'saffron', 'cardamom'], ['بهارات', 'زعفران', 'هيل'], 1),
  laundry: occ('occ-quick-press', 'services', 'Quick Press Laundry', 'مغسلة الكي السريع', 'QUICK PRESS', 'الكي السريع',
    ['laundry', 'ironing', 'dry cleaning'], ['مغسلة', 'كي', 'تنظيف جاف'], 0),
  rose: occ('occ-rose-petal', 'beauty', 'Rose Petal Beauty', 'بتلة الورد للتجميل', 'ROSE PETAL', 'بتلة الورد',
    ['makeup', 'skincare', 'rose water'], ['مكياج', 'العناية بالبشرة', 'ماء الورد'], 1),
  jewel: occ('occ-khanjar-jewellers', 'fashion', 'Khanjar Jewellers', 'مجوهرات الخنجر', 'KHANJAR', 'مجوهرات الخنجر',
    ['gold', 'jewellery', 'jewelry', 'silver'], ['ذهب', 'مجوهرات', 'فضة'], 1),
  cafe: occ('occ-qahwa-corner', 'cafe', 'Qahwa Corner Cafe', 'مقهى ركن القهوة', 'QAHWA CORNER', 'ركن القهوة',
    ['omani coffee', 'kahwa', 'tea', 'dates'], ['قهوة عمانية', 'شاي', 'تمر'], 3),
  halwa: occ('occ-halwa-muscat', 'food', 'Halwa Muscat', 'حلوى مسقط', 'HALWA MUSCAT', 'حلوى مسقط',
    ['halwa', 'omani sweets', 'dessert'], ['حلوى', 'حلوى عمانية', 'حلويات'], 1),
  oud: occ('occ-oud-house', 'beauty', 'Oud House', 'بيت العود', 'OUD HOUSE', 'بيت العود',
    ['oud', 'bakhoor', 'incense', 'attar'], ['عود', 'بخور', 'دهن العود'], 2),
  pharmacy: occ('occ-nakhla-pharmacy', 'health', 'Nakhla Pharmacy', 'صيدلية النخلة', 'NAKHLA PHARMACY', 'صيدلية النخلة',
    ['pharmacy', 'chemist', 'medicine', 'drugstore'], ['صيدلية', 'دواء', 'أدوية'], 2),
  exchange: occ('occ-dhow-exchange', 'services', 'Dhow Exchange', 'صرافة الداو', 'DHOW EXCHANGE', 'صرافة الداو',
    ['money exchange', 'currency', 'remittance', 'transfer'], ['صرافة', 'عملات', 'تحويل أموال'], 0),
  bank: occ('occ-sur-coast-bank', 'services', 'Sur Coast Bank', 'بنك ساحل صور', 'SUR COAST BANK', 'بنك ساحل صور',
    ['bank', 'atm', 'cash'], ['بنك', 'صراف', 'نقود'], 1),
  sahil: occ('occ-sahil-fashion', 'fashion', 'Sahil Fashion', 'أزياء الساحل', 'SAHIL', 'أزياء الساحل',
    ['women', 'men', 'dresses', 'shirts'], ['نساء', 'رجال', 'فساتين', 'قمصان'], 2),
  optics: occ('occ-clear-sight', 'health', 'Clear Sight Optics', 'بصريات الرؤية الواضحة', 'CLEAR SIGHT', 'الرؤية الواضحة',
    ['optician', 'glasses', 'sunglasses', 'eye test'], ['نظارات', 'نظارات شمسية', 'فحص النظر'], 0),
  telecom: occ('occ-wasl-telecom', 'electronics', 'Wasl Telecom', 'وصل للاتصالات', 'WASL TELECOM', 'وصل للاتصالات',
    ['sim card', 'mobile plan', 'recharge', 'internet'], ['شريحة', 'باقة', 'شحن رصيد', 'إنترنت'], 1),
  books: occ('occ-qalam-books', 'services', 'Qalam Books & Stationery', 'مكتبة القلم', 'QALAM BOOKS', 'مكتبة القلم',
    ['books', 'stationery', 'school supplies'], ['كتب', 'قرطاسية', 'أدوات مدرسية'], 0),
  dishdasha: occ('occ-dishdasha-house', 'fashion', 'Dishdasha House', 'بيت الدشداشة', 'DISHDASHA HOUSE', 'بيت الدشداشة',
    ['dishdasha', 'kumma', 'omani dress', 'men'], ['دشداشة', 'كمة', 'زي عماني', 'رجال'], 1),
  sports: occ('occ-jebel-sports', 'fashion', 'Jebel Sports', 'جبل للرياضة', 'JEBEL SPORTS', 'جبل للرياضة',
    ['sports', 'trainers', 'gym', 'running'], ['رياضة', 'أحذية رياضية', 'نادي', 'جري'], 1),
  tech: occ('occ-falaj-tech', 'electronics', 'Falaj Tech', 'فلج تك', 'FALAJ TECH', 'فلج تك',
    ['phones', 'laptops', 'tv', 'headphones', 'computers'], ['هواتف', 'حواسيب', 'تلفزيون', 'سماعات'], 2),
  sandal: occ('occ-sandal-street', 'fashion', 'Sandal Street', 'شارع الصنادل', 'SANDAL STREET', 'شارع الصنادل',
    ['shoes', 'sandals', 'footwear'], ['أحذية', 'صنادل', 'نعال'], 0),
  juice: occ('occ-mango-breeze', 'cafe', 'Mango Breeze Juice', 'عصائر نسيم المانجو', 'MANGO BREEZE', 'نسيم المانجو',
    ['juice', 'smoothie', 'fresh juice'], ['عصير', 'عصائر', 'عصير طازج'], 1),
  mobile: occ('occ-sabla-mobile', 'electronics', 'Sabla Mobile', 'سبلة موبايل', 'SABLA MOBILE', 'سبلة موبايل',
    ['phones', 'mobile', 'accessories', 'chargers'], ['هواتف', 'جوال', 'إكسسوارات', 'شواحن'], 0),
  bakery: occ('occ-saj-bakery', 'food', 'Saj Bakery', 'مخبز الصاج', 'SAJ BAKERY', 'مخبز الصاج',
    ['bakery', 'bread', 'pastries', 'manakeesh'], ['مخبز', 'خبز', 'معجنات', 'مناقيش'], 1),
  // Level 1
  cinema: occ('occ-majlis-cinemas', 'entertainment', 'Majlis Cinemas', 'سينما المجلس', 'MAJLIS CINEMAS', 'سينما المجلس',
    ['cinema', 'movies', 'films', 'tickets'], ['سينما', 'أفلام', 'تذاكر'], 3, ['10:00', '24:00']),
  play: occ('occ-jungle-jump', 'kids', 'Jungle Jump Play', 'ملعب قفزة الغابة', 'JUNGLE JUMP', 'قفزة الغابة',
    ['play area', 'playground', 'soft play', 'trampoline', 'games'], ['ملعب', 'ألعاب أطفال', 'منطقة لعب'], 2),
  liwan: occ('occ-liwan-home', 'home', 'Liwan Home', 'ليوان للمفروشات', 'LIWAN HOME', 'ليوان',
    ['cushions', 'majlis', 'bedding'], ['مفروشات', 'وسائد', 'مجلس', 'مفارش'], 2),
  sadu: occ('occ-sadu-rugs', 'home', 'Sadu Rugs', 'سجاد السدو', 'SADU RUGS', 'سجاد السدو',
    ['rugs', 'carpets', 'weaving'], ['سجاد', 'زل', 'نسيج'], 1),
  toys: occ('occ-toy-souq', 'kids', 'Toy Souq', 'سوق الألعاب', 'TOY SOUQ', 'سوق الألعاب',
    ['toys', 'games', 'puzzles', 'dolls'], ['ألعاب', 'ألغاز', 'دمى'], 1),
  kumma: occ('occ-kumma-corner', 'fashion', 'Kumma Corner', 'ركن الكمة', 'KUMMA CORNER', 'ركن الكمة',
    ['kumma', 'caps', 'massar', 'turban'], ['كمة', 'مصر', 'عمامة'], 0),
  abaya: occ('occ-abaya-atelier', 'fashion', 'Abaya Atelier', 'مشغل العباءات', 'ABAYA ATELIER', 'مشغل العباءات',
    ['abaya', 'shayla', 'women'], ['عباءة', 'شيلة', 'نساء'], 1),
  saffron: occ('occ-saffron-threads', 'fashion', 'Saffron Threads', 'خيوط الزعفران', 'SAFFRON THREADS', 'خيوط الزعفران',
    ['women', 'dresses', 'evening wear'], ['نساء', 'فساتين', 'أزياء سهرة'], 2),
  dune: occ('occ-urban-dune', 'fashion', 'Urban Dune', 'الكثبان الحضرية', 'URBAN DUNE', 'الكثبان',
    ['streetwear', 'jeans', 't-shirts', 'men'], ['ملابس شبابية', 'جينز', 'قمصان', 'رجال'], 1),
  oryx: occ('occ-little-oryx', 'kids', 'Little Oryx Kids', 'المها الصغير للأطفال', 'LITTLE ORYX', 'المها الصغير',
    ['kids clothes', 'baby', 'school uniform'], ['ملابس أطفال', 'رضع', 'زي مدرسي'], 1),
  pixel: occ('occ-pixel-souq', 'electronics', 'Pixel Souq Gaming', 'سوق البكسل للألعاب', 'PIXEL SOUQ', 'سوق البكسل',
    ['gaming', 'video games', 'consoles', 'controllers'], ['ألعاب فيديو', 'أجهزة ألعاب', 'يد تحكم'], 1),
  incense: occ('occ-frankincense-trail', 'beauty', 'Frankincense Trail', 'درب اللبان', 'FRANKINCENSE TRAIL', 'درب اللبان',
    ['frankincense', 'luban', 'incense', 'burner'], ['لبان', 'بخور', 'مبخرة'], 1),
  storybooks: occ('occ-story-house', 'kids', 'Story House Books', 'مكتبة بيت الحكاية', 'STORY HOUSE', 'بيت الحكاية',
    ['children books', 'stories', 'books'], ['قصص أطفال', 'كتب', 'حكايات'], 0),
  muttrah: occ('occ-muttrah-kitchen', 'food', 'Muttrah Kitchen', 'مطبخ مطرح', 'MUTTRAH KITCHEN', 'مطبخ مطرح',
    ['omani food', 'rice', 'fish', 'majboos'], ['أكل عماني', 'رز', 'سمك', 'مجبوس'], 1),
  shuwa: occ('occ-shuwa-grill', 'food', 'Shuwa Grill', 'مشويات الشوا', 'SHUWA GRILL', 'مشويات الشوا',
    ['shuwa', 'grill', 'mishkak', 'meat'], ['شوا', 'مشويات', 'مشكاك', 'لحم'], 1),
  biryani: occ('occ-biryani-bay', 'food', 'Biryani Bay', 'خليج البرياني', 'BIRYANI BAY', 'خليج البرياني',
    ['biryani', 'curry', 'indian'], ['برياني', 'كاري', 'هندي'], 1),
  falafel: occ('occ-falafel-fanar', 'food', 'Falafel Fanar', 'فلافل الفنار', 'FALAFEL FANAR', 'فلافل الفنار',
    ['falafel', 'shawarma', 'sandwich', 'hummus'], ['فلافل', 'شاورما', 'ساندويتش', 'حمص'], 1),
  burger: occ('occ-burger-bandar', 'food', 'Burger Bandar', 'برجر البندر', 'BURGER BANDAR', 'برجر البندر',
    ['burger', 'fries', 'chicken'], ['برجر', 'بطاطس', 'دجاج'], 1),
  noodle: occ('occ-noodle-dhow', 'food', 'Noodle Dhow', 'نودلز الداو', 'NOODLE DHOW', 'نودلز الداو',
    ['noodles', 'asian', 'rice bowl'], ['نودلز', 'آسيوي', 'أرز'], 1),
  luqaimat: occ('occ-sweet-luqaimat', 'food', 'Sweet Luqaimat', 'لقيمات حلوة', 'SWEET LUQAIMAT', 'لقيمات حلوة',
    ['luqaimat', 'dessert', 'sweets', 'ice cream'], ['لقيمات', 'حلويات', 'آيس كريم'], 1),
  karak: occ('occ-karak-station', 'cafe', 'Karak Station', 'محطة الكرك', 'KARAK STATION', 'محطة الكرك',
    ['karak', 'tea', 'chai'], ['كرك', 'شاي'], 2),
  tailor: occ('occ-swift-tailor', 'services', 'Swift Tailor', 'الخياط السريع', 'SWIFT TAILOR', 'الخياط السريع',
    ['tailor', 'alterations', 'stitching'], ['خياط', 'تعديل ملابس', 'خياطة'], 0),
  repair: occ('occ-fix-it-mobile', 'services', 'Fix It Mobile Repair', 'ورشة إصلاح الجوال', 'FIX IT', 'إصلاح الجوال',
    ['phone repair', 'screen repair', 'battery'], ['تصليح هواتف', 'شاشة', 'بطارية'], 0),
}

const AMENITY_NAMES = {
  restroom_men: bi("Men's restroom", 'دورة مياه الرجال'),
  restroom_women: bi("Women's restroom", 'دورة مياه النساء'),
  restroom_accessible: bi('Accessible restroom', 'دورة مياه لذوي الإعاقة'),
  restroom_family: bi('Family room · baby change', 'غرفة العائلة · تغيير الحفاضات'),
  musalla_men: bi("Men's prayer room", 'مصلى الرجال'),
  musalla_women: bi("Women's prayer room", 'مصلى النساء'),
  wudu_men: bi("Men's ablution (wudu)", 'مكان الوضوء للرجال'),
  wudu_women: bi("Women's ablution (wudu)", 'مكان الوضوء للنساء'),
  atm: bi('ATM', 'صراف آلي'),
  info_desk: bi('Information desk', 'مكتب الاستعلامات'),
  taxi_pickup: bi('Taxi pickup', 'موقف سيارات الأجرة'),
}

// ---------------------------------------------------------------------------
// Retail floor plans. Unit tuple: [occupantKey, rect, doorSide, doorAt?, doorWidth?, kind?]
// doorSide = edge of the unit that faces walkable floor: N (y1), S (y0), E (x1), W (x0).
// ---------------------------------------------------------------------------
const CORES = { liftA: [70, 6, 76, 12], liftB: [30, 38, 36, 44], stairs: [108, 54, 116, 62] }
const ESCALATOR_WIDTH = 1.4

const RETAIL = {
  G: {
    units: [
      ['hyper', [0, 0, 30, 64], 'E', 34, 6, 'anchor'],
      ['dates', [30, 14, 37, 30], 'N'],
      ['spices', [37, 14, 46, 30], 'N'],
      ['laundry', [36, 38, 46, 54], 'S'],
      ['rose', [46, 46, 54, 60], 'S'],
      ['jewel', [54, 46, 60, 60], 'S'],
      ['cafe', [60, 46, 70, 60], 'S'],
      ['halwa', [70, 46, 76, 60], 'S'],
      ['oud', [76, 46, 82, 60], 'S'],
      ['pharmacy', [46, 12, 58, 22], 'E'],
      ['exchange', [46, 2, 58, 12], 'E'],
      ['bank', [70, 12, 82, 22], 'W'],
      ['sahil', [82, 14, 90, 30], 'N'],
      ['optics', [90, 14, 96, 30], 'N'],
      ['telecom', [96, 14, 102, 30], 'N'],
      ['books', [102, 14, 108, 30], 'N'],
      ['dishdasha', [82, 38, 88, 54], 'S'],
      ['sports', [88, 38, 96, 54], 'S'],
      ['tech', [96, 38, 108, 54], 'S'],
      ['sandal', [116, 14, 128, 22], 'W'],
      ['juice', [116, 22, 128, 30], 'W'],
      ['mobile', [116, 38, 128, 46], 'W'],
      ['bakery', [116, 46, 128, 54], 'W'],
    ],
    rooms: [
      ['am-G-wc-m', 'restroom_men', [98, 4, 108, 14], 'E', 9, 1.8],
      ['am-G-wc-w', 'restroom_women', [116, 4, 128, 14], 'W', 9, 1.8],
      ['am-G-wc-acc', 'restroom_accessible', [108, 0, 112, 4], 'N', 110, 1.2],
      ['am-G-wc-fam', 'restroom_family', [112, 0, 116, 4], 'N', 114, 1.2],
    ],
    points: [
      // [id, category, plate/desk point, node point]
      ['am-G-atm', 'atm', [70, 20.5], [69, 20.5]],
      ['am-G-info', 'info_desk', [76, 23.4], [76, 24.6]],
      ['am-G-taxi', 'taxi_pickup', [64, -6], [64, -6]],
    ],
    service: [
      [30, 0, 46, 14], [30, 44, 36, 64], [36, 54, 46, 64], [46, 60, 82, 64], [46, 0, 58, 2],
      [70, 0, 76, 6], [76, 0, 82, 12], [82, 0, 98, 14], [98, 0, 108, 4], [82, 54, 108, 64],
      [108, 62, 116, 64], [116, 0, 128, 4], [116, 54, 128, 64],
    ],
    areas: [
      ['corridor', R(30, 30, 46, 38)],
      ['court', R(46, 22, 82, 46)],
      ['corridor', R(82, 30, 108, 38)],
      ['corridor', R(108, 4, 116, 54)],
      ['passage', R(116, 30, 128, 38)],
      ['passage', R(58, 0, 70, 22)],
      ['outdoor', R(54, -10, 74, 0)],
      ['core', R(...CORES.liftA)],
      ['core', R(...CORES.liftB)],
      ['core', R(...CORES.stairs)],
      ['fountain', circle(70, 34, 3)],
      ['escalator', R(51, 34 - 2 * ESCALATOR_WIDTH / 2 - 0.1, 62.5, 34 + 2 * ESCALATOR_WIDTH / 2 + 0.1)],
    ],
    spines: [
      [[31, 34], [46, 34], [48.5, 34]],
      [[48.5, 28], [48.5, 34], [48.5, 40]],
      [[48.5, 28], [64, 28], [79.5, 28]],
      [[48.5, 40], [64, 40], [79.5, 40]],
      [[79.5, 28], [79.5, 34], [79.5, 40]],
      [[64, 28], [64, 34], [64, 40]],
      [[79.5, 34], [82, 34], [112, 34]],
      [[112, 34], [112, 5.5]],
      [[112, 34], [112, 52]],
      [[112, 34], [127, 34]],
      [[64, 28], [64, 22], [64, 15], [64, 9], [64, 1]],
    ],
    anchors: [
      ['A-G-ENT-S', 'G01', 'entrance', [61, 2.6], 180, bi('South entrance', 'المدخل الجنوبي')],
      ['A-G-ENT-E', 'G02', 'entrance', [125.5, 31.6], 90, bi('East entrance', 'المدخل الشرقي')],
      ['A-G-LA', 'G03', 'lift_lobby', [70, 11.2], 270, bi('Lift A lobby · Ground', 'ردهة المصعد أ · الأرضي')],
      ['A-G-LB', 'G04', 'lift_lobby', [35.2, 38], 180, bi('Lift B lobby · Ground', 'ردهة المصعد ب · الأرضي')],
      ['A-G-ESC', 'G05', 'escalator', [63, 36.6], 90, bi('Escalators · Ground', 'السلالم المتحركة · الأرضي')],
      ['A-G-DIR', 'G06', 'directory', [59, 24.6], 90, bi('Mall directory · Atrium', 'دليل المول · الردهة')],
      ['A-G-C1', 'G07', 'corridor', [37, 30], 0, bi('West mall · Ground', 'الممر الغربي · الأرضي')],
      ['A-G-C2', 'G08', 'corridor', [96, 38], 180, bi('East mall · Ground', 'الممر الشرقي · الأرضي')],
      ['A-G-C3', 'G09', 'corridor', [116, 22], 270, bi('East junction · Ground', 'التقاطع الشرقي · الأرضي')],
      ['A-G-C4', 'G10', 'corridor', [60, 46], 180, bi('Atrium north · Ground', 'شمال الردهة · الأرضي')],
    ],
  },
  L1: {
    units: [
      ['play', [0, 0, 30, 34], 'E', 32, 3, 'anchor'],
      ['cinema', [0, 34, 30, 64], 'E', 36, 3, 'anchor'],
      ['liwan', [30, 14, 38, 30], 'N'],
      ['sadu', [38, 14, 46, 30], 'N'],
      ['toys', [36, 38, 46, 54], 'S'],
      ['kumma', [46, 46, 52, 60], 'S'],
      ['abaya', [52, 46, 60, 60], 'S'],
      ['saffron', [60, 46, 70, 60], 'S'],
      ['dune', [70, 46, 76, 60], 'S'],
      ['oryx', [76, 46, 82, 60], 'S'],
      ['pixel', [70, 12, 82, 22], 'W'],
      ['incense', [82, 14, 89, 30], 'N'],
      ['storybooks', [89, 14, 96, 30], 'N'],
      ['muttrah', [82, 52, 89, 64], 'S', null, 3, 'food'],
      ['shuwa', [89, 52, 96, 64], 'S', null, 3, 'food'],
      ['biryani', [96, 52, 103, 64], 'S', null, 3, 'food'],
      ['falafel', [103, 52, 110, 64], 'S', null, 3, 'food'],
      ['burger', [110, 52, 116, 64], 'S', null, 3, 'food'],
      ['noodle', [116, 38, 128, 45], 'W', null, 3, 'food'],
      ['luqaimat', [116, 45, 128, 52], 'W', null, 3, 'food'],
      ['karak', [116, 30, 128, 38], 'W', null, 3, 'food'],
      ['tailor', [96, 4, 108, 10], 'E'],
      ['repair', [116, 4, 128, 10], 'W'],
    ],
    rooms: [
      ['am-L1-wc-m', 'restroom_men', [46, 4, 58, 13], 'E', 8.5, 1.8],
      ['am-L1-wc-w', 'restroom_women', [46, 13, 58, 22], 'E', 17.5, 1.8],
      ['am-L1-wc-acc', 'restroom_accessible', [58, 0, 64, 4], 'N', 61, 1.2],
      ['am-L1-wc-fam', 'restroom_family', [64, 0, 70, 4], 'N', 67, 1.2],
      ['am-L1-musalla-w', 'musalla_women', [96, 18, 108, 30], 'E', 24, 1.8],
      ['am-L1-wudu-w', 'wudu_women', [96, 10, 108, 18], 'E', 14, 1.8],
      ['am-L1-musalla-m', 'musalla_men', [116, 16, 128, 30], 'W', 23, 1.8],
      ['am-L1-wudu-m', 'wudu_men', [116, 10, 128, 16], 'W', 13, 1.8],
    ],
    points: [],
    service: [
      [30, 0, 46, 14], [30, 44, 36, 64], [36, 54, 46, 64], [46, 60, 82, 64], [46, 0, 58, 4],
      [70, 0, 76, 6], [76, 0, 82, 12], [82, 0, 96, 14], [96, 0, 108, 4], [108, 0, 116, 4],
      [116, 0, 128, 4], [116, 52, 128, 64],
    ],
    areas: [
      ['corridor', R(30, 30, 46, 38)],
      ['court', R(46, 22, 82, 46)],
      ['corridor', R(82, 30, 116, 38)],
      ['seating', R(82, 38, 116, 52)],
      ['corridor', R(108, 4, 116, 30)],
      ['gallery', R(58, 4, 70, 22)],
      ['core', R(...CORES.liftA)],
      ['core', R(...CORES.liftB)],
      ['void', roundedRect(51, 26, 77, 42, 3)],
    ],
    spines: [
      [[31, 34], [46, 34], [48.5, 34]],
      [[48.5, 24], [48.5, 34], [48.5, 44]],
      [[48.5, 24], [64, 24], [79.5, 24]],
      [[48.5, 44], [64, 44], [79.5, 44]],
      [[79.5, 24], [79.5, 34], [79.5, 44]],
      [[79.5, 34], [82, 34], [112, 34]],
      [[112, 34], [112, 5.5]],
      [[64, 24], [64, 22], [64, 9], [64, 5.5]],
      [[84, 50], [86, 50], [99, 50], [112, 50], [113.5, 50]],
      [[86, 34], [86, 50]],
      [[99, 34], [99, 50]],
      [[112, 34], [112, 50]],
    ],
    anchors: [
      ['A-L1-LA', 'L01', 'lift_lobby', [70, 11.2], 270, bi('Lift A lobby · Level 1', 'ردهة المصعد أ · المستوى الأول')],
      ['A-L1-LB', 'L02', 'lift_lobby', [35.2, 38], 180, bi('Lift B lobby · Level 1', 'ردهة المصعد ب · المستوى الأول')],
      ['A-L1-ESC', 'L03', 'escalator', [47, 36.6], 90, bi('Escalators · Level 1', 'السلالم المتحركة · المستوى الأول')],
      ['A-L1-C1', 'L04', 'corridor', [38, 30], 0, bi('West mall · Level 1', 'الممر الغربي · المستوى الأول')],
      ['A-L1-C2', 'L05', 'corridor', [89, 30], 0, bi('East mall · Level 1', 'الممر الشرقي · المستوى الأول')],
      ['A-L1-C3', 'L06', 'corridor', [103, 52], 180, bi('Food court · Level 1', 'ساحة المطاعم · المستوى الأول')],
      ['A-L1-C4', 'L07', 'corridor', [116, 16], 270, bi('Prayer rooms · Level 1', 'المصليات · المستوى الأول')],
      ['A-L1-C5', 'L08', 'corridor', [58, 13], 90, bi('South gallery · Level 1', 'الرواق الجنوبي · المستوى الأول')],
    ],
  },
}

// ---------------------------------------------------------------------------
// Parking plans (B1, B2 share the structure; B1 has one extra north row and the street ramp)
// ---------------------------------------------------------------------------
const MODULE_START = 42.6 // first bay of module k starts at 42.6 + 8.1 k
const MODULE_PITCH = 8.1 // 3 bays x 2.5 m + 0.6 m pillar
const MODULES = 9
const BAY_W = 2.5
const BAY_L = 5.0
const ACC_W = 3.6
const ZONE_SPLIT_X = 82.8 // pillar line k = 5
const ZONE_SPLIT_Y = 35 // centre of aisle A2
const AISLE_Y = { A0: 3, A1: 19, A2: 35, A3: 51 }
const ZONES = {
  B1: [
    ['SW', 'blue', '#1E5BD8', 'falcon', 'Blue · Falcon', 'أزرق · صقر', 'B'],
    ['SE', 'green', '#15803D', 'palm', 'Green · Palm', 'أخضر · نخلة', 'G'],
    ['NE', 'red', '#C62828', 'dhow', 'Red · Dhow', 'أحمر · داو', 'R'],
    ['NW', 'orange', '#E65100', 'oryx', 'Orange · Oryx', 'برتقالي · مها', 'O'],
  ],
  B2: [
    ['SW', 'purple', '#7B1FA2', 'rose', 'Purple · Rose', 'بنفسجي · وردة', 'P'],
    ['SE', 'teal', '#00838F', 'fort', 'Teal · Fort', 'فيروزي · قلعة', 'T'],
    ['NE', 'brown', '#6D4C41', 'turtle', 'Brown · Turtle', 'بني · سلحفاة', 'N'],
    ['NW', 'gold', '#B8860B', 'frankincense', 'Gold · Frankincense', 'ذهبي · لبان', 'Y'],
  ],
}
function parkingPlan(levelId) {
  const r4End = levelId === 'B1' ? 75 : null // B1 keeps a north row in the west half; B2 has water tanks there
  const rows = [
    { y0: 6, y1: 11, mouth: 'S', ranges: [[42, 64], [76, 116]] },
    { y0: 11, y1: 16, mouth: 'N', ranges: [[42, 64], [76, 116]] },
    { y0: 22, y1: 27, mouth: 'S', ranges: [[42, 116]], accessibleModules: [2, 3] },
    { y0: 27, y1: 32, mouth: 'N', ranges: [[42, 116]] },
    { y0: 38, y1: 43, mouth: 'S', ranges: [[42, 116]] },
    { y0: 43, y1: 48, mouth: 'N', ranges: [[42, 116]] },
  ]
  if (r4End) rows.push({ y0: 54, y1: 59, mouth: 'S', ranges: [[42, r4End]] })
  const service = [
    [0, 0, 30, 32], [0, 32, 30, 64], [30, 0, 36, 32], [30, 44, 36, 64], [36, 54, 42, 64], [70, 12, 76, 16],
    [108, 62, 116, 64], [116, 54, 122, 64],
    ...(r4End ? [[r4End, 54, 108, 59], [42, 59, 108, 64]] : [[42, 54, 108, 64]]),
    ...(levelId === 'B2' ? [[122, 32, 128, 64]] : []),
  ]
  const areas = [
    ['aisle', R(36, 0, 42, 54)],
    ['aisle', R(116, 0, 122, 54)],
    ['aisle', R(42, 0, 116, 6)],
    ['aisle', R(42, 16, 116, 22)],
    ['aisle', R(42, 32, 116, 38)],
    ['aisle', R(42, 48, 116, 54)],
    ['lobby', R(30, 32, 36, 38)],
    ['lobby', R(64, 6, 70, 16)],
    ['core', R(...CORES.liftA)],
    ['core', R(...CORES.liftB)],
    ['core', R(...CORES.stairs)],
    ['ramp', R(122, 0, 128, 32)],
    ...(levelId === 'B1' ? [['ramp', R(122, 32, 128, 64)]] : []),
    ['bays', R(42, 6, 64, 16)],
    ['bays', R(76, 6, 116, 16)],
    ['bays', R(42, 22, 116, 32)],
    ['bays', R(42, 38, 116, 48)],
    ...(r4End ? [['bays', R(42, 54, r4End, 59)]] : []),
  ]
  const xs = [39, ...Array.from({ length: MODULES }, (_, k) => 46.35 + MODULE_PITCH * k), 119]
  const spines = [
    ...Object.values(AISLE_Y).map((y) => ({ pts: xs.map((x) => [x, y]), kind: 'parking_walk', nodeKind: 'parking_aisle' })),
    { pts: [[39, 3], [39, 19], [39, 35], [39, 51]], kind: 'parking_walk', nodeKind: 'parking_aisle' },
    { pts: [[119, 3], [119, 19], [119, 35], [119, 51]], kind: 'parking_walk', nodeKind: 'parking_aisle' },
    { pts: [[67, 3], [67, 9], [67, 13], [67, 19]], kind: 'walk', nodeKind: 'corridor' },
    { pts: [[33, 35], [39, 35]], kind: 'walk', nodeKind: 'corridor' },
  ]
  return { rows, service, areas, spines }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const units = []
const openings = []
const occupants = []
const amenities = []
const anchors = []
const areas = []
const zones = []
const bays = []
const pillars = []
const nodes = []
const edges = []

const ref = (n) => ({ __node: n }) // node placeholder, replaced by its id at serialisation
const unitSeq = {}
const nextUnitId = (levelId) => {
  unitSeq[levelId] = (unitSeq[levelId] ?? 0) + 1
  return `u-${levelId}-${pad(unitSeq[levelId], 2)}`
}

function opening(rect, side, at, width) {
  const [x0, y0, x1, y1] = rect
  if (side === 'N' || side === 'S') {
    const y = side === 'N' ? y1 : y0
    const c = at ?? (x0 + x1) / 2
    return { a: pt([c - width / 2, y]), b: pt([c + width / 2, y]), mid: pt([c, y]) }
  }
  const x = side === 'E' ? x1 : x0
  const c = at ?? (y0 + y1) / 2
  return { a: pt([x, c - width / 2]), b: pt([x, c + width / 2]), mid: pt([x, c]) }
}

// ---- graph builder ----------------------------------------------------------
function newNode(levelId, p, kind, refId = null) {
  const n = { levelId, point: pt(p), kind, refId, spineKey: null }
  nodes.push(n)
  return n
}
function newEdge(a, b, kind, extra = {}) {
  const e = { a, b, kind, oneWay: false, stepFree: true, connectorId: null, spine: false, removed: false, lengthM: round2(dist(a.point, b.point)), ...extra }
  edges.push(e)
  return e
}
const spineIndex = new Map() // "level:x,y" -> node
const spineKey = (levelId, p) => `${levelId}:${p[0].toFixed(2)},${p[1].toFixed(2)}`
const aliveSpines = (levelId) => edges.filter((e) => e.spine && !e.removed && e.a.levelId === levelId)

function splitEdge(e, node) {
  e.removed = true
  newEdge(e.a, node, e.kind, { spine: true })
  newEdge(node, e.b, e.kind, { spine: true })
  return node
}
function spineNode(levelId, p, nodeKind) {
  const q = pt(p)
  const key = spineKey(levelId, q)
  if (spineIndex.has(key)) return spineIndex.get(key)
  const n = newNode(levelId, q, nodeKind)
  spineIndex.set(key, n)
  for (const e of aliveSpines(levelId)) {
    const pr = projectToSegment(q, e.a.point, e.b.point)
    if (pr.d < 0.01 && pr.t > 0 && pr.t < 1) {
      splitEdge(e, n)
      break
    }
  }
  return n
}
function addSpine(levelId, pts, kind = 'walk', nodeKind = 'corridor', maxLen = 10) {
  let prev = spineNode(levelId, pts[0], nodeKind)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const parts = Math.max(1, Math.ceil(dist(a, b) / maxLen - 1e-9))
    for (let j = 1; j <= parts; j++) {
      const p = [a[0] + ((b[0] - a[0]) * j) / parts, a[1] + ((b[1] - a[1]) * j) / parts]
      const n = spineNode(levelId, p, nodeKind)
      if (n !== prev) newEdge(prev, n, kind, { spine: true })
      prev = n
    }
  }
}

let plans = new Map()
/**
 * Attach `node` to the nearest walkway spine with a straight, unobstructed edge.
 * Prefers an existing spine node within `snap` metres; otherwise splits the spine at the foot point.
 */
function link(node, { snap = 0.5 } = {}) {
  const plan = plans.get(node.levelId)
  const options = aliveSpines(node.levelId)
    .map((e) => ({ e, ...projectToSegment(node.point, e.a.point, e.b.point) }))
    .sort((x, y) => x.d - y.d)
  for (const o of options) {
    if (o.e.removed) continue
    const P = pt(o.point)
    const atEnd = dist(P, o.e.a.point) < 0.01 ? o.e.a : dist(P, o.e.b.point) < 0.01 ? o.e.b : null
    const da = dist(P, o.e.a.point)
    const db = dist(P, o.e.b.point)
    const snapTo = atEnd ?? (da <= snap && da <= db ? o.e.a : db <= snap ? o.e.b : null)
    if (snapTo && snapTo !== node && segmentIsClear(plan, node.point, snapTo.point)) {
      newEdge(node, snapTo, o.e.kind)
      return
    }
    if (atEnd) continue
    if (o.d < 0.05) {
      splitEdge(o.e, node) // the node sits on the spine: make it part of it
      return
    }
    if (segmentIsClear(plan, node.point, P)) {
      const foot = newNode(node.levelId, P, o.e.a.kind === 'parking_aisle' ? 'parking_aisle' : 'corridor')
      spineIndex.set(spineKey(node.levelId, P), foot)
      splitEdge(o.e, foot)
      newEdge(node, foot, o.e.kind)
      return
    }
  }
  throw new Error(`cannot link ${node.kind} node at [${node.point}] on ${node.levelId} to a walkway`)
}

// ---- 1. floor geometry: units, rooms, service blocks, areas ------------------------
const areaSeq = {}
function addArea(levelId, kind, polygon) {
  areaSeq[levelId] = (areaSeq[levelId] ?? 0) + 1
  areas.push({ id: `ar-${levelId}-${pad(areaSeq[levelId], 2)}`, levelId, kind, walkable: WALKABLE_AREA_KINDS.includes(kind), polygon })
}

const pendingDoors = [] // [levelId, node creator] processed after spines exist
for (const levelId of ['G', 'L1']) {
  const plan = RETAIL[levelId]
  for (const [key, rect, side, at, width, kind] of plan.units) {
    const o = OCCUPANTS[key]
    if (!o) throw new Error(`unknown occupant ${key}`)
    const id = nextUnitId(levelId)
    const frontage = side === 'N' || side === 'S' ? rect[2] - rect[0] : rect[3] - rect[1]
    const doorW = width ?? (frontage >= 8 ? 4 : 3)
    const op = opening(rect, side, at ?? undefined, doorW)
    units.push({ id, levelId, kind: kind ?? 'shop', polygon: R(...rect), occupantId: o.id })
    const opening_ = { id: `o-${id}`, unitId: id, levelId, a: op.a, b: op.b, nodeId: null }
    openings.push(opening_)
    occupants.push({ ...o, unitIds: [id], entranceNodeIds: [] })
    pendingDoors.push({ levelId, point: op.mid, kind: 'door', refId: o.id, opening: opening_, occupantId: o.id })
  }
  for (const [amenityId, category, rect, side, at, width] of plan.rooms) {
    const id = nextUnitId(levelId)
    const op = opening(rect, side, at, width)
    units.push({ id, levelId, kind: 'amenity', polygon: R(...rect), occupantId: null })
    const opening_ = { id: `o-${id}`, unitId: id, levelId, a: op.a, b: op.b, nodeId: null }
    openings.push(opening_)
    const amenity = { id: amenityId, levelId, category, unitId: id, point: pt([(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2]), nodeId: null, name: AMENITY_NAMES[category] }
    amenities.push(amenity)
    pendingDoors.push({ levelId, point: op.mid, kind: 'amenity', refId: amenityId, opening: opening_, amenity })
  }
  for (const [amenityId, category, p, nodeP] of plan.points) {
    const amenity = { id: amenityId, levelId, category, unitId: null, point: pt(p), nodeId: null, name: AMENITY_NAMES[category] }
    amenities.push(amenity)
    pendingDoors.push({ levelId, point: nodeP, kind: 'amenity', refId: amenityId, amenity })
  }
  for (const rect of plan.service) units.push({ id: nextUnitId(levelId), levelId, kind: 'service', polygon: R(...rect), occupantId: null })
  for (const [kind, poly] of plan.areas) addArea(levelId, kind, poly)
}

const parkingPlans = {}
for (const levelId of ['B2', 'B1']) {
  const plan = parkingPlan(levelId)
  parkingPlans[levelId] = plan
  for (const rect of plan.service) units.push({ id: nextUnitId(levelId), levelId, kind: 'service', polygon: R(...rect), occupantId: null })
  for (const [kind, poly] of plan.areas) addArea(levelId, kind, poly)
}

plans = new Map(LEVELS.map((l) => [l.id, buildLevelPlan({ areas, units }, l.id)]))

// ---- 2. retail walkway spines, doors, amenities ------------------------------------
for (const levelId of ['G', 'L1']) {
  for (const s of RETAIL[levelId].spines) addSpine(levelId, s)
}
for (const d of pendingDoors) {
  const n = newNode(d.levelId, d.point, d.kind, d.refId)
  link(n)
  if (d.opening) d.opening.nodeId = ref(n)
  if (d.amenity) d.amenity.nodeId = ref(n)
  if (d.occupantId) occupants.find((o) => o.id === d.occupantId).entranceNodeIds.push(ref(n))
}

// ---- 3. parking: spines, zones, bays, pillars ------------------------------------------
const zoneOf = (levelId, x, y) => {
  const q = (y < ZONE_SPLIT_Y ? 'S' : 'N') + (x < ZONE_SPLIT_X ? 'W' : 'E')
  return zones.find((z) => z.levelId === levelId && z.quadrant === q)
}
for (const levelId of ['B2', 'B1']) {
  const plan = parkingPlans[levelId]
  for (const s of plan.spines) addSpine(levelId, s.pts, s.kind, s.nodeKind)

  const hasR4 = plan.rows.some((r) => r.y0 === 54)
  for (const [quadrant, colorKey, color, icon, en, ar, letter] of ZONES[levelId]) {
    const west = quadrant.endsWith('W')
    const south = quadrant.startsWith('S')
    const x0 = west ? 36 : ZONE_SPLIT_X
    const x1 = west ? ZONE_SPLIT_X : 122
    const y0 = south ? 0 : ZONE_SPLIT_Y
    const y1 = south ? ZONE_SPLIT_Y : hasR4 && west ? 59 : 54
    zones.push({ id: `z-${levelId}-${colorKey}`, levelId, colorKey, color, icon, label: bi(en, ar), polygon: R(x0, y0, x1, y1), quadrant, letter })
  }

  const levelBays = []
  const levelPillars = []
  plan.rows.forEach((row, rowIndex) => {
    const within = (a, b) => row.ranges.some(([ra, rb]) => a >= ra - 1e-6 && b <= rb + 1e-6)
    for (let k = 0; k < MODULES; k++) {
      const s = MODULE_START + MODULE_PITCH * k
      const accessible = (row.accessibleModules ?? []).includes(k)
      const spans = accessible
        ? [[s + 0.15, s + 0.15 + ACC_W], [s + 0.15 + ACC_W, s + 0.15 + 2 * ACC_W]]
        : [0, 1, 2].map((j) => [s + j * BAY_W, s + (j + 1) * BAY_W])
      for (const [a, b] of spans) {
        if (!within(a, b)) continue
        const cx = (a + b) / 2
        const cy = (row.y0 + row.y1) / 2
        levelBays.push({ rowIndex, cx, cy, w: round2(b - a), accessible, row })
      }
    }
    for (let k = 0; k <= MODULES; k++) {
      const x = 42.3 + MODULE_PITCH * k
      if (!within(x - 0.3, x + 0.3)) continue
      const y = row.mouth === 'S' ? row.y0 + 0.6 : row.y1 - 0.6
      levelPillars.push({ x: round2(x), y: round2(y), row })
    }
  })

  const zoneOrder = ZONES[levelId].map((z) => z[0])
  levelBays.sort((p, q) => {
    const zp = zoneOrder.indexOf(zoneOf(levelId, p.cx, p.cy).quadrant)
    const zq = zoneOrder.indexOf(zoneOf(levelId, q.cx, q.cy).quadrant)
    return zp - zq || p.rowIndex - q.rowIndex || p.cx - q.cx
  })
  levelBays.forEach((bay, i) => {
    const num = i + 1
    const id = `bay-${levelId}-${pad(num, 3)}`
    const front = bay.row.mouth === 'S' ? bay.row.y0 - 0.5 : bay.row.y1 + 0.5
    const n = newNode(levelId, [bay.cx, front], 'bay', id)
    // a short stub straight across to the aisle (a new aisle node at the bay mouth): routes turn into the bay
    // where it is, never walk past it and double back
    link(n, { snap: 0.3 })
    bays.push({
      id,
      code: `${levelId}-${num}`,
      levelId,
      zoneId: zoneOf(levelId, bay.cx, bay.cy).id,
      center: pt([bay.cx, bay.cy]),
      angleDeg: bay.row.mouth === 'S' ? 0 : 180,
      w: bay.w,
      l: BAY_L,
      nodeId: ref(n),
      accessible: bay.accessible,
    })
  })
  levelPillars.sort((p, q) => p.y - q.y || p.x - q.x)
  levelPillars.forEach((p, i) => {
    pillars.push({ id: `pil-${levelId}-${pad(i + 1, 3)}`, levelId, zoneId: zoneOf(levelId, p.x, p.y).id, center: [p.x, p.y], size: 0.6, facingDeg: p.row.mouth === 'S' ? 180 : 0 })
  })
}

// ---- 4. connectors ------------------------------------------------------------------
const connectors = []
function stopFor(levelId, p, connectorId) {
  const n = newNode(levelId, p, 'connector', connectorId)
  link(n, { snap: 1.0 })
  return { levelId, nodeId: ref(n), point: pt(p), buttonLabel: LEVEL[levelId].button, node: n }
}
function addConnector(c, stopDefs) {
  const stops = stopDefs.map(([levelId, p]) => stopFor(levelId, p, c.id))
  const kind = c.type
  const pairs = []
  if (kind === 'lift') {
    for (let i = 0; i < stops.length; i++) for (let j = i + 1; j < stops.length; j++) pairs.push([stops[i], stops[j]])
  } else {
    for (let i = 1; i < stops.length; i++) pairs.push([stops[i - 1], stops[i]])
  }
  for (const [s, t] of pairs) {
    const lengthM = kind === 'escalator' ? round2(dist(s.node.point, t.node.point)) : kind === 'lift' ? 0 : 10
    newEdge(s.node, t.node, kind, { oneWay: kind === 'escalator', stepFree: kind === 'lift', connectorId: c.id, lengthM })
  }
  connectors.push({ ...c, stops: stops.map(({ node, ...s }) => s) })
}
// Escalators: centrelines 1.6 m apart either side of y = 34, 12 m horizontal travel, ramp ends at the L1 void edge (x = 51).
addConnector(
  { id: 'esc-1-up', type: 'escalator', direction: 'up', stepFree: false, name: bi('Escalator 1 · up', 'السلم المتحرك ١ · صعود'), widthM: ESCALATOR_WIDTH },
  [['G', [63, 33.2]], ['L1', [51, 33.2]]],
)
addConnector(
  { id: 'esc-2-down', type: 'escalator', direction: 'down', stepFree: false, name: bi('Escalator 2 · down', 'السلم المتحرك ٢ · نزول'), widthM: ESCALATOR_WIDTH },
  [['L1', [51, 34.8]], ['G', [63, 34.8]]],
)
addConnector(
  { id: 'lift-a', type: 'lift', direction: 'both', stepFree: true, name: bi('Lift A', 'المصعد أ'), shaft: R(...CORES.liftA), doorFacingDeg: 270 },
  ['B2', 'B1', 'G', 'L1'].map((l) => [l, [69.2, 9]]),
)
addConnector(
  { id: 'lift-b', type: 'lift', direction: 'both', stepFree: true, name: bi('Lift B', 'المصعد ب'), shaft: R(...CORES.liftB), doorFacingDeg: 180 },
  ['B2', 'B1', 'G', 'L1'].map((l) => [l, [33, 37.2]]),
)
addConnector(
  { id: 'stairs-1', type: 'stairs', direction: 'both', stepFree: false, name: bi('Stairs 1', 'الدرج ١'), shaft: R(...CORES.stairs), doorFacingDeg: 180 },
  ['B2', 'B1', 'G'].map((l) => [l, [112, 53.2]]),
)

// ---- 5. anchors (QR plates) -----------------------------------------------------------
function addAnchor(id, code, kind, levelId, p, facingDeg, label) {
  const [dx, dy] = dirVec(facingDeg)
  const n = newNode(levelId, [p[0] + dx, p[1] + dy], kind === 'entrance' ? 'entrance' : 'anchor', id)
  link(n)
  anchors.push({ id, code, kind, levelId, point: pt(p), nodeId: ref(n), facingDeg, label })
}
for (const levelId of ['G', 'L1']) {
  for (const [id, code, kind, p, facing, label] of RETAIL[levelId].anchors) addAnchor(id, code, kind, levelId, p, facing, label)
}
const arBayCode = (code) => code.replace('B', 'ب').replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)])
for (const levelId of ['B2', 'B1']) {
  const lv = LEVEL[levelId]
  addAnchor(`A-${levelId}-LA`, `${levelId}-LA`, 'lift_lobby', levelId, [70, 11.2], 270, bi(`Lift A lobby · ${levelId}`, `ردهة المصعد أ · ${lv.shortName.ar}`))
  addAnchor(`A-${levelId}-LB`, `${levelId}-LB`, 'lift_lobby', levelId, [35.2, 38], 180, bi(`Lift B lobby · ${levelId}`, `ردهة المصعد ب · ${lv.shortName.ar}`))
  for (const z of zones.filter((x) => x.levelId === levelId)) {
    // plates go on pillars well inside the zone, never on the boundary pillar line
    const zp = pillars.filter((p) => p.zoneId === z.id && Math.abs(p.center[0] - ZONE_SPLIT_X) > 1)
    const zb = bays.filter((b) => b.zoneId === z.id)
    if (!zp.length || !zb.length) throw new Error(`zone ${z.id} has no pillars or bays`)
    const cx = zb.reduce((s, b) => s + b.center[0], 0) / zb.length
    const cy = zb.reduce((s, b) => s + b.center[1], 0) / zb.length
    const byCentre = [...zp].sort((p, q) => dist(p.center, [cx, cy]) - dist(q.center, [cx, cy]) || p.id.localeCompare(q.id))
    const first = byCentre[0]
    const second = byCentre.find((p) => p.facingDeg !== first.facingDeg && dist(p.center, first.center) >= 12) ??
      [...zp].sort((p, q) => dist(q.center, first.center) - dist(p.center, first.center))[0]
    ;[first, second].forEach((p, i) => {
      const [dx, dy] = dirVec(p.facingDeg)
      const face = [p.center[0] + dx * 0.3, p.center[1] + dy * 0.3]
      const nearest = [...zb].sort((a, b) => dist(a.center, face) - dist(b.center, face))[0]
      const code = `${levelId}-${z.letter}${i + 1}`
      addAnchor(`A-${levelId}-${z.colorKey}-${i + 1}`, code, 'parking_pillar', levelId, face, p.facingDeg,
        bi(`${z.label.en} · ${levelId} · by bay ${nearest.code}`, `${z.label.ar} · ${lv.shortName.ar} · بجانب الموقف ${arBayCode(nearest.code)}`))
      p.anchorId = `A-${levelId}-${z.colorKey}-${i + 1}`
    })
  }
}

// ---- 6. landmarks -------------------------------------------------------------------------
const voidPoly = RETAIL.L1.areas.find(([k]) => k === 'void')[1]
const seatingPoly = RETAIL.L1.areas.find(([k]) => k === 'seating')[1]
const landmarks = [
  { id: 'lm-fountain', levelId: 'G', point: [70, 34], kind: 'fountain', landmarkScore: 3, name: bi('Atrium fountain', 'نافورة الردهة'), radius: 3 },
  { id: 'lm-atrium', levelId: 'L1', point: [64, 34], kind: 'atrium', landmarkScore: 3, name: bi('Atrium', 'الردهة'), polygon: voidPoly, railHeightM: 1.1 },
  { id: 'lm-food-court', levelId: 'L1', point: [99, 45], kind: 'food_court', landmarkScore: 3, name: bi('Food court', 'ساحة المطاعم'), polygon: seatingPoly },
]

// ---- 7. ids + assembly ----------------------------------------------------------------------
const levelOrder = LEVELS.map((l) => l.id)
const counters = {}
const orderedNodes = [...nodes].sort((a, b) => levelOrder.indexOf(a.levelId) - levelOrder.indexOf(b.levelId))
for (const n of orderedNodes) {
  counters[n.levelId] = (counters[n.levelId] ?? 0) + 1
  n.id = `n-${n.levelId}-${pad(counters[n.levelId], 3)}`
}
const liveEdges = edges.filter((e) => !e.removed)
const graph = {
  nodes: orderedNodes.map((n) => ({ id: n.id, levelId: n.levelId, point: n.point, kind: n.kind, refId: n.refId })),
  edges: liveEdges.map((e, i) => ({
    id: `e-${pad(i + 1, 4)}`,
    from: e.a.id,
    to: e.b.id,
    kind: e.kind,
    lengthM: e.lengthM,
    oneWay: e.oneWay,
    stepFree: e.stepFree,
    connectorId: e.connectorId,
  })),
}

const resolveRefs = (v) => {
  if (Array.isArray(v)) return v.map(resolveRefs)
  if (v && typeof v === 'object') {
    if (v.__node) return v.__node.id
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, resolveRefs(x)]))
  }
  return v
}

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
const grow = ([x, y]) => {
  minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
}
for (const a of areas) a.polygon.forEach(grow)
for (const n of graph.nodes) grow(n.point)
R(0, 0, W, H).forEach(grow)

const venue = resolveRefs({
  schema: 'dallni.venue/0.1',
  meta: {
    id: 'demo-muscat',
    name: bi('Dallni Demo Mall · Muscat', 'مول دلّني التجريبي · مسقط'),
    disclaimer: bi('Fictional layout for prototype testing. Not a real mall.', 'مخطط تجريبي خيالي لاختبار النموذج. ليس مولاً حقيقياً.'),
    version: 1,
    units: 'meters',
    timezone: 'Asia/Muscat',
    defaultStartAnchorId: 'A-G-ENT-S',
    bounds: { minX: round2(minX), minY: round2(minY), maxX: round2(maxX), maxY: round2(maxY) },
    floorToFloorM: FLOOR_TO_FLOOR,
    generator: 'tools/generate-demo-venue.mjs',
  },
  levels: LEVELS.map((l) => ({ id: l.id, ordinal: l.ordinal, elevation: round2(l.ordinal * FLOOR_TO_FLOOR), kind: l.kind, name: l.name, shortName: l.shortName, outline: R(0, 0, W, H) })),
  units,
  openings,
  occupants,
  amenities,
  connectors,
  anchors,
  landmarks,
  parking: {
    zones: zones.map(({ quadrant, letter, ...z }) => z),
    bays,
    pillars: pillars.map(({ anchorId, ...p }) => p),
  },
  areas,
  graph,
})

// Compact, diff-friendly JSON: small objects / arrays stay on one line.
function fmt(v, indent = '') {
  const compact = JSON.stringify(v)
  if (v === null || typeof v !== 'object' || compact.length <= 160) return compact
  const next = `${indent}  `
  if (Array.isArray(v)) return `[\n${v.map((x) => next + fmt(x, next)).join(',\n')}\n${indent}]`
  return `{\n${Object.entries(v).map(([k, x]) => `${next}${JSON.stringify(k)}: ${fmt(x, next)}`).join(',\n')}\n${indent}}`
}

mkdirSync(dirname(OUT), { recursive: true })
const text = `${fmt(venue)}\n`
writeFileSync(OUT, text)

const perLevel = levelOrder.map((l) => {
  const u = venue.units.filter((x) => x.levelId === l)
  return `${l}: units ${u.length} (retail ${u.filter((x) => x.occupantId).length}), bays ${venue.parking.bays.filter((b) => b.levelId === l).length}, nodes ${venue.graph.nodes.filter((n) => n.levelId === l).length}`
})
console.log(`wrote ${relative(ROOT, OUT)} (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB)`)
console.log(`  ${perLevel.join('\n  ')}`)
console.log(`  occupants ${venue.occupants.length} · amenities ${venue.amenities.length} · anchors ${venue.anchors.length} · connectors ${venue.connectors.length} · nodes ${venue.graph.nodes.length} · edges ${venue.graph.edges.length}`)
