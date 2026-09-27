import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { buildModuleUrl } from '@/utils/routeHelpers'
import {
  Search, Download, ChevronDown, X, Check, XCircle,
  CornerDownLeft, Loader2, ExternalLink
} from 'lucide-react'

import glabLogo from '@/assets/company-logos/GLab.png'
import expediaLogo from '@/assets/company-logos/Expedia.png'
import exigentLogo from '@/assets/company-logos/exigent.png'
import ksiLogo from '@/assets/company-logos/KSI.png'

// ─── Constants ──────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL

const ENTITIES = [
  { value: 'GreatnessLab', label: 'GreatnessLab', logo: glabLogo },
  { value: 'Expedia', label: 'Expedia', logo: expediaLogo },
  { value: 'Exigent', label: 'Exigent', logo: exigentLogo },
  { value: 'KSI', label: 'Kyrios Solutions Inc.', logo: ksiLogo },
]

const REQUEST_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'Quotation Approval', label: 'Quotation' },
  { value: 'Purchase Request Approval', label: 'Purchase Request' },
  { value: 'Purchase Order Approval', label: 'Purchase Order' },
  { value: 'Payment Voucher Approval', label: 'Payment Voucher' },
  { value: 'Payroll Approval', label: 'Payroll' },
  { value: 'Leave Approval', label: 'Leave' },
  { value: 'Contract Approval', label: 'Contract' },
  { value: 'Deal Closure', label: 'Deal Closure' },
  { value: 'BIR Form Approval', label: 'BIR Form' },
]

const PIPELINE_STAGES = ['Pending', 'Approved', 'Rejected', 'Returned']

const STAGE_COLORS = {
  Pending: 'border-t-amber-400',
  Approved: 'border-t-emerald-400',
  Rejected: 'border-t-rose-400',
  Returned: 'border-t-blue-400',
}

const TYPE_COLORS = {
  'Quotation Approval': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Purchase Request Approval': 'bg-orange-100 text-orange-700 border-orange-200',
  'Purchase Order Approval': 'bg-violet-100 text-violet-700 border-violet-200',
  'Payment Voucher Approval': 'bg-teal-100 text-teal-700 border-teal-200',
  'Payroll Approval': 'bg-pink-100 text-pink-700 border-pink-200',
  'Leave Approval': 'bg-sky-100 text-sky-700 border-sky-200',
  'Contract Approval': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Deal Closure': 'bg-amber-100 text-amber-700 border-amber-200',
}

// Navigation routes for each module
const MODULE_ROUTES = {
  Quotations: '/quotation',
  Purchasing: '/purchasing',
  'Accounts Payable': '/accounts-payable',
  Payroll: '/payroll',
  'HR Management': '/hr',
  Projects: '/projects',
}

const INPUT_CLASS = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

// ─── Helpers ────────────────────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem('access_token')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function formatCurrency(amount) {
  if (amount == null) return '—'
  return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function getEntityLogo(entity) {
  const found = ENTITIES.find(e => e.value === entity)
  return found?.logo || null
}

function getShortType(requestType) {
  return requestType?.replace(' Approval', '') || '—'
}

// ─── Pipeline Card ──────────────────────────────────────────────────────────
function PipelineCard({ item, onClick, onAction, highlighted }) {
  return (
    <div
      data-approval-id={item.approval_id}
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm hover:shadow-md transition-all cursor-pointer group',
        highlighted && 'ring-2 ring-[var(--color-primary)] ring-offset-2 border-[var(--color-primary)] animate-pulse'
      )}
      onClick={() => onClick(item)}
    >
      {/* Header: Type badge + entity */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', TYPE_COLORS[item.request_type] || 'bg-slate-100 text-slate-600 border-slate-200')}>
          {getShortType(item.request_type)}
        </span>
        {item.entity && getEntityLogo(item.entity) && (
          <img src={getEntityLogo(item.entity)} alt="" className="h-4 w-4 object-contain opacity-60" />
        )}
      </div>

      {/* Reference number */}
      <p className="text-sm font-medium text-[var(--color-text)] leading-tight truncate">
        {item.reference_number || `#${item.approval_id}`}
      </p>

      {/* Requestor */}
      <p className="text-[11px] text-[var(--color-muted-fg)] mt-1 truncate">
        {item.requestor_name || item.remarks || '—'}
      </p>

      {/* Amount + Date */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs font-medium text-[var(--color-text)]">
          {item.amount ? formatCurrency(item.amount) : '—'}
        </span>
        <span className="text-[10px] text-[var(--color-muted)]">
          {formatDate(item.submitted_at)}
        </span>
      </div>

      {/* Quick actions on hover — only for Pending items */}
      {item.status === 'Pending' && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-[var(--color-border)] opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onAction('approve', item) }}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
            title="Approve"
          >
            <Check size={10} /> Approve
          </button>
          <button
            onClick={e => { e.stopPropagation(); onAction('reject', item) }}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
            title="Reject"
          >
            <XCircle size={10} /> Reject
          </button>
          <button
            onClick={e => { e.stopPropagation(); onAction('return', item) }}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
            title="Return"
          >
            <CornerDownLeft size={10} /> Return
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Pipeline Column ────────────────────────────────────────────────────────
function PipelineColumn({ stage, items, totalAmount, onCardClick, onAction, highlightedId }) {
  return (
    <div className={cn(
      'flex flex-col min-w-[260px] flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] border-t-4 transition-colors',
      STAGE_COLORS[stage] || 'border-t-slate-300'
    )}>
      {/* Column header */}
      <div className="px-3 py-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[var(--color-text)]">{stage}</p>
          <span className="text-[10px] font-medium text-[var(--color-muted-fg)] bg-[var(--color-surface)] px-1.5 py-0.5 rounded-full">
            {items.length}
          </span>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
          {totalAmount ? formatCurrency(totalAmount) : '—'}
        </p>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        {items.map(item => (
          <PipelineCard
            key={item.approval_id}
            item={item}
            onClick={onCardClick}
            onAction={onAction}
            highlighted={String(item.approval_id) === highlightedId}
          />
        ))}
        {items.length === 0 && (
          <p className="text-[11px] text-[var(--color-muted)] text-center py-8">No items</p>
        )}
      </div>
    </div>
  )
}

// ─── Detail Panel ───────────────────────────────────────────────────────────
function DetailPanel({ item, onClose, onAction, onNavigate, loading }) {
  if (!item) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-50 h-full w-[420px] bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {item.reference_number || `Approval #${item.approval_id}`}
            </p>
            <p className="text-[11px] text-[var(--color-muted-fg)] mt-0.5">
              {item.request_type}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Navigate to source */}
          {item.reference_module && MODULE_ROUTES[item.reference_module] && (
            <button
              onClick={() => onNavigate(item)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 text-[var(--color-primary)] text-sm font-medium hover:bg-[var(--color-primary)]/10 transition-colors"
            >
              <ExternalLink size={14} />
              Go to {item.reference_module} → {item.reference_number || 'View Record'}
            </button>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
              <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Status</p>
              <p className={cn('text-sm font-medium mt-0.5', item.status === 'Pending' && 'text-amber-600', item.status === 'Approved' && 'text-emerald-600', item.status === 'Rejected' && 'text-rose-600', item.status === 'Returned' && 'text-blue-600')}>
                {item.status}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
              <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Amount</p>
              <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">{item.amount ? formatCurrency(item.amount) : '—'}</p>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
              <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Entity</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {getEntityLogo(item.entity) && <img src={getEntityLogo(item.entity)} alt="" className="h-4 w-4 object-contain" />}
                <p className="text-sm text-[var(--color-text)]">{item.entity || '—'}</p>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
              <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Priority</p>
              <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">{item.priority || 'Normal'}</p>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
              <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Requestor</p>
              <p className="text-sm text-[var(--color-text)] mt-0.5 truncate">{item.requestor_name || '—'}</p>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
              <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Submitted</p>
              <p className="text-sm text-[var(--color-text)] mt-0.5">{formatDate(item.submitted_at)}</p>
            </div>
            {item.department && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
                <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Department</p>
                <p className="text-sm text-[var(--color-text)] mt-0.5">{item.department}</p>
              </div>
            )}
            {item.approver_name && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
                <p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Approver</p>
                <p className="text-sm text-[var(--color-text)] mt-0.5">{item.approver_name}</p>
              </div>
            )}
          </div>

          {/* Remarks */}
          {item.remarks && (
            <div>
              <p className="text-[10px] text-[var(--color-muted-fg)] uppercase mb-1.5">Remarks</p>
              <p className="text-sm text-[var(--color-text)] bg-[var(--color-surface-2)] rounded-lg p-3 border border-[var(--color-border)]">
                {item.remarks}
              </p>
            </div>
          )}

          {/* History */}
          {item.history && item.history.length > 0 && (
            <div>
              <p className="text-[10px] text-[var(--color-muted-fg)] uppercase mb-2">Action History</p>
              <div className="space-y-2">
                {item.history.map((entry, idx) => (
                  <div key={idx} className="flex gap-2 items-start text-sm">
                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--color-text)]">{entry.action}</span>
                        <span className="text-[10px] text-[var(--color-muted-fg)]">{formatDate(entry.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-muted-fg)]">{entry.performed_by_name}</p>
                      {entry.comment && <p className="text-[11px] text-[var(--color-muted-fg)] mt-0.5 italic">"{entry.comment}"</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {item.status === 'Pending' && (
          <div className="px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onAction('approve', item)} disabled={loading}>
                <Check size={12} /> Approve
              </Button>
              <Button size="sm" variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50" onClick={() => onAction('reject', item)} disabled={loading}>
                <XCircle size={12} /> Reject
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => onAction('return', item)} disabled={loading}>
                <CornerDownLeft size={12} /> Return
              </Button>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

// ─── Action Dialog ──────────────────────────────────────────────────────────
function ActionDialog({ open, onClose, title, actionLabel, onConfirm, loading, variant = 'default' }) {
  const [comment, setComment] = useState('')
  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => setComment(''), 0)
    return () => clearTimeout(timer)
  }, [open])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">{title}</h3>
        <textarea
          className={cn(INPUT_CLASS, 'min-h-[100px] resize-none')}
          placeholder="Add a comment (optional)..."
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            size="sm"
            className={variant === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
            onClick={() => onConfirm(comment)}
            disabled={loading}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function WorkflowApproval() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Read highlight from query params (e.g. ?highlight=QTN-123)
  const highlightId = searchParams.get('highlight') || ''

  // State
  const [entity, setEntity] = useState(highlightId ? '' : ENTITIES[0].value)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false)
  const [highlightedId, setHighlightedId] = useState(highlightId)
  const highlightTimeoutRef = useRef(null)

  // Panel & Dialog
  const [selectedItem, setSelectedItem] = useState(null)
  const [actionDialog, setActionDialog] = useState({ open: false, title: '', label: '', action: '', item: null, variant: 'default' })

  // ─── Fetch all items ────────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (entity) params.append('entity', entity)
      if (search) params.append('search', search)
      if (typeFilter) params.append('type', typeFilter)
      const res = await fetch(`${API}/workflow-approval?${params}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setItems(Array.isArray(data) ? data : data.items || [])
      }
    } catch {
      notify.error('Failed to load approval items')
    } finally {
      setLoading(false)
    }
  }, [entity, search, typeFilter])

  useEffect(() => {
    const timer = setTimeout(() => { void fetchItems() }, 0)
    return () => clearTimeout(timer)
  }, [fetchItems])

  // ─── Highlight from notification click ──────────────────────────────────────
  useEffect(() => {
    if (!highlightId || !items.length) return

    // Find the item matching the highlight ID (e.g. QTN-123, PR-45, PV-12)
    const match = items.find(i => {
      const id = String(i.approval_id)
      return id === highlightId
    })

    if (match) {
      // Auto-open the detail panel — for connected items just set directly,
      // for formal approvals fetch full details with history
      if (!match.is_connected && typeof match.approval_id === 'number') {
        fetch(`${API}/workflow-approval/${match.approval_id}`, { headers: authHeaders() })
          .then(res => res.ok ? res.json() : match)
          .then(data => setSelectedItem(data))
          .catch(() => setSelectedItem(match))
      } else {
        setTimeout(() => setSelectedItem(match), 0)
      }

      // Scroll the card into view
      setTimeout(() => {
        const el = document.querySelector(`[data-approval-id="${highlightId}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)

      // Clear highlight after 4 seconds
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedId('')
        // Remove the query param from URL without navigation
        setSearchParams(prev => {
          prev.delete('highlight')
          return prev
        }, { replace: true })
      }, 4000)
    }

    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    }
  }, [highlightId, items, setSearchParams])

  // ─── Pipeline data ──────────────────────────────────────────────────────────
  const columns = PIPELINE_STAGES.map(stage => {
    const stageItems = items.filter(i => i.status === stage)
    const totalAmount = stageItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
    return { stage, items: stageItems, totalAmount }
  })

  // ─── Actions ────────────────────────────────────────────────────────────────
  function openActionDialog(action, item) {
    const config = {
      approve: { title: 'Approve Request', label: 'Approve', variant: 'default' },
      reject: { title: 'Reject Request', label: 'Reject', variant: 'danger' },
      return: { title: 'Return for Revision', label: 'Return', variant: 'default' },
    }
    const c = config[action]
    setActionDialog({ open: true, title: c.title, label: c.label, action, item, variant: c.variant })
  }

  async function handleAction(action, item, comment = '') {
    setActionLoading(true)
    try {
      let res
      if (item.is_connected) {
        // Connected item — use connected action endpoint
        res = await fetch(`${API}/workflow-approval/connected/${action}`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            reference_module: item.reference_module || item.source_module,
            reference_id: item.reference_id,
            request_type: item.request_type,
            reference_number: item.reference_number,
            entity: item.entity,
            amount: item.amount,
            requestor_name: item.requestor_name,
            department: item.department,
            remarks: item.remarks,
            comment,
          }),
        })
      } else {
        // Formal workflow approval record
        res = await fetch(`${API}/workflow-approval/${item.approval_id}/${action}`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ comment }),
        })
      }

      if (res.ok) {
        notify.success(`Request ${action}d successfully`)
        setActionDialog({ open: false, title: '', label: '', action: '', item: null, variant: 'default' })
        setSelectedItem(null)
        fetchItems()
      } else {
        const err = await res.json().catch(() => ({}))
        notify.error(err.detail?.error || err.detail || `Failed to ${action} request`)
      }
    } catch {
      notify.error(`Failed to ${action} request`)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCardClick(item) {
    // If it's a formal approval with an integer ID, fetch full details with history
    if (!item.is_connected && typeof item.approval_id === 'number') {
      try {
        const res = await fetch(`${API}/workflow-approval/${item.approval_id}`, { headers: authHeaders() })
        if (res.ok) {
          const data = await res.json()
          setSelectedItem(data)
          return
        }
      } catch { /* fallback to basic item */ }
    }
    setSelectedItem(item)
  }

  function handleNavigateToSource(item) {
    const ref = item.reference_number
    if (!ref) return

    if (item.reference_module === 'Purchasing') {
      const subRoute = item.request_type === 'Purchase Order Approval' ? 'orders' : 'requests'
      navigate(buildModuleUrl('/purchasing', subRoute, { highlight: ref }))
    } else if (item.reference_module === 'HR Management') {
      const subRoute = item.request_type === 'Leave Approval' ? 'leave' : '201'
      navigate(buildModuleUrl('/hr', subRoute, { highlight: ref }))
    } else if (item.reference_module === 'Quotations') {
      // Navigate to quotation list with highlight on reference number
      navigate(buildModuleUrl('/quotation', 'list', { highlight: ref }))
    } else if (item.reference_module === 'Accounts Payable') {
      const subRoute = item.request_type === 'Payment Voucher Approval' ? 'vouchers' : 'bills'
      navigate(buildModuleUrl('/accounts-payable', subRoute, { highlight: ref }))
    } else if (item.reference_module === 'Payroll') {
      navigate(buildModuleUrl('/payroll', 'generate', { highlight: ref }))
    } else if (item.reference_module === 'Projects') {
      navigate(buildModuleUrl('/projects', 'list', { highlight: ref }))
    } else if (item.reference_module === 'Tax Management') {
      navigate(`/tax/forms/2307/${item.reference_id}`)
    } else {
      // Fallback: navigate to module root
      const route = MODULE_ROUTES[item.reference_module]
      if (route) navigate(route)
    }
  }

  async function handleExportCSV() {
    try {
      const params = new URLSearchParams()
      if (entity) params.append('entity', entity)
      if (typeFilter) params.append('type', typeFilter)
      const res = await fetch(`${API}/workflow-approval/export?${params}`, { headers: authHeaders() })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `workflow-approvals-${entity}.csv`
        a.click()
        URL.revokeObjectURL(url)
        notify.success('Export downloaded')
      }
    } catch {
      notify.error('Export failed')
    }
  }

  const selectedEntity = ENTITIES.find(e => e.value === entity) || { value: '', label: 'All Entities', logo: null }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="relative z-20 flex items-center justify-between gap-4 px-6 py-3 bg-white border-b border-[var(--color-border)]">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-[var(--color-text)]">Workflow Approval</h1>

          {/* Entity Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setEntityDropdownOpen(prev => !prev)}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
            >
              {selectedEntity?.logo && <img src={selectedEntity.logo} alt="" className="h-5 w-5 object-contain" />}
              {selectedEntity?.label}
              <ChevronDown size={14} className={cn('text-[var(--color-muted-fg)] transition-transform', entityDropdownOpen && 'rotate-180')} />
            </button>
            {entityDropdownOpen && (
              <>
                <div className="fixed inset-0 z-[49]" onClick={() => setEntityDropdownOpen(false)} />
                <ul className="absolute left-0 top-full mt-1 w-[200px] rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-50">
                  <li>
                    <button
                      type="button"
                      onClick={() => { setEntity(''); setEntityDropdownOpen(false) }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors',
                        entity === '' && 'bg-[var(--color-surface-2)] font-medium'
                      )}
                    >
                      All Entities
                    </button>
                  </li>
                  {ENTITIES.map(ent => (
                    <li key={ent.value}>
                      <button
                        type="button"
                        onClick={() => { setEntity(ent.value); setEntityDropdownOpen(false) }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors',
                          entity === ent.value && 'bg-[var(--color-surface-2)] font-medium'
                        )}
                      >
                        <img src={ent.logo} alt="" className="h-5 w-5 object-contain" />
                        {ent.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download size={14} /> Export
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-[280px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input
              className={cn(INPUT_CLASS, 'pl-8 py-1.5 text-xs')}
              placeholder="Search by reference, requestor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className={cn(INPUT_CLASS, 'w-auto min-w-[140px] py-1.5 text-xs')}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Pipeline Kanban */}
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 size={24} className="animate-spin text-[var(--color-muted)]" />
          </div>
        ) : (
          <div className="flex gap-3 flex-1 overflow-x-auto pb-2">
            {columns.map(({ stage, items: colItems, totalAmount }) => (
              <PipelineColumn
                key={stage}
                stage={stage}
                items={colItems}
                totalAmount={totalAmount}
                onCardClick={handleCardClick}
                onAction={openActionDialog}
                highlightedId={highlightedId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedItem && (
        <DetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAction={openActionDialog}
          onNavigate={handleNavigateToSource}
          loading={actionLoading}
        />
      )}

      {/* Action Dialog */}
      <ActionDialog
        open={actionDialog.open}
        onClose={() => setActionDialog(prev => ({ ...prev, open: false }))}
        title={actionDialog.title}
        actionLabel={actionDialog.label}
        variant={actionDialog.variant}
        loading={actionLoading}
        onConfirm={(comment) => handleAction(actionDialog.action, actionDialog.item, comment)}
      />
    </div>
  )
}
