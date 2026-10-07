// Pure checkout logic: change calculation and building the order record.
import type { Centavos } from '../lib/money'
import { compactDate } from '../lib/time'
import type { Device, Order, PaymentMethod } from '../lib/types'
import type { LocalMovement } from '../db/local'
import { cartLineTotal, cartTotals, type Cart } from './cart'

export const QUICK_CASH: readonly Centavos[] = [10000, 20000, 50000, 100000]

export function changeFor(total: Centavos, received: Centavos | null): { changeDue: Centavos; enough: boolean } {
  if (received === null) return { changeDue: 0, enough: false }
  return received >= total ? { changeDue: received - total, enough: true } : { changeDue: 0, enough: false }
}

export function orderRef(deviceCode: string, businessDate: string, orderNumber: number): string {
  return `${deviceCode}-${compactDate(businessDate)}-${String(orderNumber).padStart(4, '0')}`
}

export interface SaleInput {
  cart: Cart
  paymentMethod: PaymentMethod
  /** Cash handed over (centavos). Ignored for GCash, where it equals the total. */
  amountReceived: Centavos
  paymentReference: string | null
  customerToken: number | null
  device: Pick<Device, 'id' | 'device_code'>
  userId: string
  businessDate: string
  orderNumber: number
  now: Date
  uuid: () => string
}

export class CheckoutError extends Error {}

/** Builds the order and its SALE movements. Throws CheckoutError on invalid input. */
export function buildSale(input: SaleInput): { order: Order; movements: LocalMovement[] } {
  const { cart, paymentMethod, device, uuid } = input
  if (cart.length === 0) throw new CheckoutError('The cart is empty.')
  const { total } = cartTotals(cart)
  const received = paymentMethod === 'gcash' ? total : input.amountReceived
  if (!Number.isSafeInteger(received) || received < total) throw new CheckoutError('Amount received is less than the total.')
  const changeDue = received - total
  const createdAt = input.now.toISOString()
  const orderId = uuid()

  const items = cart.map((line) => ({
    id: uuid(),
    movement_id: uuid(),
    product_id: line.product_id,
    product_name_snapshot: line.name,
    quantity: line.quantity,
    unit_price: line.unit_price,
    unit_cost: line.unit_cost,
    line_total: cartLineTotal(line),
  }))

  const order: Order = {
    id: orderId,
    order_ref: orderRef(device.device_code, input.businessDate, input.orderNumber),
    order_number: input.orderNumber,
    business_date: input.businessDate,
    customer_token_number: input.customerToken,
    status: 'completed',
    total,
    payment_method: paymentMethod,
    payment_reference: paymentMethod === 'gcash' ? input.paymentReference?.trim() || null : null,
    amount_received: received,
    change_due: changeDue,
    change_given: changeDue === 0,
    change_given_at: null,
    change_given_by: null,
    grill_status: 'new',
    grill_started_at: null,
    grill_done_at: null,
    device_id: device.id,
    created_by: input.userId,
    created_at: createdAt,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    items,
  }

  const movements: LocalMovement[] = items.map((item) => ({
    id: item.movement_id,
    product_id: item.product_id,
    quantity_change: -item.quantity,
    movement_type: 'SALE',
    reference_id: orderId,
    reason: null,
    created_at: createdAt,
    created_by: input.userId,
    device_id: device.id,
    confirmed: 0,
  }))

  return { order, movements }
}

/** The payload sent to the sync_order RPC (server recomputes and validates totals). */
export function syncOrderPayload(order: Order): Record<string, unknown> {
  const { items, ...rest } = order
  return {
    ...rest,
    items: items.map(({ id, movement_id, product_id, product_name_snapshot, quantity, unit_price, unit_cost }) => ({
      id,
      movement_id,
      product_id,
      product_name_snapshot,
      quantity,
      unit_price,
      unit_cost,
    })),
  }
}

/** Short item summary like "3 BBQ, 2 Isaw Manok". */
export function itemSummary(order: Pick<Order, 'items'>): string {
  return order.items.map((i) => `${i.quantity} ${i.product_name_snapshot}`).join(', ')
}

export function totalPieces(order: Pick<Order, 'items'>): number {
  return order.items.reduce((n, i) => n + i.quantity, 0)
}
