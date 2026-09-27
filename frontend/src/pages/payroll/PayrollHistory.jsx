import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Loader2, Download, X } from 'lucide-react'
import { apiGet, money, fmtDate, STATUS_COLORS, BASE_URL } from './payrollUtils'

function Spin() {
  return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
}

function StatusBadge({ status }) {
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_COLORS[status] || 'bg-slate-100 text-slate-600')}>{status}</span>
}

export function PayrollHistory() {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    apiGet('/payroll/runs').then(setRuns).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function viewRun(run_id) {
    try {
      setDetail(await apiGet(`/payroll/runs/${run_id}`))
    } catch {
      notify.error('Failed to load')
    }
  }

  if (loading) return <Spin />

  return (
    <div className="space-y-4">
      {detail && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Run #{detail.run_id} — {fmtDate(detail.period_start)} to {fmtDate(detail.period_end)}</p>
              <StatusBadge status={detail.status} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => window.open(`${BASE_URL}/payroll/runs/${detail.run_id}/export-register`, '_blank')}><Download size={12} /> Register</Button>
              <Button size="sm" variant="outline" onClick={() => window.open(`${BASE_URL}/payroll/runs/${detail.run_id}/export-bank`, '_blank')}><Download size={12} /> Bank File</Button>
              <Button size="sm" variant="ghost" onClick={() => setDetail(null)}><X size={12} /></Button>
            </div>
          </div>
          {detail.items?.length > 0 && (
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[var(--color-surface)]"><tr className="border-b border-[var(--color-border)]"><th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)]">Employee</th><th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Gross</th><th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Deductions</th><th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Net Pay</th></tr></thead>
                <tbody>{detail.items.map(i => (
                  <tr key={i.employee_id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--color-text)]">{i.employee_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(i.gross_pay)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted-fg)]">{money(i.total_deductions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-600">{money(i.net_pay)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[var(--color-surface-2)]"><tr className="border-b border-[var(--color-border)]"><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Run #</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Period</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Employees</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)] text-right">Total Net</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Status</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Generated</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]"></th></tr></thead>
          <tbody>{runs.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No payroll runs yet.</td></tr> : runs.map(r => (
            <tr key={r.run_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] cursor-pointer" onClick={() => viewRun(r.run_id)}>
              <td className="px-4 py-2.5 text-xs font-mono text-[var(--color-text)]">#{r.run_id}</td>
              <td className="px-4 py-2.5 text-xs text-[var(--color-text)]">{fmtDate(r.period_start)} — {fmtDate(r.period_end)}</td>
              <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{r.total_employees}</td>
              <td className="px-4 py-2.5 text-xs text-right tabular-nums font-medium">{money(r.total_net)}</td>
              <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
              <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{fmtDate(r.created_at)}</td>
              <td className="px-4 py-2.5 text-xs text-[var(--color-primary)]">View →</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}
