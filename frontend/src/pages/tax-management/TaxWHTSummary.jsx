import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet, entityParam, money, formatDate, MetricCard, SectionHeader, PeriodSelector } from './taxUtils'

export function TaxWHTSummary() {
  const { entity } = useOutletContext()

  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [periodFrom, setPeriodFrom] = useState(firstOfMonth.toISOString().slice(0, 10))
  const [periodTo, setPeriodTo] = useState(today.toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiGet(`/tax/wht-summary?from=${periodFrom}&to=${periodTo}${entityParam(entity)}`)
      setData(result)
    } catch (err) {
      notify.error(err.message || 'Failed to load WHT/EWT summary')
    } finally {
      setLoading(false)
    }
  }, [periodFrom, periodTo, entity])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      <SectionHeader title="Withholding Tax / Expanded Withholding Tax">
        <div className="flex items-center gap-3">
          <PeriodSelector
            periodFrom={periodFrom}
            periodTo={periodTo}
            onChange={({ periodFrom: pf, periodTo: pt }) => { setPeriodFrom(pf); setPeriodTo(pt) }}
          />
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </SectionHeader>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total WHT Withheld" value={money(data?.total_wht)} color="text-rose-600" />
            <MetricCard label="Total EWT Withheld" value={money(data?.total_ewt)} color="text-violet-600" />
            <MetricCard label="Creditable WHT" value={money(data?.creditable_wht)} color="text-emerald-600" />
            <MetricCard label="Transactions" value={data?.transaction_count ?? '—'} />
          </div>

          {/* Detail Table */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Payee</th>
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">ATC Code</th>
                  <th className="px-4 py-2.5 text-right font-medium text-[var(--color-muted-fg)]">Base Amount</th>
                  <th className="px-4 py-2.5 text-right font-medium text-[var(--color-muted-fg)]">Tax Withheld</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.length ? data.items.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)]/50">
                    <td className="px-4 py-2.5 text-[var(--color-text)]">{formatDate(row.date)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text)]">{row.payee}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted-fg)] font-mono text-xs">{row.atc_code}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--color-text)]">{money(row.base_amount)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-rose-600">{money(row.tax_withheld)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted-fg)]">
                      No WHT/EWT records for the selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
