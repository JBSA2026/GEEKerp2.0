import { AlertTriangle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ConfirmDialog({
  open,
  title = 'Confirm action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={loading ? undefined : onCancel} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-lg border border-[#d8e2ef] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#d8e2ef] bg-[#f6f8fc] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className={cn('mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg', danger ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600')}>
              <AlertTriangle size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">{title}</p>
              {message && <p className="mt-1 text-xs leading-5 text-slate-600">{message}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-950 disabled:opacity-50"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={danger ? 'bg-rose-600 text-white hover:bg-rose-700' : ''}
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
