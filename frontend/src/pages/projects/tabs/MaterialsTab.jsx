import { useOutletContext } from 'react-router-dom'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { FolderKanban, PackageCheck, Plus } from 'lucide-react'
import { SectionHeader, RowActions, money, qty } from '../projectsUtils'

export function MaterialsTab() {
  const { project, onAction, onRowAction } = useOutletContext()
  const materials = project.materials || []
  const total = materials.reduce((sum, row) => sum + Number(row.total_cost || 0), 0)
  return (
    <Card className="overflow-hidden">
      <SectionHeader title="Project Materials" action={<Button size="sm" onClick={() => onAction('material')}><Plus size={14} /> Add Material</Button>} />
      <CardContent className="p-0">
        {materials.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No materials allocated">Allocate materials to track project cost against budget.</EmptyState>
        ) : (
          <div>
            <div className="grid grid-cols-[28%_9%_11%_14%_14%_12%_12%] border-b border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              <span>Material</span><span className="text-right">Qty</span><span className="text-right">Reserved</span><span className="text-right">Unit Cost</span><span className="pr-4 text-right">Total</span><span className="pl-6">Status</span><span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[#e3ecf8]">
              {materials.map(row => (
                <div key={row.material_id} className="grid grid-cols-[28%_9%_11%_14%_14%_12%_12%] items-center px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{row.description || row.product_code}</p>
                    {row.product_code && <p className="text-[11px] text-slate-500">{row.product_code}</p>}
                  </div>
                  <span className="text-right">{qty(row.quantity)}</span>
                  <span className="text-right">{qty(row.available_reserved_quantity ?? row.reserved_quantity)}</span>
                  <span className="text-right">{money(row.unit_cost)}</span>
                  <span className="pr-4 text-right font-semibold text-[#26324f]">{money(row.total_cost)}</span>
                  <span className="pl-6"><StatusBadge status={row.status} /></span>
                  <div className="flex justify-end gap-1">
                    {row.status === 'RESERVED' && Number(row.available_reserved_quantity || 0) >= Number(row.quantity || 0) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 justify-center p-0 text-[#4d9e3f]" onClick={() => onRowAction('issue-material', row)} aria-label="Issue material" title="Issue material"><PackageCheck size={14} /></Button>
                    )}
                    <RowActions onEdit={() => onAction('material', row)} onDelete={() => onRowAction('material', row)} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[28%_9%_11%_14%_14%_12%_12%] border-t border-[#d8e2ef] bg-[#edf4fb] px-5 py-3 text-sm font-semibold">
              <span className="col-span-4">Total Material Cost</span>
              <span className="text-right text-[#26324f]">{money(total)}</span>
              <span /><span />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
