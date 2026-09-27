import { useCallback, useEffect, useState } from 'react'
import { FileText } from 'lucide-react'

import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorBox, Loading } from '@/components/ui/feedback'
import { SearchBox, Select } from '@/components/ui/form'
import { fetchApVouchers } from '@/utils/api'
import { useHighlightRow, highlightRowCls } from '@/hooks/useHighlightRow'
import { VoucherDetailDrawer } from './APVoucherDetail'
import { ApTableHeader, COMPANY_FILTER_OPTIONS, formatDate } from './apUtils'

const VOUCHER_GRID = 'grid-cols-[34%_34%_18%_14%]'

export function APVouchers({ initialSearch = '', initialStatus = 'All' }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState(initialSearch)
  const [status, setStatus] = useState(initialStatus)
  const [company, setCompany] = useState('All')
  const [selectedId, setSelectedId] = useState(null)

  const { highlightId, highlightRef, rowRef } = useHighlightRow(!loading && rows.length > 0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchApVouchers({ search, status, company }))
    } catch (err) {
      setError(err.message || 'Unable to load payment vouchers')
    } finally {
      setLoading(false)
    }
  }, [search, status, company])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Payment Vouchers</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={company} onChange={e => setCompany(e.target.value)}>
              {COMPANY_FILTER_OPTIONS.map(option => (
                <option key={option} value={option}>{option === 'All' ? 'All Companies' : option}</option>
              ))}
            </Select>
            <Select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="All">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="FOR_APPROVAL">For Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </Select>
            <SearchBox
              className="w-[220px]"
              placeholder="Search voucher number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && <div className="px-5 pb-3"><ErrorBox message={error} onDismiss={() => setError(null)} /></div>}
        {loading ? (
          <Loading label="Loading payment vouchers..." />
        ) : rows.length === 0 ? (
          <EmptyState title="No payment vouchers found" icon={FileText} />
        ) : (
          <div className="max-h-[calc(100vh-260px)] overflow-auto">
            <ApTableHeader grid={VOUCHER_GRID}>
              <span>Voucher Number</span>
              <span>Supplier</span>
              <span>Status</span>
              <span className="text-right">Bills</span>
            </ApTableHeader>
            <div className="divide-y divide-[#e3ecf8]">
              {rows.map(row => {
                const isHL = (highlightRef || highlightId) && row.voucher_number === (highlightRef || highlightId)
                return (
                <div
                  key={row.voucher_id}
                  ref={isHL ? rowRef : undefined}
                  className={`grid ${VOUCHER_GRID} cursor-pointer items-center px-5 py-3 text-sm hover:bg-[#edf4fb] ${isHL ? highlightRowCls : ''} ${selectedId === row.voucher_id ? 'bg-[#edf4fb]' : ''}`}
                  onClick={() => setSelectedId(row.voucher_id)}
                >
                  <span className="min-w-0">
                    <span className="block break-all font-mono text-xs font-semibold text-[#26324f]">{row.voucher_number}</span>
                    <span className="block text-[11px] text-slate-500">{formatDate(row.payment_date)}</span>
                  </span>
                  <span className="truncate text-slate-600">{row.supplier_name || '-'}</span>
                  <span><StatusBadge status={row.status} /></span>
                  <span className="text-right text-slate-600">{(row.bill_ids || []).length}</span>
                </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
      {selectedId && (
        <VoucherDetailDrawer
          voucherId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </Card>
  )
}
