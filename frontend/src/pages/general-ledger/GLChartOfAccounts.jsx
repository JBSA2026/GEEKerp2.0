import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { Plus, Loader2, Pencil, Trash2, Search } from 'lucide-react'
import {
  ENTITIES, ACCOUNT_TYPES, inputCls, reqMark,
  apiGet, apiPost, apiPatch, apiDelete,
  Drawer, ConfirmDialog,
} from './glUtils'

export function GLChartOfAccounts() {
  const { entity } = useOutletContext()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('All')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const [form, setForm] = useState({ account_code: '', account_name: '', account_type: 'Asset', normal_balance: 'Debit', description: '', entity: '', is_active: true })

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (entity !== 'All') params.set('entity', entity)
      if (filterType !== 'All') params.set('type', filterType)
      const data = await apiGet(`/general-ledger/accounts?${params}`)
      setAccounts(Array.isArray(data) ? data : data.accounts || [])
    } catch (e) { notify.error(e.message) }
    finally { setLoading(false) }
  }, [entity, filterType])

  useEffect(() => {
    const timer = setTimeout(() => { void fetchAccounts() }, 0)
    return () => clearTimeout(timer)
  }, [fetchAccounts])

  function openAdd() {
    setEditing(null)
    setForm({ account_code: '', account_name: '', account_type: 'Asset', normal_balance: 'Debit', description: '', entity: entity === 'All' ? '' : entity, is_active: true })
    setDrawerOpen(true)
  }

  function openEdit(acc) {
    setEditing(acc)
    setForm({ account_code: acc.account_code || '', account_name: acc.account_name || '', account_type: acc.account_type || 'Asset', normal_balance: acc.normal_balance || 'Debit', description: acc.description || '', entity: acc.entity || '', is_active: acc.is_active !== false })
    setDrawerOpen(true)
  }

  async function handleSave() {
    if (!form.account_code || !form.account_name) { notify.error('Code and Name are required'); return }
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/general-ledger/accounts/${editing.account_id}`, form)
        notify.success('Account updated')
      } else {
        await apiPost('/general-ledger/accounts', form)
        notify.success('Account created')
      }
      setDrawerOpen(false)
      fetchAccounts()
    } catch (e) { notify.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    try {
      await apiDelete(`/general-ledger/accounts/${confirmDelete.account_id}`)
      notify.success('Account deleted')
      setConfirmDelete(null)
      fetchAccounts()
    } catch (e) { notify.error(e.message) }
  }

  const filteredAccounts = search.trim()
    ? accounts.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(search.toLowerCase())))
    : accounts

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className={cn(inputCls, 'w-52 pl-8')} />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className={cn(inputCls, 'w-40')}>
            <option value="All">All Types</option>
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Button size="sm" onClick={openAdd}><Plus size={14} /> Add Account</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--color-primary)]" size={28} /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr>
                {['Code', 'Name', 'Type', 'Normal Balance', 'Active', 'Actions'].map(h => (
                  <th key={h} className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredAccounts.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-[var(--color-muted-fg)]">No accounts found</td></tr>
              ) : filteredAccounts.map(acc => (
                <tr key={acc.account_id} className="hover:bg-[var(--color-surface)] transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs">{acc.account_code}</td>
                  <td className="px-4 py-2.5">{acc.account_name}</td>
                  <td className="px-4 py-2.5">{acc.account_type}</td>
                  <td className="px-4 py-2.5">{acc.normal_balance}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-block w-2 h-2 rounded-full', acc.is_active !== false ? 'bg-emerald-500' : 'bg-slate-300')} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(acc)} className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-muted-fg)]"><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDelete(acc)} className="p-1 rounded hover:bg-red-50 text-[var(--color-danger)]"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editing ? 'Edit Account' : 'Add Account'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-fg)]">Account Code {reqMark}</label>
            <input className={inputCls} value={form.account_code} onChange={e => setForm(f => ({ ...f, account_code: e.target.value }))} placeholder="e.g. 1010" />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-fg)]">Account Name {reqMark}</label>
            <input className={inputCls} value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))} placeholder="Cash on Hand" />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-fg)]">Account Type</label>
            <select className={inputCls} value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}>
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-fg)]">Normal Balance</label>
            <select className={inputCls} value={form.normal_balance} onChange={e => setForm(f => ({ ...f, normal_balance: e.target.value }))}>
              <option value="Debit">Debit</option>
              <option value="Credit">Credit</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-fg)]">Description</label>
            <textarea className={cn(inputCls, 'h-20 resize-none')} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-fg)]">Entity</label>
            <select className={inputCls} value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}>
              <option value="">— Select —</option>
              {ENTITIES.filter(e => e.value !== 'All').map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
            <label htmlFor="is_active" className="text-sm text-[var(--color-text)]">Active</label>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog open={!!confirmDelete} title="Delete Account" message={`Delete account "${confirmDelete?.account_name}"? This cannot be undone.`} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  )
}
