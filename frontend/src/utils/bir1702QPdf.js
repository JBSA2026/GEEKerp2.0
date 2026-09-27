import { jsPDF } from 'jspdf'

/**
 * BIR Form 1702Q PDF Export
 * Quarterly Income Tax Return for Corporations
 */

const PW = 210
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
  doc.text(String(text || ''), tx, y + fontSize * 0.4 + 1, { align, maxWidth: w - pad * 2 })
}

function hline(doc, x, y, w) {
  doc.setDrawColor('#000000'); doc.setLineWidth(0.2); doc.line(x, y, x + w, y)
}

function lineRow(doc, y, num, label, value, h = 5.5) {
  cell(doc, M, y, 10, h, num, { align: 'center', bold: true, fontSize: 6.5 })
  cell(doc, M + 10, y, CW - 47, h, label, { fontSize: 6 })
  cell(doc, M + CW - 37, y, 37, h, money(value), { align: 'right', fontSize: 7 })
  return y + h
}

export function export1702QPDF(formData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let y = M

  // Header
  doc.setLineWidth(0.3); doc.rect(M, M, CW, 280, 'S')

  const h1 = 10
  cell(doc, M, y, 20, h1, 'For BIR\nUse Only', { fontSize: 5 })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.text('Republic of the Philippines', M + CW / 2, y + 3, { align: 'center' })
  doc.text('Department of Finance', M + CW / 2, y + 6, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text('Bureau of Internal Revenue', M + CW / 2, y + 9, { align: 'center' })
  hline(doc, M, y + h1, CW); y += h1

  const h2 = 14
  doc.line(M + 28, y, M + 28, y + h2)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5)
  doc.text('BIR Form No.', M + 2, y + 3.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text('1702Q', M + 2, y + 10)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5)
  doc.text('January 2018 (ENCS)', M + 2, y + 13)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('Quarterly Income Tax Return', M + CW / 2, y + 5, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
  doc.text('For Corporations, Partnerships and Other Non-Individual Taxpayers', M + CW / 2, y + 9, { align: 'center' })
  hline(doc, M, y + h2, CW); y += h2

  // Period info
  cell(doc, M, y, CW / 3, 6, `${formData.calendar_fiscal || 'Calendar'}`, { fontSize: 7 })
  cell(doc, M + CW / 3, y, CW / 3, 6, `Year: ${formData.year || ''}  Quarter: ${formData.quarter || ''}`, { fontSize: 7 })
  cell(doc, M + 2 * CW / 3, y, CW / 3, 6, `ATC: ${formData.atc || 'IC 010'}`, { fontSize: 7 })
  y += 6

  // Part I
  cell(doc, M, y, CW, 5, '  Part I — Background Information', { bold: true, fontSize: 7, fill: '#f0f0f0' }); y += 5
  const tinStr = (formData.tin || []).join(' - ')
  cell(doc, M, y, CW / 2, 5, `6 TIN: ${tinStr}`, { fontSize: 7 })
  cell(doc, M + CW / 2, y, CW / 2, 5, `7 RDO: ${formData.rdo_code || ''}`, { fontSize: 7 }); y += 5
  cell(doc, M, y, CW, 5, `8 ${formData.registered_name || ''}`, { fontSize: 7, bold: true }); y += 5
  cell(doc, M, y, CW, 5, `9 ${formData.registered_address || ''}`, { fontSize: 6.5 }); y += 5

  // Schedule 2
  cell(doc, M, y, CW, 5, '  Schedule 2 — Declaration This Quarter (Regular Rate)', { bold: true, fontSize: 7, fill: '#f0f0f0' }); y += 5
  y = lineRow(doc, y, '1', 'Sales/Receipts/Revenues/Fees', formData.sched2_line1_sales)
  y = lineRow(doc, y, '2', 'Less: Cost of Sales/Services', formData.sched2_line2_cost_of_sales)
  y = lineRow(doc, y, '3', 'Gross Income from Operation (1 Less 2)', formData.sched2_line3_gross_income)
  y = lineRow(doc, y, '4', 'Add: Non-Operating Income', formData.sched2_line4_non_operating)
  y = lineRow(doc, y, '5', 'Total Gross Income (3 + 4)', formData.sched2_line5_total_gross)
  y = lineRow(doc, y, '6', 'Less: Deductions', formData.sched2_line6_deductions)
  y = lineRow(doc, y, '7', 'Taxable Income This Quarter (5 less 6)', formData.sched2_line7_taxable_this_qtr)
  y = lineRow(doc, y, '8', 'Add: Taxable Income Previous Quarter/s', formData.sched2_line8_taxable_prev_qtrs)
  y = lineRow(doc, y, '9', 'Total Taxable Income to Date (7 + 8)', formData.sched2_line9_total_taxable)
  y = lineRow(doc, y, '10', `Tax Rate: ${formData.sched2_line10_tax_rate || 25}%`, '')
  y = lineRow(doc, y, '11', 'Income Tax Due (9 × 10)', formData.sched2_line11_income_tax_due)
  y = lineRow(doc, y, '12', 'Minimum Corporate Income Tax (MCIT)', formData.sched2_line12_mcit)
  y = lineRow(doc, y, '13', 'Income Tax Due (higher of 11 or 12)', formData.sched2_line13_tax_due)

  // Schedule 4
  cell(doc, M, y, CW, 5, '  Schedule 4 — Tax Credits/Payments', { bold: true, fontSize: 7, fill: '#f0f0f0' }); y += 5
  y = lineRow(doc, y, '1', "Prior Year's Excess Credits", formData.sched4_line1_prior_year_excess)
  y = lineRow(doc, y, '2', 'Tax Payments Previous Quarter/s', formData.sched4_line2_prev_qtr_payments)
  y = lineRow(doc, y, '4', 'CWT Previous Quarter/s', formData.sched4_line4_cwt_prev_qtrs)
  y = lineRow(doc, y, '5', 'CWT per BIR 2307 This Quarter', formData.sched4_line5_cwt_2307_this_qtr)
  y = lineRow(doc, y, '7', 'Total Tax Credits/Payments', formData.sched4_line7_total_credits)

  // Part II
  cell(doc, M, y, CW, 5, '  Part II — Computation of Tax Due', { bold: true, fontSize: 7, fill: '#f0f0f0' }); y += 5
  y = lineRow(doc, y, '14', 'Income Tax Due', formData.part2_line14_tax_due)
  y = lineRow(doc, y, '19', 'Total Tax Credits/Payments', formData.part2_line19_total_credits)
  y = lineRow(doc, y, '20', 'Tax Payable (Overpayment)', formData.part2_line20_tax_payable)
  y = lineRow(doc, y, '21a', 'Surcharge', formData.part2_line21a_surcharge)
  y = lineRow(doc, y, '21b', 'Interest', formData.part2_line21b_interest)
  y = lineRow(doc, y, '21c', 'Compromise', formData.part2_line21c_compromise)
  y = lineRow(doc, y, '25', 'TOTAL AMOUNT DUE', formData.part2_line25_total_due)

  // Signatory
  y += 3
  cell(doc, M, y, CW / 2, 8, `President/Officer: ${formData.signatory_name || ''}`, { fontSize: 7 })
  cell(doc, M + CW / 2, y, CW / 4, 8, `Title: ${formData.signatory_title || ''}`, { fontSize: 7 })
  cell(doc, M + 3 * CW / 4, y, CW / 4, 8, `TIN: ${formData.signatory_tin || ''}`, { fontSize: 7 })

  const name = (formData.registered_name || 'Corp').replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(`BIR_1702Q_${name}_Q${formData.quarter}_${formData.year}.pdf`)
}
