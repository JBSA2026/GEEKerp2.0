import { useState } from 'react'
import { Outlet, useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { getActiveSubRoute } from '@/utils/routeHelpers'

const OJT_TABS = [
  { id: 'interns', label: 'Intern List' },
  { id: 'task-logs', label: 'Task Logs' },
  { id: 'nda', label: 'NDA Monitoring' },
  { id: 'evaluation', label: 'Evaluation' },
]

export function OJTLayout() {
  const { user } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const activeTab = getActiveSubRoute(location.pathname, OJT_TABS.map(t => t.id), 'interns')
  const activeLabel = OJT_TABS.find(t => t.id === activeTab)?.label || ''

  function handleTabChange(tabId) {
    navigate(tabId)
    setDropdownOpen(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="relative z-20 flex items-center gap-4 px-6 py-3 bg-white border-b border-[var(--color-border)]">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">OJT & Internship</h1>
        <div className="relative w-[200px]">
          <button
            type="button"
            onClick={() => setDropdownOpen(prev => !prev)}
            className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
          >
            {activeLabel}
            <ChevronDown size={14} className={`text-[var(--color-muted-fg)] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-[49]" onClick={() => setDropdownOpen(false)} />
              <ul className="absolute left-0 top-full mt-1 w-full rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg z-50">
                {OJT_TABS.map((tab) => (
                  <li key={tab.id}>
                    <button
                      type="button"
                      onClick={() => handleTabChange(tab.id)}
                      className="w-full text-left px-3 py-1.5 text-sm whitespace-nowrap text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
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
