import { describe, expect, it } from 'vitest'
import type { CartLine } from './cart'
import { buildSale, changeFor, CheckoutError, itemSummary, orderRef, syncOrderPayload, totalPieces, type SaleInput } from './checkout'

const cart: CartLine[] = [
  { line_key: 'bbq', variable_price: false, product_id: 'bbq', name: 'BBQ', unit_price: 2500, unit_cost: 1400, quantity: 3 },
  { line_key: 'isaw', variable_price: false, product_id: 'isaw', name: 'Isaw Manok', unit_price: 1000, unit_cost: 500, quantity: 2 },
  { line_key: 'liempo', variable_price: false, product_id: 'liempo', name: 'Liempo', unit_price: 9000, unit_cost: 6000, quantity: 1 },
]
// 75 + 20 + 90 = 185

function input(overrides: Partial<SaleInput> = {}): SaleInput {
  let n = 0
  return {
    cart,
    paymentMethod: 'cash',
    amountReceived: 50000,
    paymentReference: null,
    customerToken: null,
    device: { id: 'dev-1', device_code: 'POS01' },
    userId: 'user-1',
    businessDate: '2026-10-07',
    orderNumber: 27,
    now: new Date('2026-10-07T02:00:00Z'),
    uuid: () => `uuid-${++n}`,
    ...overrides,
  }
}

describe('changeFor', () => {
  it('computes change exactly in centavos', () => {
    expect(changeFor(18500, 50000)).toEqual({ changeDue: 31500, enough: true })
    expect(changeFor(18500, 18500)).toEqual({ changeDue: 0, enough: true })
    expect(changeFor(18550, 20000)).toEqual({ changeDue: 1450, enough: true })
  })
  it('flags short or missing payment', () => {
    expect(changeFor(18500, 10000).enough).toBe(false)
    expect(changeFor(18500, null).enough).toBe(false)
  })
})

describe('buildSale', () => {
  it('records cash with change pending (sale is not blocked)', () => {
    const { order } = buildSale(input())
    expect(order).toMatchObject({
      order_ref: 'POS01-20261007-0027',
      order_number: 27,
      total: 18500,
      amount_received: 50000,
      change_due: 31500,
      change_given: false,
      status: 'completed',
      grill_status: 'new',
      payment_method: 'cash',
    })
  })

  it('exact cash means no change is owed', () => {
    const { order } = buildSale(input({ amountReceived: 18500 }))
    expect(order.change_due).toBe(0)
    expect(order.change_given).toBe(true)
  })

  it('GCash always equals the total and keeps the reference', () => {
    const { order } = buildSale(input({ paymentMethod: 'gcash', amountReceived: 0, paymentReference: ' 1234 ' }))
    expect(order).toMatchObject({ amount_received: 18500, change_due: 0, change_given: true, payment_reference: '1234' })
  })

  it('rejects short payment and empty carts', () => {
    expect(() => buildSale(input({ amountReceived: 10000 }))).toThrow(CheckoutError)
    expect(() => buildSale(input({ cart: [] }))).toThrow(CheckoutError)
  })

  it('snapshots name, price and cost on every item', () => {
    const { order } = buildSale(input())
    expect(order.items[0]).toMatchObject({
      product_name_snapshot: 'BBQ',
      quantity: 3,
      unit_price: 2500,
      unit_cost: 1400,
      line_total: 7500,
    })
  })

  it('creates one SALE movement per item sharing the item movement id', () => {
    const { order, movements } = buildSale(input())
    expect(movements.map((m) => m.id)).toEqual(order.items.map((i) => i.movement_id))
    expect(movements.map((m) => [m.product_id, m.quantity_change, m.reference_id])).toEqual([
      ['bbq', -3, order.id],
      ['isaw', -2, order.id],
      ['liempo', -1, order.id],
    ])
    expect(new Set([order.id, ...order.items.map((i) => i.id), ...movements.map((m) => m.id)]).size).toBe(7)
  })

  it('keeps the optional token', () => {
    expect(buildSale(input({ customerToken: 12 })).order.customer_token_number).toBe(12)
  })

  it('summarises items and pieces', () => {
    const { order } = buildSale(input())
    expect(itemSummary(order)).toBe('3 BBQ, 2 Isaw Manok, 1 Liempo')
    expect(totalPieces(order)).toBe(6)
  })
})

describe('payload helpers', () => {
  it('formats order refs', () => {
    expect(orderRef('POS01', '2026-10-07', 7)).toBe('POS01-20261007-0007')
  })
  it('sends items with movement ids but without client-computed line totals', () => {
    const payload = syncOrderPayload(buildSale(input()).order)
    const item = (payload.items as Record<string, unknown>[])[0]!
    expect(item).toHaveProperty('movement_id')
    expect(item).not.toHaveProperty('line_total')
  })
})

describe('price varies in an order', () => {
  it('two sizes of one product share ONE movement for the summed quantity', () => {
    const { order, movements } = buildSale(
      input({
        cart: [
          { line_key: 'pitso@9000', variable_price: true, product_id: 'pitso', name: 'Pitso', unit_price: 9000, unit_cost: 6000, quantity: 1 },
          { line_key: 'pitso@13000', variable_price: true, product_id: 'pitso', name: 'Pitso', unit_price: 13000, unit_cost: 6000, quantity: 2 },
          { line_key: 'bbq', variable_price: false, product_id: 'bbq', name: 'BBQ', unit_price: 2500, unit_cost: 1400, quantity: 1 },
        ],
      }),
    )
    expect(order.total).toBe(9000 + 26000 + 2500)
    expect(order.items).toHaveLength(3)
    expect(order.items[0]!.movement_id).toBe(order.items[1]!.movement_id)
    expect(movements.map((m) => [m.product_id, m.quantity_change])).toEqual([
      ['pitso', -3],
      ['bbq', -1],
    ])
    expect(itemSummary(order)).toBe('3 Pitso, 1 BBQ')
  })
})
