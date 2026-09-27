import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import {
  Search, X, Download, ChevronDown, CheckSquare,
  Archive, ArchiveRestore, MoreHorizontal, Loader2, Pencil,
} from 'lucide-react'
import {
  archiveMasterDataRecords,
  restoreMasterDataRecords,
  fetchMasterData,
  fetchMasterDataCounts,
  getMasterDataExportUrl,
} from '@/utils/api'
import { notify } from '@/utils/toast'

import {
  RESOURCES,
  COLUMNS_MAP,
  ARCHIVABLE_RESOURCES,
  SLUG_TO_RESOURCE,
  RESOURCE_TO_SLUG,
  getResourceLabel,
  getRecordId,
  getRecordName,
  Dropdown,
} from './constants'
import DataTable from './DataTable'
import RecordDrawer from './RecordDrawer'

// ─── Client Detail Panel ──────────────────────────────────────────────────────
function ClientDetailPanel({ client, onClose, onEdit }) {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true)
      const BASE = import.meta.env.VITE_API_URL
      const token = localStorage.getItem('access_token')
      fetch(`${BASE}/contact_list/`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
        .then(r => r.ok ? r.json() : [])
        .then(all => setContacts((all || []).filter(c => c.client_id === client.client_id)))
        .catch(() => setContacts([]))
        .finally(() => setLoading(false))
    }, 0)
    return () => clearTimeout(timer)
  }, [client.client_id])

  return (
    <div className="shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
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

      <div className="flex flex-col md:flex-row gap-0 md:divide-x divide-y md:divide-y-0 divide-[var(--color-border)] max-h-[35vh] overflow-y-auto">
        {/* Client Details */}
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-3">Client Details</p>
          <div className="grid grid-cols-3 gap-x-6 gap-y-2.5">
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">Type</p><p className="text-xs text-[var(--color-text)]">{client.customer_type || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">Industry</p><p className="text-xs text-[var(--color-text)]">{client.industry || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">TIN</p><p className="text-xs text-[var(--color-text)] font-mono">{client.tin_number || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">VAT Status</p><p className="text-xs text-[var(--color-text)]">{client.vat_status || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">Payment Terms</p><p className="text-xs text-[var(--color-text)]">{client.payment_terms || '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">Credit Limit</p><p className="text-xs text-[var(--color-text)]">{client.credit_limit ? `₱${Number(client.credit_limit).toLocaleString()}` : '—'}</p></div>
            <div><p className="text-[10px] text-[var(--color-muted-fg)]">Salesperson</p><p className="text-xs text-[var(--color-text)]">{client.assigned_salesperson || '—'}</p></div>
            <div className="col-span-2"><p className="text-[10px] text-[var(--color-muted-fg)]">Address</p><p className="text-xs text-[var(--color-text)]">{client.address || '—'}</p></div>
          </div>
        </div>

        {/* Contact Persons */}
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-semibold text-[var(--color-muted-fg)] uppercase tracking-wide mb-3">Contact Persons</p>
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[var(--color-muted)]"><Loader2 size={14} className="animate-spin" /> Loading…</div>
          ) : contacts.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] py-3">No contact persons found.</p>
          ) : (
            <div className="space-y-2">
              {contacts.map((c, i) => (
                <div key={c.contact_id || i} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-sm font-bold text-[var(--color-primary)]">
                    {(c.first_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-[var(--color-text)] truncate">{c.first_name} {c.last_name || ''}</p>
                      {c.is_primary_contact && <span className="inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Primary</span>}
                    </div>
                    <p className="text-[11px] text-[var(--color-muted-fg)] truncate">{c.job_title || '—'} • {c.email || '—'} • {c.landline || '—'}</p>
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

// ─── MasterDataContent ────────────────────────────────────────────────────────
export default function MasterDataContent() {
  const { resource: slug } = useParams()
  const navigate = useNavigate()
  // Derive active API resource key from URL slug
  const active = SLUG_TO_RESOURCE[slug] || 'clients'

  // Redirect if invalid slug
  useEffect(() => {
    if (!SLUG_TO_RESOURCE[slug]) {
      navigate('/masterdata/clients', { replace: true })
    }
  }, [slug, navigate])

  const [items, setItems] = useState([])
  const [, setCounts] = useState({
    clients: 0, products: 0, employees: 0, supplier_list: 0,
    warehouses: 0, documents: 0, contact_list: 0, leads: 0,
    sales_activity: 0, opportunities: 0, sales_forecast: 0, services: 0,
  })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState(null)

  // View toggle: 'all' | 'active' | 'archived'
  const [viewMode, setViewMode] = useState('active')

  // Scoped search: which column to filter by ('all' = search all fields)
  const [searchColumn, setSearchColumn] = useState('all')

  // Drawer state
  const [drawer, setDrawer] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [selectedItem, setSelectedItem] = useState(null)

  // Client detail panel state (for row click)
  const [viewingClient, setViewingClient] = useState(null)

  const refreshCounts = useCallback(async () => {
    const data = await fetchMasterDataCounts()
    setCounts(prev => ({ ...prev, ...data }))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshCounts().catch(err => setError(err.message || String(err)))
    }, 0)
    return () => clearTimeout(timer)
  }, [refreshCounts])

  // ── Load records ──────────────────────────────────────────────────────────────
  const load = useCallback(async (q = '') => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMasterData(active, {
        search: q,
        status: viewMode !== 'all' ? viewMode : 'All',
      })
      setItems(data || [])
      setSelected(new Set())
      setViewingClient(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [active, viewMode])

  // Debounce fetch
  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, active, viewMode, load])

  // ── Client-side column filtering ──────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!search.trim() || searchColumn === 'all') return items
    const q = search.toLowerCase()
    return items.filter(item => {
      const val = item[searchColumn]
      if (val == null) return false
      return String(val).toLowerCase().includes(q)
    })
  }, [items, search, searchColumn])

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleSaved() {
    await load(search)
    await refreshCounts()
  }

  function openEditDrawer(item) {
    setSelectedItem(item)
    setDrawerKey(key => key + 1)
    setDrawer(true)
  }

  function switchTab(resource) {
    const targetSlug = RESOURCE_TO_SLUG[resource] || 'clients'
    navigate(`/masterdata/${targetSlug}`)
    setSelected(new Set())
    setViewMode('active')
    setSearchColumn('all')
  }

  function clearSelection() { setSelected(new Set()) }

  function toggleRow(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredItems.map(item => getRecordId(active, item))))
    }
  }

  function selectAll() {
    setSelected(new Set(filteredItems.map(item => getRecordId(active, item))))
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  function handleExport() {
    if (selected.size === 0) {
      notify.warning('No records selected. Please select records or use Select All to export.')
      return
    }
    window.open(getMasterDataExportUrl(active, {
      search,
      status: viewMode !== 'all' ? viewMode : 'All',
    }), '_blank', 'noopener,noreferrer')
  }

  function handleExportSelected() {
    if (selected.size === 0) {
      notify.warning('No records selected. Please select records or use Select All to export.')
      return
    }
    window.open(getMasterDataExportUrl(active, {
      search,
      status: viewMode !== 'all' ? viewMode : 'All',
    }), '_blank', 'noopener,noreferrer')
  }

  // ── Archive / Unarchive ───────────────────────────────────────────────────────
  async function handleBulkArchive(action) {
    const ids = [...selected]
    if (!ids.length || !supportsArchive) return
    setActionLoading(true)
    setError(null)
    try {
      const shouldRestore = action === 'restore' || viewMode === 'archived'
      let result
      if (shouldRestore) {
        result = await restoreMasterDataRecords(active, ids)
      } else {
        result = await archiveMasterDataRecords(active, ids)
      }
      await load(search)
      await refreshCounts()
      const label = shouldRestore ? 'Restored' : 'Archived'
      notify.success(`${label} ${result?.updated ?? ids.length} record(s).`)
    } catch (err) {
      notify.error(err.message || 'Unable to update records')
      setError(err.message || String(err))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleArchiveToggle(item) {
    const id = getRecordId(active, item)
    let isCurrentlyActive
    if (typeof item.is_active === 'boolean') {
      isCurrentlyActive = item.is_active
    } else {
      isCurrentlyActive = (item.status || 'active').toLowerCase() === 'active'
    }
    setError(null)
    try {
      if (isCurrentlyActive) {
        await archiveMasterDataRecords(active, [id])
      } else {
        await restoreMasterDataRecords(active, [id])
      }
      await load(search)
      await refreshCounts()
      const name = getRecordName(active, item) || id
      notify.success(`${name} ${isCurrentlyActive ? 'archived' : 'restored'}.`)
    } catch (err) {
      notify.error(err.message || 'Unable to update record status')
      setError(err.message || String(err))
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────────
  const columns = COLUMNS_MAP[active] ?? []
  const supportsArchive = ARCHIVABLE_RESOURCES.has(active)
  const allChecked = filteredItems.length > 0 && filteredItems.every(item => selected.has(getRecordId(active, item)))

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Master Data"
        subtitle="Manage all master data resources"
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-[#f6f8fc] px-5 py-5 md:px-7">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[#d8e2ef] bg-white shadow-sm">
          <CardHeader className="shrink-0 border-b border-[#d8e2ef] bg-[#f6f8fc] px-5 py-4">

            {/* ── Floating bulk action bar — only when rows are selected ── */}
            {selected.size > 0 && (
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-[#a7b5d8] bg-[#f0f4fa] px-4 py-2.5">
                <span className="text-xs font-semibold text-slate-700">{selected.size} selected</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={clearSelection}
                    className="h-6 w-6 justify-center p-0 text-slate-500 hover:text-slate-900"
                  >
                    <X size={13} />
                  </Button>
                  <Button size="sm" variant="outline" className="bg-white" onClick={handleExportSelected} disabled={actionLoading}>
                    <Download size={12} /> Export Selected
                  </Button>
                  {supportsArchive && (
                    <Button size="sm" variant="outline" className={viewMode === 'archived' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'} onClick={() => handleBulkArchive(viewMode === 'archived' ? 'restore' : 'archive')} disabled={actionLoading}>
                      {viewMode === 'archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />} {viewMode === 'archived' ? 'Restore' : 'Archive'}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ── Toolbar ── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Dropdown
                  align="left"
                  matchWidth
                  trigger={
                    <button className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20">
                      {getResourceLabel(active)} List
                      <ChevronDown size={14} className="text-[var(--color-muted-fg)]" />
                    </button>
                  }
                  items={RESOURCES.map(r => ({
                    label: `${getResourceLabel(r)} List`,
                    onClick: () => switchTab(r),
                  }))}
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* Search box with column scope dropdown */}
                <div className="order-5 flex h-8 w-72 items-center rounded-lg border border-[#d8e2ef] bg-white overflow-hidden">
                  <div className="flex items-center gap-2 px-3 flex-1 min-w-0">
                    <Search size={13} className="shrink-0 text-slate-500" />
                    <Input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={`Search ${getResourceLabel(active).toLowerCase()}…`}
                      className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xs text-slate-700 shadow-none placeholder:text-slate-400 focus:border-transparent focus:ring-0"
                    />
                    {search && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSearch('')}
                        className="h-5 w-5 justify-center p-0 text-slate-500 hover:text-slate-900"
                      >
                        <X size={11} />
                      </Button>
                    )}
                  </div>
                  <Select
                    value={searchColumn}
                    onChange={e => setSearchColumn(e.target.value)}
                    className="h-full w-auto rounded-none rounded-r-lg border-y-0 border-r-0 border-l border-[#d8e2ef] bg-[#f6f8fc] px-2 py-0 pr-6 text-[11px] font-medium text-slate-600 outline-none hover:bg-[#edf4fb]"
                  >
                    <option value="all">All Fields</option>
                    {columns.map(col => (
                      <option key={col.key} value={col.key}>{col.label}</option>
                    ))}
                  </Select>
                </div>

                {/* All / Active / Archived segmented toggle — always visible */}
                <div className="order-4 flex h-8 rounded-lg border border-[#d8e2ef] bg-white overflow-hidden">
                  {['all', 'active', 'archived'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`px-3 text-xs font-medium transition-colors capitalize ${viewMode === mode ? 'bg-[#2c3a61] text-white' : 'text-slate-600 hover:bg-[#edf4fb]'}`}
                    >
                      {mode === 'all' ? 'All' : mode === 'active' ? 'Active' : 'Archived'}
                    </button>
                  ))}
                </div>

                {/* Export button */}
                <Button
                  size="sm"
                  variant="outline"
                  className="order-2"
                  onClick={handleExport}
                >
                  <Download size={13} /> Export
                </Button>

                {/* More actions menu */}
                <Dropdown
                  align="right"
                  className="order-3"
                  trigger={
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 justify-center p-0 text-slate-500 hover:text-slate-950">
                      <MoreHorizontal size={15} />
                    </Button>
                  }
                  items={[
                    { label: 'Select all', icon: <CheckSquare size={13} />, onClick: selectAll },
                    ...(supportsArchive
                      ? ['divider', {
                          label: viewMode === 'archived' ? 'Restore selected' : 'Archive selected',
                          icon: viewMode === 'archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />,
                          onClick: () => handleBulkArchive(viewMode === 'archived' ? 'restore' : 'archive'),
                        }]
                      : []),
                  ]}
                />
              </div>
            </div>

          </CardHeader>

          {/* ── Table ── */}
          <CardContent className={`min-h-0 flex-1 overflow-hidden p-0 ${viewingClient ? 'max-h-[50%]' : ''}`}>
            <DataTable
              resource={active}
              columns={columns}
              items={filteredItems}
              loading={loading}
              error={error}
              selected={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              onEdit={openEditDrawer}
              onArchiveToggle={handleArchiveToggle}
              onRowClick={active === 'clients' ? (item) => setViewingClient(prev => prev?.client_id === item.client_id ? null : item) : undefined}
              activeRowId={active === 'clients' && viewingClient ? viewingClient.client_id : undefined}
            />
          </CardContent>
        </Card>

        {/* Client Detail Panel */}
        {active === 'clients' && viewingClient && (
          <ClientDetailPanel
            client={viewingClient}
            onClose={() => setViewingClient(null)}
            onEdit={() => openEditDrawer(viewingClient)}
          />
        )}

        <p className="shrink-0 pb-1 text-center text-[11px] text-slate-500">© 2026 GEEK Group of Companies. v1.0.0</p>
      </main>

      <RecordDrawer
        key={drawerKey}
        open={drawer}
        onClose={() => setDrawer(false)}
        resource={active}
        item={selectedItem}
        onSaved={handleSaved}
      />
    </div>
  )
}
