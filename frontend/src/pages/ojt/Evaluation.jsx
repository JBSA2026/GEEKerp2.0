import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { notify } from '@/utils/toast'
import { Plus, Loader2, X, Star } from 'lucide-react'
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

const CRITERIA = [
  { key: 'quality_of_work', label: 'Quality of Work' },
  { key: 'initiative', label: 'Initiative' },
  { key: 'attendance_punctuality', label: 'Attendance & Punctuality' },
  { key: 'communication', label: 'Communication' },
  { key: 'technical_skills', label: 'Technical Skills' },
  { key: 'teamwork', label: 'Teamwork' },
]
const RECOMMENDATIONS = ['Retain', 'Extend', 'Complete', 'Terminate', 'Hire']
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// ─── Rating Stars ───────────────────────────────────────────────────────────
function RatingInput({ value, onChange, label }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--color-muted-fg)]">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
            <Star size={16} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
          </button>
        ))}
      </div>
    </div>
  )
}

function RatingDisplay({ value }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={12} className={n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />
      ))}
    </div>
  )
}

// ─── Evaluation Drawer ──────────────────────────────────────────────────────
function EvalDrawer({ open, onClose, interns, employees, onSaved }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (open) {
      setForm({ quality_of_work: 3, initiative: 3, attendance_punctuality: 3, communication: 3, technical_skills: 3, teamwork: 3 })
      setError(null)
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.trainee_id) { setError('Select an intern'); return }
    if (!form.evaluator_id) { setError('Select an evaluator'); return }
    setLoading(true); setError(null)
    try {
      await apiPost('/ojt/evaluations', {
        trainee_id: Number(form.trainee_id),
        evaluator_id: Number(form.evaluator_id),
        evaluation_date: form.evaluation_date || null,
        quality_of_work: form.quality_of_work,
        initiative: form.initiative,
        attendance_punctuality: form.attendance_punctuality,
        communication: form.communication,
        technical_skills: form.technical_skills,
        teamwork: form.teamwork,
        comments: form.comments || null,
        recommendation: form.recommendation || null,
      })
      notify.success('Evaluation created.')
      await onSaved()
      onClose()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const avgRating = CRITERIA.reduce((s, c) => s + (form[c.key] || 0), 0) / CRITERIA.length

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[500px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">New Evaluation</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Rate intern performance</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Intern{reqMark}</label>
                <select value={form.trainee_id || ''} onChange={e => setField('trainee_id', e.target.value)} className={inputCls}>
                  <option value="">— Select —</option>
                  {(interns || []).map(i => <option key={i.id} value={i.id}>{i.trainee_name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Evaluator{reqMark}</label>
                <select value={form.evaluator_id || ''} onChange={e => setField('evaluator_id', e.target.value)} className={inputCls}>
                  <option value="">— Select —</option>
                  {(employees || []).map(emp => <option key={emp.employee_id} value={emp.employee_id}>{emp.first_name} {emp.last_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Evaluation Date</label>
              <input type="date" value={form.evaluation_date || ''} onChange={e => setField('evaluation_date', e.target.value)} className={inputCls} />
            </div>
            {/* Rating criteria */}
            <div className="space-y-3 rounded-lg border border-[var(--color-border)] p-4 bg-[var(--color-surface)]">
              <p className="text-xs font-medium text-[var(--color-text)]">Performance Ratings (1–5){reqMark}</p>
              {CRITERIA.map(c => (
                <RatingInput key={c.key} label={c.label} value={form[c.key] || 0} onChange={v => setField(c.key, v)} />
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
                <span className="text-xs font-medium text-[var(--color-text)]">Overall Average</span>
                <span className="text-sm font-semibold text-[var(--color-primary)]">{avgRating.toFixed(2)} / 5.00</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Recommendation</label>
              <select value={form.recommendation || ''} onChange={e => setField('recommendation', e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {RECOMMENDATIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Comments</label>
              <textarea value={form.comments || ''} onChange={e => setField('comments', e.target.value)} rows={3} placeholder="Additional notes…" className={inputCls} />
            </div>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Plus size={14} /> Submit Evaluation</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Main Evaluation Component ──────────────────────────────────────────────
export default function Evaluation() {
  const [evaluations, setEvaluations] = useState([])
  const [interns, setInterns] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(false)

  const loadInterns = useCallback(async () => {
    try {
      const data = await apiGet('/ojt/interns')
      setInterns(data?.data || [])
    } catch { /* ignore */ }
  }, [])

  const loadEmployees = useCallback(async () => {
    try {
      const data = await apiGet('/employees?limit=500')
      setEmployees(data?.employees || data || [])
    } catch { /* ignore */ }
  }, [])

  const loadEvaluations = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet('/ojt/evaluations')
      setEvaluations(data?.data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadInterns(); loadEmployees() }, [loadInterns, loadEmployees])
  useEffect(() => { loadEvaluations() }, [loadEvaluations])

  function traineeName(id) {
    const intern = interns.find(i => i.id === id)
    return intern ? intern.trainee_name : `#${id}`
  }

  async function handleMarkComplete(evalId) {
    try {
      await apiPatch(`/ojt/evaluations/${evalId}`, { status: 'Completed' })
      notify.success('Evaluation finalized.')
      await loadEvaluations()
    } catch (err) { notify.error(err.message) }
  }

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">
      {/* Top actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Performance Evaluations</h2>
          <p className="text-xs text-[var(--color-muted-fg)]">{evaluations.length} evaluation{evaluations.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button size="md" onClick={() => setDrawer(true)}><Plus size={14} /> New Evaluation</Button>
        </div>
      </div>

      {/* Evaluations table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Intern</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Evaluator</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Rating</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Recommendation</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : evaluations.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No evaluations yet.</td></tr>
            ) : evaluations.map(ev => (
              <tr key={ev.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors">
                <td className="px-3 py-2.5 text-sm font-medium text-[var(--color-text)]">{traineeName(ev.trainee_id)}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{ev.evaluator_name || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{ev.evaluation_date}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <RatingDisplay value={ev.overall_rating} />
                    <span className="text-xs font-medium text-[var(--color-text)]">{Number(ev.overall_rating).toFixed(2)}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{ev.recommendation || '—'}</td>
                <td className="px-3 py-2.5"><StatusBadge status={ev.status} /></td>
                <td className="px-3 py-2.5 text-right">
                  {ev.status === 'Draft' && (
                    <button onClick={() => handleMarkComplete(ev.id)} title="Mark as Complete" className="text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-medium">Finalize</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EvalDrawer open={drawer} onClose={() => setDrawer(false)} interns={interns} employees={employees} onSaved={loadEvaluations} />
    </div>
  )
}
