import { useMemo, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { FileText, Download, ArrowUpDown } from 'lucide-react'
import {
  useReportData, Panel, HorizontalBarChart, MiniMetric, LoadingState, ErrorState,
  formatCurrency, formatCompact, formatPercent, exportToCsv, exportToPdf,
} from './reportsUtils'

export function ProjectProfitability() {
  const { entity, dateFrom, dateTo } = useOutletContext()
  const navigate = useNavigate()
  const { data, loading, error, refresh } = useReportData('/reports/project-profitability', entity, dateFrom, dateTo)
  const [sortDir, setSortDir] = useState('desc')

  const sorted = useMemo(() => {
    if (!data?.projects) return []
    return [...data.projects].sort((a, b) => {
      const av = a.gross_margin_pct, bv = b.gross_margin_pct
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [data, sortDir])

  if (loading && !data) return <LoadingState />
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <LoadingState />

  const totalContract = sorted.reduce((s, p) => s + p.contract_value, 0)
  const totalCost = sorted.reduce((s, p) => s + p.total_cost, 0)
  const totalProfit = sorted.reduce((s, p) => s + p.gross_profit, 0)
  const avgMargin = totalContract > 0 ? (totalProfit / totalContract * 100) : null

  const chartData = sorted.slice(0, 8).map(p => ({ label: p.project_name?.substring(0, 20) || p.project_code, value: p.gross_profit }))

  function handleCsv() {
    exportToCsv(`project_profitability_${entity}.csv`, sorted, [
      { key: 'project_code', label: 'PROJECT CODE' }, { key: 'project_name', label: 'PROJECT NAME' },
      { key: 'contract_value', label: 'CONTRACT VALUE' }, { key: 'total_cost', label: 'TOTAL COST' },
      { key: 'gross_profit', label: 'GROSS PROFIT' }, { key: 'gross_margin_pct', label: 'GROSS MARGIN %' },
    ])
  }
  function handlePdf() {
    exportToPdf({ title: 'Project Profitability', entity, dateFrom, dateTo, kpis: [
      { label: 'Total Contract Value', value: formatCurrency(totalContract) },
      { label: 'Total Cost', value: formatCurrency(totalCost) },
      { label: 'Total Profit', value: formatCurrency(totalProfit) },
      { label: 'Avg Margin', value: formatPercent(avgMargin) },
    ] })
  }

  return (
    <div className="flex flex-col gap-4 ">
      <div className="flex justify-end gap-2">
        <button onClick={handlePdf} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><FileText size={11} /> PDF</button>
        <button onClick={handleCsv} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><Download size={11} /> CSV</button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniMetric label="Total Contract" value={formatCompact(totalContract)} />
        <MiniMetric label="Total Cost" value={formatCompact(totalCost)} />
        <MiniMetric label="Total Profit" value={formatCompact(totalProfit)} color={totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'} />
        <MiniMetric label="Avg Margin" value={formatPercent(avgMargin)} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Gross Profit by Project" className="lg:col-span-1">
          {chartData.length === 0
            ? <p className="text-xs text-slate-400 py-6 text-center">No projects</p>
            : <HorizontalBarChart data={chartData} formatValue={formatCompact} />
          }
        </Panel>

        <Panel title={`All Projects (${sorted.length})`} className="lg:col-span-2"
          action={<button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} className="text-[10px] text-slate-500 flex items-center gap-1 hover:text-slate-800"><ArrowUpDown size={10} /> Margin</button>}>
          {sorted.length === 0 ? <p className="text-xs text-slate-400 py-6 text-center">No projects started in this period</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="pb-2 font-medium">Project</th>
                  <th className="pb-2 font-medium text-right">Contract</th>
                  <th className="pb-2 font-medium text-right">Cost</th>
                  <th className="pb-2 font-medium text-right">Profit</th>
                  <th className="pb-2 font-medium text-right">Margin</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {sorted.map(p => (
                    <tr key={p.project_id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/projects/${p.project_id}/overview`)}>
                      <td className="py-2"><span className="text-[#26324f] font-medium">{p.project_code}</span> <span className="text-slate-500">— {p.project_name}</span></td>
                      <td className="py-2 text-right font-mono">{formatCompact(p.contract_value)}</td>
                      <td className="py-2 text-right font-mono">{formatCompact(p.total_cost)}</td>
                      <td className={`py-2 text-right font-mono ${p.gross_profit < 0 ? 'text-red-500' : ''}`}>{formatCompact(p.gross_profit)}</td>
                      <td className="py-2 text-right font-semibold">{formatPercent(p.gross_margin_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>
    </div>
  )
}
