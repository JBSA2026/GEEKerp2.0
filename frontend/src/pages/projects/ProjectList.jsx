import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useHighlightRow, highlightRowCls } from '@/hooks/useHighlightRow'
import { notify } from '@/utils/toast'
import {
  AlertCircle, Archive, FolderKanban, Loader2, Plus, Search, X,
} from 'lucide-react'
import {
  api, money, percent, statusLabel,
  ENTITY_MAP, ENTITY_FILTERS, STATUSES, PROJECT_GRID,
  ToolbarDropdown, CompanyTag, ProgressBar,
} from './projectsUtils'

// ── Toolbar ─────────────────────────────────────────────────────────────────

function ProjectsToolbar({ search, setSearch, statusFilter, setStatusFilter, entityFilter, setEntityFilter, onNew, onSearch }) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
      <Button size="sm" className="shrink-0" onClick={onNew}><Plus size={14} /> New Project</Button>
      <ToolbarDropdown
        value={entityFilter}
        onChange={setEntityFilter}
        options={ENTITY_FILTERS}
        labelFn={e => e === 'All' ? 'All Companies' : (ENTITY_MAP[e]?.label || e)}
        width="w-[160px]"
      />
      <ToolbarDropdown
        value={statusFilter}
        onChange={setStatusFilter}
        options={STATUSES}
        labelFn={statusLabel}
        width="w-[160px]"
      />
      <div className="relative w-[240px] shrink-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Search code or name..." value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && onSearch()} />
      </div>
    </div>
  )
}

// ── Table ───────────────────────────────────────────────────────────────────

function ProjectTable({ rows, loading, onOpen, onArchive }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin" /> Loading projects...
      </div>
    )
  }
  if (rows.length === 0) {
    return <EmptyState icon={FolderKanban} title="No projects found">Create your first project from an accepted sales order, or add a standalone project.</EmptyState>
  }
  return (
    <div className="max-h-[calc(100vh-280px)] min-h-0 overflow-auto">
      <div className={`grid ${PROJECT_GRID} w-full items-center gap-4 border-y border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
        <span>Project</span><span>Company</span><span>Customer / PM</span><span className="text-center">Contract</span><span className="text-center">Completion</span><span className="text-center">Status</span><span />
      </div>
      <div className="divide-y divide-[#e3ecf8]">
        {rows.map(row => (
          <div key={row.project_id} className={`grid ${PROJECT_GRID} w-full cursor-pointer items-center gap-4 px-5 py-3 hover:bg-[#edf4fb]`} onClick={() => onOpen(row.project_id)}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{row.project_name}</p>
              <p className="font-mono text-[11px] text-[#26324f]">{row.project_code}</p>
            </div>
            <div className="min-w-0">
              <CompanyTag entity={row.entity} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-700">{row.client_name || '-'}</p>
              <p className="truncate text-[11px] text-slate-500">{row.project_manager_name || 'Unassigned'}</p>
            </div>
            <p className="text-center text-sm font-semibold text-slate-800">{money(row.contract_value)}</p>
            <div>
              <ProgressBar value={row.completion_percent} />
              <p className="mt-1 text-center text-[11px] text-slate-500">{percent(row.completion_percent)}</p>
            </div>
            <div className="flex justify-center">
              <StatusBadge status={row.status} />
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 justify-center p-0 text-amber-600 hover:bg-amber-50 hover:text-amber-700" onClick={event => { event.stopPropagation(); onArchive(row) }} aria-label="Archive project"><Archive size={16} /></Button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── KPI Cards ───────────────────────────────────────────────────────────────

const KPI_CARDS = [
  ['TOTAL', 'Total Projects', v => v],
  ['ACTIVE', 'Active', v => v],
  ['COMPLETED', 'Completed', v => v],
  ['CONTRACT_VALUE', 'Contract Value', v => money(v)],
  ['AVG_COMPLETION', 'Avg. Completion', v => percent(v)],
]

// ── Main component ──────────────────────────────────────────────────────────

export function ProjectList() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { confirm, confirmDialogProps } = useConfirmDialog()

  const highlight = searchParams.get('highlight') || ''

  const [projects, setProjects] = useState([])
  const [summary, setSummary] = useState({})
  const [search, setSearch] = useState(highlight)
  const [statusFilter, setStatusFilter] = useState('All')
  const [entityFilter, setEntityFilter] = useState('All')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api('/projects/summary'))
    } catch {
      // Non-blocking
    }
  }, [])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (statusFilter !== 'All') params.set('status', statusFilter)
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      const query = params.toString()
      setProjects(await api(`/projects/${query ? `?${query}` : ''}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, entityFilter])

  useEffect(() => {
    const timer = setTimeout(() => { void loadSummary() }, 0)
    return () => clearTimeout(timer)
  }, [loadSummary])

  useEffect(() => {
    const timer = setTimeout(loadProjects, 250)
    return () => clearTimeout(timer)
  }, [loadProjects])

  function openDetail(projectId) {
    navigate(`/projects/${projectId}`)
  }

  async function handleArchiveProject(project) {
    const ok = await confirm({
      title: 'Archive project?',
      message: `Archive project ${project.project_code}? It will be hidden from the active project list, but its records will be retained.`,
      confirmLabel: 'Archive',
      danger: false,
    })
    if (!ok) return
    setError(null)
    try {
      await api(`/projects/${project.project_id}`, { method: 'DELETE' })
      setProjects(prev => prev.filter(row => row.project_id !== project.project_id))
      await loadSummary()
      notify.success(`Project ${project.project_code} archived`)
    } catch (err) {
      setError(err.message)
      notify.error(err.message)
    }
  }

  const toolbar = (
    <ProjectsToolbar
      search={search}
      setSearch={setSearch}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      entityFilter={entityFilter}
      setEntityFilter={setEntityFilter}
      onNew={() => navigate('/projects/new')}
      onSearch={loadProjects}
    />
  )

  return (
    <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {KPI_CARDS.map(([key, label, fmt]) => (
          <Card key={key}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-[#26324f]">{fmt(summary[key] || 0)}</p>
              <p className="mt-1 text-xs text-slate-500">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[#d8e2ef] bg-[#edf4fb]">
          <div className="flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex shrink-0 items-center gap-3">
              <CardTitle>All Projects</CardTitle>
            </div>
            {toolbar}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ProjectTable rows={projects} loading={loading} onOpen={openDetail} onArchive={handleArchiveProject} />
        </CardContent>
      </Card>

      <ConfirmDialog {...confirmDialogProps} />
    </main>
  )
}
