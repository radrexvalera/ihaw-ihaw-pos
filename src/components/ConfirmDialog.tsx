import type { ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Large, thumb-friendly confirmation shown at the bottom of the screen. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Back', danger, busy, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="pb-safe w-full space-y-4 rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl">
        <h2 className="text-2xl font-extrabold">{title}</h2>
        {children && <div className="text-lg text-stone-700">{children}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" size="xl" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} size="xl" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
