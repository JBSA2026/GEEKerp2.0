// ─── PurchaseRequestsList — /purchasing/requests route component ─────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form'
import { AlertCircle, Eye, Loader2, Plus, Search, ShoppingBag, X } from 'lucide-react'
import { HeaderViewDropdown } from './HeaderViewDropdown'
import { useHighlightRow, highlightRowCls } from '@/hooks/useHighlightRow'
import {
  api, BASE, money, formatDate, statusLabel, entityFromDocumentNumber,
  COMPANY_OPTIONS, RECENT_REQUEST_GRID, REQUEST_STATUS_FILTERS, ToolbarDropdown
} from './purchasingUtils'

export function PurchaseRequestsList() {
  useOutletContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Read highlight from query params for cross-module navigation
  const highlight = searchParams.get('highlight') || ''

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState(highlight || '')
  const [statusFilter, setStatusFilter] = useState('All')
  const [companyFilter, setCompanyFilter] = useState('All')

  // Highlight hook — waits until data is loaded
  const { highlightId, highlightRef, rowRef } = useHighlightRow(!loading && requests.length > 0)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = new URL(`${BASE}/purchasing/requests`)
      if (search.trim()) url.searchParams.set('search', search.trim())
      if (statusFilter !== 'All') url.searchParams.set('status', statusFilter)
      setRequests(await api(url.pathname + url.search))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  // Load on mount and when filters change
  useEffect(() => {
    const timer = setTimeout(loadRequests, 0)
    return () => clearTimeout(timer)
  }, [loadRequests])

  const requestRows = useMemo(() => {
    return requests
      .filter(row => companyFilter === 'All' || (row.entity || entityFromDocumentNumber(row.pr_number)) === companyFilter)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  }, [requests, companyFilter])

  function handleViewChange(view) {
    if (view === 'orders') navigate('../orders')
    else if (view === 'suppliers') navigate('../suppliers')
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden px-6 py-5">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 overflow-x-auto">
            <HeaderViewDropdown value="requests" onChange={handleViewChange} />
            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button size="sm" className="shrink-0" onClick={() => navigate('new')}><Plus size={14} /> New PR</Button>
              <ToolbarDropdown
                value={statusFilter}
                onChange={setStatusFilter}
                options={REQUEST_STATUS_FILTERS}
                labelFn={s => s === 'All' ? 'All Status' : statusLabel(s)}
                width="w-[160px]"
              />
              <ToolbarDropdown
                value={companyFilter}
                onChange={setCompanyFilter}
                options={['All', ...COMPANY_OPTIONS]}
                labelFn={company => company === 'All' ? 'All Companies' : company}
                width="w-[160px]"
              />
              <div className="relative w-[240px] shrink-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" placeholder="Search PR number or remarks..." value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && loadRequests()} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {loading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 py-16 text-sm text-slate-600">
              <Loader2 size={16} className="animate-spin" /> Loading purchasing records...
            </div>
          ) : requestRows.length === 0 ? (
            <EmptyState title="No purchasing records found" icon={ShoppingBag} />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className={`grid ${RECENT_REQUEST_GRID} w-full min-w-0 gap-0 border-y border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
                <span>PR Number</span><span>Status</span><span className="text-right">Date Created</span><span className="text-right">PR Total</span><span className="text-right">Required</span>
              </div>
              <div className="divide-y divide-[#e3ecf8]">
                {requestRows.map(row => {
                  const isHighlighted = (highlightRef || highlightId) && row.pr_number === (highlightRef || highlightId)
                  return (
                  <div key={row.purchase_request_id} ref={isHighlighted ? rowRef : undefined} className={`grid ${RECENT_REQUEST_GRID} w-full min-w-0 cursor-pointer items-center gap-0 px-5 py-3 hover:bg-[#edf4fb] ${isHighlighted ? highlightRowCls : ''}`} onClick={() => navigate(`${row.purchase_request_id}`)}>
                    <div className="flex min-w-0 items-start gap-2">
                      <Button variant="ghost" size="icon" className="mt-[-3px] h-7 w-7 shrink-0 justify-center p-0" aria-label={`View ${row.pr_number}`}>
                        <Eye size={14} />
                      </Button>
                      <div className="min-w-0">
                        <p className="break-all font-mono text-xs font-semibold leading-snug text-[#26324f]">{row.pr_number}</p>
                        <p className="mt-1 truncate text-[11px] text-slate-500">{row.remarks || 'No remarks'}</p>
                      </div>
                    </div>
                    <StatusBadge status={row.status} />
                    <p className="text-right text-xs text-slate-500">{formatDate(row.created_at)}</p>
                    <p className="text-right text-sm font-semibold text-slate-800">{money(row.pr_total, row.currency_code || 'PHP')}</p>
                    <p className="text-right text-xs text-slate-500">{formatDate(row.required_date)}</p>
                  </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
