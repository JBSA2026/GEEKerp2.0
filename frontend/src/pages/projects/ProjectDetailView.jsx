import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import {
  FileText, FolderKanban, Layers, ListChecks,
  Paperclip, Plus, Receipt, PackageCheck, Wallet,
} from 'lucide-react'
import {
  CompanyTag, ProgressBar, StatTile, SectionHeader, RowActions,
  money, qty, percent,
} from './projectsUtils'

// ── Tab icon map ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview', Icon: Layers },
  { id: 'budget', label: 'Budget', Icon: Wallet },
  { id: 'tasks', label: 'Tasks', Icon: ListChecks },
  { id: 'materials', label: 'Materials', Icon: Layers },
  { id: 'documents', label: 'Documents', Icon: Paperclip },
]

// ── Tab content components ──────────────────────────────────────────────────

function OverviewTab({ project }) {
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

function BudgetTab({ project, onAdd, onEdit, onDelete }) {
  const items = project.budget_items || []
  const totals = items.reduce((acc, row) => ({
    budgeted: acc.budgeted + Number(row.budgeted_amount || 0),
    actual: acc.actual + Number(row.actual_amount || 0),
  }), { budgeted: 0, actual: 0 })

  return (
    <Card className="overflow-hidden">
      <SectionHeader title="Project Budget" action={<Button size="sm" onClick={onAdd}><Plus size={14} /> Add Item</Button>} />
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
                  <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
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

export function MilestonesTab({ project, onAdd, onEdit, onDelete, onBill }) {
  const milestones = project.milestones || []
  return (
    <Card className="overflow-hidden">
      <SectionHeader title="Project Milestones" action={<Button size="sm" onClick={onAdd}><Plus size={14} /> Add Milestone</Button>} />
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
                    <Button variant="ghost" size="icon" className="h-7 w-7 justify-center p-0 text-[#4d9e3f]" onClick={() => onBill(m)} aria-label="Create draft invoice" title="Create draft invoice"><Receipt size={14} /></Button>
                  )}
                  <RowActions onEdit={() => onEdit(m)} onDelete={() => onDelete(m)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const TASK_COLUMNS = [
  { id: 'TODO', label: 'To Do', color: 'border-slate-300', bg: 'bg-slate-50', text: 'text-slate-700' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-700' },
  { id: 'DONE', label: 'Done', color: 'border-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  { id: 'BLOCKED', label: 'Blocked', color: 'border-red-400', bg: 'bg-red-50', text: 'text-red-700' },
]

function TasksTab({ project, onAdd, onEdit, onDelete, onStatusChange }) {
  const tasks = project.tasks || []

  function handleDrop(taskId, newStatus) {
    if (onStatusChange) onStatusChange(taskId, newStatus)
  }

  function onDragStart(e, taskId) {
    e.dataTransfer.setData('taskId', String(taskId))
  }

  function onDragOver(e) {
    e.preventDefault()
  }

  function onDropHandler(e, status) {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) handleDrop(Number(taskId), status)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={onAdd}><Plus size={14} /> Add Task</Button>
      </div>
      <div className="grid grid-cols-4 gap-3 min-h-[400px]">
        {TASK_COLUMNS.map(col => {
          const colTasks = tasks.filter(t => (t.status || 'TODO') === col.id)
          return (
            <div
              key={col.id}
              className={`rounded-xl border-t-3 ${col.color} bg-[#f8fafd] p-2 flex flex-col`}
              onDragOver={onDragOver}
              onDrop={e => onDropHandler(e, col.id)}
            >
              {/* Column header */}
              <div className={`flex items-center justify-between rounded-lg ${col.bg} px-3 py-2 mb-2`}>
                <span className={`text-xs font-semibold uppercase tracking-wide ${col.text}`}>{col.label}</span>
                <span className={`text-[10px] font-bold ${col.text} rounded-full px-1.5 py-0.5 bg-white/60`}>{colTasks.length}</span>
              </div>

              {/* Task cards */}
              <div className="flex-1 space-y-2 overflow-y-auto">
                {colTasks.length === 0 ? (
                  <p className="text-center text-[11px] text-slate-400 py-8">Drop tasks here</p>
                ) : (
                  colTasks.map(t => (
                    <div
                      key={t.task_id}
                      draggable
                      onDragStart={e => onDragStart(e, t.task_id)}
                      className="rounded-lg border border-[#d8e2ef] bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group"
                    >
                      <p className="text-sm font-medium text-slate-800 leading-snug">{t.task_name}</p>
                      {t.description && <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{t.description}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1.5">
                          {t.assigned_to_name && (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              {t.assigned_to_name}
                            </span>
                          )}
                          {t.due_date && (
                            <span className="text-[10px] text-slate-400">{t.due_date}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <RowActions onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
                        </div>
                      </div>
                      {Number(t.progress_percent) > 0 && (
                        <div className="mt-2">
                          <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-[#2c3a61]" style={{ width: `${t.progress_percent}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MaterialsTab({ project, onAdd, onEdit, onDelete, onIssue }) {
  const materials = project.materials || []
  const total = materials.reduce((sum, row) => sum + Number(row.total_cost || 0), 0)
  return (
    <Card className="overflow-hidden">
      <SectionHeader title="Project Materials" action={<Button size="sm" onClick={onAdd}><Plus size={14} /> Add Material</Button>} />
      <CardContent className="p-0">
        {materials.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No materials allocated">Allocate materials to track project cost against budget.</EmptyState>
        ) : (
          <div>
            <div className="grid grid-cols-[30%_10%_10%_13%_13%_12%_12%] border-b border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              <span>Material</span><span className="text-right">Qty</span><span className="text-right">Reserved</span><span className="text-right">Unit Cost</span><span className="text-right">Total</span><span>Status</span><span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[#e3ecf8]">
              {materials.map(row => (
                <div key={row.material_id} className="grid grid-cols-[30%_10%_10%_13%_13%_12%_12%] items-center px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{row.description || row.product_code}</p>
                    {row.product_code && <p className="text-[11px] text-slate-500">{row.product_code}</p>}
                  </div>
                  <span className="text-right">{qty(row.quantity)}</span>
                  <span className="text-right">{qty(row.available_reserved_quantity ?? row.reserved_quantity)}</span>
                  <span className="text-right">{money(row.unit_cost)}</span>
                  <span className="text-right font-semibold text-[#26324f]">{money(row.total_cost)}</span>
                  <span><StatusBadge status={row.status} /></span>
                  <div className="flex justify-end gap-1">
                    {row.status === 'RESERVED' && Number(row.available_reserved_quantity || 0) >= Number(row.quantity || 0) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 justify-center p-0 text-[#4d9e3f]" onClick={() => onIssue(row)} aria-label="Issue material" title="Issue material"><PackageCheck size={14} /></Button>
                    )}
                    <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[30%_10%_10%_13%_13%_12%_12%] border-t border-[#d8e2ef] bg-[#edf4fb] px-5 py-3 text-sm font-semibold">
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

function DocumentsTab({ project, onAdd, onDelete }) {
  const documents = project.documents || []
  return (
    <Card className="overflow-hidden">
      <SectionHeader title="Project Documents" action={<Button size="sm" onClick={onAdd}><Paperclip size={14} /> Attach Document</Button>} />
      <CardContent className="p-0">
        {documents.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No documents attached">Attach contracts, drawings, permits and acceptance documents here.</EmptyState>
        ) : (
          <div className="divide-y divide-[#e3ecf8]">
            {documents.map(doc => (
              <div key={doc.document_id} className="flex items-center gap-3 px-5 py-3">
                <FileText size={16} className="shrink-0 text-[#2c3a61]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {doc.file_url
                      ? <a href={doc.file_url} target="_blank" rel="noreferrer" className="font-medium text-[#1a3fad] hover:underline">{doc.document_name}</a>
                      : <p className="font-medium text-slate-900">{doc.document_name}</p>}
                    {doc.document_type && <Badge variant="muted">{doc.document_type}</Badge>}
                  </div>
                  {doc.remarks && <p className="mt-0.5 truncate text-[11px] text-slate-500">{doc.remarks}</p>}
                </div>
                <RowActions onDelete={() => onDelete(doc)} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main detail view (tabs header + tab content) ────────────────────────────

export function ProjectDetailView({ project, activeTab, onTab, onAction, onRowAction }) {
  return (
    <>
      <div className="flex flex-wrap gap-1 border-b border-[#d8e2ef]">
        {TABS.map(tab => {
          const Icon = tab.Icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors ${active ? 'border-[#2c3a61] text-[#26324f]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <Icon size={14} /> {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'overview' && <OverviewTab project={project} />}
      {activeTab === 'budget' && (
        <BudgetTab project={project} onAdd={() => onAction('budget')} onEdit={row => onAction('budget', row)} onDelete={row => onRowAction('budget', row)} />
      )}
      {activeTab === 'tasks' && (
        <TasksTab project={project} onAdd={() => onAction('task')} onEdit={row => onAction('task', row)} onDelete={row => onRowAction('task', row)} onStatusChange={(taskId, newStatus) => onRowAction('task-status', { task_id: taskId, status: newStatus })} />
      )}
      {activeTab === 'materials' && (
        <MaterialsTab project={project} onAdd={() => onAction('material')} onEdit={row => onAction('material', row)} onDelete={row => onRowAction('material', row)} onIssue={row => onRowAction('issue-material', row)} />
      )}
      {activeTab === 'documents' && (
        <DocumentsTab project={project} onAdd={() => onAction('document')} onDelete={row => onRowAction('document', row)} />
      )}
    </>
  )
}
