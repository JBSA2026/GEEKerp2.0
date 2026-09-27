// ─── PurchaseRequestDetail — /purchasing/requests/:id route component ────────
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { AlertCircle, Loader2, X } from 'lucide-react'
import { PurchasingDetailView } from './PurchasingDetailView'
import { RFQDrawer, QuoteDrawer } from './PurchasingDrawers'
import { api, BASE, authHeaders, entityFromDocumentNumber, normalizeCompanyEntity } from './purchasingUtils'

export function PurchaseRequestDetail() {
  useOutletContext()
  const { id } = useParams()
  const navigate = useNavigate()
  const { confirm, confirmDialogProps } = useConfirmDialog()

  const [pr, setPr] = useState(null)
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [drawerData, setDrawerData] = useState(null)

  const loadMeta = useCallback(async (entity) => {
    if (!entity) {
      setMeta(null)
      return
    }
    try {
      setMeta(await api(`/purchasing/meta?entity=${encodeURIComponent(entity)}`))
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
      await loadMeta(normalizeCompanyEntity(data.entity) || entityFromDocumentNumber(data.pr_number))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id, loadMeta])

  useEffect(() => {
    const timer = setTimeout(() => { void loadDetail() }, 0)
    return () => clearTimeout(timer)
  }, [loadDetail])

  // Refresh data when the user returns to this page (e.g. after confirming a
  // bill in the AP module) so the workflow step status stays current.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        refreshDetail()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshDetail() {
    setError(null)
    try {
      const data = await api(`/purchasing/requests/${id}`)
      setPr(data)
    } catch (err) {
      setError(err.message)
    }
  }

  function openDrawer(type, data = null) {
    setDrawer(type)
    setDrawerData(data)
  }

  function closeDrawer() {
    setDrawer(null)
    setDrawerData(null)
  }

  async function submitDrawer(payload) {
    setSaving(true)
    setError(null)
    try {
      let updated
      if (drawer === 'rfq') {
        updated = await api(`/purchasing/requests/${id}/rfq`, { method: 'POST', body: JSON.stringify(payload) })
        setPr(updated)
        if ((payload.supplier_ids || []).length === 1) {
          const latestRfq = (updated.rfqs || [])[0]
          setDrawer('quote')
          setDrawerData(latestRfq)
          return
        }
      } else if (drawer === 'quote') {
        updated = await api(`/purchasing/rfqs/${drawerData.rfq_id}/quotes`, { method: 'POST', body: JSON.stringify(payload) })
      }
      setPr(updated)
      closeDrawer()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAction(type, data, value) {
    if (saving) return

    if (type === 'ap') {
      if ((data.billing_status || 'NOT_BILLED') !== 'NOT_BILLED') {
        // Bill already exists for this PO — find and navigate to it
        setSaving(true)
        setError(null)
        try {
          const bills = await api(`/ap/bills?search=${encodeURIComponent(data.po_number)}`)
          const linked = Array.isArray(bills)
            ? bills.find(b => b.po_number === data.po_number)
            : null
          if (linked) {
            navigate(`/accounts-payable/bills/${linked.bill_id}`)
          } else {
            navigate('/accounts-payable/dashboard')
          }
        } catch {
          navigate('/accounts-payable/dashboard')
        } finally {
          setSaving(false)
        }
        return
      }
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(`${BASE}/ap/bills/draft-from-po/${data.purchase_order_id}`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({}),
        })
        if (res.ok) {
          const bill = await res.json()
          await refreshDetail()
          navigate(`/accounts-payable/bills/${bill.bill_id}`)
          return
        }
        if (res.status === 409) {
          // Bill already exists (duplicate guard) — find and navigate
          await refreshDetail()
          const bills = await api(`/ap/bills?search=${encodeURIComponent(data.po_number)}`)
          const linked = Array.isArray(bills)
            ? bills.find(b => b.po_number === data.po_number)
            : null
          if (linked) {
            navigate(`/accounts-payable/bills/${linked.bill_id}`)
          } else {
            navigate('/accounts-payable/dashboard')
          }
          return
        }
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || err.detail || 'Unable to open AP for this purchase order')
      } catch (err) {
        setError(err.message)
      } finally {
        setSaving(false)
      }
      return
    }
    if (type === 'inventoryPending') {
      setSaving(true)
      setError(null)
      try {
        if (data?.purchase_order_id) {
          await api(`/purchasing/purchase-orders/${data.purchase_order_id}/pending-stock`, { method: 'POST' })
        }
        const poParam = data?.po_number ? `&highlight=${encodeURIComponent(data.po_number)}` : ''
        navigate(`/inventory/list?view=pending-stock${poParam}`)
      } catch (err) {
        setError(err.message)
      } finally {
        setSaving(false)
      }
      return
    }
    if (type === 'rfq' || type === 'quote') {
      openDrawer(type, data)
      return
    }
    setSaving(true)
    setError(null)
    try {
      let updated
      if (type === 'selectQuote') {
        updated = await api(`/purchasing/quotes/${data.supplier_quotation_id}/select`, { method: 'POST' })
      } else if (type === 'generatePo') {
        updated = await api(`/purchasing/quotes/${data.supplier_quotation_id}/purchase-order`, { method: 'POST' })
      } else if (type === 'poStatus') {
        updated = await api(`/purchasing/purchase-orders/${data.purchase_order_id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: value }),
        })
      }
      setPr(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!pr) return
    const ok = await confirm({
      title: 'Delete purchase request?',
      message: `Delete ${pr.pr_number}? This will remove its RFQs, supplier quotes, purchase orders, and receipts. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    try {
      await api(`/purchasing/requests/${id}`, { method: 'DELETE' })
      navigate('/purchasing/orders', { replace: true })
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

      <PurchasingDetailView
        pr={pr}
        onBack={() => navigate('/purchasing/requests')}
        onEdit={() => navigate('edit')}
        onAction={handleAction}
        onDelete={handleDelete}
        saving={saving}
      />

      <RFQDrawer open={drawer === 'rfq'} pr={pr} meta={meta} onClose={closeDrawer} onSubmit={submitDrawer} saving={saving} />
      <QuoteDrawer key={drawer === 'quote' ? drawerData?.rfq_id : 'quote-closed'} open={drawer === 'quote'} rfq={drawerData} pr={pr} meta={meta} onClose={closeDrawer} onSubmit={submitDrawer} saving={saving} />
      <ConfirmDialog {...confirmDialogProps} />
    </main>
  )
}
