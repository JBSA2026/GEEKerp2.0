import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Receipt, TriangleAlert, Wallet,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { ErrorBox, Loading } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { SummaryMetricCard } from '@/components/aprar'
import { money } from '@/components/aprar/format'
import { fetchArDashboard, fetchArInvoices } from '@/utils/api'
import { COMPANY_FILTER_OPTIONS, arInvoiceDisplayStatus, daysUntil, dueLabel, isOutstandingInvoice } from './arUtils'

// ── Flow column card used in the workbench ──────────────────────────────────

const FLOW_ITEM_LIMIT = 3

function dateValue(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

function recentTime(row) {
  return dateValue(row.updated_at) ?? dateValue(row.created_at) ?? dateValue(row.invoice_date) ?? dateValue(row.due_date) ?? 0
}

function dueTime(row) {
  return dateValue(row.due_date) ?? Number.MAX_SAFE_INTEGER
}

function newest(rows) {
  return [...rows].sort((a, b) => recentTime(b) - recentTime(a))
}

function oldestDue(rows) {
  return [...rows].sort((a, b) => dueTime(a) - dueTime(b) || recentTime(a) - recentTime(b))
}

function limitRows(rows) {
  return rows.slice(0, FLOW_ITEM_LIMIT)
}

function FlowColumn({ title, hint, icon: Icon, rows, totalCount = rows.length, balanceByInvoice, onOpen }) {
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
        ) : rows.map(row => {
          const balance = balanceByInvoice.get(Number(row.invoice_id))?.balance
          const amount = balance !== undefined ? balance : row.gross_amount
          return (
            <button
              key={row.invoice_id}
              type="button"
              onClick={() => onOpen(row.invoice_id)}
              className="block w-full rounded-md border border-[#e3ecf8] bg-white px-2.5 py-2 text-left transition-colors hover:border-[#b9c9dc] hover:bg-[#edf4fb]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="break-all font-mono text-xs font-semibold text-[#26324f]">{row.invoice_number}</span>
                <StatusBadge status={arInvoiceDisplayStatus(row)} />
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-700">{row.customer_name || '-'}</p>
              <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-500">{dueLabel(row.due_date)}</span>
                <span className="font-semibold text-slate-800">{money(amount)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── AR Workbench (Dashboard) ────────────────────────────────────────────────

export function ARWorkbench() {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [company, setCompany] = useState('All')
  const [stageFilter, setStageFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dashboardData, invoiceRows] = await Promise.all([
        fetchArDashboard({ company }),
        fetchArInvoices({ company }),
      ])
      setDashboard(dashboardData)
      setInvoices(invoiceRows)
    } catch (err) {
      setError(err.message || 'Unable to load receivables workbench')
    } finally {
      setLoading(false)
    }
  }, [company])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  if (loading) return <Loading label="Loading receivables workbench..." />

  if (error) {
    return (
      <ErrorBox message={`${error}. Please try refreshing.`} onDismiss={null} />
    )
  }

  if (!dashboard) return null

  const summary = dashboard.summary || {}
  const balanceByInvoice = new Map((dashboard.outstanding_invoices || []).map(row => [Number(row.invoice_id), row]))
  const stageRows = {
    drafts: [],
    overdue: [],
    dueSoon: [],
    partial: [],
    awaiting: [],
    paid: [],
  }

  invoices.forEach(row => {
    const status = row.collection_status
    const days = daysUntil(row.due_date)
    if (row.lifecycle_status === 'DRAFT') {
      stageRows.drafts.push(row)
    } else if (status === 'PAID') {
      stageRows.paid.push(row)
    } else if (isOutstandingInvoice(row) && days !== null && days < 0) {
      stageRows.overdue.push(row)
    } else if (isOutstandingInvoice(row) && days !== null && days <= 7) {
      stageRows.dueSoon.push(row)
    } else if (status === 'PARTIALLY_PAID') {
      stageRows.partial.push(row)
    } else {
      stageRows.awaiting.push(row)
    }
  })

  const flow = [
    { id: 'drafts', title: 'Drafts to Confirm', hint: 'Most recent drafts', icon: FileText, rows: limitRows(newest(stageRows.drafts)), totalCount: stageRows.drafts.length },
    { id: 'overdue', title: 'Overdue', hint: 'Oldest due dates first', icon: TriangleAlert, rows: limitRows(oldestDue(stageRows.overdue)), totalCount: stageRows.overdue.length },
    { id: 'dueSoon', title: 'Due This Week', hint: 'Oldest due dates first', icon: Receipt, rows: limitRows(oldestDue(stageRows.dueSoon)), totalCount: stageRows.dueSoon.length },
    { id: 'partial', title: 'Partially Paid', hint: 'Most recent partials', icon: Wallet, rows: limitRows(newest(stageRows.partial)), totalCount: stageRows.partial.length },
    { id: 'awaiting', title: 'Awaiting Payment', hint: 'Oldest due dates first', icon: Receipt, rows: limitRows(oldestDue(stageRows.awaiting)), totalCount: stageRows.awaiting.length },
    { id: 'paid', title: 'Paid Recently', hint: 'Most recent paid invoices', icon: Wallet, rows: limitRows(newest(stageRows.paid)), totalCount: stageRows.paid.length },
  ]
  const visibleFlow = stageFilter === 'all' ? flow : flow.filter(stage => stage.id === stageFilter)

  function handleOpen(invoiceId) {
    navigate(`../invoices/${invoiceId}`)
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryMetricCard
          label="Outstanding Receivables"
          value={money(summary.Outstanding_Receivables)}
          hint="Gross - active collections - WHT across open invoices"
          icon={Receipt}
        />
        <SummaryMetricCard
          label="Current Due"
          value={money(summary.Current_Due)}
          hint="Open balances with due date today or later"
          icon={Wallet}
        />
        <SummaryMetricCard
          label="Overdue Accounts"
          value={Number(summary.Overdue_Accounts || 0)}
          hint="Distinct customers with at least one past-due invoice"
          icon={TriangleAlert}
        />
      </div>

      <div className="rounded-lg border border-[#d8e2ef] bg-[#f6f8fc] p-2">
        <div className="mb-2 flex flex-col gap-3 px-1 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[#26324f]">AR Workbench</h2>
              <Badge variant="muted">{invoices.length} active invoices</Badge>
            </div>
            <p className="text-xs text-slate-500">Move invoices from confirmation through collection and close-out.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap">
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/accounts-receivable/invoices')}>
              <Receipt size={14} /> View Tables
            </Button>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/accounts-receivable/statements')}>
              <Wallet size={14} /> Statements
            </Button>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/accounts-receivable/reports')}>
              <FileText size={14} /> Reports
            </Button>
            <Select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="h-9 w-[160px] shrink-0 py-1.5 text-xs">
              <option value="all">All Buckets</option>
              {flow.map(stage => (
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
        <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {visibleFlow.map(stage => (
            <FlowColumn
              key={stage.id}
              title={stage.title}
              hint={stage.hint}
              icon={stage.icon}
              rows={stage.rows}
              totalCount={stage.totalCount}
              balanceByInvoice={balanceByInvoice}
              onOpen={handleOpen}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
