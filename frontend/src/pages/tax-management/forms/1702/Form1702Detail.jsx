import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { Loader2, ArrowLeft, Pencil, Printer, History, FileText, Send, FileCheck, AlertTriangle, Link2 } from 'lucide-react'
import { OfficialFormTab } from '../OfficialFormTab'
import { FormDetailsTab } from '../FormDetailsTab'
import { LinkedDocumentsTab } from '../LinkedDocumentsTab'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { notify } from '@/utils/toast'
import { apiGet } from '../../taxUtils'
import { export1702PDF } from '@/utils/bir1702Pdf'
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

export function Form1702Detail() {
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
            <span className="text-sm font-semibold text-[var(--color-text)]">BIR 1702-RT</span>
            <StatusBadge status={form.status} />
            {form.form_code && <span className="font-mono text-xs font-medium text-[var(--color-primary)]">{form.form_code}</span>}
            <span className="text-xs text-[var(--color-muted-fg)]">• {fd.registered_name || form.payor_name}</span>
            <span className="text-xs text-[var(--color-muted-fg)]">• {fd.tax_year || form.period_from?.slice(0,4)}</span>
          </div>
        </div>
        {form.status === 'DRAFT' && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/tax/forms/1702/${formId}/edit`)}>
            <Pencil size={14} /> Edit
          </Button>
        )}
        {form.status === 'DRAFT' && (
          <Button size="sm" onClick={() => setShowApprovalModal(true)} className="bg-blue-600 hover:bg-blue-700">
            <Send size={14} /> Submit
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => export1702PDF(fd)}>
          <Printer size={14} /> PDF
        </Button>
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
        {activeTab === 'view' && <FormViewTab fd={fd} />}
        {activeTab === 'history' && <HistoryTab history={history} />}
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
              {approvers.map(a => <option key={a.employee_id} value={a.employee_id}>{a.first_name} {a.last_name}</option>)}
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


/* ── Form View Tab (Real BIR Form Layout — Read Only) ─── */
function FormViewTab({ fd }) {
  let tin = Array.isArray(fd.tin) ? [...fd.tin] : (fd.tin || '').includes('-') ? (fd.tin || '').split('-') : []
  if (tin[0] && tin[0].length > 3) {
    const raw = tin[0].replace(/\D/g, '')
    tin = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
  }
  if (!tin.length && typeof fd.tin === 'string' && fd.tin.length > 0) {
    const raw = fd.tin.replace(/\D/g, '')
    tin = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
  }
  while (tin.length < 4) tin.push('')
  tin = tin.slice(0, 4)
  const num = (v) => { const n = parseFloat(v); return (!n || isNaN(n)) ? '' : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

  const CELL = 'border border-black'
  const LABEL = 'text-[8px] leading-tight'
  const FIELD_RO = 'text-[9px] font-medium'

  return (
    <BIRFormZoomWrapper>
      <div className="border-2 border-black bg-white p-0 text-black text-[9px] leading-tight" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>

        {/* Header */}
        <div className={`${CELL} flex items-center justify-between p-1`}>
          <div className="text-[6px]">For BIR Use Only<br />BCS/Item:</div>
          <div className="text-center">
            <div className="text-[7px]">Republic of the Philippines / Department of Finance</div>
            <div className="text-[7px] font-bold">Bureau of Internal Revenue</div>
          </div>
          <div className="text-[6px]">1702-RT 01/18ENCS</div>
        </div>

        <div className={`${CELL} flex`}>
          <div className="w-24 border-r border-black p-1">
            <div className={LABEL}>BIR Form No.</div>
            <div className="text-lg font-bold">1702-RT</div>
            <div className="text-[6px]">January 2018 (ENCS)</div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[10px] font-bold">Annual Income Tax Return</div>
              <div className="text-[8px]">Corporation, Partnership and Other Non-Individual Taxpayer</div>
              <div className="text-[7px]">Subject Only to REGULAR Income Tax Rate</div>
            </div>
          </div>
        </div>

        {/* Year / ATC */}
        <div className={`${CELL} flex`}>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>1 Calendar/Fiscal</span>
            <span className={`block ${FIELD_RO}`}>{fd.calendar_fiscal || 'Calendar'}</span>
          </div>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>2 Year Ended</span>
            <span className={`block ${FIELD_RO}`}>{fd.tax_year || ''}</span>
          </div>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>5 ATC</span>
            <span className={`block ${FIELD_RO}`}>{fd.atc || 'IC 010'}</span>
          </div>
          <div className="w-1/4 p-1">
            <span className={LABEL}>13 Deduction Method</span>
            <span className={`block ${FIELD_RO}`}>{fd.method_of_deduction || 'OSD'}</span>
          </div>
        </div>

        {/* Part I */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part I — Background Information</div>
        <div className={`${CELL} flex`}>
          <div className="w-1/2 border-r border-black p-1">
            <span className={LABEL}>6 TIN</span>
            <div className="flex gap-0.5 mt-0.5">
              {[0,1,2,3].map(i => (
                <span key={i} className="inline-flex items-center justify-center border border-black w-10 h-[16px] text-[9px] font-mono text-center">
                  {tin[i] || ''}
                </span>
              ))}
            </div>
          </div>
          <div className="w-1/2 p-1">
            <span className={LABEL}>7 RDO Code</span>
            <span className={`block ${FIELD_RO}`}>{fd.rdo_code || ''}</span>
          </div>
        </div>
        <div className={`${CELL} p-1`}>
          <span className={LABEL}>8 Registered Name</span>
          <span className={`block ${FIELD_RO}`}>{fd.registered_name || ''}</span>
        </div>
        <div className={`${CELL} p-1`}>
          <span className={LABEL}>9 Registered Address</span>
          <span className={`block ${FIELD_RO}`}>{fd.registered_address || ''}</span>
        </div>

        {/* Part IV - Computation */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part IV — Computation of Tax</div>

        {[
          ['27', 'Sales/Receipts/Revenues/Fees', 'line_27_sales'],
          ['28', 'Less: Sales Returns, Allowances and Discounts', 'line_28_sales_returns'],
          ['29', 'Net Sales (27 less 28)', 'line_29_net_sales'],
          ['30', 'Less: Cost of Sales/Services', 'line_30_cost_of_sales'],
          ['31', 'Gross Income from Operation (29 less 30)', 'line_31_gross_income'],
          ['32', 'Add: Other Taxable Income', 'line_32_other_income'],
          ['33', 'Total Taxable Income (31 + 32)', 'line_33_total_taxable_income'],
          ['38', 'Optional Standard Deduction (40% of 33)', 'line_38_osd'],
          ['39', 'Net Taxable Income / (Loss)', 'line_39_net_taxable_income'],
          ['40', 'Applicable Income Tax Rate (%)', 'line_40_tax_rate'],
          ['41', 'Income Tax Due (39 × 40)', 'line_41_income_tax_due'],
          ['42', 'MCIT Due (2% of 33)', 'line_42_mcit_due'],
          ['43', 'Tax Due (higher of 41 or 42)', 'line_43_tax_due'],
        ].map(([lineNum, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-8 border-r border-black p-0.5 text-center font-bold text-[8px]">{lineNum}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1">{label}</div>
            <div className={cn('w-36 p-0.5 text-right pr-2', field === 'line_43_tax_due' ? 'bg-yellow-50 font-bold' : '')}>
              <span className="font-mono tabular-nums">{num(fd[field])}</span>
            </div>
          </div>
        ))}

        {/* Tax Credits */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Tax Credits/Payments</div>

        {[
          ['44', "Prior Year's Excess Credits", 'line_44_prior_year_excess'],
          ['46', 'Income Tax Payment from Previous Quarter/s', 'line_46_regular_prev_qtrs'],
          ['48', 'CWT from Previous Quarter/s (per 2307)', 'line_48_cwt_prev_qtrs'],
          ['49', 'CWT per BIR 2307 for the 4th Quarter', 'line_49_cwt_2307_4th_qtr'],
          ['55', 'Total Tax Credits/Payments', 'line_55_total_credits'],
          ['56', 'Net Tax Payable / (Overpayment)', 'line_56_net_tax_payable'],
        ].map(([lineNum, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-8 border-r border-black p-0.5 text-center text-[8px]">{lineNum}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1">{label}</div>
            <div className={cn('w-36 p-0.5 text-right pr-2', field === 'line_56_net_tax_payable' ? 'bg-yellow-50 font-bold' : '')}>
              <span className="font-mono tabular-nums">{num(fd[field])}</span>
            </div>
          </div>
        ))}

        {/* Part II - Total Tax Payable */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part II — Total Tax Payable</div>

        {[
          ['14', 'Tax Due (from Part IV Item 43)', 'part2_line14_tax_due'],
          ['15', 'Less: Total Tax Credits (from Part IV Item 55)', 'part2_line15_total_credits'],
          ['16', 'Net Tax Payable / (Overpayment)', 'part2_line16_net_payable'],
          ['17', 'Surcharge', 'part2_line17_surcharge'],
          ['18', 'Interest', 'part2_line18_interest'],
          ['19', 'Compromise', 'part2_line19_compromise'],
          ['21', 'TOTAL AMOUNT PAYABLE / (Overpayment)', 'part2_line21_total_payable'],
        ].map(([lineNum, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-8 border-r border-black p-0.5 text-center font-bold text-[8px]">{lineNum}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1">{label}</div>
            <div className={cn('w-36 p-0.5 text-right pr-2', field === 'part2_line21_total_payable' ? 'bg-yellow-50 font-bold' : '')}>
              <span className="font-mono tabular-nums">{num(fd[field])}</span>
            </div>
          </div>
        ))}

        {/* Signatory */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Signatory</div>
        <div className={`${CELL} flex`}>
          <div className="flex-1 border-r border-black p-1">
            <span className={LABEL}>President/Principal Officer</span>
            <span className={`block ${FIELD_RO}`}>{fd.signatory_name || ''}</span>
          </div>
          <div className="w-40 border-r border-black p-1">
            <span className={LABEL}>Title</span>
            <span className={`block ${FIELD_RO}`}>{fd.signatory_title || ''}</span>
          </div>
          <div className="w-32 p-1">
            <span className={LABEL}>TIN</span>
            <span className={`block ${FIELD_RO}`}>{fd.signatory_tin || ''}</span>
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
      {history.map((h, i) => (
        <div key={i} className="flex gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
            <History size={14} className="text-[var(--color-primary)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--color-text)]">{h.action}</p>
            <p className="text-xs text-[var(--color-muted-fg)]">{h.details || '—'}</p>
            <p className="text-[11px] text-[var(--color-muted-fg)] mt-1">{h.performed_by || 'System'} • {h.created_at ? new Date(h.created_at).toLocaleString() : '—'}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
