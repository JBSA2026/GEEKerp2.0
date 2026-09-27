import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { History, Loader2, GitCompare, ChevronLeft, ChevronRight, ArrowLeft, ArrowRight, Plus, Minus, Pencil, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BASE, authHeaders, money } from './quotationUtils'
import { calculateQuotationTotals, quotationUnitPrice } from '@/utils/quotationTotals'

// ─── Version Timeline ────────────────────────────────────────────────────────
function VersionTimeline({ versions, selectedVersions, onToggleSelect }) {
  return (
    <div className="relative space-y-2">
      {/* Continuous vertical line */}
      {versions.length > 1 && (
        <div className="absolute left-[5px] top-[20px] bottom-[20px] w-px bg-[var(--color-border)]" />
      )}
      {versions.map(v => {
        const isSelected = selectedVersions.includes(v.version_number)
        const author = v.employees
          ? `${v.employees.first_name} ${v.employees.last_name}`
          : 'System'

        return (
          <div key={v.version_id} className="relative flex gap-3">
            {/* Dot */}
            <div className="relative z-10 flex items-center">
              <div className={cn(
                'w-[11px] h-[11px] rounded-full border-2 shrink-0',
                isSelected
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-white'
              )} />
            </div>

            {/* Clickable card */}
            <button
              type="button"
              onClick={() => onToggleSelect(v.version_number)}
              className={cn(
                'flex-1 text-left rounded-lg border px-3 py-2.5 transition-all cursor-pointer',
                isSelected
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]/20'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-2)]'
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                  isSelected
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-muted-fg)]'
                )}>
                  {v.version_number}
                </span>
                <span className="text-xs font-semibold text-[var(--color-text)]">
                  Version {v.version_number}
                </span>
                {isSelected && (
                  <span className="ml-auto text-[9px] font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-1.5 py-0.5 rounded">
                    Selected
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-muted-fg)] mt-1">
                {v.change_summary || 'No description'}
              </p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                {author} • {new Date(v.created_at).toLocaleString()}
              </p>
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Diff Comparison View ────────────────────────────────────────────────────
function ComparisonView({ comparison, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-[var(--color-muted)]" />
        <span className="text-sm text-[var(--color-muted)] ml-2">Loading comparison...</span>
      </div>
    )
  }

  if (!comparison) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GitCompare size={32} className="text-[var(--color-muted)] mb-2" />
        <p className="text-sm text-[var(--color-muted-fg)]">Select two versions to compare</p>
        <p className="text-[11px] text-[var(--color-muted)] mt-1">Click the version numbers on the timeline</p>
      </div>
    )
  }

  const { diff, version_a, version_b } = comparison

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-[var(--color-muted-fg)]">
        <span className="font-medium text-[var(--color-text)]">v{version_a.version_number}</span>
        <ArrowRight size={12} />
        <span className="font-medium text-[var(--color-text)]">v{version_b.version_number}</span>
        {diff.totals.delta !== 0 && (
          <span className={cn(
            'ml-auto font-medium',
            diff.totals.delta > 0 ? 'text-emerald-600' : 'text-rose-600'
          )}>
            {diff.totals.delta > 0 ? '+' : ''}{money(diff.totals.delta)}
          </span>
        )}
      </div>

      {/* Header field changes */}
      {diff.header_changes.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase mb-2">Terms & Header Changes</p>
          <div className="space-y-1.5">
            {diff.header_changes.map((change, i) => (
              <div key={i} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
                <p className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase">{change.field.replace(/_/g, ' ')}</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-rose-600 line-through flex-1 break-words">
                    {change.old || '(empty)'}
                  </span>
                  <span className="text-xs text-emerald-600 flex-1 break-words">
                    {change.new || '(empty)'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Item changes */}
      {diff.item_changes.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-[var(--color-muted-fg)] uppercase mb-2">Line Item Changes</p>
          <div className="space-y-1.5">
            {diff.item_changes.map((change, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg border px-3 py-2',
                  change.type === 'added' && 'border-emerald-200 bg-emerald-50/50',
                  change.type === 'removed' && 'border-rose-200 bg-rose-50/50',
                  change.type === 'modified' && 'border-amber-200 bg-amber-50/50',
                )}
              >
                <div className="flex items-center gap-2">
                  {change.type === 'added' && <Plus size={12} className="text-emerald-600" />}
                  {change.type === 'removed' && <Minus size={12} className="text-rose-600" />}
                  {change.type === 'modified' && <Pencil size={12} className="text-amber-600" />}
                  <span className="text-xs font-medium text-[var(--color-text)]">
                    Line {change.line_no}
                    {change.item?.description && ` — ${change.item.description}`}
                  </span>
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto',
                    change.type === 'added' && 'bg-emerald-100 text-emerald-700',
                    change.type === 'removed' && 'bg-rose-100 text-rose-700',
                    change.type === 'modified' && 'bg-amber-100 text-amber-700',
                  )}>
                    {change.type}
                  </span>
                </div>
                {change.type === 'modified' && change.changes && (
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {Object.entries(change.changes).map(([field, vals]) => (
                      <div key={field} className="text-[11px]">
                        <span className="text-[var(--color-muted-fg)]">{field}: </span>
                        <span className="text-rose-600 line-through">{vals.old ?? '—'}</span>
                        {' → '}
                        <span className="text-emerald-600">{vals.new ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals summary */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
        <p className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase mb-1">Subtotal Comparison</p>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-[var(--color-muted-fg)]">v{version_a.version_number}: <span className="text-[var(--color-text)] font-medium">{money(diff.totals.subtotal_a)}</span></span>
          <ArrowRight size={12} className="text-[var(--color-muted)]" />
          <span className="text-[var(--color-muted-fg)]">v{version_b.version_number}: <span className="text-[var(--color-text)] font-medium">{money(diff.totals.subtotal_b)}</span></span>
        </div>
      </div>

      {/* No changes state */}
      {diff.header_changes.length === 0 && diff.item_changes.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-[var(--color-muted)]">No differences found between these versions.</p>
        </div>
      )}
    </div>
  )
}

// ─── Full Document View with Next/Previous ───────────────────────────────────
function DocumentView({ versions, currentIndex, onNavigate }) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)

  const version = versions[currentIndex]
  const quotationId = version?.quotation_id

  useEffect(() => {
    if (!version) return undefined
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`${BASE}/quotations/${quotationId}/versions/${version.version_number}`, { headers: authHeaders() })
        .then(res => res.ok ? res.json() : null)
        .then(data => setSnapshot(data?.snapshot || null))
        .catch(() => setSnapshot(null))
        .finally(() => setLoading(false))
    }, 0)
    return () => clearTimeout(timer)
  }, [version, quotationId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-[var(--color-muted)]" />
      </div>
    )
  }

  if (!snapshot) {
    return <p className="text-sm text-[var(--color-muted)] text-center py-8">Could not load version snapshot.</p>
  }

  const items = snapshot.items || []
  const totals = calculateQuotationTotals(snapshot, items)

  return (
    <div className="space-y-4">
      {/* Navigation bar */}
      <div className="flex items-center justify-between bg-[var(--color-surface-2)] rounded-lg px-4 py-2 border border-[var(--color-border)]">
        <button
          onClick={() => onNavigate(currentIndex + 1)}
          disabled={currentIndex >= versions.length - 1}
          className="flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] disabled:text-[var(--color-muted)] disabled:cursor-not-allowed hover:underline"
        >
          <ChevronLeft size={14} /> Previous
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold text-[var(--color-text)]">
            Version {version.version_number}
          </p>
          <p className="text-[10px] text-[var(--color-muted-fg)]">
            {version.change_summary || 'No description'} • {new Date(version.created_at).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={() => onNavigate(currentIndex - 1)}
          disabled={currentIndex <= 0}
          className="flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] disabled:text-[var(--color-muted)] disabled:cursor-not-allowed hover:underline"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>

      {/* Document preview */}
      <div className="border border-[var(--color-border)] rounded-lg bg-white overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">{snapshot.quotation_no}</p>
              <p className="text-xs text-slate-500 mt-0.5">{snapshot.project_name}</p>
            </div>
            <span className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded-full',
              snapshot.status === 'DRAFT' ? 'bg-slate-100 text-slate-600' :
              snapshot.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
              snapshot.status === 'SENT' ? 'bg-blue-100 text-blue-700' :
              'bg-slate-100 text-slate-600'
            )}>
              {(snapshot.status || 'DRAFT').replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Terms summary */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <span className="text-[var(--color-muted-fg)]">Validity: </span>
            <span className="text-[var(--color-text)]">{snapshot.validity_date || '—'}</span>
          </div>
          <div>
            <span className="text-[var(--color-muted-fg)]">Payment: </span>
            <span className="text-[var(--color-text)]">{snapshot.payment_terms || '—'}</span>
          </div>
          <div>
            <span className="text-[var(--color-muted-fg)]">Delivery: </span>
            <span className="text-[var(--color-text)]">{snapshot.delivery_terms || '—'}</span>
          </div>
          <div>
            <span className="text-[var(--color-muted-fg)]">VAT: </span>
            <span className="text-[var(--color-text)]">{snapshot.vat_rate}%</span>
            {snapshot.wht_rate > 0 && <span className="text-[var(--color-muted-fg)]"> | WHT: {snapshot.wht_rate}%</span>}
          </div>
        </div>

        {/* Items table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 border-b border-[var(--color-border)]">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-8">#</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600">Description</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600 w-16">Qty</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-12">UoM</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600 w-24">Unit Price</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600 w-16">Disc %</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600 w-24">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const unitPrice = quotationUnitPrice(item)
                const discountPercent = Math.min(Math.max(Number(item.discount_percent) || 0, 0), 100)
                const lineTotal = unitPrice * (Number(item.quantity) || 0) * (1 - discountPercent / 100)
                return (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-1.5 text-slate-400">{item.line_no || idx + 1}</td>
                    <td className="px-3 py-1.5 text-slate-800">{item.description || '—'}</td>
                    <td className="px-3 py-1.5 text-right text-slate-800">{item.quantity}</td>
                    <td className="px-3 py-1.5 text-slate-600">{item.uom}</td>
                    <td className="px-3 py-1.5 text-right text-slate-800">{money(unitPrice)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{discountPercent > 0 ? `${discountPercent}%` : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-slate-800">{money(lineTotal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <div className="ml-auto max-w-[250px] space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-slate-500">Gross subtotal</span><span className="font-medium text-slate-800">{money(totals.grossSubtotal)}</span></div>
            {totals.itemDiscountAmount > 0 && <div className="flex justify-between"><span className="text-slate-500">Line discounts</span><span className="text-rose-600">-{money(totals.itemDiscountAmount)}</span></div>}
            {totals.discountAmount > 0 && <div className="flex justify-between"><span className="text-slate-500">Additional discount</span><span className="text-rose-600">-{money(totals.discountAmount)}</span></div>}
            <div className="flex justify-between"><span className="text-slate-500">Total vatable</span><span className="text-slate-800">{money(totals.taxableSubtotal)}</span></div>
            {totals.shippingCost > 0 && <div className="flex justify-between"><span className="text-slate-500">Shipping</span><span className="text-slate-800">{money(totals.shippingCost)}</span></div>}
            {totals.othersCost > 0 && <div className="flex justify-between"><span className="text-slate-500">Others</span><span className="text-slate-800">{money(totals.othersCost)}</span></div>}
            {totals.vatAmount > 0 && <div className="flex justify-between"><span className="text-slate-500">VAT ({snapshot.vat_rate}%)</span><span className="text-slate-800">{money(totals.vatAmount)}</span></div>}
            {totals.whtAmount > 0 && <div className="flex justify-between"><span className="text-slate-500">WHT ({snapshot.wht_rate}%)</span><span className="text-rose-600">-{money(totals.whtAmount)}</span></div>}
            <div className="flex justify-between pt-1 border-t border-slate-200"><span className="font-semibold text-slate-700">Grand Total</span><span className="font-bold text-slate-900">{money(totals.grandTotal)}</span></div>
          </div>
        </div>

        {/* Notes */}
        {snapshot.notes && (
          <div className="border-t border-[var(--color-border)] px-4 py-2 text-[11px] text-slate-500 italic">
            {snapshot.notes}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export function QuotationVersions() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedVersions, setSelectedVersions] = useState([])
  const [comparison, setComparison] = useState(null)
  const [comparing, setComparing] = useState(false)
  const [viewMode, setViewMode] = useState('diff') // 'diff' | 'document'
  const [docIndex, setDocIndex] = useState(0)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`${BASE}/quotations/${id}/versions`, { headers: authHeaders() })
        if (res.ok) setVersions(await res.json())
      } finally { setLoading(false) }
    }
    if (id) load()
  }, [id])

  const handleToggleSelect = useCallback((versionNumber) => {
    setSelectedVersions(prev => {
      if (prev.includes(versionNumber)) {
        return prev.filter(v => v !== versionNumber)
      }
      if (prev.length >= 2) {
        return [prev[1], versionNumber]
      }
      return [...prev, versionNumber]
    })
  }, [])

  // Auto-compare when two versions are selected
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedVersions.length !== 2) {
        setComparison(null)
        return
      }
      const [v1, v2] = [...selectedVersions].sort((a, b) => a - b)
      setComparing(true)
      fetch(`${BASE}/quotations/${id}/versions/compare?v1=${v1}&v2=${v2}`, { headers: authHeaders() })
        .then(res => res.ok ? res.json() : null)
        .then(setComparison)
        .catch(() => setComparison(null))
        .finally(() => setComparing(false))
    }, 0)
    return () => clearTimeout(timer)
  }, [selectedVersions, id])

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#1a3fad]" size={24} /></div>
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col p-6 gap-4 overflow-y-auto">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate(`../${id}`)}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
        <h2 className="text-lg font-bold text-[var(--color-text)]">Version History</h2>
        <span className="text-xs text-[var(--color-muted-fg)] bg-[var(--color-surface-2)] px-2 py-0.5 rounded-full">
          {versions.length} version{versions.length !== 1 ? 's' : ''}
        </span>
        {/* View mode toggle */}
        {versions.length > 0 && (
          <div className="ml-auto flex items-center rounded-lg border border-[var(--color-border)] overflow-hidden">
            <button
              onClick={() => setViewMode('diff')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
                viewMode === 'diff'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]'
              )}
            >
              <GitCompare size={12} /> Diff
            </button>
            <button
              onClick={() => setViewMode('document')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
                viewMode === 'document'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted-fg)] hover:bg-[var(--color-surface-2)]'
              )}
            >
              <FileText size={12} /> Document
            </button>
          </div>
        )}
      </div>

      {versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <History size={32} className="text-[var(--color-muted)] mb-3" />
          <p className="text-sm text-[var(--color-muted-fg)]">No version history yet</p>
          <p className="text-[11px] text-[var(--color-muted)] mt-1">Versions are saved automatically when the quotation is edited or changes status.</p>
        </div>
      ) : viewMode === 'diff' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          {/* Left: Timeline */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-xs font-semibold text-[var(--color-muted-fg)] uppercase mb-3">
              Timeline {selectedVersions.length > 0 && `(${selectedVersions.length}/2 selected)`}
            </p>
            <VersionTimeline
              versions={versions}
              selectedVersions={selectedVersions}
              onToggleSelect={handleToggleSelect}
            />
          </div>

          {/* Right: Comparison */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="text-xs font-semibold text-[var(--color-muted-fg)] uppercase mb-3 flex items-center gap-2">
              <GitCompare size={12} /> Comparison
            </p>
            <ComparisonView comparison={comparison} loading={comparing} />
          </div>
        </div>
      ) : (
        /* Document view with next/prev navigation */
        <div className="max-w-4xl mx-auto w-full">
          <DocumentView
            versions={versions}
            currentIndex={docIndex}
            onNavigate={(idx) => setDocIndex(Math.max(0, Math.min(versions.length - 1, idx)))}
          />
        </div>
      )}
    </main>
  )
}
