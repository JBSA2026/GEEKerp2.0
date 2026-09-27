import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/feedback'
import { Field, Input, Select } from '@/components/ui/form'
import { ModalFrame } from '@/components/ui/overlay'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import {
  AlertCircle, Archive, ArrowRightLeft, Boxes, Download, Loader2,
  ChevronDown, PackageCheck, Pencil, Plus, Printer, Save,
  Search, Trash2, X
} from 'lucide-react'
import {
  createInventoryStock,
  createWarehouse,
  updateWarehouse,
  deleteInventoryStock,
  fetchInventoryMeta,
  fetchInventorySummary,
  updateInventoryStock,
  fetchInventoryLocations,
  createInventoryLocation,
  updateInventoryLocation,
  updateInventoryStockLocation,
  receivePendingTransfer,
  fetchInternalTransferOptions,
  createInternalTransfer,
  updateProduct,
} from '@/utils/api'

const ACTIONS = {
  add: { title: 'Add Item', movementType: null },
}

const EMPTY_ACTION_FORM = {
  product_code: '',
  warehouse_id: '',
  location_id: '',
  from_warehouse_id: '',
  to_warehouse_id: '',
  from_location_id: '',
  to_location_id: '',
  quantity: '',
  reorder_level: '',
  unit_cost: '',
  reference_no: '',
  remarks: '',
}

const EMPTY_WAREHOUSE_FORM = {
  warehouse_code: '',
  warehouse_name: '',
  address: '',
  contact_person: '',
  contact_number: '',
  status: 'ACTIVE',
}

const STOCK_GRID = 'grid-cols-[minmax(180px,1.3fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(100px,0.65fr)_minmax(120px,0.8fr)]'
const STOCK_ACTION_GRID = 'grid-cols-[minmax(180px,1.3fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(100px,0.65fr)_minmax(120px,0.8fr)_minmax(90px,0.55fr)]'
const CODE_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function qty(value) {
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(Number(value || 0))
}

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
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

const COMPANY_OPTIONS = ['Expedia', 'GreatnessLab', 'Exigent', 'KSI']

function companyFromInventoryCode(code) {
  const prefix = String(code || '').split('-')[0]
  return {
    EXP: 'Expedia',
    GLB: 'GreatnessLab',
    EXG: 'Exigent',
    KSI: 'Kyrios Solutions Inc.',
  }[prefix] || 'Unassigned'
}

function aggregateInventoryByProduct(rows) {
  const grouped = new Map()
  rows.forEach(row => {
    const key = row.item_code || row.barcode || row.item_name
    const existing = grouped.get(key)
    const breakdownRow = {
      warehouse_id: row.warehouse_id,
      warehouse: row.warehouse || '-',
      location: row.location || '-',
      quantity_on_hand: Number(row.quantity_on_hand || 0),
      reserved_quantity: Number(row.reserved_quantity || 0),
      available_quantity: Number(row.available_quantity || 0),
      inventory_value: Number(row.inventory_value || 0),
    }

    if (!existing) {
      grouped.set(key, {
        ...row,
        detail_key: `aggregate-${key}`,
        is_aggregate: true,
        stock_id: null,
        quantity_on_hand: Number(row.quantity_on_hand || 0),
        reserved_quantity: Number(row.reserved_quantity || 0),
        available_quantity: Number(row.available_quantity || 0),
        inventory_value: Number(row.inventory_value || 0),
        reorder_level: Number(row.reorder_level || 0),
        warehouse_breakdown: [breakdownRow],
        reserved_projects: [...(row.reserved_projects || [])],
      })
      return
    }

    existing.quantity_on_hand += Number(row.quantity_on_hand || 0)
    existing.reserved_quantity += Number(row.reserved_quantity || 0)
    existing.available_quantity += Number(row.available_quantity || 0)
    existing.inventory_value += Number(row.inventory_value || 0)
    existing.reorder_level = Math.max(Number(existing.reorder_level || 0), Number(row.reorder_level || 0))
    existing.warehouse_breakdown.push(breakdownRow)
    existing.reserved_projects = [...(existing.reserved_projects || []), ...(row.reserved_projects || [])]
  })

  return [...grouped.values()].map(item => {
    const warehouseNames = [...new Set((item.warehouse_breakdown || []).map(row => row.warehouse).filter(Boolean))]
    const locationNames = [...new Set((item.warehouse_breakdown || []).map(row => row.location).filter(value => value && value !== '-'))]
    const status = item.quantity_on_hand <= 0
      ? 'OUT_OF_STOCK'
      : item.reorder_level > 0 && item.quantity_on_hand < item.reorder_level
        ? 'LOW_STOCK'
        : item.status
    return {
      ...item,
      warehouse: warehouseNames.length > 1 ? `${warehouseNames.length} warehouses` : warehouseNames[0] || '-',
      location: locationNames.length > 1 ? 'Multiple areas' : locationNames[0] || '-',
      status,
    }
  })
}

export function ItemDetailDrawer({ item, onClose, onOpenProject, onMinimumSaved, onProductSaved }) {
  const isOpen = Boolean(item)
  const code = item?.barcode || item?.item_code
  const reservations = item?.reserved_projects || []
  const warehouseBreakdown = item?.warehouse_breakdown || []
  const [editingProduct, setEditingProduct] = useState(false)
  const [productDraft, setProductDraft] = useState(() => ({
    product_name: item?.item_name || '',
    product_brand: item?.brand === '-' ? '' : item?.brand || '',
    product_description: item?.product_description || '',
    selling_price_margin: item?.selling_price_margin != null ? String(item.selling_price_margin) : '0',
    reorder_level: item?.reorder_level != null ? String(item.reorder_level) : '0',
  }))
  const [savingProduct, setSavingProduct] = useState(false)
  const [productError, setProductError] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setProductDraft({
        product_name: item?.item_name || '',
        product_brand: item?.brand === '-' ? '' : item?.brand || '',
        product_description: item?.product_description || '',
        selling_price_margin: item?.selling_price_margin != null ? String(item.selling_price_margin) : '0',
        reorder_level: item?.reorder_level != null ? String(item.reorder_level) : '0',
      })
      setEditingProduct(false)
      setProductError(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [item])

  function setProductField(field, value) {
    setProductDraft(prev => ({ ...prev, [field]: value }))
    setProductError(null)
  }

  function resetProductDraft() {
    setProductDraft({
      product_name: item?.item_name || '',
      product_brand: item?.brand === '-' ? '' : item?.brand || '',
      product_description: item?.product_description || '',
      selling_price_margin: item?.selling_price_margin != null ? String(item.selling_price_margin) : '0',
      reorder_level: item?.reorder_level != null ? String(item.reorder_level) : '0',
    })
    setProductError(null)
  }

  async function saveProductDetails(event) {
    event.preventDefault()
    if (!item?.item_code) return
    setSavingProduct(true)
    setProductError(null)
    try {
      const nextMinimum = Number(productDraft.reorder_level || 0)
      const updated = await updateProduct(item.item_code, {
        product_name: productDraft.product_name.trim() || item.item_name,
        product_brand: productDraft.product_brand.trim(),
        product_description: productDraft.product_description.trim() || null,
        selling_price_margin: Number(productDraft.selling_price_margin || 0),
      })
      if (item?.stock_id) {
        await updateInventoryStock(item.stock_id, {
          product_code: item.item_code,
          warehouse_id: String(item.warehouse_id),
          location_id: item.location_id ? String(item.location_id) : null,
          quantity_on_hand: Number(item.quantity_on_hand || 0),
          reorder_level: nextMinimum,
          unit_cost: Number(item.unit_cost || 0),
        })
        onMinimumSaved?.(nextMinimum)
      }
      onProductSaved?.(updated)
      setEditingProduct(false)
    } catch (err) {
      setProductError(err.message || String(err))
    } finally {
      setSavingProduct(false)
    }
  }

  function handleArchiveRequest() {
    if (!item?.item_code) return

    const confirmed = window.confirm(
      `Archive "${item.item_name || 'this inventory item'}"? This is a placeholder and will not make any changes.`,
    )
    if (confirmed) {
      setProductError('Archive is not available yet. No changes were made.')
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div className={`fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-[#d8e2ef] bg-white shadow-2xl transition-all duration-200 ${isOpen ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        {/* Header: barcode on top, name below */}
        <div className="shrink-0 border-b border-[#d8e2ef] bg-[#f6f8fc] px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col items-center w-full">
              <BarcodeStrip code={code} />
              <p className="mt-1.5 text-center font-mono text-[11px] font-semibold text-[#26324f]">{displayInventoryCode(code)}</p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#edf4fb] hover:text-slate-950">
              <X size={15} />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {editingProduct ? (
              <Input
                className="h-7 flex-1 text-sm font-bold text-slate-950"
                value={productDraft.product_name}
                onChange={event => setProductField('product_name', event.target.value)}
                aria-label="Product name"
                required
              />
            ) : (
              <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-950">{item?.item_name || 'Inventory item'}</h2>
            )}
            <Button
              type="button" variant="outline" size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-xs text-[#26324f]"
              onClick={handleArchiveRequest}
              disabled={!item?.item_code || savingProduct}
            >
              <Archive size={12} />
              Archive
            </Button>
            <Button
              type="button" variant="ghost" size="icon"
              className="h-6 w-6 shrink-0 justify-center p-0 text-[#26324f]"
              onClick={() => { if (editingProduct) resetProductDraft(); setEditingProduct(v => !v) }}
              disabled={savingProduct}
            >
              {editingProduct ? <X size={12} /> : <Pencil size={12} />}
            </Button>
            {editingProduct && (
              <Button type="submit" form="inventory-product-details-form" size="icon" className="h-6 w-6 shrink-0 justify-center p-0" disabled={savingProduct}>
                {savingProduct ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              </Button>
            )}
          </div>
        </div>
        {/* Scrollable body */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-[#d8e2ef] bg-[#f6f8fc] px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Warehouse</p>
              <p className="mt-0.5 font-semibold text-slate-900">{item?.warehouse || '-'}</p>
            </div>
            <div className="rounded-md border border-[#d8e2ef] bg-[#f6f8fc] px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Area</p>
              <p className="mt-0.5 font-semibold text-slate-900">{item?.location || '-'}</p>
            </div>
            <div className="rounded-md border border-[#d8e2ef] bg-[#f6f8fc] px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">On Hand</p>
              <p className="mt-0.5 font-semibold text-slate-900">{qty(item?.quantity_on_hand)} {item?.uom || ''}</p>
            </div>
            <div className="rounded-md border border-[#d8e2ef] bg-[#f6f8fc] px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Reserved</p>
              <p className="mt-0.5 font-semibold text-slate-900">{qty(item?.reserved_quantity)} {item?.uom || ''}</p>
            </div>
          </div>
          {warehouseBreakdown.length > 1 && (
            <div className="rounded-md border border-[#d8e2ef] bg-white">
              <div className="border-b border-[#e3ecf8] px-3 py-2">
                <p className="text-xs font-semibold text-slate-950">Warehouse Stock</p>
              </div>
              <div className="divide-y divide-[#e9eef8]">
                {warehouseBreakdown.map((row, index) => (
                  <div key={`${row.warehouse_id || row.warehouse}-${row.location}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{row.warehouse}</span>
                      <span className="block truncate text-[10px] text-slate-500">{row.location || '-'}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold text-slate-900">{qty(row.quantity_on_hand)} {item?.uom || ''}</span>
                      <span className="block text-[10px] text-slate-500">Available {qty(row.available_quantity)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Product details */}
          <form id="inventory-product-details-form" onSubmit={saveProductDetails} className="rounded-md border border-[#d8e2ef] bg-white">
            <div className="border-b border-[#e3ecf8] px-3 py-2">
              <p className="text-xs font-semibold text-slate-950">Product Details</p>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 text-xs">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Brand</p>
                {editingProduct ? (
                  <Input className="mt-0.5 h-7 text-xs" value={productDraft.product_brand} onChange={event => setProductField('product_brand', event.target.value)} placeholder="Brand" disabled={savingProduct} />
                ) : (
                  <p className="mt-0.5 font-semibold text-slate-900">{item?.brand || '-'}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Buying Price</p>
                <p className="mt-0.5 font-semibold text-slate-900">{money(item?.buying_price_vat)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Selling Price</p>
                {editingProduct ? (
                  <Input className="mt-0.5 h-7 text-xs" type="number" min="0" step="0.01" value={productDraft.selling_price_margin} onChange={event => setProductField('selling_price_margin', event.target.value)} disabled={savingProduct} />
                ) : (
                  <p className="mt-0.5 font-semibold text-slate-900">{money(item?.selling_price_margin)}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Supplier</p>
                <p className="mt-0.5 font-semibold text-slate-900">{item?.supplier_name || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Minimum</p>
                {editingProduct ? (
                  <Input className="mt-0.5 h-7 text-xs" type="number" min="0" step="1" value={productDraft.reorder_level} onChange={event => setProductField('reorder_level', event.target.value)} disabled={!item?.stock_id || savingProduct} />
                ) : (
                  <p className="mt-0.5 font-semibold text-slate-900">{qty(item?.reorder_level)} {item?.uom || ''}</p>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Description</p>
                {editingProduct ? (
                  <Input className="mt-0.5 h-7 text-xs" value={productDraft.product_description} onChange={event => setProductField('product_description', event.target.value)} placeholder="Description" disabled={savingProduct} />
                ) : (
                  <p className="mt-0.5 line-clamp-2 text-slate-700">{item?.product_description || '-'}</p>
                )}
              </div>
            </div>
            {productError && <div className="mx-3 mb-3 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-600">{productError}</div>}
          </form>

          {/* Project reservations */}
          <div className="rounded-md border border-[#d8e2ef] bg-white">
            <div className="border-b border-[#e3ecf8] px-3 py-2">
              <p className="text-xs font-semibold text-slate-950">Project Reservations</p>
            </div>
            {reservations.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500">No projects have reserved this item.</p>
            ) : (
              <div className="divide-y divide-[#e9eef8]">
                {reservations.map(project => (
                  <button
                    key={project.allocation_id || project.project_id}
                    type="button"
                    onClick={() => onOpenProject(project)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[#edf4fb]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-900">{project.project_name}</span>
                      <span className="block truncate font-mono text-[10px] text-[#26324f]">{project.project_code || `Project #${project.project_id}`}</span>
                    </span>
                    <span className="text-xs font-semibold text-slate-700">{qty(project.quantity_reserved)} {item?.uom || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function BarcodeStrip({ code }) {
  const seed = String(code || 'NO-CODE')
  return (
    <div className="flex h-16 w-64 items-end gap-[2px] rounded bg-white px-3 py-2 border border-slate-200">
      {Array.from({ length: 32 }).map((_, index) => {
        const height = 18 + ((seed.charCodeAt(index % seed.length) + index) % 28)
        const width = index % 5 === 0 ? 3 : 2
        return <span key={index} className="bg-slate-950" style={{ height, width }} />
      })}
    </div>
  )
}

function InventoryCardHeader({ titleControl, actionsControl, trailingControl, children }) {
  return (
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>{titleControl}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {actionsControl}
          {children}
          {trailingControl}
        </div>
      </div>
    </CardHeader>
  )
}

function InventoryTitleDropdown({ selectedWarehouseId, warehouses, onSelectWarehouse, onAddWarehouse }) {
  const [open, setOpen] = useState(false)
  const activeWarehouse = warehouses.find(warehouse => String(warehouse.warehouse_id) === String(selectedWarehouseId))
  const label = activeWarehouse?.warehouse_name || 'All Inventory'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-lg font-semibold text-slate-950 transition-colors hover:bg-[#edf4fb] focus:outline-none"
      >
        <span>{label}</span>
        <ChevronDown size={15} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[9999] mt-1 min-w-[220px] overflow-hidden rounded-lg border border-[#d8e2ef] bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={() => { onSelectWarehouse('all'); setOpen(false) }}
              className="w-full px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-[#edf4fb]"
            >
              All Inventory
            </button>
            {warehouses.map(warehouse => (
              <button
                key={warehouse.warehouse_id}
                type="button"
                onClick={() => { onSelectWarehouse(String(warehouse.warehouse_id)); setOpen(false) }}
                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#edf4fb]"
              >
                <span className="block truncate font-medium">{warehouse.warehouse_name}</span>
                <span className="block truncate text-[10px] text-slate-500">{warehouse.warehouse_code || '-'}</span>
              </button>
            ))}
            <div className="my-1 border-t border-[#e3ecf8]" />
            <button
              type="button"
              onClick={() => { onAddWarehouse(); setOpen(false) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#26324f] hover:bg-[#edf4fb]"
            >
              <Plus size={13} /> Add Warehouse
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ActionDrawer({ action, meta, prefill, onClose, onSaved, onDelete, confirm }) {
  const [form, setForm] = useState(() => {
    if (prefill) {
      return {
        ...EMPTY_ACTION_FORM,
        product_code: prefill.item_code || '',
        warehouse_id: prefill.warehouse_id || '',
        location_id: prefill.location_id || '',
        from_warehouse_id: prefill.warehouse_id || '',
        quantity: prefill.quantity_on_hand != null ? String(prefill.quantity_on_hand) : '',
        reorder_level: prefill.reorder_level != null ? String(prefill.reorder_level) : '',
        unit_cost: prefill.unit_cost != null ? String(prefill.unit_cost) : '',
      }
    }
    return EMPTY_ACTION_FORM
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [availableLocations, setAvailableLocations] = useState([])
  const config = action ? ACTIONS[action] : null
  const isOpen = Boolean(action)
  const isAdd = action === 'add'
  const isEditingStock = isAdd && Boolean(prefill)

  useEffect(() => {
    let cancelled = false
    async function loadLocations() {
      const rows = form.warehouse_id
        ? await fetchInventoryLocations(form.warehouse_id).catch(() => [])
        : []
      if (!cancelled) setAvailableLocations(rows)
    }
    loadLocations()
    return () => { cancelled = true }
  }, [form.warehouse_id])

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  function validateStockAgainstMasterData() {
    const product = (meta?.products || []).find(item => String(item.product_code) === String(form.product_code))
    if (!product) {
      throw new Error('Product must exist in Master Data before it can be added to inventory.')
    }

    const warehouse = (meta?.warehouses || []).find(item => String(item.warehouse_id) === String(form.warehouse_id))
    if (!warehouse) {
      throw new Error('Select a valid warehouse from Inventory master data.')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      validateStockAgainstMasterData()
      const stockPayload = {
        product_code: form.product_code,
        warehouse_id: form.warehouse_id,
        location_id: form.location_id || null,
        quantity_on_hand: Number(form.quantity || 0),
        reorder_level: Number(form.reorder_level || 0),
        unit_cost: Number(form.unit_cost || 0),
      }
      if (isEditingStock && prefill?.stock_id) {
        await updateInventoryStock(prefill.stock_id, stockPayload)
      } else {
        await createInventoryStock(stockPayload)
      }

      onSaved()
      setForm(EMPTY_ACTION_FORM)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!prefill?.stock_id || !onDelete) return
    const label = prefill.item_name || prefill.item_code || 'this inventory item'
    const ok = await confirm({
      title: 'Delete inventory item?',
      message: `Delete ${label} from inventory? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    try {
      await onDelete(prefill)
    } catch (err) {
      setError(err.message || String(err))
      setSaving(false)
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div className={`fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-[#d8e2ef] bg-[#edf4fb] shadow-2xl transition-all ${isOpen ? '-translate-x-1/2 -translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-x-1/2 -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between border-b border-[#d8e2ef] bg-[#e9eef8] px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-slate-950">{isEditingStock ? 'Edit Item' : config?.title}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {isEditingStock ? 'Update this inventory stock row' : 'Create a stock row for an existing product'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#f6f8fc] hover:text-slate-950">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Field label="Product Master Item">
            <Select value={form.product_code} onChange={event => setField('product_code', event.target.value)} required>
              <option value="">Select product</option>
              {(meta?.products || []).map(product => (
                <option key={product.product_code} value={product.product_code}>
                  {displayInventoryCode(product.product_code)} - {product.product_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Warehouse">
            <Select value={form.warehouse_id} onChange={event => setForm(prev => ({ ...prev, warehouse_id: event.target.value, location_id: '' }))} required>
              <option value="">Select</option>
              {(meta?.warehouses || []).map(warehouse => (
                <option key={warehouse.warehouse_id} value={warehouse.warehouse_id}>{warehouse.warehouse_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Area (Optional)">
            <Select value={form.location_id} onChange={event => setField('location_id', event.target.value)}>
              <option value="">None</option>
              {availableLocations.map(loc => (
                <option key={loc.location_id} value={loc.location_id}>{loc.location_code} - {loc.location_name}</option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Quantity">
              <Input type="number" min="0" step="1" value={form.quantity} onChange={event => setField('quantity', event.target.value)} required />
            </Field>
            <Field label="Minimum Stock On Hand">
              <Input type="number" min="0" step="1" value={form.reorder_level} onChange={event => setField('reorder_level', event.target.value)} />
            </Field>
            <Field label="Unit Cost">
              <Input type="number" min="0" step="1" value={form.unit_cost} onChange={event => setField('unit_cost', event.target.value)} placeholder="Optional" />
            </Field>
          </div>

          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}

          <div className="flex gap-3 pt-2">
            {isEditingStock && (
              <Button type="button" variant="outline" size="md" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={handleDelete} disabled={saving}>
                <Trash2 size={14} /> Delete
              </Button>
            )}
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={saving}>
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : isEditingStock ? 'Save Changes' : config?.title}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

function WarehouseDrawer({ open, warehouse, onClose, onSaved }) {
  const isEditing = Boolean(warehouse?.warehouse_id)
  const [form, setForm] = useState(() => warehouse ? {
    warehouse_code: warehouse.warehouse_code || '',
    warehouse_name: warehouse.warehouse_name || '',
    address: warehouse.address || '',
    contact_person: warehouse.contact_person || '',
    contact_number: warehouse.contact_number || '',
    status: warehouse.status || 'ACTIVE',
  } : EMPTY_WAREHOUSE_FORM)
  const [areas, setAreas] = useState(() => warehouse ? [] : [{ location_code: '', location_name: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !warehouse) return undefined
    let cancelled = false
    fetchInventoryLocations(warehouse.warehouse_id)
      .then(rows => {
        if (!cancelled) {
          setAreas((rows || []).map(row => ({
            location_id: row.location_id,
            location_code: row.location_code || '',
            location_name: row.location_name || '',
          })))
        }
      })
      .catch(() => {
        if (!cancelled) setAreas([])
      })
    return () => { cancelled = true }
  }, [open, warehouse])

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  function setArea(index, field, value) {
    setAreas(prev => prev.map((area, areaIndex) => (
      areaIndex === index ? { ...area, [field]: value } : area
    )))
    setError(null)
  }

  function addAreaRow() {
    setAreas(prev => [...prev, { location_code: '', location_name: '' }])
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const warehousePayload = {
        warehouse_code: form.warehouse_code.trim().toUpperCase(),
        warehouse_name: form.warehouse_name.trim(),
        address: form.address.trim() || null,
        contact_person: form.contact_person.trim() || null,
        contact_number: form.contact_number.trim() || null,
        status: form.status,
      }
      const savedWarehouse = isEditing
        ? await updateWarehouse(warehouse.warehouse_id, warehousePayload)
        : await createWarehouse(warehousePayload)
      const warehouseId = savedWarehouse.warehouse_id || warehouse?.warehouse_id

      const areaRows = areas
        .map(area => ({
          ...area,
          location_code: area.location_code.trim().toUpperCase(),
          location_name: area.location_name.trim(),
        }))
        .filter(area => area.location_code || area.location_name)

      for (const area of areaRows) {
        const payload = {
          warehouse_id: String(warehouseId),
          location_code: area.location_code || area.location_name.toUpperCase().replace(/\s+/g, '-'),
          location_name: area.location_name || area.location_code,
          location_type: 'STORAGE',
          status: 'ACTIVE',
        }
        if (area.location_id) {
          await updateInventoryLocation(area.location_id, payload)
        } else {
          await createInventoryLocation(payload)
        }
      }

      setForm(EMPTY_WAREHOUSE_FORM)
      setAreas([{ location_code: '', location_name: '' }])
      onSaved()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalFrame
      open={open}
      title={isEditing ? 'Edit Warehouse' : 'Add Warehouse'}
      subtitle={isEditing ? 'Update warehouse details and areas.' : 'Create a warehouse card and its areas.'}
      onClose={onClose}
      className="w-[min(520px,calc(100vw-2rem))]"
    >
      <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Warehouse Code">
            <Input value={form.warehouse_code} onChange={event => setField('warehouse_code', event.target.value)} placeholder="WH-MAIN" required />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={event => setField('status', event.target.value)} required>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </Field>
        </div>
        <Field label="Warehouse Name">
          <Input value={form.warehouse_name} onChange={event => setField('warehouse_name', event.target.value)} placeholder="Main Warehouse" required />
        </Field>
        <Field label="Address">
          <textarea
            value={form.address}
            onChange={event => setField('address', event.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-[#d8e2ef] bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#2c3a61] focus:outline-none focus:ring-1 focus:ring-[#2c3a61]/40"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Person">
            <Input value={form.contact_person} onChange={event => setField('contact_person', event.target.value)} />
          </Field>
          <Field label="Contact Number">
            <Input value={form.contact_number} onChange={event => setField('contact_number', event.target.value)} />
          </Field>
        </div>
        <div className="space-y-2 rounded-lg border border-[#d8e2ef] bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Areas</p>
            <button type="button" onClick={addAreaRow} className="text-xs font-semibold text-[#2c3a61] hover:underline">Add</button>
          </div>
          {areas.map((area, index) => (
            <div key={area.location_id || index} className="grid grid-cols-[0.8fr_1.2fr] gap-2">
              <Input
                value={area.location_code}
                onChange={event => setArea(index, 'location_code', event.target.value)}
                placeholder="Area code"
              />
              <Input
                value={area.location_name}
                onChange={event => setArea(index, 'location_name', event.target.value)}
                placeholder="Area name"
              />
            </div>
          ))}
        </div>
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="md" className="flex-1" disabled={saving}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : isEditing ? 'Save Warehouse' : 'Create Warehouse'}
          </Button>
        </div>
      </form>
    </ModalFrame>
  )
}

function ItemAreaModal({ item, onClose, onSaved }) {
  const [locationId, setLocationId] = useState(item?.location_id || '')
  const [locations, setLocations] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const open = Boolean(item)

  useEffect(() => {
    let cancelled = false
    async function loadLocations() {
      const rows = item?.warehouse_id ? await fetchInventoryLocations(item.warehouse_id).catch(() => []) : []
      if (!cancelled) setLocations(rows)
    }
    loadLocations()
    return () => { cancelled = true }
  }, [item])

  async function submit(event) {
    event.preventDefault()
    if (!item?.stock_id) return
    setSaving(true)
    setError(null)
    try {
      await updateInventoryStockLocation(item.stock_id, { location_id: locationId || null })
      onSaved()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalFrame open={open} title="Edit Item Area" subtitle={`${item?.item_name || ''} - ${item?.warehouse || ''}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 px-6 py-5">
        <Field label="Area">
          <Select value={locationId} onChange={event => setLocationId(event.target.value)} autoFocus>
            <option value="">None</option>
            {locations.map(location => (
              <option key={location.location_id} value={location.location_id}>
                {location.location_code} - {location.location_name}
              </option>
            ))}
          </Select>
        </Field>
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="md" className="flex-1" disabled={saving}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save Area'}
          </Button>
        </div>
      </form>
    </ModalFrame>
  )
}

export function ReceiveTransferModal({ item, onClose, onSaved }) {
  const [locationId, setLocationId] = useState(item?.location_id || '')
  const [receivedQuantity, setReceivedQuantity] = useState(String(item?.quantity_on_hand || ''))
  const [locations, setLocations] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const open = Boolean(item)

  useEffect(() => {
    let cancelled = false
    const initialize = setTimeout(() => {
      if (cancelled) return
      setLocationId(item?.location_id || '')
      setReceivedQuantity(String(item?.quantity_on_hand || ''))
    }, 0)
    async function loadLocations() {
      const rows = item?.warehouse_id ? await fetchInventoryLocations(item.warehouse_id).catch(() => []) : []
      if (!cancelled) setLocations(rows)
    }
    loadLocations()
    return () => {
      cancelled = true
      clearTimeout(initialize)
    }
  }, [item])

  async function submit(event) {
    event.preventDefault()
    if (!item?.pending_transfer_id) return
    setSaving(true)
    setError(null)
    try {
      await receivePendingTransfer(item.pending_transfer_id, {
        location_id: locationId || null,
        received_quantity: Number(receivedQuantity),
      })
      onSaved()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalFrame open={open} title="Receive Pending Stock" subtitle={`${item?.item_name || ''} to ${item?.warehouse || ''}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 px-6 py-5">
        <div className="rounded-lg border border-[#d8e2ef] bg-white px-3 py-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">From</p>
              <p className="mt-1 font-semibold text-slate-900">{item?.from_warehouse || '-'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Available to receive</p>
              <p className="mt-1 font-semibold text-slate-900">{qty(item?.quantity_on_hand)} {item?.uom || ''}</p>
            </div>
          </div>
        </div>
        <Field label={`Quantity to Receive / Total Pending (${item?.uom || '-'})`}>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0.01"
              max={item?.quantity_on_hand || 0}
              step="0.01"
              value={receivedQuantity}
              onChange={event => setReceivedQuantity(event.target.value)}
              required
              autoFocus
              className="flex-1"
            />
            <span className="shrink-0 text-sm font-semibold text-slate-700">/ {qty(item?.quantity_on_hand)} {item?.uom || ''}</span>
          </div>
        </Field>
        <p className="text-xs text-slate-500">Any unreceived balance stays in Pending Stock until it is received later.</p>
        <Field label="Receiving Area">
          <Select value={locationId} onChange={event => setLocationId(event.target.value)}>
            <option value="">None</option>
            {locations.map(location => (
              <option key={location.location_id} value={location.location_id}>
                {location.location_code} - {location.location_name}
              </option>
            ))}
          </Select>
        </Field>
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="md" className="flex-1" disabled={saving || Number(receivedQuantity) <= 0 || Number(receivedQuantity) > Number(item?.quantity_on_hand || 0)}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Receiving...</> : 'Receive Stock'}
          </Button>
        </div>
      </form>
    </ModalFrame>
  )
}

function InternalTransferModal({ item, onClose, onSaved, onCreatePR }) {
  const [options, setOptions] = useState(null)
  const [sellerStockId, setSellerStockId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [shortage, setShortage] = useState(null)
  const open = Boolean(item)

  useEffect(() => {
    let cancelled = false
    const initialize = setTimeout(() => {
      if (cancelled) return
      setOptions(null)
      setSellerStockId('')
      setQuantity('')
      setError(null)
      setShortage(null)
      if (!item?.purchase_order_item_id) {
        setLoading(false)
        return
      }
      setLoading(true)
      fetchInternalTransferOptions(item.purchase_order_item_id)
        .then(data => {
          if (cancelled) return
          setOptions(data)
          const firstStock = data.source_stocks?.[0]
          if (firstStock) {
            setSellerStockId(String(firstStock.stock_id))
            setQuantity(String(Math.min(Number(data.remaining_quantity || 0), Number(firstStock.available_quantity || 0))))
          }
        })
        .catch(err => !cancelled && setError(err.message || String(err)))
        .finally(() => !cancelled && setLoading(false))
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(initialize)
    }
  }, [item])

  const selectedStock = options?.source_stocks?.find(stock => String(stock.stock_id) === String(sellerStockId))
  const noStockShortage = options && !(options.source_stocks || []).length ? {
    code: 'INSUFFICIENT_STOCK',
    message: `${options.seller_entity} has no available stock for this item.`,
    prefill: {
      prefill_entity: options.buyer_entity,
      prefill_warehouse_id: options.buyer_warehouse_id,
      prefill_remarks: `Inter-company transfer shortage from ${options.seller_entity} for PO ${options.po_number}: no stock is currently available.`,
      prefill_items: [{
        product_code: options.buyer_product_code,
        item_description: options.item_description || options.buyer_product_code,
        unit: options.unit || 'Nos',
        quantity: Number(options.remaining_quantity || 0),
        estimated_unit_cost: Number(options.estimated_unit_cost || 0),
      }],
    },
  } : null
  const effectiveShortage = shortage || noStockShortage

  async function submit(event) {
    event.preventDefault()
    if (!item?.purchase_order_item_id || !sellerStockId) return
    setSaving(true)
    setError(null)
    setShortage(null)
    try {
      await createInternalTransfer({
        items: [{
          purchase_order_item_id: item.purchase_order_item_id,
          seller_stock_id: Number(sellerStockId),
          quantity: Number(quantity),
        }],
      })
      onSaved()
    } catch (err) {
      if (err.details?.code === 'INSUFFICIENT_STOCK') setShortage(err.details)
      else setError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalFrame open={open} title="Manual Inter-company Transfer" subtitle={`${options?.seller_entity || 'Seller'} → ${options?.buyer_entity || 'Buyer'}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 px-6 py-5">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" /> Loading seller stock...</div>
        ) : options && (
          <>
            <div className="rounded-lg border border-[#d8e2ef] bg-white px-3 py-3 text-xs">
              <p className="font-semibold text-slate-900">{options.item_description || options.buyer_product_code}</p>
              <p className="mt-1 text-slate-500">Buyer code: {options.buyer_product_code} · Seller code: {options.seller_product_code}</p>
              <p className="mt-1 text-slate-500">Still needed on PO: {qty(options.remaining_quantity)} {options.unit}</p>
            </div>
            {(options.source_stocks || []).length > 0 && (
              <>
                <Field label="Seller Stock Source">
                  <Select value={sellerStockId} onChange={event => setSellerStockId(event.target.value)} required>
                    {options.source_stocks.map(stock => (
                      <option key={stock.stock_id} value={stock.stock_id}>
                        {stock.warehouse_name} — available {qty(stock.available_quantity)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quantity to Transfer">
                  <Input type="number" min="0.01" max={Math.min(Number(options.remaining_quantity || 0), Number(selectedStock?.available_quantity || 0))} step="0.01" value={quantity} onChange={event => setQuantity(event.target.value)} required />
                </Field>
              </>
            )}
          </>
        )}
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}
        {effectiveShortage && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
            <p>{effectiveShortage.message}</p>
            <p>Insufficient stock. Create a PR for the buyer to procure the remaining quantity.</p>
            <Button type="button" size="sm" onClick={() => onCreatePR(effectiveShortage.prefill)}>Create PR</Button>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" size="md" className="flex-1" disabled={saving || loading || !sellerStockId || Number(quantity) <= 0 || Number(quantity) > Math.min(Number(options?.remaining_quantity || 0), Number(selectedStock?.available_quantity || 0))}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Transferring...</> : 'Transfer to Pending Stock'}
          </Button>
        </div>
      </form>
    </ModalFrame>
  )
}

function StockTable({
  items,
  onOpenItem,
  onReceivePending,
  onManualTransfer,
  titleControl,
  actionsControl,
  loading = false,
  emptyText = 'No inventory stock records found',
  highlightPo = '',
}) {
  const [search, setSearch] = useState('')
  const highlightRef = useRef(null)
  const hasScrolled = useRef(false)
  const normalizedSearch = search.trim().toLowerCase()
  const filteredItems = normalizedSearch
    ? items.filter(item => [
        item.item_name,
        item.item_code,
        item.brand,
        item.warehouse,
        item.location,
        item.uom,
        statusLabel(item.status),
      ].some(value => String(value || '').toLowerCase().includes(normalizedSearch)))
    : items

  function rowKey(item) {
    return item.stock_id || `${item.item_code}-${item.warehouse}-${item.location || 'none'}`
  }

  const firstHighlightItem = highlightPo ? filteredItems.find(item => item.po_number === highlightPo) : null
  const firstHighlightKey = firstHighlightItem ? rowKey(firstHighlightItem) : null

  useEffect(() => {
    if (highlightPo && highlightRef.current && !hasScrolled.current) {
      hasScrolled.current = true
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }
  }, [highlightPo, filteredItems])

  const hasActions = Boolean(onReceivePending || onManualTransfer)
  const gridClass = hasActions ? STOCK_ACTION_GRID : STOCK_GRID
  const headers = hasActions ? ['Item', 'Warehouse', 'Area', 'Stock', 'Available', 'Actions'] : ['Item', 'Warehouse', 'Area', 'Stock', 'Available']

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <InventoryCardHeader
        titleControl={titleControl ?? <CardTitle>All Inventory</CardTitle>}
        actionsControl={actionsControl}
      >
        <div className="flex h-8 w-56 items-center gap-2 rounded-lg border border-[#d8e2ef] bg-white px-3">
          <Search size={13} className="shrink-0 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search inventory"
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-900">
              <X size={11} />
            </button>
          )}
        </div>
      </InventoryCardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className={`grid ${gridClass} gap-4 border-y border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5`}>
          {headers.map(label => (
            <span key={label} className={`text-[10px] font-semibold uppercase tracking-widest text-slate-600 ${['Stock', 'Available'].includes(label) ? 'text-center' : label === 'Actions' ? 'text-right' : ''}`}>{label}</span>
          ))}
        </div>
        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center gap-2 py-16 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin" /> Loading inventory...
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState title={emptyText} icon={Boxes} />
        ) : (
          <div className="min-h-0 flex-1 divide-y divide-[#e9eef8] overflow-auto">
            {filteredItems.map(item => {
              const key = rowKey(item)
              const canReceive = Boolean(onReceivePending && item.is_pending_transfer && Number(item.quantity_on_hand) > 0)
              const canManualTransfer = Boolean(onManualTransfer && item.is_internal_transfer)
              const canOpen = Boolean(onOpenItem && item.barcode)
              const isHighlighted = Boolean(highlightPo && item.po_number && item.po_number === highlightPo)

              return (
                <div
                  key={key}
                  ref={isHighlighted && key === firstHighlightKey ? highlightRef : undefined}
                  className={`grid ${gridClass} items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[#edf4fb] ${canOpen ? 'cursor-pointer' : ''} ${isHighlighted ? 'bg-blue-50 border-l-4 border-l-blue-500 ring-1 ring-blue-200' : ''}`}
                  onClick={canOpen ? () => onOpenItem(item) : undefined}
                  role={canOpen ? 'button' : undefined}
                  tabIndex={canOpen ? 0 : undefined}
                  onKeyDown={canOpen ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpenItem(item)
                    }
                  } : undefined}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{item.item_name}</p>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {displayInventoryCode(item.item_code)} - {item.brand || '-'}
                    </p>
                  </div>
                  <p className="truncate text-xs text-slate-600">{item.warehouse}</p>
                  <p className="truncate text-xs text-slate-600">{item.location || '-'}</p>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-950">
                      {qty(item.quantity_on_hand)} <span className="text-[10px] font-medium uppercase text-slate-500">{item.uom}</span>
                    </p>
                    <p className="text-[10px] text-slate-600">Reserved {qty(item.reserved_quantity)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-950">
                      {qty(item.available_quantity)} <span className="text-[10px] font-medium uppercase text-slate-500">{item.uom}</span>
                    </p>
                    <p className="text-[10px] text-slate-600">Min. {qty(item.reorder_level)}</p>
                  </div>
                  {hasActions && (
                    <div className="flex items-center justify-end gap-2">
                      {canManualTransfer && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onManualTransfer(item)
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-800 transition-colors hover:bg-violet-100"
                      >
                        <ArrowRightLeft size={13} />
                        <span>Transfer</span>
                      </button>
                      )}
                      {canReceive && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onReceivePending(item)
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[#b8c8df] bg-[#edf4fb] px-2.5 py-1.5 text-xs font-medium text-[#26324f] transition-colors hover:bg-[#e3ecf8]"
                      >
                        <PackageCheck size={13} />
                        <span>Receive</span>
                      </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function InventoryList() {
  useOutletContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { confirm, confirmDialogProps } = useConfirmDialog()
  const [data, setData] = useState(null)
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [action, setAction] = useState(null)
  const [actionPrefill, setActionPrefill] = useState(null)
  const [warehouseDrawerOpen, setWarehouseDrawerOpen] = useState(false)
  const [warehousePrefill, setWarehousePrefill] = useState(null)
  const [areaEditItem, setAreaEditItem] = useState(null)
  const [receiveItem, setReceiveItem] = useState(null)
  const [transferItem, setTransferItem] = useState(null)
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [showNewItemsOnly, setShowNewItemsOnly] = useState(() => ['pending', 'pending-stock'].includes(searchParams.get('view')))
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('all')
  const [selectedCompany, setSelectedCompany] = useState('All')
  const [newItemAlert, setNewItemAlert] = useState(() => window.localStorage.getItem('inventory_new_item_alert') || '')
  const [detailItem, setDetailItem] = useState(null)

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
  useEffect(() => {
    const timer = setTimeout(() => {
      const view = searchParams.get('view')
      if (['pending', 'pending-stock'].includes(view)) {
        setShowNewItemsOnly(true)
        setShowLowStockOnly(false)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [searchParams])

  const items = [...(data?.items || [])].sort(byItemCode)
  const lowStockItems = items.filter(item => item.status === 'LOW_STOCK' || item.status === 'OUT_OF_STOCK')
  const pendingTransferItems = data?.pending_transfer_items || []
  const pendingItems = pendingTransferItems
  const stockedItems = items.filter(item => item.stock_id)
  const baseListItems = showNewItemsOnly ? pendingItems : showLowStockOnly ? lowStockItems.filter(item => item.stock_id) : stockedItems
  const companyFilteredItems = selectedCompany === 'All'
    ? baseListItems
    : baseListItems.filter(item => companyFromInventoryCode(item.item_code) === selectedCompany)
  const warehouseFilteredItems = selectedWarehouseId === 'all'
    ? companyFilteredItems
    : companyFilteredItems.filter(item => String(item.warehouse_id) === String(selectedWarehouseId))
  const listItems = selectedWarehouseId === 'all' && !showNewItemsOnly
    ? aggregateInventoryByProduct(warehouseFilteredItems).sort(byItemCode)
    : warehouseFilteredItems
  const isInitialLoading = loading && !data
  const isTableRefreshing = loading && Boolean(data)

  const openWarehouseDrawer = useCallback((warehouse = null) => {
    setWarehousePrefill(warehouse)
    setWarehouseDrawerOpen(true)
  }, [])

  const viewTitle = (
    <InventoryTitleDropdown
      selectedWarehouseId={selectedWarehouseId}
      warehouses={meta?.warehouses || []}
      onSelectWarehouse={setSelectedWarehouseId}
      onAddWarehouse={() => openWarehouseDrawer()}
    />
  )

  function handleActionSaved() {
    setAction(null)
    setActionPrefill(null)
    load()
  }

  async function handleStockDelete(item) {
    await deleteInventoryStock(item.stock_id)
    setAction(null)
    setActionPrefill(null)
    await load()
  }

  function closeActionDrawer() {
    setAction(null)
    setActionPrefill(null)
  }

  function closeWarehouseDrawer() {
    setWarehouseDrawerOpen(false)
    setWarehousePrefill(null)
  }

  function handleWarehouseSaved() {
    closeWarehouseDrawer()
    load()
  }

  function handleAreaSaved() {
    setAreaEditItem(null)
    load()
  }

  function handleTransferReceived() {
    setReceiveItem(null)
    load()
  }

  function handleInternalTransferSaved() {
    setTransferItem(null)
    load()
  }

  function handleCreateShortagePR(prefill) {
    setTransferItem(null)
    navigate('/purchasing/requests/new', {
      state: { from: 'internal-transfer', ...prefill },
    })
  }

  function handleMinimumSaved(minimumAmount) {
    setDetailItem(prev => prev ? { ...prev, reorder_level: minimumAmount } : prev)
    load()
  }

  function handleProductSaved(product) {
    const nextSellingPrice = Number(product?.selling_price_margin || 0)
    setDetailItem(prev => prev ? {
      ...prev,
      item_name: product?.product_name || prev.item_name,
      product_description: product?.product_description ?? prev.product_description,
      brand: product?.product_brand || '-',
      uom: product?.unit || prev.uom,
      buying_price_vat: Number(product?.buying_price_vat || prev.buying_price_vat || 0),
      selling_price_margin: nextSellingPrice,
      supplier_name: product?.supplier_name || prev.supplier_name,
      product_master_quantity: Number(product?.quantity || prev.product_master_quantity || 0),
    } : prev)
    load()
  }

  function openReservedProject(project) {
    if (!project?.project_id) return
    setDetailItem(null)
    navigate('/projects', {
      state: {
        project_id: project.project_id,
        highlight: project.project_code || project.project_name || '',
      },
    })
  }

  function exportInventory() {
    const headers = ['Item Code', 'Item Name', 'Brand', 'UOM', 'Warehouse', 'Stock', 'Reserved', 'Available', 'Min. Amount', 'Unit Cost', 'Inventory Value', 'Status']
    const rows = listItems.map(item => [
      item.item_code,
      item.item_name,
      item.brand,
      item.uom,
      item.warehouse,
      item.quantity_on_hand,
      item.reserved_quantity,
      item.available_quantity,
      item.reorder_level,
      item.unit_cost,
      item.inventory_value,
      statusLabel(item.status),
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'inventory.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  function printStockCard() {
    window.print()
  }

  function renderToolbarActions() {
    function setListView(view) {
      const next = new URLSearchParams(searchParams)
      if (view) next.set('view', view)
      else next.delete('view')
      setSearchParams(next, { replace: true })
    }

    return (
      <>
        <Select
          className="h-8 w-36 text-xs"
          value={selectedCompany}
          onChange={event => setSelectedCompany(event.target.value)}
          aria-label="Filter inventory by company"
        >
          <option value="All">All companies</option>
          {COMPANY_OPTIONS.map(company => (
            <option key={company} value={company}>{company}</option>
          ))}
        </Select>
        <Button size="sm" onClick={() => navigate('/purchasing')}><PackageCheck size={14} /> Add Item</Button>
        <Button
          variant={showNewItemsOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            const nextValue = !showNewItemsOnly
            setShowNewItemsOnly(nextValue)
            setListView(nextValue ? 'pending-stock' : null)
            setShowLowStockOnly(false)
          }}
        >
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-current px-1.5 text-[11px] font-semibold leading-none">{pendingItems.length}</span>
          Pending Stock
        </Button>
        <Button
          variant={showLowStockOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setShowLowStockOnly(value => !value)
            setShowNewItemsOnly(false)
            setListView(null)
          }}
        >
          <AlertCircle size={14} /> Low Stock
        </Button>
        <Button variant="outline" size="sm" onClick={printStockCard}><Printer size={14} /> Print</Button>
        <Button variant="outline" size="sm" onClick={exportInventory}><Download size={14} /> Export</Button>
      </>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 px-6 py-5 overflow-hidden">
          {isInitialLoading ? (
            <Card className="flex items-center justify-center gap-2 py-20 text-slate-500">
              <Loader2 size={18} className="animate-spin" /> Loading inventory...
            </Card>
          ) : error && !data ? (
            <Card className="flex items-center justify-center gap-2 py-20 text-rose-500">
              <AlertCircle size={18} /> {error}
            </Card>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              {newItemAlert && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                  <AlertCircle size={16} />
                  <span>{newItemAlert}</span>
                  <button
                    type="button"
                    className="ml-auto text-amber-700 hover:text-amber-950"
                    onClick={() => {
                      window.localStorage.removeItem('inventory_new_item_alert')
                      setNewItemAlert('')
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <StockTable
                titleControl={viewTitle}
                actionsControl={renderToolbarActions()}
                items={listItems}
                loading={isTableRefreshing}
                onOpenItem={setDetailItem}
                onReceivePending={showNewItemsOnly ? setReceiveItem : null}
                onManualTransfer={showNewItemsOnly ? setTransferItem : null}
                emptyText={showNewItemsOnly ? 'No pending stock found' : showLowStockOnly ? 'No low stock records found' : 'No inventory stock records found'}
                highlightPo={searchParams.get('highlight') || ''}
              />
            </div>
          )}
        </main>
      </div>

      <ItemDetailDrawer
        key={detailItem?.detail_key || detailItem?.stock_id || 'detail-closed'}
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onOpenProject={openReservedProject}
        onMinimumSaved={handleMinimumSaved}
        onProductSaved={handleProductSaved}
      />
      <ItemAreaModal
        key={areaEditItem?.stock_id || 'area-closed'}
        item={areaEditItem}
        onClose={() => setAreaEditItem(null)}
        onSaved={handleAreaSaved}
      />
      <ReceiveTransferModal
        key={receiveItem?.pending_transfer_id || 'receive-closed'}
        item={receiveItem}
        onClose={() => setReceiveItem(null)}
        onSaved={handleTransferReceived}
      />
      <InternalTransferModal
        key={transferItem?.pending_transfer_id || 'internal-transfer-closed'}
        item={transferItem}
        onClose={() => setTransferItem(null)}
        onSaved={handleInternalTransferSaved}
        onCreatePR={handleCreateShortagePR}
      />
      <ActionDrawer
        key={action || 'closed'}
        action={action}
        meta={meta}
        prefill={actionPrefill}
        onClose={closeActionDrawer}
        onSaved={handleActionSaved}
        onDelete={handleStockDelete}
        confirm={confirm}
      />
      <WarehouseDrawer
        key={warehousePrefill?.warehouse_id || 'new-warehouse'}
        open={warehouseDrawerOpen}
        warehouse={warehousePrefill}
        onClose={closeWarehouseDrawer}
        onSaved={handleWarehouseSaved}
      />
      <ConfirmDialog {...confirmDialogProps} />
    </div>
  )
}
