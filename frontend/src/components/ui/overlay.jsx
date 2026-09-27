import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Drawer({ open, title, subtitle, onClose, children, footer, className = '' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className={cn('relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl', className)}>
        <div className="flex items-start justify-between gap-3 border-b border-[#d8e2ef] bg-[#e9eef8] px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-950">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-[#d8e2ef] bg-[#f6f8fc] px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export function ModalFrame({ open, title, subtitle, children, onClose, className = '' }) {
  return (
    <>
      <div
        className={cn('fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity', open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
      />
      <div className={cn(
        'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(460px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-[#d8e2ef] bg-[#edf4fb] shadow-2xl transition-all',
        open ? '-translate-x-1/2 -translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-x-1/2 -translate-y-[45%] scale-95 opacity-0',
        className,
      )}>
        <div className="flex items-center justify-between border-b border-[#d8e2ef] bg-[#e9eef8] px-6 py-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{title}</p>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#f6f8fc] hover:text-slate-950">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

export function SideDrawer({ open, title, subtitle, children, onClose, widthClass = 'w-[480px]', className = '', headerClassName = '' }) {
  return (
    <>
      <div
        className={cn('fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity', open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
      />
      <div className={cn(
        'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-[#d8e2ef] bg-[#edf4fb] shadow-2xl transition-all duration-200',
        widthClass,
        open ? '-translate-y-1/2 scale-100 opacity-100' : 'pointer-events-none -translate-y-[45%] scale-95 opacity-0',
        className,
      )}>
        <div className={cn('flex items-center justify-between border-b border-[#d8e2ef] bg-[#e3ecf8] px-6 py-5', headerClassName)}>
          <div>
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#edf4fb] hover:text-slate-950">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
