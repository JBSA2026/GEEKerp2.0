import { jsPDF } from 'jspdf'

/**
 * BIR Form 1600-VT PDF Export
 * Monthly Remittance Return of Value-Added Tax Withheld
 * A4 portrait, coordinate-driven layout.
 */

const PW = 210
const PH = 297
const M = 8
const CW = PW - M * 2

function money(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return ''
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function cell(doc, x, y, w, h, text, opts = {}) {
  const { align = 'left', bold = false, fontSize = 7, fill = null, border = true } = opts
  if (fill) { doc.setFillColor(fill); doc.rect(x, y, w, h, 'F') }
  if (border) { doc.setDrawColor('#000000'); doc.setLineWidth(0.2); doc.rect(x, y, w, h, 'S') }
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(fontSize)
  doc.setTextColor('#000000')
  const pad = 1
  let tx = x + pad
  if (align === 'center') tx = x + w / 2
  if (align === 'right') tx = x + w - pad
  const lines = doc.splitTextToSize(String(text || ''), w - pad * 2)
  doc.text(lines, tx, y + fontSize * 0.4 + 1, { align, maxWidth: w - pad * 2 })
}

function hline(doc, x, y, w) {
  doc.setDrawColor('#000000'); doc.setLineWidth(0.2); doc.line(x, y, x + w, y)
}

function lineRow(doc, y, num, label, value, h = 6) {
  cell(doc, M, y, 12, h, num, { align: 'center', bold: true, fontSize: 7 })
  cell(doc, M + 12, y, CW - 47, h, label, { fontSize: 6.5 })
  cell(doc, M + CW - 35, y, 35, h, money(value), { align: 'right', fontSize: 7, bold: true })
  return y + h
}

export function export1600VTPDF(formData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let y = M

  // Outer border
  doc.setLineWidth(0.3)
  doc.rect(M, M, CW, PH - M * 2, 'S')

  // Header
  const h1 = 10
  cell(doc, M, y, 20, h1, 'For BIR\nUse Only', { fontSize: 5 })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.text('Republic of the Philippines', M + CW / 2, y + 3, { align: 'center' })
  doc.text('Department of Finance', M + CW / 2, y + 6, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text('Bureau of Internal Revenue', M + CW / 2, y + 9, { align: 'center' })
  hline(doc, M, y + h1, CW)
  y += h1

  // Form number & title
  const h2 = 14
  doc.setLineWidth(0.2)
  doc.line(M + 30, y, M + 30, y + h2)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5)
  doc.text('BIR Form No.', M + 2, y + 3.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text('1600-VT', M + 2, y + 10)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5)
  doc.text('January 2018 (ENCS)', M + 2, y + 13)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('Monthly Remittance Return', M + CW / 2, y + 5, { align: 'center' })
  doc.text('of Value-Added Tax Withheld', M + CW / 2, y + 9, { align: 'center' })
  hline(doc, M, y + h2, CW)
  y += h2

  // Return Period
  cell(doc, M, y, CW / 2, 6, `Return Period: ${formData.return_period || ''}`, { fontSize: 7 })
  cell(doc, M + CW / 2, y, CW / 2, 6, `Amended: ${formData.amended_return ? 'Yes' : 'No'}`, { fontSize: 7 })
  y += 6

  // Part I
  cell(doc, M, y, CW, 5, '  Part I — Background Information', { bold: true, fontSize: 7, fill: '#f0f0f0' })
  y += 5

  const tinStr = (formData.tin || []).join(' - ')
  cell(doc, M, y, CW / 2, 5, `TIN: ${tinStr}`, { fontSize: 7 })
  cell(doc, M + CW / 2, y, CW / 2, 5, `RDO Code: ${formData.rdo_code || ''}`, { fontSize: 7 })
  y += 5
  cell(doc, M, y, CW, 5, `Taxpayer: ${formData.taxpayer_name || ''}`, { fontSize: 7, bold: true })
  y += 5
  cell(doc, M, y, CW, 5, `Address: ${formData.registered_address || ''}`, { fontSize: 6.5 })
  y += 5
  cell(doc, M, y, CW / 3, 5, `ZIP: ${formData.zip_code || ''}`, { fontSize: 7 })
  cell(doc, M + CW / 3, y, CW / 3, 5, `Contact: ${formData.contact_number || ''}`, { fontSize: 7 })
  cell(doc, M + 2 * CW / 3, y, CW / 3, 5, `Category: ${formData.category_of_agent || ''}`, { fontSize: 7 })
  y += 5

  // Part II - Computation
  cell(doc, M, y, CW, 5, '  Part II — Computation of Tax', { bold: true, fontSize: 7, fill: '#f0f0f0' })
  y += 5

  y = lineRow(doc, y, '12', 'Total Amount of VAT Withheld for the Month', formData.line_12_vat_withheld)
  y = lineRow(doc, y, '13', 'Less: VAT Remitted in Return Previously Filed (Amended)', formData.line_13_prev_remitted)
  y = lineRow(doc, y, '14', 'VAT Still Due / (Overremittance) (12 less 13)', formData.line_14_tax_still_due)
  y = lineRow(doc, y, '15a', 'Surcharge', formData.line_15a_surcharge)
  y = lineRow(doc, y, '15b', 'Interest', formData.line_15b_interest)
  y = lineRow(doc, y, '15c', 'Compromise', formData.line_15c_compromise)
  y = lineRow(doc, y, '16', 'TOTAL AMOUNT STILL DUE / (Overremittance)', formData.line_16_total_due)

  // Schedule 1 - Payees
  const payees = formData.payee_breakdown || []
  if (payees.length > 0) {
    y += 2
    cell(doc, M, y, CW, 5, `  Schedule 1 — List of Payees (${payees.length})`, { bold: true, fontSize: 7, fill: '#f0f0f0' })
    y += 5

    // Table header
    const colW = [70, 30, 47, 47]
    cell(doc, M, y, colW[0], 5, 'Payee Name', { bold: true, fontSize: 6 })
    cell(doc, M + colW[0], y, colW[1], 5, 'TIN', { bold: true, fontSize: 6 })
    cell(doc, M + colW[0] + colW[1], y, colW[2], 5, 'Gross Payments', { bold: true, fontSize: 6, align: 'right' })
    cell(doc, M + colW[0] + colW[1] + colW[2], y, colW[3], 5, 'VAT Withheld', { bold: true, fontSize: 6, align: 'right' })
    y += 5

    const maxRows = Math.min(payees.length, 20)
    for (let i = 0; i < maxRows; i++) {
      const p = payees[i]
      if (y > PH - M - 15) break
      cell(doc, M, y, colW[0], 4.5, p.payee_name || '', { fontSize: 6 })
      cell(doc, M + colW[0], y, colW[1], 4.5, p.tin || '', { fontSize: 6 })
      cell(doc, M + colW[0] + colW[1], y, colW[2], 4.5, money(p.gross_payments), { fontSize: 6, align: 'right' })
      cell(doc, M + colW[0] + colW[1] + colW[2], y, colW[3], 4.5, money(p.vat_withheld), { fontSize: 6, align: 'right' })
      y += 4.5
    }

    // Totals
    cell(doc, M, y, colW[0] + colW[1], 5, 'TOTAL', { bold: true, fontSize: 6 })
    cell(doc, M + colW[0] + colW[1], y, colW[2], 5, money(formData.total_gross_payments), { bold: true, fontSize: 6, align: 'right' })
    cell(doc, M + colW[0] + colW[1] + colW[2], y, colW[3], 5, money(formData.total_vat_withheld), { bold: true, fontSize: 6, align: 'right' })
    y += 5
  }

  // Signatory
  y += 3
  cell(doc, M, y, CW, 5, '  Signatory', { bold: true, fontSize: 7, fill: '#f0f0f0' })
  y += 5
  cell(doc, M, y, CW / 2, 8, `Name: ${formData.signatory_name || ''}`, { fontSize: 7 })
  cell(doc, M + CW / 2, y, CW / 4, 8, `Title: ${formData.signatory_title || ''}`, { fontSize: 7 })
  cell(doc, M + 3 * CW / 4, y, CW / 4, 8, `TIN: ${formData.signatory_tin || ''}`, { fontSize: 7 })

  const name = (formData.taxpayer_name || 'Entity').replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(`BIR_1600VT_${name}_${formData.return_period || ''}.pdf`)
}
