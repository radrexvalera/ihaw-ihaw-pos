import { ArrowLeft, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** "back" shows an arrow (sub-page); "close" shows an X (dialog). */
  closeStyle?: 'back' | 'close'
}

/** Full-screen panel on phones, centred card on larger screens. */
export function Sheet({ title, onClose, children, footer, closeStyle = 'close' }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const Icon = closeStyle === 'back' ? ArrowLeft : X
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pt-safe flex h-full w-full flex-col bg-stone-100 sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl">
        <header className="flex min-h-16 items-center gap-2 border-b border-stone-200 bg-white px-2">
          <button
            onClick={onClose}
            className="flex size-12 items-center justify-center rounded-xl active:bg-stone-200"
            aria-label={closeStyle === 'back' ? 'Back' : 'Close'}
          >
            <Icon className="size-7" />
          </button>
          <h2 className="flex-1 truncate text-xl font-extrabold uppercase tracking-wide">{title}</h2>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <footer className="pb-safe border-t border-stone-200 bg-white p-3">{footer}</footer>}
      </div>
    </div>
  )
}
