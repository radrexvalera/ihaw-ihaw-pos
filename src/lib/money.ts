// Money is ALWAYS integer centavos (₱25.00 === 2500). Never use floats for
// money math; convert from/to peso strings only at the UI edge.

export type Centavos = number

function assertCentavos(value: number, label = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a whole number of centavos, got ${value}`)
  }
}

/** Parses user input like "25", "25.5", "1,000.00", "₱ 100" into centavos. */
export function parsePesos(input: string): Centavos | null {
  const cleaned = input.replace(/[₱,\s]/g, '')
  const match = /^(\d{1,9})(?:\.(\d{0,2}))?$/.exec(cleaned)
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  return whole * 100 + fraction
}

/** "25" for whole pesos, "25.50" otherwise — suitable for an input field. */
export function toPesoInput(c: Centavos): string {
  assertCentavos(c)
  const sign = c < 0 ? '-' : ''
  const abs = Math.abs(c)
  const whole = Math.trunc(abs / 100)
  const fraction = abs % 100
  return fraction === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(fraction).padStart(2, '0')}`
}

const groupFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })

/** "₱1,250" or "₱25.50". Centavos shown only when non-zero (unless forced). */
export function formatPeso(c: Centavos, opts: { alwaysCentavos?: boolean } = {}): string {
  assertCentavos(c)
  const sign = c < 0 ? '-' : ''
  const abs = Math.abs(c)
  const whole = groupFormatter.format(Math.trunc(abs / 100))
  const fraction = abs % 100
  const showFraction = opts.alwaysCentavos || fraction !== 0
  return `${sign}₱${whole}${showFraction ? '.' + String(fraction).padStart(2, '0') : ''}`
}

export function lineTotal(unitPrice: Centavos, quantity: number): Centavos {
  assertCentavos(unitPrice, 'unit price')
  if (!Number.isSafeInteger(quantity)) throw new RangeError(`quantity must be an integer, got ${quantity}`)
  const result = unitPrice * quantity
  assertCentavos(result, 'line total')
  return result
}

export function sumCentavos(values: readonly Centavos[]): Centavos {
  let total = 0
  for (const v of values) {
    assertCentavos(v)
    total += v
  }
  assertCentavos(total, 'total')
  return total
}

/** Gross margin as a percentage with one decimal place, or null when revenue is 0. */
export function marginPercent(profit: Centavos, revenue: Centavos): number | null {
  if (revenue === 0) return null
  return Math.round((profit * 1000) / revenue) / 10
}
