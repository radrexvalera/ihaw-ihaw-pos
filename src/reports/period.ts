// Report periods as inclusive Manila business dates (YYYY-MM-DD).

export type PeriodKind = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

export interface Period {
  from: string
  to: string
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** `today` is the Manila business date. Weeks start on Monday. */
export function periodRange(kind: Exclude<PeriodKind, 'custom'>, today: string): Period {
  switch (kind) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = shift(today, -1)
      return { from: y, to: y }
    }
    case 'week': {
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay() // 0 = Sunday
      return { from: shift(today, -((dow + 6) % 7)), to: today }
    }
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today }
  }
}

/** Puts a custom range in order and caps it at 366 days. */
export function normalizeRange(a: string, b: string): Period {
  const [from, to] = a <= b ? [a, b] : [b, a]
  const maxFrom = shift(to, -365)
  return { from: from < maxFrom ? maxFrom : from, to }
}

/** Start/end instants of a business-date range in Manila (UTC+8, no DST). */
export function periodInstants(p: Period): { start: string; end: string } {
  return { start: `${p.from}T00:00:00+08:00`, end: `${shift(p.to, 1)}T00:00:00+08:00` }
}

export function formatPeriod(p: Period): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return p.from === p.to ? fmt(p.from) : `${fmt(p.from)} – ${fmt(p.to)}`
}
