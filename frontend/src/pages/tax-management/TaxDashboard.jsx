import { useState, useEffect, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import {
  Loader2, RefreshCw, AlertTriangle, Clock, CheckCircle2,
  FileText, AlertCircle, CalendarClock, ArrowRight, ShieldAlert,
  CircleDot, Activity, Building2, Zap, Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { notify } from '@/utils/toast'
import { apiGet, apiPost, entityParam, money, formatDate, MetricCard } from './taxUtils'
import { TaxFilingCalendar } from './TaxFilingCalendar'

// ─── Status / Severity Badges ───────────────────────────────────────────────

function SeverityBadge({ severity }) {
  if (severity === 'high') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
      <AlertTriangle size={10} /> High
    </span>
  )
  if (severity === 'medium') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      <AlertCircle size={10} /> Medium
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
      <CircleDot size={10} /> Low
    </span>
  )
}

function DeadlineUrgency({ daysRemaining }) {
  if (daysRemaining <= 3) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
      <AlertTriangle size={11} /> {daysRemaining}d left
    </span>
  )
  if (daysRemaining <= 7) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
      <Clock size={11} /> {daysRemaining}d left
    </span>
  )
  if (daysRemaining <= 14) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
      <CalendarClock size={11} /> {daysRemaining}d
    </span>
  )
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {daysRemaining}d
    </span>
  )
}

function FormStatusBadge({ status }) {
  const s = (status || '').toUpperCase()
  if (s === 'FINALIZED') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
      <CheckCircle2 size={10} /> Finalized
    </span>
  )
  if (s === 'DRAFT') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      <FileText size={10} /> Draft
    </span>
  )
  if (s === 'PENDING_APPROVAL') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
      <Clock size={10} /> Pending
    </span>
  )
  return <span className="text-[10px] text-slate-500">{status || '—'}</span>
}

function ActionBadge({ action }) {
  if (action === 'AUTO_GENERATED') return <span className="text-[10px] font-medium text-emerald-600">Auto-generated</span>
  if (action === 'AUTO_UPDATED') return <span className="text-[10px] font-medium text-sky-600">Auto-updated</span>
  if (action === 'FINALIZED') return <span className="text-[10px] font-medium text-emerald-700">Finalized</span>
  if (action === 'CREATED') return <span className="text-[10px] font-medium text-slate-600">Created</span>
  if (action === 'UPDATED') return <span className="text-[10px] font-medium text-amber-600">Updated</span>
  if (action === 'SUBMITTED_FOR_APPROVAL') return <span className="text-[10px] font-medium text-blue-600">Submitted</span>
  return <span className="text-[10px] font-medium text-slate-500">{action}</span>
}

// ─── Section Card ───────────────────────────────────────────────────────────

function DashSection({ title, icon: Icon, count, countColor, children, emptyMessage }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} className="text-[var(--color-muted-fg)]" />}
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
        </div>
        {count != null && count > 0 && (
          <span className={cn(
            'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold min-w-[20px]',
            countColor || 'bg-slate-100 text-slate-700'
          )}>
            {count}
          </span>
        )}
      </div>
      <div className="px-5 py-3">
        {(!children || (Array.isArray(children) && children.length === 0)) ? (
          <p className="py-4 text-center text-sm text-[var(--color-muted-fg)]">
            {emptyMessage || 'Nothing to show'}
          </p>
        ) : children}
      </div>
    </div>
  )
}

// ─── Missing Forms List (Actionable) ────────────────────────────────────────

function MissingFormsList({ missingForms, missingOfficial, onGenerated }) {
  const navigate = useNavigate()
  const [generating, setGenerating] = useState(null)
  const [activeSection, setActiveSection] = useState('system') // 'system' | 'official'

  // Group system missing forms by entity+period
  const grouped = {}
  for (const item of (missingForms || [])) {
    const key = `${item.entity}__${item.period_from}__${item.period_to}`
    if (!grouped[key]) {
      grouped[key] = {
        entity: item.entity,
        period: item.period,
        period_from: item.period_from,
        period_to: item.period_to,
        forms: [],
      }
    }
    grouped[key].forms.push(item)
  }

  const handleGenerateAll = async (group) => {
    const key = `${group.entity}__${group.period_from}__${group.period_to}`
    setGenerating(key)
    try {
      const month = parseInt(group.period_from.slice(5, 7), 10)
      const year = parseInt(group.period_from.slice(0, 4), 10)
      const params = `?entity=${encodeURIComponent(group.entity)}&month=${month}&year=${year}`
      const result = await apiPost(`/tax/bir-forms/close-period${params}`)
      const totalForms = (result.generated?.length || 0) + (result.updated?.length || 0)
      notify.success(`Generated ${totalForms} form(s) for ${group.entity} (${group.period})`)
      onGenerated()
    } catch (err) {
      notify.error(err.message || 'Failed to generate forms')
    } finally {
      setGenerating(null)
    }
  }

  const systemCount = missingForms?.length || 0
  const officialCount = missingOfficial?.length || 0
  const totalCount = systemCount + officialCount

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        <button
          onClick={() => setActiveSection('system')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
            activeSection === 'system'
              ? 'border-rose-500 text-rose-700'
              : 'border-transparent text-[var(--color-muted-fg)] hover:text-[var(--color-text)]'
          )}
        >
          <FileText size={12} />
          System Forms
          {systemCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 min-w-[18px]">
              {systemCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSection('official')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
            activeSection === 'official'
              ? 'border-amber-500 text-amber-700'
              : 'border-transparent text-[var(--color-muted-fg)] hover:text-[var(--color-text)]'
          )}
        >
          <AlertCircle size={12} />
          Official Filed Copies
          {officialCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 min-w-[18px]">
              {officialCount}
            </span>
          )}
        </button>
      </div>

      {/* System Missing Forms */}
      {activeSection === 'system' && (
        <div className="space-y-3 max-h-[450px] overflow-y-auto">
          {systemCount === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 size={24} className="text-emerald-500 mb-2" />
              <p className="text-xs text-[var(--color-muted-fg)]">All expected system forms have been generated</p>
            </div>
          ) : (
            Object.values(grouped).map((group) => {
              const key = `${group.entity}__${group.period_from}__${group.period_to}`
              const isGenerating = generating === key

              return (
                <div key={key} className="rounded-lg border border-rose-200 bg-rose-50/40 p-3.5">
                  <div className="flex items-center justify-between mb-2.5">
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-text)]">{group.entity}</p>
                      <p className="text-[10px] text-[var(--color-muted-fg)]">Period: {group.period} • {group.forms.length} form{group.forms.length > 1 ? 's' : ''} missing</p>
                    </div>
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 text-[11px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
                      onClick={() => handleGenerateAll(group)}
                      disabled={isGenerating}
                    >
                      {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                      {isGenerating ? 'Generating...' : 'Generate All'}
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    {group.forms.map((item, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md border border-rose-100 bg-white px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100">
                            <FileText size={12} className="text-rose-600" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-[var(--color-text)]">{item.form_type}</p>
                            <p className="text-[10px] text-[var(--color-muted-fg)]">{item.message}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => navigate(`/tax/forms/${item.form_type}/new`)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
                        >
                          <Plus size={10} /> Create
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Missing Official Filed Copies */}
      {activeSection === 'official' && (
        <div className="space-y-2 max-h-[450px] overflow-y-auto">
          {officialCount === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 size={24} className="text-emerald-500 mb-2" />
              <p className="text-xs text-[var(--color-muted-fg)]">All finalized forms have official copies uploaded</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 mb-3">
                <p className="text-[11px] text-amber-700">
                  <AlertCircle size={11} className="inline mr-1" />
                  These forms are finalized in the system but don't have the official filed BIR copy uploaded. Upload the filed form for LOA compliance.
                </p>
              </div>
              {(missingOfficial || []).map((item, i) => (
                <div
                  key={i}
                  onClick={() => navigate(`/tax/forms/${item.form_type}/${item.form_record_id}`)}
                  className="flex items-center justify-between rounded-lg border border-amber-100 bg-white px-3 py-2.5 cursor-pointer hover:bg-amber-50/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
                      <AlertCircle size={12} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-text)]">
                        {item.form_type}
                        {item.payee_name ? ` — ${item.payee_name}` : ''}
                      </p>
                      <p className="text-[10px] text-[var(--color-muted-fg)]">
                        {item.entity} • {item.period}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      No filed copy
                    </span>
                    <ArrowRight size={12} className="text-[var(--color-muted-fg)]" />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export function TaxDashboard() {
  const { entity } = useOutletContext()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [dashData, setDashData] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const ep = entity && entity !== 'All' ? `?entity=${encodeURIComponent(entity)}` : ''
      const [compliance, dashboard, amendments] = await Promise.all([
        apiGet(`/tax/compliance-check${ep}`),
        apiGet(`/tax/dashboard${ep ? ep.replace('?', '?') : ''}`),
        apiGet(`/tax/amendment-warnings${ep ? ep : '?'}${ep ? '&' : ''}resolved=false`),
      ])
      setData({ ...compliance, amendment_warnings: Array.isArray(amendments) ? amendments : [] })
      setDashData(dashboard)
    } catch (err) {
      notify.error(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [entity])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-sm text-[var(--color-muted-fg)]">Failed to load compliance data.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
          <RefreshCw size={14} className="mr-1.5" /> Retry
        </Button>
      </div>
    )
  }

  const { missing_forms, overdue, needs_action, upcoming, recent_activity, entity_gaps, status_summary, summary } = data
  const totalIssues = (summary?.missing_count || 0) + (summary?.missing_official_count || 0) + (summary?.overdue_count || 0)

  return (
    <div className="space-y-6">
      {/* ─── Top Summary Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {totalIssues > 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              <ShieldAlert size={16} className="text-rose-600" />
              <span className="text-sm font-medium text-rose-700">
                {totalIssues} compliance {totalIssues === 1 ? 'issue' : 'issues'} detected
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">All caught up — no compliance gaps</span>
            </div>
          )}
          {summary?.urgent_deadlines > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <Clock size={16} className="text-amber-600" />
              <span className="text-sm font-medium text-amber-700">
                {summary.urgent_deadlines} deadline{summary.urgent_deadlines > 1 ? 's' : ''} within 7 days
              </span>
            </div>
          )}
        </div>

      </div>

      {/* ─── Status Summary Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Draft Forms"
          value={status_summary?.DRAFT ?? 0}
          color={status_summary?.DRAFT > 0 ? 'text-amber-600' : 'text-[var(--color-text)]'}
        />
        <MetricCard
          label="Pending Approval"
          value={status_summary?.PENDING_APPROVAL ?? 0}
          color={status_summary?.PENDING_APPROVAL > 0 ? 'text-blue-600' : 'text-[var(--color-text)]'}
        />
        <MetricCard
          label="Finalized"
          value={status_summary?.FINALIZED ?? 0}
          color="text-emerald-600"
        />
        <MetricCard
          label="Net VAT Position"
          value={dashData?.vat ? money(dashData.vat.net_vat) : '—'}
          color={dashData?.vat?.net_vat > 0 ? 'text-rose-600' : 'text-emerald-600'}
        />
      </div>

      {/* ─── Tax Filing Calendar ────────────────────────────────────────── */}
      <TaxFilingCalendar entity={entity} />

      {/* ─── Main Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Missing Forms — Full Width */}
        <div className="lg:col-span-2">
          <DashSection
            title="Missing Forms & Filed Copies"
            icon={AlertTriangle}
            count={(missing_forms?.length || 0) + (data.missing_official?.length || 0)}
            countColor="bg-rose-100 text-rose-700"
            emptyMessage="✓ All forms generated and official copies uploaded"
          >
            {((missing_forms?.length || 0) + (data.missing_official?.length || 0)) > 0 && (
              <MissingFormsList
                missingForms={missing_forms}
                missingOfficial={data.missing_official}
                onGenerated={fetchData}
              />
            )}
          </DashSection>
        </div>

        {/* Overdue / Stale Drafts */}
        <DashSection
          title="Overdue — Still in Draft"
          icon={AlertCircle}
          count={overdue?.length}
          countColor="bg-rose-100 text-rose-700"
          emptyMessage="✓ No overdue forms"
        >
          {overdue?.length > 0 && (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {overdue.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 cursor-pointer hover:bg-amber-50 transition-colors"
                  onClick={() => navigate(`/tax/forms/${item.form_type}/${item.form_record_id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                      <FileText size={14} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-text)]">{item.form_type}</p>
                      <p className="text-[10px] text-[var(--color-muted-fg)]">{item.entity} · {item.period}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <FormStatusBadge status={item.status} />
                    <ArrowRight size={12} className="text-[var(--color-muted-fg)]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashSection>

        {/* Amendment Warnings */}
        {data.amendment_warnings?.length > 0 && (
          <DashSection
            title="⚠️ Amendment Risk"
            icon={AlertTriangle}
            count={data.amendment_warnings.length}
            countColor="bg-orange-100 text-orange-700"
          >
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              <div className="rounded-lg border border-orange-200 bg-orange-50/60 px-3 py-2 mb-2">
                <p className="text-[11px] text-orange-700">
                  New transactions were recorded in periods where BIR forms are already submitted/approved/filed. These may require an amended return.
                </p>
              </div>
              {data.amendment_warnings.map((w, i) => (
                <div key={i} className="rounded-lg border border-orange-100 bg-white px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={13} className="text-orange-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-[var(--color-text)]">
                        {w.form_type} — {w.entity}
                      </p>
                      <p className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{w.message}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-orange-600 font-medium">
                          Form status: {w.form_status}
                        </span>
                        <span className="text-[10px] text-[var(--color-muted-fg)]">
                          Trigger: {w.trigger_reference || w.trigger_type}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DashSection>
        )}

        {/* Needs Action */}
        <DashSection
          title="Needs Your Action"
          icon={Activity}
          count={needs_action?.length}
          countColor="bg-amber-100 text-amber-700"
          emptyMessage="✓ No forms requiring action"
        >
          {needs_action?.length > 0 && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {needs_action.slice(0, 10).map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-2)] transition-colors"
                  onClick={() => navigate(`/tax/forms/${item.form_type}/${item.form_record_id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      item.status === 'DRAFT' ? 'bg-amber-100' : 'bg-blue-100'
                    )}>
                      <FileText size={14} className={item.status === 'DRAFT' ? 'text-amber-600' : 'text-blue-600'} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-text)]">
                        {item.form_type}
                        {item.payee_name ? ` — ${item.payee_name}` : ''}
                      </p>
                      <p className="text-[10px] text-[var(--color-muted-fg)]">
                        {item.entity} · {item.period_from} to {item.period_to}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <FormStatusBadge status={item.status} />
                    <ArrowRight size={12} className="text-[var(--color-muted-fg)]" />
                  </div>
                </div>
              ))}
              {needs_action.length > 10 && (
                <p className="pt-1 text-center text-[11px] text-[var(--color-muted-fg)]">
                  + {needs_action.length - 10} more forms
                </p>
              )}
            </div>
          )}
        </DashSection>

        {/* Upcoming Deadlines */}
        <DashSection
          title="Upcoming Deadlines"
          icon={CalendarClock}
          count={upcoming?.filter(d => d.days_remaining <= 14).length}
          countColor="bg-sky-100 text-sky-700"
          emptyMessage="No upcoming deadlines"
        >
          {upcoming?.length > 0 && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {upcoming.slice(0, 8).map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2.5">
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text)]">{item.form}</p>
                    <p className="text-[10px] text-[var(--color-muted-fg)]">{item.description}</p>
                    <p className="text-[10px] text-[var(--color-muted-fg)]">
                      Due: {formatDate(item.due_date)} · Period: {item.period_covered}
                    </p>
                  </div>
                  <DeadlineUrgency daysRemaining={item.days_remaining} />
                </div>
              ))}
            </div>
          )}
        </DashSection>

        {/* Entity Gaps */}
        {entity_gaps?.length > 0 && (
          <DashSection
            title="Entity Configuration Gaps"
            icon={Building2}
            count={entity_gaps.length}
            countColor="bg-slate-100 text-slate-700"
          >
            <div className="space-y-2">
              {entity_gaps.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text)]">{item.entity}</p>
                    <p className="text-[10px] text-[var(--color-muted-fg)]">{item.issue}</p>
                  </div>
                  <SeverityBadge severity={item.severity} />
                </div>
              ))}
            </div>
          </DashSection>
        )}

        {/* Recent Activity */}
        <DashSection
          title="Recent Activity"
          icon={Activity}
          emptyMessage="No recent activity"
        >
          {recent_activity?.length > 0 && (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {recent_activity.slice(0, 10).map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
                  onClick={() => navigate(`/tax/forms/${item.form_type || ''}/${item.form_record_id}`)}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100">
                      <FileText size={11} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-[var(--color-text)]">
                        {item.form_type} {item.entity ? `(${item.entity})` : ''}
                      </p>
                      <p className="text-[10px] text-[var(--color-muted-fg)] line-clamp-1">
                        {item.details || item.action}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <ActionBadge action={item.action} />
                    <span className="text-[9px] text-[var(--color-muted-fg)]">
                      {item.created_at ? formatDate(item.created_at) : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashSection>
      </div>

      {/* ─── Quick Tax Position ───────────────────────────────────────────── */}
      {dashData && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Current Tax Position</h3>
            <button
              className="text-xs font-medium text-[var(--color-primary)] hover:underline"
              onClick={() => navigate('/tax/vat')}
            >
              View Details →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Output VAT</p>
              <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{money(dashData.vat?.output_vat)}</p>
              <p className="text-[10px] text-[var(--color-muted-fg)]">{dashData.vat?.output_vat_invoices || 0} invoices</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Input VAT</p>
              <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{money(dashData.vat?.input_vat)}</p>
              <p className="text-[10px] text-[var(--color-muted-fg)]">{dashData.vat?.input_vat_bills || 0} bills</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">WHT (from Customers)</p>
              <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{money(dashData.wht?.wht_from_customers)}</p>
              <p className="text-[10px] text-[var(--color-muted-fg)]">{dashData.wht?.wht_invoice_count || 0} invoices</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">EWT (to Suppliers)</p>
              <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{money(dashData.wht?.ewt_to_suppliers)}</p>
              <p className="text-[10px] text-[var(--color-muted-fg)]">{dashData.wht?.ewt_bill_count || 0} bills</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
