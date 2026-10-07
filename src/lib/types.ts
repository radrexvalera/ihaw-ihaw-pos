// Domain types. Money fields are integer centavos (see lib/money.ts).
import type { Centavos } from './money'

export type Role = 'admin' | 'cashier' | 'griller'
export type DeviceType = 'cashier' | 'griller'
export type PaymentMethod = 'cash' | 'gcash'
export type OrderStatus = 'completed' | 'cancelled'
export type GrillStatus = 'new' | 'grilling' | 'done' | 'cancelled'
export type MovementType =
  | 'OPENING'
  | 'STOCK_IN'
  | 'SALE'
  | 'ADJUSTMENT_PLUS'
  | 'ADJUSTMENT_MINUS'
  | 'CANCELLED_SALE_RETURN'

export interface Profile {
  id: string
  display_name: string
  role: Role
  is_active: boolean
}

export interface Device {
  id: string
  device_code: string
  device_name: string
  device_type: DeviceType
  last_seen: string | null
  created_at: string
}

export interface BusinessSettings {
  business_name: string
  business_address: string | null
  business_phone: string | null
}

export interface Product {
  id: string
  name: string
  selling_price: Centavos
  unit_cost: Centavos
  stock_quantity: number
  low_stock_threshold: number
  is_active: boolean
  is_sold_out: boolean
  /** Priced by size: the cashier enters the price at sale; selling_price is only the usual price. */
  is_variable_price: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/** Fields an admin may edit directly. stock_quantity is deliberately absent. */
export type ProductEditable = Pick<
  Product,
  | 'name'
  | 'selling_price'
  | 'unit_cost'
  | 'low_stock_threshold'
  | 'is_active'
  | 'is_sold_out'
  | 'is_variable_price'
  | 'sort_order'
>

export interface OrderItem {
  id: string
  movement_id: string
  product_id: string
  product_name_snapshot: string
  quantity: number
  unit_price: Centavos
  unit_cost: Centavos
  line_total: Centavos
}

/** Local copy of an order (items embedded). Mirrors the server row. */
export interface Order {
  id: string
  order_ref: string
  order_number: number
  business_date: string
  customer_token_number: number | null
  status: OrderStatus
  total: Centavos
  payment_method: PaymentMethod
  payment_reference: string | null
  amount_received: Centavos
  change_due: Centavos
  change_given: boolean
  change_given_at: string | null
  change_given_by: string | null
  grill_status: GrillStatus
  grill_started_at: string | null
  grill_done_at: string | null
  device_id: string
  created_by: string | null
  created_at: string
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  items: OrderItem[]
}

export interface InventoryMovement {
  id: string
  product_id: string
  quantity_change: number
  movement_type: MovementType
  reference_id: string | null
  reason: string | null
  created_at: string
  created_by: string | null
  device_id: string | null
}
