import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { FolderKanban, Plus } from 'lucide-react'
import { SectionHeader, RowActions, money } from '../projectsUtils'

export function BudgetTab() {
  const { project, onAction, onRowAction } = useOutletContext()
  const items = project.budget_items || []
  const totals = items.reduce((acc, row) => ({
    budgeted: acc.budgeted + Number(row.budgeted_amount || 0),
    actual: acc.actual + Number(row.actual_amount || 0),
  }), { budgeted: 0, actual: 0 })

  return (
    <Card className="overflow-hidden">
      <SectionHeader title="Project Budget" action={<Button size="sm" onClick={() => onAction('budget')}><Plus size={14} /> Add Item</Button>} />
      <CardContent className="p-0">
        {items.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No budget items yet">Break the budget down by category to track planned vs actual spend.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[640px] grid-cols-[24%_34%_15%_15%_12%] border-b border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              <span>Category</span><span>Description</span><span className="text-right">Budgeted</span><span className="text-right">Actual</span><span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[#e3ecf8]">
              {items.map(row => (
                <div key={row.budget_item_id} className="grid min-w-[640px] grid-cols-[24%_34%_15%_15%_12%] items-center px-5 py-3 text-sm">
                  <span className="font-medium text-slate-800">{row.category || '-'}</span>
                  <span className="truncate text-slate-600">{row.description || '-'}</span>
                  <span className="text-right">{money(row.budgeted_amount)}</span>
                  <span className="text-right font-semibold text-[#26324f]">{money(row.actual_amount)}</span>
                  <RowActions onEdit={() => onAction('budget', row)} onDelete={() => onRowAction('budget', row)} />
                </div>
              ))}
            </div>
            <div className="grid min-w-[640px] grid-cols-[24%_34%_15%_15%_12%] border-t border-[#d8e2ef] bg-[#edf4fb] px-5 py-3 text-sm font-semibold">
              <span className="col-span-2">Total</span>
              <span className="text-right">{money(totals.budgeted)}</span>
              <span className="text-right text-[#26324f]">{money(totals.actual)}</span>
              <span />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
