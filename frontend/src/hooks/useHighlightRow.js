import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Shared hook for row highlighting via URL search params.
 *
 * Reads `?highlight=<id>` and/or `?ref=<refNumber>` from the URL.
 * Scrolls the matching row into view and auto-clears after 4 seconds.
 *
 * @param {boolean} [ready=true] - Pass `false` while data is still loading
 *   to defer scroll until rows are rendered.
 * @returns {{ highlightId: string|null, highlightRef: string|null, rowRef: import('react').RefObject }}
 */
export function useHighlightRow(ready = true) {
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const highlightRef = searchParams.get('ref')
  const rowRef = useRef(null)

  useEffect(() => {
    if (!ready) return
    if (!(highlightId || highlightRef)) return
    if (!rowRef.current) return

    rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Clear highlight params (only) after 4 seconds
    const timer = setTimeout(() => {
      setSearchParams(prev => {
        prev.delete('highlight')
        prev.delete('ref')
        return prev
      }, { replace: true })
    }, 4000)

    return () => clearTimeout(timer)
  }, [ready, highlightId, highlightRef, setSearchParams])

  return { highlightId, highlightRef, rowRef }
}

/** CSS class string to apply to the highlighted row */
export const highlightRowCls = 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/5 rounded-lg'
