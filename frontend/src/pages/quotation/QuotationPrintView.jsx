import { useRef } from 'react'
import { X, Printer, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { exportQuotationPDF } from '@/utils/quotationPdf'
import { COMPANIES } from './quotationUtils'
import { QuotationDocumentBody } from './QuotationDocumentBody'

export function QuotationPrintView({ quotation, onClose }) {
  const q = quotation
  const items = q.items || []
  const client = q.client_list || {}
  const company = COMPANIES[q.company] || COMPANIES.expedia
  const printRef = useRef()

  const handlePrint = () => {
    const el = printRef.current
    const win = window.open('', '_blank')
    const styleSheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(node => {
        if (node.tagName === 'LINK') return `<link rel="stylesheet" href="${node.href}">`
        return node.outerHTML
      }).join('\n')
    win.document.write(`<!DOCTYPE html><html><head><title>Quotation ${q.quotation_no}</title>
      ${styleSheets}
      <style>
        @page { size: A4 portrait; margin: 8mm; }
        body { margin: 0; padding: 8mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      </style>
    </head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    win.onload = () => { win.print(); win.close() }
    setTimeout(() => { if (!win.closed) { win.print(); win.close() } }, 2000)
  }

  const handleSavePDF = () => { exportQuotationPDF(q, company) }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-6 py-3 shadow-sm">
        <Button variant="outline" size="sm" onClick={onClose}><X size={14} className="mr-1" />Close</Button>
        <Button size="sm" onClick={handlePrint}><Printer size={14} className="mr-1" />Print</Button>
        <Button size="sm" variant="outline" onClick={handleSavePDF}><Download size={14} className="mr-1" />Save PDF</Button>
        <span className="text-sm text-slate-500">Preview matches the company quotation template</span>
      </div>
      <div className="flex-1 overflow-auto bg-gray-100 p-8">
        <div ref={printRef} className="mx-auto bg-white shadow-lg p-8" style={{ width: '210mm', minHeight: '297mm' }}>
          <QuotationDocumentBody q={q} items={items} client={client} company={company} />
        </div>
      </div>
    </div>
  )
}
