import { Navigate } from 'react-router-dom'
import { MODULE_ROUTES } from '@/config/moduleRoutes'

/**
 * Replaces <Navigate to="default" replace /> on module index routes.
 * Checks sessionStorage for a saved sub-route for this module.
 * Falls back to the provided defaultRoute if nothing is saved or if saved route is invalid.
 */
export function PersistentRedirect({ modulePath, defaultRoute }) {
  const saved = sessionStorage.getItem(`subroute:${modulePath}`)
  const moduleConfig = MODULE_ROUTES[modulePath]
  const isValid = saved && moduleConfig?.validSubRoutes?.includes(saved)
  const target = isValid ? saved : defaultRoute
  return <Navigate to={target} replace />
}
