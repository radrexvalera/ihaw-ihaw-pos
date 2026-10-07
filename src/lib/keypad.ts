/** Applies a keypad key to a digit string (max `maxDigits`, no leading zeros). */
export function applyKey(value: string, key: string, maxDigits = 6): string {
  if (key === 'back') return value.slice(0, -1)
  if (key === 'clear') return ''
  if (value.length >= maxDigits) return value
  return (value + key).replace(/^0+(?=\d)/, '')
}
