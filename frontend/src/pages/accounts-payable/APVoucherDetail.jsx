import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Banknote, Check, Loader2, Paperclip, Send, ThumbsDown, ThumbsUp } from 'lucide-react'

import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/overlay'
import { ErrorBox, Loading } from '@/components/ui/feedback'
import { Field, Input, Select } from '@/components/ui/form'
import { money } from '@/components/aprar/format'
import { approveApVoucher, fetchApVoucher, fetchApVoucherPayments, recordApPayment, rejectApVoucher, submitApVoucher } from '@/utils/api'
import { DetailField, PAYMENT_METHODS, apBillDisplayStatus, fileTypeFromName, formatDate, statusLabel } from './apUtils'

export function VoucherDetailDrawer({ voucherId, onClose, onChanged }) {
  const [voucher, setVoucher] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [payFor, setPayFor] = useState(null) // bill being paid
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0])
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentFile, setPaymentFile] = useState({ payment_file_name: '', payment_file_ref: '', payment_file_type: 'PDF' })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [v, p] = await Promise.all([fetchApVoucher(voucherId), fetchApVoucherPayments(voucherId)])
      setVoucher(v)
      setPayments(p || [])
    } catch (err) {
      setError(err.message || 'Unable to load voucher')
    } finally {
      setLoading(false)
    }
  }, [voucherId])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  async function runAction(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChanged?.()
      await load()
      return true
    } catch (err) {
      setError(err.message || 'Action failed')
      return false
    } finally {
      setBusy(false)
    }
  }

  const status = voucher?.status
  const paidByBill = payments.reduce((acc, p) => {
    acc[p.bill_id] = (acc[p.bill_id] || 0) + Number(p.payment_amount || 0)
    return acc
  }, {})

  async function handleSubmit() { await runAction(() => submitApVoucher(voucherId)) }
  async function handleApprove() { await runAction(() => approveApVoucher(voucherId)) }
  async function handleReject() {
    if (!remarks.trim()) { setError('Rejection remarks are required.'); return }
    const ok = await runAction(() => rejectApVoucher(voucherId, remarks.trim()))
    if (ok) { setRejecting(false); setRemarks('') }
  }

  function startPay(bill) {
    const remaining = Number(bill.net_payable || 0) - (paidByBill[bill.bill_id] || 0)
    setPayFor(bill)
    setPayAmount(remaining > 0 ? String(remaining.toFixed(2)) : '')
    setPayMethod(PAYMENT_METHODS[0])
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentFile({ payment_file_name: '', payment_file_ref: '', payment_file_type: 'PDF' })
  }

  function handlePaymentFile(file) {
    if (!file) return
    setPaymentFile({
      payment_file_name: file.name,
      payment_file_ref: file.name,
      payment_file_type: fileTypeFromName(file.name),
    })
  }

  async function handleRecordPayment() {
    const amount = Number(payAmount)
    if (!amount || amount <= 0) { setError('Enter a payment amount greater than zero.'); return }
    const ok = await runAction(() => recordApPayment(voucherId, {
      bill_id: payFor.bill_id,
      payment_amount: amount,
      payment_date: paymentDate,
      payment_method: payMethod,
      ...(paymentFile.payment_file_name ? paymentFile : {}),
    }))
    if (ok) {
      setPayFor(null)
      setPaymentFile({ payment_file_name: '', payment_file_ref: '', payment_file_type: 'PDF' })
    }
  }

  const footer = voucher && !loading ? (
    <div className="flex flex-wrap justify-end gap-2">
      {status === 'DRAFT' && (
        <Button size="sm" onClick={handleSubmit} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Submit for Approval
        </Button>
      )}
      {status === 'FOR_APPROVAL' && (
        <>
          <Button variant="outline" size="sm" onClick={() => setRejecting(v => !v)} disabled={busy}>
            <ThumbsDown size={13} /> Reject
          </Button>
          <Button size="sm" onClick={handleApprove} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />} Approve
          </Button>
        </>
      )}
    </div>
  ) : null

  return (
    <Drawer
      open
      title={voucher ? voucher.voucher_number : 'Payment Voucher'}
      subtitle="Payment voucher"
      onClose={onClose}
      footer={footer}
    >
      {loading ? (
        <Loading label="Loading voucher..." />
      ) : !voucher ? (
        <ErrorBox message={error || 'Voucher not found'} onDismiss={null} />
      ) : (
        <div className="space-y-5">
          {error && <ErrorBox message={error} onDismiss={() => setError(null)} />}

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DetailField label="Supplier">{voucher.supplier_name || '-'}</DetailField>
            <DetailField label="Payment Date">{formatDate(voucher.payment_date)}</DetailField>
          </div>

          {rejecting && status === 'FOR_APPROVAL' && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <Field label="Rejection Remarks">
                <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Reason for rejection" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setRejecting(false); setRemarks('') }} disabled={busy}>Cancel</Button>
                <Button size="sm" onClick={handleReject} disabled={busy}>Confirm Reject</Button>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Linked Bills</p>
            <div className="space-y-2">
              {(voucher.bills || []).length === 0 ? (
                <p className="text-xs text-slate-500">No bills linked.</p>
              ) : (
                voucher.bills.map(bill => {
                  const currencyCode = bill.currency_code || voucher.currency_code || 'PHP'
                  const paid = paidByBill[bill.bill_id] || 0
                  const remaining = Number(bill.net_payable || 0) - paid
                  return (
                    <div key={bill.bill_id} className="rounded-lg border border-[#e3ecf8] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs font-semibold text-[#26324f]">{bill.bill_number}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">Net {money(bill.net_payable, currencyCode)} · Paid {money(paid, currencyCode)} · Balance {money(remaining, currencyCode)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={apBillDisplayStatus({ ...bill, voucher_statuses: [status] })} />
                          {status === 'APPROVED' && remaining > 0 && (
                            <Button size="sm" variant="outline" onClick={() => startPay(bill)} disabled={busy}>
                              <Banknote size={13} /> Pay
                            </Button>
                          )}
                        </div>
                      </div>

                      {payFor?.bill_id === bill.bill_id && (
                        <div className="mt-3 grid gap-2 border-t border-[#e9eef8] pt-3 sm:grid-cols-2">
                          <Field label="Amount">
                            <Input type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                          </Field>
                          <Field label="Date">
                            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                          </Field>
                          <Field label="Method">
                            <Select className="w-full" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{statusLabel(m)}</option>)}
                            </Select>
                          </Field>
                          <div className="space-y-1">
                            <label className="flex min-h-9 cursor-pointer items-center justify-center rounded-md border border-[#d8e2ef] bg-white px-3 text-xs font-medium text-slate-600 hover:bg-[#edf4fb]">
                              <Paperclip size={13} className="mr-1.5" /> Choose payment file
                              <input
                                type="file"
                                className="sr-only"
                                accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                                onChange={e => handlePaymentFile(e.target.files?.[0])}
                              />
                            </label>
                            <p className="min-w-0 truncate rounded-md bg-[#f6f8fc] px-3 py-2 text-xs text-slate-600">
                              {paymentFile.payment_file_name || 'No payment file selected'}
                            </p>
                          </div>
                          <div className="flex justify-end gap-2 sm:col-span-2">
                            <Button variant="outline" size="sm" onClick={() => setPayFor(null)} disabled={busy}>Cancel</Button>
                            <Button size="sm" onClick={handleRecordPayment} disabled={busy}>
                              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Record Payment
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {payments.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Payments</p>
              <div className="space-y-1.5">
                {payments.map(p => (
                  <div key={p.payment_id} className="flex items-center justify-between rounded-lg border border-[#e3ecf8] px-3 py-2 text-sm">
                    <span className="text-slate-600">{formatDate(p.payment_date)} · {statusLabel(p.payment_method)}</span>
                    {p.payment_file_name && (
                      <span className="min-w-0 truncate text-[11px] text-slate-500">{p.payment_file_name}</span>
                    )}
                    <span className="font-semibold text-slate-800">{money(p.payment_amount, voucher.currency_code || 'PHP')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

export function APVoucherDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  return <VoucherDetailDrawer voucherId={id} onClose={() => navigate('/accounts-payable/vouchers')} />
}
