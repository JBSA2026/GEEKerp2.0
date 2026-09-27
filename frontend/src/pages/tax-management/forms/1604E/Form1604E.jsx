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

export function Form1604E({ mode = 'create' }) {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const { formId } = useParams()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoPopulating, setAutoPopulating] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear() - 1)
  const [alphalist, setAlphalist] = useState([])

  const [formData, setFormData] = useState({
    tin: ['', '', '', ''],
    rdo_code: '',
    taxpayer_name: '',
    registered_address: '',
    zip_code: '',
    contact_number: '',
    category: 'Private',
    quarterly_summary: [
      { quarter: 1, taxes_withheld: '', taxes_remitted: '' },
      { quarter: 2, taxes_withheld: '', taxes_remitted: '' },
      { quarter: 3, taxes_withheld: '', taxes_remitted: '' },
      { quarter: 4, taxes_withheld: '', taxes_remitted: '' },
    ],
    signatory_name: '',
    signatory_title: '',
    signatory_tin: '',
    agent_accreditation_no: '',
    date_of_issue: '',
    date_of_expiry: '',
  })

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  const setQuarterly = (qIdx, field, value) => {
    setFormData(prev => {
      const qs = [...prev.quarterly_summary]
      qs[qIdx] = { ...qs[qIdx], [field]: value }
      return { ...prev, quarterly_summary: qs }
    })
  }

  const totalWithheld = formData.quarterly_summary.reduce((s, q) => s + (parseFloat(q.taxes_withheld) || 0), 0)
  const totalRemitted = formData.quarterly_summary.reduce((s, q) => s + (parseFloat(q.taxes_remitted) || 0), 0)

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
      const data = await apiGet(`/tax/bir-forms/1604E/auto-populate?entity=${entity}&year=${selectedYear}`)
      if (data) {
        setFormData(prev => ({ ...prev, ...data }))
        if (data.alphalist) setAlphalist(data.alphalist)
        if (data.quarterly_summary) setFormData(prev => ({ ...prev, quarterly_summary: data.quarterly_summary }))
        notify.success('Form auto-populated from annual withholding data')
      }
    } catch { notify.error('Failed to auto-populate') }
    finally { setAutoPopulating(false) }
  }

  const handleSave = async (status = 'DRAFT') => {
    setSaving(true)
    try {
      const payload = {
        form_type: '1604E',
        entity: entity !== 'All' ? entity : '',
        period_from: `${selectedYear}-01-01`,
        period_to: `${selectedYear}-12-31`,
        status,
        form_data: {
          ...formData,
          year: selectedYear,
          alphalist,
          total_taxes_withheld: totalWithheld,
          total_taxes_remitted: totalRemitted,
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
      const saved = await res.json()
      notify.success(status === 'FINALIZED' ? 'Form finalized!' : 'Draft saved.')
      navigate(`/tax/forms/1604E/${saved.form_record_id}`)
    } catch { notify.error('Failed to save form') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>


  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <Button variant="outline" size="sm" onClick={() => navigate('/tax/forms')}><ArrowLeft size={14} /> Back</Button>
        <span className="text-sm font-medium text-[var(--color-text)]">BIR Form 1604-E — Annual Information Return of Creditable Income Taxes Withheld (Expanded)</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => handleSave('DRAFT')} disabled={saving}><Save size={14} /> {saving ? 'Saving...' : 'Save Draft'}</Button>
        <Button size="sm" onClick={() => handleSave('FINALIZED')} disabled={saving}><FileDown size={14} /> Finalize</Button>
      </div>

      {/* Form */}
      <BIRFormZoomWrapper>

        {/* Auto-populate panel */}
        {mode === 'create' && (
          <div className="mx-auto mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4" style={{ width: '794px' }}>
            <p className="text-xs font-semibold text-blue-800 mb-2">Auto-populate from Annual Withholding Tax Data</p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[11px] text-blue-700 block mb-0.5">Year</label>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                  className="rounded border border-blue-300 bg-white px-2 py-1 text-xs focus:outline-none">
                  {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
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
              <span className="text-[20px] font-bold leading-none">1604-E</span>
              <span className="text-[6px] text-gray-600">January 2018 (ENCS)</span>
            </div>
            <div className={`${CELL} flex-1 flex flex-col items-center justify-center`}>
              <span className="text-[11px] font-bold">Annual Information Return of</span>
              <span className="text-[11px] font-bold">Creditable Income Taxes Withheld (Expanded)</span>
            </div>
            <div className={`${CELL} flex items-end justify-center pb-1`} style={{ width: '140px' }}>
              <span className="text-[7px]">1604E 01/18ENCS</span>
            </div>
          </div>

          {/* Instruction */}
          <div className={`${CELL} px-2 flex items-center`} style={{ height: '18px' }}>
            <span className="text-[7px] italic">Fill in all applicable spaces. Mark all appropriate boxes with an "X".</span>
          </div>

          {/* Return Period - Year */}
          <div className="flex" style={{ height: '28px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">1</span>
            </div>
            <div className={`${CELL} flex items-center px-2 gap-4 flex-1`}>
              <span className="text-[9px] font-bold">For the Year</span>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                className="border border-black bg-transparent text-[9px] px-1 py-0.5 focus:outline-none focus:bg-blue-50/40">
                {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
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

          {/* Contact Number */}
          <div className="flex" style={{ height: '24px' }}>
            <div className={`${CELL} flex items-center justify-center`} style={{ width: '24px' }}>
              <span className="text-[9px] font-bold">7</span>
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
              <span className="text-[9px] font-bold">8</span>
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
            <span className="text-[9px] font-bold">Part II — Quarterly Remittance Summary</span>
          </div>

          {/* Quarterly Table */}
          <div className={`${CELL} p-2`}>
            <table className="w-full border-collapse text-[8px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-black px-1 py-1 text-center font-semibold" style={{ width: '80px' }}>Quarter</th>
                  <th className="border border-black px-1 py-1 text-right font-semibold">Taxes Withheld</th>
                  <th className="border border-black px-1 py-1 text-right font-semibold">Taxes Remitted</th>
                </tr>
              </thead>
              <tbody>
                {formData.quarterly_summary.map((q, idx) => (
                  <tr key={idx}>
                    <td className="border border-black px-2 py-1 text-center font-medium">Q{q.quarter}</td>
                    <td className="border border-black px-1 py-0.5">
                      <input type="number" step="0.01" value={q.taxes_withheld} onChange={e => setQuarterly(idx, 'taxes_withheld', e.target.value)}
                        className="w-full bg-transparent text-[8px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
                    </td>
                    <td className="border border-black px-1 py-0.5">
                      <input type="number" step="0.01" value={q.taxes_remitted} onChange={e => setQuarterly(idx, 'taxes_remitted', e.target.value)}
                        className="w-full bg-transparent text-[8px] text-right px-1 focus:outline-none focus:bg-blue-50/40" placeholder="0.00" />
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="border border-black px-2 py-1 text-center">Total</td>
                  <td className="border border-black px-2 py-1 text-right tabular-nums">{totalWithheld.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="border border-black px-2 py-1 text-right tabular-nums">{totalRemitted.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>


          {/* Part III Header */}
          <div className={`${CELL} flex items-center justify-center bg-gray-100`} style={{ height: '20px' }}>
            <span className="text-[9px] font-bold">Part III — Alphalist of Payees Subjected to Expanded Withholding Tax</span>
          </div>

          <div className={`${CELL} p-2`}>
            <table className="w-full border-collapse text-[8px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-black px-1 py-1 text-left font-semibold">Payee Name</th>
                  <th className="border border-black px-1 py-1 text-left font-semibold" style={{ width: '90px' }}>TIN</th>
                  <th className="border border-black px-1 py-1 text-left font-semibold" style={{ width: '60px' }}>ATC</th>
                  <th className="border border-black px-1 py-1 text-right font-semibold" style={{ width: '90px' }}>Income Payment</th>
                  <th className="border border-black px-1 py-1 text-right font-semibold" style={{ width: '70px' }}>Q1 Tax</th>
                  <th className="border border-black px-1 py-1 text-right font-semibold" style={{ width: '70px' }}>Q2 Tax</th>
                  <th className="border border-black px-1 py-1 text-right font-semibold" style={{ width: '70px' }}>Q3 Tax</th>
                  <th className="border border-black px-1 py-1 text-right font-semibold" style={{ width: '70px' }}>Q4 Tax</th>
                </tr>
              </thead>
              <tbody>
                {alphalist.length === 0 && (
                  <tr>
                    <td colSpan={8} className="border border-black px-2 py-3 text-center text-gray-400 text-[8px]">
                      No payees. Use Auto Populate to load annual withholding data.
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
                      {(parseFloat(row.q1_tax_withheld) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-right tabular-nums">
                      {(parseFloat(row.q2_tax_withheld) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-right tabular-nums">
                      {(parseFloat(row.q3_tax_withheld) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-right tabular-nums">
                      {(parseFloat(row.q4_tax_withheld) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
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
