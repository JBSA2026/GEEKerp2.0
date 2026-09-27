import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { fetchInventoryMeta, fetchInventorySummary } from '@/utils/api'
import { notify } from '@/utils/toast'
import { AlertCircle, Briefcase, ChevronDown, Loader2, Package, PackageCheck, Plus, Search, X } from 'lucide-react'
import { ProductDrawer } from './ProductsTab'
import { ServiceDrawer } from './ServicesTab'
import { ItemDetailDrawer, ReceiveTransferModal } from '@/pages/inventory/InventoryList'

const BASE = import.meta.env.VITE_API_URL
const ENTITIES = ['Expedia', 'GreatnessLab', 'Exigent', 'KSI']

function authHeaders() {
  const token = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

function money(value) {
  if (value === null || value === undefined || value === '') return '—'
  return `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function catalogCompany(record) {
  return record.catalog_type === 'product' ? record.owner_entity : record.company_name
}

function catalogName(record) {
  return record.catalog_type === 'product' ? record.product_name : record.service_name
}

function normalizedProductCode(code) {
  return String(code || '').replace(/^([A-Z]{3}-\d{4}-PRD-\d{4})-\d{2}$/, '$1')
}

function StockAlertDropdown({ value, onChange, pendingCount, lowCount, affectedCount }) {
  const [open, setOpen] = useState(false)
  const count = affectedCount
  const options = [
    { id: 'all', label: 'All products', count: null },
    { id: 'pending', label: 'Pending stock', count: pendingCount },
    { id: 'low', label: 'Low stock', count: lowCount },
  ]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className={`relative inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${value === 'all' ? 'border-[#d8e2ef] bg-white text-slate-700 hover:bg-[#edf4fb]' : 'border-[#b8c8df] bg-[#edf4fb] text-[#26324f]'}`}
      >
        <AlertCircle size={14} />
        Stock alerts
        <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-[9999] mt-1 w-44 overflow-hidden rounded-lg border border-[#d8e2ef] bg-white py-1 shadow-lg">
            {options.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => { onChange(option.id); setOpen(false) }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${value === option.id ? 'bg-[#edf4fb] font-medium text-[#26324f]' : 'text-slate-700 hover:bg-[#edf4fb]'}`}
              >
                {option.label}
                {option.count !== null && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{option.count}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function PSLayout() {
  const { catalogEntity: selectedEntity = 'All' } = useOutletContext()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState([])
  const [inventorySummary, setInventorySummary] = useState(null)
  const [inventoryMeta, setInventoryMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catalogType, setCatalogType] = useState('product')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('all')
  const [stockAlert, setStockAlert] = useState('all')
  const [drawerType, setDrawerType] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [inventoryDetail, setInventoryDetail] = useState(null)
  const [receiveItem, setReceiveItem] = useState(null)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const [productLists, servicesResponse, summary, meta] = await Promise.all([
        Promise.all(ENTITIES.map(async entity => {
          const response = await fetch(`${BASE}/products/?entity=${encodeURIComponent(entity)}`, { headers: authHeaders() })
          if (!response.ok) return []
          const products = await response.json()
          return products.map(product => ({ ...product, catalog_type: 'product' }))
        })),
        fetch(`${BASE}/services/`, { headers: authHeaders() }),
        fetchInventorySummary(),
        fetchInventoryMeta(),
      ])
      const services = servicesResponse.ok ? await servicesResponse.json() : []
      setCatalog([
        ...productLists.flat(),
        ...services.map(service => ({ ...service, catalog_type: 'service' })),
      ])
      setInventorySummary(summary)
      setInventoryMeta(meta)
    } catch {
      notify.error('Unable to load the products and services catalog.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { loadCatalog() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadCatalog])

  const stockByProduct = useMemo(() => {
    const entries = new Map()
    const ensureEntry = (code) => {
      const normalizedCode = normalizedProductCode(code)
      if (!normalizedCode) return null
      if (!entries.has(normalizedCode)) {
        entries.set(normalizedCode, { quantity: 0, available: 0, warehouses: new Set(), locations: new Map(), pending: false, pendingTransfers: [], low: false })
      }
      return entries.get(normalizedCode)
    }

    for (const item of inventorySummary?.items || []) {
      const entry = ensureEntry(item.item_code)
      if (!entry) continue
      entry.quantity += Number(item.quantity_on_hand || 0)
      entry.available += Number(item.available_quantity || 0)
      const warehouseId = String(item.warehouse_id ?? item.warehouse ?? '')
      if (warehouseId) entry.warehouses.add(warehouseId)
      const locationKey = `${warehouseId}:${item.location || '-'}`
      entry.locations.set(locationKey, {
        warehouseId,
        warehouse: item.warehouse || '—',
        area: item.location || '—',
      })
      if (item.status === 'LOW_STOCK' || item.status === 'OUT_OF_STOCK') entry.low = true
    }
    for (const item of inventorySummary?.pending_transfer_items || []) {
      const entry = ensureEntry(item.item_code)
      if (entry) {
        entry.pending = true
        entry.pendingTransfers.push(item)
      }
    }
    return entries
  }, [inventorySummary])

  const pendingCount = useMemo(() => Array.from(stockByProduct.values()).filter(entry => entry.pending).length, [stockByProduct])
  const lowCount = useMemo(() => Array.from(stockByProduct.values()).filter(entry => entry.low).length, [stockByProduct])
  const affectedCount = useMemo(() => Array.from(stockByProduct.values()).filter(entry => entry.pending || entry.low).length, [stockByProduct])

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase()
    return catalog
      .filter(record => record.catalog_type === catalogType)
      .filter(record => selectedEntity === 'All' || catalogCompany(record) === selectedEntity)
      .filter(record => {
        if (catalogType !== 'product') return true
        const stock = stockByProduct.get(normalizedProductCode(record.product_code))
        if (selectedWarehouseId !== 'all' && !stock?.warehouses.has(String(selectedWarehouseId))) return false
        if (stockAlert === 'pending' && !stock?.pending) return false
        if (stockAlert === 'low' && !stock?.low) return false
        return true
      })
      .filter(record => !query || [
        catalogName(record),
        record.product_code,
        catalogCompany(record),
        record.product_brand,
        record.category,
        record.sub_category,
      ].some(value => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => catalogName(a).localeCompare(catalogName(b)))
  }, [catalog, selectedEntity, catalogType, search, selectedWarehouseId, stockAlert, stockByProduct])

  function changeCatalogType(nextType) {
    setCatalogType(nextType)
    setSelectedWarehouseId('all')
    setStockAlert('all')
  }

  function openDrawer(type, record = null) {
    setSelectedRecord(record)
    setDrawerType(type)
  }

  function openInventoryDetail(record) {
    const matchingItems = (inventorySummary?.items || []).filter(item => (
      normalizedProductCode(item.item_code) === normalizedProductCode(record.product_code)
    ))
    const scopedItems = selectedWarehouseId === 'all'
      ? matchingItems
      : matchingItems.filter(item => String(item.warehouse_id) === String(selectedWarehouseId))
    const detailItems = scopedItems.length > 0 ? scopedItems : matchingItems
    const primaryItem = detailItems[0] || {}
    const warehouseBreakdown = detailItems.map(item => ({
      warehouse_id: item.warehouse_id,
      warehouse: item.warehouse || '—',
      location: item.location || '—',
      quantity_on_hand: Number(item.quantity_on_hand || 0),
      available_quantity: Number(item.available_quantity || 0),
    }))
    const uniqueWarehouses = [...new Set(warehouseBreakdown.map(item => item.warehouse))]
    const uniqueAreas = [...new Set(warehouseBreakdown.map(item => item.location))]

    setInventoryDetail({
      ...primaryItem,
      barcode: primaryItem.barcode || record.product_code,
      item_code: record.product_code,
      item_name: record.product_name,
      brand: record.product_brand || '-',
      product_description: record.product_description,
      buying_price_vat: record.buying_price_vat,
      selling_price_margin: record.selling_price_margin,
      supplier_name: record.supplier_name,
      uom: record.unit || primaryItem.uom || '',
      stock_id: detailItems.length === 1 ? primaryItem.stock_id : null,
      warehouse: detailItems.length === 1 ? primaryItem.warehouse || '—' : uniqueWarehouses.length === 1 ? uniqueWarehouses[0] : 'Multiple warehouses',
      location: detailItems.length === 1 ? primaryItem.location || '—' : uniqueAreas.length === 1 ? uniqueAreas[0] : 'Multiple areas',
      quantity_on_hand: detailItems.reduce((total, item) => total + Number(item.quantity_on_hand || 0), 0),
      reserved_quantity: detailItems.reduce((total, item) => total + Number(item.reserved_quantity || 0), 0),
      available_quantity: detailItems.reduce((total, item) => total + Number(item.available_quantity || 0), 0),
      warehouse_breakdown: warehouseBreakdown,
    })
  }

  function openDetail(record) {
    if (record.catalog_type === 'product') {
      openInventoryDetail(record)
    } else {
      openDrawer('service', record)
    }
  }

  function openReservedProject(project) {
    if (!project?.project_id) return
    setInventoryDetail(null)
    navigate('/projects', {
      state: {
        project_id: project.project_id,
        highlight: project.project_code || project.project_name || '',
      },
    })
  }

  function handleTransferReceived() {
    setReceiveItem(null)
    loadCatalog()
  }

  const warehouseOptions = inventoryMeta?.warehouses || []
  const isProductView = catalogType === 'product'
  const pendingStockView = isProductView && stockAlert === 'pending'
  const catalogGrid = pendingStockView
    ? 'grid-cols-[minmax(13rem,1.7fr)_8rem_minmax(9rem,1fr)_9rem_8rem_11rem_8rem]'
    : 'grid-cols-[minmax(13rem,1.7fr)_8rem_minmax(9rem,1fr)_9rem_8rem_11rem]'

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col px-6 py-5">
      <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#d8e2ef] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <select
              value={catalogType}
              onChange={event => changeCatalogType(event.target.value)}
              className="h-8 bg-transparent px-1 text-sm font-semibold text-slate-950 focus:outline-none"
              aria-label="Choose products or services"
            >
              <option value="product">Products</option>
              <option value="service">Services</option>
            </select>
            {isProductView && (
              <select
                value={selectedWarehouseId}
                onChange={event => setSelectedWarehouseId(event.target.value)}
                className="h-8 max-w-48 rounded-lg border border-[#d8e2ef] bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2c3a61]/20"
                aria-label="Filter products by warehouse"
              >
                <option value="all">All warehouses</option>
                {warehouseOptions.map(warehouse => <option key={warehouse.warehouse_id} value={warehouse.warehouse_id}>{warehouse.warehouse_name}</option>)}
              </select>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isProductView && <StockAlertDropdown value={stockAlert} onChange={setStockAlert} pendingCount={pendingCount} lowCount={lowCount} affectedCount={affectedCount} />}
            <div className="flex h-8 w-52 items-center gap-2 rounded-lg border border-[#d8e2ef] bg-white px-3">
              <Search size={13} className="shrink-0 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={`Search ${isProductView ? 'products' : 'services'}`}
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-900" aria-label="Clear search">
                  <X size={12} />
                </button>
              )}
            </div>
            <Button size="sm" onClick={() => openDrawer(catalogType)}>
              {isProductView ? <Plus size={14} /> : <Briefcase size={14} />}
              {isProductView ? 'Add Product' : 'Add Service'}
            </Button>
          </div>
        </div>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[960px]">
              <div className={`grid ${catalogGrid} items-center gap-4 border-b border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5`}>
                {[...['Catalog item', 'Company', 'Brand / category', 'Warehouse', 'Area', 'Pricing / stock'], ...(pendingStockView ? ['Actions'] : [])].map(label => (
                  <span key={label} className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">{label}</span>
                ))}
              </div>
              {loading ? (
                <div className="flex min-h-full items-center justify-center gap-2 py-16 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" /> Loading {isProductView ? 'products' : 'services'}...</div>
              ) : filteredCatalog.length === 0 ? (
                <EmptyState title={`No ${isProductView ? 'products' : 'services'} found`} icon={isProductView ? Package : Briefcase}>Try changing the filters or add a new record.</EmptyState>
              ) : (
                <div className="divide-y divide-[#e9eef8]">
                  {filteredCatalog.map(record => {
                    const stock = isProductView ? stockByProduct.get(normalizedProductCode(record.product_code)) : null
                    const pendingTransfers = stock?.pendingTransfers || []
                    const nextPendingTransfer = pendingTransfers[0]
                    const category = isProductView
                      ? record.product_brand || '—'
                      : [record.category, record.sub_category].filter(Boolean).join(' / ') || '—'
                    const locations = Array.from(stock?.locations?.values() || [])
                    const relevantLocations = selectedWarehouseId === 'all'
                      ? locations
                      : locations.filter(location => location.warehouseId === String(selectedWarehouseId))
                    const warehouseNames = [...new Set(relevantLocations.map(location => location.warehouse))]
                    const areas = [...new Set(relevantLocations.map(location => location.area))]
                    const warehouseLabel = !isProductView ? '—' : warehouseNames.length === 0 ? '—' : warehouseNames.length === 1 ? warehouseNames[0] : 'Multiple warehouses'
                    const areaLabel = !isProductView ? '—' : areas.length === 0 ? '—' : areas.length === 1 ? areas[0] : 'Multiple areas'
                    return (
                      <div
                        key={`${record.catalog_type}-${record.product_code || record.service_id}`}
                        className={`grid ${catalogGrid} cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[#edf4fb] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2c3a61]`}
                        onClick={() => openDetail(record)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openDetail(record)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{catalogName(record)}</p>
                          <p className="mt-1 truncate text-[11px] text-slate-500">{isProductView ? record.product_code : `Service #${record.service_id}`}</p>
                        </div>
                        <p className="truncate text-xs text-slate-600">{catalogCompany(record) || '—'}</p>
                        <p className="truncate text-xs text-slate-600">{category}</p>
                        <p className="truncate text-xs text-slate-600">{warehouseLabel}</p>
                        <p className="truncate text-xs text-slate-600">{areaLabel}</p>
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{isProductView ? `Selling ${money(record.selling_price_margin)}` : record.margin_percentage != null ? `${record.margin_percentage}% margin` : '—'}</p>
                          <p className="mt-1 text-[10px] text-slate-600">{isProductView ? stock ? `Stock ${stock.quantity} · Available ${stock.available}` : 'No inventory stock' : record.tax_category || 'No tax category'}</p>
                        </div>
                        {pendingStockView && (
                          <div className="flex justify-start">
                            {nextPendingTransfer && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[11px]"
                                onClick={event => {
                                  event.stopPropagation()
                                  setReceiveItem(nextPendingTransfer)
                                }}
                              >
                                <PackageCheck size={12} />
                                Receive{pendingTransfers.length > 1 ? ` next (${pendingTransfers.length})` : ''}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-[#d8e2ef] bg-[#edf4fb] px-5 py-2 text-xs text-slate-600">
            {filteredCatalog.length} {isProductView ? 'product' : 'service'}{filteredCatalog.length !== 1 ? 's' : ''}
          </div>
        </CardContent>
      </Card>

      <ItemDetailDrawer
        item={inventoryDetail}
        onClose={() => setInventoryDetail(null)}
        onOpenProject={openReservedProject}
        onMinimumSaved={minimum => setInventoryDetail(current => current ? { ...current, reorder_level: minimum } : current)}
        onProductSaved={loadCatalog}
      />

      <ReceiveTransferModal
        key={receiveItem?.pending_transfer_id || 'receive-closed'}
        item={receiveItem}
        onClose={() => setReceiveItem(null)}
        onSaved={handleTransferReceived}
      />

      <ProductDrawer
        open={drawerType === 'product'}
        onClose={() => { setDrawerType(null); setSelectedRecord(null) }}
        product={drawerType === 'product' ? selectedRecord : null}
        entity={selectedEntity === 'All' ? '' : selectedEntity}
        onSaved={loadCatalog}
      />
      <ServiceDrawer
        open={drawerType === 'service'}
        onClose={() => { setDrawerType(null); setSelectedRecord(null) }}
        service={drawerType === 'service' ? selectedRecord : null}
        onSaved={loadCatalog}
      />
    </div>
  )
}
