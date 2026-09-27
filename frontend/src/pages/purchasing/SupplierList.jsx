// ─── SupplierList — /purchasing/suppliers route component ────────────────────
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form'
import { AlertCircle, Loader2, Pencil, Plus, Save, Search, ShoppingBag, X } from 'lucide-react'
import { HeaderViewDropdown } from './HeaderViewDropdown'
import { SupplierFormFields, SupplierModal } from './PurchasingDrawers'
import { api, BASE, EMPTY_SUPPLIER, supplierFormPayload, SUPPLIER_GRID } from './purchasingUtils'

function supplierFormValues(supplier) {
  return {
    ...EMPTY_SUPPLIER,
    company_name: supplier?.company_name || '',
    tin_number: supplier?.tin_number || '',
    supplier_type: supplier?.supplier_type || '',
    supplier_classification: supplier?.supplier_classification || '',
    industry: supplier?.industry || '',
    vat_status: supplier?.vat_status || '',
    billing_address: supplier?.billing_address || '',
    address: supplier?.address || '',
    payment_terms: supplier?.payment_terms || '',
    status: supplier?.status || 'active',
  }
}

function formatTimestamp(value) {
  if (!value) return '-'
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? String(value) : timestamp.toLocaleString()
}

function DetailField({ label, value, children, className = '' }) {
  const displayValue = value === null || value === undefined || value === '' ? '-' : value
  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <div className="mt-0.5 break-words text-xs font-semibold text-slate-900">{children ?? displayValue}</div>
    </div>
  )
}

function SupplierDetailOverlay({ supplier, onClose, onSave, saving, error, onClearError }) {
  const isOpen = Boolean(supplier)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => supplierFormValues(supplier))

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDraft(supplierFormValues(supplier))
      setEditing(false)
      onClearError()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [supplier, onClearError])

  function setField(field, value) {
    setDraft(previous => ({ ...previous, [field]: value }))
    onClearError()
  }

  function cancelEditing() {
    setDraft(supplierFormValues(supplier))
    setEditing(false)
    onClearError()
  }

  async function submit(event) {
    event.preventDefault()
    const savedSupplier = await onSave(supplierFormPayload(draft))
    if (savedSupplier) setEditing(false)
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity ${isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => !saving && onClose()}
      />
      <div className={`fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-[#d8e2ef] bg-white shadow-2xl transition-all duration-200 ${isOpen ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="shrink-0 border-b border-[#d8e2ef] bg-[#f6f8fc] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Supplier Details</p>
              <h2 className="mt-0.5 truncate text-base font-bold text-slate-950">{supplier?.company_name || 'Supplier'}</h2>
              <p className="mt-0.5 truncate text-xs text-slate-500">{supplier?.supplier_type || '-'} · {supplier?.industry || '-'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!editing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 justify-center p-0 text-[#26324f]"
                  onClick={() => setEditing(true)}
                  disabled={saving}
                  aria-label="Edit supplier"
                >
                  <Pencil size={14} />
                </Button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#edf4fb] hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close supplier details"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {editing ? (
            <form onSubmit={submit} className="space-y-4">
              <SupplierFormFields form={draft} onChange={setField} disabled={saving} idPrefix="edit-supplier" />
              {error && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
              <div className="flex items-center justify-end gap-2 border-t border-[#d8e2ef] pt-4">
                <Button type="button" variant="outline" onClick={cancelEditing} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  <Save size={14} /> Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {error && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
              <section className="rounded-md border border-[#d8e2ef] bg-white">
                <div className="border-b border-[#e3ecf8] px-3 py-2"><p className="text-xs font-semibold text-slate-950">Supplier Information</p></div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3">
                  <DetailField label="Company Name" value={supplier?.company_name} />
                  <DetailField label="TIN" value={supplier?.tin_number} />
                  <DetailField label="Supplier Type" value={supplier?.supplier_type} />
                  <DetailField label="Classification (Local / International)" value={supplier?.supplier_classification} />
                  <DetailField label="Industry" value={supplier?.industry} />
                  <DetailField label="VAT Status" value={supplier?.vat_status} />
                  <DetailField label="Payment Terms" value={supplier?.payment_terms} />
                  <DetailField label="Status"><StatusBadge status={supplier?.status || 'active'} /></DetailField>
                </div>
              </section>
              <section className="rounded-md border border-[#d8e2ef] bg-white">
                <div className="border-b border-[#e3ecf8] px-3 py-2"><p className="text-xs font-semibold text-slate-950">Addresses</p></div>
                <div className="grid gap-3 p-3 sm:grid-cols-2">
                  <DetailField label="Billing Address" value={supplier?.billing_address} />
                  <DetailField label="Delivery / Mailing Address" value={supplier?.address} />
                </div>
              </section>
              <section className="rounded-md border border-[#d8e2ef] bg-white">
                <div className="border-b border-[#e3ecf8] px-3 py-2"><p className="text-xs font-semibold text-slate-950">Record Details</p></div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3">
                  <DetailField label="Linked Entity" value={supplier?.linked_entity} />
                  <DetailField label="Employee / Account Manager ID" value={supplier?.employee_id} />
                  <DetailField label="Created" value={formatTimestamp(supplier?.created_at)} />
                  <DetailField label="Last Updated" value={formatTimestamp(supplier?.updated_at)} />
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function SupplierList() {
  useOutletContext()
  const navigate = useNavigate()

  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [error, setError] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [search, setSearch] = useState('')
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const clearDetailError = useCallback(() => setDetailError(null), [])

  const loadSuppliers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = new URL(`${BASE}/supplier_list/`)
      if (search.trim()) url.searchParams.set('search', search.trim())
      setSuppliers(await api(url.pathname + url.search))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(loadSuppliers, 0)
    return () => clearTimeout(timer)
  }, [loadSuppliers])

  async function handleCreateSupplier(form) {
    setSaving(true)
    setError(null)
    try {
      await api('/supplier_list/', { method: 'POST', body: JSON.stringify(form) })
      setSupplierModalOpen(false)
      await loadSuppliers()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateSupplier(form) {
    if (!selectedSupplier?.supplier_id) return null
    setDetailSaving(true)
    setDetailError(null)
    try {
      const updated = await api(`/supplier_list/${selectedSupplier.supplier_id}`, { method: 'PATCH', body: JSON.stringify(form) })
      const nextSupplier = { ...selectedSupplier, ...updated }
      setSelectedSupplier(nextSupplier)
      setSuppliers(previous => previous.map(supplier => (
        supplier.supplier_id === selectedSupplier.supplier_id ? { ...supplier, ...updated } : supplier
      )))
      return nextSupplier
    } catch (err) {
      setDetailError(err.message)
      return null
    } finally {
      setDetailSaving(false)
    }
  }

  function handleViewChange(view) {
    if (view === 'orders') navigate('../orders')
  }

  function openSupplierDetails(supplier) {
    setSelectedSupplier(supplier)
    setDetailError(null)
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
            <HeaderViewDropdown value="suppliers" onChange={handleViewChange} />
            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button size="sm" className="shrink-0" onClick={() => setSupplierModalOpen(true)}><Plus size={14} /> Add Supplier</Button>
              <div className="relative w-[240px] shrink-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Search suppliers..."
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && loadSuppliers()}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {loading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 py-16 text-sm text-slate-600">
              <Loader2 size={16} className="animate-spin" /> Loading suppliers...
            </div>
          ) : suppliers.length === 0 ? (
            <EmptyState title="No suppliers found" icon={ShoppingBag}>Add a supplier to use it in RFQs and supplier quotations.</EmptyState>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className={`grid ${SUPPLIER_GRID} w-full min-w-[760px] gap-4 border-y border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
                <span>Supplier</span>
                <span>Classification</span>
                <span>TIN</span>
                <span>VAT</span>
                <span>Payment Terms</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-[#e3ecf8]">
                {suppliers.map(supplier => (
                  <div
                    key={supplier.supplier_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSupplierDetails(supplier)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openSupplierDetails(supplier)
                      }
                    }}
                    className={`grid ${SUPPLIER_GRID} w-full min-w-[760px] cursor-pointer items-center gap-4 px-5 py-3 text-sm transition-colors hover:bg-[#edf4fb] focus:bg-[#edf4fb] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#2c3a61]/30`}
                    aria-label={`View supplier ${supplier.company_name || supplier.supplier_id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{supplier.company_name}</p>
                      <p className="truncate text-[11px] text-slate-500">{supplier.supplier_type || '-'} - {supplier.industry || '-'}</p>
                    </div>
                    <span className="w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">{supplier.supplier_classification || '-'}</span>
                    <p className="truncate text-xs text-slate-600">{supplier.tin_number || '-'}</p>
                    <p className="truncate text-xs text-slate-600">{supplier.vat_status || '-'}</p>
                    <p className="truncate text-xs text-slate-600">{supplier.payment_terms || '-'}</p>
                    <StatusBadge status={supplier.status || 'active'} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SupplierModal open={supplierModalOpen} onClose={() => setSupplierModalOpen(false)} onSubmit={handleCreateSupplier} saving={saving} />
      <SupplierDetailOverlay
        supplier={selectedSupplier}
        onClose={() => setSelectedSupplier(null)}
        onSave={handleUpdateSupplier}
        saving={detailSaving}
        error={detailError}
        onClearError={clearDetailError}
      />
    </main>
  )
}
