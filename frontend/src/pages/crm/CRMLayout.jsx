import { Outlet, useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { getActiveSubRoute } from '@/utils/routeHelpers'
import { cn } from '@/lib/utils'
import {
  Users, Target, Activity, Kanban, TrendingUp, FileBarChart, ShoppingCart,
} from 'lucide-react'

// ─── CRM Inner Sidebar Tabs ────────────────────────────────────────────────
const CRM_TABS = [
  { id: 'pipeline', label: 'Sales Pipeline', icon: Kanban },
  { id: 'sales-orders', label: 'Sales Orders', icon: ShoppingCart },
  { id: 'leads', label: 'Leads', icon: Target },
  { id: 'activities', label: 'Sales Activities', icon: Activity },
  { id: 'customers', label: 'Client List', icon: Users },
  { id: 'forecast', label: 'Sales Forecast', icon: TrendingUp },
  { id: 'reports', label: 'Sales Reports', icon: FileBarChart },
]

export function CRMLayout() {
  const { user } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()

  const activeTab = getActiveSubRoute(location.pathname, CRM_TABS.map(t => t.id), 'pipeline')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="CRM / Sales"
        subtitle="Manage clients, leads, opportunities, and sales pipeline"
      />

      {/* Horizontal Tab Bar */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none -mb-px">
          {CRM_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors',
                activeTab === id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-muted-fg)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
              )}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-hidden p-5">
        <Outlet context={{ user }} />
      </main>
    </div>
  )
}
