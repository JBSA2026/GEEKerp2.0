import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, X, Pencil, Check, Trash2, CalendarDays
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { notify } from '@/utils/toast'
import { apiGet, apiPatch, inputCls } from './taxUtils'

// ─── Color coding per status ────────────────────────────────────────────────
const STATUS_COLORS = {
  filed: { bg: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Filed' },
  completed: { bg: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Complete' },
  pending: { bg: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-700', label: 'Upcoming' },
  in_progress: { bg: 'bg-blue-400', dot: 'bg-blue-500', text: 'text-blue-700', label: 'In Progress' },
  for_review: { bg: 'bg-indigo-400', dot: 'bg-indigo-500', text: 'text-indigo-700', label: 'For Review' },
  for_approval: { bg: 'bg-amber-500', dot: 'bg-amber-500', text: 'text-amber-700', label: 'For Approval' },
  overdue: { bg: 'bg-rose-500', dot: 'bg-rose-500', text: 'text-rose-700', label: 'Overdue' },
  not_applicable: { bg: 'bg-gray-300', dot: 'bg-gray-300', text: 'text-gray-500', label: 'N/A' },
}

const FORM_COLORS = {
  '0619E': '#ef4444',
  '1601C': '#f97316',
  '1600-VT': '#eab308',
  '1601EQ': '#22c55e',
  '2550Q': '#3b82f6',
  '1702Q': '#8b5cf6',
  '1702RT': '#6366f1',
  '1604E': '#ec4899',
  '2316': '#14b8a6',
}

function getFormColor(formType) {
  return FORM_COLORS[formType] || '#64748b'
}

// ─── Edit Deadline Modal ─────────────────────────────────────────────────────

function EditDeadlineModal({ entry, onClose, onSave }) {
  const [dueDate, setDueDate] = useState(entry.due_date || '')
  const [holidayRule, setHolidayRule] = useState(entry.holiday_rule || 'next_working_day')
  const [isActive, setIsActive] = useState(entry.is_active !== false)
  const [extensionReason, setExtensionReason] = useState(entry.extension_override?.reason || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const payload = { due_date: dueDate, holiday_rule: holidayRule, is_active: isActive }
      if (extensionReason && extensionReason !== (entry.extension_override?.reason || '')) {
        payload.extension_override = { reason: extensionReason, revised_due_date: dueDate, approved_by: 'admin' }
      }
      await onSave(entry.id, payload)
      onClose()
    } catch (err) {
      notify.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[var(--color-text)]">Edit Deadline</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="mb-3">
          <p className="text-sm font-medium text-[var(--color-text)]">BIR {entry.form_type}</p>
          <p className="text-xs text-[var(--color-muted-fg)]">{entry.description} · {entry.entity} · {entry.period_covered}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-fg)]">Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-fg)]">Holiday Rule</label>
            <select value={holidayRule} onChange={e => setHolidayRule(e.target.value)} className={inputCls}>
              <option value="next_working_day">Move to next working day</option>
              <option value="previous_working_day">Move to previous working day</option>
              <option value="none">No adjustment</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-fg)]">Extension Reason (optional, e.g. RMC reference)</label>
            <input type="text" value={extensionReason} onChange={e => setExtensionReason(e.target.value)} placeholder="e.g. RMC 12-2026 deadline extension" className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded" />
            <span className="text-[var(--color-text)]">Active (uncheck to mark as N/A for this period)</span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary)]/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Day Cell ────────────────────────────────────────────────────────────────

function DayCell({ day, deadlines, isToday, isCurrentMonth, onSelect, selected }) {
  if (!day) return <div className="min-h-[90px] border-b border-r border-[var(--color-border)]" />

  const hasDeadlines = deadlines.length > 0
  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      className={cn(
        'relative min-h-[90px] border-b border-r border-[var(--color-border)] p-1 text-left transition-colors',
        isCurrentMonth ? 'bg-white hover:bg-sky-50/50' : 'bg-slate-50/50',
        selected && 'ring-2 ring-inset ring-[var(--color-primary)]',
        isToday && 'bg-sky-50/80',
      )}
    >
      <span className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
        isToday && 'bg-[var(--color-primary)] text-white',
        !isToday && isCurrentMonth && 'text-slate-700',
        !isCurrentMonth && 'text-slate-400',
      )}>
        {day}
      </span>

      {hasDeadlines && (
        <div className="mt-0.5 space-y-[2px]">
          {deadlines.slice(0, 3).map((d, i) => {
            const color = getFormColor(d.form_type)
            const statusConf = STATUS_COLORS[d.status] || STATUS_COLORS.pending
            return (
              <div
                key={i}
                className="flex items-center gap-1 rounded px-1 py-[1px] text-[9px] font-medium leading-tight truncate"
                style={{ backgroundColor: color + '18', color }}
                title={`${d.form_type} — ${d.entity} (${d.period_covered})`}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusConf.dot)} />
                <span className="truncate">{d.form_type}</span>
              </div>
            )
          })}
          {deadlines.length > 3 && (
            <span className="text-[9px] text-slate-400 pl-1">+{deadlines.length - 3} more</span>
          )}
        </div>
      )}
    </button>
  )
}

// ─── Day Detail Panel ────────────────────────────────────────────────────────

function DayDetailPanel({ day, month, year, deadlines, onEdit }) {
  if (!day || deadlines.length === 0) return null

  const dateStr = new Date(year, month, day).toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={16} className="text-[var(--color-primary)]" />
        <h4 className="text-sm font-semibold text-[var(--color-text)]">{dateStr}</h4>
        <span className="ml-auto text-xs text-[var(--color-muted-fg)]">{deadlines.length} deadline{deadlines.length > 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-2">
        {deadlines.map((d, i) => {
          const color = getFormColor(d.form_type)
          const statusConf = STATUS_COLORS[d.status] || STATUS_COLORS.pending
          return (
            <div key={i} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full" style={{ backgroundColor: color }} />
                <div>
                  <p className="text-xs font-semibold text-[var(--color-text)]">BIR {d.form_type}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)]">{d.description}</p>
                  <p className="text-[10px] text-[var(--color-muted-fg)]">{d.entity} · {d.period_covered} · {d.frequency}</p>
                  {d.extension_override?.reason && (
                    <p className="text-[10px] text-amber-600 font-medium mt-0.5">Extension: {d.extension_override.reason}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold', statusConf.text)} style={{ backgroundColor: color + '15' }}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', statusConf.dot)} />
                  {statusConf.label}
                </span>
                <button onClick={() => onEdit(d)} className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Edit deadline">
                  <Pencil size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Calendar Component ────────────────────────────────────────────────

export function TaxFilingCalendar({ entity }) {
  const [calendarData, setCalendarData] = useState([])
  const [reminderData, setReminderData] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const [editingEntry, setEditingEntry] = useState(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const ep = entity && entity !== 'All' ? `entity=${entity}` : ''
      const [cal, rem] = await Promise.all([
        apiGet(`/tax/reminders/calendar?${ep}&taxable_year=${year}`),
        apiGet(`/tax/reminders/?${ep}`),
      ])
      setCalendarData(cal || [])
      setReminderData(rem || [])
    } catch {
      // silent — calendar is supplementary
    } finally {
      setLoading(false)
    }
  }, [entity, year])

  useEffect(() => { fetchData() }, [fetchData])

  // Merge calendar entries with reminder statuses
  const deadlinesByDate = useMemo(() => {
    const map = {}
    for (const entry of calendarData) {
      if (!entry.is_active) continue
      const dueDate = entry.due_date
      if (!dueDate) continue
      if (!map[dueDate]) map[dueDate] = []

      // Find matching reminder for status
      const reminder = reminderData.find(r =>
        r.calendar_id === entry.id || (r.form_type === entry.form_type && r.entity === entry.entity && r.period_covered === entry.period_covered)
      )

      map[dueDate].push({
        ...entry,
        status: reminder?.status || 'pending',
        reminder_id: reminder?.id,
      })
    }
    return map
  }, [calendarData, reminderData])


  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  const todayDay = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : null

  const cells = []
  // Previous month filler
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, currentMonth: false })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true })
  }
  // Next month filler
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, currentMonth: false })
  }

  function getDeadlinesForDay(day, isCurrentMonth) {
    if (!isCurrentMonth) return []
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return deadlinesByDate[dateStr] || []
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDay(null)
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDay(null)
  }
  function goToday() {
    setCurrentDate(new Date())
    setSelectedDay(today.getDate())
  }

  async function handleSaveEdit(calendarId, payload) {
    await apiPatch(`/tax/reminders/calendar/${calendarId}`, payload)
    notify.success('Deadline updated')
    fetchData()
  }

  const monthLabel = currentDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  const selectedDeadlines = selectedDay ? getDeadlinesForDay(selectedDay, true) : []


  // Count stats for the legend
  const monthStats = useMemo(() => {
    let overdue = 0, upcoming = 0, filed = 0
    for (const [dateStr, entries] of Object.entries(deadlinesByDate)) {
      if (!dateStr.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) continue
      for (const e of entries) {
        if (e.status === 'overdue') overdue++
        else if (e.status === 'filed' || e.status === 'completed') filed++
        else upcoming++
      }
    }
    return { overdue, upcoming, filed }
  }, [deadlinesByDate, year, month])

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <CalendarDays size={18} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Tax Filing Calendar</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Stats */}
          {monthStats.overdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> {monthStats.overdue} overdue
            </span>
          )}
          {monthStats.upcoming > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {monthStats.upcoming} upcoming
            </span>
          )}
          {monthStats.filed > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {monthStats.filed} filed
            </span>
          )}
          {/* Nav */}
          <button onClick={goToday} className="px-2 py-1 text-[10px] font-medium rounded-md border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50">Today</button>
          <button onClick={prevMonth} className="p-1 rounded-md hover:bg-slate-100 text-slate-500"><ChevronLeft size={16} /></button>
          <span className="text-sm font-semibold text-[var(--color-text)] min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="p-1 rounded-md hover:bg-slate-100 text-slate-500"><ChevronRight size={16} /></button>
        </div>
      </div>


      {/* Calendar Grid */}
      <div>
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="border-r border-[var(--color-border)] px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-fg)]">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => (
            <DayCell
              key={i}
              day={cell.day}
              isCurrentMonth={cell.currentMonth}
              isToday={cell.currentMonth && cell.day === todayDay}
              deadlines={getDeadlinesForDay(cell.day, cell.currentMonth)}
              selected={cell.currentMonth && cell.day === selectedDay}
              onSelect={(d) => setSelectedDay(d === selectedDay ? null : d)}
            />
          ))}
        </div>
      </div>

      {/* Selected Day Detail */}
      {selectedDay && selectedDeadlines.length > 0 && (
        <div className="border-t border-[var(--color-border)] p-4">
          <DayDetailPanel
            day={selectedDay}
            month={month}
            year={year}
            deadlines={selectedDeadlines}
            onEdit={setEditingEntry}
          />
        </div>
      )}

      {/* Empty state when no data */}
      {!loading && calendarData.length === 0 && (
        <div className="px-5 py-8 text-center">
          <CalendarDays size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-[var(--color-muted-fg)]">No calendar data yet.</p>
          <p className="text-xs text-[var(--color-muted-fg)] mt-1">Go to the Reminders tab and click "Generate Reminders" to populate the calendar automatically.</p>
        </div>
      )}

      {/* Edit Modal */}
      {editingEntry && (
        <EditDeadlineModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  )
}
