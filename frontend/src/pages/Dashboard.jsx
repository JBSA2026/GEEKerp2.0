import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileText,
  FolderKanban,
  Landmark,
  Loader2,
  Package,
  ShoppingCart,
  Target,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Drawer } from '@/components/ui/overlay'
import { cn } from '@/lib/utils'

import expediaLogo from '@/assets/company-logos/Expedia.png'
import glabLogo from '@/assets/company-logos/GLab.png'
import exigentLogo from '@/assets/company-logos/exigent.png'
import ksiLogo from '@/assets/company-logos/KSI.png'

const BASE = import.meta.env.VITE_API_URL

const DASHBOARD_ENTITIES = [
  { value: 'All', label: 'All companies', logo: null },
  { value: 'Expedia', label: 'Expedia (EXSSI)', logo: expediaLogo },
  { value: 'GreatnessLab', label: 'GreatnessLab', logo: glabLogo },
  { value: 'Exigent', label: 'Exigent Corporation', logo: exigentLogo },
  { value: 'KSI', label: 'Kyrios Solutions Inc.', logo: ksiLogo },
]

const DEADLINES = [
  { day: 10, label: 'SSS contribution', detail: 'Employer and employee contribution', source: 'Compliance', icon: Landmark, tone: 'burgundy' },
  { day: 10, label: 'PhilHealth premium', detail: 'Monthly health insurance premium', source: 'Compliance', icon: Building2, tone: 'green' },
  { day: 12, label: 'Pag-IBIG Fund', detail: 'Monthly housing fund contribution', source: 'Compliance', icon: Wallet, tone: 'gold' },
  { day: 15, label: 'Withholding tax', detail: 'Form 0619E/1601E remittance', source: 'Tax filing', icon: FileText, tone: 'blue' },
  { day: 20, label: 'Monthly VAT', detail: 'Value-added tax return', source: 'Tax filing', icon: FileText, tone: 'blue' },
  { day: 25, label: 'Quarterly VAT', detail: 'Form 2550Q filing', source: 'Tax filing', icon: ClipboardCheck, tone: 'green', quarterly: true },
]

const TONES = {
  burgundy: { dot: 'bg-[#8f263f]', icon: 'text-[#8f263f]', wash: 'bg-[#fbf0f2]', bar: 'bg-[#8f263f]' },
  gold: { dot: 'bg-[#d5a536]', icon: 'text-[#a76f00]', wash: 'bg-[#fff8e7]', bar: 'bg-[#d5a536]' },
  green: { dot: 'bg-[#6da84f]', icon: 'text-[#4e7d37]', wash: 'bg-[#f1f8ed]', bar: 'bg-[#6da84f]' },
  blue: { dot: 'bg-[#315bc7]', icon: 'text-[#315bc7]', wash: 'bg-[#eff3ff]', bar: 'bg-[#315bc7]' },
}

function money(value) {
  return `₱ ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dateAtDay(baseDate, day) {
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), day)
  if (date < new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())) date.setMonth(date.getMonth() + 1)
  return date
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function Panel({ title, icon: Icon, action, children, className = '', fill = false }) {
  return (
    <section className={cn('rounded-2xl bg-white p-1 ring-1 ring-[#dfe5ed] shadow-[0_16px_40px_rgba(38,50,79,0.06)]', fill ? 'h-full self-stretch' : 'self-start', className)}>
      <div className={cn('overflow-hidden rounded-[0.82rem] bg-white', fill && 'flex h-full flex-col')}>
        <header className="flex items-center justify-between gap-4 px-5 pb-3 pt-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <Icon aria-hidden="true" size={18} strokeWidth={1.65} className="shrink-0 text-[#52617a]" />}
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.015em] text-[#1e2b42]">{title}</h2>
          </div>
          {action}
        </header>
        {children}
      </div>
    </section>
  )
}

function Metric({ icon: Icon, label, value, detail, summary, state, tone }) {
  const colors = TONES[tone]
  return (
    <article className="relative flex min-h-[12.25rem] min-w-0 flex-col overflow-hidden rounded-xl border border-[#dfe5ed] bg-white px-4 py-4 shadow-[0_2px_8px_rgba(38,50,79,0.045)] transition-colors duration-150 hover:border-[#c9d3e2]">
      <div className={cn('absolute left-0 top-0 h-1 w-full', colors.bar)} />
      <div className="flex items-start justify-between gap-3 pt-1">
        <p className="text-xs font-medium text-[#66748a]">{label}</p>
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', colors.wash)}>
          <Icon aria-hidden="true" size={15} strokeWidth={1.7} className={colors.icon} />
        </div>
      </div>
      <p className="mt-5 truncate text-[clamp(1.45rem,2.15vw,1.95rem)] font-semibold tracking-[-0.045em] text-[#172033] tabular-nums">{value}</p>
      <div className="mt-auto border-t border-[#edf0f4] pt-3">
        <p className="text-xs font-semibold leading-5 text-[#344259]">{summary}</p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] leading-4 text-[#7b8799]">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', colors.dot)} />
          <span className="truncate">{detail}</span>
        </div>
        {state && <p className="mt-2 text-[11px] font-medium text-[#5c6980]">{state}</p>}
      </div>
    </article>
  )
}

function ActionRow({ item, selectedDate }) {
  const Icon = item.icon
  const tone = TONES[item.tone]
  const dueToday = item.date.toDateString() === selectedDate.toDateString()
  const dateLabel = item.date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

  return (
    <Link to={item.to} className={cn('group flex items-start gap-3 border-t border-[#e8edf3] px-4 py-3.5 transition-colors duration-200 hover:bg-[#f6f8fb] focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#315bc7]', dueToday && 'bg-[#f6f8fb]')}>
      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone.wash)}>
        <Icon aria-hidden="true" size={16} strokeWidth={1.75} className={tone.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium leading-5 text-[#273449]">{item.label}</p>
          <span className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', tone.dot)} />
        </div>
        <p className="mt-0.5 text-xs leading-5 text-[#77849a]">{item.detail}</p>
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="font-medium text-[#52617a]">{item.source}</span>
          <span className="text-[#a3adbb]">•</span>
          <span className={item.urgent ? 'font-medium text-[#8f263f]' : 'text-[#77849a]'}>{item.dateOnly ? `Due ${dateLabel}` : 'Needs action'}</span>
        </div>
      </div>
    </Link>
  )
}

function FullCalendarView({ open, onClose, actions, today }) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(today)
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPreviousMonth = new Date(year, month, 0).getDate()
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - firstWeekday + 1
    if (dayNumber < 1) return { date: new Date(year, month - 1, daysInPreviousMonth + dayNumber), currentMonth: false }
    if (dayNumber > daysInMonth) return { date: new Date(year, month + 1, dayNumber - daysInMonth), currentMonth: false }
    return { date: new Date(year, month, dayNumber), currentMonth: true }
  })
  const selectedActions = actions.filter((item) => dateKey(item.date) === dateKey(selectedDate))

  function changeMonth(offset) {
    const nextMonth = new Date(year, month + offset, 1)
    setCurrentMonth(nextMonth)
    setSelectedDate(nextMonth)
  }

  return (
    <Drawer open={open} onClose={onClose} title="Full calendar" subtitle="Compliance deadlines and operational actions" className="max-w-6xl bg-white">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#1e2b42]">{currentMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</h3>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-md text-[#60708b] hover:bg-[#f1f4f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315bc7]"><ChevronLeft size={17} strokeWidth={1.8} /></button>
              <button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-md text-[#60708b] hover:bg-[#f1f4f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315bc7]"><ChevronRight size={17} strokeWidth={1.8} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 border-l border-t border-[#e5eaf0]">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="border-b border-r border-[#e5eaf0] px-2 py-2 text-center text-[11px] font-medium text-[#7b8799]">{day}</div>)}
            {cells.map(({ date, currentMonth: isCurrentMonth }) => {
              const dayActions = actions.filter((item) => dateKey(item.date) === dateKey(date))
              const selected = dateKey(date) === dateKey(selectedDate)
              const isToday = dateKey(date) === dateKey(today)
              return (
                <button key={dateKey(date)} type="button" onClick={() => setSelectedDate(date)} className={cn('min-h-24 border-b border-r border-[#e5eaf0] p-2 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#315bc7]', !isCurrentMonth && 'bg-[#fafbfc] text-[#a8b1bd]', selected && 'bg-[#edf2ff]', !selected && isCurrentMonth && 'hover:bg-[#f7f9fc]')}>
                  <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-xs font-semibold', isToday && 'bg-[#315bc7] text-white', !isToday && isCurrentMonth && 'text-[#415067]')}>{date.getDate()}</span>
                  <div className="mt-2 space-y-1">
                    {dayActions.slice(0, 2).map((item) => <span key={`${item.source}-${item.label}`} className={cn('block truncate rounded-sm px-1.5 py-0.5 text-[10px] font-medium', TONES[item.tone].wash, TONES[item.tone].icon)}>{item.label}</span>)}
                    {dayActions.length > 2 && <span className="block px-1.5 text-[10px] text-[#637188]">+{dayActions.length - 2} more</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
        <aside className="border-t border-[#e5eaf0] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="text-sm font-semibold text-[#273449]">{selectedDate.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          {selectedActions.length > 0 ? (
            <div className="mt-4 space-y-3">
              {selectedActions.map((item) => {
                const Icon = item.icon
                return <Link to={item.to} key={`${item.source}-${item.label}`} className="flex gap-3 border-b border-[#edf0f4] pb-3 last:border-b-0 hover:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315bc7]"><Icon aria-hidden="true" size={17} strokeWidth={1.7} className={cn('mt-0.5 shrink-0', TONES[item.tone].icon)} /><div><p className="text-sm font-medium text-[#344259]">{item.label}</p><p className="mt-1 text-xs leading-5 text-[#7b8799]">{item.detail}</p><p className="mt-1.5 text-[11px] font-medium text-[#60708b]">{item.source}</p></div></Link>
              })}
            </div>
          ) : <p className="mt-4 text-sm leading-6 text-[#7b8799]">No reminders or actions are scheduled for this date.</p>}
        </aside>
      </div>
    </Drawer>
  )
}

function ActionSchedule({ apiData }) {
  const today = useMemo(() => new Date(), [])
  const [selectedDate, setSelectedDate] = useState(today)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const week = useMemo(() => {
    const start = new Date(today)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [today])

  const actions = useMemo(() => {
    const deadlines = DEADLINES
      .filter((deadline) => !deadline.quarterly || [0, 3, 6, 9].includes(today.getMonth()))
      .map((deadline) => ({ ...deadline, date: dateAtDay(today, deadline.day), dateOnly: true, urgent: false, to: '/tax/reminders' }))

    if (!apiData) return deadlines

    const operational = [
      apiData.approvals.pending_count > 0 && { label: `${apiData.approvals.pending_count} pending approval${apiData.approvals.pending_count === 1 ? '' : 's'}`, detail: 'Review requests waiting for a decision', source: 'Approvals', icon: ClipboardCheck, tone: 'burgundy', date: today, urgent: true, to: '/workflow' },
      apiData.inventory.low_stock_count > 0 && { label: `${apiData.inventory.low_stock_count} low-stock item${apiData.inventory.low_stock_count === 1 ? '' : 's'}`, detail: 'Review replenishment needs before stock runs out', source: 'Inventory', icon: TriangleAlert, tone: 'gold', date: today, urgent: true, to: '/inventory/list' },
      apiData.purchase_orders.open_count > 0 && { label: `${apiData.purchase_orders.open_count} open purchase order${apiData.purchase_orders.open_count === 1 ? '' : 's'}`, detail: 'Confirm delivery dates and receiving status', source: 'Purchasing', icon: ShoppingCart, tone: 'blue', date: today, urgent: false, to: '/purchasing/orders' },
      apiData.opportunities.open_count > 0 && { label: `${apiData.opportunities.open_count} open opportunit${apiData.opportunities.open_count === 1 ? 'y' : 'ies'}`, detail: `Pipeline value ${money(apiData.opportunities.pipeline_value)}`, source: 'CRM / Sales', icon: Target, tone: 'green', date: today, urgent: false, to: '/crm/pipeline' },
    ].filter(Boolean)

    return [...operational, ...deadlines].sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.date - b.date)
  }, [apiData, today])

  const weeklyActions = useMemo(() => {
    const weekStart = week[0]
    const weekEnd = new Date(week[6])
    weekEnd.setHours(23, 59, 59, 999)

    return actions.filter((item) => item.date >= weekStart && item.date <= weekEnd)
  }, [actions, week])

  return (
    <>
      <Panel fill className="xl:h-[34rem]" title="Action schedule" icon={CalendarDays} action={<button type="button" onClick={() => setCalendarOpen(true)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[#315bc7] transition-colors hover:bg-[#edf2ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315bc7]"><CalendarDays aria-hidden="true" size={14} strokeWidth={1.7} />Full calendar</button>}>
      <div className="px-4 pb-4">
        <div className="grid grid-cols-7 gap-1 rounded-xl bg-[#f6f8fb] p-1.5">
          {week.map((date) => {
            const isSelected = date.toDateString() === selectedDate.toDateString()
            const count = actions.filter((item) => item.date.toDateString() === date.toDateString()).length
            return (
              <button key={date.toDateString()} type="button" onClick={() => setSelectedDate(date)} className={cn('relative min-h-14 rounded-lg px-1 py-2 text-center transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315bc7]', isSelected ? 'bg-[#315bc7] text-white shadow-[0_5px_12px_rgba(49,91,199,0.20)]' : 'text-[#66748a] hover:bg-white')}>
                <span className="block text-[10px] font-medium">{date.toLocaleDateString('en-PH', { weekday: 'short' })}</span>
                <span className="mt-0.5 block text-sm font-semibold tabular-nums">{date.getDate()}</span>
                {count > 0 && <span className={cn('mx-auto mt-1 block h-1 w-1 rounded-full', isSelected ? 'bg-white' : 'bg-[#8f263f]')} />}
              </button>
            )
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-b border-[#e8edf3]">
        {weeklyActions.length ? (
          weeklyActions.map((item) => <ActionRow key={`${item.source}-${item.label}`} item={item} selectedDate={selectedDate} />)
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-[#7b899f]">
            No reminders or actions are due this week.
          </div>
        )}
      </div>
      <p className="px-5 py-3 text-[11px] leading-5 text-[#7b8799]">Compliance deadlines and operational tasks are kept together so the next action is always visible.</p>
      </Panel>
      <FullCalendarView open={calendarOpen} onClose={() => setCalendarOpen(false)} actions={actions} today={today} />
    </>
  )
}

function DistributionPanel({ title, data, totalLabel, totalValue, tone }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const colors = TONES[tone]

  return (
    <Panel fill className="lg:h-[20rem]" title={title}>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-1">
        {data.length > 0 ? (
          <div className="space-y-4">
            {data.map((item) => {
              const percentage = total > 0 ? Math.max((Number(item.value) / total) * 100, 4) : 0
              return (
                <div key={item.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm capitalize text-[#55637a]">{item.label.replace(/_/g, ' ')}</span>
                    <span className="shrink-0 text-sm font-semibold text-[#26344b] tabular-nums">{item.value}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf0f4]">
                    <div className={cn('h-full rounded-full', colors.bar)} style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : <div className="flex min-h-32 items-center justify-center text-sm text-[#8a95a6]">No records for this company.</div>}
        <div className="mt-auto flex items-center justify-between border-t border-[#e8edf3] pt-4">
          <span className="text-xs text-[#7c889a]">{totalLabel}</span>
          <span className="text-lg font-semibold tracking-[-0.03em] text-[#1e2b42] tabular-nums">{totalValue}</span>
        </div>
      </div>
    </Panel>
  )
}

function FinancialSummary({ apiData }) {
  const rows = apiData ? [
    ['AR outstanding', money(apiData.accounts_receivable.outstanding), 'burgundy'],
    ['AP outstanding', money(apiData.accounts_payable.outstanding), 'gold'],
    ['Inventory value', money(apiData.inventory.total_value), 'green'],
    ['Pipeline value', money(apiData.opportunities.pipeline_value), 'blue'],
    ['Total project budget', money(apiData.projects.total_budget), 'blue'],
  ] : []

  return (
    <Panel fill className="xl:h-[21rem]" title="Financial summary" icon={Wallet}>
      <div className="flex flex-1 flex-col px-5 pb-3 pt-1">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="flex flex-1 items-center justify-between gap-4 border-t border-[#e8edf3] py-3 first:border-t-0">
            <span className="flex min-w-0 items-center gap-2 text-sm text-[#5d6b80]"><span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONES[tone].dot)} />{label}</span>
            <span className="shrink-0 text-sm font-semibold text-[#273449] tabular-nums">{value}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export default function Dashboard() {
  const { onLogout } = useOutletContext()
  const [entity, setEntity] = useState('All')
  const [entityOpen, setEntityOpen] = useState(false)
  const [apiData, setApiData] = useState(null)
  const [loading, setLoading] = useState(true)
  const selectedEntity = DASHBOARD_ENTITIES.find((item) => item.value === entity) || DASHBOARD_ENTITIES[0]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = entity !== 'All' ? `?entity=${entity}` : ''
      const response = await fetch(`${BASE}/dashboard/summary${params}`, { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } })
      if (response.ok) setApiData(await response.json())
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [entity])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  const financialMetrics = apiData ? [
    {
      icon: Landmark,
      label: 'Accounts receivable',
      value: money(apiData.accounts_receivable.outstanding),
      summary: apiData.accounts_receivable.invoice_count > 0 ? 'Collection follow-up required' : 'No collection action needed',
      detail: `${apiData.accounts_receivable.invoice_count} invoices outstanding`,
      state: 'Current ledger balance',
      tone: 'burgundy',
    },
    {
      icon: CreditCard,
      label: 'Accounts payable',
      value: money(apiData.accounts_payable.outstanding),
      summary: apiData.accounts_payable.bill_count > 0 ? 'Review scheduled payments' : 'No payment action needed',
      detail: `${apiData.accounts_payable.bill_count} bills outstanding`,
      state: 'Current ledger balance',
      tone: 'gold',
    },
    {
      icon: Package,
      label: 'Inventory value',
      value: money(apiData.inventory.total_value),
      summary: apiData.inventory.low_stock_count > 0 ? 'Replenishment review required' : 'Stock levels are within range',
      detail: `${apiData.inventory.total_items} items on hand`,
      state: `${apiData.inventory.low_stock_count} low-stock items`,
      tone: 'green',
    },
    {
      icon: FolderKanban,
      label: 'Active projects',
      value: String(apiData.projects.active_count),
      summary: `${apiData.projects.total_count} total projects in the portfolio`,
      detail: `Budget ${money(apiData.projects.total_budget)}`,
      state: 'Current project delivery view',
      tone: 'blue',
    },
  ] : []

  const opportunityStages = apiData ? Object.entries(apiData.opportunities.by_stage || {}).map(([label, value]) => ({ label, value })) : []
  const projectStatus = apiData ? Object.entries(apiData.projects.by_status || {}).map(([label, value]) => ({ label, value })) : []
  const employeeDistribution = apiData ? Object.entries(apiData.employees.by_entity || {}).map(([label, value]) => ({ label, value })) : []

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar title="Dashboard" subtitle="A clear view of the work, money, and deadlines that need attention." onLogout={onLogout} />
      <main className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_80%_0%,rgba(49,91,199,0.055),transparent_27rem),radial-gradient(circle_at_5%_10%,rgba(143,38,63,0.045),transparent_24rem),#f6f8fb] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 lg:gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative">
              <button type="button" onClick={() => setEntityOpen((open) => !open)} aria-expanded={entityOpen} className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-medium text-[#36445a] ring-1 ring-[#dfe5ed] shadow-[0_8px_20px_rgba(38,50,79,0.05)] transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_10px_24px_rgba(38,50,79,0.09)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315bc7]">
                {selectedEntity.logo ? <img src={selectedEntity.logo} alt="" className="h-4 w-4 object-contain" /> : <Building2 aria-hidden="true" size={16} strokeWidth={1.7} className="text-[#52617a]" />}
                {selectedEntity.label}
                <ChevronDown aria-hidden="true" size={15} strokeWidth={1.7} className={cn('text-[#7b8799] transition-transform duration-200', entityOpen && 'rotate-180')} />
                {loading && <Loader2 aria-label="Loading dashboard data" size={14} className="animate-spin text-[#7b8799]" />}
              </button>
              {entityOpen && (
                <ul className="absolute left-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl bg-white py-1.5 ring-1 ring-[#dfe5ed] shadow-[0_16px_30px_rgba(38,50,79,0.12)]">
                  {DASHBOARD_ENTITIES.map((item) => (
                    <li key={item.value}>
                      <button type="button" onClick={() => { setEntity(item.value); setEntityOpen(false) }} className={cn('flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors duration-150', entity === item.value ? 'bg-[#edf2ff] font-medium text-[#263b72]' : 'text-[#4d5b70] hover:bg-[#f6f8fb]')}>
                        {item.logo ? <img src={item.logo} alt="" className="h-4 w-4 object-contain" /> : <Building2 aria-hidden="true" size={16} strokeWidth={1.7} className="text-[#60708b]" />}
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-[#77849a]">{loading ? 'Refreshing company data' : 'Data reflects the selected company view'}</p>
          </div>

          <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.42fr)_minmax(22rem,0.78fr)]">
            <Panel fill title="Financial outlook" icon={Wallet} className="min-w-0 xl:h-[34rem]">
              <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-3 px-5 pb-5 pt-1 sm:grid-cols-2">
                {financialMetrics.map((metric) => <Metric key={metric.label} {...metric} />)}
              </div>
            </Panel>
            <ActionSchedule apiData={apiData} />
          </section>

          <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.42fr)_minmax(22rem,0.78fr)]">
            <Panel fill className="xl:h-[21rem]" title="Operational picture" icon={ClipboardCheck}>
              <div className="grid flex-1 gap-px overflow-hidden rounded-b-[0.82rem] bg-[#e8edf3] sm:grid-cols-3">
                {[
                  ['Open opportunities', apiData ? String(apiData.opportunities.open_count) : '0', apiData ? `Pipeline ${money(apiData.opportunities.pipeline_value)}` : 'Pipeline value', Target, 'green'],
                  ['Pending approvals', apiData ? String(apiData.approvals.pending_count) : '0', 'Awaiting action', ClipboardCheck, 'burgundy'],
                  ['Low-stock items', apiData ? String(apiData.inventory.low_stock_count) : '0', 'Need replenishment', TriangleAlert, 'gold'],
                ].map(([label, value, detail, Icon, tone]) => (
                  <div key={label} className="flex h-full flex-col bg-white px-5 py-5">
                    <Icon aria-hidden="true" size={17} strokeWidth={1.7} className={TONES[tone].icon} />
                    <p className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[#1d2a40] tabular-nums">{value}</p>
                    <p className="mt-1 text-sm font-medium text-[#4d5b70]">{label}</p>
                    <p className="mt-auto pt-4 text-[11px] text-[#8190a3]">{detail}</p>
                  </div>
                ))}
              </div>
            </Panel>
            <FinancialSummary apiData={apiData} />
          </section>

          <section className="grid items-stretch gap-5 lg:grid-cols-3">
            <DistributionPanel title="Opportunities by stage" data={opportunityStages} totalLabel="Total opportunities" totalValue={apiData ? String(apiData.opportunities.total_count) : '0'} tone="burgundy" />
            <DistributionPanel title="Project status" data={projectStatus} totalLabel="Total projects" totalValue={apiData ? String(apiData.projects.total_count) : '0'} tone="blue" />
            <DistributionPanel title="Employees by company" data={employeeDistribution} totalLabel="Total employees" totalValue={apiData ? String(apiData.employees.total) : '0'} tone="green" />
          </section>
        </div>
      </main>
    </div>
  )
}
