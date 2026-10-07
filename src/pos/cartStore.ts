// The current cart, shared across tabs of the app and saved to localStorage so
// an accidental reload or app switch never loses a half-built order.
import { useSyncExternalStore } from 'react'
import type { Cart, CartLine } from './cart'

const KEY = 'ihaw-pos.cart'

function load(): Cart {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    // Carts saved before "price varies" existed have no line_key.
    return (parsed as Partial<CartLine>[]).map((l) => ({
      ...l,
      line_key: l.line_key ?? l.product_id,
      variable_price: l.variable_price ?? false,
    })) as Cart
  } catch {
    return []
  }
}

let cart: Cart = typeof localStorage === 'undefined' ? [] : load()
const listeners = new Set<() => void>()

export function getCart(): Cart {
  return cart
}

export function updateCart(fn: (cart: Cart) => Cart): void {
  const next = fn(cart)
  if (next === cart) return
  cart = next
  try {
    localStorage.setItem(KEY, JSON.stringify(cart))
  } catch {
    // Storage full or blocked: the in-memory cart still works.
  }
  for (const l of listeners) l()
}

export function useCart(): Cart {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getCart,
  )
}
