import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Package, Truck, FlaskConical, CheckCircle2, Clock,
  Loader2, AlertCircle, ShoppingCart, FileText, Play, ThumbsUp, ThumbsDown,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Loading, ErrorBox } from '@/components/ui/feedback'

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

async function apiPost(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || e.error || 'Failed') }
  return res.json()
}

function money(v) {
  return Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function statusLabel(s) {
  return (s || '').replace(/_/g, ' ')
}

// Fulfillment status colors
const FULFILLMENT_COLORS = {
  PENDING: 'bg-slate-100 text-slate-600',
  READY_TO_FULFILL: 'bg-emerald-50 text-emerald-700',
  IN_PRODUCTION: 'bg-blue-50 text-blue-700',
  TESTING: 'bg-amber-50 text-amber-700',
  AWAITING_ACCEPTANCE: 'bg-purple-50 text-purple-700',
  DELIVERED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-red-50 text-red-600',
}

function FulfillmentBadge({ status }) {
  const color = FULFILLMENT_COLORS[status] || 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>
      {statusLabel(status)}
    </span>
  )
}

function DetailField({ label, children, mono }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm text-slate-700 ${mono ? 'font-mono' : ''}`}>{children || '—'}</p>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function SalesOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [so, setSo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null) // item_id being acted on

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSo(await apiGet(`/sales-orders/${id}`))
    } catch (err) {
      setError(err.message || 'Unable to load sales order')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // ─── MTO Actions ─────────────────────────────────────────────────────────
  async function handleSubmitTesting(itemId) {
    setActionLoading(itemId)
    try {
      await apiPost(`/sales-orders/${id}/items/${itemId}/submit-testing`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleTestResult(itemId, result) {
    setActionLoading(itemId)
    try {
      await apiPost(`/sales-orders/${id}/items/${itemId}/test-result`, { test_result: result })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleClientAcceptance(itemId, accepted) {
    setActionLoading(itemId)
    try {
      await apiPost(`/sales-orders/${id}/items/${itemId}/client-acceptance`, { accepted })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDeliver(itemId) {
    setActionLoading(itemId)
    try {
      await apiPost(`/sales-orders/${id}/items/${itemId}/deliver`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center h-full py-20"><Loading label="Loading sales order..." /></div>
  if (error && !so) return <div className="p-6"><ErrorBox message={error} onDismiss={() => setError(null)} /></div>

  if (!so) return <div className="p-6"><ErrorBox message="Sales order not found" /></div>

  const items = so.items || []
  const testingRecords = so.testing_records || []
  const client = so.client_list || {}

  const totalOrdered = items.reduce((s, i) => s + Number(i.quantity_ordered || 0), 0)
  const totalDelivered = items.reduce((s, i) => s + Number(i.quantity_delivered || 0), 0)
  const progress = totalOrdered > 0 ? Math.round((totalDelivered / totalOrdered) * 100) : 0

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--color-bg)]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
        <ShoppingCart size={18} className="text-[var(--color-primary)]" />
        <h1 className="text-lg font-bold text-[var(--color-text)]">{so.so_number}</h1>
        <StatusBadge status={so.status} />
        {so.order_type && so.order_type !== 'DIRECT' && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{so.order_type}</span>
        )}
        <div className="flex-1" />
        {so.quotation_id && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/quotation/${so.quotation_id}`)}>
            <FileText size={14} className="mr-1" /> View Quotation
          </Button>
        )}
      </div>

      {error && (
        <div className="mx-6 mt-4">
          <ErrorBox message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      <div className="flex-1 space-y-5 p-6">
        {/* Status Action Banner */}
        {so.status !== 'DELIVERED' && (
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
            so.status === 'RESERVED'
              ? 'border-blue-200 bg-blue-50'
              : so.status === 'IN_PRODUCTION'
              ? 'border-amber-200 bg-amber-50'
              : 'border-slate-200 bg-slate-50'
          }`}>
            {so.status === 'RESERVED' ? (
              <>
                <Truck size={18} className="text-blue-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800">Ready for Delivery</p>
                  <p className="text-xs text-blue-600 mt-0.5">Stock has been reserved. Create a Delivery Note from Inventory → Delivery Notes to fulfill this order.</p>
                </div>
                <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100" onClick={() => navigate('/inventory/deliveries')}>
                  <Truck size={12} className="mr-1" /> Go to Delivery Notes
                </Button>
              </>
            ) : so.status === 'IN_PRODUCTION' ? (
              <>
                <FlaskConical size={18} className="text-amber-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">In Production</p>
                  <p className="text-xs text-amber-600 mt-0.5">MTO items are being manufactured. Use the actions below to submit items for testing, record results, and get client acceptance.</p>
                </div>
              </>
            ) : (
              <>
                <Clock size={18} className="text-slate-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">Pending</p>
                  <p className="text-xs text-slate-500 mt-0.5">This order is awaiting stock reservation or processing.</p>
                </div>
              </>
            )}
          </div>
        )}
        {/* Header Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-600">Order Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DetailField label="SO Number" mono>{so.so_number}</DetailField>
              <DetailField label="Quotation" mono>{so.quotation_no || '—'}</DetailField>
              <DetailField label="Client">{client.company_name || '—'}</DetailField>
              <DetailField label="Project">{so.project_name || '—'}</DetailField>
              <DetailField label="Order Date">{formatDate(so.order_date)}</DetailField>
              <DetailField label="Delivery Date">{formatDate(so.delivery_date)}</DetailField>
              <DetailField label="Entity">{so.entity || '—'}</DetailField>
              <DetailField label="Order Type">{so.order_type || 'DIRECT'}</DetailField>
            </div>

            {/* Delivery progress */}
            <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                <span className="font-medium">Fulfillment Progress</span>
                <span className="font-semibold">{progress}% ({totalDelivered}/{totalOrdered} units)</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-600">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-center">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Subtotal</p>
                <p className="mt-1 text-sm font-bold text-slate-700">₱{money(so.subtotal)}</p>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-center">
                <p className="text-[10px] font-semibold uppercase text-slate-400">VAT</p>
                <p className="mt-1 text-sm font-bold text-slate-700">₱{money(so.vat_amount)}</p>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-center">
                <p className="text-[10px] font-semibold uppercase text-slate-400">WHT</p>
                <p className="mt-1 text-sm font-bold text-red-600">-₱{money(so.wht_amount)}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase text-emerald-600">Grand Total</p>
                <p className="mt-1 text-sm font-bold text-emerald-800">₱{money(so.grand_total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-600">
              Line Items ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[10px] font-semibold uppercase text-slate-400">
                  <th className="pb-2 pr-3">#</th>
                  <th className="pb-2 pr-3">Product</th>
                  <th className="pb-2 pr-3">Description</th>
                  <th className="pb-2 pr-3 text-right">Qty</th>
                  <th className="pb-2 pr-3 text-right">Reserved</th>
                  <th className="pb-2 pr-3 text-right">Delivered</th>
                  <th className="pb-2 pr-3">UOM</th>
                  <th className="pb-2 pr-3 text-right">Price</th>
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.sales_order_item_id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2.5 pr-3 text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 pr-3 font-mono text-slate-700">{item.product_code || '—'}</td>
                    <td className="py-2.5 pr-3 max-w-[200px] truncate text-slate-600">{item.description}</td>
                    <td className="py-2.5 pr-3 text-right font-medium">{item.quantity_ordered}</td>
                    <td className="py-2.5 pr-3 text-right">{item.quantity_reserved || 0}</td>
                    <td className="py-2.5 pr-3 text-right">{item.quantity_delivered || 0}</td>
                    <td className="py-2.5 pr-3 text-slate-500">{item.uom}</td>
                    <td className="py-2.5 pr-3 text-right">₱{money(item.selling_price)}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                        item.fulfillment_type === 'MTO' ? 'bg-blue-50 text-blue-700' :
                        item.fulfillment_type === 'SERVICE' ? 'bg-violet-50 text-violet-700' :
                        'bg-slate-50 text-slate-600'
                      }`}>
                        {item.fulfillment_type || 'DIRECT'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <FulfillmentBadge status={item.fulfillment_status} />
                    </td>
                    <td className="py-2.5">
                      <ItemActions
                        item={item}
                        loading={actionLoading === item.sales_order_item_id}
                        onSubmitTesting={() => handleSubmitTesting(item.sales_order_item_id)}
                        onTestResult={(result) => handleTestResult(item.sales_order_item_id, result)}
                        onClientAcceptance={(accepted) => handleClientAcceptance(item.sales_order_item_id, accepted)}
                        onDeliver={() => handleDeliver(item.sales_order_item_id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">No items found.</p>
            )}
          </CardContent>
        </Card>

        {/* Testing Records */}
        {testingRecords.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-600">
                <FlaskConical size={14} className="inline mr-1.5" />
                Testing History ({testingRecords.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {testingRecords.map((tr) => {
                  const tester = tr.employees
                    ? `${tr.employees.first_name} ${tr.employees.last_name}`
                    : '—'
                  return (
                    <div key={tr.test_id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-700">
                          {statusLabel(tr.test_result)}
                          {tr.client_accepted != null && (
                            <span className={`ml-2 ${tr.client_accepted ? 'text-green-600' : 'text-red-600'}`}>
                              • Client {tr.client_accepted ? 'Accepted' : 'Rejected'}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {formatDate(tr.test_date)} • Tested by {tester}
                          {tr.remarks && ` • ${tr.remarks}`}
                        </p>
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                        tr.test_result === 'PASSED' ? 'bg-green-50 text-green-700' :
                        tr.test_result === 'FAILED' ? 'bg-red-50 text-red-600' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {tr.test_result}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Remarks */}
        {so.remarks && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-600">Remarks</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{so.remarks}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── Item Action Buttons ─────────────────────────────────────────────────────
function ItemActions({ item, loading, onSubmitTesting, onTestResult, onClientAcceptance, onDeliver }) {
  if (loading) return <Loader2 size={14} className="animate-spin text-slate-400" />

  const { fulfillment_type: type, fulfillment_status: status } = item

  // MTO workflow
  if (type === 'MTO') {
    if (status === 'IN_PRODUCTION') {
      return (
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={onSubmitTesting}>
          <FlaskConical size={10} className="mr-1" /> Submit Testing
        </Button>
      )
    }
    if (status === 'TESTING') {
      return (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-green-700 border-green-200 hover:bg-green-50" onClick={() => onTestResult('PASSED')}>
            <CheckCircle2 size={10} className="mr-0.5" /> Pass
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => onTestResult('FAILED')}>
            Fail
          </Button>
        </div>
      )
    }
    if (status === 'AWAITING_ACCEPTANCE') {
      return (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-green-700 border-green-200 hover:bg-green-50" onClick={() => onClientAcceptance(true)}>
            <ThumbsUp size={10} className="mr-0.5" /> Accept
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => onClientAcceptance(false)}>
            <ThumbsDown size={10} className="mr-0.5" /> Reject
          </Button>
        </div>
      )
    }
  }

  // DIRECT / SERVICE — can deliver if READY_TO_FULFILL
  if (status === 'READY_TO_FULFILL') {
    return (
      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={onDeliver}>
        <Truck size={10} className="mr-1" /> Deliver
      </Button>
    )
  }

  // Delivered or other terminal status
  if (status === 'DELIVERED') {
    return <CheckCircle2 size={14} className="text-green-500" />
  }

  return <span className="text-[10px] text-slate-400">—</span>
}

export default SalesOrderDetail
