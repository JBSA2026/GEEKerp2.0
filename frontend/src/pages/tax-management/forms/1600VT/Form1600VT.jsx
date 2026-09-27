import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Save, FileDown, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet } from '../../taxUtils'
import { export1600VTPDF } from '@/utils/bir1600VTPdf'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const CELL = 'border border-black'
const LABEL = 'text-[8px] leading-tight'
const FIELD_INPUT = 'w-full h-full bg-transparent text-[9px] px-1 focus:outline-none focus:bg-blue-50/40'

export function Form1600VT({ mode = 'create' }) {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const { formId } = useParams()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [autoPopulating, setAutoPopulating] = useState(false)

  const [formData, setFormData] = useState({
    return_period: '', amended_return: false,
    tin: ['', '', '', ''], rdo_code: '', taxpayer_name: '',
    registered_address: '', zip_code: '', contact_number: '',
    category_of_agent: 'Private',
    line_12_vat_withheld: '', line_13_prev_remitted: '',
    line_14_tax_still_due: '', line_15a_surcharge: '',
    line_15b_interest: '', line_15c_compromise: '', line_16_total_due: '',
    payee_breakdown: [], total_gross_payments: '', total_vat_withheld: '',
    number_of_payees: 0,
    signatory_name: '', signatory_title: '', signatory_tin: '',
  })

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  // Auto-compute
  const line12 = parseFloat(formData.line_12_vat_withheld) || 0
  const line13 = parseFloat(formData.line_13_prev_remitted) || 0
  const line14 = line12 - line13
  const line15a = parseFloat(formData.line_15a_surcharge) || 0
  const line15b = parseFloat(formData.line_15b_interest) || 0
  const line15c = parseFloat(formData.line_15c_compromise) || 0
  const line16 = line14 + line15a + line15b + line15c

  // Load entity profile on create
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
      const data = await apiGet(`/tax/bir-forms/1600VT/auto-populate?entity=${entity}&month=${selectedMonth}&year=${selectedYear}`)
      setFormData(prev => ({ ...prev, ...data }))
      notify.success('Form auto-populated from AP bills')
    } catch (err) { notify.error(err.message || 'Auto-populate failed') }
    finally { setAutoPopulating(false) }
  }

  const handleSave = async (status = 'DRAFT') => {
    setSaving(true)
    try {
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
      const body = {
        form_type: '1600VT', entity: entity !== 'All' ? entity : '',
        period_from: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`,
        period_to: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${lastDay}`,
        status, form_data: { ...formData, line_14_tax_still_due: line14, line_16_total_due: line16 },
        payor_tin: formData.tin?.join('-') || '', payor_name: formData.taxpayer_name,
      }
      const url = mode === 'edit' ? `${BASE}/tax/bir-forms/${formId}` : `${BASE}/tax/bir-forms`
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Save failed') }
      const saved = await res.json()
      notify.success(status === 'FINALIZED' ? 'Form finalized!' : 'Draft saved!')
      navigate(`/tax/forms/1600VT/${saved.form_record_id}`)
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
          <span className="text-sm font-medium text-[var(--color-text)]">BIR Form 1600-VT — Monthly Remittance Return of Value-Added Tax Withheld</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => export1600VTPDF({ ...formData, line_14_tax_still_due: line14, line_16_total_due: line16 })} disabled={!formData.taxpayer_name}>
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
          <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
            className="rounded border border-[var(--color-border)] px-2 py-1.5 text-xs bg-[var(--color-surface)]">
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en', { month: 'long' })}</option>)}
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
      <div className="border-2 border-black bg-white p-0 text-black text-[9px] leading-tight" style={{ width: '210mm', minHeight: '200mm', margin: '0 auto' }}>
        {/* Header */}
        <div className={`${CELL} flex items-center justify-between p-1`}>
          <div className="text-[6px]">For BIR Use Only<br />BCS/Item:</div>
          <div className="text-center">
            <div className="text-[7px]">Republic of the Philippines</div>
            <div className="text-[7px]">Department of Finance</div>
            <div className="text-[7px] font-bold">Bureau of Internal Revenue</div>
          </div>
          <div className="text-[6px]">1600-VT 01/18ENCS</div>
        </div>

        {/* Form Title */}
        <div className={`${CELL} flex`}>
          <div className="w-24 border-r border-black p-1">
            <div className={LABEL}>BIR Form No.</div>
            <div className="text-lg font-bold">1600-VT</div>
            <div className="text-[6px]">January 2018 (ENCS)</div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[10px] font-bold">Monthly Remittance Return</div>
              <div className="text-[9px] font-bold">of Value-Added Tax Withheld</div>
            </div>
          </div>
        </div>

        {/* Return Period */}
        <div className={`${CELL} flex`}>
          <div className="w-1/2 border-r border-black p-1">
            <span className={LABEL}>Return Period (MM/YYYY): </span>
            <input value={formData.return_period || `${String(selectedMonth).padStart(2, '0')}/${selectedYear}`}
              onChange={e => set('return_period', e.target.value)} className={`${FIELD_INPUT} w-24`} />
          </div>
          <div className="w-1/2 p-1 flex items-center gap-2">
            <span className={LABEL}>Amended Return?</span>
            <input type="checkbox" checked={formData.amended_return} onChange={e => set('amended_return', e.target.checked)} />
          </div>
        </div>

        {/* Part I - Background */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part I — Background Information</div>

        <div className={`${CELL} flex`}>
          <div className="w-1/2 border-r border-black p-1">
            <span className={LABEL}>TIN</span>
            <div className="flex gap-0.5 mt-0.5">
              {formData.tin.map((seg, i) => (
                <input key={i} value={seg} onChange={e => { const t = [...formData.tin]; t[i] = e.target.value; set('tin', t) }}
                  className={`${FIELD_INPUT} w-10 text-center border border-gray-300`} maxLength={4} />
              ))}
            </div>
          </div>
          <div className="w-1/2 p-1">
            <span className={LABEL}>RDO Code</span>
            <input value={formData.rdo_code} onChange={e => set('rdo_code', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
        </div>

        <div className={`${CELL} p-1`}>
          <span className={LABEL}>Taxpayer&apos;s Name</span>
          <input value={formData.taxpayer_name} onChange={e => set('taxpayer_name', e.target.value)} className={FIELD_INPUT} />
        </div>
        <div className={`${CELL} p-1`}>
          <span className={LABEL}>Registered Address</span>
          <input value={formData.registered_address} onChange={e => set('registered_address', e.target.value)} className={FIELD_INPUT} />
        </div>
        <div className={`${CELL} flex`}>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>ZIP Code</span>
            <input value={formData.zip_code} onChange={e => set('zip_code', e.target.value)} className={`${FIELD_INPUT} w-16`} />
          </div>
          <div className="w-1/3 border-r border-black p-1">
            <span className={LABEL}>Contact Number</span>
            <input value={formData.contact_number} onChange={e => set('contact_number', e.target.value)} className={`${FIELD_INPUT} w-28`} />
          </div>
          <div className="w-1/3 p-1">
            <span className={LABEL}>Category</span>
            <input value={formData.category_of_agent} onChange={e => set('category_of_agent', e.target.value)} className={`${FIELD_INPUT} w-20`} />
          </div>
        </div>

        {/* Part II - Computation */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Part II — Computation of Tax</div>

        {[
          ['12', 'Total Amount of VAT Withheld for the Month', 'line_12_vat_withheld', false],
          ['13', 'Less: VAT Remitted in Return Previously Filed (Amended)', 'line_13_prev_remitted', false],
          ['14', 'VAT Still Due / (Overremittance) (12 less 13)', null, true],
          ['15a', 'Surcharge', 'line_15a_surcharge', false],
          ['15b', 'Interest', 'line_15b_interest', false],
          ['15c', 'Compromise', 'line_15c_compromise', false],
          ['16', 'TOTAL AMOUNT STILL DUE / (Overremittance)', null, true],
        ].map(([num, label, field, computed]) => (
          <div key={num} className={`${CELL} flex`}>
            <div className="w-10 border-r border-black p-0.5 text-center font-bold text-[8px]">{num}</div>
            <div className="flex-1 border-r border-black p-0.5 pl-1">{label}</div>
            <div className="w-36 p-0.5">
              {computed ? (
                <div className="text-right text-[9px] font-bold px-1 py-0.5">
                  {money(num === '14' ? line14 : line16)}
                </div>
              ) : (
                <input type="number" step="0.01" value={formData[field]}
                  onChange={e => set(field, e.target.value)} className={`${FIELD_INPUT} text-right`} />
              )}
            </div>
          </div>
        ))}

        {/* Schedule 1 - Payees */}
        {formData.payee_breakdown?.length > 0 && (
          <>
            <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>
              Schedule 1 — List of Payees ({formData.payee_breakdown.length})
            </div>
            <div className={`${CELL}`}>
              <table className="w-full text-[8px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-black">
                    <th className="px-1 py-0.5 text-left border-r border-black">Payee Name</th>
                    <th className="px-1 py-0.5 text-left border-r border-black w-24">TIN</th>
                    <th className="px-1 py-0.5 text-right border-r border-black w-24">Gross Payments</th>
                    <th className="px-1 py-0.5 text-right w-24">VAT Withheld</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.payee_breakdown.map((p, i) => (
                    <tr key={i} className="border-b border-gray-300">
                      <td className="px-1 py-0.5 border-r border-gray-300">{p.payee_name}</td>
                      <td className="px-1 py-0.5 border-r border-gray-300">{p.tin}</td>
                      <td className="px-1 py-0.5 text-right border-r border-gray-300">{money(p.gross_payments)}</td>
                      <td className="px-1 py-0.5 text-right">{money(p.vat_withheld)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t border-black">
                    <td className="px-1 py-0.5 border-r border-black" colSpan={2}>TOTAL</td>
                    <td className="px-1 py-0.5 text-right border-r border-black">{money(formData.total_gross_payments)}</td>
                    <td className="px-1 py-0.5 text-right">{money(formData.total_vat_withheld)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Signatory */}
        <div className={`${CELL} bg-gray-100 px-2 py-0.5 font-bold text-[8px]`}>Signatory</div>
        <div className={`${CELL} flex`}>
          <div className="flex-1 border-r border-black p-1">
            <span className={LABEL}>Name of Authorized Agent/Representative</span>
            <input value={formData.signatory_name} onChange={e => set('signatory_name', e.target.value)} className={FIELD_INPUT} />
          </div>
          <div className="w-40 border-r border-black p-1">
            <span className={LABEL}>Title/Designation</span>
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
