import { History } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { EmptyState, Notice, Spinner } from '../../components/Feedback'
import { Sheet } from '../../components/Sheet'
import { listProfiles } from '../../data/admin'
import { useProducts } from '../../data/useProducts'
import { errorMessage, supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/time'
import { useOnline } from '../../lib/useOnline'
import { CATEGORY_ACTIONS, describeAudit, type AuditCategory, type AuditRow } from './auditFormat'

const PAGE = 50

const CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'prices', label: 'Prices' },
  { id: 'stock', label: 'Stock' },
  { id: 'orders', label: 'Orders' },
  { id: 'users', label: 'Users' },
]

async function fetchAudit(category: AuditCategory, offset: number): Promise<AuditRow[]> {
  let q = supabase
    .from('audit_logs')
    .select('id,user_id,action,entity,entity_id,details,created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + PAGE - 1)
  if (category !== 'all') q = q.in('action', CATEGORY_ACTIONS[category])
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AuditRow[]
}

/** Owner's record of sensitive changes: prices, costs, stock, cancellations, change given, user access. */
export function AuditLogPage({ onBack }: { onBack: () => void }) {
  const online = useOnline()
  const products = useProducts()
  const [category, setCategory] = useState<AuditCategory>('all')
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [people, setPeople] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!online) return
    let active = true
    Promise.all([fetchAudit(category, 0), listProfiles()])
      .then(([first, profiles]) => {
        if (!active) return
        setRows(first)
        setHasMore(first.length === PAGE)
        setPeople(new Map(profiles.map((p) => [p.id, p.display_name || 'Unnamed'])))
        setError(null)
      })
      .catch((err: unknown) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [online, category])

  async function loadMore() {
    if (!rows) return
    setLoadingMore(true)
    try {
      const next = await fetchAudit(category, rows.length)
      setRows([...rows, ...next])
      setHasMore(next.length === PAGE)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const productName = (id: string) => products?.find((p) => p.id === id)?.name

  return (
    <Sheet title="Audit log" closeStyle="back" onClose={onBack}>
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={category === c.id}
              onClick={() => {
                setCategory(c.id)
                setRows(null)
              }}
              className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-extrabold uppercase ${
                category === c.id ? 'border-ember-600 bg-ember-600 text-white' : 'border-stone-300 bg-white text-stone-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {!online && <Notice tone="warning">Offline — the audit log needs internet.</Notice>}
        {error && <Notice>{error}</Notice>}
        {online && !rows && !error && <Spinner />}
        {rows?.length === 0 && <EmptyState icon={History} title="Nothing recorded yet" />}

        {rows && rows.length > 0 && (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white">
            {rows.map((r) => {
              const { title, detail } = describeAudit(r, productName)
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-extrabold">{title}</p>
                    <p className="shrink-0 text-xs font-semibold text-stone-500">{formatDateTime(r.created_at)}</p>
                  </div>
                  {detail && <p className="text-stone-700">{detail}</p>}
                  <p className="text-sm text-stone-500">by {r.user_id ? (people.get(r.user_id) ?? 'Unknown user') : 'System'}</p>
                </li>
              )
            })}
          </ul>
        )}

        {hasMore && (
          <Button variant="secondary" block disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
