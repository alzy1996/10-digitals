import { describe, it, expect } from 'vitest'
import { activeSpecial, hoursText, mallIntervals, openNow, shopIntervals, venueDate, weekTable } from '../src/ui/hours.js'

const index = {
  venue: {
    meta: {
      timezone: 'Asia/Muscat',
      hours: {
        weekly: {
          sat: [{ open: '10:00', close: '22:00' }], sun: [{ open: '10:00', close: '22:00' }], mon: [{ open: '10:00', close: '22:00' }],
          tue: [{ open: '10:00', close: '22:00' }], wed: [{ open: '10:00', close: '22:00' }],
          thu: [{ open: '10:00', close: '23:00' }], fri: [{ open: '10:00', close: '23:00' }],
        },
        specials: [
          { id: 'ramadan-2027', kind: 'ramadan', name: { en: 'Ramadan', ar: 'رمضان' }, from: '2027-02-08', to: '2027-03-09', expected: true,
            mall: [{ open: '10:00', close: '15:00' }, { open: '20:00', close: '01:00' }], shops: 'mall' },
          { id: 'eid-fitr-2027', kind: 'eid', name: { en: 'Eid al-Fitr', ar: 'عيد الفطر' }, from: '2027-03-10', to: '2027-03-12', expected: true,
            mall: [{ open: '10:00', close: '24:00' }], shops: 'mall' },
        ],
      },
    },
  },
}
// 2026-10-11 is a Sunday; Muscat is UTC+4
const at = (iso) => new Date(iso)

describe('venue date', () => {
  it('reads the date, weekday and clock in the venue time zone', () => {
    expect(venueDate(index, at('2026-10-11T18:30:00Z'))).toEqual({ ymd: '2026-10-11', dow: 'sun', clock: '22:30' })
    expect(venueDate(index, at('2026-10-11T21:10:00Z'))).toEqual({ ymd: '2026-10-12', dow: 'mon', clock: '01:10' })
  })
})

describe('mall and shop intervals', () => {
  it('uses the weekly hours, longer on Thursday', () => {
    expect(mallIntervals(index, at('2026-10-11T08:00:00Z'))).toEqual([{ open: '10:00', close: '22:00' }])
    expect(mallIntervals(index, at('2026-10-15T08:00:00Z'))).toEqual([{ open: '10:00', close: '23:00' }])
  })
  it('a date inside Ramadan, or the Ramadan preview, gives the two Ramadan intervals', () => {
    const two = [{ open: '10:00', close: '15:00' }, { open: '20:00', close: '01:00' }]
    expect(mallIntervals(index, at('2027-02-20T08:00:00Z'))).toEqual(two)
    expect(mallIntervals(index, at('2026-10-11T08:00:00Z'), 'ramadan-2027')).toEqual(two)
    expect(activeSpecial(index, at('2027-03-11T08:00:00Z'))?.id).toBe('eid-fitr-2027')
    expect(activeSpecial(index, at('2026-10-11T08:00:00Z'))).toBeNull()
  })
  it('shops keep their own hours on normal days, follow the mall in Ramadan unless they have Ramadan hours', () => {
    const shop = { hours: { open: '10:00', close: '22:00' } }
    const grocery = { hours: { open: '08:00', close: '24:00' }, ramadan: [{ open: '08:00', close: '02:00' }] }
    expect(shopIntervals(index, shop, at('2026-10-11T08:00:00Z'))).toEqual([{ open: '10:00', close: '22:00' }])
    expect(shopIntervals(index, shop, at('2026-10-11T08:00:00Z'), 'ramadan-2027')).toHaveLength(2)
    expect(shopIntervals(index, grocery, at('2026-10-11T08:00:00Z'), 'ramadan-2027')).toEqual([{ open: '08:00', close: '02:00' }])
    expect(shopIntervals(index, { hours: null }, at('2026-10-11T08:00:00Z'))).toEqual([])
  })
})

describe('open now', () => {
  const ram = [{ open: '10:00', close: '15:00' }, { open: '20:00', close: '01:00' }]
  it('is closed between the Ramadan intervals and opens at 20:00', () => {
    expect(openNow(ram, '16:00')).toEqual({ isOpen: false, until: null, opensAt: '20:00' })
  })
  it('is open after midnight inside a wrapping interval', () => {
    expect(openNow(ram, '00:30')).toEqual({ isOpen: true, until: '01:00', opensAt: null })
    expect(openNow(ram, '12:00')).toEqual({ isOpen: true, until: '15:00', opensAt: null })
  })
  it('after the last interval opens at the first one (tomorrow)', () => {
    expect(openNow([{ open: '10:00', close: '22:00' }], '23:00')).toEqual({ isOpen: false, until: null, opensAt: '10:00' })
    expect(openNow([{ open: '08:00', close: '24:00' }], '23:59').isOpen).toBe(true)
    expect(openNow([], '12:00')).toBeNull()
  })
})

describe('hours text and week table', () => {
  it('writes the line in English and Arabic', () => {
    expect(hoursText([{ open: '10:00', close: '22:00' }], '12:00', 'en')).toEqual({ ok: true, text: 'Open until 22:00' })
    expect(hoursText([{ open: '08:00', close: '24:00' }], '12:00', 'en').text).toBe('Open until midnight')
    expect(hoursText([{ open: '20:00', close: '01:00' }], '16:00', 'en')).toEqual({ ok: false, text: 'Closed now · Opens at 20:00' })
    expect(hoursText([{ open: '10:00', close: '22:00' }], '12:00', 'ar').text).toContain('٢٢:٠٠')
  })
  it('lists Saturday to Friday and flags today', () => {
    const w = weekTable(index, at('2026-10-11T08:00:00Z'))
    expect(w.map((d) => d.dow)).toEqual(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'])
    expect(w.find((d) => d.isToday).dow).toBe('sun')
  })
})

describe('place screen hours line (model.hoursLine)', () => {
  it('follows the Ramadan preview: 16:00 Muscat is between the two Ramadan intervals', async () => {
    const { hoursLine } = await import('../src/ui/model.js')
    const shop = { hours: { open: '10:00', close: '22:00' } }
    const at16 = new Date('2026-10-11T12:00:00Z')
    expect(hoursLine(index, shop, 'en', at16)).toEqual({ ok: true, text: 'Open until 22:00' })
    expect(hoursLine(index, shop, 'en', at16, 'ramadan-2027')).toEqual({ ok: false, text: 'Closed now · Opens at 20:00' })
    expect(hoursLine(index, { hours: null }, 'en', at16)).toBeNull()
  })
})
