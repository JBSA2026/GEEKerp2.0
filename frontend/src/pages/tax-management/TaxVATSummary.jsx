import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet, entityParam, money, MetricCard, SectionHeader, PeriodSelector } from './taxUtils'

export function TaxVATSummary() {
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
      const result = await apiGet(`/tax/vat-summary?from=${periodFrom}&to=${periodTo}${entityParam(entity)}`)
      setData(result)
    } catch (err) {
      notify.error(err.message || 'Failed to load VAT summary')
    } finally {
      setLoading(false)
    }
  }, [periodFrom, periodTo, entity])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      <SectionHeader title="VAT Summary">
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
            <MetricCard label="Output VAT (Sales)" value={money(data?.output_vat)} color="text-emerald-600" />
            <MetricCard label="Input VAT (Purchases)" value={money(data?.input_vat)} color="text-blue-600" />
            <MetricCard label="Net VAT Payable" value={money(data?.net_vat)} color={data?.net_vat < 0 ? 'text-amber-600' : 'text-rose-600'} />
            <MetricCard label="Transactions" value={data?.transaction_count ?? '—'} />
          </div>

          {/* Detail Table */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Period</th>
                  <th className="px-4 py-2.5 text-right font-medium text-[var(--color-muted-fg)]">Output VAT</th>
                  <th className="px-4 py-2.5 text-right font-medium text-[var(--color-muted-fg)]">Input VAT</th>
                  <th className="px-4 py-2.5 text-right font-medium text-[var(--color-muted-fg)]">Net Payable</th>
                </tr>
              </thead>
              <tbody>
                {data?.breakdown?.length ? data.breakdown.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)]/50">
                    <td className="px-4 py-2.5 text-[var(--color-text)]">{row.period}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600">{money(row.output_vat)}</td>
                    <td className="px-4 py-2.5 text-right text-blue-600">{money(row.input_vat)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-[var(--color-text)]">{money(row.net_vat)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[var(--color-muted-fg)]">
                      No VAT data for the selected period.
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
