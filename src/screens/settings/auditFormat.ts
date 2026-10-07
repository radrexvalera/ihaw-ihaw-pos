// Turns raw audit_logs rows into one readable line each.
import { formatPeso } from '../../lib/money'

export interface AuditRow {
  id: number
  user_id: string | null
  action: string
  entity: string
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export type AuditCategory = 'all' | 'prices' | 'stock' | 'orders' | 'users'

export const CATEGORY_ACTIONS: Record<Exclude<AuditCategory, 'all'>, string[]> = {
  prices: ['product_price_changed', 'product_cost_changed', 'product_created', 'product_renamed', 'product_enabled', 'product_disabled'],
  stock: [
    'inventory_opening',
    'inventory_stock_in',
    'inventory_adjustment_plus',
    'inventory_adjustment_minus',
    'product_marked_sold_out',
    'product_marked_available',
  ],
  orders: ['sale_cancelled', 'change_marked_given'],
  users: ['user_access_changed'],
}

const TITLES: Record<string, string> = {
  product_price_changed: 'Price changed',
  product_cost_changed: 'Cost changed',
  product_created: 'Product added',
  product_renamed: 'Product renamed',
  product_enabled: 'Product enabled',
  product_disabled: 'Product disabled',
  product_marked_sold_out: 'Marked sold out',
  product_marked_available: 'Marked available',
  inventory_opening: 'Opening stock',
  inventory_stock_in: 'Stock in',
  inventory_adjustment_plus: 'Stock adjusted +',
  inventory_adjustment_minus: 'Stock adjusted −',
  sale_cancelled: 'Sale cancelled',
  change_marked_given: 'Change given',
  user_access_changed: 'User access changed',
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const peso = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? formatPeso(v) : str(v))
const signed = (v: unknown) => (typeof v === 'number' && v > 0 ? `+${v}` : str(v))

/** `productName` resolves product ids for stock rows (their details carry no name). */
export function describeAudit(row: AuditRow, productName: (id: string) => string | undefined): { title: string; detail: string } {
  const d = row.details ?? {}
  const title = TITLES[row.action] ?? row.action.replaceAll('_', ' ')
  const name = str(d.name) || (row.entity === 'product' && row.entity_id ? (productName(row.entity_id) ?? 'Product') : '')

  switch (row.action) {
    case 'product_price_changed':
    case 'product_cost_changed':
      return { title, detail: `${name}: ${peso(d.from)} → ${peso(d.to)}` }
    case 'product_created':
      return { title, detail: `${name} · price ${peso(d.selling_price)} · cost ${peso(d.unit_cost)}` }
    case 'product_renamed':
      return { title, detail: `${str(d.from)} → ${str(d.to)}` }
    case 'inventory_opening':
    case 'inventory_stock_in':
    case 'inventory_adjustment_plus':
    case 'inventory_adjustment_minus':
      return { title, detail: `${name}: ${signed(d.quantity_change)} pcs${d.reason ? ` · ${str(d.reason)}` : ''}` }
    case 'sale_cancelled':
      return {
        title,
        detail: `${str(d.order_ref)} · ${peso(d.total)} · ${str(d.reason)}${d.change_was_pending ? ' · change was still pending' : ''}`,
      }
    case 'change_marked_given':
      return { title, detail: `${str(d.order_ref)} · ${peso(d.change_amount)}` }
    case 'user_access_changed':
      return {
        title,
        detail: `${str(d.role_from)} → ${str(d.role_to)}${d.active_from !== d.active_to ? ` · ${d.active_to ? 'activated' : 'deactivated'}` : ''}`,
      }
    default:
      return { title, detail: name }
  }
}
