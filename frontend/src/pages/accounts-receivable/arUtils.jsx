/* eslint-disable react-refresh/only-export-components */
import { Wallet } from 'lucide-react'
import { CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { money } from '@/components/aprar/format'

// ── Shared AR utility functions ─────────────────────────────────────────────

export const PAYMENT_METHODS = ['CASH', 'CHECK', 'BANK_TRANSFER', 'ONLINE']
export const COMPANY_FILTER_OPTIONS = ['All', 'Expedia', 'GreatnessLab', 'Exigent', 'KSI']

export function statusLabel(status) {
  return (status || 'UNPAID').replace(/_/g, ' ')
}

export function formatDate(value) {
  if (!value) return '-'
  return String(value).slice(0, 10)
}

export function asDate(value) {
  if (!value) return null
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function todayDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function daysUntil(value) {
  const due = asDate(value)
  if (!due) return null
  return Math.round((due - todayDate()) / 86400000)
}

export function dueLabel(value) {
  const days = daysUntil(value)
  if (days === null) return 'No due date'
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

export function isOutstandingInvoice(row) {
  return row?.lifecycle_status !== 'DRAFT' && ['UNPAID', 'PARTIALLY_PAID'].includes(row?.collection_status)
}

export function arInvoiceDisplayStatus(row) {
  if (row?.lifecycle_status === 'DRAFT') return 'DRAFT'
  return row?.collection_status || 'UNPAID'
}

export function fileTypeFromName(name) {
  const ext = (name || '').split('.').pop()?.toUpperCase()
  if (['PDF', 'JPG', 'PNG', 'XLSX'].includes(ext)) return ext
  if (ext === 'JPEG') return 'JPG'
  return 'PDF'
}

// ── Shared AR components ────────────────────────────────────────────────────

export function DetailField({ label, children, mono = false }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-medium text-slate-800 ${mono ? 'font-mono text-xs text-[#26324f]' : ''}`}>{children}</p>
    </div>
  )
}

export function CollectionHistory({ invoice }) {
  const collections = invoice?.collections || []
  return (
    <section className="overflow-hidden rounded-lg border border-[#d8e2ef] bg-white">
      <div className="border-b border-[#d8e2ef] bg-[#f6f8fc] px-3 py-2">
        <CardTitle>Collection History — {invoice?.invoice_number}</CardTitle>
      </div>
      <div>
        {collections.length === 0 ? (
          <EmptyState title="No collections recorded for this invoice" icon={Wallet} />
        ) : (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[28%_24%_25%_23%] border-b border-[#d8e2ef] bg-[#edf4fb] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              <span>Date</span>
              <span className="text-right">Amount</span>
              <span className="text-center">Method</span>
              <span>OR No.</span>
            </div>
            <div className="divide-y divide-[#e3ecf8]">
              {collections.map(row => (
                <div key={row.collection_id} className="grid grid-cols-[28%_24%_25%_23%] items-center px-3 py-2 text-xs">
                  <span className="text-slate-600">{formatDate(row.collection_date)}</span>
                  <span className="text-right font-semibold text-slate-800">{money(row.collection_amount)}</span>
                  <span className="text-center text-slate-600">{row.payment_method || '-'}</span>
                  <span className="font-mono text-xs text-slate-600">{row.or_number || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
