import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, Search, Pencil, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet, apiPatch, inputCls, SectionHeader } from './taxUtils'

// Rates are stored as decimals (0.12 = 12%); the backend multiplies amounts by them directly.
const DESCRIPTIONS = {
  VAT_OUTPUT: 'VAT charged on sales invoices to customers',
  VAT_INPUT: 'VAT paid on purchase bills from suppliers',
  VAT_EXEMPT: 'Zero-rated or exempt transactions',
  WHT_MATERIAL_1: 'Withholding tax on material purchases',
  WHT_SERVICE_2: 'Withholding tax on services',
  NO_WHT: 'No withholding tax applied',
}
const USED_FOR = {
  VAT_OUTPUT: 'AR invoices — output VAT',
  VAT_INPUT: 'AP bills and supplier quotes — input VAT',
  VAT_EXEMPT: 'AR / AP — exempt lines',
  WHT_MATERIAL_1: 'AR invoices — customer withholds on materials',
  WHT_SERVICE_2: 'AR invoices — customer withholds on services',
  NO_WHT: 'AR invoices — no withholding',
}

const toPercent = (rate) => (Number(rate || 0) * 100).toFixed(2).replace(/\.?0+$/, '')

export function TaxCodes() {
  const [loading, setLoading] = useState(false)
  const [codes, setCodes] = useState([])
  const [search, setSearch] = useState('')
  const [editingCode, setEditingCode] = useState(null)
  const [editRate, setEditRate] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiGet('/tax/codes')
      setCodes(result?.codes || result || [])
    } catch (err) {
      notify.error(err.message || 'Failed to load tax codes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSave(code) {
    const pct = Number(editRate)
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      notify.error('Enter a rate between 0 and 100.')
      return
    }
    setSaving(true)
    try {
      await apiPatch(`/tax/codes/${code}`, { rate: Math.round(pct * 100) / 10000 })
      notify.success(`Tax code ${code} updated.`)
      setEditingCode(null)
      fetchData()
    } catch (err) {
      notify.error(err.message || 'Failed to update tax code')
    } finally {
      setSaving(false)
    }
  }

  const filtered = codes.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return [c.code, DESCRIPTIONS[c.code], c.tax_type, c.scope].some(v => (v || '').toLowerCase().includes(q))
  })

  const th = 'px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]'

  return (
    <div className="space-y-6">
      <SectionHeader title="Tax Codes">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input
              type="text"
              placeholder="Search codes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={inputCls + ' !w-[200px] !pl-8 !py-1.5'}
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </SectionHeader>

      <p className="text-xs text-[var(--color-muted-fg)]">
        These rates are applied to invoices, bills and supplier quotes. Changes affect new transactions only.
        Locked codes are fixed by the system.
      </p>

      {loading && !codes.length ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <th className={th}>Code</th>
                <th className={th}>Description</th>
                <th className={th}>Type</th>
                <th className={th + ' !text-right'}>Rate</th>
                <th className={th}>Scope</th>
                <th className={th}>Used for</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map(row => {
                const isEditing = editingCode === row.code
                return (
                  <tr key={row.code} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)]/50">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-[var(--color-text)]">{row.code}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text)]">{DESCRIPTIONS[row.code] || '—'}</td>
                    <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{row.tax_type || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--color-text)]">
                      {isEditing ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="number" step="0.01" min="0" max="100" autoFocus
                            value={editRate}
                            onChange={e => setEditRate(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSave(row.code); if (e.key === 'Escape') setEditingCode(null) }}
                            className="w-20 rounded border border-[var(--color-border)] px-2 py-1 text-right text-xs"
                          />
                          <span className="text-xs">%</span>
                        </span>
                      ) : (
                        <span className="font-semibold">{toPercent(row.rate)}%</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-muted-fg)]">{row.scope || 'BOTH'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{USED_FOR[row.code] || '—'}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {isEditing ? (
                        <span className="inline-flex gap-2">
                          <Button size="sm" onClick={() => handleSave(row.code)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingCode(null)} disabled={saving}>Cancel</Button>
                        </span>
                      ) : row.editable === false ? (
                        <Lock size={13} className="inline text-[var(--color-muted-fg)]" aria-label="Locked" />
                      ) : (
                        <button
                          type="button"
                          title="Edit rate"
                          onClick={() => { setEditingCode(row.code); setEditRate(toPercent(row.rate)) }}
                          className="text-[var(--color-muted-fg)] hover:text-[var(--color-primary)]"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--color-muted-fg)]">
                    {search ? 'No matching tax codes found.' : 'No tax codes configured yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
