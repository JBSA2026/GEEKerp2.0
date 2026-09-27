import { useCallback, useEffect, useState } from 'react'
import { Banknote } from 'lucide-react'

import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorBox, Loading } from '@/components/ui/feedback'
import { Field, Input, Select } from '@/components/ui/form'
import { money } from '@/components/aprar/format'
import { bounceApCheck, cancelApCheck, clearApCheck, fetchApChecks } from '@/utils/api'
import { notify } from '@/utils/toast'
import { ApTableHeader, formatDate, statusLabel } from './apUtils'

const CHECK_GRID = 'grid-cols-[14%_13%_22%_16%_14%_10%_11%]'

export function APChecks({ initialStatus = 'All' } = {}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(initialStatus)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busyCheck, setBusyCheck] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchApChecks({ status, from, to })
      setRows(Array.isArray(result) ? result : [])
    } catch (err) {
      setError(err.message || 'Unable to load checks')
    } finally {
      setLoading(false)
    }
  }, [status, from, to])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  async function runCheckAction(row, action) {
    if (action !== 'clear' && !window.confirm(`${statusLabel(action)} check ${row.check_number}?`)) return
    const actionLabels = { clear: 'cleared', bounce: 'bounced', cancel: 'cancelled' }
    setBusyCheck(row.check_id)
    setError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      if (action === 'clear') await clearApCheck(row.check_id, today)
      if (action === 'bounce') await bounceApCheck(row.check_id)
      if (action === 'cancel') await cancelApCheck(row.check_id)
      notify.success(`Check ${actionLabels[action] || 'updated'}.`)
      await load()
    } catch (err) {
      setError(err.message || 'Unable to update check')
    } finally {
      setBusyCheck(null)
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <CardTitle>Check Monitoring</CardTitle>
          <div className="flex items-end gap-2">
            <Field label="Status">
              <Select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="All">All Status</option>
                <option value="ISSUED">Issued</option>
                <option value="CLEARED">Cleared</option>
                <option value="BOUNCED">Bounced</option>
                <option value="CANCELLED">Cancelled</option>
              </Select>
            </Field>
            <Field label="From"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && <div className="px-5 pb-3"><ErrorBox message={error} onDismiss={() => setError(null)} /></div>}
        {loading ? (
          <Loading label="Loading checks..." />
        ) : rows.length === 0 ? (
          <EmptyState title="No checks found" icon={Banknote} />
        ) : (
          <div className="max-h-[calc(100vh-300px)] overflow-auto">
            <ApTableHeader grid={CHECK_GRID}>
              <span>Check No.</span>
              <span>Date</span>
              <span>Supplier</span>
              <span>Bank</span>
              <span className="text-right">Amount</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </ApTableHeader>
            <div className="divide-y divide-[#e3ecf8]">
              {rows.map(row => (
                <div key={row.check_id} className={`grid ${CHECK_GRID} items-center px-5 py-3 text-sm`}>
                  <span className="break-all font-mono text-xs font-semibold text-[#26324f]">{row.check_number}</span>
                  <span className="text-slate-600">{formatDate(row.check_date)}</span>
                  <span className="truncate text-slate-600">{row.supplier_name || '-'}</span>
                  <span className="truncate text-slate-600">{row.bank || '-'}</span>
                  <span className="text-right font-semibold text-slate-800">{money(row.check_amount, row.currency_code || 'PHP')}</span>
                  <span><StatusBadge status={row.check_status} /></span>
                  <span className="flex justify-end gap-1">
                    {row.check_status === 'ISSUED' ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => runCheckAction(row, 'clear')} disabled={busyCheck === row.check_id}>Clear</Button>
                        <Button size="sm" variant="outline" onClick={() => runCheckAction(row, 'bounce')} disabled={busyCheck === row.check_id}>Bounce</Button>
                        <Button size="sm" variant="ghost" onClick={() => runCheckAction(row, 'cancel')} disabled={busyCheck === row.check_id}>Cancel</Button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
