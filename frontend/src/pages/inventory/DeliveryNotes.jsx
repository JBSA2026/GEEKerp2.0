import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/form'
import {
  Plus, Loader2, Truck, CheckCircle2, X, Send, Paperclip,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { notify } from '@/utils/toast'
import { useHighlightRow, highlightRowCls } from '@/hooks/useHighlightRow'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}
async function apiGet(path) { const r = await fetch(`${BASE}${path}`, { headers: authHeaders() }); if (!r.ok) throw new Error('Failed'); return r.json() }
async function apiPost(path, body) { const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || e.detail || 'Failed') } return r.json() }
async function apiPatch(path, body) { const r = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || e.detail || 'Failed') } return r.json() }

const STATUS_COLORS = {
  'Preparing': 'bg-amber-50 text-amber-700 border-amber-200',
  'In Transit': 'bg-blue-50 text-blue-700 border-blue-200',
  'Delivered': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Acknowledged': 'bg-slate-100 text-slate-700 border-slate-200',
  'Cancelled': 'bg-red-50 text-red-600 border-red-200',
}

// ── Create Delivery Note Modal ──────────────────────────────────────────────

function CreateDNModal({ open, onClose, onCreated }) {
  const [pendingOrders, setPendingOrders] = useState([])
  const [selectedSO, setSelectedSO] = useState(null)
  const [items, setItems] = useState([])
  const [address, setAddress] = useState('')
  const [remarks, setRemarks] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [loadingOrders, setLoadingOrders] = useState(true)

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      setLoadingOrders(true)
      apiGet('/delivery-notes/pending-orders').then(setPendingOrders).catch(() => {}).finally(() => setLoadingOrders(false))
      setSelectedSO(null)
      setItems([])
      setAddress('')
      setRemarks('')
      setError(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open])

  function selectOrder(so) {
    setSelectedSO(so)
    setItems(so.pending_items.map(i => ({
      ...i,
      qty_to_deliver: Math.max(0, Number(i.quantity_ordered || 0) - Number(i.quantity_delivered || 0)),
      max_pending: Math.max(0, Number(i.quantity_ordered || 0) - Number(i.quantity_delivered || 0)),
    })))
  }

  function setItemQty(index, qty) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, qty_to_deliver: Math.min(Number(qty), item.max_pending) } : item))
  }

  async function handleCreate() {
    const validItems = items.filter(i => Number(i.qty_to_deliver) > 0)
    if (!selectedSO) { setError('Select a sales order.'); return }
    if (validItems.length === 0) { setError('Enter delivery quantities for at least one item.'); return }
    setSaving(true); setError(null)
    try {
      await apiPost('/delivery-notes/', {
        sales_order_id: selectedSO.sales_order_id,
        client_id: selectedSO.client_id,
        entity: selectedSO.entity || null,
        delivery_date: deliveryDate || null,
        address: address || null,
        remarks: remarks || null,
        items: validItems.map(i => ({
          product_code: i.product_code,
          description: i.description,
          quantity_ordered: i.quantity_ordered,
          quantity_delivered: Number(i.qty_to_deliver),
          uom: i.uom,
        })),
      })
      notify.success('Delivery note created')
      onCreated()
      onClose()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[9990] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[9991] flex items-center justify-center p-4">
        <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl max-h-[85vh]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text)]">Create Delivery Note</h3>
              <p className="text-[11px] text-[var(--color-muted-fg)]">Select a sales order and specify quantities to deliver</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]"><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}

            {/* Order Selection */}
            {!selectedSO ? (
              <div>
                <p className="text-xs font-semibold text-[var(--color-muted-fg)] uppercase mb-3">Select Sales Order with Pending Items</p>
                {loadingOrders ? (
                  <div className="flex items-center gap-2 py-8 justify-center text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading orders...</div>
                ) : pendingOrders.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-500">No sales orders with pending deliveries</div>
                ) : (
                  <div className="space-y-2">
                    {pendingOrders.map(so => (
                      <button
                        key={so.sales_order_id}
                        type="button"
                        onClick={() => selectOrder(so)}
                        className="w-full text-left rounded-lg border border-[var(--color-border)] px-4 py-3 hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-2)] transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-[var(--color-text)]">{so.so_number}</p>
                            <p className="text-xs text-[var(--color-muted-fg)] mt-0.5">{so.project_name || 'No project name'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-[var(--color-muted-fg)]">{so.pending_items.length} item{so.pending_items.length !== 1 ? 's' : ''} pending</p>
                            <p className="text-[11px] text-slate-400">{Math.round((so.total_delivered / so.total_ordered) * 100)}% delivered</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Selected SO header */}
                <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text)]">{selectedSO.so_number}</p>
                    <p className="text-xs text-[var(--color-muted-fg)]">{selectedSO.project_name}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { setSelectedSO(null); setItems([]) }}>Change</Button>
                </div>

                {/* Delivery details */}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Delivery Date">
                    <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                  </Field>
                  <Field label="Delivery Address">
                    <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Client address..." />
                  </Field>
                </div>

                {/* Items table */}
                <div>
                  <p className="text-xs font-semibold text-[var(--color-muted-fg)] uppercase mb-3">Items to Deliver</p>
                  <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                    <div className="grid grid-cols-[1fr_80px_80px_100px] gap-3 bg-[#edf4fb] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                      <span>Item</span>
                      <span className="text-center">Ordered</span>
                      <span className="text-center">Pending</span>
                      <span className="text-center">Deliver</span>
                    </div>
                    <div className="divide-y divide-[#e9eef8]">
                      {items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_80px_80px_100px] gap-3 items-center px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{item.description || item.product_code}</p>
                            <p className="text-[11px] text-slate-500">{item.product_code}</p>
                          </div>
                          <p className="text-center text-xs text-slate-600">{item.quantity_ordered}</p>
                          <p className="text-center text-xs font-semibold text-amber-600">{item.max_pending}</p>
                          <Input
                            type="number"
                            min={0}
                            max={item.max_pending}
                            value={item.qty_to_deliver}
                            onChange={e => setItemQty(idx, e.target.value)}
                            className="text-center text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <Field label="Remarks">
                  <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes..." />
                </Field>
              </>
            )}
          </div>

          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)]">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="button" size="md" className="flex-1" onClick={handleCreate} disabled={saving || !selectedSO}>
              {saving ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : <><Truck size={14} /> Create Delivery Note</>}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main Delivery Notes Page ────────────────────────────────────────────────

export function DeliveryNotes() {
  const [notes, setNotes] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [confirmModal, setConfirmModal] = useState(null) // { note, nextStatus }
  const [receivedBy, setReceivedBy] = useState('')
  const [attachFile, setAttachFile] = useState(null)
  const [confirmError, setConfirmError] = useState(null)

  const { highlightId, highlightRef, rowRef } = useHighlightRow(!loading && notes.length > 0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, met] = await Promise.all([
        apiGet(`/delivery-notes/?status=${statusFilter}`),
        apiGet('/delivery-notes/metrics'),
      ])
      setNotes(list)
      setMetrics(met)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  function openStatusConfirm(note) {
    const nextMap = { 'Preparing': 'In Transit', 'In Transit': 'Delivered', 'Delivered': 'Acknowledged' }
    const next = nextMap[note.status]
    if (!next) return
    if (next === 'In Transit') {
      // No extra info needed, advance directly
      advanceDirectly(note, next)
    } else {
      setConfirmModal({ note, nextStatus: next })
      setReceivedBy('')
      setAttachFile(null)
      setConfirmError(null)
    }
  }

  async function advanceDirectly(note, next) {
    setUpdatingId(note.delivery_note_id)
    try {
      await apiPatch(`/delivery-notes/${note.delivery_note_id}/status`, { status: next })
      notify.success(`Status updated to ${next}`)
      load()
    } catch (err) { notify.error(err.message) }
    finally { setUpdatingId(null) }
  }

  async function confirmStatusChange() {
    if (!confirmModal) return
    const { note, nextStatus } = confirmModal
    if (!receivedBy.trim()) { setConfirmError('Receiver name is required.'); return }
    setUpdatingId(note.delivery_note_id)
    setConfirmError(null)
    try {
      await apiPatch(`/delivery-notes/${note.delivery_note_id}/status`, {
        status: nextStatus,
        received_by: receivedBy.trim(),
        received_date: new Date().toISOString().split('T')[0],
      })
      // Upload attachment if provided
      if (attachFile) {
        const formData = new FormData()
        formData.append('file', attachFile)
        await fetch(`${BASE}/delivery-notes/${note.delivery_note_id}/attachment`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
          body: formData,
        })
      }
      notify.success(`Status updated to ${nextStatus}`)
      setConfirmModal(null)
      load()
    } catch (err) { setConfirmError(err.message) }
    finally { setUpdatingId(null) }
  }

  const statusButtonLabel = {
    'Preparing': 'Mark In Transit',
    'In Transit': 'Mark Delivered',
    'Delivered': 'Confirm Acknowledged',
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-5 space-y-5">
      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-3">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Total DRs</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{metrics.total}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[11px] font-medium text-amber-600 uppercase">Preparing</p>
            <p className="mt-1 text-xl font-semibold text-amber-700">{metrics.preparing}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-[11px] font-medium text-blue-600 uppercase">In Transit</p>
            <p className="mt-1 text-xl font-semibold text-blue-700">{metrics.in_transit}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-[11px] font-medium text-emerald-600 uppercase">Delivered</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700">{metrics.delivered}</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {['All', 'Preparing', 'In Transit', 'Delivered', 'Acknowledged'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                statusFilter === s ? 'bg-[#2c3a61] text-white' : 'text-slate-600 hover:bg-[#edf4fb]'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New Delivery Note
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      ) : notes.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState icon={Truck} title="No delivery notes">
              Create a delivery note from a pending sales order to start tracking deliveries.
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_80px_120px_140px] gap-3 bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            <span>DR Number</span>
            <span>Sales Order</span>
            <span className="text-center">Items</span>
            <span className="text-center">Qty</span>
            <span>Status</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-[#e9eef8]">
            {notes.map(note => {
              const isHL = (highlightRef || highlightId) && (note.dr_number === (highlightRef || highlightId) || note.receipt_number === (highlightRef || highlightId))
              return (
              <div key={note.delivery_note_id} ref={isHL ? rowRef : undefined} className={cn("grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_80px_120px_140px] gap-3 items-center px-5 py-3 hover:bg-[#f8fafd]", isHL && highlightRowCls)}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#26324f]">{note.dr_number}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{note.delivery_date || '—'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-700 truncate">{note.entity || '—'}</p>
                  <p className="text-[11px] text-slate-400 truncate">SO #{note.sales_order_id}</p>
                </div>
                <p className="text-center text-xs text-slate-600">{note.item_count}</p>
                <p className="text-center text-xs font-semibold text-slate-800">{note.total_qty_delivered}</p>
                <div>
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', STATUS_COLORS[note.status] || '')}>
                    {note.status}
                  </span>
                </div>
                <div className="flex justify-end">
                  {statusButtonLabel[note.status] && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openStatusConfirm(note)}
                      disabled={updatingId === note.delivery_note_id}
                      className="text-xs"
                    >
                      {updatingId === note.delivery_note_id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      {statusButtonLabel[note.status]}
                    </Button>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Confirm Delivery/Acknowledgment Modal */}
      {confirmModal && (
        <>
          <div className="fixed inset-0 z-[9990] bg-black/40" onClick={() => setConfirmModal(null)} />
          <div className="fixed inset-0 z-[9991] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
              <div className="border-b border-[var(--color-border)] px-6 py-4">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">
                  {confirmModal.nextStatus === 'Delivered' ? 'Confirm Delivery' : 'Acknowledge Receipt'}
                </h3>
                <p className="text-[11px] text-[var(--color-muted-fg)] mt-0.5">
                  {confirmModal.nextStatus === 'Delivered'
                    ? 'Enter the name of the person who received the delivery.'
                    : 'Confirm client acknowledgment of the delivery.'}
                </p>
              </div>
              <div className="px-6 py-5 space-y-4">
                {confirmError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{confirmError}</div>}
                <Field label="Received By *">
                  <Input
                    value={receivedBy}
                    onChange={e => setReceivedBy(e.target.value)}
                    placeholder="Name of person who received the items"
                  />
                </Field>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--color-muted-fg)]">Proof of Delivery (optional)</label>
                  <p className="text-[11px] text-slate-400 mb-1">Upload signed DR, photo, or scanned receipt</p>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.docx"
                    onChange={e => setAttachFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#edf4fb] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#26324f] hover:file:bg-[#e0ecf7]"
                  />
                  {attachFile && <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600"><Paperclip aria-hidden="true" size={12} strokeWidth={1.8} /> {attachFile.name}</p>}
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)]">
                <Button variant="outline" size="md" className="flex-1" onClick={() => setConfirmModal(null)}>Cancel</Button>
                <Button size="md" className="flex-1" onClick={confirmStatusChange} disabled={updatingId}>
                  {updatingId ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Confirm
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <CreateDNModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
    </div>
  )
}
