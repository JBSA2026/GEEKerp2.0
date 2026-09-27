import { useOutletContext, useNavigate } from 'react-router-dom'
import { FileText, Download } from 'lucide-react'
import {
  useReportData, BigMetric, Panel, VerticalBarChart, LoadingState, ErrorState,
  formatCurrency, formatCompact, exportToCsv, exportToPdf,
} from './reportsUtils'

const BUCKET_COLORS = ['#5d8796', '#91a4cf', '#f59e0b', '#ef4444', '#9f4d61']

export function ArApHealth() {
  const { entity, dateFrom, dateTo } = useOutletContext()
  const navigate = useNavigate()
  const { data, loading, error, refresh } = useReportData('/reports/ar-ap-health', entity, dateFrom, dateTo)

  if (loading && !data) return <LoadingState />
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <LoadingState />

  const arBars = data.ar_aging.map((b, i) => ({ label: b.bucket.replace(' Days', 'D'), value: b.total, color: BUCKET_COLORS[i] }))
  const apBars = data.ap_aging.map((b, i) => ({ label: b.bucket.replace(' Days', 'D'), value: b.total, color: BUCKET_COLORS[i] }))

  function handleCsv() {
    const rows = [...data.ar_aging.map(b => ({ type: 'Accounts Receivable', bucket: b.bucket, total: b.total })), ...data.ap_aging.map(b => ({ type: 'Accounts Payable', bucket: b.bucket, total: b.total }))]
    exportToCsv(`ar_ap_health_${entity}.csv`, rows, [{ key: 'type', label: 'CATEGORY' }, { key: 'bucket', label: 'AGING BUCKET' }, { key: 'total', label: 'OUTSTANDING AMOUNT' }])
  }
  function handlePdf() {
    exportToPdf({ title: 'AR/AP Health', entity, dateFrom, dateTo, kpis: [
      { label: 'AR Outstanding', value: formatCurrency(data.total_ar_outstanding) },
      { label: 'AP Outstanding', value: formatCurrency(data.total_ap_outstanding) },
      { label: 'Net Exposure', value: formatCurrency(data.net_exposure) },
    ] })
  }

  return (
    <div className="flex flex-col gap-4 ">
      <div className="flex justify-end gap-2">
        <button onClick={handlePdf} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><FileText size={11} /> PDF</button>
        <button onClick={handleCsv} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><Download size={11} /> CSV</button>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BigMetric label="AR Outstanding" value={formatCompact(data.total_ar_outstanding)} tone="border-emerald-100 bg-emerald-50" />
        <BigMetric label="AP Outstanding" value={formatCompact(data.total_ap_outstanding)} tone="border-red-100 bg-red-50" />
        <BigMetric label="Net Exposure (AR − AP)" value={formatCompact(data.net_exposure)} tone={data.net_exposure >= 0 ? 'border-blue-100 bg-blue-50' : 'border-red-100 bg-red-50'} />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="AR Aging" action={<button onClick={() => navigate('/accounts-receivable/reports')} className="text-[10px] text-[#26324f] hover:underline">View Details →</button>}>
          <VerticalBarChart data={arBars} height={140} formatValue={formatCompact} />
          <div className="grid grid-cols-5 gap-1 mt-3 pt-3 border-t border-slate-100">
            {data.ar_aging.map((b) => (
              <div key={b.bucket} className="text-center">
                <p className="text-[9px] text-slate-500">{b.bucket}</p>
                <p className="text-[11px] font-semibold text-slate-800">{formatCompact(b.total)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="AP Aging" action={<button onClick={() => navigate('/accounts-payable/aging')} className="text-[10px] text-[#26324f] hover:underline">View Details →</button>}>
          <VerticalBarChart data={apBars} height={140} formatValue={formatCompact} />
          <div className="grid grid-cols-5 gap-1 mt-3 pt-3 border-t border-slate-100">
            {data.ap_aging.map((b) => (
              <div key={b.bucket} className="text-center">
                <p className="text-[9px] text-slate-500">{b.bucket}</p>
                <p className="text-[11px] font-semibold text-slate-800">{formatCompact(b.total)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}
