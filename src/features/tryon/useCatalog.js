import { useMemo } from 'react'
import { useData } from '../../store/DataProvider'
import { LIBRARY } from '../../data/library'

/**
 * The shades a customer can try: the salon's real bottles first (stock-aware),
 * the full reference library as an "explore" option.
 */
export function useCatalog() {
  const { site } = useData()
  return useMemo(() => {
    const salon = site.salon || {}
    const inventory = (site.polishes || []).filter((p) => p.active !== false && p.hex)
    const hasInventory = inventory.length > 0
    const inStock = inventory.filter((p) => typeof p.stock !== 'number' || p.stock > 0)
    const salonShades = salon.onlyInStock ? inStock : inventory
    const shades = hasInventory ? salonShades : LIBRARY
    const byId = new Map()
    for (const p of [...LIBRARY, ...inventory]) byId.set(p.id, p)
    return { shades, inventory, library: LIBRARY, hasInventory, byId, salon }
  }, [site])
}
