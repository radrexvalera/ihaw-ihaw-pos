import { useState } from 'react'
import { useProfile } from '../auth/context'
import { Button } from '../components/Button'
import { Notice } from '../components/Feedback'
import { Keypad } from '../components/Keypad'
import { Sheet } from '../components/Sheet'
import { recordStockMovement } from '../data/actions'
import { applyKey } from '../lib/keypad'
import { errorMessage } from '../lib/supabase'
import type { Product } from '../lib/types'
import { useDevice } from '../shell/device'
import { ADJUST_REASONS_MINUS, ADJUST_REASONS_PLUS, adjustmentFor, type ManualMovementType } from './stockLogic'

export type StockEntryMode = 'add' | 'count'

/** ADD STOCK (stock in / opening) or COUNT (set the actual count → adjustment). */
export function StockEntrySheet({ product, mode, onClose }: { product: Product; mode: StockEntryMode; onClose: () => void }) {
  const profile = useProfile()
  const device = useDevice()
  const [typed, setTyped] = useState('')
  const [addType, setAddType] = useState<Extract<ManualMovementType, 'STOCK_IN' | 'OPENING'>>('STOCK_IN')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = product.stock_quantity
  const n = typed === '' ? null : Number(typed)

  const adjustment = mode === 'count' && n !== null ? adjustmentFor(current, n) : null
  const movement =
    mode === 'add'
      ? n && n > 0
        ? { type: addType, quantityChange: n }
        : null
      : adjustment
  const resulting = mode === 'add' ? current + (n ?? 0) : (n ?? current)
  const reasons = adjustment?.type === 'ADJUSTMENT_PLUS' ? ADJUST_REASONS_PLUS : ADJUST_REASONS_MINUS
  const needsReason = mode === 'count'
  const canSave = movement !== null && (!needsReason || reason.trim() !== '') && !busy

  async function save() {
    if (!movement) return
    setBusy(true)
    setError(null)
    try {
      await recordStockMovement({
        productId: product.id,
        type: movement.type,
        quantityChange: movement.quantityChange,
        reason: needsReason ? reason : addType === 'OPENING' ? 'Opening stock' : 'New stock',
        userId: profile.id,
        device,
      })
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={`${mode === 'add' ? 'Add stock' : 'Count stock'} · ${product.name}`}
      onClose={onClose}
      footer={
        <Button size="xl" block disabled={!canSave} onClick={() => void save()}>
          {busy
            ? 'Saving…'
            : mode === 'count' && n !== null && !adjustment
              ? 'Count matches — nothing to save'
              : mode === 'count' && movement && !reason.trim()
                ? 'Choose a reason'
                : 'Save'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Figure label={mode === 'add' ? 'Current' : 'System'} value={String(current)} />
          <Figure
            label={mode === 'add' ? 'Add' : 'Actual'}
            value={typed === '' ? '—' : typed}
            highlight
          />
          <Figure
            label={mode === 'add' ? 'New' : 'Change'}
            value={
              mode === 'add'
                ? String(resulting)
                : adjustment
                  ? `${adjustment.quantityChange > 0 ? '+' : ''}${adjustment.quantityChange}`
                  : n === null
                    ? '—'
                    : '0'
            }
            tone={adjustment ? (adjustment.quantityChange < 0 ? 'bad' : 'good') : undefined}
          />
        </div>

        <Keypad onKey={(k) => setTyped((t) => applyKey(t, k, 5))} label={mode === 'add' ? 'Pieces to add' : 'Actual count'} />

        {mode === 'add' ? (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['STOCK_IN', 'New stock'],
                ['OPENING', 'Opening stock'],
              ] as const
            ).map(([type, label]) => (
              <Chip key={type} active={addType === type} onClick={() => setAddType(type)}>
                {label}
              </Chip>
            ))}
          </div>
        ) : (
          adjustment && (
            <div className="space-y-2">
              <p className="text-sm font-bold uppercase tracking-wide text-stone-600">Reason (required)</p>
              <div className="grid grid-cols-2 gap-2">
                {reasons.map((r) => (
                  <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
                    {r}
                  </Chip>
                ))}
              </div>
            </div>
          )
        )}
        {error && <Notice>{error}</Notice>}
      </div>
    </Sheet>
  )
}

function Figure({ label, value, highlight, tone }: { label: string; value: string; highlight?: boolean; tone?: 'good' | 'bad' }) {
  return (
    <div className={`rounded-2xl p-3 ${highlight ? 'border-2 border-ember-600 bg-ember-50' : 'bg-white'}`}>
      <p className="text-xs font-extrabold uppercase text-stone-500">{label}</p>
      <p className={`text-4xl font-black tabular-nums ${tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-700' : ''}`}>{value}</p>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-14 rounded-xl border-2 px-2 text-base font-bold ${active ? 'border-ember-600 bg-ember-600 text-white' : 'border-stone-300 bg-white'}`}
    >
      {children}
    </button>
  )
}
