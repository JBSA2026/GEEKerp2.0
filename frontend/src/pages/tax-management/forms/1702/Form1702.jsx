import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Save, FileDown, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet } from '../../taxUtils'
import { export1702PDF } from '@/utils/bir1702Pdf'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const CELL = 'border border-black'
const LABEL = 'text-[8px] leading-tight'
const FIELD_INPUT = 'w-full h-full bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40'

export function Form1702({ mode = 'create' }) {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const { formId } = useParams()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear() - 1)
  const [autoPopulating, setAutoPopulating] = useState(false)

  const [formData, setFormData] = useState({
    tax_year: new Date().getFullYear() - 1,
    calendar_fiscal: 'Calendar', amended_return: false, short_period: false,
    atc: 'IC 010', method_of_deduction: 'OSD',
    tin: ['', '', '', ''], rdo_code: '', registered_name: '',
    registered_address: '', zip_code: '', contact_number: '', email: '',
    date_of_incorporation: '',
    // Part IV
    line_27_sales: '', line_28_sales_returns: '', line_29_net_sales: '',
    line_30_cost_of_sales: '', line_31_gross_income: '', line_32_other_income: '',
    line_33_total_taxable_income: '', line_34_ordinary_deductions: '',
    line_35_special_deductions: '', line_36_nolco: '', line_37_total_deductions: '',
    line_38_osd: '', line_39_net_taxable_income: '', line_40_tax_rate: 25,
    line_41_income_tax_due: '', line_42_mcit_due: '', line_43_tax_due: '',
    // Credits
    line_44_prior_year_excess: '', line_45_mcit_prev_qtrs: '',
    line_46_regular_prev_qtrs: '', line_47_excess_mcit_applied: '',
    line_48_cwt_prev_qtrs: '', line_49_cwt_2307_4th_qtr: '',
    line_50_foreign_tax_credits: '', line_51_tax_prev_filed: '',
    line_52_special_tax_credits: '', line_55_total_credits: '',
    line_56_net_tax_payable: '',
    // Part II
    part2_line14_tax_due: '', part2_line15_total_credits: '',
    part2_line16_net_payable: '', part2_line17_surcharge: '',
    part2_line18_interest: '', part2_line19_compromise: '',
    part2_line20_total_penalties: '', part2_line21_total_payable: '',
    overpayment_option: '',
    signatory_name: '', signatory_title: '', signatory_tin: '',
  })

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

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
            zip_code: profile.zip_code || '', rdo_code: profile.rdo_code || '',
            contact_number: profile.contact_number || '',
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
      }).catch(() => notify.error('Failed to load form'))
        .finally(() => setLoading(false))
    }
  }, [mode, formId])

  const handleAutoPopulate = async () => {
    if (!entity || entity === 'All') { notify.error('Select an entity'); return }
    setAutoPopulating(true)
    try {
      const data = await apiGet(`/tax/bir-forms/1702/auto-populate?entity=${entity}&year=${selectedYear}`)
      setFormData(prev => ({ ...prev, ...data }))
      notify.success('Form auto-populated from annual AR/AP data')
    } catch (err) { notify.error(err.message || 'Auto-populate failed') }
    finally { setAutoPopulating(false) }
  }

  const handleSave = async (status = 'DRAFT') => {
    setSaving(true)
    try {
      const body = {
        form_type: '1702', entity: entity !== 'All' ? entity : '',
        period_from: `${selectedYear}-01-01`, period_to: `${selectedYear}-12-31`,
        status, form_data: formData,
        payor_tin: formData.tin?.join('-') || '', payor_name: formData.registered_name,
      }
      const url = mode === 'edit' ? `${BASE}/tax/bir-forms/${formId}` : `${BASE}/tax/bir-forms`
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Save failed') }
      const saved = await res.json()
      notify.success(status === 'FINALIZED' ? 'Form finalized!' : 'Draft saved!')
      navigate(`/tax/forms/1702/${saved.form_record_id}`)
    } catch (err) { notify.error(err.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/tax/forms')}><ArrowLeft size={16} /></Button>
          <span className="text-sm font-medium text-[var(--color-text)]">BIR Form 1702-RT — Annual Income Tax Return (Corporations)</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => export1702PDF(formData)} disabled={!formData.registered_name}>
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

      {mode === 'create' && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]">
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
            <input value={formData.calendar_fiscal} onChange={e => set('calendar_fiscal', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>2 Year Ended</span>
            <input value={formData.tax_year} onChange={e => set('tax_year', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>5 ATC</span>
            <input value={formData.atc} onChange={e => set('atc', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
          <div className="w-1/4 p-1">
            <span className={LABEL}>13 Deduction Method</span>
            <select value={formData.method_of_deduction} onChange={e => set('method_of_deduction', e.target.value)} className={`${FIELD_INPUT} w-28`}>
              <option value="OSD">OSD (40%)</option>
              <option value="Itemized">Itemized</option>
            </select>
          </div>
        </div>

        {/* Part I */}
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

        {/* Tax Credits */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Tax Credits/Payments</div>

        {[
          ['44', "Prior Year's Excess Credits", 'line_44_prior_year_excess'],
          ['46', 'Income Tax Payment from Previous Quarter/s', 'line_46_regular_prev_qtrs'],
          ['48', 'CWT from Previous Quarter/s (per 2307)', 'line_48_cwt_prev_qtrs'],
          ['49', 'CWT per BIR 2307 for the 4th Quarter', 'line_49_cwt_2307_4th_qtr'],
          ['55', 'Total Tax Credits/Payments', 'line_55_total_credits'],
          ['56', 'Net Tax Payable / (Overpayment)', 'line_56_net_tax_payable'],
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
            <span className={LABEL}>President/Principal Officer</span>
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
