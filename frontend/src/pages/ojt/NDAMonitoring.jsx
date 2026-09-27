import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { notify } from '@/utils/toast'
import { Plus, Pencil, Loader2, X, FileCheck, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_URL

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
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.fields = data.fields; throw err }
  return data
}
async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.fields = data.fields; throw err }
  return data
}

const NDA_STATUSES = ['Pending', 'Signed', 'Expired', 'Waived']
const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'
const reqMark = <span className="text-[var(--color-danger)] ml-0.5">*</span>

// ─── NDA Drawer ─────────────────────────────────────────────────────────────
function NDADrawer({ open, onClose, item, interns, onSaved }) {
  const isEditing = Boolean(item)
  const [form, setForm] = useState(() => item || { nda_status: 'Pending' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (open) {
      setForm(isEditing ? item : { nda_status: 'Pending' })
      setError(null)
    }
  }, [open, item, isEditing])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isEditing && !form.trainee_id) { setError('Select an intern'); return }
    setLoading(true); setError(null)
    try {
      if (isEditing) {
        await apiPatch(`/ojt/nda/${item.id}`, {
          nda_status: form.nda_status,
          signed_date: form.signed_date || null,
          expiry_date: form.expiry_date || null,
          remarks: form.remarks || null,
        })
        notify.success('NDA updated.')
      } else {
        await apiPost('/ojt/nda', {
          trainee_id: Number(form.trainee_id),
          nda_status: form.nda_status || 'Pending',
          signed_date: form.signed_date || null,
          expiry_date: form.expiry_date || null,
          remarks: form.remarks || null,
        })
        notify.success('NDA record created.')
      }
      await onSaved()
      onClose()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 overflow-hidden rounded-lg max-w-[calc(100vw-2rem)] w-[440px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col shadow-2xl transition-all duration-200 ${open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">{isEditing ? 'Edit' : 'Add'} NDA Record</p>
            <p className="text-[11px] text-[var(--color-muted-fg)]">Track NDA signing status</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted-fg)] hover:text-[var(--color-text)]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {!isEditing && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Intern{reqMark}</label>
                <select value={form.trainee_id || ''} onChange={e => setField('trainee_id', e.target.value)} className={inputCls}>
                  <option value="">— Select Intern —</option>
                  {(interns || []).map(i => <option key={i.id} value={i.id}>{i.trainee_name}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">NDA Status{reqMark}</label>
              <select value={form.nda_status || 'Pending'} onChange={e => setField('nda_status', e.target.value)} className={inputCls}>
                {NDA_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Signed Date</label>
                <input type="date" value={form.signed_date || ''} onChange={e => setField('signed_date', e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-muted-fg)]">Expiry Date</label>
                <input type="date" value={form.expiry_date || ''} onChange={e => setField('expiry_date', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--color-muted-fg)]">Remarks</label>
              <textarea value={form.remarks || ''} onChange={e => setField('remarks', e.target.value)} rows={2} placeholder="Notes…" className={inputCls} />
            </div>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" size="md" className="flex-1" disabled={loading}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <>{isEditing ? <Pencil size={14} /> : <Plus size={14} />} {isEditing ? 'Save' : 'Create'}</>}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─── Main NDA Monitoring Component ──────────────────────────────────────────
export default function NDAMonitoring() {
  const [ndaRecords, setNdaRecords] = useState([])
  const [interns, setInterns] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [selected, setSelected] = useState(null)

  const loadInterns = useCallback(async () => {
    try {
      const data = await apiGet('/ojt/interns')
      setInterns(data?.data || [])
    } catch { /* ignore */ }
  }, [])

  const loadNDA = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet('/ojt/nda')
      setNdaRecords(data?.data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadInterns() }, [loadInterns])
  useEffect(() => { loadNDA() }, [loadNDA])

  function traineeName(id) {
    const intern = interns.find(i => i.id === id)
    return intern ? intern.trainee_name : `#${id}`
  }

  function openNew() { setSelected(null); setDrawerKey(k => k + 1); setDrawer(true) }
  function openEdit(item) { setSelected(item); setDrawerKey(k => k + 1); setDrawer(true) }

  const signed = ndaRecords.filter(r => r.nda_status === 'Signed').length
  const pending = ndaRecords.filter(r => r.nda_status === 'Pending').length
  const expired = ndaRecords.filter(r => r.nda_status === 'Expired').length

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-1">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-muted-fg)]">Total NDAs</p>
          <p className="text-xl font-semibold text-[var(--color-text)]">{ndaRecords.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-1.5">
            <FileCheck size={14} className="text-emerald-500" />
            <p className="text-xs text-[var(--color-muted-fg)]">Signed</p>
          </div>
          <p className="text-xl font-semibold text-emerald-600">{signed}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-muted-fg)]">Pending</p>
          <p className="text-xl font-semibold text-amber-600">{pending}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-rose-500" />
            <p className="text-xs text-[var(--color-muted-fg)]">Expired</p>
          </div>
          <p className="text-xl font-semibold text-rose-600">{expired}</p>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted-fg)]">{ndaRecords.length} NDA record{ndaRecords.length !== 1 ? 's' : ''}</p>
        <Button size="md" onClick={openNew}><Plus size={14} /> Add NDA</Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Intern</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Signed Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Expiry Date</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)]">Remarks</th>
              <th className="px-3 py-2.5 text-[11px] font-medium text-[var(--color-muted-fg)] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]"><Loader2 size={18} className="inline animate-spin mr-2" />Loading…</td></tr>
            ) : ndaRecords.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">No NDA records.</td></tr>
            ) : ndaRecords.map(nda => (
              <tr key={nda.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] transition-colors">
                <td className="px-3 py-2.5 text-sm font-medium text-[var(--color-text)]">{traineeName(nda.trainee_id)}</td>
                <td className="px-3 py-2.5"><StatusBadge status={nda.nda_status} /></td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{nda.signed_date || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{nda.expiry_date || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)] max-w-[200px] truncate">{nda.remarks || '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  <button onClick={() => openEdit(nda)} className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]"><Pencil size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NDADrawer key={drawerKey} open={drawer} onClose={() => setDrawer(false)} item={selected} interns={interns} onSaved={loadNDA} />
    </div>
  )
}
