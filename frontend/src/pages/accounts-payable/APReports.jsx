import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Clock,
  Gauge,
  WalletCards,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorBox, Loading } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form'
import { money } from '@/components/aprar/format'
import {
  fetchApAging,
  fetchApPaymentSchedule,
  fetchApPayments,
  fetchApSupplierBalances,
} from '@/utils/api'
import { formatDate } from './apUtils'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CHART_COLORS = ['#2c3a61', '#25a6a0', '#f59e0b', '#e11d48', '#7c3aed', '#64748b']

function pad(value) {
  return String(value).padStart(2, '0')
}

function isoDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function lastDayOfMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate()
}

function currentSeed() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return {
    month,
    quarter: Math.floor((month - 1) / 3) + 1,
    year,
    from: isoDate(year, month, 1),
    to: isoDate(year, month, lastDayOfMonth(year, month)),
  }
}

function parseLocalDate(value) {
  if (!value) return null
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function dayDiff(from, to) {
  const start = parseLocalDate(from)
  const end = parseLocalDate(to)
  if (!start || !end) return 0
  return Math.max(0, Math.round((end - start) / 86400000))
}

function shortMoney(value, currency = 'PHP') {
  const currencyCode = currency === 'USD' ? 'USD' : 'PHP'
  return new Intl.NumberFormat(currencyCode === 'USD' ? 'en-US' : 'en-PH', {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function sumRows(rows, key) {
  return rows.reduce((total, row) => total + Number(row?.[key] || 0), 0)
}

function currencyTotals(rows, key) {
  return rows.reduce((totals, row) => {
    const currency = row?.currency_code || 'PHP'
    totals[currency] = (totals[currency] || 0) + Number(row?.[key] || 0)
    return totals
  }, {})
}

function formatCurrencyTotals(totals) {
  return Object.entries(totals || {})
    .map(([currency, value]) => money(value, currency))
    .join(' + ') || money(0)
}

function groupByDate(rows, dateKey, valueKey, period) {
  const span = dayDiff(period.from, period.to)
  const mode = period.type === 'yearly' || span > 120 ? 'month' : span > 45 ? 'week' : 'day'
  const periodStart = parseLocalDate(period.from)
  const groups = new Map()

  rows.forEach(row => {
    const date = parseLocalDate(row?.[dateKey])
    if (!date) return

    let dateLabel
    let order
    if (mode === 'month') {
      dateLabel = MONTH_SHORT[date.getMonth()]
      order = date.getFullYear() * 100 + date.getMonth()
    } else if (mode === 'week') {
      const week = Math.floor((date - periodStart) / 604800000) + 1
      dateLabel = `Week ${week}`
      order = week
    } else {
      dateLabel = `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`
      order = date.getTime()
    }

    const currencyCode = row?.currency_code || 'PHP'
    const key = `${dateLabel}:${currencyCode}`
    const current = groups.get(key) || { label: `${dateLabel} (${currencyCode})`, currency_code: currencyCode, value: 0, order }
    current.value += Number(row?.[valueKey] || 0)
    groups.set(key, current)
  })

  return Array.from(groups.values())
    .sort((a, b) => a.order - b.order || a.currency_code.localeCompare(b.currency_code))
    .map(item => ({ ...item, value: Math.round(item.value * 100) / 100 }))
}

function groupByField(rows, fieldKey, valueKey) {
  const groups = new Map()
  rows.forEach(row => {
    const fieldLabel = row?.[fieldKey] || 'Unspecified'
    const currencyCode = row?.currency_code || 'PHP'
    const key = `${fieldLabel}:${currencyCode}`
    const current = groups.get(key) || { label: `${fieldLabel} (${currencyCode})`, currency_code: currencyCode, value: 0 }
    current.value += Number(row?.[valueKey] || 0)
    groups.set(key, current)
  })
  return Array.from(groups.values())
    .sort((a, b) => b.value - a.value)
    .map(item => ({ ...item, value: Math.round(item.value * 100) / 100 }))
}

function truncateLabel(value, length = 22) {
  const text = String(value || '-')
  return text.length > length ? `${text.slice(0, length - 1)}...` : text
}

const SOFT_SHADOW = 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_-18px_rgba(15,23,42,0.22)]'

function KpiCard({ icon: Icon, label, value, hint, tone = 'navy' }) {
  const tones = {
    navy: { icon: 'bg-[#eef4fc] text-[#2c3a61]', ring: 'from-[#eef4fc]' },
    teal: { icon: 'bg-teal-50 text-teal-600', ring: 'from-teal-50' },
    amber: { icon: 'bg-amber-50 text-amber-600', ring: 'from-amber-50' },
    rose: { icon: 'bg-rose-50 text-rose-500', ring: 'from-rose-50' },
  }[tone]

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-[#eef2f8] bg-white p-5 ${SOFT_SHADOW} transition-shadow duration-200 hover:shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_40px_-20px_rgba(15,23,42,0.3)]`}
    >
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${tones.ring} to-transparent opacity-70`} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-[#26324f]">{value}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones.icon}`}>
          <Icon size={19} />
        </span>
      </div>
      {hint && <p className="relative mt-2.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function ChartCard({ title, subtitle, code, children, className = '' }) {
  return (
    <Card className={`rounded-2xl border-[#eef2f8] ${SOFT_SHADOW} ${className}`}>
      <CardHeader className="px-5 pt-5 pb-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            {code && <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{code}</p>}
            <CardTitle className={code ? 'mt-1 text-[15px]' : 'text-[15px]'}>{title}</CardTitle>
            {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-3">{children}</CardContent>
    </Card>
  )
}

function HorizontalBars({ data, maxItems = 7, color = '#2c3a61', emptyTitle = 'No data for this period' }) {
  const rows = data.filter(item => Number(item.value) > 0).slice(0, maxItems)
  const max = Math.max(1, ...rows.map(item => Number(item.value || 0)))
  if (rows.length === 0) return <EmptyState title={emptyTitle} />

  return (
    <div className="space-y-3">
      {rows.map(item => {
        const width = Math.max(2, Math.round((Number(item.value || 0) / max) * 100))
        return (
          <div key={item.label} className="grid grid-cols-[120px_minmax(0,1fr)_92px] items-center gap-3 text-xs">
            <span className="truncate font-medium text-slate-600" title={item.label}>
              {truncateLabel(item.label, 18)}
            </span>
            <div className="h-7 overflow-hidden rounded-full bg-[#f1f5fb]">
              <div
                className="flex h-full items-center justify-end rounded-full px-2.5 text-[11px] font-semibold text-white transition-all duration-500 ease-out"
                style={{ width: `${width}%`, backgroundColor: item.color || color }}
              >
                {width > 24 ? shortMoney(item.value, item.currency_code) : ''}
              </div>
            </div>
            <span className="text-right font-semibold text-[#26324f]">{money(item.value, item.currency_code)}</span>
          </div>
        )
      })}
    </div>
  )
}

function ParetoChart({ data, maxItems = 8, emptyTitle = 'No data for this period' }) {
  const rows = data
    .filter(item => Number(item.value) > 0)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, maxItems)
  const total = sumRows(rows, 'value')
  const max = Math.max(1, ...rows.map(item => Number(item.value || 0)))
  const cumulativeValues = rows.reduce((values, item) => [
    ...values,
    (values[values.length - 1] || 0) + Number(item.value || 0),
  ], [])

  if (rows.length === 0 || total <= 0) return <EmptyState title={emptyTitle} />

  return (
    <div className="space-y-3">
      {rows.map((item, index) => {
        const width = Math.max(2, Math.round((Number(item.value || 0) / max) * 100))
        const cumulativePct = Math.round((cumulativeValues[index] / total) * 100)
        return (
          <div key={item.label} className="grid grid-cols-[120px_minmax(0,1fr)_104px] items-center gap-3 text-xs">
            <span className="truncate font-medium text-slate-600" title={item.label}>
              {truncateLabel(item.label, 18)}
            </span>
            <div className="relative h-7 overflow-hidden rounded-full bg-[#f1f5fb]">
              <div
                className="flex h-full items-center justify-end rounded-full px-2.5 text-[11px] font-semibold text-white"
                style={{ width: `${width}%`, backgroundColor: item.color || CHART_COLORS[index % CHART_COLORS.length] }}
              >
                {width > 24 ? shortMoney(item.value, item.currency_code) : ''}
              </div>
              <div
                className="absolute top-0 h-full border-r-2 border-[#26324f]/60"
                style={{ left: `${cumulativePct}%` }}
              />
            </div>
            <span className="text-right font-semibold text-[#26324f]">
              {money(item.value, item.currency_code)}
              <span className="ml-1 text-[10px] font-medium text-slate-400">{cumulativePct}%</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function LineTrend({ data, color = '#25a6a0', emptyTitle = 'No data for this period' }) {
  const rows = data.filter(item => Number(item.value) > 0)
  if (rows.length === 0) return <EmptyState title={emptyTitle} />

  const max = Math.max(1, ...rows.map(item => Number(item.value || 0)))
  const width = 420
  const height = 170
  const points = rows.map((item, index) => {
    const x = rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * width
    const y = height - (Number(item.value || 0) / max) * (height - 16) - 8
    return { ...item, x, y }
  })
  const polyline = points.map(point => `${point.x},${point.y}`).join(' ')
  const area = `${points[0].x},${height} ${polyline} ${points[points.length - 1].x},${height}`

  return (
    <div className="rounded-xl bg-gradient-to-b from-[#fafcff] to-white px-3 py-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[210px] w-full overflow-visible">
        <polygon points={area} fill={color} opacity="0.12" />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r="4.5" fill="white" stroke={color} strokeWidth="3" />
            <text x={point.x} y={Math.max(12, point.y - 10)} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">
              {shortMoney(point.value, point.currency_code)}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-between gap-3 text-[10px] font-medium text-slate-500">
        <span>{points[0]?.label}</span>
        <span className="text-slate-400">{rows.length} period point{rows.length === 1 ? '' : 's'}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  )
}

export function APReports() {
  const navigate = useNavigate()
  const seed = useMemo(() => currentSeed(), [])
  const [from, setFrom] = useState(seed.from)
  const [to, setTo] = useState(seed.to)
  const [data, setData] = useState({
    aging: null,
    schedule: null,
    balances: null,
    payments: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const generatedPeriod = {
    type: 'custom',
    from,
    to,
    label: `${formatDate(from)} to ${formatDate(to)}`,
  }

  const load = useCallback(async () => {
    if (!from || !to) {
      setError('Select a complete report range.')
      setLoading(false)
      return
    }
    if (to < from) {
      setError('The report end date must be on or after the start date.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [aging, schedule, balances, payments] = await Promise.all([
        fetchApAging({ to, as_of: to }),
        fetchApPaymentSchedule({ from, to }),
        fetchApSupplierBalances({ sort: 'balance', as_of: to }),
        fetchApPayments({ from, to }),
      ])
      setData({ aging, schedule, balances, payments })
    } catch (err) {
      setError(err.message || 'Unable to generate AP report')
      setData({ aging: null, schedule: null, balances: null, payments: null })
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    const timer = setTimeout(() => { load() }, 250)
    return () => clearTimeout(timer)
  }, [load])

  const agingRows = data.aging?.rows || []
  const scheduleRows = data.schedule?.rows || []
  const balanceRows = data.balances?.suppliers || []
  const paymentRows = data.payments?.rows || []
  const outstandingCurrencyTotals = currencyTotals(agingRows, 'outstanding_balance')
  const scheduleCurrencyTotals = currencyTotals(scheduleRows, 'outstanding_balance')
  const paymentCurrencyTotals = currencyTotals(paymentRows, 'payment_amount')
  const agingChart = groupByField(agingRows, 'aging_bucket', 'outstanding_balance').map((row, index) => ({
    ...row,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))
  const scheduleChart = groupByDate(scheduleRows, 'due_date', 'outstanding_balance', generatedPeriod)
  const paymentTimeline = groupByDate(paymentRows, 'payment_date', 'payment_amount', generatedPeriod)
  const paymentMethods = groupByField(paymentRows, 'payment_method', 'payment_amount')
  const supplierChart = balanceRows.map((row, index) => ({
    label: `${row.supplier_name || `Supplier ${row.supplier_id}`} (${row.currency_code || 'PHP'})`,
    currency_code: row.currency_code || 'PHP',
    value: Number(row.current_balance || 0),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))
  const overdueBillCount = agingRows.filter(row => row.aging_bucket !== 'Current').length
  const overduePercent = agingRows.length > 0 ? Math.round((overdueBillCount / agingRows.length) * 100) : 0

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="mr-auto flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => navigate('/accounts-payable/dashboard', { replace: true })}
              className="h-8 w-8 shrink-0"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={16} />
            </Button>
            <div className="min-w-0">
              <CardTitle>Reports</CardTitle>
              <p className="mt-0.5 text-[11px] text-slate-500">One period for all panels.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-[#d8e2ef] bg-[#f6f8fc] px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Period</span>
            <Input
              type="date"
              className="h-7 w-[130px] rounded-md px-2 py-1 text-xs"
              value={from}
              onChange={event => setFrom(event.target.value)}
            />
            <span className="text-xs text-slate-400">to</span>
            <Input
              type="date"
              className="h-7 w-[130px] rounded-md px-2 py-1 text-xs"
              value={to}
              onChange={event => setTo(event.target.value)}
            />
          </div>
          {(from !== seed.from || to !== seed.to) && (
            <Button type="button" variant="outline" size="sm" onClick={() => { setFrom(seed.from); setTo(seed.to) }}>
              Reset
            </Button>
          )}
        </CardContent>
      </Card>

      {error && <ErrorBox message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <Loading label="Generating AP report..." />
      ) : (
        <>
          <section>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                icon={WalletCards}
                label="Outstanding AP"
                value={formatCurrencyTotals(outstandingCurrencyTotals)}
                hint={`As of ${formatDate(data.aging?.as_of)}`}
              />
              <KpiCard
                icon={CalendarDays}
                label="Scheduled Payables"
                value={formatCurrencyTotals(scheduleCurrencyTotals)}
                hint={`${formatDate(generatedPeriod.from)} to ${formatDate(generatedPeriod.to)}`}
                tone="teal"
              />
              <KpiCard
                icon={Clock}
                label="Overdue Payables"
                value={formatCurrencyTotals(currencyTotals(agingRows.filter(row => row.aging_bucket !== 'Current'), 'outstanding_balance'))}
                hint={`${overduePercent}% of outstanding AP`}
                tone="rose"
              />
              <KpiCard
                icon={BarChart3}
                label="Payments Made"
                value={formatCurrencyTotals(paymentCurrencyTotals)}
                hint={`${paymentRows.length} payment${paymentRows.length === 1 ? '' : 's'} recorded`}
                tone="amber"
              />
            </div>
          </section>

          <section>
            <div className="grid items-start gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
              <ChartCard
                title="AP Aging"
                subtitle={`${agingRows.length} outstanding bill${agingRows.length === 1 ? '' : 's'} grouped by age`}
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
                  <HorizontalBars data={agingChart} maxItems={5} emptyTitle="No outstanding AP aging for this period" />
                  <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-b from-rose-50/70 to-[#fafcff] p-4 text-center ring-1 ring-rose-100/70">
                    <Gauge className="mx-auto text-rose-500" size={28} />
                    <p className="mt-3 text-3xl font-bold text-[#26324f]">{overduePercent}%</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Overdue Share
                    </p>
                    <p className="mt-2 text-xs text-slate-400">{formatCurrencyTotals(currencyTotals(agingRows.filter(row => row.aging_bucket !== 'Current'), 'outstanding_balance'))} overdue</p>
                  </div>
                </div>
              </ChartCard>

              <ChartCard
                title="Payables Schedule"
                subtitle={`Due payments inside ${generatedPeriod.label}`}
              >
                <LineTrend data={scheduleChart} emptyTitle="No payables scheduled in this period" />
              </ChartCard>

              <ChartCard
                title="Supplier Balance"
                subtitle={`Top supplier exposure as of ${formatDate(data.balances?.as_of || generatedPeriod.to)}`}
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <ParetoChart data={supplierChart} emptyTitle="No supplier balances as of this report date" />
                  <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-b from-[#eef4fc] to-[#fafcff] p-4 text-center ring-1 ring-[#d8e2ef]">
                    <WalletCards className="mx-auto text-[#2c3a61]" size={28} />
                    <p className="mt-3 text-2xl font-bold text-[#26324f]">{shortMoney(data.balances?.total_outstanding || 0)}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Supplier Balance</p>
                  </div>
                </div>
              </ChartCard>

              <ChartCard
                title="Payment Report"
                subtitle={`${formatCurrencyTotals(paymentCurrencyTotals)} paid during ${generatedPeriod.label}`}
              >
                <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
                  <HorizontalBars data={paymentMethods} maxItems={5} color="#7c3aed" emptyTitle="No payment methods in this period" />
                  <LineTrend data={paymentTimeline} color="#2c3a61" emptyTitle="No payment trend in this period" />
                </div>
              </ChartCard>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
