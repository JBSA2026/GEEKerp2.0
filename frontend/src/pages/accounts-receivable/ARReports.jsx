import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BarChart3, PieChart, Receipt, TriangleAlert, Users, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorBox, Loading } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form'
import { AgingChart } from '@/components/aprar'
import { money } from '@/components/aprar/format'
import {
  fetchArAging,
  fetchArCollections,
  fetchArOverdueCustomers,
} from '@/utils/api'
import { formatDate } from './arUtils'

const CHART_COLORS = ['#2c3a61', '#25a6a0', '#f59e0b', '#e11d48', '#7c3aed', '#64748b']

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

function shortMoney(value) {
  return new Intl.NumberFormat('en-PH', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function truncateLabel(value, length = 22) {
  const text = String(value || '-')
  return text.length > length ? `${text.slice(0, length - 1)}...` : text
}

function compactNumber(value) {
  return new Intl.NumberFormat('en-PH', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function groupByField(rows, fieldKey, valueKey) {
  const groups = new Map()
  rows.forEach(row => {
    const label = row?.[fieldKey] || 'Unspecified'
    const current = groups.get(label) || { label, value: 0 }
    current.value += Number(row?.[valueKey] || 0)
    groups.set(label, current)
  })
  return Array.from(groups.values())
    .sort((a, b) => b.value - a.value)
    .map(item => ({ ...item, value: Math.round(item.value * 100) / 100 }))
}

function groupByDate(rows, dateKey, valueKey, from = '', to = '') {
  const dates = rows.map(row => parseLocalDate(row?.[dateKey])).filter(Boolean)
  if (dates.length === 0) return []

  const start = parseLocalDate(from) || new Date(Math.min(...dates.map(date => date.getTime())))
  const end = parseLocalDate(to) || new Date(Math.max(...dates.map(date => date.getTime())))
  const span = dayDiff(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10))
  const mode = span > 120 ? 'month' : span > 45 ? 'week' : 'day'
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const groups = new Map()

  rows.forEach(row => {
    const date = parseLocalDate(row?.[dateKey])
    if (!date) return

    let label
    let order
    if (mode === 'month') {
      label = `${monthNames[date.getMonth()]} ${date.getFullYear()}`
      order = date.getFullYear() * 100 + date.getMonth()
    } else if (mode === 'week') {
      const week = Math.floor((date - start) / 604800000) + 1
      label = `Week ${Math.max(1, week)}`
      order = week
    } else {
      label = `${monthNames[date.getMonth()]} ${date.getDate()}`
      order = date.getTime()
    }

    const current = groups.get(label) || { label, value: 0, order }
    current.value += Number(row?.[valueKey] || 0)
    groups.set(label, current)
  })

  return Array.from(groups.values())
    .sort((a, b) => a.order - b.order)
    .map(item => ({ ...item, value: Math.round(item.value * 100) / 100 }))
}

function ChartCard({ title, subtitle, icon: Icon, children, className = '' }) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[15px]">{title}</CardTitle>
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {Icon && (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf4fb] text-[#2c3a61]">
              <Icon size={16} />
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-2">{children}</CardContent>
    </Card>
  )
}

function VisualStat({ label, value, hint, icon: Icon, percent = 0, color = '#2c3a61' }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${color} ${pct}%, #edf4fb ${pct}% 100%)` }}
        >
          <div className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#26324f]">
            {Icon ? <Icon size={18} /> : <span className="text-xs font-bold">{pct}%</span>}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1 break-words text-xl font-bold text-[#26324f]">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function ReportFieldCard({ title, hint, icon: Icon, action }) {
  return (
    <Card>
      <CardContent className="flex min-h-[104px] items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#26324f]">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
          {action}
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#edf4fb] text-[#2c3a61]">
          <Icon size={17} />
        </span>
      </CardContent>
    </Card>
  )
}

function HorizontalBars({
  data,
  maxItems = 7,
  color = '#2c3a61',
  emptyTitle = 'No data for this period',
  valueFormatter = money,
  inlineFormatter = shortMoney,
}) {
  const rows = data.filter(item => Number(item.value) > 0).slice(0, maxItems)
  const max = Math.max(1, ...rows.map(item => Number(item.value || 0)))
  if (rows.length === 0) return <EmptyState title={emptyTitle} />

  return (
    <div className="space-y-3">
      {rows.map((item, index) => {
        const width = Math.max(3, Math.round((Number(item.value || 0) / max) * 100))
        return (
          <div key={`${item.label}-${index}`} className="grid grid-cols-[128px_minmax(0,1fr)_92px] items-center gap-3 text-xs">
            <span className="truncate font-medium text-slate-600" title={item.label}>
              {truncateLabel(item.label, 20)}
            </span>
            <div className="h-7 overflow-hidden rounded-full bg-[#f1f5fb]">
              <div
                className="flex h-full items-center justify-end rounded-full px-2.5 text-[11px] font-semibold text-white transition-all duration-500 ease-out"
                style={{ width: `${width}%`, backgroundColor: item.color || CHART_COLORS[index % CHART_COLORS.length] || color }}
              >
                {width > 24 ? inlineFormatter(item.value) : ''}
              </div>
            </div>
            <span className="text-right font-semibold text-[#26324f]">{valueFormatter(item.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

function ParetoChart({
  data,
  maxItems = 8,
  emptyTitle = 'No data for this period',
  valueFormatter = money,
}) {
  const rows = data
    .filter(item => Number(item.value) > 0)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, maxItems)
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0)
  const max = Math.max(1, ...rows.map(row => Number(row.value || 0)))
  const cumulativeValues = rows.reduce((values, item) => [
    ...values,
    (values[values.length - 1] || 0) + Number(item.value || 0),
  ], [])

  if (rows.length === 0 || total <= 0) return <EmptyState title={emptyTitle} />

  return (
    <div className="space-y-3">
      {rows.map((item, index) => {
        const width = Math.max(3, Math.round((Number(item.value || 0) / max) * 100))
        const cumulativePct = Math.round((cumulativeValues[index] / total) * 100)
        return (
          <div key={`${item.label}-${index}`} className="grid grid-cols-[128px_minmax(0,1fr)_112px] items-center gap-3 text-xs">
            <span className="truncate font-medium text-slate-600" title={item.label}>{truncateLabel(item.label, 20)}</span>
            <div className="relative h-8 overflow-hidden rounded-full bg-[#f1f5fb]">
              <div
                className="flex h-full items-center justify-end rounded-full px-2.5 text-[11px] font-semibold text-white"
                style={{ width: `${width}%`, backgroundColor: item.color || CHART_COLORS[index % CHART_COLORS.length] }}
              >
                {width > 26 ? shortMoney(item.value) : ''}
              </div>
              <div
                className="absolute top-0 h-full border-r-2 border-[#26324f]/60"
                style={{ left: `${cumulativePct}%` }}
              />
            </div>
            <span className="text-right font-semibold text-[#26324f]">
              {valueFormatter(item.value)}
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
              {shortMoney(point.value)}
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

function VerticalBars({
  data,
  color = '#25a6a0',
  emptyTitle = 'No data for this period',
  valueFormatter = shortMoney,
}) {
  const rows = data.filter(item => Number(item.value) > 0)
  const max = Math.max(1, ...rows.map(item => Number(item.value || 0)))
  if (rows.length === 0) return <EmptyState title={emptyTitle} />

  return (
    <div className="flex h-[250px] items-end gap-2 rounded-xl bg-gradient-to-b from-[#fafcff] to-white px-3 pt-7">
      {rows.map((item, index) => {
        const height = Math.max(8, Math.round((Number(item.value || 0) / max) * 178))
        return (
          <div key={`${item.label}-${index}`} className="group flex min-w-[42px] flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[10px] font-semibold text-slate-500">{valueFormatter(item.value)}</span>
            <div
              className="w-full max-w-[38px] rounded-t-lg transition-all duration-500 ease-out group-hover:opacity-90"
              style={{ height, backgroundColor: item.color || CHART_COLORS[index % CHART_COLORS.length] || color }}
            />
            <span className="h-8 max-w-[66px] text-center text-[10px] font-medium leading-tight text-slate-500">
              {truncateLabel(item.label, 12)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CollectionsPanel({ from = '', to = '' }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchArCollections({ from, to })
      setRows(Array.isArray(result) ? result : [])
    } catch (err) {
      setError(err.message || 'Unable to load collections')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  if (error) return <ErrorBox message={error} onDismiss={null} />
  if (loading) return <Loading label="Loading collection visuals..." />
  if (rows.length === 0) return <EmptyState title="No collections found" icon={Wallet} />

  const timeline = groupByDate(rows, 'collection_date', 'collection_amount', from, to)
  const methodMix = groupByField(rows, 'payment_method', 'collection_amount')
  const customerMix = groupByField(rows, 'customer_name', 'collection_amount')

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <ChartCard
        title="Collection Report"
        subtitle={(from || to) ? `${from ? formatDate(from) : 'Beginning'} to ${to ? formatDate(to) : 'Present'}` : 'Collections grouped by posting date'}
        icon={BarChart3}
      >
        <LineTrend data={timeline} color="#25a6a0" emptyTitle="No collection trend to chart" />
      </ChartCard>
      <ChartCard title="Collection Method Mix" subtitle={`${rows.length} collection entries`} icon={PieChart}>
        <HorizontalBars data={methodMix} maxItems={5} color="#7c3aed" emptyTitle="No collection method mix" />
      </ChartCard>
      <ChartCard className="xl:col-span-2" title="Collection Sources" subtitle="Customers ranked by collected amount" icon={Users}>
        <ParetoChart data={customerMix} maxItems={8} emptyTitle="No customer collections to rank" />
      </ChartCard>
    </div>
  )
}

function AgingPanel({ from = '', to = '' }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchArAging({ from, to }))
    } catch (err) {
      setError(err.message || 'Unable to load aging report')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  if (loading) return <Loading label="Loading aging visuals..." />
  if (error) return <ErrorBox message={error} onDismiss={null} />
  if (!data) return null

  const buckets = Object.entries(data.bucket_totals || {}).map(([bucket, total], index) => ({
    bucket,
    total,
    label: bucket,
    value: total,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))
  const rows = data.rows || []
  const invoiceBars = rows
    .map(row => ({
      label: row.invoice_number || row.customer_name || 'Invoice',
      value: Number(row.outstanding_balance || 0),
    }))
    .sort((a, b) => b.value - a.value)
  const customerExposure = groupByField(rows, 'customer_name', 'outstanding_balance')
  const invoiceCounts = buckets.map((bucket, index) => ({
    label: bucket.bucket,
    value: rows.filter(row => row.aging_bucket === bucket.bucket).length,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
        <AgingChart buckets={buckets} title="AR Aging" compact />
        <ChartCard
          title="AR Aging Exposure"
          subtitle={`Outstanding receivables: ${money(data.total_outstanding)}`}
          icon={Receipt}
        >
          <HorizontalBars data={invoiceBars} maxItems={7} emptyTitle="No outstanding invoices to rank" />
        </ChartCard>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <ChartCard title="AR Aging by Customer" subtitle="Open AR grouped by customer" icon={Users}>
          <HorizontalBars data={customerExposure} maxItems={8} color="#25a6a0" emptyTitle="No customer exposure to chart" />
        </ChartCard>
        <ChartCard title="AR Aging Count" subtitle="How many invoices sit in each aging bucket" icon={BarChart3}>
          <VerticalBars
            data={invoiceCounts}
            color="#f59e0b"
            emptyTitle="No invoice count by aging bucket"
            valueFormatter={compactNumber}
          />
        </ChartCard>
      </div>
    </div>
  )
}

export function ARReports() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchArOverdueCustomers({ from, to }))
    } catch (err) {
      setError(err.message || 'Unable to load report')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  if (error) return <ErrorBox message={error} onDismiss={null} />

  const rows = data?.customers || []
  const totalOverdue = Number(data?.total_overdue_amount || 0)
  const overdueInvoiceCount = rows.reduce((sum, row) => sum + Number(row.overdue_invoice_count || 0), 0)
  const oldestDays = Math.max(0, ...rows.map(row => Number(row.days_overdue || 0)))
  const overdueBars = rows.map((row, index) => ({
    label: row.customer_name || `Customer ${index + 1}`,
    value: Number(row.total_outstanding || 0),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))
  const agePressure = rows
    .map((row, index) => ({
      label: row.customer_name || `Customer ${index + 1}`,
      value: Number(row.days_overdue || 0),
      color: CHART_COLORS[index % CHART_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value)
  const overdueShare = overdueBars.slice(0, 5)

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="mr-auto flex min-w-0 items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/accounts-receivable/workbench')} aria-label="Back to dashboard">
              <ArrowLeft size={16} />
            </Button>
            <div className="min-w-0">
              <CardTitle>Reports</CardTitle>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-[#d8e2ef] bg-[#f6f8fc] px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Period</span>
            <Input
              type="date"
              className="h-7 w-[130px] rounded-md px-2 py-1 text-xs"
              value={from}
              onChange={e => setFrom(e.target.value)}
            />
            <span className="text-xs text-slate-400">to</span>
            <Input
              type="date"
              className="h-7 w-[130px] rounded-md px-2 py-1 text-xs"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </div>
          {(from || to) && (
            <Button type="button" variant="outline" size="sm" onClick={() => { setFrom(''); setTo('') }}>
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <VisualStat
          label="Overdue Exposure"
          value={money(totalOverdue)}
          hint="Past-due open receivables"
          icon={TriangleAlert}
          percent={totalOverdue > 0 ? 100 : 0}
          color="#e11d48"
        />
        <VisualStat
          label="Customers At Risk"
          value={rows.length}
          hint="Customers with overdue balances"
          icon={Users}
          percent={rows.length ? Math.min(100, rows.length * 12) : 0}
          color="#f59e0b"
        />
        <VisualStat
          label="Overdue Invoices"
          value={overdueInvoiceCount}
          hint={oldestDays ? `Oldest is ${oldestDays} days overdue` : 'No overdue age'}
          icon={BarChart3}
          percent={overdueInvoiceCount ? Math.min(100, overdueInvoiceCount * 10) : 0}
          color="#7c3aed"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ReportFieldCard
          title="AR Aging"
          hint="Outstanding invoices grouped by aging bucket, customer, and invoice exposure."
          icon={BarChart3}
        />
        <ReportFieldCard
          title="Collection Report"
          hint="Collections by date, payment method, and customer source."
          icon={Wallet}
        />
        <ReportFieldCard
          title="Overdue Customers"
          hint="Past-due customers ranked by balance and oldest overdue age."
          icon={TriangleAlert}
        />
        <ReportFieldCard
          title="Statement of Account"
          hint="Generate a customer statement with invoice, WHT, collection, and balance detail."
          icon={Receipt}
          action={(
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigate('/accounts-receivable/statements')}>
              Open Statement
            </Button>
          )}
        />
      </div>

      <AgingPanel from={from} to={to} />

      <CollectionsPanel from={from} to={to} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <ChartCard title="Overdue Customers" subtitle="Pareto view of customers driving past-due AR" icon={TriangleAlert}>
          {loading ? (
            <Loading label="Loading overdue exposure..." />
          ) : (
            <ParetoChart data={overdueBars} maxItems={8} emptyTitle="No overdue exposure to chart" />
          )}
        </ChartCard>
        <ChartCard title="Overdue Concentration" subtitle="Top overdue balances by customer" icon={PieChart}>
          {loading ? (
            <Loading label="Loading overdue share..." />
          ) : (
            <HorizontalBars data={overdueShare} maxItems={5} color="#e11d48" emptyTitle="No overdue concentration to chart" />
          )}
        </ChartCard>
        <ChartCard className="xl:col-span-2" title="Overdue Customer Age" subtitle="Customers ranked by days overdue" icon={TriangleAlert}>
          {loading ? (
            <Loading label="Loading overdue age..." />
          ) : (
            <HorizontalBars
              data={agePressure}
              maxItems={8}
              color="#e11d48"
              emptyTitle="No overdue age to chart"
              valueFormatter={value => `${Number(value || 0)}d`}
              inlineFormatter={value => `${Number(value || 0)}d`}
            />
          )}
        </ChartCard>
      </div>
    </div>
  )
}
