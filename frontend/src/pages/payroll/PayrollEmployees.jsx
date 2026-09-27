import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { Loader2, Plus, Pencil } from 'lucide-react'
import { apiGet, apiPost, apiPatch, money, inputCls } from './payrollUtils'

function Spin() {
  return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
}

export function PayrollEmployees() {
  const [employees, setEmployees] = useState([])
  const [hrEmployees, setHrEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [previewEmp, setPreviewEmp] = useState(null)
  const [previewLoans, setPreviewLoans] = useState([])

  // Fetch loans when preview opens
  useEffect(() => {
    if (previewEmp) {
      apiGet('/payroll/loans').then(loans => {
        const empLoans = (loans || []).filter(l => l.employee_id === previewEmp.employee_id && l.status === 'active')
        setPreviewLoans(empLoans)
      }).catch(() => setPreviewLoans([]))
    } else {
      setPreviewLoans([])
    }
  }, [previewEmp])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiGet('/payroll/employees'),
      apiGet('/hr/201?page_size=100'),
    ]).then(([payrollList, hrData]) => {
      setEmployees(payrollList)
      setHrEmployees(hrData.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  // Employees not yet registered for payroll
  const registeredIds = new Set(employees.map(e => e.employee_id))
  const availableEmployees = hrEmployees.filter(e => !registeredIds.has(e.employee_id))

  function selectEmployee(employeeId) {
    const emp = hrEmployees.find(e => e.employee_id === Number(employeeId))
    if (emp) {
      setForm(f => ({
        ...f,
        employee_id: emp.employee_id,
        department: emp.department || '',
        position: emp.position || '',
      }))
    } else {
      setForm(f => ({ ...f, employee_id: Number(employeeId) || '' }))
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (form.payroll_employee_id) {
        await apiPatch(`/payroll/employees/${form.employee_id}`, form)
      } else {
        await apiPost('/payroll/employees', form)
      }
      notify.success('Saved.')
      setShowForm(false)
      setForm({})
      setPreviewEmp(null)
      load()
    } catch (err) {
      notify.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-muted-fg)]">Manage employee salary, allowances, and bank details for payroll processing.</p>
        <Button size="md" onClick={() => { setForm({}); setShowForm(true) }}><Plus size={14} /> Add Employee</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
          <p className="text-sm font-semibold text-[var(--color-text)]">{form.payroll_employee_id ? 'Edit Payroll Details' : 'Register Employee for Payroll'}</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="col-span-2">
              <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Employee *</label>
              {form.payroll_employee_id ? (
                <div className="mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)]">
                  {hrEmployees.find(e => e.employee_id === form.employee_id)?.first_name || ''} {hrEmployees.find(e => e.employee_id === form.employee_id)?.last_name || `#${form.employee_id}`}
                </div>
              ) : (
                <select
                  value={form.employee_id || ''}
                  onChange={e => selectEmployee(e.target.value)}
                  className={inputCls + ' mt-1'}
                  required
                >
                  <option value="">— Select an employee —</option>
                  {availableEmployees.map(emp => (
                    <option key={emp.employee_id} value={emp.employee_id}>
                      {emp.first_name} {emp.last_name} — {emp.position || emp.department || 'No role'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Department</label>
              <input value={form.department || ''} onChange={e => setForm(f => ({...f, department: e.target.value}))} className={inputCls + ' mt-1'} placeholder="Auto-filled" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Position</label>
              <input value={form.position || ''} onChange={e => setForm(f => ({...f, position: e.target.value}))} className={inputCls + ' mt-1'} placeholder="Auto-filled" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Pay Frequency</label>
              <select value={form.pay_frequency || 'semi-monthly'} onChange={e => setForm(f => ({...f, pay_frequency: e.target.value}))} className={inputCls + ' mt-1'}>
                <option value="semi-monthly">Semi-Monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          {/* Compensation */}
          <div className="pt-2 border-t border-[var(--color-border)]">
            <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-3">Compensation</p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Basic Salary (Monthly) *</label>
                <input type="number" value={form.basic_salary || ''} onChange={e => setForm(f => ({...f, basic_salary: Number(e.target.value)}))} placeholder="25,000" className={inputCls + ' mt-1'} required />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Allowance (Monthly)</label>
                <input type="number" value={form.allowance || ''} onChange={e => setForm(f => ({...f, allowance: Number(e.target.value)}))} placeholder="5,000" className={inputCls + ' mt-1'} />
              </div>
            </div>
          </div>

          {/* Government Deductions */}
          <div className="pt-2 border-t border-[var(--color-border)]">
            <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-3">Government Deductions</p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">SSS</label>
                <input type="number" value={form.sss_contribution || ''} onChange={e => setForm(f => ({...f, sss_contribution: Number(e.target.value)}))} placeholder="0" className={inputCls + ' mt-1'} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">PhilHealth</label>
                <input type="number" value={form.philhealth_contribution || ''} onChange={e => setForm(f => ({...f, philhealth_contribution: Number(e.target.value)}))} placeholder="0" className={inputCls + ' mt-1'} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Pag-IBIG</label>
                <input type="number" value={form.pagibig_contribution || ''} onChange={e => setForm(f => ({...f, pagibig_contribution: Number(e.target.value)}))} placeholder="0" className={inputCls + ' mt-1'} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Withholding Tax</label>
                <input type="number" value={form.withholding_tax || ''} onChange={e => setForm(f => ({...f, withholding_tax: Number(e.target.value)}))} placeholder="0" className={inputCls + ' mt-1'} />
              </div>
            </div>
          </div>

          {/* Banking */}
          <div className="pt-2 border-t border-[var(--color-border)]">
            <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-3">Bank Details</p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Bank Name</label>
                <input value={form.bank_name || ''} onChange={e => setForm(f => ({...f, bank_name: e.target.value}))} className={inputCls + ' mt-1'} placeholder="BDO, BPI, etc." />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Account Number</label>
                <input value={form.bank_account_number || ''} onChange={e => setForm(f => ({...f, bank_account_number: e.target.value}))} className={inputCls + ' mt-1'} placeholder="XXXX-XXXX-XXXX" />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" size="sm" disabled={saving}>{saving ? <><Loader2 size={13} className="animate-spin" /> Saving...</> : 'Save'}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {loading ? <Spin /> : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[var(--color-surface-2)]"><tr className="border-b border-[var(--color-border)]"><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Employee</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)] text-right">Basic Salary</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)] text-right">Allowance</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Frequency</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Department</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Bank</th><th className="px-4 py-2.5 text-[10px] text-[var(--color-muted-fg)]">Actions</th></tr></thead>
            <tbody>{employees.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No employees registered for payroll yet.</td></tr> : employees.map(emp => (
              <tr key={emp.payroll_employee_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] cursor-pointer" onClick={() => setPreviewEmp(emp)}>
                <td className="px-4 py-2.5"><p className="text-sm font-medium text-[var(--color-text)]">{emp.employee_name || `#${emp.employee_id}`}</p><p className="text-[10px] text-[var(--color-muted-fg)]">{emp.email}</p></td>
                <td className="px-4 py-2.5 text-sm text-right tabular-nums font-medium">{money(emp.basic_salary)}</td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums">{money(emp.allowance)}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{emp.pay_frequency}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{emp.department || '—'}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{emp.bank_name || '—'}</td>
                <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}><button onClick={() => { setForm(emp); setShowForm(true) }} className="text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]"><Pencil size={13} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      
      {/* Employee Preview Modal */}
      {previewEmp && (
        <>
          <div className="fixed inset-0 z-[9990] bg-black/40" onClick={() => setPreviewEmp(null)} />
          <div className="fixed inset-0 z-[9991] flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-white shadow-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">{previewEmp.employee_name || `Employee #${previewEmp.employee_id}`}</h3>
                  <p className="text-[11px] text-[var(--color-muted-fg)]">{previewEmp.email} · {previewEmp.department || '—'} · {previewEmp.position || '—'}</p>
                </div>
                <button onClick={() => setPreviewEmp(null)} className="rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Compensation */}
                <div>
                  <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-2">Compensation</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-[10px] text-[var(--color-muted-fg)]">Basic Salary</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{money(previewEmp.basic_salary)}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-[10px] text-[var(--color-muted-fg)]">Allowance</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{money(previewEmp.allowance)}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-[10px] text-[var(--color-muted-fg)]">Hourly Rate (for OT)</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{money(Number(previewEmp.basic_salary || 0) / 26 / 8)}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-[10px] text-[var(--color-muted-fg)]">Pay Frequency</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{previewEmp.pay_frequency || 'semi-monthly'}</p>
                    </div>
                  </div>
                </div>

                {/* Government Deductions */}
                <div>
                  <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-2">Government Deductions</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-[10px] text-[var(--color-muted-fg)]">SSS</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{money(previewEmp.sss_contribution)}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-[10px] text-[var(--color-muted-fg)]">PhilHealth</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{money(previewEmp.philhealth_contribution)}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-[10px] text-[var(--color-muted-fg)]">Pag-IBIG</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{money(previewEmp.pagibig_contribution)}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-[10px] text-[var(--color-muted-fg)]">Withholding Tax</p>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{money(previewEmp.withholding_tax)}</p>
                    </div>
                  </div>
                </div>

                {/* Active Loans & Advances */}
                <div>
                  <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-2">Active Loans & Advances</p>
                  {previewLoans.length === 0 ? (
                    <p className="text-xs text-[var(--color-muted-fg)] py-2">No active loans</p>
                  ) : (
                    <div className="space-y-2">
                      {previewLoans.map(loan => (
                        <div key={loan.loan_id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
                          <div>
                            <p className="text-[11px] font-medium text-[var(--color-text)]">{(loan.loan_type || '').replace(/_/g, ' ')}</p>
                            <p className="text-[10px] text-[var(--color-muted-fg)]">{loan.description || '—'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-red-600">{money(loan.monthly_deduction)}/mo</p>
                            <p className="text-[10px] text-[var(--color-muted-fg)]">Balance: {money(loan.remaining_balance)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary */}
                <div>
                  <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-2">Net Pay Summary</p>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--color-muted-fg)]">Gross Pay</span>
                      <span className="font-medium">{money(Number(previewEmp.basic_salary || 0) + Number(previewEmp.allowance || 0))}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--color-muted-fg)]">Government Deductions</span>
                      <span className="font-medium text-red-600">- {money(Number(previewEmp.sss_contribution || 0) + Number(previewEmp.philhealth_contribution || 0) + Number(previewEmp.pagibig_contribution || 0) + Number(previewEmp.withholding_tax || 0))}</span>
                    </div>
                    {previewLoans.length > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--color-muted-fg)]">Loan Deductions</span>
                        <span className="font-medium text-red-600">- {money(previewLoans.reduce((s, l) => s + Number(l.monthly_deduction || 0), 0))}</span>
                      </div>
                    )}
                    <div className="border-t border-[var(--color-border)] pt-2 flex justify-between text-sm">
                      <span className="font-semibold text-[var(--color-text)]">Estimated Net Pay</span>
                      <span className="font-bold text-emerald-700">{money((Number(previewEmp.basic_salary || 0) + Number(previewEmp.allowance || 0)) - Number(previewEmp.sss_contribution || 0) - Number(previewEmp.philhealth_contribution || 0) - Number(previewEmp.pagibig_contribution || 0) - Number(previewEmp.withholding_tax || 0) - previewLoans.reduce((s, l) => s + Number(l.monthly_deduction || 0), 0))}</span>
                    </div>
                  </div>
                </div>

                {/* Bank Details */}
                <div>
                  <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-2">Bank Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-[10px] text-[var(--color-muted-fg)]">Bank</p>
                      <p className="text-sm text-[var(--color-text)]">{previewEmp.bank_name || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <p className="text-[10px] text-[var(--color-muted-fg)]">Account #</p>
                      <p className="text-sm font-mono text-[var(--color-text)]">{previewEmp.bank_account_number || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)]">
                <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setPreviewEmp(null)}>Close</Button>
                <Button type="button" size="sm" className="flex-1" onClick={() => { setForm(previewEmp); setShowForm(true); setPreviewEmp(null) }}><Pencil size={13} /> Edit</Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
