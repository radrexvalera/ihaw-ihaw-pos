import { describe, expect, it } from 'vitest'
import { csvPesos, toCsv } from '../lib/csv'
import type { Order, OrderItem } from '../lib/types'
import { normalizeRange, periodInstants, periodRange } from './period'
import { inventoryValue, summarize } from './summary'

let seq = 0
function item(product_id: string, name: string, quantity: number, unit_price: number, unit_cost: number): OrderItem {
  return {
    id: `i${++seq}`,
    movement_id: '',
    product_id,
    product_name_snapshot: name,
    quantity,
    unit_price,
    unit_cost,
    line_total: quantity * unit_price,
  }
}

function order(items: OrderItem[], extra: Partial<Order> = {}): Order {
  const total = items.reduce((t, i) => t + i.line_total, 0)
  return {
    id: `o${++seq}`,
    order_ref: '',
    order_number: seq,
    business_date: '2026-10-07',
    customer_token_number: null,
    status: 'completed',
    total,
    payment_method: 'cash',
    payment_reference: null,
    amount_received: total,
    change_due: 0,
    change_given: true,
    change_given_at: null,
    change_given_by: null,
    grill_status: 'done',
    grill_started_at: null,
    grill_done_at: null,
    device_id: 'd',
    created_by: null,
    created_at: `2026-10-07T10:${String(seq % 60).padStart(2, '0')}:00Z`,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    items,
    ...extra,
  }
}

describe('summarize', () => {
  it('matches the brief: BBQ 100 × ₱25 at ₱14 cost → ₱1,100 estimated gross profit', () => {
    const s = summarize([order([item('bbq', 'BBQ', 100, 2500, 1400)])])
    expect(s.products[0]).toMatchObject({ quantity: 100, sales: 250000, cost: 140000, profit: 110000, margin: 44 })
  })

  it('totals sales, orders, items, average and margin; excludes cancelled orders', () => {
    const s = summarize([
      order([item('bbq', 'BBQ', 3, 2500, 1400), item('isaw', 'Isaw Manok', 2, 1000, 500)]), // 95
      order([item('liempo', 'Liempo', 1, 10000, 6500)], { payment_method: 'gcash' }), // 100
      order([item('bbq', 'BBQ', 2, 2500, 1400)], { change_due: 5000, change_given: false, amount_received: 10000 }), // 50
      order([item('bbq', 'BBQ', 10, 2500, 1400)], { status: 'cancelled' }),
    ])
    expect(s).toMatchObject({
      sales: 24500,
      orders: 3,
      itemsSold: 8,
      averageOrder: 8167, // 245 / 3 = 81.666… → ₱81.67
      cost: 3 * 1400 + 2 * 500 + 6500 + 2 * 1400,
      cancelledOrders: 1,
      cancelledValue: 25000,
      pendingChange: { orders: 1, amount: 5000 },
    })
    expect(s.profit).toBe(s.sales - s.cost)
    expect(s.byPayment).toEqual({ cash: { orders: 2, sales: 14500 }, gcash: { orders: 1, sales: 10000 } })
  })

  it('uses the cost saved on each sale, not a single current cost', () => {
    const s = summarize([order([item('bbq', 'BBQ', 1, 2500, 1400)]), order([item('bbq', 'BBQ', 1, 2500, 1600)])])
    expect(s.products[0]).toMatchObject({ cost: 3000, profit: 2000 })
  })

  it('picks top sellers by quantity, revenue and profit separately', () => {
    const s = summarize([
      order([item('bbq', 'BBQ', 10, 2500, 1400), item('isaw', 'Isaw', 30, 1000, 300), item('liempo', 'Liempo', 4, 10000, 5000)]),
    ])
    expect(s.top.bySold?.product_id).toBe('isaw') // 30 pcs vs 10 / 4
    expect(s.top.byRevenue?.product_id).toBe('liempo') // ₱400 vs ₱300 / ₱250
    expect(s.top.byProfit?.product_id).toBe('isaw') // 30 × ₱7 = ₱210 vs ₱200 / ₱110
  })

  it('flags products sold without a cost and handles empty periods', () => {
    expect(summarize([order([item('x', 'X', 1, 2000, 0)])]).products[0]!.missingCost).toBe(true)
    expect(summarize([])).toMatchObject({ sales: 0, orders: 0, averageOrder: 0, margin: null, top: { bySold: null } })
  })

  it('reports the latest name of a renamed product', () => {
    const a = order([item('p', 'Pitso', 1, 9000, 0)], { created_at: '2026-10-07T01:00:00Z' })
    const b = order([item('p', 'Pitso / Chicken Breast', 1, 9000, 0)], { created_at: '2026-10-07T02:00:00Z' })
    expect(summarize([b, a]).products[0]!.name).toBe('Pitso / Chicken Breast')
  })
})

describe('inventoryValue', () => {
  it('values stock at cost and ignores negative stock', () => {
    const v = inventoryValue([
      { id: 'bbq', name: 'BBQ', stock_quantity: 85, unit_cost: 1400 },
      { id: 'x', name: 'X', stock_quantity: -3, unit_cost: 1000 },
    ])
    expect(v.lines[0]!.value).toBe(119000) // 85 × ₱14 = ₱1,190
    expect(v.total).toBe(119000)
    expect(v.pieces).toBe(85)
  })
})

describe('periods', () => {
  // 2026-10-07 is a Wednesday.
  it('builds Manila business-date ranges', () => {
    expect(periodRange('today', '2026-10-07')).toEqual({ from: '2026-10-07', to: '2026-10-07' })
    expect(periodRange('yesterday', '2026-10-01')).toEqual({ from: '2026-09-30', to: '2026-09-30' })
    expect(periodRange('week', '2026-10-07')).toEqual({ from: '2026-10-05', to: '2026-10-07' })
    expect(periodRange('week', '2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' }) // Sunday
    expect(periodRange('month', '2026-10-07')).toEqual({ from: '2026-10-01', to: '2026-10-07' })
  })
  it('orders and caps custom ranges', () => {
    expect(normalizeRange('2026-10-07', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-07' })
    expect(normalizeRange('2020-01-01', '2026-10-07').from).toBe('2025-10-07')
  })
  it('converts to Manila instants', () => {
    expect(periodInstants({ from: '2026-10-07', to: '2026-10-07' })).toEqual({
      start: '2026-10-07T00:00:00+08:00',
      end: '2026-10-08T00:00:00+08:00',
    })
  })
})

describe('csv', () => {
  it('quotes, escapes and neutralises formulas', () => {
    expect(toCsv(['Product', 'Qty'], [['Isaw "Manok", spicy', 3], ['=HYPERLINK()', null]])).toBe(
      'Product,Qty\r\n"Isaw ""Manok"", spicy",3\r\n\'=HYPERLINK(),\r\n',
    )
  })
  it('formats pesos exactly', () => {
    expect(csvPesos(250000)).toBe('2500.00')
    expect(csvPesos(2550)).toBe('25.50')
    expect(csvPesos(-5)).toBe('-0.05')
  })
})
