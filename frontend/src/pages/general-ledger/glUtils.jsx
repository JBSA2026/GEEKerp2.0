/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ArrowRight, ArrowUpRight, CheckCircle, FileText, Loader2, RotateCcw, X } from 'lucide-react'

import GLabLogo from '@/assets/company-logos/GLab.png'
import ExpediaLogo from '@/assets/company-logos/Expedia.png'
import ExigentLogo from '@/assets/company-logos/exigent.png'
import KSILogo from '@/assets/company-logos/KSI.png'

// ─── Highlight Hook (re-exported from shared hook) ──────────────────────────
export { useHighlightRow, highlightRowCls } from '@/hooks/useHighlightRow'

const BASE = import.meta.env.VITE_API_URL

// ─── Entities ───────────────────────────────────────────────────────────────
export const ENTITIES = [
  { value: 'Expedia', label: 'Expedia', logo: ExpediaLogo },
  { value: 'GreatnessLab', label: 'GreatnessLab', logo: GLabLogo },
  { value: 'Exigent', label: 'Exigent', logo: ExigentLogo },
  { value: 'KSI', label: 'Kyrios Solutions Inc.', logo: KSILogo },
]

// ─── Tabs ───────────────────────────────────────────────────────────────────
export const GL_TABS = [
  { id: 'general-ledger', label: 'General Ledger', group: 'books' },
  { id: 'coa', label: 'Chart of Accounts', group: 'books' },
  { id: 'entries', label: 'General Journal', group: 'books' },
  { id: 'cash-receipts', label: 'Cash Receipts', group: 'books' },
  { id: 'cash-disbursements', label: 'Cash Disbursements', group: 'books' },
  { id: 'sales-book', label: 'Sales Book', group: 'books' },
  { id: 'purchases-book', label: 'Purchases Book', group: 'books' },
]

// ─── Account Types ──────────────────────────────────────────────────────────
export const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']

// ─── Shared CSS classes ─────────────────────────────────────────────────────
export const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
export const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// ─── API helpers ────────────────────────────────────────────────────────────
export function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
  return res.json()
}

export async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err }
  return data
}

export async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err }
  return data
}

export async function apiDelete(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || 'Delete failed') }
  return true
}

export async function apiDownload(path, filename) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── Shared UI Components ───────────────────────────────────────────────────
export function MetricCard({ label, value, color }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wide">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', color || 'text-[var(--color-text)]')}>{value ?? '—'}</p>
    </div>
  )
}

export function StatusBadge({ status }) {
  const s = (status || '').toLowerCase()
  if (s === 'posted') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
      <CheckCircle size={11} /> Posted
    </span>
  )
  if (s === 'draft') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
      <FileText size={11} /> Draft
    </span>
  )
  if (s === 'reversed') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
      <RotateCcw size={11} /> Reversed
    </span>
  )
  return <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{status || '—'}</span>
}

export function formatCurrency(val) {
  if (val == null || val === '') return '₱0.00'
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function Drawer({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white shadow-2xl rounded-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200 mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)]"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

// ─── Reference Autocomplete ─────────────────────────────────────────────────

export function RefAutocomplete({ module, entity, value, onChange, placeholder }) {
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)

  async function fetchSuggestions(search) {
    if (!module) { setSuggestions([]); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ module })
      if (entity) params.set('entity', entity)
      if (search) params.set('search', search)
      const res = await fetch(`${BASE}/general-ledger/reference-suggestions?${params}`, { headers: authHeaders() })
      const data = await res.json()
      setSuggestions(Array.isArray(data) ? data : [])
    } catch { setSuggestions([]) }
    finally { setLoading(false) }
  }

  function handleInputChange(e) {
    const val = e.target.value
    onChange(val)
    if (val.length >= 1) {
      fetchSuggestions(val)
      setShowDropdown(true)
    } else {
      fetchSuggestions('')
      setShowDropdown(true)
    }
  }

  function handleFocus() {
    fetchSuggestions(value || '')
    setShowDropdown(true)
  }

  function handleSelect(item) {
    onChange(item.value)
    setShowDropdown(false)
  }

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        placeholder={placeholder || 'Type to search...'}
      />
      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute left-0 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg z-50">
          {suggestions.map((item, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={() => handleSelect(item)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-2)] transition-colors"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {showDropdown && loading && (
        <div className="absolute right-2 top-2.5 text-[var(--color-muted-fg)]">
          <Loader2 aria-label="Loading options" size={14} strokeWidth={1.8} className="animate-spin" />
        </div>
      )}
    </div>
  )
}

export function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6">
        <h3 className="text-base font-semibold text-[var(--color-text)] mb-2">{title}</h3>
        <p className="text-sm text-[var(--color-muted-fg)] mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Source Link Helper ─────────────────────────────────────────────────────
// Maps source_module to a URL path in the ERP for clickable drill-down
export function getSourceLink(sourceModule, sourceId, refNumber) {
  if (!sourceModule) return null
  const mod = (sourceModule || '').toLowerCase()
  // Use sourceId for highlight if available, otherwise use refNumber for search
  const param = sourceId ? `highlight=${sourceId}` : (refNumber ? `ref=${encodeURIComponent(refNumber)}` : '')
  const qs = param ? `?${param}` : ''
  if (mod.includes('ar') || mod.includes('receivable') || mod.includes('collection') || mod.includes('receipt'))
    return `/accounts-receivable/invoices${qs}`
  if (mod.includes('ap') || mod.includes('payable') || mod.includes('disbursement') || mod.includes('payment'))
    return `/accounts-payable/bills${qs}`
  if (mod.includes('sales') && !mod.includes('book'))
    return `/crm/orders${qs}`
  if (mod.includes('sales book'))
    return `/general-ledger/sales-book${qs}`
  if (mod.includes('purchase') && !mod.includes('book'))
    return `/purchasing/orders${qs}`
  if (mod.includes('purchases book'))
    return `/general-ledger/purchases-book${qs}`
  if (mod.includes('cash receipts'))
    return `/general-ledger/cash-receipts${qs}`
  if (mod.includes('cash disbursements'))
    return `/general-ledger/cash-disbursements${qs}`
  if (mod.includes('payroll'))
    return `/payroll${qs}`
  if (mod.includes('journal') || mod.includes('general journal'))
    return `/general-ledger/entries${qs}`
  return null
}

export function SourceLink({ sourceModule, sourceId, refNumber, children }) {
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  async function handleClick(e) {
    e.preventDefault()
    e.stopPropagation()
    setLoadingPreview(true)
    try {
      const params = new URLSearchParams({ module: sourceModule })
      if (sourceId) params.set('source_id', sourceId)
      if (refNumber) params.set('ref', refNumber)
      const res = await fetch(`${BASE}/general-ledger/source-preview?${params}`, { headers: authHeaders() })
      const data = await res.json()
      if (data.found) {
        setPreview(data)
      } else {
        // Fallback: navigate directly
        const link = getSourceLink(sourceModule, sourceId, refNumber)
        if (link) window.location.href = link
      }
    } catch {
      const link = getSourceLink(sourceModule, sourceId, refNumber)
      if (link) window.location.href = link
    }
    finally { setLoadingPreview(false) }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline font-medium cursor-pointer text-left"
        title={`View source: ${sourceModule}`}
      >
        {loadingPreview ? <Loader2 aria-label="Loading record preview" size={12} strokeWidth={1.8} className="animate-spin" /> : null}
        {children || refNumber || sourceModule}
        <ArrowUpRight aria-hidden="true" size={11} strokeWidth={2.25} />
      </button>
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setPreview(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-5 animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">{preview.module} — {preview.type}</h3>
              <button onClick={() => setPreview(null)} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-[var(--color-muted-fg)] text-xs">Number:</span><br/><span className="font-semibold font-mono text-xs">{preview.number}</span></div>
                <div><span className="text-[var(--color-muted-fg)] text-xs">Date:</span><br/><span className="font-medium">{preview.date}</span></div>
                {preview.customer && <div><span className="text-[var(--color-muted-fg)] text-xs">Customer:</span><br/><span className="font-medium">{preview.customer}</span></div>}
                {preview.supplier && <div><span className="text-[var(--color-muted-fg)] text-xs">Supplier:</span><br/><span className="font-medium">{preview.supplier}</span></div>}
                <div><span className="text-[var(--color-muted-fg)] text-xs">Entity:</span><br/><span className="font-medium">{preview.entity}</span></div>
                <div><span className="text-[var(--color-muted-fg)] text-xs">Status:</span><br/><span className="font-medium">{preview.status} {preview.collection_status ? `/ ${preview.collection_status}` : ''}{preview.payment_status ? `/ ${preview.payment_status}` : ''}</span></div>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] p-3 mt-2 space-y-1 text-xs">
                {preview.gross_amount != null && <div className="flex justify-between"><span>Gross Amount</span><span className="font-mono font-semibold">₱{Number(preview.gross_amount).toLocaleString('en-PH', {minimumFractionDigits: 2})}</span></div>}
                {preview.vat != null && Number(preview.vat) > 0 && <div className="flex justify-between"><span>VAT</span><span className="font-mono">₱{Number(preview.vat).toLocaleString('en-PH', {minimumFractionDigits: 2})}</span></div>}
                {preview.wht != null && Number(preview.wht) > 0 && <div className="flex justify-between"><span>WHT</span><span className="font-mono">₱{Number(preview.wht).toLocaleString('en-PH', {minimumFractionDigits: 2})}</span></div>}
                {preview.ewt != null && Number(preview.ewt) > 0 && <div className="flex justify-between"><span>EWT</span><span className="font-mono">₱{Number(preview.ewt).toLocaleString('en-PH', {minimumFractionDigits: 2})}</span></div>}
                {preview.net_payable != null && <div className="flex justify-between border-t pt-1 font-semibold"><span>Net Payable</span><span className="font-mono">₱{Number(preview.net_payable).toLocaleString('en-PH', {minimumFractionDigits: 2})}</span></div>}
                {preview.collection_amount != null && <div className="flex justify-between border-t pt-1 font-semibold"><span>Collection Amount</span><span className="font-mono">₱{Number(preview.collection_amount).toLocaleString('en-PH', {minimumFractionDigits: 2})}</span></div>}
                {preview.total_net != null && <div className="flex justify-between border-t pt-1 font-semibold"><span>Net Pay</span><span className="font-mono">₱{Number(preview.total_net).toLocaleString('en-PH', {minimumFractionDigits: 2})}</span></div>}
              </div>
              {/* Collection OR numbers */}
              {preview.collections && preview.collections.length > 0 && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3 mt-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-500 mb-2">Collection OR Numbers</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-slate-500">
                        <th className="text-left pb-1">OR No.</th>
                        <th className="text-right pb-1">Amount</th>
                        <th className="text-right pb-1">Date</th>
                        <th className="text-right pb-1">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-100">
                      {preview.collections.map((c, i) => (
                        <tr key={i}>
                          <td className="py-1 font-mono font-semibold text-[var(--color-primary)]">{c.or_number || '—'}</td>
                          <td className="py-1 text-right font-mono">₱{Number(c.collection_amount).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                          <td className="py-1 text-right">{c.collection_date}</td>
                          <td className="py-1 text-right">{c.payment_method}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Single collection info (when previewing from Cash Receipts) */}
              {preview.or_number && preview.type === 'Collection' && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3 mt-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-500 mb-2">Collection Details</p>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr><td className="py-0.5 text-slate-500 w-24">OR Number</td><td className="py-0.5 font-mono font-semibold">{preview.or_number}</td></tr>
                      <tr><td className="py-0.5 text-slate-500">Amount</td><td className="py-0.5 font-mono">₱{Number(preview.collection_amount).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
                      <tr><td className="py-0.5 text-slate-500">Method</td><td className="py-0.5">{preview.payment_method}</td></tr>
                      <tr><td className="py-0.5 text-slate-500">Invoice</td><td className="py-0.5 font-mono">{preview.invoice_number}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
              {preview.po_number && <p className="text-xs text-[var(--color-muted-fg)]">PO: {preview.po_number}</p>}
              {preview.supplier_invoice && <p className="text-xs text-[var(--color-muted-fg)]">Supplier Invoice: {preview.supplier_invoice}</p>}
              {preview.period && <p className="text-xs text-[var(--color-muted-fg)]">Period: {preview.period}</p>}
            </div>
            <div className="mt-4 flex justify-end">
              <a href={preview.link} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] rounded-lg hover:opacity-90">
                Open Full Record <ArrowRight aria-hidden="true" size={12} strokeWidth={2} />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
