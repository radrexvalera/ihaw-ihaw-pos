// The business runs on Philippine time regardless of the phone's settings.
export const BUSINESS_TIME_ZONE = 'Asia/Manila'

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: BUSINESS_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** Calendar date in Manila as YYYY-MM-DD. */
export function businessDate(at: Date = new Date()): string {
  return dateFormatter.format(at)
}

/** "20261007" — used inside order references. */
export function compactDate(isoDate: string): string {
  return isoDate.replaceAll('-', '')
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso))
}

/** Whole minutes elapsed (never negative, even with a skewed clock). */
export function minutesSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000))
}

/** "just now", "5 min ago", "3 h ago", or a date. */
export function formatAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never'
  const minutes = minutesSince(iso, now)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`
  return formatDateTime(iso)
}
