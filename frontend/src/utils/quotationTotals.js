const asAmount = (value) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100

export function quotationUnitPrice(item) {
  return asAmount(item?.selling_price) || asAmount(item?.unit_cost)
}

export function calculateQuotationTotals(quotation = {}, items = quotation.items || []) {
  const lineTotals = items.reduce((summary, item) => {
    if (item?.is_section) return summary

    const quantity = Math.max(asAmount(item?.quantity), 0)
    const unitPrice = quotationUnitPrice(item)
    const discountPercent = Math.min(Math.max(asAmount(item?.discount_percent), 0), 100)
    const grossAmount = quantity * unitPrice
    const discountAmount = grossAmount * discountPercent / 100

    summary.grossSubtotal += grossAmount
    summary.itemDiscountAmount += discountAmount
    return summary
  }, { grossSubtotal: 0, itemDiscountAmount: 0 })

  const grossSubtotal = roundCurrency(lineTotals.grossSubtotal)
  const itemDiscountAmount = roundCurrency(lineTotals.itemDiscountAmount)
  const subtotal = roundCurrency(grossSubtotal - itemDiscountAmount)
  const discountAmount = Math.min(Math.max(asAmount(quotation.discount_amount), 0), subtotal)
  const taxableSubtotal = roundCurrency(subtotal - discountAmount)
  const vatAmount = roundCurrency(taxableSubtotal * Math.max(asAmount(quotation.vat_rate), 0) / 100)
  const whtAmount = roundCurrency(taxableSubtotal * Math.max(asAmount(quotation.wht_rate), 0) / 100)
  const shippingCost = Math.max(asAmount(quotation.shipping_cost), 0)
  const othersCost = Math.max(asAmount(quotation.others_cost), 0)
  const grandTotal = roundCurrency(taxableSubtotal + vatAmount - whtAmount + shippingCost + othersCost)

  return {
    grossSubtotal,
    itemDiscountAmount,
    subtotal,
    discountAmount: roundCurrency(discountAmount),
    taxableSubtotal,
    vatAmount,
    whtAmount,
    shippingCost: roundCurrency(shippingCost),
    othersCost: roundCurrency(othersCost),
    grandTotal,
  }
}
