import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { notify } from '@/utils/toast'
import { AlertCircle, ArrowLeft, Loader2, X } from 'lucide-react'
import { api } from './projectsUtils'
import { ProjectForm } from './ProjectForm'

export function ProjectEdit() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState(null)
  const [meta, setMeta] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

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

  async function handleUpdate(form) {
    setSaving(true)
    setError(null)
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(form) })
      notify.success('Project updated')
      navigate(`../${id}`)
    } catch (err) {
      setError(err.message)
      notify.error(err.message)
    } finally {
      setSaving(false)
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
        <Button variant="outline" size="sm" onClick={() => navigate(`../${id}`)}>
          <ArrowLeft size={14} /> Back
        </Button>
      </main>
    )
  }

  const initial = {
    client_id: project.client_id || '',
    project_name: project.project_name || '',
    entity: project.entity || '',
    quotation_id: project.quotation_id || '',
    contract_value: project.contract_value || 0,
    budget: project.budget || 0,
    start_date: project.start_date || '',
    end_date: project.end_date || '',
    project_manager_id: project.project_manager_id || '',
    status: project.status || 'PLANNING',
    completion_percent: project.completion_percent || 0,
    description: project.description || '',
    remarks: project.remarks || '',
  }

  return (
    <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="h-8 w-8 justify-center p-0" onClick={() => navigate(`../${id}`)} aria-label="Back to project detail" title="Back to detail"><ArrowLeft size={15} /></Button>
            <CardTitle>Edit {project.project_code}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ProjectForm
            initial={initial}
            meta={meta}
            onSave={handleUpdate}
            onCancel={() => navigate(`../${id}`)}
            saving={saving}
          />
        </CardContent>
      </Card>
    </main>
  )
}
