/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, Pencil, Trash2 } from 'lucide-react'

import glabLogo from '@/assets/company-logos/GLab.png'
import expediaLogo from '@/assets/company-logos/Expedia.png'
import exigentLogo from '@/assets/company-logos/exigent.png'
import ksiLogo from '@/assets/company-logos/KSI.png'

const BASE = import.meta.env.VITE_API_URL

// ── Constants ───────────────────────────────────────────────────────────────

export const ENTITY_OPTIONS = [
  { value: 'GreatnessLab', label: 'GreatnessLab', logo: glabLogo },
  { value: 'Expedia', label: 'Expedia', logo: expediaLogo },
  { value: 'Exigent', label: 'Exigent', logo: exigentLogo },
  { value: 'KSI', label: 'Kyrios Solutions Inc.', logo: ksiLogo },
]
export const ENTITY_MAP = Object.fromEntries(ENTITY_OPTIONS.map(e => [e.value, e]))
export const ENTITY_FILTERS = ['All', ...ENTITY_OPTIONS.map(e => e.value)]

export const STATUSES = ['All', 'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED']
export const FORM_STATUSES = ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']
export const PROJECT_GRID = 'grid-cols-[minmax(0,1.8fr)_minmax(120px,1fr)_minmax(0,1.1fr)_minmax(110px,1.2fr)_minmax(100px,1fr)_minmax(90px,0.8fr)_32px]'

export const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'BILLED']
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']
export const MATERIAL_STATUSES = ['PLANNED', 'RESERVED', 'ORDERED', 'ISSUED']

export const TABS = [
  { id: 'overview', label: 'Overview', icon: 'Layers' },
  { id: 'budget', label: 'Budget', icon: 'Wallet' },
  { id: 'milestones', label: 'Milestones', icon: 'Target' },
  { id: 'tasks', label: 'Tasks', icon: 'ListChecks' },
  { id: 'materials', label: 'Materials', icon: 'Layers' },
  { id: 'documents', label: 'Documents', icon: 'Paperclip' },
]

export const EMPTY_FORM = {
  client_id: '',
  project_name: '',
  entity: '',
  quotation_id: '',
  contract_value: 0,
  budget: 0,
  start_date: '',
  end_date: '',
  project_manager_id: '',
  status: 'PLANNING',
  completion_percent: 0,
  description: '',
  remarks: '',
}

// ── API helpers ─────────────────────────────────────────────────────────────

export function authHeaders() {
  const t = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  }
}

export async function api(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: authHeaders(),
      ...options,
      signal: options.signal || controller.signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`The API request timed out: ${path}`, { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.detail || 'Request failed')
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(value || 0))
}

export function qty(value) {
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(Number(value || 0))
}

export function percent(value) {
  return `${Number(value || 0).toFixed(value % 1 === 0 ? 0 : 1)}%`
}

export function statusLabel(status) {
  return (status || 'PLANNING').replace(/_/g, ' ')
}

// ── Shared UI primitives ────────────────────────────────────────────────────

export function ToolbarDropdown({ value, onChange, options, labelFn, width = 'w-[160px]' }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
  }, [open])

  return (
    <div className={`relative ${width} shrink-0`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
      >
        <span className="truncate">{labelFn(value)}</span>
        <ChevronDown size={14} className={`text-[var(--color-muted-fg)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <ul
            className="fixed rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-[9999] max-h-[240px] overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {options.map(opt => (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-sm whitespace-nowrap text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  {labelFn(opt)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function CompanyTag({ entity, size = 'sm' }) {
  const e = ENTITY_MAP[entity]
  if (!e) {
    return <span className="text-[11px] text-slate-400">Unassigned</span>
  }
  const img = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8e2ef] bg-white pl-1 pr-2.5 py-0.5 text-[11px] font-medium text-slate-700" title={e.label}>
      <img src={e.logo} alt={e.label} className={`${img} rounded-full object-contain`} />
      {e.label}
    </span>
  )
}

export function ProgressBar({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value || 0)))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#e3ecf8]">
      <div className="h-full rounded-full bg-[#2c3a61] transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function StatTile({ label, value, accent = false }) {
  return (
    <div className="rounded-lg border border-[#d8e2ef] bg-white px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-bold ${accent ? 'text-[#26324f]' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

export function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#d8e2ef] bg-[#edf4fb] px-5 py-3">
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      {action}
    </div>
  )
}

export function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {onEdit && (
        <Button variant="ghost" size="icon" className="h-7 w-7 justify-center p-0" onClick={onEdit} aria-label="Edit"><Pencil size={13} /></Button>
      )}
      {onDelete && (
        <Button variant="ghost" size="icon" className="h-7 w-7 justify-center p-0 text-red-600" onClick={onDelete} aria-label="Delete"><Trash2 size={13} /></Button>
      )}
    </div>
  )
}
