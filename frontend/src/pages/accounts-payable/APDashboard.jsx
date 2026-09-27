import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Calculator, CheckCircle2, FileText, Receipt, Send, Wallet } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { ErrorBox, Loading } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { SummaryMetricCard } from '@/components/aprar'
import { money } from '@/components/aprar/format'
import { fetchApDashboard, fetchApWorkQueue } from '@/utils/api'
import { BillDetailDrawer } from './APBillDetail'
import { COMPANY_FILTER_OPTIONS, formatDate } from './apUtils'

const AP_FLOW_LIMIT = 3

function dateValue(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

function recentTime(row) {
  return dateValue(row.created_at) ?? dateValue(row.due_date) ?? 0
}

function dueTime(row) {
  return dateValue(row.due_date) ?? Number.MAX_SAFE_INTEGER
}

function newest(rows = []) {
  return [...rows].sort((a, b) => recentTime(b) - recentTime(a))
}

function oldestDue(rows = []) {
  return [...rows].sort((a, b) => dueTime(a) - dueTime(b) || recentTime(a) - recentTime(b))
}

function limitRows(rows) {
  return rows.slice(0, AP_FLOW_LIMIT)
}

function moneyTotals(totals) {
  return Object.entries(totals || {}).map(([currency, value]) => money(value, currency)).join(' + ') || money(0)
}

function APFlowColumn({ title, hint, icon: Icon, rows, totalCount = rows.length, onOpen }) {
  return (
    <div className="min-w-[220px] rounded-lg border border-[#d8e2ef] bg-white">
      <div className="flex items-start justify-between gap-2 border-b border-[#d8e2ef] bg-[#f6f8fc] px-3 py-2">
        <div>
          <div className="flex items-center gap-2">
            <Icon size={15} className="text-[#2c3a61]" />
            <p className="text-xs font-semibold text-[#26324f]">{title}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
        </div>
        <Badge variant="muted">{totalCount > rows.length ? `${rows.length}/${totalCount}` : rows.length}</Badge>
      </div>
      <div className="max-h-[390px] space-y-1.5 overflow-auto p-2">
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#d8e2ef] px-3 py-4 text-center text-xs text-slate-500">
            Nothing waiting here.
          </div>
        ) : rows.map(row => (
          <button
            key={`${row.kind}-${row.id}`}
            type="button"
            onClick={() => onOpen(row)}
            className="block w-full rounded-md border border-[#e3ecf8] bg-white px-2.5 py-2 text-left transition-colors hover:border-[#b9c9dc] hover:bg-[#edf4fb]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="break-all font-mono text-xs font-semibold text-[#26324f]">{row.number}</span>
              {row.status && <StatusBadge status={row.status} />}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-700">{row.party || '-'}</p>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-500">{row.dueLabel}</span>
              <span className="font-semibold text-slate-800">{money(row.amount, row.currency_code || 'PHP')}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function APDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [queue, setQueue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedBillId, setSelectedBillId] = useState(null)
  const [company, setCompany] = useState('All')
  const [stageFilter, setStageFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    // Clear any prior data so partial/cached metrics are never shown on error
    // (Req 16.11).
    setData(null)
    setQueue(null)
    try {
      const [dashboard, workQueue] = await Promise.all([
        fetchApDashboard({ company }),
        fetchApWorkQueue({ company }),
      ])
      setData(dashboard)
      setQueue(workQueue)
    } catch (err) {
      setError(err.message || 'Payables data could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [company])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  if (loading) return <Loading label="Loading payables dashboard..." />

  // Load-error handling: show the error message and render NO metric cards,
  // chart, or table - no partial or previously cached values (Req 16.11).
  if (error) {
    return <ErrorBox message={`${error}. Please try refreshing.`} onDismiss={null} />
  }

  if (!data) return null

  const summary = data.summary || {}
  const queues = queue || {}

  function billFlowRow(row, kind, fallbackStatus, duePrefix = 'Due') {
    const amount = row.outstanding_balance ?? row.net_payable ?? row.balance ?? 0
    return {
      kind,
      id: row.bill_id,
      bill_id: row.bill_id,
      number: row.bill_number || '-',
      status: row.lifecycle_status || row.payment_status || fallbackStatus,
      party: row.supplier_name || row.supplier || '-',
      dueLabel: row.due_date ? `${duePrefix} ${formatDate(row.due_date)}` : fallbackStatus,
      amount,
      currency_code: row.currency_code || 'PHP',
    }
  }

  function voucherFlowRow(row) {
    return {
      kind: 'voucher_approval',
      id: row.voucher_id,
      voucher_id: row.voucher_id,
      number: row.voucher_number || '-',
      status: row.status || 'FOR_APPROVAL',
      party: row.supplier_name || '-',
      dueLabel: `${Number(row.bill_count || (row.bill_ids || []).length || 0)} bill(s) linked`,
      amount: row.total_amount ?? 0,
      currency_code: row.currency_code || 'PHP',
    }
  }

  const billIds = new Set()
  ;[
    ...(queues.draft_bills || []),
    ...(queues.no_document_bills || []),
    ...(queues.unvouchered_bills || []),
    ...(queues.overdue_bills || []),
    ...(queues.due_soon_bills || []),
    ...(queues.tax_pending_bills || []),
  ].forEach(row => {
    if (row.bill_id) billIds.add(row.bill_id)
  })
  ;(queues.vouchers_for_approval || []).forEach(row => {
    ;(row.bill_ids || []).forEach(id => billIds.add(id))
  })

  const workbench = [
    {
      id: 'draft',
      title: 'Draft Bills',
      hint: 'Most recent drafts',
      icon: FileText,
      rows: limitRows(newest(queues.draft_bills || [])).map(row => billFlowRow(row, 'draft', 'DRAFT')),
      totalCount: (queues.draft_bills || []).length,
    },
    {
      id: 'documents',
      title: 'Missing Invoice File',
      hint: 'Attach supplier invoice',
      icon: Receipt,
      rows: limitRows(newest(queues.no_document_bills || [])).map(row => billFlowRow(row, 'document', 'Missing file')),
      totalCount: (queues.no_document_bills || []).length,
    },
    {
      id: 'voucher',
      title: 'Voucher Needed',
      hint: 'Oldest due dates first',
      icon: Send,
      rows: limitRows(oldestDue(queues.unvouchered_bills || [])).map(row => billFlowRow(row, 'voucher', 'Needs voucher')),
      totalCount: (queues.unvouchered_bills || []).length,
    },
    {
      id: 'approval',
      title: 'Voucher Approval',
      hint: 'Most recent approvals',
      icon: CheckCircle2,
      rows: limitRows(newest(queues.vouchers_for_approval || [])).map(voucherFlowRow),
      totalCount: (queues.vouchers_for_approval || []).length,
    },
    {
      id: 'overdue',
      title: 'Overdue',
      hint: 'Oldest due dates first',
      icon: AlertTriangle,
      rows: limitRows(oldestDue(queues.overdue_bills || [])).map(row => billFlowRow(row, 'overdue', 'Overdue', 'Due')),
      totalCount: (queues.overdue_bills || []).length,
    },
    {
      id: 'due',
      title: 'Due This Week',
      hint: 'Oldest due dates first',
      icon: Wallet,
      rows: limitRows(oldestDue(queues.due_soon_bills || [])).map(row => billFlowRow(row, 'due', 'Due soon', 'Due')),
      totalCount: (queues.due_soon_bills || []).length,
    },
    {
      id: 'tax',
      title: 'Tax Forms (EWT)',
      hint: 'Pending EWT withholding on payment',
      icon: Calculator,
      rows: limitRows(newest(queues.tax_pending_bills || [])).map(row => ({
        kind: 'tax',
        id: row.bill_id,
        bill_id: row.bill_id,
        number: row.bill_number || '-',
        status: row.payment_status === 'UNPAID' ? 'Awaiting Payment' : 'Partial EWT',
        party: row.supplier_name || '-',
        dueLabel: row.ewt_remaining ? `EWT pending ₱${Number(row.ewt_remaining).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'Confirmed',
        amount: row.net_payable ?? 0,
        currency_code: row.currency_code || 'PHP',
      })),
      totalCount: (queues.tax_pending_bills || []).length,
    },
  ]
  const visibleWorkbench = stageFilter === 'all' ? workbench : workbench.filter(stage => stage.id === stageFilter)

  function handleOpen(row) {
    if (row.voucher_id) {
      navigate(`/accounts-payable/vouchers/${row.voucher_id}`)
      return
    }
    if (row.bill_id) setSelectedBillId(row.bill_id)
  }

  if (selectedBillId) {
    return (
      <BillDetailDrawer
        key={selectedBillId}
        billId={selectedBillId}
        onClose={() => setSelectedBillId(null)}
        onChanged={load}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryMetricCard
          label="Outstanding Payables"
          value={moneyTotals(summary.currency_totals?.Outstanding_Payables || { PHP: summary.Outstanding_Payables })}
          hint="Net payable - recorded payments across open confirmed bills"
          icon={Receipt}
        />
        <SummaryMetricCard
          label="Due This Week"
          value={moneyTotals(summary.currency_totals?.Due_This_Week || { PHP: summary.Due_This_Week })}
          hint="Open AP balances due Monday through Sunday"
          icon={Wallet}
        />
        <SummaryMetricCard
          label="Overdue Bills"
          value={Number(summary.Overdue_Bills || 0)}
          hint="Past-due confirmed bills with unpaid balance"
          icon={AlertTriangle}
        />
      </div>

      <div className="rounded-lg border border-[#d8e2ef] bg-[#f6f8fc] p-2">
        <div className="mb-2 flex flex-col gap-3 px-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[#26324f]">AP Workbench</h2>
              <Badge variant="muted">{billIds.size} active payables</Badge>
            </div>
            <p className="text-xs text-slate-500">Track supplier bills from draft review through voucher approval and payment timing.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap">
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/accounts-payable/bills')}>
              <Receipt size={14} /> View Tables
            </Button>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/accounts-payable/reports')}>
              <FileText size={14} /> Reports
            </Button>
            <Select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="h-9 w-[160px] shrink-0 py-1.5 text-xs">
              <option value="all">All Buckets</option>
              {workbench.map(stage => (
                <option key={stage.id} value={stage.id}>{stage.title}</option>
              ))}
            </Select>
            <Select value={company} onChange={e => setCompany(e.target.value)} className="h-9 w-[150px] shrink-0 py-1.5 text-xs">
              {COMPANY_FILTER_OPTIONS.map(option => (
                <option key={option} value={option}>{option === 'All' ? 'All Companies' : option}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleWorkbench.map(stage => (
            <APFlowColumn
              key={stage.id}
              title={stage.title}
              hint={stage.hint}
              icon={stage.icon}
              rows={stage.rows}
              totalCount={stage.totalCount}
              onOpen={handleOpen}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
