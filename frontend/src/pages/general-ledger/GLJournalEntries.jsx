import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import {
  Plus, Loader2, X, Trash2, BookOpen, Download,
  Eye, CheckCircle, RotateCcw, PlusCircle, MinusCircle, Search
} from 'lucide-react'
import {
  ENTITIES, inputCls, reqMark,
  apiGet, apiPost, apiDelete, apiDownload,
  MetricCard, StatusBadge, formatCurrency,
  Drawer, ConfirmDialog, SourceLink,
  useHighlightRow, highlightRowCls, RefAutocomplete,
} from './glUtils'

const BASE = import.meta.env.VITE_API_URL

// ─── Template Options ───────────────────────────────────────────────────────
const TEMPLATE_OPTIONS = [
  { key: 'sales', name: 'Sales Posting', desc: 'Debit: AR | Credit: Revenue + VAT Output', color: 'text-emerald-600' },
  { key: 'collection', name: 'Collection Posting', desc: 'Debit: Cash + CWT | Credit: AR', color: 'text-blue-600' },
  { key: 'purchase', name: 'Purchase Posting', desc: 'Debit: Inventory/Expense + VAT Input | Credit: AP', color: 'text-amber-600' },
  { key: 'payment', name: 'Payment Posting', desc: 'Debit: AP | Credit: Cash + EWT', color: 'text-red-600' },
]

// ─── Template Post Drawer ───────────────────────────────────────────────────
function TemplatePostDrawer({ open, onClose, entity, onPosted }) {
  const [template, setTemplate] = useState('')
  const [form, setForm] = useState({ entry_date: new Date().toISOString().slice(0, 10), gross_amount: '', vat_rate: '0.12', tax_rate: '0', description: '', reference_module: '', reference_number: '', entity: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      setTemplate('')
      setForm(f => ({ ...f, entity: entity === 'All' ? '' : entity, entry_date: new Date().toISOString().slice(0, 10), gross_amount: '', vat_rate: '0.12', tax_rate: '0', description: '', reference_module: '', reference_number: '' }))
    }, 0)
    return () => clearTimeout(timer)
  }, [open, entity])

  const gross = parseFloat(form.gross_amount) || 0
  const vatRate = parseFloat(form.vat_rate) || 0
  const taxRate = parseFloat(form.tax_rate) || 0
  const netAmount = vatRate > 0 ? gross / (1 + vatRate) : gross
  const vatAmount = gross - netAmount
  const cwtAmount = gross * taxRate
  const ewtAmount = gross * taxRate
  const netCollection = gross - cwtAmount
  const netPayment = gross - ewtAmount

  function preview() {
    if (!template || gross <= 0) return null
    const lines = []
    if (template === 'sales') {
      lines.push({ side: 'Dr', account: 'Accounts Receivable (1100)', amount: gross })
      lines.push({ side: 'Cr', account: 'Sales Revenue (4000)', amount: netAmount })
      lines.push({ side: 'Cr', account: 'VAT Output Payable (2210)', amount: vatAmount })
    } else if (template === 'collection') {
      lines.push({ side: 'Dr', account: 'Cash in Bank (1020)', amount: netCollection })
      if (cwtAmount > 0) lines.push({ side: 'Dr', account: 'CWT Receivable (1110)', amount: cwtAmount })
      lines.push({ side: 'Cr', account: 'Accounts Receivable (1100)', amount: gross })
    } else if (template === 'purchase') {
      lines.push({ side: 'Dr', account: 'Inventory / Expense (1200)', amount: netAmount })
      lines.push({ side: 'Dr', account: 'VAT Input (1120)', amount: vatAmount })
      lines.push({ side: 'Cr', account: 'Accounts Payable (2000)', amount: gross })
    } else if (template === 'payment') {
      lines.push({ side: 'Dr', account: 'Accounts Payable (2000)', amount: gross })
      lines.push({ side: 'Cr', account: 'Cash in Bank (1020)', amount: netPayment })
      if (ewtAmount > 0) lines.push({ side: 'Cr', account: 'EWT Payable (2310)', amount: ewtAmount })
    }
    return lines
  }

  async function handlePost() {
    if (!template || gross <= 0 || !form.entity) { notify.error('Select template, enter amount, and choose entity'); return }
    setSaving(true)
    try {
      const body = { template, entry_date: form.entry_date, gross_amount: gross, vat_rate: vatRate, tax_rate: taxRate, description: form.description || undefined, reference_module: form.reference_module || undefined, reference_number: form.reference_number || undefined, entity: form.entity || undefined }
      const res = await fetch(`${BASE}/general-ledger/templates/post`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('access_token') ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` } : {}) }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Post failed')
      notify.success(`${TEMPLATE_OPTIONS.find(o => o.key === template)?.name} posted — ${data.entry_number}`)
      onPosted()
      onClose()
    } catch (e) { notify.error(e.message) }
    finally { setSaving(false) }
  }

  const previewLines = preview()

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-text)]">Quick Post — Standard Entry</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)]"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Template Selection */}
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATE_OPTIONS.map(t => (
              <button key={t.key} type="button" onClick={() => setTemplate(t.key)} className={cn('rounded-lg border p-3 text-left transition-all', template === t.key ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/40')}>
                <p className={cn('text-sm font-semibold', t.color)}>{t.name}</p>
                <p className="text-[11px] text-[var(--color-muted-fg)] mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>

          {template && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Date</label><input type="date" className={inputCls} value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Entity</label><select className={inputCls} value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}><option value="">Select</option>{ENTITIES.filter(e => e.value !== 'All').map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</select></div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Gross Amount (₱)</label><input type="number" step="0.01" min="0" className={inputCls} value={form.gross_amount} onChange={e => setForm(f => ({ ...f, gross_amount: e.target.value }))} placeholder="0.00" /></div>
                <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">VAT Rate</label><input type="number" step="0.01" min="0" max="1" className={inputCls} value={form.vat_rate} onChange={e => setForm(f => ({ ...f, vat_rate: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">{template === 'collection' ? 'CWT Rate' : template === 'payment' ? 'EWT Rate' : 'Tax Rate'}</label><input type="number" step="0.01" min="0" max="1" className={inputCls} value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Ref. Module</label>
                  <select className={inputCls} value={form.reference_module} onChange={e => setForm(f => ({ ...f, reference_module: e.target.value }))}>
                    <option value="">— Select —</option>
                    <option value="Accounts Receivable">Accounts Receivable</option>
                    <option value="Accounts Payable">Accounts Payable</option>
                    <option value="Sales Book">Sales Book</option>
                    <option value="Purchases Book">Purchases Book</option>
                    <option value="Cash Receipts Book">Cash Receipts</option>
                    <option value="Cash Disbursements Book">Cash Disbursements</option>
                    <option value="Payroll">Payroll</option>
                    <option value="Depreciation Schedule">Depreciation</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
                <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Ref. Number</label><input className={inputCls} value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} placeholder="e.g. INV-001" /></div>
              </div>

              <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Description</label><input className={inputCls} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Auto-set if blank" /></div>

              {/* Live Preview */}
              {previewLines && previewLines.length > 0 && (
                <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                  <div className="bg-[var(--color-surface-2)] px-3 py-2 text-[11px] font-semibold uppercase text-[var(--color-muted-fg)]">Entry Preview</div>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-[var(--color-border)]"><th className="px-3 py-1.5 text-left">Account</th><th className="px-3 py-1.5 text-right">Debit</th><th className="px-3 py-1.5 text-right">Credit</th></tr></thead>
                    <tbody>
                      {previewLines.map((l, i) => (
                        <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="px-3 py-1.5">{l.account}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{l.side === 'Dr' ? formatCurrency(l.amount) : ''}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{l.side === 'Cr' ? formatCurrency(l.amount) : ''}</td>
                        </tr>
                      ))}
                      <tr className="bg-[var(--color-surface-2)] font-semibold">
                        <td className="px-3 py-1.5">Total</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(previewLines.filter(l => l.side === 'Dr').reduce((s, l) => s + l.amount, 0))}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(previewLines.filter(l => l.side === 'Cr').reduce((s, l) => s + l.amount, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handlePost} disabled={saving || !template || gross <= 0}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Post Entry
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Account Autocomplete for Journal Lines ─────────────────────────────────
function AccountAutocomplete({ accounts, value, onChange, className }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useState(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const selected = accounts.find(a => String(a.account_id) === String(value))

  const filtered = query.trim()
    ? accounts.filter(a =>
        `${a.account_code} ${a.account_name}`.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 15)
    : accounts.slice(0, 15)

  function handleFocus(e) {
    const rect = e.target.getBoundingClientRect()
    setPos({ top: rect.bottom + 2, left: rect.left })
    setOpen(true)
    if (selected) setQuery(`${selected.account_code} - ${selected.account_name}`)
  }

  function handleBlur() {
    setTimeout(() => setOpen(false), 200)
  }

  function handleSelect(acct) {
    onChange(String(acct.account_id))
    setQuery(`${acct.account_code} - ${acct.account_name}`)
    setOpen(false)
  }

  function handleChange(e) {
    setQuery(e.target.value)
    const rect = e.target.getBoundingClientRect()
    setPos({ top: rect.bottom + 2, left: rect.left })
    setOpen(true)
    if (!e.target.value) onChange('')
  }

  return (
    <div className="relative">
      <input
        type="text"
        className={className}
        value={open ? query : (selected ? `${selected.account_code} - ${selected.account_name}` : '')}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Search account..."
      />
      {open && filtered.length > 0 && (
        <ul
          className="fixed w-72 max-h-52 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-xl z-[100]"
          style={{ top: pos.top, left: pos.left }}
        >
          {filtered.map(a => (
            <li key={a.account_id}>
              <button
                type="button"
                onMouseDown={() => handleSelect(a)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-2)] transition-colors"
              >
                <span className="font-mono text-[var(--color-primary)]">{a.account_code}</span>
                <span className="ml-1.5 text-[var(--color-text)]">{a.account_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Main Journal Entries Component ─────────────────────────────────────────
export function GLJournalEntries() {
  const { entity } = useOutletContext()
  const [entries, setEntries] = useState([])
  const [metrics, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [detailDrawer, setDetailDrawer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [accounts, setAccounts] = useState([])

  const emptyLine = { account_id: '', description: '', debit: '', credit: '' }
  const [form, setForm] = useState({ entry_date: '', description: '', reference_module: '', reference_number: '', entity: '', lines: [{ ...emptyLine }, { ...emptyLine }] })

  const { highlightId, highlightRef, rowRef } = useHighlightRow()

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (entity !== 'All') params.set('entity', entity)
      const [expandedData, metricsData] = await Promise.all([
        apiGet(`/general-ledger/journal-lines?${params}`),
        apiGet(`/general-ledger/metrics?${params}`)
      ])
      setEntries(expandedData?.rows || [])
      setMetrics(metricsData || {})
    } catch (e) { notify.error(e.message) }
    finally { setLoading(false) }
  }, [entity])

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await apiGet('/general-ledger/accounts')
      setAccounts(Array.isArray(data) ? data : data.accounts || [])
    } catch { /* Accounts are optional while drafting an entry. */ }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchEntries()
      void fetchAccounts()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchEntries, fetchAccounts])

  function openAdd() {
    setForm({ entry_date: new Date().toISOString().slice(0, 10), description: '', reference_module: '', reference_number: '', entity: entity === 'All' ? '' : entity, lines: [{ ...emptyLine }, { ...emptyLine }] })
    setDrawerOpen(true)
  }

  function updateLine(idx, field, value) {
    setForm(f => {
      const lines = [...f.lines]
      lines[idx] = { ...lines[idx], [field]: value }
      return { ...f, lines }
    })
  }

  function addLine() { setForm(f => ({ ...f, lines: [...f.lines, { ...emptyLine }] })) }
  function removeLine(idx) { setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) })) }

  const totalDebit = form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

  async function handleSave() {
    if (!form.entry_date || !form.description) { notify.error('Date and Description are required'); return }
    const lines = form.lines
      .filter(l => l.account_id && (parseFloat(l.debit) || parseFloat(l.credit)))
      .map(l => ({ account_id: Number(l.account_id), description: l.description || null, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }))
    if (lines.length < 1) { notify.error('At least 1 line required'); return }
    setSaving(true)
    try {
      await apiPost('/general-ledger/entries', { ...form, lines })
      notify.success('Journal entry created')
      setDrawerOpen(false)
      fetchEntries()
    } catch (e) { notify.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleAction() {
    if (!confirm) return
    try {
      if (confirm.action === 'post') {
        await apiPost(`/general-ledger/entries/${confirm.entry.entry_id}/post`)
        notify.success('Entry posted')
      } else if (confirm.action === 'reverse') {
        await apiPost(`/general-ledger/entries/${confirm.entry.entry_id}/reverse`)
        notify.success('Entry reversed')
      } else if (confirm.action === 'delete') {
        await apiDelete(`/general-ledger/entries/${confirm.entry.entry_id}`)
        notify.success('Entry deleted')
      }
      setConfirm(null)
      fetchEntries()
    } catch (e) { notify.error(e.message) }
  }

  async function viewDetail(entry) {
    try {
      const data = await apiGet(`/general-ledger/entries/${entry.entry_id}`)
      setDetailDrawer(data)
    } catch (e) { notify.error(e.message) }
  }

  const filteredEntries = search.trim()
    ? entries.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(search.toLowerCase())))
    : entries

  return (
    <div className="space-y-4">
      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="Total Entries" value={metrics.total_entries ?? entries.length} />
        <MetricCard label="Posted" value={metrics.posted_entries ?? 0} color="text-emerald-600" />
        <MetricCard label="Draft" value={metrics.draft_entries ?? 0} color="text-amber-600" />
        <MetricCard label="Total Accounts" value={metrics.total_accounts ?? 0} />
        <MetricCard label="Posted Value" value={formatCurrency(metrics.total_posted_value)} color="text-[var(--color-primary)]" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className={cn(inputCls, 'w-52 pl-8')} />
          </div>
          <select className={cn(inputCls, 'w-44')} onChange={e => { const params = new URLSearchParams(); if (entity !== 'All') params.set('entity', entity); if (e.target.value && e.target.value !== 'All') params.set('source_filter', e.target.value); fetchEntries() }} defaultValue="All">
            <option value="All">All Sources</option>
            <option value="Sales Book">Sales Book</option>
            <option value="Cash Receipts Book">Cash Receipts</option>
            <option value="Purchases Book">Purchases Book</option>
            <option value="Cash Disbursements Book">Cash Disbursements</option>
            <option value="Manual">Manual Entries</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { const params = new URLSearchParams(); if (entity !== 'All') params.set('entity', entity); apiDownload(`/general-ledger/books/general-journal/export/csv?${params}`, `general_journal.xlsx`) }}><Download size={14} /> Export</Button>
          <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)}><BookOpen size={14} /> Quick Post</Button>
          <Button size="sm" onClick={openAdd}><Plus size={14} /> New Entry</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--color-primary)]" size={28} /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr>
                {['Date', 'JV No.', 'Reference / Source Doc', 'Account Code', 'Account Title', 'Description / Explanation', 'Debit', 'Credit', 'Prepared By', 'Reviewed By', 'Posting Status', 'Remarks'].map(h => (
                  <th key={h} className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide px-3 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredEntries.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8 text-sm text-[var(--color-muted-fg)]">No journal entries found</td></tr>
              ) : filteredEntries.map((e, idx) => {
                const isHighlighted = (highlightId && String(e.entry_id) === highlightId) || (highlightRef && e.entry_number === highlightRef)
                // Alternate background for grouped JV entries
                const prevJv = idx > 0 ? entries[idx - 1].entry_number : null
                const isNewGroup = e.entry_number !== prevJv
                const groupIdx = entries.slice(0, idx + 1).filter((_, i) => i === 0 || entries[i].entry_number !== entries[i - 1].entry_number).length
                const groupBg = groupIdx % 2 === 0 ? 'bg-slate-50/50' : ''
                return (
                <tr key={`${e.entry_id}-${idx}`} ref={isHighlighted ? rowRef : null} className={cn('transition-colors cursor-pointer hover:bg-[var(--color-primary)]/5', groupBg, isHighlighted && highlightRowCls, isNewGroup && idx > 0 && 'border-t-2 border-[var(--color-border)]')} onClick={() => viewDetail(e)}>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{isNewGroup ? e.entry_date : ''}</td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold">{isNewGroup ? e.jv_number : ''}</td>
                  <td className="px-3 py-2 text-xs" onClick={ev => ev.stopPropagation()}>
                    {isNewGroup && e.reference_module ? <SourceLink sourceModule={e.reference_module} sourceId={e.entry_id} refNumber={e.reference_number}>{e.source_document || e.reference_module}</SourceLink> : (isNewGroup ? (e.source_document || '—') : '')}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{e.account_code || '—'}</td>
                  <td className="px-3 py-2 text-xs">{e.account_name || '—'}</td>
                  <td className="px-3 py-2 text-xs max-w-[180px] truncate">{e.description || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-right">{e.debit ? formatCurrency(e.debit) : ''}</td>
                  <td className="px-3 py-2 font-mono text-xs text-right">{e.credit ? formatCurrency(e.credit) : ''}</td>
                  <td className="px-3 py-2 text-xs">{isNewGroup ? (e.prepared_by || '—') : ''}</td>
                  <td className="px-3 py-2 text-xs">{isNewGroup ? (e.reviewed_by || '—') : ''}</td>
                  <td className="px-3 py-2 text-xs">{isNewGroup ? (
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', e.posting_status === 'Posted' ? 'bg-emerald-100 text-emerald-700' : e.posting_status === 'Draft' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>{e.posting_status || 'For Review'}</span>
                  ) : ''}</td>
                  <td className="px-3 py-2 text-xs max-w-[100px] truncate">{isNewGroup ? (e.remarks || '—') : ''}</td>
                </tr>
                )
              })}
              {/* TOTAL / CHECK row */}
              {entries.length > 0 && (
                <tr className="bg-[var(--color-surface-2)] font-semibold border-t-2 border-[var(--color-border)]">
                  <td className="px-3 py-2.5" colSpan={6}>TOTAL / CHECK</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(entries.reduce((s, r) => s + (r.debit || 0), 0))}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(entries.reduce((s, r) => s + (r.credit || 0), 0))}</td>
                  <td className="px-3 py-2.5" colSpan={4}>
                    {Math.abs(entries.reduce((s, r) => s + (r.debit || 0), 0) - entries.reduce((s, r) => s + (r.credit || 0), 0)) < 0.01 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle size={12} /> Balanced</span>
                    ) : (
                      <span className="text-[var(--color-danger)] text-xs">⚠ Unbalanced</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Entry Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="New Journal Entry">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Date {reqMark}</label>
              <input type="date" className={inputCls} value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Entity</label>
              <select className={inputCls} value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}>
                <option value="">— Select —</option>
                {ENTITIES.filter(e => e.value !== 'All').map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-fg)]">Description {reqMark}</label>
            <input className={inputCls} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Journal entry description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Reference Module</label>
              <select className={inputCls} value={form.reference_module} onChange={e => setForm(f => ({ ...f, reference_module: e.target.value, reference_number: '' }))}>
                <option value="">— Select Source —</option>
                <option value="Accounts Receivable">Accounts Receivable</option>
                <option value="Accounts Payable">Accounts Payable</option>
                <option value="Sales Book">Sales Book</option>
                <option value="Purchases Book">Purchases Book</option>
                <option value="Cash Receipts Book">Cash Receipts Book</option>
                <option value="Cash Disbursements Book">Cash Disbursements Book</option>
                <option value="Payroll">Payroll</option>
                <option value="Depreciation Schedule">Depreciation Schedule</option>
                <option value="Tax Adjustment">Tax Adjustment</option>
                <option value="Manual">Manual / Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Reference Number</label>
              <RefAutocomplete module={form.reference_module} entity={form.entity} value={form.reference_number} onChange={v => setForm(f => ({ ...f, reference_number: v }))} placeholder={form.reference_module === 'Accounts Receivable' ? 'e.g. EXP-2026-INV-0001' : form.reference_module === 'Accounts Payable' ? 'e.g. EXP-2026-BIL-0001' : form.reference_module === 'Payroll' ? 'e.g. Payroll Run #1' : 'e.g. DEP-2026-001'} />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[var(--color-text)] uppercase">Journal Lines</label>
              <button onClick={addLine} className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><PlusCircle size={13} /> Add Line</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-visible">
              {form.lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_80px_80px_28px] gap-1.5 items-start">
                  <AccountAutocomplete accounts={accounts} value={line.account_id} onChange={v => updateLine(idx, 'account_id', v)} className={cn(inputCls, 'text-xs py-1.5')} />
                  <input className={cn(inputCls, 'text-xs py-1.5')} placeholder="Desc" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} />
                  <input type="number" className={cn(inputCls, 'text-xs py-1.5')} placeholder="Debit" value={line.debit} onChange={e => { updateLine(idx, 'debit', e.target.value); if (e.target.value) updateLine(idx, 'credit', '') }} />
                  <input type="number" className={cn(inputCls, 'text-xs py-1.5')} placeholder="Credit" value={line.credit} onChange={e => { updateLine(idx, 'credit', e.target.value); if (e.target.value) updateLine(idx, 'debit', '') }} />
                  <button onClick={() => removeLine(idx)} className="p-1 mt-0.5 rounded hover:bg-red-50 text-[var(--color-danger)]"><MinusCircle size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 px-1 text-xs font-medium">
              <span className="text-[var(--color-muted-fg)]">Total Debit: <span className="text-[var(--color-text)]">{formatCurrency(totalDebit)}</span></span>
              <span className="text-[var(--color-muted-fg)]">Total Credit: <span className="text-[var(--color-text)]">{formatCurrency(totalCredit)}</span></span>
              <span className={isBalanced ? 'text-emerald-600' : 'text-[var(--color-danger)]'}>{isBalanced ? '✓ Balanced' : '✗ Unbalanced'}</span>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Create Entry
            </Button>
          </div>
        </div>
      </Drawer>

      {/* Review Modal */}
      <Drawer open={!!detailDrawer} onClose={() => setDetailDrawer(null)} title={`Review: ${detailDrawer?.entry_number || ''}`}>
        {detailDrawer && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="grid grid-cols-3 gap-3 text-sm rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">JV Number</span><span className="font-mono font-semibold">{detailDrawer.entry_number}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Date</span><span className="font-medium">{detailDrawer.entry_date}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Entity</span><span className="font-medium">{detailDrawer.entity || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Source</span><SourceLink sourceModule={detailDrawer.reference_module} sourceId={detailDrawer.entry_id} refNumber={detailDrawer.reference_number}>{detailDrawer.reference_module || 'Manual'}</SourceLink></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Reference</span><span className="font-mono text-xs">{detailDrawer.reference_number || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Status</span><StatusBadge status={detailDrawer.posting_status || detailDrawer.status} /></div>
            </div>

            {/* Description */}
            <p className="text-sm text-[var(--color-text)] bg-slate-50 rounded-lg p-3 border border-slate-100">{detailDrawer.description || '—'}</p>

            {/* Journal Lines */}
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface-2)]">
                  <tr>
                    <th className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase px-3 py-2 text-left">Account Code</th>
                    <th className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase px-3 py-2 text-left">Account Name</th>
                    <th className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase px-3 py-2 text-left">Description</th>
                    <th className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase px-3 py-2 text-right">Debit</th>
                    <th className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {(detailDrawer.lines || []).map((l, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono">{l.account_code || '—'}</td>
                      <td className="px-3 py-2">{l.account_name || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{l.description || '—'}</td>
                      <td className="px-3 py-2 font-mono text-right">{l.debit ? formatCurrency(l.debit) : ''}</td>
                      <td className="px-3 py-2 font-mono text-right">{l.credit ? formatCurrency(l.credit) : ''}</td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--color-surface-2)] font-semibold">
                    <td className="px-3 py-2" colSpan={3}>TOTAL</td>
                    <td className="px-3 py-2 font-mono text-right">{formatCurrency((detailDrawer.lines || []).reduce((s, l) => s + (parseFloat(l.debit) || 0), 0))}</td>
                    <td className="px-3 py-2 font-mono text-right">{formatCurrency((detailDrawer.lines || []).reduce((s, l) => s + (parseFloat(l.credit) || 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Balance check */}
            {(() => {
              const td = (detailDrawer.lines || []).reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
              const tc = (detailDrawer.lines || []).reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
              const bal = Math.abs(td - tc) < 0.01
              return <div className={cn('text-xs font-semibold px-3 py-1.5 rounded-lg text-center', bal ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>{bal ? '✓ Balanced — Debits equal Credits' : `✗ Unbalanced — Difference: ${formatCurrency(Math.abs(td - tc))}`}</div>
            })()}

            {/* Prepared / Reviewed info */}
            <div className="grid grid-cols-2 gap-3 text-xs border border-[var(--color-border)] rounded-lg p-3">
              <div><span className="text-[var(--color-muted-fg)]">Prepared By:</span> <span className="font-medium">{detailDrawer.prepared_by || detailDrawer.posted_by || '—'}</span></div>
              <div><span className="text-[var(--color-muted-fg)]">Reviewed By:</span> <span className="font-medium">{detailDrawer.reviewed_by || '—'}</span></div>
            </div>

            {/* Remarks section */}
            <div>
              <label className="text-xs font-semibold text-[var(--color-muted-fg)] uppercase block mb-1">Remarks</label>
              <textarea
                className={cn(inputCls, 'h-20 resize-none')}
                defaultValue={detailDrawer.remarks || ''}
                placeholder="Add review notes, comments, or observations..."
                onBlur={async (e) => {
                  const val = e.target.value.trim()
                  if (val !== (detailDrawer.remarks || '')) {
                    try {
                      const res = await fetch(`${import.meta.env.VITE_API_URL}/general-ledger/entries/${detailDrawer.entry_id}/remarks`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('access_token') ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` } : {}) },
                        body: JSON.stringify({ remarks: val })
                      })
                      if (res.ok) { setDetailDrawer(prev => ({ ...prev, remarks: val })); notify.success('Remarks saved') }
                    } catch {}
                  }
                }}
              />
            </div>

            {/* Action buttons */}
            {detailDrawer.status !== 'Posted' && detailDrawer.status !== 'Reversed' && (
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={async () => {
                  const reason = prompt('Rejection reason (optional):')
                  try {
                    await apiPost(`/general-ledger/entries/${detailDrawer.entry_id}/reject`, { remarks: reason || '' })
                    notify.success('Entry rejected')
                    setDetailDrawer(null)
                    fetchEntries()
                  } catch (e) { notify.error(e.message) }
                }}>Reject</Button>
                <div className="flex-1" />
                {!detailDrawer.reviewed_by && (
                  <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={async () => {
                    try {
                      await apiPost(`/general-ledger/entries/${detailDrawer.entry_id}/review`)
                      notify.success('Entry marked as reviewed')
                      setDetailDrawer(null)
                      fetchEntries()
                    } catch (e) { notify.error(e.message) }
                  }}>Mark as Reviewed</Button>
                )}
                <Button size="sm" onClick={async () => {
                  try {
                    await apiPost(`/general-ledger/entries/${detailDrawer.entry_id}/post`)
                    notify.success('Entry posted to GL')
                    setDetailDrawer(null)
                    fetchEntries()
                  } catch (e) { notify.error(e.message) }
                }}>Post to GL</Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.action === 'post' ? 'Post Entry' : confirm?.action === 'reverse' ? 'Reverse Entry' : 'Delete Entry'}
        message={confirm?.action === 'post' ? 'Post this journal entry? This cannot be undone.' : confirm?.action === 'reverse' ? 'Reverse this posted entry?' : 'Delete this draft entry?'}
        onConfirm={handleAction}
        onCancel={() => setConfirm(null)}
      />

      {/* Template Quick Post Drawer */}
      <TemplatePostDrawer open={templateOpen} onClose={() => setTemplateOpen(false)} entity={entity} onPosted={fetchEntries} />
    </div>
  )
}
