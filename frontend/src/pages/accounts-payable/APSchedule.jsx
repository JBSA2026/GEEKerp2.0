import { useCallback, useEffect, useState } from 'react'
import { Loader2, Receipt } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorBox, Loading } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/form'
import { money } from '@/components/aprar/format'
import { createApPaymentRun, createApVoucher, fetchApPaymentSchedule } from '@/utils/api'
import { notify } from '@/utils/toast'
import { ApTableHeader, formatDate, monthRange } from './apUtils'

const SCHEDULE_GRID = 'grid-cols-[40px_25%_19%_16%_13%_13%_14%]'

export function APSchedule() {
  const seed = monthRange()
  const [from, setFrom] = useState(seed.from)
  const [to, setTo] = useState(seed.to)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [creatingRun, setCreatingRun] = useState(false)
  const [error, setError] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])

  const load = useCallback(async () => {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      setData(await fetchApPaymentSchedule({ from, to }))
      setSelectedIds([])
    } catch (err) {
      setError(err.message || 'Unable to load payment schedule')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const rows = data?.rows || []
  const selectedRows = rows.filter(row => selectedIds.includes(row.bill_id))
  const selectedCurrencyTotals = selectedRows.reduce((totals, row) => {
    const currency = row.currency_code || 'PHP'
    totals[currency] = (totals[currency] || 0) + Number(row.outstanding_balance || 0)
    return totals
  }, {})
  const currencySummary = totals => Object.entries(totals || {}).map(([currency, total]) => money(total, currency)).join(' + ')
  const allSelected = rows.length > 0 && selectedIds.length === rows.length

  function toggleRow(id) {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id])
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : rows.map(row => row.bill_id))
  }

  async function handleCreatePaymentRun(overrideRows = null) {
    if (!from || !to) return
    const rowsToCreate = overrideRows || selectedRows
    setCreatingRun(true)
    setError(null)
    try {
      if (rowsToCreate.length > 0) {
        const groups = rowsToCreate.reduce((acc, row) => {
          const key = `${row.supplier_id || 'unknown'}:${row.currency_code || 'PHP'}`
          acc[key] = acc[key] || []
          acc[key].push(row)
          return acc
        }, {})
        const created = []
        for (const groupRows of Object.values(groups)) {
          const first = groupRows[0]
          const voucher = await createApVoucher({
            supplier_id: first.supplier_id,
            payment_date: to,
            bill_ids: groupRows.map(row => row.bill_id),
          })
          created.push(voucher)
        }
        notify.success(`Created ${created.length} voucher(s) for selected bills.`)
      } else {
        const result = await createApPaymentRun({ from_date: from, to_date: to, submit_for_approval: false })
        notify.success(`Created ${result.total_created || 0} payment voucher(s). Skipped ${result.total_skipped || 0}.`)
      }
      await load()
    } catch (err) {
      setError(err.message || 'Unable to create payment vouchers')
    } finally {
      setCreatingRun(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Payment Schedule</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
            <Button onClick={load} disabled={!from || !to || loading}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Loading...</> : 'Apply'}
            </Button>
            <Button variant="outline" onClick={handleCreatePaymentRun} disabled={!from || !to || loading || creatingRun || rows.length === 0}>
              {creatingRun ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : selectedRows.length > 0 ? 'Create Selected' : 'Create All'}
            </Button>
            <span className="text-xs text-slate-500">{selectedRows.length ? `${selectedRows.length} selected · ${currencySummary(selectedCurrencyTotals)}` : 'No selection uses all due bills'}</span>
          </div>
        </CardContent>
      </Card>

      {error && <ErrorBox message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <Loading label="Loading payment schedule..." />
      ) : data ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Bills Due {formatDate(data.period?.from)} – {formatDate(data.period?.to)}</CardTitle>
              <span className="text-sm text-slate-500">Total Required: <span className="font-semibold text-[#26324f]">{currencySummary(data.currency_totals || { PHP: data.total_payment_required || 0 })}</span></span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <EmptyState title="No bills due in this period" icon={Receipt} />
            ) : (
              <div className="max-h-[calc(100vh-360px)] overflow-auto">
                <ApTableHeader grid={SCHEDULE_GRID}>
                  <span><input type="checkbox" checked={allSelected} onChange={toggleAll} /></span>
                  <span>Supplier</span>
                  <span>Bill Number</span>
                  <span>Due Date</span>
                  <span className="text-right">Paid</span>
                  <span className="text-right">Balance</span>
                  <span className="text-right">Action</span>
                </ApTableHeader>
                <div className="divide-y divide-[#e3ecf8]">
                  {rows.map(row => (
                    <div key={row.bill_id} className={`grid ${SCHEDULE_GRID} items-center px-5 py-3 text-sm`}>
                      <span><input type="checkbox" checked={selectedIds.includes(row.bill_id)} onChange={() => toggleRow(row.bill_id)} /></span>
                      <span className="truncate text-slate-600">{row.supplier_name || '-'}</span>
                      <span className="break-all font-mono text-xs font-semibold text-[#26324f]">{row.bill_number}</span>
                      <span className="text-slate-600">{formatDate(row.due_date)}</span>
                      <span className="text-right text-slate-800">{money(row.paid_amount, row.currency_code || 'PHP')}</span>
                      <span className="text-right font-semibold text-slate-800">{money(row.outstanding_balance, row.currency_code || 'PHP')}</span>
                      <span className="text-right">
                        <Button size="sm" variant="outline" onClick={() => handleCreatePaymentRun([row])} disabled={creatingRun}>
                          Voucher
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
