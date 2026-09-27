import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { Loader2, ArrowLeft, Pencil, Printer, History, FileText, Send, FileCheck, AlertTriangle, Link2 } from 'lucide-react'
import { OfficialFormTab } from '../OfficialFormTab'
import { FormDetailsTab } from '../FormDetailsTab'
import { LinkedDocumentsTab } from '../LinkedDocumentsTab'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { apiGet } from '../../taxUtils'
import { FormViewTab1604E } from './FormViewTab1604E'

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


export function Form1604EDetail() {
  const { formId } = useParams()
  const navigate = useNavigate()
  const { entity } = useOutletContext() // eslint-disable-line no-unused-vars
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [history, setHistory] = useState([])
  const [activeTab, setActiveTab] = useState('details')
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvers, setApprovers] = useState([])
  const [selectedApprover, setSelectedApprover] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [validationWarnings, setValidationWarnings] = useState([])
  const [showWarningModal, setShowWarningModal] = useState(false)

  const loadForm = useCallback(async () => {
    setLoading(true)
    try { setForm(await apiGet(`/tax/bir-forms/${formId}`)) }
    catch { notify.error('Failed to load form') }
    finally { setLoading(false) }
  }, [formId])

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiGet(`/tax/bir-forms/${formId}/history`)
      setHistory(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
  }, [formId])

  useEffect(() => { loadForm(); loadHistory() }, [loadForm, loadHistory])

  useEffect(() => {
    apiGet('/employees/?is_active=true').then(data => {
      setApprovers(Array.isArray(data) ? data : data?.employees || [])
    }).catch(() => {})
  }, [])

  const handleSubmitForApproval = async (force = false) => {
    if (!selectedApprover) { notify.error('Select an approver'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${BASE}/tax/bir-forms/${formId}/submit-for-approval`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ approver_employee_id: Number(selectedApprover), force_submit: force })
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
            <span className="text-sm font-semibold text-[var(--color-text)]">BIR 1604-E</span>
            <StatusBadge status={form.status} />
            {form.form_code && <span className="font-mono text-xs font-medium text-[var(--color-primary)]">{form.form_code}</span>}
            <span className="text-xs text-[var(--color-muted-fg)]">• {form.payor_name}</span>
            <span className="text-xs text-[var(--color-muted-fg)]">• Year {fd.year || form.period_from?.slice(0, 4)}</span>
          </div>
        </div>
        {form.status === 'DRAFT' && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/tax/forms/1604E/${formId}/edit`)}>
            <Pencil size={14} /> Edit
          </Button>
        )}
        {form.status === 'DRAFT' && (
          <Button size="sm" onClick={() => setShowApprovalModal(true)} className="bg-blue-600 hover:bg-blue-700">
            <Send size={14} /> Submit for Approval
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => window.open(`/tax/forms/1604E/${formId}/print`, '_blank')}>
          <Printer size={14} /> Export PDF
        </Button>
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Submit BIR 1604-E for Approval</h3>
            <p className="text-xs text-[var(--color-muted-fg)] mb-4">
              This will send the form to the selected approver. Once approved, it will be finalized and locked.
            </p>
            <label className="text-xs font-medium text-[var(--color-text)] block mb-1">Approver</label>
            <select value={selectedApprover} onChange={e => setSelectedApprover(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm mb-4 focus:outline-none focus:border-[var(--color-primary)]">
              <option value="">— Select approver —</option>
              {approvers.map(emp => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.first_name} {emp.last_name} ({emp.email})
                </option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowApprovalModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSubmitForApproval} disabled={submitting || !selectedApprover}>
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
        {activeTab === 'bir' && <FormViewTab1604E fd={fd} />}
        {activeTab === 'history' && (
          <div className="space-y-2">
            {history.length ? history.map((h, i) => (
              <div key={i} className="text-xs border-b border-gray-100 pb-2">
                <span className="font-medium">{h.action}</span> — {h.details || ''} <span className="text-gray-400 ml-2">{h.performed_by} • {h.created_at?.slice(0, 10)}</span>
              </div>
            )) : <p className="text-sm text-gray-400">No history.</p>}
          </div>
        )}
        {activeTab === 'official' && <OfficialFormTab formRecordId={formId} />}
      </div>
    </div>
  )
}

/* ── Simple View Tab ─── */
function SimpleViewTab1604E({ fd }) {
  const money = (v) => {
    const n = parseFloat(v)
    return (!n || isNaN(n)) ? '—' : '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const tinStr = (v) => {
    if (Array.isArray(v)) return v.filter(Boolean).join('-')
    return v || '—'
  }
  const sched1 = fd.schedule1 || []
  const sched2 = fd.schedule2 || []
  const sched3 = fd.schedule3 || []

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Background Info */}
      <div className="grid grid-cols-3 gap-4 rounded-lg border border-[var(--color-border)] p-4">
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)] uppercase tracking-wide">Year</p>
          <p className="text-sm font-medium">{fd.year || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)] uppercase tracking-wide">Amended Return</p>
          <p className="text-sm font-medium">{fd.amended_return ? 'Yes' : 'No'}</p>
        </div>
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)] uppercase tracking-wide">Sheets Attached</p>
          <p className="text-sm font-medium">{fd.sheets_attached || '—'}</p>
        </div>
      </div>

      {/* Agent Info */}
      <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Withholding Agent</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">TIN</p>
            <p className="text-sm font-mono">{tinStr(fd.tin)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">RDO Code</p>
            <p className="text-sm">{fd.rdo_code || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">ZIP Code</p>
            <p className="text-sm">{fd.zip_code || '—'}</p>
          </div>
        </div>
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)]">Name</p>
          <p className="text-sm font-medium">{fd.agent_name || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] text-[var(--color-muted-fg)]">Address</p>
          <p className="text-sm">{fd.address || '—'}</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Category</p>
            <p className="text-sm">{fd.category || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Top Withholding Agent</p>
            <p className="text-sm">{fd.top_withholding_agent ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Contact</p>
            <p className="text-sm">{fd.contact_number || '—'}</p>
          </div>
        </div>
        {fd.email_address && (
          <div>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Email</p>
            <p className="text-sm">{fd.email_address}</p>
          </div>
        )}
      </div>

      {/* Schedule 1: Quarterly */}
      {sched1.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Schedule 1 — Quarterly Remittances (1601-EQ)</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-[var(--color-muted-fg)]">
                <th className="text-left py-1">Quarter</th>
                <th className="text-left py-1">Date</th>
                <th className="text-left py-1">Bank</th>
                <th className="text-left py-1">TRA/eROR</th>
                <th className="text-right py-1">Taxes</th>
                <th className="text-right py-1">Penalties</th>
                <th className="text-right py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {sched1.map((r, i) => (
                <tr key={i} className={cn('border-b border-gray-100', i === sched1.length - 1 && 'font-bold')}>
                  <td className="py-1">{i < 4 ? `Q${i + 1}` : ''}</td>
                  <td className="py-1">{r.date || ''}</td>
                  <td className="py-1">{r.bank || ''}</td>
                  <td className="py-1">{r.tra || ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.taxes ? money(r.taxes) : ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.penalties ? money(r.penalties) : ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.total ? money(r.total) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule 2: Monthly */}
      {sched2.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Schedule 2 — Monthly Remittances (1606)</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-[var(--color-muted-fg)]">
                <th className="text-left py-1">Month</th>
                <th className="text-left py-1">Date</th>
                <th className="text-left py-1">Bank</th>
                <th className="text-left py-1">TRA/eROR</th>
                <th className="text-right py-1">Taxes</th>
                <th className="text-right py-1">Penalties</th>
                <th className="text-right py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {sched2.map((r, i) => {
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','']
                return (
                  <tr key={i} className={cn('border-b border-gray-100', i === sched2.length - 1 && 'font-bold')}>
                    <td className="py-1">{months[i] || ''}</td>
                    <td className="py-1">{r.date || ''}</td>
                    <td className="py-1">{r.bank || ''}</td>
                    <td className="py-1">{r.tra || ''}</td>
                    <td className="text-right py-1 tabular-nums">{r.taxes ? money(r.taxes) : ''}</td>
                    <td className="text-right py-1 tabular-nums">{r.penalties ? money(r.penalties) : ''}</td>
                    <td className="text-right py-1 tabular-nums">{r.total ? money(r.total) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule 3: Alphalist */}
      {sched3.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Schedule 3 — Alphalist of Payees</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-[var(--color-muted-fg)]">
                <th className="text-left py-1">#</th>
                <th className="text-left py-1">TIN</th>
                <th className="text-left py-1">Name</th>
                <th className="text-center py-1">ATC</th>
                <th className="text-right py-1">Income</th>
                <th className="text-center py-1">Rate</th>
                <th className="text-right py-1">Tax Withheld</th>
              </tr>
            </thead>
            <tbody>
              {sched3.map((r, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1">{r.seq || i + 1}</td>
                  <td className="py-1 font-mono">{r.tin || ''}</td>
                  <td className="py-1">{r.name || ''}</td>
                  <td className="text-center py-1">{r.atc || ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.income ? money(r.income) : ''}</td>
                  <td className="text-center py-1">{r.tax_rate || ''}</td>
                  <td className="text-right py-1 tabular-nums">{r.tax_withheld ? money(r.tax_withheld) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Signatory */}
      <div className="rounded-lg border border-[var(--color-border)] p-4">
        <p className="text-[11px] text-[var(--color-muted-fg)] uppercase tracking-wide">Signatory</p>
        <p className="text-sm font-medium">{fd.signatory_name || '—'}</p>
        <p className="text-xs text-[var(--color-muted-fg)]">{fd.signatory_title || ''}</p>
      </div>
    </div>
  )
}
