/* eslint-disable react-refresh/only-export-components */
import { Check } from 'lucide-react'

export const AP_WORKFLOW_STEPS = [
  { id: 'intake', label: 'Invoice Intake', shortLabel: 'Intake' },
  { id: 'match', label: 'Match & Review', shortLabel: 'Match' },
  { id: 'voucher', label: 'Voucher Prep', shortLabel: 'Voucher' },
  { id: 'approval', label: 'Approval', shortLabel: 'Approve' },
  { id: 'payment', label: 'Payment', shortLabel: 'Pay' },
  { id: 'clearing', label: 'Clearing', shortLabel: 'Clear' },
]

export const AP_BILL_CONTROL_GRID = 'grid-cols-[17%_17%_13%_16%_11%_11%_15%]'
export const PAYMENT_METHODS = ['CASH', 'CHECK', 'BANK_TRANSFER', 'ONLINE']
export const COMPANY_FILTER_OPTIONS = ['All', 'Expedia', 'GreatnessLab', 'Exigent', 'KSI']
const TABLE_HEADER_PADDING = {
  default: 'px-5 py-2.5 tracking-widest',
  compact: 'px-4 py-2 tracking-wide',
}

export function statusLabel(status) {
  return (status || '').replace(/_/g, ' ')
}

export function apBillDisplayStatus(row) {
  if (!row) return ''
  if (row.lifecycle_status === 'DRAFT') return 'DRAFT'
  if (row.payment_status === 'PAID') return 'PAID'
  if (row.payment_status === 'PARTIALLY_PAID') return 'PARTIALLY_PAID'

  const voucherStatuses = row.voucher_statuses || (row.vouchers || []).map(voucher => voucher.status)
  if (voucherStatuses.includes('APPROVED')) return 'VERIFIED'

  return 'UNPAID'
}

export function formatDate(value) {
  if (!value) return '-'
  return String(value).slice(0, 10)
}

function dateOnly(value) {
  if (!value) return null
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function billAgingDays(row) {
  if (row?.payment_status === 'PAID') return 0
  const due = dateOnly(row?.due_date)
  if (!due) return 0
  const today = dateOnly(new Date().toISOString())
  return Math.max(Math.floor((today - due) / 86400000), 0)
}

export function BillAgingBar({ days, maxDays, dueDate }) {
  const pct = maxDays > 0 && days > 0 ? Math.round((days / maxDays) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-500">Due {formatDate(dueDate)}</span>
        <span className={`text-right text-[11px] font-semibold ${days > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
          {days}d
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#edf4fb]">
        <div className={`h-full rounded-full ${days > 0 ? 'bg-rose-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function monthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const iso = d => d.toISOString().slice(0, 10)
  return { from: iso(first), to: iso(last) }
}

export function makeIdSet(rows = []) {
  return new Set(rows.map(row => row.bill_id).filter(Boolean))
}

export function apBillNextAction(row, queueSets) {
  if (row.lifecycle_status === 'DRAFT') return 'Confirm bill'
  if (queueSets.noDocument.has(row.bill_id)) return 'Attach invoice'
  if (queueSets.mismatch.has(row.bill_id)) return 'Review match'
  if (queueSets.unvouchered.has(row.bill_id) && row.payment_status !== 'PAID') return 'Create voucher'
  if (row.payment_status === 'PAID') return 'Paid'
  if (row.payment_status === 'PARTIALLY_PAID') return 'Continue payment'
  return 'Schedule payment'
}

export function DetailField({ label, children, mono = false }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-medium text-slate-800 ${mono ? 'font-mono text-[#26324f]' : ''}`}>{children}</p>
    </div>
  )
}

export function ApTableHeader({ grid, children, compact = false, className = '' }) {
  return (
    <div className={`grid ${grid} border-y border-[#d8e2ef] bg-[#edf4fb] ${TABLE_HEADER_PADDING[compact ? 'compact' : 'default']} text-[10px] font-semibold uppercase text-slate-600 ${className}`}>
      {children}
    </div>
  )
}

export function ApWorkflowStepper({ activeStep, onStepClick }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {AP_WORKFLOW_STEPS.map((step, index) => {
        const isActive = index === activeStep
        const isPassed = index < activeStep
        return (
          <div key={step.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onStepClick(index)}
              className={`group relative flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all ${
                isActive
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)] shadow-sm ring-1 ring-[var(--color-primary)]/20'
                  : isPassed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-[#d8e2ef] bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                isPassed
                  ? 'bg-emerald-500 text-white'
                  : isActive
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}>
                {isPassed ? <Check size={11} /> : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{step.shortLabel}</span>
            </button>
            {index < AP_WORKFLOW_STEPS.length - 1 && (
              <div className={`h-px w-4 shrink-0 ${isPassed ? 'bg-emerald-300' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function usableInvoiceNumber(value) {
  const trimmed = (value || '').trim()
  return Boolean(trimmed && trimmed.toUpperCase() !== 'PENDING')
}

export function fileTypeFromName(name) {
  const ext = (name || '').split('.').pop()?.toUpperCase()
  if (['PDF', 'JPG', 'PNG', 'XLSX'].includes(ext)) return ext
  if (ext === 'JPEG') return 'JPG'
  return 'PDF'
}
