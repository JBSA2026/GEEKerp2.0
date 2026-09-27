const BASE = import.meta.env.VITE_API_URL

export function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export async function apiGet(path) {
  const r = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!r.ok) throw new Error('Failed')
  return r.json()
}

export async function apiPost(path, body) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || e.error || 'Failed') }
  return r.json()
}

export async function apiPatch(path, body) {
  const r = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || e.error || 'Failed') }
  return r.json()
}

export function money(val) {
  if (!val && val !== 0) return '—'
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'employees', label: 'Employee Compensation' },
  { id: 'generate', label: 'Payroll' },
  { id: 'loans', label: 'Loans / Advances' },
]

export const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

export const STATUS_COLORS = {
  DRAFT: 'bg-slate-100 text-slate-600',
  FOR_REVIEW: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  RELEASED: 'bg-emerald-100 text-emerald-700',
}

export const BASE_URL = BASE
