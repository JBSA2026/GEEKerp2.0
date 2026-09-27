import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { Loader2, Download, FileBarChart, Users, CalendarDays, Clock, GraduationCap, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, BarChart3, PieChart, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_URL

// ─── API helpers ────────────────────────────────────────────────────────────
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err }
  return data
}

// ─── Constants ──────────────────────────────────────────────────────────────
const REPORT_TYPES = [
  { id: 'demographics', label: 'Employee Demographics', endpoint: '/hr/reports/demographics', icon: Users, description: 'Headcount, tenure distribution & employment status overview' },
  { id: 'leave-utilization', label: 'Leave Utilization', endpoint: '/hr/reports/leave-utilization', icon: CalendarDays, description: 'Leave usage breakdown by type, department & entity' },
  { id: 'attendance-summary', label: 'Attendance Summary', endpoint: '/hr/reports/attendance-summary', icon: Clock, description: 'Working hours, tardiness & absenteeism metrics' },
  { id: 'training-summary', label: 'Training Summary', endpoint: '/hr/reports/training-summary', icon: GraduationCap, description: 'Training hours, participation & certifications' },
]

const ENTITIES = ['All', 'Expedia', 'GreatnessLab', 'Exigent', 'KSI']

// ─── Shared UI ──────────────────────────────────────────────────────────────
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

function FilterDropdown({ value, onChange, options, labelFn, width = 'w-[180px]' }) {
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
    <div className={`relative ${width}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
      >
        <span className="truncate">{labelFn(value)}</span>
        <ChevronDown size={14} className={`text-[var(--color-muted-fg)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <ul
            className="fixed rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-[9999] max-h-[220px] overflow-y-auto"
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

function getDefaultDateRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    start_date: start.toISOString().split('T')[0],
    end_date: now.toISOString().split('T')[0],
  }
}

// ─── KPI Stat Card ──────────────────────────────────────────────────────────
function StatCard({ label, value, subtitle, icon: Icon, trend, accent = 'primary' }) {
  const accentColors = {
    primary: 'from-[#2c3a61]/8 to-[#2c3a61]/2 border-[#2c3a61]/15',
    success: 'from-[#5d8796]/8 to-[#5d8796]/2 border-[#5d8796]/15',
    warning: 'from-[#b08d57]/8 to-[#b08d57]/2 border-[#b08d57]/15',
    danger: 'from-[#8a4f68]/8 to-[#8a4f68]/2 border-[#8a4f68]/15',
  }
  const iconColors = {
    primary: 'text-[#2c3a61] bg-[#2c3a61]/10',
    success: 'text-[#5d8796] bg-[#5d8796]/10',
    warning: 'text-[#b08d57] bg-[#b08d57]/10',
    danger: 'text-[#8a4f68] bg-[#8a4f68]/10',
  }

  return (
    <div className={cn('relative rounded-xl border bg-gradient-to-br p-4 transition-all hover:shadow-md', accentColors[accent])}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wider">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-[var(--color-text)] tabular-nums">{value ?? '—'}</p>
          {subtitle && <p className="mt-0.5 text-[11px] text-[var(--color-muted-fg)]">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={cn('flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center', iconColors[accent])}>
            <Icon size={18} />
          </div>
        )}
      </div>
      {trend != null && (
        <div className="mt-2 flex items-center gap-1">
          {trend >= 0 ? <TrendingUp size={12} className="text-[#5d8796]" /> : <TrendingDown size={12} className="text-[#8a4f68]" />}
          <span className={cn('text-[10px] font-medium', trend >= 0 ? 'text-[#5d8796]' : 'text-[#8a4f68]')}>
            {Math.abs(trend)}% vs last period
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Data Table ─────────────────────────────────────────────────────────────
function DataTable({ headers, rows, highlightColumn }) {
  if (!rows || rows.length === 0) return null
  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--color-surface-2)]/60">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wider first:pl-5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]/60">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-[var(--color-surface-2)]/30 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className={cn(
                  'px-4 py-3 first:pl-5',
                  j === 0 ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text-dim)]',
                  highlightColumn === j && 'font-semibold text-[var(--color-text)]'
                )}>{cell ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Horizontal Bar Chart (CSS-based) ───────────────────────────────────────
function HorizontalBarChart({ title, data, color = '#2c3a61' }) {
  if (!data || Object.keys(data).length === 0) return null
  const entries = Object.entries(data)
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={14} className="text-[var(--color-muted-fg)]" />
        <h4 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider">{title}</h4>
      </div>
      <div className="space-y-3">
        {entries.map(([label, value]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-28 text-xs text-[var(--color-text-dim)] truncate flex-shrink-0" title={label}>{label}</span>
            <div className="flex-1 h-6 rounded-md bg-[var(--color-surface-2)] overflow-hidden relative">
              <div
                className="h-full rounded-md transition-all duration-500 ease-out"
                style={{ width: `${(value / max) * 100}%`, backgroundColor: color, opacity: 0.75 }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[var(--color-text-dim)]">
                {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Donut / Ring Chart (SVG) ───────────────────────────────────────────────
function DonutChart({ title, data }) {
  if (!data || Object.keys(data).length === 0) return null
  const entries = Object.entries(data)
  const total = entries.reduce((sum, [, v]) => sum + v, 0)
  if (total === 0) return null

  const colors = ['#2c3a61', '#5d8796', '#8a4f68', '#b08d57', '#91a4cf', '#65728a', '#a7b5d8', '#202b49']
  const radius = 40
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <PieChart size={14} className="text-[var(--color-muted-fg)]" />
        <h4 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider">{title}</h4>
      </div>
      <div className="flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <svg width="120" height="120" viewBox="0 0 100 100">
            {entries.map(([label, value], i) => {
              const pct = value / total
              const dashLength = pct * circumference
              const dashOffset = -offset
              offset += dashLength
              return (
                <circle
                  key={label}
                  cx="50" cy="50" r={radius}
                  fill="none"
                  stroke={colors[i % colors.length]}
                  strokeWidth="16"
                  strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-500"
                />
              )
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-[var(--color-text)]">{total}</span>
            <span className="text-[9px] text-[var(--color-muted-fg)] uppercase">Total</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          {entries.map(([label, value], i) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="text-xs text-[var(--color-text-dim)] truncate flex-1" title={label}>{label}</span>
              <span className="text-xs font-semibold text-[var(--color-text)] tabular-nums">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Section Header ─────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
      {subtitle && <p className="text-[11px] text-[var(--color-muted-fg)] mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT RENDERERS
// ═══════════════════════════════════════════════════════════════════════════════

function DemographicsReport({ data }) {
  const { headcount_by_entity, headcount_by_department, headcount_by_status, tenure_distribution } = data

  const totalHeadcount = headcount_by_entity ? Object.values(headcount_by_entity).reduce((s, v) => s + v, 0) : 0
  const totalDepts = headcount_by_department ? Object.keys(headcount_by_department).length : 0
  const activeCount = headcount_by_status?.Active || headcount_by_status?.active || 0

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Headcount" value={totalHeadcount} icon={Users} accent="primary" />
        <StatCard label="Departments" value={totalDepts} icon={BarChart3} accent="success" />
        <StatCard label="Active Employees" value={activeCount} icon={CheckCircle2} accent="success" />
        <StatCard label="Entities" value={headcount_by_entity ? Object.keys(headcount_by_entity).length : 0} icon={PieChart} accent="primary" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutChart title="Headcount by Entity" data={headcount_by_entity} />
        <DonutChart title="Employment Status" data={headcount_by_status} />
      </div>

      {/* Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBarChart title="Headcount by Department" data={headcount_by_department} color="#2c3a61" />
        <HorizontalBarChart title="Tenure Distribution" data={tenure_distribution} color="#5d8796" />
      </div>
    </div>
  )
}

function LeaveUtilizationReport({ data }) {
  const { by_leave_type, by_department, by_entity } = data

  const totalDays = by_leave_type ? Object.values(by_leave_type).reduce((s, v) => s + v, 0) : 0
  const topType = by_leave_type ? Object.entries(by_leave_type).sort((a, b) => b[1] - a[1])[0] : null
  const deptsAffected = by_department ? Object.keys(by_department).length : 0

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Days Used" value={totalDays} icon={CalendarDays} accent="primary" />
        <StatCard label="Most Used Type" value={topType ? topType[0] : '—'} subtitle={topType ? `${topType[1]} days` : ''} icon={TrendingUp} accent="warning" />
        <StatCard label="Departments Affected" value={deptsAffected} icon={Users} accent="success" />
        <StatCard label="Leave Types" value={by_leave_type ? Object.keys(by_leave_type).length : 0} icon={PieChart} accent="primary" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutChart title="Leave Days by Type" data={by_leave_type} />
        <HorizontalBarChart title="Leave Days by Department" data={by_department} color="#8a4f68" />
      </div>

      {/* Table */}
      {by_entity && Object.keys(by_entity).length > 0 && (
        <div>
          <SectionHeader title="Leave Usage by Entity" subtitle="Total approved leave days per entity" />
          <DataTable
            headers={['Entity', 'Days Used', 'Share']}
            rows={Object.entries(by_entity).map(([k, v]) => [k, v, totalDays > 0 ? `${((v / totalDays) * 100).toFixed(1)}%` : '—'])}
          />
        </div>
      )}
    </div>
  )
}

function AttendanceSummaryReport({ data }) {
  // Backend returns { "DeptName": { average_hours, tardiness_count, absenteeism_rate, undertime_count } }
  const departments = Object.entries(data).map(([dept, stats]) => ({
    department: dept,
    average_hours: stats.average_hours,
    tardiness_count: stats.tardiness_count,
    absenteeism_rate: stats.absenteeism_rate,
    undertime_count: stats.undertime_count,
  }))

  if (departments.length === 0) return null

  // Compute aggregate KPIs
  const totalRecords = departments.length
  const overallAvgHours = (departments.reduce((s, d) => s + (d.average_hours || 0), 0) / totalRecords).toFixed(2)
  const totalTardiness = departments.reduce((s, d) => s + (d.tardiness_count || 0), 0)
  const totalUndertime = departments.reduce((s, d) => s + (d.undertime_count || 0), 0)
  const avgAbsenteeism = (departments.reduce((s, d) => s + (d.absenteeism_rate || 0), 0) / totalRecords).toFixed(1)

  // Determine status indicator
  const hoursStatus = Number(overallAvgHours) >= 8 ? 'success' : Number(overallAvgHours) >= 7 ? 'warning' : 'danger'

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Avg Working Hours" value={`${overallAvgHours}h`} subtitle="Across all departments" icon={Clock} accent={hoursStatus} />
        <StatCard label="Total Tardiness" value={totalTardiness} subtitle={`${totalRecords} departments tracked`} icon={AlertTriangle} accent={totalTardiness > 5 ? 'warning' : 'success'} />
        <StatCard label="Avg Absenteeism" value={`${avgAbsenteeism}%`} icon={TrendingDown} accent={Number(avgAbsenteeism) > 5 ? 'danger' : 'success'} />
        <StatCard label="Undertime Instances" value={totalUndertime} icon={Clock} accent={totalUndertime > 5 ? 'warning' : 'success'} />
      </div>

      {/* Department Performance Table */}
      <div>
        <SectionHeader title="Department Performance Breakdown" subtitle="Attendance metrics grouped by department" />
        <DataTable
          headers={['Department', 'Avg Hours', 'Tardiness', 'Absenteeism Rate', 'Undertime']}
          rows={departments.map(d => [
            d.department,
            d.average_hours != null ? `${Number(d.average_hours).toFixed(2)}h` : '—',
            d.tardiness_count ?? 0,
            d.absenteeism_rate != null ? `${Number(d.absenteeism_rate).toFixed(1)}%` : '0.0%',
            d.undertime_count ?? 0,
          ])}
          highlightColumn={1}
        />
      </div>

      {/* Visual: Hours by Department */}
      <HorizontalBarChart
        title="Average Hours by Department"
        data={Object.fromEntries(departments.map(d => [d.department, Number(d.average_hours || 0)]))}
        color="#5d8796"
      />
    </div>
  )
}

function TrainingSummaryReport({ data }) {
  const { total_hours, employees_trained, trainings_by_type, certifications_earned } = data

  const totalTrainings = trainings_by_type ? Object.values(trainings_by_type).reduce((s, v) => s + v, 0) : 0
  const avgHoursPerEmployee = employees_trained > 0 ? (total_hours / employees_trained).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Training Hours" value={total_hours ?? 0} icon={Clock} accent="primary" />
        <StatCard label="Employees Trained" value={employees_trained ?? 0} icon={Users} accent="success" />
        <StatCard label="Avg Hours / Employee" value={`${avgHoursPerEmployee}h`} icon={TrendingUp} accent="primary" />
        <StatCard label="Certifications Earned" value={certifications_earned ?? 0} icon={GraduationCap} accent="success" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutChart title="Trainings by Type" data={trainings_by_type} />
        <HorizontalBarChart title="Training Count by Type" data={trainings_by_type} color="#2c3a61" />
      </div>

      {/* Summary Insight */}
      {totalTrainings > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-gradient-to-r from-[#2c3a61]/5 to-transparent p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#2c3a61]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <GraduationCap size={16} className="text-[#2c3a61]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--color-text)]">Training Insight</p>
              <p className="text-[11px] text-[var(--color-muted-fg)] mt-0.5">
                {totalTrainings} training session{totalTrainings !== 1 ? 's' : ''} completed with {employees_trained} unique participant{employees_trained !== 1 ? 's' : ''}.
                {certifications_earned > 0 && ` ${certifications_earned} certification${certifications_earned !== 1 ? 's' : ''} earned this period.`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function HRReports() {
  const defaults = getDefaultDateRange()
  const [selectedReport, setSelectedReport] = useState('demographics')
  const [department, setDepartment] = useState('')
  const [departments, setDepartments] = useState([])
  const [startDate, setStartDate] = useState(defaults.start_date)
  const [endDate, setEndDate] = useState(defaults.end_date)
  const [reportData, setReportData] = useState(null)
  const [noData, setNoData] = useState(false)
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  const [entity, setEntity] = useState('All')

  // Fetch departments when entity changes
  useEffect(() => {
    const params = new URLSearchParams()
    if (entity && entity !== 'All') params.set('entity', entity)
    apiGet(`/hr/departments?${params.toString()}`)
      .then(data => {
        setDepartments(data.departments || [])
        setDepartment('')
      })
      .catch(() => setDepartments([]))
  }, [entity])

  const handleGenerate = useCallback(async () => {
    setLoading(true)
    setReportData(null)
    setNoData(false)

    const reportType = REPORT_TYPES.find(r => r.id === selectedReport)
    if (!reportType) return

    const body = {
      entity: entity === 'All' ? null : entity,
      department: department.trim() || null,
      start_date: startDate,
      end_date: endDate,
    }

    try {
      const data = await apiPost(reportType.endpoint, body)
      if (data.message === 'No data available' || (data && Object.keys(data).length === 0)) {
        setNoData(true)
        setReportData(null)
      } else {
        setReportData(data)
        setNoData(false)
      }
      setGenerated(true)
    } catch (err) {
      notify.error(err.message || 'Failed to generate report')
      setReportData(null)
      setNoData(false)
    } finally {
      setLoading(false)
    }
  }, [selectedReport, entity, department, startDate, endDate])

  function handleExport() {
    const params = new URLSearchParams({
      report_type: selectedReport,
      ...(entity !== 'All' && { entity }),
      ...(department.trim() && { department: department.trim() }),
      start_date: startDate,
      end_date: endDate,
    })

    const token = localStorage.getItem('access_token')
    const url = `${BASE}/hr/reports/export?${params.toString()}`

    fetch(url, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })
      .then(res => {
        if (!res.ok) throw new Error('Export failed')
        return res.blob()
      })
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${selectedReport}_report.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(a.href)
        notify.success('Report exported successfully')
      })
      .catch(err => {
        notify.error(err.message || 'Failed to export report')
      })
  }

  function renderReport() {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-3">
            <Loader2 size={22} className="animate-spin text-[var(--color-primary)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text)]">Generating report...</p>
          <p className="text-[11px] text-[var(--color-muted-fg)] mt-0.5">Analyzing workforce data</p>
        </div>
      )
    }

    if (noData) {
      return (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="w-14 h-14 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-3">
            <FileBarChart size={24} className="text-[var(--color-muted)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text)]">No data available</p>
          <p className="text-[11px] text-[var(--color-muted-fg)] mt-1 max-w-xs text-center">
            Try adjusting your date range or filters to find relevant records
          </p>
        </div>
      )
    }

    if (!reportData) {
      return (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="w-14 h-14 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-3">
            <BarChart3 size={24} className="text-[var(--color-muted)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text)]">Ready to generate</p>
          <p className="text-[11px] text-[var(--color-muted-fg)] mt-1 max-w-xs text-center">
            Configure your filters above and click Generate to view workforce analytics
          </p>
        </div>
      )
    }

    switch (selectedReport) {
      case 'demographics':
        return <DemographicsReport data={reportData} />
      case 'leave-utilization':
        return <LeaveUtilizationReport data={reportData} />
      case 'attendance-summary':
        return <AttendanceSummaryReport data={reportData} />
      case 'training-summary':
        return <TrainingSummaryReport data={reportData} />
      default:
        return null
    }
  }

  const currentReport = REPORT_TYPES.find(r => r.id === selectedReport)

  return (
    <div className="flex flex-col gap-6">
      {/* ─── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text)]">Workforce Analytics</h2>
          <p className="text-xs text-[var(--color-muted-fg)] mt-0.5">Generate insights from your HR data to support strategic decisions</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={!reportData}
          className="gap-1.5"
        >
          <Download size={14} />
          Export CSV
        </Button>
      </div>

      {/* ─── Filters Bar ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-4 rounded-full bg-[var(--color-primary)]" />
          <span className="text-[11px] font-semibold text-[var(--color-text)] uppercase tracking-wider">Generate Report</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <label className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wide">Report Type</label>
            <FilterDropdown
              value={selectedReport}
              onChange={v => { setSelectedReport(v); setReportData(null); setNoData(false); setGenerated(false) }}
              options={REPORT_TYPES.map(rt => rt.id)}
              labelFn={v => REPORT_TYPES.find(rt => rt.id === v)?.label || v}
              width="w-[200px]"
            />
          </div>

          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <label className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wide">Entity</label>
            <FilterDropdown
              value={entity}
              onChange={v => setEntity(v)}
              options={ENTITIES}
              labelFn={v => v}
              width="w-[140px]"
            />
          </div>

          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <label className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wide">Department</label>
            <FilterDropdown
              value={department}
              onChange={v => setDepartment(v)}
              options={['', ...departments]}
              labelFn={v => v || 'All departments'}
              width="w-[160px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wide">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className={cn(inputCls, 'w-[148px]')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wide">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className={cn(inputCls, 'w-[148px]')}
            />
          </div>

          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={loading}
            className="gap-1.5 px-4.5 py-2.5"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
            Generate
          </Button>
        </div>
      </div>

      {/* ─── Report Output ───────────────────────────────────────────────── */}
      {generated && reportData && (
        <div className="flex items-center gap-2 px-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#5d8796] animate-pulse" />
          <span className="text-[11px] text-[var(--color-muted-fg)]">
            Showing <span className="font-medium text-[var(--color-text)]">{currentReport?.label}</span> report
            {entity !== 'All' && <> for <span className="font-medium text-[var(--color-text)]">{entity}</span></>}
            {department.trim() && <> · <span className="font-medium text-[var(--color-text)]">{department}</span></>}
            {' '}· {startDate} to {endDate}
          </span>
        </div>
      )}

      <div className="min-h-[200px]">
        {renderReport()}
      </div>
    </div>
  )
}
