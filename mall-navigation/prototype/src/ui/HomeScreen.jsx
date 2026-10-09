import { forwardRef } from 'react'
import { t } from '../i18n/strings.js'
import { TILE_IDS } from '../search/search.js'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { TILE_STYLE, levelButtonLabel, paintedBayCode, pick, zoneOfBay } from './model.js'

/**
 * Home (S03): one task: pick where to go. The search bar is the sheet's head (it stays when the sheet is folded); the
 * body holds the six tiles, the you-are-here chip, My car and the fictional-venue disclaimer, in that order, so the
 * default (half) sheet shows search and all six tiles even on a short phone.
 */
export const HomeScreen = forwardRef(function HomeScreen({ index, lang, you, car, onScan, onSearchFocus, onTile, onCar }, ref) {
  const zone = car ? zoneOfBay(index, car.bayId) : null
  const code = car ? paintedBayCode(index, car.bayId) : null
  return (
    <Sheet
      ref={ref}
      label={t('home.title', lang)}
      className="home-sheet"
      head={
        <button type="button" className="search-box w-full text-start" onClick={onSearchFocus} aria-label={t('home.searchLabel', lang)}>
          <Icon name="search" size={24} />
          <span className="search-ph">{t('home.searchPlaceholder', lang)}</span>
        </button>
      }
    >
      <div className="home-stack" data-sheet-rows="">
        <div className="tiles" role="group" aria-label={t('home.tiles', lang)} data-sheet-rows="">
          {TILE_IDS.map((id) => {
            const style = TILE_STYLE[id]
            return (
              <button key={id} type="button" className="tile" onClick={() => onTile(id)}>
                <span className="tile-icon" style={{ '--tile-c': style.color }}>
                  <Icon name={style.icon} size={24} />
                </span>
                <span>{t(`tile.${id}`, lang)}</span>
              </button>
            )
          })}
        </div>

        <button type="button" className="here-chip" onClick={onScan}>
          <span className="here-dot" aria-hidden="true" />
          <span className="here-text">
            {you ? t('home.youAreHere', lang, { place: pick(you.label, lang) }) : t('home.youAreHereUnknown', lang)}
            {you ? (
              <small>
                {t('common.level', lang)} <bdi dir="ltr">{levelButtonLabel(index, you.levelId, lang)}</bdi> ·{' '}
                {you.source === 'sim' ? (
                  t('sim.label', lang)
                ) : (
                  <>
                    {/* the long note only where it fits on one line (CSS: .here-src-long from 430 px wide) */}
                    <span className="here-src-long">{t('scan.exact', lang)}</span>
                    <span className="here-src-short">{t('scan.exactShort', lang)}</span>
                  </>
                )}
              </small>
            ) : null}
          </span>
          {/* under 380 px wide: icon only (still a 44 px target), so the place name gets the room */}
          <span className="here-change" aria-label={t('home.change', lang)}>
            <Icon name="scan" size={20} />
            <span className="wide-only">{t('home.change', lang)}</span>
          </span>
        </button>

        <button
          type="button"
          className="car-chip"
          onClick={onCar}
          aria-label={car ? `${t('car.title', lang)}: ${zone ? `${pick(zone.label, lang)} · ` : ''}${code}` : t('home.saveCar', lang)}
        >
          <span className="car-badge" aria-hidden="true">
            <Icon name="car" size={24} />
          </span>
          <span className="car-chip-text">
            {car ? (
              <>
                {zone ? `${pick(zone.label, lang)} · ` : `${t('car.title', lang)} · `}
                <bdi dir="ltr">{code}</bdi>
              </>
            ) : (
              t('home.saveCar', lang)
            )}
          </span>
          {zone ? (
            // colour always comes with its icon and name (PLAN.md section 9)
            <span className="zone-swatch" style={{ background: zone.color, color: zone.fg }} aria-hidden="true">
              <Icon name={zone.icon} size={22} />
            </span>
          ) : null}
          <Icon name="chevron" size={22} className="flip-rtl" style={{ color: 'var(--ink-2-raised)' }} />
        </button>

        <p className="caption text-center home-note">{pick(index.venue.meta.disclaimer, lang)}</p>
      </div>
    </Sheet>
  )
})
