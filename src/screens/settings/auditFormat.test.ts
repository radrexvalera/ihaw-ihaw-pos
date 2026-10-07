import { describe, expect, it } from 'vitest'
import { describeAudit, type AuditRow } from './auditFormat'

function row(action: string, details: Record<string, unknown>, entity = 'product', entity_id: string | null = 'p1'): AuditRow {
  return { id: 1, user_id: null, action, entity, entity_id, details, created_at: '2026-10-07T10:00:00Z' }
}
const names = (id: string) => (id === 'p1' ? 'BBQ' : undefined)

describe('describeAudit', () => {
  it('formats price changes in pesos', () => {
    expect(describeAudit(row('product_price_changed', { name: 'BBQ', from: 2500, to: 3000 }), names)).toEqual({
      title: 'Price changed',
      detail: 'BBQ: ₱25 → ₱30',
    })
  })
  it('names the product for stock rows from the product list', () => {
    expect(describeAudit(row('inventory_adjustment_minus', { quantity_change: -3, reason: 'Damaged' }), names).detail).toBe(
      'BBQ: -3 pcs · Damaged',
    )
    expect(describeAudit(row('inventory_stock_in', { quantity_change: 50 }), names).detail).toBe('BBQ: +50 pcs')
  })
  it('formats cancellations and change given', () => {
    expect(
      describeAudit(row('sale_cancelled', { order_ref: 'POS01-20261007-0027', total: 18500, reason: 'Wrong order', change_was_pending: true }, 'order'), names)
        .detail,
    ).toBe('POS01-20261007-0027 · ₱185 · Wrong order · change was still pending')
    expect(describeAudit(row('change_marked_given', { order_ref: 'POS01-20261007-0027', change_amount: 31500 }, 'order'), names).detail).toBe(
      'POS01-20261007-0027 · ₱315',
    )
  })
  it('falls back gracefully for unknown actions', () => {
    expect(describeAudit(row('something_new', {}, 'thing', null), names).title).toBe('something new')
  })
})
