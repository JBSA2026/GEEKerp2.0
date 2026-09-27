import { AlertCircle, Loader2, Receipt, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EmptyState({ title, children, icon: Icon = Receipt, className = '' }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-14 text-center text-slate-500', className)}>
      <Icon size={28} className="mb-2 text-slate-400" />
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="mt-1 max-w-md text-xs">{children}</p>}
    </div>
  )
}

export function Loading({ label = 'Loading...', className = '' }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-16 text-sm text-slate-600', className)}>
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  )
}

export function ErrorBox({ message, onDismiss, className = '' }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700', className)}>
      <AlertCircle size={16} className="shrink-0" /> {message}
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="ml-auto">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
