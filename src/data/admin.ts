// Admin master-data writes. These are online-only by design (rare, done when
// there is signal); cashier actions go through the offline outbox instead.
import { setMeta } from '../db/local'
import { supabase } from '../lib/supabase'
import type { BusinessSettings, Device, DeviceType, ProductEditable, Profile, Role } from '../lib/types'
import { pullProducts } from '../sync/engine'

export class OfflineError extends Error {
  constructor() {
    super('No internet connection. This change needs to be online.')
  }
}

function requireOnline() {
  if (!navigator.onLine) throw new OfflineError()
}

function friendly(error: { message: string; code?: string }): Error {
  if (error.code === '23505') return new Error('A product with that name already exists.')
  if (error.code === '42501') return new Error('You do not have permission to do that.')
  return new Error(error.message)
}

// ---------------------------------------------------------------- products
export async function createProduct(input: ProductEditable): Promise<void> {
  requireOnline()
  const { error } = await supabase.from('products').insert(input)
  if (error) throw friendly(error)
  await pullProducts()
}

/** Never sends stock_quantity — stock only changes through inventory movements. */
export async function updateProduct(id: string, patch: Partial<ProductEditable>): Promise<void> {
  requireOnline()
  const { error } = await supabase.from('products').update(patch).eq('id', id)
  if (error) throw friendly(error)
  await pullProducts()
}

/** Persists a new display order as sort_order 10, 20, 30… */
export async function saveProductOrder(orderedIds: readonly string[]): Promise<void> {
  requireOnline()
  const results = await Promise.all(
    orderedIds.map((id, i) => supabase.from('products').update({ sort_order: (i + 1) * 10 }).eq('id', id)),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw friendly(failed.error)
  await pullProducts()
}

// ---------------------------------------------------------------- settings
export async function updateBusinessSettings(input: BusinessSettings): Promise<void> {
  requireOnline()
  const { error } = await supabase.from('settings').update(input).eq('id', 1)
  if (error) throw friendly(error)
  await setMeta('settings', input)
}

// ---------------------------------------------------------------- users
export async function listProfiles(): Promise<Profile[]> {
  requireOnline()
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,role,is_active')
    .order('created_at')
  if (error) throw friendly(error)
  return (data ?? []) as Profile[]
}

export async function updateProfileAccess(
  id: string,
  patch: { role?: Role; is_active?: boolean },
): Promise<void> {
  requireOnline()
  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  if (error) throw friendly(error)
}

// ---------------------------------------------------------------- devices
export async function listDevices(): Promise<Device[]> {
  requireOnline()
  const { data, error } = await supabase
    .from('devices')
    .select('id,device_code,device_name,device_type,last_seen,created_at')
    .order('device_code')
  if (error) throw friendly(error)
  return (data ?? []) as Device[]
}

export async function registerDevice(id: string, name: string, type: DeviceType): Promise<Device> {
  requireOnline()
  const { data, error } = await supabase
    .rpc('register_device', { p_id: id, p_name: name, p_type: type })
    .single()
  if (error) throw friendly(error)
  const device = data as Device
  await setMeta('device', device)
  return device
}
