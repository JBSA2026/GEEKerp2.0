import { useOutletContext } from 'react-router-dom'
import { FileText, Download } from 'lucide-react'
import {
  useReportData, BigMetric, Panel, DonutChart, HorizontalBarChart, LoadingState, ErrorState,
  formatCurrency, formatCompact, exportToCsv, exportToPdf,
} from './reportsUtils'

const STAGE_COLORS = ['#26324f', '#5d8796', '#91a4cf', '#8dabc4', '#a7b5d8', '#9f4d61']

export function SalesPerformance() {
  const { entity, dateFrom, dateTo } = useOutletContext()
  const { data, loading, error, refresh } = useReportData('/reports/sales-performance', entity, dateFrom, dateTo)

  if (loading && !data) return <LoadingState />
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <LoadingState />

  const stageDonut = data.open_pipeline_by_stage.map((s, i) => ({
    label: s.stage, value: s.count, display: `${s.count} (${formatCompact(s.value)})`, color: STAGE_COLORS[i % STAGE_COLORS.length],
  }))

  const empData = data.by_employee.map(e => ({ label: e.employee_name || `#${e.employee_id}`, value: e.closed_won_value }))

  function handleCsv() {
    exportToCsv(`sales_performance_${entity}.csv`, data.by_employee, [
      { key: 'employee_name', label: 'EMPLOYEE NAME' }, { key: 'closed_won_value', label: 'CLOSED WON VALUE' }, { key: 'net_payable_commission', label: 'NET PAYABLE COMMISSION' },
    ])
  }
  function handlePdf() {
    exportToPdf({ title: 'Sales Performance', entity, dateFrom, dateTo, kpis: [
      { label: 'Closed Won', value: String(data.closed_won_count) },
      { label: 'Won Value', value: formatCurrency(data.closed_won_value) },
      { label: 'Commission', value: formatCurrency(data.total_commission) },
      { label: 'Net Payable', value: formatCurrency(data.total_net_payable_commission) },
    ] })
  }

  return (
    <div className="flex flex-col gap-4 ">
      <div className="flex justify-end gap-2">
        <button onClick={handlePdf} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><FileText size={11} /> PDF</button>
        <button onClick={handleCsv} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><Download size={11} /> CSV</button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BigMetric label="Closed Won Deals" value={String(data.closed_won_count)} tone="border-emerald-100 bg-emerald-50" />
        <BigMetric label="Closed Won Value" value={formatCompact(data.closed_won_value)} tone="border-blue-100 bg-blue-50" />
        <BigMetric label="Total Commission" value={formatCompact(data.total_commission)} tone="border-amber-100 bg-amber-50" />
        <BigMetric label="Net Payable" value={formatCompact(data.total_net_payable_commission)} tone="border-purple-100 bg-purple-50" />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Panel title="Pipeline by Stage">
          {stageDonut.length === 0
            ? <p className="text-xs text-slate-400 py-6 text-center">No open pipeline</p>
            : <DonutChart data={stageDonut} label="Open" value={stageDonut.reduce((s, d) => s + d.value, 0)} />
          }
        </Panel>
        <Panel title="Top Performers (Closed Won)" className="md:col-span-2">
          {empData.length === 0
            ? <p className="text-xs text-slate-400 py-6 text-center">No closed won deals in this period</p>
            : <HorizontalBarChart data={empData} formatValue={formatCompact} />
          }
        </Panel>
      </section>
    </div>
  )
}
