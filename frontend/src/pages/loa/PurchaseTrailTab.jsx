import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Search, Loader2, CheckCircle2, Clock } from 'lucide-react'
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

function PurchaseTrailCard({ trail }) {
  const bill = trail.bill
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">{bill.bill_number}</p>
          <p className="text-xs text-[var(--color-muted-fg)]">{bill.supplier_name} · TIN: {bill.supplier_tin}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[var(--color-text)]">{money(bill.gross_amount)}</p>
          <p className="text-[11px] text-[var(--color-muted-fg)]">{fmtDate(bill.bill_date)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">VAT Input: {money(bill.vat_input)}</span>
        {Number(bill.ewt_material) > 0 && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">EWT (1%): {money(bill.ewt_material)}</span>}
        <span className="px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-muted-fg)]">Net Payable: {money(bill.net_payable)}</span>
        {trail.linked_po && <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">PO: {trail.linked_po}</span>}
        {trail.supplier_invoice && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">Supplier Inv: {trail.supplier_invoice}</span>}
      </div>
      {trail.vouchers.length > 0 ? (
        <div className="mt-2 border-t border-[var(--color-border)] pt-2">
          <p className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase mb-1">Payment Vouchers</p>
          {trail.vouchers.map((v, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
              <CheckCircle2 size={12} className="text-emerald-500" />
              <span className="font-mono text-[var(--color-text)]">{v.voucher_number || `PV #${v.voucher_id}`}</span>
              <span className="text-[var(--color-muted-fg)]">{v.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 border-t border-[var(--color-border)] pt-2 flex items-center gap-1 text-[10px] text-amber-600">
          <Clock size={11} /> No payment voucher processed yet
        </div>
      )}
    </div>
  )
}

export function PurchaseTrailTab() {
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
      setData(await apiGet(`/loa/purchase-trail?${params}`))
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
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Purchase Transaction Trail</h3>
        <p className="text-xs text-[var(--color-muted-fg)] mb-3">Trace the full purchase lifecycle: PO → Supplier Bill → Payment Voucher. Shows linked references and EWT details.</p>
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Date From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Date To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Search (Supplier, PO #, Bill #)</label><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Supplier name, PO#, bill#..." className={inputCls} /></div>
          <div className="flex items-end"><Button size="md" onClick={doSearch} disabled={loading}><Search size={14} /> Search</Button></div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>}
      {data && !loading && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Bills" value={data.trail_count} color="text-purple-600" />
            <StatCard label="Total Billed" value={money(data.total_billed)} color="text-[var(--color-text)]" />
            <StatCard label="VAT Input" value={money(data.total_vat_input)} color="text-purple-600" />
            <StatCard label="EWT Withheld" value={money(data.total_ewt)} color="text-amber-600" />
          </div>
          {data.trails?.map((trail, i) => <PurchaseTrailCard key={i} trail={trail} />)}
          {data.trails?.length === 0 && <p className="text-sm text-[var(--color-muted-fg)] text-center py-8">No purchase transactions found for this period.</p>}
        </>
      )}
    </div>
  )
}
