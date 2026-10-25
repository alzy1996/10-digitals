// Seed data so the app works on first open (demo mode) and so a new salon can start in one tap.
import { BASE_LIBRARY } from './library'

export const SEED_SALON = {
  name: 'Nail Mirror Studio',
  nameAr: 'استوديو مرآة الأظافر',
  tagline: 'See it on your hand before we paint it.',
  taglineAr: 'شوفي اللون على يدك قبل ما نبدأ.',
  whatsapp: '96890000000',
  phone: '+968 9000 0000',
  instagram: '',
  address: 'Al Mouj, Muscat, Oman',
  addressAr: 'الموج، مسقط، عُمان',
  hours: 'Sat–Thu 10:00–22:00',
  hoursAr: 'السبت–الخميس 10:00–22:00',
  currency: 'OMR',
  showPrices: true,
  onlyInStock: true,
  publicTryOn: true,
}

// Price per finish / type in OMR (3 decimals) — editable in Admin
const PRICE = { gel: 8, lacquer: 4, breathable: 5, biab: 15, acrylic: 18, dip: 12, presson: 10 }
const FINISH_EXTRA = { chrome: 3, holo: 3, cateye: 3, velvet: 3, duochrome: 3, glitter: 2 }

/** Demo inventory = a realistic subset of the library with stock + prices. */
export function buildSeedInventory() {
  return BASE_LIBRARY.map((s, i) => {
    const type = s.family === 'nudes' && i % 3 === 0 ? 'breathable' : s.family === 'milky' && i % 2 === 0 ? 'biab' : 'gel'
    return {
      brand: 'House Gel',
      line: s.family === 'metallics' ? 'Effects' : 'Color Gel',
      name: s.name,
      nameAr: s.nameAr,
      code: s.code,
      hex: s.hex,
      hex2: s.hex2 || '',
      family: s.family,
      finish: s.finish,
      type,
      price: PRICE[type] + (FINISH_EXTRA[s.finish] || 0),
      stock: [6, 4, 8, 0, 5, 3, 7, 10, 2, 9, 5, 6][i % 12], // a few low / sold out to demo alerts
      barcode: '',
      active: true,
      tags: [],
      notes: '',
    }
  })
}

export const SEED_SERVICES = [
  { name: 'Gel Manicure', nameAr: 'مانيكير جل', price: 8, durationMin: 45, category: 'hands', active: true },
  { name: 'Classic Manicure', nameAr: 'مانيكير كلاسيك', price: 5, durationMin: 30, category: 'hands', active: true },
  { name: 'Breathable Polish (maker claim)', nameAr: 'مناكير قابل للتنفّس (حسب المصنّع)', price: 6, durationMin: 30, category: 'hands', active: true },
  { name: 'BIAB / Builder Gel', nameAr: 'جل بناء BIAB', price: 15, durationMin: 75, category: 'hands', active: true },
  { name: 'Acrylic Extensions', nameAr: 'تركيب أظافر أكريليك', price: 20, durationMin: 90, category: 'extensions', active: true },
  { name: 'Chrome / Cat Eye Upgrade', nameAr: 'إضافة كروم / عين القطة', price: 3, durationMin: 10, category: 'art', active: true },
  { name: 'French Tips', nameAr: 'فرنش', price: 3, durationMin: 15, category: 'art', active: true },
  { name: 'Gel Pedicure', nameAr: 'بديكير جل', price: 10, durationMin: 60, category: 'feet', active: true },
  { name: 'Gel Removal', nameAr: 'إزالة الجل', price: 2, durationMin: 15, category: 'hands', active: true },
]
