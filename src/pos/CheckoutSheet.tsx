import { useState } from 'react'
import { useProfile } from '../auth/context'
import { Button } from '../components/Button'
import { Notice } from '../components/Feedback'
import { Keypad } from '../components/Keypad'
import { applyKey } from '../lib/keypad'
import { Sheet } from '../components/Sheet'
import { completeSale } from '../data/actions'
import { formatPeso, type Centavos } from '../lib/money'
import { errorMessage } from '../lib/supabase'
import type { Order, PaymentMethod } from '../lib/types'
import { useDevice } from '../shell/device'
import { cartTotals } from './cart'
import { updateCart, useCart } from './cartStore'
import { QUICK_CASH, changeFor } from './checkout'

const MAX_TOKEN = 40

export function CheckoutSheet({ onClose, onComplete }: { onClose: () => void; onComplete: (order: Order) => void }) {
  const cart = useCart()
  const profile = useProfile()
  const device = useDevice()
  const { total, pieces } = cartTotals(cart)

  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState<Centavos | null>(null)
  const [typed, setTyped] = useState('') // whole pesos typed on the keypad
  const [reference, setReference] = useState('')
  const [token, setToken] = useState<number | null>(null)
  const [pickToken, setPickToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveReceived = method === 'gcash' ? total : received
  const { changeDue, enough } = changeFor(total, effectiveReceived)

  function press(key: string) {
    const next = applyKey(typed, key)
    setTyped(next)
    setReceived(next ? Number(next) * 100 : null)
  }

  function quick(amount: Centavos) {
    setTyped('')
    setReceived(amount)
  }

  async function complete() {
    if (!enough || busy || cart.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const order = await completeSale({
        cart,
        paymentMethod: method,
        amountReceived: effectiveReceived ?? total,
        paymentReference: reference,
        customerToken: token,
        device,
        userId: profile.id,
      })
      updateCart(() => [])
      onComplete(order)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Checkout"
      onClose={onClose}
      footer={
        <Button size="xl" block disabled={!enough || busy} onClick={() => void complete()}>
          {busy ? 'Saving…' : enough ? 'Complete sale' : 'Enter amount received'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-baseline justify-between rounded-2xl bg-char px-4 py-3 text-white">
          <span className="text-lg font-bold uppercase text-stone-300">Total · {pieces} pcs</span>
          <span className="text-5xl font-extrabold tabular-nums">{formatPeso(total)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
          {(['cash', 'gcash'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={`min-h-14 rounded-xl border-2 text-xl font-extrabold uppercase ${
                method === m ? 'border-ember-600 bg-ember-600 text-white' : 'border-stone-300 bg-white'
              }`}
            >
              {m === 'cash' ? 'Cash' : 'GCash'}
            </button>
          ))}
        </div>

        {method === 'cash' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white p-3">
                <p className="text-sm font-bold uppercase text-stone-500">Received</p>
                <p className="text-4xl font-extrabold tabular-nums">{received === null ? '—' : formatPeso(received)}</p>
              </div>
              <div className={`rounded-2xl p-3 ${enough ? 'bg-green-100 text-green-900' : 'bg-white text-stone-400'}`}>
                <p className="text-sm font-bold uppercase">Change</p>
                <p className="text-4xl font-extrabold tabular-nums">
                  {received !== null && !enough ? <span className="text-xl text-red-600">{formatPeso(total - received)} short</span> : formatPeso(changeDue)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <QuickButton label="Exact" active={received === total && !typed} onClick={() => quick(total)} />
              {QUICK_CASH.map((amount) => (
                <QuickButton
                  key={amount}
                  label={formatPeso(amount)}
                  active={received === amount && !typed}
                  disabled={amount < total}
                  onClick={() => quick(amount)}
                />
              ))}
            </div>

            <Keypad onKey={press} label="Amount received keypad" />
          </>
        ) : (
          <label className="block rounded-2xl bg-white p-3">
            <span className="block text-sm font-bold uppercase text-stone-500">GCash reference no. (optional)</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value.replace(/[^\dA-Za-z]/g, '').slice(0, 20))}
              inputMode="numeric"
              className="mt-1 min-h-12 w-full rounded-lg border-2 border-stone-300 px-3 text-xl font-semibold outline-none focus:border-ember-600"
            />
          </label>
        )}

        <button
          onClick={() => setPickToken(true)}
          className="flex min-h-14 w-full items-center justify-between rounded-2xl border-2 border-dashed border-stone-300 bg-white px-4"
        >
          <span className="text-lg font-bold uppercase text-stone-600">Customer token (optional)</span>
          <span className="text-2xl font-extrabold">{token ?? '—'}</span>
        </button>

        {error && <Notice>{error}</Notice>}
      </div>

      {pickToken && (
        <TokenPicker
          value={token}
          onPick={(t) => {
            setToken(t)
            setPickToken(false)
          }}
          onClose={() => setPickToken(false)}
        />
      )}
    </Sheet>
  )
}

function QuickButton({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`min-h-14 rounded-xl border-2 px-1 text-base font-extrabold tabular-nums disabled:opacity-35 ${
        active ? 'border-ember-600 bg-ember-600 text-white' : 'border-ember-600 bg-ember-50 text-ember-800 active:bg-ember-100'
      }`}
    >
      {label}
    </button>
  )
}

function TokenPicker({ value, onPick, onClose }: { value: number | null; onPick: (t: number | null) => void; onClose: () => void }) {
  return (
    <Sheet title="Customer token" onClose={onClose}>
      <div className="grid grid-cols-5 gap-2">
        <button onClick={() => onPick(null)} className="col-span-5 min-h-14 rounded-xl border-2 border-stone-300 bg-white text-lg font-extrabold uppercase">
          No token
        </button>
        {Array.from({ length: MAX_TOKEN }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => onPick(n)}
            aria-pressed={value === n}
            className={`min-h-14 rounded-xl border-2 text-2xl font-extrabold ${
              value === n ? 'border-ember-600 bg-ember-600 text-white' : 'border-stone-300 bg-white'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
