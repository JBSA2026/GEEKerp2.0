import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { notify } from '@/utils/toast'
import {
  Search, Plus, Pencil, Loader2, X
} from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_URL

// ─── API helpers ────────────────────────────────────────────────────────────
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
  return res.json()
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.fields = data.fields || null; throw err }
  return data
}

async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.fields = data.fields || null; throw err }
  return data
}

// ─── Constants ──────────────────────────────────────────────────────────────
const ENTITIES = ['Expedia', 'GreatnessLab', 'Exigent', 'KSI']
const OJT_STATUSES = ['Active', 'Completed', 'Withdrawn', 'Extended']

// ─── Shared UI ──────────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// StatusBadge imported from '@/components/ui/status-badge'

function CompletionBar({ percentage }) {
  const pct = Math.min(Number(percentage) || 0, 100)
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-blue-500' : pct >= 50 ? 'bg-amber-500' : 'bg-slate-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden max-w-[80px]">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-[var(--color-muted-fg)] font-medium whitespace-nowrap">{pct.toFixed(1)}%</span>
    </div>
  )
}


// ─── OJT Drawer Form ────────────────────────────────────────────────────────
function OJTDrawer({ open, onClose, item, onSaved, entityFilter, employees }) {
  const isEditing = Boolean(item)
  const [form, setForm] = useState(() => item || { entity: entityFilter !== 'All' ? entityFilter : '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      if (!isEditing) {
        setForm({ entity: entityFilter !== 'All' ? entityFilter : '', required_hours: 480 })
      } else {
        setForm(item)
      }
      setFieldErrors({})
      setError(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open, item, isEditing, entityFilter])

  function validate() {
    const errs = {}
    if (!form.trainee_name?.trim()) errs.trainee_name = 'Trainee name is required'
    else if (form.trainee_name.length > 100) errs.trainee_name = 'Maximum 100 characters'
    if (!form.school?.trim()) errs.school = 'School is required'
    else if (form.school.length > 150) errs.school = 'Maximum 150 characters'
    if (!form.program?.trim()) errs.program = 'Program/course is required'
    else if (form.program.length > 150) errs.program = 'Maximum 150 characters'
    if (!form.department?.trim()) errs.department = 'Department is required'
    if (!form.supervisor_id) errs.supervisor_id = 'Supervisor is required'
    if (!form.entity) errs.entity = 'Entity is required'
    if (!form.start_date) errs.start_date = 'Start date is required'
    if (!form.end_date) errs.end_date = 'End date is required'
    else if (form.start_date && form.end_date && form.end_date <= form.start_date) errs.end_date = 'End date must be after start date'
    const rh = Number(form.required_hours)
    if (!form.required_hours && form.required_hours !== 0) errs.required_hours = 'Required hours is required'
    else if (rh < 200 || rh > 600) errs.required_hours = 'Must be between 200 and 600'
    if (form.remarks && form.remarks.length > 500) errs.remarks = 'Maximum 500 characters'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setError(null)
    try {
      const payload = {
        trainee_name: form.trainee_name?.trim() || '',
        school: form.school?.trim() || '',
        program: form.program?.trim() || '',
        department: form.department?.trim() || '',
        supervisor_id: form.supervisor_id ? Number(form.supervisor_id) : null,
        entity: form.entity || '',
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        required_hours: Number(form.required_hours),
        remarks: form.remarks?.trim() || null,
      }
      if (isEditing) {
        payload.hours_rendered = Number(form.hours_rendered) || 0
        payload.status = form.status || 'Active'
      }
      const saved = isEditing
        ? await apiPatch(`/hr/ojt/${item.id}`, payload)
        : await apiPost('/hr/ojt', payload)
      notify.success(isEditing ? 'OJT trainee updated.' : 'OJT trainee created.')
      await onSaved(saved)
      onClose()
    } catch (err) {
      if (err.fields) {
        setFieldErrors(err.fields)
      }
      setError(err.message)
    } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[520px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">{isEditing ? 'Edit' : 'Add'} OJT Trainee</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">{isEditing ? 'Update trainee details' : 'Register a new OJT trainee'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Trainee Name */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Trainee Name{reqMark}</label>
              <input value={form.trainee_name || ''} onChange={e => setField('trainee_name', e.target.value)} placeholder="Full name" maxLength={100} className={inputCls} />
              {fieldErrors.trainee_name && <p className="text-xs text-rose-600">{fieldErrors.trainee_name}</p>}
            </div>
            {/* School */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">School{reqMark}</label>
              <input value={form.school || ''} onChange={e => setField('school', e.target.value)} placeholder="e.g. University of the Philippines" maxLength={150} className={inputCls} />
              {fieldErrors.school && <p className="text-xs text-rose-600">{fieldErrors.school}</p>}
            </div>
            {/* Program */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Program / Course{reqMark}</label>
              <input value={form.program || ''} onChange={e => setField('program', e.target.value)} placeholder="e.g. BS Computer Science" maxLength={150} className={inputCls} />
              {fieldErrors.program && <p className="text-xs text-rose-600">{fieldErrors.program}</p>}
            </div>
            {/* Department & Entity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Department{reqMark}</label>
                <input value={form.department || ''} onChange={e => setField('department', e.target.value)} placeholder="e.g. Engineering" className={inputCls} />
                {fieldErrors.department && <p className="text-xs text-rose-600">{fieldErrors.department}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Entity{reqMark}</label>
                <select value={form.entity || ''} onChange={e => setField('entity', e.target.value)} className={inputCls}>
                  <option value="">— Select —</option>
                  {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                {fieldErrors.entity && <p className="text-xs text-rose-600">{fieldErrors.entity}</p>}
              </div>
            </div>
            {/* Supervisor */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Supervisor{reqMark}</label>
              <select value={form.supervisor_id || ''} onChange={e => setField('supervisor_id', e.target.value)} className={inputCls}>
                <option value="">— Select Supervisor —</option>
                {(employees || []).map(emp => (
                  <option key={emp.employee_id} value={emp.employee_id}>{emp.first_name} {emp.last_name}</option>
                ))}
              </select>
              {fieldErrors.supervisor_id && <p className="text-xs text-rose-600">{fieldErrors.supervisor_id}</p>}
            </div>
            {/* Start Date & End Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Start Date{reqMark}</label>
                <input type="date" value={form.start_date || ''} onChange={e => setField('start_date', e.target.value)} className={inputCls} />
                {fieldErrors.start_date && <p className="text-xs text-rose-600">{fieldErrors.start_date}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">End Date{reqMark}</label>
                <input type="date" value={form.end_date || ''} onChange={e => setField('end_date', e.target.value)} className={inputCls} />
                {fieldErrors.end_date && <p className="text-xs text-rose-600">{fieldErrors.end_date}</p>}
              </div>
            </div>
            {/* Required Hours & Hours Rendered (edit only) */}
            <div className={`grid ${isEditing ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Required Hours{reqMark}</label>
                <input type="number" min={200} max={600} value={form.required_hours ?? ''} onChange={e => setField('required_hours', e.target.value)} placeholder="200–600" className={inputCls} />
                {fieldErrors.required_hours && <p className="text-xs text-rose-600">{fieldErrors.required_hours}</p>}
              </div>
              {isEditing && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--color-muted-fg)]">Hours Rendered</label>
                  <input type="number" min={0} value={form.hours_rendered ?? ''} onChange={e => setField('hours_rendered', e.target.value)} placeholder="0" className={inputCls} />
                </div>
              )}
            </div>
            {/* Status (edit only) */}
            {isEditing && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Status</label>
                <select value={form.status || 'Active'} onChange={e => setField('status', e.target.value)} className={inputCls}>
                  {OJT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {/* Auto-completion note */}
                {(form.status === 'Active' || form.status === 'Extended') && Number(form.hours_rendered) >= Number(form.required_hours) && Number(form.required_hours) > 0 && (
                  <p className="text-xs text-emerald-600 mt-1">✓ Hours requirement met — status will be auto-set to Completed on save.</p>
                )}
              </div>
            )}
            {/* Completion progress (edit only) */}
            {isEditing && form.required_hours > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Completion Progress</label>
                <CompletionBar percentage={((Number(form.hours_rendered) || 0) / Number(form.required_hours)) * 100} />
              </div>
            )}
            {/* Remarks */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Remarks</label>
              <textarea value={form.remarks || ''} onChange={e => setField('remarks', e.target.value)} rows={3} maxLength={500} placeholder="Optional notes…" className={inputCls} />
              {fieldErrors.remarks && <p className="text-xs text-rose-600">{fieldErrors.remarks}</p>}
            </div>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <>{isEditing ? <Pencil size={14} /> : <Plus size={14} />} {isEditing ? 'Save' : 'Create'}</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}


// ─── Main OJT Management Component ─────────────────────────────────────────
export default function OJTManagement() {
  const [trainees, setTrainees] = useState([])
  const [, setMetrics] = useState({})
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [drawer, setDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [selectedTrainee, setSelectedTrainee] = useState(null)

  const entityFilter = 'All'

  // Load employees for supervisor select
  const loadEmployees = useCallback(async () => {
    try {
      const data = await apiGet('/employees?limit=500')
      setEmployees(data?.employees || data || [])
    } catch { /* ignore */ }
  }, [])

  const loadTrainees = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'All') params.set('status', statusFilter)
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      if (search.trim()) params.set('search', search)
      const data = await apiGet(`/hr/ojt?${params}`)
      setTrainees(data?.data || data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [statusFilter, entityFilter, search])

  const loadMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      const data = await apiGet(`/hr/ojt/metrics?${params}`)
      setMetrics(data || {})
    } catch { /* ignore */ }
  }, [entityFilter])

  useEffect(() => {
    const timer = setTimeout(() => { void loadEmployees() }, 0)
    return () => clearTimeout(timer)
  }, [loadEmployees])
  useEffect(() => { const t = setTimeout(() => { loadTrainees(); loadMetrics() }, 300); return () => clearTimeout(t) }, [loadTrainees, loadMetrics])

  function openNew() { setSelectedTrainee(null); setDrawerKey(k => k + 1); setDrawer(true) }
  function openEdit(item, e) {
    e?.stopPropagation()
    setSelectedTrainee(item)
    setDrawerKey(k => k + 1)
    setDrawer(true)
  }
  async function handleSaved() { await loadTrainees(); await loadMetrics() }

  // Helper to find supervisor name from employees list
  function supervisorName(supervisorId) {
    const emp = employees.find(e => e.employee_id === supervisorId)
    return emp ? `${emp.first_name} ${emp.last_name}` : '—'
  }

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">

      {/* Top bar: search + status filter + add button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search trainee, school, supervisor…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-2 text-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
          />
        </div>
        <div className="flex gap-1.5">
          {['All', ...OJT_STATUSES].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === s
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <Button size="md" onClick={openNew}><Plus size={14} /> Add Trainee</Button>
      </div>

      {/* Trainees Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Trainee Name</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">School</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Program</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Department</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Supervisor</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Start Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">End Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Hours / Completion</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : trainees.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No OJT trainees found.</td></tr>
            ) : (
              trainees.map(trainee => (
                <tr key={trainee.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors">
                  <td className="px-3 py-2.5"><p className="text-sm font-medium text-[var(--color-text)]">{trainee.trainee_name}</p></td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{trainee.school || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{trainee.program || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{trainee.department || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{trainee.supervisor_name || supervisorName(trainee.supervisor_id)}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{trainee.start_date || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{trainee.end_date || '—'}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={trainee.status} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-[var(--color-muted-fg)]">{trainee.hours_rendered ?? 0}h / {trainee.required_hours ?? 0}h</span>
                      <CompletionBar percentage={trainee.completion_percentage ?? (trainee.required_hours ? ((trainee.hours_rendered || 0) / trainee.required_hours) * 100 : 0)} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={(e) => openEdit(trainee, e)} className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]">
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">{trainees.length} trainee{trainees.length !== 1 ? 's' : ''}{statusFilter !== 'All' ? ` (${statusFilter})` : ''}</p>

      <OJTDrawer
        key={drawerKey}
        open={drawer}
        onClose={() => setDrawer(false)}
        item={selectedTrainee}
        onSaved={handleSaved}
        entityFilter={entityFilter}
        employees={employees}
      />
    </div>
  )
}



