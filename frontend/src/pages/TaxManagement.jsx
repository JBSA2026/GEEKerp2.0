import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { getActiveSubRoute } from '@/utils/routeHelpers'
import {
  Calculator, TrendingUp, TrendingDown, AlertTriangle, Calendar,
  FileText, Loader2, ChevronDown, Clock, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Settings2, Plus, Pencil,
} from 'lucide-react'

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
async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

function money(val) {
  if (val == null) return '₱0.00'
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'vat', label: 'VAT Summary' },
  { id: 'wht', label: 'WHT / EWT' },
  { id: 'deadlines', label: 'Filing Deadlines' },
  { id: 'codes', label: 'Tax Codes' },
]

// ─── Shared Components ───────────────────────────────────────────────────────
function MetricCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}><Icon size={18} /></div>
      <div>
        <p className="text-lg font-semibold text-[var(--color-text)]">{value}</p>
        <p className="text-[11px] text-[var(--color-muted-fg)]">{label}</p>
        {sub && <p className="text-[10px] text-[var(--color-muted)]">{sub}</p>}
      </div>
    </div>
  )
}

function DeadlineBadge({ days }) {
  if (days <= 7) return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-rose-100 text-rose-700 border border-rose-200"><AlertTriangle size={10} /> {days}d</span>
  if (days <= 14) return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200"><Clock size={10} /> {days}d</span>
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 size={10} /> {days}d</span>
}

function PeriodSelector({ periodFrom, setPeriodFrom, periodTo, setPeriodTo }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--color-muted-fg)]">From</label>
        <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none" />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--color-muted-fg)]">To</label>
        <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none" />
      </div>
    </div>
  )
}

function SectionHeader({ title, count }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <h4 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide">{title}</h4>
      {count != null && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted-fg)]">{count}</span>}
    </div>
  )
}

// ─── Dashboard Tab ───────────────────────────────────────────────────────────
function DashboardTab({ data, loading, onSwitchTab }) {
  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
  if (!data) return null
  const { vat, wht, deadlines, alerts } = data

  return (
    <div className="space-y-5">
      {(alerts.urgent_count > 0 || alerts.warning_count > 0) && (
        <div className={cn('rounded-xl border p-3 flex items-center gap-3', alerts.urgent_count > 0 ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50')}>
          <AlertTriangle size={16} className={alerts.urgent_count > 0 ? 'text-rose-500' : 'text-amber-500'} />
          <span className="text-sm text-[var(--color-text)]">
            {alerts.urgent_count > 0 && <strong>{alerts.urgent_count} filing(s) due within 7 days. </strong>}
            {alerts.warning_count > 0 && <span>{alerts.warning_count} filing(s) due within 14 days.</span>}
          </span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Output VAT" value={money(vat.output_vat)} sub={`${vat.output_vat_invoices} invoices`} icon={ArrowUpRight} color="text-blue-600 bg-blue-50" />
        <MetricCard label="Input VAT" value={money(vat.input_vat)} sub={`${vat.input_vat_bills} bills`} icon={ArrowDownRight} color="text-purple-600 bg-purple-50" />
        <MetricCard label="Net VAT" value={money(vat.net_vat)} sub={vat.net_vat >= 0 ? 'Payable to BIR' : 'Claimable'} icon={vat.net_vat >= 0 ? TrendingUp : TrendingDown} color={vat.net_vat >= 0 ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'} />
        <MetricCard label="Total WHT/EWT" value={money(wht.total_withholding)} sub={`${wht.wht_invoice_count + wht.ewt_bill_count} transactions`} icon={Calculator} color="text-amber-600 bg-amber-50" />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-3">
        <button onClick={() => onSwitchTab('vat')} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/5 transition-colors">
          <ArrowUpRight size={16} className="text-blue-600 mb-1.5" />
          <p className="text-xs font-medium text-[var(--color-text)]">VAT Details</p>
          <p className="text-[10px] text-[var(--color-muted-fg)]">View all invoices & bills with VAT</p>
        </button>
        <button onClick={() => onSwitchTab('wht')} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/5 transition-colors">
          <Calculator size={16} className="text-amber-600 mb-1.5" />
          <p className="text-xs font-medium text-[var(--color-text)]">WHT / EWT</p>
          <p className="text-[10px] text-[var(--color-muted-fg)]">Withholding details & 2307 data</p>
        </button>
        <button onClick={() => onSwitchTab('deadlines')} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/5 transition-colors">
          <Calendar size={16} className="text-purple-600 mb-1.5" />
          <p className="text-xs font-medium text-[var(--color-text)]">Filing Tracker</p>
          <p className="text-[10px] text-[var(--color-muted-fg)]">Record & track BIR submissions</p>
        </button>
        <button onClick={() => onSwitchTab('codes')} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/5 transition-colors">
          <Settings2 size={16} className="text-slate-600 mb-1.5" />
          <p className="text-xs font-medium text-[var(--color-text)]">Tax Codes</p>
          <p className="text-[10px] text-[var(--color-muted-fg)]">Configure rates & settings</p>
        </button>
      </div>

      {/* Monthly Trend */}
      {vat.monthly && vat.monthly.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <SectionHeader title="Monthly VAT Trend" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-[var(--color-border)]"><th className="py-2 pr-4 text-[var(--color-muted-fg)]">Month</th><th className="py-2 pr-4 text-[var(--color-muted-fg)]">Output VAT</th><th className="py-2 pr-4 text-[var(--color-muted-fg)]">Input VAT</th><th className="py-2 text-[var(--color-muted-fg)]">Net</th></tr></thead>
              <tbody>{vat.monthly.map(m => (
                <tr key={m.month} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2 pr-4 font-medium text-[var(--color-text)]">{m.month}</td>
                  <td className="py-2 pr-4 text-blue-600">{money(m.output_vat)}</td>
                  <td className="py-2 pr-4 text-purple-600">{money(m.input_vat)}</td>
                  <td className={cn('py-2 font-medium', m.net_vat >= 0 ? 'text-rose-600' : 'text-emerald-600')}>{money(m.net_vat)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upcoming Deadlines */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <SectionHeader title="Upcoming Filing Deadlines" />
        <div className="space-y-2">
          {(deadlines || []).slice(0, 6).map((d, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <DeadlineBadge days={d.days_remaining} />
              <span className="text-xs font-medium text-[var(--color-text)] w-24">{d.form}</span>
              <span className="text-xs text-[var(--color-muted-fg)] flex-1">{d.description}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-muted-fg)]">{d.category}</span>
              <span className="text-xs text-[var(--color-muted)]">{formatDate(d.due_date)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── VAT Tab ─────────────────────────────────────────────────────────────────
function VATTab({ data, loading, periodFrom, periodTo }) {
  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
  if (!data) return <p className="text-sm text-[var(--color-muted-fg)] py-8 text-center">Select a period and click Refresh.</p>

  function exportVAT() {
    const rows = []
    ;(data.invoices || []).forEach(inv => rows.push({ type: 'OUTPUT', ref: inv.invoice_number, date: inv.invoice_date, party: inv.customer_name, tin: inv.customer_tin, base: inv.billing_subtotal, vat: inv.vat_output }))
    ;(data.bills || []).forEach(b => rows.push({ type: 'INPUT', ref: b.bill_number, date: b.bill_date, party: b.supplier_name, tin: b.supplier_tin, base: b.vat_exclusive_amount, vat: b.vat_input }))
    const csv = 'Type,Reference,Date,Party,TIN,Base Amount,VAT\n' + rows.map(r => `${r.type},${r.ref},${r.date},"${r.party}",${r.tin},${r.base},${r.vat}`).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `vat_summary_${periodFrom || 'all'}_${periodTo || 'all'}.csv`; a.click()
    URL.revokeObjectURL(url)
    notify.success('VAT report exported.')
  }

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex items-center justify-end">
        <Button size="sm" variant="outline" onClick={exportVAT}><FileText size={12} /> Export VAT Report</Button>
      </div>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Output VAT (Sales)</p>
          <p className="text-2xl font-semibold text-blue-600 mt-1">{money(data.output_vat)}</p>
          <p className="text-xs text-[var(--color-muted-fg)] mt-1">Base: {money(data.output_vat_base)} · {data.output_vat_invoices} invoice(s)</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Input VAT (Purchases)</p>
          <p className="text-2xl font-semibold text-purple-600 mt-1">{money(data.input_vat)}</p>
          <p className="text-xs text-[var(--color-muted-fg)] mt-1">Base: {money(data.input_vat_base)} · {data.input_vat_bills} bill(s)</p>
        </div>
        <div className={cn('rounded-xl border p-5', data.net_vat >= 0 ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50')}>
          <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Net VAT Position</p>
          <p className={cn('text-2xl font-semibold mt-1', data.net_vat >= 0 ? 'text-rose-600' : 'text-emerald-600')}>{money(Math.abs(data.net_vat))}</p>
          <p className="text-xs text-[var(--color-muted-fg)] mt-1">{data.net_vat >= 0 ? 'Payable to BIR' : 'Excess Input VAT (Claimable)'}</p>
        </div>
      </div>

      {/* Output VAT Transactions */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <SectionHeader title="Output VAT — Sales Invoices" count={data.invoices?.length} />
        {data.invoices?.length > 0 ? (
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--color-surface)]"><tr className="border-b border-[var(--color-border)]">
                <th className="py-2 pr-3 text-[var(--color-muted-fg)]">Invoice #</th>
                <th className="py-2 pr-3 text-[var(--color-muted-fg)]">Date</th>
                <th className="py-2 pr-3 text-[var(--color-muted-fg)]">Customer</th>
                <th className="py-2 pr-3 text-[var(--color-muted-fg)]">TIN</th>
                <th className="py-2 pr-3 text-[var(--color-muted-fg)] text-right">Base Amount</th>
                <th className="py-2 pr-3 text-[var(--color-muted-fg)] text-right">VAT (12%)</th>
                <th className="py-2 text-[var(--color-muted-fg)] text-right">Gross</th>
              </tr></thead>
              <tbody>{data.invoices.map(inv => (
                <tr key={inv.invoice_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="py-2 pr-3 font-mono font-medium text-[var(--color-text)]">{inv.invoice_number}</td>
                  <td className="py-2 pr-3 text-[var(--color-muted-fg)]">{formatDate(inv.invoice_date)}</td>
                  <td className="py-2 pr-3 text-[var(--color-text)]">{inv.customer_name}</td>
                  <td className="py-2 pr-3 font-mono text-[var(--color-muted-fg)]">{inv.customer_tin}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(inv.billing_subtotal)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-blue-600 font-medium">{money(inv.vat_output)}</td>
                  <td className="py-2 text-right tabular-nums">{money(inv.gross_amount)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="text-xs text-[var(--color-muted-fg)] py-4">No invoices in this period.</p>}
      </div>

      {/* Input VAT Transactions */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <SectionHeader title="Input VAT — Supplier Bills" count={data.bills?.length} />
        {data.bills?.length > 0 ? (
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--color-surface)]"><tr className="border-b border-[var(--color-border)]">
                <th className="py-2 pr-3 text-[var(--color-muted-fg)]">Bill #</th>
                <th className="py-2 pr-3 text-[var(--color-muted-fg)]">Date</th>
                <th className="py-2 pr-3 text-[var(--color-muted-fg)]">Supplier</th>
                <th className="py-2 pr-3 text-[var(--color-muted-fg)]">TIN</th>
                <th className="py-2 pr-3 text-[var(--color-muted-fg)] text-right">Base Amount</th>
                <th className="py-2 pr-3 text-[var(--color-muted-fg)] text-right">VAT (12%)</th>
                <th className="py-2 text-[var(--color-muted-fg)] text-right">Gross</th>
              </tr></thead>
              <tbody>{data.bills.map(bill => (
                <tr key={bill.bill_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="py-2 pr-3 font-mono font-medium text-[var(--color-text)]">{bill.bill_number}</td>
                  <td className="py-2 pr-3 text-[var(--color-muted-fg)]">{formatDate(bill.bill_date)}</td>
                  <td className="py-2 pr-3 text-[var(--color-text)]">{bill.supplier_name}</td>
                  <td className="py-2 pr-3 font-mono text-[var(--color-muted-fg)]">{bill.supplier_tin}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(bill.vat_exclusive_amount)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-purple-600 font-medium">{money(bill.vat_input)}</td>
                  <td className="py-2 text-right tabular-nums">{money(bill.gross_amount)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="text-xs text-[var(--color-muted-fg)] py-4">No bills in this period.</p>}
      </div>
    </div>
  )
}

// ─── WHT Tab ─────────────────────────────────────────────────────────────────
function WHTTab({ data, loading, periodFrom, periodTo }) {
  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
  if (!data) return <p className="text-sm text-[var(--color-muted-fg)] py-8 text-center">Select a period and click Refresh.</p>

  function exportWHT() {
    const rows = []
    ;(data.wht_by_customer || []).forEach(c => rows.push({ type: 'WHT_FROM_CUSTOMER', party: c.customer_name, tin: c.customer_tin, transactions: c.invoice_count, amount: c.total_wht }))
    ;(data.ewt_by_supplier || []).forEach(s => rows.push({ type: 'EWT_TO_SUPPLIER', party: s.supplier_name, tin: s.supplier_tin, transactions: s.bill_count, amount: s.total_ewt }))
    const csv = 'Type,Party,TIN,Transactions,Amount\n' + rows.map(r => `${r.type},"${r.party}",${r.tin},${r.transactions},${r.amount}`).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `wht_ewt_summary_${periodFrom || 'all'}_${periodTo || 'all'}.csv`; a.click()
    URL.revokeObjectURL(url)
    notify.success('WHT/EWT report exported.')
  }

  function export2307() {
    const rows = (data.wht_by_customer || []).map(c => ({ customer: c.customer_name, tin: c.customer_tin, total_base: c.total_base, total_wht: c.total_wht, invoices: c.invoice_count }))
    const csv = 'Customer,TIN,Total Base Amount,Total WHT,Invoice Count\n' + rows.map(r => `"${r.customer}",${r.tin},${r.total_base},${r.total_wht},${r.invoices}`).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `bir_2307_data_${periodFrom || 'all'}_${periodTo || 'all'}.csv`; a.click()
    URL.revokeObjectURL(url)
    notify.success('BIR 2307 data exported.')
  }

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex items-center gap-2 justify-end">
        {data.wht_by_customer?.length > 0 && <Button size="sm" variant="outline" onClick={export2307}><FileText size={12} /> Export BIR 2307 Data</Button>}
        <Button size="sm" variant="outline" onClick={exportWHT}><FileText size={12} /> Export WHT/EWT Report</Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">WHT from Customers (CWT)</p>
          <p className="text-2xl font-semibold text-blue-600 mt-1">{money(data.wht_from_customers)}</p>
          <p className="text-xs text-[var(--color-muted-fg)] mt-1">{data.wht_invoice_count} invoice(s) with WHT</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">EWT to Suppliers</p>
          <p className="text-2xl font-semibold text-amber-600 mt-1">{money(data.ewt_to_suppliers)}</p>
          <p className="text-xs text-[var(--color-muted-fg)] mt-1">{data.ewt_bill_count} bill(s) with EWT</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Total Withholding</p>
          <p className="text-2xl font-semibold text-[var(--color-text)] mt-1">{money(data.total_withholding)}</p>
        </div>
      </div>

      {/* Per-customer WHT breakdown */}
      {data.wht_by_customer?.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <SectionHeader title="WHT by Customer (for BIR 2307)" count={data.wht_by_customer.length} />
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-[var(--color-border)]"><th className="py-2 pr-3 text-[var(--color-muted-fg)]">Customer</th><th className="py-2 pr-3 text-[var(--color-muted-fg)]">TIN</th><th className="py-2 pr-3 text-[var(--color-muted-fg)] text-right">Invoices</th><th className="py-2 text-[var(--color-muted-fg)] text-right">Total WHT</th></tr></thead>
            <tbody>{data.wht_by_customer.map(c => (
              <tr key={c.customer_id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="py-2 pr-3 text-[var(--color-text)] font-medium">{c.customer_name}</td>
                <td className="py-2 pr-3 font-mono text-[var(--color-muted-fg)]">{c.customer_tin}</td>
                <td className="py-2 pr-3 text-right">{c.invoice_count}</td>
                <td className="py-2 text-right font-medium text-blue-600">{money(c.total_wht)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* WHT transaction detail */}
      {data.wht_invoices?.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <SectionHeader title="WHT Transactions (Invoices)" count={data.wht_invoices.length} />
          <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--color-surface)]"><tr className="border-b border-[var(--color-border)]"><th className="py-2 pr-3 text-[var(--color-muted-fg)]">Invoice #</th><th className="py-2 pr-3 text-[var(--color-muted-fg)]">Date</th><th className="py-2 pr-3 text-[var(--color-muted-fg)]">Customer</th><th className="py-2 pr-3 text-[var(--color-muted-fg)] text-right">Base</th><th className="py-2 text-[var(--color-muted-fg)] text-right">WHT</th></tr></thead>
              <tbody>{data.wht_invoices.map(inv => (
                <tr key={inv.invoice_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="py-2 pr-3 font-mono text-[var(--color-text)]">{inv.invoice_number}</td>
                  <td className="py-2 pr-3 text-[var(--color-muted-fg)]">{formatDate(inv.invoice_date)}</td>
                  <td className="py-2 pr-3 text-[var(--color-text)]">{inv.customer_name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(inv.billing_subtotal)}</td>
                  <td className="py-2 text-right tabular-nums font-medium text-blue-600">{money(inv.wht_amount)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-supplier EWT breakdown */}
      {data.ewt_by_supplier?.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <SectionHeader title="EWT by Supplier (for BIR 0619-E)" count={data.ewt_by_supplier.length} />
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-[var(--color-border)]"><th className="py-2 pr-3 text-[var(--color-muted-fg)]">Supplier</th><th className="py-2 pr-3 text-[var(--color-muted-fg)]">TIN</th><th className="py-2 pr-3 text-[var(--color-muted-fg)] text-right">Bills</th><th className="py-2 text-[var(--color-muted-fg)] text-right">Total EWT</th></tr></thead>
            <tbody>{data.ewt_by_supplier.map(s => (
              <tr key={s.supplier_id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="py-2 pr-3 text-[var(--color-text)] font-medium">{s.supplier_name}</td>
                <td className="py-2 pr-3 font-mono text-[var(--color-muted-fg)]">{s.supplier_tin}</td>
                <td className="py-2 pr-3 text-right">{s.bill_count}</td>
                <td className="py-2 text-right font-medium text-amber-600">{money(s.total_ewt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* EWT transaction detail */}
      {data.ewt_bills?.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <SectionHeader title="EWT Transactions (Bills)" count={data.ewt_bills.length} />
          <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--color-surface)]"><tr className="border-b border-[var(--color-border)]"><th className="py-2 pr-3 text-[var(--color-muted-fg)]">Bill #</th><th className="py-2 pr-3 text-[var(--color-muted-fg)]">Date</th><th className="py-2 pr-3 text-[var(--color-muted-fg)]">Supplier</th><th className="py-2 pr-3 text-[var(--color-muted-fg)] text-right">Base</th><th className="py-2 text-[var(--color-muted-fg)] text-right">EWT (1%)</th></tr></thead>
              <tbody>{data.ewt_bills.map(bill => (
                <tr key={bill.bill_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="py-2 pr-3 font-mono text-[var(--color-text)]">{bill.bill_number}</td>
                  <td className="py-2 pr-3 text-[var(--color-muted-fg)]">{formatDate(bill.bill_date)}</td>
                  <td className="py-2 pr-3 text-[var(--color-text)]">{bill.supplier_name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(bill.vat_exclusive_amount)}</td>
                  <td className="py-2 text-right tabular-nums font-medium text-amber-600">{money(bill.ewt_material)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Deadlines Tab ───────────────────────────────────────────────────────────
function DeadlinesTab({ deadlines, filings, loading, onRecordFiling }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ form: '', period_covered: '', filing_date: '', reference_number: '', amount_paid: '', notes: '', entity: '' })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.form || !form.period_covered || !form.filing_date) return
    setSaving(true)
    try {
      await onRecordFiling(form)
      setShowForm(false)
      setForm({ form: '', period_covered: '', filing_date: '', reference_number: '', amount_paid: '', notes: '', entity: '' })
    } catch { /* */ } finally { setSaving(false) }
  }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none'

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>

  return (
    <div className="space-y-5">
      {/* Upcoming deadlines */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide">Upcoming Deadlines</h3>
        </div>
        <table className="w-full text-left">
          <thead><tr className="border-b border-[var(--color-border)]">
            <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
            <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Form</th>
            <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Description</th>
            <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Category</th>
            <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Period</th>
            <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Due Date</th>
          </tr></thead>
          <tbody>
            {(deadlines || []).map((d, i) => (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                <td className="px-4 py-2.5"><DeadlineBadge days={d.days_remaining} /></td>
                <td className="px-4 py-2.5 text-sm font-medium text-[var(--color-text)]">{d.form}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{d.description}</td>
                <td className="px-4 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-muted-fg)]">{d.category}</span></td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{d.period_covered}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-text)]">{formatDate(d.due_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Filing History */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide">Filing History</h3>
          <Button size="sm" onClick={() => setShowForm(true)}><Plus size={12} /> Record Filing</Button>
        </div>
        {showForm && (
          <form onSubmit={handleSubmit} className="px-4 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/50 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-[11px] text-[var(--color-muted-fg)]">Form *</label><select value={form.form} onChange={e => setForm(f => ({...f, form: e.target.value}))} className={inputCls}><option value="">Select...</option><option>BIR 2550M</option><option>BIR 0619-E</option><option>BIR 2550Q</option><option>SSS</option><option>PhilHealth</option><option>Pag-IBIG</option></select></div>
              <div><label className="text-[11px] text-[var(--color-muted-fg)]">Period Covered *</label><input value={form.period_covered} onChange={e => setForm(f => ({...f, period_covered: e.target.value}))} placeholder="June 2026" className={inputCls} /></div>
              <div><label className="text-[11px] text-[var(--color-muted-fg)]">Filing Date *</label><input type="date" value={form.filing_date} onChange={e => setForm(f => ({...f, filing_date: e.target.value}))} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-[11px] text-[var(--color-muted-fg)]">Reference #</label><input value={form.reference_number} onChange={e => setForm(f => ({...f, reference_number: e.target.value}))} placeholder="BIR confirmation" className={inputCls} /></div>
              <div><label className="text-[11px] text-[var(--color-muted-fg)]">Amount Paid</label><input type="number" value={form.amount_paid} onChange={e => setForm(f => ({...f, amount_paid: e.target.value}))} placeholder="0.00" className={inputCls} /></div>
              <div><label className="text-[11px] text-[var(--color-muted-fg)]">Entity</label><select value={form.entity} onChange={e => setForm(f => ({...f, entity: e.target.value}))} className={inputCls}><option value="">All</option><option>EXSSI</option><option>GreatnessLab</option><option>Exigent</option><option value="KSI">Kyrios Solutions Inc.</option></select></div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving || !form.form || !form.period_covered || !form.filing_date}>{saving ? 'Saving...' : 'Save Filing'}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        )}
        {filings?.length > 0 ? (
          <table className="w-full text-left">
            <thead><tr className="border-b border-[var(--color-border)]">
              <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Form</th>
              <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Period</th>
              <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Filed On</th>
              <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Reference</th>
              <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Amount</th>
              <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Entity</th>
              <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Filed By</th>
            </tr></thead>
            <tbody>{filings.map(f => (
              <tr key={f.filing_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                <td className="px-4 py-2.5 text-sm font-medium text-[var(--color-text)]">{f.form}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{f.period_covered}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-text)]">{formatDate(f.filing_date)}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-[var(--color-muted-fg)]">{f.reference_number || '—'}</td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums">{f.amount_paid ? money(f.amount_paid) : '—'}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{f.entity || '—'}</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{f.filed_by || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="text-xs text-[var(--color-muted-fg)] p-4">No filings recorded yet. Click "Record Filing" to track submissions.</p>}
      </div>
    </div>
  )
}

// ─── Tax Codes Tab ───────────────────────────────────────────────────────────
function TaxCodesTab({ codes, loading, onRefresh }) {
  const [editingCode, setEditingCode] = useState(null)
  const [editRate, setEditRate] = useState('')
  const [saving, setSaving] = useState(false)

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>
  if (!codes || codes.length === 0) return <p className="text-sm text-[var(--color-muted-fg)] py-8 text-center">No tax codes configured.</p>

  async function handleSaveRate(code) {
    setSaving(true)
    try {
      const res = await fetch(`${BASE}/tax/codes/${code}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ rate: Number(editRate) / 100 }) })
      if (!res.ok) throw new Error('Failed')
      notify.success(`Tax code ${code} updated.`)
      setEditingCode(null)
      if (onRefresh) onRefresh()
    } catch { notify.error('Failed to update tax code') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-xs text-[var(--color-muted-fg)]">
          Tax codes define the rates applied to invoices and bills. Click the edit icon on editable codes to change their rate. Changes take effect on new transactions.
        </p>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[var(--color-surface-2)]"><tr className="border-b border-[var(--color-border)]">
            <th className="px-4 py-3 text-[11px] font-medium text-[var(--color-muted-fg)]">Code</th>
            <th className="px-4 py-3 text-[11px] font-medium text-[var(--color-muted-fg)]">Description</th>
            <th className="px-4 py-3 text-[11px] font-medium text-[var(--color-muted-fg)]">Rate</th>
            <th className="px-4 py-3 text-[11px] font-medium text-[var(--color-muted-fg)]">Scope</th>
            <th className="px-4 py-3 text-[11px] font-medium text-[var(--color-muted-fg)]">Used For</th>
            <th className="px-4 py-3 text-[11px] font-medium text-[var(--color-muted-fg)]">Actions</th>
          </tr></thead>
          <tbody>
            {codes.map(c => {
              const desc = {
                'VAT_OUTPUT': 'VAT charged on sales invoices to customers',
                'VAT_INPUT': 'VAT paid on purchase bills from suppliers',
                'VAT_EXEMPT': 'Zero-rated or exempt transactions',
                'WHT_MATERIAL_1': 'Withholding tax on material purchases (1%)',
                'WHT_SERVICE_2': 'Withholding tax on services (2%)',
                'NO_WHT': 'No withholding tax applied',
              }[c.code] || c.tax_type || '—'
              const usedFor = {
                'VAT_OUTPUT': 'AR Invoices — Output VAT line',
                'VAT_INPUT': 'AP Bills — Input VAT line',
                'VAT_EXEMPT': 'AR/AP — Exempt transactions',
                'WHT_MATERIAL_1': 'AR Invoices — Customer withholds 1% for materials',
                'WHT_SERVICE_2': 'AR Invoices — Customer withholds 2% for services',
                'NO_WHT': 'AR Invoices — No withholding',
              }[c.code] || c.scope || '—'
              const isEditing = editingCode === c.code
              return (
                <tr key={c.code} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="px-4 py-3 text-sm font-medium text-[var(--color-text)] font-mono">{c.code}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted-fg)]">{desc}</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.1" value={editRate} onChange={e => setEditRate(e.target.value)} className="w-16 rounded border border-[var(--color-border)] px-2 py-1 text-xs" autoFocus />
                        <span className="text-xs">%</span>
                        <button onClick={() => handleSaveRate(c.code)} disabled={saving} className="text-[10px] text-emerald-600 font-medium hover:underline">{saving ? '...' : 'Save'}</button>
                        <button onClick={() => setEditingCode(null)} className="text-[10px] text-[var(--color-muted-fg)] hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-[var(--color-text)]">{(Number(c.rate) * 100).toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted-fg)]">{c.scope || 'BOTH'}</span></td>
                  <td className="px-4 py-3 text-[11px] text-[var(--color-muted-fg)]">{usedFor}</td>
                  <td className="px-4 py-3">
                    {c.editable && !isEditing && (
                      <button onClick={() => { setEditingCode(c.code); setEditRate((Number(c.rate) * 100).toFixed(1)) }} className="text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]"><Pencil size={13} /></button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function TaxManagement() {
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const activeTab = getActiveSubRoute(location.pathname, TABS.map(t => t.id), 'dashboard')

  const now = new Date()
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const today = now.toISOString().slice(0, 10)
  const [periodFrom, setPeriodFrom] = useState(firstOfMonth)
  const [periodTo, setPeriodTo] = useState(today)

  const [dashboard, setDashboard] = useState(null)
  const [vatData, setVatData] = useState(null)
  const [whtData, setWhtData] = useState(null)
  const [deadlines, setDeadlines] = useState([])
  const [filings, setFilings] = useState([])
  const [taxCodes, setTaxCodes] = useState([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = `period_from=${periodFrom}&period_to=${periodTo}`
      const [dash, vat, wht, dl, fl, codes] = await Promise.all([
        apiGet(`/tax/dashboard?${params}`),
        apiGet(`/tax/vat-summary?${params}`),
        apiGet(`/tax/wht-summary?${params}`),
        apiGet('/tax/filing-deadlines'),
        apiGet('/tax/filings').catch(() => []),
        apiGet('/tax/codes'),
      ])
      setDashboard(dash)
      setVatData(vat)
      setWhtData(wht)
      setDeadlines(dl)
      setFilings(fl)
      setTaxCodes(codes)
    } catch {
      notify.error('Failed to load tax data')
    } finally {
      setLoading(false)
    }
  }, [periodFrom, periodTo])

  useEffect(() => {
    const timer = setTimeout(() => { void loadData() }, 0)
    return () => clearTimeout(timer)
  }, [loadData])

  async function handleRecordFiling(formData) {
    const payload = { ...formData }
    if (payload.amount_paid) payload.amount_paid = Number(payload.amount_paid)
    else delete payload.amount_paid
    if (!payload.entity) delete payload.entity
    if (!payload.reference_number) delete payload.reference_number
    if (!payload.notes) delete payload.notes
    await apiPost('/tax/filings', payload)
    notify.success('Filing recorded.')
    await loadData()
  }

  const [dropdownOpen, setDropdownOpen] = useState(false)

  const activeLabel = TABS.find(t => t.id === activeTab)?.label || ''

  function handleTabChange(tabId) {
    navigate(`/tax/${tabId}`)
    setDropdownOpen(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Tax Management" subtitle="VAT, WHT/EWT tracking, BIR filing deadlines, and tax code configuration" />
      <div className="relative z-20 flex items-center gap-4 px-6 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="relative">
          <button type="button" onClick={() => setDropdownOpen(p => !p)} className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] focus:outline-none">
            {activeLabel}
            <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-[49]" onClick={() => setDropdownOpen(false)} />
              <ul className="absolute left-0 top-full mt-1 min-w-full whitespace-nowrap rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-50">
                {TABS.map(tab => (
                  <li key={tab.id}><button type="button" onClick={() => handleTabChange(tab.id)} className={cn('w-full text-left px-3 py-1.5 text-sm transition-colors', tab.id === activeTab ? 'bg-[var(--color-primary)] text-white font-medium' : 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]')}>{tab.label}</button></li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="flex-1" />
        <PeriodSelector periodFrom={periodFrom} setPeriodFrom={setPeriodFrom} periodTo={periodTo} setPeriodTo={setPeriodTo} onRefresh={loadData} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'dashboard' && <DashboardTab data={dashboard} loading={loading} onSwitchTab={handleTabChange} />}
        {activeTab === 'vat' && <VATTab data={vatData} loading={loading} periodFrom={periodFrom} periodTo={periodTo} />}
        {activeTab === 'wht' && <WHTTab data={whtData} loading={loading} periodFrom={periodFrom} periodTo={periodTo} />}
        {activeTab === 'deadlines' && <DeadlinesTab deadlines={deadlines} filings={filings} loading={loading} onRecordFiling={handleRecordFiling} />}
        {activeTab === 'codes' && <TaxCodesTab codes={taxCodes} loading={loading} onRefresh={loadData} />}
      </div>
    </div>
  )
}
