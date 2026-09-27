import { useState, useEffect, useCallback } from 'react'
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, RefreshCw, FileText, Search, CalendarCheck, ChevronDown, Plus, X, LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet, apiPost, entityParam, formatDate, money, inputCls, SectionHeader } from './taxUtils'

// ─── Constants ──────────────────────────────────────────────────────────────
const FORM_TYPES = ['2307', '0619E', '1601C', '1601EQ', '2550Q', '2316', '1600VT', '1702Q', '1702', '1604E', '0605']
const STATUS_OPTIONS = ['DRAFT', 'FINALIZED', 'PENDING_APPROVAL']
const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
]

// ─── Status Badge ───────────────────────────────────────────────────────────
function FormStatusBadge({ status }) {
  const s = (status || '').toUpperCase()
  if (s === 'FINALIZED') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
      <FileText size={11} /> Finalized
    </span>
  )
  if (s === 'DRAFT') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
      <FileText size={11} /> Draft
    </span>
  )
  if (s === 'PENDING_APPROVAL') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
      <FileText size={11} /> Pending Approval
    </span>
  )
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {status || '—'}
    </span>
  )
}

// ─── Close Period Modal ─────────────────────────────────────────────────────
function ClosePeriodModal({ entity, onClose, onSuccess }) {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [month, setMonth] = useState(prev.getMonth() + 1) // 1-indexed, default previous month
  const [year, setYear] = useState(prev.getFullYear())
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const handleGenerate = async () => {
    if (!entity || entity === 'All') {
      notify.error('Please select a specific entity before closing a period.')
      return
    }
    setSubmitting(true)
    try {
      const params = `?entity=${encodeURIComponent(entity)}&month=${month}&year=${year}`
      const data = await apiPost(`/tax/bir-forms/close-period${params}`)
      setResult(data)
      const totalForms = (data.generated?.length || 0) + (data.updated?.length || 0)
      notify.success(`Period closed: ${totalForms} form(s) processed`)
    } catch (err) {
      notify.error(err.message || 'Failed to close period')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDone = () => {
    onSuccess()
    onClose()
  }

  // Generate year options (current year and 2 previous)
  const yearOptions = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Close Period</h3>
          <button onClick={onClose} className="text-[var(--color-muted-fg)] hover:text-[var(--color-text)]">
            <X size={18} />
          </button>
        </div>

        {!result ? (
          <>
            <p className="text-sm text-[var(--color-muted-fg)] mb-4">
              Generate all BIR forms for the selected period. This will compile data from AP, Payroll, and AR into draft forms for review.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Entity</label>
                <input
                  type="text"
                  value={entity || 'All (select a specific entity)'}
                  disabled
                  className={inputCls + ' !bg-[var(--color-surface-2)] opacity-70'}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Month</label>
                  <select
                    value={month}
                    onChange={e => setMonth(Number(e.target.value))}
                    className={inputCls}
                  >
                    {MONTHS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Year</label>
                  <select
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    className={inputCls}
                  >
                    {yearOptions.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={handleGenerate} disabled={submitting || !entity || entity === 'All'}>
                {submitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
                {submitting ? 'Generating...' : 'Generate Forms'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 space-y-2">
              <p className="text-sm font-medium text-[var(--color-text)]">Period Closed Successfully</p>
              <div className="text-sm text-[var(--color-muted-fg)] space-y-1">
                <p>Generated: <span className="font-semibold text-emerald-700">{result.generated?.length || 0}</span></p>
                <p>Updated: <span className="font-semibold text-blue-700">{result.updated?.length || 0}</span></p>
                {result.generated?.map((f, i) => (
                  <p key={`g-${i}`} className="pl-3 text-emerald-600">+ {f.form_type}</p>
                ))}
                {result.updated?.map((f, i) => (
                  <p key={`u-${i}`} className="pl-3 text-blue-600">↻ {f.form_type}</p>
                ))}
                {result.errors?.length > 0 && (
                  <p className="text-amber-600">Errors: {result.errors.length}</p>
                )}
                {result.is_quarter_end && <p className="text-xs mt-1 text-[var(--color-muted-fg)]">Quarter-end forms included (1601-EQ, 2550Q, 1702Q)</p>}
                {result.is_year_end && <p className="text-xs text-[var(--color-muted-fg)]">Year-end forms included (1702, 2316 per employee)</p>}
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button size="sm" onClick={handleDone}>Done</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function TaxBIRForms() {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Opportunity filter from CRM pipeline
  const opportunityId = searchParams.get('opportunity_id') || ''

  // Data state
  const [loading, setLoading] = useState(false)
  const [forms, setForms] = useState([])
  const [dealName, setDealName] = useState('')

  // Filter state
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterDirection, setFilterDirection] = useState('')

  // UI state
  const [showClosePeriod, setShowClosePeriod] = useState(false)
  const [showManualOverride, setShowManualOverride] = useState(false)

  // Fetch deal name when opportunity_id is present
  useEffect(() => {
    if (!opportunityId) return
    const BASE = import.meta.env.VITE_API_URL
    const token = localStorage.getItem('access_token')
    fetch(`${BASE}/opportunities/${opportunityId}`, {
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setDealName(data?.project_name || `Deal #${opportunityId}`))
      .catch(() => setDealName(`Deal #${opportunityId}`))
  }, [opportunityId])

  const clearOpportunityFilter = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('opportunity_id')
      return next
    }, { replace: true })
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      let params = entityParam(entity).replace(/^&/, '')
      if (filterType) params += `&form_type=${encodeURIComponent(filterType)}`
      if (filterStatus) params += `&status=${encodeURIComponent(filterStatus)}`
      if (filterMonth) params += `&month=${filterMonth}`
      if (filterYear) params += `&year=${filterYear}`
      if (opportunityId) params += `&opportunity_id=${opportunityId}`
      if (filterDirection) params += `&direction=${filterDirection}`
      const result = await apiGet(`/tax/bir-forms?${params}`)
      setForms(result?.forms || result || [])
    } catch (err) {
      notify.error(err.message || 'Failed to load BIR forms')
    } finally {
      setLoading(false)
    }
  }, [entity, filterType, filterStatus, filterMonth, filterYear, opportunityId, filterDirection])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData() }, [fetchData])

  // Client-side search filtering (on top of server-side filters)
  const filtered = forms.filter(f => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (f.form_code || '').toLowerCase().includes(q) ||
      (f.form_type || '').toLowerCase().includes(q) ||
      (f.payee_name || f.payee || '').toLowerCase().includes(q) ||
      (f.subject || '').toLowerCase().includes(q) ||
      (f.status || '').toLowerCase().includes(q)
    )
  })

  const navigateToForm = (row) => {
    navigate(`/tax/forms/${row.form_type}/${row.form_record_id}`)
  }

  const clearFilters = () => {
    setFilterType('')
    setFilterStatus('')
    setFilterMonth('')
    setFilterYear('')
    setFilterDirection('')
    setSearch('')
  }

  const hasActiveFilters = filterType || filterStatus || filterMonth || filterYear || filterDirection

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <SectionHeader title="BIR Forms">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowClosePeriod(true)}
            className="gap-1.5"
          >
            <CalendarCheck size={14} />
            Close Period
          </Button>

          {/* Manual Override dropdown */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowManualOverride(!showManualOverride)}
              className="text-[var(--color-muted-fg)] text-xs gap-1"
            >
              <ChevronDown size={12} className={showManualOverride ? 'rotate-180 transition-transform' : 'transition-transform'} />
              Manual
            </Button>
            {showManualOverride && (
              <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg py-1 min-w-[140px]">
                <button
                  onClick={() => { navigate('/tax/forms/2307/new'); setShowManualOverride(false) }}
                  className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] flex items-center gap-1.5"
                >
                  <Plus size={12} /> New 2307
                </button>
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </SectionHeader>

      {/* Opportunity filter banner */}
      {opportunityId && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-4 py-2.5">
          <LinkIcon size={14} className="text-[var(--color-primary)] shrink-0" />
          <p className="text-sm text-[var(--color-text)] flex-1">
            Showing tax forms related to <strong>{dealName || `Deal #${opportunityId}`}</strong>
          </p>
          <button
            onClick={clearOpportunityFilter}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] transition-colors"
          >
            <X size={12} /> Show all forms
          </button>
        </div>
      )}

      {/* Direction tabs (for 2307 forms) */}
      {filterType === '2307' && (
        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 w-fit">
          <button
            type="button"
            onClick={() => setFilterDirection('')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              !filterDirection ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm' : 'text-[var(--color-muted-fg)] hover:text-[var(--color-text)]'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterDirection('issued')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterDirection === 'issued' ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm' : 'text-[var(--color-muted-fg)] hover:text-[var(--color-text)]'
            }`}
          >
            Issued to Suppliers
          </button>
          <button
            type="button"
            onClick={() => setFilterDirection('received')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterDirection === 'received' ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm' : 'text-[var(--color-muted-fg)] hover:text-[var(--color-text)]'
            }`}
          >
            From Clients (Receivable)
          </button>
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
          <input
            type="text"
            placeholder="Search forms..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={inputCls + ' !w-[200px] !pl-8 !py-1.5'}
          />
        </div>

        {/* Form Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className={inputCls + ' !w-[130px] !py-1.5'}
        >
          <option value="">All Types</option>
          {FORM_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className={inputCls + ' !w-[160px] !py-1.5'}
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>

        {/* Period filter - month */}
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className={inputCls + ' !w-[130px] !py-1.5'}
        >
          <option value="">All Months</option>
          {MONTHS.map(m => (
            <option key={m.value} value={m.value}>{m.label.slice(0, 3)}</option>
          ))}
        </select>

        {/* Period filter - year */}
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className={inputCls + ' !w-[100px] !py-1.5'}
        >
          <option value="">Year</option>
          {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading && !forms.length ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Form Code</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Form Type</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Direction</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Entity</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Period</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Subject</th>
                <th className="px-4 py-2.5 text-right font-medium text-[var(--color-muted-fg)]">Amount</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map((row, i) => (
                <tr
                  key={row.id || row.form_record_id || i}
                  className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)]/50 cursor-pointer transition-colors"
                  onClick={() => navigateToForm(row)}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs font-medium text-[var(--color-primary)]">
                      {row.form_code || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                      <FileText size={13} className="text-[var(--color-muted-fg)]" />
                      {row.form_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {row.direction === 'issued' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">↑ Issued</span>
                    ) : row.direction === 'received' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">↓ Receivable{row.received_file_url ? ' ✓' : ''}</span>
                    ) : (
                      <span className="text-[var(--color-muted-fg)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{row.entity || '—'}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                    {row.period || (row.period_from && row.period_to ? `${row.period_from} – ${row.period_to}` : '—')}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{row.subject || row.payee_name || row.payee || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-[var(--color-text)]">
                    {row.total_amount != null ? money(row.total_amount) : row.amount != null ? money(row.amount) : '—'}
                  </td>
                  <td className="px-4 py-2.5"><FormStatusBadge status={row.status} /></td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{formatDate(row.created_at)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[var(--color-muted-fg)]">
                    {search || hasActiveFilters
                      ? 'No forms match the current filters.'
                      : 'No BIR forms yet. Forms are auto-generated when source transactions (AP, Payroll, AR) are posted, or use "Close Period" to generate for a specific month.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Row count footer */}
          {filtered.length > 0 && (
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-xs text-[var(--color-muted-fg)]">
              Showing {filtered.length} form{filtered.length !== 1 ? 's' : ''}
              {hasActiveFilters && ' (filtered)'}
            </div>
          )}
        </div>
      )}

      {/* Close Period Modal */}
      {showClosePeriod && (
        <ClosePeriodModal
          entity={entity}
          onClose={() => setShowClosePeriod(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  )
}
