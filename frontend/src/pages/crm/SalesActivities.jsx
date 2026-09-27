import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import {
  Phone, Mail, Users as MeetingIcon, RotateCcw, Presentation, MapPin,
  MoreHorizontal, Plus, Loader2, X, Filter, Search, Calendar, TrendingUp,
  BarChart3, Activity, ChevronRight, Edit2, Trash2, Shield, FileText, Handshake, UserCheck, AlertTriangle, PenTool
} from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_URL
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
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed') }
  return res.json()
}
async function apiDelete(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) throw new Error('Delete failed')
}

const ACTIVITY_TYPES = [
  'Call', 'Email', 'Meeting', 'Follow-up', 'Presentation', 'Site Visit',
  'Contract Review', 'Negotiation', 'Proposal Sent', 'Client Onboarding',
  'Complaint', 'Document Signed', 'Other'
]
const TYPE_ICONS = {
  'Call': Phone, 'Email': Mail, 'Meeting': MeetingIcon, 'Follow-up': RotateCcw,
  'Presentation': Presentation, 'Site Visit': MapPin, 'Contract Review': FileText,
  'Negotiation': Handshake, 'Proposal Sent': PenTool, 'Client Onboarding': UserCheck,
  'Complaint': AlertTriangle, 'Document Signed': FileText, 'Other': MoreHorizontal,
}
const TYPE_COLORS = {
  'Call': 'bg-blue-100 text-blue-700 border-blue-200',
  'Email': 'bg-purple-100 text-purple-700 border-purple-200',
  'Meeting': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Follow-up': 'bg-amber-100 text-amber-700 border-amber-200',
  'Presentation': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Site Visit': 'bg-teal-100 text-teal-700 border-teal-200',
  'Contract Review': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Negotiation': 'bg-orange-100 text-orange-700 border-orange-200',
  'Proposal Sent': 'bg-pink-100 text-pink-700 border-pink-200',
  'Client Onboarding': 'bg-lime-100 text-lime-700 border-lime-200',
  'Complaint': 'bg-rose-100 text-rose-700 border-rose-200',
  'Document Signed': 'bg-sky-100 text-sky-700 border-sky-200',
  'Other': 'bg-slate-100 text-slate-600 border-slate-200',
}
const TYPE_BG = {
  'Call': 'bg-blue-500', 'Email': 'bg-purple-500', 'Meeting': 'bg-emerald-500',
  'Follow-up': 'bg-amber-500', 'Presentation': 'bg-indigo-500', 'Site Visit': 'bg-teal-500',
  'Contract Review': 'bg-cyan-500', 'Negotiation': 'bg-orange-500', 'Proposal Sent': 'bg-pink-500',
  'Client Onboarding': 'bg-lime-500', 'Complaint': 'bg-rose-500', 'Document Signed': 'bg-sky-500',
  'Other': 'bg-slate-500',
}

const OUTCOME_OPTIONS = ['Positive', 'Neutral', 'Negative', 'Pending']

const AUDIT_ACTION_COLORS = {
  'CREATE': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'UPDATE': 'bg-blue-100 text-blue-700 border-blue-200',
  'DELETE': 'bg-rose-100 text-rose-700 border-rose-200',
  'STATUS_CHANGE': 'bg-amber-100 text-amber-700 border-amber-200',
}

function formatAuditTimestamp(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mon = months[d.getMonth()]
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${mon} ${day}, ${year} ${hh}:${mm}`
}


// ─── Stats Cards ────────────────────────────────────────────────────────────
function StatsCards({ items }) {
  const today = new Date().toISOString().slice(0, 10)
  const thisWeekStart = new Date()
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay())
  const weekStr = thisWeekStart.toISOString().slice(0, 10)

  const totalActivities = items.length
  const todayCount = items.filter(i => i.activity_date?.slice(0, 10) === today).length
  const weekCount = items.filter(i => i.activity_date?.slice(0, 10) >= weekStr).length
  const typeCounts = {}
  items.forEach(i => { typeCounts[i.activity_type] = (typeCounts[i.activity_type] || 0) + 1 })
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]

  const stats = [
    { label: 'Total Activities', value: totalActivities, icon: Activity, color: 'text-blue-600 bg-blue-50' },
    { label: "Today's Activities", value: todayCount, icon: Calendar, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'This Week', value: weekCount, icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
    { label: 'Top Type', value: topType ? topType[0] : '—', icon: BarChart3, color: 'text-amber-600 bg-amber-50' },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', s.color)}>
            <s.icon size={18} />
          </div>
          <div>
            <p className="text-lg font-semibold text-[var(--color-text)]">{s.value}</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Activity Type Breakdown ────────────────────────────────────────────────
function TypeBreakdown({ items }) {
  const typeCounts = {}
  items.forEach(i => { typeCounts[i.activity_type] = (typeCounts[i.activity_type] || 0) + 1 })
  const total = items.length || 1

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Activity Breakdown</h3>
      <div className="space-y-2">
        {ACTIVITY_TYPES.map(type => {
          const count = typeCounts[type] || 0
          const pct = Math.round((count / total) * 100)
          const Icon = TYPE_ICONS[type]
          return (
            <div key={type} className="flex items-center gap-2">
              <Icon size={12} className="text-[var(--color-muted-fg)] shrink-0" />
              <span className="text-[11px] text-[var(--color-text)] w-24 truncate">{type}</span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', TYPE_BG[type])} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[11px] text-[var(--color-muted-fg)] w-6 text-right">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Recent Customers Widget ────────────────────────────────────────────────
function RecentCustomers({ items, customers }) {
  const customerActivity = {}
  items.forEach(i => {
    if (i.client_id && !customerActivity[i.client_id]) {
      customerActivity[i.client_id] = { count: 0, last: i.activity_date }
    }
    if (i.client_id) {
      customerActivity[i.client_id].count++
      if (i.activity_date > customerActivity[i.client_id].last) {
        customerActivity[i.client_id].last = i.activity_date
      }
    }
  })

  const topCustomers = Object.entries(customerActivity)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)

  if (topCustomers.length === 0) return null

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Most Active Clients</h3>
      <div className="space-y-2">
        {topCustomers.map(([cid, data]) => {
          const cust = customers.find(c => c.client_id === Number(cid))
          return (
            <div key={cid} className="flex items-center gap-2 py-1">
              <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[10px] font-semibold text-[var(--color-primary)]">
                {(cust?.company_name || '?')[0]}
              </div>
              <span className="text-xs text-[var(--color-text)] flex-1 truncate">{cust?.company_name || `Client #${cid}`}</span>
              <span className="text-[10px] text-[var(--color-muted-fg)]">{data.count} activities</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ─── Log Activity Drawer ────────────────────────────────────────────────────
function LogActivityDrawer({ open, onClose, onSaved, customers, editItem }) {
  const [form, setForm] = useState({ activity_type: 'Call', activity_date: new Date().toISOString().slice(0, 10) })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const formRef = useRef(null)
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); setFieldErrors(fe => ({ ...fe, [k]: undefined })) }

  useEffect(() => {
    const t = setTimeout(() => {
      if (editItem) {
        setForm({
          activity_type: editItem.activity_type || 'Call',
          activity_date: editItem.activity_date?.slice(0, 10) || '',
          subject: editItem.subject || '',
          notes_outcome: editItem.notes_outcome || '',
          client_id: editItem.client_id || '',
          duration_minutes: editItem.duration_minutes || '',
          follow_up_date: editItem.follow_up_date?.slice(0, 10) || '',
          attendees: editItem.attendees || '',
          outcome_status: editItem.outcome_status || '',
        })
      } else {
        setForm({ activity_type: 'Call', activity_date: new Date().toISOString().slice(0, 10) })
      }
      setFieldErrors({})
      setError(null)
    }, 0)
    return () => clearTimeout(t)
  }, [editItem, open])

  function validate() {
    const errors = {}
    if (!form.activity_type) errors.activity_type = 'Activity type is required'
    if (!form.subject?.trim()) errors.subject = 'Subject is required'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      // Scroll to first error
      const firstKey = Object.keys(errors)[0]
      const el = formRef.current?.querySelector(`[data-field="${firstKey}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return false
    }
    return true
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true); setError(null)
    try {
      const body = {
        activity_type: form.activity_type,
        activity_date: form.activity_date ? `${form.activity_date}T00:00:00` : null,
        subject: form.subject || '',
        notes_outcome: form.notes_outcome || null,
        client_id: form.client_id ? Number(form.client_id) : null,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        follow_up_date: form.follow_up_date ? `${form.follow_up_date}T00:00:00` : null,
        attendees: form.attendees || null,
        outcome_status: form.outcome_status || null,
      }
      if (editItem) {
        await apiPatch(`/crm/activities/${editItem.activity_id}`, body)
        notify.success('Activity updated.')
      } else {
        await apiPost('/crm/activities', body)
        notify.success('Activity logged.')
      }
      await onSaved(); onClose()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
  const errorInputCls = 'w-full rounded-lg border border-rose-400 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-300/40'

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[480px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">{editItem ? 'Edit Activity' : 'Log Activity'}</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">{editItem ? 'Update this sales interaction' : 'Record a sales interaction'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} ref={formRef} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1" data-field="activity_type">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Type<span className="text-[var(--color-danger)] ml-0.5">*</span></label>
                <select value={form.activity_type} onChange={e => setField('activity_type', e.target.value)} className={fieldErrors.activity_type ? errorInputCls : inputCls}>
                  <option value="">— Select —</option>
                  {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {fieldErrors.activity_type && <span className="text-[11px] text-rose-500">{fieldErrors.activity_type}</span>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Date</label>
                <input type="date" value={form.activity_date || ''} onChange={e => setField('activity_date', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex flex-col gap-1" data-field="subject">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Subject<span className="text-[var(--color-danger)] ml-0.5">*</span></label>
              <input value={form.subject || ''} onChange={e => setField('subject', e.target.value)} placeholder="Brief description of the activity" className={fieldErrors.subject ? errorInputCls : inputCls} />
              {fieldErrors.subject && <span className="text-[11px] text-rose-500">{fieldErrors.subject}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Notes / Outcome</label>
              <textarea value={form.notes_outcome || ''} onChange={e => setField('notes_outcome', e.target.value)} rows={3} placeholder="What happened? Next steps?" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Customer</label>
              <select value={form.client_id || ''} onChange={e => setField('client_id', e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {(customers || []).map(c => <option key={c.client_id} value={c.client_id}>{c.company_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Duration (minutes)</label>
                <input type="number" min="0" value={form.duration_minutes || ''} onChange={e => setField('duration_minutes', e.target.value)} placeholder="e.g. 30" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Follow-up Date</label>
                <input type="date" value={form.follow_up_date || ''} onChange={e => setField('follow_up_date', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Attendees</label>
              <input value={form.attendees || ''} onChange={e => setField('attendees', e.target.value)} placeholder="Names of people involved" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Outcome Status</label>
              <select value={form.outcome_status || ''} onChange={e => setField('outcome_status', e.target.value)} className={inputCls}>
                <option value="">— None —</option>
                {OUTCOME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : editItem ? <><Edit2 size={14} /> Update</> : <><Plus size={14} /> Log Activity</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}


// ─── Activity Detail Panel ──────────────────────────────────────────────────
function ActivityDetail({ item, customers, onEdit, onDelete, onClose }) {
  if (!item) return null
  const Icon = TYPE_ICONS[item.activity_type] || MoreHorizontal
  const colorCls = TYPE_COLORS[item.activity_type] || TYPE_COLORS['Other']
  const customerName = item.client_id
    ? (customers.find(c => c.client_id === item.client_id)?.company_name || `Client #${item.client_id}`)
    : null

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg border flex items-center justify-center', colorCls)}>
            <Icon size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">{item.subject}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border', colorCls)}>{item.activity_type}</span>
              {item.activity_date && (
                <span className="text-[11px] text-[var(--color-muted)] flex items-center gap-1">
                  <Calendar size={10} />
                  {new Date(item.activity_date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(item)} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]" title="Edit">
            <Edit2 size={13} />
          </button>
          <button onClick={() => onDelete(item)} className="w-7 h-7 rounded-lg hover:bg-rose-50 flex items-center justify-center text-[var(--color-muted-fg)] hover:text-rose-500" title="Delete">
            <Trash2 size={13} />
          </button>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)]">
            <X size={13} />
          </button>
        </div>
      </div>

      {item.notes_outcome && (
        <div className="bg-[var(--color-surface-2)] rounded-lg p-3">
          <p className="text-[11px] font-medium text-[var(--color-muted-fg)] mb-1">Notes / Outcome</p>
          <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{item.notes_outcome}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        {customerName && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[var(--color-muted-fg)]">Customer</span>
            <span className="text-[var(--color-text)] font-medium">{customerName}</span>
          </div>
        )}
        {item.employee_id && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[var(--color-muted-fg)]">Employee</span>
            <span className="text-[var(--color-text)] font-medium">Employee #{item.employee_id}</span>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-[var(--color-muted-fg)]">Activity ID</span>
          <span className="text-[var(--color-text)] font-medium">#{item.activity_id}</span>
        </div>
        {item.duration_minutes && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[var(--color-muted-fg)]">Duration</span>
            <span className="text-[var(--color-text)] font-medium">{item.duration_minutes} min</span>
          </div>
        )}
        {item.outcome_status && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[var(--color-muted-fg)]">Outcome</span>
            <span className="text-[var(--color-text)] font-medium">{item.outcome_status}</span>
          </div>
        )}
        {item.attendees && (
          <div className="flex flex-col gap-0.5 col-span-2">
            <span className="text-[var(--color-muted-fg)]">Attendees</span>
            <span className="text-[var(--color-text)] font-medium">{item.attendees}</span>
          </div>
        )}
        {item.follow_up_date && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[var(--color-muted-fg)]">Follow-up</span>
            <span className="text-[var(--color-text)] font-medium">{new Date(item.follow_up_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Timeline Card ──────────────────────────────────────────────────────────
function ActivityCard({ item, customers, selected, onClick }) {
  const Icon = TYPE_ICONS[item.activity_type] || MoreHorizontal
  const colorCls = TYPE_COLORS[item.activity_type] || TYPE_COLORS['Other']
  const customerName = item.client_id
    ? (customers.find(c => c.client_id === item.client_id)?.company_name || `Client #${item.client_id}`)
    : null

  return (
    <div
      className={cn(
        'flex gap-3 cursor-pointer group',
        selected && 'bg-[var(--color-primary)]/5 -mx-2 px-2 rounded-lg'
      )}
      onClick={onClick}
    >
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center">
        <div className={cn('w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-shadow', colorCls, selected && 'ring-2 ring-[var(--color-primary)]/30')}>
          <Icon size={14} />
        </div>
        <div className="w-px flex-1 bg-[var(--color-border)] mt-1" />
      </div>
      {/* Content */}
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border', colorCls)}>{item.activity_type}</span>
          {item.activity_date && <span className="text-[11px] text-[var(--color-muted)]">{new Date(item.activity_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
          {item.outcome_status && <span className="text-[10px] text-[var(--color-muted-fg)] bg-[var(--color-surface-2)] rounded px-1.5 py-0.5">{item.outcome_status}</span>}
          <ChevronRight size={12} className="ml-auto text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-sm font-medium text-[var(--color-text)] mt-1 group-hover:text-[var(--color-primary)] transition-colors">{item.subject}</p>
        {item.notes_outcome && <p className="text-xs text-[var(--color-muted-fg)] mt-0.5 line-clamp-1">{item.notes_outcome}</p>}
        {customerName && <p className="text-[11px] text-[var(--color-muted)] mt-1">↳ {customerName}</p>}
      </div>
    </div>
  )
}


// ─── Audit Trail Tab ────────────────────────────────────────────────────────
function AuditTrailTab() {
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    async function fetchAudit() {
      setLoading(true)
      try {
        const data = await apiGet('/audit-trail/?module=CRM&module=Sales&module=Contacts&module=Clients&limit=200')
        if (!cancelled) setAuditLogs(data || [])
      } catch {
        if (!cancelled) setAuditLogs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchAudit()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let results = auditLogs
    if (actionFilter) {
      results = results.filter(l => l.action === actionFilter)
    }
    if (search.trim()) {
      const s = search.toLowerCase()
      results = results.filter(l =>
        l.description?.toLowerCase().includes(s) ||
        l.performed_by?.toLowerCase().includes(s) ||
        l.module_name?.toLowerCase().includes(s) ||
        l.action?.toLowerCase().includes(s) ||
        l.ip_address?.toLowerCase().includes(s)
      )
    }
    return results
  }, [auditLogs, actionFilter, search])

  const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE']

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search audit logs..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[var(--color-muted)]" />
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none">
            <option value="">All Actions</option>
            {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-[var(--color-muted-fg)]">{filtered.length} records</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-3">
            <Shield size={24} className="text-[var(--color-muted)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text)]">No audit trail records found</p>
          <p className="text-xs text-[var(--color-muted)] mt-1">System-generated CRM events will appear here.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted-fg)]">Timestamp</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted-fg)]">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted-fg)]">Module</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted-fg)]">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted-fg)]">Performed By</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-muted-fg)]">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.log_id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)]/50 transition-colors">
                    <td className="px-4 py-3 text-[var(--color-text)] whitespace-nowrap">{formatAuditTimestamp(log.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border', AUDIT_ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-600 border-slate-200')}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{log.module_name}</td>
                    <td className="px-4 py-3 text-[var(--color-text)] max-w-xs truncate">{log.description || '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{log.performed_by || '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-muted-fg)] font-mono text-[11px]">{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Main Activities Component ──────────────────────────────────────────────
export default function SalesActivities() {
  const [activeTab, setActiveTab] = useState('activity-log')
  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterType) params.set('activity_type', filterType)
      setItems(await apiGet(`/crm/activities?${params}`) || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [filterType])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])
  useEffect(() => {
    let c = false
    apiGet('/crm/customers').then(d => { if (!c) setCustomers(d || []) }).catch(() => {})
    return () => { c = true }
  }, [])

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const s = search.toLowerCase()
    return items.filter(i =>
      i.subject?.toLowerCase().includes(s) ||
      i.notes_outcome?.toLowerCase().includes(s) ||
      i.activity_type?.toLowerCase().includes(s)
    )
  }, [items, search])

  function handleEdit(item) {
    setEditItem(item)
    setDrawer(true)
  }

  async function handleDelete(item) {
    if (!confirm(`Delete activity "${item.subject}"?`)) return
    try {
      await apiDelete(`/crm/activities/${item.activity_id}`)
      notify.success('Activity deleted.')
      setSelectedItem(null)
      await load()
    } catch { notify.error('Delete failed.') }
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto p-1">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
        <button
          onClick={() => setActiveTab('activity-log')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors relative',
            activeTab === 'activity-log'
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-muted-fg)] hover:text-[var(--color-text)]'
          )}
        >
          <span className="flex items-center gap-2"><Activity size={15} /> Activity Log</span>
          {activeTab === 'activity-log' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)] rounded-full" />}
        </button>
        <button
          onClick={() => setActiveTab('audit-trail')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors relative',
            activeTab === 'audit-trail'
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-muted-fg)] hover:text-[var(--color-text)]'
          )}
        >
          <span className="flex items-center gap-2"><Shield size={15} /> Audit Trail</span>
          {activeTab === 'audit-trail' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)] rounded-full" />}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'audit-trail' ? (
        <AuditTrailTab />
      ) : (
        <>
          {/* Stats Row */}
          <StatsCards items={items} />

          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search activities..."
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-[var(--color-muted)]" />
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none">
                <option value="">All Types</option>
                {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex-1" />
            <span className="text-[11px] text-[var(--color-muted-fg)]">{filteredItems.length} activities</span>
            <Button size="md" onClick={() => { setEditItem(null); setDrawer(true) }}><Plus size={14} /> Log Activity</Button>
          </div>

          {/* Main Content Area */}
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-3">
                <Activity size={24} className="text-[var(--color-muted)]" />
              </div>
              <p className="text-sm font-medium text-[var(--color-text)]">No activities recorded yet</p>
              <p className="text-xs text-[var(--color-muted)] mt-1 max-w-xs">Start tracking your sales interactions by logging your first activity.</p>
              <Button size="md" className="mt-4" onClick={() => { setEditItem(null); setDrawer(true) }}><Plus size={14} /> Log First Activity</Button>
            </div>
          ) : (
            <div className="flex gap-4 flex-1 min-h-0">
              {/* Timeline Column */}
              <div className="flex-1 min-w-0 overflow-y-auto pr-1">
                {filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <Search size={20} className="text-[var(--color-muted)] mb-2" />
                    <p className="text-xs text-[var(--color-muted-fg)]">No activities match your search.</p>
                  </div>
                ) : (
                  filteredItems.map(item => (
                    <ActivityCard
                      key={item.activity_id}
                      item={item}
                      customers={customers}
                      selected={selectedItem?.activity_id === item.activity_id}
                      onClick={() => setSelectedItem(item)}
                    />
                  ))
                )}
              </div>

              {/* Side Panel */}
              <div className="w-80 shrink-0 space-y-3 overflow-y-auto">
                {selectedItem && (
                  <ActivityDetail
                    item={selectedItem}
                    customers={customers}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onClose={() => setSelectedItem(null)}
                  />
                )}
                <TypeBreakdown items={items} />
                <RecentCustomers items={items} customers={customers} />
              </div>
            </div>
          )}
        </>
      )}

      <LogActivityDrawer open={drawer} onClose={() => { setDrawer(false); setEditItem(null) }} onSaved={load} customers={customers} editItem={editItem} />
    </div>
  )
}
