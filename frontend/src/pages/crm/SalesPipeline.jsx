import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { notify } from '@/utils/toast'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/feedback'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import {
  Loader2, Search, Kanban, ChevronDown, ArrowRight, ArrowLeft,
  FileText, CheckCircle2, XCircle, Plus, ShoppingCart,
  FolderKanban, ExternalLink, Check, Lock, AlertTriangle, X, StickyNote,
  Banknote, Package, Truck, Receipt, Calculator, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { entityFromDocumentNumber } from '@/pages/purchasing/purchasingUtils'

import expediaLogo from '@/assets/company-logos/Expedia.png'
import glabLogo from '@/assets/company-logos/GLab.png'
import exigentLogo from '@/assets/company-logos/exigent.png'
import ksiLogo from '@/assets/company-logos/KSI.png'

const ENTITIES = [
  { value: 'Expedia', label: 'Expedia (EXSSI)', logo: expediaLogo },
  { value: 'GreatnessLab', label: 'GreatnessLab', logo: glabLogo },
  { value: 'Exigent', label: 'Exigent Corporation', logo: exigentLogo },
  { value: 'KSI', label: 'Kyrios Solutions Inc.', logo: ksiLogo },
]

const BASE = import.meta.env.VITE_API_URL
const STAGES = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Approval', 'Closed Won', 'Closed Lost']
const STAGE_FILTERS = ['All', ...STAGES]
const PIPELINE_GRID = 'grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(80px,0.6fr)_minmax(100px,0.7fr)]'

// ─── API Helpers ─────────────────────────────────────────────────────────────
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed') }
  return res.json()
}

async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    const detail = typeof e.detail === 'object' ? e.detail : null
    const err = new Error(e.error || detail?.error || e.detail || 'Request failed')
    if (detail?.requires_confirmation) err.requiresConfirmation = true
    throw err
  }
  return res.json()
}

const INACTIVE_PROCUREMENT_STATUSES = new Set(['rejected', 'cancelled', 'canceled', 'void', 'closed', 'archived'])

function activePrReferencesFromProcurementStatus(data, shortages = []) {
  const shortageCodes = new Set((shortages || []).map(item => item.product_code).filter(Boolean))
  const seen = new Set()
  const refs = []
  ;(data?.items || []).forEach(item => {
    if (shortageCodes.size && !shortageCodes.has(item.product_code)) return
    ;(item.pr_references || []).forEach(ref => {
      const number = ref.pr_number
      if (!number || seen.has(number)) return
      const status = ref.status || ref.pr_status || ''
      if (INACTIVE_PROCUREMENT_STATUSES.has(String(status).toLowerCase())) return
      seen.add(number)
      refs.push({ purchase_request_id: ref.purchase_request_id, pr_number: number, status })
    })
  })
  return refs
}

function purchaseRequestStateFromSales({ deal, quotation, shortages }) {
  const quotationNo = quotation?.quotation_no || ''
  return {
    prefill_entity: entityFromDocumentNumber(quotationNo),
    prefill_items: (shortages || []).map(s => ({
      product_code: s.product_code,
      item_description: s.product_name,
      unit: s.unit || 'Nos',
      quantity: s.shortage,
      estimated_unit_cost: s.buying_price || 0,
    })),
    prefill_remarks: `Stock shortage for ${quotationNo} (Pipeline: ${deal.project_name || 'Deal'})`,
    from: 'pipeline',
  }
}

async function activePrReferencesForQuotation(quotation, shortages) {
  if (!quotation?.quotation_id) return []
  const procurementStatus = await apiGet(`/quotations/${quotation.quotation_id}/procurement-status`)
  return activePrReferencesFromProcurementStatus(procurementStatus, shortages)
}

// ─── Formatters ──────────────────────────────────────────────────────────────
function formatCurrency(val) {
  if (!val) return '—'
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatDate(val) {
  if (!val) return '—'
  return new Date(val).toLocaleDateString()
}

// ─── Workflow Step Definitions ────────────────────────────────────────────────
const WORKFLOW_STEPS = [
  { id: 'prospecting', label: 'Prospecting', stage: 'Prospecting' },
  { id: 'qualification', label: 'Qualification', stage: 'Qualification' },
  { id: 'proposal', label: 'Proposal', stage: 'Proposal' },
  { id: 'negotiation', label: 'Negotiation', stage: 'Negotiation' },
  { id: 'approval', label: 'Approval', stage: 'Approval' },
  { id: 'closed_won', label: 'Closed Won', stage: 'Closed Won' },
]

function getStageIndex(stage) {
  if (stage === 'Closed Lost') return -1
  const idx = WORKFLOW_STEPS.findIndex(s => s.stage === stage)
  return idx >= 0 ? idx : 0
}

function getCompletedSteps(deal) {
  const stage = deal.stage || 'Prospecting'
  const currentIdx = getStageIndex(stage)
  const completed = {}
  WORKFLOW_STEPS.forEach((step, idx) => {
    completed[step.id] = idx < currentIdx
  })
  return completed
}

// ─── Status Pill ─────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const s = (status || '').toUpperCase()
  const cls = s === 'DRAFT' ? 'bg-slate-100 text-slate-600'
    : s === 'FOR_APPROVAL' ? 'bg-amber-50 text-amber-700'
    : s === 'APPROVED' ? 'bg-emerald-50 text-emerald-700'
    : s === 'SENT' ? 'bg-blue-50 text-blue-700'
    : s === 'COMPLETE' ? 'bg-indigo-50 text-indigo-700'
    : s === 'ACCEPTED' || s === 'CONVERTED' ? 'bg-indigo-50 text-indigo-700'
    : s === 'REJECTED' ? 'bg-rose-50 text-rose-700'
    : s === 'PENDING' ? 'bg-amber-50 text-amber-700'
    : s === 'PENDING_APPROVAL' ? 'bg-amber-50 text-amber-700'
    : s === 'RESERVED' ? 'bg-violet-50 text-violet-700'
    : s === 'DELIVERED' ? 'bg-emerald-50 text-emerald-700'
    : s === 'IN_PROGRESS' || s === 'IN PROGRESS' ? 'bg-blue-50 text-blue-700'
    : s === 'PAID' || s === 'COLLECTED' ? 'bg-emerald-50 text-emerald-700'
    : s === 'PARTIALLY_PAID' || s === 'PARTIALLY PAID' ? 'bg-blue-50 text-blue-700'
    : s === 'UNPAID' ? 'bg-orange-50 text-orange-700'
    : s === 'CONFIRMED' ? 'bg-blue-50 text-blue-700'
    : s === 'FINALIZED' ? 'bg-emerald-50 text-emerald-700'
    : 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{(status || '—').replace(/_/g, ' ')}</span>
}

// ─── Toolbar Dropdown (filter) ──────────────────────────────────────────────
function ToolbarDropdown({ value, onChange, options, labelFn, width = 'w-[160px]' }) {
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
    <div className={`relative ${width} shrink-0`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
      >
        <span className="truncate">{labelFn(value)}</span>
        <ChevronDown size={14} className={`text-[var(--color-muted-fg)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <ul
            className="fixed rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-[9999] max-h-[240px] overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {options.map(opt => (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-sm whitespace-nowrap text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  {labelFn(opt)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}


// ─── Entity Dropdown with Logos ──────────────────────────────────────────────
function EntityDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const selected = ENTITIES.find(e => e.value === value)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)]/50 focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
      >
        {selected ? (
          <>
            <img src={selected.logo} alt="" className="h-5 w-5 rounded object-contain" />
            <span className="flex-1 text-left">{selected.label}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-[var(--color-muted-fg)]">Select company...</span>
        )}
        <ChevronDown size={14} className={cn('text-[var(--color-muted-fg)] transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
          {ENTITIES.map(ent => (
            <li key={ent.value}>
              <button
                type="button"
                onClick={() => { onChange(ent.value); setOpen(false) }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                  value === ent.value ? 'bg-[var(--color-primary)]/5 text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
                )}
              >
                <img src={ent.logo} alt="" className="h-5 w-5 rounded object-contain" />
                {ent.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── New Deal Drawer ─────────────────────────────────────────────────────────
function NewDealDrawer({ open, onClose, customers, onCreated }) {
  const [form, setForm] = useState({ project_name: '', client_id: '', contact_id: '', entity: '', expected_closed_date: '', competitor: '', remarks: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [contacts, setContacts] = useState([])

  function reset() { setForm({ project_name: '', client_id: '', contact_id: '', entity: '', expected_closed_date: '', competitor: '', remarks: '' }); setError(null); setContacts([]) }
  function handleClose() { reset(); onClose() }

  // Fetch contacts when client changes
  useEffect(() => {
    if (!form.client_id) {
      setContacts([])
      return undefined
    }

    let cancelled = false
    apiGet(`/contact_list/?client_id=${encodeURIComponent(form.client_id)}`)
      .then(rows => {
        if (cancelled) return
        const clientContacts = rows || []
        setContacts(clientContacts)
        setForm(current => {
          if (current.contact_id) return current
          const defaultContact = clientContacts.find(contact => contact.is_primary_contact) || clientContacts[0]
          return defaultContact ? { ...current, contact_id: String(defaultContact.contact_id) } : current
        })
      })
      .catch(() => { if (!cancelled) setContacts([]) })

    return () => { cancelled = true }
  }, [form.client_id])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.project_name.trim()) { setError('Project/Deal Name is required.'); return }
    if (!form.entity) { setError('Company is required.'); return }
    setSaving(true)
    try {
      const body = {
        project_name: form.project_name.trim(),
        stage: 'Prospecting',
        ...(form.entity ? { entity: form.entity } : {}),
        ...(form.client_id ? { client_id: Number(form.client_id) } : {}),
        ...(form.contact_id ? { contact_id: Number(form.contact_id) } : {}),
        ...(form.expected_closed_date ? { expected_closed_date: form.expected_closed_date } : {}),
        ...(form.competitor.trim() ? { competitor: form.competitor.trim() } : {}),
        ...(form.remarks.trim() ? { remarks: form.remarks.trim() } : {}),
      }
      const created = await apiPost('/opportunities/', body)
      notify.success('Deal created successfully')
      reset()
      onCreated(created)
    } catch (err) {
      setError(err.message || 'Failed to create deal')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9990] bg-black/40" onClick={handleClose} />
      {/* Centered Modal */}
      <div className="fixed inset-0 z-[9991] flex items-center justify-center p-4">
        <div className="flex w-full max-w-lg flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl max-h-[90vh]">
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
            <h3 className="text-base font-semibold text-[var(--color-text)]">New Deal</h3>
            <button type="button" onClick={handleClose} className="rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)] transition-colors">
              <X size={16} />
            </button>
          </div>
          {/* Modal Body */}
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto px-6 py-5 gap-5">
            {error && (
              <div className="rounded-lg border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/5 px-3 py-2 text-xs text-[var(--color-danger)]">
                {error}
              </div>
            )}
            {/* Stage (locked) */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1.5">Stage</label>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-muted-fg)]">
                <Lock size={12} /> Prospecting
              </div>
            </div>
            {/* Entity / Company */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1.5">Company <span className="text-[var(--color-danger)]">*</span></label>
              <EntityDropdown value={form.entity} onChange={v => setForm(f => ({ ...f, entity: v }))} />
            </div>
            {/* Project/Deal Name */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Project/Deal Name <span className="text-[var(--color-danger)]">*</span></label>
            <input
              type="text"
              value={form.project_name}
              onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
              placeholder="Enter deal name..."
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          {/* Client */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Client</label>
            <select
              value={form.client_id}
              onChange={e => setForm(f => ({ ...f, client_id: e.target.value, contact_id: '' }))}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
            >
              <option value="">Select a client...</option>
              {customers.map(c => (
                <option key={c.client_id} value={c.client_id}>{c.company_name || c.customer_code || `Client #${c.client_id}`}</option>
              ))}
            </select>
          </div>
          {/* Contact Person */}
          {form.client_id && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Contact Person</label>
              {contacts.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">No contacts found for this client</p>
              ) : (
                <select
                  value={form.contact_id}
                  onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                >
                  <option value="">Select contact person...</option>
                  {contacts.map(c => (
                    <option key={c.contact_id} value={c.contact_id}>
                      {[c.first_name, c.last_name].filter(Boolean).join(' ')}{c.job_title ? ` — ${c.job_title}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {/* Expected Close Date */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Expected Close Date</label>
            <input
              type="date"
              value={form.expected_closed_date}
              onChange={e => setForm(f => ({ ...f, expected_closed_date: e.target.value }))}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          {/* Competitors (comma separated) */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Competitors</label>
            <input
              type="text"
              value={form.competitor}
              onChange={e => setForm(f => ({ ...f, competitor: e.target.value }))}
              placeholder="Comma separated, e.g. Company A, Company B"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          {/* Remarks */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Remarks</label>
            <textarea
              value={form.remarks}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              placeholder="Additional notes..."
              rows={3}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20 resize-none"
            />
          </div>
          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] pt-5 mt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? 'Creating...' : 'Create Deal'}
            </Button>
          </div>
        </form>
        </div>
      </div>
    </>
  )
}

// ─── Workflow Stepper Component ──────────────────────────────────────────────
function WorkflowStepper({ deal, activeStep, onStepClick }) {
  const completed = getCompletedSteps(deal)
  const currentStageIdx = getStageIndex(deal.stage || 'Prospecting')
  const isClosedLost = deal.stage === 'Closed Lost'

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {WORKFLOW_STEPS.map((step, index) => {
        const isDone = completed[step.id]
        const isActive = index === activeStep
        const isAccessible = index <= currentStageIdx || isDone
        const isLocked = !isAccessible && !isClosedLost

        return (
          <div key={step.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => !isLocked && onStepClick(index)}
              disabled={isLocked}
              className={cn(
                'group relative flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all',
                isActive
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)] shadow-sm ring-1 ring-[var(--color-primary)]/20'
                  : isDone
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : isLocked
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                      : 'border-[#d8e2ef] bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <span className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                isDone
                  ? 'bg-emerald-500 text-white'
                  : isActive
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-slate-200 text-slate-500'
              )}>
                {isDone ? <Check size={11} /> : isLocked ? <Lock size={9} /> : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{step.label.split(' ')[0]}</span>
            </button>
            {index < WORKFLOW_STEPS.length - 1 && (
              <div className={`h-px w-4 shrink-0 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
      {/* Closed Lost indicator */}
      {isClosedLost && (
        <>
          <div className="h-px w-4 shrink-0 bg-rose-300" />
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
              <XCircle size={11} />
            </span>
            <span>Closed Lost</span>
          </div>
        </>
      )}
    </div>
  )
}



// ─── Deal Info Card (shared across steps) ────────────────────────────────────
function DealInfoCard({ deal }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
        <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Stage</p>
        <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">{deal.stage || '—'}</p>
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
        <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Expected Close</p>
        <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">{formatDate(deal.expected_closed_date)}</p>
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 col-span-2">
        <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Client</p>
        <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">{deal._clientLabel || (deal.client_id ? `Client #${deal.client_id}` : '—')}</p>
      </div>
      {deal.competitor && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 col-span-2">
          <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Competitor</p>
          <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">{deal.competitor}</p>
        </div>
      )}
      {deal.remarks && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 col-span-2">
          <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Remarks</p>
          <p className="text-sm font-medium text-[var(--color-text)] mt-0.5 whitespace-pre-wrap">{deal.remarks}</p>
        </div>
      )}
      {deal.return_reason && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 col-span-2">
          <p className="text-[10px] text-purple-600 uppercase">Return Reason</p>
          <p className="text-sm font-medium text-purple-800 mt-0.5">{deal.return_reason}</p>
        </div>
      )}
    </div>
  )
}

// ─── Deal Notes ──────────────────────────────────────────────────────────────
function DealNotes({ deal, onSaved }) {
  const [notes, setNotes] = useState(deal?.remarks || '')
  const [saving, setSaving] = useState(false)
  const timeoutRef = useRef(null)

  // Sync when deal changes
  useEffect(() => {
    const timer = setTimeout(() => setNotes(deal?.remarks || ''), 0)
    return () => clearTimeout(timer)
  }, [deal?.opportunity_id, deal?.remarks])

  function handleChange(e) {
    const value = e.target.value
    setNotes(value)
    // Auto-save after 800ms of inactivity
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => saveNotes(value), 800)
  }

  async function saveNotes(value) {
    if (!deal?.opportunity_id) return
    setSaving(true)
    try {
      await apiPatch(`/opportunities/${deal.opportunity_id}`, { remarks: value || null })
      if (onSaved) onSaved(value)
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <h4 className="text-xs font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5"><StickyNote size={12} /> Notes</h4>
          {saving && <span className="text-[10px] text-[var(--color-muted)] flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Saving...</span>}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <textarea
          value={notes}
          onChange={handleChange}
          placeholder="Add notes about this deal..."
          rows={4}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20 resize-y min-h-[80px]"
        />
        <p className="text-[10px] text-[var(--color-muted)] mt-1">Auto-saves as you type</p>
      </CardContent>
    </Card>
  )
}

// ─── Related Records Section ─────────────────────────────────────────────────
function RelatedRecords({ related, loadingRelated, navigate, deal }) {
  function goToQuotation(quotationId) { navigate(`/quotation/${quotationId}`) }
  function goToWorkflow() { navigate('/workflow') }
  function createQuotation() {
    const params = new URLSearchParams()
    if (deal.client_id) params.set('client_id', deal.client_id)
    if (deal.contact_id) params.set('contact_id', deal.contact_id)
    if (deal.project_name) params.set('project_name', deal.project_name)
    if (deal.opportunity_id) params.set('opportunity_id', deal.opportunity_id)
    if (deal.entity) params.set('entity', deal.entity)
    params.set('from', 'pipeline')
    navigate(`/quotation/new?${params}`)
  }

  if (loadingRelated) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 size={18} className="animate-spin text-[var(--color-muted)]" />
        <span className="text-xs text-[var(--color-muted)] ml-2">Loading related records...</span>
      </div>
    )
  }

  if (!related) return null

  // Compute workflow status indicators
  const hasStock = !related.purchase_orders?.length || related.goods_receipts?.length > 0
  const deliveryStatus = related.goods_receipts?.length > 0
    ? (related.goods_receipts.every(gr => gr.status?.toLowerCase() === 'completed' || gr.status?.toLowerCase() === 'received') ? 'delivered' : 'partial')
    : related.purchase_orders?.length > 0 ? 'pending' : 'n/a'
  const paymentStatus = related.ar_invoices?.length > 0
    ? (related.ar_invoices.every(inv => inv.collection_status?.toLowerCase() === 'collected' || inv.collection_status?.toLowerCase() === 'paid') ? 'paid' : related.ar_invoices.some(inv => inv.collection_status?.toLowerCase() === 'collected' || inv.collection_status?.toLowerCase() === 'paid') ? 'partial' : 'unpaid')
    : 'n/a'

  return (
    <div className="space-y-4 pt-3 border-t border-[var(--color-border)]">
      {/* Deal Fulfillment Status */}
      {(related.sales_orders?.length > 0 || related.ar_invoices?.length > 0) && (
        <div className="grid grid-cols-3 gap-2">
          <div className={`rounded-lg border px-2.5 py-2 text-center ${hasStock ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <Package size={13} className={`mx-auto ${hasStock ? 'text-emerald-600' : 'text-amber-600'}`} />
            <p className="text-[9px] font-semibold mt-1 text-[var(--color-muted-fg)]">Stock</p>
            <p className={`text-[10px] font-bold ${hasStock ? 'text-emerald-700' : 'text-amber-700'}`}>{hasStock ? 'Ready' : 'Pending'}</p>
          </div>
          <div className={`rounded-lg border px-2.5 py-2 text-center ${
            deliveryStatus === 'delivered' ? 'border-emerald-200 bg-emerald-50' :
            deliveryStatus === 'partial' ? 'border-blue-200 bg-blue-50' :
            deliveryStatus === 'pending' ? 'border-amber-200 bg-amber-50' :
            'border-slate-200 bg-slate-50'
          }`}>
            <Truck size={13} className={`mx-auto ${
              deliveryStatus === 'delivered' ? 'text-emerald-600' :
              deliveryStatus === 'partial' ? 'text-blue-600' :
              deliveryStatus === 'pending' ? 'text-amber-600' :
              'text-slate-400'
            }`} />
            <p className="text-[9px] font-semibold mt-1 text-[var(--color-muted-fg)]">Delivery</p>
            <p className={`text-[10px] font-bold ${
              deliveryStatus === 'delivered' ? 'text-emerald-700' :
              deliveryStatus === 'partial' ? 'text-blue-700' :
              deliveryStatus === 'pending' ? 'text-amber-700' :
              'text-slate-500'
            }`}>{deliveryStatus === 'delivered' ? 'Done' : deliveryStatus === 'partial' ? 'Partial' : deliveryStatus === 'pending' ? 'Pending' : '—'}</p>
          </div>
          <div className={`rounded-lg border px-2.5 py-2 text-center ${
            paymentStatus === 'paid' ? 'border-emerald-200 bg-emerald-50' :
            paymentStatus === 'partial' ? 'border-blue-200 bg-blue-50' :
            paymentStatus === 'unpaid' ? 'border-orange-200 bg-orange-50' :
            'border-slate-200 bg-slate-50'
          }`}>
            <Banknote size={13} className={`mx-auto ${
              paymentStatus === 'paid' ? 'text-emerald-600' :
              paymentStatus === 'partial' ? 'text-blue-600' :
              paymentStatus === 'unpaid' ? 'text-orange-600' :
              'text-slate-400'
            }`} />
            <p className="text-[9px] font-semibold mt-1 text-[var(--color-muted-fg)]">Payment</p>
            <p className={`text-[10px] font-bold ${
              paymentStatus === 'paid' ? 'text-emerald-700' :
              paymentStatus === 'partial' ? 'text-blue-700' :
              paymentStatus === 'unpaid' ? 'text-orange-700' :
              'text-slate-500'
            }`}>{paymentStatus === 'paid' ? 'Collected' : paymentStatus === 'partial' ? 'Partial' : paymentStatus === 'unpaid' ? 'Unpaid' : '—'}</p>
          </div>
        </div>
      )}

      {/* Quotations */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5"><FileText size={12} /> Quotations</p>
          <button onClick={createQuotation} className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] hover:underline"><Plus size={10} /> New</button>
        </div>
        {related.quotations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-4 text-center">
            <p className="text-[11px] text-[var(--color-muted)]">No quotations yet</p>
            <button onClick={createQuotation} className="mt-1.5 text-[11px] font-medium text-[var(--color-primary)] hover:underline">Create quotation for this deal</button>
          </div>
        ) : (
          <div className="space-y-2">
            {related.quotations.map(q => (
              <div key={q.quotation_id} onClick={() => goToQuotation(q.quotation_id)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">{q.quotation_no}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5 truncate">{q.project_name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={q.status} />
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approvals */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5"><CheckCircle2 size={12} /> Approvals</p>
          <button onClick={goToWorkflow} className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] hover:underline">Go to Approvals <ArrowRight size={10} /></button>
        </div>
        {related.approvals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 text-center">
            <p className="text-[11px] text-[var(--color-muted)]">No approval records</p>
          </div>
        ) : (
          <div className="space-y-2">
            {related.approvals.map((a, idx) => (
              <div key={a.approval_id || idx} onClick={goToWorkflow} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-[var(--color-text)] truncate">{a.reference_number || `Approval #${a.approval_id}`}</p>
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium border ${
                      a.request_type === 'Deal Closure' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      a.request_type === 'Quotation Approval' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>{a.request_type === 'Deal Closure' ? 'Deal' : a.request_type?.replace(' Approval', '') || '—'}</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{a.approver_name ? `Decided by ${a.approver_name}` : 'Awaiting decision'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={a.status} />
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sales Orders */}
      {related.sales_orders.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5 mb-2"><ShoppingCart size={12} /> Sales Orders</p>
          <div className="space-y-2">
            {related.sales_orders.map(so => (
              <div key={so.sales_order_id} onClick={() => navigate(`/crm/sales-orders/${so.sales_order_id}`)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">{so.so_number}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{so.order_date ? new Date(so.order_date).toLocaleDateString() : '—'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={so.status} />
                  {so.grand_total && <span className="text-[10px] font-medium text-[var(--color-text)]">{formatCurrency(so.grand_total)}</span>}
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      {related.projects.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5 mb-2"><FolderKanban size={12} /> Projects</p>
          <div className="space-y-2">
            {related.projects.map(p => (
              <div key={p.project_id} onClick={() => navigate(`/projects/${p.project_id}`)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">{p.project_code || p.project_name}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5 truncate">{p.project_name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={p.status} />
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AR Invoices (Billing & Payment) */}
      <div>
        <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5 mb-2"><Banknote size={12} /> AR Invoices</p>
        {related.ar_invoices?.length > 0 ? (
          <div className="space-y-2">
            {related.ar_invoices.map(inv => (
              <div key={inv.invoice_id} onClick={() => navigate(`/accounts-receivable/invoices/${inv.invoice_id}`)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">{inv.invoice_number}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '—'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={inv.collection_status || inv.lifecycle_status || 'Draft'} />
                  {inv.net_collectible && <span className="text-[10px] font-medium text-[var(--color-text)]">{formatCurrency(inv.net_collectible)}</span>}
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--color-muted)] italic px-1">No invoices yet</p>
        )}
      </div>

      {/* Purchase Orders (Procurement) */}
      <div>
        <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5 mb-2"><Package size={12} /> Purchase Orders</p>
        {related.purchase_orders?.length > 0 ? (
          <div className="space-y-2">
            {related.purchase_orders.map(po => (
              <div key={po.purchase_order_id} onClick={() => navigate(`/purchasing/orders?highlight=${encodeURIComponent(po.po_number)}`)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">{po.po_number}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{po.delivery_date ? `Delivery: ${new Date(po.delivery_date).toLocaleDateString()}` : po.po_date ? new Date(po.po_date).toLocaleDateString() : '—'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={po.status} />
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--color-muted)] italic px-1">No purchase orders yet</p>
        )}
      </div>

      {/* Goods Receipts (Delivery Tracking) */}
      <div>
        <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5 mb-2"><Truck size={12} /> Goods Receipts</p>
        {related.goods_receipts?.length > 0 ? (
          <div className="space-y-2">
            {related.goods_receipts.map(gr => (
              <div key={gr.goods_receipt_id} onClick={() => navigate(`/inventory/deliveries?highlight=${encodeURIComponent(gr.receipt_number)}`)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">{gr.receipt_number}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{gr.received_date ? `Received: ${new Date(gr.received_date).toLocaleDateString()}` : '—'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={gr.status} />
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--color-muted)] italic px-1">No goods receipts yet</p>
        )}
      </div>

      {/* AP Bills (Supplier Bills) */}
      <div>
        <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5 mb-2"><Receipt size={12} /> AP Bills</p>
        {related.ap_bills?.length > 0 ? (
          <div className="space-y-2">
            {related.ap_bills.map(bill => (
              <div key={bill.bill_id} onClick={() => navigate(`/accounts-payable/bills/${bill.bill_id}`)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">{bill.bill_number}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{bill.bill_date ? new Date(bill.bill_date).toLocaleDateString() : '—'}{bill.po_number ? ` • ${bill.po_number}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={bill.lifecycle_status === 'DRAFT' ? 'Not Confirmed' : bill.payment_status || 'Unpaid'} />
                  {bill.net_payable && <span className="text-[10px] font-medium text-[var(--color-text)]">{formatCurrency(bill.net_payable)}</span>}
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--color-muted)] italic px-1">No supplier bills yet</p>
        )}
      </div>

      {/* Tax Forms (BIR 2307) */}
      <div>
        <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5 mb-2"><Calculator size={12} /> Tax Forms</p>
        {related.tax_forms?.length > 0 ? (
          <div className="space-y-2">
            {related.tax_forms.map(tf => (
              <div key={tf.form_record_id} onClick={() => navigate(`/tax/forms/${tf.form_type}/${tf.form_record_id}`)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">BIR {tf.form_type} • {tf.payee_name || '—'}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{tf.period_from} to {tf.period_to}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={tf.status} />
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--color-muted)] italic px-1">No tax forms generated yet</p>
        )}
      </div>
    </div>
  )
}

// ─── Step Content: Prospecting ───────────────────────────────────────────────
function StepProspecting({ deal, customers, onDealUpdate }) {
  const [form, setForm] = useState({
    project_name: deal.project_name || '',
    client_id: deal.client_id ? String(deal.client_id) : '',
    contact_id: deal.contact_id ? String(deal.contact_id) : '',
    entity: deal.entity || '',
    expected_closed_date: deal.expected_closed_date || '',
    competitor: deal.competitor || '',
    remarks: deal.remarks || '',
  })
  const [contacts, setContacts] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Fetch contacts when client changes
  useEffect(() => {
    if (!form.client_id) { setContacts([]); return }
    apiGet(`/contact_list/?client_id=${encodeURIComponent(form.client_id)}`)
      .then(rows => setContacts(rows || []))
      .catch(() => setContacts([]))
  }, [form.client_id])

  async function handleSave() {
    if (!deal?.opportunity_id) return
    setSaving(true)
    setSaved(false)
    try {
      const payload = {
        project_name: form.project_name.trim() || null,
        client_id: form.client_id ? Number(form.client_id) : null,
        contact_id: form.contact_id ? Number(form.contact_id) : null,
        entity: form.entity || null,
        expected_closed_date: form.expected_closed_date || null,
        competitor: form.competitor.trim() || null,
        remarks: form.remarks.trim() || null,
      }
      await apiPatch(`/opportunities/${deal.opportunity_id}`, payload)
      onDealUpdate({ ...deal, ...payload })
      setSaved(true)
      notify.success('Deal updated')
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      notify.error(err.message || 'Failed to update deal')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

  return (
    <Card>
      <CardHeader>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Prospecting</h3>
          <p className="text-xs text-[var(--color-muted-fg)] mt-0.5">Edit deal information before advancing to Qualification.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Entity / Company */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1.5">Company <span className="text-[var(--color-danger)]">*</span></label>
          <EntityDropdown value={form.entity} onChange={v => setForm(f => ({ ...f, entity: v }))} />
        </div>

        {/* Project/Deal Name */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Project/Deal Name <span className="text-[var(--color-danger)]">*</span></label>
          <input
            type="text"
            value={form.project_name}
            onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
            placeholder="Enter deal name..."
            className={inputCls}
          />
        </div>

        {/* Client */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Client</label>
          <select
            value={form.client_id}
            onChange={e => setForm(f => ({ ...f, client_id: e.target.value, contact_id: '' }))}
            className={inputCls}
          >
            <option value="">Select a client...</option>
            {(customers || []).map(c => (
              <option key={c.client_id} value={c.client_id}>{c.company_name || c.customer_code || `Client #${c.client_id}`}</option>
            ))}
          </select>
        </div>

        {/* Contact Person */}
        {form.client_id && contacts.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Contact Person</label>
            <select
              value={form.contact_id}
              onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
              className={inputCls}
            >
              <option value="">Select contact person...</option>
              {contacts.map(c => (
                <option key={c.contact_id} value={c.contact_id}>
                  {[c.first_name, c.last_name].filter(Boolean).join(' ')}{c.job_title ? ` — ${c.job_title}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Expected Close Date */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Expected Close Date</label>
          <input
            type="date"
            value={form.expected_closed_date}
            onChange={e => setForm(f => ({ ...f, expected_closed_date: e.target.value }))}
            className={inputCls}
          />
        </div>

        {/* Competitors */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Competitors</label>
          <input
            type="text"
            value={form.competitor}
            onChange={e => setForm(f => ({ ...f, competitor: e.target.value }))}
            placeholder="Comma separated, e.g. Company A, Company B"
            className={inputCls}
          />
        </div>

        {/* Remarks */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Remarks</label>
          <textarea
            value={form.remarks}
            onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
            placeholder="Additional notes..."
            rows={3}
            className={inputCls + ' resize-none'}
          />
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving || !form.project_name.trim() || !form.entity}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : null}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </Button>
          <p className="text-[10px] text-[var(--color-muted-fg)]">Save before advancing to Qualification.</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Step Content: Qualification ─────────────────────────────────────────────
function StepQualification({ deal }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Qualification</h3>
          <p className="text-xs text-[var(--color-muted-fg)] mt-0.5">Confirm the lead meets criteria. Verify budget, authority, need, and timeline.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DealInfoCard deal={deal} />
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
          <p className="text-xs text-blue-700 flex items-center gap-1.5">
            <CheckCircle2 size={13} />
            Lead qualified. Click <strong>Next</strong> to move to Proposal stage.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Step Content: Proposal ──────────────────────────────────────────────────
function StepProposal({ deal, related, loadingRelated, navigate, hasQuotation, hasSentQuotation }) {
  function createQuotation() {
    const params = new URLSearchParams()
    if (deal.client_id) params.set('client_id', deal.client_id)
    if (deal.contact_id) params.set('contact_id', deal.contact_id)
    if (deal.project_name) params.set('project_name', deal.project_name)
    if (deal.opportunity_id) params.set('opportunity_id', deal.opportunity_id)
    if (deal.entity) params.set('entity', deal.entity)
    params.set('from', 'pipeline')
    navigate(`/quotation/new?${params}`)
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Proposal</h3>
          <p className="text-xs text-[var(--color-muted-fg)] mt-0.5">Create and submit a quotation for this deal. The quotation must be approved before advancing.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DealInfoCard deal={deal} />

        {/* Quotation status */}
        {loadingRelated ? (
          <div className="flex items-center gap-2 py-3 text-xs text-[var(--color-muted)]">
            <Loader2 size={14} className="animate-spin" /> Checking quotations...
          </div>
        ) : hasQuotation && hasSentQuotation ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <p className="text-xs text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              Quotation is approved/sent. Ready to advance to Negotiation.
            </p>
          </div>
        ) : hasQuotation && !hasSentQuotation ? (
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="text-amber-600 animate-spin" />
              <p className="text-xs font-medium text-amber-800">Quotation Pending Approval</p>
            </div>
            <p className="text-xs text-amber-700">
              The quotation has been created but is still awaiting approval. You cannot advance to Negotiation until it is approved or sent.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-3 space-y-2">
            <p className="text-xs text-amber-700 flex items-center gap-1.5">
              <AlertTriangle size={13} />
              A quotation is required before advancing to Negotiation.
            </p>
            <Button size="sm" onClick={createQuotation}>
              <Plus size={13} /> Create Quotation
            </Button>
          </div>
        )}

        {/* Linked quotations */}
        {related && related.quotations.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5"><FileText size={12} /> Linked Quotations</p>
            {related.quotations.map(q => (
              <div key={q.quotation_id} onClick={() => navigate(`/quotation/${q.quotation_id}`)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">{q.quotation_no}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5 truncate">{q.project_name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={q.status} />
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}



// ─── Step Content: Negotiation ───────────────────────────────────────────────
function StepNegotiation({ deal, related, loadingRelated, navigate, hasSentQuotation }) {
  const [stockCheck, setStockCheck] = useState(null)
  const [loadingStock, setLoadingStock] = useState(false)
  const [existingPRs, setExistingPRs] = useState([])
  const [creatingPR, setCreatingPR] = useState(false)
  const latestQuotation = related?.quotations?.[0] || null
  const latestQuotationId = latestQuotation?.quotation_id

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (!latestQuotationId) {
        setStockCheck(null)
        setExistingPRs([])
        return
      }

      setLoadingStock(true)
      async function loadStockAndProcurement() {
        try {
          const stock = await apiGet(`/quotations/${latestQuotationId}/stock-check`)
          if (cancelled) return
          setStockCheck(stock)

          const procurement = await apiGet(`/quotations/${latestQuotationId}/procurement-status`)
          if (cancelled) return
          setExistingPRs(activePrReferencesFromProcurementStatus(procurement, stock?.shortages || []))
        } catch {
          if (cancelled) return
          setStockCheck(null)
          setExistingPRs([])
        } finally {
          if (!cancelled) setLoadingStock(false)
        }
      }

      void loadStockAndProcurement()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [latestQuotationId])

  async function createPurchaseRequest() {
    if (!stockCheck?.shortages?.length) return
    setCreatingPR(true)
    try {
      const activePrs = await activePrReferencesForQuotation(latestQuotation, stockCheck.shortages)
      setExistingPRs(activePrs)
      if (activePrs.length > 0) {
        notify.error(`A purchase request already exists for this stock: ${activePrs.map(pr => pr.pr_number).join(', ')}`)
        return
      }
      navigate('/purchasing/requests/new', {
        state: purchaseRequestStateFromSales({
          deal,
          quotation: latestQuotation,
          shortages: stockCheck.shortages,
        }),
      })
    } catch (err) {
      notify.error(err.message || 'Unable to check existing purchase requests.')
    } finally {
      setCreatingPR(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Negotiation</h3>
          <p className="text-xs text-[var(--color-muted-fg)] mt-0.5">Quotation must be sent/approved to close. Negotiate terms with the client.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DealInfoCard deal={deal} />

        {loadingRelated ? (
          <div className="flex items-center gap-2 py-3 text-xs text-[var(--color-muted)]">
            <Loader2 size={14} className="animate-spin" /> Checking quotation status...
          </div>
        ) : hasSentQuotation ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <p className="text-xs text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              Quotation is sent/approved. Ready to close this deal as Won.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-3 space-y-2">
            <p className="text-xs text-amber-700 flex items-center gap-1.5">
              <AlertTriangle size={13} />
              Quotation must be SENT or APPROVED before closing as Won.
            </p>
            <Button size="sm" variant="outline" onClick={() => {
              const params = new URLSearchParams()
              if (deal.client_id) params.set('client_id', deal.client_id)
              if (deal.project_name) params.set('project_name', deal.project_name)
              if (deal.opportunity_id) params.set('opportunity_id', deal.opportunity_id)
    if (deal.entity) params.set('entity', deal.entity)
              params.set('from', 'pipeline')
              navigate(`/quotation/list?${params}`)
            }}>
              <ExternalLink size={13} /> Go to Quotations
            </Button>
          </div>
        )}

        {/* Stock Shortage Warning */}
        {loadingStock ? (
          <div className="flex items-center gap-2 py-2 text-xs text-[var(--color-muted)]">
            <Loader2 size={14} className="animate-spin" /> Checking inventory levels...
          </div>
        ) : stockCheck && !stockCheck.all_sufficient && stockCheck.shortages.length > 0 ? (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-orange-600 shrink-0" />
              <p className="text-xs font-semibold text-orange-800">Insufficient Stock</p>
            </div>
            <p className="text-[11px] text-orange-700">The following items don't have enough inventory to fulfill this deal:</p>
            <div className="space-y-1.5">
              {stockCheck.shortages.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-md border border-orange-100 bg-white px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[var(--color-text)] truncate">{s.product_name}</p>
                    <p className="text-[10px] text-[var(--color-muted-fg)]">{s.product_code}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-xs font-semibold text-orange-800">Need {s.needed} {s.unit}</p>
                    <p className="text-[10px] text-orange-600">Available: {s.available} · Short: {s.shortage}</p>
                  </div>
                </div>
              ))}
            </div>
            {existingPRs.length === 0 && (
            <Button size="sm" onClick={createPurchaseRequest} className="mt-1" disabled={creatingPR}>
              {creatingPR ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create Purchase Request
            </Button>
            )}
            {existingPRs.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-2">
                  {existingPRs.map(pr => (
                    <button
                      key={pr.pr_number}
                      type="button"
                      onClick={() => {
                        if (pr.purchase_request_id) {
                          navigate(`/purchasing/requests/${pr.purchase_request_id}`)
                        } else {
                          navigate(`/purchasing/requests?highlight=${encodeURIComponent(pr.pr_number)}`)
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
                      title="Open purchase request workflow"
                    >
                      <ExternalLink size={13} /> Existing PR: {pr.pr_number}
                    </button>
                  ))}
              </div>
            ) : (
              <p className="text-[10px] text-orange-600">Items will be pre-filled in the Purchase Request form.</p>
            )}
          </div>
        ) : stockCheck?.all_sufficient ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <p className="text-xs text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              All items have sufficient stock.
            </p>
          </div>
        ) : null}

        {/* Linked quotations with status */}
        {related && related.quotations.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase flex items-center gap-1.5"><FileText size={12} /> Quotation Status</p>
            {related.quotations.map(q => (
              <div key={q.quotation_id} onClick={() => navigate(`/quotation/${q.quotation_id}`)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)] truncate">{q.quotation_no}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusPill status={q.status} />
                  <ExternalLink size={11} className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => {
                const params = new URLSearchParams()
                if (deal.client_id) params.set('client_id', deal.client_id)
                if (deal.project_name) params.set('project_name', deal.project_name)
                if (deal.opportunity_id) params.set('opportunity_id', deal.opportunity_id)
    if (deal.entity) params.set('entity', deal.entity)
                params.set('from', 'pipeline')
                navigate(`/quotation/new?${params}`)
              }}>
                <Plus size={13} /> New Quotation
              </Button>
              {related.quotations.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/quotation/${related.quotations[0].quotation_id}`)}>
                  <FileText size={13} /> Edit Latest
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Stock Resolution Modal ──────────────────────────────────────────────────
function StockResolutionModal({ open, shortages, quotationId, onConfirm, onCancel, onCreatePR }) {
  const [procurementData, setProcurementData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [overrides, setOverrides] = useState({}) // idx -> { note }

  // Fetch procurement status when modal opens
  useEffect(() => {
    if (!open || !quotationId) return undefined
    const timer = setTimeout(() => {
      setLoading(true)
      apiGet(`/quotations/${quotationId}/procurement-status`)
        .then(data => setProcurementData(data))
        .catch(() => setProcurementData(null))
        .finally(() => setLoading(false))
    }, 0)
    return () => clearTimeout(timer)
  }, [open, quotationId])

  if (!open || !shortages?.length) return null

  const items = procurementData?.items || shortages.map(s => ({ ...s, procurement_status: 'not_covered', proof: null }))

  // Can proceed only if ALL items are either "covered" or have a manual override note
  const canProceed = items.every((item, idx) =>
    item.procurement_status === 'covered' || (overrides[idx]?.note?.trim())
  )

  const hasPendingApproval = items.some(item => item.procurement_status === 'pending_approval')
  const hasUncovered = items.some((item, idx) => item.procurement_status === 'not_covered' && !overrides[idx]?.note?.trim())
  const hasAnyExistingPR = items.some(item => item.pr_references?.length > 0 || item.po_references?.length > 0)

  function setOverrideNote(idx, note) {
    setOverrides(prev => ({ ...prev, [idx]: { note } }))
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl max-w-[calc(100vw-2rem)] w-[660px] bg-[var(--color-surface)] border border-[var(--color-border)] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Stock Resolution Required</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Items must be covered by an approved PR/PO or manually confirmed before closing</p>
          </div>
          <button onClick={onCancel} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-muted-fg)]"><X size={15} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-muted)]">
              <Loader2 size={16} className="animate-spin" /> Checking procurement status...
            </div>
          ) : items.map((item, idx) => (
            <div key={idx} className={`rounded-lg border p-4 space-y-2 ${
              item.procurement_status === 'covered' ? 'border-emerald-200 bg-emerald-50' :
              item.procurement_status === 'pending_approval' ? 'border-amber-200 bg-amber-50' :
              'border-orange-200 bg-orange-50'
            }`}>
              {/* Item header */}
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-text)]">{item.product_name}</p>
                  <p className="text-[11px] text-[var(--color-muted-fg)]">{item.product_code} • Short: {item.shortage} {item.unit}</p>
                </div>
                <div className="shrink-0 ml-3">
                  {item.procurement_status === 'covered' && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 size={11} /> Secured
                    </span>
                  )}
                  {item.procurement_status === 'pending_approval' && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                      <AlertTriangle size={11} /> Pending Approval
                    </span>
                  )}
                  {item.procurement_status === 'not_covered' && !overrides[idx]?.note?.trim() && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                      <AlertTriangle size={11} /> Not Covered
                    </span>
                  )}
                  {item.procurement_status !== 'covered' && overrides[idx]?.note?.trim() && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                      <CheckCircle2 size={11} /> Override
                    </span>
                  )}
                </div>
              </div>

              {/* Proof display */}
              {item.proof && (
                <p className="text-xs text-emerald-700 font-medium">{item.proof}</p>
              )}

              {/* PR/PO references */}
              {item.pr_references?.length > 0 && (
                <div className="text-[11px] text-[var(--color-muted-fg)]">
                  {item.pr_references.map((pr, i) => (
                    <span key={i} className="mr-2">{pr.pr_number} ({pr.status})</span>
                  ))}
                </div>
              )}

              {/* Manual override for uncovered / pending items */}
              {item.procurement_status !== 'covered' && (
                <div className="pt-1">
                  <label className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase">
                    {item.procurement_status === 'pending_approval'
                      ? 'Override (optional — or wait for PR approval)'
                      : 'Manual confirmation (attach proof / reference)'}
                  </label>
                  <input
                    type="text"
                    value={overrides[idx]?.note || ''}
                    onChange={e => setOverrideNote(idx, e.target.value)}
                    placeholder="e.g., Supplier confirmation email ref #123, PO from another system..."
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] shrink-0 gap-3">
          {hasPendingApproval || hasAnyExistingPR ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <Loader2 size={12} className="text-amber-600 animate-spin" />
              <p className="text-[11px] text-amber-700 font-medium">
                {hasPendingApproval
                  ? 'A Purchase Request is awaiting approval. Please wait for it to be processed.'
                  : 'Purchase Requests/Orders already exist for these items.'}
              </p>
            </div>
          ) : hasUncovered ? (
            <Button type="button" variant="outline" size="sm" onClick={onCreatePR}>
              <Plus size={13} /> Create Purchase Request
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-3 shrink-0">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button
              type="button"
              disabled={!canProceed || loading}
              onClick={() => onConfirm(items.map((item, idx) => ({
                ...item,
                override_note: overrides[idx]?.note || null,
              })))}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check size={14} /> Confirm for Approval
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Step Content: Approval ──────────────────────────────────────────────────
function StepApproval({ deal, dealApproved, related }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Approval</h3>
          <p className="text-xs text-[var(--color-muted-fg)] mt-0.5">This deal is awaiting management approval before it can be closed as Won.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DealInfoCard deal={deal} />

        {dealApproved ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <p className="text-xs text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              Deal has been approved by management. Ready to close as Won.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="text-amber-600 animate-spin" />
              <p className="text-sm font-medium text-amber-800">Awaiting Approval</p>
            </div>
            <p className="text-xs text-amber-700">
              This deal has been submitted for review. Once a manager or authorized approver 
              approves it in the Workflow Approvals module, you can proceed to close the deal.
            </p>
            <div className="rounded-md border border-amber-200 bg-white px-3 py-2">
              <p className="text-[10px] text-[var(--color-muted-fg)] uppercase font-semibold mb-1">What happens next</p>
              <ul className="text-xs text-amber-800 space-y-1">
                <li>• An approver reviews the deal details and quotation</li>
                <li>• Once approved, the "Next" button will unlock</li>
                <li>• Closing as Won triggers Sales Order creation and billing setup</li>
              </ul>
            </div>
          </div>
        )}

        {/* Show linked approvals */}
        {related?.approvals?.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase">Approval Records</p>
            {related.approvals.map((a, idx) => (
              <div key={a.approval_id || idx} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text)]">{a.reference_number || `Approval #${a.approval_id}`}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)]">{a.approver_name ? `Decided by ${a.approver_name}` : 'Awaiting decision'}</p>
                </div>
                <StatusPill status={a.status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Step Content: Closed Won ────────────────────────────────────────────────
function StepClosedWon({ deal, related, loadingRelated, navigate }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 size={16} className="text-emerald-600" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-emerald-800">Deal Won!</h3>
            <p className="text-xs text-emerald-600 mt-0.5">This deal has been successfully closed. Track fulfillment progress below.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <DealInfoCard deal={deal} />

        {/* Fulfillment Tracker */}
        {!loadingRelated && related && (
          <FulfillmentTracker related={related} navigate={navigate} deal={deal} />
        )}

        {loadingRelated && (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-emerald-500" />
            <span className="ml-2 text-xs text-[var(--color-muted)]">Loading fulfillment data...</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Fulfillment Tracker (Closed Won deals) ─────────────────────────────────
function FulfillmentTracker({ related, navigate, deal }) {
  // ── Compute statuses ──
  const hasSalesOrders = related.sales_orders?.length > 0
  const hasARInvoices = related.ar_invoices?.length > 0
  const hasPurchaseOrders = related.purchase_orders?.length > 0
  const hasGoodsReceipts = related.goods_receipts?.length > 0
  const hasAPBills = related.ap_bills?.length > 0
  const hasTaxForms = related.tax_forms?.length > 0
  const hasProjects = related.projects?.length > 0

  // Delivery status
  const deliveryStatus = hasGoodsReceipts
    ? (related.goods_receipts.every(gr => ['completed', 'received', 'acknowledged', 'delivered'].includes(gr.status?.toLowerCase())) ? 'completed' : 'in-progress')
    : hasPurchaseOrders ? 'pending' : hasSalesOrders ? 'awaiting' : 'n/a'

  // Payment/Collection status
  const paymentStatus = hasARInvoices
    ? (related.ar_invoices.every(inv => ['collected', 'paid', 'fully_paid'].includes(inv.collection_status?.toLowerCase())) ? 'collected'
      : related.ar_invoices.some(inv => ['collected', 'paid', 'fully_paid'].includes(inv.collection_status?.toLowerCase())) ? 'partial' : 'pending')
    : 'n/a'

  // AP/Supplier payment status
  const apStatus = hasAPBills
    ? (related.ap_bills.every(bill => ['paid', 'fully_paid'].includes(bill.payment_status?.toLowerCase())) ? 'paid'
      : related.ap_bills.some(bill => ['paid', 'fully_paid', 'partial'].includes(bill.payment_status?.toLowerCase())) ? 'partial' : 'unpaid')
    : 'n/a'

  // Tax forms: check if there are expected forms vs filed (AR-side only)
  const taxStatus = hasTaxForms
    ? (related.tax_forms.every(tf => ['filed', 'submitted', 'completed'].includes(tf.status?.toLowerCase())) ? 'complete' : 'pending')
    : hasARInvoices ? 'missing' : 'n/a'

  // Project completion
  const projectStatus = hasProjects
    ? (related.projects.every(p => ['completed', 'closed'].includes(p.status?.toLowerCase())) ? 'completed'
      : related.projects.some(p => ['active', 'in_progress', 'in progress'].includes(p.status?.toLowerCase())) ? 'in-progress' : 'not-started')
    : 'n/a'

  // ── Build tracker items ──
  const trackerItems = []

  // Sales Order
  if (hasSalesOrders) {
    trackerItems.push({
      label: 'Sales Order',
      status: 'done',
      detail: `${related.sales_orders.length} order${related.sales_orders.length > 1 ? 's' : ''} created`,
      icon: ShoppingCart,
      onClick: () => navigate(`/crm/sales-orders/${related.sales_orders[0].sales_order_id}`),
    })
  }

  // Procurement / PO
  if (hasPurchaseOrders) {
    const allDelivered = hasGoodsReceipts && related.goods_receipts.every(gr => ['completed', 'received', 'acknowledged', 'delivered'].includes(gr.status?.toLowerCase()))
    trackerItems.push({
      label: 'Procurement',
      status: allDelivered ? 'done' : 'in-progress',
      detail: `${related.purchase_orders.length} PO${related.purchase_orders.length > 1 ? 's' : ''}${hasGoodsReceipts ? ` • ${related.goods_receipts.length} receipt${related.goods_receipts.length > 1 ? 's' : ''}` : ''}`,
      icon: Package,
      onClick: () => navigate(`/purchasing/orders?highlight=${encodeURIComponent(related.purchase_orders[0].po_number)}`),
    })
  }

  // Delivery
  if (deliveryStatus !== 'n/a') {
    trackerItems.push({
      label: 'Delivery',
      status: deliveryStatus === 'completed' ? 'done' : deliveryStatus === 'in-progress' ? 'in-progress' : 'pending',
      detail: deliveryStatus === 'completed' ? 'All items delivered'
        : deliveryStatus === 'in-progress' ? `${related.goods_receipts.filter(gr => ['completed', 'received', 'acknowledged', 'delivered'].includes(gr.status?.toLowerCase())).length}/${related.goods_receipts.length} completed`
        : deliveryStatus === 'pending' ? 'Awaiting dispatch'
        : 'Not yet initiated',
      icon: Truck,
      onClick: hasGoodsReceipts ? () => navigate(`/inventory/deliveries?highlight=${encodeURIComponent(related.goods_receipts[0].receipt_number || related.goods_receipts[0].dr_number || '')}`) : undefined,
    })
  }

  // AR Invoices / Collection
  if (hasARInvoices) {
    const totalInvoiced = related.ar_invoices.reduce((sum, inv) => sum + (Number(inv.net_collectible) || Number(inv.gross_amount) || 0), 0)
    const collectedCount = related.ar_invoices.filter(inv => ['collected', 'paid', 'fully_paid'].includes(inv.collection_status?.toLowerCase())).length
    trackerItems.push({
      label: 'Payment Collection',
      status: paymentStatus === 'collected' ? 'done' : paymentStatus === 'partial' ? 'in-progress' : 'pending',
      detail: paymentStatus === 'collected' ? `₱${totalInvoiced.toLocaleString('en-PH', { minimumFractionDigits: 2 })} collected`
        : `${collectedCount}/${related.ar_invoices.length} invoices collected`,
      icon: Banknote,
      onClick: () => navigate(`/accounts-receivable/invoices?highlight=${related.ar_invoices[0].invoice_id}`),
    })
  }

  // AP Bills / Supplier Payments
  if (hasAPBills) {
    const paidCount = related.ap_bills.filter(b => ['paid', 'fully_paid'].includes(b.payment_status?.toLowerCase())).length
    trackerItems.push({
      label: 'Supplier Payments',
      status: apStatus === 'paid' ? 'done' : apStatus === 'partial' ? 'in-progress' : 'pending',
      detail: apStatus === 'paid' ? `${related.ap_bills.length} bill${related.ap_bills.length > 1 ? 's' : ''} paid`
        : `${paidCount}/${related.ap_bills.length} bills paid`,
      icon: Receipt,
      onClick: () => navigate(`/accounts-payable/bills/${related.ap_bills[0].bill_id}`),
    })
  }

  // Tax Forms
  trackerItems.push({
    label: 'Tax Compliance',
    status: taxStatus === 'complete' ? 'done' : taxStatus === 'pending' ? 'in-progress' : taxStatus === 'missing' ? 'warning' : 'n/a',
    detail: taxStatus === 'complete' ? `${related.tax_forms.length} form${related.tax_forms.length > 1 ? 's' : ''} filed`
      : taxStatus === 'pending' ? `${related.tax_forms.filter(tf => !['filed', 'submitted', 'completed'].includes(tf.status?.toLowerCase())).length} form${related.tax_forms?.length > 1 ? 's' : ''} pending`
      : taxStatus === 'missing' ? 'Tax forms not yet created'
      : 'No tax forms required',
    icon: Calculator,
    onClick: () => navigate(`/tax/forms?opportunity_id=${deal?.opportunity_id}`),
  })

  // Project
  if (hasProjects) {
    const completionAvg = Math.round(related.projects.reduce((sum, p) => sum + (Number(p.completion_percent) || 0), 0) / related.projects.length)
    trackerItems.push({
      label: 'Project',
      status: projectStatus === 'completed' ? 'done' : projectStatus === 'in-progress' ? 'in-progress' : 'pending',
      detail: projectStatus === 'completed' ? 'Project completed'
        : projectStatus === 'in-progress' ? `${completionAvg}% complete`
        : 'Not yet started',
      icon: FolderKanban,
      onClick: () => navigate(`/projects/${related.projects[0].project_id}`),
    })
  }

  // Filter out n/a items
  const visibleItems = trackerItems.filter(item => item.status !== 'n/a')

  // Summary counts
  const doneCount = visibleItems.filter(i => i.status === 'done').length
  const totalCount = visibleItems.length
  const overallProgress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const STATUS_ICON_MAP = {
    done: <CheckCircle2 size={14} className="text-emerald-500" />,
    'in-progress': <Loader2 size={14} className="text-blue-500 animate-spin" />,
    pending: <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300" />,
    warning: <AlertTriangle size={14} className="text-amber-500" />,
  }

  const STATUS_LINE_COLOR = {
    done: 'bg-emerald-300',
    'in-progress': 'bg-blue-300',
    pending: 'bg-slate-200',
    warning: 'bg-amber-300',
  }

  if (visibleItems.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Overall Progress */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase">Fulfillment Progress</p>
          <span className="text-xs font-bold text-[var(--color-text)]">{doneCount}/{totalCount} complete</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              overallProgress === 100 ? 'bg-emerald-500' : overallProgress > 50 ? 'bg-blue-500' : 'bg-amber-500'
            )}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Tracker Timeline */}
      <div className="relative pl-5">
        {visibleItems.map((item, idx) => {
          const Icon = item.icon
          const isLast = idx === visibleItems.length - 1
          return (
            <div key={item.label} className="relative pb-4 last:pb-0">
              {/* Vertical connector line */}
              {!isLast && (
                <div className={cn('absolute left-0 top-5 w-0.5 h-[calc(100%-8px)]', STATUS_LINE_COLOR[item.status])} />
              )}
              {/* Status icon */}
              <div className="absolute left-[-5px] top-0.5">
                {STATUS_ICON_MAP[item.status]}
              </div>
              {/* Content */}
              <div
                className={cn(
                  'ml-4 rounded-lg border px-3 py-2 transition-colors',
                  item.status === 'done' ? 'border-emerald-100 bg-emerald-50/50' :
                  item.status === 'in-progress' ? 'border-blue-100 bg-blue-50/50' :
                  item.status === 'warning' ? 'border-amber-100 bg-amber-50/50' :
                  'border-[var(--color-border)] bg-[var(--color-surface)]',
                  item.onClick && 'cursor-pointer hover:shadow-sm hover:border-[var(--color-primary)]/30'
                )}
                onClick={item.onClick}
              >
                <div className="flex items-center gap-2">
                  <Icon size={12} className={cn(
                    item.status === 'done' ? 'text-emerald-600' :
                    item.status === 'in-progress' ? 'text-blue-600' :
                    item.status === 'warning' ? 'text-amber-600' :
                    'text-slate-400'
                  )} />
                  <p className={cn(
                    'text-xs font-semibold',
                    item.status === 'done' ? 'text-emerald-800' :
                    item.status === 'in-progress' ? 'text-blue-800' :
                    item.status === 'warning' ? 'text-amber-800' :
                    'text-slate-600'
                  )}>{item.label}</p>
                  {item.onClick && (
                    <ExternalLink size={10} className="ml-auto text-[var(--color-muted)] opacity-60" />
                  )}
                </div>
                <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5 ml-[20px]">{item.detail}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Document Status Tracker ─────────────────────────────────────────────────
function DocumentStatusTracker({ deal }) {
  const [docStatus, setDocStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchStatus = useCallback(() => {
    if (!deal?.opportunity_id) return
    setLoading(true)
    apiGet(`/opportunities/${deal.opportunity_id}/document-status`)
      .then(data => setDocStatus(data))
      .catch(() => setDocStatus(null))
      .finally(() => setLoading(false))
  }, [deal?.opportunity_id])

  useEffect(() => {
    if (!deal?.opportunity_id) return undefined
    const timer = setTimeout(fetchStatus, 0)
    return () => clearTimeout(timer)
  }, [deal?.opportunity_id, deal?.stage, refreshKey, fetchStatus])

  // Auto-refresh when user returns to the browser tab
  useEffect(() => {
    function handleFocus() { setRefreshKey(k => k + 1) }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <FileText size={12} className="text-[var(--color-muted-fg)]" />
            <h4 className="text-xs font-semibold text-[var(--color-muted-fg)] uppercase">Document Status</h4>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center gap-2 py-3 text-xs text-[var(--color-muted)]">
            <Loader2 size={12} className="animate-spin" /> Checking document status...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!docStatus) return null

  const documents = docStatus.documents || []
  // Count statuses
  const existsCount = documents.filter(d => d.exists).length
  const notRequired = documents.filter(d => d.not_required).length
  const pendingCount = documents.filter(d => !d.exists && !d.not_required).length

  function statusIcon(doc) {
    if (doc.exists) {
      const s = (doc.status || '').toUpperCase()
      if (s.includes('PAID') || s.includes('COLLECTED') || s.includes('FILED') || s.includes('COMPLETED') || s.includes('DELIVERED')) {
        return <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
      }
      if (s.includes('DRAFT')) {
        return <AlertTriangle size={13} className="text-amber-500 shrink-0" />
      }
      return <CheckCircle2 size={13} className="text-blue-500 shrink-0" />
    }
    if (doc.not_required) {
      return <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 shrink-0" />
    }
    return <div className="w-3.5 h-3.5 rounded-full border-2 border-orange-300 bg-orange-50 shrink-0" />
  }

  function statusColor(doc) {
    if (doc.exists) {
      const s = (doc.status || '').toUpperCase()
      if (s.includes('PAID') || s.includes('COLLECTED') || s.includes('FILED') || s.includes('COMPLETED') || s.includes('DELIVERED')) {
        return 'border-emerald-100 bg-emerald-50/50'
      }
      if (s.includes('DRAFT')) {
        return 'border-amber-100 bg-amber-50/50'
      }
      return 'border-blue-100 bg-blue-50/50'
    }
    if (doc.not_required) {
      return 'border-slate-100 bg-slate-50/30'
    }
    return 'border-orange-100 bg-orange-50/50'
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5">
            <FileText size={12} className="text-[var(--color-muted-fg)]" />
            <h4 className="text-xs font-semibold text-[var(--color-muted-fg)] uppercase">Document Status</h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-muted-fg)]">
              {existsCount}/{documents.length - notRequired} created
            </span>
            <button
              type="button"
              onClick={() => setRefreshKey(k => k + 1)}
              title="Refresh status"
              className="rounded p-0.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] transition-colors"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="rounded p-0.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <ChevronDown size={12} className={cn('transition-transform', !expanded && '-rotate-90')} />
            </button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="p-4 pt-0 space-y-2">
          {documents.map(doc => (
            <div key={doc.id} className={cn('rounded-lg border px-3 py-2.5 transition-colors', statusColor(doc))}>
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  {statusIcon(doc)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold text-[var(--color-text)]">{doc.label}</p>
                    {doc.exists && doc.count > 0 && (
                      <span className="text-[9px] rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] px-1.5 py-0.5 font-medium text-[var(--color-muted-fg)]">
                        {doc.count}
                      </span>
                    )}
                    {doc.not_required && (
                      <span className="text-[9px] rounded-full bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-medium text-slate-500">
                        N/A
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5 leading-relaxed">{doc.reason}</p>
                  {doc.action && (
                    <p className="text-[10px] text-[var(--color-primary)] font-medium mt-1 flex items-center gap-1">
                      <ArrowRight size={9} /> {doc.action}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Summary bar */}
          {pendingCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mt-2">
              <p className="text-[10px] text-amber-700 font-medium flex items-center gap-1.5">
                <AlertTriangle size={11} />
                {pendingCount} document{pendingCount > 1 ? 's' : ''} pending — follow the actions above to progress.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ─── Step Content: Closed Lost ───────────────────────────────────────────────
function StepClosedLost({ deal }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100">
            <XCircle size={16} className="text-rose-600" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-rose-800">Deal Lost</h3>
            <p className="text-xs text-rose-600 mt-0.5">This opportunity was closed as lost.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DealInfoCard deal={deal} />
        {deal.loss_reason && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5">
            <p className="text-[10px] text-rose-500 uppercase font-semibold mb-1">Loss Reason</p>
            <p className="text-sm text-rose-800">{deal.loss_reason}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}



// ─── Deal Detail View (full-page stepper view) ──────────────────────────────
function DealDetailView({ deal, onBack, onDealUpdate, navigate, confirm, customers }) {
  const [related, setRelated] = useState(null)
  const [loadingRelated, setLoadingRelated] = useState(true)
  const [activeStep, setActiveStep] = useState(() => {
    if (deal.stage === 'Closed Lost') return getStageIndex('Negotiation')
    return getStageIndex(deal.stage || 'Prospecting')
  })
  const [advancing, setAdvancing] = useState(false)
  const [stepError, setStepError] = useState(null)
  const [lossReason, setLossReason] = useState('')
  const [showLossInput, setShowLossInput] = useState(deal.stage === 'Closed Lost')

  // Quotation checks
  const [hasQuotation, setHasQuotation] = useState(false)
  const [hasSentQuotation, setHasSentQuotation] = useState(false)

  // Stock check for Closed Won gate
  const [stockCheck, setStockCheck] = useState(null)
  const [showResolutionModal, setShowResolutionModal] = useState(false)

  // Deal approval status (for Approval → Closed Won)
  const [dealApproved, setDealApproved] = useState(false)

  useEffect(() => {
    if (!deal?.opportunity_id) return undefined
    const timer = setTimeout(() => {
      setLoadingRelated(true)
    Promise.all([
      apiGet(`/opportunities/${deal.opportunity_id}/related`).catch(() => ({ quotations: [], approvals: [], sales_orders: [], projects: [] })),
      apiGet('/quotations/').catch(() => []),
    ]).then(([rel, allQuotations]) => {
      setRelated(rel)

      // Check if deal has any quotation
      const matchingQuotations = allQuotations.filter(q => {
        const matchById = q.opportunity_id && deal.opportunity_id && Number(q.opportunity_id) === Number(deal.opportunity_id)
        const matchByName = q.client_id && deal.client_id && Number(q.client_id) === Number(deal.client_id) && q.project_name && deal.project_name && q.project_name.toLowerCase().trim() === deal.project_name.toLowerCase().trim()
        return matchById || matchByName
      })
      setHasQuotation(matchingQuotations.length > 0)
      const closableQuotationStatuses = ['SENT', 'APPROVED', 'COMPLETE', 'ACCEPTED', 'CONVERTED']
      setHasSentQuotation(matchingQuotations.some(q => closableQuotationStatuses.includes(q.status)))

      // Fetch stock check from the first quotation that is eligible to close.
      const sentQuotation = matchingQuotations.find(q => closableQuotationStatuses.includes(q.status))
      if (sentQuotation?.quotation_id) {
        apiGet(`/quotations/${sentQuotation.quotation_id}/stock-check`)
          .then(data => setStockCheck(data))
          .catch(() => setStockCheck(null))
      }
    }).finally(() => setLoadingRelated(false))

    // Check if deal has workflow approval (for Approval → Closed Won)
    apiGet(`/workflow-approval?reference_module=Sales&reference_id=${deal.opportunity_id}`)
      .then(approvals => {
        const approved = (approvals || []).some(a => a.status?.toLowerCase() === 'approved')
        setDealApproved(approved)
      })
      .catch(() => setDealApproved(false))
    }, 0)
    return () => clearTimeout(timer)
  }, [deal?.opportunity_id, deal?.client_id, deal?.project_name])

  // Get the next stage from the current workflow step
  function getNextStage() {
    if (activeStep >= WORKFLOW_STEPS.length - 1) return null
    return WORKFLOW_STEPS[activeStep + 1]?.stage
  }

  // Validate whether next step requirements are met
  function validateNextStep() {
    const nextStage = getNextStage()
    if (!nextStage) return { valid: false, message: 'Already at final stage.' }

    if (nextStage === 'Proposal') {
      // Free advance from Qualification → Proposal
      return { valid: true }
    }
    if (nextStage === 'Negotiation') {
      // Must have an approved/sent quotation
      if (!hasQuotation) {
        return { valid: false, message: 'A quotation is required before advancing to Negotiation. Create a quotation first.' }
      }
      if (!hasSentQuotation) {
        return { valid: false, message: 'The quotation must be APPROVED or SENT before advancing to Negotiation. It is still pending approval.' }
      }
      return { valid: true }
    }
    if (nextStage === 'Approval') {
      // Must have sent/approved quotation before submitting for approval
      if (!hasSentQuotation) {
        return { valid: false, message: 'Quotation must be SENT or APPROVED before submitting for approval.' }
      }
      return { valid: true }
    }
    if (nextStage === 'Closed Won') {
      // Must have deal approval from workflow
      if (!dealApproved) {
        return { valid: false, message: 'This deal is awaiting approval from management. It will advance automatically once approved in Workflow Approvals.' }
      }
      return { valid: true }
    }
    // Prospecting → Qualification: free advance
    return { valid: true }
  }

  async function handleAdvance() {
    setStepError(null)
    const nextStage = getNextStage()
    if (!nextStage) return

    const validation = validateNextStep()
    if (!validation.valid) {
      setStepError(validation.message)
      return
    }

    // Stock resolution check when moving to Approval
    if (nextStage === 'Approval') {
      if (stockCheck && !stockCheck.all_sufficient && stockCheck.shortages?.length > 0) {
        // Check if there's already an active PO covering these shortages
        try {
          const poStatus = await apiGet(`/crm/pipeline/${deal.opportunity_id}/po-status`)
          if (!poStatus.has_active_po) {
            setShowResolutionModal(true)
            return
          }
          // PO exists — skip stock resolution modal, proceed with confirmation
        } catch {
          // If check fails, fall back to showing the resolution modal
          setShowResolutionModal(true)
          return
        }
      }
      const ok = await confirm({
        title: 'Submit for Approval?',
        message: 'This deal will be submitted to management for final approval before closing.',
        confirmLabel: 'Submit for Approval',
      })
      if (!ok) return
    }

    // Confirmation for Closed Won
    if (nextStage === 'Closed Won') {
      const ok = await confirm({
        title: 'Close as Won?',
        message: 'This will create a Sales Order and AR Invoice. A project will also be created for service/MTO items.',
        confirmLabel: 'Close as Won',
      })
      if (!ok) return
    }

    setAdvancing(true)
    try {
      await apiPatch(`/crm/pipeline/${deal.opportunity_id}/stage`, { stage: nextStage })
      notify.success(`Advanced to ${nextStage}`)
      onDealUpdate({ ...deal, stage: nextStage })
      const newIdx = getStageIndex(nextStage)
      setActiveStep(newIdx)
      setShowLossInput(false)
    } catch (err) {
      const msg = err.message || 'Failed to advance stage'
      if (msg.toLowerCase().includes('quotation') || msg.toLowerCase().includes('approved')) {
        setStepError(msg + ' Go to Quotation module to resolve.')
      } else if (err.requiresConfirmation) {
        const ok = await confirm({ title: 'Action required', message: msg, confirmLabel: 'Continue', danger: true })
        if (ok) {
          try {
            await apiPatch(`/crm/pipeline/${deal.opportunity_id}/stage`, { stage: nextStage, confirm_reopen: true })
            notify.success(`Advanced to ${nextStage}`)
            onDealUpdate({ ...deal, stage: nextStage })
            setActiveStep(getStageIndex(nextStage))
          } catch (retryErr) {
            setStepError(retryErr.message)
          }
        }
      } else {
        setStepError(msg)
      }
    } finally {
      setAdvancing(false)
    }
  }

  // Called when user confirms all resolutions in the stock modal
  async function handleResolutionConfirm() {
    setShowResolutionModal(false)
    setAdvancing(true)
    try {
      await apiPatch(`/crm/pipeline/${deal.opportunity_id}/stage`, { stage: 'Approval' })
      notify.success('Deal submitted for approval!')
      onDealUpdate({ ...deal, stage: 'Approval' })
      setActiveStep(getStageIndex('Approval'))
      setShowLossInput(false)
    } catch (err) {
      setStepError(err.message || 'Failed to submit for approval')
    } finally {
      setAdvancing(false)
    }
  }

  async function createPRFromModal() {
    if (!stockCheck?.shortages?.length) return
    const latestQuotation = related?.quotations?.[0] || {}
    setStepError(null)
    try {
      const activePrs = await activePrReferencesForQuotation(latestQuotation, stockCheck.shortages)
      if (activePrs.length > 0) {
        const message = `A purchase request already exists for this stock: ${activePrs.map(pr => pr.pr_number).join(', ')}`
        notify.error(message)
        setStepError(message)
        return
      }
      setShowResolutionModal(false)
      navigate('/purchasing/requests/new', {
        state: purchaseRequestStateFromSales({
          deal,
          quotation: latestQuotation,
          shortages: stockCheck.shortages,
        }),
      })
    } catch (err) {
      const message = err.message || 'Unable to check existing purchase requests.'
      notify.error(message)
      setStepError(message)
    }
  }

  async function handleMarkAsLost() {
    if (!lossReason.trim()) {
      setStepError('Please provide a loss reason.')
      return
    }

    const ok = await confirm({
      title: 'Close as Lost?',
      message: 'This will mark the opportunity as lost.',
      confirmLabel: 'Close as Lost',
      danger: true,
    })
    if (!ok) return

    setAdvancing(true)
    setStepError(null)
    try {
      await apiPatch(`/crm/pipeline/${deal.opportunity_id}/stage`, { stage: 'Closed Lost', loss_reason: lossReason.trim() })
      notify.success('Deal marked as Lost')
      onDealUpdate({ ...deal, stage: 'Closed Lost', loss_reason: lossReason.trim() })
      setShowLossInput(true)
    } catch (err) {
      setStepError(err.message || 'Failed to mark as lost')
    } finally {
      setAdvancing(false)
    }
  }

  const isClosedWon = deal.stage === 'Closed Won'
  const isClosedLost = deal.stage === 'Closed Lost'
  const isFinalStage = isClosedWon || isClosedLost

  return (
    <div className="flex flex-col h-full overflow-hidden gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <Button variant="outline" size="icon" className="h-8 w-8 justify-center p-0" onClick={onBack} aria-label="Back to pipeline" title="Back to pipeline">
          <ArrowLeft size={15} />
        </Button>
        <div className="min-w-0">
          <h2 className="break-all text-lg font-bold leading-snug text-slate-900">{deal.project_name || 'Untitled Deal'}</h2>
          <p className="text-xs text-slate-500">Opportunity #{deal.opportunity_id} — Pipeline workflow</p>
        </div>
        <StatusBadge status={deal.stage || 'Prospecting'} />
      </div>

      {/* Workflow Stepper */}
      <div className="shrink-0">
        <WorkflowStepper deal={deal} activeStep={activeStep} onStepClick={setActiveStep} />
      </div>

      {/* Step Content */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px] flex-1 min-h-0 overflow-hidden">
        <div className="min-w-0 space-y-4 overflow-y-auto pr-1">
          {/* Render step content based on deal state */}
          {isClosedLost && showLossInput ? (
            <StepClosedLost deal={deal} />
          ) : isClosedWon && activeStep === 5 ? (
            <StepClosedWon deal={deal} related={related} loadingRelated={loadingRelated} navigate={navigate} />
          ) : activeStep === 0 ? (
            <StepProspecting deal={deal} customers={customers} onDealUpdate={onDealUpdate} />
          ) : activeStep === 1 ? (
            <StepQualification deal={deal} />
          ) : activeStep === 2 ? (
            <StepProposal deal={deal} related={related} loadingRelated={loadingRelated} navigate={navigate} hasQuotation={hasQuotation} hasSentQuotation={hasSentQuotation} />
          ) : activeStep === 3 ? (
            <StepNegotiation deal={deal} related={related} loadingRelated={loadingRelated} navigate={navigate} hasSentQuotation={hasSentQuotation} />
          ) : activeStep === 4 ? (
            <StepApproval deal={deal} dealApproved={dealApproved} related={related} />
          ) : activeStep === 5 ? (
            <StepClosedWon deal={deal} related={related} loadingRelated={loadingRelated} navigate={navigate} />
          ) : null}

          {/* Error message */}
          {stepError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0" />
              <p className="text-xs text-rose-700">{stepError}</p>
            </div>
          )}

          {/* Action buttons */}
          {!isFinalStage && (
            <div className="flex items-center gap-3 pt-3 pb-1 sticky bottom-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] -mx-1 px-1 mt-4">
              {/* Next button */}
              {activeStep === getStageIndex(deal.stage || 'Prospecting') && (
                <Button onClick={handleAdvance} disabled={advancing}>
                  {advancing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  {advancing ? 'Advancing...' : `Next: ${getNextStage() || 'Done'}`}
                </Button>
              )}

              {/* Mark as Lost button */}
              {!showLossInput && (
                <Button variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setShowLossInput(true)}>
                  <XCircle size={14} /> Mark as Lost
                </Button>
              )}
            </div>
          )}

          {/* Loss reason input */}
          {showLossInput && !isClosedLost && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold text-rose-800">Mark as Lost</p>
                <p className="text-xs text-[var(--color-muted-fg)]">Provide a reason for losing this deal.</p>
                <textarea
                  value={lossReason}
                  onChange={e => setLossReason(e.target.value)}
                  placeholder="e.g., Client chose competitor, budget constraints..."
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-200 resize-none h-20"
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={handleMarkAsLost} disabled={advancing}>
                    {advancing ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                    Confirm Lost
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowLossInput(false); setLossReason('') }}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar: Related records */}
        <div className="min-w-0 overflow-y-auto space-y-4">
          <Card>
            <CardHeader>
              <h4 className="text-xs font-semibold text-[var(--color-muted-fg)] uppercase">Related Records</h4>
            </CardHeader>
            <CardContent className="space-y-0 p-4 pt-0">
              <RelatedRecords related={related} loadingRelated={loadingRelated} navigate={navigate} deal={deal} />
            </CardContent>
          </Card>
          <DocumentStatusTracker deal={deal} />
          <DealNotes deal={deal} onSaved={(remarks) => onDealUpdate({ ...deal, remarks })} />
        </div>
      </div>

      {/* Stock Resolution Modal */}
      <StockResolutionModal
        open={showResolutionModal}
        shortages={stockCheck?.shortages || []}
        quotationId={related?.quotations?.[0]?.quotation_id}
        onConfirm={handleResolutionConfirm}
        onCancel={() => setShowResolutionModal(false)}
        onCreatePR={createPRFromModal}
      />
    </div>
  )
}



// ─── Main Pipeline Component ────────────────────────────────────────────────
export default function SalesPipeline() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { confirm, confirmDialogProps } = useConfirmDialog()
  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('All')
  const [entityFilter, setEntityFilter] = useState('All')
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [highlightedId, setHighlightedId] = useState(null)
  const highlightHandled = useRef(false)

  const getClientLabel = useCallback((clientId) => {
    if (!clientId) return '—'
    const c = customers.find(c => c.client_id === clientId)
    return c ? (c.company_name || c.customer_code) : `#${clientId}`
  }, [customers])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await apiGet('/crm/pipeline') || []
      const validStages = new Set(STAGES)
      setItems(all.filter(i =>
        (i.status || 'active') !== 'archived' &&
        validStages.has(i.stage || 'Prospecting')
      ))
    } catch { /* */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void load()
      apiGet('/crm/customers').then(setCustomers).catch(() => {})
    }, 0)
    return () => clearTimeout(timer)
  }, [load])

  // Handle highlight param from URL (e.g., from Lead conversion)
  useEffect(() => {
    if (highlightHandled.current) return
    const highlightId = searchParams.get('highlight')
    if (!highlightId || loading || items.length === 0) return

    const timer = setTimeout(() => {
      const deal = items.find(i => String(i.opportunity_id) === highlightId)
      if (!deal) return
      highlightHandled.current = true
      setHighlightedId(Number(highlightId))
      setSelectedDeal({ ...deal, _clientLabel: getClientLabel(deal.client_id) })
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('highlight')
        return next
      }, { replace: true })
      setTimeout(() => setHighlightedId(null), 2000)
    }, 0)
    return () => clearTimeout(timer)
  }, [items, loading, searchParams, setSearchParams, getClientLabel])

  // Filter
  const stageFiltered = stageFilter === 'All'
    ? items
    : items.filter(i => (i.stage || 'Prospecting') === stageFilter)

  const filtered = entityFilter === 'All'
    ? stageFiltered
    : stageFiltered.filter(i => (i.entity || '') === entityFilter)

  const searchFiltered = search.trim()
    ? filtered.filter(i =>
        (i.project_name || '').toLowerCase().includes(search.toLowerCase()) ||
        String(i.opportunity_id).includes(search)
      )
    : filtered
  const orderedDeals = [...searchFiltered].sort((a, b) => Number(b.opportunity_id || 0) - Number(a.opportunity_id || 0))

  // Metrics
  const openDeals = items.filter(i => i.stage !== 'Closed Won' && i.stage !== 'Closed Lost').length

  // Handle deal update from detail view
  function handleDealUpdate(updatedDeal) {
    setSelectedDeal(updatedDeal)
    setItems(prev => prev.map(i => i.opportunity_id === updatedDeal.opportunity_id ? updatedDeal : i))
  }

  // Handle new deal created
  function handleDealCreated(created) {
    setShowNewDeal(false)
    load().then(() => {
      // After reload, auto-select the new deal
      const newDeal = { ...created, _clientLabel: getClientLabel(created.client_id) }
      setSelectedDeal(newDeal)
    })
  }

  // ─── Detail View ──────────────────────────────────────────────────────────
  if (selectedDeal) {
    return (
      <main className={cn('flex flex-col h-full overflow-hidden p-0', highlightedId === selectedDeal.opportunity_id && 'animate-pulse')}>
        <DealDetailView
          deal={selectedDeal}
          onBack={() => { setSelectedDeal(null); load() }}
          onDealUpdate={handleDealUpdate}
          navigate={navigate}
          confirm={confirm}
          customers={customers}
        />
        <ConfirmDialog {...confirmDialogProps} />
      </main>
    )
  }

  // ─── List View ────────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col h-full overflow-hidden gap-5">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex items-center gap-4 shrink-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                <Kanban size={16} />
                <span>Sales Pipeline</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--color-muted-fg)]">
                <span><strong className="text-[var(--color-text)]">{items.length}</strong> deals</span>
                <span><strong className="text-[var(--color-text)]">{openDeals}</strong> open</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button size="sm" onClick={() => setShowNewDeal(true)}>
                <Plus size={14} /> New Deal
              </Button>
              <ToolbarDropdown
                value={stageFilter}
                onChange={setStageFilter}
                options={STAGE_FILTERS}
                labelFn={s => s === 'All' ? 'All Stages' : s}
                width="w-[160px]"
              />
              <ToolbarDropdown
                value={entityFilter}
                onChange={setEntityFilter}
                options={['All', 'Expedia', 'GreatnessLab', 'Exigent', 'KSI']}
                labelFn={s => s === 'All' ? 'All Companies' : s}
                width="w-[170px]"
              />
              <div className="relative w-[240px] shrink-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" placeholder="Search deal name..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {loading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 py-16 text-sm text-slate-600">
              <Loader2 size={16} className="animate-spin" /> Loading pipeline...
            </div>
          ) : orderedDeals.length === 0 ? (
            <EmptyState title="No deals found" icon={Kanban}>Try adjusting your filters or search.</EmptyState>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className={`grid ${PIPELINE_GRID} w-full min-w-[800px] gap-3 border-y border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
                <span>Deal Name</span><span>Client</span><span>Company</span><span>Stage</span><span className="text-right">Close Date</span>
              </div>
              <div className="divide-y divide-[#e3ecf8]">
                {orderedDeals.map(item => (
                  <div
                    key={item.opportunity_id}
                    className={cn(
                      `grid ${PIPELINE_GRID} w-full min-w-[800px] cursor-pointer items-center gap-3 px-5 py-3 hover:bg-[#edf4fb] transition-colors`,
                      highlightedId === item.opportunity_id && 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/5'
                    )}
                    onClick={() => setSelectedDeal({ ...item, _clientLabel: getClientLabel(item.client_id) })}
                  >
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs font-semibold leading-snug text-[#26324f]">{item.project_name || 'Untitled'}</p>
                      {item.return_reason && <p className="mt-0.5 text-[10px] text-purple-600">↩ Returned: {item.return_reason}</p>}
                    </div>
                    <p className="truncate text-sm text-slate-700">{getClientLabel(item.client_id)}</p>
                    <p className="truncate text-xs text-slate-500">{item.entity || '—'}</p>
                    <StatusBadge status={item.stage || 'Prospecting'} />
                    <p className="text-right text-xs text-slate-500">{formatDate(item.expected_closed_date)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <NewDealDrawer open={showNewDeal} onClose={() => setShowNewDeal(false)} customers={customers} onCreated={handleDealCreated} />
      <ConfirmDialog {...confirmDialogProps} />
    </main>
  )
}
