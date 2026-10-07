import { AlertTriangle, Info, Loader2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-stone-500" role="status">
      <Loader2 className="size-7 animate-spin" />
      <span className="text-lg font-semibold">{label}</span>
    </div>
  )
}

export function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="pt-safe pb-safe flex min-h-full flex-col items-center justify-center gap-6 bg-char p-6 text-center text-white">
      {children}
    </div>
  )
}

export function Notice({ tone = 'error', children }: { tone?: 'error' | 'warning' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-300 bg-red-50 text-red-800',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    info: 'border-sky-300 bg-sky-50 text-sky-900',
  }[tone]
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div className={`flex items-start gap-3 rounded-xl border-2 p-3 font-semibold ${styles}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center text-stone-500">
      <Icon className="size-14 text-stone-300" />
      <p className="text-xl font-bold text-stone-700">{title}</p>
      {children && <div className="text-base">{children}</div>}
    </div>
  )
}
