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

export function GLSalesBook() {
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
    entity: '', sales_date: new Date().toISOString().slice(0, 10),
    sales_invoice_no: '', customer_name: '', tin: '',
    description_of_goods_services: '', vat_type: 'VATable',
    vatable_sales: '', vat_exempt_sales: '', zero_rated_sales: '',
    output_vat: '', total_invoice_amount: '',
    cash_or_ar: 'Accounts Receivable', collection_status: 'Unpaid',
    account_code: '', remarks: '',
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
      const data = await apiGet(`/general-ledger/books/sales?${params}`)
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
    if (!form.entity || !form.sales_date) { notify.error('Entity and Date are required'); return }
    setSaving(true)
    try {
      const body = { ...form, vatable_sales: parseFloat(form.vatable_sales) || 0, vat_exempt_sales: parseFloat(form.vat_exempt_sales) || 0, zero_rated_sales: parseFloat(form.zero_rated_sales) || 0, output_vat: parseFloat(form.output_vat) || 0, total_invoice_amount: parseFloat(form.total_invoice_amount) || 0 }
      await apiPost('/general-ledger/books/sales', body)
      notify.success('Sales book entry created')
      setDrawerOpen(false)
      fetchEntries()
    } catch (e) { notify.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleAction() {
    if (!confirm) return
    try {
      if (confirm.action === 'post') {
        await apiPost(`/general-ledger/books/sales/${confirm.entry.sales_book_id}/post`)
        notify.success('Sales entry posted to GL')
      } else if (confirm.action === 'delete') {
        await apiDelete(`/general-ledger/books/sales/${confirm.entry.sales_book_id}`)
        notify.success('Sales entry deleted')
      }
      setConfirm(null)
      fetchEntries()
    } catch (e) { notify.error(e.message) }
  }

  const totalSales = entries.reduce((s, e) => s + (parseFloat(e.total_invoice_amount) || 0), 0)
  const totalVat = entries.reduce((s, e) => s + (parseFloat(e.output_vat) || 0), 0)

  const filteredEntries = search.trim()
    ? entries.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(search.toLowerCase())))
    : entries

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Invoices" value={entries.length} />
        <MetricCard label="Total Sales" value={formatCurrency(totalSales)} color="text-emerald-600" />
        <MetricCard label="Output VAT" value={formatCurrency(totalVat)} color="text-blue-600" />
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
          <Button variant="outline" size="sm" onClick={() => { const params = new URLSearchParams(); if (entity !== 'All') params.set('entity', entity); if (dateFrom) params.set('date_from', dateFrom); if (dateTo) params.set('date_to', dateTo); apiDownload(`/general-ledger/books/sales/export/csv?${params}`, `sales_book.xlsx`) }}><Download size={14} /> Export</Button>
          <Button size="sm" onClick={openAdd}><Plus size={14} /> New Sale</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--color-primary)]" size={28} /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr>
                {['Date', 'Sales Invoice No.', 'Customer Name', 'TIN', 'Description of Goods/Services', 'VAT Type', 'Vatable Sales', 'VAT-Exempt Sales', 'Zero-Rated Sales', 'Output VAT', 'Total Invoice Amount', 'Cash/AR', 'Collection Status', 'Remarks'].map(h => (
                  <th key={h} className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide px-3 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredEntries.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-sm text-[var(--color-muted-fg)]">No sales book entries found</td></tr>
              ) : filteredEntries.map(e => {
                const isHighlighted = (highlightId && String(e.sales_book_id) === highlightId) || (highlightRef && e.sales_invoice_no === highlightRef)
                return (
                <tr key={e.sales_book_id} ref={isHighlighted ? rowRef : null} className={cn('hover:bg-[var(--color-primary)]/5 transition-colors cursor-pointer', isHighlighted && highlightRowCls)} onClick={() => setDetailDrawer(e)}>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">{e.sales_date}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold">{e.sales_invoice_no || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[120px] truncate">{e.customer_name || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.tin || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[150px] truncate">{e.description_of_goods_services || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.vat_type}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.vatable_sales)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.vat_exempt_sales)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.zero_rated_sales)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.output_vat)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.total_invoice_amount)}</td>
                  <td className="px-3 py-2.5 text-xs">{e.cash_or_ar}</td>
                  <td className="px-3 py-2.5 text-xs">{e.collection_status}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[100px] truncate">{e.remarks || '—'}</td>
                </tr>
                )
              })}
              {/* TOTAL / CHECK row */}
              {entries.length > 0 && (
                <tr className="bg-[var(--color-surface-2)] font-semibold border-t-2 border-[var(--color-border)]">
                  <td className="px-3 py-2.5" colSpan={6}>TOTAL / CHECK</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(entries.reduce((s, e) => s + (parseFloat(e.vatable_sales) || 0), 0))}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(entries.reduce((s, e) => s + (parseFloat(e.vat_exempt_sales) || 0), 0))}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(entries.reduce((s, e) => s + (parseFloat(e.zero_rated_sales) || 0), 0))}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totalVat)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totalSales)}</td>
                  <td className="px-3 py-2.5" colSpan={3}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="New Sales Book Entry">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Date {reqMark}</label><input type="date" className={inputCls} value={form.sales_date} onChange={e => setForm(f => ({ ...f, sales_date: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Entity {reqMark}</label><select className={inputCls} value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}><option value="">Select</option>{ENTITIES.filter(e => e.value !== 'All').map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Sales Invoice No.</label><input className={inputCls} value={form.sales_invoice_no} onChange={e => setForm(f => ({ ...f, sales_invoice_no: e.target.value }))} placeholder="SI-0001" /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Customer Name</label><input className={inputCls} value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">TIN</label><input className={inputCls} value={form.tin} onChange={e => setForm(f => ({ ...f, tin: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">VAT Type</label><select className={inputCls} value={form.vat_type} onChange={e => setForm(f => ({ ...f, vat_type: e.target.value }))}>{VAT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Description of Goods/Services</label><input className={inputCls} value={form.description_of_goods_services} onChange={e => setForm(f => ({ ...f, description_of_goods_services: e.target.value }))} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Vatable Sales (₱)</label><input type="number" step="0.01" className={inputCls} value={form.vatable_sales} onChange={e => setForm(f => ({ ...f, vatable_sales: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">VAT-Exempt (₱)</label><input type="number" step="0.01" className={inputCls} value={form.vat_exempt_sales} onChange={e => setForm(f => ({ ...f, vat_exempt_sales: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Zero-Rated (₱)</label><input type="number" step="0.01" className={inputCls} value={form.zero_rated_sales} onChange={e => setForm(f => ({ ...f, zero_rated_sales: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Output VAT (₱)</label><input type="number" step="0.01" className={inputCls} value={form.output_vat} onChange={e => setForm(f => ({ ...f, output_vat: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Total Invoice Amount (₱)</label><input type="number" step="0.01" className={inputCls} value={form.total_invoice_amount} onChange={e => setForm(f => ({ ...f, total_invoice_amount: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Cash / AR</label><select className={inputCls} value={form.cash_or_ar} onChange={e => setForm(f => ({ ...f, cash_or_ar: e.target.value }))}><option value="Accounts Receivable">Accounts Receivable</option><option value="Cash">Cash</option></select></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Collection Status</label><select className={inputCls} value={form.collection_status} onChange={e => setForm(f => ({ ...f, collection_status: e.target.value }))}><option value="Unpaid">Unpaid</option><option value="Partially Paid">Partially Paid</option><option value="Paid">Paid</option></select></div>
          </div>
          <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Remarks</label><input className={inputCls} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Create</Button>
          </div>
        </div>
      </Drawer>

      <Drawer open={!!detailDrawer} onClose={() => setDetailDrawer(null)} title={`Sales Invoice: ${detailDrawer?.sales_invoice_no || ''}`}>
        {detailDrawer && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Date</span><span className="font-medium">{detailDrawer.sales_date}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Entity</span><span className="font-medium">{detailDrawer.entity}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Invoice No.</span><span className="font-mono font-semibold">{detailDrawer.sales_invoice_no || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Customer</span><span className="font-medium">{detailDrawer.customer_name || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">TIN</span><span>{detailDrawer.tin || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">VAT Type</span><span>{detailDrawer.vat_type}</span></div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Vatable Sales</span><span className="font-mono">{formatCurrency(detailDrawer.vatable_sales)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">VAT-Exempt Sales</span><span className="font-mono">{formatCurrency(detailDrawer.vat_exempt_sales)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Zero-Rated Sales</span><span className="font-mono">{formatCurrency(detailDrawer.zero_rated_sales)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Output VAT</span><span className="font-mono">{formatCurrency(detailDrawer.output_vat)}</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold"><span>Total Invoice Amount</span><span className="font-mono">{formatCurrency(detailDrawer.total_invoice_amount)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-[var(--color-muted-fg)]">Cash/AR:</span> {detailDrawer.cash_or_ar}</div>
              <div><span className="text-[var(--color-muted-fg)]">Collection Status:</span> {detailDrawer.collection_status}</div>
            </div>
            {detailDrawer.source_module && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Source</span>
                  <span className="font-mono font-semibold text-sm">{detailDrawer.sales_invoice_no}</span>
                </div>
                <a href={`/accounts-receivable/invoices?ref=${encodeURIComponent(detailDrawer.sales_invoice_no)}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] rounded-lg hover:opacity-90">
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

      <ConfirmDialog open={!!confirm} title={confirm?.action === 'post' ? 'Post Sale' : 'Delete Sale'} message={confirm?.action === 'post' ? 'Post this sale to the General Ledger?' : 'Delete this entry?'} onConfirm={handleAction} onCancel={() => setConfirm(null)} />
    </div>
  )
}
