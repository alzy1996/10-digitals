import { forwardRef, useMemo } from 'react'
import { addStrings, t } from '../i18n/strings.js'
import { MORE } from '../i18n/strings-more.js'
import { travelTimesFrom } from '../routing/route.js'
import { facilityGroups } from './facilities.js'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { entityInfo, levelButtonLabel, pick, shortDuration } from './model.js'
import './mallinfo.css'

addStrings(MORE)

/**
 * Facilities (v0.5, DESIGN-MALL.md 3.6): every amenity in its group (restrooms, family & accessible, prayer & wudu,
 * money, transport, help), nearest first by walk time from you; the step-free switch changes the times. A row opens
 * the amenity's place screen (the GO flow).
 */
export const FacilitiesScreen = forwardRef(function FacilitiesScreen({ index, lang, you, stepFree, onToggleStepFree, onOpen, onBack }, ref) {
  const times = useMemo(() => (you ? travelTimesFrom(index, you.nodeId, { stepFree }) : null), [index, you, stepFree])
  const groups = useMemo(() => facilityGroups(index, (nodeId) => times?.get(nodeId)?.etaS ?? null), [index, times])
  return (
    <Sheet
      ref={ref}
      label={t('fac.title', lang)}
      className="facilities-sheet"
      head={
        <div className="flex items-center gap-3">
          <button type="button" className="icon-btn" onClick={onBack} aria-label={t('common.back', lang)}>
            <Icon name="back" size={24} className="flip-rtl" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="title">{t('fac.title', lang)}</h2>
            {you ? <p className="caption">{t('fac.from', lang, { place: pick(you.label, lang) })}</p> : null}
          </div>
        </div>
      }
    >
      <button type="button" role="switch" aria-checked={stepFree} className="switch-row fac-stepfree" onClick={onToggleStepFree}>
        <Icon name="accessible" size={24} />
        <span className="flex-1">{t('fac.stepFree', lang)}</span>
        <span className="switch" aria-hidden="true" />
      </button>
      {groups.map((g) => (
        <div key={g.id} className="list" data-sheet-rows="">
          <div className="list-head section-label">{t(`fac.${g.id}`, lang)}</div>
          {g.items.map(({ amenity, levelId, etaS }) => {
            const info = entityInfo(index, amenity.id)
            return (
              <button key={amenity.id} type="button" className="row" onClick={() => onOpen(amenity.id)}>
                <span className="row-icon" style={{ background: info?.color ?? '#334155', color: '#FFFFFF' }}>
                  <Icon name={info?.icon ?? 'info'} size={24} />
                </span>
                <span className="row-main">
                  <span className="row-title block">{pick(amenity.name, lang)}</span>
                </span>
                <span className="row-end">
                  <span className="level-badge">
                    <bdi dir="ltr">{levelButtonLabel(index, levelId, lang)}</bdi>
                  </span>
                  {etaS != null ? <span className="row-mins nowrap">{shortDuration(etaS, lang)}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </Sheet>
  )
})
