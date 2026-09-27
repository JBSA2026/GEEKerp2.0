// Shared formatting helpers and constants for the Accounts Receivable
// (AR_Dashboard) and Accounts Payable (AP_Dashboard) modules. Kept in a
// non-component module so both dashboards can import the SAME `money()`
// formatter and aging-bucket order (Req 15.4, 15.13, 16.4, 16.10).

// The five aging buckets in chronological order. Mirrors the backend
// `AGING_BUCKETS` tuple in `ar_ap_calc.py`. Used to guarantee the aging chart
// always presents all five buckets (Req 15.5, 16.5) even before data loads.
export const AGING_BUCKETS = ['Current', '1-30 Days', '31-60 Days', '61-90 Days', 'Over 90 Days']

/**
 * Format a monetary value as Philippine Peso: prefixed with ₱, a thousands
 * separator, and exactly two decimal places; renders ₱0.00 for a zero value
 * (Req 15.4, 16.4). Mirrors the `money()` Intl formatter in `Purchasing.jsx`.
 */
export function money(value, currency = 'PHP') {
  const currencyCode = currency === 'USD' ? 'USD' : 'PHP'
  return new Intl.NumberFormat(currencyCode === 'USD' ? 'en-US' : 'en-PH', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}
