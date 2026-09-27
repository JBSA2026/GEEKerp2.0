import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, X } from 'lucide-react'
import { BASE, authHeaders, EMPTY_FORM, quotationEntity } from './quotationUtils'
import { QuotationForm } from './QuotationForm'

export function QuotationCreate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [clients, setClients] = useState([])
  const [products, setProducts] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Read prefill data from query params (from pipeline)
  const clientId = searchParams.get('client_id')
  const contactId = searchParams.get('contact_id')
  const projectName = searchParams.get('project_name')
  const opportunityId = searchParams.get('opportunity_id')
  const entityParam = searchParams.get('entity')
  const fromPipeline = !!(clientId || projectName)
  const fromImport = searchParams.get('from') === 'import'

  // Build initial form state from prefill or import
  const buildInitial = () => {
    if (fromImport) {
      const raw = sessionStorage.getItem('importedQuotationItems')
      sessionStorage.removeItem('importedQuotationItems')
      if (raw) {
        try {
          const items = JSON.parse(raw)
          if (items.length > 0) return { ...EMPTY_FORM, items }
        } catch { /* ignore */ }
      }
    }
    if (fromPipeline) {
      const entityToCompany = { 'Expedia': 'expedia', 'GreatnessLab': 'greatnesslab', 'Exigent': 'exigent', 'KSI': 'kyrios' }
      const company = entityParam ? (entityToCompany[entityParam] || '') : ''
      return { ...EMPTY_FORM, client_id: clientId || '', contact_id: contactId ? Number(contactId) : null, project_name: projectName || '', opportunity_id: opportunityId ? Number(opportunityId) : null, ...(company ? { company } : {}) }
    }
    return undefined
  }
  const [prefillInitial] = useState(buildInitial)
  const [catalogCompany, setCatalogCompany] = useState(prefillInitial?.company || EMPTY_FORM.company)

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/clients/`, { headers: authHeaders() })
      if (res.ok) setClients(await res.json())
    } catch { /* ignore */ }
  }, [])

  const loadProducts = useCallback(async (companyKey) => {
    const entity = quotationEntity(companyKey)
    if (!entity) return
    try {
      setProducts([])
      const res = await fetch(`${BASE}/products/?entity=${encodeURIComponent(entity)}`, { headers: authHeaders() })
      if (res.ok) setProducts(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void loadClients() }, 0)
    return () => clearTimeout(timer)
  }, [loadClients])

  useEffect(() => {
    const timer = setTimeout(() => { void loadProducts(catalogCompany) }, 0)
    return () => clearTimeout(timer)
  }, [catalogCompany, loadProducts])

  const handleCreate = async (form) => {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`${BASE}/quotations/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(form) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to create') }
      const created = await res.json()
      navigate(`../${created.quotation_id}`)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col p-6 gap-4 overflow-y-auto">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('../list')}>← Back</Button>
          <h2 className="text-lg font-bold text-slate-800">New Quotation</h2>
          {fromPipeline && <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">Pre-filled from Sales Pipeline</span>}
          {fromImport && <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">Items imported from file</span>}
        </div>

        {/* Pipeline workflow guidance banner */}
        {fromPipeline && (
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <AlertCircle size={18} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800">Complete this quotation to advance your deal</p>
              <p className="text-xs text-blue-600 mt-1">
                Your opportunity requires a quotation before it can move to the Proposal stage.
                Fill in the details below, then submit it for approval. Once approved and sent,
                you can move the deal forward in the Sales Pipeline.
              </p>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-blue-500">
                <span className="flex items-center gap-1">① Create quotation</span>
                <span>→</span>
                <span className="flex items-center gap-1">② Submit for approval</span>
                <span>→</span>
                <span className="flex items-center gap-1">③ Approve & Send</span>
                <span>→</span>
                <span className="flex items-center gap-1">④ Move deal to Proposal</span>
              </div>
            </div>
          </div>
        )}

        <Card><CardContent className="p-6">
          <QuotationForm
            clients={clients}
            products={products}
            catalogCompany={catalogCompany}
            onCompanyChange={setCatalogCompany}
            onSave={handleCreate}
            onCancel={() => navigate('../list')}
            saving={saving}
            initial={prefillInitial}
          />
        </CardContent></Card>
      </div>
    </main>
  )
}
