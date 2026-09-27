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



export function Form2550Q({ mode = 'create' }) {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const { formId } = useParams()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoPopulating, setAutoPopulating] = useState(false)
  const [selectedQuarter, setSelectedQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const [formData, setFormData] = useState({
    tin: ['', '', '', ''],
    rdo_code: '',
    taxpayer_name: '',
    registered_address: '',
    zip_code: '',
    contact_number: '',
    industry_classification: '',
    line_14a: '',
    line_14b: '',
    line_14c: '',
    line_14d: '',
    line_16a: '',
    line_16b: '',
    line_18: '',
    line_19a: '',
    line_19b: '',
    line_19c: '',
    line_19d: '',
    line_19e: '',
    line_21: '',
    line_24: '',
    line_26a: '',
    line_26b: '',
    line_26c: '',
    monthly_breakdown: [
      { month: 1, sales: '', purchases: '', vat: '' },
      { month: 2, sales: '', purchases: '', vat: '' },
      { month: 3, sales: '', purchases: '', vat: '' },
    ],
    signatory_name: '',
    signatory_title: '',
    signatory_tin: '',
  })


  // Computed values
  const line14a = parseFloat(formData.line_14a) || 0
  const line14b = parseFloat(formData.line_14b) || 0
  const line14c = parseFloat(formData.line_14c) || 0
  const line14d = parseFloat(formData.line_14d) || 0
  const line15 = line14a + line14b + line14c + line14d

  const line16a = parseFloat(formData.line_16a) || 0
  const line16b = parseFloat(formData.line_16b) || 0
  const line17 = line16a + line16b
  const line18 = parseFloat(formData.line_18) || 0

  const line19a = parseFloat(formData.line_19a) || 0
  const line19b = parseFloat(formData.line_19b) || 0
  const line19c = parseFloat(formData.line_19c) || 0
  const line19d = parseFloat(formData.line_19d) || 0
  const line19e = parseFloat(formData.line_19e) || 0
  const line20 = line19a + line19b + line19c + line19d + line19e
  const line21 = parseFloat(formData.line_21) || 0
  const line22 = line20 - line21

  const line23 = line17 - line22 - line18
  const line24 = parseFloat(formData.line_24) || 0
  const line25 = line23 - line24
  const line26a = parseFloat(formData.line_26a) || 0
  const line26b = parseFloat(formData.line_26b) || 0
  const line26c = parseFloat(formData.line_26c) || 0
  const line27 = line26a + line26b + line26c
  const line28 = line25 + line27

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  const setMonthly = (idx, field, value) => {
    setFormData(prev => {
      const updated = [...prev.monthly_breakdown]
      updated[idx] = { ...updated[idx], [field]: value }
      return { ...prev, monthly_breakdown: updated }
    })
  }


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
            industry_classification: profile.industry_classification || '',
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
      const data = await apiGet(`/tax/bir-forms/2550Q/auto-populate?entity=${entity}&quarter=${selectedQuarter}&year=${selectedYear}`)
      if (data) {
        setFormData(prev => ({ ...prev, ...data }))
        notify.success('Form auto-populated from AR/AP data')
      }
    } catch { notify.error('Failed to auto-populate') }
    finally { setAutoPopulating(false) }
  }

  const handleSave = async (status = 'DRAFT') => {
    setSaving(true)
    try {
      const { from, to } = quarterDateRange(selectedQuarter, selectedYear)
      const payload = {
        form_type: '2550Q',
        entity: entity !== 'All' ? entity : '',
        period_from: from,
        period_to: to,
        status,
        form_data: {
          ...formData,
          quarter: selectedQuarter,
          year: selectedYear,
          line_15: line15, line_17: line17, line_20: line20,
          line_22: line22, line_23: line23, line_25: line25,
          line_27: line27, line_28: line28,
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
        <span className="text-sm font-medium text-[var(--color-text)]">BIR Form 2550Q</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => handleSave('DRAFT')} disabled={saving}><Save size={14} /> {saving ? 'Saving...' : 'Save Draft'}</Button>
        <Button size="sm" onClick={() => handleSave('FINALIZED')} disabled={saving}><FileDown size={14} /> Finalize</Button>
      </div>

      {/* Form */}
      <BIRFormZoomWrapper>

        {/* Auto-populate panel */}
        {mode === 'create' && (
          <div className="mx-auto mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4" style={{ width: '794px' }}>
            <p className="text-xs font-semibold text-blue-800 mb-2">Auto-populate from AR/AP Data</p>
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
                <TINInput value={formData.tin} onChange={v => set('tin', v)} />
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
              <input type="text" value={formData.rdo_code} onChange={e => set('rdo_code', e.target.value.slice(0, 5))}
                className="w-[50px] border border-black bg-transparent text-[9px] text-center px-1 focus:outline-none focus:bg-blue-50/40" maxLength={5} />
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
              <input type="text" value={formData.taxpayer_name} onChange={e => set('taxpayer_name', e.target.value)} className={FIELD_INPUT} />
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
              <input type="text" value={formData.registered_address} onChange={e => set('registered_address', e.target.value)} className={FIELD_INPUT} />
            </div>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '100px' }}>
              <input type="text" value={formData.zip_code} onChange={e => set('zip_code', e.target.value.slice(0, 4))}
                className="w-[60px] h-full bg-transparent text-[9px] text-center border-l border-r border-black focus:outline-none focus:bg-blue-50/40" maxLength={4} />
            </div>
          </div>

          {/* Contact + Industry */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">7</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2`} style={{ width: '350px' }}>
              <span className="text-[9px]">Telephone Number</span>
              <input type="text" value={formData.contact_number} onChange={e => set('contact_number', e.target.value)}
                className="w-[150px] border border-black bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40" />
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
              <span className="text-[8px] font-bold">8</span>
              <span className="text-[9px]">Industry Classification</span>
              <input type="text" value={formData.industry_classification} onChange={e => set('industry_classification', e.target.value)}
                className="flex-1 border border-black bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40" />
            </div>
          </div>


          {/* Part IV Header */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Part IV — Taxable Sales/Receipts and Output Tax</span>
          </div>

          {/* Line 14a - Vatable Sales */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">14a</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Vatable Sales (from AR)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-blue-50/30`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_14a} onChange={e => set('line_14a', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 14b - Sales to Government */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">14b</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Sales to Government</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_14b} onChange={e => set('line_14b', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 14c - Zero-Rated Sales */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">14c</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Zero-Rated Sales</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_14c} onChange={e => set('line_14c', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 14d - Exempt Sales */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">14d</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Exempt Sales</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_14d} onChange={e => set('line_14d', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 15 - Total Sales (computed) */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">15</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Total Sales (14a + 14b + 14c + 14d)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line15.toFixed(2)}</span>
            </div>
          </div>


          {/* Part V Header */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Part V — Output Tax</span>
          </div>

          {/* Line 16a - Output Tax on Vatable Sales */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">16a</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Output Tax on Vatable Sales (auto-computed)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-blue-50/30`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_16a} onChange={e => set('line_16a', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 16b - Output Tax on Sales to Govt */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">16b</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Output Tax on Sales to Government</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_16b} onChange={e => set('line_16b', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 17 - Total Output Tax (computed) */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">17</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Total Output Tax (16a + 16b)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line17.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 18 - Less: Input Tax from Previous Quarter */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">18</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: Input Tax Carried Over from Previous Quarter</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_18} onChange={e => set('line_18', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>


          {/* Part VI Header */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Part VI — Allowable Input Tax</span>
          </div>

          {/* Line 19a - Purchases of Goods Domestic */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">19a</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Purchases of Goods - Domestic (from AP)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-blue-50/30`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_19a} onChange={e => set('line_19a', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 19b - Purchases Importation */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">19b</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Purchases - Importation</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_19b} onChange={e => set('line_19b', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 19c - Purchases of Services */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">19c</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Purchases of Services - Domestic</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_19c} onChange={e => set('line_19c', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 19d - Capital Goods Domestic */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">19d</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Capital Goods - Domestic</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_19d} onChange={e => set('line_19d', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 19e - Capital Goods Import */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">19e</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Capital Goods - Importation</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_19e} onChange={e => set('line_19e', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 20 - Total Input Tax (computed) */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">20</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Total Input Tax (19a + 19b + 19c + 19d + 19e)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line20.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 21 - Deferred Input Tax */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">21</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Deferred Input Tax</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_21} onChange={e => set('line_21', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 22 - Allowable Input Tax (computed) */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">22</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Allowable Input Tax (20 - 21)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line22.toFixed(2)}</span>
            </div>
          </div>


          {/* Part VII Header */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Part VII — Tax Due</span>
          </div>

          {/* Line 23 - Net VAT Payable (computed) */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">23</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Net VAT Payable / (Excess Input VAT) (17 - 22)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line23.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 24 - Less: Tax Credit/Payments */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">24</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Less: Tax Credit/Payments</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_24} onChange={e => set('line_24', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 25 - Tax Still Due (computed) */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">25</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">Tax Still Due (23 - 24)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line25.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 26a - Surcharge */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">26a</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Surcharge</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_26a} onChange={e => set('line_26a', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 26b - Interest */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">26b</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Interest</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_26b} onChange={e => set('line_26b', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 26c - Compromise */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[8px] font-bold">26c</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Compromise</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.line_26c} onChange={e => set('line_26c', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Line 27 - Total Penalties (computed) */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">27</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Total Penalties (26a + 26b + 26c)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-gray-50`} style={{ width: '180px' }}>
              <span className="text-[9px] font-semibold tabular-nums">{line27.toFixed(2)}</span>
            </div>
          </div>

          {/* Line 28 - TOTAL AMOUNT DUE (computed) */}
          <div className="flex" style={{ height: '30px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">28</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">TOTAL AMOUNT DUE (25 + 27)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-yellow-50`} style={{ width: '180px' }}>
              <span className="text-[10px] font-bold tabular-nums">{line28.toFixed(2)}</span>
            </div>
          </div>


          {/* Monthly Breakdown */}
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
                {formData.monthly_breakdown.map((row, idx) => {
                  const monthNum = (selectedQuarter - 1) * 3 + idx + 1
                  const monthName = new Date(2000, monthNum - 1, 1).toLocaleString('en', { month: 'long' })
                  return (
                    <tr key={idx}>
                      <td className="border border-black px-1 py-0.5 text-[8px]">{monthName}</td>
                      <td className="border border-black px-0 py-0">
                        <input type="number" step="0.01" value={row.sales} onChange={e => setMonthly(idx, 'sales', e.target.value)}
                          className="w-full h-full bg-transparent text-[8px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
                      </td>
                      <td className="border border-black px-0 py-0">
                        <input type="number" step="0.01" value={row.purchases} onChange={e => setMonthly(idx, 'purchases', e.target.value)}
                          className="w-full h-full bg-transparent text-[8px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
                      </td>
                      <td className="border border-black px-0 py-0">
                        <input type="number" step="0.01" value={row.vat} onChange={e => setMonthly(idx, 'vat', e.target.value)}
                          className="w-full h-full bg-transparent text-[8px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
                      </td>
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
              <input type="text" value={formData.signatory_name} onChange={e => set('signatory_name', e.target.value)}
                className="w-[300px] bg-transparent text-[10px] text-center border-b border-black focus:outline-none focus:bg-blue-50/40 py-0.5" />
              <span className="text-[7px]">Signature over Printed Name of Taxpayer/Authorized Representative</span>
              <input type="text" value={formData.signatory_title} onChange={e => set('signatory_title', e.target.value)}
                className="w-[250px] bg-transparent text-[8px] text-center italic focus:outline-none focus:bg-blue-50/40 py-0.5"
                placeholder="(Title/Position)" />
            </div>
            <div className="flex items-center gap-2 text-[7px] mt-2">
              <span>TIN</span>
              <input type="text" value={formData.signatory_tin} onChange={e => set('signatory_tin', e.target.value)}
                className="w-[100px] border-b border-black bg-transparent text-[8px] px-1 focus:outline-none" />
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
