import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Loader2, RefreshCw, AlertTriangle, Clock, CheckCircle2,
  Bell, AlertCircle, CalendarClock, FileCheck, Upload, Zap,
  ChevronDown, Filter
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { notify } from '@/utils/toast'
import { apiGet, apiPost, apiPatch, entityParam, money, formatDate, SectionHeader } from './taxUtils'

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const config = {
    pending: { bg: 'bg-slate-100', text: 'text-slate-700', icon: Clock, label: 'Pending' },
    in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Loader2, label: 'In Progress' },
    for_review: { bg: 'bg-indigo-100', text: 'text-indigo-700', icon: FileCheck, label: 'For Review' },
    for_approval: { bg: 'bg-amber-100', text: 'text-amber-700', icon: AlertCircle, label: 'For Approval' },
    filed: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2, label: 'Filed' },
    overdue: { bg: 'bg-rose-100', text: 'text-rose-700', icon: AlertTriangle, label: 'Overdue' },
    completed: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2, label: 'Completed' },
    not_applicable: { bg: 'bg-gray-100', text: 'text-gray-500', icon: null, label: 'N/A' },
    cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', icon: null, label: 'Cancelled' },
  }
  const c = config[status] || config.pending
  const Icon = c.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold', c.bg, c.text)}>
      {Icon && <Icon size={11} />} {c.label}
    </span>
  )
}

// ─── Urgency Indicator ───────────────────────────────────────────────────────

function UrgencyIndicator({ dueDate, status }) {
  if (status === 'filed' || status === 'completed') return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24))

  if (days < 0) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
      <AlertTriangle size={10} /> {Math.abs(days)}d overdue
    </span>
  )
  if (days === 0) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
      <Bell size={10} /> Due Today
    </span>
  )
  if (days <= 3) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
      <AlertCircle size={10} /> {days}d left
    </span>
  )
  if (days <= 7) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
      <Clock size={10} /> {days}d left
    </span>
  )
  if (days <= 15) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-600">
      <CalendarClock size={10} /> {days}d
    </span>
  )
  return (
    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
      {days}d
    </span>
  )
}

// ─── Summary Cards ──────────────────────────────────────────────────────────

function SummaryCards({ summary }) {
  const cards = [
    { label: 'Overdue', value: summary.overdue, color: 'text-rose-600', bgColor: 'bg-rose-50 border-rose-200' },
    { label: 'Due Today', value: summary.due_today, color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200' },
    { label: 'Due in 3 Days', value: summary.due_3_days, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' },
    { label: 'Due in 7 Days', value: summary.due_7_days, color: 'text-sky-600', bgColor: 'bg-sky-50 border-sky-200' },
    { label: 'Pending Approval', value: summary.pending_approval, color: 'text-indigo-600', bgColor: 'bg-indigo-50 border-indigo-200' },
    { label: 'Filed', value: summary.filed, color: 'text-emerald-600', bgColor: 'bg-emerald-50 border-emerald-200' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(c => (
        <div key={c.label} className={cn('rounded-xl border px-4 py-3 shadow-sm', c.bgColor)}>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
          <p className={cn('mt-1 text-2xl font-bold', c.color)}>{c.value ?? 0}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Reminder Detail Modal ──────────────────────────────────────────────────

function ReminderDetail({ reminder, onClose, onUpdate }) {
  const [updating, setUpdating] = useState(false)
  const [validation, setValidation] = useState(null)
  const [validating, setValidating] = useState(false)

  async function handleStatusChange(newStatus) {
    setUpdating(true)
    try {
      await apiPatch(`/tax/reminders/${reminder.id}`, { status: newStatus })
      notify.success(`Status updated to ${newStatus}`)
      onUpdate()
    } catch (err) {
      notify.error(err.message)
    } finally {
      setUpdating(false)
    }
  }

  async function handleValidate() {
    setValidating(true)
    try {
      const res = await apiPost(`/tax/reminders/${reminder.id}/validate`, {})
      setValidation(res)
    } catch (err) {
      notify.error(err.message)
    } finally {
      setValidating(false)
    }
  }

  const statusFlow = ['pending', 'in_progress', 'for_review', 'for_approval', 'filed']
  const currentIdx = statusFlow.indexOf(reminder.status)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">BIR {reminder.form_type}</h3>
            <p className="text-sm text-[var(--color-muted-fg)]">{reminder.description}</p>
          </div>
          <StatusBadge status={reminder.status} />
        </div>


        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-[var(--color-muted-fg)]">Entity:</span> <span className="font-medium">{reminder.entity}</span></div>
            <div><span className="text-[var(--color-muted-fg)]">Period:</span> <span className="font-medium">{reminder.period_covered}</span></div>
            <div><span className="text-[var(--color-muted-fg)]">Due Date:</span> <span className="font-medium">{formatDate(reminder.effective_due_date)}</span></div>
            <div><span className="text-[var(--color-muted-fg)]">Tax Type:</span> <span className="font-medium">{reminder.tax_type}</span></div>
          </div>

          {reminder.filing_reference && (
            <div><span className="text-[var(--color-muted-fg)]">Filing Ref:</span> <span className="font-medium">{reminder.filing_reference}</span></div>
          )}
          {reminder.amount_paid && (
            <div><span className="text-[var(--color-muted-fg)]">Amount Paid:</span> <span className="font-medium">{money(reminder.amount_paid)}</span></div>
          )}
          {reminder.notes && (
            <div><span className="text-[var(--color-muted-fg)]">Notes:</span> <span className="font-medium">{reminder.notes}</span></div>
          )}
        </div>

        {/* Validation */}
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Pre-filing Validation</h4>
            <Button variant="outline" size="sm" onClick={handleValidate} disabled={validating}>
              {validating ? <Loader2 size={12} className="animate-spin" /> : <FileCheck size={12} />}
              <span className="ml-1">Validate</span>
            </Button>
          </div>
          {validation && (
            <div className={cn('rounded-lg p-3 text-xs', validation.valid ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200')}>
              {validation.valid ? (
                <p className="text-emerald-700 font-medium">✓ All checks passed — ready for filing</p>
              ) : (
                <div>
                  <p className="text-rose-700 font-medium mb-1">Issues found ({validation.errors.length}):</p>
                  <ul className="list-disc list-inside text-rose-600 space-y-0.5">
                    {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>


        {/* Status Actions */}
        {reminder.status !== 'filed' && reminder.status !== 'completed' && (
          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            <h4 className="text-sm font-semibold mb-2">Update Status</h4>
            <div className="flex flex-wrap gap-2">
              {statusFlow.slice(currentIdx + 1).map(s => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange(s)}
                  disabled={updating}
                  className="capitalize"
                >
                  {s.replace(/_/g, ' ')}
                </Button>
              ))}
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('not_applicable')} disabled={updating} className="text-slate-500">
                N/A
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}


// ─── Main Component ─────────────────────────────────────────────────────────

export function TaxReminders() {
  const { entity } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [reminders, setReminders] = useState([])
  const [summary, setSummary] = useState({})
  const [filter, setFilter] = useState('all') // all, overdue, due_soon, upcoming, filed
  const [selectedReminder, setSelectedReminder] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const ep = entity && entity !== 'All' ? `entity=${entity}` : ''
      const urgencyParam = filter !== 'all' && filter !== 'filed'
        ? `&urgency=${filter}` : filter === 'filed' ? '&status=filed' : ''
      const [reminderRes, summaryRes] = await Promise.all([
        apiGet(`/tax/reminders/?${ep}${urgencyParam}`),
        apiGet(`/tax/reminders/summary?${ep}`),
      ])
      setReminders(reminderRes || [])
      setSummary(summaryRes || {})
    } catch (err) {
      notify.error(err.message || 'Failed to load reminders')
    } finally {
      setLoading(false)
    }
  }, [entity, filter])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const ep = entity && entity !== 'All' ? `entity=${entity}` : ''
      const res = await apiPost(`/tax/reminders/generate?${ep}`, {})
      notify.success(`Generated ${res.generated} reminders (${res.skipped} skipped)`)
      fetchData()
    } catch (err) {
      notify.error(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSyncBIR() {
    setSyncing(true)
    try {
      const res = await apiPost('/tax/reminders/sync-bir-forms', {})
      notify.success(`Synced: ${res.auto_completed} auto-completed from ${res.synced_forms} filed forms`)
      fetchData()
    } catch (err) {
      notify.error(err.message)
    } finally {
      setSyncing(false)
    }
  }


  const filterOptions = [
    { id: 'all', label: 'All Active' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'due_today', label: 'Due Today' },
    { id: 'due_soon', label: 'Due Soon (7d)' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'filed', label: 'Filed' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionHeader title="Tax Filing Reminders" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSyncBIR} disabled={syncing}>
            <Zap size={14} className={syncing ? 'animate-spin' : ''} />
            <span className="ml-1.5">Sync BIR Forms</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
            <Bell size={14} className={generating ? 'animate-bounce' : ''} />
            <span className="ml-1.5">Generate Reminders</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="ml-1.5">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards summary={summary} />

      {/* Filter Bar */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-white p-1">
        {filterOptions.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              f.id === filter
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>


      {/* Reminders Table */}
      {loading && !reminders.length ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Form</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Description</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Entity</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Period</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Due Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Urgency</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {reminders.length ? reminders.map(r => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedReminder(r)}
                  className={cn(
                    'border-b border-[var(--color-border)] last:border-b-0 cursor-pointer transition-colors',
                    'hover:bg-[var(--color-surface-2)]/50',
                    r.status === 'overdue' && 'bg-rose-50/40',
                    r.status === 'filed' && 'opacity-60'
                  )}
                >
                  <td className="px-4 py-2.5 font-semibold text-[var(--color-text)]">{r.form_type}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{r.description}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{r.entity}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{r.period_covered}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{formatDate(r.effective_due_date)}</td>
                  <td className="px-4 py-2.5"><UrgencyIndicator dueDate={r.effective_due_date} status={r.status} /></td>
                  <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[var(--color-muted-fg)]">
                    {filter === 'all' ? 'No reminders yet. Click "Generate Reminders" to create them automatically from your entity tax profiles.' : 'No reminders match this filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedReminder && (
        <ReminderDetail
          reminder={selectedReminder}
          onClose={() => setSelectedReminder(null)}
          onUpdate={() => { setSelectedReminder(null); fetchData() }}
        />
      )}
    </div>
  )
}
