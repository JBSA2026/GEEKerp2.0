import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { Loader2, ArrowLeft, Pencil, Printer, History, FileText, Send, FileCheck, AlertTriangle, Link2 } from 'lucide-react'
import { OfficialFormTab } from '../OfficialFormTab'
import { FormDetailsTab } from '../FormDetailsTab'
import { LinkedDocumentsTab } from '../LinkedDocumentsTab'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet } from '../../taxUtils'
import { export2550QPDF } from '@/utils/bir2550QPdf'
import { cn } from '@/lib/utils'
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

function num(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return '0.00'
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function TINDisplay({ value }) {
  let segments = Array.isArray(value) ? [...value] : (value || '').includes('-') ? (value || '').split('-') : []
  if (segments[0] && segments[0].length > 3) {
    const raw = segments[0].replace(/\D/g, '')
    segments = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
  }
  if (!segments.length && typeof value === 'string' && value.length > 0) {
    const raw = value.replace(/\D/g, '')
    segments = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
  }
  while (segments.length < 4) segments.push('')
  segments = segments.slice(0, 4)
  return (
    <div className="flex items-center gap-0.5">
      {segments.map((seg, i) => (
        <div key={i} className="flex items-center">
          {i > 0 && <span className="text-[9px] mx-0.5">-</span>}
          <div className="border border-black px-1.5 py-0.5 min-w-[28px] text-center">
            <span className="text-[9px] font-mono">{seg || ''}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

const CELL = 'border border-black'
const LABEL = 'text-[8px] leading-tight'

export function Form2550QDetail() {
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

  // Computed values (handle both field naming conventions)
  const line14a = parseFloat(fd.line_14a || fd.line_14a_vatable_sales) || 0
  const line14b = parseFloat(fd.line_14b || fd.line_14b_sales_to_govt) || 0
  const line14c = parseFloat(fd.line_14c || fd.line_14c_zero_rated_sales) || 0
  const line14d = parseFloat(fd.line_14d || fd.line_14d_exempt_sales) || 0
  const line15 = parseFloat(fd.line_15 || fd.line_15_total_sales) || (line14a + line14b + line14c + line14d)

  const line16a = parseFloat(fd.line_16a || fd.line_16a_output_tax_vatable) || 0
  const line16b = parseFloat(fd.line_16b || fd.line_16b_output_tax_govt) || 0
  const line17 = parseFloat(fd.line_17 || fd.line_17_total_output_tax) || (line16a + line16b)
  const line18 = parseFloat(fd.line_18) || 0

  const line19a = parseFloat(fd.line_19a || fd.line_19a_purchases_domestic) || 0
  const line19b = parseFloat(fd.line_19b || fd.line_19b_purchases_importation) || 0
  const line19c = parseFloat(fd.line_19c || fd.line_19c_purchases_services) || 0
  const line19d = parseFloat(fd.line_19d) || 0
  const line19e = parseFloat(fd.line_19e) || 0
  const line20 = parseFloat(fd.line_20 || fd.line_20_total_input_tax) || (line19a + line19b + line19c + line19d + line19e)
  const line21 = parseFloat(fd.line_21) || 0
  const line22 = parseFloat(fd.line_22 || fd.line_22_allowable_input) || (line20 - line21)

  const line23 = parseFloat(fd.line_23 || fd.line_23_net_vat_payable) || (line17 - line22 - line18)
  const line24 = parseFloat(fd.line_24) || 0
  const line25 = parseFloat(fd.line_25 || fd.line_25_tax_still_due) || (line23 - line24)
  const line26a = parseFloat(fd.line_26a || fd.line_26a_surcharge) || 0
  const line26b = parseFloat(fd.line_26b || fd.line_26b_interest) || 0
  const line26c = parseFloat(fd.line_26c || fd.line_26c_compromise) || 0
  const line27 = parseFloat(fd.line_27) || (line26a + line26b + line26c)
  const line28 = parseFloat(fd.line_28 || fd.line_28_total_due) || (line25 + line27)

  const quarter = fd.quarter || Math.ceil((new Date().getMonth() + 1) / 3)
  const year = fd.year || new Date().getFullYear()

  const QUARTERS_LABEL = { 1: 'Q1 (Jan–Mar)', 2: 'Q2 (Apr–Jun)', 3: 'Q3 (Jul–Sep)', 4: 'Q4 (Oct–Dec)' }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/tax/forms')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <span className="text-sm font-semibold text-[var(--color-text)]">BIR 2550Q</span>
            <span className="ml-2 text-xs text-[var(--color-muted-fg)]">{fd.return_period || `${form.period_from} to ${form.period_to}`}</span>
          </div>
          <StatusBadge status={form.status} />
        </div>
        <div className="flex items-center gap-2">
          {form.status === 'DRAFT' && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/tax/forms/2550Q/${formId}/edit`)}>
                <Pencil size={14} /> <span className="ml-1">Edit</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowApprovalModal(true)}>
                <Send size={14} /> <span className="ml-1">Submit</span>
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => export2550QPDF(fd)}>
            <Printer size={14} /> <span className="ml-1">Export PDF</span>
          </Button>
        </div>
      </div>

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
            <tab.icon size={13} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={cn('flex-1 overflow-y-auto', activeTab === 'history' ? 'p-6' : '')}>
        {activeTab === 'details' && <FormDetailsTab form={form} />}
        {activeTab === 'linked' && <LinkedDocumentsTab formRecordId={formId} />}
        {activeTab === 'view' ? <BIRFormZoomWrapper><FormViewContent fd={fd} line15={line15} line17={line17} line18={line18} line20={line20} line21={line21} line22={line22} line23={line23} line24={line24} line25={line25} line26a={line26a} line26b={line26b} line26c={line26c} line27={line27} line28={line28} line14a={line14a} line14b={line14b} line14c={line14c} line14d={line14d} line16a={line16a} line16b={line16b} line19a={line19a} line19b={line19b} line19c={line19c} line19d={line19d} line19e={line19e} quarter={quarter} year={year} QUARTERS_LABEL={QUARTERS_LABEL} /></BIRFormZoomWrapper> : null}
        {activeTab === 'history' && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
            {history.length ? (
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-[var(--color-surface-2)]">
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-muted-fg)]">Action</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-muted-fg)]">Details</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-muted-fg)]">By</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-muted-fg)]">Date</th>
                </tr></thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{h.action}</td>
                      <td className="px-4 py-2 text-[var(--color-muted-fg)]">{h.details || '—'}</td>
                      <td className="px-4 py-2">{h.performed_by || '—'}</td>
                      <td className="px-4 py-2 text-[var(--color-muted-fg)]">{h.created_at ? new Date(h.created_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-6 text-center text-sm text-[var(--color-muted-fg)]">No history yet.</p>
            )}
          </div>
        )}
        {activeTab === 'official' && <OfficialFormTab formRecordId={formId} />}
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--color-surface)] rounded-xl p-6 w-[400px] shadow-xl space-y-4">
            <h3 className="text-sm font-semibold">Submit for Approval</h3>
            <select value={selectedApprover} onChange={e => setSelectedApprover(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
              <option value="">Select approver...</option>
              {approvers.map(a => (
                <option key={a.employee_id} value={a.employee_id}>{a.first_name} {a.last_name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowApprovalModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSubmitForApproval} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : 'Submit'}
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
    </div>
  )
}


function FormViewContent({ fd, line15, line17, line18, line20, line21, line22, line23, line24, line25, line26a, line26b, line26c, line27, line28, line14a, line14b, line14c, line14d, line16a, line16b, line19a, line19b, line19c, line19d, line19e, quarter, year, QUARTERS_LABEL }) {
  return (
      <div className="mx-auto bg-white shadow-lg" style={{ width: '794px', minHeight: '1123px', padding: 0, border: '2px solid black' }}>

        {/* Header */}
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

        {/* Form Number + Title */}
        <div className="flex" style={{ height: '60px' }}>
          <div className={`${CELL} px-2 flex flex-col justify-center`} style={{ width: '120px' }}>
            <span className="text-[7px]">BIR Form No.</span>
            <span className="text-[20px] font-bold leading-none">2550Q</span>
            <span className="text-[6px] text-gray-600">July 2008 (ENCS)</span>
          </div>
          <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
            <span className="text-[12px] font-bold">Quarterly Value-Added Tax Return</span>
          </div>
          <div className={`${CELL} flex items-end justify-center pb-1`} style={{ width: '140px' }}>
            <span className="text-[7px]">2550Q 07/08ENCS</span>
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
            <span className="text-[9px] font-bold">For the Quarter</span>
            <span className="text-[9px] border border-black px-2 py-0.5">{QUARTERS_LABEL[quarter] || ''}</span>
            <span className="text-[9px] font-bold">Year</span>
            <span className="text-[9px] border border-black px-2 py-0.5">{year}</span>
          </div>
        </div>

        {/* Part I Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part I — Background Information</span>
        </div>

        {/* TIN */}
        <div className="flex" style={{ height: '26px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">2</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">Taxpayer Identification Number (TIN)</span>
            <div className="ml-4">
              <TINDisplay value={fd.tin} />
            </div>
          </div>
        </div>

        {/* RDO Code */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">3</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[9px]">RDO Code</span>
            <span className="text-[9px] border border-black px-2 py-0.5 min-w-[50px] text-center">{fd.rdo_code || ''}</span>
          </div>
        </div>

        {/* Taxpayer Name */}
        <div className="flex" style={{ height: '20px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">4</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className={LABEL}>Taxpayer's Name (Registered Name)</span>
          </div>
        </div>
        <div className="flex" style={{ height: '22px' }}>
          <div className={`${CELL}`} style={{ width: '24px' }} />
          <div className={`${CELL} flex items-center px-3 flex-1`}>
            <span className="text-[9px]">{fd.taxpayer_name || ''}</span>
          </div>
        </div>

        {/* Registered Address */}
        <div className="flex" style={{ height: '20px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">5</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className={LABEL}>Registered Address</span>
          </div>
          <div className={`${CELL} flex items-center px-1 gap-1`} style={{ width: '100px' }}>
            <span className="text-[8px] font-bold">6</span>
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

        {/* Contact + Industry */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">7</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2`} style={{ width: '350px' }}>
            <span className="text-[9px]">Telephone Number</span>
            <span className="text-[9px] border border-black px-2 py-0.5">{fd.contact_number || ''}</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
            <span className="text-[8px] font-bold">8</span>
            <span className="text-[9px]">Industry Classification</span>
            <span className="text-[9px] border border-black px-2 py-0.5 flex-1">{fd.industry_classification || ''}</span>
          </div>
        </div>


        {/* Part IV Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part IV — Taxable Sales/Receipts and Output Tax</span>
        </div>

        {/* Line 14a */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">14a</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Vatable Sales (from AR)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line14a)}</span>
          </div>
        </div>

        {/* Line 14b */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">14b</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Sales to Government</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line14b)}</span>
          </div>
        </div>

        {/* Line 14c */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">14c</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Zero-Rated Sales</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line14c)}</span>
          </div>
        </div>

        {/* Line 14d */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">14d</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Exempt Sales</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line14d)}</span>
          </div>
        </div>

        {/* Line 15 - Total Sales */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">15</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px] font-bold">Total Sales (14a + 14b + 14c + 14d)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
            <span className="text-[9px] font-semibold tabular-nums">{num(line15)}</span>
          </div>
        </div>

        {/* Part V Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part V — Output Tax</span>
        </div>

        {/* Line 16a */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">16a</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Output Tax on Vatable Sales</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line16a)}</span>
          </div>
        </div>

        {/* Line 16b */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">16b</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Output Tax on Sales to Government</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line16b)}</span>
          </div>
        </div>

        {/* Line 17 - Total Output Tax */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">17</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px] font-bold">Total Output Tax (16a + 16b)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
            <span className="text-[9px] font-semibold tabular-nums">{num(line17)}</span>
          </div>
        </div>

        {/* Line 18 */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">18</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Less: Input Tax Carried Over from Previous Quarter</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line18)}</span>
          </div>
        </div>


        {/* Part VI Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part VI — Allowable Input Tax</span>
        </div>

        {/* Line 19a */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">19a</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Purchases of Goods - Domestic (from AP)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line19a)}</span>
          </div>
        </div>

        {/* Line 19b */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">19b</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Purchases - Importation</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line19b)}</span>
          </div>
        </div>

        {/* Line 19c */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">19c</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Purchases of Services - Domestic</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line19c)}</span>
          </div>
        </div>

        {/* Line 19d */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">19d</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Capital Goods - Domestic</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line19d)}</span>
          </div>
        </div>

        {/* Line 19e */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">19e</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Capital Goods - Importation</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line19e)}</span>
          </div>
        </div>

        {/* Line 20 - Total Input Tax */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">20</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px] font-bold">Total Input Tax (19a + 19b + 19c + 19d + 19e)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
            <span className="text-[9px] font-semibold tabular-nums">{num(line20)}</span>
          </div>
        </div>

        {/* Line 21 */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">21</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Deferred Input Tax</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line21)}</span>
          </div>
        </div>

        {/* Line 22 - Allowable Input Tax */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">22</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px] font-bold">Allowable Input Tax (20 - 21)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
            <span className="text-[9px] font-semibold tabular-nums">{num(line22)}</span>
          </div>
        </div>


        {/* Part VII Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part VII — Tax Due</span>
        </div>

        {/* Line 23 */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">23</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Net VAT Payable / (Excess Input VAT) (17 - 22)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
            <span className="text-[9px] font-semibold tabular-nums">{num(line23)}</span>
          </div>
        </div>

        {/* Line 24 */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">24</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Less: Tax Credit/Payments</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line24)}</span>
          </div>
        </div>

        {/* Line 25 */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">25</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px] font-bold">Tax Still Due (23 - 24)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
            <span className="text-[9px] font-semibold tabular-nums">{num(line25)}</span>
          </div>
        </div>

        {/* Line 26a */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">26a</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Surcharge</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line26a)}</span>
          </div>
        </div>

        {/* Line 26b */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">26b</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Interest</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line26b)}</span>
          </div>
        </div>

        {/* Line 26c */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[8px] font-bold">26c</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Compromise</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
            <span className="text-[9px] tabular-nums">{num(line26c)}</span>
          </div>
        </div>

        {/* Line 27 */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">27</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px]">Total Penalties (26a + 26b + 26c)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
            <span className="text-[9px] font-semibold tabular-nums">{num(line27)}</span>
          </div>
        </div>

        {/* Line 28 - TOTAL AMOUNT DUE */}
        <div className="flex" style={{ height: '30px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">28</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className="text-[9px] font-bold">TOTAL AMOUNT DUE (25 + 27)</span>
          </div>
          <div className={`${CELL} flex items-center justify-end px-2 bg-yellow-50`} style={{ width: '180px' }}>
            <span className="text-[10px] font-bold tabular-nums">{num(line28)}</span>
          </div>
        </div>

        {/* Monthly Breakdown Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Monthly Breakdown</span>
        </div>

        <div className={`${CELL} p-2`}>
          <table className="w-full border-collapse text-[8px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-black px-1 py-1 text-left font-semibold" style={{ width: '80px' }}>Month</th>
                <th className="border border-black px-1 py-1 text-right font-semibold">Sales</th>
                <th className="border border-black px-1 py-1 text-right font-semibold">Purchases</th>
                <th className="border border-black px-1 py-1 text-right font-semibold">VAT Payable</th>
              </tr>
            </thead>
            <tbody>
              {(fd.monthly_breakdown || [{ month: 1 }, { month: 2 }, { month: 3 }]).map((row, idx) => {
                const monthNum = (quarter - 1) * 3 + idx + 1
                const monthName = new Date(2000, monthNum - 1, 1).toLocaleString('en', { month: 'long' })
                return (
                  <tr key={idx}>
                    <td className="border border-black px-1 py-0.5 text-[8px]">{monthName}</td>
                    <td className="border border-black px-1 py-0.5 text-right text-[8px]">{num(row.sales)}</td>
                    <td className="border border-black px-1 py-0.5 text-right text-[8px]">{num(row.purchases)}</td>
                    <td className="border border-black px-1 py-0.5 text-right text-[8px]">{num(row.vat || row.output_vat)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
            <span className="text-[10px] border-b border-black px-4 py-0.5 min-w-[300px] text-center">{fd.signatory_name || ''}</span>
            <span className="text-[7px]">Signature over Printed Name of Taxpayer/Authorized Representative</span>
            <span className="text-[8px] italic">{fd.signatory_title || ''}</span>
          </div>
          <div className="flex items-center gap-2 text-[7px] mt-2">
            <span>TIN</span>
            <span className="border-b border-black px-2 py-0.5 min-w-[100px] text-[8px]">{fd.signatory_tin || ''}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-2 py-1">
          <span className="text-[6px] text-gray-500">*NOTE: The BIR Data Privacy is in the BIR website (www.bir.gov.ph)</span>
        </div>

      </div>
  )
}
