import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { notify } from '@/utils/toast'
import {
  Plus, Loader2, X, Pencil, FileText, ChevronLeft, ChevronRight, Upload
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
const TRAINING_TYPES = ['Internal', 'External', 'Online', 'Seminar', 'Workshop']
const TRAINING_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled']
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const PAGE_SIZE = 20

// ─── Shared UI ──────────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// StatusBadge imported from '@/components/ui/status-badge'


// ─── Training Record Drawer ─────────────────────────────────────────────────
function TrainingDrawer({ open, onClose, onSaved, entityFilter, employees, editRecord }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      if (editRecord) {
        setForm({
          training_title: editRecord.training_title || '',
          employee_id: editRecord.employee_id || '',
          provider: editRecord.provider || '',
          training_date: editRecord.training_date || '',
          duration_hours: editRecord.duration_hours || '',
          training_type: editRecord.training_type || '',
          status: editRecord.status || '',
          entity: editRecord.entity || (entityFilter !== 'All' ? entityFilter : ''),
        })
      } else {
        setForm({ entity: entityFilter !== 'All' ? entityFilter : '', status: 'Scheduled' })
      }
      setError(null)
      setFileError(null)
      setSelectedFile(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open, entityFilter, editRecord])

  // File validation
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    setFileError(null)
    setSelectedFile(null)

    if (!file) return

    // Validate file type
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_FILE_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError('Invalid file format. Accepted: PDF, JPG, PNG, DOCX.')
      e.target.value = ''
      return
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setFileError('File size exceeds 10MB limit.')
      e.target.value = ''
      return
    }

    setSelectedFile(file)
  }

  // Validation
  const durationNum = parseFloat(form.duration_hours)
  const durationValid = !isNaN(durationNum) && durationNum >= 0.5 && durationNum <= 1000
  const titleValid = form.training_title && form.training_title.trim().length > 0 && form.training_title.length <= 150
  const providerValid = !form.provider || form.provider.length <= 150

  const isValid = Boolean(
    titleValid &&
    form.employee_id &&
    form.training_date &&
    form.duration_hours && durationValid &&
    form.training_type &&
    form.status &&
    providerValid &&
    !fileError
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setLoading(true)
    setError(null)
    try {
      const payload = {
        training_title: form.training_title.trim(),
        employee_id: Number(form.employee_id),
        provider: form.provider?.trim() || null,
        training_date: form.training_date,
        duration_hours: parseFloat(form.duration_hours),
        training_type: form.training_type,
        status: form.status,
        entity: form.entity || entityFilter || '',
      }

      // If a file was selected, store filename as certificate_path (actual upload handled separately)
      if (selectedFile) {
        payload.certificate_path = selectedFile.name
      }

      if (editRecord) {
        await apiPatch(`/hr/training/${editRecord.id}`, payload)
        notify.success('Training record updated successfully.')
      } else {
        await apiPost('/hr/training', payload)
        notify.success('Training record created successfully.')
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally { setLoading(false) }
  }

  const isEditing = Boolean(editRecord)

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[520px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">{isEditing ? 'Edit Training Record' : 'Add Training Record'}</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">{isEditing ? 'Update training record details' : 'Record a new employee training'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Training Title */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Training Title{reqMark}</label>
              <input
                type="text"
                value={form.training_title || ''}
                onChange={e => setField('training_title', e.target.value)}
                maxLength={150}
                placeholder="e.g. Advanced React Workshop"
                className={inputCls}
              />
              {form.training_title && !titleValid && (
                <p className="text-[11px] text-rose-600">Title is required (max 150 characters).</p>
              )}
              <p className="text-[11px] text-[var(--color-muted)]">{(form.training_title || '').length}/150</p>
            </div>

            {/* Employee */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Employee{reqMark}</label>
              <select value={form.employee_id || ''} onChange={e => setField('employee_id', e.target.value)} className={inputCls}>
                <option value="">— Select Employee —</option>
                {employees.map(emp => (
                  <option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                    {emp.first_name} {emp.last_name} {emp.entity ? `(${emp.entity})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Provider */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Provider / Institution</label>
              <input
                type="text"
                value={form.provider || ''}
                onChange={e => setField('provider', e.target.value)}
                maxLength={150}
                placeholder="e.g. Udemy, Internal HR"
                className={inputCls}
              />
              {form.provider && !providerValid && (
                <p className="text-[11px] text-rose-600">Max 150 characters.</p>
              )}
            </div>

            {/* Date and Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Training Date{reqMark}</label>
                <input
                  type="date"
                  value={form.training_date || ''}
                  onChange={e => setField('training_date', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Duration (hours){reqMark}</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="1000"
                  value={form.duration_hours || ''}
                  onChange={e => setField('duration_hours', e.target.value)}
                  placeholder="e.g. 8"
                  className={inputCls}
                />
                {form.duration_hours && !durationValid && (
                  <p className="text-[11px] text-rose-600">Must be between 0.5 and 1000 hours.</p>
                )}
              </div>
            </div>

            {/* Training Type and Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Training Type{reqMark}</label>
                <select value={form.training_type || ''} onChange={e => setField('training_type', e.target.value)} className={inputCls}>
                  <option value="">— Select Type —</option>
                  {TRAINING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Status{reqMark}</label>
                <select value={form.status || ''} onChange={e => setField('status', e.target.value)} className={inputCls}>
                  <option value="">— Select Status —</option>
                  {TRAINING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Certificate Upload */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Certificate File</label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] cursor-pointer hover:border-[var(--color-primary)] transition-colors w-full">
                  <Upload size={14} className="text-[var(--color-muted-fg)]" />
                  <span className="text-sm text-[var(--color-muted-fg)]">
                    {selectedFile ? selectedFile.name : 'Choose file…'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.docx"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-[11px] text-[var(--color-muted)]">Accepted: PDF, JPG, PNG, DOCX. Max 10MB.</p>
              {fileError && <p className="text-[11px] text-rose-600">{fileError}</p>}
              {editRecord?.certificate_path && !selectedFile && (
                <p className="text-[11px] text-[var(--color-muted)]">Current: {editRecord.certificate_path}</p>
              )}
            </div>

            {/* Entity (auto-populated if filtered) */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Entity</label>
              <input
                type="text"
                value={form.entity || ''}
                onChange={e => setField('entity', e.target.value)}
                placeholder="e.g. Expedia"
                className={inputCls}
              />
            </div>

            {/* Error */}
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading || !isValid}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Plus size={14} /> {isEditing ? 'Update' : 'Add Record'}</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}


// ─── Main Training Records Component ────────────────────────────────────────
export default function TrainingRecords() {
  const [records, setRecords] = useState([])
  const [, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [employees, setEmployees] = useState([])

  // Drawer state
  const [drawer, setDrawer] = useState(false)
  const [editRecord, setEditRecord] = useState(null)

  const entityFilter = 'All'

  // Fetch training records
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'All') params.set('type', typeFilter)
      if (statusFilter !== 'All') params.set('status', statusFilter)
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      params.set('page', String(page))
      const data = await apiGet(`/hr/training?${params}`)
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
  }, [typeFilter, statusFilter, entityFilter, page])

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      const data = await apiGet(`/hr/training/metrics?${params}`)
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
  }, [typeFilter, statusFilter, entityFilter])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function openAdd() {
    setEditRecord(null)
    setDrawer(true)
  }

  function openEdit(record) {
    setEditRecord(record)
    setDrawer(true)
  }

  async function handleSaved() {
    await fetchRecords()
    await fetchMetrics()
  }

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">

      {/* Filters and Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Type filter */}
        <div className="flex gap-1.5">
          {['All', ...TRAINING_TYPES].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                typeFilter === t
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
        >
          <option value="All">All Statuses</option>
          {TRAINING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="flex-1" />
        <Button size="md" onClick={openAdd}>
          <Plus size={14} /> Add Training Record
        </Button>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Training Title</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Employee Name</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Provider</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Duration</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Certificate</th>
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
                  No training records found.
                </td>
              </tr>
            ) : (
              records.map(rec => (
                <tr key={rec.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors">
                  <td className="px-3 py-2.5 text-sm font-medium text-[var(--color-text)]">{rec.training_title || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">
                    {rec.employee_name || `${rec.first_name || ''} ${rec.last_name || ''}`.trim() || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{rec.provider || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">
                    {rec.training_date ? new Date(rec.training_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">
                    {rec.duration_hours != null ? `${rec.duration_hours}h` : '—'}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={rec.status} /></td>
                  <td className="px-3 py-2.5">
                    {rec.certificate_path ? (
                      <a
                        href={rec.certificate_path.startsWith('http') ? rec.certificate_path : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline text-xs"
                        title="View certificate"
                      >
                        <FileText size={13} />
                        <span>View</span>
                      </a>
                    ) : (
                      <span className="text-xs text-[var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => openEdit(rec)}
                      className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"
                      title="Edit training record"
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
          <span className="text-xs text-[var(--color-muted-fg)]">{page} / {totalPages}</span>
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
      <TrainingDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        onSaved={handleSaved}
        entityFilter={entityFilter}
        employees={employees}
        editRecord={editRecord}
      />
    </div>
  )
}



