import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, FileText, Link2, ArrowRight, Receipt, Banknote, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { notify } from '@/utils/toast'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

function money(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return '₱0.00'
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatusBadge({ status }) {
  const s = (status || '').toUpperCase()
  if (s === 'PAID' || s === 'FILED' || s === 'APPROVED' || s === 'PROCESSED') {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{status}</span>
  }
  if (s === 'UNPAID' || s === 'DRAFT' || s === 'PENDING') {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{status}</span>
  }
  if (s === 'PARTIALLY_PAID' || s === 'PENDING_APPROVAL') {
    return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{status}</span>
  }
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{status || '—'}</span>
}

function getTypeIcon(type) {
  if (type?.includes('Invoice')) return Receipt
  if (type?.includes('Bill')) return Banknote
  if (type?.includes('Payroll')) return Users
  return FileText
}

export function LinkedDocumentsTab({ formRecordId }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/tax/bir-forms/${formRecordId}/linked-documents`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Failed to load')
      setData(await res.json())
    } catch {
      notify.error('Failed to load linked documents')
    } finally {
      setLoading(false)
    }
  }, [formRecordId])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-sm text-[var(--color-muted-fg)] text-center py-8">Failed to load linked documents.</p>
  }

  const { transactions, related_forms } = data
  const hasTransactions = transactions?.length > 0
  const hasRelatedForms = related_forms?.length > 0

  if (!hasTransactions && !hasRelatedForms) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Link2 size={32} className="text-[var(--color-muted-fg)] mb-3" />
        <p className="text-sm font-medium text-[var(--color-text)]">No linked documents</p>
        <p className="text-xs text-[var(--color-muted-fg)] mt-1">
          {data.form_type === '0605'
            ? 'This form type (Annual Registration) has no linked transactions.'
            : 'No source transactions or related forms found for this period.'}
        </p>
      </div>
    )
  }

  // Compute totals
  const totalAmount = transactions?.reduce((s, t) => s + (t.amount || 0), 0) || 0
  const totalTax = transactions?.reduce((s, t) => s + (t.tax_amount || 0), 0) || 0

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Summary bar */}
      {hasTransactions && (
        <div className="grid grid-cols-3 gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          <div>
            <p className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase">Transactions</p>
            <p className="text-lg font-semibold text-[var(--color-text)]">{transactions.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase">Total Amount</p>
            <p className="text-lg font-semibold text-[var(--color-text)]">{money(totalAmount)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase">Total Tax</p>
            <p className="text-lg font-semibold text-[var(--color-primary)]">{money(totalTax)}</p>
          </div>
        </div>
      )}

      {/* Source Transactions */}
      {hasTransactions && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <h3 className="text-xs font-semibold text-[var(--color-text)]">Source Transactions ({transactions.length})</h3>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {transactions.map((txn, i) => {
              const Icon = getTypeIcon(txn.type)
              return (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-2)] cursor-pointer transition-colors"
                  onClick={() => txn.url && navigate(txn.url)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
                      <Icon size={14} className="text-[var(--color-muted-fg)]" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-text)]">{txn.reference || `#${txn.id}`}</p>
                      <p className="text-[10px] text-[var(--color-muted-fg)]">{txn.type} • {txn.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs font-medium tabular-nums">{money(txn.amount)}</p>
                      <p className="text-[10px] text-[var(--color-primary)] font-medium tabular-nums">Tax: {money(txn.tax_amount)}</p>
                    </div>
                    <StatusBadge status={txn.status} />
                    <ArrowRight size={12} className="text-[var(--color-muted-fg)]" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Related BIR Forms */}
      {hasRelatedForms && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <h3 className="text-xs font-semibold text-[var(--color-text)]">Related BIR Forms ({related_forms.length})</h3>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {related_forms.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-2)] cursor-pointer transition-colors"
                onClick={() => f.url && navigate(f.url)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <FileText size={14} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text)]">
                      BIR {f.form_type}
                      {f.payee_name && <span className="font-normal text-[var(--color-muted-fg)]"> — {f.payee_name}</span>}
                    </p>
                    <p className="text-[10px] text-[var(--color-muted-fg)]">
                      {f.period}
                      {f.relationship && <span className="ml-1.5 italic">({f.relationship})</span>}
                      {f.form_code && <span className="ml-1.5 font-mono">{f.form_code}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={f.status} />
                  <ArrowRight size={12} className="text-[var(--color-muted-fg)]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
