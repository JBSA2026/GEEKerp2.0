import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Plus, Loader2, Trash2, CheckCircle, Eye, Download, ArrowRight, Search } from 'lucide-react'
import {
  ENTITIES, inputCls, reqMark,
  apiGet, apiPost, apiDelete, apiDownload,
  MetricCard, formatCurrency, Drawer, ConfirmDialog, SourceLink,
  useHighlightRow, highlightRowCls,
} from './glUtils'

const VAT_TYPES = ['VATable', 'VAT-Exempt', 'Zero-Rated']

export function GLPurchasesBook() {
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
    entity: '', purchase_date: new Date().toISOString().slice(0, 10),
    supplier_invoice_or_no: '', supplier_name: '', tin: '',
    description_of_purchase: '', vat_type: 'VATable',
    purchase_amount: '', input_vat: '', total_invoice_amount: '',
    cash_or_ap: 'Accounts Payable', payment_status: 'Unpaid',
    expense_asset_account: '', account_code: '', remarks: '',
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
      const data = await apiGet(`/general-ledger/books/purchases?${params}`)
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
    if (!form.entity || !form.purchase_date) { notify.error('Entity and Date are required'); return }
    setSaving(true)
    try {
      const body = { ...form, purchase_amount: parseFloat(form.purchase_amount) || 0, input_vat: parseFloat(form.input_vat) || 0, total_invoice_amount: parseFloat(form.total_invoice_amount) || 0 }
      await apiPost('/general-ledger/books/purchases', body)
      notify.success('Purchase book entry created')
      setDrawerOpen(false)
      fetchEntries()
    } catch (e) { notify.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleAction() {
    if (!confirm) return
    try {
      if (confirm.action === 'post') {
        await apiPost(`/general-ledger/books/purchases/${confirm.entry.purchase_book_id}/post`)
        notify.success('Purchase posted to GL')
      } else if (confirm.action === 'delete') {
        await apiDelete(`/general-ledger/books/purchases/${confirm.entry.purchase_book_id}`)
        notify.success('Purchase deleted')
      }
      setConfirm(null)
      fetchEntries()
    } catch (e) { notify.error(e.message) }
  }

  const totalPurchases = entries.reduce((s, e) => s + (parseFloat(e.total_invoice_amount) || 0), 0)
  const totalVat = entries.reduce((s, e) => s + (parseFloat(e.input_vat) || 0), 0)

  const filteredEntries = search.trim()
    ? entries.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(search.toLowerCase())))
    : entries

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Purchases" value={entries.length} />
        <MetricCard label="Purchase Amount" value={formatCurrency(totalPurchases)} color="text-amber-600" />
        <MetricCard label="Input VAT" value={formatCurrency(totalVat)} color="text-blue-600" />
        <MetricCard label="Posted" value={entries.filter(e => e.posting_status === 'Posted').length} color="text-[var(--color-primary)]" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className={cn(inputCls, 'w-52 pl-8')} />
          </div>
          <input type="date" className={cn(inputCls, 'w-36')} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <input type="date" className={cn(inputCls, 'w-36')} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { const params = new URLSearchParams(); if (entity !== 'All') params.set('entity', entity); if (dateFrom) params.set('date_from', dateFrom); if (dateTo) params.set('date_to', dateTo); apiDownload(`/general-ledger/books/purchases/export/csv?${params}`, `purchases_book.xlsx`) }}><Download size={14} /> Export</Button>
          <Button size="sm" onClick={openAdd}><Plus size={14} /> New Purchase</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--color-primary)]" size={28} /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr>
                {['Date', 'Supplier Invoice/OR No.', 'Supplier Name', 'TIN', 'Description of Purchase', 'VAT Type', 'Purchase Amount', 'Input VAT', 'Total Invoice Amount', 'Cash/AP', 'Payment Status', 'Expense/Asset Account', 'Remarks'].map(h => (
                  <th key={h} className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide px-3 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredEntries.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-sm text-[var(--color-muted-fg)]">No purchases found</td></tr>
              ) : filteredEntries.map(e => {
                const isHighlighted = (highlightId && String(e.purchase_book_id) === highlightId) || (highlightRef && e.supplier_invoice_or_no === highlightRef)
                return (
                <tr key={e.purchase_book_id} ref={isHighlighted ? rowRef : null} className={cn('hover:bg-[var(--color-primary)]/5 transition-colors cursor-pointer', isHighlighted && highlightRowCls)} onClick={() => setDetailDrawer(e)}>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">{e.purchase_date}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold">{e.supplier_invoice_or_no || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[120px] truncate">{e.supplier_name || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.tin || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[150px] truncate">{e.description_of_purchase || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.vat_type}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.purchase_amount)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.input_vat)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.total_invoice_amount)}</td>
                  <td className="px-3 py-2.5 text-xs">{e.cash_or_ap}</td>
                  <td className="px-3 py-2.5 text-xs">{e.payment_status}</td>
                  <td className="px-3 py-2.5 text-xs">{e.expense_asset_account || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[100px] truncate">{e.remarks || '—'}</td>
                </tr>
                )
              })}
              {/* TOTAL / CHECK row */}
              {entries.length > 0 && (
                <tr className="bg-[var(--color-surface-2)] font-semibold border-t-2 border-[var(--color-border)]">
                  <td className="px-3 py-2.5" colSpan={6}>TOTAL / CHECK</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(entries.reduce((s, e) => s + (parseFloat(e.purchase_amount) || 0), 0))}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totalVat)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totalPurchases)}</td>
                  <td className="px-3 py-2.5" colSpan={4}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="New Purchases Book Entry">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Date {reqMark}</label><input type="date" className={inputCls} value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Entity {reqMark}</label><select className={inputCls} value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}><option value="">Select</option>{ENTITIES.filter(e => e.value !== 'All').map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Supplier Invoice/OR No.</label><input className={inputCls} value={form.supplier_invoice_or_no} onChange={e => setForm(f => ({ ...f, supplier_invoice_or_no: e.target.value }))} placeholder="INV-12345" /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Supplier Name</label><input className={inputCls} value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">TIN</label><input className={inputCls} value={form.tin} onChange={e => setForm(f => ({ ...f, tin: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">VAT Type</label><select className={inputCls} value={form.vat_type} onChange={e => setForm(f => ({ ...f, vat_type: e.target.value }))}>{VAT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Description of Purchase</label><input className={inputCls} value={form.description_of_purchase} onChange={e => setForm(f => ({ ...f, description_of_purchase: e.target.value }))} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Purchase Amount (₱)</label><input type="number" step="0.01" className={inputCls} value={form.purchase_amount} onChange={e => setForm(f => ({ ...f, purchase_amount: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Input VAT (₱)</label><input type="number" step="0.01" className={inputCls} value={form.input_vat} onChange={e => setForm(f => ({ ...f, input_vat: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Total Amount (₱)</label><input type="number" step="0.01" className={inputCls} value={form.total_invoice_amount} onChange={e => setForm(f => ({ ...f, total_invoice_amount: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Cash / AP</label><select className={inputCls} value={form.cash_or_ap} onChange={e => setForm(f => ({ ...f, cash_or_ap: e.target.value }))}><option value="Accounts Payable">Accounts Payable</option><option value="Cash">Cash</option></select></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Payment Status</label><select className={inputCls} value={form.payment_status} onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))}><option value="Unpaid">Unpaid</option><option value="Partially Paid">Partially Paid</option><option value="Paid">Paid</option></select></div>
          </div>
          <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Expense/Asset Account</label><input className={inputCls} value={form.expense_asset_account} onChange={e => setForm(f => ({ ...f, expense_asset_account: e.target.value }))} placeholder="Office Supplies" /></div>
          <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Remarks</label><input className={inputCls} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Create</Button>
          </div>
        </div>
      </Drawer>

      <Drawer open={!!detailDrawer} onClose={() => setDetailDrawer(null)} title={`Purchase: ${detailDrawer?.supplier_invoice_or_no || ''}`}>
        {detailDrawer && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Date</span><span className="font-medium">{detailDrawer.purchase_date}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Entity</span><span className="font-medium">{detailDrawer.entity}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Supplier Invoice</span><span className="font-mono font-semibold">{detailDrawer.supplier_invoice_or_no || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Supplier</span><span className="font-medium">{detailDrawer.supplier_name || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">TIN</span><span>{detailDrawer.tin || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">VAT Type</span><span>{detailDrawer.vat_type}</span></div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Purchase Amount</span><span className="font-mono">{formatCurrency(detailDrawer.purchase_amount)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Input VAT</span><span className="font-mono">{formatCurrency(detailDrawer.input_vat)}</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold"><span>Total Invoice Amount</span><span className="font-mono">{formatCurrency(detailDrawer.total_invoice_amount)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-[var(--color-muted-fg)]">Cash/AP:</span> {detailDrawer.cash_or_ap}</div>
              <div><span className="text-[var(--color-muted-fg)]">Payment Status:</span> {detailDrawer.payment_status}</div>
            </div>
            {detailDrawer.source_module && (
              <div className="rounded-lg border border-amber-100 bg-amber-50/30 p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Source</span>
                  <span className="font-mono font-semibold text-sm">{detailDrawer.supplier_invoice_or_no}</span>
                </div>
                <a href={`/accounts-payable/bills?highlight=${detailDrawer.source_id}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] rounded-lg hover:opacity-90">
                  View Bill <ArrowRight aria-hidden="true" size={12} strokeWidth={2} />
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

      <ConfirmDialog open={!!confirm} title={confirm?.action === 'post' ? 'Post Purchase' : 'Delete Purchase'} message={confirm?.action === 'post' ? 'Post this purchase to the General Ledger?' : 'Delete this entry?'} onConfirm={handleAction} onCancel={() => setConfirm(null)} />
    </div>
  )
}
