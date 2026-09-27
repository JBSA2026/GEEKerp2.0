import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Table2, X, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Combobox (hybrid table-picker + autocomplete) ──────────────────────────
// Dual-mode selector for foreign-key fields (e.g. Customer, Employee).
//
//   Type mode:      type to search; a dropdown lists matching records.
//   Selection mode: click the table icon to browse all records in a modal.
//
// Props:
//   value         current selected id
//   displayValue  optional label to show for the current value (when known)
//   onChange      (id, row) => void
//   fetchOptions  async (search) => row[]   (reuses existing list endpoints)
//   getId         (row) => id
//   getLabel      (row) => string
//   getSubtitle   (row) => string | undefined
//   columns       optional [{ label, render(row) }] for the modal table
//   placeholder   input placeholder
export function Combobox({
  value,
  displayValue,
  onChange,
  fetchOptions,
  getId,
  getLabel,
  getSubtitle,
  columns,
  placeholder = 'Search…',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const ref = useRef(null)

  // Resolve the label to show for the current value.
  const label =
    selectedRow ? getLabel(selectedRow)
      : displayValue ? displayValue
        : value ? `#${value}`
          : ''

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const runSearch = useCallback(async (q) => {
    setLoading(true)
    try {
      const rows = await fetchOptions(q)
      setResults(rows || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [fetchOptions])

  // Debounced search whenever the dropdown is open and the query changes
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => runSearch(query), 250)
    return () => clearTimeout(t)
  }, [query, open, runSearch])

  function pick(row) {
    setSelectedRow(row)
    onChange?.(getId(row), row)
    setOpen(false)
    setModalOpen(false)
    setQuery('')
  }

  function clear(e) {
    e.stopPropagation()
    setSelectedRow(null)
    onChange?.(null, null)
  }

  async function openModal() {
    setModalOpen(true)
    await runSearch('')
  }

  return (
    <div className={cn('relative', className)} ref={ref}>
      {/* Trigger / display field */}
      <div className="flex items-stretch gap-1.5">
        <div
          className="flex flex-1 items-center justify-between rounded-lg border border-[#d8e2ef] bg-white px-3 py-2 text-sm cursor-text focus-within:border-[#2c3a61] focus-within:ring-1 focus-within:ring-[#2c3a61]/40"
          onClick={() => setOpen(true)}
        >
          {open ? (
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          ) : (
            <span className={cn('truncate', value ? 'text-slate-900' : 'text-slate-400')}>
              {value ? label : placeholder}
            </span>
          )}
          {value && !open && (
            <button type="button" onClick={clear} className="ml-2 text-slate-400 hover:text-slate-600" aria-label="Clear">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Browse-in-table button */}
        <button
          type="button"
          onClick={openModal}
          className="flex items-center justify-center rounded-lg border border-[#d8e2ef] bg-white px-2.5 text-slate-500 hover:bg-[#edf4fb] hover:text-[#2c3a61] transition-colors"
          aria-label="Browse records"
          title="Browse records"
        >
          <Table2 size={15} />
        </button>
      </div>

      {/* Autocomplete dropdown */}
      {open && (
        <div className="absolute z-[9999] mt-1.5 w-full rounded-xl border border-[#d8e2ef] bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-400">No matches found</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {results.map(row => {
                const id = getId(row)
                const isSel = id === value
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => pick(row)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#edf4fb]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-slate-800">{getLabel(row)}</span>
                        {getSubtitle && (
                          <span className="block truncate text-[11px] text-slate-400">{getSubtitle(row)}</span>
                        )}
                      </span>
                      {isSel && <Check size={14} className="shrink-0 text-[#2c3a61]" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Table-picker modal */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-[101] w-[640px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#d8e2ef] bg-[#edf4fb] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#d8e2ef] px-5 py-3.5">
              <p className="text-sm font-semibold text-slate-900">Select a record</p>
              <button onClick={() => setModalOpen(false)} className="text-slate-500 hover:text-slate-900" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-3">
              <div className="flex items-center gap-2 rounded-lg border border-[#d8e2ef] bg-white px-3 py-2">
                <Search size={15} className="text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => { setQuery(e.target.value); runSearch(e.target.value) }}
                  placeholder={placeholder}
                  className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-3 pb-4">
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-6 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Loading…
                </div>
              ) : results.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-slate-400">No records found</div>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {results.map(row => {
                      const id = getId(row)
                      return (
                        <tr
                          key={id}
                          onClick={() => pick(row)}
                          className="cursor-pointer border-b border-[#d8e2ef] last:border-0 hover:bg-[#edf4fb]"
                        >
                          {columns ? (
                            columns.map((col, i) => (
                              <td key={i} className="px-3 py-2.5 text-sm text-slate-700">{col.render(row)}</td>
                            ))
                          ) : (
                            <>
                              <td className="px-3 py-2.5 text-sm text-slate-800">{getLabel(row)}</td>
                              {getSubtitle && <td className="px-3 py-2.5 text-[12px] text-slate-400">{getSubtitle(row)}</td>}
                              <td className="px-3 py-2.5 text-right text-xs font-mono text-slate-400">#{id}</td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
