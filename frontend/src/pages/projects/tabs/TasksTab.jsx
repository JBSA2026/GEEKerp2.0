import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { FolderKanban, Plus, Pencil, Trash2 } from 'lucide-react'

// Jira-style board columns mapped to task statuses
const TASK_COLUMNS = [
  { id: 'TODO', label: 'To Do', dot: 'bg-slate-400', head: 'text-slate-600' },
  { id: 'IN_PROGRESS', label: 'In Progress', dot: 'bg-blue-500', head: 'text-blue-700' },
  { id: 'DONE', label: 'Done', dot: 'bg-emerald-500', head: 'text-emerald-700' },
  { id: 'BLOCKED', label: 'Blocked', dot: 'bg-red-500', head: 'text-red-700' },
]

export function TasksTab() {
  const { project, onAction, onRowAction } = useOutletContext()
  const tasks = project.tasks || []
  const [draggingId, setDraggingId] = useState(null)
  const [overCol, setOverCol] = useState(null)

  function onDragStart(e, taskId) {
    setDraggingId(taskId)
    e.dataTransfer.setData('taskId', String(taskId))
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragEnd() {
    setDraggingId(null)
    setOverCol(null)
  }

  function onDragOver(e, colId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overCol !== colId) setOverCol(colId)
  }

  function onDrop(e, status) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('taskId'))
    setDraggingId(null)
    setOverCol(null)
    if (!taskId) return
    const task = tasks.find(t => t.task_id === taskId)
    if (task && (task.status || 'TODO') !== status) {
      onRowAction('task-status', { task_id: taskId, status })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} · drag cards between columns to update status
        </p>
        <Button size="sm" onClick={() => onAction('task')}><Plus size={14} /> Add Task</Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No tasks yet">
          Break the work down into trackable tasks. Add one and drag it across the board as work progresses.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {TASK_COLUMNS.map(col => {
            const colTasks = tasks.filter(t => (t.status || 'TODO') === col.id)
            const isOver = overCol === col.id
            return (
              <div
                key={col.id}
                onDragOver={e => onDragOver(e, col.id)}
                onDragLeave={() => { if (overCol === col.id) setOverCol(null) }}
                onDrop={e => onDrop(e, col.id)}
                className={`flex min-h-[440px] flex-col rounded-xl border transition-colors duration-150 ${
                  isOver ? 'border-[#2c3a61] bg-[#eef2fb]' : 'border-[#d8e2ef] bg-[#f8fafd]'
                }`}
              >
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                    <span className={`text-[11px] font-semibold uppercase tracking-wide ${col.head}`}>{col.label}</span>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 shadow-sm">{colTasks.length}</span>
                </div>

                <div className="flex-1 space-y-2 px-2 pb-2">
                  {colTasks.length === 0 ? (
                    <div className={`flex h-24 items-center justify-center rounded-lg border-2 border-dashed text-[11px] transition-colors ${
                      isOver ? 'border-[#2c3a61]/40 text-[#2c3a61]' : 'border-transparent text-slate-300'
                    }`}>
                      {isOver ? 'Release to drop' : ''}
                    </div>
                  ) : (
                    colTasks.map(t => (
                      <div
                        key={t.task_id}
                        draggable
                        onDragStart={e => onDragStart(e, t.task_id)}
                        onDragEnd={onDragEnd}
                        className={`group cursor-grab rounded-lg border border-[#d8e2ef] bg-white p-3 shadow-sm transition-all duration-150 hover:shadow-md active:cursor-grabbing ${
                          draggingId === t.task_id ? 'rotate-1 opacity-40' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug text-slate-800">{t.task_name}</p>
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button onClick={() => onAction('task', t)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit"><Pencil size={12} /></button>
                            <button onClick={() => onRowAction('task', t)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        {t.description && <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{t.description}</p>}
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#2c3a61] text-[7px] font-bold text-white">
                              {(t.assigned_to_name || 'U').charAt(0).toUpperCase()}
                            </span>
                            {t.assigned_to_name || 'Unassigned'}
                          </span>
                          {t.due_date && <span className="text-[10px] text-slate-400">{t.due_date}</span>}
                        </div>
                        {Number(t.progress_percent) > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-[#2c3a61]" style={{ width: `${Math.min(100, Number(t.progress_percent))}%` }} />
                            </div>
                            <span className="text-[9px] font-medium text-slate-400">{Number(t.progress_percent)}%</span>
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
      )}
    </div>
  )
}
