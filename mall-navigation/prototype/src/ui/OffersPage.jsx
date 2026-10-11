import { useMemo, useState } from 'react'
import { addStrings, t } from '../i18n/strings.js'
import { MORE } from '../i18n/strings-more.js'
import { CATEGORY_COLORS } from '../engine/tokens.js'
import { travelTimesFrom } from '../routing/route.js'
import { dealCategories, liveDeals, newBrands, occupantEta, sortDeals } from '../offers/offers.js'
import { venueDate } from './hours.js'
import { MainTabs } from './MainTabs.jsx'
import { Icon } from './icons.jsx'
import { levelButtonLabel, pick } from './model.js'
import './offers.css'

addStrings(MORE)

/** "31 Oct" / «٣١ أكتوبر», with the year only when it is not this year. */
export function formatDay(ymd, lang, thisYear) {
  const d = new Date(`${ymd}T12:00:00Z`)
  const opts = { day: 'numeric', month: 'short', timeZone: 'UTC', ...(ymd.slice(0, 4) !== thisYear ? { year: 'numeric' } : {}) }
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM' : 'en-GB', opts).format(d)
}

/**
 * Offers (v0.5, the second top-level screen; DESIGN-MALL.md 3.3): today's demo deals nearest first (walk time from the
 * you-are-here the shopper set: pull, never GPS), a category filter, and the new global brands. Every card opens the
 * shop's place screen ("Show me"). Fictional shops and prices, and the page says so.
 */
export function OffersPage({ index, lang, you, stepFree, offers, hoursPreview, header, onTab, onShow }) {
  const [cat, setCat] = useState('all')
  const thisYear = venueDate(index).ymd.slice(0, 4)
  const times = useMemo(() => (you ? travelTimesFrom(index, you.nodeId, { stepFree }) : null), [index, you, stepFree])
  const eta = (id) => occupantEta(index, times, id)
  const all = useMemo(() => (offers ? sortDeals(liveDeals(index, offers, { previewId: hoursPreview }), (id) => occupantEta(index, times, id)) : []), [index, offers, hoursPreview, times])
  const cats = dealCategories(all)
  const shown = cat === 'all' ? all : all.filter((d) => d.category === cat)
  const brands = useMemo(() => (offers ? newBrands(index, offers) : []), [index, offers])
  const mins = (s) => (s == null ? null : t('offers.minutes', lang, { n: Math.max(1, Math.round(s / 60)) }))
  return (
    <main className="page offers-page" aria-labelledby="offers-title">
      <div className="page-top">{header}</div>
      <div className="page-body">
        <MainTabs tab="offers" lang={lang} onTab={onTab} />
        <h1 id="offers-title" className="page-title">
          {t('offers.title', lang)}
        </h1>
        <p className="offers-demo">
          <Icon name="info" size={16} />
          {t('offers.demo', lang)}
        </p>

        <div className="chip-row" role="radiogroup" aria-label={t('offers.filter', lang)}>
          {['all', ...cats].map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cat === c} className="filter-chip" onClick={() => setCat(c)}>
              {c === 'all' ? t('offers.all', lang) : t(`category.${c}`, lang)}
            </button>
          ))}
        </div>

        <section className="page-section" aria-labelledby="deals-h">
          <h2 id="deals-h" className="section-h">
            {t('offers.deals', lang)}
          </h2>
          {you ? <p className="caption">{t('offers.near', lang, { place: pick(you.label, lang) })}</p> : null}
          {!offers ? (
            <p className="caption">{t('offers.loading', lang)}</p>
          ) : shown.length === 0 ? (
            <p className="caption">{t('offers.none', lang)}</p>
          ) : (
            <div className="deal-grid">
              {shown.map((d) => (
                <article key={d.id} className="deal-card" style={{ '--cat': CATEGORY_COLORS[d.category] ?? CATEGORY_COLORS.services }}>
                  <div className="deal-band">
                    <span className="deal-tag">{t('offers.offer', lang)}</span>
                    {d.isNew ? <span className="badge-new">{t('offers.badgeNew', lang)}</span> : null}
                    <span className="deal-figure">{pick(d.figure, lang)}</span>
                  </div>
                  <div className="deal-body">
                    <h3 className="deal-shop">{pick(d.occupant.name, lang)}</h3>
                    <p className="deal-title">{pick(d.title, lang)}</p>
                    <div className="deal-meta">
                      <span className="deal-level">
                        <bdi dir="ltr">{levelButtonLabel(index, d.levelId, lang)}</bdi>
                      </span>
                      {eta(d.occupantId) != null ? (
                        <span className="deal-mins">
                          <Icon name="walk" size={16} />
                          {mins(eta(d.occupantId))}
                        </span>
                      ) : null}
                      <span className="deal-until">{t('offers.until', lang, { date: formatDay(d.to, lang, thisYear) })}</span>
                    </div>
                    <button type="button" className="btn-gradient deal-show" onClick={() => onShow(d.occupantId)}>
                      <Icon name="pin" size={20} />
                      {t('offers.show', lang)}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {brands.length ? (
          <section className="page-section" aria-labelledby="brands-h">
            <h2 id="brands-h" className="section-h">
              {t('offers.newBrands', lang)}
            </h2>
            <div className="brand-row">
              {brands.map((b) => (
                <article key={b.occupantId} className="brand-card">
                  <span className="brand-mono" style={{ '--cat': CATEGORY_COLORS[b.category] ?? CATEGORY_COLORS.services }} aria-hidden="true">
                    {b.occupant.name.en
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join('')}
                  </span>
                  <h3 className="brand-name">{pick(b.occupant.name, lang)}</h3>
                  <p className="brand-origin">{pick(b.origin, lang)}</p>
                  <p className="brand-opened">{t('offers.opened', lang, { date: formatDay(b.openedOn, lang, thisYear) })}</p>
                  <div className="brand-foot">
                    <span className="deal-level">
                      <bdi dir="ltr">{levelButtonLabel(index, b.levelId, lang)}</bdi>
                    </span>
                    {eta(b.occupantId) != null ? <span className="deal-mins">{mins(eta(b.occupantId))}</span> : null}
                  </div>
                  <button type="button" className="btn-ghost brand-show" onClick={() => onShow(b.occupantId)}>
                    {t('offers.show', lang)}
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <p className="caption offers-foot">{pick(index.venue.meta.disclaimer, lang)}</p>
      </div>
    </main>
  )
}
