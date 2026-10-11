import { forwardRef } from 'react'
import { t, toArabicDigits } from '../i18n/strings.js'
import { TILE_IDS } from '../search/tileIds.js'
import { MainTabs } from './MainTabs.jsx'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { TILE_STYLE, levelButtonLabel, paintedBayCode, pick, zoneOfBay } from './model.js'

const mins = (etaS, lang) => t('home.minutes', lang, { n: Math.max(1, Math.round((etaS ?? 0) / 60)) })

/**
 * Home (v0.5, organised as Sam's Stitch mock, DESIGN-MALL.md 3.2): the Map | Offers tabs, "Where to next?", a bento of
 * cards (today's deals, food nearby, find my car, a new brand, facilities), the quick tiles, and a pinned bar: where you
 * are, or the place a card picked, with one primary action (Find a place / Start walking). Every number comes from the
 * data (homeModel.homeCards): no points, no showtimes. The stamp quest is a labelled demo.
 */
export const HomeScreen = forwardRef(function HomeScreen(
  { index, lang, you, car, kiosk = false, cards, stamps = 0, questTotal = 0, picked = null, onTab, onSearch, onTile, onCar, onSelect, onStart, onFacilities, onOffers },
  ref,
) {
  const zone = car ? zoneOfBay(index, car.bayId) : null
  const code = car ? paintedBayCode(index, car.bayId) : null
  const lvl = (levelId) => (levelId ? levelButtonLabel(index, levelId, lang) : '')
  const deals = cards.deals
  const max = deals.maxPct == null ? null : lang === 'ar' ? `${toArabicDigits(deals.maxPct)}٪` : `${deals.maxPct}%`
  const food = cards.food.nearest
  const brand = cards.newBrand
  const rest = cards.restroom.nearest
  // a card that picks a place shows it as selected (aria-pressed); a card that opens a screen has no pressed state
  const card = (id, cls, onClick, children, selectable = true) => (
    <button type="button" className={`bento-card ${cls}`} aria-pressed={selectable ? picked?.id === id : undefined} onClick={onClick}>
      {children}
    </button>
  )
  const youLine = you ? `${pick(you.label, lang)} · ${lvl(you.levelId)}` : t('home.youAreHereUnknown', lang)
  return (
    <Sheet
      ref={ref}
      label={t('home.title', lang)}
      className="home-sheet"
      halfRatio={0.62}
      head={
        <div className="home-head">
          <MainTabs tab="map" lang={lang} onTab={onTab} />
          <div className="home-title-row">
            <div className="min-w-0">
              <div className="home-eyebrow-row">
                <span className="eyebrow">{t('home.eyebrow', lang)}</span>
                {questTotal ? (
                  <span className="quest-pill" title={t('home.questLabel', lang)}>
                    <Icon name="star" size={14} />
                    {t('home.questPill', lang, { n: stamps })}
                  </span>
                ) : null}
              </div>
              <h2 className="home-where">{t('home.where', lang)}</h2>
            </div>
            <button type="button" className="spots-pill" onClick={onSearch}>
              <Icon name="sparkle" size={16} />
              {t('home.spots', lang, { n: cards.places })}
            </button>
          </div>
        </div>
      }
      footer={
        <div className="home-bar">
          <div className="home-bar-text min-w-0">
            <div className="home-bar-eyebrow">{t(picked ? 'home.target' : 'home.youAreHereEyebrow', lang)}</div>
            <div className="home-bar-line">{picked?.line ?? youLine}</div>
          </div>
          <button type="button" className="btn-gradient home-bar-btn" onClick={picked ? onStart : onSearch}>
            <Icon name={picked ? 'walk' : 'search'} size={22} />
            <span>{t(picked ? 'home.start' : 'home.findPlace', lang)}</span>
          </button>
        </div>
      }
    >
      <div className="bento" data-sheet-rows="">
        {deals.count > 0 ? (
          <button type="button" className="bento-banner" onClick={onOffers}>
            <span className="bento-banner-text">
              <span className="bento-banner-eyebrow">
                <Icon name="offers" size={14} />
                {t('home.dealsEyebrow', lang)}
              </span>
              <span className="bento-banner-title">{max ? t('home.dealsTitle', lang, { n: deals.count, max }) : t('home.dealsTitleNoPct', lang, { n: deals.count })}</span>
              <span className="bento-banner-sub">{t('home.dealsSub', lang)}</span>
            </span>
            <span className="bento-banner-tile" aria-hidden="true">
              <Icon name="gift" size={28} />
            </span>
          </button>
        ) : null}

        <div className="bento-row">
          {food
            ? card(
                food.id,
                'is-food',
                () => onSelect(food.id),
                <>
                  <span className="bento-tile" aria-hidden="true">
                    <Icon name="food" size={24} />
                  </span>
                  <span className="bento-chip">{t('home.hungry', lang, { n: cards.food.count })}</span>
                  <span className="bento-title">{pick(food.name, lang)}</span>
                  <span className="bento-foot">
                    <span>
                      <bdi dir="ltr">{lvl(food.levelId)}</bdi>
                      {food.etaS != null ? ` · ${mins(food.etaS, lang)}` : ''}
                    </span>
                    <span className="bento-go" aria-hidden="true">
                      <Icon name="chevron" size={16} className="flip-rtl" />
                    </span>
                  </span>
                </>,
              )
            : null}
          {kiosk
            ? null
            : card(
                car ? car.bayId : '__car',
                'is-car',
                () => (car ? onSelect(car.bayId) : onCar()),
                <>
                  <span className="bento-tile" aria-hidden="true">
                    <Icon name="car" size={24} />
                  </span>
                  <span className="bento-chip">{t(car ? 'car.saved' : 'home.saveSpot', lang)}</span>
                  <span className="bento-title">{t('home.findMyCar', lang)}</span>
                  <span className="bento-foot">
                    <span>
                      {car ? (
                        <>
                          {zone ? `${pick(zone.label, lang)} · ` : ''}
                          <bdi dir="ltr">{code}</bdi>
                        </>
                      ) : (
                        t('home.saveCarHint', lang)
                      )}
                    </span>
                    <span className="bento-go" aria-hidden="true">
                      <Icon name={car ? 'walk' : 'scan'} size={16} />
                    </span>
                  </span>
                </>,
                Boolean(car),
              )}
        </div>

        <div className="bento-row">
          {brand
            ? card(
                brand.occupantId,
                'is-new bento-compact',
                () => onSelect(brand.occupantId),
                <>
                  <span className="bento-tile" aria-hidden="true">
                    <Icon name="sparkle" size={22} />
                  </span>
                  <span className="bento-compact-text">
                    <span className="bento-chip-text">{t('home.newFrom', lang, { origin: pick(brand.origin, lang).replace(/^(From|من)\s+/, '') })}</span>
                    <span className="bento-title">{pick(brand.occupant.name, lang)}</span>
                    <span className="bento-sub">
                      <bdi dir="ltr">{lvl(brand.levelId)}</bdi>
                      {brand.etaS != null ? ` · ${mins(brand.etaS, lang)}` : ''}
                    </span>
                  </span>
                </>,
              )
            : null}
          {card(
            '__fac',
            'is-fac bento-compact',
            onFacilities,
            <>
              <span className="bento-tile" aria-hidden="true">
                <Icon name="restroom" size={22} />
              </span>
              <span className="bento-compact-text">
                <span className="bento-chip-text">{rest?.etaS != null ? t('home.facilitiesChip', lang, { n: Math.max(1, Math.round(rest.etaS / 60)) }) : t('tile.restrooms', lang)}</span>
                <span className="bento-title">{t('strip.facilities', lang)}</span>
                <span className="bento-sub">{t('home.facilitiesSub', lang)}</span>
              </span>
            </>,
            false,
          )}
        </div>

        <div className="quick-chips" role="group" aria-label={t('home.tiles', lang)}>
          {TILE_IDS.map((id) => {
            const style = TILE_STYLE[id]
            return (
              <button key={id} type="button" className="quick-chip" onClick={() => onTile(id)}>
                <span className="quick-chip-icon" style={{ '--tile-c': style.color }}>
                  <Icon name={style.icon} size={18} />
                </span>
                <span>{t(`tile.${id}`, lang)}</span>
              </button>
            )
          })}
        </div>

        <p className="caption text-center home-note">{pick(index.venue.meta.disclaimer, lang)}</p>
      </div>
    </Sheet>
  )
})
