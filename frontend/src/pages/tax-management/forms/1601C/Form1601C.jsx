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

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' }, { value: 4, label: 'April' },
  { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' },
  { value: 9, label: 'September' }, { value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' },
]

function lastDay(year, month) {
  return new Date(year, month, 0).getDate()
}


export function Form1601C({ mode = 'create' }) {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const { formId } = useParams()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoPopulating, setAutoPopulating] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const [formData, setFormData] = useState({
    tin: ['', '', '', ''],
    rdo_code: '',
    taxpayer_name: '',
    registered_address: '',
    zip_code: '',
    contact_number: '',
    category: 'Private',
    amended_return: false,
    number_of_employees: '',
    // Schedule 1
    total_compensation: '',
    statutory_minimum_wage: '',
    holiday_ot_night_diff: '',
    thirteenth_month_benefits: '',
    de_minimis_benefits: '',
    sss_philhealth_pagibig: '',
    other_non_taxable: '',
    // Part II
    line_17: '',
    line_18: '',
    line_20: '',
    line_22a: '',
    line_22b: '',
    line_22c: '',
    // Signatory
    signatory_name: '',
    signatory_title: '',
    signatory_tin: '',
    agent_accreditation_no: '',
    date_of_issue: '',
    date_of_expiry: '',
  })

  // Computed fields
  const totalComp = parseFloat(formData.total_compensation) || 0
  const minWage = parseFloat(formData.statutory_minimum_wage) || 0
  const holidayOT = parseFloat(formData.holiday_ot_night_diff) || 0
  const thirteenth = parseFloat(formData.thirteenth_month_benefits) || 0
  const deMinimis = parseFloat(formData.de_minimis_benefits) || 0
  const sssPhilPag = parseFloat(formData.sss_philhealth_pagibig) || 0
  const otherNonTax = parseFloat(formData.other_non_taxable) || 0
  const taxableComp = totalComp - minWage - holidayOT - thirteenth - deMinimis - sssPhilPag - otherNonTax

  const line17 = parseFloat(formData.line_17) || 0
  const line18 = parseFloat(formData.line_18) || 0
  const line19 = line17 + line18
  const line20 = parseFloat(formData.line_20) || 0
  const line21 = line19 - line20
  const line22a = parseFloat(formData.line_22a) || 0
  const line22b = parseFloat(formData.line_22b) || 0
  const line22c = parseFloat(formData.line_22c) || 0
  const line23 = line22a + line22b + line22c
  const line24 = line21 + line23

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  // Auto-fetch entity profile on create
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

  // Load existing form on edit
  useEffect(() => {
    if (mode === 'edit' && formId) {
      setLoading(true)
      apiGet(`/tax/bir-forms/${formId}`).then(data => {
        if (data?.form_data) {
          setFormData(prev => ({ ...prev, ...data.form_data }))
          if (data.period_from) {
            const d = new Date(data.period_from)
            setSelectedMonth(d.getMonth() + 1)
            setSelectedYear(d.getFullYear())
          }
        }
      }).catch(() => notify.error('Failed to load form'))
        .finally(() => setLoading(false))
    }
  }, [mode, formId])

  const handleAutoPopulate = async () => {
    if (!entity || entity === 'All') { notify.error('Select a specific entity first'); return }
    setAutoPopulating(true)
    try {
      const data = await apiGet(`/tax/bir-forms/1601C/auto-populate?entity=${entity}&month=${selectedMonth}&year=${selectedYear}`)
      if (data) {
        setFormData(prev => ({ ...prev, ...data }))
        notify.success('Form auto-populated from payroll data')
      }
    } catch { notify.error('Failed to auto-populate') }
    finally { setAutoPopulating(false) }
  }

  const handleSave = async (status = 'DRAFT') => {
    setSaving(true)
    try {
      const m = selectedMonth.toString().padStart(2, '0')
      const lastDayOfMonth = `${selectedYear}-${m}-${lastDay(selectedYear, selectedMonth).toString().padStart(2, '0')}`
      const payload = {
        form_type: '1601C',
        entity: entity !== 'All' ? entity : '',
        period_from: `${selectedYear}-${m}-01`,
        period_to: lastDayOfMonth,
        status,
        form_data: {
          ...formData,
          month: selectedMonth,
          year: selectedYear,
          taxable_compensation: taxableComp,
          line_19: line19,
          line_21: line21,
          line_23: line23,
          line_24: line24,
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
        <span className="text-sm font-medium text-[var(--color-text)]">BIR Form 1601-C</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => handleSave('DRAFT')} disabled={saving}><Save size={14} /> {saving ? 'Saving...' : 'Save Draft'}</Button>
        <Button size="sm" onClick={() => handleSave('FINALIZED')} disabled={saving}><FileDown size={14} /> Finalize</Button>
      </div>

      {/* Form */}
      <BIRFormZoomWrapper>

        {/* Auto-populate panel */}
        {mode === 'create' && (
          <div className="mx-auto mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4" style={{ width: '794px' }}>
            <p className="text-xs font-semibold text-blue-800 mb-2">Auto-populate from Payroll Data</p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[11px] text-blue-700 block mb-0.5">Month</label>
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="rounded border border-blue-300 bg-white px-2 py-1 text-xs focus:outline-none">
                  {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
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


          {/* Header - BIR Use Only | Republic | Barcode */}
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
              <span className="text-[24px] font-bold leading-none">1601-C</span>
              <span className="text-[6px] text-gray-600">January 2018 (ENCS)</span>
            </div>
            <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
              <span className="text-[14px] font-bold">Monthly Remittance Return of</span>
              <span className="text-[14px] font-bold">Income Taxes Withheld on</span>
              <span className="text-[14px] font-bold">Compensation</span>
            </div>
            <div className={`${CELL} flex items-end justify-center pb-1`} style={{ width: '140px' }}>
              <span className="text-[7px]">1601C 01/18ENCS</span>
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
              <span className="text-[9px] font-bold">For the Month</span>
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                className="border border-black bg-transparent text-[9px] px-1 py-0.5 focus:outline-none focus:bg-blue-50/40">
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <span className="text-[9px] font-bold">Year</span>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                className="border border-black bg-transparent text-[9px] px-1 py-0.5 focus:outline-none focus:bg-blue-50/40">
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Amended Return checkbox */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">2</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-4 flex-1`}>
              <label className="flex items-center gap-1 text-[8px]">
                <input type="checkbox" checked={formData.amended_return} onChange={e => set('amended_return', e.target.checked)} className="w-3 h-3" />
                Amended Return?
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

          {/* Number of Employees */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">10</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
              <span className="text-[9px]">Number of Employees</span>
              <input type="number" value={formData.number_of_employees} onChange={e => set('number_of_employees', e.target.value)}
                className="w-[80px] border border-black bg-transparent text-[9px] text-center px-1 focus:outline-none focus:bg-blue-50/40" />
            </div>
          </div>


          {/* Schedule 1 Header */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Schedule 1 — Computation of Total Compensation and Taxes</span>
          </div>

          {/* Total Compensation Paid */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">11</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Total Amount of Compensation Paid</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.total_compensation} onChange={e => set('total_compensation', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Less: Statutory Minimum Wage */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">12a</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: Statutory Minimum Wage</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.statutory_minimum_wage} onChange={e => set('statutory_minimum_wage', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Less: Holiday/OT/Night Shift Differential */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">12b</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: Holiday/Overtime/Night Shift Differential</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.holiday_ot_night_diff} onChange={e => set('holiday_ot_night_diff', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Less: 13th Month & Benefits */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">12c</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: 13th Month Pay & Other Benefits</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.thirteenth_month_benefits} onChange={e => set('thirteenth_month_benefits', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Less: De Minimis Benefits */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">12d</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: De Minimis Benefits</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.de_minimis_benefits} onChange={e => set('de_minimis_benefits', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Less: SSS/GSIS/PhilHealth/Pag-IBIG */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">12e</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: SSS/GSIS/PhilHealth/Pag-IBIG Contributions</span>
              <span className="text-[7px] text-gray-500 ml-2">(auto from payroll)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.sss_philhealth_pagibig} onChange={e => set('sss_philhealth_pagibig', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Less: Other Non-Taxable Compensation */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">12f</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: Other Non-Taxable Compensation</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.other_non_taxable} onChange={e => set('other_non_taxable', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Taxable Compensation - computed */}
          <div className="flex" style={{ height: '30px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">13</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Taxable Compensation (Item 11 less Items 12a to 12f)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-yellow-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{taxableComp.toFixed(2)}</span>
            </div>
          </div>


          {/* Part II Header */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Part II — Computation of Tax Due</span>
          </div>

          {/* Line 17 - Taxes Withheld for the Month */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">17</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Taxes Withheld for the Month</span>
              <span className="text-[7px] text-gray-500 ml-2">(auto from payroll)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_17} onChange={e => set('line_17', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 18 - Adjustment from Previous Month */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">18</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Adjustment from Previous Month(s)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_18} onChange={e => set('line_18', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 19 - Total Taxes Withheld (computed) */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">19</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Total Taxes Withheld (Item 17 + Item 18)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line19.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 20 - Tax Remitted Previously */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">20</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: Tax Remitted in Return Previously Filed (for amended)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_20} onChange={e => set('line_20', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 21 - Tax Still Due (computed) */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">21</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Tax Still Due (Item 19 less Item 20)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line21.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 22a - Surcharge */}
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

          {/* Line 22b - Interest */}
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

          {/* Line 22c - Compromise */}
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

          {/* Line 23 - Total Penalties (computed) */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">23</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Total Penalties (Items 22a + 22b + 22c)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line23.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 24 - TOTAL AMOUNT DUE (computed) */}
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
