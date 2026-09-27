import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Loader2, Download, Search } from 'lucide-react'
import { inputCls, apiGet, apiDownload, formatCurrency, SourceLink } from './glUtils'

export function GLGeneralLedger() {
  const { entity } = useOutletContext()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    apiGet('/general-ledger/accounts').then(res => {
      setAccounts(Array.isArray(res) ? res : res.accounts || [])
    }).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (entity !== 'All') params.set('entity', entity)
      if (selectedAccount) params.set('account_id', selectedAccount)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      const res = await apiGet(`/general-ledger/reports/ledger?${params}`)
      setData(res?.rows || [])
    } catch (e) { notify.error(e.message) }
    finally { setLoading(false) }
  }, [entity, selectedAccount, dateFrom, dateTo])

  useEffect(() => { void fetchData() }, [fetchData])

  const filteredData = search.trim()
    ? data.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(search.toLowerCase())))
    : data

  const totals = filteredData.reduce((acc, r) => ({
    debit: acc.debit + (parseFloat(r.debit) || 0),
    credit: acc.credit + (parseFloat(r.credit) || 0),
  }), { debit: 0, credit: 0 })

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-muted-fg)]">
        BIR General Ledger — Summarizes all posted transactions by account with running balances. Select an account or view all.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className={cn(inputCls, 'w-52 pl-8')} />
        </div>
        <select className={cn(inputCls, 'w-56')} value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          <option value="">All Accounts</option>
          {accounts.map(a => <option key={a.account_id} value={a.account_id}>{a.account_code} - {a.account_name}</option>)}
        </select>
        <input type="date" className={cn(inputCls, 'w-36')} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className={cn(inputCls, 'w-36')} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => { const params = new URLSearchParams(); if (entity !== 'All') params.set('entity', entity); if (selectedAccount) params.set('account_id', selectedAccount); if (dateFrom) params.set('date_from', dateFrom); if (dateTo) params.set('date_to', dateTo); apiDownload(`/general-ledger/books/general-ledger/export/csv?${params}`, `general_ledger_book.xlsx`) }}><Download size={14} /> Export</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--color-primary)]" size={28} /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr>
                {['Date', 'Reference / Journal', 'Account Code', 'Account Title', 'Description', 'Debit', 'Credit', 'Balance', 'Related Party', 'Posting Status', 'Remarks'].map(h => (
                  <th key={h} className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide px-3 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredData.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-sm text-[var(--color-muted-fg)]">{selectedAccount ? 'No posted entries' : 'Select an account or view all posted entries'}</td></tr>
              ) : filteredData.map((r, i) => (
                <tr key={i} className="hover:bg-[var(--color-surface)] transition-colors">
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">{r.entry_date}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    <SourceLink sourceModule={r.reference_module || 'General Journal'} sourceId={r.entry_id} refNumber={r.entry_number}>{r.entry_number || '—'}</SourceLink>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{r.account_code || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{r.account_name || '—'}</td>
                  <td className="px-3 py-2.5 max-w-[180px] truncate text-xs">{r.description || '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{r.debit ? formatCurrency(r.debit) : ''}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{r.credit ? formatCurrency(r.credit) : ''}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right font-medium">{formatCurrency(r.running_balance)}</td>
                  <td className="px-3 py-2.5 text-xs">{r.related_party || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Posted</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{r.remarks || '—'}</td>
                </tr>
              ))}
              {filteredData.length > 0 && (
                <tr className="bg-[var(--color-surface-2)] font-semibold">
                  <td className="px-3 py-2.5" colSpan={5}>Totals</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totals.debit)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totals.credit)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totals.debit - totals.credit)}</td>
                  <td className="px-3 py-2.5" colSpan={3}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
