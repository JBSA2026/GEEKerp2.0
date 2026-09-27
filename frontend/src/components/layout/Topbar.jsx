import { NotificationBell } from './NotificationBell'

export function Topbar({ title, subtitle, titleAccessory, actions }) {
  return (
    <header className="flex h-[4.5rem] shrink-0 items-center justify-between border-b border-[#dce2ea] bg-white px-5 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-[-0.02em] text-[#172033] leading-none">{title}</h1>
          {subtitle && <p className="mt-1 text-xs text-[#667085]">{subtitle}</p>}
        </div>
        {titleAccessory}
      </div>

      <div className="flex items-center gap-2">
        {actions}
        <NotificationBell />
      </div>
    </header>
  )
}
