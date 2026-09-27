import { useState } from 'react'
import { Outlet, useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { getActiveSubRoute } from '@/utils/routeHelpers'
import { Card, CardContent } from '@/components/ui/card'

const SUBMODULES = [
  { id: 'products-services', label: 'Products & Services' },
  { id: 'movements', label: 'Stock Movement' },
  { id: 'deliveries', label: 'Delivery Notes' },
]

const COMPANY_OPTIONS = [
  { value: 'All', label: 'All companies' },
  { value: 'Expedia', label: 'Expedia (EXSSI)' },
  { value: 'GreatnessLab', label: 'GreatnessLab' },
  { value: 'Exigent', label: 'Exigent Corporation' },
  { value: 'KSI', label: 'Kyrios Solutions Inc.' },
]

export function InventoryLayout() {
  const { user } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()
  const [catalogEntity, setCatalogEntity] = useState('All')

  const activeView = getActiveSubRoute(location.pathname, SUBMODULES.map(s => s.id), 'products-services')
  const companySelector = activeView === 'products-services' ? (
    <select
      value={catalogEntity}
      onChange={event => setCatalogEntity(event.target.value)}
      className="h-8 max-w-48 rounded-lg border border-[#d8e2ef] bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2c3a61]/20"
      aria-label="Filter products and services by company"
    >
      {COMPANY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ) : null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Topbar title="Inventory" titleAccessory={companySelector} />
      <div className="px-6 pt-5">
        <Card>
          <CardContent className="flex items-center gap-2 py-3">
            <div className="flex w-full flex-wrap gap-1">
              {SUBMODULES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate(id)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-center text-xs font-medium transition-colors ${
                    activeView === id
                      ? 'bg-[#2c3a61] text-white'
                      : 'text-slate-600 hover:bg-[#edf4fb] hover:text-[#26324f]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet context={{ user, catalogEntity, setCatalogEntity }} />
      </div>
    </div>
  )
}
