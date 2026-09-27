/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'

import logoExpedia from '@/assets/company-logos/Expedia.png'
import logoGLab from '@/assets/company-logos/GLab.png'
import logoExigent from '@/assets/company-logos/exigent.png'
import logoKSI from '@/assets/company-logos/KSI.png'

// ── API Helpers ──────────────────────────────────────────────────────────────

export const BASE = import.meta.env.VITE_API_URL

export function authHeaders() {
  const t = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  }
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(value || 0))
}

export function moneyPlain(value) {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))
}

export function statusLabel(s) { return (s || 'DRAFT').replace(/_/g, ' ') }

export function formatDate(d) {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()
}

// ── Constants ────────────────────────────────────────────────────────────────

export const STATUSES = ['All', 'DRAFT', 'FOR_APPROVAL', 'APPROVED', 'SENT', 'REJECTED', 'COMPLETE']

export const STATUS_COLORS = {
  DRAFT: 'muted', FOR_APPROVAL: 'warning', APPROVED: 'success',
  SENT: 'info', REJECTED: 'danger', COMPLETE: 'muted',
}

export const UOM_OPTIONS = [
  'Nos', 'Pcs', 'Set', 'Unit', 'Lot', 'Box', 'Pack', 'Roll', 'Pair',
]

export const COMPANIES = {
  expedia: {
    name: 'Expedia Solutions Specialist Inc.',
    short: 'Expedia',
    logo: logoExpedia,
    address: 'UG 17 CPT Condominium, Calle Estacion, Brgy. Pio del Pilar, Makati, Philippines, 1230',
    phone: '(+63) 288800051',
    bank_details: 'BANK: BANCO DE ORO\nACCOUNT NAME: EXPEDIA SOLUTIONS SPECIALIST INC.\nACCOUNT TYPE: CURRENT\nACCOUNT NO: 0048-8800-3921',
    contact_phone: '(+63) 288800051',
    email: 'account.support@exssi.com',
    support_email: 'account.support@exssi.com',
  },
  greatnesslab: {
    name: 'GreatnessLab Inc.',
    short: 'GreatnessLab',
    logo: logoGLab,
    address: 'Rm 233 Cityland Pasong Tamo 6264 Calle Estacion Street Pio del Pilar Makati City',
    phone: 'T. +632 8423-2249',
    bank_details: 'BANK: BANCO DE ORO\nACCOUNT NAME: GREATNESSLAB INC.\nACCOUNT TYPE: CURRENT\nACCOUNT NO: TBD',
    contact_phone: '+63951-479-4749',
    email: 'sales@greatnesslab.com',
    support_email: 'support@greatnesslab.com',
  },
  exigent: {
    name: 'Exigent Corporation',
    short: 'Exigent',
    logo: logoExigent,
    address: 'UG 43 CPT Condominium, Calle Estacion, Brgy. Pio del Pilar, Makati, Philippines, 1230',
    phone: '(+63) 288800051',
    bank_details: 'BANK: BANCO DE ORO\nACCOUNT NAME: EXIGENT CORPORATION\nACCOUNT TYPE: CURRENT\nACCOUNT NO: TBD',
    contact_phone: '(+63) 288800051',
    email: 'sales@exigent.com.ph',
    support_email: 'sales@exigent.com.ph',
  },
  kyrios: {
    name: 'Kyrios Solutions Inc.',
    short: 'Kyrios Solutions',
    logo: logoKSI,
    address: 'UG 24 CPT Condominium, Calle Estacion, Brgy. Pio del Pilar, Makati, Philippines, 1230',
    phone: '(+63) 282939790',
    bank_details: 'BANK: BANCO DE ORO\nACCOUNT NAME: KYRIOS SOLUTIONS INC.\nACCOUNT TYPE: CURRENT\nACCOUNT NO: TBD',
    contact_phone: '(+63) 282939790',
    email: 'sales@kyrios.asia',
    support_email: 'sales@kyrios.asia',
  },
}

export function quotationEntity(companyKey) {
  return {
    expedia: 'Expedia',
    greatnesslab: 'GreatnessLab',
    exigent: 'Exigent',
    kyrios: 'KSI',
  }[companyKey] || ''
}

export const ENTITIES = [
  { value: 'All', label: 'All Companies', logo: null },
  { value: 'greatnesslab', label: 'GreatnessLab', logo: logoGLab },
  { value: 'expedia', label: 'Expedia', logo: logoExpedia },
  { value: 'exigent', label: 'Exigent', logo: logoExigent },
  { value: 'kyrios', label: 'Kyrios Solutions Inc.', logo: logoKSI },
]

export const EMPTY_ITEM = {
  product_type: '', product_code: '', description: '', datasheet_link: '',
  quantity: 1, uom: 'Nos', unit_cost: 0, selling_price: 0, discount_percent: 0,
  is_section: false, fulfillment_type: '',
}

export const SECTION_ITEM = {
  is_section: true, section_title: '',
  product_type: '', product_code: '', description: '', datasheet_link: '',
  quantity: 0, uom: '', unit_cost: 0, selling_price: 0, discount_percent: 0,
}

export const EMPTY_FORM = {
  company: 'greatnesslab',
  client_id: '',
  project_name: '',
  subject: '',
  attn_to: '',
  validity_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  validity_days: 30,
  payment_terms: '50% Downpayment and 50% Upon Project Completion',
  delivery_terms: 'ORDER BASIS: 10-15 weeks from date of PURCHASE CONFIRMATION & DP',
  notes: '*Prices provided are applicable only for the quantities specified. Changes in the quantity may lead to adjustments in the actual pricing.',
  scope_of_works: '',
  cancellation_fee: '50% Cancellation Fee',
  bank_details: COMPANIES.greatnesslab.bank_details,
  additional_notes: 'Any installation works if not stated herein can be covered in a separate proposal or shall be done by others, BONDS & PERMITS cost not included',
  vat_rate: 12,
  wht_rate: 0,
  discount_amount: 0,
  shipping_cost: 0,
  others_cost: 0,
  scope_lines: [''],
  prepared_by_name: 'ACCOUNT SUPPORT TEAM',
  prepared_by_email: '',
  confirmed_by_name: '',
  items: [{ ...EMPTY_ITEM }],
}

export { calculateQuotationTotals, quotationUnitPrice } from '@/utils/quotationTotals'

// ── Shared UI Components ─────────────────────────────────────────────────────

export function StatusDropdown({ value, onChange, options, labelFn }) {
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
    <div className="relative w-[160px]">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
      >
        {labelFn(value)}
        <ChevronDown size={14} className={`text-[var(--color-muted-fg)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <ul
            className="fixed rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-[9999]"
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
