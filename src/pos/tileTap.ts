import type { TapPoint } from '../lib/useLongPress'

export type TileAction = 'add' | 'remove' | 'none'

/**
 * Product tile tap: not in the order yet → any tap adds (the first tap never fails).
 * In the order → left half removes one, right half adds one. Keyboard (no point) adds.
 */
export function tileAction(
  point: TapPoint,
  rect: { left: number; width: number } | null,
  quantityInCart: number,
  sellable: boolean,
): TileAction {
  if (!sellable) return 'none'
  if (quantityInCart > 0 && point && rect && point.x < rect.left + rect.width / 2) return 'remove'
  return 'add'
}
