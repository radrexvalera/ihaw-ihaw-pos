import { ChevronUp, Package } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { EmptyState, Spinner } from '../components/Feedback'
import { useProducts } from '../data/useProducts'
import { formatPeso } from '../lib/money'
import type { Product } from '../lib/types'
import { PendingChangeBanner } from '../orders/PendingChange'
import { addProduct, cartTotals, lastPriceOf, quantityOfProduct, reconcileCart, removeOneOfProduct } from './cart'
import { getCart, updateCart, useCart } from './cartStore'
import { CartSheet } from './CartSheet'
import { CheckoutSheet } from './CheckoutSheet'
import { PriceSheet } from './PriceSheet'
import { ProductActions } from './ProductActions'
import { ProductTile } from './ProductTile'
import { SaleComplete } from './SaleComplete'

type Overlay =
  | { kind: 'cart' }
  | { kind: 'checkout' }
  | { kind: 'done'; orderId: string }
  | { kind: 'product'; product: Product }
  | { kind: 'price'; product: Product }
  | null

export function PosScreen() {
  const products = useProducts()
  const cart = useCart()
  const [overlay, setOverlay] = useState<Overlay>(null)
  // Stable so the sale-complete auto-close timer is not restarted by re-renders.
  const closeOverlay = useCallback(() => setOverlay(null), [])
  const { pieces, total } = cartTotals(cart)

  // Keep a saved cart honest if a product is disabled, sold out or repriced elsewhere.
  useEffect(() => {
    if (!products) return
    const reconciled = reconcileCart(getCart(), products)
    if (JSON.stringify(reconciled) !== JSON.stringify(getCart())) updateCart(() => reconciled)
  }, [products])

  if (!products) return <Spinner />
  const visible = products.filter((p) => p.is_active)

  return (
    <div className="flex h-full flex-col">
      <PendingChangeBanner />

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <EmptyState icon={Package} title="No products to sell">
            The owner can add products in Menu → Products.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visible.map((p) => (
              <ProductTile
                key={p.id}
                product={p}
                quantityInCart={quantityOfProduct(cart, p.id)}
                onAdd={() => {
                  // "Price varies" products ask for the price first.
                  if (p.is_variable_price) return setOverlay({ kind: 'price', product: p })
                  navigator.vibrate?.(10)
                  updateCart((c) => addProduct(c, p))
                }}
                onRemove={() => {
                  navigator.vibrate?.([10, 40, 10])
                  updateCart((c) => removeOneOfProduct(c, p.id))
                }}
                onLongPress={() => setOverlay({ kind: 'product', product: p })}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-stone-300 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        {cart.length === 0 ? (
          <p className="py-2 text-center text-lg font-bold text-stone-400">Tap a product to start an order</p>
        ) : (
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <button
              onClick={() => setOverlay({ kind: 'cart' })}
              className="flex min-h-16 flex-1 items-center justify-between gap-2 rounded-xl border-2 border-stone-300 px-3 active:bg-stone-100"
              aria-label={`View order: ${pieces} items, ${formatPeso(total)}`}
            >
              <span className="text-left">
                <span className="block text-sm font-extrabold uppercase text-stone-500">{pieces} items</span>
                <span className="block text-3xl font-black tabular-nums leading-tight">{formatPeso(total)}</span>
              </span>
              <ChevronUp className="size-7 text-stone-500" />
            </button>
            <Button size="xl" className="flex-1" onClick={() => setOverlay({ kind: 'checkout' })}>
              Checkout
            </Button>
          </div>
        )}
      </div>

      {overlay?.kind === 'cart' && <CartSheet onClose={() => setOverlay(null)} onCheckout={() => setOverlay({ kind: 'checkout' })} />}
      {overlay?.kind === 'checkout' && (
        <CheckoutSheet onClose={() => setOverlay(null)} onComplete={(order) => setOverlay({ kind: 'done', orderId: order.id })} />
      )}
      {overlay?.kind === 'done' && <SaleComplete orderId={overlay.orderId} onClose={closeOverlay} />}
      {overlay?.kind === 'price' && (
        <PriceSheet
          product={overlay.product}
          lastPrice={lastPriceOf(cart, overlay.product.id)}
          onClose={closeOverlay}
          onAdd={(price) => {
            navigator.vibrate?.(10)
            updateCart((c) => addProduct(c, overlay.product, price))
            setOverlay(null)
          }}
        />
      )}
      {overlay?.kind === 'product' && (
        <ProductActions product={products.find((p) => p.id === overlay.product.id) ?? overlay.product} onClose={() => setOverlay(null)} />
      )}
    </div>
  )
}
