import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, Banknote, Check, FileText, Loader2, Paperclip, Pencil, Send, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState, ErrorBox, Loading } from '@/components/ui/feedback'
import { Field, Input, Select } from '@/components/ui/form'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { money } from '@/components/aprar/format'
import { notify } from '@/utils/toast'
import { addApBillAttachment, archiveApBill, confirmApBill, createApVoucher, fetchApBill, recordApPayment, submitApVoucher, updateApBill } from '@/utils/api'
import { DetailField, PAYMENT_METHODS, apBillDisplayStatus, fileTypeFromName, formatDate, statusLabel } from './apUtils'

function quantity(value) {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(Number(value || 0))
}

function billItemCostBreakdown(item) {
  const lineTotal = Number(item.line_total ?? item.vat_exclusive_amount ?? 0)
  const itemQuantity = Number(item.quantity ?? 1) || 1
  const unitPrice = Number(item.base_unit_price ?? item.unit_price ?? (lineTotal / itemQuantity))

  return { lineTotal, itemQuantity, unitPrice, unit: item.unit || '-' }
}

export function BillDetailDrawer({ billId, onClose, onChanged }) {
  const { confirm, confirmDialogProps } = useConfirmDialog()
  const [bill, setBill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [attaching, setAttaching] = useState(false)
  const [attachmentForm, setAttachmentForm] = useState({ file_name: '', file_ref: '', file_type: 'PDF' })
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0])
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentFile, setPaymentFile] = useState({ payment_file_name: '', payment_file_ref: '', payment_file_type: 'PDF' })

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchApBill(billId)
      setBill(data)
      // A PO-generated draft seeds supplier_invoice_number with the "PENDING"
      // placeholder; show it as empty so the user must enter a real number.
      const raw = (data.supplier_invoice_number || '').trim()
      setInvoiceNo(raw.toUpperCase() === 'PENDING' ? '' : raw)
      setDueDate((data.due_date || '').slice(0, 10))
      const paid = (data.payments || []).reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0)
      const remaining = Math.max(Number(data.net_payable || 0) - paid, 0)
      setPayAmount(remaining > 0 ? remaining.toFixed(2) : '')
      setPaymentDate(new Date().toISOString().slice(0, 10))
      setPaymentFile({ payment_file_name: '', payment_file_ref: '', payment_file_type: 'PDF' })
    } catch (err) {
      setError(err.message || 'Unable to load bill')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [billId])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const isDraft = bill?.lifecycle_status === 'DRAFT'
  const currencyCode = bill?.currency_code || 'PHP'
  const isInternationalSupplier = bill?.supplier?.supplier_classification === 'INTERNATIONAL' || currencyCode === 'USD'
  // its header (invoice number / due date) is reflected by the linked voucher,
  // which reads bill data live.
  const isModifiable = bill?.lifecycle_status === 'CONFIRMED' && ['UNPAID', 'PARTIALLY_PAID'].includes(bill?.payment_status)
  const canEdit = isDraft || isModifiable
  // A draft is always editable (the supplier invoice number must be entered
  // before it can be confirmed); a confirmed bill edits via the Edit button.
  const showFields = isDraft || editing
  const primaryVoucher = (bill?.vouchers || []).find(voucher => voucher.status !== 'REJECTED') || (bill?.vouchers || [])[0] || null
  const paymentsTotal = (bill?.payments || []).reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0)
  const remainingBalance = Math.max(Number(bill?.net_payable || 0) - paymentsTotal, 0)
  const canRecordPayment = primaryVoucher?.status === 'APPROVED' && remainingBalance > 0

  async function runBillAction(action, fallbackMessage) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      onChanged?.()
      await load({ silent: true })
    } catch (err) {
      setError(err.message || fallbackMessage)
    } finally {
      setBusy(false)
    }
  }

  async function persistEdits() {
    const payload = {}
    const trimmed = invoiceNo.trim()
    if (trimmed && trimmed !== (bill.supplier_invoice_number || '').trim()) {
      payload.supplier_invoice_number = trimmed
    }
    if (dueDate && dueDate !== (bill.due_date || '').slice(0, 10)) {
      payload.due_date = dueDate
    }
    if (Object.keys(payload).length > 0) {
      await updateApBill(billId, payload)
    }
  }

  // Confirming only validates the bill and unlocks the payment section. The
  // voucher is created deliberately from the payment container.
  async function handleConfirm() {
    if (!invoiceNo.trim()) {
      setError('A supplier invoice number is required to confirm this bill.')
      return
    }
    await runBillAction(async () => {
      await persistEdits()
      await confirmApBill(billId)
      setNotice('Bill confirmed. The payment container is now active.')
    }, 'Unable to confirm bill')
  }

  // Enter edit mode for a confirmed bill's header fields.
  function startEdit() {
    setNotice(null)
    setError(null)
    setEditing(true)
  }

  // Edit a bill's header. For a confirmed bill this may reset a linked voucher;
  // for a draft it simply updates the details before confirming.
  async function handleSaveEdit() {
    await runBillAction(async () => {
      await persistEdits()
      setEditing(false)
      setNotice(isDraft
        ? 'Bill details updated.'
        : 'Bill updated. Any linked payment voucher that was awaiting approval or already approved has been reset to draft for re-approval.')
    }, 'Unable to update bill')
  }

  function cancelEdit() {
    setEditing(false)
    setError(null)
    const raw = (bill.supplier_invoice_number || '').trim()
    setInvoiceNo(raw.toUpperCase() === 'PENDING' ? '' : raw)
    setDueDate((bill.due_date || '').slice(0, 10))
  }

  function handleAttachmentFile(file) {
    if (!file) return
    setAttachmentForm({
      file_name: file.name,
      file_ref: file.name,
      file_type: fileTypeFromName(file.name),
    })
  }

  function handlePaymentFile(file) {
    if (!file) return
    setPaymentFile({
      payment_file_name: file.name,
      payment_file_ref: file.name,
      payment_file_type: fileTypeFromName(file.name),
    })
  }

  async function handleAddAttachment() {
    if (!attachmentForm.file_name.trim()) {
      setError('Choose an invoice file first.')
      return
    }
    setAttaching(true)
    setError(null)
    try {
      await addApBillAttachment(billId, {
        file_name: attachmentForm.file_name.trim(),
        file_ref: attachmentForm.file_ref.trim() || attachmentForm.file_name.trim(),
        file_type: attachmentForm.file_type,
      })
      setAttachmentForm({ file_name: '', file_ref: '', file_type: 'PDF' })
      await load({ silent: true })
      notify.success('Document reference attached.')
    } catch (err) {
      setError(err.message || 'Unable to attach document')
    } finally {
      setAttaching(false)
    }
  }

  async function handleArchive() {
    const ok = await confirm({
      title: 'Archive bill?',
      message: `Archive bill ${bill.bill_number}? It will be removed from active lists.`,
      confirmLabel: 'Archive',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await archiveApBill(billId)
      onChanged?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Unable to archive bill')
      setBusy(false)
    }
  }

  async function handleDiscard() {
    const ok = await confirm({
      title: 'Discard draft bill?',
      message: 'Discard this draft bill? It will be archived.',
      confirmLabel: 'Discard',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await archiveApBill(billId)
      onChanged?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Unable to discard bill')
      setBusy(false)
    }
  }

  async function handleCreateVoucher() {
    if (!bill || isDraft) return
    await runBillAction(async () => {
      const voucher = await createApVoucher({
        supplier_id: bill.supplier_id,
        payment_date: new Date().toISOString().slice(0, 10),
        bill_ids: [bill.bill_id],
      })
      setNotice(`Payment voucher ${voucher.voucher_number} was created.`)
    }, 'Unable to create payment voucher')
  }

  async function handleConfirmVoucher() {
    if (!primaryVoucher) return
    await runBillAction(async () => {
      if (primaryVoucher.status === 'DRAFT') {
        await submitApVoucher(primaryVoucher.voucher_id)
        setNotice(`Voucher ${primaryVoucher.voucher_number} submitted for approval. An approver must approve it from Workflow Approval before payment can be recorded.`)
      } else if (primaryVoucher.status === 'FOR_APPROVAL') {
        setNotice(`Voucher ${primaryVoucher.voucher_number} is already pending approval. An approver must approve it from Workflow Approval.`)
      }
    }, 'Unable to submit voucher for approval')
  }

  async function handleRecordBillPayment() {
    if (!primaryVoucher) {
      setError('Create and confirm a payment voucher before recording payment.')
      return
    }
    if (!canRecordPayment) {
      setError('Payment can only be recorded against an approved voucher with an open balance.')
      return
    }
    const amount = Number(payAmount)
    if (!amount || amount <= 0) {
      setError('Enter a payment amount greater than zero.')
      return
    }
    await runBillAction(async () => {
      const payment = await recordApPayment(primaryVoucher.voucher_id, {
        bill_id: bill.bill_id,
        payment_amount: amount,
        payment_date: paymentDate,
        payment_method: payMethod,
        ...(paymentFile.payment_file_name ? paymentFile : {}),
      })
      setPaymentFile({ payment_file_name: '', payment_file_ref: '', payment_file_type: 'PDF' })
      setNotice(`Payment recorded. Remaining AP balance is ${money(payment.bill_ap_balance, currencyCode)}.`)
    }, 'Unable to record payment')
  }

  const footer = bill && !loading ? (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-500">
        {isDraft
          ? 'Enter the supplier invoice number, then confirm to activate payment.'
          : 'Payment is managed in the container on the right.'}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {editing ? (
          <>
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save Changes
            </Button>
          </>
        ) : isDraft ? (
          <>
            <Button variant="outline" size="sm" onClick={handleDiscard} disabled={busy}>
              <Trash2 size={13} /> Discard
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Confirm Bill
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" onClick={handleArchive} disabled={busy}>
              <Archive size={14} /> Archive
            </Button>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={startEdit} disabled={busy}>
                <Pencil size={13} /> Edit
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  ) : null

  return (
    <div className="space-y-4">
      <ConfirmDialog {...confirmDialogProps} />
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[#d8e2ef] bg-[#f6f8fc] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onClose}>
                <ArrowLeft size={14} /> Back
              </Button>
              <div className="min-w-0">
                <CardTitle className="break-all text-base">{bill ? bill.bill_number : 'Bill'}</CardTitle>
                <p className="text-xs text-slate-500">{bill?.po_number ? `From purchase order ${bill.po_number}` : 'Supplier bill'}</p>
                {bill?.vouchers && bill.vouchers.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {bill.vouchers.map((v, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        PV: {v.voucher_number}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {bill && (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={apBillDisplayStatus(bill)} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3">
      {loading ? (
        <Loading label="Loading bill..." />
      ) : !bill ? (
        <ErrorBox message={error || 'Bill not found'} onDismiss={null} />
      ) : (
        <div className="space-y-3">
          {error && <ErrorBox message={error} onDismiss={() => setError(null)} />}
          {notice && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <Check size={14} className="mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-2">
          {/* LEFT — supplier details and line items live in one container. */}
          <div className="space-y-3 rounded-md border border-[#e3ecf8] bg-white p-3">
          {(
          <div className="grid grid-cols-2 gap-3 rounded-md border border-[#e3ecf8] px-3 py-2">
            <DetailField label="Supplier">{bill.supplier_name || '-'}</DetailField>
            {showFields ? (
              <Field label="Supplier Invoice #">
                <Input
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                  placeholder="Enter supplier invoice number"
                />
              </Field>
            ) : (
              <DetailField label="Supplier Invoice #" mono>{bill.supplier_invoice_number || '-'}</DetailField>
            )}
            <DetailField label="Bill Creation Date">{formatDate(bill.bill_date)}</DetailField>
            {bill.transaction_date && <DetailField label="PO Transaction Date">{formatDate(bill.transaction_date)}</DetailField>}
            {bill.fx_rate_to_php && (
              <DetailField label="Frozen FX Rate">
                1 {currencyCode} = PHP {Number(bill.fx_rate_to_php).toFixed(4)}
              </DetailField>
            )}
            {showFields ? (
              <Field label="Due Date">
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </Field>
            ) : (
              <DetailField label="Due Date">{formatDate(bill.due_date)}</DetailField>
            )}
          </div>
          )}

          {(
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Line Items</p>
            <div className="rounded-md border border-[#e3ecf8]">
              {(bill.items || []).length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-slate-500">No line items.</p>
              ) : (
                <div className="divide-y divide-[#e9eef8]">
                  {bill.items.map(item => {
                    const breakdown = billItemCostBreakdown(item)
                    return (
                      <div key={item.item_id} className="space-y-2 px-3 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{item.description}</p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {item.product_code || statusLabel(item.vat_code)}
                          </p>
                        </div>
                        <div className="rounded-md bg-[#f6f8fc] px-3 py-2">
                          <div className="flex justify-between gap-3 text-xs text-slate-600">
                            <span>Amount</span>
                            <span className="font-medium text-slate-800">{quantity(breakdown.itemQuantity)}</span>
                          </div>
                          <div className="mt-1 flex justify-between gap-3 text-xs text-slate-600">
                            <span>Unit Type</span>
                            <span className="font-medium text-slate-800">{breakdown.unit}</span>
                          </div>
                          <div className="mt-1 flex justify-between gap-3 text-xs text-slate-600">
                            <span>Base Price</span>
                            <span className="font-medium text-slate-800">{money(breakdown.unitPrice, currencyCode)}</span>
                          </div>
                          <div className="mt-2 flex justify-between gap-3 border-t border-[#d8e2ef] pt-2 text-sm font-semibold text-slate-900">
                            <span>Total</span>
                            <span>{money(breakdown.lineTotal, currencyCode)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          )}

          {(
          <div className="space-y-1 rounded-md border border-[#e3ecf8] bg-[#f6f8fc] px-3 py-2 text-sm">
            <div className="flex justify-between text-slate-600"><span>VAT Exclusive</span><span>{money(bill.vat_exclusive_amount, currencyCode)}</span></div>
            <div className="flex justify-between text-slate-600"><span>VAT Input</span><span>{money(bill.vat_input, currencyCode)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Gross Amount</span><span>{money(bill.gross_amount, currencyCode)}</span></div>
            {!isInternationalSupplier && (
              <div className="flex justify-between text-slate-600"><span>Withholding (EWT)</span><span>- {money(bill.ewt_material, currencyCode)}</span></div>
            )}
            <div className="flex justify-between border-t border-[#d8e2ef] pt-1.5 font-semibold text-slate-900"><span>Net Payable</span><span>{money(bill.net_payable, currencyCode)}</span></div>
          </div>
          )}
          {bill.fx_rate_to_php && (
            <div className="space-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700">PHP Equivalent — Frozen PO Rate</p>
              <div className="flex justify-between text-slate-600"><span>VAT Exclusive</span><span>{money(bill.php_vat_exclusive_amount, 'PHP')}</span></div>
              <div className="flex justify-between text-slate-600"><span>VAT Input</span><span>{money(bill.php_vat_input, 'PHP')}</span></div>
              <div className="flex justify-between text-slate-600"><span>Gross Amount</span><span>{money(bill.php_gross_amount, 'PHP')}</span></div>
              <div className="flex justify-between border-t border-emerald-200 pt-1.5 font-semibold text-slate-900"><span>Net Payable</span><span>{money(bill.php_net_payable, 'PHP')}</span></div>
            </div>
          )}

          {(
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Documents</p>
            <div className="space-y-2">
              {(bill.attachments || []).length === 0 ? (
                <p className="rounded-md border border-[#e3ecf8] px-3 py-2 text-xs text-slate-500">No supplier invoice documents attached.</p>
              ) : (
                bill.attachments.map(file => (
                  <div key={file.attachment_id} className="flex items-center justify-between gap-3 rounded-md border border-[#e3ecf8] px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{file.file_name}</p>
                    </div>
                    <Badge variant="muted">{file.file_type}</Badge>
                  </div>
                ))
              )}
              <div className="grid gap-2 rounded-md border border-dashed border-[#d8e2ef] px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="flex min-h-9 cursor-pointer items-center justify-center rounded-md border border-[#d8e2ef] bg-white px-3 text-xs font-medium text-slate-600 hover:bg-[#edf4fb] sm:col-span-2">
                  <Paperclip size={13} className="mr-1.5" /> Choose invoice file
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                    onChange={e => handleAttachmentFile(e.target.files?.[0])}
                  />
                </label>
                <p className="min-w-0 truncate rounded-md bg-[#f6f8fc] px-3 py-2 text-xs text-slate-600">
                  {attachmentForm.file_name || 'No invoice file selected'}
                </p>
                <Button size="sm" variant="outline" onClick={handleAddAttachment} disabled={attaching}>
                  {attaching ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} Attach
                </Button>
              </div>
            </div>
          </div>
          )}
          </div>

          {/* RIGHT — payment: add a voucher, send it, then record payment. */}
          {/* Locked until the draft bill is confirmed. */}
          <div className={`space-y-3 rounded-md border border-[#e3ecf8] bg-[#f6f8fc] p-3 ${isDraft ? 'pointer-events-none select-none opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Payment</p>
                <p className="mt-1 text-sm text-slate-600">
                  {isDraft
                    ? 'Confirm the bill to enable payment.'
                    : primaryVoucher
                    ? `Payment voucher ${primaryVoucher.voucher_number} is linked.`
                    : 'Add a voucher, send it for approval, then record payment.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DetailField label="Remaining">{money(remainingBalance, currencyCode)}</DetailField>
              </div>
            </div>

            {!primaryVoucher ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-[#d8e2ef] bg-white px-3 py-2">
                <p className="text-xs text-slate-500">No voucher has been added for this bill yet.</p>
                <Button size="sm" onClick={handleCreateVoucher} disabled={busy || isDraft || bill.payment_status === 'PAID'}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Add Voucher
                </Button>
              </div>
            ) : ['DRAFT', 'FOR_APPROVAL'].includes(primaryVoucher.status) ? (
              <div className="space-y-2 rounded-md border border-dashed border-[#d8e2ef] bg-white px-3 py-2">
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <DetailField label="Supplier">{bill.supplier_name || '-'}</DetailField>
                  <DetailField label="Net Payable">{money(bill.net_payable, currencyCode)}</DetailField>
                  <DetailField label="Balance">{money(remainingBalance, currencyCode)}</DetailField>
                </div>
                {primaryVoucher.status === 'DRAFT' ? (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={handleConfirmVoucher} disabled={busy}>
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Submit for Approval
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-amber-800">Pending Approval</p>
                      <p className="text-[10px] text-amber-700">Voucher {primaryVoucher.voucher_number} is awaiting approval from Workflow Approval.</p>
                    </div>
                    <a href="/workflow-approval" className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 transition-colors">
                      View Approvals
                    </a>
                  </div>
                )}
              </div>
            ) : canRecordPayment ? (
              <div className="grid gap-2 rounded-md border border-dashed border-[#d8e2ef] bg-white px-3 py-2 sm:grid-cols-2">
                <Field label="Amount">
                  <Input type="number" min="0.01" step="0.01" max={remainingBalance} value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                </Field>
                <Field label="Date">
                  <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                </Field>
                <Field label="Method">
                  <Select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                    {PAYMENT_METHODS.map(method => <option key={method} value={method}>{statusLabel(method)}</option>)}
                  </Select>
                </Field>
                <div className="space-y-1 sm:col-span-2">
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
                <div className="flex items-end">
                  <Button size="sm" className="w-full" onClick={handleRecordBillPayment} disabled={busy}>
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />} Record Payment
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-[#d8e2ef] bg-white px-3 py-2 text-xs text-slate-500">
                {remainingBalance <= 0 ? 'This bill is fully paid.' : 'Send the voucher for approval before recording payment.'}
              </div>
            )}

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Payments</p>
              {(bill.payments || []).length === 0 ? (
                <EmptyState title="No payments recorded" icon={Banknote} />
              ) : (
                <div className="space-y-2">
                  {bill.payments.map(payment => (
                    <div key={payment.payment_id} className="flex items-center justify-between rounded-md border border-[#e3ecf8] bg-white px-3 py-1.5 text-sm">
                      <span className="text-slate-600">{formatDate(payment.payment_date)} · {statusLabel(payment.payment_method)}</span>
                      {payment.payment_file_name && (
                        <span className="min-w-0 truncate text-[11px] text-slate-500">{payment.payment_file_name}</span>
                      )}
                      <span className="font-semibold text-slate-800">{money(payment.payment_amount, currencyCode)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Checks</p>
              {(bill.checks || []).length === 0 ? (
                <p className="rounded-md border border-[#e3ecf8] bg-white px-3 py-2 text-xs text-slate-500">No checks linked to this bill.</p>
              ) : (
                <div className="space-y-2">
                  {bill.checks.map(check => (
                    <div key={check.check_id} className="flex items-center justify-between gap-3 rounded-md border border-[#e3ecf8] bg-white px-3 py-1.5 text-sm">
                      <span>
                        <span className="block font-mono text-xs font-semibold text-[#26324f]">{check.check_number}</span>
                        <span className="block text-[11px] text-slate-500">{formatDate(check.check_date)} · {check.bank || '-'}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{money(check.check_amount, currencyCode)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>

          {/* Related Records */}
          {bill.related && Object.keys(bill.related).length > 0 && (
            <div className="rounded-md border border-[#e3ecf8] bg-white p-3">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Related Records</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

                {/* Purchase Request */}
                {bill.related.purchase_request && (
                  <a href={`/purchasing/requests/${bill.related.purchase_request.purchase_request_id}`} className="flex items-center gap-3 rounded-lg border border-[#e3ecf8] bg-[#f6f8fc] px-3 py-2.5 transition-colors hover:border-[var(--color-primary)]/30 hover:bg-[#edf4fb]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                      <FileText size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">{bill.related.purchase_request.pr_number}</p>
                      <p className="text-[10px] text-slate-500">Purchase Request</p>
                    </div>
                    <StatusBadge status={bill.related.purchase_request.status} />
                  </a>
                )}

                {/* Purchase Order */}
                {bill.related.purchase_order && (
                  <a href={`/purchasing/orders?highlight=${encodeURIComponent(bill.related.purchase_order.po_number)}`} className="flex items-center gap-3 rounded-lg border border-[#e3ecf8] bg-[#f6f8fc] px-3 py-2.5 transition-colors hover:border-[var(--color-primary)]/30 hover:bg-[#edf4fb]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                      <FileText size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">{bill.related.purchase_order.po_number}</p>
                      <p className="text-[10px] text-slate-500">Purchase Order{bill.related.purchase_order.delivery_date ? ` · Delivery ${new Date(bill.related.purchase_order.delivery_date).toLocaleDateString()}` : ''}</p>
                    </div>
                    <StatusBadge status={bill.related.purchase_order.status} />
                  </a>
                )}

                {/* Goods Receipts */}
                {(bill.related.goods_receipts || []).map(gr => (
                  <a key={gr.goods_receipt_id} href={`/inventory/deliveries?highlight=${encodeURIComponent(gr.receipt_number || gr.dr_number || '')}`} className="flex items-center gap-3 rounded-lg border border-[#e3ecf8] bg-[#f6f8fc] px-3 py-2.5 transition-colors hover:border-[var(--color-primary)]/30 hover:bg-[#edf4fb]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Banknote size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">{gr.receipt_number || gr.dr_number}</p>
                      <p className="text-[10px] text-slate-500">Goods Receipt{gr.received_date ? ` · ${new Date(gr.received_date).toLocaleDateString()}` : ''}</p>
                    </div>
                    <StatusBadge status={gr.status} />
                  </a>
                ))}

                {/* Tax Forms */}
                {(bill.related.tax_forms || []).map(tf => (
                  <a key={tf.form_record_id} href={`/tax/forms/${tf.form_type}/${tf.form_record_id}`} className="flex items-center gap-3 rounded-lg border border-[#e3ecf8] bg-[#f6f8fc] px-3 py-2.5 transition-colors hover:border-[var(--color-primary)]/30 hover:bg-[#edf4fb]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <FileText size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">BIR {tf.form_type}{tf.form_code ? ` · ${tf.form_code}` : ''}</p>
                      <p className="text-[10px] text-slate-500">{tf.period_from} to {tf.period_to}</p>
                    </div>
                    <StatusBadge status={tf.status} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
        </CardContent>
        {footer && (
          <div className="border-t border-[#d8e2ef] bg-white px-4 py-3">
            {footer}
          </div>
        )}
      </Card>
    </div>
  )
}

export function APBillDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  return <BillDetailDrawer billId={id} onClose={() => navigate('/accounts-payable/bills')} />
}
