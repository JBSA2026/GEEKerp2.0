import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { jsPDF } from 'jspdf'
import { export2307PDF } from '@/utils/bir2307Pdf'
import { export0619EPDF } from '@/utils/bir0619EPdf'
import { export1601CPDF } from '@/utils/bir1601CPdf'
import { export1601EQPDF } from '@/utils/bir1601EQPdf'
import { export1600VTPDF } from '@/utils/bir1600VTPdf'
import { export2550QPDF } from '@/utils/bir2550QPdf'
import { export2316PDF } from '@/utils/bir2316Pdf'
import { export1702QPDF } from '@/utils/bir1702QPdf'
import { export1702PDF } from '@/utils/bir1702Pdf'
import { export1604EPDF } from '@/utils/bir1604EPdf'
import { export0605PDF } from '@/utils/bir0605Pdf'
import { MOCK_2307, MOCK_0619E, MOCK_1601C, MOCK_1601EQ, MOCK_1600VT, MOCK_2550Q, MOCK_2316, MOCK_1702Q, MOCK_1702, MOCK_1604E, MOCK_0605 } from './sampleBIRData'

/**
 * Wraps a PDF export function to add "THIS IS A MOCK FORM" watermark
 * diagonally across every page before saving.
 */
function withMockWatermark(exportFn) {
  return (formData) => {
    // Monkey-patch jsPDF.prototype.save temporarily to inject watermark
    const originalSave = jsPDF.prototype.save
    jsPDF.prototype.save = function (filename) {
      const pageCount = this.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        this.setPage(i)
        const pw = this.internal.pageSize.getWidth()
        const ph = this.internal.pageSize.getHeight()
        // Draw watermark text in light red
        this.setFont('helvetica', 'bold')
        this.setFontSize(48)
        this.setTextColor(255, 180, 180)
        this.text('THIS IS A MOCK FORM', pw / 2, ph / 2, {
          align: 'center',
          angle: 35,
        })
        // Also add a smaller note at the bottom
        this.setFontSize(10)
        this.setTextColor(200, 0, 0)
        this.text('*** THIS IS A MOCK FORM - NOT FOR OFFICIAL USE ***', pw / 2, ph - 5, {
          align: 'center',
        })
      }
      // Restore original and call it
      jsPDF.prototype.save = originalSave
      originalSave.call(this, filename)
    }
    exportFn(formData)
  }
}

const FORMS = [
  { id: '2307', name: 'BIR Form 2307', desc: 'Certificate of Creditable Tax Withheld at Source', fn: withMockWatermark(export2307PDF), data: MOCK_2307 },
  { id: '0619E', name: 'BIR Form 0619-E', desc: 'Monthly Remittance of Expanded Withholding Tax', fn: withMockWatermark(export0619EPDF), data: MOCK_0619E },
  { id: '1601C', name: 'BIR Form 1601-C', desc: 'Monthly Remittance Return of Income Taxes Withheld on Compensation', fn: withMockWatermark(export1601CPDF), data: MOCK_1601C },
  { id: '1601EQ', name: 'BIR Form 1601-EQ', desc: 'Quarterly Remittance of Expanded Withholding Tax', fn: withMockWatermark(export1601EQPDF), data: MOCK_1601EQ },
  { id: '1600VT', name: 'BIR Form 1600-VT', desc: 'Monthly Remittance of VAT Withheld', fn: withMockWatermark(export1600VTPDF), data: MOCK_1600VT },
  { id: '2550Q', name: 'BIR Form 2550Q', desc: 'Quarterly Value-Added Tax Return', fn: withMockWatermark(export2550QPDF), data: MOCK_2550Q },
  { id: '2316', name: 'BIR Form 2316', desc: 'Certificate of Compensation Payment/Tax Withheld', fn: withMockWatermark(export2316PDF), data: MOCK_2316 },
  { id: '1702Q', name: 'BIR Form 1702Q', desc: 'Quarterly Income Tax Return (Corporate)', fn: withMockWatermark(export1702QPDF), data: MOCK_1702Q },
  { id: '1702', name: 'BIR Form 1702', desc: 'Annual Income Tax Return (Corporate)', fn: withMockWatermark(export1702PDF), data: MOCK_1702 },
  { id: '1604E', name: 'BIR Form 1604-E', desc: 'Annual Information Return of EWT (Expanded)', fn: withMockWatermark(export1604EPDF), data: MOCK_1604E },
  { id: '0605', name: 'BIR Form 0605', desc: 'Payment Form', fn: withMockWatermark(export0605PDF), data: MOCK_0605 },
]

export default function SampleBIRForms() {
  const [generating, setGenerating] = useState(null)

  const handleGenerate = async (form) => {
    setGenerating(form.id)
    try {
      await form.fn(form.data)
    } catch (err) {
      console.error(`Error generating ${form.name}:`, err)
      alert(`Failed to generate ${form.name}: ${err.message}`)
    }
    setGenerating(null)
  }

  const handleGenerateAll = async () => {
    setGenerating('all')
    for (const form of FORMS) {
      try {
        await form.fn(form.data)
        // Small delay between PDFs to prevent browser issues
        await new Promise(r => setTimeout(r, 300))
      } catch (err) {
        console.error(`Error generating ${form.name}:`, err)
      }
    }
    setGenerating(null)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Sample BIR Forms</h1>
        <p className="text-gray-600 mt-1">Generate all 11 BIR forms with complete mock data to preview the PDF output.</p>
        <p className="text-sm text-amber-600 mt-2 font-medium">⚠️ Each form has "THIS IS A MOCK FORM" in the remarks field.</p>
      </div>

      <div className="mb-6">
        <Button onClick={handleGenerateAll} disabled={!!generating} className="gap-2">
          {generating === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Generate All 11 Forms
        </Button>
      </div>

      <div className="grid gap-4">
        {FORMS.map(form => (
          <div key={form.id} className="flex items-center justify-between p-4 border rounded-lg bg-white shadow-sm">
            <div>
              <h3 className="font-semibold text-gray-900">{form.name}</h3>
              <p className="text-sm text-gray-500">{form.desc}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerate(form)}
              disabled={!!generating}
              className="gap-2"
            >
              {generating === form.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Export PDF
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
