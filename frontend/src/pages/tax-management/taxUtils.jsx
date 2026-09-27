import { cn } from '@/lib/utils'

import ExpediaLogo from '@/assets/company-logos/Expedia.png'
import GLabLogo from '@/assets/company-logos/GLab.png'
import ExigentLogo from '@/assets/company-logos/exigent.png'
import KSILogo from '@/assets/company-logos/KSI.png'

const BASE = import.meta.env.VITE_API_URL

// ─── Entities ───────────────────────────────────────────────────────────────
export const ENTITIES = [
  { value: 'All', label: 'All Entities', logo: null },
  { value: 'Expedia', label: 'EXSSI (Expedia)', logo: ExpediaLogo },
  { value: 'GreatnessLab', label: 'GreatnessLab', logo: GLabLogo },
  { value: 'Exigent', label: 'Exigent Corp', logo: ExigentLogo },
  { value: 'KSI', label: 'Kyrios Solutions Inc.', logo: KSILogo },
]

// ─── Tabs ───────────────────────────────────────────────────────────────────
export const TAX_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'forms', label: 'BIR Forms' },
  { id: 'vat', label: 'VAT Summary' },
  { id: 'wht', label: 'WHT / EWT' },
  { id: 'reminders', label: 'Reminders' },
]

// ─── Formatters ─────────────────────────────────────────────────────────────
export function money(val) {
  if (val == null || val === '') return '₱0.00'
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Shared CSS classes ─────────────────────────────────────────────────────
export const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

// ─── API helpers ────────────────────────────────────────────────────────────
export function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
  return res.json()
}

export async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err }
  return data
}

export async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err }
  return data
}

export async function apiDelete(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || 'Delete failed') }
  return true
}

// ─── Entity query param helper ──────────────────────────────────────────────
export function entityParam(entity) {
  return entity && entity !== 'All' ? `&entity=${encodeURIComponent(entity)}` : ''
}

// ─── Shared UI Components ───────────────────────────────────────────────────
export function MetricCard({ label, value, color }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wide">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', color || 'text-[var(--color-text)]')}>{value ?? '—'}</p>
    </div>
  )
}

export function SectionHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
      {children}
    </div>
  )
}

export function PeriodSelector({ periodFrom, periodTo, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-[var(--color-muted-fg)]">From</label>
      <input
        type="date"
        value={periodFrom}
        onChange={e => onChange({ periodFrom: e.target.value, periodTo })}
        className={inputCls + ' !w-[140px] !py-1.5'}
      />
      <label className="text-xs font-medium text-[var(--color-muted-fg)]">To</label>
      <input
        type="date"
        value={periodTo}
        onChange={e => onChange({ periodFrom, periodTo: e.target.value })}
        className={inputCls + ' !w-[140px] !py-1.5'}
      />
    </div>
  )
}
