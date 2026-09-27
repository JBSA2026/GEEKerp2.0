import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  formatPhonePH, normalizePhonePH,
  formatTIN, normalizeTIN,
  formatCurrencyPHP, parseCurrency,
} from '@/utils/format'

// ─── MaskedInput ────────────────────────────────────────────────────────────
// Smart input with live formatting + normalization for PH locale.
//
//   mask="phone"     → displays "+63 9XX XXX XXXX", emits canonical "639XXXXXXXXX"
//   mask="tin"       → displays "XXX-XXX-XXX-XXX", emits digits only
//   mask="currency"  → displays "₱1,234.56" (when blurred), emits a Number
//   mask="text"      → passthrough
//
// onChange receives the NORMALIZED value (string for phone/tin, number for currency).

function formatForDisplay(mask, value) {
  if (mask === 'phone') return value ? formatPhonePH(value) : ''
  if (mask === 'tin') return value ? formatTIN(value) : ''
  if (mask === 'currency') {
    return value === '' || value === null || value === undefined ? '' : formatCurrencyPHP(value)
  }
  return value ?? ''
}

export function MaskedInput({
  mask = 'text',
  value,
  onChange,
  onBlur,
  className = '',
  ...props
}) {
  // While focused we show the local `draft` (so live edits aren't reformatted
  // away); when blurred the display is derived from the external value.
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')

  const shown = focused ? draft : formatForDisplay(mask, value)

  function handleFocus() {
    // Seed the draft with an editable version of the current value.
    if (mask === 'currency') {
      setDraft(value === '' || value === null || value === undefined ? '' : String(value))
    } else {
      setDraft(formatForDisplay(mask, value))
    }
    setFocused(true)
  }

  function handleChange(e) {
    const raw = e.target.value
    if (mask === 'phone') {
      setDraft(formatPhonePH(raw))
      onChange?.(normalizePhonePH(raw))
    } else if (mask === 'tin') {
      setDraft(formatTIN(raw))
      onChange?.(normalizeTIN(raw))
    } else if (mask === 'currency') {
      const cleaned = raw.replace(/[^0-9.]/g, '')
      setDraft(cleaned)
      onChange?.(parseCurrency(cleaned))
    } else {
      setDraft(raw)
      onChange?.(raw)
    }
  }

  function handleBlur(e) {
    setFocused(false)
    onBlur?.(e)
  }

  return (
    <input
      inputMode={mask === 'currency' || mask === 'tin' ? 'numeric' : mask === 'phone' ? 'tel' : undefined}
      value={shown}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={cn(
        'w-full rounded-lg border border-[#d8e2ef] bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#2c3a61] focus:outline-none focus:ring-1 focus:ring-[#2c3a61]/40',
        className,
      )}
      {...props}
    />
  )
}
