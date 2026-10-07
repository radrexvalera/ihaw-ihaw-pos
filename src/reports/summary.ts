// Sales and estimated gross profit from order snapshots. Uses the price and
// cost saved ON EACH SALE (never today's product cost), so history stays true.
import { lineTotal, marginPercent, type Centavos } from '../lib/money'
import type { Order, PaymentMethod } from '../lib/types'

export interface ProductLine {
  product_id: string
  name: string
  quantity: number
  sales: Centavos
  cost: Centavos
  profit: Centavos
  margin: number | null
  /** Some pieces were sold while the product had no cost set (₱0). */
  missingCost: boolean
}

export interface SalesSummary {
  sales: Centavos
  cost: Centavos
  profit: Centavos
  margin: number | null
  orders: number
  itemsSold: number
  averageOrder: Centavos
  cancelledOrders: number
  cancelledValue: Centavos
  byPayment: Record<PaymentMethod, { orders: number; sales: Centavos }>
  pendingChange: { orders: number; amount: Centavos }
  products: ProductLine[]
  top: {
    bySold: ProductLine | null
    byRevenue: ProductLine | null
    byProfit: ProductLine | null
  }
}

function best(lines: ProductLine[], key: 'quantity' | 'sales' | 'profit'): ProductLine | null {
  return lines.reduce<ProductLine | null>((b, l) => (l[key] > 0 && (!b || l[key] > b[key]) ? l : b), null)
}

export function summarize(orders: readonly Order[]): SalesSummary {
  const byProduct = new Map<string, ProductLine & { latestAt: string }>()
  const byPayment: SalesSummary['byPayment'] = { cash: { orders: 0, sales: 0 }, gcash: { orders: 0, sales: 0 } }
  let sales = 0
  let cost = 0
  let itemsSold = 0
  let count = 0
  let cancelledOrders = 0
  let cancelledValue = 0
  let pendingOrders = 0
  let pendingAmount = 0

  for (const o of orders) {
    if (o.status === 'cancelled') {
      cancelledOrders += 1
      cancelledValue += o.total
      continue
    }
    count += 1
    sales += o.total
    byPayment[o.payment_method].orders += 1
    byPayment[o.payment_method].sales += o.total
    if (!o.change_given && o.change_due > 0) {
      pendingOrders += 1
      pendingAmount += o.change_due
    }
    for (const i of o.items) {
      const lineCost = lineTotal(i.unit_cost, i.quantity)
      cost += lineCost
      itemsSold += i.quantity
      const line = byProduct.get(i.product_id) ?? {
        product_id: i.product_id,
        name: i.product_name_snapshot,
        quantity: 0,
        sales: 0,
        cost: 0,
        profit: 0,
        margin: null,
        missingCost: false,
        latestAt: '',
      }
      line.quantity += i.quantity
      line.sales += i.line_total
      line.cost += lineCost
      if (i.unit_cost === 0) line.missingCost = true
      // Show the most recent name if the product was renamed during the period.
      if (o.created_at > line.latestAt) {
        line.name = i.product_name_snapshot
        line.latestAt = o.created_at
      }
      byProduct.set(i.product_id, line)
    }
  }

  const products: ProductLine[] = [...byProduct.values()]
    .map(({ latestAt: _latestAt, ...l }) => {
      void _latestAt
      const profit = l.sales - l.cost
      return { ...l, profit, margin: marginPercent(profit, l.sales) }
    })
    .sort((a, b) => b.quantity - a.quantity || b.sales - a.sales || a.name.localeCompare(b.name))

  const profit = sales - cost
  return {
    sales,
    cost,
    profit,
    margin: marginPercent(profit, sales),
    orders: count,
    itemsSold,
    // Rounded to the nearest centavo.
    averageOrder: count ? Math.round(sales / count) : 0,
    cancelledOrders,
    cancelledValue,
    byPayment,
    pendingChange: { orders: pendingOrders, amount: pendingAmount },
    products,
    top: { bySold: best(products, 'quantity'), byRevenue: best(products, 'sales'), byProfit: best(products, 'profit') },
  }
}

export interface StockLine {
  product_id: string
  name: string
  stock: number
  unitCost: Centavos
  value: Centavos
}

/** Stock value at cost. Negative stock counts as zero value (it needs a recount, not credit). */
export function inventoryValue(products: readonly { id: string; name: string; stock_quantity: number; unit_cost: Centavos }[]) {
  const lines: StockLine[] = products.map((p) => ({
    product_id: p.id,
    name: p.name,
    stock: p.stock_quantity,
    unitCost: p.unit_cost,
    value: lineTotal(p.unit_cost, Math.max(0, p.stock_quantity)),
  }))
  return { lines, total: lines.reduce((t, l) => t + l.value, 0), pieces: lines.reduce((t, l) => t + Math.max(0, l.stock), 0) }
}
