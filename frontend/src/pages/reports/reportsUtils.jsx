/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

import GLabLogo from '@/assets/company-logos/GLab.png'
import ExpediaLogo from '@/assets/company-logos/Expedia.png'
import ExigentLogo from '@/assets/company-logos/exigent.png'
import KSILogo from '@/assets/company-logos/KSI.png'

const BASE = import.meta.env.VITE_API_URL

// ─── Entities ─────────────────────────────────────────────────────────────────
export const ENTITIES = [
  { value: 'Expedia', label: 'Expedia', logo: ExpediaLogo },
  { value: 'GreatnessLab', label: 'GreatnessLab', logo: GLabLogo },
  { value: 'Exigent', label: 'Exigent', logo: ExigentLogo },
  { value: 'KSI', label: 'Kyrios Solutions Inc.', logo: KSILogo },
]

// ─── Report Tabs ──────────────────────────────────────────────────────────────
export const REPORT_TABS = [
  { id: 'executive-overview', label: 'Executive Overview' },
  { id: 'financial-performance', label: 'Financial Performance' },
  { id: 'cash-flow', label: 'Cash Flow' },
  { id: 'project-profitability', label: 'Project Profitability' },
  { id: 'sales-performance', label: 'Sales Performance' },
  { id: 'ar-ap-health', label: 'AR/AP Health' },
  { id: 'compliance-snapshot', label: 'Compliance Snapshot' },
]

// ─── Date Range Presets ───────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0') }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

export function getPresetRange(preset) {
  const today = new Date()
  if (preset === 'month') return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) }
  if (preset === 'quarter') { const q = Math.floor(today.getMonth() / 3); return { from: iso(new Date(today.getFullYear(), q * 3, 1)), to: iso(today) } }
  if (preset === 'year') return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) }
  return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) }
}

export const DATE_PRESETS = [
  { id: 'month', label: 'This Month' },
  { id: 'quarter', label: 'This Quarter' },
  { id: 'year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
]

// ─── API ──────────────────────────────────────────────────────────────────────
export function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export async function apiGet(path, signal) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders(), signal })
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Request failed') }
  return res.json()
}

export function reportQuery(entity, dateFrom, dateTo, extra = {}) {
  return new URLSearchParams({ entity, date_from: dateFrom, date_to: dateTo, ...extra }).toString()
}

// ─── Data Hook ────────────────────────────────────────────────────────────────
export function useReportData(path, entity, dateFrom, dateTo, extraParams) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastLoadedAt, setLastLoadedAt] = useState(null)
  const abortRef = useRef(null)
  const extraKey = JSON.stringify(extraParams || {})

  const load = useCallback(async () => {
    if (!entity || !dateFrom || !dateTo) return
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const qs = reportQuery(entity, dateFrom, dateTo, JSON.parse(extraKey))
      const result = await apiGet(`${path}?${qs}`, controller.signal)
      if (controller.signal.aborted) return
      setData(result)
      setLastLoadedAt(new Date())
    } catch (err) {
      if (controller.signal.aborted || err.name === 'AbortError') return
      setError(err.message || 'Failed to load report data.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [path, entity, dateFrom, dateTo, extraKey])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    return () => { if (abortRef.current) abortRef.current.abort() }
  }, [load])

  return { data, loading, error, lastLoadedAt, refresh: load }
}

// ─── Formatting ───────────────────────────────────────────────────────────────
export function formatCurrency(val) {
  if (val == null || val === '') return '\u20b10.00'
  const num = Number(val)
  const sign = num < 0 ? '-' : ''
  return sign + '\u20b1' + Math.abs(num).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatCompact(val) {
  if (val == null) return '\u20b10'
  const num = Number(val)
  const sign = num < 0 ? '-' : ''
  const abs = Math.abs(num)
  if (abs >= 1e9) return sign + '\u20b1' + (abs / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return sign + '\u20b1' + (abs / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return sign + '\u20b1' + (abs / 1e3).toFixed(1) + 'K'
  return formatCurrency(val)
}

export function formatPercent(val) {
  if (val == null) return 'N/A'
  return `${Number(val).toFixed(1)}%`
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

export function Panel({ title, action, children, className = '', span }) {
  return (
    <div className={cn('rounded-xl border border-[#d8e2ef] bg-white shadow-none', span && `col-span-${span}`, className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {action}
        </div>
      )}
      <div className="px-5 pb-5">{children}</div>
    </div>
  )
}

export function BigMetric({ label, value, sub, tone, icon }) {
  return (
    <div className={cn('rounded-xl border px-5 py-5', tone || 'border-[#d8e2ef] bg-[#edf4fb]')}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-600">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold leading-none text-slate-950">{value}</p>
      {sub && <p className="mt-2 text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

export function MiniMetric({ label, value, color }) {
  return (
    <div className="rounded-lg border border-[#d8e2ef] bg-white px-3 py-2.5">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={cn('mt-1 text-base font-semibold', color || 'text-slate-900')}>{value}</p>
    </div>
  )
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <Loader2 aria-label="Loading report data" size={20} strokeWidth={1.8} className="animate-spin" />
      Loading report data...
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="text-sm text-red-500">{message || 'Failed to load report data.'}</p>
      {onRetry && <button onClick={onRetry} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Retry</button>}
    </div>
  )
}

// ─── Chart Components (SVG, no library needed) ────────────────────────────────

const CHART_COLORS = ['#26324f', '#5d8796', '#91a4cf', '#8dabc4', '#a7b5d8', '#9f4d61', '#cbd8ea']

export function DonutChart({ data, label, value, size = 120 }) {
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const total = data.reduce((sum, d) => sum + d.value, 0)

  // Precompute segments
  const segments = []
  let acc = 0
  for (let i = 0; i < data.length; i++) {
    const pct = total > 0 ? data[i].value / total : 0
    const dash = pct * circumference
    const offset = total > 0 ? acc / total * circumference : 0
    segments.push({ ...data[i], dash, offset, idx: i })
    acc += data[i].value
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e3ecf8" strokeWidth="14" />
        {segments.map((s) => (
          <circle key={s.idx} cx="50" cy="50" r={radius} fill="none"
            stroke={s.color || CHART_COLORS[s.idx % CHART_COLORS.length]}
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={-s.offset} strokeWidth="14" transform="rotate(-90 50 50)" />
        ))}
        <text x="50" y="47" textAnchor="middle" className="text-[8px] fill-slate-500 font-medium">{label}</text>
        <text x="50" y="58" textAnchor="middle" className="text-[10px] fill-slate-900 font-bold">{value}</text>
      </svg>
      <div className="w-full space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-600">
              <i className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color || CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="font-medium text-slate-900">{d.display || d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HorizontalBarChart({ data, formatValue }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-600 truncate max-w-[60%]">{d.label}</span>
            <span className="text-xs font-semibold text-slate-900">{formatValue ? formatValue(d.value) : d.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max(d.value / max * 100, 2)}%`, backgroundColor: d.color || CHART_COLORS[i % CHART_COLORS.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function VerticalBarChart({ data, height = 120, formatValue }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end justify-between gap-1" style={{ height }}>
      {data.map((d, i) => {
        const h = Math.max(d.value / max * 100, 3)
        return (
          <div key={i} className="flex flex-col items-center flex-1 group relative">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none z-10">
              {formatValue ? formatValue(d.value) : d.value}
            </div>
            <div
              className="w-full rounded-t-md transition-all hover:opacity-80"
              style={{ height: `${h}%`, backgroundColor: d.color || CHART_COLORS[i % CHART_COLORS.length], minHeight: '4px' }}
            />
            <span className="text-[9px] text-slate-500 mt-1 truncate w-full text-center">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Export ────────────────────────────────────────────────────────────────────
export function exportToCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) return
  const header = columns.map(c => c.label).join(',')
  const lines = rows.map(row =>
    columns.map(c => {
      let v = row[c.key]
      if (v == null) v = ''
      v = String(v).replace(/"/g, '""')
      if (v.includes(',') || v.includes('\n')) v = `"${v}"`
      return v
    }).join(',')
  )
  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export async function exportToPdf(options) {
  const { exportReportPdf } = await import('@/utils/pdfExport')
  exportReportPdf(options)
}
