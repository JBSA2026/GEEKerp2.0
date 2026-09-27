// ─── Input normalization & formatting (Philippine locale) ───────────────────
// Pure helpers used by MaskedInput and anywhere values need display formatting.
// Normalizers return canonical storage values; formatters return display strings.

export function digitsOnly(s) {
  return (s ?? '').toString().replace(/\D/g, '')
}

// ── Phone: display "+63 9XX XXX XXXX", store canonical "639XXXXXXXXX" ─────────
export function normalizePhonePH(raw) {
  let d = digitsOnly(raw)
  if (d.startsWith('0')) d = '63' + d.slice(1)
  else if (d.startsWith('9')) d = '63' + d
  // if it already starts with 63, leave as-is
  return d.slice(0, 12)
}

export function formatPhonePH(raw) {
  const d = normalizePhonePH(raw)
  if (!d) return ''
  const cc = d.slice(0, 2)          // 63
  const rest = d.slice(2)           // up to 10 digits: 9XX XXX XXXX
  const p1 = rest.slice(0, 3)
  const p2 = rest.slice(3, 6)
  const p3 = rest.slice(6, 10)
  let out = '+' + cc
  if (p1) out += ' ' + p1
  if (p2) out += ' ' + p2
  if (p3) out += ' ' + p3
  return out
}

// ── TIN: display "XXX-XXX-XXX-XXX", store digits only (max 12) ────────────────
export function normalizeTIN(raw) {
  return digitsOnly(raw).slice(0, 12)
}

export function formatTIN(raw) {
  const d = normalizeTIN(raw)
  return d.match(/.{1,3}/g)?.join('-') ?? ''
}

// ── Currency (PHP): display "₱1,234.56", store a Number ──────────────────────
export function parseCurrency(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isNaN(raw) ? null : raw
  const cleaned = raw.toString().replace(/[^0-9.]/g, '')
  if (cleaned === '' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isNaN(n) ? null : n
}

export function formatCurrencyPHP(value, { withSymbol = true } = {}) {
  const n = typeof value === 'number' ? value : parseCurrency(value)
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  const s = n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return withSymbol ? '₱' + s : s
}

// ── Date helpers (ISO <-> display) ───────────────────────────────────────────
// Stores ISO date strings (YYYY-MM-DD) and shows a friendly label.
export function toISODate(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISODate(iso) {
  if (!iso) return undefined
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function formatDateDisplay(iso) {
  const d = fromISODate(iso)
  if (!d) return ''
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
