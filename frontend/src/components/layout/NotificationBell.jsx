import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle2, Truck, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_URL

export function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const lastCountRef = useRef(0)
  const pollRef = useRef(null)

  // ── Full notification fetch (only on open or count change) ───────────────
  const loadFull = useCallback(async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('access_token')
      if (!token) return
      const res = await fetch(`${BASE}/notifications/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.items || [])
        setCount(data.count || 0)
        lastCountRef.current = data.count || 0
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  // ── Lightweight count check (cheap DB query) ─────────────────────────────
  const checkCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token')
      if (!token) return
      const res = await fetch(`${BASE}/notifications/count`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const newCount = data.count || 0
        setCount(newCount)

        // If count changed and we already had data loaded, refresh full list
        if (newCount !== lastCountRef.current && lastCountRef.current !== -1) {
          lastCountRef.current = newCount
          // Only auto-fetch if dropdown is open
          if (open) {
            loadFull()
          }
        } else {
          lastCountRef.current = newCount
        }
      }
    } catch { /* silent */ }
  }, [open, loadFull])

  // Initial count check on mount
  useEffect(() => {
    lastCountRef.current = -1 // sentinel: don't trigger refresh on first load
    const timer = setTimeout(() => { void checkCount() }, 0)
    return () => clearTimeout(timer)
  }, [checkCount])

  // Poll count every 60s (lightweight — only counts, no full data)
  // Pauses when tab is hidden
  useEffect(() => {
    function startPolling() {
      stopPolling()
      pollRef.current = setInterval(checkCount, 60000)
    }
    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    function handleVisibility() {
      if (document.hidden) {
        stopPolling()
      } else {
        // Check immediately when tab becomes visible again
        setTimeout(() => { void checkCount() }, 0)
        startPolling()
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [checkCount])

  // Fetch full data when dropdown opens
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => { void loadFull() }, 0)
    return () => clearTimeout(timer)
  }, [open, loadFull])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function handleItemClick(item) {
    setOpen(false)
    if (item.link) {
      // Pass the notification item ID as highlight param so the target page
      // can scroll to and highlight the specific item
      const separator = item.link.includes('?') ? '&' : '?'
      navigate(`${item.link}${separator}highlight=${encodeURIComponent(item.id)}`)
    }
  }

  const priorityColor = {
    Urgent: 'text-red-600',
    High: 'text-amber-600',
    Normal: 'text-slate-600',
    Low: 'text-slate-400',
  }

  const typeIcon = {
    approval: <CheckCircle2 size={14} className="text-blue-500 shrink-0" />,
    delivery: <Truck size={14} className="text-emerald-500 shrink-0" />,
    tax_reminder: <AlertCircle size={14} className="text-amber-500 shrink-0" />,
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-[#edf4fb] hover:text-[#26324f]"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[100] mt-2 w-[380px] overflow-hidden rounded-xl border border-[#d8e2ef] bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#e3ecf8] px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            <span className="rounded-full bg-[#edf4fb] px-2 py-0.5 text-[11px] font-medium text-[#26324f]">{count}</span>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-400">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-400">
                <Bell size={24} className="text-slate-300" />
                No notifications
              </div>
            ) : (
              <div className="divide-y divide-[#f0f4fa]">
                {notifications.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f8fafd]"
                  >
                    <div className="mt-0.5">{typeIcon[item.type] || <AlertCircle size={14} className="text-slate-400" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-800 truncate">{item.title}</p>
                        {item.priority && item.priority !== 'Normal' && (
                          <span className={cn('text-[10px] font-medium', priorityColor[item.priority])}>{item.priority}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 truncate">{item.description}</p>
                      {item.amount && <p className="mt-0.5 text-[11px] font-medium text-slate-700">₱ {Number(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>}
                      <div className="mt-1 flex items-center gap-2">
                        {item.entity && <span className="text-[10px] text-slate-400">{item.entity}</span>}
                        {item.timestamp && <span className="text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-[#e3ecf8] px-4 py-2.5">
              <button
                type="button"
                onClick={() => { setOpen(false); navigate('/workflow') }}
                className="w-full text-center text-[11px] font-medium text-[var(--color-primary)] hover:underline"
              >
                View all in Workflow Approval
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
