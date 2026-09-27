import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Save, FileDown, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet } from '../../taxUtils'
import { export1702QPDF } from '@/utils/bir1702QPdf'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const CELL = 'border border-black'
const LABEL = 'text-[8px] leading-tight'
const FIELD_INPUT = 'w-full h-full bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40'

export function Form1702Q({ mode = 'create' }) {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const { formId } = useParams()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedQuarter, setSelectedQuarter] = useState(Math.min(Math.ceil((new Date().getMonth() + 1) / 3), 3))
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [autoPopulating, setAutoPopulating] = useState(false)

  const [formData, setFormData] = useState({
    return_period: '', quarter: 1, year: new Date().getFullYear(),
    calendar_fiscal: 'Calendar', amended_return: false, atc: 'IC 010',
    tin: ['', '', '', ''], rdo_code: '', registered_name: '',
    registered_address: '', zip_code: '', contact_number: '', email: '',
    // Schedule 2
    sched2_line1_sales: '', sched2_line2_cost_of_sales: '',
    sched2_line3_gross_income: '', sched2_line4_non_operating: '',
    sched2_line5_total_gross: '', sched2_line6_deductions: '',
    sched2_line7_taxable_this_qtr: '', sched2_line8_taxable_prev_qtrs: '',
    sched2_line9_total_taxable: '', sched2_line10_tax_rate: 25,
    sched2_line11_income_tax_due: '', sched2_line12_mcit: '',
    sched2_line13_tax_due: '',
    // Schedule 4
    sched4_line1_prior_year_excess: '', sched4_line2_prev_qtr_payments: '',
    sched4_line3_mcit_prev_qtrs: '', sched4_line4_cwt_prev_qtrs: '',
    sched4_line5_cwt_2307_this_qtr: '', sched4_line6_tax_prev_filed: '',
    sched4_line7_total_credits: '',
    // Part II
    part2_line14_tax_due: '', part2_line19_total_credits: '',
    part2_line20_tax_payable: '', part2_line21a_surcharge: '',
    part2_line21b_interest: '', part2_line21c_compromise: '',
    part2_line22_total_penalties: '', part2_line25_total_due: '',
    signatory_name: '', signatory_title: '', signatory_tin: '',
  })

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  // Load entity profile on create
  useEffect(() => {
    if (mode === 'create' && entity && entity !== 'All') {
      apiGet(`/tax/entity-profiles/${entity}`).then(profile => {
        if (profile) {
          const tin = (profile.tin || '').split('-')
          setFormData(prev => ({
            ...prev,
            tin: [tin[0] || '', tin[1] || '', tin[2] || '', tin[3] || ''],
            registered_name: profile.registered_name || '',
            registered_address: profile.registered_address || '',
            zip_code: profile.zip_code || '',
            rdo_code: profile.rdo_code || '',
            contact_number: profile.contact_number || '',
          }))
        }
      }).catch(() => {})
    }
  }, [entity, mode])

  // Load form in edit mode
  useEffect(() => {
    if (mode === 'edit' && formId) {
      setLoading(true)
      apiGet(`/tax/bir-forms/${formId}`).then(data => {
        if (data?.form_data) setFormData(prev => ({ ...prev, ...data.form_data }))
      }).catch(() => notify.error('Failed to load form'))
        .finally(() => setLoading(false))
    }
  }, [mode, formId])

  const handleAutoPopulate = async () => {
    if (!entity || entity === 'All') { notify.error('Select an entity'); return }
    setAutoPopulating(true)
    try {
      const data = await apiGet(`/tax/bir-forms/1702Q/auto-populate?entity=${entity}&quarter=${selectedQuarter}&year=${selectedYear}`)
      setFormData(prev => ({ ...prev, ...data }))
      notify.success('Form auto-populated from AR/AP data')
    } catch (err) { notify.error(err.message || 'Auto-populate failed') }
    finally { setAutoPopulating(false) }
  }

  const handleSave = async (status = 'DRAFT') => {
    setSaving(true)
    try {
      const monthStart = (selectedQuarter - 1) * 3 + 1
      const monthEnd = selectedQuarter * 3
      const lastDay = new Date(selectedYear, monthEnd, 0).getDate()
      const body = {
        form_type: '1702Q', entity: entity !== 'All' ? entity : '',
        period_from: `${selectedYear}-${String(monthStart).padStart(2, '0')}-01`,
        period_to: `${selectedYear}-${String(monthEnd).padStart(2, '0')}-${lastDay}`,
        status, form_data: formData,
        payor_tin: formData.tin?.join('-') || '', payor_name: formData.registered_name,
      }
      const url = mode === 'edit' ? `${BASE}/tax/bir-forms/${formId}` : `${BASE}/tax/bir-forms`
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Save failed') }
      const saved = await res.json()
      notify.success(status === 'FINALIZED' ? 'Form finalized!' : 'Draft saved!')
      navigate(`/tax/forms/1702Q/${saved.form_record_id}`)
    } catch (err) { notify.error(err.message) }
    finally { setSaving(false) }
  }

  const money = v => { const n = parseFloat(v); return (!n || isNaN(n)) ? '' : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" /></div>

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/tax/forms')}><ArrowLeft size={16} /></Button>
          <span className="text-sm font-medium text-[var(--color-text)]">BIR Form 1702Q — Quarterly Income Tax Return (Corporations)</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => export1702QPDF(formData)} disabled={!formData.registered_name}>
            <FileDown size={14} /> <span className="ml-1">PDF</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSave('DRAFT')} disabled={saving}>
            <Save size={14} /> <span className="ml-1">Save Draft</span>
          </Button>
          <Button size="sm" onClick={() => handleSave('FINALIZED')} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span className="ml-1">Finalize</span>
          </Button>
        </div>
      </div>

      {/* Auto-populate controls */}
      {mode === 'create' && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]">
          <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))}
            className="rounded border border-[var(--color-border)] px-2 py-1.5 text-xs bg-[var(--color-surface)]">
            <option value={1}>Q1 (Jan–Mar)</option>
            <option value={2}>Q2 (Apr–Jun)</option>
            <option value={3}>Q3 (Jul–Sep)</option>
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            className="rounded border border-[var(--color-border)] px-2 py-1.5 text-xs bg-[var(--color-surface)]">
            {[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option> })}
          </select>
          <Button size="sm" variant="outline" onClick={handleAutoPopulate} disabled={autoPopulating}>
            {autoPopulating ? <Loader2 size={14} className="animate-spin" /> : null}
            <span className="ml-1">Auto Populate</span>
          </Button>
        </div>
      )}

      {/* Form Body */}
      <div className="border-2 border-black bg-white p-0 text-black text-[9px] leading-tight" style={{ width: '210mm', minHeight: '280mm', margin: '0 auto' }}>
        {/* Header */}
        <div className={`${CELL} flex items-center justify-between p-1`}>
          <div className="text-[6px]">For BIR Use Only<br />BCS/Item:</div>
          <div className="text-center">
            <div className="text-[7px]">Republic of the Philippines</div>
            <div className="text-[7px]">Department of Finance</div>
            <div className="text-[7px] font-bold">Bureau of Internal Revenue</div>
          </div>
          <div className="text-[6px]">1702Q 01/18ENCS</div>
        </div>

        <div className={`${CELL} flex`}>
          <div className="w-24 border-r border-black p-1">
            <div className={LABEL}>BIR Form No.</div>
            <div className="text-lg font-bold">1702Q</div>
            <div className="text-[6px]">January 2018 (ENCS)</div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[10px] font-bold">Quarterly Income Tax Return</div>
              <div className="text-[8px]">For Corporations, Partnerships and Other Non-Individual Taxpayers</div>
            </div>
          </div>
        </div>

        {/* Period / Quarter / ATC */}
        <div className={`${CELL} flex`}>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>1 Calendar/Fiscal</span>
            <input value={formData.calendar_fiscal} onChange={e => set('calendar_fiscal', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>2 Year Ended</span>
            <input value={formData.year} onChange={e => set('year', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>3 Quarter: {formData.quarter || selectedQuarter}</span>
          </div>
          <div className="w-1/4 p-1">
            <span className={LABEL}>5 ATC</span>
            <input value={formData.atc} onChange={e => set('atc', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
        </div>

        {/* Part I - Background */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part I — Background Information</div>

        <div className={`${CELL} flex`}>
          <div className="w-1/2 border-r border-black p-1">
            <span className={LABEL}>6 TIN</span>
            <div className="flex gap-0.5 mt-0.5">
              {formData.tin.map((seg, i) => (
                <input key={i} value={seg} onChange={e => { const t = [...formData.tin]; t[i] = e.target.value; set('tin', t) }}
                  className={`${FIELD_INPUT} w-10 text-center border border-gray-300`} maxLength={4} />
              ))}
            </div>
          </div>
          <div className="w-1/2 p-1">
            <span className={LABEL}>7 RDO Code</span>
            <input value={formData.rdo_code} onChange={e => set('rdo_code', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
        </div>

        <div className={`${CELL} p-1`}>
          <span className={LABEL}>8 Registered Name</span>
          <input value={formData.registered_name} onChange={e => set('registered_name', e.target.value)} className={FIELD_INPUT} />
        </div>
        <div className={`${CELL} p-1`}>
          <span className={LABEL}>9 Registered Address</span>
          <input value={formData.registered_address} onChange={e => set('registered_address', e.target.value)} className={FIELD_INPUT} />
        </div>
        <div className={`${CELL} flex`}>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>9A ZIP Code</span>
            <input value={formData.zip_code} onChange={e => set('zip_code', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>10 Contact Number</span>
            <input value={formData.contact_number} onChange={e => set('contact_number', e.target.value)} className={`${FIELD_INPUT} w-28`} />
          </div>
          <div className="w-1/3 p-1">
            <span className={LABEL}>11 Email</span>
            <input value={formData.email} onChange={e => set('email', e.target.value)} className={`${FIELD_INPUT} w-36`} />
          </div>
        </div>

        {/* Schedule 2 - Regular Rate */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Schedule 2 — Declaration This Quarter (Regular/Normal Rate)</div>

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
        ].map(([num, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-8 border-r border-black p-0.5 text-center font-bold text-[8px]">{num}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1">{label}</div>
            <div className="w-36 p-0.5">
              <input type="number" step="0.01" value={formData[field]} onChange={e => set(field, e.target.value)}
                className={`${FIELD_INPUT} text-right`} />
            </div>
          </div>
        ))}

        {/* Schedule 4 - Tax Credits */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Schedule 4 — Tax Credits/Payments</div>

        {[
          ['1', 'Prior Year\'s Excess Credits', 'sched4_line1_prior_year_excess'],
          ['2', 'Tax Payments for Previous Quarter/s', 'sched4_line2_prev_qtr_payments'],
          ['3', 'MCIT Payments Previous Quarter/s', 'sched4_line3_mcit_prev_qtrs'],
          ['4', 'Creditable Tax Withheld Previous Quarter/s', 'sched4_line4_cwt_prev_qtrs'],
          ['5', 'Creditable Tax Withheld per BIR 2307 This Quarter', 'sched4_line5_cwt_2307_this_qtr'],
          ['6', 'Tax Paid in Return Previously Filed (Amended)', 'sched4_line6_tax_prev_filed'],
          ['7', 'Total Tax Credits/Payments (Sum 1–6)', 'sched4_line7_total_credits'],
        ].map(([num, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-8 border-r border-black p-0.5 text-center text-[8px]">{num}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1">{label}</div>
            <div className="w-36 p-0.5">
              <input type="number" step="0.01" value={formData[field]} onChange={e => set(field, e.target.value)}
                className={`${FIELD_INPUT} text-right`} />
            </div>
          </div>
        ))}

        {/* Part II - Summary */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part II — Computation of Tax Due</div>

        {[
          ['14', 'Income Tax Due (from Schedule 2)', 'part2_line14_tax_due'],
          ['19', 'Total Tax Credits/Payments (from Schedule 4)', 'part2_line19_total_credits'],
          ['20', 'Tax Payable (14 less 19)', 'part2_line20_tax_payable'],
          ['21a', 'Surcharge', 'part2_line21a_surcharge'],
          ['21b', 'Interest', 'part2_line21b_interest'],
          ['21c', 'Compromise', 'part2_line21c_compromise'],
          ['22', 'Total Penalties', 'part2_line22_total_penalties'],
          ['25', 'TOTAL AMOUNT DUE', 'part2_line25_total_due'],
        ].map(([num, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-8 border-r border-black p-0.5 text-center font-bold text-[8px]">{num}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1">{label}</div>
            <div className="w-36 p-0.5">
              <input type="number" step="0.01" value={formData[field]} onChange={e => set(field, e.target.value)}
                className={`${FIELD_INPUT} text-right`} />
            </div>
          </div>
        ))}

        {/* Signatory */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Signatory</div>
        <div className={`${CELL} flex`}>
          <div className="flex-1 border-r border-black p-1">
            <span className={LABEL}>Name of President/Principal Officer</span>
            <input value={formData.signatory_name} onChange={e => set('signatory_name', e.target.value)} className={FIELD_INPUT} />
          </div>
          <div className="w-40 border-r border-black p-1">
            <span className={LABEL}>Title</span>
            <input value={formData.signatory_title} onChange={e => set('signatory_title', e.target.value)} className={FIELD_INPUT} />
          </div>
          <div className="w-32 p-1">
            <span className={LABEL}>TIN</span>
            <input value={formData.signatory_tin} onChange={e => set('signatory_tin', e.target.value)} className={FIELD_INPUT} />
          </div>
        </div>
      </div>
    </div>
  )
}
