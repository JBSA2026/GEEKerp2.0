import { toast } from 'sonner'

// ─── Semantic toast helpers ─────────────────────────────────────────────────
// Thin wrappers so callers don't import sonner directly and we keep one place
// to tweak icons/colors per status. The <AppToaster> component lives in
// components/ui/toast.jsx and must be mounted once near the app root.

export const notify = {
  success: (msg, opts) =>
    toast.success(msg, {
      style: { borderColor: 'var(--color-success)' },
      ...opts,
    }),
  error: (msg, opts) =>
    toast.error(msg, {
      style: { borderColor: 'var(--color-danger)' },
      ...opts,
    }),
  warning: (msg, opts) =>
    toast.warning(msg, {
      style: { borderColor: 'var(--color-warning)' },
      ...opts,
    }),
  info: (msg, opts) => toast(msg, opts),
  loading: (msg, opts) => toast.loading(msg, opts),
  dismiss: (id) => toast.dismiss(id),
  // Promise helper: notify.promise(saveFn(), { loading, success, error })
  promise: (promise, msgs) => toast.promise(promise, msgs),
}

export { toast }
