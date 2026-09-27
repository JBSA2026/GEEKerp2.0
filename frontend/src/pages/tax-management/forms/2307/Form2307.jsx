import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Save, FileDown, ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet } from '../../taxUtils'
import { TINInput } from './TINInput'
import { IncomeTable } from './IncomeTable'
import { export2307PDF } from '@/utils/bir2307Pdf'
import { BIRFormZoomWrapper } from '@/components/ui/bir-form-zoom-wrapper'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const EMPTY_ROW = { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' }
const EMPTY_ROWS = () => Array.from({ length: 11 }, () => ({ ...EMPTY_ROW }))

// Shared cell style for the form
const CELL = 'border border-black'
const LABEL = 'text-[8px] leading-tight'
const FIELD_INPUT = 'w-full h-full bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40'

export function Form2307({ mode = 'create' }) {
  const { user, entity } = useOutletContext()
  const navigate = useNavigate()
  const { formId } = useParams()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [selectedQuarter, setSelectedQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [autoPopulating, setAutoPopulating] = useState(false)
  const [linkedCustomerId, setLinkedCustomerId] = useState(null)

  const [formData, setFormData] = useState({
    period_from: '', period_to: '',
    payee_tin: ['', '', '', ''], payee_name: '', payee_address: '', payee_zip_code: '', payee_foreign_address: '',
    payor_tin: ['', '', '', ''], payor_name: '', payor_address: '', payor_zip_code: '',
    table_a: EMPTY_ROWS(), table_b: EMPTY_ROWS(),
    payor_signatory_name: '', payor_signatory_title_tin: '', payor_agent_accreditation_no: '', payor_date_of_issue: '', payor_date_of_expiry: '',
    payee_signatory_name: '', payee_signatory_title_tin: '', payee_agent_accreditation_no: '', payee_date_of_issue: '', payee_date_of_expiry: '',
  })

  useEffect(() => {
    if (mode === 'create' && entity && entity !== 'All') {
      apiGet(`/tax/entity-profiles/${entity}`).then(profile => {
        if (profile) {
          const tin = (profile.tin || '').split('-')
          setFormData(prev => ({
            ...prev,
            payee_tin: [tin[0] || '', tin[1] || '', tin[2] || '', tin[3] || ''],
            payee_name: profile.registered_name || '',
            payee_address: profile.registered_address || '',
            payee_zip_code: profile.zip_code || '',
            payee_signatory_name: profile.authorized_signatory || '',
            payee_signatory_title_tin: profile.signatory_title || '',
          }))
        }
      }).catch(() => {})
    }
  }, [entity, mode])

  useEffect(() => {
    if (mode === 'edit' && formId) {
      setLoading(true)
      apiGet(`/tax/bir-forms/${formId}`).then(data => {
        if (data?.form_data) setFormData(prev => ({ ...prev, ...data.form_data }))
        if (data?.customer_id) setLinkedCustomerId(data.customer_id)
        if (data?.period_from) {
          const month = parseInt(data.period_from.split('-')[1], 10)
          setSelectedQuarter(Math.ceil(month / 3))
          setSelectedYear(parseInt(data.period_from.split('-')[0], 10))
        }
      }).catch(() => notify.error('Failed to load form'))
        .finally(() => setLoading(false))
    }
  }, [mode, formId])

  // Load customers with WHT for auto-populate (create mode only)
  useEffect(() => {
    if (mode === 'create' && entity && entity !== 'All') {
      apiGet(`/tax/customers-with-wht?entity=${entity}&quarter=${selectedQuarter}&year=${selectedYear}`)
        .then(data => setCustomers(Array.isArray(data) ? data : []))
        .catch(() => {})
    }
  }, [entity, selectedQuarter, selectedYear, mode])

  const handleAutoPopulate = async () => {
    if (!selectedCustomer || !entity || entity === 'All') {
      notify.error('Select an entity and customer first')
      return
    }
    setAutoPopulating(true)
    try {
      const data = await apiGet(`/tax/bir-forms/2307/auto-populate?entity=${entity}&customer_id=${selectedCustomer}&quarter=${selectedQuarter}&year=${selectedYear}`)
      if (data) {
        setFormData(prev => ({ ...prev, ...data }))
        notify.success('Form auto-populated from AR invoices')
      }
    } catch { notify.error('Failed to auto-populate') }
    finally { setAutoPopulating(false) }
  }

  const handleRepopulate = async () => {
    if (!entity || entity === 'All') {
      notify.error('No entity selected')
      return
    }
    setAutoPopulating(true)
    try {
      if (linkedCustomerId) {
        // Full re-populate: payee + payor + income table
        const data = await apiGet(`/tax/bir-forms/2307/auto-populate?entity=${entity}&customer_id=${linkedCustomerId}&quarter=${selectedQuarter}&year=${selectedYear}`)
        if (data) {
          setFormData(prev => ({ ...prev, ...data }))
          notify.success('Form re-populated from latest data')
        }
      } else {
        // No customer linked — just re-populate payee (entity) info
        const profile = await apiGet(`/tax/entity-profiles/${entity}`)
        if (profile) {
          const tin = (profile.tin || '').split('-')
          setFormData(prev => ({
            ...prev,
            payee_tin: [tin[0] || '', tin[1] || '', tin[2] || '', tin[3] || ''],
            payee_name: profile.registered_name || '',
            payee_address: profile.registered_address || '',
            payee_zip_code: profile.zip_code || '',
            payee_signatory_name: profile.authorized_signatory || '',
            payee_signatory_title_tin: profile.signatory_title || '',
          }))
          notify.success('Payee info re-populated from entity profile')
        }
      }
    } catch { notify.error('Failed to re-populate') }
    finally { setAutoPopulating(false) }
  }

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  const updateTableRow = (table, rowIdx, field, value) => {
    setFormData(prev => {
      const rows = [...prev[table]]
      rows[rowIdx] = { ...rows[rowIdx], [field]: value }
      if (['month1', 'month2', 'month3'].includes(field)) {
        const m1 = parseFloat(rows[rowIdx].month1) || 0
        const m2 = parseFloat(rows[rowIdx].month2) || 0
        const m3 = parseFloat(rows[rowIdx].month3) || 0
        rows[rowIdx].total = (m1 + m2 + m3).toFixed(2)
      }
      return { ...prev, [table]: rows }
    })
  }

  const columnTotal = (table, field) => {
    return formData[table].reduce((sum, row) => sum + (parseFloat(row[field]) || 0), 0).toFixed(2)
  }

  const handleSave = async (status = 'DRAFT') => {
    setSaving(true)
    try {
      const payload = {
        form_type: '2307', entity: entity !== 'All' ? entity : '',
        period_from: formData.period_from, period_to: formData.period_to, status,
        payee_tin: formData.payee_tin.join('-'), payee_name: formData.payee_name,
        payee_address: formData.payee_address, payee_zip_code: formData.payee_zip_code,
        payor_tin: formData.payor_tin.join('-'), payor_name: formData.payor_name,
        payor_address: formData.payor_address, payor_zip_code: formData.payor_zip_code,
        form_data: formData,
        payor_signatory_name: formData.payor_signatory_name,
        payor_signatory_title_tin: formData.payor_signatory_title_tin,
        payee_signatory_name: formData.payee_signatory_name,
        payee_signatory_title_tin: formData.payee_signatory_title_tin,
      }
      const url = mode === 'edit' && formId ? `${BASE}/tax/bir-forms/${formId}` : `${BASE}/tax/bir-forms`
      const method = mode === 'edit' && formId ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      notify.success(status === 'FINALIZED' ? 'Form finalized!' : 'Draft saved.')
      navigate('/tax/forms')
    } catch { notify.error('Failed to save form') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <Button variant="outline" size="sm" onClick={() => navigate('/tax/forms')}><ArrowLeft size={14} /> Back</Button>
        <span className="text-sm font-medium text-[var(--color-text)]">BIR Form 2307</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => handleSave('DRAFT')} disabled={saving}><Save size={14} /> {saving ? 'Saving...' : 'Save Draft'}</Button>
        <Button variant="outline" size="sm" onClick={() => export2307PDF(formData)}><Printer size={14} /> Export PDF</Button>
        <Button size="sm" onClick={() => handleSave('FINALIZED')} disabled={saving}><FileDown size={14} /> Finalize</Button>
      </div>

      {/* Form - A4 proportions */}
      <BIRFormZoomWrapper>

        {/* Auto-populate panel */}
        {mode === 'create' && (
          <div className="mx-auto mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4" style={{ width: '794px' }}>
            <p className="text-xs font-semibold text-blue-800 mb-2">Auto-populate from AR Invoices</p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[11px] text-blue-700 block mb-0.5">Quarter</label>
                <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))}
                  className="rounded border border-blue-300 bg-white px-2 py-1 text-xs focus:outline-none">
                  <option value={1}>Q1 (Jan-Mar)</option>
                  <option value={2}>Q2 (Apr-Jun)</option>
                  <option value={3}>Q3 (Jul-Sep)</option>
                  <option value={4}>Q4 (Oct-Dec)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-blue-700 block mb-0.5">Year</label>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                  className="rounded border border-blue-300 bg-white px-2 py-1 text-xs focus:outline-none">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-[11px] text-blue-700 block mb-0.5">Customer (Payor)</label>
                <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
                  className="w-full rounded border border-blue-300 bg-white px-2 py-1 text-xs focus:outline-none">
                  <option value="">— Select customer with WHT —</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>
                      {c.company_name} (₱{Number(c.total_wht || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})} WHT, {c.invoice_count} inv)
                    </option>
                  ))}
                </select>
              </div>
              <Button size="sm" onClick={handleAutoPopulate} disabled={autoPopulating || !selectedCustomer}
                className="bg-blue-600 hover:bg-blue-700 text-white">
                {autoPopulating ? <Loader2 size={14} className="animate-spin" /> : null}
                {autoPopulating ? 'Loading...' : 'Auto-Fill Form'}
              </Button>
            </div>
            {entity === 'All' && <p className="text-[10px] text-amber-700 mt-2">⚠ Select a specific entity to auto-populate.</p>}
          </div>
        )}
        {mode === 'edit' && (
          <div className="mx-auto mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center justify-between" style={{ width: '794px' }}>
            <p className="text-xs text-blue-800">Re-fetch payee/payor info and income data from the latest records.</p>
            <Button size="sm" onClick={handleRepopulate} disabled={autoPopulating}
              className="bg-blue-600 hover:bg-blue-700 text-white">
              {autoPopulating ? <Loader2 size={14} className="animate-spin" /> : null}
              {autoPopulating ? 'Loading...' : 'Re-populate'}
            </Button>
          </div>
        )}
        <div className="mx-auto bg-white shadow-lg" style={{ width: '794px', minHeight: '1123px', padding: 0, border: '2px solid black' }}>
          
          {/* ROW: Header - BIR Use Only | Republic | Barcode */}
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

          {/* ROW: BIR Form No. | Title | Barcode ref */}
          <div className="flex" style={{ height: '60px' }}>
            <div className={`${CELL} px-2 flex flex-col justify-center`} style={{ width: '120px' }}>
              <span className="text-[7px]">BIR Form No.</span>
              <span className="text-[32px] font-bold leading-none">2307</span>
              <span className="text-[6px] text-gray-600">January 2018 (ENCS)</span>
            </div>
            <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
              <span className="text-[18px] font-bold">Certificate of Creditable Tax</span>
              <span className="text-[18px] font-bold">Withheld at Source</span>
            </div>
            <div className={`${CELL} flex items-end justify-center pb-1`} style={{ width: '140px' }}>
              <span className="text-[7px]">2307 01/18ENCS</span>
            </div>
          </div>

          {/* Instruction line */}
          <div className={`${CELL} px-2 flex items-center`} style={{ height: '18px' }}>
            <span className="text-[7px] italic">Fill in all applicable spaces. Mark all appropriate boxes with an "X".</span>
          </div>

          {/* ROW 1: For the Period */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">1</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-3 flex-1`}>
              <span className="text-[9px]">For the Period</span>
              <span className="text-[9px] ml-4">From</span>
              <div className="flex items-center border-b border-black">
                <input type="date" value={formData.period_from} onChange={e => set('period_from', e.target.value)}
                  className="bg-transparent text-[9px] w-[100px] focus:outline-none" />
              </div>
              <span className="text-[7px] italic text-gray-500">(MM/DD/YYYY)</span>
              <span className="text-[9px] ml-6">To</span>
              <div className="flex items-center border-b border-black">
                <input type="date" value={formData.period_to} onChange={e => set('period_to', e.target.value)}
                  className="bg-transparent text-[9px] w-[100px] focus:outline-none" />
              </div>
              <span className="text-[7px] italic text-gray-500">(MM/DD/YYYY)</span>
            </div>
          </div>

          {/* Part I - Payee Information header */}
          <div className={`${CELL} flex items-center justify-center`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold underline">Part I – Payee Information</span>
          </div>

          {/* ROW 2: Payee TIN */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">2</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
              <span className="text-[9px]">Taxpayer Identification Number</span>
              <span className="text-[8px] italic">(TIN)</span>
              <div className="ml-4">
                <TINInput value={formData.payee_tin} onChange={v => set('payee_tin', v)} />
              </div>
            </div>
          </div>

          {/* ROW 3: Payee Name label */}
          <div className="flex" style={{ height: '20px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">3</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[8px]">Payee's Name</span>
              <span className="text-[7px] italic text-gray-600 ml-1">(Last Name, First Name, Middle Name for Individual OR Registered Name for Non-Individual)</span>
            </div>
          </div>
          {/* Payee Name value */}
          <div className="flex" style={{ height: '22px' }}>
            <div className={`${CELL}`} style={{ width: '24px' }} />
            <div className={`${CELL} flex items-center px-3 flex-1`}>
              <input type="text" value={formData.payee_name} onChange={e => set('payee_name', e.target.value)}
                className={FIELD_INPUT} placeholder="" />
            </div>
          </div>

          {/* ROW 4: Registered Address label */}
          <div className="flex" style={{ height: '18px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">4</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[8px] underline">Registered Address</span>
            </div>
            <div className={`${CELL} flex items-center px-1 gap-1`} style={{ width: '100px' }}>
              <span className="text-[8px] font-bold">4A</span>
              <span className="text-[8px]">ZIP Code</span>
            </div>
          </div>
          {/* Address value + ZIP */}
          <div className="flex" style={{ height: '22px' }}>
            <div className={`${CELL}`} style={{ width: '24px' }} />
            <div className={`${CELL} flex items-center px-3 flex-1`}>
              <input type="text" value={formData.payee_address} onChange={e => set('payee_address', e.target.value)}
                className={FIELD_INPUT} />
            </div>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '100px' }}>
              <input type="text" value={formData.payee_zip_code} onChange={e => set('payee_zip_code', e.target.value.slice(0, 4))}
                className="w-[60px] h-full bg-transparent text-[9px] text-center border-l border-r border-black focus:outline-none focus:bg-blue-50/40"
                maxLength={4} />
            </div>
          </div>

          {/* ROW 5: Foreign Address */}
          <div className="flex" style={{ height: '18px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">5</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[8px]">Foreign Address,</span>
              <span className="text-[7px] italic text-gray-600 ml-1">if applicable</span>
            </div>
          </div>
          <div className="flex" style={{ height: '22px' }}>
            <div className={`${CELL}`} style={{ width: '24px' }} />
            <div className={`${CELL} flex items-center px-3 flex-1`}>
              <input type="text" value={formData.payee_foreign_address} onChange={e => set('payee_foreign_address', e.target.value)}
                className={FIELD_INPUT} />
            </div>
          </div>

          {/* Part II - Payor Information header */}
          <div className={`${CELL} flex items-center justify-center`} style={{ height: '22px' }}>
            <span className="text-[9px] font-bold underline">Part II – Payor Information</span>
          </div>

          {/* ROW 6: Payor TIN */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">6</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
              <span className="text-[9px]">Taxpayer Identification Number</span>
              <span className="text-[8px] italic">(TIN)</span>
              <div className="ml-4">
                <TINInput value={formData.payor_tin} onChange={v => set('payor_tin', v)} />
              </div>
            </div>
          </div>

          {/* ROW 7: Payor Name */}
          <div className="flex" style={{ height: '20px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">7</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[8px]">Payor's Name</span>
              <span className="text-[7px] italic text-gray-600 ml-1">(Last Name, First Name, Middle Name for Individual OR Registered Name for Non-Individual)</span>
            </div>
          </div>
          <div className="flex" style={{ height: '22px' }}>
            <div className={`${CELL}`} style={{ width: '24px' }} />
            <div className={`${CELL} flex items-center px-3 flex-1`}>
              <input type="text" value={formData.payor_name} onChange={e => set('payor_name', e.target.value)}
                className={FIELD_INPUT} />
            </div>
          </div>

          {/* ROW 8: Payor Address */}
          <div className="flex" style={{ height: '18px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">8</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[8px] underline">Registered Address</span>
            </div>
            <div className={`${CELL} flex items-center px-1 gap-1`} style={{ width: '100px' }}>
              <span className="text-[8px] font-bold">8A</span>
              <span className="text-[8px]">ZIP Code</span>
            </div>
          </div>
          <div className="flex" style={{ height: '22px' }}>
            <div className={`${CELL}`} style={{ width: '24px' }} />
            <div className={`${CELL} flex items-center px-3 flex-1`}>
              <input type="text" value={formData.payor_address} onChange={e => set('payor_address', e.target.value)}
                className={FIELD_INPUT} />
            </div>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '100px' }}>
              <input type="text" value={formData.payor_zip_code} onChange={e => set('payor_zip_code', e.target.value.slice(0, 4))}
                className="w-[60px] h-full bg-transparent text-[9px] text-center border-l border-r border-black focus:outline-none focus:bg-blue-50/40"
                maxLength={4} />
            </div>
          </div>

          {/* Part III header */}
          <div className={`${CELL} flex items-center justify-center`} style={{ height: '20px' }}>
            <span className="text-[8px] font-bold underline">Part III – Details of Monthly Income Payments and Taxes Withheld</span>
          </div>

          {/* Table A */}
          <IncomeTable
            label="Income Payments Subject to Expanded Withholding Tax"
            rows={formData.table_a}
            onUpdateRow={(idx, field, val) => updateTableRow('table_a', idx, field, val)}
            columnTotal={(field) => columnTotal('table_a', field)}
          />

          {/* Table B */}
          <IncomeTable
            label="Money Payments Subject to Withholding of Business Tax (Government & Private)"
            rows={formData.table_b}
            onUpdateRow={(idx, field, val) => updateTableRow('table_b', idx, field, val)}
            columnTotal={(field) => columnTotal('table_b', field)}
          />

          {/* Declaration */}
          <div className={`${CELL} px-3 py-2`}>
            <p className="text-[7px] leading-[1.4]">
              We declare under the penalties of perjury that this certificate has been made in good faith, verified by us, and to the best of our knowledge and belief, is true and
              correct, pursuant to the provisions of the National Internal Revenue Code, as amended, and the regulations issued under authority thereof. Further, we give our consent to
              the processing of our information as contemplated under the *Data Privacy Act of 2012 (R.A. No. 10173) for legitimate and lawful purposes.
            </p>
          </div>

          {/* Payor Signatory */}
          <div className={`${CELL} px-4 py-2`}>
            <div className="flex flex-col items-center gap-1 py-2">
              <input type="text" value={formData.payor_signatory_name} onChange={e => set('payor_signatory_name', e.target.value)}
                className="w-[300px] bg-transparent text-[10px] text-center border-b border-black focus:outline-none focus:bg-blue-50/40 py-0.5" />
              <span className="text-[7px]">Signature over Printed Name of Payor/Payor's Authorized Representative/Tax Agent</span>
              <input type="text" value={formData.payor_signatory_title_tin} onChange={e => set('payor_signatory_title_tin', e.target.value)}
                className="w-[250px] bg-transparent text-[8px] text-center italic focus:outline-none focus:bg-blue-50/40 py-0.5"
                placeholder="(Indicate Title/Designation and TIN)" />
            </div>
            <div className="flex items-center gap-2 text-[7px] mt-1">
              <span>Tax Agent Accreditation No./</span>
              <span>Attorney's Roll No. (if applicable)</span>
              <input type="text" value={formData.payor_agent_accreditation_no} onChange={e => set('payor_agent_accreditation_no', e.target.value)}
                className="w-[80px] border-b border-black bg-transparent text-[8px] px-1 focus:outline-none" />
              <span className="ml-2">Date of Issue</span>
              <span className="text-[7px] italic">(MM/DD/YYYY)</span>
              <input type="date" value={formData.payor_date_of_issue} onChange={e => set('payor_date_of_issue', e.target.value)}
                className="border-b border-black bg-transparent text-[8px] w-[80px] focus:outline-none" />
              <span className="ml-2">Date of Expiry</span>
              <span className="text-[7px] italic">(MM/DD/YYYY)</span>
              <input type="date" value={formData.payor_date_of_expiry} onChange={e => set('payor_date_of_expiry', e.target.value)}
                className="border-b border-black bg-transparent text-[8px] w-[80px] focus:outline-none" />
            </div>
          </div>

          {/* CONFORME */}
          <div className={`${CELL} flex items-center justify-center`} style={{ height: '18px' }}>
            <span className="text-[9px] font-bold">CONFORME:</span>
          </div>

          {/* Payee Signatory */}
          <div className={`${CELL} px-4 py-2`}>
            <div className="flex flex-col items-center gap-1 py-2">
              <input type="text" value={formData.payee_signatory_name} onChange={e => set('payee_signatory_name', e.target.value)}
                className="w-[300px] bg-transparent text-[10px] text-center border-b border-black focus:outline-none focus:bg-blue-50/40 py-0.5" />
              <span className="text-[7px]">Signature over Printed Name of Payee/Payee's Authorized Representative/Tax Agent</span>
              <input type="text" value={formData.payee_signatory_title_tin} onChange={e => set('payee_signatory_title_tin', e.target.value)}
                className="w-[250px] bg-transparent text-[8px] text-center italic focus:outline-none focus:bg-blue-50/40 py-0.5"
                placeholder="(Indicate Title/Designation and TIN)" />
            </div>
            <div className="flex items-center gap-2 text-[7px] mt-1">
              <span>Tax Agent Accreditation No./</span>
              <span>Attorney's Roll No. (if applicable)</span>
              <input type="text" value={formData.payee_agent_accreditation_no} onChange={e => set('payee_agent_accreditation_no', e.target.value)}
                className="w-[80px] border-b border-black bg-transparent text-[8px] px-1 focus:outline-none" />
              <span className="ml-2">Date of Issue</span>
              <span className="text-[7px] italic">(MM/DD/YYYY)</span>
              <input type="date" value={formData.payee_date_of_issue} onChange={e => set('payee_date_of_issue', e.target.value)}
                className="border-b border-black bg-transparent text-[8px] w-[80px] focus:outline-none" />
              <span className="ml-2">Date of Expiry</span>
              <span className="text-[7px] italic">(MM/DD/YYYY)</span>
              <input type="date" value={formData.payee_date_of_expiry} onChange={e => set('payee_date_of_expiry', e.target.value)}
                className="border-b border-black bg-transparent text-[8px] w-[80px] focus:outline-none" />
            </div>
          </div>

          {/* Footer */}
          <div className="px-2 py-1">
            <span className="text-[6px] text-gray-500">*NOTE: The BIR Data Privacy is in the BIR website (www.bir.gov.ph)</span>
          </div>

        </div>
      </BIRFormZoomWrapper>
    </div>
  )
}
