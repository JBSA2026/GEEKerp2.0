// ─── PurchaseRequestEdit — /purchasing/requests/:id/edit route component ─────
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, ArrowLeft, Loader2, X } from 'lucide-react'
import { PurchaseRequestForm } from './PurchaseRequestForm'
import { api, DEFAULT_PURCHASE_SOURCE, entityFromDocumentNumber, normalizeCompanyEntity } from './purchasingUtils'

export function PurchaseRequestEdit() {
  useOutletContext()
  const { id } = useParams()
  const navigate = useNavigate()

  const [pr, setPr] = useState(null)
  const [meta, setMeta] = useState(null)
  const [catalogEntity, setCatalogEntity] = useState('')
  const [sellerCatalogEntity, setSellerCatalogEntity] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const loadMeta = useCallback(async (entity, sellerEntity) => {
    if (!entity) return
    try {
      setMeta(null)
      const sellerQuery = sellerEntity ? `&seller_entity=${encodeURIComponent(sellerEntity)}` : ''
      setMeta(await api(`/purchasing/meta?entity=${encodeURIComponent(entity)}${sellerQuery}`))
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api(`/purchasing/requests/${id}`)
      setPr(data)
      setCatalogEntity(normalizeCompanyEntity(data.entity) || entityFromDocumentNumber(data.pr_number))
      setSellerCatalogEntity(data.purchase_source === 'INTERCOMPANY' ? normalizeCompanyEntity(data.source_seller_entity) : '')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const timer = setTimeout(() => { void loadDetail() }, 0)
    return () => clearTimeout(timer)
  }, [loadDetail])

  useEffect(() => {
    const timer = setTimeout(() => { void loadMeta(catalogEntity, sellerCatalogEntity) }, 0)
    return () => clearTimeout(timer)
  }, [catalogEntity, sellerCatalogEntity, loadMeta])

  async function handleUpdate(form) {
    setSaving(true)
    setError(null)
    try {
      await api(`/purchasing/requests/${id}`, { method: 'PATCH', body: JSON.stringify(form) })
      // Navigate back to detail view after successful update
      navigate(`/purchasing/requests/${id}`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center gap-2 px-6 py-16 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin" /> Loading purchase request...
      </main>
    )
  }

  if (!pr) {
    return (
      <main className="px-6 py-5">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="space-y-5 overflow-y-auto px-6 py-5">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="h-8 w-8 justify-center p-0" onClick={() => navigate(`/purchasing/requests/${id}`)} aria-label="Back to purchase request detail" title="Back to detail"><ArrowLeft size={15} /></Button>
            <CardTitle>Edit {pr.pr_number}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <PurchaseRequestForm
            initial={{
              entity: normalizeCompanyEntity(pr.entity) || entityFromDocumentNumber(pr.pr_number),
              purchase_source: pr.purchase_source || DEFAULT_PURCHASE_SOURCE,
              source_supplier_id: pr.source_supplier_id || '',
              source_seller_entity: normalizeCompanyEntity(pr.source_seller_entity) || '',
              warehouse_id: pr.warehouse_id || '',
              required_date: pr.required_date || '',
              remarks: pr.remarks || '',
              items: (pr.items || []).map(item => ({
                product_code: item.product_code || '',
                seller_product_code: item.seller_product_code || '',
                item_description: item.item_description || '',
                unit: item.unit || 'Nos',
                quantity: item.quantity || 1,
                estimated_unit_cost: item.estimated_unit_cost || 0,
              })),
            }}
            meta={meta}
            catalogEntity={catalogEntity}
            onEntityChange={setCatalogEntity}
            onSellerEntityChange={setSellerCatalogEntity}
            onSave={handleUpdate}
            onCancel={() => navigate(`/purchasing/requests/${id}`)}
            saving={saving}
          />
        </CardContent>
      </Card>
    </main>
  )
}
