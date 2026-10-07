// DONE is committed after a short undo window, because greasy fingers mis-tap.
// Timers live at module level so switching tabs during the window still commits.
import { useSyncExternalStore } from 'react'
import { setGrillStatus } from '../data/actions'

export const UNDO_MS = 4000

const timers = new Map<string, ReturnType<typeof setTimeout>>()
let snapshot: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

function emit() {
  snapshot = new Set(timers.keys())
  for (const l of listeners) l()
}

function commit(orderId: string) {
  clearTimeout(timers.get(orderId))
  timers.delete(orderId)
  emit()
  void setGrillStatus(orderId, 'done')
}

export function markDoneWithUndo(orderId: string): void {
  if (timers.has(orderId)) return
  timers.set(orderId, setTimeout(() => commit(orderId), UNDO_MS))
  emit()
}

export function undoDone(orderId: string): void {
  clearTimeout(timers.get(orderId))
  if (timers.delete(orderId)) emit()
}

/** Commit everything now (e.g. the app is being hidden or closed). */
export function flushDone(): void {
  for (const id of [...timers.keys()]) commit(id)
}

export function usePendingDone(): ReadonlySet<string> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
  )
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDone()
  })
}
