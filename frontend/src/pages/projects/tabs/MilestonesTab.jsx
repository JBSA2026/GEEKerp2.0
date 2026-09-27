import { useOutletContext } from 'react-router-dom'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { FolderKanban, Plus, Receipt } from 'lucide-react'
import { SectionHeader, RowActions, money } from '../projectsUtils'

export function MilestonesTab() {
  const { project, onAction, onRowAction } = useOutletContext()
  const milestones = project.milestones || []
  return (
    <Card className="overflow-hidden">
      <SectionHeader title="Project Milestones" action={<Button size="sm" onClick={() => onAction('milestone')}><Plus size={14} /> Add Milestone</Button>} />
      <CardContent className="p-0">
        {milestones.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No milestones yet">Add billing milestones to track delivery and trigger collection.</EmptyState>
        ) : (
          <div className="divide-y divide-[#e3ecf8]">
            {milestones.map(m => (
              <div key={m.milestone_id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{m.milestone_name}</p>
                    <StatusBadge status={m.status} />
                    {m.is_billed && <StatusBadge status="BILLED" />}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Target {m.target_date || '-'}{m.completion_date ? ` · Done ${m.completion_date}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[#26324f]">{money(m.billing_amount)}</span>
                <div className="flex items-center gap-1">
                  {!m.is_billed && Number(m.billing_amount) > 0 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 justify-center p-0 text-[#4d9e3f]" onClick={() => onRowAction('bill', m)} aria-label="Create draft invoice" title="Create draft invoice"><Receipt size={14} /></Button>
                  )}
                  <RowActions onEdit={() => onAction('milestone', m)} onDelete={() => onRowAction('milestone', m)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
