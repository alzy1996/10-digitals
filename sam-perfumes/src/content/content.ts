// ════════════════════════════════════════════
// ALL site content lives here — EN + AR strings,
// products, contact links. Components render only
// from this file; no strings are hardcoded elsewhere.
// ════════════════════════════════════════════

export const WHATSAPP_NUMBER = '96877019962' // +968 7701 9962
export const IG_URL = 'https://instagram.com/sam.pro.ai'

// Prefix a public asset with the deploy base ('/' at root, '/10-digitals/'
// on GitHub Pages) so /img and /media resolve wherever the site is hosted.
export const asset = (p: string) => `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`

export type Lang = 'en' | 'ar'

export interface Product {
  id: string
  nameEn: string
  nameAr: string
  notes: { en: string; ar: string }
  desc: { en: string; ar: string }
  price: string // TODO Sam: real prices
  img: string
}

// TODO Sam: replace the 4 placeholder products with the real line-up
export const products: Product[] = [
  {
    id: 'product-01',
    nameEn: 'Gold Memoir',
    nameAr: 'ذكرى الذهب',
    notes: { en: 'Saffron · Amber · Oud', ar: 'زعفران · عنبر · عود' },
    desc: {
      en: 'A radiant amber trail that lingers from dusk till dawn.',
      ar: 'أثرٌ عنبريّ مضيء يرافقك من الغسق حتى الفجر.',
    },
    price: '10 OMR',
    img: asset('img/product-01.png'),
  },
  {
    id: 'product-02',
    nameEn: 'Mystic Oud',
    nameAr: 'عود الأسرار',
    notes: { en: 'Oud · Rose · Smoke', ar: 'عود · ورد · دخان' },
    desc: {
      en: 'Deep Omani oud wrapped in a veil of Taif rose.',
      ar: 'عودٌ عُماني عميق يكتسي بوشاحٍ من الورد الطائفي.',
    },
    price: '10 OMR',
    img: asset('img/product-02.png'),
  },
  {
    id: 'product-03',
    nameEn: 'Sea of Pearls',
    nameAr: 'بحر اللؤلؤ',
    notes: { en: 'Bergamot · Musk · Sea Salt', ar: 'برغموت · مسك · ملح البحر' },
    desc: {
      en: 'A crisp coastal breeze remembered in glass.',
      ar: 'نسيم الساحل العليل محفوظًا في زجاجة.',
    },
    price: '10 OMR',
    img: asset('img/product-03.png'),
  },
  {
    id: 'product-04',
    nameEn: 'Desert Bloom',
    nameAr: 'زهرة الصحراء',
    notes: { en: 'Frankincense · Jasmine · Vanilla', ar: 'لُبان · ياسمين · فانيليا' },
    desc: {
      en: 'Dhofari frankincense meets a garden in first light.',
      ar: 'لُبان ظفار يعانق حديقةً عند أول الضوء.',
    },
    price: '10 OMR',
    img: asset('img/product-04.png'),
  },
]

export const heroImages = {
  main: asset('img/hero-bottle-1.png'),
  back: asset('img/hero-bottle-2.png'),
}

export const strings = {
  en: {
    nav: {
      shop: 'Shop',
      collection: 'Collection',
      new: 'New',
      about: 'About',
      bestSeller: 'Best Seller',
      contact: 'Contact',
      menu: 'Menu',
      close: 'Close',
    },
    brand: { name: 'SAM', sub: 'Perfumes' },
    preloader: { title: 'SAM PERFUMES' },
    hero: {
      titlePre: 'Evoke every ',
      titleAccent: 'emotion',
      titlePost: ' with SAM.',
      sub: 'Hand-blended luxury fragrances from Muscat — rare oils, patient craft, and a scent that stays with you.',
      cta: 'Shop Now',
      featuredLabel: 'Featured',
    },
    bestSellers: { label: 'BEST SELLER', index: '01' },
    collection: { titlePre: 'The ', titleAccent: 'Collection', titlePost: '', order: 'اطلب / Order' },
    story: {
      titlePre: 'Crafted in ',
      titleAccent: 'Muscat',
      titlePost: '.',
      body: 'Every SAM fragrance begins in our Muscat atelier, where rare oils are blended by hand and left to rest until the scent settles into its final character. Small batches. No shortcuts.',
      chips: ['Hand-blended', 'Long-lasting oils', 'Since 20XX'], // TODO Sam: real founding year
    },
    signature: {
      titlePre: 'The ',
      titleAccent: 'Signature',
      titlePost: ' scent.',
      // TODO Sam: real signature perfume notes
      notes: [
        { num: '01', tier: 'TOP', name: 'Saffron', desc: 'The first spark — bright, spiced, unmistakable.' },
        { num: '02', tier: 'HEART', name: 'Taif Rose', desc: 'The soul of the blend, unfolding over hours.' },
        { num: '03', tier: 'BASE', name: 'Omani Oud', desc: 'The lasting trail that becomes your signature.' },
      ],
    },
    order: {
      titlePre: 'Your signature ',
      titleAccent: 'scent',
      titlePost: ' awaits.',
      whatsapp: 'Order on WhatsApp',
      instagram: 'Instagram',
      waGeneralMessage: 'Hello, I would like to order from SAM Perfumes.',
    },
    footer: {
      location: 'Muscat, Oman',
      rights: '© 2026 SAM Perfumes',
    },
    whatsappOrderMessage: (nameEn: string) => `مرحباً، أريد طلب ${nameEn} من SAM Perfumes`,
  },
  ar: {
    nav: {
      shop: 'المتجر',
      collection: 'التشكيلة',
      new: 'الجديد',
      about: 'عن سام',
      bestSeller: 'الأكثر مبيعًا',
      contact: 'تواصل',
      menu: 'القائمة',
      close: 'إغلاق',
    },
    brand: { name: 'سام', sub: 'للعطور' },
    preloader: { title: 'SAM PERFUMES' },
    hero: {
      titlePre: 'أيقظ كل ',
      titleAccent: 'إحساس',
      titlePost: ' مع سام.',
      sub: 'عطور فاخرة تُمزج يدويًا في مسقط — زيوت نادرة، وحرفة صبورة، وعبير يبقى معك.',
      cta: 'تسوّق الآن',
      featuredLabel: 'العطر المميز',
    },
    bestSellers: { label: 'الأكثر مبيعًا', index: '01' },
    collection: { titlePre: '', titleAccent: 'التشكيلة', titlePost: ' الكاملة', order: 'اطلب الآن' },
    story: {
      titlePre: 'صُنع في ',
      titleAccent: 'مسقط',
      titlePost: '.',
      body: 'يبدأ كل عطر من سام في محترفنا بمسقط، حيث تُمزج الزيوت النادرة يدويًا وتُترك لترتاح حتى يكتمل طابعها الأخير. دفعات صغيرة، وبلا اختصارات.',
      chips: ['مزج يدوي', 'زيوت تدوم طويلًا', 'منذ 20XX'], // TODO Sam: سنة التأسيس
    },
    signature: {
      titlePre: 'العطر ',
      titleAccent: 'التوقيع',
      titlePost: '.',
      // TODO Sam: مكونات العطر المميز الحقيقية
      notes: [
        { num: '01', tier: 'المقدمة', name: 'زعفران', desc: 'الشرارة الأولى — مشرقة، متبّلة، لا تُنسى.' },
        { num: '02', tier: 'القلب', name: 'ورد طائفي', desc: 'روح المزيج، تتفتح على مدى ساعات.' },
        { num: '03', tier: 'القاعدة', name: 'عود عُماني', desc: 'الأثر الباقي الذي يصبح توقيعك.' },
      ],
    },
    order: {
      titlePre: 'عبيرك ',
      titleAccent: 'الخاص',
      titlePost: ' في انتظارك.',
      whatsapp: 'اطلب عبر واتساب',
      instagram: 'إنستغرام',
      waGeneralMessage: 'مرحباً، أرغب بالطلب من سام للعطور.',
    },
    footer: {
      location: 'مسقط، سلطنة عُمان',
      rights: '© 2026 سام للعطور',
    },
    whatsappOrderMessage: (nameEn: string) => `مرحباً، أريد طلب ${nameEn} من SAM Perfumes`,
  },
} as const

export function waLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}
