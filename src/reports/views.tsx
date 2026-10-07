import { AlertTriangle, Award, Coins, TrendingUp } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { EmptyState, Notice, Spinner } from '../components/Feedback'
import { isLowStock } from '../data/stock'
import { MOVEMENT_LABEL } from '../inventory/stockLogic'
import { formatPeso } from '../lib/money'
import { errorMessage } from '../lib/supabase'
import { businessDate, formatDateTime } from '../lib/time'
import type { InventoryMovement, Product } from '../lib/types'
import { useOnline } from '../lib/useOnline'
import { fetchPeriodMovements } from './data'
import type { ProductLine, SalesSummary, StockLine } from './summary'

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className={`rounded-2xl p-4 ${tone === 'good' ? 'bg-green-700 text-white' : tone === 'warn' ? 'bg-amber-400 text-black' : 'bg-white'}`}>
      <p className={`text-xs font-extrabold uppercase tracking-wide ${tone ? '' : 'text-stone-500'}`}>{label}</p>
      <p className="text-3xl font-black tabular-nums leading-tight">{value}</p>
      {sub && <p className={`text-sm font-semibold ${tone ? '' : 'text-stone-500'}`}>{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-sm font-extrabold uppercase tracking-wide text-stone-600">{title}</h3>
      {children}
    </section>
  )
}

function pct(m: number | null): string {
  return m === null ? '—' : `${m.toFixed(1)}%`
}

function NoSales() {
  return <EmptyState icon={Coins} title="No sales in this period" />
}

export function SalesView({ summary: s }: { summary: SalesSummary }) {
  if (s.orders === 0 && s.cancelledOrders === 0) return <NoSales />
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <Tile label="Total sales" value={formatPeso(s.sales)} tone="good" />
        </div>
        <Tile label="Orders" value={String(s.orders)} />
        <Tile label="Items sold" value={String(s.itemsSold)} sub="pieces" />
        <Tile label="Average order" value={formatPeso(s.averageOrder)} />
        <Tile
          label="Cash / GCash"
          value={`${s.byPayment.cash.orders} / ${s.byPayment.gcash.orders}`}
          sub={`${formatPeso(s.byPayment.cash.sales)} / ${formatPeso(s.byPayment.gcash.sales)}`}
        />
        {s.pendingChange.orders > 0 && (
          <div className="col-span-2">
            <Tile
              label="Change still owed to customers"
              value={formatPeso(s.pendingChange.amount)}
              sub={`${s.pendingChange.orders} order${s.pendingChange.orders === 1 ? '' : 's'}`}
              tone="warn"
            />
          </div>
        )}
      </div>
      {s.cancelledOrders > 0 && (
        <p className="px-1 text-sm font-semibold text-stone-500">
          {s.cancelledOrders} cancelled order{s.cancelledOrders === 1 ? '' : 's'} ({formatPeso(s.cancelledValue)}) not included.
        </p>
      )}

      <TopSellers summary={s} />

      <Section title="By product">
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white">
          {s.products.map((l) => (
            <li key={l.product_id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold uppercase">{l.name}</span>
                <span className="text-sm font-semibold text-stone-500">{l.quantity} sold</span>
              </span>
              <span className="text-xl font-black tabular-nums">{formatPeso(l.sales)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function TopSellers({ summary: s }: { summary: SalesSummary }) {
  const rows: { label: string; icon: typeof Award; line: ProductLine | null; value: (l: ProductLine) => string }[] = [
    { label: 'Top selling', icon: Award, line: s.top.bySold, value: (l) => `${l.quantity} pcs` },
    { label: 'Most revenue', icon: Coins, line: s.top.byRevenue, value: (l) => formatPeso(l.sales) },
    { label: 'Highest est. gross profit', icon: TrendingUp, line: s.top.byProfit, value: (l) => formatPeso(l.profit) },
  ]
  return (
    <Section title="Top sellers">
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white">
        {rows.map(({ label, icon: Icon, line, value }) => (
          <li key={label} className="flex items-center gap-3 px-4 py-3">
            <Icon className="size-6 shrink-0 text-ember-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold uppercase text-stone-500">{label}</span>
              <span className="block truncate text-lg font-bold uppercase">{line?.name ?? '—'}</span>
            </span>
            <span className="text-lg font-black tabular-nums">{line ? value(line) : ''}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function ProfitView({ summary: s }: { summary: SalesSummary }) {
  if (s.orders === 0) return <NoSales />
  const missing = s.products.filter((l) => l.missingCost)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Sales" value={formatPeso(s.sales)} />
        <Tile label="Cost of products sold" value={formatPeso(s.cost)} />
        <div className="col-span-2">
          <Tile label="Estimated gross profit" value={formatPeso(s.profit)} sub={`Gross margin ${pct(s.margin)}`} tone="good" />
        </div>
      </div>
      <p className="px-1 text-sm text-stone-500">
        Estimated: sales minus the unit cost of each piece sold. Not net profit — rent, charcoal, labor, gas, transport and
        other expenses are not included.
      </p>
      {missing.length > 0 && (
        <Notice tone="warning">
          <span className="flex items-center gap-1">
            <AlertTriangle className="size-4" /> No unit cost set for: {missing.map((l) => l.name).join(', ')}.
          </span>
          Profit is overstated for these. Set costs in Menu → Products (applies to new sales).
        </Notice>
      )}

      <Section title="By product">
        <ul className="space-y-2">
          {s.products.map((l) => (
            <li key={l.product_id} className="rounded-2xl bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-lg font-extrabold uppercase">
                  {l.name}
                  {l.missingCost && <span className="ml-2 rounded bg-amber-400 px-1.5 py-0.5 text-xs text-black">NO COST</span>}
                </span>
                <span className="text-sm font-bold text-stone-500">{l.quantity} sold</span>
              </div>
              <dl className="mt-2 grid grid-cols-4 gap-2 text-sm">
                <Fig label="Sales" value={formatPeso(l.sales)} />
                <Fig label="Cost" value={formatPeso(l.cost)} />
                <Fig label="Est. GP" value={formatPeso(l.profit)} strong negative={l.profit < 0} />
                <Fig label="Margin" value={pct(l.margin)} />
              </dl>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function Fig({ label, value, strong, negative }: { label: string; value: string; strong?: boolean; negative?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase text-stone-500">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-black' : 'font-bold'} ${negative ? 'text-red-600' : ''}`}>{value}</dd>
    </div>
  )
}

const MOVEMENT_DAYS = 14

export function StockView({
  stock,
  products,
}: {
  stock: { lines: StockLine[]; total: number; pieces: number }
  products: readonly Product[]
}) {
  const active = products.filter((p) => p.is_active)
  const low = active.filter((p) => isLowStock(p) || p.stock_quantity < 0)
  const soldOut = active.filter((p) => p.is_sold_out)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <Tile label="Total inventory value (at cost)" value={formatPeso(stock.total)} sub={`${stock.pieces} pieces on hand`} tone="good" />
        </div>
        <Tile label="Low stock" value={String(low.length)} tone={low.length ? 'warn' : undefined} />
        <Tile label="Sold out" value={String(soldOut.length)} />
      </div>

      {low.length > 0 && (
        <Section title="Low stock">
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white">
            {low.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-lg font-bold uppercase">{p.name}</span>
                <span className={`text-xl font-black tabular-nums ${p.stock_quantity <= 0 ? 'text-red-600' : 'text-amber-700'}`}>
                  {p.stock_quantity} pcs
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Current stock & value">
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white">
          {stock.lines.map((l) => (
            <li key={l.product_id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold uppercase">{l.name}</span>
                <span className="text-sm font-semibold text-stone-500 tabular-nums">
                  {l.stock} × {formatPeso(l.unitCost)}
                </span>
              </span>
              <span className="text-xl font-black tabular-nums">{formatPeso(l.value)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <RecentMovements products={products} />
    </div>
  )
}

function RecentMovements({ products }: { products: readonly Product[] }) {
  const online = useOnline()
  const [rows, setRows] = useState<InventoryMovement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const names = new Map(products.map((p) => [p.id, p.name]))

  useEffect(() => {
    if (!online) return
    let active = true
    const today = businessDate()
    const from = businessDate(new Date(Date.now() - (MOVEMENT_DAYS - 1) * 24 * 60 * 60_000))
    fetchPeriodMovements({ from, to: today })
      .then((r) => active && setRows(r))
      .catch((err: unknown) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [online])

  return (
    <Section title={`Stock movements · last ${MOVEMENT_DAYS} days (excluding sales)`}>
      {!online ? (
        <Notice tone="info">Connect to the internet to see stock movements.</Notice>
      ) : error ? (
        <Notice>{error}</Notice>
      ) : !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-stone-500">No stock in, adjustments or cancellations.</p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold uppercase">{names.get(m.product_id) ?? 'Unknown product'}</span>
                <span className="block truncate text-sm text-stone-500">
                  {MOVEMENT_LABEL[m.movement_type]} · {formatDateTime(m.created_at)}
                  {m.reason ? ` · ${m.reason}` : ''}
                </span>
              </span>
              <span className={`text-xl font-black tabular-nums ${m.quantity_change < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {m.quantity_change > 0 ? '+' : ''}
                {m.quantity_change}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
