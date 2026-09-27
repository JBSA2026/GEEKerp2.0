// ─── PurchaseOrdersList — /purchasing/orders route component ─────────────────
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form'
import { AlertCircle, Loader2, Plus, Search, ShoppingBag, X } from 'lucide-react'
import { HeaderViewDropdown } from './HeaderViewDropdown'
import { useHighlightRow, highlightRowCls } from '@/hooks/useHighlightRow'
import {
  api, BASE, money, formatDate, statusLabel,
  PO_LIST_GRID, PO_STATUS_FILTERS, ToolbarDropdown
} from './purchasingUtils'

export function PurchaseOrdersList() {
  useOutletContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Read highlight from query params for cross-module navigation
  const highlight = searchParams.get('highlight') || ''

  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [poSearch, setPoSearch] = useState(highlight || '')
  const [poStatusFilter, setPoStatusFilter] = useState('All')

  // Highlight hook — waits until data is loaded
  const { highlightId, highlightRef, rowRef } = useHighlightRow(!loading && purchaseOrders.length > 0)

  const loadPurchaseOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = new URL(`${BASE}/purchasing/purchase-orders`)
      if (poSearch.trim()) url.searchParams.set('search', poSearch.trim())
      if (poStatusFilter !== 'All') url.searchParams.set('status', poStatusFilter)
      setPurchaseOrders(await api(url.pathname + url.search))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [poSearch, poStatusFilter])

  useEffect(() => {
    const timer = setTimeout(loadPurchaseOrders, 0)
    return () => clearTimeout(timer)
  }, [loadPurchaseOrders])

  function handleViewChange(view) {
    if (view === 'suppliers') navigate('../suppliers')
  }

  function handleRowClick(po) {
    // Navigate to the PR detail for this purchase order
    if (po.purchase_request_id) {
      navigate(`../requests/${po.purchase_request_id}`)
    }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden px-6 py-5">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 overflow-x-auto">
            <HeaderViewDropdown value="orders" onChange={handleViewChange} />
            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button size="sm" className="shrink-0" onClick={() => navigate('../requests/new')}><Plus size={14} /> New PR</Button>
              <ToolbarDropdown
                value={poStatusFilter}
                onChange={setPoStatusFilter}
                options={PO_STATUS_FILTERS}
                labelFn={s => s === 'All' ? 'All Status' : statusLabel(s)}
                width="w-[160px]"
              />
              <div className="relative w-[240px] shrink-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" placeholder="Search PO number or supplier..." value={poSearch} onChange={event => setPoSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && loadPurchaseOrders()} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {loading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 py-16 text-sm text-slate-600">
              <Loader2 size={16} className="animate-spin" /> Loading purchase orders...
            </div>
          ) : purchaseOrders.length === 0 ? (
            <EmptyState title="No purchase orders found" icon={ShoppingBag}>Purchase orders are generated from selected supplier quotes.</EmptyState>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className={`grid ${PO_LIST_GRID} w-full min-w-[800px] gap-3 border-y border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
                <span>PO Number</span><span>Supplier</span><span>Status</span><span className="text-right">PO Total</span><span className="text-right">Delivery</span><span className="text-right">Created</span>
              </div>
              <div className="divide-y divide-[#e3ecf8]">
                {purchaseOrders.map(po => {
                  const isHighlighted = (highlightRef || highlightId) && po.po_number === (highlightRef || highlightId)
                  return (
                  <div key={po.purchase_order_id} ref={isHighlighted ? rowRef : undefined} className={`grid ${PO_LIST_GRID} w-full min-w-[800px] cursor-pointer items-center gap-3 px-5 py-3 hover:bg-[#edf4fb] ${isHighlighted ? highlightRowCls : ''}`} onClick={() => handleRowClick(po)}>
                    <p className="break-all font-mono text-xs font-semibold text-[#26324f]">{po.po_number}</p>
                    <p className="truncate text-sm text-slate-700">{po.supplier_name || '—'}</p>
                    <StatusBadge status={po.status} />
                    <p className="text-right text-sm font-semibold text-slate-800">{money(po.po_total, po.currency_code || 'PHP')}</p>
                    <p className="text-right text-xs text-slate-500">{po.delivery_date || '—'}</p>
                    <p className="text-right text-xs text-slate-500">{formatDate(po.created_at)}</p>
                  </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
