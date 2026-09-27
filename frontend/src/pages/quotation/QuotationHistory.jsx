import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { History, Loader2 } from 'lucide-react'
import { BASE, authHeaders } from './quotationUtils'

export function QuotationHistory() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`${BASE}/quotations/${id}/history`, { headers: authHeaders() })
        if (res.ok) setHistory(await res.json())
      } finally { setLoading(false) }
    }
    if (id) load()
  }, [id])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#1a3fad]" size={24} /></div>

  return (
    <main className="flex min-h-0 flex-1 flex-col p-6 gap-4 overflow-y-auto">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(`../${id}`)}>← Back</Button>
          <h2 className="text-lg font-bold text-slate-800">Quotation History</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No history entries yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map(h => (
              <div key={h.history_id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f1f5f9]">
                  <History size={14} className="text-[#1a3fad]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{h.action}</p>
                  <p className="text-xs text-slate-500">{h.details}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {h.employees ? `${h.employees.first_name} ${h.employees.last_name}` : 'System'} • {new Date(h.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
