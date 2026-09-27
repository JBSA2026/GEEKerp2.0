import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'

import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorBox, Loading } from '@/components/ui/feedback'
import { SearchBox, Select } from '@/components/ui/form'
import { money } from '@/components/aprar/format'
import { fetchArInvoices } from '@/utils/api'
import { COMPANY_FILTER_OPTIONS, arInvoiceDisplayStatus, dueLabel, formatDate } from './arUtils'

const INVOICE_GRID = 'grid-cols-[20%_20%_14%_14%_16%_16%]'

export function ARInvoices() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const highlightRef = searchParams.get('ref')
  const highlightRowRef = useRef(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [company, setCompany] = useState('All')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchArInvoices({ search, status, company }))
    } catch (err) {
      setError(err.message || 'Unable to load invoices')
    } finally {
      setLoading(false)
    }
  }, [search, status, company])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  // Highlight effect: scroll to highlighted row and clear after 4s
  useEffect(() => {
    if ((highlightId || highlightRef) && highlightRowRef.current && !loading && rows.length > 0) {
      setTimeout(() => {
        if (highlightRowRef.current) {
          highlightRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 300)
      const timer = setTimeout(() => setSearchParams({}, { replace: true }), 5000)
      return () => clearTimeout(timer)
    }
  }, [highlightId, highlightRef, loading, rows, setSearchParams])

  function handleOpen(invoiceId) {
    navigate(`${invoiceId}`)
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="overflow-x-auto">
        <div className="flex min-w-[820px] items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/accounts-receivable/workbench')} aria-label="Back to dashboard">
              <ArrowLeft size={16} />
            </Button>
            <CardTitle className="whitespace-nowrap">Invoices</CardTitle>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
            <Select value={company} onChange={e => setCompany(e.target.value)} className="h-9 w-[150px] shrink-0 py-1.5 text-xs">
              {COMPANY_FILTER_OPTIONS.map(option => (
                <option key={option} value={option}>{option === 'All' ? 'All Companies' : option}</option>
              ))}
            </Select>
            <Select value={status} onChange={e => setStatus(e.target.value)} className="h-9 w-[150px] shrink-0 py-1.5 text-xs">
              <option value="All">All Status</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="PAID">Paid</option>
            </Select>
            <SearchBox
              className="w-[260px] shrink-0"
              placeholder="Search invoice number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && <div className="px-5 pb-3"><ErrorBox message={error} onDismiss={() => setError(null)} /></div>}
        {loading ? (
          <Loading label="Loading invoices..." />
        ) : rows.length === 0 ? (
          <EmptyState title="No invoices found" icon={FileText} />
        ) : (
          <div className="max-h-[calc(100vh-260px)] overflow-auto">
            <div className={`grid ${INVOICE_GRID} border-y border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
              <span>Invoice Number</span>
              <span>Client</span>
              <span>OR/Ref No.</span>
              <span>Aging Due Date</span>
              <span>Status</span>
              <span className="text-right">Gross Amount</span>
            </div>
            <div className="divide-y divide-[#e3ecf8]">
              {rows.map(row => {
                const isHL = (highlightId && String(row.invoice_id) === highlightId) || (highlightRef && row.invoice_number && row.invoice_number.trim() === decodeURIComponent(highlightRef).trim())
                return (
                <div
                  key={row.invoice_id}
                  ref={isHL ? highlightRowRef : null}
                  className={`grid ${INVOICE_GRID} cursor-pointer items-center px-5 py-3 text-sm hover:bg-[#edf4fb] ${isHL ? 'ring-2 ring-[#4f7cff] bg-[#4f7cff]/10 rounded-lg' : ''}`}
                  onClick={() => handleOpen(row.invoice_id)}
                >
                  <span className="break-all font-mono text-xs font-semibold text-[#26324f]">{row.invoice_number}</span>
                  <span className="truncate text-slate-600">{row.customer_name || '-'}</span>
                  <span className="font-mono text-xs text-slate-600 truncate">{(row.or_numbers || []).join(', ') || '—'}</span>
                  <span className="min-w-0">
                    <span className="block text-slate-600">{formatDate(row.due_date)}</span>
                    <span className="block truncate text-[11px] text-slate-500">{dueLabel(row.due_date)}</span>
                  </span>
                  <span><StatusBadge status={arInvoiceDisplayStatus(row)} /></span>
                  <span className="text-right font-semibold text-slate-800">{money(row.gross_amount)}</span>
                </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
