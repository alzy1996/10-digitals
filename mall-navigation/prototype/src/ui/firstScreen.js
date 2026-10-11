/**
 * Which screen the app opens on (v0.5): Find me ("welcome") unless the URL already says where you are (a plate link,
 * `from=`: home + "Found you") or names a screen; a kiosk opens home (its position is fixed). And the "where did you
 * come in" choices on Find me: the entrances, then the first lift lobby on each parking level (top level first).
 */
export function firstScreen(params, { kiosk = false } = {}) {
  if (params.screen) return { screen: params.screen, found: false }
  if (kiosk) return { screen: 'home', found: false }
  if (params.from) return { screen: 'home', found: true }
  return { screen: 'welcome', found: false }
}

export function entryChoices(index) {
  const out = []
  const anchors = [...index.anchorById.values()]
  const entrances = anchors.filter((a) => a.kind === 'entrance').sort((a, b) => (a.code < b.code ? -1 : 1))
  for (const a of entrances) out.push({ anchorId: a.id, levelId: a.levelId, kind: 'entrance', label: a.label })
  const parking = [...index.levels].filter((l) => l.kind === 'parking').sort((a, b) => b.ordinal - a.ordinal)
  for (const lvl of parking) {
    const lobby = anchors.filter((a) => a.kind === 'lift_lobby' && a.levelId === lvl.id).sort((a, b) => (a.id < b.id ? -1 : 1))[0]
    if (lobby) out.push({ anchorId: lobby.id, levelId: lvl.id, kind: 'parking', label: lobby.label })
  }
  return out
}
