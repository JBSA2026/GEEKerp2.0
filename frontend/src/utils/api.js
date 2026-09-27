const BASE = import.meta.env.VITE_API_URL

// ── Token storage ─────────────────────────────────────────────────────────

export const token = {
  get:    ()  => localStorage.getItem('access_token'),
  set:    (t) => localStorage.setItem('access_token', t),
  remove: ()  => localStorage.removeItem('access_token'),
}

// ── Session expiry event bus ──────────────────────────────────────────────
// Components can subscribe to be notified when the session expires (401) or
// is about to expire (warning). This avoids coupling the API layer to React.

const SESSION_EXPIRED_EVENT = 'geek-erp:session-expired'
const SESSION_WARNING_EVENT = 'geek-erp:session-warning'

/** Dispatch when a 401 is received from any authenticated endpoint. */
export function emitSessionExpired() {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
}

/** Dispatch when the token is about to expire (e.g. 5 min before). */
export function emitSessionWarning(minutesLeft) {
  window.dispatchEvent(new CustomEvent(SESSION_WARNING_EVENT, { detail: { minutesLeft } }))
}

export function onSessionExpired(handler) {
  window.addEventListener(SESSION_EXPIRED_EVENT, handler)
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
}

export function onSessionWarning(handler) {
  window.addEventListener(SESSION_WARNING_EVENT, handler)
  return () => window.removeEventListener(SESSION_WARNING_EVENT, handler)
}

// ── Session expiry timer ──────────────────────────────────────────────────
// Starts after login; fires a warning 5 minutes before expiry, then forces
// logout at expiry.

let _expiryWarningTimer = null
let _expiryLogoutTimer = null

const WARNING_BEFORE_MS = 5 * 60 * 1000 // 5 minutes

export function startSessionTimers() {
  clearSessionTimers()
  const raw = token.get()
  if (!raw) return
  const payload = decodeToken(raw)
  if (!payload?.exp) return

  const expiresAt = payload.exp * 1000
  const now = Date.now()
  const msUntilExpiry = expiresAt - now
  const msUntilWarning = msUntilExpiry - WARNING_BEFORE_MS

  if (msUntilExpiry <= 0) {
    // Already expired
    token.remove()
    emitSessionExpired()
    return
  }

  if (msUntilWarning > 0) {
    _expiryWarningTimer = setTimeout(() => {
      const minsLeft = Math.ceil((expiresAt - Date.now()) / 60000)
      emitSessionWarning(minsLeft)
    }, msUntilWarning)
  }

  _expiryLogoutTimer = setTimeout(() => {
    token.remove()
    emitSessionExpired()
  }, msUntilExpiry)
}

export function clearSessionTimers() {
  if (_expiryWarningTimer) { clearTimeout(_expiryWarningTimer); _expiryWarningTimer = null }
  if (_expiryLogoutTimer) { clearTimeout(_expiryLogoutTimer); _expiryLogoutTimer = null }
}

// ── JWT decode (no verification — trust the backend for that) ─────────────

export function decodeToken(raw) {
  try {
    const payload = raw.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

/** Returns the stored user payload or null. */
export function getStoredUser() {
  const raw = token.get()
  if (!raw) return null
  const payload = decodeToken(raw)
  if (!payload) return null
  // Check expiry
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    token.remove()
    return null
  }
  return payload   // { employee_id, email, roles: [...], exp }
}

// ── Auth header helper ────────────────────────────────────────────────────

function authHeaders(extra = {}) {
  const t = token.get()
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...extra,
  }
}

// ── Global 401 interceptor ────────────────────────────────────────────────
// Wraps fetch to detect 401s on authenticated endpoints and emit session-expired.

let _sessionExpiredFired = false

function resetSessionExpiredFlag() {
  _sessionExpiredFired = false
}

async function authFetch(url, options = {}) {
  const res = await fetch(url, options)
  // Only intercept 401 on authenticated requests (not login itself)
  if (res.status === 401 && options.headers?.Authorization && !_sessionExpiredFired) {
    _sessionExpiredFired = true
    token.remove()
    clearSessionTimers()
    emitSessionExpired()
  }
  return res
}

// ── Auth API ──────────────────────────────────────────────────────────────

export async function login(email, password) {
  const body = new URLSearchParams({ username: email, password })

  let res
  try {
    res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch {
    throw new Error('Unable to reach the server. Please check your connection.')
  }

  if (res.status === 401) {
    throw new Error('Incorrect email or password.')
  }
  if (res.status === 403) {
    throw new Error('Your account has been disabled. Contact your administrator.')
  }
  if (!res.ok) {
    let detail = ''
    try { const p = await res.json(); detail = p.error || p.detail } catch { /* ignore */ }
    throw new Error(detail || `Unexpected error (${res.status}). Please try again.`)
  }

  const data = await res.json()
  token.set(data.access_token)
  resetSessionExpiredFlag()
  startSessionTimers()
  return decodeToken(data.access_token)
}

export async function logout() {
  try {
    await authFetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
    })
  } catch { /* ignore network errors during logout */ }
  clearSessionTimers()
  token.remove()
  resetSessionExpiredFlag()
}

export async function getMe() {
  const res = await authFetch(`${BASE}/auth/me`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Unauthorized')
  return res.json()
}

// ── Role helpers ──────────────────────────────────────────────────────────

/** Check if the current stored user has at least one of the given roles. */
export function hasRole(...roles) {
  const user = getStoredUser()
  if (!user?.roles) return false
  return roles.some(r => user.roles.includes(r))
}

// ── Generic resource helpers ──────────────────────────────────────────────

export async function fetchRecords(resource, search = '') {
  const url = new URL(`${BASE}/${resource}/`)
  if (search.trim()) url.searchParams.set('search', search)
  const res = await authFetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function requestError(res, fallback = 'Request failed') {
  let payload
  try {
    payload = await res.json()
  } catch {
    try {
      const text = await res.text()
      return new Error(text || fallback)
    } catch {
      return new Error(fallback)
    }
  }
  // New consistent shape: { error, fields?, detail? }. Fall back to legacy { detail }.
  const detail = payload?.detail
  const detailMessage = typeof detail === 'string'
    ? detail
    : detail?.error || (Array.isArray(detail?.blockers) ? detail.blockers.join(' ') : '')
  const message = payload?.error || detailMessage || fallback
  const err = new Error(message)
  if (payload?.fields) err.fields = payload.fields
  if (detail) err.detail = detail
  return err
}

export async function fetchMasterData(resource, { search = '', status = 'All' } = {}) {
  const url = new URL(`${BASE}/master-data/${resource}`)
  if (search.trim()) url.searchParams.set('search', search)
  if (status && status !== 'All') url.searchParams.set('status', status.toLowerCase())
  const res = await authFetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchMasterDataCounts() {
  const res = await authFetch(`${BASE}/master-data/counts`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function archiveMasterDataRecords(resource, ids) {
  const res = await authFetch(`${BASE}/master-data/${resource}/archive`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    throw await requestError(res, 'Unable to archive records')
  }
  return res.json()
}

export async function restoreMasterDataRecords(resource, ids) {
  const res = await authFetch(`${BASE}/master-data/${resource}/restore`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    throw await requestError(res, 'Unable to restore records')
  }
  return res.json()
}

export async function deleteMasterDataRecords(resource, ids) {
  const res = await authFetch(`${BASE}/master-data/${resource}/bulk-delete`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    throw await requestError(res, 'Unable to delete records')
  }
  return res.json()
}

export function getMasterDataExportUrl(resource, { search = '', status = 'All' } = {}) {
  const url = new URL(`${BASE}/master-data/${resource}/export`)
  if (search.trim()) url.searchParams.set('search', search)
  if (status && status !== 'All') url.searchParams.set('status', status.toLowerCase())
  return url.toString()
}

export async function createRecord(resource, payload) {
  const res = await authFetch(`${BASE}/${resource}/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await requestError(res)
  }
  return res.json()
}

export async function updateRecord(resource, id, payload) {
  const res = await authFetch(`${BASE}/${resource}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await requestError(res)
  }
  return res.json()
}

export async function deleteRecord(resource, id) {
  const res = await authFetch(`${BASE}/${resource}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    throw await requestError(res)
  }
}

export async function fetchInventorySummary() {
  const res = await authFetch(`${BASE}/inventory/summary`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchInventoryMeta() {
  const res = await authFetch(`${BASE}/inventory/meta`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createInventoryStock(payload) {
  const res = await authFetch(`${BASE}/inventory/stock`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Unable to save stock item')
  }
  return res.json()
}

export async function updateInventoryStock(stockId, payload) {
  const res = await authFetch(`${BASE}/inventory/stock/${encodeURIComponent(stockId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.error || 'Unable to update stock item')
  }
  return res.json()
}

export async function updateProduct(productCode, payload) {
  const res = await authFetch(`${BASE}/products/${encodeURIComponent(productCode)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.error || 'Unable to update product')
  }
  return res.json()
}

export async function updateInventoryStockLocation(stockId, payload) {
  const res = await authFetch(`${BASE}/inventory/stock/${encodeURIComponent(stockId)}/location`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.error || 'Unable to update item area')
  }
  return res.json()
}

export async function deleteInventoryStock(stockId) {
  const res = await authFetch(`${BASE}/inventory/stock/${encodeURIComponent(stockId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Unable to delete stock row')
  }
}

export async function createInventoryMovement(payload) {
  const res = await authFetch(`${BASE}/inventory/movements`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Unable to save inventory movement')
  }
  return res.json()
}

export async function receivePendingTransfer(movementId, payload = {}) {
  const res = await authFetch(`${BASE}/inventory/transfers/${encodeURIComponent(movementId)}/receive`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.error || 'Unable to receive pending transfer')
  }
  return res.json()
}

export async function fetchInternalTransferOptions(purchaseOrderItemId) {
  const res = await authFetch(`${BASE}/purchasing/purchase-order-items/${encodeURIComponent(purchaseOrderItemId)}/internal-transfer-options`, {
    headers: authHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.error || 'Unable to load internal transfer options')
  }
  return res.json()
}

export async function createInternalTransfer(payload) {
  const res = await authFetch(`${BASE}/purchasing/purchase-order-items/internal-transfer`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const detail = err.detail || err.error
    const error = new Error(
      typeof detail === 'object' ? detail.message || 'Insufficient stock for the internal transfer' : detail || 'Unable to transfer stock',
    )
    if (detail && typeof detail === 'object') error.details = detail
    throw error
  }
  return res.json()
}

export async function moveInventoryStock(stockId, payload) {
  const res = await authFetch(`${BASE}/inventory/stock/${encodeURIComponent(stockId)}/move`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.error || 'Unable to move stock')
  }
  return res.json()
}

export async function createWarehouse(payload) {
  const res = await authFetch(`${BASE}/warehouses/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.error || 'Unable to create warehouse')
  }
  return res.json()
}

export async function updateWarehouse(warehouseId, payload) {
  const res = await authFetch(`${BASE}/warehouses/${encodeURIComponent(warehouseId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.error || 'Unable to update warehouse')
  }
  return res.json()
}

export async function fetchInventoryLocations(warehouseId = null) {
  const url = new URL(`${BASE}/inventory/locations`)
  if (warehouseId) url.searchParams.set('warehouse_id', warehouseId)
  const res = await authFetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createInventoryLocation(payload) {
  const res = await authFetch(`${BASE}/inventory/locations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.error || 'Unable to create location')
  }
  return res.json()
}

export async function updateInventoryLocation(locationId, payload) {
  const res = await authFetch(`${BASE}/inventory/locations/${encodeURIComponent(locationId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.error || 'Unable to update location')
  }
  return res.json()
}

export async function deleteInventoryLocation(locationId) {
  const res = await authFetch(`${BASE}/inventory/locations/${encodeURIComponent(locationId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Unable to delete location')
  }
}

// ── Accounts Receivable (AR) API ───────────────────────────────────────────

/** Build a query string from a params object, skipping empty/null values. */
function buildQuery(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, value)
    }
  })
  const s = qs.toString()
  return s ? `?${s}` : ''
}

async function arFetch(path, fallback = 'Unable to load receivables data') {
  const res = await authFetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    throw await requestError(res, fallback)
  }
  return res.json()
}

async function arMutate(path, { method = 'POST', body } = {}, fallback = 'Request failed') {
  const res = await authFetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    throw await requestError(res, fallback)
  }
  if (res.status === 204) return null
  return res.json()
}

/** AR dashboard summary metrics, aging chart buckets, and outstanding-invoice table. */
export function fetchArDashboard({ company = 'All' } = {}) {
  return arFetch(`/ar/dashboard${buildQuery({ company: company !== 'All' ? company : '' })}`, 'Receivables data could not be loaded')
}

/** Form dropdown data: customers, projects, quotations, AR tax codes. */
export function fetchArMeta() {
  return arFetch('/ar/meta')
}

/** List invoices (active only by default). */
export function fetchArInvoices({ search = '', status = 'All', company = 'All' } = {}) {
  return arFetch(`/ar/invoices${buildQuery({ search, status: status !== 'All' ? status : '', company: company !== 'All' ? company : '' })}`)
}

/** A single invoice with its line items, collections, and attachments. */
export function fetchArInvoice(invoiceId) {
  return arFetch(`/ar/invoices/${encodeURIComponent(invoiceId)}`)
}

/** Confirm a DRAFT invoice so it enters receivables. */
export function confirmArInvoice(invoiceId) {
  return arMutate(`/ar/invoices/${encodeURIComponent(invoiceId)}/confirm`, {}, 'Unable to confirm invoice')
}

/** Record a customer collection against an invoice. */
export function recordArCollection({ invoice_id, invoice_number, collection_amount, collection_date, payment_method, or_number }) {
  return arMutate(
    '/ar/collections',
    { body: { invoice_id, invoice_number, collection_amount, collection_date, payment_method, or_number } },
    'Unable to record collection',
  )
}

/** Attach a document reference to an AR invoice. */
export function addArInvoiceAttachment(invoiceId, payload) {
  return arMutate(`/ar/invoices/${encodeURIComponent(invoiceId)}/attachments`, { body: payload }, 'Unable to attach document')
}

/** Collection report listing (active collections), with optional filters/grouping. */
export function fetchArCollections({ from = '', to = '', customer = '', group_by = '' } = {}) {
  return arFetch(`/ar/collections${buildQuery({ from, to, customer, group_by })}`)
}

/** Invoice receipt listing generated from posted collections. */
export function fetchArInvoiceReceipts({ from = '', to = '', customer = '', invoice_id = '' } = {}) {
  return arFetch(`/ar/invoice-receipts${buildQuery({ from, to, customer, invoice_id })}`)
}

/** Build a URL for the invoice receipts CSV export. */
export function getArInvoiceReceiptsCsvUrl({ from = '', to = '', customer = '', invoice_id = '' } = {}) {
  return `${BASE}/ar/invoice-receipts${buildQuery({ from, to, customer, invoice_id, export: 'csv' })}`
}

/** AR aging report with per-bucket totals and per-invoice rows. */
export function fetchArAging({ customer = '', from = '', to = '', bucket = '', company = 'All' } = {}) {
  return arFetch(`/ar/aging${buildQuery({ customer, from, to, bucket, company: company !== 'All' ? company : '' })}`)
}

/** Customer statement of account for the given customer and period. */
export function fetchArStatement({ customer, from = '', to = '' } = {}) {
  return arFetch(`/ar/statements${buildQuery({ customer, from, to })}`)
}

/** Build a URL for the customer statement PDF export. */
export function getArStatementPdfUrl({ customer, from = '', to = '' } = {}) {
  return `${BASE}/ar/statements/export.pdf${buildQuery({ customer, from, to })}`
}

/** Overdue customers report: per-customer outstanding totals and days overdue. */
export function fetchArOverdueCustomers({ from = '', to = '', company = 'All' } = {}) {
  return arFetch(`/ar/overdue-customers${buildQuery({ from, to, company: company !== 'All' ? company : '' })}`)
}

// ── Accounts Payable (AP) API ──────────────────────────────────────────────
//
// Mirrors the AR helper style above (buildQuery + a thin module fetch wrapper).
// Both modules share the same query-string builder; only the error fallback and
// route prefix differ.

async function apFetch(path, fallback = 'Unable to load payables data') {
  const res = await authFetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    throw await requestError(res, fallback)
  }
  return res.json()
}

/** AP dashboard summary metrics, payables aging chart, and supplier-bills table. */
export function fetchApDashboard({ company = 'All' } = {}) {
  return apFetch(`/ap/dashboard${buildQuery({ company: company !== 'All' ? company : '' })}`, 'Payables data could not be loaded')
}

/** Actionable AP queues: drafts, approvals, due bills, exceptions, issued checks. */
export function fetchApWorkQueue({ company = 'All' } = {}) {
  return apFetch(`/ap/work-queue${buildQuery({ company: company !== 'All' ? company : '' })}`, 'Unable to load payables work queue')
}

/** Form dropdown data: suppliers, purchase orders, AP tax codes. */
export function fetchApMeta() {
  return apFetch('/ap/meta')
}

/** List bills (active only by default). */
export function fetchApBills({ search = '', status = 'All', company = 'All' } = {}) {
  return apFetch(`/ap/bills${buildQuery({ search, status: status !== 'All' ? status : '', company: company !== 'All' ? company : '' })}`)
}

/** A single bill with its line items and attachments. */
export function fetchApBill(billId) {
  return apFetch(`/ap/bills/${encodeURIComponent(billId)}`)
}

/** List payment vouchers (active only by default), each with linked bill ids. */
export function fetchApVouchers({ search = '', status = 'All', company = 'All' } = {}) {
  return apFetch(`/ap/vouchers${buildQuery({ search, status: status !== 'All' ? status : '', company: company !== 'All' ? company : '' })}`)
}

/** Payment schedule report for a required date range, optionally grouped. */
export function fetchApPaymentSchedule({ from, to, group_by = '', company = 'All' } = {}) {
  return apFetch(`/ap/payment-schedule${buildQuery({ from, to, group_by, company: company !== 'All' ? company : '' })}`)
}

/** Check monitoring listing with optional status/supplier/date-range filters. */
export function fetchApChecks({ status = 'All', supplier = '', from = '', to = '' } = {}) {
  return apFetch(`/ap/checks${buildQuery({ status: status !== 'All' ? status : '', supplier, from, to })}`)
}

/** AP aging report with per-bucket totals and per-bill rows. */
export function fetchApAging({ supplier = '', from = '', to = '', bucket = '', as_of = '', company = 'All' } = {}) {
  return apFetch(`/ap/aging${buildQuery({ supplier, from, to, bucket, as_of, company: company !== 'All' ? company : '' })}`)
}

/** Payment report for a required date range, with optional supplier filter/grouping. */
export function fetchApPayments({ from, to, supplier = '', group_by = '' } = {}) {
  return apFetch(`/ap/payments${buildQuery({ from, to, supplier, group_by })}`)
}

/** Supplier balance inquiry: total bills, payments, and current balance per supplier. */
export function fetchApSupplierBalances({ include_zero = false, sort = '', as_of = '' } = {}) {
  return apFetch(`/ap/supplier-balances${buildQuery({ include_zero: include_zero ? 'true' : '', sort, as_of })}`)
}

// ── Accounts Payable (AP) mutations ─────────────────────────────────────────
//
// Write helpers for the payable lifecycle: confirm/discard a bill, then
// create → submit → approve/reject → pay a payment voucher. Each posts JSON and
// surfaces the backend's { error, fields } shape via requestError.

async function apMutate(path, { method = 'POST', body } = {}, fallback = 'Request failed') {
  const res = await authFetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    throw await requestError(res, fallback)
  }
  if (res.status === 204) return null
  return res.json()
}

/** Confirm a DRAFT bill -> CONFIRMED/UNPAID so it enters the payable lifecycle. */
export function confirmApBill(billId) {
  return apMutate(`/ap/bills/${encodeURIComponent(billId)}/confirm`, {}, 'Unable to confirm bill')
}

/** Archive a bill (discards a draft / soft-deletes a confirmed bill). */
export function archiveApBill(billId) {
  return apMutate(`/ap/bills/${encodeURIComponent(billId)}`, { method: 'DELETE' }, 'Unable to archive bill')
}

/** Update an editable (DRAFT or UNPAID) bill's header fields. */
export function updateApBill(billId, payload) {
  return apMutate(`/ap/bills/${encodeURIComponent(billId)}`, { method: 'PATCH', body: payload }, 'Unable to update bill')
}

/** A single payment voucher with its linked bills. */
export function fetchApVoucher(voucherId) {
  return apFetch(`/ap/vouchers/${encodeURIComponent(voucherId)}`)
}

/** Payments recorded against a voucher, most recent first. */
export function fetchApVoucherPayments(voucherId) {
  return apFetch(`/ap/vouchers/${encodeURIComponent(voucherId)}/payments`)
}

/** Create a payment voucher (PV-YYYYMM-NNN, DRAFT) linking one or more bills. */
export function createApVoucher({ supplier_id, payment_date, bill_ids }) {
  return apMutate('/ap/vouchers', { body: { supplier_id, payment_date, bill_ids } }, 'Unable to create payment voucher')
}

/** Create draft/approval payment vouchers from due bills grouped by supplier. */
export function createApPaymentRun({ from_date, to_date, submit_for_approval = false }) {
  return apMutate(
    '/ap/payment-runs',
    { body: { from_date, to_date, submit_for_approval } },
    'Unable to create payment run',
  )
}

/** Submit a voucher for approval: DRAFT -> FOR_APPROVAL. */
export function submitApVoucher(voucherId) {
  return apMutate(`/ap/vouchers/${encodeURIComponent(voucherId)}/submit`, {}, 'Unable to submit voucher')
}

/** Approve a voucher: FOR_APPROVAL -> APPROVED. */
export function approveApVoucher(voucherId) {
  return apMutate(`/ap/vouchers/${encodeURIComponent(voucherId)}/approve`, {}, 'Unable to approve voucher')
}

/** Reject a voucher: FOR_APPROVAL -> REJECTED (requires remarks). */
export function rejectApVoucher(voucherId, rejection_remarks) {
  return apMutate(`/ap/vouchers/${encodeURIComponent(voucherId)}/reject`, { body: { rejection_remarks } }, 'Unable to reject voucher')
}

/** Record a payment against an APPROVED voucher's linked bill. */
export function recordApPayment(voucherId, { bill_id, payment_amount, payment_date, payment_method, payment_file_name, payment_file_ref, payment_file_type }) {
  return apMutate(
    `/ap/vouchers/${encodeURIComponent(voucherId)}/payments`,
    { body: { bill_id, payment_amount, payment_date, payment_method, payment_file_name, payment_file_ref, payment_file_type } },
    'Unable to record payment',
  )
}

/** Attach a document reference to an AP bill. */
export function addApBillAttachment(billId, payload) {
  return apMutate(`/ap/bills/${encodeURIComponent(billId)}/attachments`, { body: payload }, 'Unable to attach document')
}

/** Check monitoring actions. */
export function clearApCheck(checkId, clearing_date) {
  return apMutate(`/ap/checks/${encodeURIComponent(checkId)}/clear`, { body: { clearing_date } }, 'Unable to clear check')
}

export function bounceApCheck(checkId) {
  return apMutate(`/ap/checks/${encodeURIComponent(checkId)}/bounce`, {}, 'Unable to bounce check')
}

export function cancelApCheck(checkId) {
  return apMutate(`/ap/checks/${encodeURIComponent(checkId)}/cancel`, {}, 'Unable to cancel check')
}
