import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { FormViewTab1604E } from './FormViewTab1604E'

const BASE = import.meta.env.VITE_API_URL

export function Form1604EPrint() {
  const { formId } = useParams()
  const [fd, setFd] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    fetch(`${BASE}/tax/bir-forms/${formId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((data) => setFd(data.form_data || {}))
      .catch((e) => setError(e.message))
  }, [formId])

  useEffect(() => {
    if (fd) setTimeout(() => window.print(), 500)
  }, [fd])

  if (error) return <div style={{ padding: '20px', color: 'red' }}>{error}</div>
  if (!fd) return <div style={{ padding: '20px' }}>Loading...</div>

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          @page { size: 215.9mm 330.2mm; margin: 0; }
        }
        @media screen { body { background: #444; margin: 0; } }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', gap: '10px' }}>
        <FormViewTab1604E fd={fd} bare />
      </div>
    </>
  )
}
