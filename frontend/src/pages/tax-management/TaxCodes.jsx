import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, RefreshCw, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/utils/toast'
import { apiGet, entityParam, inputCls, SectionHeader } from './taxUtils'

export function TaxCodes() {
  const { entity } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [codes, setCodes] = useState([])
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiGet(`/tax/codes?${entityParam(entity).replace(/^&/, '')}`)
      setCodes(result?.codes || result || [])
    } catch (err) {
      notify.error(err.message || 'Failed to load tax codes')
    } finally {
      setLoading(false)
    }
  }, [entity])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = codes.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (c.code || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.tax_type || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <SectionHeader title="Tax Codes (ATC)">
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
          <Button size="sm">
            <Plus size={14} />
            <span className="ml-1.5">Add Code</span>
          </Button>
        </div>
      </SectionHeader>

      {loading && !codes.length ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Code</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Description</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Tax Type</th>
                <th className="px-4 py-2.5 text-right font-medium text-[var(--color-muted-fg)]">Rate (%)</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-fg)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map((row, i) => (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)]/50">
                  <td className="px-4 py-2.5 font-mono text-xs font-medium text-[var(--color-text)]">{row.code}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{row.description}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{row.tax_type}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-text)]">{row.rate != null ? `${row.rate}%` : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {row.active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted-fg)]">
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
