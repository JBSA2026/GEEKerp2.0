import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import {
  Loader2, ChevronDown, Plus, X, Download, CheckCircle2, XCircle,
  PhilippinePeso, Clock, FileText, TrendingUp, Calculator,
  Search, Eye, Send,
} from 'lucide-react'

import GLabLogo from '@/assets/company-logos/GLab.png'
import ExpediaLogo from '@/assets/company-logos/Expedia.png'
import ExigentLogo from '@/assets/company-logos/exigent.png'
import KSILogo from '@/assets/company-logos/KSI.png'

// ─── Constants ───────────────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL
const ENTITIES = [
  { value: 'GreatnessLab', label: 'GreatnessLab', logo: GLabLogo },
  { value: 'Expedia', label: 'Expedia', logo: ExpediaLogo },
  { value: 'Exigent', label: 'Exigent', logo: ExigentLogo },
  { value: 'KSI', label: 'Kyrios Solutions Inc.', logo: KSILogo },
]
const TABS = [
  { id: 'sales', label: 'Sales Commission' },
  { id: 'agent', label: 'Agent Commission' },
  { id: 'approval', label: 'Commission Approval' },
  { id: 'advance', label: 'Cash Advance Recovery' },
  { id: 'payout', label: 'Commission Payout' },
]
const STATUS_COLORS = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  'Pending Approval': 'bg-amber-100 text-amber-700 border-amber-200',
  Approved: 'bg-blue-100 text-blue-700 border-blue-200',
  'For Payout': 'bg-purple-100 text-purple-700 border-purple-200',
  Paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
}
const ADVANCE_STATUS_COLORS = {
  Active: 'bg-amber-100 text-amber-700 border-amber-200',
  'Fully Recovered': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Written Off': 'bg-slate-100 text-slate-700 border-slate-200',
}

// ─── API Helpers ─────────────────────────────────────────────────────────────
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}
async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Request failed') }
  return res.json()
}
async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Request failed') }
  return res.json()
}

// ─── Formatters ──────────────────────────────────────────────────────────────
function money(val) {
  if (val == null) return '₱0.00'
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(val) {
  if (val == null) return '0%'
  return Number(val).toFixed(2) + '%'
}
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Shared UI Components ────────────────────────────────────────────────────
function StatusBadge({ status, colorMap = STATUS_COLORS }) {
  const color = colorMap[status] || 'bg-slate-100 text-slate-600 border-slate-200'
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', color)}>{status}</span>
}

function MetricCard({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-lg font-semibold text-[var(--color-text)]">{value}</p>
        <p className="text-[11px] text-[var(--color-muted-fg)]">{label}</p>
      </div>
    </div>
  )
}

function DrawerBackdrop({ open, onClose, children }) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="w-full max-w-lg max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
          {children}
        </div>
      </div>
    </>
  )
}

function InputField({ label, children, className }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="text-xs font-medium text-[var(--color-muted-fg)]">{label}</label>
      {children}
    </div>
  )
}

const inputClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

// ─── Sales/Agent Commission Tab ──────────────────────────────────────────────
function CommissionTab({ entity, type }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [employees, setEmployees] = useState([])
  const [projects, setProjects] = useState([])
  const [preview, setPreview] = useState(null)
  const [form, setForm] = useState({
    employee_id: '', project_id: '', project_name: '', contract_value: '', total_cost: '',
    collected_amount: '', commission_rate: '', period: '', remarks: '',
    commission_base: '',
  })

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ entity, type })
      if (statusFilter) params.append('status', statusFilter)
      if (search) params.append('search', search)
      const data = await apiGet(`/commission/records?${params}`)
      setRecords(data)
    } catch (err) { notify.error(err.message) }
    finally { setLoading(false) }
  }, [entity, type, statusFilter, search])

  useEffect(() => {
    const timer = setTimeout(() => { void fetchRecords() }, 0)
    return () => clearTimeout(timer)
  }, [fetchRecords])

  const openDrawer = async () => {
    try {
      const [emps, projs] = await Promise.all([
        apiGet('/employees'),
        apiGet(`/commission/projects?entity=${entity}`),
      ])
      setEmployees(Array.isArray(emps) ? emps : emps.employees || [])
      setProjects(Array.isArray(projs) ? projs : [])
    } catch {
      setEmployees([])
      setProjects([])
    }
    setForm({ employee_id: '', project_id: '', project_name: '', contract_value: '', total_cost: '', collected_amount: '', commission_rate: '', period: '', remarks: '', commission_base: '' })
    setPreview(null)
    setDrawerOpen(true)
  }

  // When user selects a project, auto-fill the financial fields
  function handleProjectSelect(projectId) {
    const proj = projects.find(p => String(p.project_id) === String(projectId))
    if (proj) {
      setForm(f => ({
        ...f,
        project_id: projectId,
        project_name: proj.project_name || '',
        contract_value: String(proj.contract_value || 0),
        total_cost: String(proj.total_cost || 0),
        collected_amount: String(proj.collected_amount || 0),
      }))
    } else {
      setForm(f => ({ ...f, project_id: projectId, project_name: '', contract_value: '', total_cost: '', collected_amount: '' }))
    }
    setPreview(null)
  }

  const computePreview = async () => {
    if (!form.commission_rate) { notify.error('Please enter a commission rate'); return }
    try {
      const body = { entity, commission_type: type,
        employee_id: Number(form.employee_id) || 1,
        contract_value: parseFloat(form.contract_value) || 0,
        total_cost: parseFloat(form.total_cost) || 0,
        collected_amount: parseFloat(form.collected_amount) || 0,
        commission_rate: parseFloat(form.commission_rate),
        commission_base: type === 'Agent' ? parseFloat(form.commission_base) || undefined : undefined,
      }
      const data = await apiPost('/commission/records/compute', body)
      setPreview(data)
    } catch (err) { notify.error(err.message) }
  }

  const handleCreate = async () => {
    if (!form.commission_rate) { notify.error('Commission rate is required'); return }
    if (!form.employee_id) { notify.error('Please select an employee'); return }
    try {
      await apiPost('/commission/records', { entity, commission_type: type,
        employee_id: Number(form.employee_id),
        project_id: form.project_id ? Number(form.project_id) : null,
        project_code: projects.find(p => String(p.project_id) === String(form.project_id))?.project_code || null,
        project_name: form.project_name,
        contract_value: parseFloat(form.contract_value) || 0,
        total_cost: parseFloat(form.total_cost) || 0,
        collected_amount: parseFloat(form.collected_amount) || 0,
        commission_rate: parseFloat(form.commission_rate),
        period: form.period,
        remarks: form.remarks,
        commission_base: type === 'Agent' ? parseFloat(form.commission_base) || undefined : undefined,
      })
      notify.success('Commission record created')
      setDrawerOpen(false)
      fetchRecords()
    } catch (err) { notify.error(err.message) }
  }

  const handleSubmit = async (id) => {
    try {
      await apiPost(`/commission/records/${id}/submit`)
      notify.success('Submitted for approval')
      fetchRecords()
    } catch (err) { notify.error(err.message) }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input
              type="text" placeholder="Search records..." value={search}
              onChange={e => setSearch(e.target.value)}
              className={cn(inputClass, 'pl-8 w-56')}
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={cn(inputClass, 'w-44')}>
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Pending Approval">Pending Approval</option>
            <option value="Approved">Approved</option>
            <option value="For Payout">For Payout</option>
            <option value="Paid">Paid</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <Button onClick={openDrawer}><Plus size={14} /> New {type} Commission</Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Commission#</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Employee</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Project</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Contract Value</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Gross Profit</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Margin%</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Collected</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Rate%</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Commission</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">WHT</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Net Payable</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Status</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={13} className="px-3 py-10 text-center text-[var(--color-muted-fg)]">No commission records found</td></tr>
              ) : records.map(r => (
                <tr key={r.commission_id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]/50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-[var(--color-text)]">{r.commission_number || r.commission_id}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{r.employee_name || r.employee_id}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{r.project_name || '—'}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{money(r.contract_value)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{money(r.gross_profit)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{pct(r.gross_margin_pct)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{money(r.collected_amount)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{pct(r.commission_rate)}</td>
                  <td className="px-3 py-2.5 font-semibold text-[var(--color-text)]">{money(r.commission_amount)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{money(r.withholding_tax)}</td>
                  <td className="px-3 py-2.5 font-semibold text-[var(--color-text)]">{money(r.net_payable)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.status === 'Draft' && (
                        <button onClick={() => handleSubmit(r.commission_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                          <Send size={13} /> Submit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Drawer */}
      <DrawerBackdrop open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">New {type} Commission</h3>
          <button onClick={() => setDrawerOpen(false)} className="p-1 rounded hover:bg-[var(--color-surface-2)]"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <InputField label="Employee">
            <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className={inputClass}>
              <option value="">Select employee...</option>
              {employees.map(emp => (
                <option key={emp.employee_id} value={emp.employee_id}>{emp.first_name} {emp.last_name}</option>
              ))}
            </select>
          </InputField>
          <InputField label="Project *">
            <select value={form.project_id} onChange={e => handleProjectSelect(e.target.value)} className={inputClass}>
              <option value="">Select a project...</option>
              {projects.map(proj => (
                <option key={proj.project_id} value={proj.project_id}>
                  {proj.project_code} — {proj.project_name}
                </option>
              ))}
            </select>
          </InputField>
          {form.project_name && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted-fg)]">
              Selected: <span className="font-medium text-[var(--color-text)]">{form.project_name}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Contract Value (₱)">
              <input type="number" value={form.contract_value} readOnly className={cn(inputClass, 'bg-slate-50 cursor-not-allowed')} placeholder="Select a project" />
            </InputField>
            <InputField label="Total Cost (₱)">
              <input type="number" value={form.total_cost} readOnly className={cn(inputClass, 'bg-slate-50 cursor-not-allowed')} placeholder="Select a project" />
            </InputField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Collected Amount (₱)">
              <input type="number" value={form.collected_amount} readOnly className={cn(inputClass, 'bg-slate-50 cursor-not-allowed')} placeholder="Select a project" />
            </InputField>
            <InputField label="Commission Rate % *">
              <input type="number" value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))} className={inputClass} placeholder="e.g. 5" step="0.01" min="0" max="100" required />
            </InputField>
          </div>
          {type === 'Agent' && (
            <InputField label="Commission Base">
              <input type="text" value={form.commission_base} onChange={e => setForm(f => ({ ...f, commission_base: e.target.value }))} className={inputClass} placeholder="e.g. Gross Profit, Contract Value" />
            </InputField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Period">
              <input type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} className={inputClass} />
            </InputField>
          </div>
          <InputField label="Remarks">
            <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} className={cn(inputClass, 'h-20 resize-none')} placeholder="Optional remarks..." />
          </InputField>

          {/* Live Preview */}
          <div className="border-t border-[var(--color-border)] pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide">Calculation Preview</span>
              <Button size="sm" variant="outline" onClick={computePreview}><Calculator size={12} /> Compute</Button>
            </div>
            {preview && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Gross Profit</span><span className="font-medium">{money(preview.gross_profit)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Margin %</span><span className="font-medium">{pct(preview.gross_margin_pct)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Rate Applied</span><span className="font-medium">{pct(preview.commission_rate)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Gross Commission</span><span className="font-medium">{money(preview.commission_amount)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">WHT (10%)</span><span className="font-medium text-rose-600">-{money(preview.withholding_tax)}</span></div>
                <div className="flex justify-between border-t border-dashed border-[var(--color-border)] pt-1.5"><span className="font-semibold text-[var(--color-text)]">Net Payable</span><span className="font-bold text-emerald-600">{money(preview.net_payable)}</span></div>
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-[var(--color-border)] px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate}>Create Commission</Button>
        </div>
      </DrawerBackdrop>
    </div>
  )
}

// ─── Commission Approval Tab ─────────────────────────────────────────────────
function ApprovalTab({ entity }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [detail, setDetail] = useState(null)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/commission/records?entity=${entity}&status=Pending Approval`)
      setRecords(data)
    } catch (err) { notify.error(err.message) }
    finally { setLoading(false) }
  }, [entity])

  useEffect(() => {
    const timer = setTimeout(() => { void fetchPending() }, 0)
    return () => clearTimeout(timer)
  }, [fetchPending])

  const viewDetail = async (id) => {
    try {
      const data = await apiGet(`/commission/records/${id}`)
      setDetail(data)
      setDetailId(id)
    } catch (err) { notify.error(err.message) }
  }

  const handleApprove = async (id) => {
    try {
      await apiPost(`/commission/records/${id}/approve`)
      notify.success('Commission approved')
      setDetailId(null)
      fetchPending()
    } catch (err) { notify.error(err.message) }
  }

  const handleReject = async (id) => {
    try {
      await apiPost(`/commission/records/${id}/reject`)
      notify.success('Commission rejected')
      setDetailId(null)
      fetchPending()
    } catch (err) { notify.error(err.message) }
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Commission#</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Employee</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Type</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Project</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Commission</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">WHT</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Net Payable</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-[var(--color-muted-fg)]">No pending approvals</td></tr>
              ) : records.map(r => (
                <tr key={r.commission_id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]/50 transition-colors cursor-pointer" onClick={() => viewDetail(r.commission_id)}>
                  <td className="px-3 py-2.5 font-medium text-[var(--color-text)]">{r.commission_number || r.commission_id}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{r.employee_name || r.employee_id}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{r.commission_type}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{r.project_name || '—'}</td>
                  <td className="px-3 py-2.5 font-semibold text-[var(--color-text)]">{money(r.commission_amount)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{money(r.withholding_tax)}</td>
                  <td className="px-3 py-2.5 font-semibold text-[var(--color-text)]">{money(r.net_payable)}</td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleApprove(r.commission_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                        <CheckCircle2 size={13} /> Approve
                      </button>
                      <button onClick={() => handleReject(r.commission_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 transition-colors">
                        <XCircle size={13} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer */}
      <DrawerBackdrop open={!!detailId} onClose={() => setDetailId(null)}>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Commission Detail</h3>
          <button onClick={() => setDetailId(null)} className="p-1 rounded hover:bg-[var(--color-surface-2)]"><X size={16} /></button>
        </div>
        {detail && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-[var(--color-muted-fg)]">Employee</span><p className="font-medium">{detail.employee_name || detail.employee_id}</p></div>
              <div><span className="text-[var(--color-muted-fg)]">Type</span><p className="font-medium">{detail.commission_type}</p></div>
              <div><span className="text-[var(--color-muted-fg)]">Project</span><p className="font-medium">{detail.project_name || '—'}</p></div>
              <div><span className="text-[var(--color-muted-fg)]">Period</span><p className="font-medium">{detail.period || '—'}</p></div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Contract Value</span><span className="font-medium">{money(detail.contract_value)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Total Cost</span><span className="font-medium">{money(detail.total_cost)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Gross Profit</span><span className="font-medium">{money(detail.gross_profit)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Margin %</span><span className="font-medium">{pct(detail.gross_margin_pct)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Collected Amount</span><span className="font-medium">{money(detail.collected_amount)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Rate Applied</span><span className="font-medium">{pct(detail.commission_rate)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Commission Amount</span><span className="font-semibold">{money(detail.commission_amount)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">WHT</span><span className="font-medium text-rose-600">-{money(detail.withholding_tax)}</span></div>
              <div className="flex justify-between border-t border-dashed border-[var(--color-border)] pt-1.5"><span className="font-semibold">Net Payable</span><span className="font-bold text-emerald-600">{money(detail.net_payable)}</span></div>
            </div>
            {detail.remarks && (
              <div className="text-xs"><span className="text-[var(--color-muted-fg)]">Remarks:</span><p className="mt-1 text-[var(--color-text)]">{detail.remarks}</p></div>
            )}
          </div>
        )}
        <div className="border-t border-[var(--color-border)] px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => handleReject(detailId)} className="text-rose-600 border-rose-200 hover:bg-rose-50"><XCircle size={14} /> Reject</Button>
          <Button onClick={() => handleApprove(detailId)} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 size={14} /> Approve</Button>
        </div>
      </DrawerBackdrop>
    </div>
  )
}

// ─── Cash Advance Recovery Tab ───────────────────────────────────────────────
function AdvanceTab({ entity }) {
  const [advances, setAdvances] = useState([])
  const [loading, setLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState({ employee_id: '', amount: '', purpose: '', advance_date: '' })

  const fetchAdvances = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/commission/advances?entity=${entity}`)
      setAdvances(data)
    } catch (err) { notify.error(err.message) }
    finally { setLoading(false) }
  }, [entity])

  useEffect(() => {
    const timer = setTimeout(() => { void fetchAdvances() }, 0)
    return () => clearTimeout(timer)
  }, [fetchAdvances])

  const openDrawer = async () => {
    try {
      const emps = await apiGet('/employees?entity=' + entity)
      setEmployees(Array.isArray(emps) ? emps : emps.employees || [])
    } catch { setEmployees([]) }
    setForm({ employee_id: '', amount: '', purpose: '', advance_date: '' })
    setDrawerOpen(true)
  }

  const handleCreate = async () => {
    try {
      await apiPost('/commission/advances', {
        entity,
        employee_id: Number(form.employee_id),
        amount: parseFloat(form.amount) || 0,
        purpose: form.purpose,
        advance_date: form.advance_date,
      })
      notify.success('Cash advance recorded')
      setDrawerOpen(false)
      fetchAdvances()
    } catch (err) { notify.error(err.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={openDrawer}><Plus size={14} /> New Advance</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Advance#</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Employee</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Amount</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Recovered</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Balance</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Status</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Date</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {advances.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-[var(--color-muted-fg)]">No cash advances found</td></tr>
              ) : advances.map(a => (
                <tr key={a.advance_id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]/50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-[var(--color-text)]">{a.advance_number || a.advance_id}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{a.employee_name || a.employee_id}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{money(a.amount)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{money(a.recovered_amount)}</td>
                  <td className="px-3 py-2.5 font-semibold text-[var(--color-text)]">{money(a.balance)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={a.status} colorMap={ADVANCE_STATUS_COLORS} /></td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{formatDate(a.advance_date)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)] max-w-[160px] truncate">{a.purpose || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Advance Drawer */}
      <DrawerBackdrop open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">New Cash Advance</h3>
          <button onClick={() => setDrawerOpen(false)} className="p-1 rounded hover:bg-[var(--color-surface-2)]"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <InputField label="Employee">
            <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} className={inputClass}>
              <option value="">Select employee...</option>
              {employees.map(emp => (
                <option key={emp.employee_id} value={emp.employee_id}>{emp.first_name} {emp.last_name}</option>
              ))}
            </select>
          </InputField>
          <InputField label="Amount (₱)">
            <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inputClass} placeholder="0.00" />
          </InputField>
          <InputField label="Advance Date">
            <input type="date" value={form.advance_date} onChange={e => setForm(f => ({ ...f, advance_date: e.target.value }))} className={inputClass} />
          </InputField>
          <InputField label="Purpose">
            <textarea value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} className={cn(inputClass, 'h-20 resize-none')} placeholder="Purpose of advance..." />
          </InputField>
        </div>
        <div className="border-t border-[var(--color-border)] px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate}>Record Advance</Button>
        </div>
      </DrawerBackdrop>
    </div>
  )
}

// ─── Commission Payout Tab ───────────────────────────────────────────────────
function PayoutTab({ entity }) {
  const [approvedRecords, setApprovedRecords] = useState([])
  const [payouts, setPayouts] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [remarks, setRemarks] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [approved, payoutList] = await Promise.all([
        apiGet(`/commission/records?entity=${entity}&status=Approved`),
        apiGet(`/commission/payouts?entity=${entity}`),
      ])
      setApprovedRecords(approved)
      setPayouts(payoutList)
    } catch (err) { notify.error(err.message) }
    finally { setLoading(false) }
  }, [entity])

  useEffect(() => {
    const timer = setTimeout(() => { void fetchData() }, 0)
    return () => clearTimeout(timer)
  }, [fetchData])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === approvedRecords.length) setSelected(new Set())
    else setSelected(new Set(approvedRecords.map(r => r.commission_id)))
  }

  const handleCreatePayout = async () => {
    if (selected.size === 0) { notify.warning('Select at least one commission'); return }
    try {
      await apiPost('/commission/payouts', {
        entity,
        commission_ids: [...selected],
        remarks,
      })
      notify.success('Payout created successfully')
      setSelected(new Set())
      setRemarks('')
      fetchData()
    } catch (err) { notify.error(err.message) }
  }

  return (
    <div className="space-y-6">
      {/* Approved commissions to pay out */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide">Approved Commissions</h4>
          <div className="flex items-center gap-2">
            <input type="text" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Payout remarks..." className={cn(inputClass, 'w-48')} />
            <Button onClick={handleCreatePayout} disabled={selected.size === 0}>
              <PhilippinePeso size={14} /> Create Payout ({selected.size})
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <th className="px-3 py-2.5">
                    <input type="checkbox" checked={approvedRecords.length > 0 && selected.size === approvedRecords.length} onChange={toggleAll} className="rounded border-[var(--color-border)]" />
                  </th>
                  <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Commission#</th>
                  <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Employee</th>
                  <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Project</th>
                  <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Commission</th>
                  <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">WHT</th>
                  <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Net Payable</th>
                </tr>
              </thead>
              <tbody>
                {approvedRecords.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-[var(--color-muted-fg)]">No approved commissions awaiting payout</td></tr>
                ) : approvedRecords.map(r => (
                  <tr key={r.commission_id} className={cn('border-b border-[var(--color-border)] transition-colors', selected.has(r.commission_id) ? 'bg-blue-50/50' : 'hover:bg-[var(--color-surface)]/50')}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(r.commission_id)} onChange={() => toggleSelect(r.commission_id)} className="rounded border-[var(--color-border)]" />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[var(--color-text)]">{r.commission_number || r.commission_id}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text)]">{r.employee_name || r.employee_id}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text)]">{r.project_name || '—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-[var(--color-text)]">{money(r.commission_amount)}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text)]">{money(r.withholding_tax)}</td>
                    <td className="px-3 py-2.5 font-semibold text-emerald-600">{money(r.net_payable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payout History */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide">Payout History</h4>
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Payout#</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Date</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Count</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Total Commission</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">WHT</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Net Paid</th>
                <th className="px-3 py-2.5 font-medium text-[var(--color-muted-fg)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-[var(--color-muted-fg)]">No payouts yet</td></tr>
              ) : payouts.map(p => (
                <tr key={p.payout_id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface)]/50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-[var(--color-text)]">{p.payout_number || p.payout_id}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{formatDate(p.payout_date || p.created_at)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{p.commission_count || p.commission_ids?.length || 0}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{money(p.total_amount)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text)]">{money(p.total_wht)}</td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-600">{money(p.total_net)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={p.status || 'Paid'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function CommissionManagement() {
  const [activeTab, setActiveTab] = useState('sales')
  const [entity, setEntity] = useState(ENTITIES[0].value)
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false)
  const [metrics, setMetrics] = useState(null)
  const [metricsLoading, setMetricsLoading] = useState(false)

  const currentEntity = ENTITIES.find(e => e.value === entity) || ENTITIES[0]

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true)
    try {
      const data = await apiGet(`/commission/records/metrics?entity=${entity}`)
      setMetrics(data)
    } catch { setMetrics(null) }
    finally { setMetricsLoading(false) }
  }, [entity])

  useEffect(() => {
    const timer = setTimeout(() => { void fetchMetrics() }, 0)
    return () => clearTimeout(timer)
  }, [fetchMetrics])

  const handleExport = async () => {
    try {
      const res = await fetch(`${BASE}/commission/export?entity=${entity}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `commission_export_${entity}.csv`
      a.click()
      URL.revokeObjectURL(url)
      notify.success('Export downloaded')
    } catch (err) { notify.error(err.message) }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f6f8fc]">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#d8e2ef] bg-white px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-[var(--color-text)]">Commission Management</h1>
          <span className="text-sm text-[var(--color-muted-fg)]">—</span>
          <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
            <img src={currentEntity.logo} alt="" className="w-5 h-5 rounded object-contain" />
            {currentEntity.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}><Download size={12} /> Export</Button>

          {/* Entity Dropdown */}
          <div className="relative w-[200px]">
            <button
              type="button"
              onClick={() => setEntityDropdownOpen(prev => !prev)}
              className="w-full inline-flex items-center justify-between gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
            >
              <span className="inline-flex items-center gap-2 truncate">
                <img src={currentEntity.logo} alt="" className="w-5 h-5 rounded object-contain border border-[var(--color-border)] bg-white p-0.5" />
                <span>{currentEntity.label}</span>
              </span>
              <ChevronDown size={14} className={cn('text-[var(--color-muted-fg)] shrink-0 transition-transform', entityDropdownOpen && 'rotate-180')} />
            </button>

            {entityDropdownOpen && (
              <>
                <div className="fixed inset-0 z-[49]" onClick={() => setEntityDropdownOpen(false)} />
                <ul className="absolute right-0 top-full mt-1 w-full rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-50">
                  {ENTITIES.map(ent => (
                    <li key={ent.value}>
                      <button
                        type="button"
                        onClick={() => { setEntity(ent.value); setEntityDropdownOpen(false) }}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2 hover:bg-[var(--color-surface-2)]',
                          ent.value === entity ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)]'
                        )}
                      >
                        <img src={ent.logo} alt="" className="w-5 h-5 rounded object-contain border border-[var(--color-border)] bg-white p-0.5" />
                        <span>{ent.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-6 pt-5">
        {metricsLoading ? (
          <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-[var(--color-muted)]" /></div>
        ) : metrics && (
          <div className="grid grid-cols-6 gap-3">
            <MetricCard label="Total Records" value={metrics.total_records ?? 0} icon={FileText} color="text-slate-600 bg-slate-100" />
            <MetricCard label="Pending Approval" value={metrics.pending_approval ?? 0} icon={Clock} color="text-amber-600 bg-amber-50" />
            <MetricCard label="Approved" value={metrics.approved ?? 0} icon={CheckCircle2} color="text-blue-600 bg-blue-50" />
            <MetricCard label="Paid" value={metrics.paid ?? 0} icon={PhilippinePeso} color="text-emerald-600 bg-emerald-50" />
            <MetricCard label="Total Commission (₱)" value={money(metrics.total_commission)} icon={TrendingUp} color="text-purple-600 bg-purple-50" />
            <MetricCard label="Net Payable (₱)" value={money(metrics.total_net_payable)} icon={Calculator} color="text-indigo-600 bg-indigo-50" />
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="mx-6 mt-5 flex shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white p-1 shadow-sm">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap',
              tab.id === activeTab
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'text-[var(--color-muted-fg)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeTab === 'sales' && <CommissionTab entity={entity} type="Sales" />}
        {activeTab === 'agent' && <CommissionTab entity={entity} type="Agent" />}
        {activeTab === 'approval' && <ApprovalTab entity={entity} />}
        {activeTab === 'advance' && <AdvanceTab entity={entity} />}
        {activeTab === 'payout' && <PayoutTab entity={entity} />}
      </div>
    </div>
  )
}
