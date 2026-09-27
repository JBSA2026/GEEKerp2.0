import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'

import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorBox, Loading } from '@/components/ui/feedback'
import { SearchBox, Select } from '@/components/ui/form'
import { money } from '@/components/aprar/format'
import { fetchApBills } from '@/utils/api'
import { BillDetailDrawer } from './APBillDetail'
import { ApTableHeader, COMPANY_FILTER_OPTIONS, apBillDisplayStatus, formatDate } from './apUtils'

const BILL_GRID = 'grid-cols-[24%_24%_16%_16%_20%]'

export function APBills({ initialSearch = '' }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const highlightRef = searchParams.get('ref')
  const highlightRowRef = useRef(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState(initialSearch)
  const [status, setStatus] = useState('All')
  const [company, setCompany] = useState('All')
  const [selectedId, setSelectedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchApBills({ search, status, company }))
    } catch (err) {
      setError(err.message || 'Unable to load bills')
    } finally {
      setLoading(false)
    }
  }, [search, status, company])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  // Highlight effect
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

  if (selectedId) {
    return (
      <BillDetailDrawer
        key={selectedId}
        billId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={load}
      />
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="overflow-x-auto">
        <div className="flex min-w-[820px] items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/accounts-payable/dashboard')} aria-label="Back to dashboard">
              <ArrowLeft size={16} />
            </Button>
            <CardTitle className="whitespace-nowrap">Bills</CardTitle>
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
              placeholder="Search bill / PO / supplier inv..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && <div className="px-5 pb-3"><ErrorBox message={error} onDismiss={() => setError(null)} /></div>}
        {loading ? (
          <Loading label="Loading bills..." />
        ) : rows.length === 0 ? (
          <EmptyState title="No bills found" icon={FileText} />
        ) : (
          <div className="max-h-[calc(100vh-260px)] overflow-auto">
            <ApTableHeader grid={BILL_GRID}>
              <span>Bill Number</span>
              <span>Supplier</span>
              <span>Voucher/Ref No.</span>
              <span>Status</span>
              <span className="text-right">Net Payable</span>
            </ApTableHeader>
            <div className="divide-y divide-[#e3ecf8]">
              {rows.map(row => {
                const isHL = (highlightId && String(row.bill_id) === highlightId) || (highlightRef && row.bill_number && row.bill_number.trim() === decodeURIComponent(highlightRef).trim())
                return (
                <div
                  key={row.bill_id}
                  ref={isHL ? highlightRowRef : null}
                  className={`grid ${BILL_GRID} cursor-pointer items-center px-5 py-3 text-sm hover:bg-[#edf4fb] ${isHL ? 'ring-2 ring-[#4f7cff] bg-[#4f7cff]/10 rounded-lg' : ''} ${selectedId === row.bill_id ? 'bg-[#edf4fb]' : ''}`}
                  onClick={() => setSelectedId(row.bill_id)}
                >
                  <span className="min-w-0">
                    <span className="block break-all font-mono text-xs font-semibold text-[#26324f]">{row.bill_number}</span>
                    <span className="block text-[11px] text-slate-500">Due {formatDate(row.due_date)}</span>
                  </span>
                  <span className="truncate text-slate-600">{row.supplier_name || '-'}</span>
                  <span className="font-mono text-xs text-slate-600 truncate">{(row.voucher_numbers || []).join(', ') || '—'}</span>
                  <span className="flex flex-wrap gap-1">
                    <StatusBadge status={apBillDisplayStatus(row)} />
                  </span>
                  <span className="text-right font-semibold text-slate-800">{money(row.net_payable, row.currency_code || 'PHP')}</span>
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
