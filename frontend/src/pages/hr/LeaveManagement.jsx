import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { notify } from '@/utils/toast'
import {
  Plus, Loader2, X, Check, AlertTriangle, ChevronLeft, ChevronRight, XCircle, Ban
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
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err }
  return data
}

async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err }
  return data
}

// ─── Constants ──────────────────────────────────────────────────────────────
const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled']
const LEAVE_TYPES = ['Vacation', 'Sick', 'Emergency', 'Maternity', 'Paternity', 'Bereavement', 'Unpaid']
const PAGE_SIZE = 20

// ─── Shared UI ──────────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// StatusBadge imported from '@/components/ui/status-badge'

// ─── Rejection Reason Modal ─────────────────────────────────────────────────
function RejectModal({ open, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => setReason(''), 0)
    return () => clearTimeout(timer)
  }, [open])

  if (!open) return null

  const isValid = reason.trim().length > 0 && reason.length <= 500

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl p-6 max-w-md w-full mx-4">
        <p className="text-sm font-semibold text-[var(--color-text)] mb-1">Reject Leave Request</p>
        <p className="text-xs text-[var(--color-muted-fg)] mb-4">Please provide a reason for rejecting this leave request.</p>
        <div className="flex flex-col gap-1 mb-4">
          <label className="text-xs font-medium text-[var(--color-muted-fg)]">Rejection Reason{reqMark}</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Enter reason for rejection…"
            className={inputCls}
          />
          <p className="text-[11px] text-[var(--color-muted)]">{reason.length}/500 characters</p>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            type="button"
            size="md"
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
            disabled={loading || !isValid}
            onClick={() => onConfirm(reason)}
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Rejecting...</> : <><XCircle size={14} /> Reject</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirmation Modal ─────────────────────────────────────────────────────
function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel, loading, variant }) {
  if (!open) return null
  const btnCls = variant === 'danger' ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl p-6 max-w-sm w-full mx-4">
        <p className="text-sm font-semibold text-[var(--color-text)] mb-2">{title}</p>
        <p className="text-xs text-[var(--color-muted-fg)] mb-5">{message}</p>
        <div className="flex gap-3">
          <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="button" size="md" className={cn('flex-1', btnCls)} disabled={loading} onClick={onConfirm}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : null} {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Leave Balance Panel ────────────────────────────────────────────────────
function LeaveBalancePanel({ open, onClose, employeeId, entity }) {
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !employeeId) return undefined
    const timer = setTimeout(() => {
      setLoading(true)
      const params = new URLSearchParams()
      if (entity && entity !== 'All') params.set('entity', entity)
      params.set('employee_id', String(employeeId))
      apiGet(`/hr/leave/balances?${params}`)
        .then(data => setBalances(data || []))
        .catch(() => setBalances([]))
        .finally(() => setLoading(false))
    }, 0)
    return () => clearTimeout(timer)
  }, [open, employeeId, entity])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-[var(--color-text)]">Leave Balance</p>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-[var(--color-muted)]" /></div>
        ) : balances.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)] text-center py-6">No balance data available.</p>
        ) : (
          <div className="space-y-2">
            {balances.map((b, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
                <span className="text-sm text-[var(--color-text)]">{b.leave_type}</span>
                <div className="text-right">
                  <span className="text-sm font-semibold text-[var(--color-text)]">{b.remaining ?? b.balance ?? '—'}</span>
                  {b.total != null && <span className="text-xs text-[var(--color-muted)] ml-1">/ {b.total}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


// ─── File Leave Drawer ──────────────────────────────────────────────────────
function FileLeaveDrawer({ open, onClose, onSaved, entityFilter, employees }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      setForm({ entity: entityFilter !== 'All' ? entityFilter : '' })
      setError(null)
      setWarning(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open, entityFilter])

  // Validation
  const today = new Date().toISOString().split('T')[0]
  const startValid = form.start_date && form.start_date >= today
  const endValid = form.end_date && form.start_date && form.end_date >= form.start_date
  const isValid = Boolean(
    form.employee_id &&
    form.leave_type &&
    form.start_date && startValid &&
    form.end_date && endValid
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setLoading(true)
    setError(null)
    setWarning(null)
    try {
      const payload = {
        employee_id: Number(form.employee_id),
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || '',
        entity: form.entity || entityFilter || '',
      }
      const result = await apiPost('/hr/leave', payload)
      // If API returns a warning (e.g. insufficient balance), show it but don't block
      if (result.warning) {
        setWarning(result.warning)
      }
      notify.success('Leave request filed successfully.')
      await onSaved()
      onClose()
    } catch (err) {
      // Check if the error response contains a warning (insufficient balance)
      if (err.data?.warning) {
        setWarning(err.data.warning)
      } else {
        setError(err.message)
      }
    } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[520px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">File Leave Request</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Submit a new leave request for an employee</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Employee select */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Employee{reqMark}</label>
              <select value={form.employee_id || ''} onChange={e => {
                const empId = e.target.value
                setField('employee_id', empId)
                // Auto-fill entity from the selected employee
                const selected = employees.find(emp => String(emp.employee_id || emp.id) === empId)
                if (selected?.entity) setField('entity', selected.entity)
              }} className={inputCls}>
                <option value="">— Select Employee —</option>
                {employees.map(emp => (
                  <option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                    {emp.first_name} {emp.last_name} {emp.entity ? `(${emp.entity})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Leave type */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Leave Type{reqMark}</label>
              <select value={form.leave_type || ''} onChange={e => setField('leave_type', e.target.value)} className={inputCls}>
                <option value="">— Select Type —</option>
                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Start Date{reqMark}</label>
                <input
                  type="date"
                  value={form.start_date || ''}
                  min={today}
                  onChange={e => setField('start_date', e.target.value)}
                  className={inputCls}
                />
                {form.start_date && !startValid && (
                  <p className="text-[11px] text-rose-600">Start date must be today or later.</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">End Date{reqMark}</label>
                <input
                  type="date"
                  value={form.end_date || ''}
                  min={form.start_date || today}
                  onChange={e => setField('end_date', e.target.value)}
                  className={inputCls}
                />
                {form.end_date && !endValid && (
                  <p className="text-[11px] text-rose-600">End date must be on or after start date.</p>
                )}
              </div>
            </div>

            {/* Reason */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Reason</label>
              <textarea
                value={form.reason || ''}
                onChange={e => setField('reason', e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Optional reason for leave…"
                className={inputCls}
              />
              <p className="text-[11px] text-[var(--color-muted)]">{(form.reason || '').length}/500 characters</p>
            </div>

            {/* Warning alert (insufficient balance) */}
            {warning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-700">Warning</p>
                  <p className="text-xs text-amber-600">{warning}</p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading || !isValid}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Filing...</> : <><Plus size={14} /> File Leave</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}


// ─── Main Leave Management Component ────────────────────────────────────────
export default function LeaveManagement() {
  const [searchParams, setSearchParams] = useSearchParams()
  const highlight = searchParams.get('highlight') || ''
  // Extract leave ID from highlight reference (e.g. "LEAVE-5" → 5)
  const highlightId = highlight ? Number(highlight.replace('LEAVE-', '')) : null

  const [leaves, setLeaves] = useState([])
  const [, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState(highlightId ? 'Pending' : 'All')
  const [employees, setEmployees] = useState([])

  // Drawer state
  const [drawer, setDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)

  // Action states
  const [actionLoading, setActionLoading] = useState(null)
  const [rejectModal, setRejectModal] = useState({ open: false, id: null })
  const [confirmModal, setConfirmModal] = useState({ open: false, id: null, action: null })

  // Balance panel
  const [balancePanel, setBalancePanel] = useState({ open: false, employeeId: null })

  const entityFilter = 'All'

  // Fetch leave list
  const fetchLeaves = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'All') params.set('status', statusFilter)
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      params.set('page', String(page))
      const data = await apiGet(`/hr/leave?${params}`)
      if (Array.isArray(data)) {
        setLeaves(data)
        setTotal(data.length)
      } else {
        setLeaves(data.items || data.data || [])
        setTotal(data.total || data.count || (data.items || data.data || []).length)
      }
    } catch {
      setLeaves([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, entityFilter, page])

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      const data = await apiGet(`/hr/leave/metrics?${params}`)
      setMetrics(data || {})
    } catch {
      setMetrics({})
    }
  }, [entityFilter])

  // Fetch employees for the file leave form
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
      void fetchLeaves()
      void fetchMetrics()
      void fetchEmployees()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchLeaves, fetchMetrics, fetchEmployees])

  // Clean up highlight query param after consuming it (cross-module navigation)
  useEffect(() => {
    if (!highlight) return undefined
    const timer = setTimeout(() => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('highlight')
        return next
      }, { replace: true })
    }, 0)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset page when filters change
  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 0)
    return () => clearTimeout(timer)
  }, [statusFilter, entityFilter])

  // Action handlers
  async function handleApprove(id) {
    setActionLoading(id)
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      await apiPatch(`/hr/leave/${id}/approve`, { approved_by: user.id || user.user_id })
      notify.success('Leave request approved.')
      await fetchLeaves()
      await fetchMetrics()
    } catch (err) {
      notify.error(err.message || 'Failed to approve leave request.')
    } finally { setActionLoading(null) }
  }

  async function handleReject(id, reason) {
    setActionLoading(id)
    try {
      await apiPatch(`/hr/leave/${id}/reject`, { rejection_reason: reason })
      notify.success('Leave request rejected.')
      setRejectModal({ open: false, id: null })
      await fetchLeaves()
      await fetchMetrics()
    } catch (err) {
      notify.error(err.message || 'Failed to reject leave request.')
    } finally { setActionLoading(null) }
  }

  async function handleCancel(id) {
    setActionLoading(id)
    try {
      await apiPatch(`/hr/leave/${id}/cancel`, {})
      notify.success('Leave request cancelled.')
      setConfirmModal({ open: false, id: null, action: null })
      await fetchLeaves()
      await fetchMetrics()
    } catch (err) {
      notify.error(err.message || 'Failed to cancel leave request.')
    } finally { setActionLoading(null) }
  }

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openFileLeave = useCallback(() => {
    setDrawerKey(k => k + 1)
    setDrawer(true)
  }, [])

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">

      {/* Filters and Actions */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {['All', ...LEAVE_STATUSES].map(s => (
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
        <div className="flex-1" />
        <Button size="md" onClick={openFileLeave}>
          <Plus size={14} /> File Leave
        </Button>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Employee Name</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Leave Type</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Start Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">End Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Days</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Reason</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Filed Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">
                  <Loader2 size={18} className="inline animate-spin mr-2" />Loading…
                </td>
              </tr>
            ) : leaves.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">
                  No leave requests found.
                </td>
              </tr>
            ) : (
              leaves.map(leave => {
                const status = (leave.status || '').toLowerCase()
                const isPending = status === 'pending'
                const isApproved = status === 'approved'
                const isActioning = actionLoading === leave.id

                return (
                  <tr key={leave.id} className={cn(
                    "border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors",
                    highlightId === leave.id && "bg-amber-50 ring-1 ring-amber-300"
                  )}>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setBalancePanel({ open: true, employeeId: leave.employee_id })}
                        className="text-sm font-medium text-[var(--color-primary)] hover:underline text-left"
                        title="View leave balance"
                      >
                        {leave.employee_name || `${leave.first_name || ''} ${leave.last_name || ''}`.trim() || '—'}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{leave.leave_type || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">
                      {leave.start_date ? new Date(leave.start_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">
                      {leave.end_date ? new Date(leave.end_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] text-center">{leave.number_of_days ?? leave.days ?? '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={leave.status} /></td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{leave.reason || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">
                      {leave.filed_date || leave.created_at
                        ? new Date(leave.filed_date || leave.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isPending && (
                          <>
                            <button
                              onClick={() => setConfirmModal({ open: true, id: leave.id, action: 'approve' })}
                              disabled={isActioning}
                              className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                              title="Approve"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setRejectModal({ open: true, id: leave.id })}
                              disabled={isActioning}
                              className="p-1.5 rounded-md hover:bg-rose-50 text-rose-600 hover:text-rose-700 disabled:opacity-50"
                              title="Reject"
                            >
                              <XCircle size={14} />
                            </button>
                            <button
                              onClick={() => setConfirmModal({ open: true, id: leave.id, action: 'cancel' })}
                              disabled={isActioning}
                              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 disabled:opacity-50"
                              title="Cancel"
                            >
                              <Ban size={14} />
                            </button>
                          </>
                        )}
                        {isApproved && (
                          <button
                            onClick={() => setConfirmModal({ open: true, id: leave.id, action: 'cancel' })}
                            disabled={isActioning}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 disabled:opacity-50"
                            title="Cancel"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-muted)]">
          {total} request{total !== 1 ? 's' : ''}{statusFilter !== 'All' ? ` (${statusFilter})` : ''} · Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-[var(--color-muted-fg)] px-2">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* File Leave Drawer */}
      <FileLeaveDrawer
        key={drawerKey}
        open={drawer}
        onClose={() => setDrawer(false)}
        onSaved={async () => { await fetchLeaves(); await fetchMetrics() }}
        entityFilter={entityFilter}
        employees={employees}
      />

      {/* Reject Modal */}
      <RejectModal
        open={rejectModal.open}
        onClose={() => setRejectModal({ open: false, id: null })}
        onConfirm={(reason) => handleReject(rejectModal.id, reason)}
        loading={actionLoading === rejectModal.id}
      />

      {/* Confirm Modal (Approve / Cancel) */}
      <ConfirmModal
        open={confirmModal.open && confirmModal.action === 'approve'}
        onClose={() => setConfirmModal({ open: false, id: null, action: null })}
        onConfirm={() => { handleApprove(confirmModal.id); setConfirmModal({ open: false, id: null, action: null }) }}
        title="Approve Leave Request"
        message="Are you sure you want to approve this leave request?"
        confirmLabel="Approve"
        loading={actionLoading === confirmModal.id}
      />
      <ConfirmModal
        open={confirmModal.open && confirmModal.action === 'cancel'}
        onClose={() => setConfirmModal({ open: false, id: null, action: null })}
        onConfirm={() => handleCancel(confirmModal.id)}
        title="Cancel Leave Request"
        message="Are you sure you want to cancel this leave request? This action cannot be undone."
        confirmLabel="Cancel Leave"
        loading={actionLoading === confirmModal.id}
        variant="danger"
      />

      {/* Leave Balance Panel */}
      <LeaveBalancePanel
        open={balancePanel.open}
        onClose={() => setBalancePanel({ open: false, employeeId: null })}
        employeeId={balancePanel.employeeId}
        entity={entityFilter}
      />
    </div>
  )
}



