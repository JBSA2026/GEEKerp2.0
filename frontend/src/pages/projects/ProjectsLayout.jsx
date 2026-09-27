import { Outlet, useOutletContext } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'

export function ProjectsLayout() {
  const { user } = useOutletContext()
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar title="Projects" subtitle="Implementation projects, milestones, materials and delivery monitoring" />
      <Outlet context={{ user }} />
    </div>
  )
}
