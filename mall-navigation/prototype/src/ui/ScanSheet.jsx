import { forwardRef } from 'react'
import { t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { entityInfo, levelName, plateLabelInLevel, platesByLevel, zoneOfPlate } from './model.js'

/**
 * Scan sheet (S10/S11, simulated): pick the QR plate in front of you from a list grouped by level, or tap a
 * plate on the map. Sets you-are-here (exact). The real app scans the QR code instead.
 */
export const ScanSheet = forwardRef(function ScanSheet({ index, lang, you, onPick, onBack }, ref) {
  const groups = platesByLevel(index)
  return (
    <Sheet
      ref={ref}
      label={t('scan.title', lang)}
      head={
        <div className="flex items-start gap-3">
          <button type="button" className="icon-btn" onClick={onBack} aria-label={t('common.back', lang)}>
            <Icon name="back" size={24} className="flip-rtl" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="title flex items-center gap-2">
              <span className="title-icon" aria-hidden="true">
                <Icon name="scan" size={26} />
              </span>
              {t('scan.title', lang)}
            </h2>
            <p className="caption">{t('scan.subtitle', lang)}</p>
          </div>
        </div>
      }
    >
      <p className="caption">{t('scan.simNote', lang)}</p>
      <p className="caption flex items-center gap-2 mb-1">
        <Icon name="pin" size={18} />
        {t('scan.tapOnMap', lang)}
      </p>
      {groups.map(({ level, plates }) => (
        <div key={level.id} className="list" data-sheet-rows="">
          <div className="list-head section-label">{levelName(index, level.id, lang)}</div>
          {plates.map((plate) => {
            const zone = plate.kind === 'parking_pillar' ? zoneOfPlate(index, plate.id) : null
            const info = entityInfo(index, plate.id)
            const current = you?.anchorId === plate.id
            return (
              <button key={plate.id} type="button" className="row" onClick={() => onPick(plate.id)} aria-current={current ? 'location' : undefined}>
                <span className="row-icon" style={{ background: zone?.color ?? info?.color ?? '#334155', color: zone?.fg ?? '#FFFFFF' }}>
                  <Icon name={zone?.icon ?? info?.icon ?? 'scan'} size={24} />
                </span>
                <span className="row-main">
                  <span className="row-title block">{plateLabelInLevel(index, plate, lang)}</span>
                  {current ? <span className="row-sub is-here block">{t('scan.exact', lang)}</span> : null}
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
    </Sheet>
  )
})
