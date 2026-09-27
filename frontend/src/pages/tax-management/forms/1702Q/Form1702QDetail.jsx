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
import { export1702QPDF } from '@/utils/bir1702QPdf'
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

export function Form1702QDetail() {
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
            <span className="text-sm font-semibold text-[var(--color-text)]">BIR 1702Q</span>
            <StatusBadge status={form.status} />
            {form.form_code && <span className="font-mono text-xs font-medium text-[var(--color-primary)]">{form.form_code}</span>}
            <span className="text-xs text-[var(--color-muted-fg)]">• {form.payor_name || fd.registered_name}</span>
            <span className="text-xs text-[var(--color-muted-fg)]">• {form.period_from} to {form.period_to}</span>
          </div>
        </div>
        {form.status === 'DRAFT' && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/tax/forms/1702Q/${formId}/edit`)}>
            <Pencil size={14} /> Edit
          </Button>
        )}
        {form.status === 'DRAFT' && (
          <Button size="sm" onClick={() => setShowApprovalModal(true)} className="bg-blue-600 hover:bg-blue-700">
            <Send size={14} /> Submit for Approval
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => export1702QPDF(fd)}>
          <Printer size={14} /> Export PDF
        </Button>
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Submit BIR 1702Q for Approval</h3>
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

function FormViewTab({ fd }) {
  const num = (v) => {
    const n = parseFloat(v)
    if (!n || isNaN(n)) return '0.00'
    return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  let tinSegments = Array.isArray(fd.tin) ? [...fd.tin] : (fd.tin || '').includes('-') ? (fd.tin || '').split('-') : []
  if (tinSegments[0] && tinSegments[0].length > 3) {
    const raw = tinSegments[0].replace(/\D/g, '')
    tinSegments = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
  }
  if (!tinSegments.length && typeof fd.tin === 'string' && fd.tin.length > 0) {
    const raw = fd.tin.replace(/\D/g, '')
    tinSegments = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
  }
  while (tinSegments.length < 4) tinSegments.push('')
  tinSegments = tinSegments.slice(0, 4)
  const quarter = fd.quarter || ''
  const year = fd.year || ''

  return (
    <BIRFormZoomWrapper>
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

        {/* BIR Form No. | Title */}
        <div className="flex" style={{ height: '60px' }}>
          <div className={`${CELL} px-2 flex flex-col justify-center`} style={{ width: '120px' }}>
            <span className="text-[7px]">BIR Form No.</span>
            <span className="text-[24px] font-bold leading-none">1702Q</span>
            <span className="text-[6px] text-gray-600">January 2018 (ENCS)</span>
          </div>
          <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
            <span className="text-[14px] font-bold">Quarterly Income Tax Return</span>
            <span className="text-[8px]">For Corporations, Partnerships and Other Non-Individual Taxpayers</span>
          </div>
          <div className={`${CELL} flex items-end justify-center pb-1`} style={{ width: '140px' }}>
            <span className="text-[7px]">1702Q 01/18ENCS</span>
          </div>
        </div>

        {/* Period / Quarter / ATC */}
        <div className="flex" style={{ height: '28px' }}>
          <div className={`${CELL} flex items-center px-2 gap-2`} style={{ width: '25%' }}>
            <span className="text-[9px] font-bold">1</span>
            <span className={LABEL}>Calendar/Fiscal</span>
            <span className="text-[9px] border border-black px-1.5 py-0.5">{fd.calendar_fiscal || 'Calendar'}</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2`} style={{ width: '25%' }}>
            <span className="text-[9px] font-bold">2</span>
            <span className={LABEL}>Year Ended</span>
            <span className="text-[9px] border border-black px-1.5 py-0.5">{year}</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2`} style={{ width: '25%' }}>
            <span className="text-[9px] font-bold">3</span>
            <span className={LABEL}>Quarter</span>
            <span className="text-[9px] border border-black px-1.5 py-0.5">{quarter}</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2`} style={{ width: '25%' }}>
            <span className="text-[9px] font-bold">5</span>
            <span className={LABEL}>ATC</span>
            <span className="text-[9px] border border-black px-1.5 py-0.5">{fd.atc || ''}</span>
          </div>
        </div>

        {/* Amended Return */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center px-2 gap-4 flex-1`}>
            <span className="text-[8px]">Amended Return?</span>
            <span className="text-[9px]">{fd.amended_return ? '☑' : '☐'}</span>
          </div>
        </div>

        {/* Part I Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part I — Background Information</span>
        </div>

        {/* TIN + RDO */}
        <div className="flex" style={{ height: '26px' }}>
          <div className={`${CELL} flex items-center px-2 gap-2`} style={{ width: '60%' }}>
            <span className="text-[9px] font-bold">6</span>
            <span className="text-[9px]">TIN</span>
            <div className="flex items-center gap-0.5 ml-2">
              {tinSegments.map((seg, i) => (
                <span key={i} className="flex items-center">
                  {i > 0 && <span className="text-[9px] mx-0.5">-</span>}
                  <span className="border border-black px-1.5 py-0.5 text-[9px] font-mono min-w-[28px] text-center">{seg}</span>
                </span>
              ))}
            </div>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-2`} style={{ width: '40%' }}>
            <span className="text-[9px] font-bold">7</span>
            <span className="text-[9px]">RDO Code</span>
            <span className="border border-black px-2 py-0.5 text-[9px] text-center min-w-[50px]">{fd.rdo_code || ''}</span>
          </div>
        </div>

        {/* Registered Name */}
        <div className="flex" style={{ height: '20px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">8</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className={LABEL}>Registered Name</span>
          </div>
        </div>
        <div className="flex" style={{ height: '22px' }}>
          <div className={`${CELL}`} style={{ width: '24px' }} />
          <div className={`${CELL} flex items-center px-3 flex-1`}>
            <span className="text-[9px]">{fd.registered_name || ''}</span>
          </div>
        </div>

        {/* Registered Address */}
        <div className="flex" style={{ height: '20px' }}>
          <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
            <span className="text-[9px] font-bold">9</span>
          </div>
          <div className={`${CELL} flex items-center px-2 flex-1`}>
            <span className={LABEL}>Registered Address</span>
          </div>
        </div>
        <div className="flex" style={{ height: '22px' }}>
          <div className={`${CELL}`} style={{ width: '24px' }} />
          <div className={`${CELL} flex items-center px-3 flex-1`}>
            <span className="text-[9px]">{fd.registered_address || ''}</span>
          </div>
        </div>

        {/* ZIP / Contact / Email */}
        <div className="flex" style={{ height: '24px' }}>
          <div className={`${CELL} flex items-center px-2 gap-1`} style={{ width: '33%' }}>
            <span className="text-[8px] font-bold">9A</span>
            <span className="text-[8px]">ZIP Code</span>
            <span className="border border-black px-1.5 py-0.5 text-[9px] min-w-[40px] text-center">{fd.zip_code || ''}</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-1`} style={{ width: '34%' }}>
            <span className="text-[8px] font-bold">10</span>
            <span className="text-[8px]">Contact Number</span>
            <span className="border border-black px-1.5 py-0.5 text-[9px] min-w-[80px]">{fd.contact_number || ''}</span>
          </div>
          <div className={`${CELL} flex items-center px-2 gap-1`} style={{ width: '33%' }}>
            <span className="text-[8px] font-bold">11</span>
            <span className="text-[8px]">Email</span>
            <span className="border border-black px-1.5 py-0.5 text-[9px] min-w-[80px]">{fd.email || ''}</span>
          </div>
        </div>

        {/* Schedule 2 Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Schedule 2 — Declaration This Quarter (Regular/Normal Rate)</span>
        </div>

        {/* Schedule 2 lines */}
        {[
          ['1', 'Sales/Receipts/Revenues/Fees', 'sched2_line1_sales'],
          ['2', 'Less: Cost of Sales/Services', 'sched2_line2_cost_of_sales'],
          ['3', 'Gross Income from Operation (1 Less 2)', 'sched2_line3_gross_income'],
          ['4', 'Add: Non-Operating and Other Taxable Income', 'sched2_line4_non_operating'],
          ['5', 'Total Gross Income (3 + 4)', 'sched2_line5_total_gross'],
          ['6', 'Less: Deductions', 'sched2_line6_deductions'],
          ['7', 'Taxable Income This Quarter (5 less 6)', 'sched2_line7_taxable_this_qtr'],
          ['8', 'Add: Taxable Income Previous Quarter/s', 'sched2_line8_taxable_prev_qtrs'],
          ['9', 'Total Taxable Income to Date (7 + 8)', 'sched2_line9_total_taxable'],
          ['10', 'Applicable Income Tax Rate (%)', 'sched2_line10_tax_rate'],
          ['11', 'Income Tax Due (9 × 10)', 'sched2_line11_income_tax_due'],
          ['12', 'Minimum Corporate Income Tax (MCIT)', 'sched2_line12_mcit'],
          ['13', 'Income Tax Due (higher of 11 or 12)', 'sched2_line13_tax_due'],
        ].map(([lineNum, label, field]) => (
          <div key={field} className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">{lineNum}</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">{label}</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <span className="text-[9px] tabular-nums">{field === 'sched2_line10_tax_rate' ? (fd[field] || '25') : num(fd[field])}</span>
            </div>
          </div>
        ))}

        {/* Schedule 4 Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Schedule 4 — Tax Credits/Payments</span>
        </div>

        {/* Schedule 4 lines */}
        {[
          ['1', "Prior Year's Excess Credits", 'sched4_line1_prior_year_excess'],
          ['2', 'Tax Payments for Previous Quarter/s', 'sched4_line2_prev_qtr_payments'],
          ['3', 'MCIT Payments Previous Quarter/s', 'sched4_line3_mcit_prev_qtrs'],
          ['4', 'Creditable Tax Withheld Previous Quarter/s', 'sched4_line4_cwt_prev_qtrs'],
          ['5', 'Creditable Tax Withheld per BIR 2307 This Quarter', 'sched4_line5_cwt_2307_this_qtr'],
          ['6', 'Tax Paid in Return Previously Filed (Amended)', 'sched4_line6_tax_prev_filed'],
          ['7', 'Total Tax Credits/Payments (Sum 1–6)', 'sched4_line7_total_credits'],
        ].map(([lineNum, label, field]) => (
          <div key={field} className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">{lineNum}</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">{label}</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <span className="text-[9px] tabular-nums">{num(fd[field])}</span>
            </div>
          </div>
        ))}

        {/* Part II Header */}
        <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
          <span className="text-[9px] font-bold">Part II — Computation of Tax Due</span>
        </div>

        {/* Part II lines */}
        {[
          ['14', 'Income Tax Due (from Schedule 2)', 'part2_line14_tax_due'],
          ['19', 'Total Tax Credits/Payments (from Schedule 4)', 'part2_line19_total_credits'],
          ['20', 'Tax Payable (14 less 19)', 'part2_line20_tax_payable'],
          ['21a', 'Surcharge', 'part2_line21a_surcharge'],
          ['21b', 'Interest', 'part2_line21b_interest'],
          ['21c', 'Compromise', 'part2_line21c_compromise'],
          ['22', 'Total Penalties', 'part2_line22_total_penalties'],
          ['25', 'TOTAL AMOUNT DUE', 'part2_line25_total_due'],
        ].map(([lineNum, label, field]) => {
          const isTotalDue = lineNum === '25'
          return (
            <div key={field} className="flex" style={{ height: isTotalDue ? '30px' : '28px' }}>
              <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
                <span className="text-[9px] font-bold">{lineNum}</span>
              </div>
              <div className={`${CELL} flex items-center px-2 flex-1`}>
                <span className={cn('text-[9px]', isTotalDue && 'font-bold')}>{label}</span>
              </div>
              <div className={cn(`${CELL} flex items-center justify-end px-2`, isTotalDue && 'bg-yellow-50')} style={{ width: '180px' }}>
                <span className={cn('text-[9px] tabular-nums', isTotalDue && 'text-[10px] font-bold')}>{num(fd[field])}</span>
              </div>
            </div>
          )
        })}

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
            <span className="text-[10px] text-center border-b border-black min-w-[300px] pb-0.5">{fd.signatory_name || ''}</span>
            <span className="text-[7px]">Signature over Printed Name of President/Principal Officer/Authorized Representative</span>
            <span className="text-[8px] italic">{fd.signatory_title || ''}</span>
          </div>
          <div className="flex items-center gap-2 text-[7px] mt-2">
            <span>TIN</span>
            <span className="border-b border-black min-w-[100px] text-[8px] px-1">{fd.signatory_tin || ''}</span>
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
