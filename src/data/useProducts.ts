import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/local'
import type { Product } from '../lib/types'
import { sortProducts, withLocalStock } from './stock'

/**
 * All products from IndexedDB in display order, with this device's not-yet-
 * reflected stock movements applied. `undefined` while the first read runs.
 */
export function useProducts(): Product[] | undefined {
  return useLiveQuery(async () => {
    const [products, movements] = await Promise.all([db.products.toArray(), db.movements.toArray()])
    return sortProducts(withLocalStock(products, movements))
  })
}
