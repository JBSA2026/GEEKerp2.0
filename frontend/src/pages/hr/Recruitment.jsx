import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { notify } from '@/utils/toast'
import {
  Search, Plus, Pencil, Loader2, X, ArrowLeft, Upload, UserCheck
} from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_URL

// ─── API helpers ────────────────────────────────────────────────────────────
function authHeaders(multipart = false) {
  const t = localStorage.getItem('access_token')
  const h = t ? { Authorization: `Bearer ${t}` } : {}
  if (!multipart) h['Content-Type'] = 'application/json'
  return h
}

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
  return res.json()
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.fields = data.fields || null; throw err }
  return data
}

async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.fields = data.fields || null; throw err }
  return data
}

async function apiPostFormData(path, formData) {
  const t = localStorage.getItem('access_token')
  const headers = t ? { Authorization: `Bearer ${t}` } : {}
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.fields = data.fields || null; throw err }
  return data
}

// ─── Constants ──────────────────────────────────────────────────────────────
const ENTITIES = ['Expedia', 'GreatnessLab', 'Exigent', 'KSI']
const JOB_STATUSES = ['Open', 'Closed', 'On Hold', 'Cancelled']
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract']
const APPLICANT_STATUSES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected']
const APPLICANT_SOURCES = ['Referral', 'Job Board', 'Walk-in', 'LinkedIn', 'School Partnership', 'Other']

// ─── Shared UI ──────────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// StatusBadge imported from '@/components/ui/status-badge'

function ApplicantStatusBadge({ status }) {
  return <StatusBadge status={status} />
}


// ─── Job Opening Drawer ─────────────────────────────────────────────────────
function JobOpeningDrawer({ open, onClose, item, onSaved, entityFilter }) {
  const isEditing = Boolean(item)
  const [form, setForm] = useState(() => item || { entity: entityFilter !== 'All' ? entityFilter : '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      setForm(isEditing ? item : { entity: entityFilter !== 'All' ? entityFilter : '' })
    }, 0)
    return () => clearTimeout(timer)
  }, [open, item, isEditing, entityFilter])

  const isValid = Boolean(form.position_title?.trim() && form.department?.trim() && form.entity)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setLoading(true)
    setError(null)
    try {
      const payload = {
        position_title: form.position_title || '',
        department: form.department || '',
        entity: form.entity || '',
        employment_type: form.employment_type || 'Full-time',
        target_hire_date: form.target_hire_date || null,
        job_description: form.job_description || null,
        required_qualifications: form.required_qualifications || null,
      }
      if (isEditing) payload.status = form.status || 'Open'
      const saved = isEditing
        ? await apiPatch(`/hr/recruitment/${item.id}`, payload)
        : await apiPost('/hr/recruitment', payload)
      notify.success(isEditing ? 'Job opening updated.' : 'Job opening created.')
      await onSaved(saved)
      onClose()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[520px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">{isEditing ? 'Edit' : 'Add'} Job Opening</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">{isEditing ? 'Update job opening details' : 'Create a new job opening'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Position Title{reqMark}</label>
              <input value={form.position_title || ''} onChange={e => setField('position_title', e.target.value)} placeholder="e.g. Software Engineer" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Department{reqMark}</label>
              <input value={form.department || ''} onChange={e => setField('department', e.target.value)} placeholder="e.g. Engineering" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Entity{reqMark}</label>
                <select value={form.entity || ''} onChange={e => setField('entity', e.target.value)} className={inputCls}>
                  <option value="">— Select —</option>
                  {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Employment Type</label>
                <select value={form.employment_type || 'Full-time'} onChange={e => setField('employment_type', e.target.value)} className={inputCls}>
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Target Hire Date</label>
              <input type="date" value={form.target_hire_date || ''} onChange={e => setField('target_hire_date', e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Job Description</label>
              <textarea value={form.job_description || ''} onChange={e => setField('job_description', e.target.value)} rows={3} placeholder="Describe the role…" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Required Qualifications</label>
              <textarea value={form.required_qualifications || ''} onChange={e => setField('required_qualifications', e.target.value)} rows={3} placeholder="List qualifications…" className={inputCls} />
            </div>
            {isEditing && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Status</label>
                <select value={form.status || 'Open'} onChange={e => setField('status', e.target.value)} className={inputCls}>
                  {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading || !isValid}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <>{isEditing ? <Pencil size={14} /> : <Plus size={14} />} {isEditing ? 'Save' : 'Create'}</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}


// ─── Applicant Drawer ───────────────────────────────────────────────────────
function ApplicantDrawer({ open, onClose, jobOpeningId, onSaved }) {
  const [form, setForm] = useState({})
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fileError, setFileError] = useState(null)
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      setForm({}); setFile(null); setError(null); setFileError(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open])

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    setFileError(null)
    if (!f) { setFile(null); return }
    if (f.type !== 'application/pdf') {
      setFileError('Only PDF files are accepted.')
      setFile(null)
      e.target.value = ''
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setFileError('File must be 10MB or less.')
      setFile(null)
      e.target.value = ''
      return
    }
    setFile(f)
  }

  const isValid = Boolean(form.applicant_name?.trim())

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('applicant_name', form.applicant_name || '')
      formData.append('contact_email', form.contact_email || '')
      formData.append('contact_number', form.contact_number || '')
      formData.append('source', form.source || '')
      if (file) formData.append('resume', file)
      const saved = await apiPostFormData(`/hr/recruitment/${jobOpeningId}/applicants`, formData)
      notify.success('Applicant added.')
      await onSaved(saved)
      onClose()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[480px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Add Applicant</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Record a new applicant for this opening</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Applicant Name{reqMark}</label>
              <input value={form.applicant_name || ''} onChange={e => setField('applicant_name', e.target.value)} placeholder="Full name" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Email</label>
                <input type="email" value={form.contact_email || ''} onChange={e => setField('contact_email', e.target.value)} placeholder="applicant@email.com" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Contact Number</label>
                <input value={form.contact_number || ''} onChange={e => setField('contact_number', e.target.value)} placeholder="+63 9XX XXX XXXX" className={inputCls} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Source</label>
              <select value={form.source || ''} onChange={e => setField('source', e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {APPLICANT_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Resume (PDF, max 10MB)</label>
              <input type="file" accept=".pdf,application/pdf" onChange={handleFileChange} className="w-full text-sm text-[var(--color-muted-fg)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[var(--color-border)] file:bg-[var(--color-surface)] file:text-xs file:font-medium file:text-[var(--color-text)] hover:file:bg-[var(--color-surface-2)]" />
              {fileError && <p className="text-xs text-rose-600 mt-1">{fileError}</p>}
              {file && <p className="text-xs text-emerald-600 mt-1">Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
            </div>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading || !isValid}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Upload size={14} /> Add Applicant</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}


// ─── Hired Prompt Modal ─────────────────────────────────────────────────────
function HiredPrompt({ open, onClose, preFilledData, onNavigate201 }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
            <UserCheck size={20} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Applicant Hired!</p>
            <p className="text-xs text-[var(--color-muted-fg)]">{preFilledData?.applicant_name} has been marked as Hired.</p>
          </div>
        </div>
        <p className="text-sm text-[var(--color-muted-fg)] mb-5">
          Would you like to create a 201 employee record with pre-filled data from this applicant?
        </p>
        <div className="flex gap-3">
          <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose}>Later</Button>
          <Button type="button" size="md" className="flex-1" onClick={() => { onNavigate201(preFilledData); onClose() }}>
            <UserCheck size={14} /> Create 201 Record
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Applicants List View ───────────────────────────────────────────────────
function ApplicantsList({ jobOpening, onBack }) {
  const [applicants, setApplicants] = useState([])
  const [loading, setLoading] = useState(true)
  const [applicantDrawer, setApplicantDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [updatingId, setUpdatingId] = useState(null)
  const [hiredPrompt, setHiredPrompt] = useState({ open: false, data: null })

  const loadApplicants = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/hr/recruitment/${jobOpening.id}/applicants`)
      setApplicants(data?.data || data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [jobOpening.id])

  useEffect(() => {
    const timer = setTimeout(() => { void loadApplicants() }, 0)
    return () => clearTimeout(timer)
  }, [loadApplicants])

  function openAddApplicant() { setDrawerKey(k => k + 1); setApplicantDrawer(true) }

  async function handleStatusChange(applicant, newStatus) {
    setUpdatingId(applicant.id)
    try {
      const result = await apiPatch(`/hr/recruitment/${jobOpening.id}/applicants/${applicant.id}`, { status: newStatus })
      if (newStatus === 'Hired' && result.pre_filled_201_data) {
        setHiredPrompt({ open: true, data: result.pre_filled_201_data })
      }
      notify.success(`Applicant status updated to ${newStatus}.`)
      await loadApplicants()
    } catch (err) {
      notify.error(err.message || 'Failed to update status.')
    } finally { setUpdatingId(null) }
  }

  function handleNavigate201(preFilledData) {
    // Store pre-filled data in sessionStorage for the 201 tab to pick up
    sessionStorage.setItem('hr_prefill_201', JSON.stringify(preFilledData))
    // Trigger tab switch via filters (parent handles)
    notify.success('Pre-filled data ready. Switch to the Employee 201 File tab to create the record.')
  }

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-text)]">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--color-text)]">{jobOpening.position_title}</p>
          <p className="text-xs text-[var(--color-muted-fg)]">{jobOpening.department} · {jobOpening.entity}</p>
        </div>
        <Button size="md" onClick={openAddApplicant}><Plus size={14} /> Add Applicant</Button>
      </div>

      {/* Applicants Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Applicant Name</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Application Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Source</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Contact</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Update Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : applicants.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No applicants yet.</td></tr>
            ) : (
              applicants.map(app => (
                <tr key={app.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors">
                  <td className="px-3 py-2.5"><p className="text-sm font-medium text-[var(--color-text)]">{app.applicant_name}</p></td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{app.application_date || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{app.source || '—'}</td>
                  <td className="px-3 py-2.5"><ApplicantStatusBadge status={app.status} /></td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{app.contact_email || app.contact_number || '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <select
                      value={app.status || 'Applied'}
                      onChange={e => handleStatusChange(app, e.target.value)}
                      disabled={updatingId === app.id}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                    >
                      {APPLICANT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">{applicants.length} applicant{applicants.length !== 1 ? 's' : ''}</p>

      <ApplicantDrawer
        key={drawerKey}
        open={applicantDrawer}
        onClose={() => setApplicantDrawer(false)}
        jobOpeningId={jobOpening.id}
        onSaved={loadApplicants}
      />

      <HiredPrompt
        open={hiredPrompt.open}
        onClose={() => setHiredPrompt({ open: false, data: null })}
        preFilledData={hiredPrompt.data}
        onNavigate201={handleNavigate201}
      />
    </div>
  )
}


// ─── Main Recruitment Component ─────────────────────────────────────────────
export default function Recruitment() {
  const [openings, setOpenings] = useState([])
  const [, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [drawer, setDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [selectedOpening, setSelectedOpening] = useState(null)
  const [detailView, setDetailView] = useState(null) // job opening to show applicants for

  const entityFilter = 'All'

  const loadOpenings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'All') params.set('status', statusFilter)
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      if (search.trim()) params.set('search', search)
      const data = await apiGet(`/hr/recruitment?${params}`)
      setOpenings(data?.data || data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [statusFilter, entityFilter, search])

  const loadMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (entityFilter !== 'All') params.set('entity', entityFilter)
      const data = await apiGet(`/hr/recruitment/metrics?${params}`)
      setMetrics(data || {})
    } catch { /* ignore */ }
  }, [entityFilter])

  useEffect(() => { const t = setTimeout(() => { loadOpenings(); loadMetrics() }, 300); return () => clearTimeout(t) }, [loadOpenings, loadMetrics])

  function openNew() { setSelectedOpening(null); setDrawerKey(k => k + 1); setDrawer(true) }
  function openEdit(item, e) {
    e?.stopPropagation()
    setSelectedOpening(item)
    setDrawerKey(k => k + 1)
    setDrawer(true)
  }
  function handleRowClick(item) { setDetailView(item) }
  async function handleSaved() { await loadOpenings(); await loadMetrics() }

  // If detail view is active, show applicants list
  if (detailView) {
    return (
      <ApplicantsList
        jobOpening={detailView}
        onBack={() => setDetailView(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">

      {/* Top bar: search + status filter + add button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search openings…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-2 text-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
          />
        </div>
        <div className="flex gap-1.5">
          {['All', ...JOB_STATUSES].map(s => (
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
        <Button size="md" onClick={openNew}><Plus size={14} /> Add Opening</Button>
      </div>

      {/* Job Openings Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Position Title</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Department</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Entity</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Applicants</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Date Posted</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : openings.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No job openings found.</td></tr>
            ) : (
              openings.map(op => (
                <tr
                  key={op.id}
                  onClick={() => handleRowClick(op)}
                  className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
                >
                  <td className="px-3 py-2.5"><p className="text-sm font-medium text-[var(--color-text)]">{op.position_title}</p></td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{op.department}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{op.entity}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={op.status} /></td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-text)] font-medium">{op.applicant_count ?? 0}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{op.date_posted || '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={(e) => openEdit(op, e)} className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]">
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">{openings.length} opening{openings.length !== 1 ? 's' : ''}{statusFilter !== 'All' ? ` (${statusFilter})` : ''}</p>

      <JobOpeningDrawer
        key={drawerKey}
        open={drawer}
        onClose={() => setDrawer(false)}
        item={selectedOpening}
        onSaved={handleSaved}
        entityFilter={entityFilter}
      />
    </div>
  )
}



