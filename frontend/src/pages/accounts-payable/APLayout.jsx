import { Outlet } from 'react-router-dom'

import { Topbar } from '@/components/layout/Topbar'

export function APLayout() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar title="Accounts Payable" />
      <main className="flex-1 overflow-y-auto px-6 py-5">
        <Outlet />
      </main>
    </div>
  )
}
