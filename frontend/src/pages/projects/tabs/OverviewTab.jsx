import { useOutletContext } from 'react-router-dom'
import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { CompanyTag, ProgressBar, StatTile, SectionHeader, money, percent } from '../projectsUtils'

export function OverviewTab() {
  const { project } = useOutletContext()
  const fin = project.financials || {}
  const breakdownRows = [
    ['Contract Value', money(project.contract_value), true],
    ['Material Cost', money(fin.material_cost), false],
    ['Budget Actual Spend', money(fin.budget_actual), false],
    ['Total Cost', money(fin.total_cost), false],
    ['Gross Profit', money(fin.gross_profit), true],
    ['Gross Margin', percent(fin.gross_margin), true],
    ['Budget', money(project.budget), false],
    ['Budget Variance', money(fin.budget_variance), Number(fin.budget_variance) < 0],
    ['Uncollected Balance', money(fin.uncollected), false],
  ]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Contract Value" value={money(project.contract_value)} accent />
        <StatTile label="Total Cost" value={money(fin.total_cost)} />
        <StatTile label="Gross Profit" value={money(fin.gross_profit)} accent />
        <StatTile label="Gross Margin" value={percent(fin.gross_margin)} accent />
      </div>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500">Completion</span>
              <span className="font-semibold text-slate-800">{percent(project.completion_percent)}</span>
            </div>
            <ProgressBar value={project.completion_percent} />
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
            <div><p className="text-xs text-slate-500">Customer</p><p className="font-medium text-slate-900">{project.client_name || '-'}</p></div>
            <div><p className="text-xs text-slate-500">Company</p><div className="mt-0.5"><CompanyTag entity={project.entity} /></div></div>
            <div><p className="text-xs text-slate-500">Project Manager</p><p className="font-medium text-slate-900">{project.project_manager_name || 'Unassigned'}</p></div>
            <div><p className="text-xs text-slate-500">Status</p><StatusBadge status={project.status} /></div>
            <div><p className="text-xs text-slate-500">Start Date</p><p className="font-medium text-slate-900">{project.start_date || '-'}</p></div>
            <div><p className="text-xs text-slate-500">End Date</p><p className="font-medium text-slate-900">{project.end_date || '-'}</p></div>
            <div><p className="text-xs text-slate-500">Project Code</p><p className="font-mono text-xs font-semibold text-[#26324f]">{project.project_code}</p></div>
          </div>
          {project.description && (
            <div>
              <p className="text-xs text-slate-500">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{project.description}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <SectionHeader title="Financial Breakdown" />
        <CardContent className="p-0">
          <div className="divide-y divide-[#e3ecf8]">
            {breakdownRows.map(([label, value, accent]) => (
              <div key={label} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-slate-600">{label}</span>
                <span className={`font-semibold ${accent ? 'text-[#26324f]' : 'text-slate-900'}`}>{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
