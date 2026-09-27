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
import { export0619EPDF } from '@/utils/bir0619EPdf'
import { BIRFormZoomWrapper } from '@/components/ui/bir-form-zoom-wrapper'

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

export function Form0619EDetail() {
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
    { id: 'view', label: 'Form View', icon: FileText },
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
            <span className="text-sm font-semibold text-[var(--color-text)]">BIR 0619-E</span>
            <StatusBadge status={form.status} />
            {form.form_code && <span className="font-mono text-xs font-medium text-[var(--color-primary)]">{form.form_code}</span>}
            <span className="text-xs text-[var(--color-muted-fg)]">• {form.payor_name}</span>
            <span className="text-xs text-[var(--color-muted-fg)]">• {form.period_from} to {form.period_to}</span>
          </div>
        </div>
        {form.status === 'DRAFT' && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/tax/forms/0619E/${formId}/edit`)}>
            <Pencil size={14} /> Edit
          </Button>
        )}
        {form.status === 'DRAFT' && (
          <Button size="sm" onClick={() => setShowApprovalModal(true)} className="bg-blue-600 hover:bg-blue-700">
            <Send size={14} /> Submit for Approval
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => export0619EPDF(fd)}>
          <Printer size={14} /> Export PDF
        </Button>
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Submit BIR 0619-E for Approval</h3>
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
        {activeTab === 'view' && <FormViewTab fd={fd} />}
        {activeTab === 'history' && <HistoryTab history={history} />}
        {activeTab === 'official' && <OfficialFormTab formRecordId={formId} />}
      </div>
    </div>
  )
}


/* ── Form View Tab ─── */
function FormViewTab({ fd }) {
  const normalizeTin = (arr) => {
    let segments = Array.isArray(arr) ? [...arr] : (arr || '').includes('-') ? (arr || '').split('-') : []
    if (segments[0] && segments[0].length > 3) {
      const raw = segments[0].replace(/\D/g, '')
      segments = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
    }
    if (!segments.length && typeof arr === 'string' && arr.length > 0) {
      const raw = arr.replace(/\D/g, '')
      segments = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
    }
    while (segments.length < 4) segments.push('')
    return segments.slice(0, 4)
  }
  const tin = normalizeTin(fd.tin)
  const line14 = (parseFloat(fd.line_12) || 0) - (parseFloat(fd.line_13) || 0)
  const line16 = line14 + (parseFloat(fd.line_15a) || 0) + (parseFloat(fd.line_15b) || 0) + (parseFloat(fd.line_15c) || 0)
  const num = (v) => { const n = parseFloat(v); return (!n || isNaN(n)) ? '' : n.toFixed(2) }

  const CELL = 'border border-black'
  const LABEL = 'text-[8px] leading-tight'
  const FIELD_RO = 'text-[9px] px-1 font-medium'

  return (
    <BIRFormZoomWrapper>
      <div className="mx-auto bg-white shadow-lg" style={{ width: '794px', minHeight: '1123px', padding: 0, border: '2px solid black' }}>

        {/* Header - BIR Use Only | Republic | Barcode */}
        <div className="flex" style={{ height: '48px' }}>
          <div className={`${CELL} flex flex-col justify-center px-1`} style={{ width: '80px' }}>
            <span className="text-[7px]">For BIR</span>
            <span className="text-[7px]">Use Only</span>
            <div className="flex gap-3 mt-0.5">
              <span className="text-[6px]">BCS/</span>
              <span className="text-[6px]">Item:</span>
            </div>
          </div>
          <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
            <span className="text-[9px]">Republic of the Philippines</span>
            <span className="text-[9px]">Department of Finance</span>
            <span className="text-[9px] font-bold">Bureau of Internal Revenue</span>
          </div>
          <div className={`${CELL}`} style={{ width: '140px' }} />
        </div>

        {/* BIR Form No. | Title */}
        <div className="flex" style={{ height: '60px' }}>
          <div className={`${CELL} px-2 flex flex-col justify-center`} style={{ width: '120px' }}>
            <span className="text-[7px]">BIR Form No.</span>
            <span className="text-[24px] font-bold leading-none">0619-E</span>
            <span className="text-[6px] text-gray-600">January 2018 (ENCS)</span>
          </div>
          <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
            <span className="text-[14px] font-bold">Monthly Remittance Return of</span>
            <span className="text-[14px] font-bold">Creditable Income Taxes Withheld</span>
            <span className="text-[14px] font-bold">(Expanded)</span>
          </div>
          <div className={`${CELL} flex items-end justify-center pb-1`} style={{ width: '140px' }}>
            <span className="text-[7px]">0619E 01/18ENCS</span>
          </div>
        </div>

        {/* Instruction */}
        <div className={`${CELL} px-2 flex items-center`} style={{ height: '18px' }}>
          <span className="text-[7px] italic">Fill in all applicable spaces. Mark all appropriate boxes with an "X".</span>
        </div>

        {/* Return Period */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">1</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-4 flex-1`}>
            <span className="text-[9px] font-bold">For the Month</span>
            <span className={FIELD_RO}>{fd.month || fd.return_period?.split('/')[0] || '—'}</span>
            <span className="text-[9px] font-bold">Year</span>
            <span className={FIELD_RO}>{fd.year || fd.return_period?.split('/')[1] || '—'}</span>
          </div>
        </div>

        {/* Amended / Taxes Withheld checkboxes */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">2</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-4 flex-1`}>
            <span className="text-[8px] flex items-center gap-1">
              <span className={`inline-block w-3 h-3 border border-black ${fd.amended_return ? 'bg-black' : ''}`} />
              Amended Return?
            </span>
            <span className="text-[8px] flex items-center gap-1">
              <span className={`inline-block w-3 h-3 border border-black ${fd.any_taxes_withheld !== false ? 'bg-black' : ''}`} />
              Any Taxes Withheld?
            </span>
          </div>
        </div>

        {/* Part I Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part I — Background Information</span>
        </div>

        {/* TIN */}
        <div className="flex" style={{ height: '26px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">3</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">Taxpayer Identification Number (TIN)</span>
            <div className="flex items-center gap-0.5 ml-4">
              {[0,1,2,3].map(i => (
                <span key={i} className="inline-flex items-center justify-center border border-black w-[40px] h-[18px] text-[9px] font-mono text-center">
                  {tin[i] || ''}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* RDO Code */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">4</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">RDO Code</span>
            <span className="inline-flex items-center justify-center border border-black w-[50px] h-[16px] text-[9px] font-mono text-center">
              {fd.rdo_code || ''}
            </span>
          </div>
        </div>

        {/* Taxpayer Name */}
        <div className="flex" style={{ height: '20px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">5</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className={LABEL}>Taxpayer's Name (Last Name, First Name, Middle Name for Individual / Registered Name for Non-Individual)</span>
          </div>
        </div>
        <div className="flex" style={{ height: '22px' }}>
          <div className={`${CELL}`} style={{ width: '24px' }} />
          <div className={`${CELL} flex items-center px-3 flex-1`}>
            <span className={FIELD_RO}>{fd.taxpayer_name || '—'}</span>
          </div>
        </div>

        {/* Registered Address */}
        <div className="flex" style={{ height: '20px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">6</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className={LABEL}>Registered Address</span>
          </div>
          <div className={`${CELL} flex items-center px-1 gap-1`} style={{ width: '100px' }}>
            <span className="text-[8px] font-bold">7</span>
            <span className="text-[8px]">ZIP Code</span>
          </div>
        </div>
        <div className="flex" style={{ height: '22px' }}>
          <div className={`${CELL}`} style={{ width: '24px' }} />
          <div className={`${CELL} flex items-center px-3 flex-1`}>
            <span className={FIELD_RO}>{fd.registered_address || fd.address || '—'}</span>
          </div>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '100px' }}>
            <span className="text-[9px] font-mono">{fd.zip_code || ''}</span>
          </div>
        </div>

        {/* Contact Number */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">8</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">Telephone Number</span>
            <span className="inline-flex items-center border border-black px-2 h-[16px] text-[9px] font-mono">
              {fd.contact_number || ''}
            </span>
          </div>
        </div>

        {/* Category */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">9</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-4 flex-1`}>
            <span className="text-[9px]">Category of Withholding Agent</span>
            <span className="text-[8px] flex items-center gap-1">
              <span className={`inline-block w-3 h-3 border border-black ${fd.category === 'Private' || fd.category_of_agent === 'Private' ? 'bg-black' : ''}`} />
              Private
            </span>
            <span className="text-[8px] flex items-center gap-1">
              <span className={`inline-block w-3 h-3 border border-black ${fd.category === 'Government' || fd.category_of_agent === 'Government' ? 'bg-black' : ''}`} />
              Government
            </span>
          </div>
        </div>

        {/* Part II Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part II — Computation of Tax</span>
        </div>

        {/* Line 12 */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">12</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Total Amount of Taxes Withheld for the Month</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] font-mono tabular-nums">{num(fd.line_12 ?? fd.line_12_total_withheld)}</span>
          </div>
        </div>

        {/* Line 13 */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">13</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Less: Tax Remitted in Return Previously Filed, if this is an Amended Return</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] font-mono tabular-nums">{num(fd.line_13 ?? fd.line_13_prev_remitted)}</span>
          </div>
        </div>

        {/* Line 14 - computed */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">14</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Tax Still Due / (Overremittance) (Item 12 less Item 13)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
            <span className="text-[9px] font-semibold font-mono tabular-nums">{num(fd.line_14 ?? fd.line_14_tax_still_due ?? line14)}</span>
          </div>
        </div>

        {/* Line 15a */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">15a</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Surcharge</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] font-mono tabular-nums">{num(fd.line_15a ?? fd.line_15a_surcharge)}</span>
          </div>
        </div>

        {/* Line 15b */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">15b</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Interest</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] font-mono tabular-nums">{num(fd.line_15b ?? fd.line_15b_interest)}</span>
          </div>
        </div>

        {/* Line 15c */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">15c</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Compromise</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] font-mono tabular-nums">{num(fd.line_15c ?? fd.line_15c_compromise)}</span>
          </div>
        </div>

        {/* Line 16 - computed total */}
        <div className="flex" style={{ height: '30px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">16</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px] font-bold">TOTAL AMOUNT STILL DUE / (Overremittance) (Sum of Items 14, 15a, 15b, 15c)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-yellow-50`} style={{ width: '180px' }}>
            <span className="text-[10px] font-bold font-mono tabular-nums">{num(fd.line_16 ?? fd.line_16_total_due ?? line16)}</span>
          </div>
        </div>

        {/* Declaration */}
        <div className={`${CELL} px-3 py-2`}>
          <p className="text-[7px] leading-[1.4]">
            I declare under the penalties of perjury that this return has been made in good faith, verified by me, and to the best of my knowledge and belief, is true and
            correct, pursuant to the provisions of the National Internal Revenue Code, as amended, and the regulations issued under authority thereof.
          </p>
        </div>

        {/* Signatory */}
        <div className={`${CELL} px-4 py-3`}>
          <div className="flex flex-col items-center gap-1 py-2">
            <span className="w-[300px] text-[10px] text-center border-b border-black py-0.5 font-medium min-h-[18px]">
              {fd.signatory_name || ''}
            </span>
            <span className="text-[7px]">Signature over Printed Name of Withholding Agent/Authorized Representative</span>
            <span className="text-[8px] italic">{fd.signatory_title || ''}</span>
          </div>
          <div className="flex items-center gap-2 text-[7px] mt-2">
            <span>TIN</span>
            <span className="w-[100px] border-b border-black text-[8px] px-1">{fd.signatory_tin || ''}</span>
            <span className="ml-3">Tax Agent Accreditation No.</span>
            <span className="w-[80px] border-b border-black text-[8px] px-1">{fd.agent_accreditation_no || ''}</span>
            <span className="ml-3">Date of Issue</span>
            <span className="border-b border-black text-[8px] w-[80px] px-1">{fd.date_of_issue || ''}</span>
            <span className="ml-3">Date of Expiry</span>
            <span className="border-b border-black text-[8px] w-[80px] px-1">{fd.date_of_expiry || ''}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-2 py-1">
          <span className="text-[6px] text-gray-500">*NOTE: The BIR Data Privacy is in the BIR website (www.bir.gov.ph)</span>
        </div>

      </div>
    </BIRFormZoomWrapper>
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
