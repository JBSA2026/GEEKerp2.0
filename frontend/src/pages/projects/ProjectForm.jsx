import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Loader2 } from 'lucide-react'
import { ENTITY_OPTIONS, ENTITY_MAP, FORM_STATUSES, EMPTY_FORM, statusLabel } from './projectsUtils'

export function ProjectForm({ initial, meta, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const clients = meta?.clients || []
  const employees = meta?.employees || []
  const quotations = meta?.quotations || []

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function selectQuotation(quotationId) {
    const quote = quotations.find(q => String(q.quotation_id) === String(quotationId))
    setForm(prev => ({
      ...prev,
      quotation_id: quotationId,
      project_name: quote?.project_name || prev.project_name,
    }))
  }

  function submit(event) {
    event.preventDefault()
    onSave({
      ...form,
      client_id: Number(form.client_id),
      quotation_id: form.quotation_id ? Number(form.quotation_id) : null,
      project_manager_id: form.project_manager_id ? Number(form.project_manager_id) : null,
      contract_value: Number(form.contract_value || 0),
      budget: Number(form.budget || 0),
      completion_percent: Number(form.completion_percent || 0),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Sales Order / Quotation">
          <Select value={form.quotation_id} onChange={event => selectQuotation(event.target.value)}>
            <option value="">None (standalone project)</option>
            {quotations.map(q => (
              <option key={q.quotation_id} value={q.quotation_id}>{q.quotation_no} — {q.project_name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Customer *">
          <Select value={form.client_id} onChange={event => setField('client_id', event.target.value)} required>
            <option value="">Select customer</option>
            {clients.map(c => (
              <option key={c.client_id} value={c.client_id}>{c.company_name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Project Name *">
        <Input value={form.project_name} onChange={event => setField('project_name', event.target.value)} required placeholder="e.g. Data Center Cabling — Phase 1" />
      </Field>

      <Field label="Company *">
        <div className="flex items-center gap-2">
          {ENTITY_MAP[form.entity] && (
            <img src={ENTITY_MAP[form.entity].logo} alt="" className="h-9 w-9 shrink-0 rounded-md border border-[#d8e2ef] bg-white object-contain p-0.5" />
          )}
          <Select value={form.entity || ''} onChange={event => setField('entity', event.target.value)} required>
            <option value="">Select company</option>
            {ENTITY_OPTIONS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </Select>
        </div>
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Contract Value">
          <Input type="number" min="0" step="0.01" value={form.contract_value} onChange={event => setField('contract_value', event.target.value)} />
        </Field>
        <Field label="Budget">
          <Input type="number" min="0" step="0.01" value={form.budget} onChange={event => setField('budget', event.target.value)} />
        </Field>
        <Field label="Start Date">
          <Input type="date" value={form.start_date} onChange={event => setField('start_date', event.target.value)} />
        </Field>
        <Field label="End Date">
          <Input type="date" value={form.end_date} onChange={event => setField('end_date', event.target.value)} />
        </Field>
        <Field label="Project Manager">
          <Select value={form.project_manager_id} onChange={event => setField('project_manager_id', event.target.value)}>
            <option value="">Unassigned</option>
            {employees.map(e => (
              <option key={e.employee_id} value={e.employee_id}>{`${e.first_name} ${e.last_name}`.trim()}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={event => setField('status', event.target.value)}>
            {FORM_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="Description">
        <Textarea rows={3} value={form.description} onChange={event => setField('description', event.target.value)} placeholder="Scope and objectives of the project" />
      </Field>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save Project'}
        </Button>
      </div>
    </form>
  )
}
