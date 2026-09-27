import { Check, Download, GitCompare, History, Pencil, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { COMPANIES, calculateQuotationTotals, money, formatDate, quotationUnitPrice } from './quotationUtils'

export function QuotationDetailView({ quotation, onBack, onStatusChange, onEdit, onExport, onHistory, onVersions, actionLoading }) {
  const q = quotation
  const items = q.items || []
  const client = q.client_list || {}
  const company = COMPANIES[q.company] || COMPANIES.expedia
  const contactName = q.contact_name_snapshot || q.attn_to || ''
  const contactJobTitle = q.contact_job_title_snapshot || ''
  const contactPhone = q.contact_phone_snapshot || ''
  const contactEmail = q.contact_email_snapshot || ''

  const totals = calculateQuotationTotals(q, items)
  const totalRows = [
    { scope: '* SCOPE OF WORKS', label: 'GROSS SUBTOTAL', value: money(totals.grossSubtotal), emphasized: true },
    { scope: q.scope_line_1 || '', label: 'LINE DISCOUNTS', value: totals.itemDiscountAmount > 0 ? `-${money(totals.itemDiscountAmount)}` : money(0) },
    { scope: q.scope_line_2 || '', label: 'ADDITIONAL DISCOUNT', value: totals.discountAmount > 0 ? `-${money(totals.discountAmount)}` : money(0) },
    { scope: q.scope_line_3 || '', label: 'TOTAL VATABLE', value: money(totals.taxableSubtotal) },
    { scope: q.scope_line_4 || '', label: `VAT ${q.vat_rate}%`, value: money(totals.vatAmount) },
    { scope: q.scope_line_5 || '', label: `WHT ${q.wht_rate}%`, value: totals.whtAmount > 0 ? `-${money(totals.whtAmount)}` : money(0) },
    { scope: '', label: 'SHIPPING COST', value: totals.shippingCost > 0 ? money(totals.shippingCost) : '' },
    { scope: '', label: 'OTHERS', value: totals.othersCost > 0 ? money(totals.othersCost) : '' },
  ]

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>← Back</Button>
        <h2 className="text-lg font-bold text-slate-800">{q.quotation_no}</h2>
        <StatusBadge status={q.status} />
        <div className="flex-1" />
        {/* Edit is always available for revisions */}
        <Button size="sm" variant="outline" onClick={onEdit}><Pencil size={14} className="mr-1" />Edit</Button>
        {q.status === 'DRAFT' && (
          <Button size="sm" onClick={() => onStatusChange('FOR_APPROVAL')} disabled={actionLoading}><Send size={14} className="mr-1" />Submit for Approval</Button>
        )}
        {q.status === 'APPROVED' && (
          <Button size="sm" onClick={() => onStatusChange('SENT')} disabled={actionLoading}><Send size={14} className="mr-1" />Mark as Sent</Button>
        )}
        {q.status === 'SENT' && (
          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => onStatusChange('COMPLETE')} disabled={actionLoading}><Check size={14} className="mr-1" />Close Won</Button>
        )}
        <Button size="sm" variant="outline" onClick={onExport}><Download size={14} className="mr-1" />Export PDF</Button>
        <Button size="sm" variant="outline" onClick={onHistory}><History size={14} className="mr-1" />History</Button>
        <Button size="sm" variant="outline" onClick={onVersions}><GitCompare size={14} className="mr-1" />Versions</Button>
      </div>

      {/* Quotation Document View */}
      <div className="border border-black bg-white" style={{ boxSizing: 'border-box' }}>
        <div className="flex">
          <div className="w-[70%] border-r border-black">
            <div className="text-center py-2 border-b border-black">
              <img src={company.logo} alt={company.name} className="h-14 mx-auto object-contain" />
              <p className="text-[9px] text-slate-600 mt-0.5">{company.address}<br />{company.phone}</p>
            </div>
            <div className="text-center py-3 bg-[#dce6f1] border-b border-black" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
              <span className="text-[15px] font-bold">{q.project_name}</span>
            </div>
            <div className="px-4 py-2 text-[11px] leading-relaxed italic">
              <p className="mb-2">Dear {contactName || 'Sir/Madam'},</p>
              <p>We are pleased to submit our proposal for the Supply and Delivery subject items per your requirements.</p>
              <p>Kindly find time to review details of our proposal.</p>
              <p className="mt-2">Thank you very much and we look forward to be of service to your requirements.</p>
            </div>
          </div>
          <div className="w-[30%]">
            <table className="w-full text-[10px]" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td colSpan="2" className="border-b border-black bg-[#d9e2f3] text-center font-bold py-1 text-[11px]" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>QUOTATION</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold w-[55px]">NO:</td><td className="border-b border-black px-2 py-0.5">{q.quotation_no}</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">DATE:</td><td className="border-b border-black px-2 py-0.5 font-bold">{formatDate(q.created_at)}</td></tr>
                <tr><td colSpan="2" className="border-b border-black px-2 py-1"><strong>1.</strong> Validity: {q.validity_days || 30} days upon receipt of quotation</td></tr>
                <tr><td colSpan="2" className="border-b border-black px-2 py-1"><strong className="text-red-600">2. Payment Terms: </strong><span className="text-red-600 font-bold">{q.payment_terms}</span></td></tr>
                <tr><td colSpan="2" className="border-b border-black px-2 py-1 text-[9px] leading-snug whitespace-pre-line">{q.bank_details || ''}</td></tr>
                <tr><td colSpan="2" className="border-b border-black px-2 py-1"><strong>3. Delivery Terms:</strong><br /><span className="text-red-600 font-bold">{q.delivery_terms}</span></td></tr>
                <tr><td colSpan="2" className="border-b border-black px-2 py-1"><strong>4.</strong> {q.cancellation_fee || '50% Cancellation Fee'}</td></tr>
                <tr><td colSpan="2" className="px-2 py-1 text-[9px]"><strong>5.</strong> {q.additional_notes || 'Any installation works if not stated herein can be covered in a separate proposal or shall be done by others, BONDS & PERMITS cost not included'}</td></tr>
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
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold w-[100px]">Client name:</td><td className="border-b border-black px-2 py-0.5">{client.company_name}</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">Address:</td><td className="border-b border-black px-2 py-0.5">{client.address}</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">Vat Reg Tin:</td><td className="border-b border-black px-2 py-0.5">{client.tin_number}</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">Attn to:</td><td className="border-b border-black px-2 py-0.5">{contactName}</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">Designation:</td><td className="border-b border-black px-2 py-0.5">{contactJobTitle}</td></tr>
                <tr><td className="border-b border-r border-black px-2 py-0.5 font-bold">Contact No.</td><td className="border-b border-black px-2 py-0.5">{contactPhone}</td></tr>
                <tr><td className="border-r border-black px-2 py-0.5 font-bold">Email:</td><td className="px-2 py-0.5">{contactEmail}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="w-[30%]">
            <div className="bg-[#4472c4] text-white text-[11px] font-bold px-2 py-1 border-b border-black" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>NOTES:</div>
            <div className="px-2 py-1 text-[9px] italic">{q.notes || '*Prices provided are applicable only for the quantities specified.'}</div>
          </div>
        </div>

        {/* PRODUCT TABLE */}
        <table className="w-full text-[11px] border-t border-black" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '4%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
            <col style={{ width: '19%' }} /><col style={{ width: '15%' }} /><col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} /><col style={{ width: '10%' }} /><col style={{ width: '7%' }} /><col style={{ width: '13%' }} />
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
            </tr>
          </thead>
          <tbody>
            {q.scope_of_works && (
              <tr style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                <td colSpan="10" className="border border-black px-2 py-1 font-bold bg-[#dce6f1] text-center">{q.scope_of_works}</td>
              </tr>
            )}
            {(() => { let slNo = 0; return items.map((item, idx) => {
              if (item.is_section) {
                return <tr key={item.item_id || idx}><td colSpan="10" className="border border-black px-2 py-1 font-bold bg-[#dce6f1]">{item.section_title}</td></tr>
              }
              const unitPrice = quotationUnitPrice(item)
              const lineTotal = unitPrice * (Number(item.quantity) || 0)
              const disc = lineTotal * (Number(item.discount_percent) || 0) / 100
              slNo++
              return (
                <tr key={item.item_id || idx}>
                  <td className="border border-black px-1 py-1 text-center align-middle">{slNo}</td>
                  <td className="border border-black px-1 py-1 align-middle" style={{ wordBreak: 'break-word', whiteSpace: 'normal', overflow: 'hidden' }}>{item.product_type || ''}</td>
                  <td className="border border-black px-1 py-1 align-middle font-bold" style={{ wordBreak: 'break-word', whiteSpace: 'normal', overflow: 'hidden' }}>{item.product_code || ''}</td>
                  <td className="border border-black px-1 py-1 align-middle" style={{ whiteSpace: 'normal' }}>{item.description}</td>
                  <td className="border border-black px-1 py-1 align-middle text-blue-700" style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
                    {item.datasheet_link ? <a href={item.datasheet_link} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{item.datasheet_link}</a> : ''}
                  </td>
                  <td className="border border-black px-1 py-1 text-center align-middle">{item.quantity}</td>
                  <td className="border border-black px-1 py-1 text-center align-middle">{item.uom}</td>
                  <td className="border border-black px-1 py-1 text-right align-middle">{money(unitPrice)}</td>
                  <td className="border border-black px-1 py-1 text-right align-middle">{Number(item.discount_percent) > 0 ? `${Number(item.discount_percent)}%` : '—'}</td>
                  <td className="border border-black px-1 py-1 text-right align-middle font-bold">{money(lineTotal - disc)}</td>
                </tr>
              )
            }) })()}
          </tbody>
        </table>

        {/* SCOPE + TOTALS */}
        <table className="w-full text-[11px] -mt-px" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '4%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
            <col style={{ width: '19%' }} /><col style={{ width: '15%' }} /><col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} /><col style={{ width: '10%' }} /><col style={{ width: '7%' }} /><col style={{ width: '13%' }} />
          </colgroup>
          <tbody>
            {totalRows.map((row) => (
              <tr key={row.label} style={row.emphasized ? { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } : undefined}>
                <td colSpan="7" className={`border border-black px-2 py-1 ${row.emphasized ? 'bg-[#dce6f1] font-bold' : ''}`}>{row.scope}</td>
                <td colSpan="2" className="border border-black px-2 py-1 text-right font-bold text-[10px]">{row.label}</td>
                <td className="border border-black px-2 py-1 text-right text-[10px]">{row.value}</td>
              </tr>
            ))}
            <tr style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
              <td colSpan="7" className="border border-black bg-[#dce6f1] px-2 py-1.5"></td>
              <td colSpan="2" className="border border-black bg-[#dce6f1] px-1 py-1.5 text-right font-bold text-[10px]">TOTAL AMOUNT</td>
              <td className="border border-black bg-[#dce6f1] px-2 py-1.5 text-right font-bold text-[11px]">{money(totals.grandTotal)}</td>
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
                <p className="mt-8 text-[10px]">{q.prepared_by_name || 'ACCOUNT SUPPORT TEAM'}<br />{q.prepared_by_email || company.support_email}</p>
              </td>
              <td className="border border-black px-3 py-2 align-top w-1/2">
                <strong>CONFIRMED BY:</strong>
                {q.confirmed_by_name && <div className="mt-6 text-center text-[10px] font-medium">{q.confirmed_by_name}</div>}
                <div className={`${q.confirmed_by_name ? 'mt-2' : 'mt-8'} border-t border-black pt-1 text-center text-[10px]`}>Signature over printed name/ date</div>
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
    </div>
  )
}
