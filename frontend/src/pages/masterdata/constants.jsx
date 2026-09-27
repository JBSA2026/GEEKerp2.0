/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'

// ─── Constants & helpers for Master Data ──────────────────────────────────────

// URL slug → API resource key mapping
export const SLUG_TO_RESOURCE = {
  clients: 'clients',
  products: 'products',
  employees: 'employees',
  suppliers: 'supplier_list',
  warehouses: 'warehouses',
  documents: 'documents',
  contacts: 'contact_list',
  leads: 'leads',
  activities: 'sales_activity',
  opportunities: 'opportunities',
  forecast: 'sales_forecast',
  services: 'services',
}

// API resource key → URL slug mapping (reverse)
export const RESOURCE_TO_SLUG = Object.fromEntries(
  Object.entries(SLUG_TO_RESOURCE).map(([slug, res]) => [res, slug])
)

// Valid URL slugs
export const VALID_SLUGS = Object.keys(SLUG_TO_RESOURCE)

// All available resource tabs in the master data page
export const RESOURCES = ['clients', 'products', 'employees', 'supplier_list', 'warehouses', 'documents', 'contact_list', 'leads', 'sales_activity', 'opportunities', 'sales_forecast', 'services']

export const STATUS_FILTER_RESOURCES = new Set(['clients', 'products', 'employees', 'supplier_list', 'warehouses', 'documents', 'contact_list', 'leads', 'sales_activity', 'opportunities', 'sales_forecast', 'services'])
export const ARCHIVABLE_RESOURCES = new Set(['clients', 'products', 'employees', 'supplier_list', 'warehouses', 'documents', 'contact_list', 'leads', 'sales_activity', 'opportunities', 'sales_forecast', 'services'])

export function getResourceLabel(resource) {
  const labels = {
    supplier_list: 'Suppliers',
    warehouses: 'Warehouse',
    contact_list: 'Contacts',
    sales_activity: 'Sales Activity',
    sales_forecast: 'Sales Forecast',
  }
  return labels[resource] || resource[0].toUpperCase() + resource.slice(1)
}

const RESOURCE_SINGULAR = {
  clients: 'Client',
  products: 'Product',
  employees: 'Employee',
  supplier_list: 'Supplier',
  warehouses: 'Warehouse',
  documents: 'Document',
  contact_list: 'Contact',
  leads: 'Lead',
  sales_activity: 'Sales Activity',
  opportunities: 'Opportunity',
  sales_forecast: 'Sales Forecast',
  services: 'Service',
}

export function getResourceSingular(resource) {
  return RESOURCE_SINGULAR[resource] || resource
}

// ─── Record helpers ───────────────────────────────────────────────────────────

export function getRecordId(resource, item) {
  if (resource === 'clients') return item.client_id
  if (resource === 'products') return item.product_code
  if (resource === 'supplier_list') return item.supplier_id
  if (resource === 'warehouses') return item.warehouse_id
  if (resource === 'documents') return item.uid || item.document_id
  if (resource === 'contact_list') return item.contact_id
  if (resource === 'leads') return item.lead_id
  if (resource === 'sales_activity') return item.activity_id
  if (resource === 'opportunities') return item.opportunity_id
  if (resource === 'sales_forecast') return item.forecast_id
  if (resource === 'services') return item.service_id
  return item.employee_id
}

export function getRecordName(resource, item) {
  if (resource === 'clients') return item.company_name
  if (resource === 'products') return item.product_name
  if (resource === 'supplier_list') return item.company_name
  if (resource === 'warehouses') return item.warehouse_name
  if (resource === 'documents') return item.title
  if (resource === 'contact_list') return [item.first_name, item.last_name].filter(Boolean).join(' ')
  if (resource === 'leads') return item.company_name
  if (resource === 'sales_activity') return item.subject
  if (resource === 'opportunities') return item.project_name
  if (resource === 'sales_forecast') return item.forecast_period
  if (resource === 'services') return item.service_name
  return [item.first_name, item.last_name].filter(Boolean).join(' ') || item.email
}

// ─── buildPayload ─────────────────────────────────────────────────────────────

export function buildPayload(resource, form) {
  if (resource === 'clients') {
    return {
      company_name: form.company_name || '',
      trade_name: form.trade_name || null,
      customer_type: form.customer_type || null,
      industry: form.industry || null,
      tin_number: form.tin_number || '',
      vat_status: form.vat_status || null,
      address: form.address || '',
      billing_address: form.billing_address || null,
      entity: form.entity || null,
      assigned_salesperson: form.assigned_salesperson || null,
      payment_terms: form.payment_terms || null,
      credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
    }
  }
  if (resource === 'products') {
    return {
      product_code: form.product_code || '',
      product_brand: form.product_brand || '',
      product_name: form.product_name || '',
      product_description: form.product_description || null,
      quantity: Number(form.quantity || 0),
      unit: form.unit || '',
      buying_price_vat: form.buying_price_vat || 0,
      selling_price_margin: form.selling_price_margin || 0,
      supplier_name: form.supplier_name || '',
      fulfillment_type: form.fulfillment_type || 'DIRECT',
    }
  }
  if (resource === 'supplier_list') {
    return {
      company_name: form.company_name || '',
      tin_number: form.tin_number || '',
      supplier_type: form.supplier_type || '',
      industry: form.industry || '',
      vat_status: form.vat_status || '',
      billing_address: form.billing_address || '',
      payment_terms: form.payment_terms || '',
      employee_id: Number(form.employee_id || 0),
      status: form.status || 'active',
    }
  }
  if (resource === 'warehouses') {
    return {
      warehouse_code: form.warehouse_code || '',
      warehouse_name: form.warehouse_name || '',
      warehouse_type: form.warehouse_type || null,
      address: form.address || null,
      contact_person: form.contact_person || null,
      contact_number: form.contact_number || null,
      status: form.status || 'active',
    }
  }
  if (resource === 'documents') {
    return {
      title: form.title || '',
      document_type: form.document_type || '',
      entity: form.entity || null,
      related_module: form.related_module || null,
      related_transaction: form.related_transaction || null,
      description: form.description || null,
      status: form.status || 'Active',
    }
  }
  if (resource === 'contact_list') {
    return {
      client_id: form.client_id ? Number(form.client_id) : null,
      first_name: form.first_name || '',
      last_name: form.last_name || '',
      job_title: form.job_title || '',
      email: form.email || '',
      landline: form.landline || '',
      is_primary_contact: form.is_primary_contact ?? false,
    }
  }
  if (resource === 'leads') {
    return {
      client_id: form.client_id ? Number(form.client_id) : null,
      employee_id: form.employee_id ? Number(form.employee_id) : null,
      company_name: form.company_name || '',
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      email: form.email || '',
      mobile_number: form.mobile_number || '',
      lead_source: form.lead_source || '',
      lead_status: form.lead_status || '',
      interest_level: form.interest_level || '',
      remarks: form.remarks || '',
    }
  }
  if (resource === 'sales_activity') {
    return {
      employee_id: form.employee_id ? Number(form.employee_id) : null,
      activity_type: form.activity_type || '',
      activity_date: form.activity_date || null,
      subject: form.subject || '',
      notes_outcome: form.notes_outcome || '',
    }
  }
  if (resource === 'opportunities') {
    return {
      employee_id: form.employee_id ? Number(form.employee_id) : null,
      client_id: form.client_id ? Number(form.client_id) : null,
      project_name: form.project_name || '',
      estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      probability_percentage: form.probability_percentage ? Number(form.probability_percentage) : null,
      stage: form.stage || '',
      expected_closed_date: form.expected_closed_date || null,
      competitor: form.competitor || '',
      loss_reason: form.loss_reason || '',
      remarks: form.remarks || '',
    }
  }
  if (resource === 'sales_forecast') {
    return {
      employee_id: form.employee_id ? Number(form.employee_id) : null,
      forecast_period: form.forecast_period || '',
      quota_amount: form.quota_amount ? Number(form.quota_amount) : null,
      pipeline_value: form.pipeline_value ? Number(form.pipeline_value) : null,
      weighted_value: form.weighted_value ? Number(form.weighted_value) : null,
      achieve_amount: form.achieve_amount ? Number(form.achieve_amount) : null,
    }
  }
  if (resource === 'services') {
    return {
      service_name: form.service_name || '',
      company_name: form.company_name || '',
      category: form.category || '',
      sub_category: form.sub_category || '',
      tax_category: form.tax_category || '',
      margin_percentage: form.margin_percentage ? Number(form.margin_percentage) : null,
      warranty: form.warranty || '',
      warranty_period: form.warranty_period || '',
      service_description: form.service_description || '',
      service_notes: form.service_notes || '',
    }
  }
  // employees (default)
  const payload = {
    first_name: form.first_name || '',
    last_name: form.last_name || '',
    email: form.email || '',
    address: form.address || null,
    is_active: form.is_active ?? true,
    roles: form.roles_text
      ? form.roles_text.split(',').map(role => role.trim()).filter(Boolean)
      : (form.roles || []),
  }
  if (form.password) payload.password = form.password
  return payload
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

export function StatusBadge({ status }) {
  const normalized = typeof status === 'boolean'
    ? (status ? 'active' : 'inactive')
    : (status || 'unknown')
  const bgColor =
    normalized === 'active'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : normalized === 'archived' || normalized === 'inactive'
        ? 'bg-amber-50 text-amber-700 border border-amber-200'
        : 'bg-slate-50 text-slate-500 border border-slate-200'

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${bgColor}`}>
      {normalized}
    </span>
  )
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

export function Dropdown({ trigger, items, align = 'left', className = '', matchWidth = false }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`relative inline-block ${matchWidth ? 'w-[220px]' : ''} ${className}`}>
      <div onClick={() => setOpen(!open)} className={`cursor-pointer ${matchWidth ? 'w-full' : ''}`}>{trigger}</div>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className={`absolute top-full mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg z-[9999] w-full min-w-[220px] py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
            onClick={() => setOpen(false)}
          >
            {items.map((item, i) =>
              item === 'divider' ? (
                <div key={i} className="h-px bg-[var(--color-border)] my-1" />
              ) : (
                <button
                  key={i}
                  onClick={(e) => { e.preventDefault(); item.onClick?.() }}
                  className="w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-3 text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">{item.label}</span>
                  {item.icon && <span className="text-[var(--color-muted-fg)] text-xs shrink-0">{item.icon}</span>}
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Column width system ──────────────────────────────────────────────────────

export const COLUMN_WIDTHS = {
  id: { min: 56, fr: 0.45 },
  code: { min: 76, fr: 0.7 },
  tiny: { min: 58, fr: 0.45 },
  compact: { min: 84, fr: 0.7 },
  normal: { min: 104, fr: 1 },
  wide: { min: 142, fr: 1.45 },
}

const ID_COLUMN_KEYS = new Set([
  'client_id', 'supplier_id', 'warehouse_id', 'document_id',
  'contact_id', 'lead_id', 'activity_id', 'opportunity_id',
  'forecast_id', 'service_id', 'employee_id',
])

export function getColumnSize(col) {
  if (col.size) return col.size
  if (ID_COLUMN_KEYS.has(col.key)) return COLUMN_WIDTHS.id
  if (col.key.endsWith('_code') || col.key === 'tin_number') return COLUMN_WIDTHS.code
  if (['quantity', 'unit', 'status', 'is_primary_contact'].includes(col.key)) return COLUMN_WIDTHS.tiny
  if (['type', 'document_type', 'supplier_type', 'vat_status', 'warranty', 'margin_percentage', 'probability_percentage', 'activity_date', 'last_login', 'expected_closed_date', 'uploaded_at', 'contact_number', 'mobile_number', 'landline', 'customer_type'].includes(col.key)) return COLUMN_WIDTHS.compact
  if (['full_name', 'company_name', 'product_name', 'supplier_name', 'warehouse_name', 'document_name', 'title', 'service_name', 'project_name', 'subject', 'address', 'billing_address', 'product_description', 'notes_outcome', 'file_path', 'service_description', 'remarks'].includes(col.key)) return COLUMN_WIDTHS.wide
  return COLUMN_WIDTHS.normal
}

export function getColumnTrack(col) {
  const size = getColumnSize(col)
  return `minmax(${size.min}px, ${size.fr}fr)`
}

// ─── Column definitions ───────────────────────────────────────────────────────

export const CLIENT_COLUMNS = [
  { label: 'Code', key: 'customer_code', render: it => <span className="text-xs text-slate-500 font-mono">{it.customer_code || '—'}</span> },
  { label: 'Company', key: 'company_name', render: it => (<div><p className="text-sm font-medium text-slate-900">{it.company_name}</p>{it.trade_name && <p className="text-[11px] text-slate-500">{it.trade_name}</p>}</div>) },
  { label: 'Entity', key: 'entity', render: it => <span className="text-xs text-slate-600">{it.entity || '—'}</span> },
  { label: 'Type', key: 'customer_type', render: it => <span className="text-xs text-slate-600">{it.customer_type || '—'}</span> },
  { label: 'Industry', key: 'industry', render: it => <span className="text-xs text-slate-600">{it.industry || '—'}</span> },
  { label: 'TIN', key: 'tin_number', render: it => <span className="text-xs text-slate-600 font-mono">{it.tin_number || '—'}</span> },
  { label: 'Salesperson', key: 'assigned_salesperson', render: it => <span className="text-xs text-slate-600">{it.assigned_salesperson || '—'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'active'} /> },
]

export const PRODUCT_COLUMNS = [
  { label: 'Code', key: 'product_code', render: it => <span className="text-sm font-medium text-slate-900 font-mono">{it.product_code}</span> },
  { label: 'Name', key: 'product_name', render: it => <span className="text-xs text-slate-600">{it.product_name}</span> },
  { label: 'Brand', key: 'product_brand', render: it => <span className="text-xs text-slate-600">{it.product_brand}</span> },
  { label: 'Fulfillment', key: 'fulfillment_type', render: it => {
    const t = it.fulfillment_type || 'DIRECT'
    const colors = { DIRECT: 'bg-blue-50 text-blue-700 border-blue-200', MTO: 'bg-purple-50 text-purple-700 border-purple-200', SERVICE: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border ${colors[t] || colors.DIRECT}`}>{t}</span>
  }},
  { label: 'Buying Price', key: 'buying_price_vat', render: it => <span className="text-xs text-slate-600 tabular-nums">{it.buying_price_vat ?? '—'}</span> },
  { label: 'Selling Price', key: 'selling_price_margin', render: it => <span className="text-xs text-slate-600 tabular-nums">{it.selling_price_margin ?? '—'}</span> },
  { label: 'Supplier', key: 'supplier_name', render: it => <span className="text-xs text-slate-600">{it.supplier_name || '—'}</span> },
  { label: 'Qty', key: 'quantity', render: it => <span className="text-xs text-slate-600 tabular-nums">{it.quantity ?? '—'}</span> },
  { label: 'Unit', key: 'unit', render: it => <span className="text-xs text-slate-600">{it.unit || '—'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'active'} /> },
]

export const EMPLOYEE_COLUMNS = [
  { label: 'Name', key: 'full_name', render: it => (<div><p className="text-sm font-medium text-slate-900">{[it.first_name, it.last_name].filter(Boolean).join(' ') || '—'}</p><p className="text-[11px] text-slate-500">{it.email || '—'}</p></div>) },
  { label: 'Address', key: 'address', render: it => <span className="text-xs text-slate-600">{it.address || '—'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.is_active} /> },
  { label: 'Last Login', key: 'last_login', render: it => <span className="text-xs text-slate-600">{it.last_login ? new Date(it.last_login).toLocaleDateString() : '—'}</span> },
]

export const SUPPLIER_COLUMNS = [
  { label: 'Supplier ID', key: 'supplier_id', render: it => <span className="text-xs text-slate-500 font-mono">{it.supplier_id || '—'}</span> },
  { label: 'Company Name', key: 'company_name', render: it => <span className="text-sm font-medium text-slate-900">{it.company_name || '—'}</span> },
  { label: 'TIN Number', key: 'tin_number', render: it => <span className="text-xs text-slate-600 font-mono">{it.tin_number || '—'}</span> },
  { label: 'Supplier Type', key: 'supplier_type', render: it => <span className="text-xs text-slate-600">{it.supplier_type || '—'}</span> },
  { label: 'Industry', key: 'industry', render: it => <span className="text-xs text-slate-600">{it.industry || '—'}</span> },
  { label: 'VAT Status', key: 'vat_status', render: it => <span className="text-xs text-slate-600">{it.vat_status || '—'}</span> },
  { label: 'Payment Terms', key: 'payment_terms', render: it => <span className="text-xs text-slate-600">{it.payment_terms || '—'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'active'} /> },
]

export const WAREHOUSE_COLUMNS = [
  { label: 'Code', key: 'warehouse_code', render: it => <span className="text-sm font-medium text-slate-900 font-mono">{it.warehouse_code || '-'}</span> },
  { label: 'Warehouse Name', key: 'warehouse_name', render: it => <span className="text-sm font-medium text-slate-900">{it.warehouse_name || '-'}</span> },
  { label: 'Address', key: 'address', render: it => <span className="text-xs text-slate-600">{it.address || '-'}</span> },
  { label: 'Contact Person', key: 'contact_person', render: it => <span className="text-xs text-slate-600">{it.contact_person || '-'}</span> },
  { label: 'Contact Number', key: 'contact_number', render: it => <span className="text-xs text-slate-600 font-mono">{it.contact_number || '-'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'active'} /> },
]

export const DOCUMENT_COLUMNS = [
  { label: 'Doc #', key: 'document_number', render: it => <span className="text-xs text-slate-500 font-mono">{it.document_number || '—'}</span> },
  { label: 'Title', key: 'title', render: it => <span className="text-sm font-medium text-slate-900">{it.title || '—'}</span> },
  { label: 'Type', key: 'document_type', render: it => <span className="text-xs text-slate-600">{it.document_type || '—'}</span> },
  { label: 'Company', key: 'entity', render: it => <span className="text-xs text-slate-600">{it.entity || '—'}</span> },
  { label: 'Source', key: 'source', render: it => <span className="text-xs text-slate-500">{it.source || '—'}</span> },
  { label: 'Owner', key: 'owner_name', render: it => <span className="text-xs text-slate-600">{it.owner_name || '—'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'Active'} /> },
]

export const CONTACT_COLUMNS = [
  { label: 'Name', key: 'full_name', render: it => <span className="text-sm font-medium text-slate-900">{[it.first_name, it.last_name].filter(Boolean).join(' ') || '—'}</span> },
  { label: 'Company', key: 'client_id', render: it => <span className="text-xs text-slate-600">{it._company_name || '—'}</span> },
  { label: 'Job Title', key: 'job_title', render: it => <span className="text-xs text-slate-600">{it.job_title || '—'}</span> },
  { label: 'Email', key: 'email', render: it => <span className="text-xs text-slate-600">{it.email || '—'}</span> },
  { label: 'Phone', key: 'landline', render: it => <span className="text-xs text-slate-600 font-mono">{it.landline || '—'}</span> },
  { label: 'Primary', key: 'is_primary_contact', render: it => <span className="text-xs text-slate-600">{it.is_primary_contact ? 'Yes' : 'No'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'active'} /> },
]

export const LEAD_COLUMNS = [
  { label: 'ID', key: 'lead_id', render: it => <span className="text-xs text-slate-500 font-mono">{it.lead_id || '—'}</span> },
  { label: 'Company', key: 'company_name', render: it => <span className="text-sm font-medium text-slate-900">{it.company_name || '—'}</span> },
  { label: 'Contact', key: 'contact_name', render: it => <span className="text-xs text-slate-600">{[it.first_name, it.last_name].filter(Boolean).join(' ') || it.contact_name || '—'}</span> },
  { label: 'Email', key: 'email', render: it => <span className="text-xs text-slate-600">{it.email || '—'}</span> },
  { label: 'Mobile', key: 'mobile_number', render: it => <span className="text-xs text-slate-600 font-mono">{it.mobile_number || '—'}</span> },
  { label: 'Source', key: 'lead_source', render: it => <span className="text-xs text-slate-600">{it.lead_source || '—'}</span> },
  { label: 'Lead Status', key: 'lead_status', render: it => <span className="text-xs text-slate-600">{it.lead_status || '—'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'active'} /> },
]

export const SALES_ACTIVITY_COLUMNS = [
  { label: 'ID', key: 'activity_id', render: it => <span className="text-xs text-slate-500 font-mono">{it.activity_id || '—'}</span> },
  { label: 'Type', key: 'activity_type', render: it => <span className="text-xs text-slate-600">{it.activity_type || '—'}</span> },
  { label: 'Date', key: 'activity_date', render: it => <span className="text-xs text-slate-600">{it.activity_date ? new Date(it.activity_date).toLocaleDateString() : '—'}</span> },
  { label: 'Subject', key: 'subject', render: it => <span className="text-sm font-medium text-slate-900">{it.subject || '—'}</span> },
  { label: 'Notes/Outcome', key: 'notes_outcome', render: it => <span className="text-xs text-slate-600 truncate max-w-[200px] block">{it.notes_outcome || '—'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'active'} /> },
]

export const OPPORTUNITY_COLUMNS = [
  { label: 'ID', key: 'opportunity_id', render: it => <span className="text-xs text-slate-500 font-mono">{it.opportunity_id || '—'}</span> },
  { label: 'Project', key: 'project_name', render: it => <span className="text-sm font-medium text-slate-900">{it.project_name || '—'}</span> },
  { label: 'Client ID', key: 'client_id', render: it => <span className="text-xs text-slate-600 font-mono">{it.client_id || '—'}</span> },
  { label: 'Value', key: 'estimated_value', render: it => <span className="text-xs text-slate-600 tabular-nums">{it.estimated_value ?? '—'}</span> },
  { label: 'Probability', key: 'probability_percentage', render: it => <span className="text-xs text-slate-600 tabular-nums">{it.probability_percentage != null ? `${it.probability_percentage}%` : '—'}</span> },
  { label: 'Stage', key: 'stage', render: it => <span className="text-xs text-slate-600">{it.stage || '—'}</span> },
  { label: 'Close Date', key: 'expected_closed_date', render: it => <span className="text-xs text-slate-600">{it.expected_closed_date ? new Date(it.expected_closed_date).toLocaleDateString() : '—'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'active'} /> },
]

export const SALES_FORECAST_COLUMNS = [
  { label: 'ID', key: 'forecast_id', render: it => <span className="text-xs text-slate-500 font-mono">{it.forecast_id || '—'}</span> },
  { label: 'Period', key: 'forecast_period', render: it => <span className="text-sm font-medium text-slate-900">{it.forecast_period || '—'}</span> },
  { label: 'Quota', key: 'quota_amount', render: it => <span className="text-xs text-slate-600 tabular-nums">{it.quota_amount ?? '—'}</span> },
  { label: 'Pipeline', key: 'pipeline_value', render: it => <span className="text-xs text-slate-600 tabular-nums">{it.pipeline_value ?? '—'}</span> },
  { label: 'Weighted', key: 'weighted_value', render: it => <span className="text-xs text-slate-600 tabular-nums">{it.weighted_value ?? '—'}</span> },
  { label: 'Achieved', key: 'achieve_amount', render: it => <span className="text-xs text-slate-600 tabular-nums">{it.achieve_amount ?? '—'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'active'} /> },
]

export const SERVICE_COLUMNS = [
  { label: 'ID', key: 'service_id', render: it => <span className="text-xs text-slate-500 font-mono">{it.service_id || '—'}</span> },
  { label: 'Service Name', key: 'service_name', render: it => <span className="text-sm font-medium text-slate-900">{it.service_name || '—'}</span> },
  { label: 'Company', key: 'company_name', render: it => <span className="text-xs text-slate-600">{it.company_name || '—'}</span> },
  { label: 'Category', key: 'category', render: it => <span className="text-xs text-slate-600">{it.category || '—'}</span> },
  { label: 'Sub-Category', key: 'sub_category', render: it => <span className="text-xs text-slate-600">{it.sub_category || '—'}</span> },
  { label: 'Margin %', key: 'margin_percentage', render: it => <span className="text-xs text-slate-600 tabular-nums">{it.margin_percentage != null ? `${it.margin_percentage}%` : '—'}</span> },
  { label: 'Warranty', key: 'warranty', render: it => <span className="text-xs text-slate-600">{it.warranty || '—'}</span> },
  { label: 'Status', key: 'status', render: it => <StatusBadge status={it.status || 'active'} /> },
]

// Map resource name → its column config
export const COLUMNS_MAP = {
  clients: CLIENT_COLUMNS,
  products: PRODUCT_COLUMNS,
  employees: EMPLOYEE_COLUMNS,
  supplier_list: SUPPLIER_COLUMNS,
  warehouses: WAREHOUSE_COLUMNS,
  documents: DOCUMENT_COLUMNS,
  contact_list: CONTACT_COLUMNS,
  leads: LEAD_COLUMNS,
  sales_activity: SALES_ACTIVITY_COLUMNS,
  opportunities: OPPORTUNITY_COLUMNS,
  sales_forecast: SALES_FORECAST_COLUMNS,
  services: SERVICE_COLUMNS,
}
