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

const TAX_TYPES = [
  'Income Tax',
  'VAT',
  'Withholding Tax',
  'Percentage Tax',
  'Other',
]

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
]


export function Form0605({ mode = 'create' }) {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const { formId } = useParams()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    tin: ['', '', '', ''],
    rdo_code: '',
    taxpayer_name: '',
    registered_address: '',
    zip_code: '',
    contact_number: '',
    filing_month: new Date().getMonth() + 1,
    filing_year: new Date().getFullYear(),
    amended_return: false,
    // Part II
    tax_type: 'Income Tax',
    atc_code: '',
    return_period: '',
    basic_tax: '',
    surcharge: '',
    interest: '',
    compromise: '',
    // Part III
    drawee_bank: '',
    payment_number: '',
    payment_date: '',
    payment_amount: '',
    // Signatory
    signatory_name: '',
    signatory_title: '',
  })

  const basicTax = parseFloat(formData.basic_tax) || 0
  const surcharge = parseFloat(formData.surcharge) || 0
  const interest = parseFloat(formData.interest) || 0
  const compromise = parseFloat(formData.compromise) || 0
  const totalPayable = basicTax + surcharge + interest + compromise

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
        if (data?.form_data) setFormData(prev => ({ ...prev, ...data.form_data }))
      }).catch(() => notify.error('Failed to load form'))
        .finally(() => setLoading(false))
    }
  }, [mode, formId])

  const handleSave = async (status = 'DRAFT') => {
    setSaving(true)
    try {
      const periodFrom = `${formData.filing_year}-${String(formData.filing_month).padStart(2, '0')}-01`
      const lastDay = new Date(formData.filing_year, formData.filing_month, 0).getDate()
      const periodTo = `${formData.filing_year}-${String(formData.filing_month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const payload = {
        form_type: '0605',
        entity: entity !== 'All' ? entity : '',
        period_from: periodFrom,
        period_to: periodTo,
        status,
        form_data: {
          ...formData,
          total_amount_payable: totalPayable,
        },
        payee_tin: '',
        payor_tin: formData.tin?.join('-'),
        payor_name: formData.taxpayer_name,
      }
      const url = mode === 'edit' && formId ? `${BASE}/tax/bir-forms/${formId}` : `${BASE}/tax/bir-forms`
      const method = mode === 'edit' && formId ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      const saved = await res.json()
      notify.success(status === 'FINALIZED' ? 'Form finalized!' : 'Draft saved.')
      navigate(`/tax/forms/0605/${saved.form_record_id}`)
    } catch { notify.error('Failed to save form') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <Button variant="outline" size="sm" onClick={() => navigate('/tax/forms')}><ArrowLeft size={14} /> Back</Button>
        <span className="text-sm font-medium text-[var(--color-text)]">BIR Form 0605 — Payment Form</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => handleSave('DRAFT')} disabled={saving}><Save size={14} /> {saving ? 'Saving...' : 'Save Draft'}</Button>
        <Button size="sm" onClick={() => handleSave('FINALIZED')} disabled={saving}><FileDown size={14} /> Finalize</Button>
      </div>

      {/* Form */}
      <BIRFormZoomWrapper>
        <div className="mx-auto bg-white shadow-lg" style={{ width: '794px', minHeight: '1123px', padding: 0, border: '2px solid black' }}>

          {/* Header */}
          <div className="flex" style={{ height: '48px' }}>
            <div className={`${CELL} flex flex-col justify-center px-1`} style={{ width: '80px' }}>
              <span className="text-[7px]">For BIR</span>
              <span className="text-[7px]">Use Only</span>
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
              <span className="text-[20px] font-bold leading-none">0605</span>
              <span className="text-[6px] text-gray-600">January 2018 (ENCS)</span>
            </div>
            <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
              <span className="text-[12px] font-bold">Payment Form</span>
            </div>
            <div className={`${CELL} flex items-end justify-center pb-1`} style={{ width: '140px' }}>
              <span className="text-[7px]">0605 01/18ENCS</span>
            </div>
          </div>

          {/* Instruction */}
          <div className={`${CELL} px-2 flex items-center`} style={{ height: '18px' }}>
            <span className="text-[7px] italic">Fill in all applicable spaces. Mark all appropriate boxes with an "X".</span>
          </div>

          {/* Filing Period */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">1</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-4 flex-1`}>
              <span className="text-[9px] font-bold">Filing Period</span>
              <select value={formData.filing_month} onChange={e => set('filing_month', Number(e.target.value))}
                className="border border-black bg-transparent text-[9px] px-1 py-0.5 focus:outline-none focus:bg-blue-50/40">
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={formData.filing_year} onChange={e => set('filing_year', Number(e.target.value))}
                className="border border-black bg-transparent text-[9px] px-1 py-0.5 focus:outline-none focus:bg-blue-50/40">
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Amended Return */}
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
              <span className={LABEL}>Taxpayer's Name</span>
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

          {/* Part II Header */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Part II — Tax Payment Details</span>
          </div>

          {/* Tax Type */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">9</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
              <span className="text-[9px]">Particular Tax Type</span>
              <select value={formData.tax_type} onChange={e => set('tax_type', e.target.value)}
                className="border border-black bg-transparent text-[9px] px-1 py-0.5 focus:outline-none focus:bg-blue-50/40">
                {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* ATC Code */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">10</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
              <span className="text-[9px]">ATC Code</span>
              <input type="text" value={formData.atc_code} onChange={e => set('atc_code', e.target.value)}
                className="w-[120px] border border-black bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40" />
            </div>
          </div>

          {/* Return Period */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">11</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
              <span className="text-[9px]">Return Period</span>
              <input type="text" value={formData.return_period} onChange={e => set('return_period', e.target.value)}
                className="w-[150px] border border-black bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40" placeholder="MM/YYYY" />
            </div>
          </div>

          {/* Basic Tax */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">12</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Basic Tax/Deposit</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.basic_tax} onChange={e => set('basic_tax', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Surcharge */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">13</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Surcharge</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.surcharge} onChange={e => set('surcharge', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Interest */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">14</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Interest</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.interest} onChange={e => set('interest', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Compromise */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">15</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px]">Compromise</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2`} style={{ width: '180px' }}>
              <input type="number" step="0.01" value={formData.compromise} onChange={e => set('compromise', e.target.value)}
                className="w-full h-full bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
            </div>
          </div>

          {/* Total Amount Payable */}
          <div className="flex" style={{ height: '30px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">16</span>
            </div>
            <div className={`${CELL} flex items-center px-2 flex-1`}>
              <span className="text-[9px] font-bold">TOTAL AMOUNT PAYABLE (12 + 13 + 14 + 15)</span>
            </div>
            <div className={`${CELL} flex items-center justify-end px-2 bg-yellow-50`} style={{ width: '180px' }}>
              <span className="text-[10px] font-bold tabular-nums">{totalPayable.toFixed(2)}</span>
            </div>
          </div>

          {/* Part III Header */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Part III — Details of Payment</span>
          </div>

          {/* Payment Details */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">17</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
              <span className="text-[9px]">Drawee Bank</span>
              <input type="text" value={formData.drawee_bank} onChange={e => set('drawee_bank', e.target.value)}
                className="flex-1 border border-black bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40" />
            </div>
          </div>

          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">18</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-2 flex-1`}>
              <span className="text-[9px]">Number</span>
              <input type="text" value={formData.payment_number} onChange={e => set('payment_number', e.target.value)}
                className="w-[150px] border border-black bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40" />
              <span className="text-[9px] ml-4">Date</span>
              <input type="date" value={formData.payment_date} onChange={e => set('payment_date', e.target.value)}
                className="border border-black bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40" />
              <span className="text-[9px] ml-4">Amount</span>
              <input type="number" step="0.01" value={formData.payment_amount} onChange={e => set('payment_amount', e.target.value)}
                className="w-[120px] border border-black bg-transparent text-[9px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
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
              <span className="text-[7px]">Signature over Printed Name of Taxpayer/Authorized Representative</span>
              <input type="text" value={formData.signatory_title} onChange={e => set('signatory_title', e.target.value)}
                className="w-[250px] bg-transparent text-[8px] text-center italic focus:outline-none focus:bg-blue-50/40 py-0.5"
                placeholder="(Title/Position)" />
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
