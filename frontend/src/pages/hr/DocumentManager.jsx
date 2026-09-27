import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { Upload, Trash2, FileText, Loader2, X, AlertTriangle } from 'lucide-react'

const BASE = import.meta.env.VITE_API_URL

function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { Authorization: `Bearer ${t}` }
}

// ─── Constants ──────────────────────────────────────────────────────────────
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ALLOWED_EXTENSIONS = ['PDF', 'JPG', 'PNG', 'DOCX']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const DOCUMENT_TYPES = [
  'Resume/CV',
  'Contract',
  'NBI Clearance',
  'Medical Certificate',
  'Government IDs',
  'Diploma/Transcript',
  'Certificate of Employment',
  'Other',
]

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Accepted formats: ${ALLOWED_EXTENSIONS.join(', ')}`
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Maximum file size is 10MB'
  }
  return null
}

// ─── Confirm Dialog ─────────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, onConfirm, onCancel, loading }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
            <p className="text-xs text-[var(--color-muted-fg)] mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Document Manager Component ─────────────────────────────────────────────
export default function DocumentManager({ employeeId, open, onClose }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // File upload state
  const [selectedFile, setSelectedFile] = useState(null)
  const [documentType, setDocumentType] = useState('')
  const [uploadError, setUploadError] = useState('')

  // ─── Fetch Documents ────────────────────────────────────────────────────────
  const fetchDocuments = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/hr/201/${employeeId}/documents`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to load documents')
      const json = await res.json()
      setDocuments(json.data || [])
    } catch {
      notify.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    if (!open || !employeeId) return undefined
    const timer = setTimeout(() => { void fetchDocuments() }, 0)
    return () => clearTimeout(timer)
  }, [open, employeeId, fetchDocuments])

  // Reset form state when modal opens
  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      setSelectedFile(null)
      setDocumentType('')
      setUploadError('')
    }, 0)
    return () => clearTimeout(timer)
  }, [open])

  // ─── File Selection Handler ─────────────────────────────────────────────────
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

  // ─── Upload Handler ─────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!selectedFile) {
      setUploadError('Please select a file')
      return
    }
    if (!documentType) {
      setUploadError('Please select a document type')
      return
    }

    setUploading(true)
    setUploadError('')

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('document_type', documentType)

    try {
      const res = await fetch(`${BASE}/hr/201/${employeeId}/documents`, {
        method: 'POST',
        headers: authHeaders(),
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
      // Reset file input
      const fileInput = document.getElementById('doc-file-input')
      if (fileInput) fileInput.value = ''
      await fetchDocuments()
    } catch (err) {
      notify.error(err.message || 'Upload failed. Please try again.')
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // ─── Delete Handler ─────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteConfirm) return
    setDeleting(true)

    try {
      const res = await fetch(
        `${BASE}/hr/201/${employeeId}/documents/${deleteConfirm.id}`,
        { method: 'DELETE', headers: authHeaders() }
      )

      if (!res.ok && res.status !== 204) {
        throw new Error('Failed to delete document')
      }

      notify.success('Document deleted successfully')
      setDeleteConfirm(null)
      await fetchDocuments()
    } catch (err) {
      notify.error(err.message || 'Failed to delete document')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (!open) return null

  const inputCls =
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[560px] max-w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Document Manager</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">
              Manage 201 file documents
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Upload Section */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
            <p className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide">
              Upload Document
            </p>

            <div className="space-y-3">
              {/* Document Type */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">
                  Document Type <span className="text-[var(--color-danger)] ml-0.5">*</span>
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select type...</option>
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* File Input */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">
                  File <span className="text-[var(--color-danger)] ml-0.5">*</span>
                </label>
                <input
                  id="doc-file-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.docx"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-[var(--color-muted-fg)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[var(--color-border)] file:text-xs file:font-medium file:bg-[var(--color-surface)] file:text-[var(--color-text)] hover:file:bg-[var(--color-surface-2)] cursor-pointer"
                />
                <p className="text-[11px] text-[var(--color-muted)]">
                  Max 10MB. Accepted: PDF, JPG, PNG, DOCX
                </p>
              </div>

              {/* Selected File Info */}
              {selectedFile && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
                  <FileText size={14} />
                  <span className="truncate">{selectedFile.name}</span>
                  <span className="ml-auto text-[11px] text-blue-500">
                    {formatFileSize(selectedFile.size)}
                  </span>
                </div>
              )}

              {/* Upload Error */}
              {uploadError && (
                <p className="text-xs text-[var(--color-danger)]">{uploadError}</p>
              )}

              {/* Upload Button */}
              <Button
                size="sm"
                onClick={handleUpload}
                disabled={uploading || !selectedFile || !documentType}
                className="w-full"
              >
                {uploading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                {uploading ? 'Uploading...' : 'Upload Document'}
              </Button>
            </div>
          </div>

          {/* Documents List */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide">
              Documents ({documents.length})
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-[var(--color-muted-fg)]" />
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText size={32} className="text-[var(--color-muted)] mb-2" />
                <p className="text-sm text-[var(--color-muted-fg)]">No documents uploaded</p>
                <p className="text-[11px] text-[var(--color-muted)]">
                  Upload a document using the form above
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                      <FileText size={14} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--color-text)] truncate">
                        {doc.filename}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-[var(--color-muted-fg)]">
                          {doc.document_type}
                        </span>
                        <span className="text-[11px] text-[var(--color-muted)]">•</span>
                        <span className="text-[11px] text-[var(--color-muted)]">
                          {formatFileSize(doc.file_size)}
                        </span>
                        <span className="text-[11px] text-[var(--color-muted)]">•</span>
                        <span className="text-[11px] text-[var(--color-muted)]">
                          {formatDate(doc.uploaded_at)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDeleteConfirm(doc)}
                      className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-[var(--color-muted-fg)] hover:text-red-600 transition-colors shrink-0"
                      title="Delete document"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Document"
        message={`Are you sure you want to delete "${deleteConfirm?.filename}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        loading={deleting}
      />
    </>
  )
}



