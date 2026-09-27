import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { PhilippinePeso, Loader2, Download, Banknote, Calculator, X, Plus, Clock } from 'lucide-react'
import { apiGet, apiPost, apiPatch, money, fmtDate, inputCls, STATUS_COLORS, BASE_URL } from './payrollUtils'

const OVERTIME_OCCASIONS = [
  { value: 'REGULAR_WORKDAY', label: 'Regular Workday', rate: '125%' },
  { value: 'SPECIAL_NON_WORKING_HOLIDAY', label: 'Special Non-Working Holiday', rate: '130% (169% after 8h)' },
  { value: 'REGULAR_HOLIDAY', label: 'Regular Holiday', rate: '150% (195% after 8h)' },
  { value: 'NIGHT_SHIFT', label: 'Night Shift Differential', rate: '+10%' },
]

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

function PayrollRunDetail({ run, onAction, onClose, onRefresh }) {
  const [otItem, setOtItem] = useState(null) // item being edited for OT
  const [otEntries, setOtEntries] = useState([])
  const [otSaving, setOtSaving] = useState(false)
  const isDraft = run?.status === 'DRAFT'

  function openOt(item) {
    if (!isDraft) return
    setOtItem(item)
    setOtEntries(item.overtime_entries || [{ occasion: 'REGULAR_WORKDAY', hours: 0, night_shift: false }])
  }

  function addOtRow() {
    setOtEntries(prev => [...prev, { occasion: 'REGULAR_WORKDAY', hours: 0, night_shift: false }])
  }

  function updateOtRow(idx, field, value) {
    setOtEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  function removeOtRow(idx) {
    setOtEntries(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveOt() {
    if (!otItem) return
    setOtSaving(true)
    try {
      const validEntries = otEntries.filter(e => Number(e.hours) > 0)
      await apiPatch(`/payroll/items/${otItem.item_id}/overtime`, validEntries)
      notify.success('Overtime updated')
      setOtItem(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      notify.error(err.message || 'Failed to save overtime')
    } finally {
      setOtSaving(false)
    }
  }

  if (!run) return null
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Payroll Run #{run.run_id}</p>
          <p className="text-xs text-[var(--color-muted-fg)]">{fmtDate(run.period_start)} — {fmtDate(run.period_end)} · {run.total_employees} employees</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={run.status} />
          {onAction && run.status === 'DRAFT' && <Button size="sm" onClick={() => onAction('submit')}>Submit for Review</Button>}
          {onAction && run.status === 'FOR_REVIEW' && <Button size="sm" onClick={() => onAction('approve')}>Approve</Button>}
          {onAction && run.status === 'APPROVED' && <Button size="sm" onClick={() => onAction('release')}>Release</Button>}
          {onClose && <Button size="sm" variant="ghost" onClick={onClose}><X size={13} /></Button>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Gross" value={money(run.total_gross)} icon={PhilippinePeso} color="text-blue-600 bg-blue-50" />
        <StatCard label="Total Deductions" value={money(run.total_deductions)} icon={Calculator} color="text-amber-600 bg-amber-50" />
        <StatCard label="Total Net Pay" value={money(run.total_net)} icon={Banknote} color="text-emerald-600 bg-emerald-50" />
      </div>

      {run.items?.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-text)]">Payroll Register ({run.items.length} employees)</span>
            <div className="flex items-center gap-2">
              {isDraft && <span className="text-[10px] text-[var(--color-primary)] font-medium">Click a row to add overtime</span>}
              <Button size="sm" variant="outline" onClick={() => window.open(`${BASE_URL}/payroll/runs/${run.run_id}/export-register`, '_blank')}><Download size={12} /> Export</Button>
            </div>
          </div>
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--color-surface)] z-10"><tr className="border-b border-[var(--color-border)]">
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)]">Employee</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Basic</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Allow.</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">OT Pay</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Commission</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Gross</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">SSS</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">PhilH</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Pag-IBIG</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Tax</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Loans</th>
                <th className="px-3 py-2 text-[10px] text-[var(--color-muted-fg)] text-right">Net Pay</th>
              </tr></thead>
              <tbody>{run.items.map(item => (
                <tr key={item.employee_id} className={cn('border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]', isDraft && 'cursor-pointer')} onClick={() => openOt(item)}>
                  <td className="px-3 py-2 font-medium text-[var(--color-text)]">{item.employee_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(item.basic_salary)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(item.allowance)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(item.overtime_pay) > 0
                      ? <span className="text-[var(--color-primary)] font-medium">{money(item.overtime_pay)}</span>
                      : <span className="text-[var(--color-muted-fg)]">{isDraft ? <Clock size={11} className="inline" /> : '—'}</span>
                    }
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(item.commission_pay) > 0
                      ? <span className="text-amber-600 font-medium">{money(item.commission_pay)}</span>
                      : <span className="text-[var(--color-muted-fg)]">—</span>
                    }
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{money(item.gross_pay)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted-fg)]">{money(item.sss_employee)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted-fg)]">{money(item.philhealth_employee)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted-fg)]">{money(item.pagibig_employee)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted-fg)]">{money(item.withholding_tax)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted-fg)]">{money(item.loan_deductions)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600">{money(item.net_pay)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overtime Drawer/Modal */}
      {otItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setOtItem(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl mx-4 animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Overtime — {otItem.employee_name}</h3>
                <p className="text-[11px] text-[var(--color-muted-fg)]">Add overtime hours by occasion type. Rates follow DOLE Labor Code.</p>
              </div>
              <button onClick={() => setOtItem(null)} className="p-1 rounded hover:bg-slate-100"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {/* Rate reference */}
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <p className="text-[10px] font-semibold text-blue-700 uppercase mb-1.5">Rate Reference</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600">
                  <span>Regular Workday: <b>125%</b></span>
                  <span>Special Non-Working Holiday: <b>130%</b> (169% &gt;8h)</span>
                  <span>Regular Holiday: <b>150%</b> (195% &gt;8h)</span>
                  <span>Night Shift: <b>+10%</b> on top</span>
                </div>
              </div>

              {/* OT entries */}
              <div className="space-y-2">
                {otEntries.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] p-2.5">
                    <select value={entry.occasion} onChange={e => updateOtRow(idx, 'occasion', e.target.value)} className={cn(inputCls, 'flex-1 text-xs !py-1.5')}>
                      {OVERTIME_OCCASIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.rate})</option>)}
                    </select>
                    <div className="w-20">
                      <input type="number" step="0.5" min="0" value={entry.hours || ''} onChange={e => updateOtRow(idx, 'hours', Number(e.target.value))} placeholder="Hours" className={cn(inputCls, 'text-xs !py-1.5 text-center')} />
                    </div>
                    <label className="flex items-center gap-1 text-[10px] text-slate-600 whitespace-nowrap">
                      <input type="checkbox" checked={entry.night_shift} onChange={e => updateOtRow(idx, 'night_shift', e.target.checked)} className="rounded" />
                      Night
                    </label>
                    <button onClick={() => removeOtRow(idx)} className="p-1 text-slate-400 hover:text-red-500"><X size={13} /></button>
                  </div>
                ))}
              </div>

              <button type="button" onClick={addOtRow} className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] font-medium hover:underline">
                <Plus size={12} /> Add Overtime Entry
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
              <Button size="sm" variant="ghost" onClick={() => setOtItem(null)}>Cancel</Button>
              <Button size="sm" onClick={saveOt} disabled={otSaving}>
                {otSaving ? <><Loader2 size={12} className="animate-spin" /> Saving...</> : 'Save Overtime'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function PayrollGenerate() {
  const [form, setForm] = useState({ pay_frequency: 'semi-monthly' })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showGenForm, setShowGenForm] = useState(false)
  const [runs, setRuns] = useState([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [selectedRun, setSelectedRun] = useState(null)

  useEffect(() => {
    apiGet('/payroll/runs').then(setRuns).catch(() => {}).finally(() => setRunsLoading(false))
  }, [])

  function refreshRuns() {
    apiGet('/payroll/runs').then(setRuns).catch(() => {})
  }

  async function handleGenerate(e) {
    e.preventDefault()
    if (!form.period_start || !form.period_end) return notify.warning('Select period dates')
    setLoading(true)
    try {
      const res = await apiPost('/payroll/runs/generate', form)
      setResult(res)
      setSelectedRun(null)
      setShowGenForm(false)
      refreshRuns()
      notify.success(`Payroll generated for ${res.total_employees} employees.`)
    } catch (err) {
      notify.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAction(action) {
    if (!result?.run_id) return
    try {
      await apiPatch(`/payroll/runs/${result.run_id}/${action}`)
      notify.success(`Payroll ${action === 'submit' ? 'submitted for review' : action === 'approve' ? 'approved' : 'released'}.`)
      const updated = await apiGet(`/payroll/runs/${result.run_id}`)
      setResult(updated)
      refreshRuns()
    } catch (err) {
      notify.error(err.message)
    }
  }

  async function viewRun(run_id) {
    try {
      const detail = await apiGet(`/payroll/runs/${run_id}`)
      setSelectedRun(detail)
      setResult(null)
    } catch {
      notify.error('Failed to load payroll run')
    }
  }

  // Show the latest result or selected history run
  const activeRun = result || selectedRun

  async function refreshActiveRun() {
    const runId = activeRun?.run_id
    if (!runId) return
    try {
      const detail = await apiGet(`/payroll/runs/${runId}`)
      if (result) setResult(detail)
      else setSelectedRun(detail)
      refreshRuns()
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-5">
      {/* Active Run Detail (top) */}
      {activeRun && (
        <PayrollRunDetail
          run={activeRun}
          onAction={result ? handleAction : null}
          onClose={selectedRun ? () => setSelectedRun(null) : null}
          onRefresh={refreshActiveRun}
        />
      )}

      {/* Generate Form (collapsible) */}
      {showGenForm ? (
        <form onSubmit={handleGenerate} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Generate New Payroll</h3>
              <p className="text-xs text-[var(--color-muted-fg)]">Compute pay for all active employees based on their salary, deductions, and loans.</p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowGenForm(false)}><X size={13} /></Button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">Period Start *</label><input type="date" value={form.period_start || ''} onChange={e => setForm(f => ({...f, period_start: e.target.value}))} className={inputCls} required /></div>
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">Period End *</label><input type="date" value={form.period_end || ''} onChange={e => setForm(f => ({...f, period_end: e.target.value}))} className={inputCls} required /></div>
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">Pay Date</label><input type="date" value={form.pay_date || ''} onChange={e => setForm(f => ({...f, pay_date: e.target.value}))} className={inputCls} /></div>
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">Frequency</label><select value={form.pay_frequency} onChange={e => setForm(f => ({...f, pay_frequency: e.target.value}))} className={inputCls}><option value="semi-monthly">Semi-Monthly</option><option value="monthly">Monthly</option></select></div>
          </div>
          <Button type="submit" size="md" disabled={loading}>{loading ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><Calculator size={14} /> Generate Payroll</>}</Button>
        </form>
      ) : (
        <Button size="md" onClick={() => setShowGenForm(true)}><Plus size={14} /> Run New Payroll</Button>
      )}

      {/* Payroll History */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Payroll History</h3>
        {runsLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-[var(--color-muted)]" /></div>
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-[var(--color-surface-2)]"><tr className="border-b border-[var(--color-border)]">
                <th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Run #</th>
                <th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Period</th>
                <th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Employees</th>
                <th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)] text-right">Total Net</th>
                <th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Status</th>
                <th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Generated</th>
              </tr></thead>
              <tbody>{runs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No payroll runs yet. Click "Run New Payroll" to get started.</td></tr>
              ) : runs.map(r => (
                <tr
                  key={r.run_id}
                  className={cn('border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] cursor-pointer', selectedRun?.run_id === r.run_id && 'bg-[var(--color-primary)]/5')}
                  onClick={() => viewRun(r.run_id)}
                >
                  <td className="px-4 py-2.5 text-xs font-mono text-[var(--color-text)]">#{r.run_id}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-text)]">{fmtDate(r.period_start)} — {fmtDate(r.period_end)}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{r.total_employees}</td>
                  <td className="px-4 py-2.5 text-xs text-right tabular-nums font-medium">{money(r.total_net)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{fmtDate(r.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
