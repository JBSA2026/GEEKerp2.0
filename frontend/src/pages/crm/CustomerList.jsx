import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { Search, UserPlus, Pencil, Loader2, X, Archive, ArchiveRestore, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

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

async function apiDelete(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) throw new Error('Delete failed')
}

// ─── Formatting helpers ─────────────────────────────────────────────────────
function formatTIN(raw) {
  const d = (raw || '').replace(/\D/g, '').slice(0, 12)
  return d.match(/.{1,3}/g)?.join('-') ?? d
}
function formatPhone(raw) {
  return (raw || '').replace(/[^0-9+() -]/g, '')
}
function formatCurrency(val) {
  const n = typeof val === 'number' ? val : parseFloat(String(val || '').replace(/[^0-9.]/g, ''))
  if (!n || isNaN(n)) return ''
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function parseCurrencyNum(raw) {
  if (raw === '' || raw === null || raw === undefined) return null
  const cleaned = String(raw).replace(/[^0-9.]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

// ─── Constants ──────────────────────────────────────────────────────────────
const CUSTOMER_TYPES = ['Corporate', 'Government', 'Individual']
const VAT_OPTIONS = ['VAT', 'Non-VAT', 'Zero-Rated', 'VAT Exempt']
const PAYMENT_TERMS_OPTIONS = ['COD', 'Net 15', 'Net 30', 'Net 60']
const INDUSTRY_LIST = ['Technology', 'Healthcare', 'Construction', 'Retail', 'Manufacturing', 'Education', 'Financial Services', 'Real Estate', 'Logistics', 'Telecommunications', 'Energy', 'Agriculture', 'Government', 'Hospitality', 'Media', 'Other']

const EMPTY_CONTACT = { first_name: '', last_name: '', designation: '', email: '', mobile: '', is_primary_contact: false }
const INITIAL_CONTACT = { ...EMPTY_CONTACT, is_primary_contact: true }

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

function Input({ className = '', error, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20',
        error && 'border-[var(--color-danger)]',
        className
      )}
      {...props}
    />
  )
}

function Field({ label, hint, error, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[var(--color-muted-fg)]">{label}{hint && <span className="text-[11px] text-[var(--color-muted)] ml-1">({hint})</span>}</label>
      {children}
      {error && <p className="text-[11px] text-[var(--color-danger)] mt-0.5">{error}</p>}
    </div>
  )
}

function Select({ value, onChange, options, placeholder, className = '', error }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
      className={cn(
        'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20',
        error && 'border-[var(--color-danger)]',
        className
      )}
    >
      <option value="">{placeholder || '— Select —'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function InlineCombobox({ value, onChange, options, placeholder, getLabel, className = '', error }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = (options || []).filter(o => {
    const label = getLabel ? getLabel(o) : String(o)
    return label.toLowerCase().includes(query.toLowerCase())
  })
  const displayLabel = value || ''

  return (
    <div className="relative">
      <input
        value={open ? query : displayLabel}
        onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => { setOpen(true); setQuery('') }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20',
          error && 'border-[var(--color-danger)]',
          className
        )}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          {filtered.map((o, i) => {
            const label = getLabel ? getLabel(o) : String(o)
            return <li key={i} onMouseDown={() => { onChange(label); setOpen(false); setQuery('') }} className="px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-2)] text-[var(--color-text)]">{label}</li>
          })}
        </ul>
      )}
    </div>
  )
}


// ─── Customer Drawer ────────────────────────────────────────────────────────
function CustomerDrawer({ open, onClose, item, onSaved }) {
  const isEditing = Boolean(item)
  const [form, setForm] = useState(() => item || {})
  const [contacts, setContacts] = useState([{ ...INITIAL_CONTACT }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [employees, setEmployees] = useState([])
  const [creditDisplay, setCreditDisplay] = useState('')
  const [creditFocused, setCreditFocused] = useState(false)
  const formRef = useRef(null)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); setFieldErrors(fe => ({ ...fe, [k]: undefined })) }

  function setContactField(idx, k, v) {
    setContacts(prev => prev.map((c, i) => {
      if (k === 'is_primary_contact' && v) return { ...c, is_primary_contact: i === idx }
      return i === idx ? { ...c, [k]: v } : c
    }))
    setFieldErrors(fe => ({ ...fe, [`contact_${idx}_${k}`]: undefined, contacts: undefined }))
  }

  function addContact() { setContacts(prev => [...prev, { ...EMPTY_CONTACT }]) }
  function removeContact(idx) { setContacts(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)) }

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      apiGet('/crm/employees/active').then(setEmployees).catch(() => {})
      if (isEditing && item?.client_id) {
        apiGet(`/contact_list/?client_id=${item.client_id}`).then(clientContacts => {
          if (clientContacts.length > 0) setContacts(clientContacts.map(c => ({
            ...c,
            designation: c.designation || c.job_title || '',
            mobile: c.mobile || c.landline || '',
          })))
          else setContacts([{ ...INITIAL_CONTACT }])
        }).catch(() => setContacts([{ ...INITIAL_CONTACT }]))
      } else {
        setContacts([{ ...INITIAL_CONTACT }])
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [open, isEditing, item?.client_id])

  useEffect(() => {
    if (creditFocused) return undefined
    const timer = setTimeout(() => {
      setCreditDisplay(form.credit_limit ? formatCurrency(form.credit_limit) : '')
    }, 0)
    return () => clearTimeout(timer)
  }, [form.credit_limit, creditFocused])

  function validate() {
    const errors = {}
    if (!form.company_name?.trim()) errors.company_name = 'Company name is required'
    if (!form.address?.trim()) errors.address = 'Address is required'
    if (!form.tin_number?.trim()) errors.tin_number = 'TIN is required'
    const hasValidContact = contacts.some(c => c.first_name?.trim())
    if (!hasValidContact) {
      errors.contacts = 'At least one contact person is required'
      contacts.forEach((c, i) => {
        if (!c.first_name?.trim()) errors[`contact_${i}_first_name`] = 'Required'
      })
    }
    return errors
  }

  function scrollToFirstError(errors) {
    const keys = Object.keys(errors)
    if (!keys.length || !formRef.current) return
    const firstKey = keys[0]
    const el = formRef.current.querySelector(`[data-field="${firstKey}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setTimeout(() => scrollToFirstError(errors), 50)
      return
    }
    setFieldErrors({})
    setLoading(true)
    setError(null)
    try {
      const payload = {
        company_name: form.company_name || '',
        trade_name: form.trade_name || null,
        customer_type: form.customer_type || null,
        industry: form.industry || null,
        tin_number: form.tin_number || null,
        vat_status: form.vat_status || null,
        billing_address: form.billing_address || null,
        address: form.address || null,
        zip_code: form.zip_code || null,
        payment_terms: form.payment_terms || null,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        assigned_salesperson: form.assigned_salesperson || null,
      }
      if (isEditing && form.status) payload.status = form.status

      if (isEditing) {
        await apiPatch(`/crm/customers/${item.client_id}`, payload)
        // Handle contacts: compare with existing
        const existing = await apiGet(`/contact_list/?client_id=${item.client_id}`).catch(() => []) || []
        const existingIds = new Set(existing.map(c => c.contact_id))
        const formIds = new Set(contacts.filter(c => c.contact_id).map(c => c.contact_id))
        // Delete removed contacts
        for (const ec of existing) {
          if (!formIds.has(ec.contact_id)) await apiDelete(`/contact_list/${ec.contact_id}`)
        }
        // Create or update contacts
        for (const c of contacts) {
          const contactPayload = {
            client_id: item.client_id,
            first_name: c.first_name || '',
            last_name: c.last_name || null,
            job_title: c.designation || c.job_title || null,
            email: c.email || null,
            landline: c.mobile || c.landline || null,
            is_primary_contact: c.is_primary_contact || false,
          }
          if (c.contact_id && existingIds.has(c.contact_id)) {
            await apiPatch(`/contact_list/${c.contact_id}`, contactPayload)
          } else {
            await apiPost('/contact_list/', contactPayload)
          }
        }
        notify.success('Client updated.')
      } else {
        const saved = await apiPost('/crm/customers', payload)
        const clientId = saved.client_id
        // Create contact persons
        for (const c of contacts) {
          if (c.first_name?.trim()) {
            await apiPost('/contact_list/', {
              client_id: clientId,
              first_name: c.first_name || '',
              last_name: c.last_name || null,
              job_title: c.designation || c.job_title || null,
              email: c.email || null,
              landline: c.mobile || c.landline || null,
              is_primary_contact: c.is_primary_contact || false,
            })
          }
        }
        notify.success('Client created.')
      }
      await onSaved()
      onClose()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[540px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">{isEditing ? 'Edit' : 'Add'} Client</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">{isEditing ? 'Update client details' : 'Create a new client record'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0" ref={formRef}>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* ── Section 1: Client Information ── */}
            <div data-field="company_name">
              <p className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide">Client Information</p>
              <hr className="border-[var(--color-border)]" />
            </div>

            {isEditing && <Field label="Client Code"><Input value={form.customer_code || 'Auto-generated'} readOnly className="bg-slate-50 text-[var(--color-muted-fg)] cursor-not-allowed" /></Field>}
            {!isEditing && <p className="text-[11px] text-[var(--color-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2">Client Code will be auto-generated as <span className="font-mono font-medium">GEEK-{new Date().getFullYear()}-CUS-NNNN</span></p>}

            <Field label={<>Company Name{reqMark}</>} error={fieldErrors.company_name}>
              <Input value={form.company_name || ''} onChange={e => setField('company_name', e.target.value)} placeholder="GEEK Groups Inc." error={fieldErrors.company_name} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client Type"><Select value={form.customer_type} onChange={v => setField('customer_type', v)} options={CUSTOMER_TYPES} placeholder="Select type" /></Field>
              <Field label="Industry"><InlineCombobox value={form.industry || ''} onChange={v => setField('industry', v)} options={INDUSTRY_LIST} placeholder="Type to search…" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3" data-field="tin_number">
              <Field label={<>TIN{reqMark}</>} error={fieldErrors.tin_number}><Input value={formatTIN(form.tin_number)} onChange={e => setField('tin_number', e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="000-000-000-000" inputMode="numeric" error={fieldErrors.tin_number} /></Field>
              <Field label="VAT Status"><Select value={form.vat_status} onChange={v => setField('vat_status', v)} options={VAT_OPTIONS} placeholder="Select VAT status" /></Field>
            </div>
            <Field label="Billing Address"><Input value={form.billing_address || ''} onChange={e => setField('billing_address', e.target.value)} placeholder="Full billing address" /></Field>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="copy-billing-address"
                checked={form._sameBilling || false}
                onChange={e => {
                  if (e.target.checked) {
                    setField('_sameBilling', true)
                    setField('address', form.billing_address || '')
                  } else {
                    setField('_sameBilling', false)
                  }
                }}
                className="h-3.5 w-3.5 rounded accent-[var(--color-primary)]"
              />
              <label htmlFor="copy-billing-address" className="text-xs text-[var(--color-muted-fg)] cursor-pointer select-none">
                Same as billing address
              </label>
            </div>
            <div data-field="address">
              <Field label={<>Address{reqMark}</>} error={fieldErrors.address}><Input value={form.address || ''} onChange={e => { setField('address', e.target.value); setField('_sameBilling', false) }} placeholder="Office / delivery address" error={fieldErrors.address} /></Field>
            </div>
            <Field label="ZIP Code"><Input value={form.zip_code || ''} onChange={e => setField('zip_code', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 1234" inputMode="numeric" /></Field>
            <Field label="Payment Terms"><Select value={form.payment_terms} onChange={v => setField('payment_terms', v)} options={PAYMENT_TERMS_OPTIONS} placeholder="Select terms" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Credit Limit" hint="PHP">
                <Input
                  value={creditFocused ? (form.credit_limit || '') : creditDisplay}
                  onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setField('credit_limit', parseCurrencyNum(v)) }}
                  onFocus={() => setCreditFocused(true)}
                  onBlur={() => setCreditFocused(false)}
                  placeholder="₱500,000.00"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Assigned Salesperson">
                <InlineCombobox value={form.assigned_salesperson || ''} onChange={v => setField('assigned_salesperson', v)} options={employees} getLabel={e => `${e.first_name} ${e.last_name}`} placeholder="Type to search…" />
              </Field>
            </div>
            {isEditing && <Field label="Status"><Select value={form.status || 'active'} onChange={v => setField('status', v)} options={['active', 'archived']} placeholder="Select status" /></Field>}

            {/* ── Section 2: Contact Persons ── */}
            <div className="pt-3" data-field="contacts">
              <p className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide">Contact Persons</p>
              <hr className="border-[var(--color-border)]" />
            </div>
            {fieldErrors.contacts && <p className="text-[11px] text-[var(--color-danger)] mt-0.5">{fieldErrors.contacts}</p>}

            {contacts.map((c, idx) => (
              <div key={idx} className="relative rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3" data-field={`contact_${idx}_first_name`}>
                {contacts.length > 1 && (
                  <button type="button" onClick={() => removeContact(idx)} className="absolute top-3 right-3 p-1 rounded-md hover:bg-rose-50 text-[var(--color-muted-fg)] hover:text-[var(--color-danger)]" title="Remove contact">
                    <Trash2 size={14} />
                  </button>
                )}
                <div className="grid grid-cols-2 gap-3 pr-8">
                  <Field label={<>First Name{reqMark}</>} error={fieldErrors[`contact_${idx}_first_name`]}>
                    <Input value={c.first_name || ''} onChange={e => setContactField(idx, 'first_name', e.target.value)} placeholder="Juan" error={fieldErrors[`contact_${idx}_first_name`]} />
                  </Field>
                  <Field label="Last Name">
                    <Input value={c.last_name || ''} onChange={e => setContactField(idx, 'last_name', e.target.value)} placeholder="dela Cruz" />
                  </Field>
                </div>
                <Field label="Designation">
                  <Input value={c.designation || ''} onChange={e => setContactField(idx, 'designation', e.target.value)} placeholder="Manager" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email">
                    <Input type="email" value={c.email || ''} onChange={e => setContactField(idx, 'email', e.target.value)} placeholder="email@co.com" />
                  </Field>
                  <Field label="Mobile">
                    <Input value={formatPhone(c.mobile)} onChange={e => setContactField(idx, 'mobile', formatPhone(e.target.value))} placeholder="+63 9XX XXX XXXX" inputMode="tel" />
                  </Field>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={c.is_primary_contact || false} onChange={e => setContactField(idx, 'is_primary_contact', e.target.checked)} className="h-4 w-4 rounded accent-[var(--color-primary)]" />
                  <span className="text-xs text-[var(--color-muted-fg)]">Primary contact</span>
                </label>
              </div>
            ))}

            <button type="button" onClick={addContact} className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:underline">
              <Plus size={13} /> Add Contact Person
            </button>

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <>{isEditing ? <Pencil size={14} /> : <UserPlus size={14} />} {isEditing ? 'Save' : 'Create'}</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}


// ─── Contact Row (expanded sub-row) ────────────────────────────────────────
function ClientDetailPanel({ client, onClose, onEdit }) {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedContact, setSelectedContact] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true)
      apiGet(`/contact_list/?client_id=${client.client_id}`)
        .then(setContacts)
        .catch(() => setContacts([]))
        .finally(() => setLoading(false))
    }, 0)
    return () => clearTimeout(timer)
  }, [client.client_id])

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden max-h-[50vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">{client.company_name}</p>
          <p className="text-[11px] text-[var(--color-muted-fg)]">{client.customer_code || `Client #${client.client_id}`}{client.trade_name ? ` • ${client.trade_name}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}><Pencil size={12} /> Edit</Button>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={14} /></button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-0 md:divide-x divide-y md:divide-y-0 divide-[var(--color-border)] flex-1 overflow-y-auto">
        {/* Client Details */}
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-3">Client Details</p>
          <div className="grid grid-cols-3 gap-x-6 gap-y-2.5">
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">Type</p><p className="text-xs text-[var(--color-text)]">{client.customer_type || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">Industry</p><p className="text-xs text-[var(--color-text)]">{client.industry || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">TIN</p><p className="text-xs text-[var(--color-text)] font-mono">{client.tin_number || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">VAT Status</p><p className="text-xs text-[var(--color-text)]">{client.vat_status || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">Payment Terms</p><p className="text-xs text-[var(--color-text)]">{client.payment_terms || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">Salesperson</p><p className="text-xs text-[var(--color-text)]">{client.assigned_salesperson || '—'}</p></div>
            <div className="col-span-2"><p className="text-[10px] text-[var(--color-muted-fg)]">Address</p><p className="text-xs text-[var(--color-text)]">{client.address || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">Status</p><StatusBadge status={client.status} /></div>
          </div>
        </div>

        {/* Contact Persons */}
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-3">Contact Persons</p>
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[var(--color-muted)]"><Loader2 size={14} className="animate-spin" /> Loading…</div>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)] py-3">No contact persons found.</p>
          ) : selectedContact ? (
            /* Expanded contact detail view */
            <div className="space-y-3">
              <button onClick={() => setSelectedContact(null)} className="flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline mb-2">
                ← Back to list
              </button>
              <div className="rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-base font-bold text-[var(--color-primary)]">
                    {(selectedContact.first_name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-[var(--color-text)]">{selectedContact.first_name} {selectedContact.last_name || ''}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {selectedContact.is_primary_contact && <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Primary Contact</span>}
                      {(selectedContact.job_title || selectedContact.designation) && <span className="text-xs text-[var(--color-muted-fg)]">{selectedContact.job_title || selectedContact.designation}</span>}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Email</p><p className="text-sm text-[var(--color-text)] mt-0.5">{selectedContact.email || '—'}</p></div>
                  <div><p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Phone</p><p className="text-sm text-[var(--color-text)] mt-0.5">{selectedContact.landline || selectedContact.mobile || '—'}</p></div>
                  <div><p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Designation</p><p className="text-sm text-[var(--color-text)] mt-0.5">{selectedContact.job_title || selectedContact.designation || '—'}</p></div>
                  <div><p className="text-[10px] text-[var(--color-muted-fg)] uppercase">Role</p><p className="text-sm text-[var(--color-text)] mt-0.5">{selectedContact.is_primary_contact ? 'Primary Contact' : 'Contact Person'}</p></div>
                </div>
              </div>
            </div>
          ) : (
            /* Contact list */
            <div className="space-y-2">
              {contacts.map((c, i) => (
                <div
                  key={c.contact_id || i}
                  onClick={() => setSelectedContact(c)}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 cursor-pointer transition-all hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 hover:shadow-sm"
                >
                  <div className="w-9 h-9 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-sm font-bold text-[var(--color-primary)]">
                    {(c.first_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">{c.first_name} {c.last_name || ''}</p>
                      {c.is_primary_contact && <span className="inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Primary</span>}
                    </div>
                    <p className="text-xs text-[var(--color-muted-fg)] truncate mt-0.5">{c.email || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Customer List Component ────────────────────────────────────────────────
export default function CustomerList() {
  const [items, setItems] = useState([])
  const [metrics, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Active')
  const [drawer, setDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [selectedItem, setSelectedItem] = useState(null)
  const [archivingId, setArchivingId] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [actionLoading, setActionLoading] = useState(false)
  const [viewingClient, setViewingClient] = useState(null)

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('search', q)
      if (filter !== 'All') params.set('status', filter.toLowerCase())
      setItems(await apiGet(`/crm/customers?${params}`) || [])
      setSelected(new Set())
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [filter])

  useEffect(() => {
    let c = false
    apiGet('/crm/customers/metrics').then(d => { if (!c) setMetrics(d) }).catch(() => {})
    return () => { c = true }
  }, [])

  useEffect(() => { const t = setTimeout(() => load(search), 300); return () => clearTimeout(t) }, [search, filter, load])

  function openNew() { setSelectedItem(null); setDrawerKey(k => k + 1); setDrawer(true) }
  function openEdit(item) { setSelectedItem(item); setDrawerKey(k => k + 1); setDrawer(true) }

  function isArchived(item) {
    return (item.status || 'active').toLowerCase() === 'archived'
  }

  function selectForView(item) {
    setViewingClient(prev => prev?.client_id === item.client_id ? null : item)
  }

  async function handleArchiveToggle(item) {
    const newStatus = isArchived(item) ? 'active' : 'archived'
    setArchivingId(item.client_id)
    try {
      await apiPatch(`/crm/customers/${item.client_id}`, { status: newStatus })
      notify.success(`${item.company_name} ${newStatus === 'archived' ? 'archived' : 'restored'}.`)
      await load(search)
      try { setMetrics(await apiGet('/crm/customers/metrics')) } catch { /* */ }
    } catch (err) { notify.error(err.message) }
    finally { setArchivingId(null) }
  }

  async function handleBulkArchive(action) {
    const ids = [...selected]
    if (!ids.length) return
    setActionLoading(true)
    try {
      const newStatus = action === 'restore' ? 'active' : 'archived'
      await Promise.all(ids.map(id => apiPatch(`/crm/customers/${id}`, { status: newStatus })))
      notify.success(`${action === 'restore' ? 'Restored' : 'Archived'} ${ids.length} client(s).`)
      await load(search)
      try { setMetrics(await apiGet('/crm/customers/metrics')) } catch { /* */ }
    } catch (err) { notify.error(err.message || 'Action failed') }
    finally { setActionLoading(false) }
  }

  function toggleRow(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set())
    else setSelected(new Set(items.map(i => i.client_id)))
  }

  const allChecked = items.length > 0 && items.every(i => selected.has(i.client_id))
  const someChecked = selected.size > 0 && !allChecked

  async function handleSaved() { await load(search); try { setMetrics(await apiGet('/crm/customers/metrics')) } catch { /* */ } }

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Total Customers" value={metrics.total_customers} />
        <MetricCard label="Active" value={metrics.active_customers} />
        <MetricCard label="New This Month" value={metrics.new_this_month} />
        <MetricCard label="Total Revenue" value={metrics.total_revenue != null ? `₱${Number(metrics.total_revenue).toLocaleString()}` : '—'} sub="Coming soon" />
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
          <span className="text-xs font-semibold text-[var(--color-text)]">{selected.size} selected</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <Button type="button" variant="ghost" size="icon" onClick={() => setSelected(new Set())} className="h-6 w-6 p-0 text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={13} /></Button>
            <Button size="sm" variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" onClick={() => handleBulkArchive('archive')} disabled={actionLoading}><Archive size={14} /> Archive</Button>
            <Button size="sm" variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onClick={() => handleBulkArchive('restore')} disabled={actionLoading}><ArchiveRestore size={14} /> Restore</Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-2 text-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20" />
        </div>
        <div className="flex gap-1.5">
          {['All', 'Active', 'Archived'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filter === f ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]')}>{f}</button>
          ))}
        </div>
        <Button size="md" onClick={openNew}><UserPlus size={14} /> Add Client</Button>
      </div>

      <div className={cn("overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]", viewingClient ? 'max-h-[45%]' : 'flex-1')}>
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 w-10">
                <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked }} onChange={toggleAll} className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]" />
              </th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Code</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Company</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Type</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Industry</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Salesperson</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No clients found.</td></tr>
            ) : items.map(it => (
              <tr key={it.client_id} className={cn('border-b border-[var(--color-border)] last:border-0 cursor-pointer transition-colors', viewingClient?.client_id === it.client_id ? 'bg-[var(--color-primary)]/5 border-l-2 border-l-[var(--color-primary)]' : 'hover:bg-[var(--color-surface-2)]')} onClick={() => selectForView(it)}>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(it.client_id)} onChange={() => toggleRow(it.client_id)} className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]" />
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] font-mono">{it.customer_code || it.client_id}</td>
                <td className="px-3 py-2.5">
                  <p className="text-sm font-medium text-[var(--color-text)]">{it.company_name}</p>
                  {it.trade_name && <p className="text-[11px] text-[var(--color-muted)]">{it.trade_name}</p>}
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{it.customer_type || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{it.industry || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{it.assigned_salesperson || '—'}</td>
                <td className="px-3 py-2.5"><StatusBadge status={it.status} /></td>
                <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(it)} className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]" title="Edit"><Pencil size={13} /></button>
                    <button onClick={() => handleArchiveToggle(it)} disabled={archivingId === it.client_id} className={cn('p-1.5 rounded-md', isArchived(it) ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700' : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700')} title={isArchived(it) ? 'Restore' : 'Archive'}>
                      {archivingId === it.client_id ? <Loader2 size={16} className="animate-spin" /> : isArchived(it) ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Panel — shown below the table when a client is selected */}
      {viewingClient && <ClientDetailPanel client={viewingClient} onClose={() => setViewingClient(null)} onEdit={() => openEdit(viewingClient)} />}

      <p className="text-xs text-[var(--color-muted)]">{items.length} client{items.length !== 1 ? 's' : ''}</p>
      <CustomerDrawer key={drawerKey} open={drawer} onClose={() => setDrawer(false)} item={selectedItem} onSaved={handleSaved} />
    </div>
  )
}
