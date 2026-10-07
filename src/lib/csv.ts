// Minimal CSV export (RFC 4180 quoting) — opens cleanly in Excel / Google Sheets.

export type CsvValue = string | number | null | undefined

function cell(v: CsvValue): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // Neutralise spreadsheet formula injection from product names.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** Pesos as a plain decimal for spreadsheets: 2550 → "25.50". */
export function csvPesos(centavos: number): string {
  const sign = centavos < 0 ? '-' : ''
  const abs = Math.abs(centavos)
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel reads the ₱ sign and Filipino names as UTF-8.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
