import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'ghostDark'
type Size = 'md' | 'lg' | 'xl' | '2xl'

const variants: Record<Variant, string> = {
  primary: 'bg-ember-600 text-white active:bg-ember-700 disabled:bg-stone-300 disabled:text-stone-500',
  secondary:
    'bg-white text-stone-900 border-2 border-stone-300 active:bg-stone-100 disabled:text-stone-400 disabled:border-stone-200',
  success: 'bg-green-700 text-white active:bg-green-800 disabled:bg-stone-300 disabled:text-stone-500',
  danger: 'bg-red-600 text-white active:bg-red-700 disabled:bg-stone-300 disabled:text-stone-500',
  ghost: 'bg-transparent text-stone-700 active:bg-stone-200 disabled:text-stone-400',
  /** Ghost button for dark (char) backgrounds. */
  ghostDark: 'bg-transparent text-stone-200 active:bg-stone-700 disabled:text-stone-500',
}

const sizes: Record<Size, string> = {
  md: 'min-h-12 px-4 text-base',
  lg: 'min-h-14 px-5 text-lg',
  xl: 'min-h-16 px-6 text-xl',
  /** Grill buttons: hit easily with greasy fingers. */
  '2xl': 'min-h-20 px-6 text-2xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
}

export function Button({ variant = 'primary', size = 'lg', block, className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-xl font-bold uppercase tracking-wide transition-colors ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  )
}
