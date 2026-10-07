// Online read of the inventory ledger (history is not cached on the phone).
import { supabase } from '../lib/supabase'
import type { InventoryMovement } from '../lib/types'

export async function fetchMovements(productId: string, limit = 50): Promise<InventoryMovement[]> {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('id,product_id,quantity_change,movement_type,reference_id,reason,created_at,created_by,device_id')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as InventoryMovement[]
}
