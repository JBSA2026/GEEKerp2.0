/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, createContext, useContext } from 'react'
import { getStoredUser } from '@/utils/api'

const BASE = import.meta.env.VITE_API_URL

const PermissionsContext = createContext(null)
const PERMISSION_VERIFY_ATTEMPTS = 4
const PERMISSION_VERIFY_RETRY_MS = 1200

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function storedSuperAdminFallback() {
  const user = getStoredUser()
  const roles = Array.isArray(user?.roles) ? user.roles : []
  if (!roles.includes('SUPER_ADMIN')) return null
  return {
    employee_id: user.employee_id,
    email: user.email,
    modules: [],
    actions: [],
    roles,
    is_super_admin: true,
    source: 'token-fallback',
  }
}

function mergeStoredRoleFallback(data) {
  const user = getStoredUser()
  const storedRoles = Array.isArray(user?.roles) ? user.roles : []
  const roles = Array.from(new Set([...(data?.roles || []), ...storedRoles]))
  return {
    ...data,
    roles,
    is_super_admin: Boolean(data?.is_super_admin || roles.includes('SUPER_ADMIN')),
  }
}

/**
 * Fetch the current user's effective permissions from the backend.
 * Returns: { modules: [], actions: [], roles: [], is_super_admin: bool }
 */
async function fetchPermissions() {
  const token = localStorage.getItem('access_token')
  if (!token) return null
  let lastError = null

  for (let attempt = 1; attempt <= PERMISSION_VERIFY_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(`${BASE}/auth/permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        return mergeStoredRoleFallback(await res.json())
      }
      lastError = new Error(`Permission verification failed (${res.status})`)
    } catch (err) {
      lastError = err
    }

    if (attempt < PERMISSION_VERIFY_ATTEMPTS) {
      await wait(PERMISSION_VERIFY_RETRY_MS * attempt)
    }
  }

  const fallback = storedSuperAdminFallback()
  if (fallback) return fallback
  throw lastError || new Error('Unable to verify permissions')
}

/**
 * Provider component — wrap your app with this so all children
 * can use usePermissions().
 */
export function PermissionsProvider({ children }) {
  const [perms, setPerms] = useState(() => storedSuperAdminFallback())
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('access_token')))
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('access_token')
    if (!token) {
      return
    }
    fetchPermissions().then(data => {
      if (cancelled) return
      setPerms(data)
      setError(null)
      setLoading(false)
    }).catch(err => {
      if (cancelled) return
      const fallback = storedSuperAdminFallback()
      setPerms(fallback)
      setError(fallback ? null : err)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  // Refresh permissions when token changes (login/logout)
  function refresh() {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setPerms(null)
      setError(null)
      setLoading(false)
      return Promise.resolve(null)
    }
    setLoading(true)
    setError(null)
    return fetchPermissions().then(data => {
      setPerms(data)
      setError(null)
      setLoading(false)
      return data
    }).catch(err => {
      const fallback = storedSuperAdminFallback()
      setPerms(fallback)
      setError(fallback ? null : err)
      setLoading(false)
      return fallback
    })
  }

  return (
    <PermissionsContext.Provider value={{ perms, loading, error, refresh }}>
      {children}
    </PermissionsContext.Provider>
  )
}

/**
 * Hook to access the current user's permissions.
 * 
 * Returns:
 *   perms: { modules: {key: level}, roles, is_super_admin } | null
 *   loading: boolean
 *   can(action, module): boolean
 *   hasModule(module): boolean
 *   getLevel(module): string
 *   refresh(): void
 */
export function usePermissions() {
  const ctx = useContext(PermissionsContext)
  if (!ctx) {
    return {
      perms: null,
      loading: false,
      error: null,
      can: () => true,
      hasModule: () => true,
      getLevel: () => 'full',
      refresh: () => {},
    }
  }

  const { perms, loading, error, refresh } = ctx
  const storedFallback = storedSuperAdminFallback()
  const effectivePerms = perms || storedFallback

  // Permission hierarchy: what actions each level allows
  const LEVEL_ACTIONS = {
    full: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'admin'],
    manage: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    create_edit: ['view', 'create', 'edit'],
    approve: ['view', 'approve'],
    view: ['view'],
    limited: ['view'],
  }

  function can(action, module) {
    if (!effectivePerms) return false
    if (effectivePerms.is_super_admin) return true
    const modules = effectivePerms.modules || {}
    // Support both old array format and new dict format
    if (Array.isArray(modules)) return modules.includes(module)
    const level = modules[module]
    if (!level) return false
    const allowed = LEVEL_ACTIONS[level] || []
    return allowed.includes(action)
  }

  function hasModule(module) {
    if (!effectivePerms) return false
    if (effectivePerms.is_super_admin) return true
    const modules = effectivePerms.modules || {}
    if (Array.isArray(modules)) return modules.includes(module)
    return module in modules
  }

  function getLevel(module) {
    if (!effectivePerms) return 'none'
    if (effectivePerms.is_super_admin) return 'full'
    const modules = effectivePerms.modules || {}
    if (Array.isArray(modules)) return modules.includes(module) ? 'full' : 'none'
    return modules[module] || 'none'
  }

  return { perms: effectivePerms, loading, error, can, hasModule, getLevel, refresh }
}
