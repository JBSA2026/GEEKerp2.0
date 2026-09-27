// Shared presentational components for the Accounts Receivable (AR_Dashboard)
// and Accounts Payable (AP_Dashboard) modules.
//
// Both AR and AP dashboard modules import the SAME `SummaryMetricCard` and
// `AgingChart` from this file, and the SAME `money()` formatter from
// `./format`, so the two dashboards render their summary-metric cards and
// aging charts with identical shared GEEK-ERP components and layout
// (Req 15.13, 16.10).
//
// These build on the shared UI primitives under `components/ui` (Card) to stay
// cohesive with the rest of the GEEK-ERP system.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AGING_BUCKETS, money } from './format'

/**
 * A single headline summary-metric card (e.g. Outstanding Receivables).
 * `value` is rendered as-is, so the caller decides whether to pass a money()
 * string or a whole-number count.
 */
export function SummaryMetricCard({ label, value, hint, icon: Icon }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
            <p className="mt-2 break-words text-2xl font-bold text-[#26324f]">{value}</p>
            {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
          </div>
          {Icon && (
            <div className="shrink-0 rounded-lg bg-[#edf4fb] p-2 text-[#2c3a61]">
              <Icon size={18} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Horizontal-bar aging analysis chart. Renders one row for each of the five
 * Aging_Bucket categories, each showing its total outstanding balance and
 * displaying ₱0.00 for any bucket with no records (Req 15.5, 16.5).
 *
 * `buckets` is an array of `{ bucket, total }`. Missing buckets are filled in
 * with a 0.00 total so all five always appear, in canonical order.
 */
export function AgingChart({ buckets = [], title = 'Aging Analysis', compact = false }) {
  const totalsByBucket = new Map(buckets.map(b => [b.bucket, Number(b.total || 0)]))
  const rows = AGING_BUCKETS.map(bucket => ({ bucket, total: totalsByBucket.get(bucket) || 0 }))
  const max = Math.max(1, ...rows.map(r => r.total))

  return (
    <Card>
      <CardHeader className={compact ? 'px-3 pt-3 pb-2' : undefined}>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className={compact ? 'space-y-2 px-3 pb-3' : 'space-y-3'}>
        {rows.map(row => {
          const pct = Math.round((row.total / max) * 100)
          return (
            <div key={row.bucket}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">{row.bucket}</span>
                <span className="font-semibold text-[#26324f]">{money(row.total)}</span>
              </div>
              <div className={`${compact ? 'mt-0.5 h-1.5' : 'mt-1 h-2'} w-full overflow-hidden rounded-full bg-[#edf4fb]`}>
                <div className="h-full rounded-full bg-[#2c3a61] transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
