import { Outlet, useOutletContext } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'

export function PurchasingLayout() {
  const { user } = useOutletContext()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar
        title="Purchasing"
        subtitle="Purchase request, RFQ, supplier comparison, PO approval and delivery"
      />
      <div className="flex-1 overflow-y-auto">
        <Outlet context={{ user }} />
      </div>
    </div>
  )
}
