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
import { export2316PDF } from '@/utils/bir2316Pdf'
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
  if (!n || isNaN(n)) return ''
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function TINDisplay({ value = ['', '', '', ''] }) {
  let segments = Array.isArray(value) ? [...value] : (value || '').includes('-') ? (value || '').split('-') : []
  // If first segment is too long (full TIN crammed in one slot), re-split
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
    <div className="inline-flex items-center">
      {segments.map((seg, idx) => (
        <div key={idx} className="flex items-center">
          <div className="w-[28px] h-[16px] border border-black flex items-center justify-center">
            <span className="text-[9px]">{seg}</span>
          </div>
          {idx < 3 && (
            <span className="w-[10px] text-center text-[11px] font-bold leading-none">-</span>
          )}
        </div>
      ))}
    </div>
  )
}

function CheckBox({ checked }) {
  return (
    <span className="inline-flex items-center justify-center w-[12px] h-[12px] border border-black text-[8px] leading-none">
      {checked ? '■' : ''}
    </span>
  )
}

const CELL = 'border border-black'
const LABEL = 'text-[8px] leading-tight'

export function Form2316Detail() {
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
    try { setHistory(await apiGet(`/tax/bir-forms/${formId}/history`) || []) }
    catch { /* ignore */ }
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
            <span className="text-sm font-semibold text-[var(--color-text)]">BIR 2316</span>
            <StatusBadge status={form.status} />
            {form.form_code && <span className="font-mono text-xs font-medium text-[var(--color-primary)]">{form.form_code}</span>}
            <span className="text-xs text-[var(--color-muted-fg)]">• {fd.employee_name || '—'}</span>
            <span className="text-xs text-[var(--color-muted-fg)]">• {fd.tax_year || form.period_from?.slice(0, 4)}</span>
          </div>
        </div>
        {form.status === 'DRAFT' && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/tax/forms/2316/${formId}/edit`)}>
            <Pencil size={14} /> Edit
          </Button>
        )}
        {form.status === 'DRAFT' && (
          <Button size="sm" onClick={() => setShowApprovalModal(true)} className="bg-blue-600 hover:bg-blue-700">
            <Send size={14} /> Submit for Approval
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => export2316PDF(fd)}>
          <Printer size={14} /> Export PDF
        </Button>
      </div>

      {/* Submit for Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Submit BIR 2316 for Approval</h3>
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
  // Handle both possible field name formats
  const employeeTin = fd.employee_tin || fd.employeeTin || ['', '', '', '']
  const employerTin = fd.employer_tin || fd.employerTin || ['', '', '', '']
  const employeeName = fd.employee_name || fd.employeeName || ''
  const employeeAddress = fd.employee_address || fd.employeeAddress || ''
  const employeeZipCode = fd.employee_zip_code || fd.employeeZipCode || ''
  const dateOfBirth = fd.date_of_birth || fd.dateOfBirth || ''
  const contactNumber = fd.contact_number || fd.contactNumber || ''
  const rdoCode = fd.rdo_code || fd.rdoCode || ''
  const employerName = fd.employer_name || fd.employerName || ''
  const employerAddress = fd.employer_address || fd.employerAddress || ''
  const employerZipCode = fd.employer_zip_code || fd.employerZipCode || ''
  const employerType = fd.employer_type || fd.employerType || 'Main'
  const taxYear = fd.tax_year || fd.taxYear || ''
  const periodFrom = fd.period_from || fd.periodFrom || ''
  const periodTo = fd.period_to || fd.periodTo || ''
  const signatoryName = fd.signatory_name || fd.signatoryName || ''
  const signatoryTitle = fd.signatory_title || fd.signatoryTitle || ''

  return (
    <BIRFormZoomWrapper>
      <div className="mx-auto bg-white shadow-lg" style={{ width: '210mm', minHeight: '297mm', padding: 0, border: '2px solid black' }}>

        {/* Header */}
        <div className={`${CELL} flex items-center justify-between p-1`}>
          <div className="text-[6px]">For BIR Use Only<br />BCS/Item:</div>
          <div className="text-center">
            <div className="text-[7px]">Republic of the Philippines</div>
            <div className="text-[7px]">Department of Finance</div>
            <div className="text-[7px] font-bold">Bureau of Internal Revenue</div>
          </div>
          <div className="text-[6px]">2316 9/21ENCS</div>
        </div>

        {/* Form Title */}
        <div className={`${CELL} flex`}>
          <div className="w-24 border-r border-black p-1">
            <div className={LABEL}>BIR Form No.</div>
            <div className="text-lg font-bold">2316</div>
            <div className="text-[6px]">September 2021 (ENCS)</div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[10px] font-bold">Certificate of Compensation Payment/Tax Withheld</div>
              <div className="text-[7px]">For Compensation Payment With or Without Tax Withheld</div>
            </div>
          </div>
        </div>

        {/* Year & Period */}
        <div className={`${CELL} flex`}>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>1 For the Year </span>
            <span className="text-[9px] px-1">{taxYear}</span>
          </div>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>2 From (MM/DD)</span>
            <span className="text-[9px] px-1">{periodFrom?.slice(5) || '01/01'}</span>
          </div>
          <div className="w-1/3 p-1">
            <span className={LABEL}>To (MM/DD)</span>
            <span className="text-[9px] px-1">{periodTo?.slice(5) || '12/31'}</span>
          </div>
        </div>

        {/* Part I - Employee Information */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part I — Employee Information</div>

        <div className={`${CELL} flex`}>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>3 TIN</span>
            <div className="flex gap-0.5 mt-0.5">
              <TINDisplay value={employeeTin} />
            </div>
          </div>
          <div className="flex-1 border-r border-black p-1">
            <span className={LABEL}>4 Employee&apos;s Name (Last, First, Middle)</span>
            <div className="text-[9px] px-1 mt-0.5">{employeeName}</div>
          </div>
          <div className="w-20 p-1">
            <span className={LABEL}>5 RDO Code</span>
            <div className="text-[9px] px-1 mt-0.5">{rdoCode}</div>
          </div>
        </div>

        <div className={`${CELL} p-1`}>
          <span className={LABEL}>6 Registered Address</span>
          <div className="text-[9px] px-1 mt-0.5">{employeeAddress}</div>
        </div>

        <div className={`${CELL} flex`}>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>6A ZIP Code</span>
            <div className="text-[9px] px-1 mt-0.5">{employeeZipCode}</div>
          </div>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>7 Date of Birth</span>
            <div className="text-[9px] px-1 mt-0.5">{dateOfBirth}</div>
          </div>
          <div className="w-1/4 p-1">
            <span className={LABEL}>8 Contact Number</span>
            <div className="text-[9px] px-1 mt-0.5">{contactNumber}</div>
          </div>
        </div>

        {/* Part II - Employer Information */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part II — Employer Information (Present)</div>

        <div className={`${CELL} flex`}>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>12 TIN</span>
            <div className="flex gap-0.5 mt-0.5">
              <TINDisplay value={employerTin} />
            </div>
          </div>
          <div className="flex-1 border-r border-black p-1">
            <span className={LABEL}>13 Employer&apos;s Name</span>
            <div className="text-[9px] px-1 mt-0.5">{employerName}</div>
          </div>
          <div className="w-28 p-1">
            <span className={LABEL}>Type</span>
            <div className="flex gap-2 mt-0.5">
              <span className="text-[8px] flex items-center gap-0.5"><CheckBox checked={employerType === 'Main'} /> Main</span>
              <span className="text-[8px] flex items-center gap-0.5"><CheckBox checked={employerType === 'Secondary'} /> Secondary</span>
            </div>
          </div>
        </div>

        <div className={`${CELL} flex`}>
          <div className="flex-1 border-r border-black p-1">
            <span className={LABEL}>14 Registered Address</span>
            <div className="text-[9px] px-1 mt-0.5">{employerAddress}</div>
          </div>
          <div className="w-24 p-1">
            <span className={LABEL}>14A ZIP Code</span>
            <div className="text-[9px] px-1 mt-0.5">{employerZipCode}</div>
          </div>
        </div>

        {/* Part IVA - Summary */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part IVA — Summary</div>

        {[
          ['19', 'Gross Compensation Income from Present Employer', 'line_19_gross_compensation'],
          ['20', 'Less: Total Non-Taxable/Exempt Compensation Income', 'line_20_nontaxable_compensation'],
          ['21', 'Taxable Compensation Income from Present Employer (19 - 20)', 'line_21_taxable_present'],
          ['22', 'Add: Taxable Compensation Income from Previous Employer', 'line_22_taxable_previous'],
          ['23', 'Gross Taxable Compensation Income (21 + 22)', 'line_23_gross_taxable'],
          ['24', 'Tax Due', 'line_24_tax_due'],
          ['25A', 'Tax Withheld — Present Employer', 'line_25a_tax_withheld_present'],
          ['25B', 'Tax Withheld — Previous Employer', 'line_25b_tax_withheld_previous'],
          ['26', 'Total Amount of Taxes Withheld as Adjusted', 'line_26_total_withheld_adjusted'],
          ['27', '5% Tax Credit (PERA Act of 2008)', 'line_27_pera_credit'],
          ['28', 'Total Taxes Withheld (26 + 27)', 'line_28_total_taxes_withheld'],
        ].map(([lineNum, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-10 border-r border-black p-0.5 text-center font-bold text-[8px]">{lineNum}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1 text-[9px]">{label}</div>
            <div className="w-32 p-0.5 text-right pr-1">
              <span className="text-[9px]">{num(fd[field])}</span>
            </div>
          </div>
        ))}

        {/* Part IVB - Non-Taxable */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part IV-B — A. Non-Taxable/Exempt Compensation Income</div>

        {[
          ['29', 'Basic Salary (including exempt ₱250,000 & below)', 'line_29_basic_salary'],
          ['30', 'Holiday Pay (MWE)', 'line_30_holiday_pay'],
          ['31', 'Overtime Pay (MWE)', 'line_31_overtime_pay'],
          ['32', 'Night Shift Differential (MWE)', 'line_32_night_shift'],
          ['33', 'Hazard Pay (MWE)', 'line_33_hazard_pay'],
          ['34', '13th Month Pay and Other Benefits (max ₱90,000)', 'line_34_13th_month'],
          ['35', 'De Minimis Benefits', 'line_35_deminimis'],
          ['36', 'SSS, GSIS, PhilHealth & Pag-IBIG Contributions', 'line_36_sss_philhealth_pagibig'],
          ['37', 'Other Non-Taxable Compensation', 'line_37_other_nontaxable'],
          ['38', 'Total Non-Taxable/Exempt Compensation Income', 'line_38_total_nontaxable'],
        ].map(([lineNum, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-10 border-r border-black p-0.5 text-center text-[8px]">{lineNum}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1 text-[9px]">{label}</div>
            <div className="w-32 p-0.5 text-right pr-1">
              <span className="text-[9px]">{num(fd[field])}</span>
            </div>
          </div>
        ))}

        {/* Part IVB - Taxable */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part IV-B — B. Taxable Compensation Income</div>

        {[
          ['39', 'Basic Salary', 'line_39_basic_salary_taxable'],
          ['40', 'Representation', 'line_40_representation'],
          ['41', 'Transportation', 'line_41_transportation'],
          ['42', 'Cost of Living Allowance (COLA)', 'line_42_cola'],
          ['43', 'Fixed Housing Allowance', 'line_43_housing'],
          ['44', 'Others (Allowances)', 'line_44_others'],
          ['45', 'Overtime Pay', 'line_45_overtime_taxable'],
          ['46', 'Commission', 'line_46_commission'],
          ['47', 'Profit Sharing', 'line_47_profit_sharing'],
          ['48', "Fees Including Director's Fees", 'line_48_fees'],
          ['49', 'Taxable 13th Month Benefits', 'line_49_taxable_13th'],
          ['50', 'Hazard Pay', 'line_50_hazard_pay_taxable'],
          ['51', 'Other Taxable Compensation', 'line_51_other_taxable'],
          ['52', 'Total Taxable Compensation Income', 'line_52_total_taxable'],
        ].map(([lineNum, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-10 border-r border-black p-0.5 text-center text-[8px]">{lineNum}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1 text-[9px]">{label}</div>
            <div className="w-32 p-0.5 text-right pr-1">
              <span className="text-[9px]">{num(fd[field])}</span>
            </div>
          </div>
        ))}

        {/* Signatory */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Signatory</div>
        <div className={`${CELL} px-4 py-2`}>
          <div className="flex flex-col items-center gap-1 py-2">
            <div className="w-[300px] border-b border-black text-center py-0.5">
              <span className="text-[10px]">{signatoryName}</span>
            </div>
            <span className="text-[7px]">Signature over Printed Name of Employer/Authorized Representative</span>
          </div>
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-[7px]">Title/Designation:</span>
            <span className="text-[9px] border-b border-black px-2 min-w-[120px] text-center">{signatoryTitle}</span>
          </div>
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
