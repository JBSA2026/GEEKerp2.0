import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Search, Loader2 } from 'lucide-react'
import { apiGet, money, fmtDate, inputCls } from './loaUtils'

function StatCard({ label, value, sub, color = 'text-[var(--color-text)]' }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className={cn('text-lg font-semibold', color)}>{value}</p>
      <p className="text-[11px] text-[var(--color-muted-fg)]">{label}</p>
      {sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{sub}</p>}
    </div>
  )
}

function TransactionTable({ title, rows, type }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <span className="text-xs font-semibold text-[var(--color-text)]">{title} ({rows.length})</span>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[var(--color-surface)] z-10"><tr className="border-b border-[var(--color-border)]">
            <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">{type === 'ar' ? 'Invoice #' : 'Bill #'}</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">Date</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">{type === 'ar' ? 'Customer' : 'Supplier'}</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">TIN</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)] text-right">Base</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)] text-right">VAT</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)] text-right">Gross</th>
          </tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
              <td className="px-3 py-2 text-xs font-mono text-[var(--color-text)]">{type === 'ar' ? r.invoice_number : r.bill_number}</td>
              <td className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">{fmtDate(type === 'ar' ? r.invoice_date : r.bill_date)}</td>
              <td className="px-3 py-2 text-xs text-[var(--color-text)]">{type === 'ar' ? r.customer_name : r.supplier_name}</td>
              <td className="px-3 py-2 text-xs font-mono text-[var(--color-muted-fg)]">{type === 'ar' ? r.customer_tin : r.supplier_tin}</td>
              <td className="px-3 py-2 text-xs text-right tabular-nums">{money(type === 'ar' ? r.billing_subtotal : r.vat_exclusive_amount)}</td>
              <td className="px-3 py-2 text-xs text-right tabular-nums font-medium">{money(type === 'ar' ? r.vat_output : r.vat_input)}</td>
              <td className="px-3 py-2 text-xs text-right tabular-nums">{money(r.gross_amount)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function AlphalistTable({ title, items, type }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <span className="text-xs font-semibold text-[var(--color-text)]">{title} ({items.length})</span>
      </div>
      <table className="w-full text-left">
        <thead><tr className="border-b border-[var(--color-border)]">
          <th className="px-4 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">{type === 'ewt' ? 'Supplier' : 'Customer'}</th>
          <th className="px-4 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">TIN</th>
          <th className="px-4 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)]">Address</th>
          <th className="px-4 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)] text-right">Transactions</th>
          <th className="px-4 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)] text-right">Total Base</th>
          <th className="px-4 py-2 text-[10px] font-semibold text-[var(--color-muted-fg)] text-right">{type === 'ewt' ? 'Total EWT' : 'Total WHT'}</th>
        </tr></thead>
        <tbody>{items.map((item, i) => (
          <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
            <td className="px-4 py-2 text-xs font-medium text-[var(--color-text)]">{type === 'ewt' ? item.supplier_name : item.customer_name}</td>
            <td className="px-4 py-2 text-xs font-mono text-[var(--color-muted-fg)]">{type === 'ewt' ? item.supplier_tin : item.customer_tin}</td>
            <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)] max-w-[150px] truncate">{type === 'ewt' ? item.supplier_address : item.customer_address}</td>
            <td className="px-4 py-2 text-xs text-right">{type === 'ewt' ? item.bill_count : item.invoice_count}</td>
            <td className="px-4 py-2 text-xs text-right tabular-nums">{money(item.total_base)}</td>
            <td className="px-4 py-2 text-xs text-right tabular-nums font-medium">{money(type === 'ewt' ? item.total_ewt : item.total_wht)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export function BIRFormTab() {
  const [forms, setForms] = useState([])
  const [selectedForm, setSelectedForm] = useState('2550M')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const initialRetrieveRef = useRef(handleRetrieve)

  useEffect(() => {
    const timer = setTimeout(() => {
      apiGet('/loa/bir-forms').then(setForms).catch(() => {})
      void initialRetrieveRef.current()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  async function handleRetrieve() {
    const form = selectedForm || '2550M'
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      setData(await apiGet(`/loa/bir-form/${form}?${params}`))
    } catch { notify.error('Retrieval failed') } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Select BIR Form to Retrieve Supporting Data</h3>
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[var(--color-muted-fg)]">BIR Form</label>
            <select value={selectedForm} onChange={e => setSelectedForm(e.target.value)} className={inputCls}>
              <option value="">— Select Form —</option>
              {forms.map(f => <option key={f.code} value={f.code}>{f.code} — {f.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Date From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-medium text-[var(--color-muted-fg)]">Date To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} /></div>
          <div className="flex items-end"><Button size="md" onClick={handleRetrieve} disabled={loading}>{loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Retrieve</Button></div>
        </div>
        {selectedForm && forms.find(f => f.code === selectedForm) && (
          <p className="text-xs text-[var(--color-muted-fg)] mt-2 bg-[var(--color-surface-2)] rounded-lg px-3 py-2">{forms.find(f => f.code === selectedForm)?.description}</p>
        )}
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--color-muted)]" /></div>}

      {data && !loading && (
        <div className="space-y-4">
          {(data.output_vat || data.input_vat) && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Output VAT (Sales)" value={money(data.output_vat?.total)} sub={`${data.output_vat?.invoice_count || 0} invoices · Taxable sales: ${money(data.output_vat?.taxable_sales)}`} color="text-blue-600" />
                <StatCard label="Input VAT (Purchases)" value={money(data.input_vat?.total)} sub={`${data.input_vat?.bill_count || 0} bills · Taxable purchases: ${money(data.input_vat?.taxable_purchases)}`} color="text-purple-600" />
                <StatCard label={data.net_vat >= 0 ? 'VAT Payable' : 'Excess Credit'} value={money(Math.abs(data.net_vat || 0))} sub={data.net_vat >= 0 ? 'Amount to remit to BIR' : 'Carry forward to next period'} color={data.net_vat >= 0 ? 'text-rose-600' : 'text-emerald-600'} />
              </div>
              {data.output_vat?.invoices?.length > 0 && <TransactionTable title="Output VAT — Sales Invoices" rows={data.output_vat.invoices} type="ar" />}
              {data.input_vat?.bills?.length > 0 && <TransactionTable title="Input VAT — Purchase Bills" rows={data.input_vat.bills} type="ap" />}
            </>
          )}
          {data.alphalist && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Total EWT" value={money(data.total_ewt)} sub={`${data.bill_count || 0} bills from ${data.supplier_count || 0} suppliers`} color="text-amber-600" />
                <StatCard label="Total Base (VAT-exclusive)" value={money(data.total_base)} sub="Amount subject to 1% EWT" color="text-[var(--color-text)]" />
                <StatCard label="Suppliers in Alphalist" value={data.supplier_count || 0} sub="Each supplier needs a 2307 certificate" color="text-[var(--color-text)]" />
              </div>
              <AlphalistTable title="Supplier Alphalist (for BIR submission)" items={data.alphalist} type="ewt" />
            </>
          )}
          {data.certificates && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Total WHT (CWT)" value={money(data.total_wht)} sub={`${data.invoice_count || 0} invoices from ${data.customer_count || 0} customers`} color="text-blue-600" />
                <StatCard label="Customers Withholding" value={data.customer_count || 0} sub="Each should issue you a BIR 2307" color="text-[var(--color-text)]" />
                <StatCard label="Tax Credits" value={money(data.total_wht)} sub="Creditable against your income tax" color="text-emerald-600" />
              </div>
              <AlphalistTable title="Customer WHT Certificates (BIR 2307)" items={data.certificates} type="wht" />
            </>
          )}
        </div>
      )}
    </div>
  )
}
