import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorBox, Loading } from '@/components/ui/feedback'
import { Field, Input, Select } from '@/components/ui/form'
import { money } from '@/components/aprar/format'
import {
  fetchArMeta,
  fetchArStatement,
  getArStatementPdfUrl,
} from '@/utils/api'
import { formatDate } from './arUtils'

const STATEMENT_GRID = 'grid-cols-[19%_14%_14%_14%_13%_13%_13%]'

export function ARStatements() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [customer, setCustomer] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchArMeta()
      .then(meta => setCustomers(meta.customers || []))
      .catch(() => setCustomers([]))
  }, [])

  const loadStatement = useCallback(async () => {
    if (!customer) {
      setStatement(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setStatement(null)
    try {
      setStatement(await fetchArStatement({ customer, from, to }))
    } catch (err) {
      setError(err.message || 'Unable to generate statement')
    } finally {
      setLoading(false)
    }
  }, [customer, from, to])

  useEffect(() => {
    const timer = setTimeout(() => { loadStatement() }, 250)
    return () => clearTimeout(timer)
  }, [loadStatement])

  function openPdf() {
    if (!customer) return
    window.open(getArStatementPdfUrl({ customer, from, to }), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Statement of Account</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/accounts-receivable/workbench')}>
              <ArrowLeft size={14} /> Dashboard
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Customer" className="min-w-[240px] flex-1">
              <Select value={customer} onChange={e => setCustomer(e.target.value)}>
                <option value="">Select customer</option>
                {customers.map(c => (
                  <option key={c.client_id} value={c.client_id}>{c.company_name}</option>
                ))}
              </Select>
            </Field>
            <Field label="From"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
            <Button type="button" variant="outline" onClick={openPdf} disabled={!customer}>
              <Download size={14} /> Generate PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <ErrorBox message={error} onDismiss={() => setError(null)} />}
      {loading && <Loading label="Loading statement..." />}

      {!loading && statement && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{statement.customer?.company_name}</CardTitle>
            <p className="mt-1 text-xs text-slate-500">{statement.customer?.address || ''}</p>
          </CardHeader>
          <CardContent className="p-0">
            {(statement.rows || []).length === 0 ? (
              <EmptyState title="No invoices in this period" icon={FileText} />
            ) : (
              <div className="overflow-x-auto">
                <div className={`grid ${STATEMENT_GRID} border-y border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
                  <span>Invoice</span>
                  <span>Inv Date</span>
                  <span>Due Date</span>
                  <span className="text-right">Gross</span>
                  <span className="text-right">WHT</span>
                  <span className="text-right">Collections</span>
                  <span className="text-right">Balance</span>
                </div>
                <div className="divide-y divide-[#e3ecf8]">
                  {statement.rows.map(row => (
                    <div key={row.invoice_id} className={`grid ${STATEMENT_GRID} items-center px-5 py-3 text-sm`}>
                      <span className="break-all font-mono text-xs font-semibold text-[#26324f]">{row.invoice_number}</span>
                      <span className="text-slate-600">{formatDate(row.invoice_date)}</span>
                      <span className="text-slate-600">{formatDate(row.due_date)}</span>
                      <span className="text-right text-slate-800">{money(row.gross_amount)}</span>
                      <span className="text-right text-slate-800">{money(row.wht_amount)}</span>
                      <span className="text-right text-slate-800">{money(row.collections)}</span>
                      <span className="text-right font-semibold text-slate-800">{money(row.balance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-6 border-t border-[#d8e2ef] px-5 py-3 text-sm">
              <span className="text-slate-500">Invoiced: <span className="font-semibold text-[#26324f]">{money(statement.totals?.total_invoiced)}</span></span>
              <span className="text-slate-500">WHT: <span className="font-semibold text-[#26324f]">{money(statement.totals?.total_wht)}</span></span>
              <span className="text-slate-500">Collections: <span className="font-semibold text-[#26324f]">{money(statement.totals?.total_collections)}</span></span>
              <span className="text-slate-500">Outstanding: <span className="font-semibold text-[#26324f]">{money(statement.totals?.total_outstanding)}</span></span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
