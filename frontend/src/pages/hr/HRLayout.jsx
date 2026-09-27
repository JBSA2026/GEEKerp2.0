import { useState } from 'react'
import { Outlet, useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import { Shield, ChevronDown } from 'lucide-react'
import { getActiveSubRoute } from '@/utils/routeHelpers'

// ─── HR Module Tabs ─────────────────────────────────────────────────────────
const HR_TABS = [
  { id: '201', label: 'Employee 201 File' },
  { id: 'recruitment', label: 'Recruitment' },
  { id: 'ojt', label: 'OJT Management' },
  { id: 'leave', label: 'Leave Management' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'performance', label: 'Performance Evaluation' },
  { id: 'training', label: 'Training Records' },
  { id: 'reports', label: 'Reports' },
]

// ─── Access Denied Component ────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <Shield size={48} className="mx-auto text-red-400 mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">Access Denied</h2>
        <p className="text-sm text-[var(--color-muted-fg)]">
          You do not have permission to access the HR Management module.
        </p>
      </div>
    </div>
  )
}

// ─── HR Layout Component ────────────────────────────────────────────────────
export function HRLayout() {
  const { user } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Derive active tab from URL instead of useState
  const activeTab = getActiveSubRoute(location.pathname, HR_TABS.map(t => t.id), '201')
  const activeLabel = HR_TABS.find(t => t.id === activeTab)?.label || ''

  function handleTabChange(tabId) {
    navigate(tabId)
    setDropdownOpen(false)
  }

  // Role gate: require HR_MANAGER, SUPER_ADMIN, or legacy admin role
  const userRoles = user?.roles || []
  const hasAccess =
    userRoles.includes('HR_MANAGER') ||
    userRoles.includes('SUPER_ADMIN') ||
    user?.role === 'admin'

  if (!hasAccess) {
    return <AccessDenied />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with module selector — EXACT same dropdown UI */}
      <div className="relative z-20 flex items-center gap-4 px-6 py-3 bg-white border-b border-[var(--color-border)]">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">HR Management</h1>

        {/* Custom dropdown */}
        <div className="relative w-[220px]">
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
                {HR_TABS.map((tab) => (
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

      {/* Content via Outlet instead of conditional rendering */}
      <div className="flex-1 overflow-y-auto p-6">
        <Outlet context={{ user }} />
      </div>
    </div>
  )
}
