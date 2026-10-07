// Pure grill-queue logic: which orders show, in what order, and how urgent.
import type { Order } from '../lib/types'

export type WaitLevel = 'ok' | 'warn' | 'late'

/** Amber from 5 minutes, red from 10. */
export const WARN_AFTER_MIN = 5
export const LATE_AFTER_MIN = 10

export function isOnGrillQueue(o: Pick<Order, 'status' | 'grill_status'>): boolean {
  return o.status === 'completed' && (o.grill_status === 'new' || o.grill_status === 'grilling')
}

/** Active orders split by state, each oldest first (the longest wait is always on top). */
export function grillQueue<O extends Pick<Order, 'status' | 'grill_status' | 'created_at'>>(orders: readonly O[]) {
  const active = orders.filter(isOnGrillQueue).sort((a, b) => a.created_at.localeCompare(b.created_at))
  return {
    waiting: active.filter((o) => o.grill_status === 'new'),
    grilling: active.filter((o) => o.grill_status === 'grilling'),
  }
}

export function waitSeconds(createdAt: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000))
}

export function waitLevel(seconds: number): WaitLevel {
  if (seconds >= LATE_AFTER_MIN * 60) return 'late'
  if (seconds >= WARN_AFTER_MIN * 60) return 'warn'
  return 'ok'
}

/** "0:42", "4:05", "1:02:10". */
export function formatWait(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`
}
