import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Search, Loader2, AlertCircle, AlertTriangle, CheckCircle2, Clock, FileWarning } from 'lucide-react'
import { apiGet, money, inputCls } from './loaUtils'

function StatCard({ label, value, sub, color = 'text-[var(--color-text)]' }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className={cn('text-lg font-semibold', color)}>{value}</p>
      <p className="text-[11px] text-[var(--color-muted-fg)]">{label}</p>
      {sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{sub}</p>}
    </div>
  )
}

export function MissingDocsTab() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  async function doSearch() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      setData(await apiGet(`/loa/missing-documents?${params}`))
    } catch { notify.error('Search failed') } finally { setLoading(false) }
  }

  const initialSearchRef = useRef(doSearch)
  useEffect(() => {
    const timer = setTimeout(() => { void initialSearchRef.current() }, 0)
    return () => clearTimeout(timer)
  }, [])

  const severityColors = { high: 'bg-rose-100 text-rose-700 border-rose-200', medium: 'bg-amber-100 text-amber-700 border-amber-200', low: 'bg-slate-100 text-slate-600 border-slate-200' }
  const severityIcons = { high: AlertTriangle, medium: Clock, low: FileWarning }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Missing Document Report</h3>
        <p className="text-xs text-[var(--color-muted-fg)] mb-3">Identifies incomplete audit trails: unpaid invoices without OR, bills without PO references, unpaid bills without vouchers, and clients missing TIN.</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Date From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Date To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} /></div>
          <div className="flex items-end"><Button size="md" onClick={doSearch} disabled={loading}><Search size={14} /> Check</Button></div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>}
      {data && !loading && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Total Issues" value={data.total_issues} color="text-[var(--color-text)]" />
            <StatCard label="High Severity" value={data.high} color="text-rose-600" />
            <StatCard label="Medium Severity" value={data.medium} color="text-amber-600" />
            <StatCard label="Low Severity" value={data.low} color="text-slate-500" />
          </div>

          {data.issues?.length > 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[var(--color-surface-2)]"><tr className="border-b border-[var(--color-border)]">
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase">Severity</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase">Type</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase">Module</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase">Reference</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase">Party</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase text-right">Amount</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase">Description</th>
                </tr></thead>
                <tbody>{data.issues.map((issue, i) => {
                  const Icon = severityIcons[issue.severity] || AlertCircle
                  return (
                    <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                      <td className="px-4 py-2.5"><span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium border', severityColors[issue.severity])}><Icon size={10} />{issue.severity}</span></td>
                      <td className="px-4 py-2.5 text-[10px] font-medium text-[var(--color-text)]">{issue.type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{issue.module}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-[var(--color-text)]">{issue.reference}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text)]">{issue.party}</td>
                      <td className="px-4 py-2.5 text-xs text-right tabular-nums">{money(issue.amount)}</td>
                      <td className="px-4 py-2.5 text-[11px] text-[var(--color-muted-fg)] max-w-[250px] truncate">{issue.description}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-center">
              <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
              <p className="text-sm font-medium text-[var(--color-text)]">All clear!</p>
              <p className="text-xs text-[var(--color-muted-fg)]">No missing documents or incomplete trails detected.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
