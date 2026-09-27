import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import {
  Search, Loader2, X, Pencil, Download, History, Archive,
  ArchiveRestore, Upload, Link2, AlertTriangle, FileDown, Shield, Building2, ChevronDown,
} from 'lucide-react'
import glabLogo from '@/assets/company-logos/GLab.png'
import expediaLogo from '@/assets/company-logos/Expedia.png'
import exigentLogo from '@/assets/company-logos/exigent.png'
import ksiLogo from '@/assets/company-logos/KSI.png'

const BASE = import.meta.env.VITE_API_URL
const RESOURCE = '/document-management'

// ─── Constants ──────────────────────────────────────────────────────────────
const DOCUMENT_TYPES = [
  'Quotations', 'Contracts', 'POs', 'Invoices', 'ORs',
  'Tax Documents', 'HR Files', 'NDA', 'Project Documents',
]
const STATUSES = ['Draft', 'Active', 'Archived']

// GEEK Group companies. `value` matches the entity codes stored in the DB
// (shared with the HR module); `label`/`logo` are for display only.
const ENTITIES = [
  { value: 'GreatnessLab', label: 'GreatnessLab', logo: glabLogo },
  { value: 'Expedia', label: 'Expedia', logo: expediaLogo },
  { value: 'Exigent', label: 'Exigent', logo: exigentLogo },
  { value: 'KSI', label: 'Kyrios Solutions Inc.', logo: ksiLogo },
]
const ENTITY_MAP = Object.fromEntries(ENTITIES.map(e => [e.value, e]))
const RELATED_MODULES = [
  'CRM / Sales', 'Quotation', 'Purchasing', 'Inventory', 'Projects',
  'HR Management', 'Accounts Receivable', 'Accounts Payable',
  'General Ledger', 'Tax Management', 'Administration', 'Other',
]
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx', '.csv']
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

function ToolbarDropdown({ value, onChange, options, labelFn, width = 'w-[150px]' }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
  }, [open])

  return (
    <div className={`relative ${width}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
      >
        <span className="truncate">{labelFn(value)}</span>
        <ChevronDown size={12} className={`text-[var(--color-muted-fg)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <ul
            className="fixed rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-[9999] max-h-[240px] overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {options.map(opt => (
              <li key={typeof opt === 'object' ? opt.value : opt}>
                <button
                  type="button"
                  onClick={() => { onChange(typeof opt === 'object' ? opt.value : opt); setOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs whitespace-nowrap text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  {labelFn(typeof opt === 'object' ? opt.value : opt)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// ─── API helpers ────────────────────────────────────────────────────────────
function jsonHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}
function fileHeaders() {
  const t = localStorage.getItem('access_token')
  return { ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}
async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: jsonHeaders() })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
  return res.json()
}
async function apiSend(path, method, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: jsonHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data.detail
    const msg = (detail && (detail.error || detail)) || data.error || 'Request failed'
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
  return data
}
async function apiUpload(path, formData) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: fileHeaders(), body: formData })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data.detail
    const msg = (detail && (detail.error || detail)) || data.error || 'Upload failed'
    throw new Error(typeof msg === 'string' ? msg : 'Upload failed')
  }
  return data
}

// ─── Formatting helpers ─────────────────────────────────────────────────────
function formatFileSize(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
function formatDate(dateStr, withTime = false) {
  if (!dateStr) return '—'
  const opts = { year: 'numeric', month: 'short', day: 'numeric' }
  if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit' }
  return new Date(dateStr).toLocaleDateString('en-US', opts)
}
function validateFile(file) {
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) return `Accepted formats: ${ALLOWED_EXTENSIONS.join(', ')}`
  if (file.size > MAX_FILE_SIZE) return 'Maximum file size is 25MB'
  return null
}

// ─── Shared UI atoms ────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

function MetricCard({ label, value, color }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wide">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', color || 'text-[var(--color-text)]')}>{value ?? '—'}</p>
    </div>
  )
}

function StatusBadge({ status }) {
  const s = (status || '').toLowerCase()
  const cls =
    s === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : s === 'draft' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : s === 'archived' ? 'bg-slate-100 text-slate-600 border-slate-200'
    : 'bg-slate-100 text-slate-600 border-slate-200'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium capitalize border ${cls}`}>{status || '—'}</span>
}

function TypeBadge({ type }) {
  return <span className="inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium border bg-[#e9eef8] text-[#2c3a61] border-[#cbd8ea]">{type || '—'}</span>
}

function CompanyBadge({ entity }) {
  const e = ENTITY_MAP[entity]
  if (!e) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border bg-slate-100 text-slate-500 border-slate-200">
        <Building2 size={11} /> Unassigned
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-0.5 text-[11px] font-medium border bg-white text-[var(--color-text)] border-[var(--color-border)]" title={e.label}>
      <img src={e.logo} alt={e.label} className="h-4 w-4 rounded-full object-contain" />
      {e.label}
    </span>
  )
}

// ─── Confirm Dialog ─────────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, loading }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', danger ? 'bg-red-100' : 'bg-amber-100')}>
            <AlertTriangle size={20} className={danger ? 'text-red-600' : 'text-amber-600'} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
            <p className="text-xs text-[var(--color-muted-fg)] mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button
            size="sm"
            className={danger ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Upload / Create Drawer ─────────────────────────────────────────────────
function UploadDrawer({ open, onClose, onSaved }) {
  const [form, setForm] = useState({})
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      setForm({ status: 'Active' })
      setFile(null); setFileError(null); setError(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open])

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    setFileError(null); setFile(null)
    if (!f) return
    const err = validateFile(f)
    if (err) { setFileError(err); e.target.value = ''; return }
    setFile(f)
    if (!form.title) setField('title', f.name.replace(/\.[^.]+$/, ''))
  }

  const isValid = Boolean(file && !fileError && form.title?.trim() && form.document_type && form.entity)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', form.title.trim())
      fd.append('document_type', form.document_type)
      fd.append('entity', form.entity)
      if (form.related_module) fd.append('related_module', form.related_module)
      if (form.related_transaction) fd.append('related_transaction', form.related_transaction.trim())
      fd.append('status', form.status || 'Active')
      if (form.description) fd.append('description', form.description.trim())
      await apiUpload(RESOURCE, fd)
      notify.success('Document uploaded successfully.')
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
      notify.error(err.message || 'Upload failed.')
    } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[520px] max-w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Upload Document</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Add a new document to the repository</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* File */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">File{reqMark}</label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] cursor-pointer hover:border-[var(--color-primary)] transition-colors">
                <Upload size={14} className="text-[var(--color-muted-fg)]" />
                <span className="text-sm text-[var(--color-muted-fg)] truncate">{file ? file.name : 'Choose file…'}</span>
                {file && <span className="ml-auto text-[11px] text-[var(--color-muted)]">{formatFileSize(file.size)}</span>}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv" onChange={handleFileChange} className="hidden" />
              </label>
              <p className="text-[11px] text-[var(--color-muted)]">Accepted: PDF, JPG, PNG, DOCX, XLSX, CSV. Max 25MB.</p>
              {fileError && <p className="text-[11px] text-rose-600">{fileError}</p>}
            </div>
            {/* Title */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Document Title{reqMark}</label>
              <input type="text" value={form.title || ''} onChange={e => setField('title', e.target.value)} maxLength={200} placeholder="e.g. Service Agreement — Acme Corp" className={inputCls} />
            </div>
            {/* Company / Entity */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Company{reqMark}</label>
              <div className="flex items-center gap-2">
                {form.entity && ENTITY_MAP[form.entity] && (
                  <img src={ENTITY_MAP[form.entity].logo} alt="" className="h-8 w-8 rounded-md border border-[var(--color-border)] bg-white object-contain p-0.5 shrink-0" />
                )}
                <select value={form.entity || ''} onChange={e => setField('entity', e.target.value)} className={inputCls}>
                  <option value="">— Select Company —</option>
                  {ENTITIES.map(en => <option key={en.value} value={en.value}>{en.label}</option>)}
                </select>
              </div>
            </div>
            {/* Type + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Document Type{reqMark}</label>
                <select value={form.document_type || ''} onChange={e => setField('document_type', e.target.value)} className={inputCls}>
                  <option value="">— Select Category —</option>
                  {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Status</label>
                <select value={form.status || 'Active'} onChange={e => setField('status', e.target.value)} className={inputCls}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {/* Link to transaction */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide"><Link2 size={12} /> Link to Transaction</p>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Related Module</label>
                <select value={form.related_module || ''} onChange={e => setField('related_module', e.target.value)} className={inputCls}>
                  <option value="">— None —</option>
                  {RELATED_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Related Transaction Ref</label>
                <input type="text" value={form.related_transaction || ''} onChange={e => setField('related_transaction', e.target.value)} maxLength={100} placeholder="e.g. PO-2026-0012, QUO-2026-0034" className={inputCls} />
              </div>
            </div>
            {/* Description */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Description / Notes</label>
              <textarea value={form.description || ''} onChange={e => setField('description', e.target.value)} rows={3} placeholder="Optional notes about this document" className={inputCls} />
            </div>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading || !isValid}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <><Upload size={14} /> Upload</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Edit Metadata Drawer ───────────────────────────────────────────────────
function EditDrawer({ open, onClose, onSaved, record }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [versions, setVersions] = useState([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [uploadingVersion, setUploadingVersion] = useState(false)
  const [newVersionFile, setNewVersionFile] = useState(null)
  const [changeNote, setChangeNote] = useState('')

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!open || !record) return undefined
    const timer = setTimeout(() => {
      setForm({
        title: record.title || '',
        document_type: record.document_type || '',
        related_module: record.related_module || '',
        related_transaction: record.related_transaction || '',
        entity: record.entity || '',
        status: record.status || 'Active',
        description: record.description || '',
      })
      setError(null)
      setNewVersionFile(null)
      setChangeNote('')
      // Fetch versions
      setVersionsLoading(true)
      apiGet(`${RESOURCE}/${record.document_id}/versions`)
        .then(res => setVersions(res.data || []))
        .catch(() => setVersions([]))
        .finally(() => setVersionsLoading(false))
    }, 0)
    return () => clearTimeout(timer)
  }, [open, record])

  const isValid = Boolean(form.title?.trim() && form.document_type && form.entity)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid || !record) return
    setLoading(true); setError(null)
    try {
      await apiSend(`${RESOURCE}/${record.document_id}`, 'PATCH', {
        title: form.title.trim(),
        document_type: form.document_type,
        related_module: form.related_module || null,
        related_transaction: form.related_transaction?.trim() || null,
        entity: form.entity || null,
        status: form.status,
        description: form.description?.trim() || null,
      })
      notify.success('Document updated successfully.')
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
      notify.error(err.message || 'Update failed.')
    } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[560px] max-w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Edit Document</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">{record?.document_number}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Document Title{reqMark}</label>
              <input type="text" value={form.title || ''} onChange={e => setField('title', e.target.value)} maxLength={200} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Company{reqMark}</label>
              <div className="flex items-center gap-2">
                {form.entity && ENTITY_MAP[form.entity] && (
                  <img src={ENTITY_MAP[form.entity].logo} alt="" className="h-8 w-8 rounded-md border border-[var(--color-border)] bg-white object-contain p-0.5 shrink-0" />
                )}
                <select value={form.entity || ''} onChange={e => setField('entity', e.target.value)} className={inputCls}>
                  <option value="">— Select Company —</option>
                  {ENTITIES.map(en => <option key={en.value} value={en.value}>{en.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Document Type{reqMark}</label>
                <select value={form.document_type || ''} onChange={e => setField('document_type', e.target.value)} className={inputCls}>
                  <option value="">— Select Category —</option>
                  {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Status</label>
                <select value={form.status || 'Active'} onChange={e => setField('status', e.target.value)} className={inputCls}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide"><Link2 size={12} /> Link to Transaction</p>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Related Module</label>
                <select value={form.related_module || ''} onChange={e => setField('related_module', e.target.value)} className={inputCls}>
                  <option value="">— None —</option>
                  {RELATED_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Related Transaction Ref</label>
                <input type="text" value={form.related_transaction || ''} onChange={e => setField('related_transaction', e.target.value)} maxLength={100} className={inputCls} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Description / Notes</label>
              <textarea value={form.description || ''} onChange={e => setField('description', e.target.value)} rows={2} className={inputCls} />
            </div>

            {/* Version History */}
            {record && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide"><History size={12} /> Version History</p>
                {versionsLoading ? (
                  <div className="flex justify-center py-3"><Loader2 size={14} className="animate-spin text-[var(--color-muted-fg)]" /></div>
                ) : versions.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted)] text-center py-2">No versions found.</p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {versions.map(v => (
                      <div key={v.version_id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs">
                        <span className="font-medium text-[var(--color-text)]">v{v.version_number}</span>
                        <span className="text-[var(--color-muted-fg)] truncate flex-1">{v.filename}</span>
                        <span className="text-[var(--color-muted)] whitespace-nowrap">{v.uploaded_at ? new Date(v.uploaded_at).toLocaleDateString() : ''}</span>
                        <button type="button" onClick={() => downloadDocument(record.document_id, v.version_id)} className="p-1 rounded hover:bg-[var(--color-surface)] text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]"><Download size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Upload new version */}
                <div className="flex items-center gap-2 pt-1">
                  <label className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md border border-dashed border-[var(--color-border)] cursor-pointer hover:border-[var(--color-primary)] text-xs text-[var(--color-muted-fg)]">
                    <Upload size={12} />
                    <span className="truncate">{newVersionFile ? newVersionFile.name : 'Upload new version…'}</span>
                    <input type="file" className="hidden" onChange={e => setNewVersionFile(e.target.files?.[0] || null)} />
                  </label>
                  {newVersionFile && (
                    <Button type="button" size="sm" disabled={uploadingVersion} onClick={async () => {
                      setUploadingVersion(true)
                      try {
                        const fd = new FormData()
                        fd.append('file', newVersionFile)
                        if (changeNote) fd.append('change_note', changeNote)
                        await apiUpload(`${RESOURCE}/${record.document_id}/versions`, fd)
                        notify.success('New version uploaded.')
                        setNewVersionFile(null)
                        setChangeNote('')
                        const res = await apiGet(`${RESOURCE}/${record.document_id}/versions`)
                        setVersions(res.data || [])
                        await onSaved()
                      } catch (err) { notify.error(err.message || 'Upload failed.') }
                      finally { setUploadingVersion(false) }
                    }}>
                      {uploadingVersion ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
                    </Button>
                  )}
                </div>
              </div>
            )}

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading || !isValid}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Pencil size={14} /> Save Changes</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Download helper (opens signed URL) ─────────────────────────────────────
async function downloadDocument(documentId, versionId = null) {
  try {
    const path = versionId
      ? `${RESOURCE}/${documentId}/download?version_id=${versionId}`
      : `${RESOURCE}/${documentId}/download`
    const data = await apiGet(path)
    if (data?.url) {
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } else {
      notify.error('Could not generate download link.')
    }
  } catch (err) {
    notify.error(err.message || 'Download failed.')
  }
}

// ─── Access Denied ──────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <Shield size={48} className="mx-auto text-red-400 mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">Access Denied</h2>
        <p className="text-sm text-[var(--color-muted-fg)]">You do not have permission to access Document Management.</p>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function DocumentManagement({ user }) {
  const navigate = useNavigate()
  const [docs, setDocs] = useState([])
  const [metrics, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [moduleFilter, setModuleFilter] = useState('All')
  const [entityFilter, setEntityFilter] = useState('All')

  // Drawer / modal state
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Access gate (broad read access; falls back to logged-in users)
  const roles = user?.roles || []
  const hasAccess = roles.length === 0
    ? true
    : roles.includes('SUPER_ADMIN') || roles.includes('HR_MANAGER') || roles.some(r => typeof r === 'string')

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debounced.trim()) params.set('search', debounced.trim())
      if (typeFilter !== 'All') params.set('type', typeFilter)
      if (statusFilter !== 'All') params.set('status', statusFilter)
      if (moduleFilter !== 'All') params.set('module', moduleFilter)
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      const data = await apiGet(`${RESOURCE}?${params}`)
      setDocs(Array.isArray(data) ? data : [])
    } catch {
      setDocs([])
    } finally { setLoading(false) }
  }, [debounced, typeFilter, statusFilter, moduleFilter, entityFilter])

  const fetchMetrics = useCallback(async () => {
    try { setMetrics(await apiGet(`${RESOURCE}/metrics`)) } catch { setMetrics({}) }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchDocs()
      void fetchMetrics()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchDocs, fetchMetrics])

  async function refreshAll() {
    await fetchDocs()
    await fetchMetrics()
  }

  async function handleArchive() {
    if (!archiveTarget) return
    const restore = archiveTarget.status === 'Archived'
    setActionLoading(true)
    try {
      await apiSend(`${RESOURCE}/${archiveTarget.document_id}/archive?restore=${restore}`, 'POST')
      notify.success(restore ? 'Document restored.' : 'Document archived.')
      setArchiveTarget(null)
      await refreshAll()
    } catch (err) {
      notify.error(err.message || 'Action failed.')
    } finally { setActionLoading(false) }
  }

  function exportCsv() {
    const params = new URLSearchParams()
    if (debounced.trim()) params.set('search', debounced.trim())
    if (typeFilter !== 'All') params.set('type', typeFilter)
    if (statusFilter !== 'All') params.set('status', statusFilter)
    if (moduleFilter !== 'All') params.set('module', moduleFilter)
    if (entityFilter !== 'All') params.set('entity', entityFilter)
    const t = localStorage.getItem('access_token')
    // Token can't be sent as a header on a plain navigation; open in a fetch+blob instead.
    fetch(`${BASE}${RESOURCE}/export/csv?${params}`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'company_documents.csv'; a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => notify.error('Export failed.'))
  }

  if (!hasAccess) return <AccessDenied />

  function navigateToDoc(doc) {
    const { source_key, source_id } = doc
    // For purchasing sub-documents (PO, RFQ, GR), navigate to the parent PR detail
    if (['po', 'rfq', 'gr'].includes(source_key)) {
      const prId = doc.purchase_request_id
      if (prId) {
        navigate(`/purchasing/requests/${prId}`)
        return
      }
      // Fallback if no PR link
      navigate('/purchasing/requests')
      return
    }
    const routes = {
      quotation: `/quotation/${source_id}`,
      pr: `/purchasing/requests/${source_id}`,
      project: `/projects/${source_id}`,
      inv: `/accounts-receivable/invoices/${source_id}`,
      bill: `/accounts-payable/bills/${source_id}`,
      pv: `/accounts-payable/vouchers/${source_id}`,
      je: `/general-ledger/entries`,
      crm: `/crm/customers`,
      hr: `/hr/201`,
      company: null, // native docs — no navigation needed
    }
    const path = routes[source_key]
    if (path) navigate(path)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-3 px-6 py-3 bg-white border-b border-[var(--color-border)] lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">Document Management</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><FileDown size={14} /> Export CSV</Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}><Upload size={14} /> Upload Document</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {/* Metric cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total Documents" value={metrics.total_documents} color="text-blue-600" />
          <MetricCard label="Active" value={metrics.active_documents} color="text-emerald-600" />
          <MetricCard label="Archived" value={metrics.archived_documents} color="text-slate-500" />
          <MetricCard label="Uploaded This Month" value={metrics.uploaded_this_month} color="text-purple-600" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search number, title, transaction, owner…"
              className="w-72 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-1.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          <ToolbarDropdown
            value={typeFilter}
            onChange={setTypeFilter}
            options={['All', ...DOCUMENT_TYPES]}
            labelFn={v => v === 'All' ? 'All Categories' : v}
            width="w-[150px]"
          />
          <ToolbarDropdown
            value={entityFilter}
            onChange={setEntityFilter}
            options={['All', ...ENTITIES.map(e => e.value)]}
            labelFn={v => v === 'All' ? 'All Companies' : (ENTITY_MAP[v]?.label || v)}
            width="w-[150px]"
          />
          <ToolbarDropdown
            value={moduleFilter}
            onChange={setModuleFilter}
            options={['All', ...RELATED_MODULES]}
            labelFn={v => v === 'All' ? 'All Modules' : v}
            width="w-[150px]"
          />
          <ToolbarDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={['All', ...STATUSES]}
            labelFn={v => v === 'All' ? 'All Statuses' : v}
            width="w-[140px]"
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full border-collapse text-left" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '13%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Document #</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Title</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Company</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Type</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Related</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Owner</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Ver.</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Date</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
                <th className="px-2 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
              ) : docs.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No documents found.</td></tr>
              ) : (
                docs.map(doc => (
                  <tr key={doc.uid || doc.document_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer" onClick={() => navigateToDoc(doc)}>
                    <td className="px-3 py-2.5 text-xs font-mono text-[var(--color-muted-fg)] whitespace-nowrap overflow-hidden text-ellipsis">{doc.document_number}</td>
                    <td className="px-3 py-2.5 overflow-hidden">
                      <div className="text-sm font-medium text-[var(--color-text)] truncate" title={doc.title}>{doc.title}</div>
                      {!doc.is_native && (
                        <div className="text-[10px] text-[var(--color-muted)] flex items-center gap-1 mt-0.5">
                          <Link2 size={9} /> {doc.source}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><CompanyBadge entity={doc.entity} /></td>
                    <td className="px-3 py-2.5"><TypeBadge type={doc.document_type} /></td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] overflow-hidden">
                      {doc.related_module ? (
                        <div className="flex flex-col">
                          <span className="truncate">{doc.related_module}</span>
                          {doc.related_transaction && <span className="text-[11px] text-[var(--color-muted)] font-mono truncate">{doc.related_transaction}</span>}
                        </div>
                      ) : <span className="text-[var(--color-muted)]">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] truncate">{doc.owner_name || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">v{doc.current_version || 1}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] whitespace-nowrap">{formatDate(doc.created_at)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={doc.status} /></td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                        {doc.is_native && (
                          <button onClick={() => setEditRecord(doc)} title="Edit & Versions" className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><Pencil size={14} /></button>
                        )}
                        <button onClick={() => setArchiveTarget(doc)} title={doc.status === 'Archived' ? 'Restore' : 'Archive'} className={cn('p-1.5 rounded-md', doc.status === 'Archived' ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700' : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700')}>
                          {doc.status === 'Archived' ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-[var(--color-muted)]">{docs.length} document{docs.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Drawers & modals */}
      <UploadDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} onSaved={refreshAll} />
      <EditDrawer open={!!editRecord} record={editRecord} onClose={() => setEditRecord(null)} onSaved={refreshAll} />
      <ConfirmDialog
        open={!!archiveTarget}
        title={archiveTarget?.status === 'Archived' ? 'Restore Document' : 'Archive Document'}
        message={archiveTarget?.status === 'Archived'
          ? `Restore "${archiveTarget?.title}" to active status?`
          : `Archive "${archiveTarget?.title}"? It will be hidden from the active list but kept for records.`}
        confirmLabel={archiveTarget?.status === 'Archived' ? 'Restore' : 'Archive'}
        onConfirm={handleArchive}
        onCancel={() => setArchiveTarget(null)}
        loading={actionLoading}
      />
    </div>
  )
}



