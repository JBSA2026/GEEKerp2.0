import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppLayout({ onLogout, user }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f8fa]">
      <Sidebar onLogout={onLogout} user={user} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Outlet context={{ onLogout, user }} />
      </div>
    </div>
  )
}
