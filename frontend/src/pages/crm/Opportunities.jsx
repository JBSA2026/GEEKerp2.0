import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { Search, Plus, Pencil, Loader2, X, Archive, ArchiveRestore } from 'lucide-react'
import { cn } from '@/lib/utils'
import { archiveMasterDataRecords, restoreMasterDataRecords } from '@/utils/api'
import { StatusBadge } from '@/components/ui/status-badge'

const BASE = import.meta.env.VITE_API_URL
function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}
async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}
async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed') }
  return res.json()
}
async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed') }
  return res.json()
}

const STAGES = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']

function StageBadge({ stage }) {
  return <StatusBadge status={stage || 'Prospecting'} />
}

// ─── Opportunity Drawer ─────────────────────────────────────────────────────
function OpportunityDrawer({ open, onClose, item, onSaved, customers }) {
  const isEditing = Boolean(item)
  const [form, setForm] = useState(() => item || { stage: 'Prospecting' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [competitorInput, setCompetitorInput] = useState('')
  const formRef = useRef(null)
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); setFieldErrors(fe => ({ ...fe, [k]: undefined })) }

  // Competitors stored as comma-separated string, managed as array in UI
  function getCompetitors() {
    const raw = form.competitor || ''
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }
  function addCompetitor() {
    const val = competitorInput.trim()
    if (!val) return
    const existing = getCompetitors()
    if (existing.includes(val)) { setCompetitorInput(''); return }
    setField('competitor', [...existing, val].join(', '))
    setCompetitorInput('')
  }
  function removeCompetitor(name) {
    const updated = getCompetitors().filter(c => c !== name)
    setField('competitor', updated.join(', '))
  }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
  function validate() {
    const errs = {}
    if (!form.project_name?.trim()) errs.project_name = 'Project/Deal name is required'
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      const firstKey = Object.keys(errs)[0]
      const el = formRef.current?.querySelector(`[data-field="${firstKey}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return false
    }
    return true
  }

  async function handleSubmit(e) {
    e.preventDefault(); if (!validate()) return; setLoading(true); setError(null)
    try {
      const payload = {
        project_name: form.project_name || '',
        client_id: form.client_id ? Number(form.client_id) : null,
        employee_id: form.employee_id ? Number(form.employee_id) : null,
        stage: form.stage || 'Prospecting',
        expected_closed_date: form.expected_closed_date ? `${form.expected_closed_date}T00:00:00` : null,
        competitor: form.competitor || null,
        loss_reason: form.loss_reason || null,
        remarks: form.remarks || null,
      }
      const saved = isEditing
        ? await apiPatch(`/opportunities/${item.opportunity_id}`, payload)
        : await apiPost('/opportunities/', payload)
      notify.success(isEditing ? 'Opportunity updated.' : 'Opportunity created.')
      await onSaved(saved); onClose()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[500px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div><p className="text-sm font-semibold text-[var(--color-text)]">{isEditing ? 'Edit' : 'Add'} Opportunity</p><p className="text-[11px] text-[var(--color-muted-fg)]">{isEditing ? 'Update deal details' : 'Create a new sales opportunity'}</p></div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0" ref={formRef}>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="flex flex-col gap-1" data-field="project_name"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Project / Deal Name{reqMark}</label><input value={form.project_name || ''} onChange={e => setField('project_name', e.target.value)} placeholder="New ERP Implementation" className={cn(inputCls, fieldErrors.project_name && 'border-[var(--color-danger)]')} />{fieldErrors.project_name && <p className="text-[11px] text-[var(--color-danger)] mt-0.5">{fieldErrors.project_name}</p>}</div>
            <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Client</label>
              <select value={form.client_id || ''} onChange={e => setField('client_id', e.target.value)} className={inputCls}><option value="">— Select client —</option>{(customers || []).map(c => <option key={c.client_id} value={c.client_id}>{c.company_name}</option>)}</select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Stage</label>
                {isEditing ? (
                  <select value={form.stage || 'Prospecting'} onChange={e => setField('stage', e.target.value)} className={inputCls}>{STAGES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                ) : (
                  <div className={`${inputCls} bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] cursor-not-allowed`}>Prospecting <span className="text-[10px] ml-1">(default)</span></div>
                )}
              </div>
              <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Expected Close Date</label><input type="date" value={form.expected_closed_date ? form.expected_closed_date.slice(0, 10) : ''} onChange={e => setField('expected_closed_date', e.target.value)} className={inputCls} /></div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Competitors</label>
              <div className="flex flex-wrap gap-1.5 min-h-[32px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
                {getCompetitors().map(c => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text)]">
                    {c}
                    <button type="button" onClick={() => removeCompetitor(c)} className="text-[var(--color-muted-fg)] hover:text-[var(--color-danger)] ml-0.5"><X size={11} /></button>
                  </span>
                ))}
                <input
                  value={competitorInput}
                  onChange={e => setCompetitorInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor() } }}
                  placeholder={getCompetitors().length === 0 ? 'Type and press Enter to add...' : 'Add more...'}
                  className="flex-1 min-w-[120px] bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] outline-none border-none py-0.5"
                />
              </div>
              <p className="text-[10px] text-[var(--color-muted)]">Press Enter to add each competitor</p>
            </div>
            <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Remarks</label><textarea value={form.remarks || ''} onChange={e => setField('remarks', e.target.value)} rows={3} placeholder="Notes about this deal…" className={inputCls} /></div>
            {form.stage === 'Closed Lost' && <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Loss Reason</label><input value={form.loss_reason || ''} onChange={e => setField('loss_reason', e.target.value)} placeholder="Price / Features / Timing" className={inputCls} /></div>}
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading}>{loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <>{isEditing ? <Pencil size={14} /> : <Plus size={14} />} {isEditing ? 'Save' : 'Create Deal'}</>}</Button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Main Opportunities Component ───────────────────────────────────────────
export default function Opportunities() {
  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('All')
  const [viewMode, setViewMode] = useState('active') // 'active' | 'archived' | 'all'
  const [drawer, setDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [selectedItem, setSelectedItem] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [actionLoading, setActionLoading] = useState(false)

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('search', q)
      setItems(await apiGet(`/opportunities/?${params}`) || [])
      setSelected(new Set())
    } catch { /* */ } finally { setLoading(false) }
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

  // Selection
  function toggleRow(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set())
    else setSelected(new Set(filtered.map(i => i.opportunity_id)))
  }

  // Archive/Restore — uses the separate 'status' field, NOT 'stage'
  function isArchived(item) {
    return (item.status || 'active').toLowerCase() === 'archived'
  }

  async function handleArchiveToggle(item) {
    try {
      if (isArchived(item)) {
        await restoreMasterDataRecords('opportunities', [item.opportunity_id])
        notify.success(`${item.project_name} restored.`)
      } else {
        await archiveMasterDataRecords('opportunities', [item.opportunity_id])
        notify.success(`${item.project_name} archived.`)
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
        const result = await restoreMasterDataRecords('opportunities', ids)
        notify.success(`Restored ${result?.updated ?? ids.length} opportunity(ies).`)
      } else {
        const result = await archiveMasterDataRecords('opportunities', ids)
        notify.success(`Archived ${result?.updated ?? ids.length} opportunity(ies).`)
      }
      await load(search)
    } catch (err) { notify.error(err.message || 'Action failed') }
    finally { setActionLoading(false) }
  }

  // Filter by viewMode first (active/archived), then by stage
  const viewFiltered = viewMode === 'archived'
    ? items.filter(i => (i.status || 'active') === 'archived')
    : items.filter(i => (i.status || 'active') === 'active')
  const filtered = filterStage === 'All' ? viewFiltered : viewFiltered.filter(i => (i.stage || 'Prospecting') === filterStage)
  const allChecked = filtered.length > 0 && filtered.every(i => selected.has(i.opportunity_id))
  const someChecked = selected.size > 0 && !allChecked

  // Metrics
  const openDeals = items.filter(i => i.stage !== 'Closed Won' && i.stage !== 'Closed Lost').length
  const wonDeals = items.filter(i => i.stage === 'Closed Won').length
  const lostDeals = items.filter(i => i.stage === 'Closed Lost').length

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">
      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Total Deals</p><p className="mt-1 text-xl font-semibold text-[var(--color-text)]">{items.length}</p></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Open</p><p className="mt-1 text-xl font-semibold text-blue-600">{openDeals}</p></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Won</p><p className="mt-1 text-xl font-semibold text-emerald-600">{wonDeals}</p></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Lost</p><p className="mt-1 text-xl font-semibold text-rose-600">{lostDeals}</p></div>
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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search opportunities…" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 py-2 text-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20" /></div>

        {/* Active / Archived toggle */}
        <div className="flex h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {['active', 'archived'].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} className={cn('px-3 text-xs font-medium transition-colors capitalize', viewMode === mode ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]')}>
              {mode === 'active' ? 'Active' : 'Archived'}
            </button>
          ))}
        </div>

        {/* Stage dropdown */}
        <select
          value={filterStage}
          onChange={e => setFilterStage(e.target.value)}
          className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-muted-fg)] font-medium outline-none cursor-pointer hover:bg-[var(--color-surface-2)] appearance-none pr-7 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat"
        >
          <option value="All">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <Button size="md" onClick={openNew}><Plus size={14} /> Add Deal</Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 w-10">
                <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked }} onChange={toggleAll} className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]" />
              </th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Deal Name</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Customer</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Competitors</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Stage</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Close Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No opportunities found.</td></tr>
            : filtered.map(it => (
              <tr key={it.opportunity_id} className={cn('border-b border-[var(--color-border)] last:border-0 cursor-pointer transition-colors', selected.has(it.opportunity_id) ? 'bg-[var(--color-primary)]/5' : 'hover:bg-[var(--color-surface-2)]')} onClick={() => openEdit(it)}>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(it.opportunity_id)} onChange={() => toggleRow(it.opportunity_id)} className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]" />
                </td>
                <td className="px-3 py-2.5"><p className="text-sm font-medium text-[var(--color-text)]">{it.project_name || '—'}</p></td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{customerName(it.client_id)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {(it.competitor || '').split(',').map(c => c.trim()).filter(Boolean).map(c => (
                      <span key={c} className="inline-flex rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted-fg)]">{c}</span>
                    ))}
                    {!(it.competitor || '').trim() && <span className="text-xs text-[var(--color-muted)]">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2.5"><StageBadge stage={it.stage} /></td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{it.expected_closed_date ? new Date(it.expected_closed_date).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(it)} className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]" title="Edit"><Pencil size={13} /></button>
                    <button onClick={() => handleArchiveToggle(it)} className={cn('p-1.5 rounded-md', isArchived(it) ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700' : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700')} title={isArchived(it) ? 'Restore' : 'Archive'}>
                      {isArchived(it) ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">{filtered.length} opportunit{filtered.length !== 1 ? 'ies' : 'y'}{filterStage !== 'All' ? ` (${filterStage})` : ''}</p>
      <OpportunityDrawer key={drawerKey} open={drawer} onClose={() => setDrawer(false)} item={selectedItem} onSaved={handleSaved} customers={customers} />
    </div>
  )
}
