import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { SideDrawer as Drawer } from '@/components/ui/overlay'
import { AlertCircle, Loader2 } from 'lucide-react'
import { FORM_STATUSES, MILESTONE_STATUSES, TASK_STATUSES, MATERIAL_STATUSES, money, percent, statusLabel } from './projectsUtils'

// ── Shared drawer footer ────────────────────────────────────────────────────

function DrawerFooter({ onClose, saving, label = 'Save', disabled }) {
  return (
    <div className="flex gap-3 pt-2">
      <Button type="button" variant="outline" className="flex-1 justify-center" onClick={onClose} disabled={saving}>Cancel</Button>
      <Button type="submit" className="flex-1 justify-center" disabled={saving || disabled}>
        {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : label}
      </Button>
    </div>
  )
}

// ── AssignManagerDrawer ─────────────────────────────────────────────────────

export function AssignManagerDrawer({ open, project, meta, onClose, onSubmit, saving }) {
  const [managerId, setManagerId] = useState(project?.project_manager_id || '')
  const employees = meta?.employees || []

  function submit(event) {
    event.preventDefault()
    onSubmit({ project_manager_id: Number(managerId) })
  }

  return (
    <Drawer open={open} title="Assign Project Manager" subtitle={project?.project_code} onClose={onClose}>
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <Field label="Project Manager">
          <Select value={managerId} onChange={event => setManagerId(event.target.value)} required>
            <option value="">Select an employee</option>
            {employees.map(e => (
              <option key={e.employee_id} value={e.employee_id}>{`${e.first_name} ${e.last_name}`.trim()}</option>
            ))}
          </Select>
        </Field>
        <DrawerFooter onClose={onClose} saving={saving} label="Assign Manager" disabled={!managerId} />
      </form>
    </Drawer>
  )
}

// ── ProgressDrawer ──────────────────────────────────────────────────────────

export function ProgressDrawer({ open, project, onClose, onSubmit, saving }) {
  const [completion, setCompletion] = useState(project?.completion_percent ?? 0)
  const [status, setStatus] = useState(project?.status || 'IN_PROGRESS')

  function submit(event) {
    event.preventDefault()
    onSubmit({ completion_percent: Number(completion), status })
  }

  return (
    <Drawer open={open} title="Update Progress" subtitle={project?.project_code} onClose={onClose}>
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <Field label={`Completion — ${percent(completion)}`}>
          <input type="range" min="0" max="100" step="1" value={completion} onChange={event => setCompletion(event.target.value)} className="w-full accent-[#2c3a61]" />
        </Field>
        <Field label="Exact %">
          <Input type="number" min="0" max="100" step="0.1" value={completion} onChange={event => setCompletion(event.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={event => setStatus(event.target.value)}>
            {FORM_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </Field>
        <DrawerFooter onClose={onClose} saving={saving} label="Save Progress" />
      </form>
    </Drawer>
  )
}

// ── CloseDrawer ─────────────────────────────────────────────────────────────

export function CloseDrawer({ open, project, onClose, onSubmit, saving }) {
  const [remarks, setRemarks] = useState('')

  function submit(event) {
    event.preventDefault()
    onSubmit({ remarks: remarks || null })
  }

  return (
    <Drawer open={open} title="Close Project" subtitle={project?.project_code} onClose={onClose}>
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="flex items-start gap-2 rounded-lg border border-[#e8aa96] bg-[#fbe4dc] px-3 py-2 text-xs text-[#26324f]">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>Closing marks the project as complete (100%). This is recorded in the audit trail.</span>
        </div>
        <Field label="Closure Remarks">
          <Textarea rows={4} value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Handover notes, final acceptance, etc." />
        </Field>
        <DrawerFooter onClose={onClose} saving={saving} label="Close Project" />
      </form>
    </Drawer>
  )
}

// ── BudgetDrawer ────────────────────────────────────────────────────────────

export function BudgetDrawer({ open, initial, onClose, onSubmit, saving }) {
  const [form, setForm] = useState(initial || { category: '', description: '', budgeted_amount: 0, actual_amount: 0 })

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({
      category: form.category || null,
      description: form.description || null,
      budgeted_amount: Number(form.budgeted_amount || 0),
      actual_amount: Number(form.actual_amount || 0),
    })
  }

  return (
    <Drawer open={open} title={initial ? 'Edit Budget Item' : 'Add Budget Item'} onClose={onClose}>
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <Field label="Category">
          <Input value={form.category} onChange={event => setField('category', event.target.value)} placeholder="e.g. Labor, Materials, Equipment" />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={form.description} onChange={event => setField('description', event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Budgeted Amount">
            <Input type="number" min="0" step="0.01" value={form.budgeted_amount} onChange={event => setField('budgeted_amount', event.target.value)} />
          </Field>
          <Field label="Actual Amount">
            <Input type="number" min="0" step="0.01" value={form.actual_amount} onChange={event => setField('actual_amount', event.target.value)} />
          </Field>
        </div>
        <DrawerFooter onClose={onClose} saving={saving} />
      </form>
    </Drawer>
  )
}

// ── MilestoneDrawer ─────────────────────────────────────────────────────────

export function MilestoneDrawer({ open, initial, onClose, onSubmit, saving }) {
  const [form, setForm] = useState(initial || { milestone_name: '', description: '', target_date: '', completion_date: '', billing_amount: 0, status: 'PENDING' })

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({
      milestone_name: form.milestone_name,
      description: form.description || null,
      target_date: form.target_date || null,
      completion_date: form.completion_date || null,
      billing_amount: Number(form.billing_amount || 0),
      status: form.status,
    })
  }

  return (
    <Drawer open={open} title={initial ? 'Edit Milestone' : 'Add Milestone'} onClose={onClose}>
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <Field label="Milestone Name *">
          <Input value={form.milestone_name} onChange={event => setField('milestone_name', event.target.value)} required placeholder="e.g. Site survey complete" />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={form.description} onChange={event => setField('description', event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target Date">
            <Input type="date" value={form.target_date} onChange={event => setField('target_date', event.target.value)} />
          </Field>
          <Field label="Completion Date">
            <Input type="date" value={form.completion_date} onChange={event => setField('completion_date', event.target.value)} />
          </Field>
          <Field label="Billing Amount">
            <Input type="number" min="0" step="0.01" value={form.billing_amount} onChange={event => setField('billing_amount', event.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={event => setField('status', event.target.value)}>
              {MILESTONE_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
          </Field>
        </div>
        <DrawerFooter onClose={onClose} saving={saving} disabled={!form.milestone_name} />
      </form>
    </Drawer>
  )
}

// ── TaskDrawer ──────────────────────────────────────────────────────────────

export function TaskDrawer({ open, initial, meta, onClose, onSubmit, saving }) {
  const [form, setForm] = useState(initial || { task_name: '', description: '', assigned_to_employee_id: '', start_date: '', due_date: '', status: 'TODO' })
  const employees = meta?.employees || []

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({
      task_name: form.task_name,
      description: form.description || null,
      assigned_to_employee_id: form.assigned_to_employee_id ? Number(form.assigned_to_employee_id) : null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      status: form.status,
    })
  }

  return (
    <Drawer open={open} title={initial ? 'Edit Task' : 'Add Task'} onClose={onClose}>
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <Field label="Task Name *">
          <Input value={form.task_name} onChange={event => setField('task_name', event.target.value)} required />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={form.description} onChange={event => setField('description', event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Assigned To">
            <Select value={form.assigned_to_employee_id} onChange={event => setField('assigned_to_employee_id', event.target.value)}>
              <option value="">Unassigned</option>
              {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{`${e.first_name} ${e.last_name}`.trim()}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={event => setField('status', event.target.value)}>
              {TASK_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
          </Field>
          <Field label="Start Date">
            <Input type="date" value={form.start_date} onChange={event => setField('start_date', event.target.value)} />
          </Field>
          <Field label="Due Date">
            <Input type="date" value={form.due_date} onChange={event => setField('due_date', event.target.value)} />
          </Field>
        </div>
        <DrawerFooter onClose={onClose} saving={saving} disabled={!form.task_name} />
      </form>
    </Drawer>
  )
}

// ── MaterialDrawer ──────────────────────────────────────────────────────────

export function MaterialDrawer({ open, initial, meta, onClose, onSubmit, saving }) {
  const [form, setForm] = useState(initial || { product_code: '', description: '', quantity: 1, unit_cost: 0, status: 'RESERVED' })
  const products = meta?.products || []

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function selectProduct(code) {
    const product = products.find(p => p.product_code === code)
    setForm(prev => ({
      ...prev,
      product_code: code,
      description: product?.product_name || prev.description,
      unit_cost: product?.buying_price_vat ?? prev.unit_cost,
    }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({
      product_code: form.product_code || null,
      description: form.description || null,
      quantity: Number(form.quantity || 0),
      unit_cost: Number(form.unit_cost || 0),
      status: form.status,
    })
  }

  const total = Number(form.quantity || 0) * Number(form.unit_cost || 0)

  return (
    <Drawer open={open} title={initial ? 'Edit Material' : 'Add Material'} onClose={onClose}>
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <Field label="Product">
          <Select value={form.product_code} onChange={event => selectProduct(event.target.value)}>
            <option value="">Custom / not in catalog</option>
            {products.map(p => <option key={p.product_code} value={p.product_code}>{p.product_code} — {p.product_name}</option>)}
          </Select>
        </Field>
        <Field label="Description">
          <Input value={form.description} onChange={event => setField('description', event.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <Input type="number" min="0" step="0.01" value={form.quantity} onChange={event => setField('quantity', event.target.value)} />
          </Field>
          <Field label="Unit Cost">
            <Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={event => setField('unit_cost', event.target.value)} />
          </Field>
        </div>
        <Field label="Status">
          <Select value={form.status} onChange={event => setField('status', event.target.value)}>
            {MATERIAL_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </Select>
        </Field>
        <div className="flex justify-between rounded-lg border border-[#d8e2ef] bg-[#edf4fb] px-3 py-2 text-sm">
          <span className="text-slate-500">Total Cost</span>
          <span className="font-semibold text-[#26324f]">{money(total)}</span>
        </div>
        <DrawerFooter onClose={onClose} saving={saving} />
      </form>
    </Drawer>
  )
}

// ── DocumentDrawer ──────────────────────────────────────────────────────────

export function DocumentDrawer({ open, onClose, onSubmit, saving }) {
  const [file, setFile] = useState(null)
  const [documentType, setDocumentType] = useState('')
  const [remarks, setRemarks] = useState('')
  const [sizeError, setSizeError] = useState(null)

  const MAX_SIZE = 100 * 1024 * 1024 // 100 MB
  const ACCEPTED = '.pdf,.csv,.xlsx,.xls,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.txt,.zip'

  function handleFileChange(event) {
    const selected = event.target.files?.[0]
    setSizeError(null)
    if (!selected) { setFile(null); return }
    if (selected.size > MAX_SIZE) {
      setSizeError('File exceeds 100 MB limit.')
      setFile(null)
      return
    }
    setFile(selected)
  }

  function submit(event) {
    event.preventDefault()
    if (!file) return
    onSubmit({ file, document_type: documentType || null, remarks: remarks || null })
  }

  return (
    <Drawer open={open} title="Upload Document" onClose={onClose}>
      <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <Field label="File *">
          <input
            type="file"
            accept={ACCEPTED}
            onChange={handleFileChange}
            className="w-full rounded-lg border border-[#d8e2ef] bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#edf4fb] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[#26324f] hover:file:bg-[#e3ecf8]"
          />
          <span className="text-[10px] text-slate-500">PDF, Excel, Word, CSV, PowerPoint, images, TXT, ZIP — max 100 MB</span>
        </Field>
        {sizeError && <p className="text-xs text-red-600">{sizeError}</p>}
        {file && <p className="text-xs text-slate-700">Selected: <span className="font-medium">{file.name}</span> ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
        <Field label="Document Type">
          <Input value={documentType} onChange={event => setDocumentType(event.target.value)} placeholder="Contract, Drawing, Permit, Report" />
        </Field>
        <Field label="Remarks">
          <Textarea rows={2} value={remarks} onChange={event => setRemarks(event.target.value)} />
        </Field>
        <DrawerFooter onClose={onClose} saving={saving} label="Upload" disabled={!file || !!sizeError} />
      </form>
    </Drawer>
  )
}
