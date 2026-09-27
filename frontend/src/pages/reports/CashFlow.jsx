import { useOutletContext } from 'react-router-dom'
import { FileText, Download, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import {
  useReportData, BigMetric, Panel, DonutChart, LoadingState, ErrorState,
  formatCurrency, formatCompact, exportToCsv, exportToPdf,
} from './reportsUtils'

export function CashFlow() {
  const { entity, dateFrom, dateTo } = useOutletContext()
  const { data, loading, error, refresh } = useReportData('/reports/cash-flow', entity, dateFrom, dateTo)

  if (loading && !data) return <LoadingState />
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <LoadingState />

  const donutData = [
    { label: 'Receipts', value: data.total_receipts, color: '#5d8796' },
    { label: 'Disbursements', value: data.total_disbursements, color: '#9f4d61' },
  ]

  function handleCsv() {
    exportToCsv(`cash_flow_${entity}.csv`, [
      { metric: 'Total Cash Receipts', value: data.total_receipts },
      { metric: 'Total Cash Disbursements', value: data.total_disbursements },
      { metric: 'Net Cash Flow', value: data.net_cash_flow },
      { metric: 'Cash & Bank Balance', value: data.cash_and_bank_balance },
    ], [{ key: 'metric', label: 'METRIC' }, { key: 'value', label: 'AMOUNT' }])
  }
  function handlePdf() {
    exportToPdf({ title: 'Cash Flow', entity, dateFrom, dateTo, kpis: [
      { label: 'Receipts', value: formatCurrency(data.total_receipts) },
      { label: 'Disbursements', value: formatCurrency(data.total_disbursements) },
      { label: 'Net Cash Flow', value: formatCurrency(data.net_cash_flow) },
      { label: 'Cash Balance', value: formatCurrency(data.cash_and_bank_balance) },
    ] })
  }

  return (
    <div className="flex flex-col gap-4 ">
      <div className="flex justify-end gap-2">
        <button onClick={handlePdf} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><FileText size={11} /> PDF</button>
        <button onClick={handleCsv} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><Download size={11} /> CSV</button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BigMetric label="Cash Receipts" value={formatCompact(data.total_receipts)} icon={<ArrowDownLeft size={14} className="text-emerald-500" />} tone="border-emerald-100 bg-emerald-50" />
        <BigMetric label="Cash Disbursements" value={formatCompact(data.total_disbursements)} icon={<ArrowUpRight size={14} className="text-red-500" />} tone="border-red-100 bg-red-50" />
        <BigMetric label="Net Cash Flow" value={formatCompact(data.net_cash_flow)} tone={data.net_cash_flow >= 0 ? 'border-blue-100 bg-blue-50' : 'border-red-100 bg-red-50'} />
        <BigMetric label="Cash & Bank Balance" value={formatCompact(data.cash_and_bank_balance)} tone="border-[#d8e2ef] bg-[#edf4fb]" sub={`As of ${data.date_to}`} />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Cash In vs Out">
          <DonutChart data={donutData} label="Net" value={formatCompact(data.net_cash_flow)} />
        </Panel>
        <Panel title="Summary">
          <div className="space-y-4 pt-3">
            {[
              ['Total Cash Receipts (Posted)', formatCurrency(data.total_receipts)],
              ['Total Cash Disbursements (Posted)', formatCurrency(data.total_disbursements)],
              ['Net Cash Flow', formatCurrency(data.net_cash_flow)],
              ['Cash & Bank Balance (GL)', formatCurrency(data.cash_and_bank_balance)],
            ].map(([l, v]) => (
              <div key={l} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0">
                <span className="text-xs text-slate-600">{l}</span>
                <span className="text-sm font-semibold text-slate-900">{v}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}
