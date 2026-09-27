// ─── PurchaseRequestCreate — /purchasing/requests/new route component ────────
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, ArrowLeft, Info, X } from 'lucide-react'
import { PurchaseRequestForm } from './PurchaseRequestForm'
import { api, COMPANY_OPTIONS, DEFAULT_PURCHASE_SOURCE, normalizeCompanyEntity } from './purchasingUtils'

export function PurchaseRequestCreate() {
  useOutletContext()
  const navigate = useNavigate()
  const location = useLocation()

  // Pre-fill from pipeline navigation (e.g. stock shortage)
  const prefill = location.state
  const initialData = prefill?.prefill_items
    ? {
        entity: normalizeCompanyEntity(prefill.prefill_entity),
        purchase_source: prefill.prefill_purchase_source || DEFAULT_PURCHASE_SOURCE,
        source_supplier_id: prefill.prefill_source_supplier_id || '',
        source_seller_entity: normalizeCompanyEntity(prefill.prefill_source_seller_entity) || '',
        warehouse_id: prefill.prefill_warehouse_id || '',
        required_date: '',
        remarks: prefill.prefill_remarks || '',
        items: prefill.prefill_items.map(({ product_code, seller_product_code, item_description, unit, quantity, estimated_unit_cost }) => ({
          product_code,
          seller_product_code: seller_product_code || '',
          item_description,
          unit,
          quantity,
          estimated_unit_cost: estimated_unit_cost ?? 0,
        })),
      }
    : undefined

  const [meta, setMeta] = useState(null)
  const [catalogEntity, setCatalogEntity] = useState(initialData?.entity || COMPANY_OPTIONS[0])
  const [sellerCatalogEntity, setSellerCatalogEntity] = useState(initialData?.source_seller_entity || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const loadMeta = useCallback(async (entity, sellerEntity) => {
    try {
      setMeta(null)
      const sellerQuery = sellerEntity ? `&seller_entity=${encodeURIComponent(sellerEntity)}` : ''
      setMeta(await api(`/purchasing/meta?entity=${encodeURIComponent(entity)}${sellerQuery}`))
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void loadMeta(catalogEntity, sellerCatalogEntity) }, 0)
    return () => clearTimeout(timer)
  }, [catalogEntity, sellerCatalogEntity, loadMeta])

  async function handleCreate(form) {
    setSaving(true)
    setError(null)
    try {
      const created = await api('/purchasing/requests', { method: 'POST', body: JSON.stringify(form) })
      navigate(`/purchasing/requests/${created.purchase_request_id}`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="space-y-5 overflow-y-auto px-6 py-5">
      {prefill?.from === 'pipeline' && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          <Info size={16} className="shrink-0" />
          <span>Pre-filled from pipeline — review quantities and add estimated costs before submitting.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="h-8 w-8 justify-center p-0" onClick={() => navigate('/purchasing/requests')} aria-label="Back to purchase requests" title="Back to purchase requests"><ArrowLeft size={15} /></Button>
            <CardTitle>New Purchase Request</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <PurchaseRequestForm
            initial={initialData}
            meta={meta}
            catalogEntity={catalogEntity}
            onEntityChange={setCatalogEntity}
            onSellerEntityChange={setSellerCatalogEntity}
            onSave={handleCreate}
            onCancel={() => navigate('/purchasing/requests')}
            saving={saving}
          />
        </CardContent>
      </Card>
    </main>
  )
}
