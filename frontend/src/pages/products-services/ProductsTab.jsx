import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import {
  Loader2, Search, Plus, X, Package, Trash2,
} from 'lucide-react'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const ENTITIES = [
  { value: 'Expedia', label: 'Expedia (EXSSI)' },
  { value: 'GreatnessLab', label: 'GreatnessLab' },
  { value: 'Exigent', label: 'Exigent Corporation' },
  { value: 'KSI', label: 'Kyrios Solutions Inc.' },
]

const FULFILLMENT_OPTIONS = ['DIRECT', 'MTO', 'SERVICE']

const EMPTY_FORM = {
  product_code: '', owner_entity: '', product_brand: '', product_name: '',
  product_description: '', quantity: 0, unit: 'Nos', buying_price_vat: '',
  selling_price_margin: '', supplier_name: '', fulfillment_type: 'DIRECT',
}

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

function money(val) {
  if (!val && val !== 0) return '—'
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Drawer ──────────────────────────────────────────────────────────────────
export function ProductDrawer({ open, onClose, product, entity, onSaved }) {
  const isEdit = !!product
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(product ? { ...EMPTY_FORM, ...product } : { ...EMPTY_FORM, owner_entity: entity })
    }
  }, [open, product, entity])

  function setField(key, value) { setForm(f => ({ ...f, [key]: value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.product_code.trim() || !form.product_name.trim() || !form.owner_entity) {
      notify.error('Product code, name, and entity are required.')
      return
    }
    setSaving(true)
    try {
      const url = isEdit ? `${BASE}/products/${encodeURIComponent(product.product_code)}` : `${BASE}/products/`
      const method = isEdit ? 'PATCH' : 'POST'
      const body = { ...form, quantity: Number(form.quantity) || 0, buying_price_vat: Number(form.buying_price_vat) || 0, selling_price_margin: Number(form.selling_price_margin) || 0 }
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || err.error || 'Failed')
      }
      notify.success(isEdit ? 'Product updated' : 'Product created')
      onSaved()
      onClose()
    } catch (err) {
      notify.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[9990] bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 z-[9991] flex h-full w-full max-w-lg flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h3 className="text-base font-semibold text-[var(--color-text)]">{isEdit ? 'Edit Product' : 'New Product'}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]"><X size={16} /></button>
        </div>
        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Product Code <span className="text-[var(--color-danger)]">*</span></label>
              <input className={inputCls} value={form.product_code} onChange={e => setField('product_code', e.target.value)} placeholder="EXP-001" disabled={isEdit} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Entity <span className="text-[var(--color-danger)]">*</span></label>
              <select className={inputCls} value={form.owner_entity} onChange={e => setField('owner_entity', e.target.value)} disabled={isEdit}>
                <option value="">Select...</option>
                {ENTITIES.map(ent => <option key={ent.value} value={ent.value}>{ent.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Product Name <span className="text-[var(--color-danger)]">*</span></label>
            <input className={inputCls} value={form.product_name} onChange={e => setField('product_name', e.target.value)} placeholder="Network Switch 24-Port" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Brand</label>
            <input className={inputCls} value={form.product_brand} onChange={e => setField('product_brand', e.target.value)} placeholder="Cisco" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Description</label>
            <textarea className={inputCls + ' resize-none'} rows={3} value={form.product_description || ''} onChange={e => setField('product_description', e.target.value)} placeholder="Product description..." />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Quantity</label>
              <input className={inputCls} type="number" min="0" value={form.quantity} onChange={e => setField('quantity', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Unit</label>
              <input className={inputCls} value={form.unit} onChange={e => setField('unit', e.target.value)} placeholder="Nos" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Fulfillment</label>
              <select className={inputCls} value={form.fulfillment_type} onChange={e => setField('fulfillment_type', e.target.value)}>
                {FULFILLMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Buying Price (VAT incl.)</label>
              <input className={inputCls} type="number" min="0" step="0.01" value={form.buying_price_vat} onChange={e => setField('buying_price_vat', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Selling Price (Margin)</label>
              <input className={inputCls} type="number" min="0" step="0.01" value={form.selling_price_margin} onChange={e => setField('selling_price_margin', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Supplier</label>
            <input className={inputCls} value={form.supplier_name} onChange={e => setField('supplier_name', e.target.value)} placeholder="Supplier name" />
          </div>
        </form>
        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function ProductsTab() {
  const [entity, setEntity] = useState('')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editProduct, setEditProduct] = useState(null)

  const fetchProducts = useCallback(async () => {
    if (!entity) return
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/products/?entity=${encodeURIComponent(entity)}`, { headers: authHeaders() })
      if (res.ok) setProducts(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [entity])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  async function handleDelete(code) {
    if (!window.confirm(`Delete product ${code}? This cannot be undone.`)) return
    try {
      const res = await fetch(`${BASE}/products/${encodeURIComponent(code)}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Delete failed')
      notify.success('Product deleted')
      fetchProducts()
    } catch (err) { notify.error(err.message) }
  }

  const filtered = search.trim()
    ? products.filter(p =>
        (p.product_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.product_code || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.product_brand || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.supplier_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : products

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={entity}
          onChange={e => setEntity(e.target.value)}
          className={inputCls + ' !w-[200px]'}
        >
          <option value="">Select company...</option>
          {ENTITIES.map(ent => <option key={ent.value} value={ent.value}>{ent.label}</option>)}
        </select>

        {entity && (
          <>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
              <Input className="pl-9 w-[260px]" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="ml-auto">
              <Button size="sm" onClick={() => { setEditProduct(null); setDrawerOpen(true) }}>
                <Plus size={14} /> Add Product
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {!entity ? (
        <EmptyState title="Select a company" icon={Package}>Choose a company above to view its product catalog.</EmptyState>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No products found" icon={Package}>
          {search ? 'Try adjusting your search.' : 'Add your first product to get started.'}
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Code</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Brand</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Unit</th>
                    <th className="px-4 py-2.5 text-right font-medium text-[var(--color-muted-fg)]">Buying ₱</th>
                    <th className="px-4 py-2.5 text-right font-medium text-[var(--color-muted-fg)]">Selling ₱</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Supplier</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Fulfillment</th>
                    <th className="px-4 py-2.5 text-center font-medium text-[var(--color-muted-fg)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr
                      key={p.product_code}
                      className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)]/50 cursor-pointer transition-colors"
                      onClick={() => { setEditProduct(p); setDrawerOpen(true) }}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-[var(--color-primary)]">{p.product_code}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text)] font-medium">{p.product_name}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{p.product_brand || '—'}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{p.unit || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--color-text)]">{money(p.buying_price_vat)}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--color-text)]">{money(p.selling_price_margin)}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{p.supplier_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          p.fulfillment_type === 'DIRECT' ? 'bg-blue-50 text-blue-700' :
                          p.fulfillment_type === 'MTO' ? 'bg-amber-50 text-amber-700' :
                          p.fulfillment_type === 'SERVICE' ? 'bg-purple-50 text-purple-700' :
                          'bg-slate-100 text-slate-600'
                        )}>{p.fulfillment_type || 'DIRECT'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleDelete(p.product_code) }}
                          className="rounded p-1 text-[var(--color-muted-fg)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/5 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-xs text-[var(--color-muted-fg)]">
              {filtered.length} product{filtered.length !== 1 ? 's' : ''}
            </div>
          </CardContent>
        </Card>
      )}

      <ProductDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditProduct(null) }}
        product={editProduct}
        entity={entity}
        onSaved={fetchProducts}
      />
    </div>
  )
}
