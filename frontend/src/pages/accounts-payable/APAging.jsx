import { useCallback, useEffect, useState } from 'react'
import { Receipt } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorBox, Loading } from '@/components/ui/feedback'
import { AgingChart } from '@/components/aprar'
import { money } from '@/components/aprar/format'
import { fetchApAging } from '@/utils/api'
import { ApTableHeader, formatDate } from './apUtils'

const AGING_ROW_GRID = 'grid-cols-[20%_26%_16%_20%_18%]'

export function APAging() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchApAging({}))
    } catch (err) {
      setError(err.message || 'Unable to load aging report')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  if (loading) return <Loading label="Loading aging report..." />
  if (error) return <ErrorBox message={error} onDismiss={null} />
  if (!data) return null

  const buckets = Object.entries(data.bucket_totals || {}).map(([bucket, total]) => ({ bucket, total }))
  const rows = data.rows || []

  return (
    <div className="space-y-5">
      <AgingChart buckets={buckets} title="Payables Aging" />
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Aging Detail</CardTitle>
            <span className="text-sm text-slate-500">Total Outstanding: <span className="font-semibold text-[#26324f]">{money(data.total_outstanding)}</span></span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState title="No outstanding bills to age" icon={Receipt} />
          ) : (
            <div className="max-h-[calc(100vh-360px)] overflow-auto">
              <ApTableHeader grid={AGING_ROW_GRID}>
                <span>Bill</span>
                <span>Supplier</span>
                <span>Due Date</span>
                <span>Bucket</span>
                <span className="text-right">Balance</span>
              </ApTableHeader>
              <div className="divide-y divide-[#e3ecf8]">
                {rows.map(row => (
                  <div key={row.bill_id} className={`grid ${AGING_ROW_GRID} items-center px-5 py-3 text-sm`}>
                    <span className="break-all font-mono text-xs font-semibold text-[#26324f]">{row.bill_number}</span>
                    <span className="truncate text-slate-600">{row.supplier_name || '-'}</span>
                    <span className="text-slate-600">{formatDate(row.due_date)}</span>
                    <span><Badge variant="muted">{row.aging_bucket}</Badge></span>
                    <span className="text-right font-semibold text-slate-800">{money(row.outstanding_balance)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
