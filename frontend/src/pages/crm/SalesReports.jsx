import { useState, useEffect } from 'react'
import { Loader2, TrendingUp, Users, Target, PhilippinePeso, Activity, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}
async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

function formatCurrency(val) {
  if (!val && val !== 0) return '₱0'
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function MetricCard({ icon: Icon, label, value, sub, color = 'text-[var(--color-text)]' }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-surface-2)] flex items-center justify-center">
          <Icon size={18} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">{label}</p>
          <p className={cn('text-xl font-semibold', color)}>{value}</p>
          {sub && <p className="text-[10px] text-[var(--color-muted)]">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

function StageBar({ stage, count, total, value, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-muted-fg)] w-24 shrink-0">{stage}</span>
      <div className="flex-1 h-6 bg-[var(--color-surface-2)] rounded-full overflow-hidden relative">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-[var(--color-text)]">{count} deals</span>
      </div>
      <span className="text-xs font-medium text-[var(--color-text)] w-24 text-right">{formatCurrency(value)}</span>
    </div>
  )
}

export default function SalesReports() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ customers: [], opportunities: [], activities: [], leads: [] })

  useEffect(() => {
    let c = false
    Promise.all([
      apiGet('/crm/customers/metrics'),
      apiGet('/crm/pipeline'),
      apiGet('/crm/activities'),
      apiGet('/leads/'),
    ]).then(([metrics, pipeline, activities, leads]) => {
      if (!c) setData({ metrics, pipeline, activities, leads })
    }).catch(() => {}).finally(() => { if (!c) setLoading(false) })
    return () => { c = true }
  }, [])

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>

  const { metrics = {}, pipeline = [], activities = [], leads = [] } = data

  // Computed metrics
  const totalPipelineValue = pipeline.reduce((s, i) => s + (Number(i.estimated_value) || 0), 0)
  const wonDeals = pipeline.filter(i => i.stage === 'Closed Won')
  const wonValue = wonDeals.reduce((s, i) => s + (Number(i.estimated_value) || 0), 0)
  const lostDeals = pipeline.filter(i => i.stage === 'Closed Lost')
  const openDeals = pipeline.filter(i => i.stage !== 'Closed Won' && i.stage !== 'Closed Lost')
  const winRate = (wonDeals.length + lostDeals.length) > 0 ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100) : 0
  const avgDealSize = wonDeals.length > 0 ? wonValue / wonDeals.length : 0

  // Pipeline by stage
  const stages = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']
  const stageColors = ['bg-blue-400', 'bg-indigo-400', 'bg-purple-400', 'bg-amber-400', 'bg-emerald-400', 'bg-rose-400']
  const stageData = stages.map((stage, i) => {
    const deals = pipeline.filter(p => (p.stage || 'Prospecting') === stage)
    return { stage, count: deals.length, value: deals.reduce((s, d) => s + (Number(d.estimated_value) || 0), 0), color: stageColors[i] }
  })

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto p-1">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Sales Performance Summary</h2>
        <p className="text-[11px] text-[var(--color-muted)]">Real-time metrics from your CRM data</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={PhilippinePeso} label="Pipeline Value" value={formatCurrency(totalPipelineValue)} />
        <MetricCard icon={TrendingUp} label="Won Revenue" value={formatCurrency(wonValue)} color="text-emerald-600" />
        <MetricCard icon={Target} label="Win Rate" value={`${winRate}%`} sub={`${wonDeals.length}W / ${lostDeals.length}L`} />
        <MetricCard icon={BarChart3} label="Avg Deal Size" value={formatCurrency(avgDealSize)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={Users} label="Total Clients" value={metrics.total_customers || 0} />
        <MetricCard icon={Target} label="Open Deals" value={openDeals.length} />
        <MetricCard icon={Activity} label="Activities Logged" value={activities.length} />
        <MetricCard icon={Users} label="Active Leads" value={leads.filter(l => l.lead_status !== 'Converted' && l.lead_status !== 'Unqualified').length} />
      </div>

      {/* Pipeline Breakdown */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Pipeline Breakdown by Stage</h3>
        <div className="space-y-3">
          {stageData.map(s => <StageBar key={s.stage} stage={s.stage} count={s.count} total={pipeline.length} value={s.value} color={s.color} />)}
        </div>
      </div>

      {/* Recent Activity Summary */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Recent Activity (Last 10)</h3>
        {activities.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No activities recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {activities.slice(0, 10).map(a => (
              <div key={a.activity_id} className="flex items-center gap-3 py-1.5 border-b border-[var(--color-border)] last:border-0">
                <span className="text-[10px] font-medium text-[var(--color-muted-fg)] bg-[var(--color-surface-2)] px-2 py-0.5 rounded w-20 text-center">{a.activity_type}</span>
                <span className="text-xs text-[var(--color-text)] flex-1 truncate">{a.subject}</span>
                {a.activity_date && <span className="text-[10px] text-[var(--color-muted)]">{new Date(a.activity_date).toLocaleDateString()}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
