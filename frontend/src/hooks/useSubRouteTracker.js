import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { MODULE_ROUTES } from '@/config/moduleRoutes'

/**
 * Tracks the current sub-route for each module and persists it to sessionStorage.
 * This enables returning to the last-visited sub-page when navigating back to a module.
 *
 * Should be called once at the app level (inside a Router context).
 */
export function useSubRouteTracker() {
  const location = useLocation()

  useEffect(() => {
    // Strip leading slash and split: "/purchasing/suppliers" → ["purchasing", "suppliers"]
    const segments = location.pathname.replace(/^\//, '').split('/')
    const modulePath = segments[0]
    const subRoute = segments[1]

    // Only persist if this module is tracked and the sub-route is a valid list-level route
    if (!modulePath || !subRoute) return

    const moduleConfig = MODULE_ROUTES[modulePath]
    if (!moduleConfig) return

    if (moduleConfig.validSubRoutes.includes(subRoute)) {
      sessionStorage.setItem(`subroute:${modulePath}`, subRoute)
    }
  }, [location.pathname])
}
