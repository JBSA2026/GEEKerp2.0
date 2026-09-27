import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Clock, LogOut } from 'lucide-react'
import {
  onSessionExpired,
  onSessionWarning,
  logout,
  startSessionTimers,
  clearSessionTimers,
} from '@/utils/api'

/**
 * SessionGuard — invisible component that:
 * 1. Starts session expiry timers on mount (for page refreshes with existing token)
 * 2. Listens for session-warning events → shows a toast warning
 * 3. Listens for session-expired events → forces logout + redirect to /login
 *
 * Mount this once inside the router (needs useNavigate).
 */
export function SessionGuard({ onSessionEnd }) {
  const navigate = useNavigate()
  const [warningShown, setWarningShown] = useState(false)

  const handleExpired = useCallback(() => {
    clearSessionTimers()
    // Dismiss any warning toast
    toast.dismiss('session-warning')
    // Show expired notification
    toast.error('Session expired', {
      description: 'Your session has timed out. Please sign in again.',
      duration: 5000,
      icon: <LogOut size={16} />,
    })
    // Notify parent (clears user state)
    onSessionEnd?.()
    // Redirect to login
    navigate('/login', { replace: true })
  }, [navigate, onSessionEnd])

  const handleWarning = useCallback((e) => {
    const minutesLeft = e.detail?.minutesLeft || 5
    if (warningShown) return
    setWarningShown(true)

    toast.warning('Session expiring soon', {
      id: 'session-warning',
      description: `Your session will expire in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}. Save your work.`,
      duration: minutesLeft * 60 * 1000, // Keep visible until expiry
      icon: <Clock size={16} />,
    })
  }, [warningShown])

  useEffect(() => {
    // Start timers for existing token (covers page refresh)
    startSessionTimers()

    const removeExpired = onSessionExpired(handleExpired)
    const removeWarning = onSessionWarning(handleWarning)

    return () => {
      removeExpired()
      removeWarning()
      clearSessionTimers()
    }
  }, [handleExpired, handleWarning])

  // Reset warning state when a new session starts (user logs in again)
  useEffect(() => {
    setWarningShown(false)
  }, [onSessionEnd])

  return null // No visible UI — uses toasts
}
