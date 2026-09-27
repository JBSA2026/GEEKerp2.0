import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Loader2, Calculator, Paperclip, Upload, Trash2, ExternalLink } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorBox, Loading } from '@/components/ui/feedback'
import { Field, Input, Select } from '@/components/ui/form'
import { money } from '@/components/aprar/format'
import {
  addArInvoiceAttachment,
  confirmArInvoice,
  fetchArInvoice,
  recordArCollection,
} from '@/utils/api'
import {
  PAYMENT_METHODS,
  arInvoiceDisplayStatus,
  statusLabel,
  formatDate,
  dueLabel,
  fileTypeFromName,
  DetailField,
  CollectionHistory,
} from './arUtils'

function InvoiceAmountBreakdown({ invoice, collected, balance }) {
  const vatExclusive = Number(invoice?.billing_subtotal || 0)
  const vatOutput = Number(invoice?.vat_output || 0)
  const gross = Number(invoice?.gross_amount || 0)
  const wht = Number(invoice?.wht_amount || 0)
  const netCollectible = Math.max(gross - wht, 0)

  return (
    <div className="space-y-1 rounded-md border border-[#e3ecf8] bg-[#f6f8fc] px-3 py-2 text-sm">
      <div className="flex justify-between text-slate-600"><span>VAT Exclusive</span><span>{money(vatExclusive)}</span></div>
      <div className="flex justify-between text-slate-600"><span>VAT Output</span><span>{money(vatOutput)}</span></div>
      <div className="flex justify-between text-slate-600"><span>Gross Amount</span><span>{money(gross)}</span></div>
      <div className="flex justify-between text-slate-600"><span>Withholding (WHT)</span><span>- {money(wht)}</span></div>
      <div className="flex justify-between border-t border-[#d8e2ef] pt-1.5 font-semibold text-slate-900"><span>Net Collectible</span><span>{money(netCollectible)}</span></div>
      <div className="flex justify-between text-slate-600"><span>Collections Recorded</span><span>{money(collected)}</span></div>
      <div className="flex justify-between border-t border-[#d8e2ef] pt-1.5 font-semibold text-slate-900"><span>Remaining Balance</span><span>{money(balance)}</span></div>
    </div>
  )
}

function Received2307Section({ invoice, onUpdate }) {
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const hasFile = !!invoice?.received_2307_url

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    setUploading(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/tax/received-2307/${invoice.invoice_id}/upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
          body: formData,
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Upload failed')
      }
      onUpdate()
    } catch (err) {
      alert(err.message || 'Failed to upload 2307')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDelete() {
    if (!confirm('Remove the uploaded 2307 file?')) return
    setDeleting(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/tax/received-2307/${invoice.invoice_id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Delete failed')
      }
      onUpdate()
    } catch (err) {
      alert(err.message || 'Failed to remove 2307')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-lg border border-[#d8e2ef] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5 mb-2">
        <FileText size={12} /> Received BIR 2307
      </p>
      <p className="text-[11px] text-slate-500 mb-2">
        Certificate issued by the client for taxes withheld from this invoice.
      </p>

      {hasFile ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <FileText size={14} className="text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-emerald-800 truncate">2307 Uploaded</p>
            {invoice.received_2307_uploaded_at && (
              <p className="text-[10px] text-emerald-600">
                {new Date(invoice.received_2307_uploaded_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <a
            href={invoice.received_2307_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-emerald-100 text-emerald-700"
            title="View file"
          >
            <ExternalLink size={14} />
          </a>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1 rounded hover:bg-red-100 text-red-500 disabled:opacity-50"
            title="Remove file"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      ) : (
        <label className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
          {uploading ? (
            <Loader2 size={16} className="animate-spin text-blue-500" />
          ) : (
            <Upload size={16} className="text-slate-400" />
          )}
          <span className="text-xs text-slate-600">
            {uploading ? 'Uploading...' : 'Upload received 2307 (PDF, JPG, PNG)'}
          </span>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      )}
    </div>
  )
}

export function ARInvoiceDetail() {
  const { id: invoiceId } = useParams()
  const navigate = useNavigate()

  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [attachmentForm, setAttachmentForm] = useState({ file_name: '', file_ref: '', file_type: 'PDF' })
  const [form, setForm] = useState({
    collection_amount: '',
    collection_date: new Date().toISOString().slice(0, 10),
    payment_method: 'CASH',
    or_number: '',
  })
  const [taxForms, setTaxForms] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInvoice(await fetchArInvoice(invoiceId))
    } catch (err) {
      setError(err.message || 'Unable to load invoice')
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  // Fetch related tax forms (2307)
  useEffect(() => {
    if (!invoiceId) return
    fetch(`${import.meta.env.VITE_API_URL}/tax/bir-forms/by-invoice/${invoiceId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setTaxForms(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [invoiceId, invoice?.lifecycle_status])

  const collections = invoice?.collections || []
  const collected = collections.reduce((sum, row) => sum + Number(row.collection_amount || 0), 0)
  const balance = Math.max(Number(invoice?.gross_amount || 0) - Number(invoice?.wht_amount || 0) - collected, 0)
  const currentStatus = arInvoiceDisplayStatus(invoice)
  const isFullyPaid = invoice?.collection_status === 'PAID' || balance <= 0
  const canCollect = invoice?.lifecycle_status !== 'DRAFT' && invoice?.collection_status !== 'PAID' && balance > 0
  const canConfirm = invoice?.lifecycle_status === 'DRAFT'

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function handleAttachmentFile(file) {
    if (!file) return
    setAttachmentForm({
      file_name: file.name,
      file_ref: file.name,
      file_type: fileTypeFromName(file.name),
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
      await addArInvoiceAttachment(invoiceId, {
        file_name: attachmentForm.file_name.trim(),
        file_ref: attachmentForm.file_ref.trim() || attachmentForm.file_name.trim(),
        file_type: attachmentForm.file_type,
      })
      setAttachmentForm({ file_name: '', file_ref: '', file_type: 'PDF' })
      await load()
      setNotice('Invoice document attached.')
    } catch (err) {
      setError(err.message || 'Unable to attach document')
    } finally {
      setAttaching(false)
    }
  }

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await confirmArInvoice(invoiceId)
      setInvoice(updated)
      setNotice('Invoice confirmed and opened in Accounts Receivable.')
    } catch (err) {
      setError(err.message || 'Unable to confirm invoice')
    } finally {
      setBusy(false)
    }
  }

  async function handleCollection(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await recordArCollection({
        invoice_id: invoice.invoice_id,
        collection_amount: Number(form.collection_amount || 0),
        collection_date: form.collection_date,
        payment_method: form.payment_method,
        or_number: form.or_number.trim() || null,
      })
      setInvoice(result.invoice)
      setForm({
        collection_amount: '',
        collection_date: new Date().toISOString().slice(0, 10),
        payment_method: 'CASH',
        or_number: '',
      })
      setNotice('Collection recorded.')
    } catch (err) {
      setError(err.message || 'Unable to record collection')
    } finally {
      setBusy(false)
    }
  }

  function handleBack() {
    navigate('/accounts-receivable/invoices')
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[#d8e2ef] bg-[#f6f8fc] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={handleBack}>
                <ArrowLeft size={14} /> Back
              </Button>
              <div className="min-w-0">
                <CardTitle className="break-all text-base">{invoice?.invoice_number || 'Invoice'}</CardTitle>
                <p className="text-xs text-slate-500">{invoice?.customer_name || invoice?.sales_order_ref || ''}</p>
                {collections.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {collections.filter(c => c.or_number).map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        OR: {c.or_number}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {invoice && (
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={currentStatus} />
                </div>
              )}
            </div>
            {canConfirm && (
              <Button type="button" size="md" onClick={handleConfirm} disabled={busy}>
                {busy ? <><Loader2 size={14} className="animate-spin" /> Confirming...</> : 'Confirm Invoice'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-3">
          {loading ? (
            <Loading label="Loading invoice..." />
          ) : error && !invoice ? (
            <ErrorBox message={error} onDismiss={() => setError(null)} />
          ) : invoice ? (
            <>
              {error && <ErrorBox message={error} onDismiss={() => setError(null)} />}
              {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

              <div className="grid gap-3 xl:grid-cols-2">
                <div className="space-y-3 rounded-md border border-[#e3ecf8] bg-white p-3">
                  <div className="grid grid-cols-2 gap-3 rounded-md border border-[#e3ecf8] px-3 py-2">
                    <DetailField label="Customer">{invoice.customer_name || '-'}</DetailField>
                    <DetailField label="Invoice Number" mono>{invoice.invoice_number || '-'}</DetailField>
                    <DetailField label="Invoice Date">{formatDate(invoice.invoice_date)}</DetailField>
                    <DetailField label="Aging Due Date">
                      <span>{formatDate(invoice.due_date)}</span>
                      <span className="ml-1 text-xs font-normal text-slate-500">({dueLabel(invoice.due_date)})</span>
                    </DetailField>
                    <DetailField label="Sales Ref" mono>{invoice.sales_order_ref || '-'}</DetailField>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Line Items</p>
                    <div className="rounded-md border border-[#e3ecf8]">
                      {(invoice.items || []).length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-slate-500">No invoice lines.</p>
                      ) : (
                        <div className="divide-y divide-[#e9eef8]">
                          {invoice.items.map(line => (
                            <div key={line.item_id} className="space-y-2 px-3 py-3 text-sm">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-800">{line.description}</p>
                                <p className="mt-0.5 truncate text-[11px] text-slate-500">{line.line_type}</p>
                              </div>
                              <div className="rounded-md bg-[#f6f8fc] px-3 py-2">
                                <div className="flex justify-between gap-3 text-xs text-slate-600">
                                  <span>VAT Exclusive</span>
                                  <span className="font-medium text-slate-800">{money(line.vat_exclusive_amount)}</span>
                                </div>
                                <div className="mt-1 flex justify-between gap-3 text-xs text-slate-600">
                                  <span>VAT Code</span>
                                  <span className="font-medium text-slate-800">{line.vat_code || '-'}</span>
                                </div>
                                <div className="mt-1 flex justify-between gap-3 text-xs text-slate-600">
                                  <span>WHT Code</span>
                                  <span className="font-medium text-slate-800">{line.wht_code || '-'}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <InvoiceAmountBreakdown invoice={invoice} collected={collected} balance={balance} />

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Documents</p>
                    <div className="space-y-2">
                      {(invoice.attachments || []).length === 0 ? (
                        <p className="rounded-md border border-[#e3ecf8] px-3 py-2 text-xs text-slate-500">No invoice documents attached.</p>
                      ) : (
                        invoice.attachments.map(file => (
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
                </div>

                <div className={`space-y-3 rounded-md border border-[#e3ecf8] bg-[#f6f8fc] p-3 ${invoice.lifecycle_status === 'DRAFT' ? 'opacity-80' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Collection</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {invoice.lifecycle_status === 'DRAFT'
                          ? 'Confirm the invoice to enable collection.'
                          : isFullyPaid
                          ? 'This invoice is fully collected.'
                          : 'Record customer collection against this invoice.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DetailField label="Remaining">{money(balance)}</DetailField>
                    </div>
                  </div>

                  {canCollect ? (
                    <form onSubmit={handleCollection} className="grid gap-2 rounded-md border border-dashed border-[#d8e2ef] bg-white px-3 py-2 sm:grid-cols-2">
                      <Field label="Amount">
                        <Input type="number" min="0.01" step="0.01" max={balance} value={form.collection_amount} onChange={e => setField('collection_amount', e.target.value)} required />
                      </Field>
                      <Field label="Date">
                        <Input type="date" value={form.collection_date} onChange={e => setField('collection_date', e.target.value)} required />
                      </Field>
                      <Field label="Method">
                        <Select value={form.payment_method} onChange={e => setField('payment_method', e.target.value)}>
                          {PAYMENT_METHODS.map(method => <option key={method} value={method}>{statusLabel(method)}</option>)}
                        </Select>
                      </Field>
                      <Field label="OR Number">
                        <Input value={form.or_number} onChange={e => setField('or_number', e.target.value)} placeholder="Optional" />
                      </Field>
                      <div className="flex items-end sm:col-span-2">
                        <Button type="submit" size="sm" className="w-full" disabled={busy}>
                          {busy ? <><Loader2 size={14} className="animate-spin" /> Recording...</> : 'Record Collection'}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="rounded-md border border-dashed border-[#d8e2ef] bg-white px-3 py-2 text-xs text-slate-500">
                      {isFullyPaid ? 'This invoice is fully paid.' : 'Confirm the invoice before recording collection.'}
                    </div>
                  )}

                  {/* Received BIR 2307 from Client */}
                  {Number(invoice?.wht_amount || 0) > 0 && (
                    <Received2307Section invoice={invoice} onUpdate={load} />
                  )}

                  {/* Related Tax Forms (BIR 2307) */}
                  {taxForms.length > 0 && (
                    <div className="rounded-lg border border-[#d8e2ef] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5 mb-2">
                        <Calculator size={12} /> Related Tax Forms
                      </p>
                      <div className="space-y-2">
                        {taxForms.map(tf => (
                          <div
                            key={tf.form_record_id}
                            onClick={() => navigate(`/tax/forms/2307/${tf.form_record_id}`)}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer hover:bg-white hover:border-blue-200 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-slate-800">BIR 2307</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{tf.payee_name} • {tf.period_from} to {tf.period_to}</p>
                            </div>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium ${
                              tf.status === 'FINALIZED' ? 'bg-emerald-50 text-emerald-700' :
                              tf.status === 'PENDING_APPROVAL' ? 'bg-amber-50 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>{tf.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
