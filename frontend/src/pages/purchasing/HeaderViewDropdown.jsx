import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export function HeaderViewDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const options = [
    { value: 'orders', label: 'Purchase Orders' },
    { value: 'suppliers', label: 'Supplier Table' },
  ]
  const active = options.find(option => option.value === value) || options[0]

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
  }, [open])

  return (
    <div className="relative w-[200px] shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-1 py-1 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] focus:outline-none"
      >
        <span>{active.label}</span>
        <ChevronDown size={14} className={`text-[var(--color-muted-fg)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <ul
            className="fixed rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-[9999]"
            style={{ top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 180) }}
          >
            {options.map(option => (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => { onChange(option.value); setOpen(false) }}
                  className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
