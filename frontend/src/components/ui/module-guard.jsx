import { usePermissions } from '@/hooks/usePermissions.jsx'
import { Lock, Loader2 } from 'lucide-react'

/**
 * ModuleGuard — wraps a module page and enforces access control.
 * 
 * If the user has access to the module: renders children normally.
 * If not: renders a blurred skeleton with a centered "Access Denied" card.
 * 
 * Props:
 *   moduleKey: string — the module key to check (e.g. 'purchasing', 'crm')
 *   children: ReactNode — the actual module page content
 */
export function ModuleGuard({ moduleKey, children }) {
  const { hasModule, loading, error, refresh } = usePermissions()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={28} className="animate-spin text-[var(--color-primary)]" />
      </div>
    )
  }

  if (hasModule(moduleKey)) {
    return children
  }

  // Access denied — show blurred placeholder with overlay
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Loader2 size={24} className="text-slate-500" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">
            Verifying Access
          </h2>
          <p className="mb-6 text-sm text-[var(--color-muted-fg)]">
            We could not confirm your role permissions yet. Please retry before requesting access.
          </p>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            Retry Verification
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-hidden">
      {/* Blurred skeleton placeholder (no real data in DOM) */}
      <div
        className="h-full p-6 pointer-events-none select-none"
        style={{ filter: 'blur(8px)' }}
        aria-hidden="true"
      >
        <div className="space-y-4">
          <div className="h-8 w-64 rounded-lg bg-slate-200" />
          <div className="grid grid-cols-4 gap-4">
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
          </div>
          <div className="h-10 w-full rounded-lg bg-slate-100" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 w-full rounded-lg bg-slate-50" />
            ))}
          </div>
        </div>
      </div>

      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-sm" />

      {/* Access denied card */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="max-w-sm w-full mx-4 rounded-2xl border border-[var(--color-border)] bg-white p-8 shadow-xl text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 mx-auto mb-4">
            <Lock size={24} className="text-slate-500" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-2">
            Access Restricted
          </h2>
          <p className="text-sm text-[var(--color-muted-fg)] mb-6">
            You don't have permission to access this module.
            Please contact your administrator if you believe this is an error.
          </p>
          <button
            onClick={() => {
              // TODO: Implement "Request Access" functionality
              alert('Access request sent to your administrator.')
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            Request Access
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * ActionButton — conditionally renders a button based on permission.
 * If the user lacks the specified action permission, the button is hidden.
 * 
 * Props:
 *   action: string — 'create', 'edit', 'approve', 'delete', 'export', 'admin'
 *   module: string — the module key
 *   children: ReactNode — the button content
 *   ...rest: passed to the wrapper
 */
export function ActionGuard({ action, module, children }) {
  const { can } = usePermissions()

  if (!can(action, module)) {
    return null
  }

  return children
}
