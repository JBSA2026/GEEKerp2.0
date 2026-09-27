import { useOutletContext, useNavigate } from 'react-router-dom'
import { AlertTriangle, Clock, FileWarning, CheckCircle, FileText, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useReportData, BigMetric, Panel, DonutChart, LoadingState, ErrorState,
  formatCompact, exportToCsv, exportToPdf,
} from './reportsUtils'

const SEVERITY_STYLES = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: <AlertTriangle size={14} className="text-red-500" />, badge: 'bg-red-100 text-red-700' },
  high: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: <Clock size={14} className="text-amber-500" />, badge: 'bg-amber-100 text-amber-700' },
  medium: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: <FileWarning size={14} className="text-blue-500" />, badge: 'bg-blue-100 text-blue-700' },
  low: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', icon: <CheckCircle size={14} className="text-slate-400" />, badge: 'bg-slate-100 text-slate-600' },
}

export function ExecutiveOverview() {
  const { entity, dateFrom, dateTo } = useOutletContext()
  const navigate = useNavigate()
  const { data, loading, error, refresh } = useReportData('/reports/executive-overview', entity, dateFrom, dateTo)
  const { data: actionData } = useReportData('/reports/action-items', entity, dateFrom, dateTo)

  if (loading && !data) return <LoadingState />
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <LoadingState />

  const arApDonut = [
    { label: 'AR Outstanding', value: data.ar_outstanding.value, color: '#5d8796' },
    { label: 'AP Outstanding', value: data.ap_outstanding.value, color: '#9f4d61' },
  ]

  function handleCsv() {
    const rows = [
      { metric: 'Revenue', value: data.revenue.value },
      { metric: 'Net Income', value: data.net_income.value },
      { metric: 'AR Outstanding', value: data.ar_outstanding.value },
      { metric: 'AP Outstanding', value: data.ap_outstanding.value },
      { metric: 'Active Projects', value: data.active_projects.count },
      { metric: 'Pipeline Value', value: data.open_pipeline_value.value },
    ]
    exportToCsv(`executive_overview_${entity}.csv`, rows, [{ key: 'metric', label: 'METRIC' }, { key: 'value', label: 'AMOUNT' }])
  }
  function handlePdf() {
    exportToPdf({ title: 'Executive Overview', entity, dateFrom, dateTo, kpis: [
      { label: 'Revenue', value: formatCompact(data.revenue.value) },
      { label: 'Net Income', value: formatCompact(data.net_income.value) },
      { label: 'AR Outstanding', value: formatCompact(data.ar_outstanding.value) },
      { label: 'AP Outstanding', value: formatCompact(data.ap_outstanding.value) },
    ] })
  }

  const actionItems = actionData?.items || []
  const actionSummary = actionData?.summary || {}

  return (
    <div className="flex flex-col gap-5">
      {/* Export */}
      <div className="flex justify-end gap-2">
        <button onClick={handlePdf} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><FileText size={11} /> PDF</button>
        <button onClick={handleCsv} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><Download size={11} /> CSV</button>
      </div>

      {/* KPI row — full width, bigger cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <BigMetric label="Revenue" value={formatCompact(data.revenue.value)} tone="border-emerald-100 bg-emerald-50" sub="General Ledger" />
        <BigMetric label="Net Income" value={formatCompact(data.net_income.value)} tone={data.net_income.value >= 0 ? 'border-blue-100 bg-blue-50' : 'border-red-100 bg-red-50'} sub="General Ledger" />
        <BigMetric label="AR Outstanding" value={formatCompact(data.ar_outstanding.value)} tone="border-amber-100 bg-amber-50" sub="Accounts Receivable" />
        <BigMetric label="AP Outstanding" value={formatCompact(data.ap_outstanding.value)} tone="border-purple-100 bg-purple-50" sub="Accounts Payable" />
        <BigMetric label="Active Projects" value={String(data.active_projects.count)} tone="border-[#d8e2ef] bg-[#edf4fb]" sub={formatCompact(data.active_projects.aggregate_contract_value) + ' contract'} />
        <BigMetric label="Open Pipeline" value={formatCompact(data.open_pipeline_value.value)} tone="border-cyan-100 bg-cyan-50" sub="CRM/Sales" />
      </section>

      {/* Main content: Action Items + Charts side by side */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Action Items — takes 2 cols on XL, most important */}
        <Panel title="Needs Attention" className="xl:col-span-2"
          action={actionSummary.total > 0 && (
            <div className="flex items-center gap-2">
              {actionSummary.critical > 0 && <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{actionSummary.critical} critical</span>}
              {actionSummary.high > 0 && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{actionSummary.high} high</span>}
              <span className="text-[10px] text-slate-400">{actionSummary.total} total</span>
            </div>
          )}>
          {actionItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle size={32} className="text-emerald-300 mb-3" />
              <p className="text-sm font-medium text-slate-600">All clear</p>
              <p className="text-xs text-slate-400 mt-1">No items need attention right now</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {actionItems.map((item, i) => {
                const style = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.low
                return (
                  <div
                    key={i}
                    onClick={() => item.link && navigate(item.link)}
                    className={cn('flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all hover:shadow-sm', style.bg, style.border)}
                  >
                    <div className="mt-0.5 shrink-0">{style.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-semibold', style.text)}>{item.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase', style.badge)}>
                      {item.severity}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        {/* AR vs AP Chart */}
        <Panel title="AR vs AP Exposure">
          <DonutChart data={arApDonut} label="Net" value={formatCompact(data.ar_outstanding.value - data.ap_outstanding.value)} size={140} />
        </Panel>
      </section>

      {/* Bottom row — Financial snapshot table filling full width */}
      <section>
        <Panel title="Financial Snapshot">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-3 pt-1">
            {[
              ['Revenue', data.revenue.value, 'General Ledger'],
              ['Net Income', data.net_income.value, 'General Ledger'],
              ['AR Outstanding', data.ar_outstanding.value, 'Accounts Receivable'],
              ['AP Outstanding', data.ap_outstanding.value, 'Accounts Payable'],
              ['Project Contract Value', data.active_projects.aggregate_contract_value, 'Projects'],
              ['Pipeline Value', data.open_pipeline_value.value, 'CRM/Sales'],
            ].map(([label, val, src]) => (
              <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <p className="text-xs font-medium text-slate-700">{label}</p>
                  <p className="text-[10px] text-slate-400">{src}</p>
                </div>
                <p className="text-sm font-bold text-slate-900">{formatCompact(val)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}
