import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { notify } from '@/utils/toast'
import { AlertCircle, ArrowLeft, X } from 'lucide-react'
import { api } from './projectsUtils'
import { ProjectForm } from './ProjectForm'

export function ProjectCreate() {
  const navigate = useNavigate()
  const [meta, setMeta] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const loadMeta = useCallback(async () => {
    try {
      setMeta(await api('/projects/meta'))
    } catch {
      // Non-blocking — dropdowns will be empty until next retry
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void loadMeta() }, 0)
    return () => clearTimeout(timer)
  }, [loadMeta])

  async function handleCreate(form) {
    setSaving(true)
    setError(null)
    try {
      const created = await api('/projects/', { method: 'POST', body: JSON.stringify(form) })
      notify.success(`Project ${created.project_code} created`)
      navigate(`../${created.project_id}`)
    } catch (err) {
      setError(err.message)
      notify.error(err.message)
    } finally {
      setSaving(false)
    }
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
            <Button variant="outline" size="icon" className="h-8 w-8 justify-center p-0" onClick={() => navigate('../list')} aria-label="Back to projects list" title="Back to list"><ArrowLeft size={15} /></Button>
            <CardTitle>New Project</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ProjectForm meta={meta} onSave={handleCreate} onCancel={() => navigate('../list')} saving={saving} />
        </CardContent>
      </Card>
    </main>
  )
}
