import { useMemo } from 'react'
import { Pencil, Archive, ArchiveRestore, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, Loading } from '@/components/ui/feedback'
import { getRecordId, getRecordName, getColumnSize, getColumnTrack } from './constants'

// ─── DataTable — CSS Grid table with selection and row actions ─────────────────
// Props:
//   resource        - active resource key
//   columns         - column config array
//   items           - array of record objects to display
//   loading         - boolean loading state
//   error           - error message string or null
//   selected        - Set of selected record IDs
//   onToggleRow     - (id) => void
//   onToggleAll     - () => void
//   onEdit          - (item) => void
//   onArchiveToggle - (item) => void

export default function DataTable({
  resource,
  columns,
  items,
  loading,
  error,
  selected,
  onToggleRow,
  onToggleAll,
  onEdit,
  onArchiveToggle,
  onRowClick,
  activeRowId,
}) {
  const allChecked = items.length > 0 && items.every(item => selected.has(getRecordId(resource, item)))
  const someChecked = selected.size > 0 && !allChecked

  // Determine if a record is currently archived based on its status fields
  function isItemArchived(item) {
    if (typeof item.is_active === 'boolean') return !item.is_active
    const status = (item.status || item.lead_status || item.stage || '').toLowerCase()
    return status === 'archived'
  }

  const columnSizes = columns.map(getColumnSize)

  // Grid template always includes checkbox column
  const gridTemplate = `40px ${columns.map(getColumnTrack).join(' ')} 74px`
  const gridMinWidth = 40 + 74 + columnSizes.reduce((sum, size) => sum + size.min, 0) + ((columns.length + 1) * 12) + 40

  const masterGridStyle = useMemo(() => ({
    gridTemplateColumns: gridTemplate,
    minWidth: `${gridMinWidth}px`,
  }), [gridTemplate, gridMinWidth])

  return (
    <div className="h-full overflow-auto">
      <div className="min-w-full">
        {/* Header row */}
        <div className="grid w-full items-center gap-3 border-y border-[#d8e2ef] bg-[#f6f8fc] px-5 py-2.5" style={masterGridStyle}>
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={allChecked}
              ref={el => { if (el) el.indeterminate = someChecked }}
              onChange={onToggleAll}
              className="h-4 w-4 cursor-pointer rounded-[4px] border-[#a7b5d8] bg-white accent-[#2c3a61]"
            />
          </div>
          {columns.map(col => (
            <span key={col.key} className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              {col.label}
            </span>
          ))}
          <span className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-600">Actions</span>
        </div>

        {/* Body */}
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-rose-600">{error}</div>
        ) : items.length === 0 ? (
          <EmptyState title="No records found" icon={Database} />
        ) : (
          <div className="divide-y divide-[#e9eef8]">
            {items.map(it => {
              const recordId = getRecordId(resource, it)
              return (
                <div
                  key={recordId}
                  className={`grid w-full items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors hover:bg-[#f6f8fc] ${activeRowId === recordId ? 'bg-[#f0f4fa] border-l-2 border-l-[#2c3a61]' : selected.has(recordId) ? 'bg-[#f0f4fa]' : 'bg-white'}`}
                  style={masterGridStyle}
                  onClick={() => onRowClick ? onRowClick(it) : onToggleRow(recordId)}
                >
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selected.has(recordId)}
                      onChange={() => onToggleRow(recordId)}
                      onClick={e => e.stopPropagation()}
                      className="h-4 w-4 cursor-pointer rounded-[4px] border-[#a7b5d8] bg-white accent-[#2c3a61]"
                    />
                  </div>
                  {columns.map(col => (
                    <div key={col.key} className="min-w-0 truncate">
                      {col.render(it)}
                    </div>
                  ))}
                  <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 justify-center p-0 text-slate-500 hover:bg-[#e9eef8] hover:text-slate-950 disabled:opacity-30 disabled:pointer-events-none"
                      onClick={() => onEdit(it)}
                      disabled={resource === 'documents' && it.is_native === false}
                      aria-label={`Edit ${getRecordName(resource, it) || 'record'}`}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 justify-center p-0 disabled:opacity-30 disabled:pointer-events-none ${isItemArchived(it) ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700' : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'}`}
                      onClick={() => onArchiveToggle(it)}
                      disabled={resource === 'documents' && it.is_native === false}
                      aria-label={`${isItemArchived(it) ? 'Restore' : 'Archive'} ${getRecordName(resource, it) || 'record'}`}
                    >
                      {isItemArchived(it) ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
