import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Save, FileDown, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet } from '../../taxUtils'
import { export2316PDF } from '@/utils/bir2316Pdf'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const CELL = 'border border-black'
const LABEL = 'text-[8px] leading-tight'
const FIELD_INPUT = 'w-full h-full bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40'

export function Form2316({ mode = 'create' }) {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const { formId } = useParams()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [employees, setEmployees] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [autoPopulating, setAutoPopulating] = useState(false)

  const [formData, setFormData] = useState({
    tax_year: new Date().getFullYear(),
    period_from: '', period_to: '',
    // Part I - Employee
    employee_tin: ['', '', '', ''], employee_name: '', employee_first_name: '',
    employee_last_name: '', employee_middle_name: '',
    rdo_code: '', employee_address: '', employee_zip_code: '',
    date_of_birth: '', contact_number: '',
    // Part II - Employer
    employer_tin: ['', '', '', ''], employer_name: '', employer_address: '', employer_zip_code: '',
    employer_type: 'Main',
    // Part IVA - Summary
    line_19_gross_compensation: '', line_20_nontaxable_compensation: '',
    line_21_taxable_present: '', line_22_taxable_previous: '',
    line_23_gross_taxable: '', line_24_tax_due: '',
    line_25a_tax_withheld_present: '', line_25b_tax_withheld_previous: '',
    line_26_total_withheld_adjusted: '', line_27_pera_credit: '',
    line_28_total_taxes_withheld: '',
    // Part IVB - Non-taxable
    line_29_basic_salary: '', line_30_holiday_pay: '', line_31_overtime_pay: '',
    line_32_night_shift: '', line_33_hazard_pay: '',
    line_34_13th_month: '', line_35_deminimis: '',
    line_36_sss_philhealth_pagibig: '', line_37_other_nontaxable: '',
    line_38_total_nontaxable: '',
    // Part IVB - Taxable
    line_39_basic_salary_taxable: '', line_40_representation: '',
    line_41_transportation: '', line_42_cola: '', line_43_housing: '',
    line_44_others: '', line_45_overtime_taxable: '', line_46_commission: '',
    line_47_profit_sharing: '', line_48_fees: '', line_49_taxable_13th: '',
    line_50_hazard_pay_taxable: '', line_51_other_taxable: '',
    line_52_total_taxable: '',
    // Signatory
    signatory_name: '', signatory_title: '',
  })

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  // Load employees for selector
  useEffect(() => {
    if (mode === 'create' && entity && entity !== 'All') {
      apiGet('/payroll/employees').then(data => {
        setEmployees(Array.isArray(data) ? data : [])
      }).catch(() => {})
    }
  }, [entity, mode])

  // Load existing form in edit mode
  useEffect(() => {
    if (mode === 'edit' && formId) {
      setLoading(true)
      apiGet(`/tax/bir-forms/${formId}`).then(data => {
        if (data?.form_data) setFormData(prev => ({ ...prev, ...data.form_data }))
      }).catch(() => notify.error('Failed to load form'))
        .finally(() => setLoading(false))
    }
  }, [mode, formId])

  // Auto-populate
  const handleAutoPopulate = async () => {
    if (!selectedEmployee) { notify.error('Select an employee'); return }
    if (!entity || entity === 'All') { notify.error('Select an entity'); return }
    setAutoPopulating(true)
    try {
      const data = await apiGet(`/tax/bir-forms/2316/auto-populate?entity=${entity}&employee_id=${selectedEmployee}&year=${selectedYear}`)
      setFormData(prev => ({ ...prev, ...data }))
      notify.success('Form auto-populated from payroll data')
    } catch (err) {
      notify.error(err.message || 'Auto-populate failed')
    } finally { setAutoPopulating(false) }
  }

  // Save
  const handleSave = async (status = 'DRAFT') => {
    setSaving(true)
    try {
      const body = {
        form_type: '2316',
        entity: entity !== 'All' ? entity : '',
        period_from: `${selectedYear}-01-01`,
        period_to: `${selectedYear}-12-31`,
        status,
        form_data: formData,
        payee_tin: formData.employee_tin?.join('-') || '',
        payee_name: formData.employee_name || '',
        payor_tin: formData.employer_tin?.join('-') || '',
        payor_name: formData.employer_name || '',
      }
      const url = mode === 'edit' ? `${BASE}/tax/bir-forms/${formId}` : `${BASE}/tax/bir-forms`
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Save failed') }
      const saved = await res.json()
      notify.success(status === 'FINALIZED' ? 'Form finalized!' : 'Draft saved!')
      navigate(`/tax/forms/2316/${saved.form_record_id}`)
    } catch (err) { notify.error(err.message) }
    finally { setSaving(false) }
  }

  const money = (v) => {
    const n = parseFloat(v)
    if (!n || isNaN(n)) return ''
    return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" /></div>

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/tax/forms')}>
            <ArrowLeft size={16} />
          </Button>
          <span className="text-sm font-medium text-[var(--color-text)]">BIR Form 2316 — Certificate of Compensation Payment/Tax Withheld</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => export2316PDF(formData)} disabled={!formData.employee_name}>
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
          <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
            className="rounded border border-[var(--color-border)] px-2 py-1.5 text-xs bg-[var(--color-surface)]">
            <option value="">Select Employee...</option>
            {employees.map(emp => (
              <option key={emp.employee_id} value={emp.employee_id}>{emp.employee_name || `Employee #${emp.employee_id}`}</option>
            ))}
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
      <div className="border-2 border-black bg-white p-0 text-black text-[9px] leading-tight" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>
        {/* Header */}
        <div className={`${CELL} flex items-center justify-between p-1`}>
          <div className="text-[6px]">For BIR Use Only<br/>BCS/Item:</div>
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
            <input value={formData.tax_year} onChange={e => set('tax_year', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>2 From (MM/DD)</span>
            <input value={formData.period_from?.slice(5) || '01/01'} readOnly className={`${FIELD_INPUT} w-16`} />
          </div>
          <div className="w-1/3 p-1">
            <span className={LABEL}>To (MM/DD)</span>
            <input value={formData.period_to?.slice(5) || '12/31'} readOnly className={`${FIELD_INPUT} w-16`} />
          </div>
        </div>

        {/* Part I - Employee Information */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part I — Employee Information</div>

        <div className={`${CELL} flex`}>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>3 TIN</span>
            <div className="flex gap-0.5">
              {formData.employee_tin.map((seg, i) => (
                <input key={i} value={seg} onChange={e => { const t = [...formData.employee_tin]; t[i] = e.target.value; set('employee_tin', t) }}
                  className={`${FIELD_INPUT} w-8 text-center border border-gray-300`} maxLength={4} />
              ))}
            </div>
          </div>
          <div className="flex-1 border-r border-black p-1">
            <span className={LABEL}>4 Employee&apos;s Name (Last, First, Middle)</span>
            <input value={formData.employee_name} onChange={e => set('employee_name', e.target.value)} className={FIELD_INPUT} />
          </div>
          <div className="w-20 p-1">
            <span className={LABEL}>5 RDO Code</span>
            <input value={formData.rdo_code} onChange={e => set('rdo_code', e.target.value)} className={`${FIELD_INPUT} w-12`} />
          </div>
        </div>

        <div className={`${CELL} p-1`}>
          <span className={LABEL}>6 Registered Address</span>
          <input value={formData.employee_address} onChange={e => set('employee_address', e.target.value)} className={FIELD_INPUT} />
        </div>

        <div className={`${CELL} flex`}>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>6A ZIP Code</span>
            <input value={formData.employee_zip_code} onChange={e => set('employee_zip_code', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
          <div className="w-1/4 border-r border-black p-1">
            <span className={LABEL}>7 Date of Birth</span>
            <input value={formData.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} className={`${FIELD_INPUT} w-24`} />
          </div>
          <div className="w-1/4 p-1">
            <span className={LABEL}>8 Contact Number</span>
            <input value={formData.contact_number} onChange={e => set('contact_number', e.target.value)} className={`${FIELD_INPUT} w-24`} />
          </div>
        </div>

        {/* Part II - Employer Information */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part II — Employer Information (Present)</div>

        <div className={`${CELL} flex`}>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>12 TIN</span>
            <div className="flex gap-0.5">
              {formData.employer_tin.map((seg, i) => (
                <input key={i} value={seg} onChange={e => { const t = [...formData.employer_tin]; t[i] = e.target.value; set('employer_tin', t) }}
                  className={`${FIELD_INPUT} w-8 text-center border border-gray-300`} maxLength={4} />
              ))}
            </div>
          </div>
          <div className="flex-1 p-1">
            <span className={LABEL}>13 Employer&apos;s Name</span>
            <input value={formData.employer_name} onChange={e => set('employer_name', e.target.value)} className={FIELD_INPUT} />
          </div>
        </div>

        <div className={`${CELL} flex`}>
          <div className="flex-1 border-r border-black p-1">
            <span className={LABEL}>14 Registered Address</span>
            <input value={formData.employer_address} onChange={e => set('employer_address', e.target.value)} className={FIELD_INPUT} />
          </div>
          <div className="w-24 p-1">
            <span className={LABEL}>14A ZIP Code</span>
            <input value={formData.employer_zip_code} onChange={e => set('employer_zip_code', e.target.value)} className={`${FIELD_INPUT} w-16`} />
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
        ].map(([num, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-10 border-r border-black p-0.5 text-center font-bold text-[8px]">{num}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1">{label}</div>
            <div className="w-32 p-0.5">
              <input type="number" step="0.01" value={formData[field]} onChange={e => set(field, e.target.value)}
                className={`${FIELD_INPUT} text-right`} />
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
        ].map(([num, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-10 border-r border-black p-0.5 text-center text-[8px]">{num}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1">{label}</div>
            <div className="w-32 p-0.5">
              <input type="number" step="0.01" value={formData[field]} onChange={e => set(field, e.target.value)}
                className={`${FIELD_INPUT} text-right`} />
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
          ['48', 'Fees Including Director\'s Fees', 'line_48_fees'],
          ['49', 'Taxable 13th Month Benefits', 'line_49_taxable_13th'],
          ['50', 'Hazard Pay', 'line_50_hazard_pay_taxable'],
          ['51', 'Other Taxable Compensation', 'line_51_other_taxable'],
          ['52', 'Total Taxable Compensation Income', 'line_52_total_taxable'],
        ].map(([num, label, field]) => (
          <div key={field} className={`${CELL} flex`}>
            <div className="w-10 border-r border-black p-0.5 text-center text-[8px]">{num}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1">{label}</div>
            <div className="w-32 p-0.5">
              <input type="number" step="0.01" value={formData[field]} onChange={e => set(field, e.target.value)}
                className={`${FIELD_INPUT} text-right`} />
            </div>
          </div>
        ))}

        {/* Signatory */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Signatory</div>
        <div className={`${CELL} flex`}>
          <div className="flex-1 border-r border-black p-1">
            <span className={LABEL}>Present Employer/Authorized Agent Name</span>
            <input value={formData.signatory_name} onChange={e => set('signatory_name', e.target.value)} className={FIELD_INPUT} />
          </div>
          <div className="w-48 p-1">
            <span className={LABEL}>Title/Designation</span>
            <input value={formData.signatory_title} onChange={e => set('signatory_title', e.target.value)} className={FIELD_INPUT} />
          </div>
        </div>
      </div>
    </div>
  )
}
