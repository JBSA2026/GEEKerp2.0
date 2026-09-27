import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { notify } from '@/utils/toast'
import { Plus, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react'
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
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err }
  return data
}

// ─── Constants ──────────────────────────────────────────────────────────────
const PERIODS = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual']
const RATING_CATEGORIES = [
  'Quality of Work',
  'Productivity',
  'Communication',
  'Teamwork',
  'Initiative',
]
const RATING_LABELS = { 1: 'Poor', 2: 'Below Average', 3: 'Average', 4: 'Good', 5: 'Outstanding' }
const PAGE_SIZE = 20

// ─── Shared UI ──────────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// StatusBadge imported from '@/components/ui/status-badge'

// ─── Rating Selector ────────────────────────────────────────────────────────
function RatingSelector({ value, onChange, label, error }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[var(--color-muted-fg)]">{label}{reqMark}</label>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(score => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={cn(
              'w-9 h-9 rounded-lg border text-sm font-medium transition-all',
              value === score
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-sm'
                : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted-fg)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
            )}
            title={RATING_LABELS[score]}
          >
            {score}
          </button>
        ))}
        {value && (
          <span className="ml-2 text-xs text-[var(--color-muted-fg)]">{RATING_LABELS[value]}</span>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  )
}

// ─── Employee History Modal ─────────────────────────────────────────────────
function EmployeeHistoryModal({ open, onClose, employeeId, employeeName }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !employeeId) return undefined
    const timer = setTimeout(() => {
      setLoading(true)
      apiGet(`/hr/performance/employee/${employeeId}`)
        .then(data => setHistory(Array.isArray(data) ? data : data.items || data.data || []))
        .catch(() => setHistory([]))
        .finally(() => setLoading(false))
    }, 0)
    return () => clearTimeout(timer)
  }, [open, employeeId])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Evaluation History</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">{employeeName}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]">
            <X size={15} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-[var(--color-muted)]" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)] text-center py-6">No evaluations found.</p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3">
            {history.map((ev, i) => (
              <div key={ev.id || i} className="rounded-lg border border-[var(--color-border)] px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[var(--color-text)]">{ev.evaluation_period || ev.period}</span>
                  <StatusBadge status={ev.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--color-muted-fg)]">
                    {ev.evaluation_date ? new Date(ev.evaluation_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                  </span>
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {ev.overall_rating != null ? `${Number(ev.overall_rating).toFixed(2)} / 5` : '—'}
                  </span>
                </div>
                {ev.evaluator_name && (
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">Evaluator: {ev.evaluator_name}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Evaluation Drawer ──────────────────────────────────────────────────────
function EvaluationDrawer({ open, onClose, onSaved, entityFilter, employees }) {
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function setRating(category, score) {
    setForm(f => ({ ...f, ratings: { ...(f.ratings || {}), [category]: score } }))
    setErrors(e => ({ ...e, [category]: null }))
  }

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      setForm({ ratings: {} })
      setErrors({})
      setError(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open])

  // Compute preview overall rating
  const ratings = form.ratings || {}
  const scoredCount = RATING_CATEGORIES.filter(c => ratings[c]).length
  const overallPreview = scoredCount === 5
    ? (RATING_CATEGORIES.reduce((sum, c) => sum + (ratings[c] || 0), 0) / 5).toFixed(2)
    : null

  // Validation
  function validate() {
    const newErrors = {}
    RATING_CATEGORIES.forEach(c => {
      if (!ratings[c]) newErrors[c] = 'Score is required'
    })
    if (!form.employee_id) newErrors.employee_id = 'Employee is required'
    if (!form.evaluation_period) newErrors.evaluation_period = 'Period is required'
    if (!form.evaluator_id) newErrors.evaluator_id = 'Evaluator is required'
    if (!form.evaluation_date) newErrors.evaluation_date = 'Date is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setError(null)
    try {
      const payload = {
        employee_id: Number(form.employee_id),
        evaluation_period: form.evaluation_period,
        evaluator_id: Number(form.evaluator_id),
        evaluation_date: form.evaluation_date,
        quality_of_work: ratings['Quality of Work'],
        productivity: ratings['Productivity'],
        communication: ratings['Communication'],
        teamwork: ratings['Teamwork'],
        initiative: ratings['Initiative'],
        comments: form.comments || '',
        entity: entityFilter !== 'All' ? entityFilter : undefined,
      }
      await apiPost('/hr/performance', payload)
      notify.success('Evaluation created successfully.')
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[560px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Create Evaluation</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Record a performance evaluation for an employee</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Employee select */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Employee{reqMark}</label>
              <select value={form.employee_id || ''} onChange={e => setField('employee_id', e.target.value)} className={inputCls}>
                <option value="">— Select Employee —</option>
                {employees.map(emp => (
                  <option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
              {errors.employee_id && <p className="text-[11px] text-rose-600">{errors.employee_id}</p>}
            </div>

            {/* Evaluation Period */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Evaluation Period{reqMark}</label>
              <select value={form.evaluation_period || ''} onChange={e => setField('evaluation_period', e.target.value)} className={inputCls}>
                <option value="">— Select Period —</option>
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {errors.evaluation_period && <p className="text-[11px] text-rose-600">{errors.evaluation_period}</p>}
            </div>

            {/* Evaluator */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Evaluator{reqMark}</label>
              <select value={form.evaluator_id || ''} onChange={e => setField('evaluator_id', e.target.value)} className={inputCls}>
                <option value="">— Select Evaluator —</option>
                {employees.map(emp => (
                  <option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
              {errors.evaluator_id && <p className="text-[11px] text-rose-600">{errors.evaluator_id}</p>}
            </div>

            {/* Evaluation Date */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Evaluation Date{reqMark}</label>
              <input
                type="date"
                value={form.evaluation_date || ''}
                onChange={e => setField('evaluation_date', e.target.value)}
                className={inputCls}
              />
              {errors.evaluation_date && <p className="text-[11px] text-rose-600">{errors.evaluation_date}</p>}
            </div>

            {/* Rating Categories */}
            <div className="border-t border-[var(--color-border)] pt-4">
              <p className="text-xs font-semibold text-[var(--color-text)] mb-3">Rating Categories (1–5 scale)</p>
              <div className="space-y-4">
                {RATING_CATEGORIES.map(category => (
                  <RatingSelector
                    key={category}
                    label={category}
                    value={ratings[category] || null}
                    onChange={score => setRating(category, score)}
                    error={errors[category]}
                  />
                ))}
              </div>
            </div>

            {/* Overall Rating Preview */}
            {overallPreview && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-[11px] font-medium text-emerald-700 uppercase tracking-wide">Overall Rating (Preview)</p>
                <p className="mt-0.5 text-lg font-bold text-emerald-800">{overallPreview} / 5.00</p>
              </div>
            )}

            {/* Comments */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Comments</label>
              <textarea
                value={form.comments || ''}
                onChange={e => setField('comments', e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Qualitative feedback and observations…"
                className={inputCls}
              />
              <p className="text-[11px] text-[var(--color-muted)]">{(form.comments || '').length}/2000 characters</p>
            </div>

            {/* Error */}
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>

          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Plus size={14} /> Create Evaluation</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Main Performance Evaluation Component ──────────────────────────────────
export default function PerformanceEvaluation() {
  const [evaluations, setEvaluations] = useState([])
  const [, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [periodFilter, setPeriodFilter] = useState('All')
  const [employees, setEmployees] = useState([])

  // Drawer state
  const [drawer, setDrawer] = useState(false)

  // Employee history modal
  const [historyModal, setHistoryModal] = useState({ open: false, employeeId: null, employeeName: '' })

  const entityFilter = 'All'

  // Fetch evaluations
  const fetchEvaluations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (periodFilter !== 'All') params.set('period', periodFilter)
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      params.set('page', String(page))
      const data = await apiGet(`/hr/performance?${params}`)
      if (Array.isArray(data)) {
        setEvaluations(data)
        setTotal(data.length)
      } else {
        setEvaluations(data.items || data.data || [])
        setTotal(data.total || data.count || (data.items || data.data || []).length)
      }
    } catch {
      setEvaluations([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [periodFilter, entityFilter, page])

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      const data = await apiGet(`/hr/performance/metrics?${params}`)
      setMetrics(data || {})
    } catch {
      setMetrics({})
    }
  }, [entityFilter])

  // Fetch employees for the form
  const fetchEmployees = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      params.set('status', 'Active')
      const data = await apiGet(`/hr/201?${params}`)
      setEmployees(Array.isArray(data) ? data : data.items || data.data || [])
    } catch {
      setEmployees([])
    }
  }, [entityFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchEvaluations()
      void fetchMetrics()
      void fetchEmployees()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchEvaluations, fetchMetrics, fetchEmployees])

  // Reset page when filters change
  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 0)
    return () => clearTimeout(timer)
  }, [periodFilter, entityFilter])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openDrawer = useCallback(() => { setDrawer(true) }, [])
  const closeDrawer = useCallback(() => { setDrawer(false) }, [])
  const handleSaved = useCallback(async () => {
    await fetchEvaluations()
    await fetchMetrics()
  }, [fetchEvaluations, fetchMetrics])

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">

      {/* Filters and Actions */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {['All', ...PERIODS].map(p => (
            <button
              key={p}
              onClick={() => setPeriodFilter(p)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                periodFilter === p
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]'
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button size="md" onClick={openDrawer}>
          <Plus size={14} /> Create Evaluation
        </Button>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Employee Name</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Evaluation Period</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Evaluator</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Overall Rating</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Date Completed</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">
                  <Loader2 size={18} className="inline animate-spin mr-2" />Loading…
                </td>
              </tr>
            ) : evaluations.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">
                  No evaluations found.
                </td>
              </tr>
            ) : (
              evaluations.map(ev => (
                <tr key={ev.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors">
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => setHistoryModal({
                        open: true,
                        employeeId: ev.employee_id,
                        employeeName: ev.employee_name || `${ev.first_name || ''} ${ev.last_name || ''}`.trim() || '—'
                      })}
                      className="text-sm font-medium text-[var(--color-primary)] hover:underline text-left"
                      title="View evaluation history"
                    >
                      {ev.employee_name || `${ev.first_name || ''} ${ev.last_name || ''}`.trim() || '—'}
                    </button>
                  </td>

                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{ev.evaluation_period || ev.period || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{ev.evaluator_name || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm font-semibold text-[var(--color-text)]">
                      {ev.overall_rating != null ? `${Number(ev.overall_rating).toFixed(2)}` : '—'}
                    </span>
                    {ev.overall_rating != null && <span className="text-xs text-[var(--color-muted)] ml-1">/ 5</span>}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={ev.status} /></td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">
                    {ev.date_completed
                      ? new Date(ev.date_completed).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-muted)]">
          {total} evaluation{total !== 1 ? 's' : ''}{periodFilter !== 'All' ? ` (${periodFilter})` : ''} · Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-[var(--color-muted-fg)] px-2">{page}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Evaluation Drawer */}
      <EvaluationDrawer
        open={drawer}
        onClose={closeDrawer}
        onSaved={handleSaved}
        entityFilter={entityFilter}
        employees={employees}
      />

      {/* Employee History Modal */}
      <EmployeeHistoryModal
        open={historyModal.open}
        onClose={() => setHistoryModal({ open: false, employeeId: null, employeeName: '' })}
        employeeId={historyModal.employeeId}
        employeeName={historyModal.employeeName}
      />
    </div>
  )
}



