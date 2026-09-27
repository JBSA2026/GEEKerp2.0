// ─── Shared utilities, constants, and helpers for the Purchasing module ──────
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

// ─── API ────────────────────────────────────────────────────────────────────

export const BASE = import.meta.env.VITE_API_URL

export function authHeaders() {
  const t = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  }
}

export async function api(path, options = {}) {
  const maxRetries = 2
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    let res
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: authHeaders(),
        ...options,
        signal: options.signal || controller.signal,
      })
    } catch (err) {
      clearTimeout(timeout)
      if (err.name === 'AbortError') {
        throw new Error(`The API request timed out: ${path}`, { cause: err })
      }
      // Retry on network errors (transient)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
        continue
      }
      throw new Error(`Network error on ${options.method || 'GET'} ${path}: ${err.message || 'Failed to fetch'}. Check your connection or if the server is running.`, { cause: err })
    } finally {
      clearTimeout(timeout)
    }
    // Retry on 500 (transient backend errors like HTTP/2 socket issues)
    if (res.status === 500 && attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
      continue
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const detail = err.detail
      let message
      if (typeof detail === 'string') {
        message = detail
      } else if (Array.isArray(detail)) {
        message = detail.map(d => d.msg || JSON.stringify(d)).join('; ')
      } else if (detail && typeof detail === 'object') {
        message = detail.error || detail.msg || JSON.stringify(detail)
      } else {
        message = err.error || err.message || null
      }
      throw new Error(message || `Request failed (${res.status} ${res.statusText}) on ${options.method || 'GET'} ${path}`)
    }
    if (res.status === 204) return null
    return res.json()
  }
}

// ─── Formatters ─────────────────────────────────────────────────────────────

export function money(value, currency = 'PHP') {
  const currencyCode = currency === 'USD' ? 'USD' : 'PHP'
  return new Intl.NumberFormat(currencyCode === 'USD' ? 'en-US' : 'en-PH', { style: 'currency', currency: currencyCode, maximumFractionDigits: 2 }).format(Number(value || 0))
}

export function formatDate(value) {
  if (!value) return '-'
  return String(value).slice(0, 10)
}

export function qty(value) {
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(Number(value || 0))
}

export function displayInventoryCode(code) {
  return String(code || '').replace(/^([A-Z]{3}-\d{4}-PRD-\d{4})-\d{2}$/, '$1')
}

export function statusLabel(status) {
  return (status || 'DRAFT').replace(/_/g, ' ')
}

export function entityFromDocumentNumber(value) {
  const prefix = String(value || '').split('-')[0]
  return {
    EXP: 'Expedia',
    GLB: 'GreatnessLab',
    EXG: 'Exigent',
    KSI: 'KSI',
  }[prefix] || COMPANY_OPTIONS[0]
}

export function normalizeCompanyEntity(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s_-]/g, '')
  return {
    expedia: 'Expedia',
    greatnesslab: 'GreatnessLab',
    glab: 'GreatnessLab',
    glb: 'GreatnessLab',
    exigent: 'Exigent',
    exg: 'Exigent',
    ksi: 'KSI',
  }[normalized] || ''
}

// ─── Grid Constants ─────────────────────────────────────────────────────────

export const RECENT_REQUEST_GRID = 'grid-cols-[34%_16%_16%_17%_17%]'
export const PO_LIST_GRID = 'grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(90px,0.6fr)_minmax(100px,0.7fr)_minmax(100px,0.7fr)_minmax(100px,0.7fr)]'
export const DETAIL_ITEMS_GRID = 'grid-cols-[minmax(0,1fr)_minmax(80px,0.4fr)_minmax(90px,0.45fr)_minmax(120px,0.65fr)_minmax(120px,0.65fr)]'
export const COMPARISON_GRID = 'grid-cols-[minmax(0,1.8fr)_minmax(90px,0.8fr)_minmax(110px,0.85fr)_minmax(115px,0.85fr)_minmax(95px,0.75fr)_minmax(130px,0.95fr)]'
export const PO_ITEM_GRID = 'grid-cols-[minmax(0,1fr)_minmax(90px,0.45fr)_minmax(90px,0.45fr)_minmax(105px,0.55fr)_minmax(110px,0.65fr)]'
export const SUPPLIER_GRID = 'grid-cols-[minmax(0,1.35fr)_minmax(100px,0.6fr)_minmax(110px,0.65fr)_minmax(110px,0.65fr)_minmax(120px,0.75fr)_minmax(110px,0.65fr)]'

// ─── Filter Options ─────────────────────────────────────────────────────────

export const REQUEST_STATUS_FILTERS = [
  'All',
  'TO_PURCHASE',
  'RFQ_SENT',
  'QUOTE_RECEIVED',
  'COMPARISON_DONE',
  'PO_CREATED',
  'SUBMITTED',
  'APPROVED',
  'PO_SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'AP_OPEN',
  'AP_PAID',
  'REJECTED',
]

export const PO_STATUS_FILTERS = [
  'All',
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'PO_SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
]

export const COMPANY_OPTIONS = [
  'Expedia',
  'GreatnessLab',
  'Exigent',
  'KSI',
]

// ─── Form Constants ─────────────────────────────────────────────────────────

export const VAT_RATE = 0.12

export const DEFAULT_PURCHASE_SOURCE = 'LOCAL_PHYSICAL'

export const PURCHASE_SOURCE_OPTIONS = [
  { value: 'LOCAL_PHYSICAL', label: 'Local physical' },
  { value: 'LOCAL_DIGITAL', label: 'Local digital' },
  { value: 'INTERNATIONAL_PHYSICAL', label: 'International physical' },
  { value: 'INTERNATIONAL_DIGITAL', label: 'International digital' },
  { value: 'INTERCOMPANY', label: 'Intercompany purchase' },
]

export function isInternationalPurchaseSource(purchaseSource) {
  return String(purchaseSource || '').startsWith('INTERNATIONAL_')
}

export function supplierClassificationForPurchaseSource(purchaseSource) {
  if (String(purchaseSource || '').startsWith('LOCAL_')) return 'LOCAL'
  if (isInternationalPurchaseSource(purchaseSource)) return 'INTERNATIONAL'
  return null
}

export function purchaseSourceCurrency(purchaseSource) {
  return isInternationalPurchaseSource(purchaseSource) ? 'USD' : 'PHP'
}

export function purchaseSourceLabel(purchaseSource) {
  return PURCHASE_SOURCE_OPTIONS.find(option => option.value === purchaseSource)?.label || 'Local physical'
}

export const EMPTY_ITEM = {
  product_code: '',
  seller_product_code: '',
  item_description: '',
  unit: 'Nos',
  quantity: 1,
  estimated_unit_cost: 0,
}

export const EMPTY_FORM = {
  entity: 'Expedia',
  purchase_source: DEFAULT_PURCHASE_SOURCE,
  source_supplier_id: '',
  source_seller_entity: '',
  warehouse_id: '',
  required_date: '',
  remarks: '',
  items: [{ ...EMPTY_ITEM }],
}

export const EMPTY_SUPPLIER = {
  company_name: '',
  tin_number: '',
  supplier_type: '',
  supplier_classification: '',
  industry: '',
  vat_status: 'VATABLE',
  billing_address: '',
  address: '',
  payment_terms: '',
  status: 'active',
}

export function supplierFormPayload(form) {
  return {
    ...form,
    company_name: form.company_name.trim(),
    tin_number: form.tin_number.trim(),
    supplier_type: form.supplier_type.trim(),
    supplier_classification: form.supplier_classification,
    industry: form.industry.trim(),
    vat_status: form.vat_status.trim(),
    billing_address: form.billing_address.trim(),
    address: (form.address || form.billing_address).trim(),
    payment_terms: form.payment_terms.trim(),
    status: form.status || 'active',
  }
}

// ─── Shared UI Components ───────────────────────────────────────────────────

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
