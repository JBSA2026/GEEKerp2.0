import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Loader2, X } from 'lucide-react'
import { BASE, authHeaders, quotationEntity } from './quotationUtils'
import { QuotationForm } from './QuotationForm'

export function QuotationEdit() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [quotation, setQuotation] = useState(null)
  const [clients, setClients] = useState([])
  const [products, setProducts] = useState([])
  const [catalogCompany, setCatalogCompany] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const loadQuotation = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/quotations/${id}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setQuotation(data)
        setCatalogCompany(data.company || 'greatnesslab')
      }
    } finally { setLoading(false) }
  }, [id])

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
    const timer = setTimeout(() => {
      void loadQuotation()
      void loadClients()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadQuotation, loadClients])

  useEffect(() => {
    const timer = setTimeout(() => { void loadProducts(catalogCompany) }, 0)
    return () => clearTimeout(timer)
  }, [catalogCompany, loadProducts])

  const handleUpdate = async (form) => {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`${BASE}/quotations/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(form) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to update') }
      navigate(`../${id}`)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-[#1a3fad]" /></div>
  }

  if (!quotation) {
    return (
      <main className="flex min-h-0 flex-1 flex-col p-6">
        <p className="text-sm text-slate-500">Quotation not found.</p>
      </main>
    )
  }

  const editInitial = {
    company: quotation.company || 'greatnesslab',
    client_id: quotation.client_id,
    project_name: quotation.project_name,
    subject: quotation.subject || '',
    attn_to: quotation.attn_to || '',
    validity_date: quotation.validity_date || '',
    validity_days: quotation.validity_days || 30,
    payment_terms: quotation.payment_terms || '',
    delivery_terms: quotation.delivery_terms || '',
    notes: quotation.notes || '',
    scope_of_works: quotation.scope_of_works || '',
    cancellation_fee: quotation.cancellation_fee || '50% Cancellation Fee',
    bank_details: quotation.bank_details || '',
    additional_notes: quotation.additional_notes || '',
    scope_lines: [
      quotation.scope_line_1, quotation.scope_line_2, quotation.scope_line_3,
      quotation.scope_line_4, quotation.scope_line_5,
    ].filter(l => l != null && l !== '').length > 0
      ? [quotation.scope_line_1, quotation.scope_line_2, quotation.scope_line_3, quotation.scope_line_4, quotation.scope_line_5].filter(l => l != null && l !== '')
      : [''],
    vat_rate: quotation.vat_rate || 12,
    wht_rate: quotation.wht_rate || 0,
    discount_amount: quotation.discount_amount || 0,
    shipping_cost: quotation.shipping_cost || 0,
    others_cost: quotation.others_cost || 0,
    prepared_by_name: quotation.prepared_by_name || '',
    prepared_by_email: quotation.prepared_by_email || '',
    confirmed_by_name: quotation.confirmed_by_name || '',
    items: (quotation.items || []).map(i => ({
      product_type: i.product_type || '', product_code: i.product_code || '',
      description: i.description || '', datasheet_link: i.datasheet_link || '',
      quantity: i.quantity || 1, uom: i.uom || 'Nos',
      unit_cost: i.unit_cost || 0, selling_price: i.selling_price || 0,
      discount_percent: i.discount_percent || 0,
      is_section: i.is_section || false, section_title: i.section_title || '',
    })),
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
          <Button variant="outline" size="sm" onClick={() => navigate(`../${id}`)}>← Back</Button>
          <h2 className="text-lg font-bold text-slate-800">Edit {quotation.quotation_no}</h2>
        </div>
        <Card><CardContent className="p-6">
          <QuotationForm
            initial={editInitial}
            clients={clients}
            products={products}
            catalogCompany={catalogCompany}
            onCompanyChange={setCatalogCompany}
            onSave={handleUpdate}
            onCancel={() => navigate(`../${id}`)}
            saving={saving}
          />
        </CardContent></Card>
      </div>
    </main>
  )
}
