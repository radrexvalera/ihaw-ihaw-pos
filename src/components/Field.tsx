import type { InputHTMLAttributes, ReactNode } from 'react'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: ReactNode
  error?: string | null
  prefix?: string
}

export function Field({ label, value, onChange, hint, error, prefix, id, ...rest }: FieldProps) {
  const inputId = id ?? `f-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-bold uppercase tracking-wide text-stone-600">
        {label}
      </label>
      <div
        className={`flex min-h-14 items-center rounded-xl border-2 bg-white px-3 focus-within:border-ember-600 ${error ? 'border-red-500' : 'border-stone-300'}`}
      >
        {prefix && <span className="mr-1 text-xl font-bold text-stone-500">{prefix}</span>}
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent py-3 text-xl font-semibold outline-none"
          {...rest}
        />
      </div>
      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : hint && <p className="text-sm text-stone-500">{hint}</p>}
    </div>
  )
}

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-16 w-full items-center gap-3 rounded-xl border-2 border-stone-300 bg-white px-4 text-left disabled:opacity-50"
    >
      <span className="flex-1">
        <span className="block text-lg font-bold">{label}</span>
        {description && <span className="block text-sm text-stone-500">{description}</span>}
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-ember-600' : 'bg-stone-300'}`}>
        <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${checked ? 'left-7' : 'left-1'}`} />
      </span>
    </button>
  )
}

interface SegmentedProps<T extends string> {
  label?: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
}

export function Segmented<T extends string>({ label, value, options, onChange, disabled }: SegmentedProps<T>) {
  return (
    <div className="space-y-1">
      {label && <span className="block text-sm font-bold uppercase tracking-wide text-stone-600">{label}</span>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`min-h-12 rounded-xl border-2 px-2 text-sm font-bold uppercase disabled:opacity-50 ${
              o.value === value ? 'border-ember-600 bg-ember-600 text-white' : 'border-stone-300 bg-white text-stone-800'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
