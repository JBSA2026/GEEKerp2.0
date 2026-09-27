import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Upload, FileCheck, Clock, ZoomIn, ZoomOut, Maximize, Minimize,
  Hand, Mouse, Download, RefreshCw, AlertCircle, CheckCircle2,
  Loader2, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { notify } from '@/utils/toast'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const ZOOM_STEP = 0.15
const MIN_ZOOM = 0.3
const MAX_ZOOM = 3.0

// ─── Interactive Document Viewer ────────────────────────────────────────────

function DocumentViewer({ fileUrl, fileType }) {
  const [zoom, setZoom] = useState(1.0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPanMode, setIsPanMode] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const wrapperRef = useRef(null)
  const containerRef = useRef(null)
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  const zoomIn = () => setZoom(z => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))
  const zoomOut = () => setZoom(z => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))
  const resetZoom = () => setZoom(1.0)

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen()
    }
  }, [])

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  // Ctrl+scroll to zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault()
        if (e.deltaY < 0) zoomIn()
        else zoomOut()
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // Pan handlers
  const handlePointerDown = useCallback((e) => {
    if (!isPanMode) return
    const el = containerRef.current
    if (!el) return
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
    el.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [isPanMode])

  const handlePointerMove = useCallback((e) => {
    if (!isPanning || !isPanMode) return
    const el = containerRef.current
    if (!el) return
    el.scrollLeft = panStart.current.scrollLeft - (e.clientX - panStart.current.x)
    el.scrollTop = panStart.current.scrollTop - (e.clientY - panStart.current.y)
  }, [isPanning, isPanMode])

  const handlePointerUp = useCallback((e) => {
    if (!isPanning) return
    setIsPanning(false)
    containerRef.current?.releasePointerCapture(e.pointerId)
  }, [isPanning])

  const isPdf = fileType === 'PDF'
  const pct = Math.round(zoom * 100)

  return (
    <div ref={wrapperRef} className={cn('flex flex-col h-full', isFullscreen && 'bg-gray-900')}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-300">
        <div className="flex items-center gap-1.5">
          {/* Pan mode */}
          <button onClick={() => setIsPanMode(p => !p)}
            className={cn('p-1.5 rounded-md border transition-colors', isPanMode ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-white border-gray-300 hover:bg-gray-50')}
            title={isPanMode ? 'Switch to normal scroll' : 'Enable pan/drag mode'}>
            {isPanMode ? <Hand size={14} /> : <Mouse size={14} />}
          </button>
          <div className="w-px h-5 bg-gray-300" />
          {/* Zoom */}
          <button onClick={zoomOut} disabled={zoom <= MIN_ZOOM}
            className="p-1.5 rounded-md bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-colors" title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <button onClick={resetZoom}
            className="px-2 py-1 rounded-md bg-white border border-gray-300 hover:bg-gray-50 text-xs font-medium min-w-[48px] text-center" title="Reset zoom">
            {pct}%
          </button>
          <button onClick={zoomIn} disabled={zoom >= MAX_ZOOM}
            className="p-1.5 rounded-md bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-colors" title="Zoom in">
            <ZoomIn size={14} />
          </button>
          <div className="w-px h-5 bg-gray-300" />
          {/* Fullscreen */}
          <button onClick={toggleFullscreen}
            className="p-1.5 rounded-md bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
          {isFullscreen && (
            <button onClick={() => document.exitFullscreen()}
              className="ml-2 px-2.5 py-1 rounded-md bg-red-500 text-white text-xs font-medium hover:bg-red-600">
              Exit
            </button>
          )}
        </div>
        <a href={fileUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-gray-300 hover:bg-gray-50 text-xs font-medium transition-colors">
          <Download size={13} /> Download
        </a>
      </div>

      {/* Content area */}
      <div
        ref={containerRef}
        className={cn(
          'flex-1 overflow-auto bg-gray-200 flex items-start justify-center p-4',
          isPanMode && 'cursor-grab select-none',
          isPanning && 'cursor-grabbing'
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {isPdf ? (
          <iframe
            src={`${fileUrl}#toolbar=0`}
            title="Official BIR Form"
            style={{
              width: `${Math.round(800 * zoom)}px`,
              height: `${Math.round(1100 * zoom)}px`,
              border: 'none',
              borderRadius: '4px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
              transition: 'width 0.15s ease, height 0.15s ease',
            }}
          />
        ) : (
          <img
            src={fileUrl}
            alt="Official BIR Form"
            draggable={false}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease',
              maxWidth: 'none',
              borderRadius: '4px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Upload handled inline in DocumentSlot ──────────────────────────────────

// ─── Re-upload Modal ────────────────────────────────────────────────────────

function ReuploadModal({ onConfirm, onCancel, uploading }) {
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const fileRef = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (!allowed.includes(f.type)) {
      notify.error('Only PDF, JPG, and PNG files are accepted.')
      return
    }
    if (f.size > 15 * 1024 * 1024) {
      notify.error('File is too large. Maximum 15MB.')
      return
    }
    setFile(f)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-[440px] max-w-[90vw]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Upload New Version</h3>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <p className="text-xs text-[var(--color-muted-fg)] mb-4">
          A reason is required when replacing the official form. The previous version will be kept in history.
        </p>

        {/* Reason */}
        <label className="text-xs font-medium text-[var(--color-text)] block mb-1">Reason for re-upload *</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g., Wrong period uploaded, amended return filed..."
          rows={2}
          className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm mb-4 focus:outline-none focus:border-[var(--color-primary)] resize-none"
        />

        {/* File selection */}
        <label className="text-xs font-medium text-[var(--color-text)] block mb-1">File *</label>
        <div
          onClick={() => fileRef.current?.click()}
          className={cn(
            'flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 cursor-pointer transition-colors mb-4',
            file ? 'border-emerald-300 bg-emerald-50' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
          )}
        >
          {file ? (
            <>
              <FileCheck size={16} className="text-emerald-600" />
              <span className="text-xs text-[var(--color-text)] truncate flex-1">{file.name}</span>
              <span className="text-[10px] text-[var(--color-muted-fg)]">{(file.size / 1024).toFixed(0)} KB</span>
            </>
          ) : (
            <>
              <Upload size={16} className="text-[var(--color-muted-fg)]" />
              <span className="text-xs text-[var(--color-muted-fg)]">Click to select file (PDF, JPG, PNG)</span>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])} />

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(file, reason)}
            disabled={uploading || !file || !reason.trim()}>
            {uploading ? <Loader2 size={14} className="animate-spin mr-1" /> : <Upload size={14} className="mr-1" />}
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Version history handled inline in DocumentSlot ─────────────────────────

// ─── Main OfficialFormTab ───────────────────────────────────────────────────

export function OfficialFormTab({ formRecordId }) {
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(null) // 'FILED_FORM' | 'ACKNOWLEDGEMENT' | null
  const [filedForm, setFiledForm] = useState(null)
  const [acknowledgement, setAcknowledgement] = useState(null)
  const [filedVersions, setFiledVersions] = useState([])
  const [ackVersions, setAckVersions] = useState([])
  const [viewingDoc, setViewingDoc] = useState(null) // { fileUrl, fileType, label }
  const [showReupload, setShowReupload] = useState(null) // 'FILED_FORM' | 'ACKNOWLEDGEMENT' | null

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [currentRes, filedVer, ackVer] = await Promise.all([
        fetch(`${BASE}/tax/bir-forms/${formRecordId}/official-form`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${BASE}/tax/bir-forms/${formRecordId}/official-form/versions?file_category=FILED_FORM`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${BASE}/tax/bir-forms/${formRecordId}/official-form/versions?file_category=ACKNOWLEDGEMENT`, { headers: authHeaders() }).then(r => r.json()),
      ])
      setFiledForm(currentRes?.filed_form || null)
      setAcknowledgement(currentRes?.acknowledgement || null)
      setFiledVersions(Array.isArray(filedVer) ? filedVer : [])
      setAckVersions(Array.isArray(ackVer) ? ackVer : [])
    } catch {
      notify.error('Failed to load official form data')
    } finally {
      setLoading(false)
    }
  }, [formRecordId])

  useEffect(() => { loadData() }, [loadData])

  const handleUpload = async (file, category, reason) => {
    setUploading(category)
    try {
      const formData = new FormData()
      formData.append('file', file)
      let url = `${BASE}/tax/bir-forms/${formRecordId}/official-form?file_category=${category}`
      if (reason) url += `&reason=${encodeURIComponent(reason.trim())}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: authHeaders().Authorization },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Upload failed')
      }
      notify.success(`${category === 'FILED_FORM' ? 'Filed form' : 'Acknowledgement receipt'} uploaded successfully`)
      setViewingDoc(null)
      setShowReupload(null)
      loadData()
    } catch (err) {
      notify.error(err.message || 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    )
  }

  // If viewing a specific document in full viewer
  if (viewingDoc) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
          <p className="text-xs font-medium text-[var(--color-text)]">{viewingDoc.label}</p>
          <Button variant="outline" size="sm" onClick={() => setViewingDoc(null)} className="text-xs h-7">
            ← Back to Overview
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <DocumentViewer fileUrl={viewingDoc.fileUrl} fileType={viewingDoc.fileType} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      {/* Status indicator */}
      <div className={cn(
        'flex items-center gap-2 rounded-lg px-4 py-3 border',
        filedForm && acknowledgement
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-amber-50 border-amber-200'
      )}>
        {filedForm && acknowledgement ? (
          <>
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">Both documents uploaded — form is filed and LOA-ready</span>
          </>
        ) : (
          <>
            <AlertCircle size={16} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-700">
              {!filedForm && !acknowledgement ? 'Upload both the filed form and acknowledgement receipt' :
               !filedForm ? 'Filed form not yet uploaded' : 'Acknowledgement receipt not yet uploaded'}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Filed Form Slot */}
        <DocumentSlot
          title="Filed BIR Form"
          description="The official BIR form copy that was filed via eFPS or manually submitted"
          category="FILED_FORM"
          current={filedForm}
          versions={filedVersions}
          uploading={uploading === 'FILED_FORM'}
          onUpload={(file) => handleUpload(file, 'FILED_FORM', null)}
          onReupload={() => setShowReupload('FILED_FORM')}
          onView={(doc) => setViewingDoc({ fileUrl: doc.file_url, fileType: doc.file_type, label: 'Filed BIR Form' })}
        />

        {/* Acknowledgement Slot */}
        <DocumentSlot
          title="Acknowledgement Receipt"
          description="The eFPS confirmation page or BIR acknowledgement receipt with reference number"
          category="ACKNOWLEDGEMENT"
          current={acknowledgement}
          versions={ackVersions}
          uploading={uploading === 'ACKNOWLEDGEMENT'}
          onUpload={(file) => handleUpload(file, 'ACKNOWLEDGEMENT', null)}
          onReupload={() => setShowReupload('ACKNOWLEDGEMENT')}
          onView={(doc) => setViewingDoc({ fileUrl: doc.file_url, fileType: doc.file_type, label: 'Acknowledgement Receipt' })}
        />
      </div>

      {/* Re-upload modal */}
      {showReupload && (
        <ReuploadModal
          onConfirm={(file, reason) => handleUpload(file, showReupload, reason)}
          onCancel={() => setShowReupload(null)}
          uploading={!!uploading}
        />
      )}
    </div>
  )
}

// ─── Document Slot (single upload area) ─────────────────────────────────────

function DocumentSlot({ title, description, category, current, versions, uploading, onUpload, onReupload, onView }) {
  const fileRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (file) => {
    if (!file) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (!allowed.includes(file.type)) {
      notify.error('Only PDF, JPG, and PNG files are accepted.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      notify.error('File is too large. Maximum 15MB.')
      return
    }
    onUpload(file)
  }

  if (!current) {
    // Upload prompt
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <h4 className="text-sm font-semibold text-[var(--color-text)]">{title}</h4>
          <p className="text-[11px] text-[var(--color-muted-fg)] mt-0.5">{description}</p>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center p-8 cursor-pointer transition-colors',
            dragOver ? 'bg-[var(--color-primary)]/5' : 'hover:bg-[var(--color-surface-2)]'
          )}
        >
          {uploading ? (
            <Loader2 size={24} className="animate-spin text-[var(--color-primary)] mb-2" />
          ) : (
            <Upload size={24} className="text-[var(--color-muted-fg)] mb-2" />
          )}
          <p className="text-xs font-medium text-[var(--color-text)]">
            {uploading ? 'Uploading...' : 'Drop file or click to upload'}
          </p>
          <p className="text-[10px] text-[var(--color-muted-fg)] mt-1">PDF, JPG, PNG (max 15MB)</p>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
    )
  }

  // Document uploaded — show preview card
  return (
    <div className="rounded-xl border border-emerald-200 bg-[var(--color-surface)]">
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text)]">{title}</h4>
          <p className="text-[11px] text-[var(--color-muted-fg)] mt-0.5">{description}</p>
        </div>
        <CheckCircle2 size={16} className="text-emerald-500" />
      </div>

      {/* File info */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
          <FileCheck size={14} className="text-emerald-600" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--color-text)] truncate">{current.file_name}</p>
            <p className="text-[10px] text-[var(--color-muted-fg)]">
              v{current.version} • {(current.file_size / 1024).toFixed(0)} KB • {current.uploaded_by_name || 'System'}
              {current.created_at && ` • ${new Date(current.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs h-8"
            onClick={() => onView(current)}>
            <Maximize size={12} className="mr-1" /> View
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-xs h-8"
            onClick={onReupload}>
            <RefreshCw size={12} className="mr-1" /> Replace
          </Button>
          <a href={current.file_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center flex-1 rounded-md border border-[var(--color-border)] bg-white h-8 text-xs font-medium hover:bg-gray-50 transition-colors">
            <Download size={12} className="mr-1" /> Download
          </a>
        </div>

        {/* Version history (if more than 1) */}
        {versions.length > 1 && (
          <details className="mt-2">
            <summary className="text-[11px] font-medium text-[var(--color-primary)] cursor-pointer">
              {versions.length - 1} previous version{versions.length > 2 ? 's' : ''}
            </summary>
            <div className="mt-1.5 space-y-1 max-h-[150px] overflow-y-auto">
              {versions.filter(v => !v.is_current).map(v => (
                <div key={v.id}
                  className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[10px] cursor-pointer hover:bg-gray-100"
                  onClick={() => onView(v)}>
                  <div>
                    <span className="font-medium">v{v.version}</span>
                    <span className="text-[var(--color-muted-fg)] ml-1.5">{v.file_name}</span>
                    {v.reason && <p className="text-[var(--color-muted-fg)] italic mt-0.5">↳ {v.reason}</p>}
                  </div>
                  <span className="text-[var(--color-muted-fg)]">
                    {v.created_at && new Date(v.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
