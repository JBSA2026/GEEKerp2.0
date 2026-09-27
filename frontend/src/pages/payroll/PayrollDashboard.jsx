import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { PhilippinePeso, Users, FileText, Loader2, Banknote, Calculator } from 'lucide-react'
import { apiGet, money, fmtDate, STATUS_COLORS } from './payrollUtils'

function Spin() {
  return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}><Icon size={18} /></div>
      <div><p className="text-lg font-semibold text-[var(--color-text)]">{value}</p><p className="text-[11px] text-[var(--color-muted-fg)]">{label}</p></div>
    </div>
  )
}

function StatusBadge({ status }) {
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_COLORS[status] || 'bg-slate-100 text-slate-600')}>{status}</span>
}

function QuickAction({ icon: Icon, label, sub, onClick }) {
  return (
    <div onClick={onClick} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/5 transition-colors cursor-pointer">
      <Icon size={16} className="text-[var(--color-primary)] mb-1.5" />
      <p className="text-xs font-medium text-[var(--color-text)]">{label}</p>
      <p className="text-[10px] text-[var(--color-muted-fg)]">{sub}</p>
    </div>
  )
}

function DeductionBar({ label, color }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn('w-2 h-2 rounded-full', color)} />
      <span className="text-xs text-[var(--color-text)] flex-1">{label}</span>
    </div>
  )
}

export function PayrollDashboard() {
  const { navigate } = useOutletContext()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/payroll/dashboard').then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin />
  if (!data) return null

  const latestRun = data.latest_run

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Payroll Employees" value={data.total_employees} icon={Users} color="text-blue-600 bg-blue-50" />
        <StatCard label="Total Runs" value={data.total_runs} icon={FileText} color="text-purple-600 bg-purple-50" />
        <StatCard label="Active Loans" value={data.active_loans} icon={Banknote} color="text-amber-600 bg-amber-50" />
        <StatCard label="Loan Balance" value={money(data.total_loan_balance)} icon={Calculator} color="text-rose-600 bg-rose-50" />
        <StatCard label="Last Net Payout" value={latestRun ? money(latestRun.total_net) : '—'} icon={PhilippinePeso} color="text-emerald-600 bg-emerald-50" />
      </div>

      {/* Latest Run Detail Card */}
      {latestRun ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Latest Payroll Run</h3>
              <p className="text-xs text-[var(--color-muted-fg)]">{fmtDate(latestRun.period_start)} — {fmtDate(latestRun.period_end)} · {latestRun.total_employees} employees</p>
            </div>
            <StatusBadge status={latestRun.status} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[var(--color-surface-2)] rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-[var(--color-text)]">{money(latestRun.total_gross)}</p>
              <p className="text-[10px] text-[var(--color-muted-fg)]">Total Gross Pay</p>
            </div>
            <div className="bg-[var(--color-surface-2)] rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-amber-600">{money(latestRun.total_deductions)}</p>
              <p className="text-[10px] text-[var(--color-muted-fg)]">Total Deductions</p>
            </div>
            <div className="bg-[var(--color-surface-2)] rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-emerald-600">{money(latestRun.total_net)}</p>
              <p className="text-[10px] text-[var(--color-muted-fg)]">Total Net Pay</p>
            </div>
            <div className="bg-[var(--color-surface-2)] rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-[var(--color-text)]">{latestRun.total_employees}</p>
              <p className="text-[10px] text-[var(--color-muted-fg)]">Employees Paid</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <Calculator size={32} className="mx-auto text-[var(--color-muted)] mb-3" />
          <p className="text-sm font-medium text-[var(--color-text)]">No Payroll Runs Yet</p>
          <p className="text-xs text-[var(--color-muted-fg)] mt-1">Go to "Run Payroll" tab to generate your first payroll.</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="text-xs font-semibold uppercase text-[var(--color-muted-fg)] mb-3">Quick Actions</h3>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction icon={Calculator} label="Generate Payroll" sub="Compute pay for all employees" onClick={() => navigate('/payroll/generate')} />
          <QuickAction icon={FileText} label="View History" sub="Past payroll runs & payslips" onClick={() => navigate('/payroll/history')} />
          <QuickAction icon={Users} label="Employee Compensation" sub="Manage salaries & bank info" onClick={() => navigate('/payroll/employees')} />
          <QuickAction icon={Banknote} label="Manage Loans" sub="Track advances & deductions" onClick={() => navigate('/payroll/loans')} />
        </div>
      </div>

      {/* Payroll Breakdown (if latest run exists) */}
      {latestRun && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="text-xs font-semibold uppercase text-[var(--color-muted-fg)] mb-3">Statutory Deductions (Last Run)</h3>
            <div className="space-y-2">
              <DeductionBar label="SSS" color="bg-blue-500" />
              <DeductionBar label="PhilHealth" color="bg-emerald-500" />
              <DeductionBar label="Pag-IBIG" color="bg-amber-500" />
              <DeductionBar label="Withholding Tax" color="bg-purple-500" />
              <DeductionBar label="Loans" color="bg-rose-500" />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="text-xs font-semibold uppercase text-[var(--color-muted-fg)] mb-3">Pay Summary</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)]">
                <span className="text-xs text-[var(--color-muted-fg)]">Gross Pay</span>
                <span className="text-sm font-medium text-[var(--color-text)]">{money(latestRun.total_gross)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)]">
                <span className="text-xs text-[var(--color-muted-fg)]">Total Deductions</span>
                <span className="text-sm font-medium text-amber-600">−{money(latestRun.total_deductions)}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs font-semibold text-[var(--color-text)]">Net Pay (Take Home)</span>
                <span className="text-sm font-bold text-emerald-600">{money(latestRun.total_net)}</span>
              </div>
              <div className="mt-2 bg-[var(--color-surface-2)] rounded-lg p-2">
                <p className="text-[10px] text-[var(--color-muted-fg)]">Avg. net per employee: {money(Number(latestRun.total_net) / (latestRun.total_employees || 1))}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Runs Table */}
      {data.recent_runs?.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <span className="text-xs font-semibold text-[var(--color-text)]">Payroll History</span>
          </div>
          <table className="w-full text-left">
            <thead><tr className="border-b border-[var(--color-border)]"><th className="px-4 py-2 text-[10px] text-[var(--color-muted-fg)]">Period</th><th className="px-4 py-2 text-[10px] text-[var(--color-muted-fg)]">Employees</th><th className="px-4 py-2 text-[10px] text-[var(--color-muted-fg)]">Frequency</th><th className="px-4 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Gross</th><th className="px-4 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Deductions</th><th className="px-4 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Net</th><th className="px-4 py-2 text-[10px] text-[var(--color-muted-fg)]">Status</th><th className="px-4 py-2 text-[10px] text-[var(--color-muted-fg)]">Generated By</th></tr></thead>
            <tbody>{data.recent_runs.map(r => (
              <tr key={r.run_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                <td className="px-4 py-2 text-xs text-[var(--color-text)]">{fmtDate(r.period_start)} — {fmtDate(r.period_end)}</td>
                <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)]">{r.total_employees}</td>
                <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)]">{r.pay_frequency || '—'}</td>
                <td className="px-4 py-2 text-xs text-right tabular-nums">{money(r.total_gross)}</td>
                <td className="px-4 py-2 text-xs text-right tabular-nums text-amber-600">{money(r.total_deductions)}</td>
                <td className="px-4 py-2 text-xs text-right tabular-nums font-medium text-emerald-600">{money(r.total_net)}</td>
                <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2 text-[10px] text-[var(--color-muted-fg)]">{r.generated_by || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
