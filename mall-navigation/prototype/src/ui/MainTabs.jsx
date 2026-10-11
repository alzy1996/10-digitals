import { useRef } from 'react'
import { t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'

const TABS = [
  { id: 'map', icon: 'map', key: 'tabs.map' },
  { id: 'offers', icon: 'offers', key: 'tabs.offers' },
]

/**
 * The two top-level screens (v0.5, Sam: "the original map, and an offers screen"): a segmented control at the top of
 * the Home sheet and of the Offers page. A tablist: arrow keys move between the tabs, the selected one is a white
 * raised pill that slides (no slide under reduced motion).
 */
export function MainTabs({ tab, lang, onTab }) {
  const refs = useRef([])
  const onKeyDown = (e) => {
    const i = TABS.findIndex((x) => x.id === tab)
    const fwd = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const back = fwd === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight'
    let j = null
    if (e.key === fwd) j = Math.min(TABS.length - 1, i + 1)
    else if (e.key === back) j = Math.max(0, i - 1)
    if (j == null || j === i) return
    e.preventDefault()
    refs.current[j]?.focus()
    onTab(TABS[j].id)
  }
  return (
    <div className="main-tabs" role="tablist" aria-label={t('tabs.label', lang)} data-tab={tab} onKeyDown={onKeyDown}>
      <span className="main-tabs-ind" aria-hidden="true" />
      {TABS.map((x, i) => (
        <button
          key={x.id}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="tab"
          aria-selected={tab === x.id}
          tabIndex={tab === x.id ? 0 : -1}
          className="main-tab"
          onClick={() => tab !== x.id && onTab(x.id)}
        >
          <Icon name={x.icon} size={20} />
          <span>{t(x.key, lang)}</span>
        </button>
      ))}
    </div>
  )
}
