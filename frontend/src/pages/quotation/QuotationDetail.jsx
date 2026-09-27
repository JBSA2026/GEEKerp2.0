import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2, X } from 'lucide-react'
import { BASE, authHeaders } from './quotationUtils'
import { QuotationDetailView } from './QuotationDetailView'
import { QuotationPrintView } from './QuotationPrintView'

export function QuotationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [quotation, setQuotation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showPrint, setShowPrint] = useState(false)

  const loadQuotation = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/quotations/${id}`, { headers: authHeaders() })
      if (res.ok) setQuotation(await res.json())
      else setError('Failed to load quotation')
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => {
    const timer = setTimeout(() => { void loadQuotation() }, 0)
    return () => clearTimeout(timer)
  }, [loadQuotation])

  const handleStatusChange = async (newStatus) => {
    setActionLoading(true); setError(null)
    try {
      const res = await fetch(`${BASE}/quotations/${id}/status`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ status: newStatus }) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed') }
      setQuotation(await res.json())
    } catch (err) { setError(err.message) } finally { setActionLoading(false) }
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

  if (showPrint) {
    return <QuotationPrintView quotation={quotation} onClose={() => setShowPrint(false)} />
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col p-6 gap-4 overflow-y-auto">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      <QuotationDetailView
        quotation={quotation}
        onBack={() => navigate('../list')}
        onStatusChange={handleStatusChange}
        onEdit={() => navigate('edit')}
        onExport={() => setShowPrint(true)}
        onHistory={() => navigate('history')}
        onVersions={() => navigate('versions')}
        actionLoading={actionLoading}
      />
    </main>
  )
}
