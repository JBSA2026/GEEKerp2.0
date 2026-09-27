import { useState, useRef, useEffect, useCallback } from 'react'
import { ZoomIn, ZoomOut, Printer, Maximize, Minimize, Hand, Mouse } from 'lucide-react'
import { cn } from '@/lib/utils'

const ZOOM_STEP = 0.1
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const DEFAULT_ZOOM = 1.0

/**
 * Wraps BIR form content with zoom in/out/reset/print/fullscreen/pan controls.
 *
 * Features:
 * - Zoom in/out with Ctrl+scroll or toolbar buttons
 * - Fullscreen mode via browser Fullscreen API
 * - Pan/drag mode to scroll around zoomed form like a map
 * - Print at 1:1 scale for long bond paper
 *
 * Usage:
 *   <BIRFormZoomWrapper>
 *     <div className="mx-auto bg-white shadow-lg" style={{ width: '794px', ... }}>
 *       ...form content...
 *     </div>
 *   </BIRFormZoomWrapper>
 */
export function BIRFormZoomWrapper({ children, className }) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPanMode, setIsPanMode] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const containerRef = useRef(null)
  const wrapperRef = useRef(null)
  const formRef = useRef(null)
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  const zoomIn = () => setZoom(z => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 10) / 10))
  const zoomOut = () => setZoom(z => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 10) / 10))
  const resetZoom = () => setZoom(DEFAULT_ZOOM)

  const handlePrint = () => {
    window.print()
  }

  // --- Fullscreen ---
  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return

    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {
        // Fallback: some browsers may not support this
      })
    } else {
      document.exitFullscreen()
    }
  }, [])

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    }
  }, [])

  // Listen for fullscreen changes (Esc key also triggers this)
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  // --- Pan / Drag ---
  const togglePanMode = () => setIsPanMode(prev => !prev)

  const handlePointerDown = useCallback((e) => {
    if (!isPanMode) return
    const el = containerRef.current
    if (!el) return

    setIsPanning(true)
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    }
    el.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [isPanMode])

  const handlePointerMove = useCallback((e) => {
    if (!isPanning || !isPanMode) return
    const el = containerRef.current
    if (!el) return

    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    el.scrollLeft = panStart.current.scrollLeft - dx
    el.scrollTop = panStart.current.scrollTop - dy
  }, [isPanning, isPanMode])

  const handlePointerUp = useCallback((e) => {
    if (!isPanning) return
    setIsPanning(false)
    const el = containerRef.current
    if (el) el.releasePointerCapture(e.pointerId)
  }, [isPanning])

  // Ctrl+scroll to zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault()
        if (e.deltaY < 0) zoomIn()
        else zoomOut()
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  const pct = Math.round(zoom * 100)

  return (
    <>
      {/* Print styles — injected once per mount */}
      <style>{`
        @media print {
          /* Hide everything except the form */
          body * {
            visibility: hidden !important;
          }
          [data-bir-form-print],
          [data-bir-form-print] * {
            visibility: visible !important;
          }
          [data-bir-form-print] {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 215.9mm !important;
            height: 330.2mm !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
          }
          /* Force long bond paper size with no margins */
          @page {
            size: 215.9mm 330.2mm;
            margin: 0;
          }
          /* Reset zoom wrapper */
          .bir-zoom-toolbar,
          .bir-zoom-container {
            display: contents !important;
          }
        }
      `}</style>

      <div
        ref={wrapperRef}
        className={cn('flex-1 flex flex-col overflow-hidden', isFullscreen && 'bg-gray-200', className)}
      >
        {/* Zoom + Print + Fullscreen + Pan controls toolbar */}
        <div className="bir-zoom-toolbar flex items-center justify-end gap-1.5 px-4 py-2 bg-gray-200 border-b border-gray-300 print:hidden">
          {/* Pan mode toggle */}
          <button
            onClick={togglePanMode}
            className={cn(
              'p-1.5 rounded-md border transition-colors',
              isPanMode
                ? 'bg-blue-100 border-blue-400 text-blue-700 hover:bg-blue-200'
                : 'bg-white border-gray-300 hover:bg-gray-50'
            )}
            title={isPanMode ? 'Switch to normal scroll' : 'Enable pan/drag mode'}
          >
            {isPanMode ? <Hand size={14} /> : <Mouse size={14} />}
          </button>

          <div className="w-px h-5 bg-gray-300" />

          {/* Print */}
          <button
            onClick={handlePrint}
            className="p-1.5 rounded-md bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
            title="Print form (1:1 scale)"
          >
            <Printer size={14} />
          </button>

          <div className="w-px h-5 bg-gray-300" />

          {/* Zoom controls */}
          <button
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="p-1.5 rounded-md bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={resetZoom}
            className="px-2 py-1 rounded-md bg-white border border-gray-300 hover:bg-gray-50 text-xs font-medium min-w-[48px] text-center transition-colors"
            title="Reset zoom"
          >
            {pct}%
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="p-1.5 rounded-md bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>

          <div className="w-px h-5 bg-gray-300" />

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-md bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>

          {/* Exit fullscreen button — only visible in fullscreen */}
          {isFullscreen && (
            <button
              onClick={exitFullscreen}
              className="ml-2 px-2.5 py-1 rounded-md bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
              title="Exit fullscreen"
            >
              Exit
            </button>
          )}
        </div>

        {/* Scrollable form area */}
        <div
          ref={containerRef}
          className={cn(
            'bir-zoom-container flex-1 overflow-auto bg-gray-200 p-6',
            isPanMode && 'cursor-grab select-none',
            isPanMode && isPanning && 'cursor-grabbing'
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease',
            }}
          >
            <div ref={formRef} data-bir-form-print>
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
