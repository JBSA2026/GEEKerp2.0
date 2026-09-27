import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { notify } from '@/utils/toast'
import {
  Plus, Loader2, X, Pencil, ChevronLeft, ChevronRight
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
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

// ─── Constants ──────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

// ─── Shared UI ──────────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// StatusBadge imported from '@/components/ui/status-badge'

// ─── Attendance Drawer ──────────────────────────────────────────────────────
function AttendanceDrawer({ open, onClose, onSaved, editRecord, employees }) {
  const isEdit = Boolean(editRecord)
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      if (editRecord) {
        setForm({
          employee_id: editRecord.employee_id || '',
          date: editRecord.date || '',
          time_in: editRecord.time_in || '',
          time_out: editRecord.time_out || '',
          remarks: editRecord.remarks || '',
        })
      } else {
        setForm({ employee_id: '', date: '', time_in: '', time_out: '', remarks: '' })
      }
      setError(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open, editRecord])

  // Validation
  const timeOutValid = !form.time_out || !form.time_in || form.time_out > form.time_in
  const isValid = Boolean(
    form.employee_id &&
    form.date &&
    form.time_in &&
    timeOutValid
  )

  // Compute total hours for display
  function computeDisplayHours() {
    if (!form.time_in || !form.time_out) return null
    if (form.time_out <= form.time_in) return null
    const [inH, inM] = form.time_in.split(':').map(Number)
    const [outH, outM] = form.time_out.split(':').map(Number)
    const spanMinutes = (outH * 60 + outM) - (inH * 60 + inM)
    const spanHours = spanMinutes / 60
    const total = spanHours > 5 ? spanHours - 1 : spanHours
    return Math.round(total * 100) / 100
  }

  // Derive status for display
  function deriveDisplayStatus() {
    if (!form.time_in) return null
    const [inH, inM] = form.time_in.split(':').map(Number)
    const standardStart = 9 * 60 // 09:00
    const isLate = (inH * 60 + inM) > standardStart
    const totalHours = computeDisplayHours()
    const isUndertime = totalHours != null && totalHours < 8
    if (isLate && isUndertime) return 'Late/Undertime'
    if (isLate) return 'Late'
    if (isUndertime) return 'Undertime'
    return 'Present'
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setLoading(true)
    setError(null)
    try {
      const payload = {
        employee_id: Number(form.employee_id),
        date: form.date,
        time_in: form.time_in,
        time_out: form.time_out || null,
        remarks: form.remarks || '',
      }
      if (isEdit) {
        await apiPatch(`/hr/attendance/${editRecord.id}`, payload)
        notify.success('Attendance record updated.')
      } else {
        await apiPost('/hr/attendance', payload)
        notify.success('Attendance record created.')
      }
      await onSaved()
      onClose()
    } catch (err) {
      if (err.status === 409) {
        setError('Record already exists for this employee on this date')
      } else {
        setError(err.message)
      }
    } finally { setLoading(false) }
  }

  const displayHours = computeDisplayHours()
  const displayStatus = deriveDisplayStatus()

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[520px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">{isEdit ? 'Edit Attendance Record' : 'Add Attendance Record'}</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">{isEdit ? 'Update an existing attendance entry' : 'Log a new attendance entry for an employee'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Employee select */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Employee{reqMark}</label>
              <select
                value={form.employee_id || ''}
                onChange={e => setField('employee_id', e.target.value)}
                disabled={isEdit}
                className={inputCls}
              >
                <option value="">— Select Employee —</option>
                {employees.map(emp => (
                  <option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                    {emp.first_name} {emp.last_name} {emp.entity ? `(${emp.entity})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Date{reqMark}</label>
              <input
                type="date"
                value={form.date || ''}
                onChange={e => setField('date', e.target.value)}
                disabled={isEdit}
                className={inputCls}
              />
            </div>

            {/* Time In / Time Out */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Time In{reqMark}</label>
                <input
                  type="time"
                  value={form.time_in || ''}
                  onChange={e => setField('time_in', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Time Out</label>
                <input
                  type="time"
                  value={form.time_out || ''}
                  onChange={e => setField('time_out', e.target.value)}
                  className={inputCls}
                />
                {form.time_out && !timeOutValid && (
                  <p className="text-[11px] text-rose-600">Time out must be after time in.</p>
                )}
              </div>
            </div>

            {/* Computed fields (read-only) */}
            {(displayHours != null || displayStatus) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--color-muted-fg)]">Total Hours (computed)</label>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)]">
                    {displayHours != null ? `${displayHours} hrs` : '—'}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--color-muted-fg)]">Status (computed)</label>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
                    {displayStatus ? <StatusBadge status={displayStatus} /> : '—'}
                  </div>
                </div>
              </div>
            )}

            {/* Remarks */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Remarks</label>
              <textarea
                value={form.remarks || ''}
                onChange={e => setField('remarks', e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Optional remarks…"
                className={inputCls}
              />
              <p className="text-[11px] text-[var(--color-muted)]">{(form.remarks || '').length}/500 characters</p>
            </div>

            {/* Error */}
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading || !isValid}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Plus size={14} /> {isEdit ? 'Update' : 'Add Record'}</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Main Attendance Component ──────────────────────────────────────────────
export default function Attendance() {
  const [records, setRecords] = useState([])
  const [, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [employees, setEmployees] = useState([])

  // Filter state
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')

  // Drawer state
  const [drawer, setDrawer] = useState(false)
  const [editRecord, setEditRecord] = useState(null)

  const entityFilter = 'All'

  // Fetch attendance records
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)
      if (employeeFilter) params.set('employee_id', employeeFilter)
      params.set('page', String(page))
      const data = await apiGet(`/hr/attendance?${params}`)
      if (Array.isArray(data)) {
        setRecords(data)
        setTotal(data.length)
      } else {
        setRecords(data.items || data.data || [])
        setTotal(data.total || data.count || (data.items || data.data || []).length)
      }
    } catch {
      setRecords([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [entityFilter, startDate, endDate, employeeFilter, page])

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      const data = await apiGet(`/hr/attendance/metrics?${params}`)
      setMetrics(data || {})
    } catch {
      setMetrics({})
    }
  }, [entityFilter])

  // Fetch employees for filter and drawer
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
      void fetchRecords()
      void fetchMetrics()
      void fetchEmployees()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchRecords, fetchMetrics, fetchEmployees])

  // Reset page when filters change
  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 0)
    return () => clearTimeout(timer)
  }, [entityFilter, startDate, endDate, employeeFilter])

  // Drawer handlers
  function openAdd() { setEditRecord(null); setDrawer(true) }
  function openEdit(record) { setEditRecord(record); setDrawer(true) }
  function closeDrawer() { setDrawer(false); setEditRecord(null) }

  async function handleSaved() {
    await fetchRecords()
    await fetchMetrics()
  }

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">

      {/* Filters and Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Date range filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-[var(--color-muted-fg)]">From:</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className={cn(inputCls, 'w-auto')}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-[var(--color-muted-fg)]">To:</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className={cn(inputCls, 'w-auto')}
          />
        </div>

        {/* Employee filter */}
        <select
          value={employeeFilter}
          onChange={e => setEmployeeFilter(e.target.value)}
          className={cn(inputCls, 'w-auto min-w-[180px]')}
        >
          <option value="">All Employees</option>
          {employees.map(emp => (
            <option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
              {emp.first_name} {emp.last_name}
            </option>
          ))}
        </select>

        <div className="flex-1" />
        <Button size="md" onClick={openAdd}>
          <Plus size={14} /> Add Record
        </Button>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Employee Name</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Time In</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Time Out</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Total Hours</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Remarks</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">
                  <Loader2 size={18} className="inline animate-spin mr-2" />Loading…
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">
                  No attendance records found.
                </td>
              </tr>
            ) : (
              records.map(record => (
                <tr key={record.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors">
                  <td className="px-3 py-2.5 text-sm font-medium text-[var(--color-text)]">
                    {record.employee_name || `${record.first_name || ''} ${record.last_name || ''}`.trim() || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">
                    {record.date ? new Date(record.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{record.time_in || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{record.time_out || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">
                    {record.total_hours != null ? `${record.total_hours} hrs` : '—'}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={record.status} /></td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] max-w-[200px] truncate" title={record.remarks || ''}>
                    {record.remarks || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => openEdit(record)}
                      className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"
                      title="Edit record"
                    >
                      <Pencil size={14} />
                    </button>
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
          {total} record{total !== 1 ? 's' : ''} · Page {page} of {totalPages}
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

      {/* Drawer */}
      <AttendanceDrawer
        open={drawer}
        onClose={closeDrawer}
        onSaved={handleSaved}
        editRecord={editRecord}
        employees={employees}
      />
    </div>
  )
}



