import { forwardRef } from 'react'
import { t, toArabicDigits } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { bayForPlate, levelButtonLabel, levelName, paintedBayCode, pick, plateLabelInLevel, platesByLevel, shortDuration, zoneOfBay, zoneOfPlate } from './model.js'

/**
 * Car flow (S01 / S02 / S14), simulated: scan the parking plate -> Save my car -> Car Card -> Take me there.
 * Stages: 'scan' (choose the plate from a list or tap it on the map), 'confirm', 'card'.
 * The car is kept in memory for this visit only (no localStorage).
 * Bay codes are shown exactly as painted ("B1-43") in both languages, left-to-right (PLAN.md section 9).
 * Sheets: on the Car Card the car in one compact row (zone colour and name, painted bay code, level) is the sheet's head
 * and Take me there its footer, so the folded sheet still says where the car is and leaves the map almost whole; the
 * body has when it was saved, step-free (shown from half up), the time from here, the full car card and the other
 * actions. Confirming a plate keeps its question and Save my car here when folded; scanning keeps its title (the plate
 * list is the body).
 */
export const CarScreen = forwardRef(function CarScreen(
  { index, lang, car, stage, plateId, you, etaToCarS, stepFree, onPickPlate, onSave, onRescan, onTakeMeThere, onForget, onToggleStepFree, onBack },
  ref,
) {
  if (stage === 'card' && car) {
    return (
      <CarCard
        ref={ref}
        index={index}
        lang={lang}
        car={car}
        you={you}
        etaToCarS={etaToCarS}
        stepFree={stepFree}
        onTakeMeThere={onTakeMeThere}
        onRescan={onRescan}
        onForget={onForget}
        onToggleStepFree={onToggleStepFree}
        onBack={onBack}
      />
    )
  }
  if (stage === 'confirm' && plateId) {
    const plate = index.anchorById.get(plateId)
    const bay = bayForPlate(index, plateId)
    const zone = zoneOfPlate(index, plateId)
    return (
      <Sheet
        ref={ref}
        label={t('car.confirm', lang)}
        head={
          <div className="flex items-start gap-3">
            <button type="button" className="icon-btn" onClick={onRescan} aria-label={t('common.back', lang)}>
              <Icon name="back" size={24} className="flip-rtl" />
            </button>
            <h2 className="title flex-1">{t('car.confirm', lang)}</h2>
          </div>
        }
        footer={
          <button type="button" className="btn btn-primary btn-block btn-go" onClick={() => onSave(plateId)}>
            <Icon name="car" size={26} />
            {t('car.save', lang)}
          </button>
        }
      >
        {zone && bay ? (
          <div className="car-card">
            <ZoneBlock lang={lang} zone={zone} />
            <div className="car-card-body">
              <div className="min-w-0">
                <p className="caption">{t('car.bay', lang, { bay: '' }).trim()}</p>
                <p className="bay-code">
                  <bdi dir="ltr">{paintedBayCode(index, bay.id)}</bdi>
                </p>
              </div>
              <LevelBox index={index} lang={lang} levelId={bay.levelId} />
            </div>
            <p className="caption px-4 pb-3 flex items-center gap-2">
              <span className="plate-code">
                <bdi dir="ltr">{plate?.code}</bdi>
              </span>
              <span className="truncate">{plate ? plateLabelInLevel(index, plate, lang) : ''}</span>
            </p>
          </div>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="caption">{t('car.savedNote', lang)}</p>
          <button type="button" className="chip flex-none" onClick={onRescan}>
            {t('car.otherPlate', lang)}
          </button>
        </div>
      </Sheet>
    )
  }
  // stage 'scan'
  const groups = platesByLevel(index, { kinds: ['parking_pillar'] })
  return (
    <Sheet
      ref={ref}
      label={t('car.scanPlate', lang)}
      head={
        <div className="flex items-center gap-3">
          <button type="button" className="icon-btn" onClick={onBack} aria-label={t('common.back', lang)}>
            <Icon name="back" size={24} className="flip-rtl" />
          </button>
          <h2 className="title flex-1 min-w-0 flex items-center gap-2">
            <span className="title-icon" aria-hidden="true">
              <Icon name="scan" size={26} />
            </span>
            {t('car.scanPlate', lang)}
          </h2>
        </div>
      }
    >
      <p className="caption">{t('car.scanSimulated', lang)}</p>
      <p className="caption flex items-center gap-2 mb-1">
        <Icon name="pin" size={18} />
        {t('scan.tapOnMap', lang)}
      </p>
      <div data-sheet-rows="">
        {groups.map(({ level, plates }) => (
          <div key={level.id} className="list" data-sheet-rows="">
            <div className="list-head section-label">{levelName(index, level.id, lang)}</div>
            {plates.map((plate) => {
              const zone = zoneOfPlate(index, plate.id)
              return (
                <button key={plate.id} type="button" className="row" onClick={() => onPickPlate(plate.id)}>
                  <span className="row-icon" style={{ background: zone?.color ?? '#1E3A8A', color: zone?.fg ?? '#FFFFFF' }}>
                    <Icon name={zone?.icon ?? 'parking'} size={26} />
                  </span>
                  <span className="row-main">
                    <span className="row-title block">{pick(zone?.label, lang)}</span>
                    <span className="row-sub block">{plateLabelInLevel(index, plate, lang).split(' · ').slice(2).join(' · ')}</span>
                  </span>
                  <span className="row-end">
                    <span className="plate-code">
                      <bdi dir="ltr">{plate.code}</bdi>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </Sheet>
  )
})

function ZoneBlock({ lang, zone }) {
  return (
    <div className="zone-block" style={{ background: zone.color, color: zone.fg }}>
      <span className="zone-icon">
        <Icon name={zone.icon} size={36} />
      </span>
      <div className="min-w-0">
        <p className="zone-label">{t('car.zone', lang)}</p>
        <p className="zone-name">{pick(zone.label, lang)}</p>
      </div>
    </div>
  )
}

function LevelBox({ index, lang, levelId }) {
  return (
    <div className="text-end flex-none">
      <p className="caption">{t('car.level', lang)}</p>
      <p className="num-card" aria-label={levelName(index, levelId, lang)}>
        <bdi dir="ltr">{levelButtonLabel(index, levelId, lang)}</bdi>
      </p>
    </div>
  )
}

function clockOf(ms, lang) {
  const d = new Date(ms)
  const s = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return lang === 'ar' ? toArabicDigits(s) : s
}

/**
 * The car in one compact row (the Car Card sheet's head, what stays when it folds): the zone's colour and icon, its
 * name, the bay code as painted and the level.
 */
function CarSummary({ index, lang, zone, bayId, levelId }) {
  const code = paintedBayCode(index, bayId)
  return (
    <div className="car-sum" style={zone ? { background: zone.color, color: zone.fg } : undefined}>
      {zone ? (
        <span className="car-sum-icon" aria-hidden="true">
          <Icon name={zone.icon} size={26} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="car-sum-zone">{zone ? pick(zone.label, lang) : t('car.title', lang)}</p>
        <p className="car-sum-bay" aria-label={t('car.bay', lang, { bay: code })}>
          <bdi dir="ltr">{code}</bdi>
        </p>
      </div>
      {levelId ? (
        <p className="car-sum-level" aria-label={levelName(index, levelId, lang)}>
          <small aria-hidden="true">{t('car.level', lang)}</small>
          <b aria-hidden="true">
            <bdi dir="ltr">{levelButtonLabel(index, levelId, lang)}</bdi>
          </b>
        </p>
      ) : null}
    </div>
  )
}

const CarCard = forwardRef(function CarCard({ index, lang, car, you, etaToCarS, stepFree, onTakeMeThere, onRescan, onForget, onToggleStepFree, onBack }, ref) {
  const zone = zoneOfBay(index, car.bayId)
  const bay = index.bayById.get(car.bayId)
  return (
    <Sheet
      ref={ref}
      label={t('car.title', lang)}
      className="car-sheet"
      head={
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn" onClick={onBack} aria-label={t('common.back', lang)}>
            <Icon name="back" size={24} className="flip-rtl" />
          </button>
          <CarSummary index={index} lang={lang} zone={zone} bayId={car.bayId} levelId={bay?.levelId} />
        </div>
      }
      footer={
        <button type="button" className="btn btn-primary btn-block btn-go" onClick={onTakeMeThere}>
          <Icon name="car" size={26} />
          {t('car.takeMeThere', lang)}
        </button>
      }
    >
      <div className="flex items-center gap-3 car-title-row">
        <h2 className="title flex-1">{t('car.title', lang)}</h2>
        <span className="saved-at">
          <Icon name="check" size={20} />
          {t('car.savedAt', lang, { time: clockOf(car.savedAt, lang) })}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={stepFree}
        aria-label={t('place.stepFreeToggle', lang)}
        className="switch-row mt-2"
        onClick={onToggleStepFree}
      >
        <Icon name="accessible" size={24} />
        <span className="flex-1">{t('common.stepFree', lang)}</span>
        <span className="switch" aria-hidden="true" />
      </button>
      {etaToCarS != null && you ? (
        <p className="caption mt-2 text-center">{t('car.fromHere', lang, { duration: shortDuration(etaToCarS, lang), place: pick(you.label, lang) })}</p>
      ) : null}
      <div className="car-card mt-3">
        {zone ? <ZoneBlock lang={lang} zone={zone} /> : null}
        <div className="car-card-body">
          <div className="min-w-0">
            <p className="caption">{t('car.bay', lang, { bay: '' }).trim()}</p>
            <p className="bay-code">
              <bdi dir="ltr">{paintedBayCode(index, car.bayId)}</bdi>
            </p>
          </div>
          {bay ? <LevelBox index={index} lang={lang} levelId={bay.levelId} /> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="chip" onClick={onRescan}>
          {t('car.change', lang)}
        </button>
        <button type="button" className="chip" onClick={onForget}>
          {t('car.forget', lang)}
        </button>
      </div>
    </Sheet>
  )
})
