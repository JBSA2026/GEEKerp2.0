import { useOutletContext, useNavigate } from 'react-router-dom'
import { FileText, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useReportData, BigMetric, Panel, DonutChart, LoadingState, ErrorState,
  formatCurrency, formatCompact, exportToCsv, exportToPdf,
} from './reportsUtils'

const STATUS_STYLES = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_APPROVAL: 'bg-blue-50 text-blue-700 border-blue-200',
  FINALIZED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FILED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Not Filed': 'bg-slate-50 text-slate-500 border-slate-200',
}

export function ComplianceSnapshot() {
  const { entity, dateFrom, dateTo } = useOutletContext()
  const navigate = useNavigate()
  const { data, loading, error, refresh } = useReportData('/reports/compliance-snapshot', entity, dateFrom, dateTo)

  if (loading && !data) return <LoadingState />
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <LoadingState />

  const vatDonut = [
    { label: 'VAT Output', value: data.vat_output, color: '#5d8796' },
    { label: 'VAT Input', value: data.vat_input, color: '#91a4cf' },
  ]

  // Status counts for a mini chart
  const statusCounts = {}
  data.bir_forms.forEach(f => { statusCounts[f.status] = (statusCounts[f.status] || 0) + 1 })

  function handleCsv() {
    exportToCsv(`compliance_snapshot_${entity}.csv`, data.bir_forms, [
      { key: 'form_type', label: 'BIR FORM TYPE' }, { key: 'period_from', label: 'PERIOD FROM' },
      { key: 'period_to', label: 'PERIOD TO' }, { key: 'status', label: 'FILING STATUS' },
    ])
  }
  function handlePdf() {
    exportToPdf({ title: 'Compliance Snapshot', entity, dateFrom, dateTo, kpis: [
      { label: 'VAT Output', value: formatCurrency(data.vat_output) },
      { label: 'VAT Input', value: formatCurrency(data.vat_input) },
      { label: 'Net VAT', value: formatCurrency(data.net_vat_payable) },
      { label: 'WHT Withheld', value: formatCurrency(data.wht_withheld) },
    ] })
  }

  return (
    <div className="flex flex-col gap-4 ">
      <div className="flex justify-end gap-2">
        <button onClick={handlePdf} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><FileText size={11} /> PDF</button>
        <button onClick={handleCsv} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><Download size={11} /> CSV</button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <BigMetric label="VAT Output" value={formatCompact(data.vat_output)} tone="border-[#d8e2ef] bg-[#edf4fb]" />
        <BigMetric label="VAT Input" value={formatCompact(data.vat_input)} tone="border-[#d8e2ef] bg-[#edf4fb]" />
        <BigMetric label="Net VAT Payable" value={formatCompact(data.net_vat_payable)} tone={data.net_vat_payable < 0 ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'} sub={data.net_vat_payable < 0 ? 'VAT credit' : 'Payable'} />
        <BigMetric label="WHT Withheld" value={formatCompact(data.wht_withheld)} tone="border-purple-100 bg-purple-50" />
        <BigMetric label="WHT Remitted" value={formatCompact(data.wht_remitted)} tone="border-slate-200 bg-slate-50" />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Panel title="VAT Position">
          <DonutChart data={vatDonut} label="Net" value={formatCompact(data.net_vat_payable)} />
        </Panel>

        <Panel title="BIR Form Filing Status" className="md:col-span-2"
          action={<button onClick={() => navigate('/tax/forms')} className="text-[10px] text-[#26324f] hover:underline">Manage Forms →</button>}>
          {data.bir_forms.length === 0
            ? <p className="text-xs text-slate-400 py-6 text-center">No applicable forms for this period</p>
            : (
              <div className="space-y-2">
                {/* Summary badges */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(statusCounts).map(([st, cnt]) => (
                    <span key={st} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLES[st] || 'bg-slate-50 text-slate-600 border-slate-200')}>
                      {cnt} {st}
                    </span>
                  ))}
                </div>
                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="pb-2 font-medium">Form</th>
                      <th className="pb-2 font-medium">Period</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.bir_forms.map((f, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2 font-medium text-slate-800">{f.form_type}</td>
                          <td className="py-2 text-slate-600">{f.period_from} → {f.period_to}</td>
                          <td className="py-2">
                            <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLES[f.status] || 'bg-slate-50 text-slate-600 border-slate-200')}>
                              {f.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }
        </Panel>
      </section>
    </div>
  )
}
