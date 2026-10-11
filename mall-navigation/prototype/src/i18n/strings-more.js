/**
 * Strings of the screens that load on demand (v0.5: offers, Mall info, facilities, emergency, kiosk, dashboard), kept
 * out of the first screen. Each lazy chunk calls `addStrings(MORE)` when it loads (src/i18n/strings.js). Same rules as
 * the main table: English and Arabic for every key, the same {placeholders}, Arabic in Arabic script.
 */
export const MORE = Object.freeze({
  // offers page (S26) and the offer card on a shop's place screen
  'offers.title': { en: 'Offers & new brands', ar: 'العروض والعلامات الجديدة' },
  'offers.all': { en: 'All', ar: 'الكل' },
  'offers.deals': { en: 'Deals today', ar: 'عروض اليوم' },
  'offers.dealsIn': { en: 'Deals in {name}', ar: 'عروض {name}' },
  'offers.until': { en: 'Until {date}', ar: 'حتى {date}' },
  'offers.show': { en: 'Show me', ar: 'أرني المكان' },
  'offers.newBrands': { en: 'New in the mall · global brands', ar: 'جديد في المول · علامات عالمية' },
  'offers.opened': { en: 'New · opened {date}', ar: 'جديد · افتُتح {date}' },
  'offers.demo': { en: 'Demo offers · fictional shops. Prices are examples.', ar: 'عروض تجريبية · متاجر خيالية. الأسعار أمثلة.' },
  'offers.none': { en: 'No offers in this category right now.', ar: 'لا توجد عروض في هذه الفئة حالياً.' },
  'offers.minutes': { en: '{n} min', ar: '{n} د' },
  'offers.badgeNew': { en: 'New', ar: 'جديد' },
  'offers.offer': { en: 'Offer', ar: 'عرض' },
  'offers.loading': { en: 'Loading offers…', ar: 'جارٍ تحميل العروض…' },
  'offers.filter': { en: 'Filter offers by category', ar: 'تصفية العروض حسب الفئة' },
  'offers.near': { en: 'Nearest first, from {place}', ar: 'الأقرب أولاً، من {place}' },
})
