import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Plus, Loader2, Trash2, CheckCircle, Eye, X, Download, ArrowRight, Search } from 'lucide-react'
import {
  ENTITIES, inputCls, reqMark,
  apiGet, apiPost, apiPatch, apiDelete, apiDownload,
  MetricCard, formatCurrency, Drawer, ConfirmDialog, SourceLink,
  useHighlightRow, highlightRowCls,
} from './glUtils'

const RECEIPT_MODES = ['Cash', 'Check', 'Bank Transfer', 'Online Payment', 'Others']

export function GLCashReceipts() {
  const { entity } = useOutletContext()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailDrawer, setDetailDrawer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const emptyForm = {
    entity: '', receipt_date: new Date().toISOString().slice(0, 10),
    or_ar_ref_no: '', customer_source: '', tin: '', description: '',
    receipt_mode: '', bank_cash_account: '', gross_receipt_amount: '',
    output_vat: '', ewt_withholding_tax: '', net_amount_deposited: '',
    invoice_ref: '', account_code: '', remarks: '',
  }
  const [form, setForm] = useState(emptyForm)

  const { highlightId, highlightRef, rowRef } = useHighlightRow()

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (entity !== 'All') params.set('entity', entity)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      const data = await apiGet(`/general-ledger/books/cash-receipts?${params}`)
      setEntries(Array.isArray(data) ? data : [])
    } catch (e) { notify.error(e.message) }
    finally { setLoading(false) }
  }, [entity, dateFrom, dateTo])

  useEffect(() => { void fetchEntries() }, [fetchEntries])

  function openAdd() {
    setForm({ ...emptyForm, entity: entity === 'All' ? '' : entity })
    setDrawerOpen(true)
  }

  async function handleSave() {
    if (!form.entity || !form.receipt_date) { notify.error('Entity and Date are required'); return }
    setSaving(true)
    try {
      const body = { ...form, gross_receipt_amount: parseFloat(form.gross_receipt_amount) || 0, output_vat: parseFloat(form.output_vat) || 0, ewt_withholding_tax: parseFloat(form.ewt_withholding_tax) || 0, net_amount_deposited: parseFloat(form.net_amount_deposited) || 0 }
      await apiPost('/general-ledger/books/cash-receipts', body)
      notify.success('Cash receipt created')
      setDrawerOpen(false)
      fetchEntries()
    } catch (e) { notify.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleAction() {
    if (!confirm) return
    try {
      if (confirm.action === 'post') {
        await apiPost(`/general-ledger/books/cash-receipts/${confirm.entry.receipt_id}/post`)
        notify.success('Receipt posted to GL')
      } else if (confirm.action === 'delete') {
        await apiDelete(`/general-ledger/books/cash-receipts/${confirm.entry.receipt_id}`)
        notify.success('Receipt deleted')
      }
      setConfirm(null)
      fetchEntries()
    } catch (e) { notify.error(e.message) }
  }

  const totalGross = entries.reduce((s, e) => s + (parseFloat(e.gross_receipt_amount) || 0), 0)
  const totalVat = entries.reduce((s, e) => s + (parseFloat(e.output_vat) || 0), 0)

  const filteredEntries = search.trim()
    ? entries.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(search.toLowerCase())))
    : entries

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Receipts" value={entries.length} />
        <MetricCard label="Gross Amount" value={formatCurrency(totalGross)} color="text-emerald-600" />
        <MetricCard label="Output VAT" value={formatCurrency(totalVat)} color="text-blue-600" />
        <MetricCard label="Posted" value={entries.filter(e => e.posting_status === 'Posted').length} color="text-[var(--color-primary)]" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className={cn(inputCls, 'w-52 pl-8')} />
          </div>
          <input type="date" className={cn(inputCls, 'w-36')} value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
          <input type="date" className={cn(inputCls, 'w-36')} value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { const params = new URLSearchParams(); if (entity !== 'All') params.set('entity', entity); if (dateFrom) params.set('date_from', dateFrom); if (dateTo) params.set('date_to', dateTo); apiDownload(`/general-ledger/books/cash-receipts/export/csv?${params}`, `cash_receipts_book.xlsx`) }}><Download size={14} /> Export</Button>
          <Button size="sm" onClick={openAdd}><Plus size={14} /> New Receipt</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--color-primary)]" size={28} /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr>
                {['Date', 'OR/AR/Ref No.', 'Customer/Source', 'TIN', 'Description', 'Receipt Mode', 'Bank/Cash Account', 'Gross Receipt', 'Output VAT', 'EWT', 'Net Deposited', 'Invoice Ref.', 'Remarks'].map(h => (
                  <th key={h} className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide px-3 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredEntries.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-sm text-[var(--color-muted-fg)]">No cash receipts found</td></tr>
              ) : filteredEntries.map(e => {
                const isHighlighted = (highlightId && String(e.receipt_id) === highlightId) || (highlightRef && (e.or_ar_ref_no === highlightRef || e.invoice_ref === highlightRef))
                return (
                <tr key={e.receipt_id} ref={isHighlighted ? rowRef : null} className={cn('hover:bg-[var(--color-primary)]/5 transition-colors cursor-pointer', isHighlighted && highlightRowCls)} onClick={() => setDetailDrawer(e)}>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">{e.receipt_date}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold">{e.or_ar_ref_no || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[120px] truncate">{e.customer_source || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.tin || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[150px] truncate">{e.description || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.receipt_mode || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.bank_cash_account || '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.gross_receipt_amount)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.output_vat)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.ewt_withholding_tax)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.net_amount_deposited)}</td>
                  <td className="px-3 py-2.5 text-xs">{e.invoice_ref || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[100px] truncate">{e.remarks || '—'}</td>
                </tr>
                )
              })}
              {/* TOTAL / CHECK row */}
              {entries.length > 0 && (
                <tr className="bg-[var(--color-surface-2)] font-semibold border-t-2 border-[var(--color-border)]">
                  <td className="px-3 py-2.5" colSpan={7}>TOTAL / CHECK</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totalGross)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totalVat)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(entries.reduce((s, e) => s + (parseFloat(e.ewt_withholding_tax) || 0), 0))}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(entries.reduce((s, e) => s + (parseFloat(e.net_amount_deposited) || 0), 0))}</td>
                  <td className="px-3 py-2.5" colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="New Cash Receipt">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Date {reqMark}</label><input type="date" className={inputCls} value={form.receipt_date} onChange={e => setForm(f => ({ ...f, receipt_date: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Entity {reqMark}</label><select className={inputCls} value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}><option value="">Select</option>{ENTITIES.filter(e => e.value !== 'All').map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">OR/AR Ref No.</label><input className={inputCls} value={form.or_ar_ref_no} onChange={e => setForm(f => ({ ...f, or_ar_ref_no: e.target.value }))} placeholder="OR-0001" /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Customer/Source</label><input className={inputCls} value={form.customer_source} onChange={e => setForm(f => ({ ...f, customer_source: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">TIN</label><input className={inputCls} value={form.tin} onChange={e => setForm(f => ({ ...f, tin: e.target.value }))} placeholder="123-456-789-000" /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Receipt Mode</label><select className={inputCls} value={form.receipt_mode} onChange={e => setForm(f => ({ ...f, receipt_mode: e.target.value }))}><option value="">Select</option>{RECEIPT_MODES.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
          </div>
          <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Description</label><input className={inputCls} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Bank/Cash Account</label><input className={inputCls} value={form.bank_cash_account} onChange={e => setForm(f => ({ ...f, bank_cash_account: e.target.value }))} placeholder="BPI Current" /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Invoice Ref</label><input className={inputCls} value={form.invoice_ref} onChange={e => setForm(f => ({ ...f, invoice_ref: e.target.value }))} placeholder="SI-0001" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Gross Receipt Amount (₱)</label><input type="number" step="0.01" className={inputCls} value={form.gross_receipt_amount} onChange={e => setForm(f => ({ ...f, gross_receipt_amount: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Output VAT (₱)</label><input type="number" step="0.01" className={inputCls} value={form.output_vat} onChange={e => setForm(f => ({ ...f, output_vat: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">EWT/Withholding Tax (₱)</label><input type="number" step="0.01" className={inputCls} value={form.ewt_withholding_tax} onChange={e => setForm(f => ({ ...f, ewt_withholding_tax: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Net Amount Deposited (₱)</label><input type="number" step="0.01" className={inputCls} value={form.net_amount_deposited} onChange={e => setForm(f => ({ ...f, net_amount_deposited: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Remarks</label><input className={inputCls} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Create</Button>
          </div>
        </div>
      </Drawer>

      {/* Detail Modal */}
      <Drawer open={!!detailDrawer} onClose={() => setDetailDrawer(null)} title={`Cash Receipt: ${detailDrawer?.or_ar_ref_no || detailDrawer?.receipt_id || ''}`}>
        {detailDrawer && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Date</span><span className="font-medium">{detailDrawer.receipt_date}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Entity</span><span className="font-medium">{detailDrawer.entity}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">OR/Ref No.</span><span className="font-mono font-semibold">{detailDrawer.or_ar_ref_no || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Customer</span><span className="font-medium">{detailDrawer.customer_source || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">TIN</span><span>{detailDrawer.tin || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Receipt Mode</span><span>{detailDrawer.receipt_mode || '—'}</span></div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Gross Receipt Amount</span><span className="font-mono font-semibold">{formatCurrency(detailDrawer.gross_receipt_amount)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Output VAT</span><span className="font-mono">{formatCurrency(detailDrawer.output_vat)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">EWT/Withholding Tax</span><span className="font-mono">{formatCurrency(detailDrawer.ewt_withholding_tax)}</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold"><span>Net Amount Deposited</span><span className="font-mono">{formatCurrency(detailDrawer.net_amount_deposited)}</span></div>
            </div>
            {detailDrawer.invoice_ref && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Source Invoice</span>
                  <span className="font-mono font-semibold text-sm">{detailDrawer.invoice_ref}</span>
                </div>
                <a href={`/accounts-receivable/invoices?ref=${encodeURIComponent(detailDrawer.invoice_ref)}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] rounded-lg hover:opacity-90">
                  View Invoice <ArrowRight aria-hidden="true" size={12} strokeWidth={2} />
                </a>
              </div>
            )}
            {detailDrawer.remarks && <p className="text-xs text-[var(--color-muted-fg)] bg-slate-50 p-2 rounded">Remarks: {detailDrawer.remarks}</p>}
            {detailDrawer.posting_status !== 'Posted' && (
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setConfirm({ action: 'delete', entry: detailDrawer }); setDetailDrawer(null) }}>Delete</Button>
                <div className="flex-1" />
                <Button size="sm" onClick={() => { setConfirm({ action: 'post', entry: detailDrawer }); setDetailDrawer(null) }}>Post to GL</Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog open={!!confirm} title={confirm?.action === 'post' ? 'Post Receipt' : 'Delete Receipt'} message={confirm?.action === 'post' ? 'Post this receipt to the General Ledger?' : 'Delete this receipt?'} onConfirm={handleAction} onCancel={() => setConfirm(null)} />
    </div>
  )
}
