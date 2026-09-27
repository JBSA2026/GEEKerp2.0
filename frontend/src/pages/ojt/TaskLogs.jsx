import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { notify } from '@/utils/toast'
import { Search, Plus, CheckCircle, XCircle, Loader2, X, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_URL

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
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.fields = data.fields; throw err }
  return data
}
async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.fields = data.fields; throw err }
  return data
}

const LOG_STATUSES = ['Pending', 'Approved', 'Rejected']
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// ─── Task Log Form Drawer ───────────────────────────────────────────────────
function TaskLogDrawer({ open, onClose, interns, onSaved }) {
  const [form, setForm] = useState({ hours_spent: 8 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (open) {
      setForm({ hours_spent: 8, log_date: new Date().toISOString().split('T')[0] })
      setFieldErrors({})
      setError(null)
    }
  }, [open])

  function validate() {
    const errs = {}
    if (!form.trainee_id) errs.trainee_id = 'Select an intern'
    if (!form.task_description?.trim()) errs.task_description = 'Required'
    if (!form.log_date) errs.log_date = 'Required'
    const h = Number(form.hours_spent)
    if (!h || h <= 0 || h > 24) errs.hours_spent = '1–24 hours'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true); setError(null)
    try {
      const payload = {
        trainee_id: Number(form.trainee_id),
        log_date: form.log_date,
        time_in: form.time_in || null,
        time_out: form.time_out || null,
        hours_spent: Number(form.hours_spent),
        task_description: form.task_description.trim(),
        module_worked: form.module_worked?.trim() || null,
      }
      await apiPost('/ojt/task-logs', payload)
      notify.success('Task log submitted.')
      await onSaved()
      onClose()
    } catch (err) {
      if (err.fields) setFieldErrors(err.fields)
      setError(err.message)
    } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[480px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Log Daily Task</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Record work done for the day</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Intern{reqMark}</label>
              <select value={form.trainee_id || ''} onChange={e => setField('trainee_id', e.target.value)} className={inputCls}>
                <option value="">— Select Intern —</option>
                {(interns || []).filter(i => i.status === 'Active' || i.status === 'Extended').map(i => (
                  <option key={i.id} value={i.id}>{i.trainee_name} ({i.school})</option>
                ))}
              </select>
              {fieldErrors.trainee_id && <p className="text-xs text-rose-600">{fieldErrors.trainee_id}</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Date{reqMark}</label>
                <input type="date" value={form.log_date || ''} onChange={e => setField('log_date', e.target.value)} className={inputCls} />
                {fieldErrors.log_date && <p className="text-xs text-rose-600">{fieldErrors.log_date}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Time In</label>
                <input type="time" value={form.time_in || ''} onChange={e => setField('time_in', e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Time Out</label>
                <input type="time" value={form.time_out || ''} onChange={e => setField('time_out', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Hours Spent{reqMark}</label>
                <input type="number" min={0.5} max={24} step={0.5} value={form.hours_spent ?? ''} onChange={e => setField('hours_spent', e.target.value)} className={inputCls} />
                {fieldErrors.hours_spent && <p className="text-xs text-rose-600">{fieldErrors.hours_spent}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Module Worked</label>
                <input value={form.module_worked || ''} onChange={e => setField('module_worked', e.target.value)} placeholder="e.g. Frontend, QA" className={inputCls} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Task Description{reqMark}</label>
              <textarea value={form.task_description || ''} onChange={e => setField('task_description', e.target.value)} rows={3} placeholder="What did you work on today?" className={inputCls} />
              {fieldErrors.task_description && <p className="text-xs text-rose-600">{fieldErrors.task_description}</p>}
            </div>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Submitting...</> : <><Plus size={14} /> Submit Log</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Main Task Logs Component ───────────────────────────────────────────────
export default function TaskLogs() {
  const [logs, setLogs] = useState([])
  const [interns, setInterns] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [internFilter, setInternFilter] = useState('')
  const [drawer, setDrawer] = useState(false)

  const loadInterns = useCallback(async () => {
    try {
      const data = await apiGet('/ojt/interns')
      setInterns(data?.data || [])
    } catch { /* ignore */ }
  }, [])

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'All') params.set('status', statusFilter)
      if (internFilter) params.set('trainee_id', internFilter)
      const data = await apiGet(`/ojt/task-logs?${params}`)
      setLogs(data?.data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [statusFilter, internFilter])

  useEffect(() => { loadInterns() }, [loadInterns])
  useEffect(() => { const t = setTimeout(loadLogs, 200); return () => clearTimeout(t) }, [loadLogs])

  async function handleApprove(logId) {
    try {
      await apiPatch(`/ojt/task-logs/${logId}`, { status: 'Approved' })
      notify.success('Task log approved.')
      await loadLogs()
    } catch (err) { notify.error(err.message) }
  }

  async function handleReject(logId) {
    try {
      await apiPatch(`/ojt/task-logs/${logId}`, { status: 'Rejected' })
      notify.success('Task log rejected.')
      await loadLogs()
    } catch (err) { notify.error(err.message) }
  }

  // Map trainee_id to name
  function traineeName(id) {
    const intern = interns.find(i => i.id === id)
    return intern ? intern.trainee_name : `#${id}`
  }

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={internFilter} onChange={e => setInternFilter(e.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm min-w-[200px]">
          <option value="">All Interns</option>
          {interns.map(i => <option key={i.id} value={i.id}>{i.trainee_name}</option>)}
        </select>
        <div className="flex gap-1.5">
          {['All', ...LOG_STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', statusFilter === s ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]')}>{s}</button>
          ))}
        </div>
        <div className="ml-auto">
          <Button size="md" onClick={() => setDrawer(true)}><Plus size={14} /> Log Task</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-muted-fg)]">Total Logs</p>
          <p className="text-xl font-semibold text-[var(--color-text)]">{logs.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-muted-fg)]">Pending Approval</p>
          <p className="text-xl font-semibold text-amber-600">{logs.filter(l => l.status === 'Pending').length}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-muted-fg)]">Total Hours (Approved)</p>
          <p className="text-xl font-semibold text-emerald-600">{logs.filter(l => l.status === 'Approved').reduce((s, l) => s + Number(l.hours_spent || 0), 0).toFixed(1)}h</p>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Intern</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Time</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Hours</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Module</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] max-w-[300px]">Task</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No task logs found.</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors">
                <td className="px-3 py-2.5 text-xs text-[var(--color-text)] font-medium whitespace-nowrap">{log.log_date}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{traineeName(log.trainee_id)}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] whitespace-nowrap">
                  {log.time_in && log.time_out ? `${log.time_in.slice(0,5)}–${log.time_out.slice(0,5)}` : log.time_in ? `${log.time_in.slice(0,5)}–?` : '—'}
                </td>
                <td className="px-3 py-2.5 text-xs font-medium text-[var(--color-text)]">{log.hours_spent}h</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{log.module_worked || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] max-w-[300px] truncate" title={log.task_description}>{log.task_description}</td>
                <td className="px-3 py-2.5"><StatusBadge status={log.status} /></td>
                <td className="px-3 py-2.5 text-right">
                  {log.status === 'Pending' && (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleApprove(log.id)} title="Approve" className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700"><CheckCircle size={15} /></button>
                      <button onClick={() => handleReject(log.id)} title="Reject" className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500 hover:text-rose-600"><XCircle size={15} /></button>
                    </div>
                  )}
                  {log.status !== 'Pending' && <span className="text-[11px] text-[var(--color-muted)]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">{logs.length} log{logs.length !== 1 ? 's' : ''}</p>

      <TaskLogDrawer open={drawer} onClose={() => setDrawer(false)} interns={interns} onSaved={loadLogs} />
    </div>
  )
}
