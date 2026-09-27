import { useCallback, useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams, useOutletContext } from 'react-router-dom'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, Loader2, Plus, Search, Upload, X } from 'lucide-react'
import { BASE, authHeaders, STATUSES, statusLabel, StatusDropdown } from './quotationUtils'
import { useHighlightRow, highlightRowCls } from '@/hooks/useHighlightRow'
import * as XLSX from 'xlsx'

export function QuotationList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { entity } = useOutletContext()

  const [quotations, setQuotations] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Pipeline redirect state
  const [highlightClientId, setHighlightClientId] = useState(null)
  const [prefillData, setPrefillData] = useState(null)

  // Cross-module navigation highlight (from Workflow Approval etc.)
  const { highlightId, highlightRef, rowRef } = useHighlightRow(!loading && quotations.length > 0)

  const fileInputRef = useRef(null)

  const loadQuotations = useCallback(async () => {
    setLoading(true)
    try {
      const url = new URL(`${BASE}/quotations/`)
      if (search.trim()) url.searchParams.set('search', search)
      if (statusFilter !== 'All') url.searchParams.set('status', statusFilter)
      if (entity && entity !== 'All') url.searchParams.set('company', entity)
      const res = await fetch(url, { headers: authHeaders() })
      if (res.ok) setQuotations(await res.json())
    } finally { setLoading(false) }
  }, [search, statusFilter, entity])

  useEffect(() => {
    const timer = setTimeout(() => { void loadQuotations() }, 0)
    return () => clearTimeout(timer)
  }, [loadQuotations])

  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()

    const parseItems = (rows) => {
      // rows is an array of objects with normalized keys
      return rows.map(row => ({
        product_type: row.product_type || row.product_types || row.type || '',
        product_code: row.product_code || row.code || '',
        description: row.description || '',
        datasheet_link: row.datasheet_link || row.datasheet || row.link || '',
        quantity: Number(row.quantity || row.qty) || 1,
        uom: row.uom || row.unit || 'Nos',
        unit_cost: Number(row.unit_cost || row.cost || row.price) || 0,
        selling_price: Number(row.selling_price || row.unit_cost || row.cost || row.price) || 0,
        discount_percent: Number(row.discount_percent || row.discount) || 0,
        is_section: false,
        section_title: '',
        fulfillment_type: row.fulfillment_type || row.fulfillment || '',
      }))
    }

    const createQuotationFromItems = (items) => {
      if (items.length === 0) return
      // Navigate to create page with imported items in sessionStorage
      sessionStorage.setItem('importedQuotationItems', JSON.stringify(items))
      navigate('../new?from=import')
    }

    if (ext === 'csv') {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target.result
        const lines = text.split(/\r?\n/)
        if (lines.length < 2) return
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, '_'))
        const parsed = lines.slice(1).filter(r => r.trim()).map(row => {
          const cells = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
          const obj = {}
          headers.forEach((h, i) => { obj[h] = cells[i] || '' })
          return obj
        })
        createQuotationFromItems(parseItems(parsed))
      }
      reader.readAsText(file)
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
          const normalized = rows.map(obj => {
            const row = {}
            Object.keys(obj).forEach(k => { row[k.toLowerCase().replace(/\s+/g, '_')] = obj[k] })
            return row
          })
          createQuotationFromItems(parseItems(normalized))
        } catch (err) {
          console.error('Excel parse error:', err)
          alert('Failed to parse Excel file. Please check the file format.')
        }
      }
      reader.readAsArrayBuffer(file)
    }
    e.target.value = ''
  }

  // Handle redirect from Sales Pipeline — check URL params on mount
  useEffect(() => {
    const clientId = searchParams.get('client_id')
    const projectName = searchParams.get('project_name')
    const opportunityId = searchParams.get('opportunity_id')
    const from = searchParams.get('from')

    if (from === 'pipeline' && (clientId || projectName || opportunityId)) {
      const timer = setTimeout(() => {
        setSearchParams({}, { replace: true })
        setPrefillData({
          client_id: clientId ? Number(clientId) : null,
          project_name: projectName || '',
          opportunity_id: opportunityId ? Number(opportunityId) : null,
        })
        setHighlightClientId(clientId ? Number(clientId) : -1)
      }, 0)
      return () => clearTimeout(timer)
    }
    return undefined
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // After quotations load, decide: highlight existing or redirect to create
  useEffect(() => {
    if (!highlightClientId || loading) return
    if (!prefillData) return

    const projectName = (prefillData.project_name || '').toLowerCase().trim()
    let clientQuotation = null

    // Match by opportunity_id first (strongest link)
    if (prefillData.opportunity_id) {
      clientQuotation = quotations.find(q => q.opportunity_id === prefillData.opportunity_id)
    }

    // Then match by client_id + project_name
    if (!clientQuotation && projectName && prefillData.client_id) {
      clientQuotation = quotations.find(q =>
        q.client_id === prefillData.client_id &&
        (q.project_name || '').toLowerCase().trim() === projectName
      )
    }

    // Then match by project_name only
    if (!clientQuotation && projectName) {
      clientQuotation = quotations.find(q =>
        (q.project_name || '').toLowerCase().trim() === projectName
      )
    }

    if (!clientQuotation) {
      // No matching quotation — redirect to create view with params
      const params = new URLSearchParams()
      if (prefillData.client_id) params.set('client_id', prefillData.client_id)
      if (prefillData.project_name) params.set('project_name', prefillData.project_name)
      if (prefillData.opportunity_id) params.set('opportunity_id', prefillData.opportunity_id)
      navigate(`../new?${params.toString()}`, { replace: true })
    }
  }, [highlightClientId, quotations, loading, prefillData, navigate])

  return (
    <main className="flex min-h-0 flex-1 flex-col p-6 gap-4 overflow-hidden">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Pipeline context banner */}
        {highlightClientId && (
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3">
            <AlertCircle size={16} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700 flex-1">
              <span className="font-medium">From Sales Pipeline:</span> The highlighted quotation below needs to be <strong>approved and sent</strong> before the deal can advance. Click it to view details and take action.
            </p>
            <button onClick={() => setHighlightClientId(null)} className="text-amber-400 hover:text-amber-600"><X size={14} /></button>
          </div>
        )}
        {/* Toolbar */}
        <CardHeader className="!flex !flex-row !flex-wrap !items-center gap-3 border-b border-[#e2e8f0] !px-5 !py-3">
          <h2 className="text-sm font-bold text-slate-800 whitespace-nowrap">Quotation List</h2>
          <StatusDropdown value={statusFilter} onChange={setStatusFilter} options={STATUSES} labelFn={statusLabel} />
          <div className="flex-1" />
          <Button size="sm" onClick={() => navigate('../new')}><Plus size={14} className="mr-1" />Add Record</Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}><Upload size={14} className="mr-1" />Import</Button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleImportFile} className="hidden" />
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="rounded-lg border border-[#e2e8f0] bg-white pl-9 pr-3 py-1.5 text-xs placeholder:text-slate-400 outline-none focus:border-[#1a3fad] w-48" placeholder="Search quotations..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadQuotations()} />
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
          <div className="h-full overflow-auto">
            <div className="min-w-full">
              {/* Header */}
              <div className="grid w-full items-center gap-3 border-b border-[#e2e8f0] bg-[#f1f5f9] px-5 py-2.5" style={{ gridTemplateColumns: '15% 18% 18% 14% 14% 14%' }}>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-600">Quotation #</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-600">Client</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-600">Project</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-600">Status</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-600">Validity</span>
                <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-600">Created</span>
              </div>

              {/* Rows */}
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" /> Loading...</div>
              ) : quotations.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-600">No records found</div>
              ) : (
                <div className="divide-y divide-[#e0e7ff]">
                  {quotations.map(q => {
                    const isPipelineHL = highlightClientId && (
                      (prefillData?.opportunity_id && q.opportunity_id === prefillData.opportunity_id) ||
                      (q.client_id === highlightClientId && (!prefillData?.project_name || (q.project_name || '').toLowerCase().trim() === (prefillData.project_name || '').toLowerCase().trim())) ||
                      (!prefillData?.client_id && prefillData?.project_name && (q.project_name || '').toLowerCase().trim() === (prefillData.project_name || '').toLowerCase().trim())
                    )
                    const isRefHL = !isPipelineHL && (highlightRef || highlightId) && q.quotation_no === (highlightRef || highlightId)
                    return (
                    <div
                      key={q.quotation_id}
                      ref={isRefHL ? rowRef : undefined}
                      className={`grid w-full items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#f1f5f9] cursor-pointer ${isPipelineHL ? 'bg-amber-50 ring-2 ring-amber-300 ring-inset rounded-lg' : ''} ${isRefHL ? highlightRowCls : ''}`}
                      style={{ gridTemplateColumns: '15% 18% 18% 14% 14% 14%' }}
                      onClick={() => { setHighlightClientId(null); navigate(`../${q.quotation_id}`) }}
                    >
                      <span className="truncate text-sm font-semibold text-slate-800">{q.quotation_no}</span>
                      <span className="truncate text-sm font-medium text-slate-700">{q.client_list?.company_name || '—'}</span>
                      <span className="truncate text-sm text-slate-600">{q.project_name}</span>
                      <span><StatusBadge status={q.status} /></span>
                      <span className="truncate text-xs text-slate-500">{q.validity_date}</span>
                      <span className="truncate text-xs text-slate-500">{new Date(q.created_at).toLocaleDateString()}</span>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
