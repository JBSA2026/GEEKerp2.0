import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { Plus, Pencil, Loader2, X, Archive, ArchiveRestore } from 'lucide-react'
import { cn } from '@/lib/utils'
import { archiveMasterDataRecords, restoreMasterDataRecords } from '@/utils/api'

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

function formatCurrency(val) {
  if (!val && val !== 0) return '—'
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const PERIODS = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026']

function ForecastDrawer({ open, onClose, item, onSaved }) {
  const isEditing = Boolean(item)
  const [form, setForm] = useState(() => item || {})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
  const isValid = Boolean(form.forecast_period?.trim())

  async function handleSubmit(e) {
    e.preventDefault(); if (!isValid) return; setLoading(true); setError(null)
    try {
      const payload = {
        forecast_period: form.forecast_period || '',
        quota_amount: form.quota_amount ? Number(form.quota_amount) : null,
        pipeline_value: form.pipeline_value ? Number(form.pipeline_value) : null,
        weighted_value: form.weighted_value ? Number(form.weighted_value) : null,
        achieve_amount: form.achieve_amount ? Number(form.achieve_amount) : null,
      }
      const saved = isEditing
        ? await apiPatch(`/sales_forecast/${item.forecast_id}`, payload)
        : await apiPost('/sales_forecast/', payload)
      notify.success(isEditing ? 'Forecast updated.' : 'Forecast created.')
      await onSaved(saved); onClose()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[440px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div><p className="text-sm font-semibold text-[var(--color-text)]">{isEditing ? 'Edit' : 'Add'} Forecast</p><p className="text-[11px] text-[var(--color-muted-fg)]">Set quotas and targets</p></div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Period<span className="text-[var(--color-danger)] ml-0.5">*</span></label><select value={form.forecast_period || ''} onChange={e => setField('forecast_period', e.target.value)} className={inputCls}><option value="">— Select period —</option>{PERIODS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Quota Amount (₱)</label><input type="number" value={form.quota_amount || ''} onChange={e => setField('quota_amount', e.target.value)} placeholder="Target quota" className={inputCls} /></div>
            <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Pipeline Value (₱)</label><input type="number" value={form.pipeline_value || ''} onChange={e => setField('pipeline_value', e.target.value)} placeholder="Current pipeline" className={inputCls} /></div>
            <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Weighted Value (₱)</label><input type="number" value={form.weighted_value || ''} onChange={e => setField('weighted_value', e.target.value)} placeholder="Probability-weighted" className={inputCls} /></div>
            <div className="flex flex-col gap-1"><label className="text-xs font-medium text-[var(--color-muted-fg)]">Achieved Amount (₱)</label><input type="number" value={form.achieve_amount || ''} onChange={e => setField('achieve_amount', e.target.value)} placeholder="Closed revenue" className={inputCls} /></div>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading || !isValid}>{loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <>{isEditing ? <Pencil size={14} /> : <Plus size={14} />} {isEditing ? 'Save' : 'Create'}</>}</Button>
          </div>
        </form>
      </div>
    </>
  )
}

export default function SalesForecast() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [selectedItem, setSelectedItem] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [actionLoading, setActionLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await apiGet('/sales_forecast/') || []); setSelected(new Set()) } catch { /* */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  function openNew() { setSelectedItem(null); setDrawerKey(k => k + 1); setDrawer(true) }
  function openEdit(item) { setSelectedItem(item); setDrawerKey(k => k + 1); setDrawer(true) }
  async function handleSaved() { await load() }

  // Selection
  function toggleRow(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set())
    else setSelected(new Set(items.map(i => i.forecast_id)))
  }

  // Archive/Restore
  function isArchived(item) {
    return (item.status || '').toLowerCase() === 'archived'
  }

  async function handleArchiveToggle(item) {
    try {
      if (isArchived(item)) {
        await restoreMasterDataRecords('sales_forecast', [item.forecast_id])
        notify.success(`${item.forecast_period} restored.`)
      } else {
        await archiveMasterDataRecords('sales_forecast', [item.forecast_id])
        notify.success(`${item.forecast_period} archived.`)
      }
      await load()
    } catch (err) { notify.error(err.message || 'Action failed') }
  }

  async function handleBulkArchive(action) {
    const ids = [...selected]
    if (!ids.length) return
    setActionLoading(true)
    try {
      if (action === 'restore') {
        const result = await restoreMasterDataRecords('sales_forecast', ids)
        notify.success(`Restored ${result?.updated ?? ids.length} forecast(s).`)
      } else {
        const result = await archiveMasterDataRecords('sales_forecast', ids)
        notify.success(`Archived ${result?.updated ?? ids.length} forecast(s).`)
      }
      await load()
    } catch (err) { notify.error(err.message || 'Action failed') }
    finally { setActionLoading(false) }
  }

  const allChecked = items.length > 0 && items.every(i => selected.has(i.forecast_id))
  const someChecked = selected.size > 0 && !allChecked

  const totalQuota = items.reduce((s, i) => s + (Number(i.quota_amount) || 0), 0)
  const totalAchieved = items.reduce((s, i) => s + (Number(i.achieve_amount) || 0), 0)
  const attainment = totalQuota > 0 ? Math.round((totalAchieved / totalQuota) * 100) : 0

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Total Quota</p><p className="mt-1 text-xl font-semibold text-[var(--color-text)]">{formatCurrency(totalQuota)}</p></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Achieved</p><p className="mt-1 text-xl font-semibold text-emerald-600">{formatCurrency(totalAchieved)}</p></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Attainment</p><p className="mt-1 text-xl font-semibold text-[var(--color-text)]">{attainment}%</p></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase">Periods</p><p className="mt-1 text-xl font-semibold text-[var(--color-text)]">{items.length}</p></div>
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

      <div className="flex items-center gap-3"><div className="flex-1" /><Button size="md" onClick={openNew}><Plus size={14} /> Add Forecast</Button></div>

      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 w-10">
                <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked }} onChange={toggleAll} className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]" />
              </th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Period</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Quota</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Pipeline</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Weighted</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Achieved</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">%</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            : items.length === 0 ? <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No forecasts yet.</td></tr>
            : items.map(it => {
              const pct = it.quota_amount > 0 ? Math.round(((it.achieve_amount || 0) / it.quota_amount) * 100) : 0
              return (
                <tr key={it.forecast_id} className={cn('border-b border-[var(--color-border)] last:border-0 cursor-pointer transition-colors', selected.has(it.forecast_id) ? 'bg-[var(--color-primary)]/5' : 'hover:bg-[var(--color-surface-2)]')} onClick={() => openEdit(it)}>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(it.forecast_id)} onChange={() => toggleRow(it.forecast_id)} className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]" />
                  </td>
                  <td className="px-3 py-2.5 text-sm font-medium text-[var(--color-text)]">{it.forecast_period}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{formatCurrency(it.quota_amount)}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{formatCurrency(it.pipeline_value)}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{formatCurrency(it.weighted_value)}</td>
                  <td className="px-3 py-2.5 text-xs font-medium text-emerald-600">{formatCurrency(it.achieve_amount)}</td>
                  <td className="px-3 py-2.5"><span className={cn('text-xs font-medium', pct >= 100 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-rose-600')}>{pct}%</span></td>
                  <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(it)} className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]" title="Edit"><Pencil size={13} /></button>
                      <button onClick={() => handleArchiveToggle(it)} className={cn('p-1.5 rounded-md', isArchived(it) ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700' : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700')} title={isArchived(it) ? 'Restore' : 'Archive'}>
                        {isArchived(it) ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ForecastDrawer key={drawerKey} open={drawer} onClose={() => setDrawer(false)} item={selectedItem} onSaved={handleSaved} />
    </div>
  )
}
