import { useRef, type PointerEvent } from 'react'

/** Where a tap landed (viewport coordinates), or null for keyboard activation. */
export type TapPoint = { x: number; y: number } | null

/**
 * Tap → onTap, hold ~500 ms → onLongPress (and the tap is suppressed).
 * Works with touch and mouse; moving the finger (scrolling) cancels both.
 */
export function useLongPress(onTap: (point: TapPoint) => void, onLongPress: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fired = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)

  const cancel = () => {
    clearTimeout(timer.current)
    start.current = null
  }

  return {
    onPointerDown: (e: PointerEvent) => {
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        fired.current = true
        start.current = null
        navigator.vibrate?.(30)
        onLongPress()
      }, ms)
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) cancel()
    },
    onPointerUp: () => {
      const point = start.current
      cancel()
      if (point && !fired.current) onTap(point)
    },
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    // Keyboard activation (Enter / Space) produces a click with detail 0.
    onClick: (e: { detail: number }) => {
      if (e.detail === 0) onTap(null)
    },
  }
}
