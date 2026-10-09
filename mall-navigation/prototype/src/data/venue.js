/**
 * Venue data: load the static venue bundle and index it for fast lookups.
 * Pure JS (no DOM except `fetch` in loadVenue). Schema: CONTRACT.md section 2 ("dallni.venue/0.1").
 *
 * @typedef {[number, number]} XY  venue-local metres, x = east, y = north
 * @typedef {{ en: string, ar: string }} Bilingual
 * @typedef {{ id: string, levelId: string, point: XY, kind: string, refId: string | null }} GraphNode
 * @typedef {{ id: string, from: string, to: string, kind: 'walk'|'parking_walk'|'escalator'|'lift'|'stairs',
 *   lengthM: number, oneWay: boolean, stepFree: boolean, connectorId: string | null }} GraphEdge
 *
 * @typedef {object} VenueIndex
 * @property {object} venue                      the raw venue JSON (not copied)
 * @property {object[]} levels                   levels sorted by ordinal ascending (B2, B1, G, L1)
 * @property {Map<string, object>} levelById
 * @property {Map<string, object>} unitById
 * @property {Map<string, object>} occupantById
 * @property {Map<string, object>} amenityById
 * @property {Map<string, object>} anchorById
 * @property {Map<string, object>} connectorById
 * @property {Map<string, object>} landmarkById
 * @property {Map<string, object>} zoneById
 * @property {Map<string, object>} bayById
 * @property {Map<string, GraphNode>} nodeById
 * @property {Map<string, GraphEdge[]>} edgesFrom  edges you may traverse leaving a node. A oneWay edge is listed
 *   only under its `from` node; a two-way edge is listed under both ends (same edge object, not reversed:
 *   use `otherNodeId(edge, nodeId)` to get the far end).
 * @property {Map<string, GraphEdge>} edgeById    extra: edge lookup
 * @property {Map<string, object>} openingById    extra: opening lookup
 */

export const VENUE_SCHEMA = 'dallni.venue/0.1'

/**
 * Fetch a venue bundle (same-origin static file) and index it.
 * @param {string} url e.g. `${import.meta.env.BASE_URL}venues/demo-muscat/venue.json`
 * @returns {Promise<VenueIndex>}
 */
export async function loadVenue(url) {
  let res
  try {
    res = await fetch(url)
  } catch (cause) {
    throw new Error(`Could not load venue from ${url}: ${cause?.message ?? cause}`)
  }
  if (!res.ok) throw new Error(`Could not load venue from ${url} (HTTP ${res.status})`)
  let json
  try {
    json = await res.json()
  } catch (cause) {
    throw new Error(`Venue file at ${url} is not valid JSON: ${cause?.message ?? cause}`)
  }
  return indexVenue(json)
}

/**
 * Build lookup maps over a parsed venue JSON. Throws on a wrong schema, duplicate ids or edges that point
 * at unknown nodes (a broken graph must fail loudly, never route silently).
 * @param {object} venueJson
 * @returns {VenueIndex}
 */
export function indexVenue(venueJson) {
  if (!venueJson || typeof venueJson !== 'object') throw new TypeError('indexVenue: expected a venue JSON object')
  if (venueJson.schema !== VENUE_SCHEMA) {
    throw new Error(`indexVenue: unsupported schema ${JSON.stringify(venueJson.schema)} (expected "${VENUE_SCHEMA}")`)
  }
  const list = (v) => (Array.isArray(v) ? v : [])
  const byId = (items, label) => {
    const map = new Map()
    for (const item of list(items)) {
      if (!item || typeof item.id !== 'string') throw new Error(`indexVenue: a ${label} entry has no id`)
      if (map.has(item.id)) throw new Error(`indexVenue: duplicate ${label} id "${item.id}"`)
      map.set(item.id, item)
    }
    return map
  }

  const levels = [...list(venueJson.levels)].sort((a, b) => a.ordinal - b.ordinal)
  const parking = venueJson.parking ?? {}
  const graph = venueJson.graph ?? {}
  const nodeById = byId(graph.nodes, 'node')
  const edgeById = byId(graph.edges, 'edge')

  /** @type {Map<string, GraphEdge[]>} */
  const edgesFrom = new Map()
  for (const id of nodeById.keys()) edgesFrom.set(id, [])
  for (const edge of edgeById.values()) {
    const from = edgesFrom.get(edge.from)
    const to = edgesFrom.get(edge.to)
    if (!from || !to) throw new Error(`indexVenue: edge "${edge.id}" references an unknown node`)
    from.push(edge)
    if (!edge.oneWay) to.push(edge)
  }

  return {
    venue: venueJson,
    levels,
    levelById: byId(levels, 'level'),
    unitById: byId(venueJson.units, 'unit'),
    occupantById: byId(venueJson.occupants, 'occupant'),
    amenityById: byId(venueJson.amenities, 'amenity'),
    anchorById: byId(venueJson.anchors, 'anchor'),
    connectorById: byId(venueJson.connectors, 'connector'),
    landmarkById: byId(venueJson.landmarks, 'landmark'),
    zoneById: byId(parking.zones, 'zone'),
    bayById: byId(parking.bays, 'bay'),
    nodeById,
    edgesFrom,
    edgeById,
    openingById: byId(venueJson.openings, 'opening'),
  }
}

/**
 * The node at the far end of `edge` when leaving `nodeId` (edges in edgesFrom are never reversed).
 * @param {GraphEdge} edge
 * @param {string} nodeId
 * @returns {string}
 */
export function otherNodeId(edge, nodeId) {
  return edge.from === nodeId ? edge.to : edge.from
}
