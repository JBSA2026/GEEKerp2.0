import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Loader2, Plus } from 'lucide-react'
import { apiGet, apiPost, apiPatch, money, inputCls } from './payrollUtils'

function Spin() {
  return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
}

export function PayrollLoans() {
  const [loans, setLoans] = useState([])
  const [hrEmployees, setHrEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ loan_type: 'COMPANY_LOAN' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiGet('/payroll/loans'),
      apiGet('/hr/201?page_size=100'),
    ]).then(([loanList, hrData]) => {
      setLoans(loanList)
      setHrEmployees(hrData.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiPost('/payroll/loans', form)
      notify.success('Loan created.')
      setShowForm(false)
      setForm({ loan_type: 'COMPANY_LOAN' })
      load()
    } catch (err) {
      notify.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function markComplete(loan_id) {
    try {
      await apiPatch(`/payroll/loans/${loan_id}/complete`)
      notify.success('Loan completed.')
      load()
    } catch (err) {
      notify.error(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-muted-fg)]">Track employee loans, salary advances, SSS loans, and Pag-IBIG loans. Active loans are automatically deducted during payroll.</p>
        <Button size="md" onClick={() => setShowForm(true)}><Plus size={14} /> New Loan</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">Employee *</label><select value={form.employee_id || ''} onChange={e => setForm(f => ({...f, employee_id: Number(e.target.value)}))} className={inputCls} required><option value="">— Select employee —</option>{hrEmployees.map(emp => <option key={emp.employee_id} value={emp.employee_id}>{emp.first_name} {emp.last_name} — {emp.position || emp.department || ''}</option>)}</select></div>
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">Loan Type *</label><select value={form.loan_type} onChange={e => setForm(f => ({...f, loan_type: e.target.value}))} className={inputCls}><option value="COMPANY_LOAN">Company Loan</option><option value="CASH_ADVANCE">Cash Advance</option><option value="SSS_LOAN">SSS Loan</option><option value="PAGIBIG_LOAN">Pag-IBIG Loan</option></select></div>
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">Principal Amount *</label><input type="number" value={form.principal_amount || ''} onChange={e => setForm(f => ({...f, principal_amount: Number(e.target.value)}))} className={inputCls} required /></div>
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">Monthly Deduction *</label><input type="number" value={form.monthly_deduction || ''} onChange={e => setForm(f => ({...f, monthly_deduction: Number(e.target.value)}))} className={inputCls} required /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">Description</label><input value={form.description || ''} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Loan purpose" className={inputCls} /></div>
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">Start Date</label><input type="date" value={form.start_date || ''} onChange={e => setForm(f => ({...f, start_date: e.target.value}))} className={inputCls} /></div>
            <div><label className="text-[11px] text-[var(--color-muted-fg)]">End Date</label><input type="date" value={form.end_date || ''} onChange={e => setForm(f => ({...f, end_date: e.target.value}))} className={inputCls} /></div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving...' : 'Create Loan'}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {loading ? <Spin /> : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[var(--color-surface-2)]"><tr className="border-b border-[var(--color-border)]"><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Employee</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Type</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)] text-right">Principal</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)] text-right">Monthly Ded.</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)] text-right">Balance</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Status</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]"></th></tr></thead>
            <tbody>{loans.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No loans recorded.</td></tr> : loans.map(l => (
              <tr key={l.loan_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                <td className="px-4 py-2.5 text-xs text-[var(--color-text)]">{(() => { const emp = hrEmployees.find(e => e.employee_id === l.employee_id); return emp ? `${emp.first_name} ${emp.last_name}` : `#${l.employee_id}` })()}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{l.loan_type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums">{money(l.principal_amount)}</td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums">{money(l.monthly_deduction)}</td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums font-medium">{money(l.remaining_balance)}</td>
                <td className="px-4 py-2.5"><span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', l.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')}>{l.status}</span></td>
                <td className="px-4 py-2.5">{l.status === 'active' && <button onClick={() => markComplete(l.loan_id)} className="text-[10px] text-[var(--color-primary)] hover:underline">Complete</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
