import { useEffect, useState } from 'react'
import { Outlet, useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import { getActiveSubRoute } from '@/utils/routeHelpers'
import { cn } from '@/lib/utils'
import { ChevronDown, Maximize2, Minimize2 } from 'lucide-react'
import { ENTITIES, REPORT_TABS, DATE_PRESETS, getPresetRange } from './reportsUtils'

export function ReportsLayout() {
  const { user } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()

  const [entity, setEntity] = useState('Expedia')
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false)
  const [preset, setPreset] = useState('month')
  const [customRange, setCustomRange] = useState(getPresetRange('month'))
  const [dateError, setDateError] = useState('')
  const [presentationMode, setPresentationMode] = useState(false)

  const activeTab = getActiveSubRoute(location.pathname, REPORT_TABS.map(t => t.id), 'executive-overview')
  const currentEntity = ENTITIES.find(e => e.value === entity) || ENTITIES[0]
  const range = preset === 'custom' ? customRange : getPresetRange(preset)

  useEffect(() => {
    if (!presentationMode) return
    const onKey = e => { if (e.key === 'Escape') setPresentationMode(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presentationMode])

  function handleCustomChange(field, value) {
    const next = { ...customRange, [field]: value }
    if (next.from && next.to && next.from > next.to) { setDateError('Start must be before end.'); return }
    setDateError('')
    setCustomRange(next)
  }

  const outletCtx = { user, entity, dateFrom: range.from, dateTo: range.to, presentationMode }

  // Presentation mode: full-screen, no sidebar/topbar
  if (presentationMode) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-white overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-8 py-3">
          <div className="flex items-center gap-3">
            <img src={currentEntity.logo} alt="" className="w-7 h-7 rounded object-contain" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">{REPORT_TABS.find(t => t.id === activeTab)?.label}</h1>
              <p className="text-xs text-slate-500">{currentEntity.label} &middot; {range.from} to {range.to}</p>
            </div>
          </div>
          <button onClick={() => setPresentationMode(false)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-slate-50">
            <Minimize2 size={14} /> Exit
          </button>
        </div>
        <div className="flex-1 p-8">
          <Outlet context={outletCtx} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Compact header bar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-slate-900">Report Center</h1>

          {/* Entity chip */}
          <div className="relative">
            <button
              onClick={() => setEntityDropdownOpen(o => !o)}
              className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#26324f]/30"
            >
              <img src={currentEntity.logo} alt="" className="w-4 h-4 rounded object-contain" />
              {currentEntity.label}
              <ChevronDown size={11} className={cn('text-slate-400 transition-transform', entityDropdownOpen && 'rotate-180')} />
            </button>
            {entityDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setEntityDropdownOpen(false)} />
                <ul className="absolute left-0 top-full mt-1 w-44 rounded-lg border bg-white py-1 shadow-lg z-50">
                  {ENTITIES.map(ent => (
                    <li key={ent.value}>
                      <button onClick={() => { setEntity(ent.value); setEntityDropdownOpen(false) }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                        <img src={ent.logo} alt="" className="w-4 h-4 rounded object-contain" />
                        {ent.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Date presets */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {DATE_PRESETS.map(p => (
              <button key={p.id} onClick={() => { setPreset(p.id); setDateError('') }}
                className={cn('px-2 py-1 text-[11px] font-medium rounded-md transition-colors', p.id === preset ? 'bg-[#26324f] text-white' : 'text-slate-500 hover:text-slate-800')}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-1">
              <input type="date" value={customRange.from} onChange={e => handleCustomChange('from', e.target.value)} className="rounded border px-1.5 py-0.5 text-[11px]" />
              <span className="text-[10px] text-slate-400">→</span>
              <input type="date" value={customRange.to} onChange={e => handleCustomChange('to', e.target.value)} className="rounded border px-1.5 py-0.5 text-[11px]" />
            </div>
          )}
          {dateError && <span className="text-[10px] text-red-500 ml-1">{dateError}</span>}
        </div>

        <button onClick={() => setPresentationMode(true)} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50" title="Presentation Mode">
          <Maximize2 size={12} /> Present
        </button>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-0.5 -mb-px overflow-x-auto scrollbar-none">
          {REPORT_TABS.map(tab => (
            <button key={tab.id} onClick={() => navigate(tab.id)}
              className={cn(
                'px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                tab.id === activeTab
                  ? 'border-[#26324f] text-[#26324f]'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              )}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] p-5">
        <Outlet context={outletCtx} />
      </div>
    </div>
  )
}
