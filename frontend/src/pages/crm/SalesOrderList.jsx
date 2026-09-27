import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Loader2, Search, ShoppingCart } from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL

function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const SO_STATUSES = ['All', 'RESERVED', 'IN_PRODUCTION', 'DELIVERED']

function statusLabel(s) {
  return (s || '').replace(/_/g, ' ')
}

function money(v) {
  return Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Component ───────────────────────────────────────────────────────────────
export function SalesOrderList() {
  const navigate = useNavigate()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const url = new URL(`${BASE}/sales-orders/`)
      if (search.trim()) url.searchParams.set('search', search)
      if (statusFilter !== 'All') url.searchParams.set('status', statusFilter)
      const res = await fetch(url, { headers: authHeaders() })
      if (res.ok) setOrders(await res.json())
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    const timer = setTimeout(() => { void loadOrders() }, 0)
    return () => clearTimeout(timer)
  }, [loadOrders])

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <CardHeader className="!flex !flex-row !flex-wrap !items-center gap-3 border-b border-[var(--color-border)] !px-5 !py-3">
          <ShoppingCart size={16} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-bold text-[var(--color-text)] whitespace-nowrap">Sales Orders</h2>

          {/* Status filter */}
          <div className="flex items-center gap-1 ml-3">
            {SO_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  statusFilter === s
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:bg-[var(--color-border)]'
                }`}
              >
                {s === 'All' ? 'All' : statusLabel(s)}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-1.5 text-xs placeholder:text-[var(--color-muted)] outline-none focus:border-[var(--color-primary)] w-52"
              placeholder="Search SO#, quotation, project..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadOrders()}
            />
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
          <div className="h-full overflow-auto">
            <div className="min-w-full">
              {/* Table Header */}
              <div
                className="grid w-full items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-2.5"
                style={{ gridTemplateColumns: '14% 16% 18% 12% 12% 14% 14%' }}
              >
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-fg)]">SO #</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-fg)]">Quotation</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-fg)]">Client</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-fg)]">Status</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-fg)]">Type</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-fg)] text-right">Grand Total</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-fg)]">Order Date</span>
              </div>

              {/* Rows */}
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-muted-fg)]">
                  <Loader2 size={16} className="animate-spin" /> Loading...
                </div>
              ) : orders.length === 0 ? (
                <div className="py-16 text-center text-sm text-[var(--color-muted-fg)]">No sales orders found</div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {orders.map(so => (
                    <div
                      key={so.sales_order_id}
                      className="grid w-full items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-surface-2)] cursor-pointer"
                      style={{ gridTemplateColumns: '14% 16% 18% 12% 12% 14% 14%' }}
                      onClick={() => navigate(`/crm/sales-orders/${so.sales_order_id}`)}
                    >
                      <span className="truncate text-sm font-semibold text-[var(--color-text)] font-mono">{so.so_number}</span>
                      <span className="truncate text-xs text-[var(--color-muted-fg)] font-mono">{so.quotation_no || '—'}</span>
                      <span className="truncate text-sm text-[var(--color-text)]">{so.client_list?.company_name || '—'}</span>
                      <span><StatusBadge status={so.status} /></span>
                      <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                        so.order_type === 'MTO' ? 'bg-blue-50 text-blue-700' :
                        so.order_type === 'MIXED' ? 'bg-violet-50 text-violet-700' :
                        'bg-slate-50 text-slate-600'
                      }`}>
                        {so.order_type || 'DIRECT'}
                      </span>
                      <span className="truncate text-sm font-medium text-[var(--color-text)] text-right">₱{money(so.grand_total)}</span>
                      <span className="truncate text-xs text-[var(--color-muted-fg)]">
                        {so.order_date ? new Date(so.order_date).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

export default SalesOrderList
