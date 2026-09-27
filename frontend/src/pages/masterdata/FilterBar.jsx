import { useState, useRef, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { COLUMNS_MAP } from './constants'

// ─── FilterBar — Stackable filter chips ───────────────────────────────────────
// Props:
//   resource      - active resource key
//   filters       - array of { column, value } objects (active chips)
//   onAddFilter   - (column, value) => void
//   onRemoveFilter - (index) => void
//   onClearAll    - () => void

export default function FilterBar({ resource, filters, onAddFilter, onRemoveFilter, onClearAll }) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState(null)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const columns = COLUMNS_MAP[resource] || []

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
        setSelectedColumn(null)
        setFilterValue('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Focus input when column is selected
  useEffect(() => {
    if (selectedColumn && inputRef.current) {
      inputRef.current.focus()
    }
  }, [selectedColumn])

  function handleColumnSelect(col) {
    setSelectedColumn(col)
  }

  function handleSubmitFilter(e) {
    e.preventDefault()
    if (selectedColumn && filterValue.trim()) {
      onAddFilter(selectedColumn.key, filterValue.trim())
      setSelectedColumn(null)
      setFilterValue('')
      setShowDropdown(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Existing filter chips */}
      {filters.map((f, idx) => {
        const col = columns.find(c => c.key === f.column)
        const label = col ? col.label : f.column
        return (
          <span
            key={idx}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e2ef] bg-[#edf4fb] px-2.5 py-1 text-xs text-slate-700"
          >
            <span className="font-medium text-slate-900">{label}:</span>
            <span>{f.value}</span>
            <button
              onClick={() => onRemoveFilter(idx)}
              className="ml-0.5 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        )
      })}

      {/* Clear all link */}
      {filters.length > 0 && (
        <button
          onClick={onClearAll}
          className="text-xs text-slate-500 hover:text-[#2c3a61] underline transition-colors"
        >
          Clear All
        </button>
      )}

      {/* Add Filter button + dropdown */}
      <div className="relative" ref={dropdownRef}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => { setShowDropdown(!showDropdown); setSelectedColumn(null); setFilterValue('') }}
          className="border-dashed border-[#a7b5d8] text-slate-600 hover:border-[#2c3a61] hover:text-[#2c3a61]"
        >
          <Plus size={12} /> Add Filter
        </Button>

        {showDropdown && (
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-[#d8e2ef] rounded-xl shadow-sm z-[9999] min-w-[200px] p-1.5">
            {!selectedColumn ? (
              // Step 1: Pick a column
              <div className="max-h-[240px] overflow-y-auto">
                {columns.map(col => (
                  <button
                    key={col.key}
                    onClick={() => handleColumnSelect(col)}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[#edf4fb] text-slate-600 hover:text-[#26324f] transition-colors"
                  >
                    {col.label}
                  </button>
                ))}
              </div>
            ) : (
              // Step 2: Enter a value
              <form onSubmit={handleSubmitFilter} className="p-2 space-y-2">
                <p className="text-xs font-medium text-slate-500">
                  Filter by: <span className="text-slate-800">{selectedColumn.label}</span>
                </p>
                <Input
                  ref={inputRef}
                  type="text"
                  value={filterValue}
                  onChange={e => setFilterValue(e.target.value)}
                  placeholder="Type value..."
                  className="py-1.5"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!filterValue.trim()}
                  className="w-full justify-center"
                >
                  Apply
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
