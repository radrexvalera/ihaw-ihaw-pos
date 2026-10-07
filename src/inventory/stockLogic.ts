import type { MovementType } from '../lib/types'

/** Movement types an admin records by hand (sales and returns come from orders). */
export type ManualMovementType = Extract<MovementType, 'OPENING' | 'STOCK_IN' | 'ADJUSTMENT_PLUS' | 'ADJUSTMENT_MINUS'>

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  OPENING: 'Opening stock',
  STOCK_IN: 'Stock in',
  SALE: 'Sale',
  ADJUSTMENT_PLUS: 'Adjustment +',
  ADJUSTMENT_MINUS: 'Adjustment −',
  CANCELLED_SALE_RETURN: 'Cancelled sale',
}

export const ADJUST_REASONS_MINUS = ['Damaged', 'Missing', 'Spoiled', 'Count correction'] as const
export const ADJUST_REASONS_PLUS = ['Count correction', 'Found', 'Returned unused'] as const

/** System 42, actual 39 → ADJUSTMENT_MINUS −3. Returns null when they match. */
export function adjustmentFor(system: number, actual: number): { type: ManualMovementType; quantityChange: number } | null {
  const diff = actual - system
  if (diff === 0) return null
  return { type: diff > 0 ? 'ADJUSTMENT_PLUS' : 'ADJUSTMENT_MINUS', quantityChange: diff }
}

/** Mirrors the database constraints so bad input never reaches the outbox. */
export function validateMovement(type: ManualMovementType, quantityChange: number, reason: string | null): string | null {
  if (!Number.isSafeInteger(quantityChange) || quantityChange === 0) return 'Enter a quantity.'
  const positive = type !== 'ADJUSTMENT_MINUS'
  if (positive !== quantityChange > 0) return 'Quantity has the wrong sign for this movement.'
  if ((type === 'ADJUSTMENT_PLUS' || type === 'ADJUSTMENT_MINUS') && !reason?.trim()) return 'Choose a reason.'
  return null
}
