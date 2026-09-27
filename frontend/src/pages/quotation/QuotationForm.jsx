import { useState, useEffect } from 'react'
import { ChevronDown, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BASE, authHeaders, COMPANIES, EMPTY_ITEM, SECTION_ITEM, EMPTY_FORM, UOM_OPTIONS, calculateQuotationTotals, money, quotationUnitPrice } from './quotationUtils'

function Input({ className = '', ...props }) {
  return <input className={`w-full border-0 bg-transparent px-1 py-0.5 text-[11px] outline-none placeholder:text-slate-400 focus:bg-blue-50 ${className}`} {...props} />
}
function Select({ className = '', children, ...props }) {
  return <select className={`w-full border-0 bg-transparent px-1 py-0.5 text-[11px] outline-none focus:bg-blue-50 ${className}`} {...props}>{children}</select>
}

export function QuotationForm({ initial, clients, products, catalogCompany, onCompanyChange, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [clientContacts, setClientContacts] = useState([])
  const catalogReady = catalogCompany === form.company
  const catalogProducts = catalogReady ? (products || []) : []

  useEffect(() => {
    if (!form.client_id) {
      setClientContacts([])
      return undefined
    }

    const controller = new AbortController()
    fetch(`${BASE}/contact_list/?client_id=${encodeURIComponent(form.client_id)}`, {
      headers: authHeaders(),
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : [])
      .then(rows => {
        if (controller.signal.aborted) return
        const contacts = rows || []
        setClientContacts(contacts)
        setForm(previous => {
          const selected = contacts.find(contact => String(contact.contact_id) === String(previous.contact_id))
          const fallback = selected || contacts.find(contact => contact.is_primary_contact) || contacts[0]
          if (!fallback) return { ...previous, contact_id: null }
          const name = [fallback.first_name, fallback.last_name].filter(Boolean).join(' ')
          return { ...previous, contact_id: fallback.contact_id, attn_to: name }
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setClientContacts([])
      })

    return () => controller.abort()
  }, [form.client_id])

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))
  const setItem = (idx, key, val) => {
    setForm(prev => {
      const items = [...prev.items]
      const nextItem = { ...items[idx], [key]: val }
      if (key === 'unit_cost') nextItem.selling_price = val
      if (key === 'selling_price') nextItem.unit_cost = val
      items[idx] = nextItem
      return { ...prev, items }
    })
  }
  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }))
  const removeItem = (idx) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))

  const handleProductCodeChange = (idx, value) => {
    setItem(idx, 'product_code', value)
    const product = catalogProducts.find(p => p.product_code === value)
    if (product) {
      // Price priority: selling_price_margin > buying_price_vat > existing value
      const autoPrice = Number(product.selling_price_margin) || Number(product.buying_price_vat) || 0
      setForm(prev => {
        const items = [...prev.items]
        items[idx] = {
          ...items[idx],
          product_code: product.product_code,
          product_type: (product.fulfillment_type || '').toUpperCase() === 'SERVICE' ? 'SERVICE' : 'GOODS',
          description: product.product_description || items[idx].description,
          unit_cost: autoPrice || items[idx].unit_cost,
          selling_price: autoPrice || items[idx].selling_price,
          fulfillment_type: product.fulfillment_type || items[idx].fulfillment_type || '',
        }
        return { ...prev, items }
      })
    }
  }

  const handleCompanyChange = (companyKey) => {
    const co = COMPANIES[companyKey]
    setForm(prev => ({
      ...prev,
      company: companyKey,
      bank_details: co.bank_details,
      items: prev.items.map(item => item.is_section ? item : ({ ...item, product_code: '' })),
    }))
    onCompanyChange?.(companyKey)
  }

  const handleValidityDaysChange = (days) => {
    const numDays = parseInt(days) || 30
    const expiry = new Date(Date.now() + numDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    setForm(prev => ({ ...prev, validity_days: days, validity_date: expiry }))
  }

  const selectedClient = clients.find(c => String(c.client_id) === String(form.client_id))
  const selectedContact = clientContacts.find(contact => String(contact.contact_id) === String(form.contact_id))

  const handleClientChange = (clientId) => {
    setForm(previous => ({ ...previous, client_id: clientId, contact_id: null, attn_to: '' }))
  }

  const handleContactChange = (contactId) => {
    const contact = clientContacts.find(row => String(row.contact_id) === String(contactId))
    const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : ''
    setForm(previous => ({ ...previous, contact_id: contactId ? Number(contactId) : null, attn_to: name }))
  }

  const company = COMPANIES[form.company] || COMPANIES.expedia

  const totals = calculateQuotationTotals(form)
  const { grossSubtotal, itemDiscountAmount, subtotal, taxableSubtotal, vatAmount, whtAmount, grandTotal } = totals

  const handleSubmit = (e) => {
    e.preventDefault()
    // Map scope_lines array back to scope_line_1..5 fields for backend compatibility
    const { scope_lines, ...rest } = form
    const lines = scope_lines || []
    const payload = {
      ...rest,
      discount_amount: totals.discountAmount,
      scope_line_1: lines[0] || '',
      scope_line_2: lines[1] || '',
      scope_line_3: lines[2] || '',
      scope_line_4: lines[3] || '',
      scope_line_5: lines[4] || '',
    }
    onSave(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-0">
      {/* Company Selector */}
      <div className="mb-3 flex items-center gap-3 border border-black px-3 py-2 bg-slate-50 print:hidden">
        <span className="text-[11px] font-bold whitespace-nowrap">Issuing Company:</span>
        <div className="relative">
          <select className="border border-black px-2 py-1 pr-7 text-[11px] bg-white outline-none appearance-none cursor-pointer" value={form.company} onChange={e => handleCompanyChange(e.target.value)}>
            <option value="greatnesslab">GreatnessLab Inc.</option>
            <option value="expedia">Expedia Solutions Specialist Inc.</option>
            <option value="exigent">Exigent Solutions Inc.</option>
            <option value="kyrios">Kyrios Solutions Inc.</option>
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
        </div>
      </div>

      {/* QUOTATION DOCUMENT */}
      <div className="border border-black bg-white" style={{ boxSizing: 'border-box', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
        {/* TOP: Logo/Letter (70%) + Quotation/Terms (30%) */}
        <div className="flex">
          {/* LEFT 70% */}
          <div className="w-[70%] border-r border-black">
            <div className="text-center py-2 border-b border-black">
              <img src={company.logo} alt={company.name} className="h-14 mx-auto object-contain" />
              <p className="text-[9px] text-slate-600 mt-0.5">{company.address}<br />{company.phone}</p>
            </div>
            <div className="text-center py-3 bg-[#dce6f1] border-b border-black" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
              <Input className="!text-center !text-[15px] !font-bold" style={{ width: '80%', display: 'inline-block' }} value={form.project_name} onChange={e => set('project_name', e.target.value)} placeholder="Project Name *" required />
            </div>
            <div className="px-4 py-2 text-[11px] leading-relaxed italic">
              <p className="mb-2">Dear <input className="border-b border-black bg-transparent outline-none text-[11px] italic w-36 px-1" value={form.attn_to} onChange={e => set('attn_to', e.target.value)} placeholder="Mr./Ms. Name" readOnly={Boolean(form.contact_id)} />,</p>
              <p>We are pleased to submit our proposal for the Supply and Delivery subject items per your requirements.</p>
              <p>Kindly find time to review details of our proposal.</p>
              <p className="mt-2">Thank you very much and we look forward to be of service to your requirements.</p>
            </div>
          </div>
          {/* RIGHT 30% - Quotation Panel */}
          <div className="w-[30%]">
            <table className="w-full text-[10px]" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td colSpan="2" className="border-b border-black bg-[#d9e2f3] text-center font-bold py-1 text-[11px]" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>QUOTATION</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold w-[55px]">NO:</td><td className="border-b border-black px-2 py-0.5 italic text-slate-500">Auto-generated</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">DATE:</td><td className="border-b border-black px-2 py-0.5 font-bold">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</td></tr>
                <tr><td colSpan="2" className="border-b border-black px-2 py-1"><strong>1.</strong> Validity: <input type="text" inputMode="numeric" className="w-6 border-b border-black text-center text-[10px] bg-transparent outline-none focus:bg-blue-50" value={form.validity_days} onChange={e => handleValidityDaysChange(e.target.value.replace(/[^0-9]/g, ''))} /> days upon receipt of quotation</td></tr>
                <tr><td colSpan="2" className="border-b border-black px-2 py-1"><strong className="text-red-600">2. Payment Terms: </strong><input className="w-full border-0 bg-transparent text-[10px] text-red-600 font-bold outline-none focus:bg-blue-50" value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} /></td></tr>
                <tr><td colSpan="2" className="border-b border-black px-2 py-1 text-[9px] leading-snug whitespace-pre-line"><textarea className="w-full border-0 bg-transparent text-[9px] outline-none resize-none overflow-hidden focus:bg-blue-50" style={{ height: 'auto', minHeight: '3.5em' }} rows={4} value={form.bank_details} onChange={e => set('bank_details', e.target.value)} /></td></tr>
                <tr><td colSpan="2" className="border-b border-black px-2 py-1"><strong>3. Delivery Terms:</strong><br /><input className="w-full border-0 bg-transparent text-[10px] text-red-600 font-bold outline-none focus:bg-blue-50" value={form.delivery_terms} onChange={e => set('delivery_terms', e.target.value)} /></td></tr>
                <tr><td colSpan="2" className="border-b border-black px-2 py-1"><strong>4.</strong> <input className="border-0 bg-transparent text-[10px] outline-none w-[calc(100%-20px)] focus:bg-blue-50" value={form.cancellation_fee} onChange={e => set('cancellation_fee', e.target.value)} /></td></tr>
                <tr><td colSpan="2" className="px-2 py-1 text-[9px]"><div className="flex gap-1 items-start"><strong className="shrink-0">5.</strong><textarea className="flex-1 border-0 bg-transparent text-[9px] outline-none resize-none overflow-hidden focus:bg-blue-50" style={{ height: 'auto', minHeight: '2.5em' }} rows={3} value={form.additional_notes} onChange={e => set('additional_notes', e.target.value)} /></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* CLIENT NAME + NOTES */}
        <div className="flex border-t border-black">
          <div className="w-[70%] border-r border-black">
            <div className="bg-[#4472c4] text-white text-[11px] font-bold px-2 py-1 border-b border-black text-center" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>CLIENT NAME</div>
            <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold w-[100px]">Client name:</td><td className="border-b border-black px-1 py-0.5"><Select value={form.client_id} onChange={e => handleClientChange(e.target.value)} required><option value="">Select client...</option>{clients.map(c => <option key={c.client_id} value={c.client_id}>{c.company_name}</option>)}</Select></td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">Address:</td><td className="border-b border-black px-2 py-0.5">{selectedClient?.address || ''}</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">Vat Reg Tin:</td><td className="border-b border-black px-2 py-0.5">{selectedClient?.tin_number || ''}</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">Attn to:</td><td className="border-b border-black px-1 py-0.5"><Select value={form.contact_id || ''} onChange={e => handleContactChange(e.target.value)} disabled={!form.client_id}><option value="">Manual / no contact</option>{clientContacts.map(contact => <option key={contact.contact_id} value={contact.contact_id}>{[contact.first_name, contact.last_name].filter(Boolean).join(' ')}{contact.job_title ? ` — ${contact.job_title}` : ''}</option>)}</Select></td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">Designation:</td><td className="border-b border-black px-2 py-0.5">{selectedContact?.job_title || ''}</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">Contact No.</td><td className="border-b border-black px-2 py-0.5">{selectedContact?.landline || ''}</td></tr>
                <tr><td className="border-r border-black px-2 py-0.5 font-bold">Email:</td><td className="px-2 py-0.5">{selectedContact?.email || ''}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="w-[30%]">
            <div className="bg-[#4472c4] text-white text-[11px] font-bold px-2 py-1 border-b border-black" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>NOTES:</div>
            <div className="px-2 py-1"><textarea className="w-full border-0 bg-transparent text-[9px] italic outline-none resize-none focus:bg-blue-50" rows={7} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="*Prices provided are applicable only..." /></div>
          </div>
        </div>

        {/* PRODUCT TABLE */}
        <table className="w-full text-[11px] border-t border-black" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '4%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
            <col style={{ width: '17%' }} /><col style={{ width: '14%' }} /><col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} /><col style={{ width: '9%' }} /><col style={{ width: '6%' }} /><col style={{ width: '10%' }} />
            <col className="print:hidden" style={{ width: '8%' }} /><col style={{ width: '2%' }} />
          </colgroup>
          <thead>
            <tr className="bg-[#c00000] text-white" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px]">SL. NO.</th>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px]">PRODUCT TYPES</th>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px]">PRODUCT CODE</th>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px]">DESCRIPTION</th>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px]">DATASHEET LINKS</th>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px]">QTY</th>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px]">UOM</th>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px]">UNIT COST<br />(VAT EX)</th>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px]">DISC.<br />%</th>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px]">NET TOTAL</th>
              <th className="border border-black px-1 py-1.5 text-center font-bold text-[10px] print:hidden">FULFILL</th>
              <th className="border border-black print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {form.scope_of_works && (
              <tr style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                <td colSpan="11" className="border border-black px-2 py-1 font-bold bg-[#dce6f1] text-center">{form.scope_of_works}</td>
              </tr>
            )}
            {(() => { let slNo = 0; return form.items.map((item, idx) => {
              if (item.is_section) {
                return (
                  <tr key={idx} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                    <td colSpan="11" className="border border-black px-2 py-1 font-bold bg-[#dce6f1]">
                      <input className="w-full border-0 bg-transparent text-[11px] font-bold outline-none focus:bg-blue-50" value={item.section_title || ''} onChange={e => setItem(idx, 'section_title', e.target.value)} placeholder="Section title (e.g. Naga Station)..." />
                    </td>
                    <td className="border border-black px-0.5 py-0.5 text-center align-middle print:hidden">
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-xs">✕</button>
                    </td>
                  </tr>
                )
              }
              const unitPrice = quotationUnitPrice(item)
              const lineTotal = unitPrice * (Number(item.quantity) || 0)
              const disc = lineTotal * (Number(item.discount_percent) || 0) / 100
              slNo++
              return (
                <tr key={idx}>
                  <td className="border border-black px-1 py-1 text-center align-middle">{slNo}</td>
                  <td className="border border-black px-1 py-0.5 align-middle"><select className="w-full border-0 bg-transparent text-[11px] outline-none focus:bg-blue-50 cursor-pointer" value={item.product_type} onChange={e => setItem(idx, 'product_type', e.target.value)}><option value="">—</option><option value="GOODS">Goods</option><option value="SERVICE">Service</option></select></td>
                  <td className="border border-black px-1 py-0.5 align-middle">
                    <input list="product-codes" disabled={!catalogReady} className="w-full border-0 bg-transparent px-1 py-0.5 text-[11px] font-bold outline-none focus:bg-blue-50 disabled:cursor-wait disabled:text-slate-400" value={item.product_code} onChange={e => handleProductCodeChange(idx, e.target.value)} placeholder={catalogReady ? 'Code' : 'Loading catalog…'} />
                  </td>
                  <td className="border border-black px-1 py-0.5 align-middle" style={{ whiteSpace: 'normal' }}><textarea className="w-full border-0 bg-transparent text-[11px] outline-none resize-none focus:bg-blue-50" rows={2} value={item.description} onChange={e => setItem(idx, 'description', e.target.value)} placeholder="Description *" /></td>
                  <td className="border border-black px-1 py-0.5 align-middle" style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}><input className="w-full border-0 bg-transparent text-[11px] text-blue-700 outline-none focus:bg-blue-50" value={item.datasheet_link} onChange={e => setItem(idx, 'datasheet_link', e.target.value)} placeholder="https://..." /></td>
                  <td className="border border-black px-1 py-0.5 text-center align-middle"><input className="w-full border-0 bg-transparent text-[11px] text-center outline-none focus:bg-blue-50" type="number" min="1" value={item.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} /></td>
                  <td className="border border-black px-1 py-0.5 text-center align-middle">
                    <select className="w-full border-0 bg-transparent text-[11px] text-center outline-none focus:bg-blue-50 cursor-pointer" value={item.uom} onChange={e => setItem(idx, 'uom', e.target.value)}>
                      {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="border border-black px-1 py-0.5 text-right align-middle"><input className="w-full border-0 bg-transparent text-[11px] text-right outline-none focus:bg-blue-50" type="number" min="0" step="0.01" value={unitPrice} onChange={e => setItem(idx, 'unit_cost', e.target.value)} /></td>
                  <td className="border border-black px-1 py-0.5 text-right align-middle"><input className="w-full border-0 bg-transparent text-[11px] text-right outline-none focus:bg-blue-50" type="number" min="0" max="100" step="0.01" value={item.discount_percent} onChange={e => setItem(idx, 'discount_percent', e.target.value)} /></td>
                  <td className="border border-black px-1 py-1 text-right align-middle font-bold">{money(lineTotal - disc)}</td>
                  <td className="border border-black px-0.5 py-0.5 text-center align-middle print:hidden">
                    <select className="w-full border-0 bg-transparent text-[10px] outline-none focus:bg-blue-50 cursor-pointer" value={item.fulfillment_type || ''} onChange={e => setItem(idx, 'fulfillment_type', e.target.value)}>
                      <option value="">Auto</option>
                      <option value="DIRECT">Direct</option>
                      <option value="MTO">MTO</option>
                      <option value="SERVICE">Service</option>
                    </select>
                  </td>
                  <td className="border border-black px-0.5 py-0.5 text-center align-middle print:hidden">
                    {form.items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-xs">✕</button>}
                  </td>
                </tr>
              )
            }) })()}
            <tr className="print:hidden">
              <td colSpan="11" className="border border-black px-2 py-1">
                <div className="flex items-center gap-4">
                  <button type="button" onClick={addItem} className="flex items-center gap-1 text-[11px] text-[#1a3fad] hover:underline font-medium"><Plus size={12} /> Add Product</button>
                  <button type="button" onClick={() => setForm(prev => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM, product_type: 'SERVICE', fulfillment_type: 'SERVICE' }] }))} className="flex items-center gap-1 text-[11px] text-purple-700 hover:underline font-medium"><Plus size={12} /> Add Service</button>
                  <button type="button" onClick={() => setForm(prev => ({ ...prev, items: [...prev.items, { ...SECTION_ITEM }] }))} className="flex items-center gap-1 text-[11px] text-slate-600 hover:underline font-medium"><Plus size={12} /> Add Section Title</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* SCOPE + TOTALS */}
        <table className="w-full text-[11px] -mt-px" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '4%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
            <col style={{ width: '19%' }} /><col style={{ width: '15%' }} /><col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} /><col style={{ width: '10%' }} /><col style={{ width: '7%' }} /><col style={{ width: '11%' }} /><col style={{ width: '2%' }} />
          </colgroup>
          <tbody>
            <tr style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
              <td colSpan="7" className="border border-black bg-[#dce6f1] px-2 py-1 font-bold">* SCOPE OF WORKS</td>
              <td colSpan="2" className="border border-black px-2 py-1 text-right font-bold bg-white">GROSS SUBTOTAL</td>
              <td className="border border-black px-2 py-1 text-right bg-white">{money(grossSubtotal)}</td>
              <td className="border border-black print:hidden"></td>
            </tr>
            {(() => {
              const scopeLines = form.scope_lines || ['']
              const totalRows = [
                { label: 'LINE DISCOUNTS', value: itemDiscountAmount > 0 ? `-${money(itemDiscountAmount)}` : money(0) },
                { label: 'ADDITIONAL DISCOUNT', value: null, input: { key: 'discount_amount', val: form.discount_amount, max: subtotal } },
                { label: 'TOTAL VATABLE', value: money(taxableSubtotal) },
                { label: `VAT ${form.vat_rate}%`, value: money(vatAmount) },
                { label: `WHT ${form.wht_rate}%`, value: whtAmount > 0 ? `-${money(whtAmount)}` : money(0) },
                { label: 'SHIPPING COST', value: null, input: { key: 'shipping_cost', val: form.shipping_cost } },
                { label: 'OTHERS', value: null, input: { key: 'others_cost', val: form.others_cost } },
              ]
              const rows = []
              const maxRows = Math.max(scopeLines.length, totalRows.length)
              for (let i = 0; i < maxRows; i++) {
                const scopeLine = scopeLines[i]
                const totalRow = totalRows[i]
                rows.push(
                  <tr key={`scope-${i}`}>
                    <td colSpan="7" className="border border-black px-1 py-0.5">
                      {i < scopeLines.length && (
                        <div className="flex items-center gap-1">
                          <input className="flex-1 border-0 bg-transparent text-[11px] outline-none focus:bg-blue-50" value={scopeLine || ''} onChange={e => {
                            const lines = [...(form.scope_lines || [''])]
                            lines[i] = e.target.value
                            set('scope_lines', lines)
                          }} placeholder={`Scope item ${i + 1}...`} />
                          {scopeLines.length > 1 && (
                            <button type="button" className="text-red-400 hover:text-red-600 text-xs print:hidden" onClick={() => {
                              const lines = [...(form.scope_lines || [''])]
                              lines.splice(i, 1)
                              set('scope_lines', lines)
                            }}>✕</button>
                          )}
                        </div>
                      )}
                    </td>
                    {totalRow ? (
                      <>
                        <td colSpan="2" className="border border-black px-2 py-1 text-right font-bold">{totalRow.label}</td>
                        <td className="border border-black px-1 py-0.5 text-right">
                          {totalRow.input ? (
                            <input type="number" min="0" max={totalRow.input.max} step="0.01" className="w-full border-0 bg-transparent text-[11px] text-right outline-none focus:bg-blue-50" value={totalRow.input.val} onChange={e => set(totalRow.input.key, e.target.value)} />
                          ) : totalRow.value}
                        </td>
                      </>
                    ) : (
                      <>
                        <td colSpan="2" className="border border-black"></td>
                        <td className="border border-black"></td>
                      </>
                    )}
                    <td className="border border-black print:hidden"></td>
                  </tr>
                )
              }
              // Add scope line button row
              if (scopeLines.length < 5) {
                rows.push(
                  <tr key="scope-add" className="print:hidden">
                    <td colSpan="7" className="border border-black px-2 py-0.5">
                      <button type="button" onClick={() => set('scope_lines', [...(form.scope_lines || ['']), ''])} className="flex items-center gap-1 text-[10px] text-[#1a3fad] hover:underline font-medium"><Plus size={10} /> Add Scope Item</button>
                    </td>
                    <td colSpan="2" className="border border-black"></td>
                    <td className="border border-black"></td>
                    <td className="border border-black print:hidden"></td>
                  </tr>
                )
              }
              return rows
            })()}
            <tr style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
              <td colSpan="7" className="border border-black bg-[#dce6f1] px-2 py-1.5"></td>
              <td colSpan="2" className="border border-black bg-[#dce6f1] px-2 py-1.5 text-right font-bold text-[12px]">TOTAL AMOUNT</td>
              <td className="border border-black bg-[#dce6f1] px-2 py-1.5 text-right font-bold text-[12px]">{money(grandTotal)}</td>
              <td className="border border-black bg-[#dce6f1] print:hidden"></td>
            </tr>
          </tbody>
        </table>

        {/* FOOTER */}
        <table className="w-full -mt-px text-[11px]" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td colSpan="2" className="border border-black text-center py-1.5 italic">We hereby inform you that the above order is accepted and confirmed.</td>
            </tr>
            <tr>
              <td className="border border-black px-3 py-2 align-top w-1/2">
                <strong>PREPARED BY:</strong>
                <div className="mt-4 space-y-1">
                  <input className="w-full border-0 bg-transparent text-[10px] outline-none focus:bg-blue-50 font-medium" value={form.prepared_by_name || ''} onChange={e => set('prepared_by_name', e.target.value)} placeholder="Name / Team" />
                  <input className="w-full border-0 bg-transparent text-[10px] outline-none focus:bg-blue-50" value={form.prepared_by_email || ''} onChange={e => set('prepared_by_email', e.target.value)} placeholder="Email address" />
                </div>
              </td>
              <td className="border border-black px-3 py-2 align-top w-1/2">
                <strong>CONFIRMED BY:</strong>
                <div className="mt-4">
                  <input className="w-full border-0 bg-transparent text-[10px] outline-none focus:bg-blue-50 text-center" value={form.confirmed_by_name || ''} onChange={e => set('confirmed_by_name', e.target.value)} placeholder="Client name / Signatory" />
                  <div className="border-t border-black pt-1 text-center text-[10px] mt-2">Signature over printed name/ date</div>
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan="2" className="border border-black text-center py-1.5 text-[9px] italic font-bold">
                If you have any questions about this proposal feel free to contact us @ {company.contact_phone} and email us at {company.email}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Product code datalist */}
      <datalist id="product-codes">
        {catalogProducts.map(p => (
          <option key={p.product_code} value={p.product_code}>{p.product_name} — {p.product_brand}</option>
        ))}
      </datalist>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-4 print:hidden">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 size={14} className="mr-1 animate-spin" />}
          {initial ? 'Update Quotation' : 'Create Quotation'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
