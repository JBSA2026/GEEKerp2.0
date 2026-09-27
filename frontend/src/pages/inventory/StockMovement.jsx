import { useCallback, useEffect, useState } from 'react'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { Field, Input, Select } from '@/components/ui/form'
import {
  AlertCircle, Boxes, Download, Loader2,
  MoveRight, Plus, X
} from 'lucide-react'
import {
  createInventoryMovement,
  fetchInventoryMeta,
  fetchInventorySummary,
} from '@/utils/api'

const CODE_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function qty(value) {
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(Number(value || 0))
}

function byItemCode(a, b) {
  return CODE_COLLATOR.compare(String(a.item_code || ''), String(b.item_code || ''))
}

function statusLabel(status) {
  return (status || 'ACTIVE').replace(/_/g, ' ')
}

function displayInventoryCode(code) {
  return String(code || '').replace(/^([A-Z]{3}-\d{4}-PRD-\d{4})-\d{2}$/, '$1')
}

// ── Movement List Panel ─────────────────────────────────────────────────────

function MovementPanel({ title, movements, type, loading = false }) {
  const filtered = movements.filter(m => m.movement_type === type)

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-[#d8e2ef] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#d8e2ef] bg-[#f4f8fc] px-5 py-4">
        <div>
          <p className="text-[13px] font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{filtered.length} movement record{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <StatusBadge status={type} />
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={`No ${title.toLowerCase()} yet`} icon={Boxes} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="sticky top-0 z-[1] grid grid-cols-[1fr_60px] gap-3 border-b border-[#e3ecf8] bg-[#f4f8fc] px-5 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Item</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 text-right">Qty</span>
          </div>
          <ul className="divide-y divide-[#edf2fa]">
            {filtered.map(m => (
              <li key={m.movement_no} className="grid grid-cols-[1fr_60px] items-center gap-3 px-5 py-3 hover:bg-[#f9fbfe]">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-slate-800">{m.item_name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">{displayInventoryCode(m.item_code)}</p>
                </div>
                <p className="text-right text-[13px] font-semibold text-slate-700">{qty(m.quantity)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Transfer Form Panel ─────────────────────────────────────────────────────

function TransferPanel({ meta, items, onSaved }) {
  const [fromWarehouseId, setFromWarehouseId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [rows, setRows] = useState([{ stock_id: '', quantity: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const warehouses = meta?.warehouses || []
  const movableItems = (items || []).filter(item =>
    item.stock_id &&
    String(item.warehouse_id) === String(fromWarehouseId) &&
    Number(item.available_quantity ?? item.quantity_on_hand ?? 0) > 0
  )

  function selectFromWarehouse(value) {
    setFromWarehouseId(value)
    setRows([{ stock_id: '', quantity: '' }])
    setError(null)
  }

  function setRow(index, field, value) {
    setRows(prev => prev.map((row, i) => {
      if (i !== index) return row
      return field === 'stock_id' ? { stock_id: value, quantity: '' } : { ...row, [field]: value }
    }))
    setError(null)
  }

  function addRow() {
    setRows(prev => [...prev, { stock_id: '', quantity: '' }])
  }

  function removeRow(index) {
    setRows(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))
  }

  async function confirmMovement(event) {
    event.preventDefault()
    const validRows = rows
      .map(row => ({
        ...row,
        stock: movableItems.find(item => String(item.stock_id) === String(row.stock_id)),
        quantity: Number(row.quantity || 0),
      }))
      .filter(row => row.stock && row.quantity > 0)
    if (!fromWarehouseId || !toWarehouseId) {
      setError('Select both source and destination warehouses.')
      return
    }
    if (String(fromWarehouseId) === String(toWarehouseId)) {
      setError('Source and destination warehouses must be different.')
      return
    }
    if (validRows.length === 0) {
      setError('Add at least one item with a quantity.')
      return
    }
    const overLimit = validRows.find(row => row.quantity > Number(row.stock.available_quantity ?? row.stock.quantity_on_hand ?? 0))
    if (overLimit) {
      setError(`${overLimit.stock.item_name} can only move up to ${qty(overLimit.stock.available_quantity ?? overLimit.stock.quantity_on_hand)} ${overLimit.stock.uom}.`)
      return
    }

    setSaving(true)
    setError(null)
    try {
      for (const row of validRows) {
        await createInventoryMovement({
          movement_type: 'TRANSFER',
          product_code: row.stock.item_code,
          quantity: row.quantity,
          unit_cost: row.stock.unit_cost,
          from_warehouse_id: fromWarehouseId,
          from_location_id: row.stock.location_id || null,
          to_warehouse_id: toWarehouseId,
          reference_no: null,
          remarks: 'Pending warehouse transfer',
        })
      }
      setRows([{ stock_id: '', quantity: '' }])
      onSaved?.()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={confirmMovement} className="flex h-full min-h-0 flex-col rounded-xl border border-[#d8e2ef] bg-white shadow-sm">
      <div className="border-b border-[#d8e2ef] bg-[#f4f8fc] px-5 py-4">
        <p className="text-[13px] font-semibold text-slate-900">Move Stock</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Transfer stock between warehouses</p>
      </div>

      {/* Warehouse selector */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-5 border-b border-[#e3ecf8] px-5 py-5">
        <Field label="From">
          <Select value={fromWarehouseId} onChange={e => selectFromWarehouse(e.target.value)} required>
            <option value="">Select warehouse</option>
            {warehouses.map(w => (
              <option key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name}</option>
            ))}
          </Select>
        </Field>
        <div className="flex h-9 items-center text-slate-300">
          <MoveRight size={20} />
        </div>
        <Field label="To">
          <Select value={toWarehouseId} onChange={e => setToWarehouseId(e.target.value)} required>
            <option value="">Select warehouse</option>
            {warehouses.map(w => (
              <option key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Item rows */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-[1fr_minmax(90px,0.5fr)_80px_32px] items-center gap-3 border-b border-[#e3ecf8] bg-[#f4f8fc] px-5 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Item</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Code</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 text-right">Qty</span>
          <span />
        </div>
        <div className="divide-y divide-[#edf2fa]">
          {rows.map((row, index) => {
            const stock = movableItems.find(item => String(item.stock_id) === String(row.stock_id))
            const maxQty = Number(stock?.available_quantity ?? stock?.quantity_on_hand ?? 0)
            return (
              <div key={index} className="grid grid-cols-[1fr_minmax(90px,0.5fr)_80px_32px] items-center gap-3 px-5 py-3.5">
                <Select value={row.stock_id} onChange={e => setRow(index, 'stock_id', e.target.value)} required disabled={!fromWarehouseId}>
                  <option value="">{fromWarehouseId ? 'Select item' : 'Select From warehouse first'}</option>
                  {movableItems.map(item => (
                    <option key={item.stock_id} value={item.stock_id}>{item.item_name}</option>
                  ))}
                </Select>
                <p className="truncate font-mono text-[11px] text-slate-400">{displayInventoryCode(stock?.item_code) || '-'}</p>
                <Input
                  className="text-right"
                  type="number"
                  min="1"
                  max={maxQty || undefined}
                  step="1"
                  value={row.quantity}
                  onChange={e => setRow(index, 'quantity', e.target.value)}
                  placeholder={stock ? `${qty(maxQty)}` : 'Qty'}
                  required
                  disabled={!stock}
                />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 justify-center p-0 text-slate-400 hover:text-slate-600" onClick={() => removeRow(index)} disabled={rows.length === 1}>
                  <X size={14} />
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-600">{error}</div>
      )}

      <div className="border-t border-[#e3ecf8] px-5 py-4 space-y-3">
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={addRow}>
          <Plus size={14} /> Add Item
        </Button>
        <Button type="submit" size="md" className="w-full" disabled={saving}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Transferring…</> : 'Confirm Transfer'}
        </Button>
      </div>
    </form>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function StockMovement() {
  const [data, setData] = useState(null)
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [summaryData, metaData] = await Promise.all([
        fetchInventorySummary(),
        fetchInventoryMeta(),
      ])
      setData(summaryData)
      setMeta(metaData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  const items = [...(data?.items || [])].sort(byItemCode)
  const stockedItems = items.filter(item => item.stock_id)
  const isInitialLoading = loading && !data
  const isTableRefreshing = loading && Boolean(data)

  function exportInventory() {
    const headers = ['Item Code', 'Item Name', 'Brand', 'UOM', 'Warehouse', 'Stock', 'Reserved', 'Available', 'Min. Amount', 'Unit Cost', 'Inventory Value', 'Status']
    const csvRows = items.map(item => [
      item.item_code, item.item_name, item.brand, item.uom, item.warehouse,
      item.quantity_on_hand, item.reserved_quantity, item.available_quantity,
      item.reorder_level, item.unit_cost, item.inventory_value, statusLabel(item.status),
    ])
    const csv = [headers, ...csvRows]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'inventory.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (isInitialLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="px-6 py-5 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Stock Movement</h2>
              <p className="text-sm text-slate-500">View recent movements and transfer stock between warehouses</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Loading inventory…
          </div>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="px-6 py-5 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Stock Movement</h2>
              <p className="text-sm text-slate-500">View recent movements and transfer stock between warehouses</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-rose-500">
            <AlertCircle size={16} /> {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="px-6 py-5 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Stock Movement</h2>
            <p className="text-sm text-slate-500">View recent movements and transfer stock between warehouses</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportInventory}>
            <Download size={14} /> Export
          </Button>
        </div>

        {/* 3-column layout: Stock In | Transfer | Stock Out */}
        <div className="grid min-h-[500px] grid-cols-[1fr_1.6fr_1fr] gap-5">
          <MovementPanel
            title="Stock In"
            type="STOCK_IN"
            movements={data?.recent_movements || []}
            loading={isTableRefreshing}
          />
          <TransferPanel
            meta={meta}
            items={stockedItems}
            onSaved={load}
          />
          <MovementPanel
            title="Stock Out"
            type="STOCK_OUT"
            movements={data?.recent_movements || []}
            loading={isTableRefreshing}
          />
        </div>
      </div>
    </div>
  )
}
