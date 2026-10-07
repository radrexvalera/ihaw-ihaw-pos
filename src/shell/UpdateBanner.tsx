import { Sparkles } from 'lucide-react'
import { applyUpdate, usePwa } from '../pwa/pwa'

/** A new app version is ready. Never applied automatically, so a sale is never interrupted. */
export function UpdateBanner() {
  const { updateReady } = usePwa()
  if (!updateReady) return null
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-3 bg-sky-700 px-4 text-white">
      <Sparkles className="size-5 shrink-0" />
      <span className="flex-1 font-bold">New version ready</span>
      <button onClick={applyUpdate} className="min-h-10 rounded-lg bg-white px-4 font-extrabold uppercase text-sky-800 active:bg-sky-100">
        Update
      </button>
    </div>
  )
}
