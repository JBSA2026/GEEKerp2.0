import { Outlet, useOutletContext } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'

export function ARLayout() {
  const { user } = useOutletContext()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar title="Accounts Receivable" subtitle="AR workbench, invoice actions, statements and reports" />
      <main className="flex-1 overflow-y-auto px-6 py-5">
        <Outlet context={{ user }} />
      </main>
    </div>
  )
}
