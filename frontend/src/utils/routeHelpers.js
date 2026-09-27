// ─── Route utility helpers for nested routing ───────────────────────────────
// Used by module layouts to derive active view from URL and build cross-module
// navigation URLs with query parameters.

/**
 * Derive the active sub-route from a pathname.
 *
 * Extracts the second path segment (index 1 after splitting and filtering
 * empty strings) and checks it against a list of valid IDs. Returns the
 * matched segment or the provided default.
 *
 * Edge cases handled:
 * - Trailing slashes: `/purchasing/` → empty segment → returns defaultId
 * - Deep nested paths: `/purchasing/requests/123` → extracts `requests` → valid
 * - Invalid segments: `/purchasing/invalid` → not in validIds → returns defaultId
 *
 * @param {string} pathname - The current location pathname
 * @param {string[]} validIds - Array of valid sub-route identifiers
 * @param {string} defaultId - Fallback sub-route when segment is missing or invalid
 * @returns {string} The resolved active sub-route identifier
 */
export function getActiveSubRoute(pathname, validIds, defaultId) {
  const segments = pathname.split('/').filter(Boolean)
  const segment = segments[1] || defaultId
  return validIds.includes(segment) ? segment : defaultId
}

/**
 * Build a cross-module URL with an optional query string.
 *
 * Constructs a URL path by joining the module base path and sub-route,
 * then appends any provided key-value pairs as query parameters.
 *
 * @param {string} modulePath - The module base path (e.g., '/purchasing')
 * @param {string} subRoute - The target sub-route (e.g., 'requests')
 * @param {Record<string, string>} [params] - Optional query parameters
 * @returns {string} The constructed URL string
 *
 * @example
 * buildModuleUrl('/purchasing', 'requests', { highlight: 'PR-2025-0042' })
 * // Returns: '/purchasing/requests?highlight=PR-2025-0042'
 */
export function buildModuleUrl(modulePath, subRoute, params) {
  // Normalize: strip trailing slash from modulePath, strip leading slash from subRoute
  const base = modulePath.replace(/\/+$/, '')
  const sub = subRoute.replace(/^\/+/, '')
  const path = `${base}/${sub}`

  if (!params || Object.keys(params).length === 0) {
    return path
  }

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') {
      searchParams.set(key, value)
    }
  }

  const qs = searchParams.toString()
  return qs ? `${path}?${qs}` : path
}
