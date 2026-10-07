import { Button } from '../components/Button'
import { setProductSoldOut } from '../data/actions'
import { formatPeso } from '../lib/money'
import type { Product } from '../lib/types'

/** Long-press sheet on a product tile: quick SOLD OUT / AVAILABLE toggle. */
export function ProductActions({ product, onClose }: { product: Product; onClose: () => void }) {
  async function toggle() {
    await setProductSoldOut(product.id, !product.is_sold_out)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label={product.name} onClick={onClose}>
      <div className="pb-safe w-full space-y-4 rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-2xl font-extrabold uppercase">{product.name}</h2>
          <p className="text-lg text-stone-600">
            {formatPeso(product.selling_price)} · {product.stock_quantity} pcs in stock
          </p>
        </div>
        {product.is_sold_out ? (
          <Button size="xl" block variant="success" onClick={() => void toggle()}>
            Mark available
          </Button>
        ) : (
          <Button size="xl" block variant="danger" onClick={() => void toggle()}>
            Mark sold out
          </Button>
        )}
        <Button size="xl" block variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
