import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Save, FileDown, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet } from '../../taxUtils'
import { TINInput } from '../2307/TINInput'
import { BIRFormZoomWrapper } from '@/components/ui/bir-form-zoom-wrapper'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const CELL = 'border border-black'
const LABEL = 'text-[8px] leading-tight'
const FIELD_INPUT = 'w-full h-full bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40'

const QUARTERS = [
  { value: 1, label: 'Q1 (Jan–Mar)' },
  { value: 2, label: 'Q2 (Apr–Jun)' },
  { value: 3, label: 'Q3 (Jul–Sep)' },
  { value: 4, label: 'Q4 (Oct–Dec)' },
]

function quarterDateRange(quarter, year) {
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = quarter * 3
  const lastDay = new Date(year, endMonth, 0).getDate()
  const from = `${year}-${String(startMonth).padStart(2, '0')}-01`
  const to = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}


export function Form1601EQ({ mode = 'create' }) {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const { formId } = useParams()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoPopulating, setAutoPopulating] = useState(false)
  const [selectedQuarter, setSelectedQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [alphalist, setAlphalist] = useState([])

  const [formData, setFormData] = useState({
    tin: ['', '', '', ''],
    rdo_code: '',
    taxpayer_name: '',
    registered_address: '',
    zip_code: '',
    contact_number: '',
    category: 'Private',
    amended_return: false,
    any_taxes_withheld: true,
    line_15: '',
    line_16: '',
    line_18: '',
    line_22a: '',
    line_22b: '',
    line_22c: '',
    signatory_name: '',
    signatory_title: '',
    signatory_tin: '',
    agent_accreditation_no: '',
    date_of_issue: '',
    date_of_expiry: '',
  })

  const line15 = parseFloat(formData.line_15) || 0
  const line16 = parseFloat(formData.line_16) || 0
  const line17 = line15 + line16
  const line18 = parseFloat(formData.line_18) || 0
  const line19 = line17 - line18
  const line20 = line15
  const line21 = line19 - line20
  const line22a = parseFloat(formData.line_22a) || 0
  const line22b = parseFloat(formData.line_22b) || 0
  const line22c = parseFloat(formData.line_22c) || 0
  const line23 = line22a + line22b + line22c
  const line24 = line21 + line23

  const totalIncomePayments = alphalist.reduce((s, r) => s + (parseFloat(r.income_payment) || 0), 0)
  const totalTaxesWithheld = alphalist.reduce((s, r) => s + (parseFloat(r.tax_withheld) || 0), 0)

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  useEffect(() => {
    if (mode === 'create' && entity && entity !== 'All') {
      apiGet(`/tax/entity-profiles/${entity}`).then(profile => {
        if (profile) {
          const tin = (profile.tin || '').split('-')
          setFormData(prev => ({
            ...prev,
            tin: [tin[0] || '', tin[1] || '', tin[2] || '', tin[3] || ''],
            taxpayer_name: profile.registered_name || '',
            registered_address: profile.registered_address || '',
            zip_code: profile.zip_code || '',
            contact_number: profile.contact_number || '',
            rdo_code: profile.rdo_code || '',
            signatory_name: profile.authorized_signatory || '',
            signatory_title: profile.signatory_title || '',
          }))
        }
      }).catch(() => {})
    }
  }, [entity, mode])

  useEffect(() => {
    if (mode === 'edit' && formId) {
      setLoading(true)
      apiGet(`/tax/bir-forms/${formId}`).then(data => {
        if (data?.form_data) {
          setFormData(prev => ({ ...prev, ...data.form_data }))
          if (data.form_data.alphalist) setAlphalist(data.form_data.alphalist)
          if (data.form_data.quarter) setSelectedQuarter(data.form_data.quarter)
          if (data.form_data.year) setSelectedYear(data.form_data.year)
        }
      }).catch(() => notify.error('Failed to load form'))
        .finally(() => setLoading(false))
    }
  }, [mode, formId])

  const handleAutoPopulate = async () => {
    if (!entity || entity === 'All') { notify.error('Select a specific entity first'); return }
    setAutoPopulating(true)
    try {
      const data = await apiGet(`/tax/bir-forms/1601EQ/auto-populate?entity=${entity}&quarter=${selectedQuarter}&year=${selectedYear}`)
      if (data) {
        setFormData(prev => ({ ...prev, ...data }))
        if (data.alphalist) setAlphalist(data.alphalist)
        notify.success('Form auto-populated from withholding data')
      }
    } catch { notify.error('Failed to auto-populate') }
    finally { setAutoPopulating(false) }
  }

  const handleSave = async (status = 'DRAFT') => {
    setSaving(true)
    try {
      const { from, to } = quarterDateRange(selectedQuarter, selectedYear)
      const payload = {
        form_type: '1601EQ',
        entity: entity !== 'All' ? entity : '',
        period_from: from,
        period_to: to,
        status,
        form_data: {
          ...formData,
          quarter: selectedQuarter,
          year: selectedYear,
          alphalist,
          line_17: line17,
          line_19: line19,
          line_20: line20,
          line_21: line21,
          line_23: line23,
          line_24: line24,
          total_income_payments: totalIncomePayments,
          total_taxes_withheld: totalTaxesWithheld,
          number_of_payees: alphalist.length,
        },
        payee_tin: '',
        payor_tin: formData.tin?.join('-'),
        payor_name: formData.taxpayer_name,
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
        <span className="text-sm font-medium text-[var(--color-text)]">BIR Form 1601-EQ</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => handleSave('DRAFT')} disabled={saving}><Save size={14} /> {saving ? 'Saving...' : 'Save Draft'}</Button>
        <Button size="sm" onClick={() => handleSave('FINALIZED')} disabled={saving}><FileDown size={14} /> Finalize</Button>
      </div>

      {/* Form */}
      <BIRFormZoomWrapper>

        {/* Auto-populate panel */}
        {mode === 'create' && (
          <div className="mx-auto mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4" style={{ width: '794px' }}>
            <p className="text-xs font-semibold text-blue-800 mb-2">Auto-populate from Withholding Tax Data</p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[11px] text-blue-700 block mb-0.5">Quarter</label>
                <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))}
                  className="rounded border border-blue-300 bg-white px-2 py-1 text-xs focus:outline-none">
                  {QUARTERS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-blue-700 block mb-0.5">Year</label>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                  className="rounded border border-blue-300 bg-white px-2 py-1 text-xs focus:outline-none">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <Button size="sm" onClick={handleAutoPopulate} disabled={autoPopulating}
                className="bg-blue-600 hover:bg-blue-700 text-white">
                {autoPopulating ? <Loader2 size={14} className="animate-spin" /> : null}
                {autoPopulating ? 'Loading...' : 'Auto Populate'}
              </Button>
            </div>
            {entity === 'All' && <p className="text-[10px] text-amber-700 mt-2">⚠ Select a specific entity to auto-populate.</p>}
          </div>
        )}

        {/* A4 Form */}
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
              <span className="text-[20px] font-bold leading-none">1601-EQ</span>
              <span className="text-[6px] text-gray-600">January 2018 (ENCS)</span>
            </div>
            <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
              <span className="text-[12px] font-bold">Quarterly Remittance Return of</span>
              <span className="text-[12px] font-bold">Creditable Income Taxes Withheld</span>
              <span className="text-[12px] font-bold">(Expanded)</span>
            </div>
            <div className={`${CELL} flex items-end justify-center pb-1`} style={{ width: '140px' }}>
              <span className="text-[7px]">1601EQ 01/18ENCS</span>
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
              <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))}
                className="border border-black bg-transparent text-[9px] px-1 py-0.5 focus:outline-none focus:bg-blue-50/40">
                {QUARTERS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
              <span className="text-[9px] font-bold">Year</span>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                className="border border-black bg-transparent text-[9px] px-1 py-0.5 focus:outline-none focus:bg-blue-50/40">
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Amended / Taxes Withheld */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">2</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-4 flex-1`}>
              <label className="flex items-center gap-1 text-[8px]">
                <input type="checkbox" checked={formData.amended_return} onChange={e => set('amended_return', e.target.checked)} className="w-3 h-3" />
                Amended Return?
              </label>
              <label className="flex items-center gap-1 text-[8px]">
                <input type="checkbox" checked={formData.any_taxes_withheld} onChange={e => set('any_taxes_withheld', e.target.checked)} className="w-3 h-3" />
                Any Taxes Withheld?
              </label>
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
              <div className="ml-4">
                <TINInput value={formData.tin} onChange={v => set('tin', v)} />
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
              <input type="text" value={formData.rdo_code} onChange={e => set('rdo_code', e.target.value.slice(0, 5))}
                className="w-[50px] border border-black bg-transparent text-[9px] text-center px-1 focus:outline-none focus:bg-blue-50/40" maxLength={5} />
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
              <input type="text" value={formData.taxpayer_name} onChange={e => set('taxpayer_name', e.target.value)} className={FIELD_INPUT} />
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
              <input type="text" value={formData.registered_address} onChange={e => set('registered_address', e.target.value)} className={FIELD_INPUT} />
            </div>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '100px' }}>
              <input type="text" value={formData.zip_code} onChange={e => set('zip_code', e.target.value.slice(0, 4))}
                className="w-[60px] h-full bg-transparent text-[9px] text-center border-l border-r border-black focus:outline-none focus:bg-blue-50/40" maxLength={4} />
            </div>
          </div>

          {/* Contact Number */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">8</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
              <span className="text-[9px]">Telephone Number</span>
              <input type="text" value={formData.contact_number} onChange={e => set('contact_number', e.target.value)}
                className="w-[150px] border border-black bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40" />
            </div>
          </div>

          {/* Category */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">9</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-4 flex-1`}>
              <span className="text-[9px]">Category of Withholding Agent</span>
              <label className="flex items-center gap-1 text-[8px]">
                <input type="radio" name="category" value="Private" checked={formData.category === 'Private'} onChange={e => set('category', e.target.value)} className="w-3 h-3" />
                Private
              </label>
              <label className="flex items-center gap-1 text-[8px]">
                <input type="radio" name="category" value="Government" checked={formData.category === 'Government'} onChange={e => set('category', e.target.value)} className="w-3 h-3" />
                Government
              </label>
            </div>
          </div>

          {/* Part II Header */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Part II — Computation of Tax</span>
          </div>

          {/* Line 15 */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">15</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Total Tax Remitted for Previous Months (Month 1 + Month 2 via 0619-E)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_15} onChange={e => set('line_15', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 16 */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">16</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Tax Withheld for the 3rd Month of the Quarter</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_16} onChange={e => set('line_16', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 17 - computed */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">17</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Total Taxes Withheld for the Quarter (Item 15 + Item 16)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line17.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 18 */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">18</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: Overremittance from Previous Quarter</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_18} onChange={e => set('line_18', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 19 - computed */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">19</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Tax Still Due (Item 17 - Item 18)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line19.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 20 - computed */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">20</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: Tax Previously Remitted via 0619-E (Months 1 & 2)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line20.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 21 - computed */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">21</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Balance of Tax Still Due (Item 19 - Item 20)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-bold tabular-nums">{line21.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 22a */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">22a</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Surcharge</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_22a} onChange={e => set('line_22a', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 22b */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">22b</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Interest</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_22b} onChange={e => set('line_22b', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 22c */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">22c</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Compromise</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_22c} onChange={e => set('line_22c', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 23 - computed */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">23</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Total Penalties (22a + 22b + 22c)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line23.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 24 - TOTAL */}
          <div className="flex" style={{ height: '30px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">24</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">TOTAL AMOUNT DUE (Item 21 + Item 23)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-yellow-50`} style={{ width: '180px' }}>
              <span className="text-[10px] font-bold tabular-nums">{line24.toFixed(2)}</span>
            </div>
          </div>

          {/* Schedule 1 - Alphalist of Payees */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Schedule 1 — Alphalist of Payees Subjected to Expanded Withholding Tax</span>
          </div>

          <div className={`${CELL} p-2`}>
            <table className="w-full border-collapse text-[8px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-black px-1 py-1 text-left font-semibold">Payee Name</th>
                  <th className="border border-black px-1 py-1 text-left font-semibold" style={{ width: '100px' }}>TIN</th>
                  <th className="border border-black px-1 py-1 text-left font-semibold" style={{ width: '70px' }}>ATC Code</th>
                  <th className="border border-black px-1 py-1 text-right font-semibold" style={{ width: '110px' }}>Income Payment</th>
                  <th className="border border-black px-1 py-1 text-right font-semibold" style={{ width: '100px' }}>Tax Withheld</th>
                </tr>
              </thead>
              <tbody>
                {alphalist.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border border-black px-2 py-3 text-center text-gray-400 text-[8px]">
                      No payees. Use Auto Populate to load withholding data.
                    </td>
                  </tr>
                )}
                {alphalist.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? '' : 'bg-gray-50/50'}>
                    <td className="border border-black px-1 py-0.5">{row.payee_name || ''}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{row.tin || ''}</td>
                    <td className="border border-black px-1 py-0.5">{row.atc_code || ''}</td>
                    <td className="border border-black px-1 py-0.5 text-right tabular-nums">
                      {(parseFloat(row.income_payment) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-right tabular-nums">
                      {(parseFloat(row.tax_withheld) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Total Income Payments</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{totalIncomePayments.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Total Taxes Withheld</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{totalTaxesWithheld.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Number of Payees</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{alphalist.length}</span>
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
              <input type="text" value={formData.signatory_name} onChange={e => set('signatory_name', e.target.value)}
                className="w-[300px] bg-transparent text-[10px] text-center border-b border-black focus:outline-none focus:bg-blue-50/40 py-0.5" />
              <span className="text-[7px]">Signature over Printed Name of Withholding Agent/Authorized Representative</span>
              <input type="text" value={formData.signatory_title} onChange={e => set('signatory_title', e.target.value)}
                className="w-[250px] bg-transparent text-[8px] text-center italic focus:outline-none focus:bg-blue-50/40 py-0.5"
                placeholder="(Title/Position)" />
            </div>
            <div className="flex items-center gap-2 text-[7px] mt-2">
              <span>TIN</span>
              <input type="text" value={formData.signatory_tin} onChange={e => set('signatory_tin', e.target.value)}
                className="w-[100px] border-b border-black bg-transparent text-[8px] px-1 focus:outline-none" />
              <span className="ml-3">Tax Agent Accreditation No.</span>
              <input type="text" value={formData.agent_accreditation_no} onChange={e => set('agent_accreditation_no', e.target.value)}
                className="w-[80px] border-b border-black bg-transparent text-[8px] px-1 focus:outline-none" />
              <span className="ml-3">Date of Issue</span>
              <input type="date" value={formData.date_of_issue} onChange={e => set('date_of_issue', e.target.value)}
                className="border-b border-black bg-transparent text-[8px] w-[80px] focus:outline-none" />
              <span className="ml-3">Date of Expiry</span>
              <input type="date" value={formData.date_of_expiry} onChange={e => set('date_of_expiry', e.target.value)}
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
