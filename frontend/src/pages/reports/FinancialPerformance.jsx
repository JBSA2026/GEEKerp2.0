import { useOutletContext } from 'react-router-dom'
import { FileText, Download } from 'lucide-react'
import {
  useReportData, BigMetric, Panel, HorizontalBarChart, LoadingState, ErrorState,
  formatCurrency, formatCompact, exportToCsv, exportToPdf,
} from './reportsUtils'

export function FinancialPerformance() {
  const { entity, dateFrom, dateTo } = useOutletContext()
  const { data, loading, error, refresh } = useReportData('/reports/financial-performance', entity, dateFrom, dateTo)

  if (loading && !data) return <LoadingState />
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <LoadingState />

  const changeVsPrior = data.prior_period ? data.net_income - data.prior_period.net_income : null

  function handleCsv() {
    const rows = [
      ...data.revenue.map(r => ({ type: 'Revenue', code: r.account_code, name: r.account_name, amount: r.amount })),
      ...data.expenses.map(r => ({ type: 'Expense', code: r.account_code, name: r.account_name, amount: r.amount })),
    ]
    exportToCsv(`financial_performance_${entity}.csv`, rows, [
      { key: 'type', label: 'TYPE' }, { key: 'code', label: 'ACCOUNT CODE' }, { key: 'name', label: 'ACCOUNT TITLE' }, { key: 'amount', label: 'AMOUNT' },
    ])
  }
  function handlePdf() {
    exportToPdf({ title: 'Financial Performance', entity, dateFrom, dateTo, kpis: [
      { label: 'Revenue', value: formatCurrency(data.total_revenue) },
      { label: 'Expenses', value: formatCurrency(data.total_expenses) },
      { label: 'Net Income', value: formatCurrency(data.net_income) },
    ] })
  }

  const revenueData = data.revenue.map(r => ({ label: r.account_name, value: r.amount }))
  const expenseData = data.expenses.map(r => ({ label: r.account_name, value: r.amount }))

  return (
    <div className="flex flex-col gap-4 ">
      <div className="flex justify-end gap-2">
        <button onClick={handlePdf} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><FileText size={11} /> PDF</button>
        <button onClick={handleCsv} className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"><Download size={11} /> CSV</button>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BigMetric label="Total Revenue" value={formatCompact(data.total_revenue)} tone="border-emerald-100 bg-emerald-50" />
        <BigMetric label="Total Expenses" value={formatCompact(data.total_expenses)} tone="border-red-100 bg-red-50" />
        <BigMetric label="Net Income" value={formatCompact(data.net_income)} tone={data.net_income >= 0 ? 'border-blue-100 bg-blue-50' : 'border-red-100 bg-red-50'} sub={changeVsPrior != null ? `${changeVsPrior >= 0 ? '+' : ''}${formatCompact(changeVsPrior)} vs prior period` : undefined} />
        <BigMetric label="Prior Period Net Income" value={data.prior_period ? formatCompact(data.prior_period.net_income) : '—'} tone="border-slate-200 bg-slate-50" sub={data.prior_period ? `${data.prior_period.date_from} to ${data.prior_period.date_to}` : undefined} />
      </section>

      {/* Revenue & Expense breakdown */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title={`Revenue Accounts (${data.revenue.length})`}>
          {revenueData.length === 0
            ? <p className="text-xs text-slate-400 py-6 text-center">No revenue recorded</p>
            : <HorizontalBarChart data={revenueData} formatValue={formatCompact} />
          }
        </Panel>
        <Panel title={`Expense Accounts (${data.expenses.length})`}>
          {expenseData.length === 0
            ? <p className="text-xs text-slate-400 py-6 text-center">No expenses recorded</p>
            : <HorizontalBarChart data={expenseData} formatValue={formatCompact} />
          }
        </Panel>
      </section>
    </div>
  )
}
