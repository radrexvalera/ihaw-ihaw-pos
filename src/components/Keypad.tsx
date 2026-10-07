import { Delete } from 'lucide-react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

/** Big on-screen number pad, so the phone keyboard never covers the screen. */
export function Keypad({ onKey, label = 'Number keypad' }: { onKey: (key: string) => void; label?: string }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label={label}>
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          aria-label={k === 'back' ? 'Delete digit' : k === 'clear' ? 'Clear' : k}
          className="flex min-h-14 items-center justify-center rounded-xl border-2 border-stone-300 bg-white text-2xl font-extrabold active:bg-stone-200"
        >
          {k === 'back' ? <Delete className="size-7" /> : k === 'clear' ? <span className="text-base">CLEAR</span> : k}
        </button>
      ))}
    </div>
  )
}
