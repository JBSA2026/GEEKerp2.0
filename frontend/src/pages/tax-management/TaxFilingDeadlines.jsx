import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { notify } from '@/utils/toast'
import { apiGet, entityParam, formatDate, SectionHeader } from './taxUtils'

function DeadlineStatusBadge({ status }) {
  const s = (status || '').toLowerCase()
  if (s === 'filed') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
      <CheckCircle2 size={11} /> Filed
    </span>
  )
  if (s === 'overdue') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
      <AlertTriangle size={11} /> Overdue
    </span>
  )
  if (s === 'upcoming') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
      <Clock size={11} /> Upcoming
    </span>
  )
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {status || '—'}
    </span>
  )
}

export function TaxFilingDeadlines() {
  const { entity } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [deadlines, setDeadlines] = useState([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiGet(`/tax/filing-deadlines?${entityParam(entity).replace(/^&/, '')}`)
      setDeadlines(result?.deadlines || result || [])
    } catch (err) {
      notify.error(err.message || 'Failed to load filing deadlines')
    } finally {
      setLoading(false)
    }
  }, [entity])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      <SectionHeader title="Filing Deadlines">
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span className="ml-1.5">Refresh</span>
        </Button>
      </SectionHeader>

      {loading && !deadlines.length ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Form</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Description</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Period</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Due Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Entity</th>
              </tr>
            </thead>
            <tbody>
              {deadlines.length ? deadlines.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    'border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)]/50',
                    row.status === 'overdue' && 'bg-rose-50/40'
                  )}
                >
                  <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{row.form_type}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{row.description}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{row.period}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{formatDate(row.due_date)}</td>
                  <td className="px-4 py-2.5"><DeadlineStatusBadge status={row.status} /></td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{row.entity || '—'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-muted-fg)]">
                    No filing deadlines found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
