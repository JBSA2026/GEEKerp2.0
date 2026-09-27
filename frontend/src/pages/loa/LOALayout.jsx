import { useState } from 'react'
import { Outlet, useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { getActiveSubRoute } from '@/utils/routeHelpers'
import { TABS } from './loaUtils'

export function LOALayout() {
  const { user } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const activeTab = getActiveSubRoute(location.pathname, TABS.map(t => t.id), 'bir')
  const activeLabel = TABS.find(t => t.id === activeTab)?.label || ''

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="LOA Retrieval" subtitle="Audit-ready record retrieval for BIR Letter of Authority compliance" />

      <div className="relative z-20 flex items-center gap-4 px-6 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(p => !p)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] focus:outline-none"
          >
            {activeLabel}
            <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-[49]" onClick={() => setDropdownOpen(false)} />
              <ul className="absolute left-0 top-full mt-1 min-w-full whitespace-nowrap rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-50">
                {TABS.map(tab => (
                  <li key={tab.id}>
                    <button
                      type="button"
                      onClick={() => { navigate(tab.id); setDropdownOpen(false) }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm transition-colors',
                        tab.id === activeTab
                          ? 'bg-[var(--color-primary)] text-white font-medium'
                          : 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
                      )}
                    >
                      {tab.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <Outlet context={{ user }} />
      </div>
    </div>
  )
}
