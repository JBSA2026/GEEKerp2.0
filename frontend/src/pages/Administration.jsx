import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Separator } from '@/components/ui/separator'
import { Field, Input, Textarea } from '@/components/ui/form'
import { ModalFrame } from '@/components/ui/overlay'
import {
  UserPlus, Search, X, Eye, EyeOff, CheckCircle2, AlertCircle,
  Users, Loader2, ShieldCheck, Pencil, Trash2,
  ClipboardList, Filter, Download, ChevronDown, Check
} from 'lucide-react'
import { fetchRecords, createRecord, updateRecord } from '@/utils/api'
import { useCrudResource } from '@/hooks/useCrudResource'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { getActiveSubRoute } from '@/utils/routeHelpers'

const BASE = import.meta.env.VITE_API_URL

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso))
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(iso))
}

function getRoleLabel(role) {
  const name = (typeof role === 'string' ? role : role?.role_name) || ''
  return name.replace(/_/g, ' ')
}

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}

async function fetchRoles() { return apiFetch('/employees/roles') }
async function fetchAuditLogs(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v) })
  return apiFetch(`/audit-logs/?${q}`)
}
async function fetchAuditMeta() { return apiFetch('/audit-logs/meta') }
function getAuditExportUrl(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v) })
  return `${BASE}/audit-logs/export?${q}`
}

const EMPTY_FORM = { first_name: '', last_name: '', email: '', password: '', address: '', is_active: true, roles: [] }

function employeeToForm(e) {
  if (!e) return EMPTY_FORM
  return { first_name: e.first_name || '', last_name: e.last_name || '', email: e.email || '',
    password: '', address: e.address || '', is_active: Boolean(e.is_active), roles: e.roles || [] }
}

// ── Badge variant per action ──────────────────────────────────────────────────

const ACTION_BADGE = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'danger',
  LOGIN:  'default',
  LOGOUT: 'muted',
  LOGIN_FAILED: 'danger',
  ARCHIVE: 'warning',
}

function actionMeta(action) {
  return { badge: ACTION_BADGE[action?.toUpperCase()] ?? 'muted' }
}

const AUTH_AUDIT_ACTIONS = new Set(['LOGIN', 'LOGOUT', 'LOGIN_FAILED'])

function isAuthenticationLog(log) {
  return log.module_name === 'Authentication' || AUTH_AUDIT_ACTIONS.has(log.action?.toUpperCase())
}

function Dropdown({ trigger, items, align = 'left' }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block w-[220px]">
      <div onClick={() => setOpen(v => !v)} className="cursor-pointer w-full">{trigger}</div>

      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className={`absolute top-full mt-1 z-[9999] w-full rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}
            onClick={() => setOpen(false)}
          >
            {items.map((item, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.preventDefault()
                  item.onClick?.()
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <span className="whitespace-nowrap">{item.label}</span>
                {item.icon && <span className="text-xs text-[var(--color-muted-fg)]">{item.icon}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function RoleCheckbox({ name, checked, onChange }) {
  return (
    <button type="button" aria-pressed={checked} onClick={onChange} className={`flex w-full items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2c3a61]
      ${checked ? 'bg-[#e9eef8] border-[#cbd8ea] text-[#2c3a61]' : 'bg-white border-[#d8e2ef] text-slate-600 hover:border-[#d8e2ef] hover:text-slate-950'}`}>
      <span className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors
        ${checked ? 'bg-[#2c3a61] border-[#2c3a61]' : 'border-[#d8e2ef] bg-transparent'}`}>
        {checked && <Check aria-hidden="true" size={12} strokeWidth={2.25} />}
      </span>
      <span className="text-xs leading-snug">{name}</span>
    </button>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
      ${active ? 'border-[#2c3a61] text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-950 hover:border-[#d8e2ef]'}`}>
      {children}
    </button>
  )
}

// ── User Drawer ───────────────────────────────────────────────────────────────

function UserDrawer({ open, employee, onClose, onSaved }) {
  const isEditing = Boolean(employee)
  const [form, setForm]       = useState(() => employeeToForm(employee))
  const [errors, setErrors]   = useState({})
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [toast, setToast]     = useState(null)
  const [roles, setRoles]     = useState([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const firstRef = useRef(null)

  useEffect(() => { fetchRoles().then(setRoles).catch(()=>setRoles([])).finally(()=>setRolesLoading(false)) }, [])
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => firstRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [open])

  function set(f, v) { setForm(p => ({...p,[f]:v})); setErrors(e => ({...e,[f]:''})) }
  function toggleRole(r) {
    setForm(p => ({...p, roles: p.roles.includes(r) ? p.roles.filter(x=>x!==r) : [...p.roles, r]}))
    setErrors(e => ({...e, roles: ''}))
  }

  function validate() {
    const e = {}
    if (!form.first_name.trim()) e.first_name = 'First name is required.'
    if (!form.last_name.trim())  e.last_name  = 'Last name is required.'
    if (!form.email.trim())      e.email      = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address.'
    if (!isEditing && !form.password) e.password = 'Password is required.'
    else if (form.password && form.password.length < 8) e.password = 'Password must be at least 8 characters.'
    if (form.roles.length === 0) e.roles = 'Assign at least one role.'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true); setToast(null)
    try {
      const payload = { first_name: form.first_name.trim(), last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(), address: form.address.trim()||null, is_active: form.is_active, roles: form.roles }
      if (form.password) payload.password = form.password
      const saved = isEditing
        ? await updateRecord('employees', employee.employee_id, payload)
        : await createRecord('employees', {...payload, password: form.password})
      setToast({ type: 'success', msg: `${saved.first_name} ${saved.last_name} ${isEditing ? 'updated' : 'added'} successfully.` })
      onSaved(saved)
      setTimeout(() => { setToast(null); onClose() }, 1800)
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Something went wrong.' })
    } finally { setLoading(false) }
  }

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit User' : 'Add New User'}
      subtitle={isEditing ? 'Update employee details and access' : 'Fill in the employee details and assign roles'}
      className="w-[min(560px,calc(100vw-2rem))]"
    >
        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {toast && (
            <div className={`flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-xs border
              ${toast.type==='success' ? 'bg-[#eaf1f8] border-[#b8c8df] text-[#5d8796]' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
              {toast.type==='success' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5"/> : <AlertCircle size={14} className="shrink-0 mt-0.5"/>}
              {toast.msg}
            </div>
          )}
          <div className="space-y-4">
            <p className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">Personal Information</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" required error={errors.first_name}>
                <Input ref={firstRef} value={form.first_name} onChange={e=>set('first_name',e.target.value)} placeholder="Juan"/>
              </Field>
              <Field label="Last Name" required error={errors.last_name}>
                <Input value={form.last_name} onChange={e=>set('last_name',e.target.value)} placeholder="Dela Cruz"/>
              </Field>
            </div>
            <Field label="Email Address" required error={errors.email}>
              <Input type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="juan@geek.com.ph"/>
            </Field>
            <Field label="Password" required={!isEditing} hint={isEditing?'leave blank to keep current':null} error={errors.password}>
              <div className="relative">
                <Input type={showPw?'text':'password'} value={form.password} onChange={e=>set('password',e.target.value)}
                  placeholder={isEditing?'Leave blank to keep current':'Min. 8 characters'} className="pr-10"/>
                <button type="button" onClick={()=>setShowPw(v=>!v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-950 transition-colors">
                  {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </Field>
            <Field label="Address" hint="optional">
              <Textarea value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Street, City, Province" rows={2} className="resize-none"/>
            </Field>
            <Field label="Account Status">
              <div className="flex items-center gap-3">
                <button type="button" role="switch" aria-checked={form.is_active} onClick={()=>set('is_active',!form.is_active)}
                  className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none shrink-0 ${form.is_active?'bg-[#2c3a61]':'bg-[#a7b5d8]'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_active?'translate-x-5':'translate-x-0'}`}/>
                </button>
                <span className="text-xs text-slate-400">{form.is_active?'Active — user can log in':'Inactive — login disabled'}</span>
              </div>
            </Field>
          </div>
          <Separator/>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">Assign Roles</p>
                <p className="text-[11px] text-slate-600 mt-0.5">Select one or more roles for this user</p>
              </div>
              {form.roles.length > 0 && <span className="text-[11px] text-[#2c3a61] font-medium">{form.roles.length} selected</span>}
            </div>
            {errors.roles && <p className="text-[11px] text-[#9f4d61] flex items-center gap-1"><AlertCircle size={10}/>{errors.roles}</p>}
            {rolesLoading
              ? <div className="flex items-center gap-2 py-4 text-xs text-slate-600"><Loader2 size={13} className="animate-spin"/> Loading roles…</div>
              : <div className="grid grid-cols-2 gap-2">{roles.map(r=>(
                  <RoleCheckbox key={r.role_name} name={getRoleLabel(r)} checked={form.roles.includes(r.role_name)} onChange={()=>toggleRole(r.role_name)}/>
                ))}</div>
            }
          </div>
          <Separator/>
          <div className="flex gap-3 pb-2">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" variant="default" size="md" className="flex-1" disabled={loading}>
              {loading
                ? <><Loader2 size={14} className="animate-spin"/>{isEditing?'Saving…':'Creating…'}</>
                : <>{isEditing?<Pencil size={14}/>:<UserPlus size={14}/>}{isEditing?'Save Changes':'Create User'}</>
              }
            </Button>
          </div>
        </form>
    </ModalFrame>
  )
}

// ── Audit Logs Panel ──────────────────────────────────────────────────────────

function AuditLogTable({ logs, emptyText }) {
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border-t border-[#d8e2ef]">
      <div className="shrink-0 grid grid-cols-[110px_150px_1fr_200px_160px] gap-x-4 px-5 py-2.5
        border-y border-[#d8e2ef] bg-[#e9eef8]">
        {['Action', 'Module', 'Description', 'Performed By', 'Timestamp'].map(h => (
          <span key={h} className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">{h}</span>
        ))}
      </div>

      {logs.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-10 text-xs text-slate-600">
          {emptyText}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {logs.map(log => {
            const m           = actionMeta(log.action)
            const description = log.new_values?.description || '—'
            const performer   = log.performed_by || '—'

            return (
              <div
                key={log.log_id}
                className="grid grid-cols-[110px_150px_1fr_200px_160px] gap-x-4
                  items-center px-5 py-3.5 hover:bg-[#edf4fb] transition-colors
                  border-b border-[#d8e2ef]"
              >
                <div>
                  <Badge variant={m.badge} className="font-mono text-[11px]">
                    {log.action}
                  </Badge>
                </div>

                <span className="text-xs text-slate-600 truncate">
                  {log.module_name || '—'}
                </span>

                <p className="text-xs text-slate-700 leading-relaxed pr-4">
                  {description}
                </p>

                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[#e9eef8] flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-[#2c3a61] uppercase leading-none">
                      {performer !== '—' ? performer.charAt(0) : '?'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-600 truncate">{performer}</span>
                </div>

                <div className="text-right">
                  <p className="text-[11px] text-slate-600 whitespace-nowrap">
                    {formatDateTime(log.created_at).split(',')[0]}
                  </p>
                  <p className="text-[10px] text-slate-600 whitespace-nowrap mt-0.5">
                    {formatDateTime(log.created_at).split(',').slice(1).join(',').trim()}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function AuditLogsPanel() {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [meta, setMeta]       = useState({ modules: [], actions: [] })
  const [search, setSearch]   = useState('')
  const [filterModule, setFilterModule] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [auditView, setAuditView] = useState('authentication')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchAuditLogs({
        search, module: filterModule, action: filterAction,
        date_from: dateFrom, date_to: dateTo,
      })
      setLogs(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [search, filterModule, filterAction, dateFrom, dateTo])

  useEffect(() => { fetchAuditMeta().then(setMeta).catch(() => {}) }, [])
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) },
    [load])

  function clearFilters() {
    setSearch(''); setFilterModule(''); setFilterAction(''); setDateFrom(''); setDateTo('')
  }
  const hasFilters = search || filterModule || filterAction || dateFrom || dateTo
  const filterParams = {
    search,
    module: filterModule,
    action: filterAction,
    date_from: dateFrom,
    date_to: dateTo,
  }
  const authenticationLogs = logs.filter(isAuthenticationLog)
  const changeLogs = logs.filter(log => !isAuthenticationLog(log))
  const visibleLogs = auditView === 'authentication' ? authenticationLogs : changeLogs
  const visibleTable = auditView === 'authentication'
    ? {
        title: 'Authentication Logs',
        emptyText: 'No authentication events in this filter.',
      }
    : {
        title: 'Changelog',
        emptyText: 'No change events in this filter.',
      }

  function handleExport() {
    window.open(getAuditExportUrl(filterParams), '_blank', 'noopener,noreferrer')
  }

  const selectCls = "rounded-lg border border-[#d8e2ef] bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-[#2c3a61] min-w-[140px]"

  return (
    <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Card header: title + toolbar ── */}
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Dropdown
            align="left"
            trigger={
              <button className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20">
                {visibleTable.title}
                <ChevronDown size={13} className="text-[var(--color-muted-fg)]"/>
              </button>
            }
            items={[
              {
                label: 'Authentication Logs',
                icon: auditView === 'authentication' ? 'Active' : null,
                onClick: () => setAuditView('authentication'),
              },
              {
                label: 'Changelog',
                icon: auditView === 'changes' ? 'Active' : null,
                onClick: () => setAuditView('changes'),
              },
            ]}
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-[#d8e2ef] rounded-lg px-3 py-1.5 w-52">
              <Search size={13} className="text-slate-500 shrink-0"/>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search logs…"
                className="flex-1 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-900">
                  <X size={11}/>
                </button>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowFilters(v => !v)}>
              <Filter size={13}/>
              Filters
              {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-[#2c3a61] ml-0.5"/>}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download size={13}/>
              Export
            </Button>
          </div>
        </div>

        {/* ── Collapsible filter bar ── */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-[#d8e2ef] flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">Module</span>
              <select value={filterModule} onChange={e => setFilterModule(e.target.value)} className={selectCls}>
                <option value="">All modules</option>
                {meta.modules.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">Action</span>
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className={selectCls}>
                <option value="">All actions</option>
                {meta.actions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">From</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={selectCls}/>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">To</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={selectCls}/>
            </div>
            {hasFilters && (
              <button onClick={clearFilters}
                className="text-xs text-[#9f4d61] hover:text-rose-300 flex items-center gap-1 pb-0.5">
                <X size={11}/> Clear filters
              </button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-600 text-sm">
            <Loader2 size={16} className="animate-spin"/> Loading audit logs…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#9f4d61] text-sm">
            <AlertCircle size={15}/> {error}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <ClipboardList size={28} className="text-slate-700"/>
            <p className="text-sm text-slate-600">No audit log entries found</p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-[#2c3a61] hover:text-[#2c3a61] mt-1">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-3">
            <AuditLogTable
              logs={visibleLogs}
              emptyText={visibleTable.emptyText}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Administration() {
  const location = useLocation()
  const navigate = useNavigate()
  const { confirm, confirmDialogProps } = useConfirmDialog()
  const tab = getActiveSubRoute(location.pathname, ['users', 'audit'], 'users')
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const {
    drawerOpen,
    drawerKey,
    selectedItem: selectedEmployee,
    deletingId,
    error: crudError,
    setError: setCrudError,
    openCreate: openCreateDrawer,
    openEdit: openEditDrawer,
    closeDrawer,
    handleSaved,
    handleDelete,
  } = useCrudResource({
    resource: 'employees',
    getId: employee => employee.employee_id,
    getName: employee => `${employee.first_name} ${employee.last_name}`,
    setItems: setEmployees,
    confirmDelete: employee => `Delete ${employee.first_name} ${employee.last_name}? This cannot be undone.`,
    confirm,
  })
  const [error, setError]       = useState(null)

  const loadEmployees = useCallback(async (q = '') => {
    setLoading(true); setError(null); setCrudError(null)
    try { setEmployees(await fetchRecords('employees', q)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [setCrudError])

  useEffect(() => { const t = setTimeout(() => loadEmployees(search), 300); return () => clearTimeout(t) }, [search, loadEmployees])

  const activeCount   = employees.filter(e => e.is_active).length
  const inactiveCount = employees.length - activeCount
  const listError = error || crudError
  const isAuditTab = tab === 'audit'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Administration" subtitle="Manage system users, roles, and access control."/>

      <main className={`flex h-[calc(100vh-3.5rem)] min-h-0 flex-1 flex-col px-6 ${isAuditTab ? 'overflow-hidden py-4 gap-4' : 'overflow-y-auto py-5 gap-5'}`}>

        {/* Summary strip */}
        <div className="grid shrink-0 grid-cols-3 gap-4">
          {[
            { label: 'Total Users',    value: employees.length, Icon: Users,        color: 'text-[#2c3a61]',  bg: 'bg-[#e9eef8]'  },
            { label: 'Active Users',   value: activeCount,      Icon: CheckCircle2, color: 'text-[#5d8796]', bg: 'bg-[#eaf1f8]' },
            { label: 'Inactive Users', value: inactiveCount,    Icon: AlertCircle,  color: 'text-[#9f4d61]',    bg: 'bg-[#f1e8ef]'    },
          ].map(({ label, value, Icon, color, bg }) => (
            <Card key={label} className="p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon size={18} className={color}/>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-950 leading-none">{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-[#d8e2ef]">
          <TabButton active={tab==='users'} onClick={()=>navigate('/administration/users')}>
            <Users size={14}/> System Users
          </TabButton>
          <TabButton active={tab==='audit'} onClick={()=>navigate('/administration/audit')}>
            <ClipboardList size={14}/> Audit Logs
          </TabButton>
        </div>

        {/* ── Users Tab ── */}
        {tab === 'users' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle>System Users</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white border border-[#d8e2ef] rounded-lg px-3 py-1.5 w-56">
                    <Search size={13} className="text-slate-500 shrink-0"/>
                    <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search users…"
                      className="flex-1 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"/>
                    {search && <button onClick={()=>setSearch('')} className="text-slate-500 hover:text-slate-900"><X size={11}/></button>}
                  </div>
                  <Button size="sm" onClick={openCreateDrawer}><UserPlus size={14}/> Add User</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[1.2fr_1.4fr_1fr_1.8fr_0.8fr_auto_auto] gap-4 px-5 py-2.5 border-t border-b border-[#d8e2ef] bg-[#e9eef8]">
                {['Name','Email','Address','Roles','Created','Status','Actions'].map(h=>(
                  <span key={h} className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">{h}</span>
                ))}
              </div>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-slate-600 text-sm"><Loader2 size={16} className="animate-spin"/> Loading users…</div>
              ) : listError ? (
                <div className="flex items-center justify-center gap-2 py-16 text-[#9f4d61] text-sm"><AlertCircle size={15}/> {listError}</div>
              ) : employees.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Users size={28} className="text-slate-700"/>
                  <p className="text-sm text-slate-600">No users found</p>
                  {search && <p className="text-xs text-slate-700">Try clearing your search</p>}
                </div>
              ) : (
                <div className="divide-y divide-[#d8e2ef]">
                  {employees.map(emp => (
                    <div key={emp.employee_id} className="grid grid-cols-[1.2fr_1.4fr_1fr_1.8fr_0.8fr_auto_auto] gap-4 items-start px-5 py-3.5 hover:bg-[#edf4fb] transition-colors">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{emp.first_name} {emp.last_name}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">ID #{emp.employee_id}</p>
                      </div>
                      <p className="text-xs text-slate-600 truncate pt-0.5">{emp.email}</p>
                      <p className="text-xs text-slate-500 truncate pt-0.5">{emp.address||'—'}</p>
                      <div className="flex flex-wrap gap-1">
                        {emp.roles?.length > 0 ? emp.roles.map(r=>(
                          <span key={r} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#e9eef8] text-[#2c3a61] border border-[#cbd8ea]">
                            <ShieldCheck size={9}/>{getRoleLabel(r)}
                          </span>
                        )) : <span className="text-[11px] text-slate-600">No roles</span>}
                      </div>
                      <p className="text-xs text-slate-500 pt-0.5">{formatDate(emp.created_at)}</p>
                      <StatusBadge status={emp.is_active?'Active':'Inactive'} />
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 p-0" onClick={()=>openEditDrawer(emp)}>
                          <Pencil size={13}/>
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 p-0 text-rose-500 hover:text-[#9f4d61]"
                          onClick={()=>handleDelete(emp)} disabled={deletingId===emp.employee_id}>
                          {deletingId===emp.employee_id ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Audit Logs Tab ── */}
        {tab === 'audit' && (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <AuditLogsPanel/>
          </div>
        )}

        <p className="mt-auto shrink-0 text-center text-[11px] text-slate-700 pb-1">
          © 2026 GEEK Group of Companies. All rights reserved. &nbsp;·&nbsp; v1.0.0
        </p>
      </main>

      <UserDrawer key={drawerKey} open={drawerOpen} employee={selectedEmployee} onClose={closeDrawer} onSaved={handleSaved}/>
      <ConfirmDialog {...confirmDialogProps} />
    </div>
  )
}
