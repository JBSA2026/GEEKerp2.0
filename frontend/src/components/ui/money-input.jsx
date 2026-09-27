/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * MoneyInput — a number input that displays comma separators (e.g., 1,000,000.00)
 * while storing the raw numeric value.
 *
 * Props:
 *   value: number | string — the raw numeric value
 *   onChange: (rawValue: string) => void — called with the unformatted number string
 *   className: additional classes
 *   placeholder: input placeholder
 *   ...rest: passed to underlying input
 */
export function MoneyInput({ value, onChange, className, placeholder = '0.00', prefix = '', ...rest }) {
  const [focused, setFocused] = useState(false)

  // Format number with commas
  function formatDisplay(val) {
    if (val === '' || val === null || val === undefined) return ''
    const num = String(val).replace(/,/g, '')
    if (isNaN(Number(num))) return String(val)
    const parts = num.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.join('.')
  }

  // Strip commas for raw value
  function stripCommas(val) {
    return String(val || '').replace(/,/g, '')
  }

  function handleChange(e) {
    const raw = e.target.value.replace(/,/g, '')
    // Allow empty, digits, one decimal point
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      onChange(raw)
    }
  }

  function handleBlur() {
    setFocused(false)
    // On blur, clean up trailing dots
    const raw = stripCommas(value)
    if (raw.endsWith('.')) {
      onChange(raw.slice(0, -1))
    }
  }

  const displayValue = focused ? stripCommas(value) : formatDisplay(value)

  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20 text-right',
          prefix && 'pl-7',
          className
        )}
        {...rest}
      />
    </div>
  )
}

/**
 * formatNumberWithCommas — utility to format any number with comma separators.
 * Use this for display-only contexts (not inputs).
 */
export function formatNumberWithCommas(val) {
  if (val === '' || val === null || val === undefined) return ''
  const num = Number(String(val).replace(/,/g, ''))
  if (isNaN(num)) return String(val)
  return num.toLocaleString('en-PH', { maximumFractionDigits: 2 })
}
