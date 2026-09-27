import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { notify } from '@/utils/toast'
import {
  Loader2, Search, Plus, X, Briefcase, Trash2,
} from 'lucide-react'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const EMPTY_FORM = {
  service_name: '', company_name: '', category: '', sub_category: '',
  tax_category: '', margin_percentage: '', warranty: '', warranty_period: '',
  service_description: '', service_notes: '',
}

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

// ─── Drawer ──────────────────────────────────────────────────────────────────
export function ServiceDrawer({ open, onClose, service, onSaved }) {
  const isEdit = !!service
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(service ? { ...EMPTY_FORM, ...service } : { ...EMPTY_FORM })
    }
  }, [open, service])

  function setField(key, value) { setForm(f => ({ ...f, [key]: value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.service_name.trim()) {
      notify.error('Service name is required.')
      return
    }
    setSaving(true)
    try {
      const url = isEdit ? `${BASE}/services/${service.service_id}` : `${BASE}/services/`
      const method = isEdit ? 'PATCH' : 'POST'
      const body = { ...form, margin_percentage: form.margin_percentage ? Number(form.margin_percentage) : null }
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || err.error || 'Failed')
      }
      notify.success(isEdit ? 'Service updated' : 'Service created')
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
          <h3 className="text-base font-semibold text-[var(--color-text)]">{isEdit ? 'Edit Service' : 'New Service'}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]"><X size={16} /></button>
        </div>
        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Service Name <span className="text-[var(--color-danger)]">*</span></label>
            <input className={inputCls} value={form.service_name} onChange={e => setField('service_name', e.target.value)} placeholder="IT Support & Maintenance" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Company</label>
            <select className={inputCls} value={form.company_name} onChange={e => setField('company_name', e.target.value)}>
              <option value="">Select company...</option>
              <option value="Expedia">Expedia (EXSSI)</option>
              <option value="GreatnessLab">GreatnessLab</option>
              <option value="Exigent">Exigent Corporation</option>
              <option value="KSI">Kyrios Solutions Inc.</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Category</label>
              <input className={inputCls} value={form.category} onChange={e => setField('category', e.target.value)} placeholder="Technology" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Sub-Category</label>
              <input className={inputCls} value={form.sub_category} onChange={e => setField('sub_category', e.target.value)} placeholder="Managed Services" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Tax Category</label>
              <select className={inputCls} value={form.tax_category} onChange={e => setField('tax_category', e.target.value)}>
                <option value="">Select...</option>
                <option value="VAT">VAT (12%)</option>
                <option value="Non-VAT">Non-VAT</option>
                <option value="VAT Exempt">VAT Exempt</option>
                <option value="Zero-Rated">Zero-Rated</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Margin %</label>
              <input className={inputCls} type="number" min="0" max="100" step="0.01" value={form.margin_percentage} onChange={e => setField('margin_percentage', e.target.value)} placeholder="25" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Warranty</label>
              <select className={inputCls} value={form.warranty} onChange={e => setField('warranty', e.target.value)}>
                <option value="">Select...</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Warranty Period</label>
              <select className={inputCls} value={form.warranty_period} onChange={e => setField('warranty_period', e.target.value)} disabled={form.warranty !== 'Yes'}>
                <option value="">Select...</option>
                <option value="3 months">3 months</option>
                <option value="6 months">6 months</option>
                <option value="12 months">12 months</option>
                <option value="18 months">18 months</option>
                <option value="24 months">24 months</option>
                <option value="36 months">36 months</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Description</label>
            <textarea className={inputCls + ' resize-none'} rows={3} value={form.service_description || ''} onChange={e => setField('service_description', e.target.value)} placeholder="Describe the service..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-fg)] mb-1">Notes</label>
            <textarea className={inputCls + ' resize-none'} rows={2} value={form.service_notes || ''} onChange={e => setField('service_notes', e.target.value)} placeholder="Internal notes..." />
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
export function ServicesTab() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editService, setEditService] = useState(null)

  const fetchServices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/services/`, { headers: authHeaders() })
      if (res.ok) setServices(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchServices() }, [fetchServices])

  async function handleDelete(service) {
    if (!window.confirm(`Delete service "${service.service_name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`${BASE}/services/${service.service_id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Delete failed')
      notify.success('Service deleted')
      fetchServices()
    } catch (err) { notify.error(err.message) }
  }

  const filtered = search.trim()
    ? services.filter(s =>
        (s.service_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.category || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.sub_category || '').toLowerCase().includes(search.toLowerCase())
      )
    : services

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
          <Input className="pl-9 w-[280px]" placeholder="Search services..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={() => { setEditService(null); setDrawerOpen(true) }}>
            <Plus size={14} /> Add Service
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No services found" icon={Briefcase}>
          {search ? 'Try adjusting your search.' : 'Add your first service offering to get started.'}
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Service Name</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Company</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Category</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Sub-Category</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Tax</th>
                    <th className="px-4 py-2.5 text-right font-medium text-[var(--color-muted-fg)]">Margin %</th>
                    <th className="px-4 py-2.5 text-center font-medium text-[var(--color-muted-fg)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr
                      key={s.service_id}
                      className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)]/50 cursor-pointer transition-colors"
                      onClick={() => { setEditService(s); setDrawerOpen(true) }}
                    >
                      <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{s.service_name}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{s.company_name || '—'}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{s.category || '—'}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{s.sub_category || '—'}</td>
                      <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{s.tax_category || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--color-text)]">{s.margin_percentage != null ? `${s.margin_percentage}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleDelete(s) }}
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
              {filtered.length} service{filtered.length !== 1 ? 's' : ''}
            </div>
          </CardContent>
        </Card>
      )}

      <ServiceDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditService(null) }}
        service={editService}
        onSaved={fetchServices}
      />
    </div>
  )
}
