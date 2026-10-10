import { forwardRef } from 'react'
import { t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { levelName, pick } from './model.js'

/** "Found it ✓" without the tick character (drawn as an SVG icon: the UI font has no ✓ glyph). */
function foundItLabel(lang) {
  return t('arrived.foundIt', lang).replace('✓', '').trim()
}

/**
 * Arrived (S13): green confirmation, one primary action (Found it), and two quiet follow-ups.
 * The map behind keeps the destination sign in view. The confirmation is the sheet's head, one compact row (the tick,
 * "You've arrived · level" and the place's name), and Found it the footer right under it (what stays when the sheet
 * is folded); the follow-ups and the simulated-arrival note follow.
 */
export const ArrivedScreen = forwardRef(function ArrivedScreen({ index, lang, info, simulated, hasCar, onFound, onBackToCar, onAnother }, ref) {
  return (
    <Sheet
      ref={ref}
      label={t('arrived.title', lang)}
      className="arrived-sheet"
      head={
        <div className="arrived-hero">
          <span className="arrived-check" aria-hidden="true">
            <Icon name="check" size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="arrived-label">
              {t('arrived.title', lang)}
              {info?.levelId ? <span className="arrived-level">{` · ${levelName(index, info.levelId, lang)}`}</span> : null}
            </p>
            <h2 className="arrived-name">{info ? pick(info.name, lang) : ''}</h2>
          </div>
        </div>
      }
      footer={
        <button type="button" className="btn btn-ok btn-block btn-go" onClick={onFound}>
          {foundItLabel(lang)}
          <Icon name="check" size={26} />
        </button>
      }
      bodyAfterFooter
    >
      <div className="arrived-more flex flex-wrap gap-2 justify-center">
        {hasCar ? (
          <button type="button" className="chip" onClick={onBackToCar}>
            <Icon name="car" size={20} />
            {t('arrived.backToCar', lang)}
          </button>
        ) : null}
        <button type="button" className="chip" onClick={onAnother}>
          <Icon name="search" size={20} />
          {t('arrived.anotherShop', lang)}
        </button>
      </div>
      {simulated ? <p className="caption mt-2 text-center">{t('sim.arrivedNote', lang)}</p> : null}
    </Sheet>
  )
})
