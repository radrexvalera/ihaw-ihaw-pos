import { describe, expect, it } from 'vitest'
import { formatPeso, lineTotal, marginPercent, parsePesos, sumCentavos, toPesoInput } from './money'

describe('parsePesos', () => {
  it.each([
    ['25', 2500],
    ['25.5', 2550],
    ['25.50', 2550],
    ['0.10', 10],
    ['1,000', 100000],
    ['₱ 185', 18500],
    ['0', 0],
    ['100.', 10000],
  ])('parses %s', (input, expected) => {
    expect(parsePesos(input)).toBe(expected)
  })

  it.each(['', 'abc', '1.234', '-5', '1e3', '.5'])('rejects %s', (input) => {
    expect(parsePesos(input)).toBeNull()
  })

  it('avoids floating point error (0.1 + 0.2 style)', () => {
    expect((parsePesos('0.10') ?? 0) + (parsePesos('0.20') ?? 0)).toBe(30)
    expect(parsePesos('19.99')).toBe(1999)
  })
})

describe('formatPeso', () => {
  it('formats whole pesos without centavos', () => {
    expect(formatPeso(2500)).toBe('₱25')
    expect(formatPeso(100000)).toBe('₱1,000')
    expect(formatPeso(0)).toBe('₱0')
  })
  it('shows centavos when present or forced', () => {
    expect(formatPeso(2550)).toBe('₱25.50')
    expect(formatPeso(11736)).toBe('₱117.36')
    expect(formatPeso(2500, { alwaysCentavos: true })).toBe('₱25.00')
  })
  it('formats negatives', () => {
    expect(formatPeso(-31500)).toBe('-₱315')
  })
  it('rejects non-integers', () => {
    expect(() => formatPeso(25.5)).toThrow(RangeError)
  })
})

describe('toPesoInput', () => {
  it('round-trips with parsePesos', () => {
    for (const c of [0, 5, 2500, 2550, 123456]) {
      expect(parsePesos(toPesoInput(c))).toBe(c)
    }
  })
})

describe('arithmetic', () => {
  it('computes line totals and sums exactly', () => {
    expect(lineTotal(2500, 3)).toBe(7500)
    expect(sumCentavos([7500, 2000, 2000])).toBe(11500)
    expect(() => lineTotal(2500, 1.5)).toThrow(RangeError)
  })
  it('computes margin to one decimal', () => {
    expect(marginPercent(373000, 845000)).toBe(44.1)
    expect(marginPercent(110000, 250000)).toBe(44)
    expect(marginPercent(0, 0)).toBeNull()
  })
})
