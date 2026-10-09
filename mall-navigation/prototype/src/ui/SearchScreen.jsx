import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { formatDuration, formatMinutesParts, t } from '../i18n/strings.js'
import { CATEGORY_COLORS, PIN_COLORS } from '../engine/tokens.js'
import { resolveTarget, travelTimesFrom } from '../routing/route.js'
import { TILE_IDS } from '../search/search.js'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { TILE_STYLE, entityInfo, levelButtonLabel, levelName, pick } from './model.js'

const CATEGORY_ICON = {
  fashion: 'fashion', food: 'food', cafe: 'cafe', electronics: 'electronics', beauty: 'beauty', kids: 'kids',
  grocery: 'grocery', entertainment: 'entertainment', home: 'home', health: 'health', services: 'services', parking: 'parking',
}

/** Debounced copy of a value (instant results without searching on every key press). */
function useDebounced(value, ms) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/**
 * Search (S04): instant, debounced results in both languages; tiles and categories open filtered lists,
 * nearest first. Each row shows the level and the walking time from you-are-here. The search field (or the list's
 * title) is the sheet's head; the sheet opens full while typing and half for a tile / category list. Typing into (or
 * focusing) the field of a folded search sheet brings it back to full, where the results show.
 */
export const SearchScreen = forwardRef(function SearchScreen(
  { index, lang, search, you, stepFree, query, tile, category, onQuery, onTile, onCategory, onPick, onCar, onBack, autoFocus = true },
  ref,
) {
  const inputRef = useRef(null)
  const q = useDebounced(query, 120)
  const times = useMemo(() => (you ? travelTimesFrom(index, you.nodeId, { stepFree }) : new Map()), [index, you, stepFree])

  useEffect(() => {
    if (autoFocus && !tile && !category) inputRef.current?.focus({ preventScroll: true })
  }, [autoFocus, tile, category])

  const etaOf = (id) => {
    const target = resolveTarget(index, id)
    let best = null
    for (const n of target?.nodeIds ?? []) {
      const e = times.get(n)?.etaS
      if (e != null && (best == null || e < best)) best = e
    }
    return best
  }

  const { title, results } = useMemo(() => {
    if (category) {
      const list = [...index.occupantById.values()]
        .filter((o) => o.category === category)
        .map((o) => ({ type: 'occupant', id: o.id, name: o.name, levelId: entityInfo(index, o.id)?.levelId ?? null }))
      const rows = list.map((r) => ({ ...r, etaS: etaOf(r.id) })).sort((a, b) => (a.etaS ?? 1e9) - (b.etaS ?? 1e9))
      return { title: `${t(`category.${category}`, lang)} · ${t('search.nearest', lang)}`, results: rows }
    }
    if (tile) {
      const rows = search
        .tile(tile, { levelId: you?.levelId, limit: 50 }, lang)
        .map((r) => ({ ...r, etaS: etaOf(r.id) }))
        .sort((a, b) => (a.etaS ?? 1e9) - (b.etaS ?? 1e9))
      return { title: `${t(`tile.${tile}`, lang)} · ${t('search.nearest', lang)}`, results: rows }
    }
    const text = q.trim()
    if (!text) return { title: null, results: null }
    const rows = search(text, lang, { levelId: you?.levelId, limit: 30 }).map((r) => ({ ...r, etaS: r.type === 'category' ? null : etaOf(r.id) }))
    return { title: t('search.resultsFor', lang, { q: text }), results: rows }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, search, q, tile, category, lang, you, times])

  const filtered = Boolean(tile || category)

  return (
    <Sheet
      ref={ref}
      label={t('search.title', lang)}
      className="search-sheet"
      stretch
      expandOnType={!filtered}
      head={
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn" onClick={onBack} aria-label={t('common.back', lang)}>
            <Icon name="back" size={24} className="flip-rtl" />
          </button>
          {filtered ? (
            <h2 className="list-title">{title}</h2>
          ) : (
            <label className="search-box flex-1 min-w-0">
              <Icon name="search" size={22} />
              <span className="sr-only">{t('home.searchLabel', lang)}</span>
              <input
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                dir="auto"
                value={query}
                placeholder={t('home.searchPlaceholder', lang)}
                onChange={(e) => onQuery(e.target.value)}
              />
              {query ? (
                <button type="button" className="grid place-items-center w-11 h-11 -me-2" onClick={() => onQuery('')} aria-label={t('search.clear', lang)}>
                  <Icon name="close" size={20} />
                </button>
              ) : null}
            </label>
          )}
        </div>
      }
    >
      <div aria-live="polite" data-sheet-rows="">
        {results === null ? (
          <Suggestions lang={lang} onTile={onTile} label={t('search.tryInstead', lang)} />
        ) : results.length === 0 ? (
          <div className="py-4">
            <p className="title">{t('search.noResults', lang)}</p>
            <Suggestions lang={lang} onTile={onTile} label={t('search.tryInstead', lang)} />
          </div>
        ) : (
          <div className="list" data-sheet-rows="">
            {!filtered && title ? <div className="list-head caption">{title}</div> : null}
            {results.map((r) => (
              <ResultRow
                key={`${r.type}:${r.id}`}
                index={index}
                lang={lang}
                result={r}
                onClick={() => {
                  if (r.type === 'category') {
                    if (r.id === 'parking') onCar()
                    else onCategory(r.id)
                  } else onPick(r.id)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
})

function Suggestions({ lang, onTile, label }) {
  return (
    <div className="pt-3">
      <p className="section-label mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {TILE_IDS.map((id) => (
          <button key={id} type="button" className="chip" onClick={() => onTile(id)}>
            <span className="grid place-items-center w-7 h-7 rounded-full text-white" style={{ background: TILE_STYLE[id].color }}>
              <Icon name={TILE_STYLE[id].icon} size={18} />
            </span>
            {t(`tile.${id}`, lang)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Walking minutes as light numerals ("3" + "min"); read out as "about 3 min". */
function Minutes({ seconds, lang }) {
  const m = formatMinutesParts(seconds, lang)
  return (
    <span className="row-mins nowrap" aria-label={formatDuration(seconds, lang)}>
      <b aria-hidden="true">{m.value}</b>
      <small aria-hidden="true">{m.unit}</small>
    </span>
  )
}

function ResultRow({ index, lang, result, onClick }) {
  if (result.type === 'category') {
    const color = CATEGORY_COLORS[result.id] ?? PIN_COLORS.parking
    return (
      <button type="button" className="row" onClick={onClick}>
        <span className="row-icon" style={{ background: color }}>
          <Icon name={CATEGORY_ICON[result.id] ?? 'shop'} size={24} />
        </span>
        <span className="row-main">
          <span className="row-title block">{pick(result.name, lang)}</span>
          {result.count ? <span className="row-sub block">{t('search.places', lang, { n: result.count })}</span> : null}
        </span>
        <span className="row-end">
          <Icon name="chevron" size={20} className="flip-rtl" />
        </span>
      </button>
    )
  }
  const info = entityInfo(index, result.id)
  if (!info) return null
  const sub = [info.categoryLabelKey ? t(info.categoryLabelKey, lang) : null, info.levelId ? levelName(index, info.levelId, lang) : null].filter(Boolean).join(' · ')
  return (
    <button type="button" className="row" onClick={onClick}>
      <span className="row-icon" style={{ background: info.color }}>
        <Icon name={info.icon} size={24} />
      </span>
      <span className="row-main">
        <span className="row-title block">{pick(info.name, lang)}</span>
        <span className="row-sub block">{sub}</span>
      </span>
      <span className="row-end">
        {info.levelId ? (
          <span className="level-badge" title={levelName(index, info.levelId, lang)}>
            <bdi dir="ltr">{levelButtonLabel(index, info.levelId, lang)}</bdi>
          </span>
        ) : null}
        {result.etaS != null ? <Minutes seconds={result.etaS} lang={lang} /> : null}
      </span>
    </button>
  )
}
