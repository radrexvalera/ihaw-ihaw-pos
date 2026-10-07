import { Download, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Notice, Spinner } from '../components/Feedback'
import { csvPesos, downloadCsv, toCsv } from '../lib/csv'
import { errorMessage } from '../lib/supabase'
import { businessDate } from '../lib/time'
import { useOnline } from '../lib/useOnline'
import { useProducts } from '../data/useProducts'
import { fetchReportOrders, type ReportOrders } from './data'
import { formatPeriod, normalizeRange, periodRange, type Period, type PeriodKind } from './period'
import { ProfitView, SalesView, StockView } from './views'
import { inventoryValue, summarize } from './summary'

type View = 'sales' | 'profit' | 'stock'

const PERIODS: { id: PeriodKind; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
]

const VIEWS: { id: View; label: string }[] = [
  { id: 'sales', label: 'Sales' },
  { id: 'profit', label: 'Profit' },
  { id: 'stock', label: 'Stock' },
]

type Load = { status: 'loading' } | { status: 'ready'; data: ReportOrders } | { status: 'error'; error: string }

export function ReportsScreen() {
  const online = useOnline()
  const today = businessDate()
  const [kind, setKind] = useState<PeriodKind>('today')
  const [custom, setCustom] = useState<Period>({ from: today, to: today })
  const [view, setView] = useState<View>('sales')
  const [version, setVersion] = useState(0)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const products = useProducts()

  const period = useMemo(
    () => (kind === 'custom' ? normalizeRange(custom.from, custom.to) : periodRange(kind, today)),
    [kind, custom, today],
  )

  useEffect(() => {
    let active = true
    fetchReportOrders(period)
      .then((data) => active && setLoad({ status: 'ready', data }))
      .catch((err: unknown) => active && setLoad({ status: 'error', error: errorMessage(err) }))
    return () => {
      active = false
    }
  }, [period, online, version])

  const summary = useMemo(() => (load.status === 'ready' ? summarize(load.data.orders) : null), [load])
  const stock = useMemo(() => (products ? inventoryValue(products.filter((p) => p.is_active)) : null), [products])
  const range = `${period.from}_${period.to}`

  function exportCsv() {
    if (view === 'stock' && stock) {
      downloadCsv(
        `ihaw-inventory-${today}.csv`,
        toCsv(
          ['Product', 'Stock (pcs)', 'Unit cost (PHP)', 'Value at cost (PHP)'],
          stock.lines.map((l) => [l.name, l.stock, csvPesos(l.unitCost), csvPesos(l.value)]),
        ),
      )
    } else if (summary && view === 'sales') {
      downloadCsv(
        `ihaw-sales-${range}.csv`,
        toCsv(
          ['Product', 'Qty sold', 'Sales (PHP)'],
          summary.products.map((l) => [l.name, l.quantity, csvPesos(l.sales)]),
        ),
      )
    } else if (summary) {
      downloadCsv(
        `ihaw-gross-profit-${range}.csv`,
        toCsv(
          ['Product', 'Qty sold', 'Sales (PHP)', 'Cost of products sold (PHP)', 'Estimated gross profit (PHP)', 'Margin %'],
          summary.products.map((l) => [l.name, l.quantity, csvPesos(l.sales), csvPesos(l.cost), csvPesos(l.profit), l.margin]),
        ),
      )
    }
  }

  const canExport = view === 'stock' ? Boolean(stock) : Boolean(summary)

  return (
    <div className="pb-6">
      <div className="space-y-2 border-b border-stone-200 bg-white p-2">
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Report">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`min-h-12 rounded-xl text-base font-extrabold uppercase ${view === v.id ? 'bg-char text-white' : 'bg-stone-100 text-stone-600'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view !== 'stock' && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={kind === p.id}
                onClick={() => {
                  setKind(p.id)
                  setLoad({ status: 'loading' })
                }}
                className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-extrabold uppercase ${
                  kind === p.id ? 'border-ember-600 bg-ember-600 text-white' : 'border-stone-300 bg-white text-stone-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {view !== 'stock' && kind === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            {(['from', 'to'] as const).map((k) => (
              <label key={k} className="block">
                <span className="text-xs font-extrabold uppercase text-stone-500">{k}</span>
                <input
                  type="date"
                  value={custom[k]}
                  max={today}
                  onChange={(e) => {
                    if (!e.target.value) return
                    setCustom((c) => ({ ...c, [k]: e.target.value }))
                    setLoad({ status: 'loading' })
                  }}
                  className="min-h-12 w-full rounded-xl border-2 border-stone-300 bg-white px-2 text-base font-bold"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto max-w-3xl space-y-4 p-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-lg font-extrabold">{view === 'stock' ? 'Right now' : formatPeriod(period)}</p>
          <button
            onClick={() => {
              setLoad({ status: 'loading' })
              setVersion((v) => v + 1)
            }}
            aria-label="Refresh report"
            className="flex size-12 items-center justify-center rounded-xl border-2 border-stone-300 bg-white active:bg-stone-100"
          >
            <RefreshCw className="size-6" />
          </button>
          <button
            onClick={exportCsv}
            disabled={!canExport}
            className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-stone-300 bg-white px-3 font-extrabold uppercase active:bg-stone-100 disabled:opacity-40"
          >
            <Download className="size-5" /> CSV
          </button>
        </div>

        {view !== 'stock' && load.status === 'ready' && load.data.source === 'local' && (
          <Notice tone="warning">Offline — showing only orders stored on this phone. Connect for the full report.</Notice>
        )}

        {view === 'stock' ? (
          stock ? <StockView stock={stock} products={products ?? []} /> : <Spinner />
        ) : load.status === 'loading' ? (
          <Spinner />
        ) : load.status === 'error' ? (
          <Notice>{load.error}</Notice>
        ) : summary && view === 'sales' ? (
          <SalesView summary={summary} />
        ) : summary ? (
          <ProfitView summary={summary} />
        ) : null}
      </div>
    </div>
  )
}
