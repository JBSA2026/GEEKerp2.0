import { useState, useEffect, useRef } from 'react'
import { Loader2, Pencil, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { ModalFrame } from '@/components/ui/overlay'
import { createRecord, updateRecord } from '@/utils/api'
import { notify } from '@/utils/toast'
import { buildPayload, getRecordId, getResourceSingular } from './constants'

// ─── TIN Masked Input ─────────────────────────────────────────────────────────
// Format: xxx-xxx-xxx-xxx or xxx-xxx-xxx-xxxx (dashes are fixed, last segment 3-4 chars)
function TINMaskedInput({ value, onChange, className = '' }) {
  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)]

  // Parse value string into 4 segments
  const segments = (() => {
    const raw = (value || '').replace(/[^0-9]/g, '')
    return [
      raw.slice(0, 3),
      raw.slice(3, 6),
      raw.slice(6, 9),
      raw.slice(9, 13),
    ]
  })()

  function handleChange(index, e) {
    const input = e.target.value.replace(/[^0-9]/g, '')
    const maxLen = index === 3 ? 4 : 3
    const val = input.slice(0, maxLen)
    const newSegments = [...segments]
    newSegments[index] = val
    // Build formatted TIN string
    const formatted = newSegments.filter((s, i) => s || i < 3).join('-')
    onChange(formatted)
    // Auto-advance to next segment when current is full
    if (val.length === maxLen && index < 3) {
      inputRefs[index + 1].current?.focus()
    }
  }

  function handleKeyDown(index, e) {
    // Move back on Backspace when segment is empty
    if (e.key === 'Backspace' && segments[index] === '' && index > 0) {
      e.preventDefault()
      inputRefs[index - 1].current?.focus()
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '').slice(0, 13)
    const newSegments = [
      pasted.slice(0, 3),
      pasted.slice(3, 6),
      pasted.slice(6, 9),
      pasted.slice(9, 13),
    ]
    const formatted = newSegments.filter((s, i) => s || i < 3).join('-')
    onChange(formatted)
    // Focus the last non-full segment
    const lastIdx = pasted.length <= 3 ? 0 : pasted.length <= 6 ? 1 : pasted.length <= 9 ? 2 : 3
    inputRefs[lastIdx].current?.focus()
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {segments.map((seg, i) => (
        <div key={i} className="flex items-center">
          <input
            ref={inputRefs[i]}
            type="text"
            inputMode="numeric"
            maxLength={i === 3 ? 4 : 3}
            value={seg}
            onChange={e => handleChange(i, e)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            placeholder={i === 3 ? '000(0)' : '000'}
            className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-sm text-center transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20 ${i === 3 ? 'w-[4.5rem]' : 'w-[3.5rem]'}`}
          />
          {i < 3 && <span className="mx-0.5 text-sm font-medium text-slate-400">-</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Required fields per resource ─────────────────────────────────────────────
const REQUIRED_FIELDS = {
  clients: ['company_name', 'entity', 'tin_number', 'customer_type', 'vat_status', 'billing_address', 'address'],
  products: ['product_code', 'product_name'],
  supplier_list: ['company_name', 'tin_number'],
  employees: ['first_name', 'last_name', 'email'],
  warehouses: ['warehouse_code', 'warehouse_name'],
  contact_list: ['first_name', 'last_name'],
  leads: ['company_name'],
  documents: ['title', 'document_type'],
}

// ─── RecordDrawer ─────────────────────────────────────────────────────────────
export default function RecordDrawer({ open, onClose, resource, item, onSaved }) {
  const isEditing = Boolean(item)
  const firstRef = useRef(null)
  const formRef = useRef(null)

  const [form, setForm] = useState(() => item || {})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState(null)
  const [devDetail, setDevDetail] = useState(null)
  const [clientOptions, setClientOptions] = useState([])

  useEffect(() => {
    if (open && resource === 'contact_list') {
      const BASE = import.meta.env.VITE_API_URL
      const token = localStorage.getItem('access_token')
      fetch(`${BASE}/crm/customers`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(data => setClientOptions(data || []))
        .catch(() => {})
    }
  }, [open, resource])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => firstRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [open])

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }))
    // Clear the field-level error when user starts typing
    if (fieldErrors?.[k]) {
      setFieldErrors(prev => {
        const next = { ...prev }
        delete next[k]
        return Object.keys(next).length > 0 ? next : null
      })
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors(null)
    setDevDetail(null)

    // ── Frontend validation: check required fields ──
    const required = REQUIRED_FIELDS[resource] || []
    const errors = {}
    for (const field of required) {
      const val = form[field]
      if (!val || (typeof val === 'string' && val.trim() === '')) {
        errors[field] = 'This field is required'
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('Please fill in all required fields.')
      setLoading(false)

      // Scroll to and focus the first invalid field
      const firstErrorField = required.find(f => errors[f])
      if (firstErrorField && formRef.current) {
        const el = formRef.current.querySelector(`[data-field="${firstErrorField}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          const input = el.querySelector('input, textarea, select')
          if (input) setTimeout(() => input.focus(), 300)
        }
      }
      return
    }

    try {
      const payload = buildPayload(resource, form)
      const saved = isEditing
        ? await updateRecord(resource, getRecordId(resource, item), payload)
        : await createRecord(resource, payload)
      await onSaved(saved)
      notify.success(isEditing ? 'Changes saved.' : 'Record created.')
      onClose()
    } catch (err) {
      setError(err.message || String(err))
      setFieldErrors(err.fields || null)
      setDevDetail(err.detail || null)

      // If server returns field-level errors, scroll to the first one
      if (err.fields && Object.keys(err.fields).length > 0 && formRef.current) {
        const firstField = Object.keys(err.fields)[0]
        const el = formRef.current.querySelector(`[data-field="${firstField}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          const input = el.querySelector('input, textarea, select')
          if (input) setTimeout(() => input.focus(), 300)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      title={`${isEditing ? 'Edit' : 'Add'} ${getResourceSingular(resource)}`}
      subtitle={isEditing ? 'Update this record' : `Create a new ${getResourceSingular(resource).toLowerCase()}`}
      className="w-[min(560px,calc(100vw-2rem))]"
    >
      <form onSubmit={handleSubmit} ref={formRef} className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── Client fields ── */}
          {resource === 'clients' && (
            <>
              {isEditing && (
                <Field label="Customer Code">
                  <Input value={form.customer_code || ''} disabled className="bg-slate-50 text-slate-500" />
                </Field>
              )}
              <Field label="Company Name" required error={fieldErrors?.company_name} data-field="company_name">
                <Input ref={firstRef} value={form.company_name || ''} onChange={e => setField('company_name', e.target.value)} placeholder="GEEK Groups" className={fieldErrors?.company_name ? 'border-rose-400 ring-1 ring-rose-400/40' : ''} />
              </Field>
              <Field label="Entity / Company" required error={fieldErrors?.entity} data-field="entity">
                <div className={`flex flex-wrap gap-1.5 rounded-lg p-1.5 ${fieldErrors?.entity ? 'ring-1 ring-rose-400/40 border border-rose-400' : ''}`}>
                  {['Expedia', 'GreatnessLab', 'Exigent', 'KSI'].map(ent => (
                    <button
                      key={ent}
                      type="button"
                      onClick={() => setField('entity', form.entity === ent ? '' : ent)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        form.entity === ent
                          ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                          : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'
                      }`}
                    >
                      {ent === 'KSI' ? 'Kyrios Solutions Inc.' : ent}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Trade Name">
                <Input value={form.trade_name || ''} onChange={e => setField('trade_name', e.target.value)} placeholder="Optional trade name" />
              </Field>
              <Field label="Customer Type" required error={fieldErrors?.customer_type} data-field="customer_type">
                <select value={form.customer_type || ''} onChange={e => setField('customer_type', e.target.value)} className={`w-full rounded-lg border bg-[var(--color-surface)] px-3 py-2 text-sm ${fieldErrors?.customer_type ? 'border-rose-400 ring-1 ring-rose-400/40' : 'border-[var(--color-border)]'}`}>
                  <option value="">— Select —</option>
                  <option value="Corporate">Corporate</option>
                  <option value="Government">Government</option>
                  <option value="Individual">Individual</option>
                </select>
              </Field>
              <Field label="Industry">
                <Input value={form.industry || ''} onChange={e => setField('industry', e.target.value)} placeholder="Technology" />
              </Field>
              <Field label="TIN" required error={fieldErrors?.tin_number} data-field="tin_number">
                <TINMaskedInput value={form.tin_number || ''} onChange={val => setField('tin_number', val)} className={fieldErrors?.tin_number ? 'border-rose-400 ring-1 ring-rose-400/40' : ''} />
              </Field>
              <Field label="VAT Status" required error={fieldErrors?.vat_status} data-field="vat_status">
                <select value={form.vat_status || ''} onChange={e => setField('vat_status', e.target.value)} className={`w-full rounded-lg border bg-[var(--color-surface)] px-3 py-2 text-sm ${fieldErrors?.vat_status ? 'border-rose-400 ring-1 ring-rose-400/40' : 'border-[var(--color-border)]'}`}>
                  <option value="">— Select —</option>
                  <option value="VAT">VAT</option>
                  <option value="Non-VAT">Non-VAT</option>
                  <option value="Zero-Rated">Zero-Rated</option>
                  <option value="VAT Exempt">VAT Exempt</option>
                </select>
                {form.vat_status && form.vat_status !== 'VAT' && (
                  <p className="mt-1 text-[11px] text-amber-600 font-medium">⚠ Certificate of tax status is required</p>
                )}
              </Field>
              <Field label="Billing Address" required error={fieldErrors?.billing_address} data-field="billing_address">
                <Textarea value={form.billing_address || ''} onChange={e => setField('billing_address', e.target.value)} rows={2} className={fieldErrors?.billing_address ? 'border-rose-400 ring-1 ring-rose-400/40' : ''} />
              </Field>
              <div className="flex items-center gap-2 -mt-1">
                <input
                  type="checkbox"
                  id="rd-copy-billing"
                  onChange={e => { if (e.target.checked) setField('address', form.billing_address || '') }}
                  className="h-3.5 w-3.5 rounded accent-[var(--color-primary)]"
                />
                <label htmlFor="rd-copy-billing" className="text-xs text-[var(--color-muted-fg)] cursor-pointer select-none">Same as billing address</label>
              </div>
              <Field label="Address" required error={fieldErrors?.address} data-field="address">
                <Textarea value={form.address || ''} onChange={e => setField('address', e.target.value)} rows={2} className={fieldErrors?.address ? 'border-rose-400 ring-1 ring-rose-400/40' : ''} />
              </Field>
              <Field label="Assigned Salesperson">
                <Input value={form.assigned_salesperson || ''} onChange={e => setField('assigned_salesperson', e.target.value)} placeholder="Salesperson name" />
              </Field>
              <Field label="Payment Terms">
                <Input value={form.payment_terms || ''} onChange={e => setField('payment_terms', e.target.value)} placeholder="e.g. Net 30" />
              </Field>
              <Field label="Credit Limit">
                <Input type="number" value={form.credit_limit || ''} onChange={e => setField('credit_limit', e.target.value)} placeholder="0.00" />
              </Field>
            </>
          )}

          {/* ── Product fields ── */}
          {resource === 'products' && (
            <>
              <Field label="Product Code">
                <Input ref={firstRef} value={form.product_code || ''} onChange={e => setField('product_code', e.target.value)} placeholder="PRD-001" />
              </Field>
              <Field label="Product Name">
                <Input value={form.product_name || ''} onChange={e => setField('product_name', e.target.value)} placeholder="Widget" />
              </Field>
              <Field label="Brand">
                <Input value={form.product_brand || ''} onChange={e => setField('product_brand', e.target.value)} placeholder="Acme" />
              </Field>
              <Field label="Buying Price">
                <Input type="number" value={form.buying_price_vat || ''} onChange={e => setField('buying_price_vat', e.target.value)} placeholder="100.00" />
              </Field>
              <Field label="Selling Price">
                <Input type="number" value={form.selling_price_margin || ''} onChange={e => setField('selling_price_margin', e.target.value)} placeholder="100.00" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantity">
                  <Input type="number" value={form.quantity || ''} onChange={e => setField('quantity', e.target.value)} />
                </Field>
                <Field label="Unit">
                  <Input value={form.unit || ''} onChange={e => setField('unit', e.target.value)} placeholder="pcs" />
                </Field>
              </div>
              <Field label="Supplier">
                <Input value={form.supplier_name || ''} onChange={e => setField('supplier_name', e.target.value)} placeholder="Supplier Inc." />
              </Field>
              <Field label="Fulfillment Type">
                <Select value={form.fulfillment_type || 'DIRECT'} onChange={e => setField('fulfillment_type', e.target.value)}>
                  <option value="DIRECT">Direct (Off-the-shelf)</option>
                  <option value="MTO">Made-to-Order (MTO)</option>
                  <option value="SERVICE">Service</option>
                </Select>
              </Field>
              <Field label="Description">
                <Input value={form.product_description || ''} onChange={e => setField('product_description', e.target.value)} placeholder="Product description" />
              </Field>
            </>
          )}

          {/* ── Employee fields ── */}
          {resource === 'employees' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="First Name">
                  <Input ref={firstRef} value={form.first_name || ''} onChange={e => setField('first_name', e.target.value)} placeholder="Juan" />
                </Field>
                <Field label="Last Name">
                  <Input value={form.last_name || ''} onChange={e => setField('last_name', e.target.value)} placeholder="dela Cruz" />
                </Field>
              </div>
              <Field label="Email">
                <Input value={form.email || ''} onChange={e => setField('email', e.target.value)} placeholder="juan@company.com" />
              </Field>
              <Field label="Password" hint={isEditing ? 'leave blank to keep current password' : 'required'}>
                <Input type="password" value={form.password || ''} onChange={e => setField('password', e.target.value)} placeholder="Temporary password" />
              </Field>
              <Field label="Address">
                <Input value={form.address || ''} onChange={e => setField('address', e.target.value)} placeholder="123 Main St, City, Country" />
              </Field>
              <Field label="Roles" hint="comma-separated">
                <Input value={form.roles_text ?? (form.roles || []).join(', ')} onChange={e => setField('roles_text', e.target.value)} placeholder="SUPER_ADMIN, ADMIN" />
              </Field>
              <Field label="Status">
                <Select value={form.is_active ? 'active' : 'inactive'} onChange={e => setField('is_active', e.target.value === 'active')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
              <Field label="Last Login">
                <Input value={form.last_login ? new Date(form.last_login).toLocaleDateString() : '—'} readOnly />
              </Field>
            </>
          )}

          {/* ── Supplier fields ── */}
          {resource === 'supplier_list' && (
            <>
              {isEditing && (
                <Field label="Supplier ID">
                  <Input value={form.supplier_id || ''} readOnly />
                </Field>
              )}
              <Field label="Company Name">
                <Input ref={firstRef} value={form.company_name || ''} onChange={e => setField('company_name', e.target.value)} placeholder="Supplier Inc." />
              </Field>
              <Field label="Supplier Type">
                <Input value={form.supplier_type || ''} onChange={e => setField('supplier_type', e.target.value)} placeholder="Local/International" />
              </Field>
              <Field label="Industry">
                <Input value={form.industry || ''} onChange={e => setField('industry', e.target.value)} placeholder="Industry" />
              </Field>
              <Field label="TIN">
                <Input value={form.tin_number || ''} onChange={e => setField('tin_number', e.target.value)} placeholder="000-000-000-000" />
              </Field>
              <Field label="VAT Status">
                <select value={form.vat_status || ''} onChange={e => setField('vat_status', e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                  <option value="">— Select —</option>
                  <option value="VATABLE">VATABLE</option>
                  <option value="NON-VAT">NON-VAT</option>
                  <option value="ZERO-RATED">ZERO-RATED</option>
                  <option value="VAT EXEMPT">VAT EXEMPT</option>
                </select>
              </Field>
              <Field label="Billing Address">
                <Input value={form.billing_address || ''} onChange={e => setField('billing_address', e.target.value)} placeholder="Full billing address" />
              </Field>
              <div className="flex items-center gap-2 -mt-1">
                <input
                  type="checkbox"
                  id="rd-supplier-copy-billing"
                  onChange={e => { if (e.target.checked) setField('address', form.billing_address || '') }}
                  className="h-3.5 w-3.5 rounded accent-[var(--color-primary)]"
                />
                <label htmlFor="rd-supplier-copy-billing" className="text-xs text-[var(--color-muted-fg)] cursor-pointer select-none">Same as billing address</label>
              </div>
              <Field label="Payment Terms">
                <Input value={form.payment_terms || ''} onChange={e => setField('payment_terms', e.target.value)} placeholder="e.g., Net 30" />
              </Field>
              <Field label="Employee ID">
                <Input type="number" value={form.employee_id || ''} onChange={e => setField('employee_id', e.target.value)} placeholder="1" />
              </Field>
              <Field label="Status">
                <Input value={form.status || ''} onChange={e => setField('status', e.target.value)} placeholder="Active/Inactive" />
              </Field>
            </>
          )}

          {/* ── Warehouse fields ── */}
          {resource === 'warehouses' && (
            <>
              {isEditing && (
                <Field label="Warehouse ID">
                  <Input value={form.warehouse_id || ''} readOnly />
                </Field>
              )}
              <Field label="Warehouse Code">
                <Input ref={firstRef} value={form.warehouse_code || ''} onChange={e => setField('warehouse_code', e.target.value)} placeholder="WH-MAIN" />
              </Field>
              <Field label="Warehouse Name">
                <Input value={form.warehouse_name || ''} onChange={e => setField('warehouse_name', e.target.value)} placeholder="Main Warehouse" />
              </Field>
              <Field label="Warehouse Type">
                <Input value={form.warehouse_type || ''} onChange={e => setField('warehouse_type', e.target.value)} placeholder="Main / Branch / Transit" />
              </Field>
              <Field label="Address">
                <Textarea value={form.address || ''} onChange={e => setField('address', e.target.value)} rows={3} />
              </Field>
              <Field label="Contact Person">
                <Input value={form.contact_person || ''} onChange={e => setField('contact_person', e.target.value)} placeholder="Warehouse manager" />
              </Field>
              <Field label="Contact Number">
                <Input value={form.contact_number || ''} onChange={e => setField('contact_number', e.target.value)} placeholder="+63 9XX XXX XXXX" />
              </Field>
              <Field label="Status">
                <Select value={form.status || 'active'} onChange={e => setField('status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </Select>
              </Field>
            </>
          )}

          {/* ── Document fields ── */}
          {resource === 'documents' && (
            <>
              <Field label="Title">
                <Input ref={firstRef} value={form.title || ''} onChange={e => setField('title', e.target.value)} placeholder="Service Agreement — Acme Corp" />
              </Field>
              <Field label="Document Type">
                <select value={form.document_type || ''} onChange={e => setField('document_type', e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                  <option value="">— Select Type —</option>
                  {['Quotations', 'Contracts', 'POs', 'Invoices', 'ORs', 'Tax Documents', 'HR Files', 'NDA', 'Project Documents'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Company">
                <select value={form.entity || ''} onChange={e => setField('entity', e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                  <option value="">— Select Company —</option>
                  {['Expedia', 'GreatnessLab', 'Exigent', 'KSI'].map(e => <option key={e} value={e}>{e === 'KSI' ? 'Kyrios Solutions Inc.' : e}</option>)}
                </select>
              </Field>
              <Field label="Related Module">
                <Input value={form.related_module || ''} onChange={e => setField('related_module', e.target.value)} placeholder="Quotation / Purchasing / Projects" />
              </Field>
              <Field label="Related Transaction">
                <Input value={form.related_transaction || ''} onChange={e => setField('related_transaction', e.target.value)} placeholder="EXP-2026-QTN-0001" />
              </Field>
              <Field label="Description">
                <Input value={form.description || ''} onChange={e => setField('description', e.target.value)} placeholder="Optional notes" />
              </Field>
            </>
          )}

          {/* ── Contact fields ── */}
          {resource === 'contact_list' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="First Name">
                  <Input ref={firstRef} value={form.first_name || ''} onChange={e => setField('first_name', e.target.value)} placeholder="Juan" />
                </Field>
                <Field label="Last Name">
                  <Input value={form.last_name || ''} onChange={e => setField('last_name', e.target.value)} placeholder="dela Cruz" />
                </Field>
              </div>
              <Field label="Job Title">
                <Input value={form.job_title || ''} onChange={e => setField('job_title', e.target.value)} placeholder="Manager" />
              </Field>
              <Field label="Email">
                <Input value={form.email || ''} onChange={e => setField('email', e.target.value)} placeholder="contact@company.com" />
              </Field>
              <Field label="Phone">
                <Input value={form.landline || ''} onChange={e => setField('landline', e.target.value)} placeholder="(02) 8XXX-XXXX" />
              </Field>
              <Field label="Company">
                <select value={form.client_id || ''} onChange={e => setField('client_id', e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                  <option value="">— Select company —</option>
                  {clientOptions.map(c => <option key={c.client_id} value={c.client_id}>{c.company_name}</option>)}
                </select>
              </Field>
              <Field label="Primary Contact">
                <Select value={form.is_primary_contact ? 'yes' : 'no'} onChange={e => setField('is_primary_contact', e.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </Select>
              </Field>
            </>
          )}

          {/* ── Lead fields ── */}
          {resource === 'leads' && (
            <>
              <Field label="Company Name">
                <Input ref={firstRef} value={form.company_name || ''} onChange={e => setField('company_name', e.target.value)} placeholder="Company Inc." />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="First Name">
                  <Input value={form.first_name || ''} onChange={e => setField('first_name', e.target.value)} placeholder="Juan" />
                </Field>
                <Field label="Last Name">
                  <Input value={form.last_name || ''} onChange={e => setField('last_name', e.target.value)} placeholder="Dela Cruz" />
                </Field>
              </div>
              <Field label="Email">
                <Input value={form.email || ''} onChange={e => setField('email', e.target.value)} placeholder="lead@company.com" />
              </Field>
              <Field label="Mobile Number">
                <Input value={form.mobile_number || ''} onChange={e => setField('mobile_number', e.target.value)} placeholder="+63 9XX XXX XXXX" />
              </Field>
              <Field label="Lead Source">
                <Input value={form.lead_source || ''} onChange={e => setField('lead_source', e.target.value)} placeholder="Referral / Website / Event" />
              </Field>
              <Field label="Lead Status">
                <Input value={form.lead_status || ''} onChange={e => setField('lead_status', e.target.value)} placeholder="New / Contacted / Qualified" />
              </Field>
              <Field label="Interest Level">
                <Input value={form.interest_level || ''} onChange={e => setField('interest_level', e.target.value)} placeholder="High / Medium / Low" />
              </Field>
              <Field label="Remarks">
                <Textarea value={form.remarks || ''} onChange={e => setField('remarks', e.target.value)} rows={3} />
              </Field>
              <Field label="Client ID">
                <Input type="number" value={form.client_id || ''} onChange={e => setField('client_id', e.target.value)} />
              </Field>
              <Field label="Employee ID">
                <Input type="number" value={form.employee_id || ''} onChange={e => setField('employee_id', e.target.value)} />
              </Field>
            </>
          )}

          {/* ── Sales Activity fields ── */}
          {resource === 'sales_activity' && (
            <>
              <Field label="Subject">
                <Input ref={firstRef} value={form.subject || ''} onChange={e => setField('subject', e.target.value)} placeholder="Follow-up call" />
              </Field>
              <Field label="Activity Type">
                <Input value={form.activity_type || ''} onChange={e => setField('activity_type', e.target.value)} placeholder="Call / Email / Meeting" />
              </Field>
              <Field label="Activity Date">
                <Input type="date" value={form.activity_date || ''} onChange={e => setField('activity_date', e.target.value)} />
              </Field>
              <Field label="Notes / Outcome">
                <Textarea value={form.notes_outcome || ''} onChange={e => setField('notes_outcome', e.target.value)} rows={3} />
              </Field>
              <Field label="Employee ID">
                <Input type="number" value={form.employee_id || ''} onChange={e => setField('employee_id', e.target.value)} />
              </Field>
            </>
          )}

          {/* ── Opportunity fields ── */}
          {resource === 'opportunities' && (
            <>
              <Field label="Project Name">
                <Input ref={firstRef} value={form.project_name || ''} onChange={e => setField('project_name', e.target.value)} placeholder="New ERP Implementation" />
              </Field>
              <Field label="Estimated Value">
                <Input type="number" value={form.estimated_value || ''} onChange={e => setField('estimated_value', e.target.value)} placeholder="100000" />
              </Field>
              <Field label="Probability %">
                <Input type="number" value={form.probability_percentage || ''} onChange={e => setField('probability_percentage', e.target.value)} placeholder="75" />
              </Field>
              <Field label="Stage">
                <Input value={form.stage || ''} onChange={e => setField('stage', e.target.value)} placeholder="Prospecting / Proposal / Negotiation" />
              </Field>
              <Field label="Expected Close Date">
                <Input type="date" value={form.expected_closed_date || ''} onChange={e => setField('expected_closed_date', e.target.value)} />
              </Field>
              <Field label="Competitor">
                <Input value={form.competitor || ''} onChange={e => setField('competitor', e.target.value)} placeholder="Competitor Inc." />
              </Field>
              <Field label="Loss Reason">
                <Input value={form.loss_reason || ''} onChange={e => setField('loss_reason', e.target.value)} placeholder="Price / Features / Timing" />
              </Field>
              <Field label="Remarks">
                <Textarea value={form.remarks || ''} onChange={e => setField('remarks', e.target.value)} rows={3} />
              </Field>
              <Field label="Client ID">
                <Input type="number" value={form.client_id || ''} onChange={e => setField('client_id', e.target.value)} />
              </Field>
              <Field label="Employee ID">
                <Input type="number" value={form.employee_id || ''} onChange={e => setField('employee_id', e.target.value)} />
              </Field>
            </>
          )}

          {/* ── Sales Forecast fields ── */}
          {resource === 'sales_forecast' && (
            <>
              <Field label="Forecast Period">
                <Input ref={firstRef} value={form.forecast_period || ''} onChange={e => setField('forecast_period', e.target.value)} placeholder="Q1 2026" />
              </Field>
              <Field label="Quota Amount">
                <Input type="number" value={form.quota_amount || ''} onChange={e => setField('quota_amount', e.target.value)} placeholder="500000" />
              </Field>
              <Field label="Pipeline Value">
                <Input type="number" value={form.pipeline_value || ''} onChange={e => setField('pipeline_value', e.target.value)} placeholder="750000" />
              </Field>
              <Field label="Weighted Value">
                <Input type="number" value={form.weighted_value || ''} onChange={e => setField('weighted_value', e.target.value)} placeholder="400000" />
              </Field>
              <Field label="Achieved Amount">
                <Input type="number" value={form.achieve_amount || ''} onChange={e => setField('achieve_amount', e.target.value)} placeholder="300000" />
              </Field>
              <Field label="Employee ID">
                <Input type="number" value={form.employee_id || ''} onChange={e => setField('employee_id', e.target.value)} />
              </Field>
            </>
          )}

          {/* ── Service fields ── */}
          {resource === 'services' && (
            <>
              <Field label="Service Name">
                <Input ref={firstRef} value={form.service_name || ''} onChange={e => setField('service_name', e.target.value)} placeholder="IT Support" />
              </Field>
              <Field label="Company Name">
                <Input value={form.company_name || ''} onChange={e => setField('company_name', e.target.value)} placeholder="GEEK Groups" />
              </Field>
              <Field label="Category">
                <Input value={form.category || ''} onChange={e => setField('category', e.target.value)} placeholder="Technology" />
              </Field>
              <Field label="Sub-Category">
                <Input value={form.sub_category || ''} onChange={e => setField('sub_category', e.target.value)} placeholder="Managed Services" />
              </Field>
              <Field label="Tax Category">
                <Input value={form.tax_category || ''} onChange={e => setField('tax_category', e.target.value)} placeholder="VAT / Non-VAT" />
              </Field>
              <Field label="Margin %">
                <Input type="number" value={form.margin_percentage || ''} onChange={e => setField('margin_percentage', e.target.value)} placeholder="25" />
              </Field>
              <Field label="Warranty">
                <Input value={form.warranty || ''} onChange={e => setField('warranty', e.target.value)} placeholder="Yes / No" />
              </Field>
              <Field label="Warranty Period">
                <Input value={form.warranty_period || ''} onChange={e => setField('warranty_period', e.target.value)} placeholder="12 months" />
              </Field>
              <Field label="Description">
                <Textarea value={form.service_description || ''} onChange={e => setField('service_description', e.target.value)} rows={3} />
              </Field>
              <Field label="Notes">
                <Textarea value={form.service_notes || ''} onChange={e => setField('service_notes', e.target.value)} rows={3} />
              </Field>
            </>
          )}

          {/* Error display */}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600">
              <p className="font-medium">{error}</p>
              {fieldErrors && Object.keys(fieldErrors).length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px]">
                  {Object.entries(fieldErrors).map(([field, msg]) => (
                    <li key={field}>
                      <span className="font-medium capitalize">{field.replace(/_/g, ' ')}</span>: {msg}
                    </li>
                  ))}
                </ul>
              )}
              {devDetail && (
                <details className="mt-2 text-[11px] text-rose-500/80">
                  <summary className="cursor-pointer select-none">Technical details</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">{devDetail}</pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Form action buttons */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#d8e2ef] bg-[#e9eef8] shrink-0">
          <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" size="md" className="flex-1" disabled={loading}>
            {loading
              ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
              : <>{isEditing ? <Pencil size={14} /> : <UserPlus size={14} />} {isEditing ? 'Save Changes' : 'Create'}</>
            }
          </Button>
        </div>
      </form>
    </ModalFrame>
  )
}
