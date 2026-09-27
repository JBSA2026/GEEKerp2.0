// ─── PurchaseRequestForm — reusable form for Create / Edit views ─────────────
import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Loader2, Plus, X } from 'lucide-react'
import {
  COMPANY_OPTIONS, DEFAULT_PURCHASE_SOURCE, EMPTY_FORM, EMPTY_ITEM,
  isInternationalPurchaseSource, money, PURCHASE_SOURCE_OPTIONS, displayInventoryCode,
} from './purchasingUtils'

export function PurchaseRequestForm({ initial, meta, catalogEntity, onEntityChange, onSellerEntityChange, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const catalogReady = catalogEntity === form.entity
  const internationalPurchase = isInternationalPurchaseSource(form.purchase_source)
  const internalPurchase = form.purchase_source === 'INTERCOMPANY'
  const currencyCode = form.currency_code || (internationalPurchase ? 'USD' : 'PHP')
  const products = useMemo(() => {
    if (!catalogReady) return []
    return internalPurchase ? (meta?.internal_products || []) : (meta?.standard_products || [])
  }, [catalogReady, internalPurchase, meta])
  const internalSuppliers = meta?.internal_suppliers || []
  const sellerProducts = internalPurchase ? (meta?.seller_products || []) : []
  const warehouses = meta?.warehouses || []

  // Only autofill zero-valued estimates from the latest PO base unit cost.
  // Product buying prices can include VAT, so they are not a PR estimate source.
  useEffect(() => {
    if (!catalogReady || !products.length) return undefined
    const timer = setTimeout(() => {
      setForm(prev => {
        let updated = false
        const items = prev.items.map(item => {
          if (item.product_code && (!item.estimated_unit_cost || Number(item.estimated_unit_cost) === 0)) {
            const product = products.find(candidate => candidate.product_code === item.product_code)
            const latestBaseUnitCost = Number(product?.latest_base_unit_cost ?? 0)
            if (Number.isFinite(latestBaseUnitCost) && latestBaseUnitCost > 0) {
              updated = true
              return { ...item, estimated_unit_cost: latestBaseUnitCost }
            }
          }
          return item
        })
        return updated ? { ...prev, items } : prev
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [catalogReady, products])

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function changeEntity(entity) {
    setForm(prev => ({
      ...prev,
      entity,
      source_supplier_id: '',
      source_seller_entity: '',
      items: prev.items.map(item => ({
        ...item,
        product_code: '',
        seller_product_code: '',
        estimated_unit_cost: 0,
      })),
    }))
    onEntityChange?.(entity)
    onSellerEntityChange?.('')
  }

  function changePurchaseSource(purchaseSource) {
    setForm(prev => ({
      ...prev,
      purchase_source: purchaseSource,
      source_supplier_id: '',
      source_seller_entity: '',
      items: prev.items.map(item => ({
        ...item,
        product_code: '',
        seller_product_code: '',
        estimated_unit_cost: 0,
      })),
    }))
    onSellerEntityChange?.('')
  }

  function selectInternalSupplier(supplierId) {
    const supplier = internalSuppliers.find(row => String(row.supplier_id) === String(supplierId))
    setForm(prev => ({
      ...prev,
      source_supplier_id: supplierId,
      source_seller_entity: supplier?.seller_entity || '',
      items: prev.items.map(item => ({
        ...item,
        product_code: '',
        seller_product_code: '',
        estimated_unit_cost: 0,
      })),
    }))
    onSellerEntityChange?.(supplier?.seller_entity || '')
  }

  function setItem(index, field, value) {
    setForm(prev => {
      const items = [...prev.items]
      items[index] = { ...items[index], [field]: value }
      return { ...prev, items }
    })
  }

  function selectProduct(index, productCode) {
    const product = products.find(row => row.product_code === productCode)
    setForm(prev => {
      const items = [...prev.items]
      const current = items[index]
      items[index] = {
        ...current,
        product_code: productCode,
        seller_product_code: internalPurchase && productCode ? (product?.seller_product_code || '') : current.seller_product_code,
        item_description: productCode ? (product?.product_name || '') : current.item_description,
        unit: productCode ? (product?.unit || current.unit || 'Nos') : (current.unit || 'Nos'),
        quantity: 1,
        estimated_unit_cost: productCode ? Number(product?.latest_base_unit_cost ?? 0) : current.estimated_unit_cost,
      }
      return { ...prev, items }
    })
  }

  function selectSellerProduct(index, sellerProductCode) {
    const sellerProduct = sellerProducts.find(row => row.product_code === sellerProductCode)
    setForm(prev => {
      const items = [...prev.items]
      const current = items[index]
      items[index] = {
        ...current,
        seller_product_code: sellerProductCode,
        item_description: current.item_description || sellerProduct?.product_name || '',
        unit: sellerProductCode ? (sellerProduct?.unit || current.unit || 'Nos') : (current.unit || 'Nos'),
        estimated_unit_cost: sellerProductCode ? Number(sellerProduct?.latest_base_unit_cost ?? 0) : current.estimated_unit_cost,
      }
      return { ...prev, items }
    })
  }

  function addItem() {
    setForm(prev => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }))
  }

  function removeItem(index) {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))
  }

  function submit(event) {
    event.preventDefault()
    onSave({
      ...form,
      entity: form.entity || COMPANY_OPTIONS[0],
      purchase_source: form.purchase_source || DEFAULT_PURCHASE_SOURCE,
      source_supplier_id: internalPurchase ? Number(form.source_supplier_id) : null,
      source_seller_entity: internalPurchase ? form.source_seller_entity || null : null,
      warehouse_id: form.warehouse_id || null,
      required_date: form.required_date || null,
      items: form.items.map(item => ({
        ...item,
        product_code: item.product_code || null,
        seller_product_code: internalPurchase ? item.seller_product_code || null : null,
        item_description: item.item_description.trim(),
        unit: (item.unit || 'Nos').trim(),
        quantity: Number(item.quantity || 0),
        estimated_unit_cost: Number(item.estimated_unit_cost || 0),
      })),
    })
  }

  const itemGrid = internalPurchase
    ? 'grid-cols-[1.15fr_1.05fr_1.4fr_0.5fr_0.5fr_0.7fr_0.7fr_44px]'
    : 'grid-cols-[1.15fr_1.45fr_0.55fr_0.55fr_0.75fr_0.75fr_44px]'
  const intercompanyReady = !internalPurchase || (
    Boolean(form.source_supplier_id)
    && form.items.every(item => Boolean(item.seller_product_code) && Boolean(item.item_description.trim()))
  )

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Company">
          <Select value={form.entity || COMPANY_OPTIONS[0]} onChange={event => changeEntity(event.target.value)} required>
            {COMPANY_OPTIONS.map(company => (
              <option key={company} value={company}>{company}</option>
            ))}
          </Select>
        </Field>
        <Field label="Purchase Source">
          <Select value={form.purchase_source || DEFAULT_PURCHASE_SOURCE} onChange={event => changePurchaseSource(event.target.value)}>
            {PURCHASE_SOURCE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>
        {internalPurchase && (
          <Field label="Selling Company">
            <Select value={form.source_supplier_id} onChange={event => selectInternalSupplier(event.target.value)} required>
              <option value="">Select sister company</option>
              {internalSuppliers.map(supplier => (
                <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.seller_entity}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Warehouse">
          <Select value={form.warehouse_id} onChange={event => setField('warehouse_id', event.target.value)} required>
            <option value="">Select warehouse</option>
            {warehouses.map(warehouse => (
              <option key={warehouse.warehouse_id} value={warehouse.warehouse_id}>{warehouse.warehouse_name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Required Date">
          <Input type="date" value={form.required_date} onChange={event => setField('required_date', event.target.value)} required />
        </Field>
      </div>

      <Field label="Remarks">
        <Textarea rows={3} value={form.remarks} onChange={event => setField('remarks', event.target.value)} placeholder="Reason for purchase or stock requirement" />
      </Field>
      {!catalogReady && (
        <p className="text-xs text-amber-700">Loading the {form.entity} product catalog…</p>
      )}
      <p className="text-xs text-slate-500">
        {internalPurchase
          ? 'Choose a new buyer item or an item previously received from the selected sister company. Existing buyer items are fixed to their saved seller-stock link.'
          : 'Choose a new standard item or an existing buyer item that is not linked to an intercompany seller.'}
      </p>

      <div className="overflow-hidden rounded-lg border border-[#d8e2ef] bg-white">
        <div className={`grid ${itemGrid} gap-3 bg-[#edf4fb] px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
          <span>Buyer Product / New Item</span>
          {internalPurchase && <span>Seller Stock Item</span>}
          <span>Buyer Description</span>
          <span>Unit</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Est. Cost</span>
          <span className="text-right">Total</span>
          <span />
        </div>
        <div className="divide-y divide-[#e3ecf8]">
          {form.items.map((item, index) => (
            <div key={index} className={`grid ${itemGrid} items-center gap-3 px-4 py-3`}>
              <Select className="min-w-0 truncate" value={item.product_code} onChange={event => selectProduct(index, event.target.value)} disabled={!catalogReady}>
                <option value="">New buyer item</option>
                {products.map(product => (
                  <option key={product.product_code} value={product.product_code}>{displayInventoryCode(product.product_code)} · {product.product_name}</option>
                ))}
              </Select>
              {internalPurchase && (
                <Select
                  className="min-w-0 truncate"
                  value={item.seller_product_code || ''}
                  onChange={event => selectSellerProduct(index, event.target.value)}
                  disabled={!form.source_supplier_id || sellerProducts.length === 0 || Boolean(item.product_code)}
                  required
                >
                  <option value="">{form.source_supplier_id ? 'Select seller stock item' : 'Choose selling company first'}</option>
                  {sellerProducts.map(product => (
                    <option key={product.product_code} value={product.product_code}>
                      {displayInventoryCode(product.product_code)} · {product.product_name} — available {Number(product.available_quantity || 0)}
                    </option>
                  ))}
                </Select>
              )}
              <Input
                value={item.item_description}
                onChange={event => setItem(index, 'item_description', event.target.value)}
                placeholder={item.product_code ? 'Product description' : 'Describe the buyer item'}
                required
              />
              <Input
                value={item.unit}
                onChange={event => setItem(index, 'unit', event.target.value)}
                placeholder="roll, box"
                required
              />
              <Input className="text-right" type="number" min="0.01" step="0.01" value={item.quantity} onChange={event => setItem(index, 'quantity', event.target.value)} required />
              <Input className="text-right" type="number" min="0" step="0.01" value={item.estimated_unit_cost} onChange={event => setItem(index, 'estimated_unit_cost', event.target.value)} />
              <p className="text-right text-sm font-semibold text-slate-800">{money(Number(item.quantity || 0) * Number(item.estimated_unit_cost || 0), currencyCode)}</p>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 justify-center p-0" onClick={() => removeItem(index)} disabled={form.items.length === 1}>
                <X size={13} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <Button type="button" variant="outline" onClick={addItem}><Plus size={14} /> Add Item</Button>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || !intercompanyReady}>{saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save Purchase Request'}</Button>
        </div>
      </div>
    </form>
  )
}
