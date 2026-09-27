import { useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { ChevronDown } from 'lucide-react'
import { ENTITIES } from './quotationUtils'

export function QuotationLayout() {
  const { user } = useOutletContext()
  const [entity, setEntity] = useState('All')
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false)

  const currentEntity = ENTITIES.find(e => e.value === entity) || ENTITIES[0]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#d8e2ef] bg-white px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-[var(--color-text)]">Quotation</h1>
          {currentEntity.value !== 'All' && (
            <span className="text-sm text-[var(--color-muted-fg)]">—</span>
          )}
          {currentEntity.value !== 'All' && (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
              <img src={currentEntity.logo} alt="" className="w-5 h-5 rounded object-contain" />
              {currentEntity.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Company Switcher */}
          <div className="relative w-[220px]">
            <button
              type="button"
              onClick={() => setEntityDropdownOpen(prev => !prev)}
              className="w-full inline-flex items-center justify-between gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
            >
              <span className="inline-flex items-center gap-2 truncate">
                {currentEntity.logo && <img src={currentEntity.logo} alt="" className="w-5 h-5 rounded object-contain border border-[var(--color-border)] bg-white p-0.5" />}
                <span>{currentEntity.value === 'All' ? 'All Companies' : currentEntity.label}</span>
              </span>
              <ChevronDown size={14} className={`text-[var(--color-muted-fg)] shrink-0 transition-transform ${entityDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {entityDropdownOpen && (
              <>
                <div className="fixed inset-0 z-[49]" onClick={() => setEntityDropdownOpen(false)} />
                <ul className="absolute left-0 top-full mt-1 w-full rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-50">
                  {ENTITIES.map(ent => (
                    <li key={ent.value}>
                      <button
                        type="button"
                        onClick={() => { setEntity(ent.value); setEntityDropdownOpen(false) }}
                        className="w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2 text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
                      >
                        {ent.logo ? <img src={ent.logo} alt="" className="w-5 h-5 rounded object-contain border border-[var(--color-border)] bg-white p-0.5" /> : <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500">All</div>}
                        <span>{ent.value === 'All' ? 'All Companies' : ent.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <Outlet context={{ user, entity }} />
    </div>
  )
}
