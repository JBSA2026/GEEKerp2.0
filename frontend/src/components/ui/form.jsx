import { forwardRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatWithCommas(val) {
  if (val === '' || val === null || val === undefined) return ''
  const str = String(val).replace(/,/g, '')
  if (isNaN(Number(str))) return String(val)
  const parts = str.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

export const Input = forwardRef(function Input({ className = '', type, onChange, onFocus, onBlur, value, ...props }, ref) {
  const isNumeric = type === 'number'
  const [focused, setFocused] = useState(false)

  if (isNumeric) {
    const rawValue = String(value ?? '').replace(/,/g, '')
    const displayValue = focused ? rawValue : formatWithCommas(rawValue)

    function handleChange(e) {
      const stripped = e.target.value.replace(/,/g, '')
      // Allow empty, negative, digits, one decimal point
      if (stripped === '' || stripped === '-' || /^-?\d*\.?\d*$/.test(stripped)) {
        const syntheticEvent = { ...e, target: { ...e.target, value: stripped } }
        onChange?.(syntheticEvent)
      }
    }

    function handleFocus(e) {
      setFocused(true)
      onFocus?.(e)
    }

    function handleBlur(e) {
      setFocused(false)
      // Clean trailing dot
      if (rawValue.endsWith('.')) {
        const syntheticEvent = { ...e, target: { ...e.target, value: rawValue.slice(0, -1) } }
        onChange?.(syntheticEvent)
      }
      onBlur?.(e)
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          'w-full rounded-lg border border-[#d8e2ef] bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#2c3a61] focus:outline-none focus:ring-1 focus:ring-[#2c3a61]/40',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          className,
        )}
        {...props}
      />
    )
  }

  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        'w-full rounded-lg border border-[#d8e2ef] bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#2c3a61] focus:outline-none focus:ring-1 focus:ring-[#2c3a61]/40',
        className,
      )}
      {...props}
    />
  )
})

export function Select({ children, className = '', ...props }) {
  return (
    <select
      className={cn(
        'w-full rounded-lg border border-[#d8e2ef] bg-white px-3 py-2 text-sm text-slate-950 transition-colors focus:border-[#2c3a61] focus:outline-none focus:ring-1 focus:ring-[#2c3a61]/40',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export const Textarea = forwardRef(function Textarea({ className = '', ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-[#d8e2ef] bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#2c3a61] focus:outline-none focus:ring-1 focus:ring-[#2c3a61]/40',
        className,
      )}
      {...props}
    />
  )
})

export function Field({ label, hint, required, error, children, className = '', ...props }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)} {...props}>
      <span className="text-xs font-medium text-slate-500">
        {label}
        {required && <span className="text-rose-500"> *</span>}
        {hint && <span className="text-[11px] text-slate-600"> ({hint})</span>}
      </span>
      {children}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </label>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search', className = '' }) {
  return (
    <div className={cn('flex h-9 items-center gap-2 rounded-lg border border-[#d8e2ef] bg-white px-3', className)}>
      <Search size={14} className="shrink-0 text-slate-500" />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange({ target: { value: '' } })}
          className="shrink-0 text-slate-500 hover:text-slate-900"
          aria-label="Clear search"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
