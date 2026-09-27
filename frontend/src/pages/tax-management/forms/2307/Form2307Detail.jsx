import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { Loader2, ArrowLeft, Pencil, Printer, History, FileText, Link2, Send, FileCheck, AlertTriangle } from 'lucide-react'
import { OfficialFormTab } from '../OfficialFormTab'
import { FormDetailsTab } from '../FormDetailsTab'
import { LinkedDocumentsTab } from '../LinkedDocumentsTab'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { apiGet } from '../../taxUtils'
import { export2307PDF } from '@/utils/bir2307Pdf'
import { FormViewTab } from './FormViewTab'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

function StatusBadge({ status }) {
  if (status === 'FINALIZED') return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Finalized</span>
  if (status === 'PENDING_APPROVAL') return <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Pending Approval</span>
  return <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Draft</span>
}

function money(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return '₱0.00'
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function Form2307Detail() {
  const { formId } = useParams()
  const navigate = useNavigate()
  const { entity } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [history, setHistory] = useState([])
  const [activeTab, setActiveTab] = useState('details')
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [validationWarnings, setValidationWarnings] = useState([])
  const [showWarningModal, setShowWarningModal] = useState(false)

  const loadForm = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/tax/bir-forms/${formId}`)
      setForm(data)
    } catch { notify.error('Failed to load form') }
    finally { setLoading(false) }
  }, [formId])

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiGet(`/tax/bir-forms/${formId}/history`)
      setHistory(Array.isArray(data) ? data : [])
    } catch { }
  }, [formId])

  useEffect(() => { loadForm(); loadHistory() }, [loadForm, loadHistory])



  const handleSubmitForApproval = async (force = false) => {
    setSubmitting(true)
    try {
      const res = await fetch(`${BASE}/tax/bir-forms/${formId}/submit-for-approval`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ force_submit: force })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.detail || 'Failed to submit')

      if (data.requires_confirmation && data.warnings?.length) {
        setValidationWarnings(data.warnings)
        setShowWarningModal(true)
        setSubmitting(false)
        return
      }

      notify.success('Submitted for approval')
      if (data.warnings?.length) {
        notify.info(`Note: ${data.warnings.length} warning(s) were skipped`)
      }
      setShowApprovalModal(false)
      setShowWarningModal(false)
      loadForm(); loadHistory()
    } catch (err) { notify.error(err.message || 'Failed to submit') }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
  if (!form) return <div className="p-6 text-center text-sm text-[var(--color-muted-fg)]">Form not found.</div>

  const TABS = [
    { id: 'details', label: 'Form Details', icon: FileText },
    { id: 'linked', label: 'Linked Documents', icon: Link2 },
    { id: 'bir', label: 'BIR Form View', icon: FileText },
    { id: 'history', label: 'History', icon: History },
    ...(form?.status === 'APPROVED' || form?.status === 'FILED' ? [{ id: 'official', label: 'Official BIR Form', icon: FileCheck }] : []),
  ]

  const fd = form.form_data || {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <Button variant="outline" size="sm" onClick={() => navigate('/tax/forms')}><ArrowLeft size={14} /> Back</Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[var(--color-text)]">BIR 2307</span>
            <StatusBadge status={form.status} />
            {form.form_code && <span className="font-mono text-xs font-medium text-[var(--color-primary)]">{form.form_code}</span>}
            <span className="text-xs text-[var(--color-muted-fg)]">• {form.payee_name || form.form_data?.payee_name || '—'}</span>
            <span className="text-xs text-[var(--color-muted-fg)]">• {form.period_from} to {form.period_to}</span>
          </div>
        </div>
        {form.status === 'DRAFT' && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/tax/forms/2307/${formId}/edit`)}>
            <Pencil size={14} /> Edit
          </Button>
        )}
        {form.status === 'DRAFT' && (
          <Button size="sm" onClick={() => setShowApprovalModal(true)} className="bg-blue-600 hover:bg-blue-700">
            <Send size={14} /> Submit for Approval
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => export2307PDF(fd)}>
          <Printer size={14} /> Export PDF
        </Button>
      </div>

      {/* Submit for Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Submit BIR 2307 for Approval</h3>
            <p className="text-xs text-[var(--color-muted-fg)] mb-4">
              This will submit the form for approval. Once approved, it will be finalized and locked.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowApprovalModal(false)}>Cancel</Button>
              <Button size="sm" onClick={() => handleSubmitForApproval()} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      )}



      {/* Validation Warning Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[440px] max-w-[90vw]">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              Incomplete Fields Detected
            </h3>
            <p className="text-xs text-[var(--color-muted-fg)] mb-3">
              The following fields are missing or incomplete. You can still submit, but these may need to be addressed:
            </p>
            <ul className="space-y-1 mb-4 max-h-[200px] overflow-y-auto">
              {validationWarnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-1.5">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowWarningModal(false)}>Go Back & Fix</Button>
              <Button size="sm" onClick={() => handleSubmitForApproval(true)} disabled={submitting}
                className="bg-amber-500 hover:bg-amber-600 text-white">
                {submitting ? 'Submitting...' : 'Submit Anyway'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 px-6 pt-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border border-b-0 transition-colors',
              activeTab === tab.id
                ? 'bg-white border-[var(--color-border)] text-[var(--color-text)]'
                : 'bg-transparent border-transparent text-[var(--color-muted-fg)] hover:text-[var(--color-text)]'
            )}>
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={cn('flex-1 overflow-y-auto', activeTab === 'history' ? 'p-6' : '')}>
        {activeTab === 'details' && <FormDetailsTab form={form} />}
        {activeTab === 'linked' && <LinkedDocumentsTab formRecordId={formId} />}
        {activeTab === 'bir' && <FormViewTab fd={fd} />}
        {activeTab === 'history' && <HistoryTab history={history} />}
        {activeTab === 'official' && <OfficialFormTab formRecordId={formId} />}
      </div>
    </div>
  )
}

/* ── Simple View Tab ─── */
function SimpleViewTab({ fd, form }) {
  const money = (v) => {
    const n = parseFloat(v)
    return (!n || isNaN(n)) ? '—' : '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const tinStr = (v) => {
    if (Array.isArray(v)) return v.filter(Boolean).join('-')
    return v || '—'
  }
  const tableA = fd.table_a || []
  const tableB = fd.table_b || []
  const totalA = tableA.reduce((s, r) => s + (parseFloat(r.tax_withheld) || 0), 0)
  const totalB = tableB.reduce((s, r) => s + (parseFloat(r.tax_withheld) || 0), 0)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Period */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-[var(--color-border)] p-4">
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)] uppercase tracking-wide">Period From</p>
          <p className="text-sm font-medium">{fd.period_from || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)] uppercase tracking-wide">Period To</p>
          <p className="text-sm font-medium">{fd.period_to || '—'}</p>
        </div>
      </div>

      {/* Payee */}
      <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Payee Information</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">TIN</p>
            <p className="text-sm font-mono">{tinStr(fd.payee_tin)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">ZIP Code</p>
            <p className="text-sm">{fd.payee_zip_code || '—'}</p>
          </div>
        </div>
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)]">Name</p>
          <p className="text-sm font-medium">{fd.payee_name || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)]">Address</p>
          <p className="text-sm">{fd.payee_address || '—'}</p>
        </div>
        {fd.payee_foreign_address && (
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Foreign Address</p>
            <p className="text-sm">{fd.payee_foreign_address}</p>
          </div>
        )}
      </div>

      {/* Payor */}
      <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Payor Information</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">TIN</p>
            <p className="text-sm font-mono">{tinStr(fd.payor_tin)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">ZIP Code</p>
            <p className="text-sm">{fd.payor_zip_code || '—'}</p>
          </div>
        </div>
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)]">Name</p>
          <p className="text-sm font-medium">{fd.payor_name || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)]">Address</p>
          <p className="text-sm">{fd.payor_address || '—'}</p>
        </div>
      </div>

      {/* Table A */}
      {tableA.some(r => r.nature) && (
        <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Income Payments — Expanded Withholding Tax</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-[var(--color-muted-fg)]">
                <th className="text-left py-1">Nature</th>
                <th className="text-center py-1">ATC</th>
                <th className="text-right py-1">Month 1</th>
                <th className="text-right py-1">Month 2</th>
                <th className="text-right py-1">Month 3</th>
                <th className="text-right py-1">Total</th>
                <th className="text-right py-1">Tax Withheld</th>
              </tr>
            </thead>
            <tbody>
              {tableA.filter(r => r.nature).map((r, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1">{r.nature}</td>
                  <td className="text-center py-1">{r.atc}</td>
                  <td className="text-right py-1 tabular-nums">{r.month1 || ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.month2 || ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.month3 || ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.total || ''}</td>
                  <td className="text-right py-1 tabular-nums font-medium">{r.tax_withheld || ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t">
                <td colSpan={6} className="py-1">Total Tax Withheld</td>
                <td className="text-right py-1 tabular-nums">{money(totalA)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Table B */}
      {tableB.some(r => r.nature) && (
        <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Money Payments — Business Tax</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-[var(--color-muted-fg)]">
                <th className="text-left py-1">Nature</th>
                <th className="text-center py-1">ATC</th>
                <th className="text-right py-1">Month 1</th>
                <th className="text-right py-1">Month 2</th>
                <th className="text-right py-1">Month 3</th>
                <th className="text-right py-1">Total</th>
                <th className="text-right py-1">Tax Withheld</th>
              </tr>
            </thead>
            <tbody>
              {tableB.filter(r => r.nature).map((r, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1">{r.nature}</td>
                  <td className="text-center py-1">{r.atc}</td>
                  <td className="text-right py-1 tabular-nums">{r.month1 || ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.month2 || ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.month3 || ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.total || ''}</td>
                  <td className="text-right py-1 tabular-nums font-medium">{r.tax_withheld || ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t">
                <td colSpan={6} className="py-1">Total Tax Withheld</td>
                <td className="text-right py-1 tabular-nums">{money(totalB)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Signatories */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-[var(--color-border)] p-4">
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)] uppercase tracking-wide">Payor Signatory</p>
          <p className="text-sm font-medium">{fd.payor_signatory_name || '—'}</p>
          <p className="text-xs text-[var(--color-muted-fg)]">{fd.payor_signatory_title_tin || ''}</p>
        </div>
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)] uppercase tracking-wide">Payee Signatory</p>
          <p className="text-sm font-medium">{fd.payee_signatory_name || '—'}</p>
          <p className="text-xs text-[var(--color-muted-fg)]">{fd.payee_signatory_title_tin || ''}</p>
        </div>
      </div>
    </div>
  )
}

/* ── Form View Tab ─── imported from ./FormViewTab.jsx */

/* ── Linked Invoices Tab ─── */
function LinkedInvoicesTab({ invoices, navigate }) {
  if (!invoices.length) return <p className="text-sm text-[var(--color-muted-fg)] text-center py-8">No linked invoices.</p>

  return (
    <div className="max-w-3xl mx-auto">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-muted-fg)]">Invoice #</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-muted-fg)]">Date</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-muted-fg)]">Billing</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-muted-fg)]">WHT</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-muted-fg)]">Collection</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.invoice_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/50 cursor-pointer"
                onClick={() => navigate(`/accounts-receivable/invoices/${inv.invoice_id}`)}>
                <td className="px-4 py-2.5 font-mono font-medium text-[var(--color-primary)]">{inv.invoice_number}</td>
                <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{inv.invoice_date}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{money(inv.billing_subtotal)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-blue-600">{money(inv.wht_amount)}</td>
                <td className="px-4 py-2.5">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full',
                    inv.collection_status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  )}>{inv.collection_status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── History Tab ─── */
function HistoryTab({ history }) {
  if (!history.length) return <p className="text-sm text-[var(--color-muted-fg)] text-center py-8">No history yet.</p>

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {history.map(h => (
        <div key={h.history_id} className="flex gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
            <History size={14} className="text-[var(--color-primary)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--color-text)]">{h.action}</p>
            <p className="text-xs text-[var(--color-muted-fg)]">{h.details}</p>
            <p className="text-[11px] text-[var(--color-muted-fg)] mt-1">
              {h.performed_by || 'System'} • {new Date(h.created_at).toLocaleString()}
            </p>
            {h.snapshot && (
              <details className="mt-1">
                <summary className="text-[10px] text-[var(--color-primary)] cursor-pointer">View snapshot</summary>
                <pre className="text-[9px] mt-1 p-2 bg-[var(--color-surface-2)] rounded overflow-x-auto max-h-[150px]">
                  {JSON.stringify(h.snapshot, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
