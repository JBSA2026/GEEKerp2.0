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
import { export0605PDF } from '@/utils/bir0605Pdf'
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

export function Form0605Detail() {
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
            <span className="text-sm font-semibold text-[var(--color-text)]">BIR 0605</span>
            <StatusBadge status={form.status} />
            <span className="text-xs text-[var(--color-muted-fg)]">• {form.payor_name}</span>
            <span className="text-xs text-[var(--color-muted-fg)]">• {form.period_from} to {form.period_to}</span>
          </div>
        </div>
        {form.status === 'DRAFT' && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/tax/forms/0605/${formId}/edit`)}>
            <Pencil size={14} /> Edit
          </Button>
        )}
        {form.status === 'DRAFT' && (
          <Button size="sm" onClick={() => setShowApprovalModal(true)} className="bg-blue-600 hover:bg-blue-700">
            <Send size={14} /> Submit for Approval
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => export0605PDF(fd)}>
          <Printer size={14} /> Export PDF
        </Button>
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Submit BIR 0605 for Approval</h3>
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
const CELL = 'border border-black'
const LABEL = 'text-[8px] leading-tight'

const MONTHS_LABEL = {
  1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June',
  7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December',
}

function num(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return '0.00'
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function TINBoxes({ value }) {
  let parts = Array.isArray(value) ? [...value] : (value || '').includes('-') ? (value || '').split('-') : []
  if (parts[0] && parts[0].length > 3) {
    const raw = parts[0].replace(/\D/g, '')
    parts = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
  }
  if (!parts.length && typeof value === 'string' && value.length > 0) {
    const raw = value.replace(/\D/g, '')
    parts = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
  }
  while (parts.length < 4) parts.push('')
  const p = parts.slice(0, 4)
  return (
    <div className="flex items-center gap-0.5">
      {p.map((seg, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <span className="text-[9px] mx-0.5">-</span>}
          {seg.split('').map((ch, j) => (
            <span key={j} className="inline-flex items-center justify-center border border-black w-[10px] h-[12px] text-[8px] leading-none">{ch}</span>
          ))}
          {!seg && (
            <span className="inline-flex items-center justify-center border border-black w-[10px] h-[12px] text-[8px] leading-none" />
          )}
        </span>
      ))}
    </div>
  )
}

function Checkbox({ checked }) {
  return (
    <span className="inline-flex items-center justify-center border border-black w-[10px] h-[10px] text-[7px] leading-none font-bold">
      {checked ? 'X' : ''}
    </span>
  )
}

function FormViewTab({ fd }) {
  const basicTax = parseFloat(fd.basic_tax) || 0
  const surcharge = parseFloat(fd.surcharge) || 0
  const interest = parseFloat(fd.interest) || 0
  const compromise = parseFloat(fd.compromise) || 0
  const totalPayable = parseFloat(fd.total_amount_payable) || (basicTax + surcharge + interest + compromise)
  const filingMonth = fd.filing_month || fd.month || ''
  const filingYear = fd.filing_year || fd.year || ''

  return (
    <BIRFormZoomWrapper>
      <div className="mx-auto bg-white shadow-lg" style={{ width: '794px', minHeight: '1123px', padding: 0, border: '2px solid black' }}>

        {/* Header */}
        <div className="flex" style={{ height: '48px' }}>
          <div className={`${CELL} flex flex-col justify-center px-1`} style={{ width: '80px' }}>
            <span className="text-[7px]">For BIR</span>
            <span className="text-[7px]">Use Only</span>
          </div>
          <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
            <span className="text-[9px]">Republic of the Philippines</span>
            <span className="text-[9px]">Department of Finance</span>
            <span className="text-[9px] font-bold">Bureau of Internal Revenue</span>
          </div>
          <div className={`${CELL}`} style={{ width: '140px' }} />
        </div>

        {/* Form Number + Title */}
        <div className="flex" style={{ height: '60px' }}>
          <div className={`${CELL} px-2 flex flex-col justify-center`} style={{ width: '120px' }}>
            <span className="text-[7px]">BIR Form No.</span>
            <span className="text-[20px] font-bold leading-none">0605</span>
            <span className="text-[6px] text-gray-600">January 2018 (ENCS)</span>
          </div>
          <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
            <span className="text-[12px] font-bold">Payment Form</span>
          </div>
          <div className={`${CELL} flex items-end justify-center pb-1`} style={{ width: '140px' }}>
            <span className="text-[7px]">0605 01/18ENCS</span>
          </div>
        </div>

        {/* Instruction */}
        <div className={`${CELL} px-2 flex items-center`} style={{ height: '18px' }}>
          <span className="text-[7px] italic">Fill in all applicable spaces. Mark all appropriate boxes with an &quot;X&quot;.</span>
        </div>

        {/* Filing Period */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">1</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-4 flex-1`}>
            <span className="text-[9px] font-bold">Filing Period</span>
            <span className="text-[9px]">{MONTHS_LABEL[filingMonth] || filingMonth || '—'}</span>
            <span className="text-[9px]">{filingYear || '—'}</span>
          </div>
        </div>

        {/* Amended Return */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">2</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <Checkbox checked={fd.amended_return} />
            <span className="text-[8px]">Amended Return?</span>
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
            <div className="ml-4"><TINBoxes value={fd.tin} /></div>
          </div>
        </div>

        {/* RDO Code */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">4</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">RDO Code</span>
            <span className="text-[9px] border border-black px-2 py-0.5 min-w-[40px] text-center">{fd.rdo_code || ''}</span>
          </div>
        </div>

        {/* Taxpayer Name */}
        <div className="flex" style={{ height: '20px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">5</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className={LABEL}>Taxpayer&apos;s Name</span>
          </div>
        </div>
        <div className="flex" style={{ height: '22px' }}>
          <div className={`${CELL}`} style={{ width: '24px' }} />
          <div className={`${CELL} flex items-center px-3 flex-1`}>
            <span className="text-[9px]">{fd.taxpayer_name || ''}</span>
          </div>
        </div>

        {/* Registered Address + ZIP */}
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
            <span className="text-[9px]">{fd.registered_address || ''}</span>
          </div>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '100px' }}>
            <span className="text-[9px]">{fd.zip_code || ''}</span>
          </div>
        </div>

        {/* Contact Number */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">8</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">Telephone Number</span>
            <span className="text-[9px] border border-black px-2 py-0.5 min-w-[120px]">{fd.contact_number || fd.telephone_number || ''}</span>
          </div>
        </div>

        {/* Part II Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part II — Tax Payment Details</span>
        </div>

        {/* Tax Type */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">9</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">Particular Tax Type</span>
            <span className="text-[9px] font-medium">{fd.tax_type || fd.particular_tax_type || '—'}</span>
          </div>
        </div>

        {/* ATC Code */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">10</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">ATC Code</span>
            <span className="text-[9px] font-mono">{fd.atc_code || ''}</span>
          </div>
        </div>

        {/* Return Period */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">11</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">Return Period</span>
            <span className="text-[9px]">{fd.return_period || ''}</span>
          </div>
        </div>

        {/* Basic Tax */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">12</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Basic Tax/Deposit</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(fd.basic_tax)}</span>
          </div>
        </div>

        {/* Surcharge */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">13</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Surcharge</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(fd.surcharge)}</span>
          </div>
        </div>

        {/* Interest */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">14</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Interest</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(fd.interest)}</span>
          </div>
        </div>

        {/* Compromise */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">15</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Compromise</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(fd.compromise)}</span>
          </div>
        </div>

        {/* Total Amount Payable */}
        <div className="flex" style={{ height: '30px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">16</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px] font-bold">TOTAL AMOUNT PAYABLE (12 + 13 + 14 + 15)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-yellow-50`} style={{ width: '180px' }}>
            <span className="text-[10px] font-bold tabular-nums">{num(totalPayable)}</span>
          </div>
        </div>

        {/* Part III Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part III — Details of Payment</span>
        </div>

        {/* Drawee Bank */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">17</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">Drawee Bank</span>
            <span className="text-[9px]">{fd.drawee_bank || ''}</span>
          </div>
        </div>

        {/* Number / Date / Amount */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">18</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">Number</span>
            <span className="text-[9px]">{fd.payment_number || ''}</span>
            <span className="text-[9px] ml-4">Date</span>
            <span className="text-[9px]">{fd.payment_date || ''}</span>
            <span className="text-[9px] ml-4">Amount</span>
            <span className="text-[9px] tabular-nums">{num(fd.payment_amount)}</span>
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
            <span className="text-[10px] text-center border-b border-black px-4 py-0.5 min-w-[300px]">{fd.signatory_name || ''}</span>
            <span className="text-[7px]">Signature over Printed Name of Taxpayer/Authorized Representative</span>
            <span className="text-[8px] italic">{fd.signatory_title || fd.title_position || ''}</span>
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
