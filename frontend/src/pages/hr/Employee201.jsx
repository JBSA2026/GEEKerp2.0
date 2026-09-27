import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { notify } from '@/utils/toast'
import { Search, UserPlus, Pencil, Loader2, X, Upload, FileText, Save, Users, Trash2, AlertTriangle } from 'lucide-react'

const BASE = import.meta.env.VITE_API_URL

// API helpers
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

async function requestError(res, fallback = 'Request failed') {
  const payload = await res.json().catch(() => null)
  const detail = payload?.detail
  const message =
    payload?.error ||
    (typeof detail === 'string' ? detail : detail?.error) ||
    fallback
  const err = new Error(message)
  err.fields = payload?.fields || detail?.fields || {}
  return err
}

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw await requestError(res)
  return res.json()
}

async function apiPost(path, body) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  } catch (e) {
    throw new Error('Network error: unable to reach the server. Please check if the backend is running.', { cause: e })
  }
  if (!res.ok) throw await requestError(res, 'Unable to create employee')
  return res.json()
}

async function apiPatch(path, body) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  } catch (e) {
    throw new Error('Network error: unable to reach the server. Please check if the backend is running.', { cause: e })
  }
  if (!res.ok) throw await requestError(res, 'Unable to update employee')
  return res.json()
}

// Constants
const EMPLOYMENT_STATUSES = ['Active', 'Resigned', 'Terminated', 'On Leave', 'Probationary']
const ENTITIES = ['Expedia', 'GreatnessLab', 'Exigent', 'KSI']

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// Document upload constants
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ALLOWED_EXTENSIONS = ['PDF', 'JPG', 'PNG', 'DOCX']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const DOCUMENT_TYPES = [
  'Resume/CV', 'Contract', 'NBI Clearance', 'Medical Certificate',
  'Government IDs', 'Diploma/Transcript', 'Certificate of Employment', 'Other',
]

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDocDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return `Accepted formats: ${ALLOWED_EXTENSIONS.join(', ')}`
  if (file.size > MAX_FILE_SIZE) return 'Maximum file size is 10MB'
  return null
}

function emptyEmployeeForm(entityFilter) {
  return {
    first_name: '',
    last_name: '',
    email: '',
    department: '',
    position: '',
    entity: entityFilter && entityFilter !== 'All' ? entityFilter : 'Expedia',
    employment_status: 'Active',
    date_hired: '',
    salary: '',
    sss_number: '',
    philhealth_number: '',
    pagibig_number: '',
    tin_number: '',
    emergency_contact_name: '',
    emergency_contact_number: '',
    supervisor_id: '',
    address: '',
  }
}

function normalizeEmployeeForm(employee, entityFilter) {
  if (!employee) return emptyEmployeeForm(entityFilter)
  return {
    first_name: employee.first_name || '',
    last_name: employee.last_name || '',
    email: employee.email || '',
    department: employee.department || '',
    position: employee.position || '',
    entity: employee.entity || (entityFilter && entityFilter !== 'All' ? entityFilter : 'Expedia'),
    employment_status: employee.employment_status || 'Active',
    date_hired: employee.date_hired || '',
    salary: employee.salary ?? '',
    sss_number: employee.sss_number || '',
    philhealth_number: employee.philhealth_number || '',
    pagibig_number: employee.pagibig_number || '',
    tin_number: employee.tin_number || '',
    emergency_contact_name: employee.emergency_contact_name || '',
    emergency_contact_number: employee.emergency_contact_number || '',
    supervisor_id: employee.supervisor_id || '',
    address: employee.address || '',
  }
}

function cleanEmployeePayload(form) {
  const optionalTextFields = [
    'sss_number',
    'philhealth_number',
    'pagibig_number',
    'tin_number',
    'emergency_contact_name',
    'emergency_contact_number',
    'address',
  ]
  const payload = {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    email: form.email.trim(),
    department: form.department.trim(),
    position: form.position.trim(),
    entity: form.entity,
    employment_status: form.employment_status,
    date_hired: form.date_hired,
    salary: form.salary === '' || form.salary === null ? null : Number(form.salary),
    supervisor_id: form.supervisor_id ? Number(form.supervisor_id) : null,
  }
  optionalTextFields.forEach((field) => {
    payload[field] = form[field]?.trim() || null
  })
  return payload
}

// ─── Government ID formatting helpers ────────────────────────────────────────
// SSS: DD-DDDDDDD-D
function formatSSS(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 2) return digits
  if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return `${digits.slice(0, 2)}-${digits.slice(2, 9)}-${digits.slice(9)}`
}

// PhilHealth: DD-DDDDDDDDD-D
function formatPhilHealth(value) {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  if (digits.length <= 2) return digits
  if (digits.length <= 11) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return `${digits.slice(0, 2)}-${digits.slice(2, 11)}-${digits.slice(11)}`
}

// Pag-IBIG: DDDD-DDDD-DDDD
function formatPagIBIG(value) {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  if (digits.length <= 4) return digits
  if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`
}

// TIN: DDD-DDD-DDD-DDD
function formatTIN(value) {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`
}

function validateSSS(value) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length > 0 && digits.length !== 10) return 'Invalid SSS format. Expected: DD-DDDDDDD-D'
  return null
}

function validatePhilHealth(value) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length > 0 && digits.length !== 12) return 'Invalid PhilHealth format. Expected: DD-DDDDDDDDD-D'
  return null
}

function validatePagIBIG(value) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length > 0 && digits.length !== 12) return 'Invalid Pag-IBIG format. Expected: DDDD-DDDD-DDDD'
  return null
}

function validateTIN(value) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length > 0 && digits.length !== 12) return 'Invalid TIN format. Expected: DDD-DDD-DDD-DDD'
  return null
}

// StatusBadge is now imported from '@/components/ui/status-badge'

function Field({ label, required, error, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[var(--color-muted-fg)]">
        {label}{required ? reqMark : null}
      </label>
      {children}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  )
}

function EmployeeDrawer({ open, employee, employees, entityFilter, onClose, onSaved }) {
  const [form, setForm] = useState(() => emptyEmployeeForm(entityFilter))
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const isEdit = Boolean(employee)

  // Document state (edit mode only)
  const [documents, setDocuments] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [documentType, setDocumentType] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      setForm(normalizeEmployeeForm(employee, entityFilter))
      setErrors({})
      setSelectedFile(null)
      setDocumentType('')
      setUploadError('')
      setDeleteConfirm(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open, employee, entityFilter])

  // Fetch documents when editing
  const fetchDocuments = useCallback(async () => {
    if (!employee?.employee_id) return
    setDocsLoading(true)
    try {
      const res = await fetch(`${BASE}/hr/201/${employee.employee_id}/documents`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      })
      if (!res.ok) throw new Error('Failed to load documents')
      const json = await res.json()
      setDocuments(json.data || [])
    } catch {
      setDocuments([])
    } finally {
      setDocsLoading(false)
    }
  }, [employee])

  useEffect(() => {
    if (!open || !isEdit) return undefined
    const timer = setTimeout(() => { void fetchDocuments() }, 0)
    return () => clearTimeout(timer)
  }, [open, isEdit, fetchDocuments])

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: null }))
  }

  function validate() {
    const next = {}
    if (!form.first_name.trim()) next.first_name = 'First name is required'
    if (!form.last_name.trim()) next.last_name = 'Last name is required'
    if (!form.email.trim()) next.email = 'Email is required'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email'
    if (!form.department.trim()) next.department = 'Department is required'
    if (!form.position.trim()) next.position = 'Position is required'
    if (!form.entity) next.entity = 'Entity is required'
    if (!form.employment_status) next.employment_status = 'Status is required'
    if (!form.date_hired) next.date_hired = 'Date hired is required'
    if (form.salary !== '' && Number.isNaN(Number(form.salary))) next.salary = 'Salary must be a number'
    const sssErr = validateSSS(form.sss_number)
    if (sssErr) next.sss_number = sssErr
    const philErr = validatePhilHealth(form.philhealth_number)
    if (philErr) next.philhealth_number = philErr
    const pagErr = validatePagIBIG(form.pagibig_number)
    if (pagErr) next.pagibig_number = pagErr
    const tinErr = validateTIN(form.tin_number)
    if (tinErr) next.tin_number = tinErr
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const payload = cleanEmployeePayload(form)
      if (isEdit) {
        await apiPatch(`/hr/201/${employee.employee_id}`, payload)
        notify.success('Employee updated successfully.')
      } else {
        await apiPost('/hr/201', payload)
        notify.success('Employee added successfully.')
      }
      await onSaved()
      onClose()
    } catch (err) {
      setErrors(err.fields || {})
      notify.error(err.message || 'Unable to save employee.')
    } finally {
      setLoading(false)
    }
  }

  // Document handlers
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const error = validateFile(file)
    if (error) {
      setUploadError(error)
      setSelectedFile(null)
      e.target.value = ''
      return
    }
    setUploadError('')
    setSelectedFile(file)
  }

  async function handleUpload() {
    if (!selectedFile) { setUploadError('Please select a file'); return }
    if (!documentType) { setUploadError('Please select a document type'); return }
    setUploading(true)
    setUploadError('')
    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('document_type', documentType)
    try {
      const res = await fetch(`${BASE}/hr/201/${employee.employee_id}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail?.error || err.error || 'Upload failed')
      }
      notify.success('Document uploaded successfully')
      setSelectedFile(null)
      setDocumentType('')
      setUploadError('')
      const fileInput = document.getElementById('drawer-doc-file-input')
      if (fileInput) fileInput.value = ''
      await fetchDocuments()
    } catch (err) {
      notify.error(err.message || 'Upload failed')
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteDoc() {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      const res = await fetch(`${BASE}/hr/201/${employee.employee_id}/documents/${deleteConfirm.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      })
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete document')
      notify.success('Document deleted')
      setDeleteConfirm(null)
      await fetchDocuments()
    } catch (err) {
      notify.error(err.message || 'Failed to delete document')
    } finally {
      setDeleting(false)
    }
  }

  if (!open) return null

  const supervisorOptions = employees.filter(item => item.employee_id !== employee?.employee_id)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[680px] max-w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">{isEdit ? 'Edit Employee' : 'Add Employee'}</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">{isEdit ? 'Update the employee 201 profile' : 'Create an employee and 201 record'}</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)]">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="First Name" required error={errors.first_name}>
              <input value={form.first_name} onChange={e => setField('first_name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Last Name" required error={errors.last_name}>
              <input value={form.last_name} onChange={e => setField('last_name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email" required error={errors.email}>
              <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Date Hired" required error={errors.date_hired}>
              <input type="date" value={form.date_hired || ''} onChange={e => setField('date_hired', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Department" required error={errors.department}>
              <input value={form.department} onChange={e => setField('department', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Position" required error={errors.position}>
              <input value={form.position} onChange={e => setField('position', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Entity" required error={errors.entity}>
              <select value={form.entity} onChange={e => setField('entity', e.target.value)} className={inputCls}>
                {ENTITIES.map(entity => <option key={entity} value={entity}>{entity}</option>)}
              </select>
            </Field>
            <Field label="Employment Status" required error={errors.employment_status}>
              <select value={form.employment_status} onChange={e => setField('employment_status', e.target.value)} className={inputCls}>
                {EMPLOYMENT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </Field>
            <Field label="Salary" error={errors.salary}>
              <input type="number" min="0" step="0.01" value={form.salary} onChange={e => setField('salary', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Supervisor" error={errors.supervisor_id}>
              <select value={form.supervisor_id} onChange={e => setField('supervisor_id', e.target.value)} className={inputCls}>
                <option value="">None</option>
                {supervisorOptions.map(item => (
                  <option key={item.employee_id} value={item.employee_id}>
                    {item.first_name} {item.last_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="SSS Number" error={errors.sss_number}>
              <input value={form.sss_number} onChange={e => setField('sss_number', formatSSS(e.target.value))} placeholder="DD-DDDDDDD-D" className={inputCls} />
            </Field>
            <Field label="PhilHealth Number" error={errors.philhealth_number}>
              <input value={form.philhealth_number} onChange={e => setField('philhealth_number', formatPhilHealth(e.target.value))} placeholder="DD-DDDDDDDDD-D" className={inputCls} />
            </Field>
            <Field label="Pag-IBIG Number" error={errors.pagibig_number}>
              <input value={form.pagibig_number} onChange={e => setField('pagibig_number', formatPagIBIG(e.target.value))} placeholder="DDDD-DDDD-DDDD" className={inputCls} />
            </Field>
            <Field label="TIN Number" error={errors.tin_number}>
              <input value={form.tin_number} onChange={e => setField('tin_number', formatTIN(e.target.value))} placeholder="DDD-DDD-DDD-DDD" className={inputCls} />
            </Field>
            <Field label="Emergency Contact" error={errors.emergency_contact_name}>
              <input value={form.emergency_contact_name} onChange={e => setField('emergency_contact_name', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Emergency Number" error={errors.emergency_contact_number}>
              <input value={form.emergency_contact_number} onChange={e => setField('emergency_contact_number', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Address" error={errors.address}>
            <textarea value={form.address} onChange={e => setField('address', e.target.value)} rows={3} className={inputCls} />
          </Field>

          {/* Documents section — only in edit mode */}
          {isEdit && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
              <p className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide flex items-center gap-2">
                <FileText size={14} /> Documents
              </p>

              {/* Upload area */}
              <div className="space-y-3 rounded-lg border border-dashed border-[var(--color-border)] p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[var(--color-muted-fg)]">Document Type</label>
                    <select value={documentType} onChange={e => setDocumentType(e.target.value)} className={inputCls}>
                      <option value="">Select type...</option>
                      {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[var(--color-muted-fg)]">File</label>
                    <input
                      id="drawer-doc-file-input"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.docx"
                      onChange={handleFileChange}
                      className="block w-full text-xs text-[var(--color-muted-fg)] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[var(--color-border)] file:text-xs file:font-medium file:bg-[var(--color-surface)] file:text-[var(--color-text)] hover:file:bg-[var(--color-surface-2)] cursor-pointer"
                    />
                  </div>
                </div>
                {selectedFile && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
                    <FileText size={13} />
                    <span className="truncate">{selectedFile.name}</span>
                    <span className="ml-auto text-[11px] text-blue-500">{formatFileSize(selectedFile.size)}</span>
                  </div>
                )}
                {uploadError && <p className="text-xs text-[var(--color-danger)]">{uploadError}</p>}
                <Button type="button" size="sm" onClick={handleUpload} disabled={uploading || !selectedFile || !documentType}>
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {uploading ? 'Uploading...' : 'Upload'}
                </Button>
                <p className="text-[11px] text-[var(--color-muted)]">Max 10MB. Accepted: PDF, JPG, PNG, DOCX</p>
              </div>

              {/* Document list */}
              {docsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={16} className="animate-spin text-[var(--color-muted-fg)]" />
                </div>
              ) : documents.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)] text-center py-3">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                      <FileText size={13} className="text-blue-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--color-text)] truncate">{doc.filename}</p>
                        <p className="text-[11px] text-[var(--color-muted)]">{doc.document_type} · {formatFileSize(doc.file_size)} · {formatDocDate(doc.uploaded_at)}</p>
                      </div>
                      <button type="button" onClick={() => setDeleteConfirm(doc)} className="p-1 rounded hover:bg-red-50 text-[var(--color-muted-fg)] hover:text-red-600 shrink-0" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="button" size="md" onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Save Changes' : 'Add Employee'}
          </Button>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Delete Document</h3>
                <p className="text-xs text-[var(--color-muted-fg)] mt-1">Are you sure you want to delete "{deleteConfirm.filename}"? This cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancel</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteDoc} disabled={deleting}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : null}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function EmployeePicker({ open, employees, loading, onClose, onSelect }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => setQuery(''), 0)
    return () => clearTimeout(timer)
  }, [open])

  if (!open) return null

  const filtered = employees.filter((employee) => {
    const text = `${employee.employee_id} ${employee.first_name} ${employee.last_name} ${employee.department} ${employee.position}`.toLowerCase()
    return text.includes(query.trim().toLowerCase())
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl mx-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Choose Employee to Edit</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Select a row to continue.</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)]">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search employees..." className={`${inputCls} pl-9`} />
          </div>
          <div className="max-h-[420px] overflow-y-auto rounded-lg border border-[var(--color-border)]">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-sm text-[var(--color-muted)]">
                <Loader2 size={18} className="mr-2 animate-spin" /> Loading employees...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Users size={28} className="mb-2 text-[var(--color-muted)]" />
                <p className="text-sm text-[var(--color-muted-fg)]">No employees found.</p>
              </div>
            ) : (
              filtered.map(employee => (
                <button
                  key={employee.employee_id}
                  type="button"
                  onClick={() => onSelect(employee)}
                  className="flex w-full items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left last:border-0 hover:bg-[var(--color-surface-2)]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-xs font-semibold text-[var(--color-muted-fg)]">
                    {employee.employee_id}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">{employee.first_name} {employee.last_name}</p>
                    <p className="truncate text-xs text-[var(--color-muted-fg)]">{employee.position || 'No position'} · {employee.department || 'No department'}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted-fg)]">
                    <Pencil size={13} />
                    Edit
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Employee201() {
  const [employees, setEmployees] = useState([])
  const [, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [entityFilter] = useState('All')
  const [employeeDrawer, setEmployeeDrawer] = useState({ open: false, employee: null })
  const [pickerMode, setPickerMode] = useState(null)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search?.trim()) params.set('search', search)
      if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter)
      if (entityFilter && entityFilter !== 'All') params.set('entity', entityFilter)
      params.set('page_size', '100')
      const data = await apiGet(`/hr/201?${params}`)
      if (Array.isArray(data)) {
        setEmployees(data)
        setTotal(data.length)
      } else {
        const rows = data.items || data.data || []
        setEmployees(rows)
        setTotal(data.total || data.count || rows.length)
      }
    } catch {
      setEmployees([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, entityFilter])

  const fetchMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (entityFilter && entityFilter !== 'All') params.set('entity', entityFilter)
      const data = await apiGet(`/hr/201/metrics?${params}`)
      setMetrics(data || {})
    } catch {
      setMetrics({})
    }
  }, [entityFilter])

  const refreshEmployees = useCallback(async () => {
    await fetchEmployees()
    await fetchMetrics()
  }, [fetchEmployees, fetchMetrics])

  const openAddEmployee = useCallback(() => {
    setEmployeeDrawer({ open: true, employee: null })
  }, [])

  const openEditEmployee = useCallback((employee) => {
    setPickerMode(null)
    setEmployeeDrawer({ open: true, employee })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchEmployees()
      void fetchMetrics()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchEmployees, fetchMetrics])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  function handleStatusChange(e) {
    setStatusFilter(e.target.value)
  }

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name, ID, department, position..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-2 text-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={handleStatusChange}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
        >
          <option value="All">All Statuses</option>
          {EMPLOYMENT_STATUSES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <Button size="md" onClick={openAddEmployee}>
          <UserPlus size={14} /> Add Employee
        </Button>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Employee ID</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Name</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Department</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Position</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Entity</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Date Hired</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">
                  <Loader2 size={18} className="inline animate-spin mr-2" />Loading...
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">
                  No employees found.
                </td>
              </tr>
            ) : (
              employees.map(emp => (
                <tr key={emp.employee_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors">
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] font-mono">{emp.employee_id}</td>
                  <td className="px-3 py-2.5">
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {emp.first_name} {emp.last_name}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)]">{emp.email}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{emp.department || '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{emp.position || '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{emp.entity || '-'}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={emp.employment_status} /></td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">
                    {emp.date_hired
                      ? new Date(emp.date_hired).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEditEmployee(emp)}
                        className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]"
                        title="Edit employee"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        {total} employee{total !== 1 ? 's' : ''}{statusFilter && statusFilter !== 'All' ? ` (${statusFilter})` : ''}
      </p>

      <EmployeeDrawer
        open={employeeDrawer.open}
        employee={employeeDrawer.employee}
        employees={employees}
        entityFilter={entityFilter}
        onClose={() => setEmployeeDrawer({ open: false, employee: null })}
        onSaved={refreshEmployees}
      />

      <EmployeePicker
        open={Boolean(pickerMode)}
        mode={pickerMode}
        employees={employees}
        loading={loading}
        onClose={() => setPickerMode(null)}
        onSelect={openEditEmployee}
      />
    </div>
  )
}



