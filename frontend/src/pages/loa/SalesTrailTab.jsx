import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Search, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { apiGet, money, fmtDate, inputCls } from './loaUtils'

function StatCard({ label, value, sub, color = 'text-[var(--color-text)]' }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className={cn('text-lg font-semibold', color)}>{value}</p>
      <p className="text-[11px] text-[var(--color-muted-fg)]">{label}</p>
      {sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{sub}</p>}
    </div>
  )
}

function SalesTrailCard({ trail }) {
  const inv = trail.invoice
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">{inv.invoice_number}</p>
          <p className="text-xs text-[var(--color-muted-fg)]">{inv.customer_name} · TIN: {inv.customer_tin}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[var(--color-text)]">{money(inv.gross_amount)}</p>
          <p className="text-[11px] text-[var(--color-muted-fg)]">{fmtDate(inv.invoice_date)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[10px] mb-2">
        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">VAT: {money(inv.vat_output)}</span>
        {Number(inv.wht_amount) > 0 && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">WHT: {money(inv.wht_amount)}</span>}
        <span className="px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-muted-fg)]">Net: {money(inv.net_collectible)}</span>
        {trail.linked_quotation && <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">QTN: {trail.linked_quotation}</span>}
        {trail.linked_project && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">PRJ: {trail.linked_project}</span>}
      </div>
      {trail.collections.length > 0 ? (
        <div className="mt-2 border-t border-[var(--color-border)] pt-2">
          <p className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase mb-1">Collections / OR</p>
          {trail.collections.map((col, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
              <CheckCircle2 size={12} className="text-emerald-500" />
              <span className="text-[var(--color-text)]">{money(col.amount)}</span>
              <span className="text-[var(--color-muted-fg)]">{fmtDate(col.collection_date)}</span>
              {col.or_number && <span className="font-mono text-[var(--color-muted-fg)]">OR: {col.or_number}</span>}
            </div>
          ))}
          {trail.balance > 0 && <p className="text-[10px] text-rose-600 mt-1">Balance remaining: {money(trail.balance)}</p>}
        </div>
      ) : (
        <div className="mt-2 border-t border-[var(--color-border)] pt-2 flex items-center gap-1 text-[10px] text-rose-600">
          <AlertTriangle size={11} /> No collection/OR recorded
        </div>
      )}
    </div>
  )
}

export function SalesTrailTab() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [keyword, setKeyword] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  async function doSearch() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      if (keyword.trim()) params.set('keyword', keyword.trim())
      setData(await apiGet(`/loa/sales-trail?${params}`))
    } catch { notify.error('Search failed') } finally { setLoading(false) }
  }

  const initialSearchRef = useRef(doSearch)
  useEffect(() => {
    const timer = setTimeout(() => { void initialSearchRef.current() }, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Sales Transaction Trail</h3>
        <p className="text-xs text-[var(--color-muted-fg)] mb-3">Trace the full sales lifecycle: Quotation → Invoice → Collection/OR. Shows connected references and outstanding balances.</p>
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Date From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Date To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Search (Customer, Invoice #)</label><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Customer name, invoice #..." className={inputCls} /></div>
          <div className="flex items-end"><Button size="md" onClick={doSearch} disabled={loading}><Search size={14} /> Search</Button></div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>}
      {data && !loading && (
        <>
          <div className="grid grid-cols-5 gap-3">
            <StatCard label="Invoices" value={data.trail_count} color="text-blue-600" />
            <StatCard label="Total Invoiced" value={money(data.total_invoiced)} color="text-[var(--color-text)]" />
            <StatCard label="Collected" value={money(data.total_collected)} color="text-emerald-600" />
            <StatCard label="Outstanding" value={money(data.total_outstanding)} color="text-rose-600" />
            <StatCard label="VAT Output" value={money(data.total_vat_output)} color="text-blue-600" />
          </div>
          {data.trails?.map((trail, i) => <SalesTrailCard key={i} trail={trail} />)}
          {data.trails?.length === 0 && <p className="text-sm text-[var(--color-muted-fg)] text-center py-8">No sales transactions found for this period.</p>}
        </>
      )}
    </div>
  )
}
