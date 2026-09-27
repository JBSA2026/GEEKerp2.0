import { jsPDF } from 'jspdf'

/**
 * BIR Form 1702-RT PDF Export
 * Annual Income Tax Return for Corporations (Regular Rate)
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

export function export1702PDF(formData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let y = M

  doc.setLineWidth(0.3); doc.rect(M, M, CW, 280, 'S')

  // Header
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
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text('1702-RT', M + 2, y + 10)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5)
  doc.text('January 2018 (ENCS)', M + 2, y + 13)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('Annual Income Tax Return', M + CW / 2, y + 5, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
  doc.text('Corporation, Partnership and Other Non-Individual Taxpayer', M + CW / 2, y + 9, { align: 'center' })
  doc.text('Subject Only to REGULAR Income Tax Rate', M + CW / 2, y + 12, { align: 'center' })
  hline(doc, M, y + h2, CW); y += h2

  // Year / ATC
  cell(doc, M, y, CW / 3, 6, `${formData.calendar_fiscal || 'Calendar'}  Year: ${formData.tax_year || ''}`, { fontSize: 7 })
  cell(doc, M + CW / 3, y, CW / 3, 6, `ATC: ${formData.atc || 'IC 010'}`, { fontSize: 7 })
  cell(doc, M + 2 * CW / 3, y, CW / 3, 6, `Method: ${formData.method_of_deduction || 'OSD'}`, { fontSize: 7 })
  y += 6

  // Part I
  cell(doc, M, y, CW, 5, '  Part I — Background Information', { bold: true, fontSize: 7, fill: '#f0f0f0' }); y += 5
  const tinStr = (formData.tin || []).join(' - ')
  cell(doc, M, y, CW / 2, 5, `6 TIN: ${tinStr}`, { fontSize: 7 })
  cell(doc, M + CW / 2, y, CW / 2, 5, `7 RDO: ${formData.rdo_code || ''}`, { fontSize: 7 }); y += 5
  cell(doc, M, y, CW, 5, `8 ${formData.registered_name || ''}`, { fontSize: 7, bold: true }); y += 5
  cell(doc, M, y, CW, 5, `9 ${formData.registered_address || ''}`, { fontSize: 6.5 }); y += 5

  // Part IV - Computation
  cell(doc, M, y, CW, 5, '  Part IV — Computation of Tax', { bold: true, fontSize: 7, fill: '#f0f0f0' }); y += 5
  y = lineRow(doc, y, '27', 'Sales/Receipts/Revenues/Fees', formData.line_27_sales)
  y = lineRow(doc, y, '28', 'Less: Sales Returns', formData.line_28_sales_returns)
  y = lineRow(doc, y, '29', 'Net Sales (27 less 28)', formData.line_29_net_sales)
  y = lineRow(doc, y, '30', 'Less: Cost of Sales/Services', formData.line_30_cost_of_sales)
  y = lineRow(doc, y, '31', 'Gross Income from Operation (29 less 30)', formData.line_31_gross_income)
  y = lineRow(doc, y, '32', 'Add: Other Taxable Income', formData.line_32_other_income)
  y = lineRow(doc, y, '33', 'Total Taxable Income (31 + 32)', formData.line_33_total_taxable_income)
  y = lineRow(doc, y, '38', 'Optional Standard Deduction (40% of 33)', formData.line_38_osd)
  y = lineRow(doc, y, '39', 'Net Taxable Income / (Loss)', formData.line_39_net_taxable_income)
  y = lineRow(doc, y, '40', `Tax Rate: ${formData.line_40_tax_rate || 25}%`, '')
  y = lineRow(doc, y, '41', 'Income Tax Due (39 × 40)', formData.line_41_income_tax_due)
  y = lineRow(doc, y, '42', 'MCIT Due (2% of 33)', formData.line_42_mcit_due)
  y = lineRow(doc, y, '43', 'Tax Due (higher of 41 or 42)', formData.line_43_tax_due)

  // Credits
  cell(doc, M, y, CW, 5, '  Tax Credits/Payments', { bold: true, fontSize: 7, fill: '#f0f0f0' }); y += 5
  y = lineRow(doc, y, '44', "Prior Year's Excess Credits", formData.line_44_prior_year_excess)
  y = lineRow(doc, y, '46', 'Quarterly Tax Payments', formData.line_46_regular_prev_qtrs)
  y = lineRow(doc, y, '49', 'CWT per BIR 2307 (4th Quarter)', formData.line_49_cwt_2307_4th_qtr)
  y = lineRow(doc, y, '55', 'Total Tax Credits/Payments', formData.line_55_total_credits)
  y = lineRow(doc, y, '56', 'Net Tax Payable / (Overpayment)', formData.line_56_net_tax_payable)

  // Part II
  cell(doc, M, y, CW, 5, '  Part II — Total Tax Payable', { bold: true, fontSize: 7, fill: '#f0f0f0' }); y += 5
  y = lineRow(doc, y, '14', 'Tax Due (from Part IV Item 43)', formData.part2_line14_tax_due)
  y = lineRow(doc, y, '15', 'Less: Total Tax Credits (from Part IV Item 55)', formData.part2_line15_total_credits)
  y = lineRow(doc, y, '16', 'Net Tax Payable / (Overpayment)', formData.part2_line16_net_payable)
  y = lineRow(doc, y, '17', 'Surcharge', formData.part2_line17_surcharge)
  y = lineRow(doc, y, '18', 'Interest', formData.part2_line18_interest)
  y = lineRow(doc, y, '19', 'Compromise', formData.part2_line19_compromise)
  y = lineRow(doc, y, '21', 'TOTAL AMOUNT PAYABLE / (Overpayment)', formData.part2_line21_total_payable)

  // Signatory
  y += 3
  cell(doc, M, y, CW / 2, 8, `President/Officer: ${formData.signatory_name || ''}`, { fontSize: 7 })
  cell(doc, M + CW / 2, y, CW / 4, 8, `Title: ${formData.signatory_title || ''}`, { fontSize: 7 })
  cell(doc, M + 3 * CW / 4, y, CW / 4, 8, `TIN: ${formData.signatory_tin || ''}`, { fontSize: 7 })

  const name = (formData.registered_name || 'Corp').replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(`BIR_1702RT_${name}_${formData.tax_year || ''}.pdf`)
}
