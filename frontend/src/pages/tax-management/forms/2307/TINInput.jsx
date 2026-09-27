import { useRef } from 'react'

/**
 * TIN Input matching BIR form style.
 * Format: NNN-NNN-NNN-NNN (4 segments of 3 digits, separated by dash boxes)
 * Each segment is a bordered box, dashes are bold separators.
 */
export function TINInput({ value = ['', '', '', ''], onChange }) {
  const refs = [useRef(), useRef(), useRef(), useRef()]

  // Normalize value to always be an array of 4 segments
  let segments
  if (Array.isArray(value)) {
    // If first segment is longer than 3 chars (entire TIN in one slot), re-split
    if (value[0] && value[0].length > 3 && !value[1]) {
      const raw = value[0].replace(/\D/g, '')
      segments = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9, 12)]
    } else {
      segments = value
    }
  } else if (typeof value === 'string') {
    if (value.includes('-')) {
      const parts = value.split('-')
      segments = [parts[0] || '', parts[1] || '', parts[2] || '', parts[3] || '']
    } else {
      segments = [value.slice(0, 3), value.slice(3, 6), value.slice(6, 9), value.slice(9, 12)]
    }
  } else {
    segments = ['', '', '', '']
  }
  // Ensure exactly 4 segments
  while (segments.length < 4) segments.push('')
  segments = segments.slice(0, 4)

  const handleChange = (idx, e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 3)
    const newValue = [...segments]
    newValue[idx] = raw
    onChange(newValue)
    if (raw.length === 3 && idx < 3) {
      refs[idx + 1].current?.focus()
    }
  }

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !segments[idx] && idx > 0) {
      refs[idx - 1].current?.focus()
    }
  }

  return (
    <div className="inline-flex items-center">
      {segments.map((seg, idx) => (
        <div key={idx} className="flex items-center">
          {/* 3-char box */}
          <div className="flex">
            <input
              ref={refs[idx]}
              type="text"
              inputMode="numeric"
              value={seg || ''}
              onChange={e => handleChange(idx, e)}
              onKeyDown={e => handleKeyDown(idx, e)}
              maxLength={3}
              className="w-[28px] h-[16px] border border-black bg-transparent text-[9px] text-center focus:outline-none focus:bg-blue-50/40"
            />
          </div>
          {/* Dash separator */}
          {idx < 3 && (
            <span className="w-[10px] text-center text-[11px] font-bold leading-none">-</span>
          )}
        </div>
      ))}
    </div>
  )
}
