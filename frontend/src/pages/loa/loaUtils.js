const BASE = import.meta.env.VITE_API_URL

export function authHeaders() {
  const t = localStorage.getItem('access_token')
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

export function money(val) {
  if (!val || val === 0) return '—'
  return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const TABS = [
  { id: 'bir', label: 'BIR Form Retrieval' },
  { id: 'sales', label: 'Sales Trail' },
  { id: 'purchase', label: 'Purchase Trail' },
  { id: 'missing', label: 'Missing Documents' },
  { id: 'search', label: 'Document Search' },
]

export const inputCls = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20'

export const BASE_URL = BASE
