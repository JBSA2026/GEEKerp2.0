import { useState } from 'react'
import { Outlet, useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import { getActiveSubRoute } from '@/utils/routeHelpers'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { TAX_TABS, ENTITIES } from './taxUtils'

export function TaxLayout() {
  const { user } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()
  const [entity, setEntity] = useState('All')
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false)

  const activeTab = getActiveSubRoute(location.pathname, TAX_TABS.map(t => t.id), 'dashboard')
  const currentEntity = ENTITIES.find(e => e.value === entity) || ENTITIES[0]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f6f8fc]">
      {/* Header with entity selector */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#d8e2ef] bg-white px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-[var(--color-text)]">Tax Management</h1>
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

      {/* Horizontal Tab Bar */}
      <div className="mx-6 mt-5 flex shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white p-1 shadow-sm">
        {TAX_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap',
              tab.id === activeTab
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <Outlet context={{ user, entity }} />
      </div>
    </div>
  )
}
