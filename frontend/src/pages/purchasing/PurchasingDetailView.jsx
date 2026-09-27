// ─── PurchasingDetail — Workflow step-through detail view for a PR ────────────
import { useState } from 'react'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import {
  AlertCircle, ArrowLeft, Check, Loader2, Pencil, Plus, Send,
  PackageCheck, ShoppingBag, Trash2
} from 'lucide-react'
import {
  money, qty, displayInventoryCode, purchaseSourceCurrency, purchaseSourceLabel, statusLabel,
  DETAIL_ITEMS_GRID, COMPARISON_GRID, PO_ITEM_GRID
} from './purchasingUtils'

function vatBreakdownLabel(quote) {
  const landingCost = Number(quote?.landing_cost || 0)
  const storedVat = Number(quote?.vat_amount || 0)
  const rate = landingCost > 0
    ? storedVat / landingCost
    : quote?.vat_code === 'VAT_INPUT' ? 0.12 : 0
  const percent = Number((rate * 100).toFixed(2))
  return `${quote?.vat_code === 'VAT_INPUT' ? 'Vatable' : 'VAT Exempt'} (${percent}%)`
}

// ─── Step definitions for purchasing workflow ────────────────────────────────
const WORKFLOW_STEPS = [
  { id: 'pr', label: 'Purchase Request', shortLabel: 'PR' },
  { id: 'rfq', label: 'Request for Quotation', shortLabel: 'RFQ' },
  { id: 'comparison', label: 'Supplier Comparison', shortLabel: 'Compare' },
  { id: 'po', label: 'Purchase Order', shortLabel: 'PO' },
  { id: 'delivery', label: 'Pending Stock', shortLabel: 'Stock' },
  { id: 'ap', label: 'Accounts Payable', shortLabel: 'AP' },
]

function getCompletedSteps(pr) {
  const purchaseOrders = pr.purchase_orders || []
  const hasPurchaseOrder = purchaseOrders.length > 0
  const hasSentPurchaseOrder = purchaseOrders.some(po => ['PO_SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status))

  return {
    pr: Boolean(pr),
    rfq: (pr.rfqs || []).length > 0,
    comparison: (pr.quotes || []).some(q => q.status === 'SELECTED'),
    poGenerated: hasPurchaseOrder,
    po: hasSentPurchaseOrder,
    delivery: purchaseOrders.some(po => ['PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status)),
    ap: purchaseOrders.some(po => (po.billing_status || 'NOT_BILLED') !== 'NOT_BILLED'),
  }
}

function getCurrentStepIndex(completed) {
  if (completed.ap) return 5
  if (completed.delivery) return 5
  if (completed.po) return 4
  if (completed.poGenerated) return 3
  if (completed.comparison) return 3
  if (completed.rfq) return 2
  return 0
}

function WorkflowStepper({ activeStep, onStepClick, completed }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {WORKFLOW_STEPS.map((step, index) => {
        const isDone = completed[step.id]
        const isActive = index === activeStep
        const isAccessible = index === 0 || completed[WORKFLOW_STEPS[index - 1]?.id]
        const isLocked = !isAccessible && !isDone

        return (
          <div key={step.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => !isLocked && onStepClick(index)}
              disabled={isLocked}
              className={`group relative flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all ${
                isActive
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)] shadow-sm ring-1 ring-[var(--color-primary)]/20'
                  : isDone
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : isLocked
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                      : 'border-[#d8e2ef] bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                isDone
                  ? 'bg-emerald-500 text-white'
                  : isActive
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}>
                {isDone ? <Check size={11} /> : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{step.shortLabel}</span>
            </button>
            {index < WORKFLOW_STEPS.length - 1 && (
              <div className={`h-px w-4 shrink-0 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function PurchasingDetailView({ pr, onBack, onEdit, onAction, onDelete, saving = false }) {
  const latestRfq = pr.rfqs?.[0]
  const selectedQuote = pr.quotes?.find(quote => quote.status === 'SELECTED')
  const lowestQuote = pr.quotes?.[0]
  const summaryQuote = selectedQuote || lowestQuote
  const activePo = pr.purchase_orders?.[0]
  const currencyCode = pr.currency_code || purchaseSourceCurrency(pr.purchase_source)
  const completed = getCompletedSteps(pr)
  const autoStep = getCurrentStepIndex(completed)
  const [activeStep, setActiveStep] = useState(autoStep)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8 justify-center p-0" onClick={onBack} aria-label="Back to purchase list" title="Back to purchase list"><ArrowLeft size={15} /></Button>
        <div className="min-w-0">
          <h2 className="break-all text-lg font-bold leading-snug text-slate-900">{pr.pr_number}</h2>
          <p className="text-xs text-slate-500">Step-by-step purchase workflow</p>
        </div>
        <StatusBadge status={pr.status} />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onEdit}><Pencil size={13} /> Edit PR</Button>
        <Button variant="outline" size="sm" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={onDelete}><Trash2 size={13} /> Delete</Button>
      </div>

      {/* Step navigation */}
      <WorkflowStepper activeStep={activeStep} onStepClick={setActiveStep} completed={completed} />

      {/* Step content */}
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">

          {/* ─── Step 1: Purchase Request ─── */}
          {activeStep === 0 && (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Purchase Request Items</CardTitle>
                    <p className="mt-1 text-xs text-slate-500">Define what you need to purchase and estimated costs.</p>
                  </div>
                  {!selectedQuote && !activePo && (
                    <Button size="sm" onClick={() => { onAction('rfq'); setActiveStep(1) }}><Send size={14} /> Send RFQ →</Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 p-0">
                <div className="overflow-auto">
                  <div className={`grid ${DETAIL_ITEMS_GRID} min-w-[700px] gap-3 border-y border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
                    <span>Item</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">Est. Unit Cost</span><span className="text-right">PR Total</span>
                  </div>
                  <div className="divide-y divide-[#e3ecf8]">
                    {(pr.items || []).map(item => (
                      <div key={item.purchase_request_item_id} className={`grid ${DETAIL_ITEMS_GRID} min-w-[700px] gap-3 px-5 py-3 text-sm`}>
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-slate-900">{item.item_description}</p>
                          <p className="text-[11px] text-slate-500">{displayInventoryCode(item.product_code) || 'New item'}</p>
                          {pr.purchase_source === 'INTERCOMPANY' && item.seller_product_code && (
                            <p className="mt-1 text-[11px] text-blue-700">Seller stock: {displayInventoryCode(item.seller_product_code)}</p>
                          )}
                        </div>
                        <p className="text-right">{qty(item.quantity)}</p>
                        <p className="text-slate-600">{item.unit || '-'}</p>
                        <p className="text-right">{money(item.estimated_unit_cost, currencyCode)}</p>
                        <p className="text-right font-semibold text-[#26324f]">{money(item.pr_total, currencyCode)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
              {completed.rfq && (
                <div className="border-t border-[#e3ecf8] px-5 py-3">
                  <Button size="sm" onClick={() => setActiveStep(1)}>Next: View RFQ →</Button>
                </div>
              )}
            </Card>
          )}

          {/* ─── Step 2: RFQ ─── */}
          {activeStep === 1 && (
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Request for Quotation</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">Send RFQs to suppliers and collect their price quotes.</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(pr.rfqs || []).length === 0 ? (
                  <div className="py-8 text-center">
                    <EmptyState title="No RFQ created yet" icon={Send}>
                      Create an RFQ to request quotations from suppliers.
                    </EmptyState>
                    <Button size="sm" className="mt-4" onClick={() => onAction('rfq')}><Send size={14} /> Create RFQ</Button>
                  </div>
                ) : pr.rfqs.map(rfq => (
                  <div key={rfq.rfq_id} className="rounded-lg border border-[#d8e2ef] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{rfq.rfq_number}</p>
                      <StatusBadge status={rfq.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Due {rfq.due_date || '-'} · {(rfq.suppliers || []).length} suppliers invited</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(rfq.suppliers || []).map(supplier => (
                        <span key={supplier.rfq_supplier_id} className="rounded-full bg-[#edf4fb] px-2.5 py-1 text-[10px] font-medium text-slate-600">{supplier.supplier_name}</span>
                      ))}
                    </div>
                    {latestRfq && (
                      <div className="mt-4 flex gap-2">
                        <Button size="sm" onClick={() => onAction('quote', latestRfq)}><Plus size={14} /> Add Supplier Quote</Button>
                      </div>
                    )}
                  </div>
                ))}
                {(pr.quotes || []).length > 0 && (
                  <div className="border-t border-[#e3ecf8] pt-3">
                    <Button size="sm" onClick={() => setActiveStep(2)}>Next: Compare Quotes →</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ─── Step 3: Supplier Comparison ─── */}
          {activeStep === 2 && (
            <Card className="overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Supplier Comparison Matrix</CardTitle>
                    <p className="mt-1 text-xs text-slate-500">Compare quotes and select the best supplier.</p>
                  </div>
                  {latestRfq && <Button size="sm" variant="outline" onClick={() => onAction('quote', latestRfq)}><Plus size={14} /> Add Quote</Button>}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {(pr.quotes || []).length === 0 ? (
                  <EmptyState title="No supplier quotes yet" icon={ShoppingBag}>Go back to the RFQ step and add supplier quotes first.</EmptyState>
                ) : (
                  <div className="overflow-auto">
                    <div className={`grid ${COMPARISON_GRID} w-full min-w-0 gap-x-4 border-y border-[#d8e2ef] bg-[#edf4fb] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
                      <span>Supplier</span><span className="text-right">Quote</span><span className="text-right">Landed</span><span className="justify-self-end text-right">Delivery</span><span>Status</span><span className="text-right">Action</span>
                    </div>
                    <div className="divide-y divide-[#e3ecf8]">
                      {pr.quotes.map((quote, index) => (
                        <div key={quote.supplier_quotation_id}>
                          <div className={`grid ${COMPARISON_GRID} w-full min-w-0 items-center gap-x-4 px-5 py-3 text-sm`}>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{quote.supplier_name || 'Supplier'}</p>
                              <p className="truncate text-[11px] text-slate-500">{quote.quotation_number}{index === 0 && ' · lowest'}</p>
                            </div>
                            <p className="text-right">{money(quote.quotation_total, quote.currency_code || currencyCode)}</p>
                            <p className="text-right font-semibold text-[#26324f]">{money(quote.landed_quote_total, quote.currency_code || currencyCode)}</p>
                            <p className="justify-self-end text-right text-xs text-slate-600">{quote.delivery_date || '-'}</p>
                            <StatusBadge status={quote.status} />
                            <div className="flex justify-end gap-2">
                              {quote.status !== 'SELECTED' && <Button variant="outline" size="sm" onClick={() => onAction('selectQuote', quote)} disabled={saving}><Check size={13} /> Select</Button>}
                              {quote.status === 'SELECTED' && !activePo && <Button size="sm" onClick={() => onAction('generatePo', quote)} disabled={saving}>{saving ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : 'Generate PO'}</Button>}
                              {quote.status === 'SELECTED' && activePo && <span className="text-xs font-medium text-[#5f7590]">PO generated</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
              {completed.poGenerated && (
                <div className="border-t border-[#e3ecf8] px-5 py-3">
                  <Button size="sm" onClick={() => setActiveStep(3)}>Next: Purchase Order →</Button>
                </div>
              )}
            </Card>
          )}

          {/* ─── Step 4: Purchase Order ─── */}
          {activeStep === 3 && (
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Purchase Order</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">Send purchase orders after Workflow Approval approves them.</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(pr.purchase_orders || []).length === 0 ? (
                  <div className="py-8 text-center">
                    <EmptyState title="No purchase order generated" icon={ShoppingBag}>
                      {selectedQuote ? 'Generate a PO from the selected supplier quote.' : 'Go back and select a supplier quote first.'}
                    </EmptyState>
                  </div>
                ) : pr.purchase_orders.map(po => (
                  <div key={po.purchase_order_id} className="rounded-lg border border-[#d8e2ef] bg-white p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{po.po_number}</p>
                        <p className="text-xs text-slate-500">{po.supplier_name} · Delivery {po.delivery_date || '-'}</p>
                        {po.transaction_date && (
                          <p className="text-xs text-slate-500">
                            Transaction {po.transaction_date}
                            {po.fx_rate_to_php ? ` · FX: 1 ${po.currency_code || 'USD'} = PHP ${Number(po.fx_rate_to_php).toFixed(4)}` : ''}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={po.status} />
                      <div className="flex-1" />
                      <div className="flex flex-wrap justify-end gap-2">
                        {!['PO_SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status) && (
                          <Button
                            size="sm"
                            variant={po.status === 'APPROVED' ? 'default' : 'outline'}
                            onClick={() => onAction('poStatus', po, 'PO_SENT')}
                            disabled={saving || po.status !== 'APPROVED'}
                          >
                            <Send size={13} /> Send PO
                          </Button>
                        )}
                      </div>
                    </div>
                    {['DRAFT', 'SUBMITTED'].includes(po.status) && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>This purchase order must be approved in Workflow Approval before Send PO becomes available.</span>
                      </div>
                    )}
                    <div className="mt-4 overflow-auto rounded-lg border border-[#e3ecf8]">
                      <div className={`grid ${PO_ITEM_GRID} min-w-[620px] gap-3 border-b border-[#e3ecf8] bg-[#edf4fb] px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
                        <span>Item</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">Received</span><span className="text-right">PO Total</span>
                      </div>
                      <div className="divide-y divide-[#e3ecf8]">
                        {(po.items || []).map(item => (
                          <div key={item.purchase_order_item_id} className={`grid ${PO_ITEM_GRID} min-w-[620px] gap-3 px-3 py-2 text-xs`}>
                            <span className="min-w-0 break-words font-medium text-slate-700">
                              {item.item_description}
                              {pr.purchase_source === 'INTERCOMPANY' && item.seller_product_code && <span className="mt-1 block text-[10px] text-blue-700">Seller stock: {displayInventoryCode(item.seller_product_code)}</span>}
                              {!item.product_code && <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-amber-700">Auto code pending</span>}
                            </span>
                            <span className="text-right">Qty {qty(item.quantity)}</span>
                            <span>{item.unit || '-'}</span>
                            <span className="text-right">Received {qty(item.received_quantity)}</span>
                            <span className="text-right font-semibold text-[#26324f]">{money(item.landed_cost ?? item.po_total, currencyCode)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {activePo && ['PO_SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(activePo.status) && (
                  <div className="border-t border-[#e3ecf8] pt-3">
                    <Button size="sm" onClick={() => setActiveStep(4)}>Next: Pending Stock →</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ─── Step 5: Pending Stock ─── */}
          {activeStep === 4 && (
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Pending Stock</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">Open Inventory to receive and place incoming stock.</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {!activePo ? (
                  <EmptyState title="No purchase order yet" icon={PackageCheck}>Complete the previous steps first.</EmptyState>
                ) : (
                  <div className="rounded-lg border border-[#d8e2ef] bg-white p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{activePo.po_number}</p>
                        <p className="text-xs text-slate-500">{activePo.supplier_name} · Delivery {activePo.delivery_date || '-'}</p>
                      </div>
                      <StatusBadge status={activePo.status} />
                      <div className="flex-1" />
                      {['PO_SENT', 'PARTIALLY_RECEIVED'].includes(activePo.status) && (
                        <Button size="sm" onClick={() => onAction('inventoryPending', activePo)}><PackageCheck size={13} /> Go to Inventory</Button>
                      )}
                    </div>
                    <div className="mt-4 overflow-auto rounded-lg border border-[#e3ecf8]">
                      <div className={`grid ${PO_ITEM_GRID} min-w-[620px] gap-3 border-b border-[#e3ecf8] bg-[#edf4fb] px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600`}>
                        <span>Item</span><span className="text-right">Qty Ordered</span><span className="text-right">Received</span><span className="text-right">PO Total</span>
                      </div>
                      <div className="divide-y divide-[#e3ecf8]">
                        {(activePo.items || []).map(item => (
                          <div key={item.purchase_order_item_id} className={`grid ${PO_ITEM_GRID} min-w-[620px] gap-3 px-3 py-2.5 text-xs`}>
                            <span className="min-w-0 break-words font-medium text-slate-700">{item.item_description}</span>
                            <span className="text-right">{qty(item.quantity)}</span>
                            <span>{item.unit || '-'}</span>
                            <span className={`text-right font-semibold ${Number(item.received_quantity) >= Number(item.quantity) ? 'text-emerald-700' : 'text-amber-700'}`}>{qty(item.received_quantity)}</span>
                            <span className="text-right font-semibold text-[#26324f]">{money(item.landed_cost ?? item.po_total, currencyCode)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {completed.delivery && (
                  <div className="border-t border-[#e3ecf8] pt-3">
                    <Button size="sm" onClick={() => setActiveStep(5)}>Next: Accounts Payable →</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ─── Step 6: Accounts Payable ─── */}
          {activeStep === 5 && (
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Accounts Payable</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">Create a bill and manage payment to the supplier.</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {!activePo ? (
                  <EmptyState title="Receive stock first" icon={ShoppingBag}>Incoming stock must be received in Inventory before creating a payable.</EmptyState>
                ) : (
                  <div className="rounded-lg border border-[#d8e2ef] bg-white p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{activePo.po_number}</p>
                        <p className="text-xs text-slate-500">Billing Status: {statusLabel(activePo.billing_status || 'NOT_BILLED')}</p>
                      </div>
                      <StatusBadge status={activePo.billing_status || 'NOT_BILLED'} />
                      <div className="flex-1" />
                      {(activePo.can_create_draft_bill || (activePo.billing_status || 'NOT_BILLED') !== 'NOT_BILLED') && (
                        <Button size="sm" onClick={() => onAction('ap', activePo)}><ShoppingBag size={13} /> Open AP</Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Purchase Source</span><span className="font-semibold">{purchaseSourceLabel(pr.purchase_source)}</span></div>
              {pr.purchase_source === 'INTERCOMPANY' && (
                <div className="flex justify-between"><span className="text-slate-500">Selling Company</span><span className="text-right font-semibold">{pr.source_seller_entity || '—'}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">PR Total</span><span className="font-semibold">{money(pr.pr_total, currencyCode)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Estimated Item Cost</span><span className="font-semibold">{money(pr.pr_base_total ?? pr.pr_total, currencyCode)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Lowest Quote</span><span className="font-semibold">{lowestQuote ? money(lowestQuote.landed_quote_total, lowestQuote.currency_code || currencyCode) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Supplier</span><span className="text-right font-semibold text-sm">{selectedQuote?.supplier_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Required</span><span className="font-semibold">{pr.required_date || '—'}</span></div>
              {summaryQuote && (
                <div className="space-y-1.5 border-t border-[#e3ecf8] pt-3 text-xs">
                  <div className="flex justify-between"><span className="text-slate-500">Item Cost</span><span>{money(summaryQuote.quotation_total, summaryQuote.currency_code || currencyCode)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Shipping</span><span>{money(summaryQuote.freight, summaryQuote.currency_code || currencyCode)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Duties</span><span>{money(summaryQuote.duties, summaryQuote.currency_code || currencyCode)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Brokerage</span><span>{money(summaryQuote.other_charges, summaryQuote.currency_code || currencyCode)}</span></div>
                  <div className="flex justify-between border-t border-[#e3ecf8] pt-1.5"><span className="font-medium text-slate-700">Landing Cost</span><span className="font-semibold">{money(summaryQuote.landing_cost, summaryQuote.currency_code || currencyCode)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">{vatBreakdownLabel(summaryQuote)}</span><span>{money(summaryQuote.vat_amount, summaryQuote.currency_code || currencyCode)}</span></div>
                  <div className="flex justify-between border-t border-[#e3ecf8] pt-1.5"><span className="font-semibold text-slate-800">Total Landing Cost</span><span className="font-bold text-[#26324f]">{money(summaryQuote.landed_quote_total, summaryQuote.currency_code || currencyCode)}</span></div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
