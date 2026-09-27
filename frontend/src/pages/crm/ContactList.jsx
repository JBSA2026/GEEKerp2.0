import { useState, useEffect, useCallback } from 'react'
// useOutletContext available for accessing user context from CRMLayout if needed
// import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import {
  Search, UserPlus, Pencil, Loader2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_URL

// ─── API helpers ────────────────────────────────────────────────────────────
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
  return res.json()
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) { const e = await res.json().catch(() => ({})); const err = new Error(e.error || 'Request failed'); err.detail = e.detail; throw err }
  return res.json()
}

async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) { const e = await res.json().catch(() => ({})); const err = new Error(e.error || 'Request failed'); err.detail = e.detail; throw err }
  return res.json()
}

// ─── Shared UI Components ───────────────────────────────────────────────────
function MetricCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--color-text)]">{value ?? '—'}</p>
      {sub && <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{sub}</p>}
    </div>
  )
}

function Input({ className = '', ...props }) {
  return (
    <input
      className={cn('w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20', className)}
      {...props}
    />
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[var(--color-muted-fg)]">{label}{hint && <span className="text-[11px] text-[var(--color-muted)] ml-1">({hint})</span>}</label>
      {children}
    </div>
  )
}

// ─── Contact Drawer ─────────────────────────────────────────────────────────
function ContactDrawer({ open, onClose, item, onSaved, customers }) {
  const isEditing = Boolean(item)
  const [form, setForm] = useState(() => item || {})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      if (!form.client_id) {
        setError('Select the client this contact belongs to.')
        return
      }
      const payload = { client_id: Number(form.client_id), first_name: form.first_name || '', last_name: form.last_name || null, job_title: form.job_title || null, email: form.email || null, landline: form.landline || null, is_primary_contact: form.is_primary_contact ?? false }
      const saved = isEditing ? await apiPatch(`/contact_list/${item.contact_id}`, payload) : await apiPost('/contact_list/', payload)
      notify.success(isEditing ? 'Contact updated.' : 'Contact created.')
      await onSaved(saved); onClose()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[480px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div><p className="text-sm font-semibold text-[var(--color-text)]">{isEditing ? 'Edit' : 'Add'} Contact</p><p className="text-[11px] text-[var(--color-muted-fg)]">{isEditing ? 'Update contact details' : 'Add a new contact person'}</p></div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3"><Field label="First Name"><Input value={form.first_name || ''} onChange={e => setField('first_name', e.target.value)} placeholder="Juan" /></Field><Field label="Last Name"><Input value={form.last_name || ''} onChange={e => setField('last_name', e.target.value)} placeholder="dela Cruz" /></Field></div>
            <Field label="Job Title"><Input value={form.job_title || ''} onChange={e => setField('job_title', e.target.value)} placeholder="IT Manager" /></Field>
            <Field label="Email"><Input type="email" value={form.email || ''} onChange={e => setField('email', e.target.value)} placeholder="juan@company.com" /></Field>
            <Field label="Landline"><Input value={form.landline || ''} onChange={e => setField('landline', e.target.value)} placeholder="(02) 8XXX-XXXX" /></Field>
            <Field label="Client (Company)">
              <select required value={form.client_id || ''} onChange={e => setField('client_id', e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20">
                <option value="">— Select client —</option>
                {(customers || []).map(c => <option key={c.client_id} value={c.client_id}>{c.company_name}</option>)}
              </select>
            </Field>
            <Field label="Primary Contact">
              <select value={form.is_primary_contact ? 'yes' : 'no'} onChange={e => setField('is_primary_contact', e.target.value === 'yes')} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20">
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </Field>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading}>{loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <>{isEditing ? <Pencil size={14} /> : <UserPlus size={14} />} {isEditing ? 'Save' : 'Create'}</>}</Button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Contact List Component ─────────────────────────────────────────────────
export default function ContactList() {
  // user available via useOutletContext if needed in the future
  // const { user } = useOutletContext()
  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [selectedItem, setSelectedItem] = useState(null)

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('search', q)
      setItems(await apiGet(`/contact_list/?${params}`) || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    let c = false
    apiGet('/crm/customers').then(d => { if (!c) setCustomers(d || []) }).catch(() => {})
    return () => { c = true }
  }, [])

  useEffect(() => { const t = setTimeout(() => load(search), 300); return () => clearTimeout(t) }, [search, load])

  function openNew() { setSelectedItem(null); setDrawerKey(k => k + 1); setDrawer(true) }
  function openEdit(item) { setSelectedItem(item); setDrawerKey(k => k + 1); setDrawer(true) }
  async function handleSaved() { await load(search) }

  function customerName(id) {
    if (!id) return '—'
    const c = customers.find(c => c.client_id === id)
    return c ? c.company_name : `#${id}`
  }

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total Contacts" value={items.length} />
        <MetricCard label="Primary Contacts" value={items.filter(c => c.is_primary_contact).length} />
        <MetricCard label="Linked Customers" value={new Set(items.map(c => c.client_id).filter(Boolean)).size} />
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-2 text-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20" /></div>
        <Button size="md" onClick={openNew}><UserPlus size={14} /> Add Contact</Button>
      </div>
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]"><tr className="border-b border-[var(--color-border)]"><th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Name</th><th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Job Title</th><th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Email</th><th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Landline</th><th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Customer</th><th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Primary</th><th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            : items.length === 0 ? <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No contacts found.</td></tr>
            : items.map(it => (
              <tr key={it.contact_id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors">
                <td className="px-3 py-2.5"><p className="text-sm font-medium text-[var(--color-text)]">{[it.first_name, it.last_name].filter(Boolean).join(' ') || '—'}</p></td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{it.job_title || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{it.email || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] font-mono">{it.landline || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{customerName(it.client_id)}</td>
                <td className="px-3 py-2.5">{it.is_primary_contact ? <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Primary</span> : <span className="text-xs text-[var(--color-muted)]">—</span>}</td>
                <td className="px-3 py-2.5 text-right"><button onClick={() => openEdit(it)} className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]" title="Edit"><Pencil size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--color-muted)]">{items.length} contact{items.length !== 1 ? 's' : ''}</p>
      <ContactDrawer key={drawerKey} open={drawer} onClose={() => setDrawer(false)} item={selectedItem} onSaved={handleSaved} customers={customers} />
    </div>
  )
}
