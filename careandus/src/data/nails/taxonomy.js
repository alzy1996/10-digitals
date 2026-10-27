// Master taxonomy: color families, finishes (with renderer parameters), product types, shapes, lengths,
// occasions, style personas and the Monk Skin Tone scale. Bilingual EN / AR.

export const FAMILIES = [
  { key: 'nudes', en: 'Nudes', ar: 'نود', dot: '#D2A98C' },
  { key: 'whites', en: 'Whites', ar: 'أبيض', dot: '#F6F3EC' },
  { key: 'milky', en: 'Milky & Sheer', ar: 'حليبي وشفاف', dot: '#F1DFDA' },
  { key: 'pastels', en: 'Pastels', ar: 'باستيل', dot: '#C9D9F0' },
  { key: 'pinks', en: 'Pinks', ar: 'وردي', dot: '#E77FA4' },
  { key: 'mauves', en: 'Mauves & Dusty Rose', ar: 'موف ووردي ترابي', dot: '#B48A92' },
  { key: 'corals', en: 'Corals & Peach', ar: 'مرجاني وخوخي', dot: '#F07C64' },
  { key: 'oranges', en: 'Oranges', ar: 'برتقالي', dot: '#E8682C' },
  { key: 'reds', en: 'Reds', ar: 'أحمر', dot: '#C0132B' },
  { key: 'berries', en: 'Berries & Wines', ar: 'توتي وخمري', dot: '#7A1636' },
  { key: 'purples', en: 'Purples & Lilacs', ar: 'بنفسجي وليلكي', dot: '#7B4FA3' },
  { key: 'blues', en: 'Blues', ar: 'أزرق', dot: '#2F5FA8' },
  { key: 'teals', en: 'Teals & Turquoise', ar: 'فيروزي وتيل', dot: '#1E8C8A' },
  { key: 'greens', en: 'Greens', ar: 'أخضر', dot: '#4E7D5B' },
  { key: 'yellows', en: 'Yellows', ar: 'أصفر', dot: '#F2D46B' },
  { key: 'browns', en: 'Browns', ar: 'بني', dot: '#6E4532' },
  { key: 'greys', en: 'Greys & Taupe', ar: 'رمادي وتوب', dot: '#8E8682' },
  { key: 'blacks', en: 'Blacks', ar: 'أسود', dot: '#141214' },
  { key: 'metallics', en: 'Metallic & Chrome', ar: 'معدني وكروم', dot: '#C9B27C' },
  { key: 'neons', en: 'Neons', ar: 'نيون', dot: '#FF3D8B' },
]

export const FAMILY_BY_KEY = Object.fromEntries(FAMILIES.map((f) => [f.key, f]))

/**
 * Finish render parameters (0..1). The WebGL shader reads these:
 *  opacity      – coverage over the natural nail (1 = fully opaque creme, 0.4 = jelly)
 *  gloss        – clear-coat strength (sharp reflection of real highlights)
 *  rough        – micro-roughness (0 = mirror, 1 = chalky matte)
 *  metal        – metallic (specular tinted by base color, low diffuse)
 *  sparkle      – density of glitter / shimmer flakes
 *  flake        – flake size in nail-width units
 *  irid         – iridescent hue shift amount
 *  mode         – special shader branch: 0 none, 1 chrome, 2 holo, 3 cat-eye, 4 duochrome, 5 velvet, 6 pearl
 */
export const FINISHES = [
  { key: 'creme', en: 'Crème', ar: 'كريمي', opacity: 1, gloss: 0.75, rough: 0.25, metal: 0, sparkle: 0, flake: 0, irid: 0, mode: 0, desc: { en: 'Opaque, smooth, classic shine', ar: 'لون كامل ولمعة كلاسيكية' } },
  { key: 'gloss', en: 'Gel Gloss', ar: 'جل لامع', opacity: 1, gloss: 1, rough: 0.08, metal: 0, sparkle: 0, flake: 0, irid: 0, mode: 0, desc: { en: 'Glass-like depth, mirror shine', ar: 'عمق زجاجي ولمعة مرآة' } },
  { key: 'matte', en: 'Matte', ar: 'مطفي', opacity: 1, gloss: 0, rough: 0.95, metal: 0, sparkle: 0, flake: 0, irid: 0, mode: 0, desc: { en: 'Velvety, zero shine', ar: 'مخملي بدون لمعة' } },
  { key: 'satin', en: 'Satin', ar: 'ساتان', opacity: 1, gloss: 0.3, rough: 0.6, metal: 0, sparkle: 0, flake: 0, irid: 0, mode: 0, desc: { en: 'Soft low sheen', ar: 'لمعة ناعمة خفيفة' } },
  { key: 'sheer', en: 'Sheer / Jelly', ar: 'شفاف / جيلي', opacity: 0.45, gloss: 0.9, rough: 0.12, metal: 0, sparkle: 0, flake: 0, irid: 0, mode: 0, desc: { en: 'See-through tint, glassy', ar: 'لون شفاف زجاجي' } },
  { key: 'milky', en: 'Milky', ar: 'حليبي', opacity: 0.72, gloss: 0.85, rough: 0.15, metal: 0, sparkle: 0, flake: 0, irid: 0, mode: 0, desc: { en: 'Soft semi-sheer, clean look', ar: 'نصف شفاف وناعم' } },
  { key: 'shimmer', en: 'Shimmer', ar: 'شيمر', opacity: 1, gloss: 0.8, rough: 0.2, metal: 0.15, sparkle: 0.85, flake: 0.035, irid: 0.1, mode: 0, desc: { en: 'Fine light-catching sparkle', ar: 'لمعان ناعم يلتقط الضوء' } },
  { key: 'pearl', en: 'Pearl', ar: 'لؤلؤي', opacity: 0.95, gloss: 0.8, rough: 0.2, metal: 0.2, sparkle: 0.1, flake: 0.02, irid: 0.35, mode: 6, desc: { en: 'Soft pearly sheen', ar: 'بريق لؤلؤي ناعم' } },
  { key: 'metallic', en: 'Metallic', ar: 'معدني', opacity: 1, gloss: 0.7, rough: 0.35, metal: 0.85, sparkle: 0.25, flake: 0.02, irid: 0, mode: 0, desc: { en: 'Foil-like metal glow', ar: 'توهج معدني' } },
  { key: 'chrome', en: 'Chrome', ar: 'كروم', opacity: 1, gloss: 1, rough: 0.05, metal: 1, sparkle: 0, flake: 0, irid: 0.05, mode: 1, desc: { en: 'Liquid mirror powder', ar: 'مرآة سائلة' } },
  { key: 'holo', en: 'Holographic', ar: 'هولوغرافيك', opacity: 1, gloss: 1, rough: 0.1, metal: 0.8, sparkle: 0.3, flake: 0.02, irid: 1, mode: 2, desc: { en: 'Rainbow light play', ar: 'ألوان قوس قزح' } },
  { key: 'glitter', en: 'Glitter', ar: 'جليتر', opacity: 1, gloss: 0.9, rough: 0.15, metal: 0.5, sparkle: 1, flake: 0.09, irid: 0.15, mode: 0, desc: { en: 'Sparkling flakes', ar: 'حبيبات لامعة' } },
  { key: 'cateye', en: 'Cat Eye', ar: 'عين القطة', opacity: 1, gloss: 1, rough: 0.1, metal: 0.4, sparkle: 0.6, flake: 0.015, irid: 0.2, mode: 3, desc: { en: 'Magnetic light band that moves', ar: 'شريط ضوء مغناطيسي يتحرك' } },
  { key: 'velvet', en: 'Velvet Magnetic', ar: 'مخمل مغناطيسي', opacity: 1, gloss: 0.95, rough: 0.15, metal: 0.4, sparkle: 0.8, flake: 0.012, irid: 0.25, mode: 5, desc: { en: 'Deep glowing velvet', ar: 'مخمل متوهج عميق' } },
  { key: 'duochrome', en: 'Duochrome', ar: 'ثنائي اللون', opacity: 1, gloss: 0.95, rough: 0.12, metal: 0.45, sparkle: 0.2, flake: 0.02, irid: 0.6, mode: 4, desc: { en: 'Shifts between two colors', ar: 'يتغير بين لونين' } },
  { key: 'neon', en: 'Neon', ar: 'نيون', opacity: 1, gloss: 0.7, rough: 0.3, metal: 0, sparkle: 0, flake: 0, irid: 0, mode: 0, desc: { en: 'Ultra bright — even brighter in person', ar: 'ساطع جداً — أقوى في الحقيقة من الشاشة' } },
]

export const FINISH_BY_KEY = Object.fromEntries(FINISHES.map((f) => [f.key, f]))

/** Product type changes thickness & clear-coat depth in the render */
export const PRODUCT_TYPES = [
  { key: 'gel', en: 'Gel polish', ar: 'جل', glossBoost: 0.15, apex: 0.15, wear: { en: '2–3 weeks', ar: '2–3 أسابيع' } },
  { key: 'lacquer', en: 'Regular polish', ar: 'مناكير عادي', glossBoost: 0, apex: 0.05, wear: { en: '5–7 days', ar: '5–7 أيام' } },
  { key: 'breathable', en: 'Breathable (maker claim)', ar: 'قابل للتنفّس (حسب المصنّع)', glossBoost: -0.05, apex: 0.05, wear: { en: '4–6 days', ar: '4–6 أيام' } },
  { key: 'biab', en: 'Builder gel / BIAB', ar: 'جل بناء BIAB', glossBoost: 0.2, apex: 0.4, wear: { en: '3–4 weeks', ar: '3–4 أسابيع' } },
  { key: 'acrylic', en: 'Acrylic', ar: 'أكريليك', glossBoost: 0.15, apex: 0.45, wear: { en: '3–4 weeks + refill', ar: '3–4 أسابيع + تعبئة' } },
  { key: 'dip', en: 'Dip powder', ar: 'بودرة غمس', glossBoost: 0.1, apex: 0.3, wear: { en: '3–4 weeks', ar: '3–4 أسابيع' } },
  { key: 'presson', en: 'Press-on', ar: 'أظافر لاصقة', glossBoost: 0.15, apex: 0.25, wear: { en: '1–2 weeks', ar: '1–2 أسبوع' } },
]
export const TYPE_BY_KEY = Object.fromEntries(PRODUCT_TYPES.map((t) => [t.key, t]))

/** Nail shapes. Numbers drive the shader outline (see render/shaders.js). */
export const SHAPES = [
  { key: 'natural', en: 'Natural', ar: 'طبيعي', tipRound: 0.85, taper: 0.0, point: 0, coffin: 0, minLen: 0 },
  { key: 'round', en: 'Round', ar: 'دائري', tipRound: 1.0, taper: 0.0, point: 0, coffin: 0, minLen: 0 },
  { key: 'squoval', en: 'Squoval', ar: 'مربع بيضاوي', tipRound: 0.42, taper: 0.0, point: 0, coffin: 0, minLen: 0.1 },
  { key: 'square', en: 'Square', ar: 'مربع', tipRound: 0.1, taper: 0.0, point: 0, coffin: 0, minLen: 0.1 },
  { key: 'oval', en: 'Oval', ar: 'بيضاوي', tipRound: 1.0, taper: 0.06, point: 0.25, coffin: 0, minLen: 0.2 },
  { key: 'almond', en: 'Almond', ar: 'لوزي', tipRound: 1.0, taper: 0.18, point: 0.42, coffin: 0, minLen: 0.3 },
  { key: 'coffin', en: 'Coffin / Ballerina', ar: 'باليرينا', tipRound: 0.12, taper: 0.38, point: 0, coffin: 1, minLen: 0.45 },
  { key: 'stiletto', en: 'Stiletto', ar: 'ستيليتو', tipRound: 1.0, taper: 0.3, point: 1.0, coffin: 0, minLen: 0.55 },
]
export const SHAPE_BY_KEY = Object.fromEntries(SHAPES.map((s) => [s.key, s]))

export const LENGTHS = [
  { key: 'natural', en: 'Natural', ar: 'طبيعي', value: 0 },
  { key: 'short', en: 'Short', ar: 'قصير', value: 0.18 },
  { key: 'medium', en: 'Medium', ar: 'متوسط', value: 0.45 },
  { key: 'long', en: 'Long', ar: 'طويل', value: 0.75 },
  { key: 'xl', en: 'XL', ar: 'طويل جداً', value: 1.05 },
]

export const ART = [
  { key: 'none', en: 'Solid', ar: 'لون واحد' },
  { key: 'french', en: 'French', ar: 'فرنسي' },
  { key: 'microfrench', en: 'Micro French', ar: 'فرنسي رفيع' },
  { key: 'ombre', en: 'Ombré', ar: 'أومبريه' },
  { key: 'chrometip', en: 'Chrome Tip', ar: 'طرف كروم' },
  { key: 'halfmoon', en: 'Half Moon', ar: 'نصف قمر' },
]

export const FINGERS = [
  { key: 'thumb', en: 'Thumb', ar: 'الإبهام' },
  { key: 'index', en: 'Index', ar: 'السبابة' },
  { key: 'middle', en: 'Middle', ar: 'الوسطى' },
  { key: 'ring', en: 'Ring', ar: 'البنصر' },
  { key: 'pinky', en: 'Pinky', ar: 'الخنصر' },
]

export const OCCASIONS = [
  { key: 'daily', en: 'Everyday', ar: 'يومي' },
  { key: 'office', en: 'Work', ar: 'عمل' },
  { key: 'wedding', en: 'Wedding / Milka', ar: 'عرس / ملكة' },
  { key: 'eid', en: 'Eid & Party', ar: 'عيد وحفلات' },
  { key: 'vacation', en: 'Vacation', ar: 'إجازة' },
]

export const PERSONAS = [
  { key: 'classic', en: 'Classic', ar: 'كلاسيكي' },
  { key: 'minimal', en: 'Clean & Minimal', ar: 'ناعم وبسيط' },
  { key: 'bold', en: 'Bold', ar: 'جريء' },
  { key: 'trendy', en: 'Trendy', ar: 'عصري' },
  { key: 'glam', en: 'Glam', ar: 'فخم ولامع' },
]

/** Monk Skin Tone scale (Google, CC-BY 4.0) — the 10 official orbs. */
export const MONK_SCALE = [
  { level: 1, hex: '#F6EDE4' },
  { level: 2, hex: '#F3E7DB' },
  { level: 3, hex: '#F7EAD0' },
  { level: 4, hex: '#EADABA' },
  { level: 5, hex: '#D7BD96' },
  { level: 6, hex: '#A07E56' },
  { level: 7, hex: '#825C43' },
  { level: 8, hex: '#604134' },
  { level: 9, hex: '#3A312A' },
  { level: 10, hex: '#292420' },
]

/** Skin depth groups from ITA° (Chardon et al. / Del Bino classification) */
export const DEPTHS = [
  { key: 'veryLight', en: 'Very light', ar: 'فاتح جداً', minIta: 55 },
  { key: 'light', en: 'Light', ar: 'فاتح', minIta: 41 },
  { key: 'medium', en: 'Medium', ar: 'متوسط', minIta: 28 },
  { key: 'tan', en: 'Tan / Olive', ar: 'حنطي', minIta: 10 },
  { key: 'deep', en: 'Deep', ar: 'أسمر', minIta: -30 },
  { key: 'veryDeep', en: 'Very deep', ar: 'أسمر داكن', minIta: -Infinity },
]
export const DEPTH_BY_KEY = Object.fromEntries(DEPTHS.map((d) => [d.key, d]))

export const UNDERTONES = [
  { key: 'warm', en: 'Warm', ar: 'دافئ', hint: { en: 'Golden / peachy — gold jewelry flatters', ar: 'ذهبي / خوخي — الذهب يناسبك' } },
  { key: 'cool', en: 'Cool', ar: 'بارد', hint: { en: 'Pink / rosy — silver flatters', ar: 'وردي — الفضة تناسبك' } },
  { key: 'neutral', en: 'Neutral', ar: 'محايد', hint: { en: 'Balanced — both gold and silver work', ar: 'متوازن — الذهب والفضة يناسبانك' } },
  { key: 'olive', en: 'Olive', ar: 'زيتوني', hint: { en: 'Green-golden cast — common in the Gulf', ar: 'لمسة ذهبية مخضرة — شائعة في الخليج' } },
]
export const UNDERTONE_BY_KEY = Object.fromEntries(UNDERTONES.map((u) => [u.key, u]))

export function label(item, lang) {
  if (!item) return ''
  return (lang === 'ar' ? item.ar : item.en) || item.en || ''
}
