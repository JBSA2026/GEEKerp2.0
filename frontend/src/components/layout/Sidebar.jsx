import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { usePermissions } from '@/hooks/usePermissions'
import geekLogo from '@/assets/geek-wallpaper.png'
import {
  LayoutDashboard, Database, ShoppingCart, FileText, ShoppingBag,
  Package, FolderKanban, Receipt, CreditCard, BookOpen,
  Users, PhilippinePeso, Calculator, Search, FileStack, GitBranch,
  Headphones, Server, GraduationCap, Bot, Briefcase, Award,
  BarChart3, PieChart, Settings, Shield, LogOut, X
} from 'lucide-react'

// Map route paths to module_key used in role_modules
const ROUTE_MODULE_MAP = {
  '/dashboard': 'dashboard',
  '/masterdata': 'masterdata',
  '/crm': 'crm',
  '/quotation': 'quotation',
  '/purchasing': 'purchasing',
  '/inventory': 'inventory',
  '/projects': 'projects',
  '/accounts-receivable': 'accounts-receivable',
  '/accounts-payable': 'accounts-payable',
  '/general-ledger': 'general-ledger',
  '/hr': 'hr',
  '/payroll': 'payroll',
  '/tax': 'tax',
  '/loa': 'loa',
  '/documents': 'documents',
  '/workflow': 'workflow',
  '/service': 'service',
  '/datacenter': 'datacenter',
  '/lms': 'lms',
  '/ai': 'ai',
  '/ojt': 'ojt',
  '/commission': 'commission',
  '/administration': 'administration',
  '/reports': 'reports',
  '/bi': 'bi',
  '/board': 'board',
}

const NAV = [
  {
    label: 'Core Modules',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/masterdata', icon: Database, label: 'Master Data' },
      { to: '/crm', icon: ShoppingCart, label: 'CRM / Sales' },
      { to: '/quotation', icon: FileText, label: 'Quotation' },
      { to: '/purchasing', icon: ShoppingBag, label: 'Purchasing' },
      { to: '/inventory', icon: Package, label: 'Inventory' },
      { to: '/projects', icon: FolderKanban, label: 'Projects' },
      { to: '/accounts-receivable', icon: Receipt, label: 'Accounts Receivable' },
      { to: '/accounts-payable', icon: CreditCard, label: 'Accounts Payable' },
      { to: '/general-ledger', icon: BookOpen, label: 'General Ledger' },
    ],
  },
  {
    label: 'Additional Modules',
    items: [
      { to: '/hr', icon: Users, label: 'HR Management' },
      { to: '/payroll', icon: PhilippinePeso, label: 'Payroll Management' },
      { to: '/tax', icon: Calculator, label: 'Tax Management' },
      { to: '/loa', icon: Search, label: 'LOA Retrieval' },
      { to: '/documents', icon: FileStack, label: 'Document Management' },
      { to: '/workflow', icon: GitBranch, label: 'Workflow Approval' },
      { to: '/service', icon: Headphones, label: 'Service Management' },
      { to: '/datacenter', icon: Server, label: 'Data Center Projects' },
      { to: '/lms', icon: GraduationCap, label: 'LMS Management' },
      { to: '/ai', icon: Bot, label: 'Executive AI Assistant' },
      { to: '/ojt', icon: Briefcase, label: 'OJT & Internship' },
      { to: '/commission', icon: Award, label: 'Commission Management' },
    ],
  },
  {
    label: 'Reports & Analytics',
    items: [
      { to: '/reports', icon: BarChart3, label: 'Reports' },
      { to: '/bi', icon: PieChart, label: 'BI Analytics' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/administration', icon: Shield, label: 'Administration' },
      { to: '/settings', icon: Settings, label: 'System Settings' },
    ],
  },
]

export function Sidebar({ onLogout, user }) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const { hasModule } = usePermissions()

  // Derive display info from logged-in user
  const firstName = user?.first_name || ''
  const lastName = user?.last_name || ''
  const fullName = `${firstName} ${lastName}`.trim() || user?.email || 'User'
  const initials = (firstName?.[0] || '') + (lastName?.[0] || '') || (user?.email?.[0]?.toUpperCase() || 'U')
  const role = (user?.roles || [])[0]?.replace(/_/g, ' ') || 'Employee'

  function canAccessRoute(to) {
    const moduleKey = ROUTE_MODULE_MAP[to]
    if (!moduleKey) return true // Unregistered routes are accessible
    return hasModule(moduleKey)
  }

  return (
    <>
      <aside className="scrollbar-none hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-[#dce2ea] bg-white md:flex">
        <div className="flex h-28 items-center justify-center px-5 py-3">
          <img
            src={geekLogo}
            alt="GEEK Group of Companies"
            className="h-full w-full object-contain"
          />
        </div>

        <Separator />

        <nav aria-label="Primary navigation" className="flex-1 space-y-5 px-3 py-4">
          {NAV.map((group) => {
            const visibleItems = group.items.filter(({ to }) => canAccessRoute(to))
            if (visibleItems.length === 0) return null
            return (
              <div key={group.label}>
                <p className="mb-1.5 px-2 text-xs font-medium text-slate-400">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.filter(({ to }) => canAccessRoute(to)).map(({ to, icon: Icon, label }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        className={({ isActive }) => cn(
                          'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2c3a61]',
                          isActive
                            ? 'bg-[#eef2f6] font-medium text-[#26324f]'
                            : 'text-slate-600 hover:bg-[#f4f6f9] hover:text-slate-900'
                        )}
                      >
                        {({ isActive }) => (
                          <>
                            <Icon aria-hidden="true" size={17} strokeWidth={1.75} className={isActive ? 'text-[#2c3a61]' : 'text-[#8d9dbb] group-hover:text-[#2c3a61]'} />
                            <span className="flex-1 truncate">{label}</span>
                          </>
                        )}
                      </NavLink>
                    </li>
                ))}
              </ul>
            </div>
            )
          })}
        </nav>

        <Separator />

        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#dce2ea] bg-[#f4f6f9] text-xs font-semibold text-[#2c3a61]">{initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{fullName}</p>
              <p className="text-xs text-slate-500 truncate">{role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="mt-3 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-[#f4f6f9] hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2c3a61]"
          >
            <LogOut aria-hidden="true" size={17} strokeWidth={1.75} className="text-[#8d9dbb]" />
            <span className="flex-1 text-left">Logout</span>
          </button>
        </div>
      </aside>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-[340px] rounded-2xl bg-white p-6 shadow-2xl">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>

            {/* Icon */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 mb-4">
                <LogOut size={22} className="text-slate-600" />
              </div>

              <h3 className="text-lg font-bold text-slate-900 mb-1">Log out</h3>
              <p className="text-sm text-slate-500 mb-6">Are you sure you want to log out?</p>

              {/* Actions */}
              <div className="flex w-full gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { setShowLogoutConfirm(false); onLogout() }}
                  className="flex-1 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-900"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
