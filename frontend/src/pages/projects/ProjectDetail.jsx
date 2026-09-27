import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { notify } from '@/utils/toast'
import {
  AlertCircle, ArrowLeft, Loader2, Lock, Pencil, UserCog, X,
  Layers, Wallet, ListChecks, Paperclip,
} from 'lucide-react'
import { api, CompanyTag } from './projectsUtils'
import {
  AssignManagerDrawer, CloseDrawer,
  BudgetDrawer, MilestoneDrawer, TaskDrawer, MaterialDrawer, DocumentDrawer,
} from './ProjectDrawers'

const BASE = import.meta.env.VITE_API_URL

const TABS = [
  { id: 'overview', label: 'Overview', Icon: Layers },
  { id: 'budget', label: 'Budget', Icon: Wallet },
  { id: 'tasks', label: 'Tasks', Icon: ListChecks },
  { id: 'materials', label: 'Materials', Icon: Layers },
  { id: 'documents', label: 'Documents', Icon: Paperclip },
]

export function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { confirm, confirmDialogProps } = useConfirmDialog()

  // Derive active tab from URL — the segment after /projects/:id/
  const segments = location.pathname.split('/').filter(Boolean)
  const tabSegment = segments[2] || 'overview'
  const activeTab = TABS.find(t => t.id === tabSegment) ? tabSegment : 'overview'

  const [project, setProject] = useState(null)
  const [meta, setMeta] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [drawerData, setDrawerData] = useState(null)

  const loadProject = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProject(await api(`/projects/${id}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  const loadMeta = useCallback(async () => {
    try {
      setMeta(await api('/projects/meta'))
    } catch {
      // Non-blocking
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProject()
      void loadMeta()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadProject, loadMeta])

  function openDrawer(type, data = null) {
    setDrawer(type)
    setDrawerData(data)
  }

  function closeDrawer() {
    setDrawer(null)
    setDrawerData(null)
  }

  function handleAction(type, row = null) {
    if (!row) {
      openDrawer(type, null)
      return
    }
    const clean = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, value === null ? '' : value])
    )
    openDrawer(type, clean)
  }

  async function submitDrawer(payload) {
    if (!project) return
    setSaving(true)
    setError(null)
    const projectId = project.project_id
    try {
      let updated
      if (drawer === 'assign') {
        updated = await api(`/projects/${projectId}/assign-manager`, { method: 'POST', body: JSON.stringify(payload) })
      } else if (drawer === 'progress') {
        updated = await api(`/projects/${projectId}/progress`, { method: 'POST', body: JSON.stringify(payload) })
      } else if (drawer === 'close') {
        updated = await api(`/projects/${projectId}/close`, { method: 'POST', body: JSON.stringify(payload) })
      } else if (drawer === 'budget') {
        updated = drawerData?.budget_item_id
          ? await api(`/projects/budget/${drawerData.budget_item_id}`, { method: 'PATCH', body: JSON.stringify(payload) })
          : await api(`/projects/${projectId}/budget`, { method: 'POST', body: JSON.stringify(payload) })
      } else if (drawer === 'milestone') {
        updated = drawerData?.milestone_id
          ? await api(`/projects/milestones/${drawerData.milestone_id}`, { method: 'PATCH', body: JSON.stringify(payload) })
          : await api(`/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify(payload) })
      } else if (drawer === 'task') {
        updated = drawerData?.task_id
          ? await api(`/projects/tasks/${drawerData.task_id}`, { method: 'PATCH', body: JSON.stringify(payload) })
          : await api(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(payload) })
      } else if (drawer === 'material') {
        updated = drawerData?.material_id
          ? await api(`/projects/materials/${drawerData.material_id}`, { method: 'PATCH', body: JSON.stringify(payload) })
          : await api(`/projects/${projectId}/materials`, { method: 'POST', body: JSON.stringify(payload) })
      } else if (drawer === 'document') {
        const formData = new FormData()
        formData.append('file', payload.file)
        if (payload.document_type) formData.append('document_type', payload.document_type)
        if (payload.remarks) formData.append('remarks', payload.remarks)
        const t = localStorage.getItem('access_token')
        const res = await fetch(`${BASE}/projects/${projectId}/documents`, {
          method: 'POST',
          headers: t ? { Authorization: `Bearer ${t}` } : {},
          body: formData,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || err.detail || 'Upload failed')
        }
        updated = await res.json()
      }
      setProject(updated)
      closeDrawer()
      notify.success('Saved')
    } catch (err) {
      setError(err.message)
      notify.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRowAction(type, row) {
    if (!project) return
    // Handle task status change from Kanban drag-and-drop.
    // Optimistic: update local project state immediately, PATCH in the background,
    // no full reload — so the board never flickers or waits.
    if (type === 'task-status') {
      setProject(prev => prev ? {
        ...prev,
        tasks: (prev.tasks || []).map(t =>
          t.task_id === row.task_id ? { ...t, status: row.status } : t
        ),
      } : prev)
      api(`/projects/tasks/${row.task_id}`, { method: 'PATCH', body: JSON.stringify({ status: row.status }) })
        .then(updated => { if (updated) setProject(updated) })  // sync recomputed completion %
        .catch(err => {
          notify.error(err.message || 'Failed to update task')
          loadProject()  // revert to server truth on failure
        })
      return
    }

    const endpoints = {
      budget: ['DELETE', `/projects/budget/${row.budget_item_id}`, 'Delete this budget item?'],
      milestone: ['DELETE', `/projects/milestones/${row.milestone_id}`, `Delete milestone "${row.milestone_name}"?`],
      task: ['DELETE', `/projects/tasks/${row.task_id}`, `Delete task "${row.task_name}"?`],
      material: ['DELETE', `/projects/materials/${row.material_id}`, 'Delete this material?'],
      document: ['DELETE', `/projects/documents/${row.document_id}`, `Remove document "${row.document_name}"?`],
      bill: ['POST', `/projects/milestones/${row.milestone_id}/bill`, null],
      'issue-material': ['PATCH', `/projects/materials/${row.material_id}`, 'Issue this material to the project?', { status: 'ISSUED' }],
    }
    const entry = endpoints[type]
    if (!entry) return
    const [method, path, confirmMsg, body] = entry
    if (confirmMsg) {
      const ok = await confirm({
        title: 'Confirm project action',
        message: confirmMsg,
        confirmLabel: type === 'issue-material' ? 'Issue' : 'Delete',
        danger: type !== 'issue-material',
      })
      if (!ok) return
    }

    setError(null)
    try {
      const updated = await api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
      if (updated) setProject(updated)
      else await loadProject()
      notify.success(type === 'bill' ? 'Draft invoice created' : type === 'issue-material' ? 'Material issued' : 'Removed')
    } catch (err) {
      setError(err.message)
      notify.error(err.message)
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" /> Loading project...
        </div>
      </main>
    )
  }

  if (!project) {
    return (
      <main className="flex-1 overflow-y-auto px-6 py-5">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => navigate('../list')}>
          <ArrowLeft size={14} /> Back to list
        </Button>
      </main>
    )
  }

  const isClosed = project.status === 'CLOSED'

  return (
    <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8 justify-center p-0" onClick={() => navigate('../list')} aria-label="Back to project list" title="Back to project list"><ArrowLeft size={15} /></Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-all text-lg font-bold leading-snug text-slate-900">{project.project_name}</h2>
            <StatusBadge status={project.status} />
            <CompanyTag entity={project.entity} />
          </div>
          <p className="font-mono text-xs text-[#26324f]">{project.project_code} · {project.client_name || 'No customer'}</p>
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => handleAction('assign')}><UserCog size={13} /> Assign PM</Button>
        {!isClosed && <Button variant="outline" size="sm" onClick={() => handleAction('close')}><Lock size={13} /> Close</Button>}
        <Button variant="outline" size="sm" onClick={() => navigate('edit')}><Pencil size={13} /> Edit</Button>
      </div>

      {/* Tabs + Content */}
      <div className="flex flex-wrap gap-1 border-b border-[#d8e2ef]">
        {TABS.map(tab => {
          const Icon = tab.Icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(`/projects/${id}/${tab.id}`)}
              className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors ${active ? 'border-[#2c3a61] text-[#26324f]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <Icon size={14} /> {tab.label}
            </button>
          )
        })}
      </div>

      <Outlet context={{ project, onAction: handleAction, onRowAction: handleRowAction }} />

      {/* Drawers */}
      <AssignManagerDrawer key={`assign-${drawer === 'assign' ? project?.project_id : 'x'}`} open={drawer === 'assign'} project={project} meta={meta} onClose={closeDrawer} onSubmit={submitDrawer} saving={saving} />
      <CloseDrawer key={`close-${drawer === 'close' ? project?.project_id : 'x'}`} open={drawer === 'close'} project={project} onClose={closeDrawer} onSubmit={submitDrawer} saving={saving} />
      <BudgetDrawer key={`budget-${drawer === 'budget' ? (drawerData?.budget_item_id || 'new') : 'x'}`} open={drawer === 'budget'} initial={drawerData?.budget_item_id ? drawerData : null} onClose={closeDrawer} onSubmit={submitDrawer} saving={saving} />
      <MilestoneDrawer key={`milestone-${drawer === 'milestone' ? (drawerData?.milestone_id || 'new') : 'x'}`} open={drawer === 'milestone'} initial={drawerData?.milestone_id ? drawerData : null} onClose={closeDrawer} onSubmit={submitDrawer} saving={saving} />
      <TaskDrawer key={`task-${drawer === 'task' ? (drawerData?.task_id || 'new') : 'x'}`} open={drawer === 'task'} initial={drawerData?.task_id ? drawerData : null} meta={meta} onClose={closeDrawer} onSubmit={submitDrawer} saving={saving} />
      <MaterialDrawer key={`material-${drawer === 'material' ? (drawerData?.material_id || 'new') : 'x'}`} open={drawer === 'material'} initial={drawerData?.material_id ? drawerData : null} meta={meta} onClose={closeDrawer} onSubmit={submitDrawer} saving={saving} />
      <DocumentDrawer key={`document-${drawer === 'document' ? 'open' : 'x'}`} open={drawer === 'document'} onClose={closeDrawer} onSubmit={submitDrawer} saving={saving} />
      <ConfirmDialog {...confirmDialogProps} />
    </main>
  )
}
