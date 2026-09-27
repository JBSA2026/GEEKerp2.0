import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { Search, Loader2, Download } from 'lucide-react'
import { apiGet, money, fmtDate, inputCls, BASE_URL } from './loaUtils'

export function DocumentSearchTab() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [module, setModule] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [tin, setTin] = useState('')
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  async function doSearch() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      if (module !== 'all') params.set('module', module)
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (tin.trim()) params.set('tin', tin.trim())
      const data = await apiGet(`/loa/search?${params}`)
      setResults(data.results || [])
      setTotal(data.total || 0)
    } catch { notify.error('Search failed') } finally { setLoading(false) }
  }

  const initialSearchRef = useRef(doSearch)
  useEffect(() => {
    const timer = setTimeout(() => { void initialSearchRef.current() }, 0)
    return () => clearTimeout(timer)
  }, [])

  function handleExport() {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (module !== 'all') params.set('module', module)
    if (keyword.trim()) params.set('keyword', keyword.trim())
    if (tin.trim()) params.set('tin', tin.trim())
    window.open(`${BASE_URL}/loa/export?${params}`, '_blank')
  }

  const MODULES = [{v:'all',l:'All'},{v:'ar',l:'AR Invoices'},{v:'ap',l:'AP Bills'},{v:'clients',l:'Clients'},{v:'suppliers',l:'Suppliers'},{v:'audit',l:'Audit Trail'}]

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Cross-Module Document Search</h3>
        <div className="grid grid-cols-6 gap-3">
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Module</label><select value={module} onChange={e => setModule(e.target.value)} className={inputCls}>{MODULES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}</select></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Keyword</label><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Name, #, ID..." className={inputCls} /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">TIN</label><input value={tin} onChange={e => setTin(e.target.value)} placeholder="TIN..." className={inputCls} /></div>
          <div className="flex items-end gap-1">
            <Button size="md" onClick={doSearch} disabled={loading}><Search size={14} /></Button>
            {results.length > 0 && <Button size="md" variant="outline" onClick={handleExport}><Download size={14} /></Button>}
          </div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>}
      {!loading && results.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <span className="text-xs font-semibold text-[var(--color-text)]">{total} record(s) found</span>
          </div>
          <div className="max-h-[450px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[var(--color-surface)] z-10"><tr className="border-b border-[var(--color-border)]">
                <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">Module</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">Type</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">Ref</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">Date</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">Party</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">TIN</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)] text-right">Amount</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">Description</th>
              </tr></thead>
              <tbody>{results.map((r, i) => (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="px-3 py-2 text-[10px] font-medium text-[var(--color-muted-fg)]">{r.module}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">{r.type}</td>
                  <td className="px-3 py-2 text-xs font-mono text-[var(--color-text)]">{r.reference}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text)] max-w-[120px] truncate">{r.party}</td>
                  <td className="px-3 py-2 text-xs font-mono text-[var(--color-muted-fg)]">{r.tin}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{money(r.amount)}</td>
                  <td className="px-3 py-2 text-[11px] text-[var(--color-muted-fg)] max-w-[180px] truncate">{r.description}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {!loading && results.length === 0 && total === 0 && <p className="text-sm text-[var(--color-muted-fg)] text-center py-8">Enter search criteria and click Search.</p>}
    </div>
  )
}
