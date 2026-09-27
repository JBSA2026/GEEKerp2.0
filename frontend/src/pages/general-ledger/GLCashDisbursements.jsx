import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Plus, Loader2, Trash2, CheckCircle, Eye, Download, ArrowRight, Search } from 'lucide-react'
import {
  ENTITIES, inputCls, reqMark,
  apiGet, apiPost, apiPatch, apiDelete, apiDownload,
  MetricCard, formatCurrency, Drawer, ConfirmDialog, SourceLink,
  useHighlightRow, highlightRowCls,
} from './glUtils'

const PAYMENT_MODES = ['Cash', 'Check', 'Bank Transfer', 'Online Payment', 'Others']

export function GLCashDisbursements() {
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
    entity: '', disbursement_date: new Date().toISOString().slice(0, 10),
    cv_check_ref_no: '', payee_supplier: '', tin: '', description: '',
    payment_mode: '', bank_cash_account: '', expense_account_title: '',
    gross_payment_amount: '', input_vat: '', ewt_withholding_tax: '',
    net_cash_paid: '', invoice_billing_ref: '', account_code: '', remarks: '',
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
      const data = await apiGet(`/general-ledger/books/cash-disbursements?${params}`)
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
    if (!form.entity || !form.disbursement_date) { notify.error('Entity and Date are required'); return }
    setSaving(true)
    try {
      const body = { ...form, gross_payment_amount: parseFloat(form.gross_payment_amount) || 0, input_vat: parseFloat(form.input_vat) || 0, ewt_withholding_tax: parseFloat(form.ewt_withholding_tax) || 0, net_cash_paid: parseFloat(form.net_cash_paid) || 0 }
      await apiPost('/general-ledger/books/cash-disbursements', body)
      notify.success('Cash disbursement created')
      setDrawerOpen(false)
      fetchEntries()
    } catch (e) { notify.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleAction() {
    if (!confirm) return
    try {
      if (confirm.action === 'post') {
        await apiPost(`/general-ledger/books/cash-disbursements/${confirm.entry.disbursement_id}/post`)
        notify.success('Disbursement posted to GL')
      } else if (confirm.action === 'delete') {
        await apiDelete(`/general-ledger/books/cash-disbursements/${confirm.entry.disbursement_id}`)
        notify.success('Disbursement deleted')
      }
      setConfirm(null)
      fetchEntries()
    } catch (e) { notify.error(e.message) }
  }

  const totalGross = entries.reduce((s, e) => s + (parseFloat(e.gross_payment_amount) || 0), 0)
  const totalVat = entries.reduce((s, e) => s + (parseFloat(e.input_vat) || 0), 0)

  const filteredEntries = search.trim()
    ? entries.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(search.toLowerCase())))
    : entries

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Disbursements" value={entries.length} />
        <MetricCard label="Gross Paid" value={formatCurrency(totalGross)} color="text-red-600" />
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
          <Button variant="outline" size="sm" onClick={() => { const params = new URLSearchParams(); if (entity !== 'All') params.set('entity', entity); if (dateFrom) params.set('date_from', dateFrom); if (dateTo) params.set('date_to', dateTo); apiDownload(`/general-ledger/books/cash-disbursements/export/csv?${params}`, `cash_disbursements_book.xlsx`) }}><Download size={14} /> Export</Button>
          <Button size="sm" onClick={openAdd}><Plus size={14} /> New Disbursement</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--color-primary)]" size={28} /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr>
                {['Date', 'CV/Check/Ref No.', 'Payee/Supplier', 'TIN', 'Description', 'Payment Mode', 'Bank/Cash Account', 'Expense/Account Title', 'Gross Payment', 'Input VAT', 'EWT', 'Net Cash Paid', 'Invoice/Billing Ref.', 'Remarks'].map(h => (
                  <th key={h} className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide px-3 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredEntries.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-sm text-[var(--color-muted-fg)]">No cash disbursements found</td></tr>
              ) : filteredEntries.map(e => {
                const isHighlighted = (highlightId && String(e.disbursement_id) === highlightId) || (highlightRef && (e.cv_check_ref_no === highlightRef || e.invoice_billing_ref === highlightRef))
                return (
                <tr key={e.disbursement_id} ref={isHighlighted ? rowRef : null} className={cn('hover:bg-[var(--color-primary)]/5 transition-colors cursor-pointer', isHighlighted && highlightRowCls)} onClick={() => setDetailDrawer(e)}>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">{e.disbursement_date}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold">{e.cv_check_ref_no || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[120px] truncate">{e.payee_supplier || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.tin || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[150px] truncate">{e.description || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.payment_mode || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.bank_cash_account || '—'}</td>
                  <td className="px-3 py-2.5 text-xs">{e.expense_account_title || '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.gross_payment_amount)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.input_vat)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.ewt_withholding_tax)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(e.net_cash_paid)}</td>
                  <td className="px-3 py-2.5 text-xs">{e.invoice_billing_ref || '—'}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[100px] truncate">{e.remarks || '—'}</td>
                </tr>
                )
              })}
              {/* TOTAL / CHECK row */}
              {entries.length > 0 && (
                <tr className="bg-[var(--color-surface-2)] font-semibold border-t-2 border-[var(--color-border)]">
                  <td className="px-3 py-2.5" colSpan={8}>TOTAL / CHECK</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totalGross)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(totalVat)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(entries.reduce((s, e) => s + (parseFloat(e.ewt_withholding_tax) || 0), 0))}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-right">{formatCurrency(entries.reduce((s, e) => s + (parseFloat(e.net_cash_paid) || 0), 0))}</td>
                  <td className="px-3 py-2.5" colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="New Cash Disbursement">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Date {reqMark}</label><input type="date" className={inputCls} value={form.disbursement_date} onChange={e => setForm(f => ({ ...f, disbursement_date: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Entity {reqMark}</label><select className={inputCls} value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}><option value="">Select</option>{ENTITIES.filter(e => e.value !== 'All').map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">CV/Check Ref No.</label><input className={inputCls} value={form.cv_check_ref_no} onChange={e => setForm(f => ({ ...f, cv_check_ref_no: e.target.value }))} placeholder="CV-0001" /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Payee/Supplier</label><input className={inputCls} value={form.payee_supplier} onChange={e => setForm(f => ({ ...f, payee_supplier: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">TIN</label><input className={inputCls} value={form.tin} onChange={e => setForm(f => ({ ...f, tin: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Payment Mode</label><select className={inputCls} value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}><option value="">Select</option>{PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Expense/Account Title</label><input className={inputCls} value={form.expense_account_title} onChange={e => setForm(f => ({ ...f, expense_account_title: e.target.value }))} placeholder="Office Supplies" /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Bank/Cash Account</label><input className={inputCls} value={form.bank_cash_account} onChange={e => setForm(f => ({ ...f, bank_cash_account: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Description</label><input className={inputCls} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Gross Payment (₱)</label><input type="number" step="0.01" className={inputCls} value={form.gross_payment_amount} onChange={e => setForm(f => ({ ...f, gross_payment_amount: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Input VAT (₱)</label><input type="number" step="0.01" className={inputCls} value={form.input_vat} onChange={e => setForm(f => ({ ...f, input_vat: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">EWT (₱)</label><input type="number" step="0.01" className={inputCls} value={form.ewt_withholding_tax} onChange={e => setForm(f => ({ ...f, ewt_withholding_tax: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Net Cash Paid (₱)</label><input type="number" step="0.01" className={inputCls} value={form.net_cash_paid} onChange={e => setForm(f => ({ ...f, net_cash_paid: e.target.value }))} /></div>
          </div>
          <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Invoice/Billing Ref</label><input className={inputCls} value={form.invoice_billing_ref} onChange={e => setForm(f => ({ ...f, invoice_billing_ref: e.target.value }))} /></div>
          <div><label className="text-xs font-medium text-[var(--color-muted-fg)]">Remarks</label><input className={inputCls} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Create</Button>
          </div>
        </div>
      </Drawer>

      <Drawer open={!!detailDrawer} onClose={() => setDetailDrawer(null)} title={`Cash Disbursement: ${detailDrawer?.cv_check_ref_no || detailDrawer?.disbursement_id || ''}`}>
        {detailDrawer && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Date</span><span className="font-medium">{detailDrawer.disbursement_date}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Entity</span><span className="font-medium">{detailDrawer.entity}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">CV/Check No.</span><span className="font-mono font-semibold">{detailDrawer.cv_check_ref_no || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Payee/Supplier</span><span className="font-medium">{detailDrawer.payee_supplier || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">TIN</span><span>{detailDrawer.tin || '—'}</span></div>
              <div><span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Payment Mode</span><span>{detailDrawer.payment_mode || '—'}</span></div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Gross Payment Amount</span><span className="font-mono font-semibold">{formatCurrency(detailDrawer.gross_payment_amount)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Input VAT</span><span className="font-mono">{formatCurrency(detailDrawer.input_vat)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">EWT/Withholding Tax</span><span className="font-mono">{formatCurrency(detailDrawer.ewt_withholding_tax)}</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold"><span>Net Cash Paid</span><span className="font-mono">{formatCurrency(detailDrawer.net_cash_paid)}</span></div>
            </div>
            {detailDrawer.invoice_billing_ref && (
              <div className="rounded-lg border border-amber-100 bg-amber-50/30 p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase text-[var(--color-muted-fg)] block">Source Bill</span>
                  <span className="font-mono font-semibold text-sm">{detailDrawer.invoice_billing_ref}</span>
                </div>
                <a href={`/accounts-payable/bills?ref=${encodeURIComponent(detailDrawer.invoice_billing_ref)}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] rounded-lg hover:opacity-90">
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

      <ConfirmDialog open={!!confirm} title={confirm?.action === 'post' ? 'Post Disbursement' : 'Delete Disbursement'} message={confirm?.action === 'post' ? 'Post this disbursement to the General Ledger?' : 'Delete this disbursement?'} onConfirm={handleAction} onCancel={() => setConfirm(null)} />
    </div>
  )
}
