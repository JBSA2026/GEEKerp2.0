import { Toaster as SonnerToaster } from 'sonner'

// ─── AppToaster ─────────────────────────────────────────────────────────────
// Themed wrapper around sonner's <Toaster>. Mount once near the app root.
// Colors/radius/typography are pulled from the global design tokens defined
// in index.css (@theme) so toasts match the rest of the UI.
//
// Semantic helpers (notify.success/error/...) live in '@/utils/toast'.
export function AppToaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors={false}
      toastOptions={{
        style: {
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: '14px',
          color: 'var(--color-text)',
          fontFamily: "'Poppins', system-ui, sans-serif",
          fontSize: '13px',
          boxShadow: '0 18px 50px rgba(15,23,42,0.12)',
        },
        classNames: {
          title: 'font-medium',
          description: 'text-[12px] text-slate-500',
        },
      }}
    />
  )
}
