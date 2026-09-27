import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toISODate, fromISODate, formatDateDisplay } from '@/utils/format'

// ─── DatePicker ─────────────────────────────────────────────────────────────
// Themed calendar input. Stores ISO date strings (YYYY-MM-DD).
//
//   <DatePicker value={form.activity_date} onChange={v => setField('activity_date', v)} />
//
// The calendar accent colors are driven by the global design tokens via the
// react-day-picker CSS variables, so it matches the rest of the UI.
export function DatePicker({ value, onChange, placeholder = 'Select date', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const selected = fromISODate(value)

  function handleSelect(date) {
    onChange?.(date ? toISODate(date) : '')
    setOpen(false)
  }

  function clear(e) {
    e.stopPropagation()
    onChange?.('')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex w-full items-center justify-between rounded-lg border border-[#d8e2ef] bg-white px-3 py-2 text-sm transition-colors focus:border-[#2c3a61] focus:outline-none focus:ring-1 focus:ring-[#2c3a61]/40',
          value ? 'text-slate-900' : 'text-slate-400',
          className,
        )}
      >
        <span className="flex items-center gap-2">
          <CalendarDays size={15} className="text-slate-400" />
          {value ? formatDateDisplay(value) : placeholder}
        </span>
        {value && (
          <span onClick={clear} className="text-slate-400 hover:text-slate-600" aria-label="Clear date">
            <X size={14} />
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-[9999] mt-2 rounded-xl border border-[#d8e2ef] bg-[#edf4fb] p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
          style={{
            '--rdp-accent-color': 'var(--color-primary)',
            '--rdp-accent-background-color': 'var(--color-accent)',
            '--rdp-today-color': 'var(--color-primary)',
            '--rdp-day-width': '2.1rem',
            '--rdp-day-height': '2.1rem',
            '--rdp-day_button-width': '2.1rem',
            '--rdp-day_button-height': '2.1rem',
          }}
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected}
            showOutsideDays
            classNames={{
              caption_label: 'text-sm font-medium text-slate-800',
              nav_button: 'text-slate-500 hover:text-[#2c3a61]',
              weekday: 'text-[11px] font-medium text-slate-400',
              day: 'text-sm text-slate-700',
            }}
          />
        </div>
      )}
    </div>
  )
}
