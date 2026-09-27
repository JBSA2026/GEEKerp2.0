// ─── Shared drawers and modals for the Purchasing module ─────────────────────
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { ModalFrame, SideDrawer as Drawer } from '@/components/ui/overlay'
import { Loader2, X } from 'lucide-react'
import {
  DEFAULT_PURCHASE_SOURCE, EMPTY_SUPPLIER, api, money, displayInventoryCode,
  purchaseSourceCurrency, qty, supplierClassificationForPurchaseSource, supplierFormPayload,
} from './purchasingUtils'

// ─── FloatingPanel ──────────────────────────────────────────────────────────

export function FloatingPanel({ open, title, subtitle, children, onClose, className = '' }) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <div className={`fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-[#d8e2ef] bg-[#edf4fb] shadow-2xl transition-all ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'} ${className}`}>
        <div className="flex items-center justify-between border-b border-[#d8e2ef] bg-[#e3ecf8] px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#edf4fb] hover:text-slate-950">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

// ─── Supplier fields and modal ──────────────────────────────────────────────

export function SupplierFormFields({ form, onChange, disabled = false, idPrefix = 'supplier' }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Company Name" required>
          <Input value={form.company_name} onChange={event => onChange('company_name', event.target.value)} disabled={disabled} required />
        </Field>
        <Field label="TIN Number" required>
          <Input value={form.tin_number} onChange={event => onChange('tin_number', event.target.value)} disabled={disabled} required />
        </Field>
        <Field label="Supplier Type" required>
          <Input value={form.supplier_type} onChange={event => onChange('supplier_type', event.target.value)} placeholder="Manufacturer, Distributor, Service" disabled={disabled} required />
        </Field>
        <Field label="Classification" required>
          <Select value={form.supplier_classification} onChange={event => onChange('supplier_classification', event.target.value)} disabled={disabled} required>
            <option value="">— Select —</option>
            <option value="LOCAL">Local</option>
            <option value="INTERNATIONAL">International</option>
          </Select>
        </Field>
        <Field label="Industry" required>
          <Input value={form.industry} onChange={event => onChange('industry', event.target.value)} disabled={disabled} required />
        </Field>
        <Field label="VAT Status" required>
          <Select value={form.vat_status} onChange={event => onChange('vat_status', event.target.value)} disabled={disabled} required>
            <option value="">— Select —</option>
            <option value="VATABLE">VATABLE</option>
            <option value="NON-VAT">NON-VAT</option>
            <option value="ZERO-RATED">ZERO-RATED</option>
            <option value="VAT EXEMPT">VAT EXEMPT</option>
          </Select>
        </Field>
        <Field label="Payment Terms" required>
          <Input value={form.payment_terms} onChange={event => onChange('payment_terms', event.target.value)} placeholder="30 days, COD, 50% DP" disabled={disabled} required />
        </Field>
        <Field label="Status" required>
          <Select value={form.status} onChange={event => onChange('status', event.target.value)} disabled={disabled} required>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </div>
      <Field label="Billing Address" required>
        <Textarea rows={3} value={form.billing_address} onChange={event => onChange('billing_address', event.target.value)} disabled={disabled} required />
      </Field>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`${idPrefix}-copy-billing`}
          checked={form.address === form.billing_address && form.billing_address !== ''}
          onChange={event => onChange('address', event.target.checked ? form.billing_address : '')}
          disabled={disabled}
          className="h-3.5 w-3.5 rounded accent-[var(--color-primary)]"
        />
        <label htmlFor={`${idPrefix}-copy-billing`} className="cursor-pointer select-none text-xs text-[var(--color-muted-fg)]">Same as billing address</label>
      </div>
      <Field label="Address (Delivery / Mailing)">
        <Textarea rows={3} value={form.address} onChange={event => onChange('address', event.target.value)} placeholder="Physical or delivery address" disabled={disabled} />
      </Field>
    </>
  )
}

export function SupplierModal({ open, onClose, onSubmit, saving }) {
  const [form, setForm] = useState(EMPTY_SUPPLIER)

  useEffect(() => {
    if (!open) return undefined
    const timer = window.setTimeout(() => setForm(EMPTY_SUPPLIER), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit(supplierFormPayload(form))
  }

  return (
    <ModalFrame open={open} title="Add Supplier" subtitle="Create a supplier for RFQs, quotations, and purchase orders." onClose={onClose} className="w-[min(680px,calc(100vw-2rem))]">
      <form onSubmit={submit} className="space-y-4 overflow-y-auto bg-white px-6 py-5">
        <SupplierFormFields form={form} onChange={setField} disabled={saving} idPrefix="add-supplier" />
        <div className="flex items-center justify-end gap-2 border-t border-[#d8e2ef] pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Add Supplier
          </Button>
        </div>
      </form>
    </ModalFrame>
  )
}

// ─── RFQDrawer ──────────────────────────────────────────────────────────────

export function RFQDrawer({ open, pr, meta, onClose, onSubmit, saving }) {
  const [form, setForm] = useState({ due_date: '', supplier_ids: [], remarks: '' })
  const standardSuppliers = meta?.standard_suppliers || []
  const internalSuppliers = meta?.internal_suppliers || []
  const intercompanyPurchase = pr?.purchase_source === 'INTERCOMPANY'
  const standardSupplierClassification = supplierClassificationForPurchaseSource(
    pr?.purchase_source || DEFAULT_PURCHASE_SOURCE,
  )
  const suppliers = standardSuppliers.filter(supplier => (
    String(supplier.status || '').toLowerCase() === 'active'
    && supplier.supplier_classification === standardSupplierClassification
  ))
  const lockedSupplier = internalSuppliers.find(supplier => Number(supplier.supplier_id) === Number(pr?.source_supplier_id))

  function toggleSupplier(supplierId) {
    setForm(prev => ({
      ...prev,
      supplier_ids: prev.supplier_ids.includes(supplierId)
        ? prev.supplier_ids.filter(id => id !== supplierId)
        : [...prev.supplier_ids, supplierId],
    }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({
      due_date: form.due_date,
      supplier_ids: intercompanyPurchase ? [Number(pr.source_supplier_id)] : form.supplier_ids,
      remarks: form.remarks || null,
    })
  }

  return (
    <FloatingPanel
      open={open}
      title={intercompanyPurchase ? 'Create Intercompany Supply Request' : 'Request for Quotation'}
      subtitle={intercompanyPurchase ? 'The PR-selected sister company is the only supplier for this request.' : 'Send the purchase request to selected suppliers.'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <Field label="RFQ Due Date">
          <Input type="date" value={form.due_date} onChange={event => setForm(prev => ({ ...prev, due_date: event.target.value }))} required />
        </Field>
        {intercompanyPurchase ? (
          <Field label="Locked Selling Company">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">
              <p className="font-semibold">{lockedSupplier?.company_name || pr.source_seller_entity}</p>
              <p className="mt-0.5 text-xs text-blue-800">Selected on this purchase request</p>
            </div>
          </Field>
        ) : (
          <Field label="Suppliers">
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-[#d8e2ef] bg-white p-2">
              {suppliers.map(supplier => (
                <label key={supplier.supplier_id} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[#edf4fb]">
                  <input type="checkbox" checked={form.supplier_ids.includes(supplier.supplier_id)} onChange={() => toggleSupplier(supplier.supplier_id)} />
                  <span className="flex-1">{supplier.company_name}</span>
                  <span className="text-[11px] text-slate-500">{supplier.payment_terms}</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <Field label="Remarks">
          <Textarea rows={3} value={form.remarks} onChange={event => setForm(prev => ({ ...prev, remarks: event.target.value }))} />
        </Field>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1 justify-center" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" className="flex-1 justify-center" disabled={saving || (!intercompanyPurchase && form.supplier_ids.length === 0)}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Sending...</> : 'Create RFQ'}
          </Button>
        </div>
      </form>
    </FloatingPanel>
  )
}

// ─── QuoteDrawer ────────────────────────────────────────────────────────────

export function QuoteDrawer({ open, rfq, pr, meta, onClose, onSubmit, saving }) {
  const intercompanyPurchase = pr?.purchase_source === 'INTERCOMPANY'
  const currencyCode = pr?.currency_code || purchaseSourceCurrency(pr?.purchase_source)
  const supplierIds = new Set((rfq?.suppliers || []).map(row => row.supplier_id))
  const allSuppliers = meta?.standard_suppliers || []
  const internalSuppliers = meta?.internal_suppliers || []
  const lockedSupplier = internalSuppliers.find(supplier => Number(supplier.supplier_id) === Number(pr?.source_supplier_id))
  const suppliers = intercompanyPurchase
    ? (lockedSupplier ? [lockedSupplier] : [])
    : allSuppliers.filter(supplier => supplierIds.size === 0 || supplierIds.has(supplier.supplier_id))
  const singleSupplier = suppliers.length === 1 ? suppliers[0] : null
  const [form, setForm] = useState(() => ({
    supplier_id: intercompanyPurchase ? (pr?.source_supplier_id || '') : (singleSupplier?.supplier_id || ''),
    valid_until: '',
    delivery_date: '',
    payment_terms: lockedSupplier?.payment_terms || singleSupplier?.payment_terms || '',
    freight: 0,
    duties: 0,
    vat_code: 'VAT_INPUT',
    other_charges: 0,
    remarks: '',
    items: (pr?.items || []).map(item => ({
      product_code: item.product_code || '',
      item_description: item.item_description || item.product_name || '',
      unit: item.unit || 'Nos',
      quantity: item.quantity || 1,
      unit_cost: item.estimated_unit_cost || 0,
    })),
  }))
  const [sellerLineState, setSellerLineState] = useState({ loading: false, data: null, error: null })

  useEffect(() => {
    const supplierId = Number(form.supplier_id)
    if (intercompanyPurchase || !open || !rfq?.rfq_id || !supplierId) return undefined

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setSellerLineState({ loading: true, data: null, error: null })
    })
    api(`/purchasing/rfqs/${rfq.rfq_id}/supplier-lines?supplier_id=${supplierId}`)
      .then(data => {
        if (!cancelled) setSellerLineState({ loading: false, data, error: null })
      })
      .catch(error => {
        if (!cancelled) setSellerLineState({ loading: false, data: null, error: error.message })
      })
    return () => { cancelled = true }
  }, [form.supplier_id, intercompanyPurchase, open, rfq?.rfq_id])

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function setItem(index, field, value) {
    setForm(prev => {
      const items = [...prev.items]
      items[index] = { ...items[index], [field]: value }
      return { ...prev, items }
    })
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({
      ...form,
      supplier_id: Number(form.supplier_id),
      replace_existing: false,
      freight: Number(form.freight || 0),
      duties: Number(form.duties || 0),
      other_charges: Number(form.other_charges || 0),
      valid_until: form.valid_until,
      delivery_date: form.delivery_date,
      items: form.items.map(item => ({
        ...item,
        unit: (item.unit || 'Nos').trim(),
        quantity: Number(item.quantity || 0),
        unit_cost: Number(item.unit_cost || 0),
      })),
    })
  }

  const itemTotal = form.items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_cost || 0)), 0)
  const selectedVatCode = (meta?.vat_codes || []).find(code => code.code === form.vat_code)
  const vatRate = Number(selectedVatCode?.rate ?? (form.vat_code === 'VAT_INPUT' ? 0.12 : 0))
  const freight = Number(form.freight || 0)
  const duties = Number(form.duties || 0)
  const otherCharges = Number(form.other_charges || 0)
  const landingCost = itemTotal + freight + duties + otherCharges
  const vatAmount = landingCost * vatRate
  const totalLandingCost = landingCost + vatAmount
  const snapshotSellerLines = (pr?.items || [])
    .filter(item => item.seller_product_code)
    .map(item => ({
      buyer_product_code: item.product_code,
      buyer_item_description: item.item_description || item.product_name,
      seller_product_code: item.seller_product_code,
    }))
  const internalSupplierLines = intercompanyPurchase
    ? snapshotSellerLines
    : (Number(form.supplier_id) && sellerLineState.data?.is_internal ? sellerLineState.data.lines : [])
  const quoteBlockedByLegacyMapping = !intercompanyPurchase && Boolean(form.supplier_id) && Boolean(sellerLineState.error)

  return createPortal(
    <Drawer
      open={open}
      title={`${pr?.pr_number || 'PR'} - ${intercompanyPurchase ? 'Intercompany Supplier Quote' : 'Supplier Quote'}`}
      onClose={onClose}
      headerClassName="px-5 py-3"
    >
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier">
            <Select value={form.supplier_id} onChange={event => setField('supplier_id', event.target.value)} required disabled={intercompanyPurchase || Boolean(singleSupplier)}>
              <option value="">Select supplier</option>
              {suppliers.map(supplier => (
                <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.company_name}</option>
              ))}
              {intercompanyPurchase && !lockedSupplier && pr?.source_supplier_id && (
                <option value={pr.source_supplier_id}>{pr.source_seller_entity}</option>
              )}
            </Select>
          </Field>
          <Field label="Payment Terms">
            <Input value={form.payment_terms} onChange={event => setField('payment_terms', event.target.value)} />
          </Field>
          <Field label="Valid Until">
            <Input type="date" value={form.valid_until} onChange={event => setField('valid_until', event.target.value)} required />
          </Field>
          <Field label="Delivery Date">
            <Input type="date" value={form.delivery_date} onChange={event => setField('delivery_date', event.target.value)} required />
          </Field>
        </div>

        {!intercompanyPurchase && sellerLineState.loading && form.supplier_id && (
          <div className="flex items-center gap-2 rounded-lg border border-[#d8e2ef] bg-[#edf4fb] px-3 py-2 text-xs text-slate-600">
            <Loader2 size={14} className="animate-spin" /> Checking supplier catalog equivalents...
          </div>
        )}
        {!intercompanyPurchase && sellerLineState.error && form.supplier_id && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="font-semibold">Supplier item link required</p>
            <p className="mt-1">{sellerLineState.error}</p>
          </div>
        )}
        {internalSupplierLines.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700">
            <p className="font-semibold text-blue-950">
              {intercompanyPurchase ? `${pr.source_seller_entity} seller items selected on this PR` : `${sellerLineState.data.seller_entity} catalog items being requested`}
            </p>
            <div className="mt-2 space-y-1.5">
              {internalSupplierLines.map((line, index) => (
                <div key={`${line.buyer_product_code}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md bg-white px-2.5 py-2">
                  <span className="truncate"><span className="font-mono text-[11px]">{displayInventoryCode(line.buyer_product_code)}</span> · {line.buyer_item_description}</span>
                  <span className="text-slate-400">→</span>
                  <span className="truncate font-medium"><span className="font-mono text-[11px]">{displayInventoryCode(line.seller_product_code)}</span>{line.seller_product_name ? ` · ${line.seller_product_name}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-[#d8e2ef] bg-white p-3">
          {form.items.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_0.45fr_0.55fr_0.65fr] gap-2">
              <Input value={item.item_description} onChange={event => setItem(index, 'item_description', event.target.value)} required />
              <Input value={item.unit} onChange={event => setItem(index, 'unit', event.target.value)} placeholder="Unit" required />
              <Input className="text-right" type="number" min="0.01" step="0.01" value={item.quantity} onChange={event => setItem(index, 'quantity', event.target.value)} required />
              <Input className="text-right" type="number" min="0" step="0.01" value={item.unit_cost} onChange={event => setItem(index, 'unit_cost', event.target.value)} required />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Shipping"><Input type="number" min="0" step="0.01" value={form.freight} onChange={event => setField('freight', event.target.value)} /></Field>
          <Field label="Duties"><Input type="number" min="0" step="0.01" value={form.duties} onChange={event => setField('duties', event.target.value)} /></Field>
          <Field label="VAT Type">
            <Select value={form.vat_code} onChange={event => setField('vat_code', event.target.value)}>
              <option value="VAT_INPUT">Vatable</option>
              <option value="VAT_EXEMPT">VAT Exempt</option>
            </Select>
          </Field>
          <Field label="Brokerage"><Input type="number" min="0" step="0.01" value={form.other_charges} onChange={event => setField('other_charges', event.target.value)} /></Field>
        </div>

        <div className="rounded-lg border border-[#d8e2ef] bg-[#edf4fb] p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Item Cost</span><span className="font-semibold">{money(itemTotal, currencyCode)}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-500">Shipping</span><span>{money(freight, currencyCode)}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-500">Duties</span><span>{money(duties, currencyCode)}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-500">Brokerage</span><span>{money(otherCharges, currencyCode)}</span></div>
          <div className="mt-2 flex justify-between border-t border-[#cbd8e8] pt-2"><span className="font-semibold text-slate-700">Landing Cost</span><span className="font-semibold">{money(landingCost, currencyCode)}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-500">{form.vat_code === 'VAT_INPUT' ? `Vatable (${Number((vatRate * 100).toFixed(2))}%)` : 'VAT Exempt (0%)'}</span><span className="font-medium">{money(vatAmount, currencyCode)}</span></div>
          <div className="mt-2 flex justify-between border-t border-[#cbd8e8] pt-2 text-[#26324f]"><span className="font-semibold">Total Landing Cost</span><span className="font-bold">{money(totalLandingCost, currencyCode)}</span></div>
        </div>

        <Field label="Remarks">
          <Textarea rows={3} value={form.remarks} onChange={event => setField('remarks', event.target.value)} />
        </Field>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1 justify-center" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" className="flex-1 justify-center" disabled={saving || !form.supplier_id || quoteBlockedByLegacyMapping}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : quoteBlockedByLegacyMapping ? 'Supplier mapping required' : 'Save Quote'}
          </Button>
        </div>
      </form>
    </Drawer>,
    document.body,
  )
}

// ─── ReceiveDrawer ──────────────────────────────────────────────────────────

export function ReceiveDrawer({ open, po, pr, meta, onClose, onSubmit, saving }) {
  const lockedWarehouseId = po?.warehouse_id || pr?.warehouse_id || ''
  const lockedWarehouse = (meta?.warehouses || []).find(warehouse => String(warehouse.warehouse_id) === String(lockedWarehouseId))
  const [form, setForm] = useState(() => ({
    warehouse_id: lockedWarehouseId,
    remarks: '',
    items: (po?.items || []).map(item => ({
      purchase_order_item_id: item.purchase_order_item_id,
      product_code: item.product_code || '',
      item_description: item.item_description || item.product_name || '',
      unit: item.unit || 'Nos',
      ordered_quantity: item.quantity,
      received_quantity: Math.max(Number(item.quantity || 0) - Number(item.received_quantity || 0), 0),
      unit_cost: item.final_unit_cost || 0,
    })),
  }))

  function setItem(index, field, value) {
    setForm(prev => {
      const items = [...prev.items]
      items[index] = { ...items[index], [field]: value }
      return { ...prev, items }
    })
  }

  function submit(event) {
    event.preventDefault()
    if (!form.warehouse_id) {
      window.alert('Set a warehouse on the purchase request before receiving delivery.')
      return
    }
    const receivableItems = form.items.filter(item => Number(item.received_quantity || 0) > 0)
    onSubmit({
      warehouse_id: Number(form.warehouse_id),
      remarks: form.remarks || null,
      items: receivableItems.map(item => ({
        ...item,
        ordered_quantity: Number(item.ordered_quantity || 0),
        received_quantity: Number(item.received_quantity || 0),
        unit_cost: Number(item.unit_cost || 0),
      })),
    })
  }

  return (
    <Drawer open={open} title="Receive Items" subtitle={`Record delivery for ${po?.po_number || 'purchase order'}.`} onClose={onClose}>
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <Field label="Warehouse">
          <div className="rounded-lg border border-[#d8e2ef] bg-[#f6f8fc] px-3 py-2 text-sm font-semibold text-slate-800">
            {lockedWarehouse?.warehouse_name || 'No warehouse selected on PR'}
          </div>
        </Field>
        <div className="space-y-2 rounded-lg border border-[#d8e2ef] bg-white p-3">
          {form.items.map((item, index) => (
            <div key={item.purchase_order_item_id} className="grid grid-cols-[1fr_0.8fr_0.65fr_0.65fr] items-center gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-800">{item.item_description || displayInventoryCode(item.product_code) || 'New item'}</p>
                <p className="text-[11px] text-slate-500">Ordered {qty(item.ordered_quantity)} {item.unit || ''}</p>
              </div>
              <div className="min-w-0 rounded-lg border border-[#d8e2ef] bg-[#f6f8fc] px-3 py-2 text-xs font-semibold text-slate-700">
                <span className="block truncate">{displayInventoryCode(item.product_code) || 'Auto-generated on receive'}</span>
              </div>
              <Input className="text-right" type="number" min="0" step="0.01" value={item.received_quantity} onChange={event => setItem(index, 'received_quantity', event.target.value)} />
              <Input className="text-right" type="number" min="0" step="0.01" value={item.unit_cost} onChange={event => setItem(index, 'unit_cost', event.target.value)} />
            </div>
          ))}
        </div>
        <Field label="Remarks">
          <Textarea rows={3} value={form.remarks} onChange={event => setForm(prev => ({ ...prev, remarks: event.target.value }))} />
        </Field>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1 justify-center" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" className="flex-1 justify-center" disabled={saving || !form.warehouse_id}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Receiving...</> : 'Receive'}
          </Button>
        </div>
      </form>
    </Drawer>
  )
}
