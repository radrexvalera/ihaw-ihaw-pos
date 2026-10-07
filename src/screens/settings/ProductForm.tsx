import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Field, ToggleRow } from '../../components/Field'
import { Notice } from '../../components/Feedback'
import { Sheet } from '../../components/Sheet'
import { createProduct, updateProduct } from '../../data/admin'
import { formatPeso, parsePesos, toPesoInput } from '../../lib/money'
import { errorMessage } from '../../lib/supabase'
import type { Product, ProductEditable } from '../../lib/types'
import { useOnline } from '../../lib/useOnline'

interface Props {
  product: Product | null
  nextSortOrder: number
  onDone: () => void
}

export function ProductForm({ product, nextSortOrder, onDone }: Props) {
  const online = useOnline()
  const [name, setName] = useState(product?.name ?? '')
  const [variable, setVariable] = useState(product?.is_variable_price ?? false)
  const [price, setPrice] = useState(product && !(product.is_variable_price && product.selling_price === 0) ? toPesoInput(product.selling_price) : '')
  const [cost, setCost] = useState(product ? toPesoInput(product.unit_cost) : '')
  const [threshold, setThreshold] = useState(String(product?.low_stock_threshold ?? 10))
  const [active, setActive] = useState(product?.is_active ?? true)
  const [soldOut, setSoldOut] = useState(product?.is_sold_out ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A "price varies" product may leave the usual price empty (₱0).
  const priceC = variable && price.trim() === '' ? 0 : parsePesos(price)
  const costC = cost.trim() === '' ? 0 : parsePesos(cost)
  const thresholdN = /^\d{1,6}$/.test(threshold.trim()) ? Number(threshold.trim()) : null
  const errors = {
    name: name.trim() ? null : 'Required',
    price: priceC === null ? 'Enter a price like 25 or 25.50' : null,
    cost: costC === null ? 'Enter a cost like 14 or 14.50' : null,
    threshold: thresholdN === null ? 'Whole number' : null,
  }
  const valid = !Object.values(errors).some(Boolean)
  const [touched, setTouched] = useState(false)
  const show = (e: string | null) => (touched ? e : null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid || priceC === null || costC === null || thresholdN === null) return
    if (active && !variable && priceC === 0) {
      setError('Enter a selling price, or turn on "Price varies" if the price depends on size.')
      return
    }

    const input: ProductEditable = {
      name: name.trim(),
      selling_price: priceC,
      unit_cost: costC,
      low_stock_threshold: thresholdN,
      is_active: active,
      is_sold_out: soldOut,
      is_variable_price: variable,
      sort_order: product?.sort_order ?? nextSortOrder,
    }
    setBusy(true)
    setError(null)
    try {
      if (product) await updateProduct(product.id, input)
      else await createProduct(input)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Sheet title={product ? 'Edit product' : 'New product'} closeStyle="back" onClose={onDone}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" value={name} onChange={setName} maxLength={40} autoCapitalize="words" error={show(errors.name)} />
        <ToggleRow
          label="Price varies"
          description="Cashier enters the price at each sale (e.g. priced by size)"
          checked={variable}
          onChange={setVariable}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={variable ? 'Usual price (optional)' : 'Selling price'}
            prefix="₱"
            inputMode="decimal"
            value={price}
            onChange={setPrice}
            error={show(errors.price)}
          />
          <Field
            label={variable ? 'Average unit cost' : 'Unit cost'}
            prefix="₱"
            inputMode="decimal"
            value={cost}
            onChange={setCost}
            error={show(errors.cost)}
          />
        </div>
        {variable && (
          <p className="text-sm text-stone-500">
            The usual price is suggested on the price pad. Profit uses the average unit cost for every size.
          </p>
        )}
        {priceC !== null && costC !== null && priceC > 0 && (
          <p className="rounded-xl bg-white p-3 text-lg">
            Estimated gross profit per piece:{' '}
            <strong className={priceC - costC < 0 ? 'text-red-600' : 'text-green-700'}>{formatPeso(priceC - costC)}</strong>
          </p>
        )}
        <Field
          label="Low stock alert at"
          inputMode="numeric"
          value={threshold}
          onChange={setThreshold}
          hint="Show LOW STOCK at or below this many pieces. 0 = never."
          error={show(errors.threshold)}
        />
        <ToggleRow label="Active" description="Inactive products are hidden from the POS" checked={active} onChange={setActive} />
        <ToggleRow label="Sold out" description="Shown on the POS but cannot be sold" checked={soldOut} onChange={setSoldOut} />
        {product && (
          <p className="text-sm text-stone-500">
            Stock ({product.stock_quantity} pcs) is changed from the Stock tab (Add stock / Count), never here.
          </p>
        )}
        {!online && <Notice tone="info">Offline — connect to save product changes.</Notice>}
        {error && <Notice>{error}</Notice>}
        <Button type="submit" size="xl" block disabled={busy || !online}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Sheet>
  )
}
