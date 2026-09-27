import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { Search, UserPlus, Pencil, Loader2, X, Archive, ArchiveRestore, ArrowRightCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { archiveMasterDataRecords, restoreMasterDataRecords } from '@/utils/api'
import { StatusBadge } from '@/components/ui/status-badge'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() { const t = localStorage.getItem('access_token'); return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) } }
async function apiGet(path) { const res = await fetch(`${BASE}${path}`, { headers: authHeaders() }); if (!res.ok) throw new Error('Request failed'); return res.json() }
async function apiPost(path, body) { const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }); if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed') }; return res.json() }
async function apiPatch(path, body) { const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) }); if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed') }; return res.json() }

const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted']
const INTEREST_LEVELS = ['High', 'Medium', 'Low']
const LEAD_SOURCES = ['Referral', 'Website', 'Cold Call', 'Event', 'Social Media', 'Partner', 'Other']

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

// ─── Convert Modal ──────────────────────────────────────────────────────────
function ConvertModal({ open, onClose, lead, onConverted }) {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [form, setForm] = useState({})
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [employees, setEmployees] = useState([])

  useEffect(() => {
    // Fetch employees for salesperson dropdown
    apiGet('/hr/201?page_size=100').then(res => setEmployees(res.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!lead || !open) return undefined
    const timer = setTimeout(() => {
      setForm({
        company_name: lead.company_name || '',
        entity: lead.entity || '',
        trade_name: '',
        customer_type: '',
        industry: '',
        tin_number: '',
        vat_status: '',
        address: '',
        billing_address: '',
        assigned_salesperson: '',
        payment_terms: '',
        credit_limit: '',
        first_name: lead.first_name || '',
        last_name: lead.last_name || '',
        designation: lead.designation || '',
        email: lead.email || '',
        mobile: lead.mobile_number || '',
        project_name: lead.company_name || '',
        expected_closed_date: '',
      })
      setFieldErrors({})
      setError(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [lead, open])

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); setFieldErrors(fe => ({ ...fe, [k]: undefined })) }

  function validate() {
    const errs = {}
    if (!form.company_name?.trim()) errs.company_name = 'Company name is required'
    if (!form.first_name?.trim()) errs.first_name = 'First name is required'
    if (!form.email?.trim()) errs.email = 'Email is required'
    if (!form.project_name?.trim()) errs.project_name = 'Project name is required'
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      const firstKey = Object.keys(errs)[0]
      const el = scrollRef.current?.querySelector(`[data-field="${firstKey}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return false
    }
    return true
  }

  async function handleConvert(e) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true); setError(null)
    try {
      // 1. Try to find existing client by email, or create new one
      let clientId
      try {
        const client = await apiPost('/crm/customers', {
          company_name: form.company_name,
          trade_name: form.trade_name || null,
          customer_type: form.customer_type || null,
          industry: form.industry || null,
          tin_number: form.tin_number || null,
          vat_status: form.vat_status || null,
          address: form.address || '',
          billing_address: form.billing_address || null,
          assigned_salesperson: form.assigned_salesperson || null,
          payment_terms: form.payment_terms || null,
          credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
          entity: form.entity || null,
        })
        clientId = client.client_id
      } catch (createErr) {
        // If duplicate, find existing client by company name
        const existing = await apiGet('/crm/customers')
        const match = existing.find(c => c.company_name === form.company_name)
        if (match) {
          clientId = match.client_id
        } else {
          throw createErr
        }
      }

      // 2. Create contact person
      await apiPost('/contact_list/', {
        client_id: clientId,
        first_name: form.first_name,
        last_name: form.last_name || null,
        job_title: form.designation || null,
        email: form.email,
        landline: form.mobile || null,
        is_primary_contact: true,
      })

      // 3. Create opportunity
      const opp = await apiPost('/opportunities/', {
        client_id: clientId,
        project_name: form.project_name,
        expected_closed_date: form.expected_closed_date || null,
        stage: 'Prospecting',
        entity: form.entity || null,
      })

      // 4. Archive lead with converted reference
      await apiPatch(`/leads/${lead.lead_id}`, {
        lead_status: 'Archived',
        converted_opportunity_id: opp.opportunity_id,
      })

      notify.success(`Converted "${lead.company_name}" to opportunity`)
      onConverted()
      onClose()
      navigate('/crm/pipeline?highlight=' + opp.opportunity_id)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

  function renderField(label, key, placeholder, required, type = 'text') {
    return (
      <div className="flex flex-col gap-1" data-field={key}>
        <label className="text-xs font-medium text-[var(--color-muted-fg)]">{label}{required && reqMark}</label>
        <input type={type} value={form[key] || ''} onChange={e => setField(key, e.target.value)} placeholder={placeholder} className={cn(inputCls, fieldErrors[key] && 'border-[var(--color-danger)]')} />
        {fieldErrors[key] && <p className="text-[11px] text-[var(--color-danger)] mt-0.5">{fieldErrors[key]}</p>}
      </div>
    )
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[560px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div><p className="text-sm font-semibold text-[var(--color-text)]">Convert to Opportunity</p><p className="text-[11px] text-[var(--color-muted-fg)]">Review details before converting lead</p></div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleConvert} className="flex-1 flex flex-col min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Project / Opportunity */}
            <div className="space-y-3">
              {renderField('Project Name', 'project_name', 'Project name', true)}
              {renderField('Expected Close Date', 'expected_closed_date', '', false, 'date')}
            </div>

            {/* Client Details */}
            <div>
              <p className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Client Details</p>
              <div className="space-y-3">
                {renderField('Company Name', 'company_name', 'Prospect Inc.', true)}
                {renderField('Trade Name', 'trade_name', 'Optional trade name', false)}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1" data-field="customer_type">
                    <label className="text-xs font-medium text-[var(--color-muted-fg)]">Customer Type</label>
                    <select value={form.customer_type || ''} onChange={e => setField('customer_type', e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      <option value="Corporate">Corporate</option>
                      <option value="Government">Government</option>
                      <option value="Individual">Individual</option>
                    </select>
                  </div>
                  {renderField('Industry', 'industry', 'Technology', false)}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {renderField('TIN Number', 'tin_number', '000-000-000-000', false)}
                  <div className="flex flex-col gap-1" data-field="vat_status">
                    <label className="text-xs font-medium text-[var(--color-muted-fg)]">VAT Status</label>
                    <select value={form.vat_status || ''} onChange={e => setField('vat_status', e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      <option value="VAT">VAT</option>
                      <option value="Non-VAT">Non-VAT</option>
                      <option value="Zero-Rated">Zero-Rated</option>
                      <option value="VAT Exempt">VAT Exempt</option>
                      <option value="Non-VAT">Non-VAT</option>
                    </select>
                  </div>
                </div>
                {renderField('Billing Address', 'billing_address', 'Full billing address', false)}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="leads-copy-billing"
                    onChange={e => { if (e.target.checked) setField('address', form.billing_address || '') }}
                    className="h-3.5 w-3.5 rounded accent-[var(--color-primary)]"
                  />
                  <label htmlFor="leads-copy-billing" className="text-xs text-[var(--color-muted-fg)] cursor-pointer select-none">Same as billing address</label>
                </div>
                {renderField('Address', 'address', 'Office / delivery address', false)}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1" data-field="assigned_salesperson">
                    <label className="text-xs font-medium text-[var(--color-muted-fg)]">Assigned Salesperson</label>
                    <select value={form.assigned_salesperson || ''} onChange={e => setField('assigned_salesperson', e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      {employees.map(emp => (
                        <option key={emp.employee_id} value={`${emp.first_name} ${emp.last_name}`}>
                          {emp.first_name} {emp.last_name} — {emp.position || 'Employee'}
                        </option>
                      ))}
                    </select>
                  </div>
                  {renderField('Payment Terms', 'payment_terms', 'e.g. Net 30', false)}
                </div>
                {renderField('Credit Limit', 'credit_limit', '0.00', false, 'number')}
              </div>
            </div>

            {/* Contact Person */}
            <div>
              <p className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Contact Person</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {renderField('First Name', 'first_name', 'Juan', true)}
                  {renderField('Last Name', 'last_name', 'Dela Cruz', false)}
                </div>
                {renderField('Designation', 'designation', 'Manager', false)}
                <div className="grid grid-cols-2 gap-3">
                  {renderField('Email', 'email', 'contact@co.com', true, 'email')}
                  {renderField('Mobile', 'mobile', '+63 9XX XXX XXXX', false, 'tel')}
                </div>
              </div>
            </div>

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading}>{loading ? <><Loader2 size={14} className="animate-spin" /> Converting...</> : <><ArrowRightCircle size={14} /> Convert</>}</Button>
          </div>
        </form>
      </div>
    </>
  )
}


// ─── Lead Drawer ────────────────────────────────────────────────────────────
function LeadDrawer({ open, onClose, item, onSaved }) {
  const isEditing = Boolean(item)
  const [form, setForm] = useState(() => item || { lead_status: 'New' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const scrollRef = useRef(null)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); setFieldErrors(fe => ({ ...fe, [k]: undefined })) }

  function validate() {
    const errs = {}
    if (!form.company_name?.trim()) errs.company_name = 'Company name is required'
    if (!form.entity) errs.entity = 'Company is required'
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      const firstKey = Object.keys(errs)[0]
      const el = scrollRef.current?.querySelector(`[data-field="${firstKey}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return false
    }
    return true
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true); setError(null)
    try {
      const payload = {
        company_name: form.company_name || '',
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        designation: form.designation || null,
        email: form.email || null,
        mobile_number: form.mobile_number || null,
        lead_source: form.lead_source || null,
        lead_status: form.lead_status || 'New',
        interest_level: form.interest_level || null,
        entity: form.entity || null,
        remarks: form.remarks || null,
      }
      const saved = isEditing
        ? await apiPatch(`/leads/${item.lead_id}`, payload)
        : await apiPost('/leads/', payload)
      notify.success(isEditing ? 'Lead updated.' : 'Lead created.')
      await onSaved(saved); onClose()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[480px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div><p className="text-sm font-semibold text-[var(--color-text)]">{isEditing ? 'Edit' : 'Add'} Lead</p><p className="text-[11px] text-[var(--color-muted-fg)]">{isEditing ? 'Update lead details' : 'Capture a new lead'}</p></div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Entity / Company selector */}
            <div className="flex flex-col gap-1" data-field="entity">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">GEEK Company{reqMark}</label>
              <select value={form.entity || ''} onChange={e => setField('entity', e.target.value)} className={cn(inputCls, fieldErrors.entity && 'border-[var(--color-danger)]')}>
                <option value="">— Select Company —</option>
                <option value="Expedia">Expedia (EXSSI)</option>
                <option value="GreatnessLab">GreatnessLab</option>
                <option value="Exigent">Exigent Corporation</option>
                <option value="KSI">Kyrios Solutions Inc.</option>
              </select>
              {fieldErrors.entity && <p className="text-[11px] text-[var(--color-danger)] mt-0.5">{fieldErrors.entity}</p>}
            </div>
            <div className="flex flex-col gap-1" data-field="company_name">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Company Name{reqMark}</label>
              <input value={form.company_name || ''} onChange={e => setField('company_name', e.target.value)} placeholder="Prospect Inc." className={cn(inputCls, fieldErrors.company_name && 'border-[var(--color-danger)]')} />
              {fieldErrors.company_name && <p className="text-[11px] text-[var(--color-danger)] mt-0.5">{fieldErrors.company_name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">First Name</label><input value={form.first_name || ''} onChange={e => setField('first_name', e.target.value)} placeholder="Juan" className={inputCls} /></div>
              <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Last Name</label><input value={form.last_name || ''} onChange={e => setField('last_name', e.target.value)} placeholder="Dela Cruz" className={inputCls} /></div>
            </div>
            <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Designation</label><input value={form.designation || ''} onChange={e => setField('designation', e.target.value)} placeholder="Manager" className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Email</label><input type="email" value={form.email || ''} onChange={e => setField('email', e.target.value)} placeholder="lead@co.com" className={inputCls} /></div>
              <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Mobile</label><input value={form.mobile_number || ''} onChange={e => setField('mobile_number', e.target.value)} placeholder="+63 9XX XXX XXXX" className={inputCls} inputMode="tel" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Lead Source</label><select value={form.lead_source || ''} onChange={e => setField('lead_source', e.target.value)} className={inputCls}><option value="">— Select —</option>{LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Interest Level</label><select value={form.interest_level || ''} onChange={e => setField('interest_level', e.target.value)} className={inputCls}><option value="">— Select —</option>{INTEREST_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
            </div>
            <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Status</label><select value={form.lead_status || 'New'} onChange={e => setField('lead_status', e.target.value)} className={inputCls}>{LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Remarks</label><textarea value={form.remarks || ''} onChange={e => setField('remarks', e.target.value)} rows={3} placeholder="Additional notes…" className={inputCls} /></div>
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


// ─── Main Leads Component ───────────────────────────────────────────────────
export default function Leads() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('Active')
  const [statusFilter, setStatusFilter] = useState('All')
  const [entityFilter, setEntityFilter] = useState('All')
  const [drawer, setDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [selectedItem, setSelectedItem] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [actionLoading, setActionLoading] = useState(false)
  const [convertModal, setConvertModal] = useState(false)
  const [convertLead, setConvertLead] = useState(null)

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('search', q)
      const data = await apiGet(`/leads/?${params}`)
      setItems(data || [])
      setSelected(new Set())
    } catch { /* */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { const t = setTimeout(() => load(search), 300); return () => clearTimeout(t) }, [search, load])

  function openNew() { setSelectedItem(null); setDrawerKey(k => k + 1); setDrawer(true) }
  function openEdit(item) { setSelectedItem(item); setDrawerKey(k => k + 1); setDrawer(true) }
  async function handleSaved() { await load(search) }

  function openConvertModal(item) { setConvertLead(item); setConvertModal(true) }
  function closeConvertModal() { setConvertModal(false); setConvertLead(null) }
  async function handleConverted() { await load(search) }

  // Selection helpers
  function toggleRow(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set())
    else setSelected(new Set(filtered.map(i => i.lead_id)))
  }

  // Archive/Restore
  function isArchived(item) { return (item.lead_status || '').toLowerCase() === 'archived' }
  function isConverted(item) { return isArchived(item) && item.converted_opportunity_id }

  async function handleArchiveToggle(item) {
    try {
      if (isArchived(item)) {
        await restoreMasterDataRecords('leads', [item.lead_id])
        notify.success(`${item.company_name} restored.`)
      } else {
        await archiveMasterDataRecords('leads', [item.lead_id])
        notify.success(`${item.company_name} archived.`)
      }
      await load(search)
    } catch (err) { notify.error(err.message || 'Action failed') }
  }

  async function handleBulkArchive(action) {
    const ids = [...selected]
    if (!ids.length) return
    setActionLoading(true)
    try {
      if (action === 'restore') {
        const result = await restoreMasterDataRecords('leads', ids)
        notify.success(`Restored ${result?.updated ?? ids.length} lead(s).`)
      } else {
        const result = await archiveMasterDataRecords('leads', ids)
        notify.success(`Archived ${result?.updated ?? ids.length} lead(s).`)
      }
      await load(search)
    } catch (err) { notify.error(err.message || 'Action failed') }
    finally { setActionLoading(false) }
  }

  // Apply client-side filters
  const filtered = items.filter(i => {
    const status = (i.lead_status || 'New').toLowerCase()
    // View mode filter
    if (viewMode === 'Active' && status === 'archived') return false
    if (viewMode === 'Archived' && status !== 'archived') return false
    // Status dropdown filter (only applies to Active/All views)
    if (statusFilter !== 'All' && viewMode !== 'Archived') {
      if (status !== statusFilter.toLowerCase()) return false
    }
    // Entity filter
    if (entityFilter !== 'All') {
      if ((i.entity || '') !== entityFilter) return false
    }
    return true
  })
  const allChecked = filtered.length > 0 && filtered.every(i => selected.has(i.lead_id))
  const someChecked = selected.size > 0 && !allChecked

  // Metrics
  const totalLeads = items.length
  const newLeads = items.filter(i => (i.lead_status || 'New') === 'New').length
  const qualified = items.filter(i => i.lead_status === 'Qualified').length
  const converted = items.filter(i => i.lead_status === 'Converted' || (i.lead_status === 'Archived' && i.converted_opportunity_id)).length

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">
      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Total Leads</p><p className="mt-1 text-xl font-semibold text-[var(--color-text)]">{totalLeads}</p></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">New</p><p className="mt-1 text-xl font-semibold text-blue-600">{newLeads}</p></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Qualified</p><p className="mt-1 text-xl font-semibold text-emerald-600">{qualified}</p></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Converted</p><p className="mt-1 text-xl font-semibold text-amber-600">{converted}</p></div>
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

      {/* Top bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-2 text-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20" /></div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
            {['Active', 'All', 'Archived'].map(mode => (
              <button key={mode} onClick={() => { setViewMode(mode); if (mode === 'Archived') setStatusFilter('All') }} className={cn('px-3 text-xs font-medium transition-colors', viewMode === mode ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]')}>
                {mode}
              </button>
            ))}
          </div>
          {viewMode !== 'Archived' && (
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="pl-3 pr-7 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-muted-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20 cursor-pointer">
              <option value="All">All Statuses</option>
              {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} className="pl-3 pr-7 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-muted-fg)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20 cursor-pointer">
            <option value="All">All Companies</option>
            <option value="Expedia">Expedia (EXSSI)</option>
            <option value="GreatnessLab">GreatnessLab</option>
            <option value="Exigent">Exigent Corporation</option>
            <option value="KSI">Kyrios Solutions Inc.</option>
          </select>
        </div>
        <Button size="md" onClick={openNew}><UserPlus size={14} /> Add Lead</Button>
      </div>


      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 w-10">
                <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked }} onChange={toggleAll} className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]" />
              </th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Company</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Entity</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Contact</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Email</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Source</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Interest</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No leads found.</td></tr>
            : filtered.map(it => (
              <tr key={it.lead_id} className={cn('border-b border-[var(--color-border)] last:border-0 cursor-pointer transition-colors', selected.has(it.lead_id) ? 'bg-[var(--color-primary)]/5' : 'hover:bg-[var(--color-surface-2)]')} onClick={() => openEdit(it)}>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(it.lead_id)} onChange={() => toggleRow(it.lead_id)} className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]" />
                </td>
                <td className="px-3 py-2.5"><p className="text-sm font-medium text-[var(--color-text)]">{it.company_name}</p></td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{it.entity || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{[it.first_name, it.last_name].filter(Boolean).join(' ') || it.contact_name || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{it.email || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{it.lead_source || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{it.interest_level || '—'}</td>
                <td className="px-3 py-2.5">
                  {isConverted(it) ? <StatusBadge status="Converted" /> : <StatusBadge status={it.lead_status} />}
                </td>
                <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {it.lead_status !== 'Converted' && it.lead_status !== 'Archived' && !it.converted_opportunity_id && (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openConvertModal(it) }} className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                        <ArrowRightCircle size={13} /> Convert
                      </Button>
                    )}
                    <button onClick={() => openEdit(it)} className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]" title="Edit"><Pencil size={13} /></button>
                    {!isConverted(it) && (
                      <button onClick={() => handleArchiveToggle(it)} className={cn('p-1.5 rounded-md', isArchived(it) ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700' : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700')} title={isArchived(it) ? 'Restore' : 'Archive'}>
                        {isArchived(it) ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}{viewMode !== 'All' || statusFilter !== 'All' ? ` (${viewMode}${statusFilter !== 'All' ? ` / ${statusFilter}` : ''})` : ''}</p>
      <LeadDrawer key={drawerKey} open={drawer} onClose={() => setDrawer(false)} item={selectedItem} onSaved={handleSaved} />
      <ConvertModal open={convertModal} onClose={closeConvertModal} lead={convertLead} onConverted={handleConverted} />
    </div>
  )
}
