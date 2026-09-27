import { jsPDF } from 'jspdf'

/**
 * BIR Form 2550Q PDF Export
 * Quarterly Value-Added Tax Return
 * Coordinate-driven layout matching the official BIR form.
 * A4 portrait, all measurements in mm.
 */

const PW = 210 // page width
const PH = 297 // page height
const M = 8   // margin
const CW = PW - M * 2 // content width = 194

/** Format number as Philippine peso amount */
function money(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return ''
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Draw a bordered cell with text */
function cell(doc, x, y, w, h, text, opts = {}) {
  const { align = 'left', bold = false, fontSize = 7, fill = null, italic = false, border = true } = opts

  if (fill) {
    doc.setFillColor(fill)
    doc.rect(x, y, w, h, 'F')
  }
  if (border) {
    doc.setDrawColor('#000000')
    doc.setLineWidth(0.2)
    doc.rect(x, y, w, h, 'S')
  }

  const style = bold ? (italic ? 'bolditalic' : 'bold') : (italic ? 'italic' : 'normal')
  doc.setFont('helvetica', style)
  doc.setFontSize(fontSize)
  doc.setTextColor('#000000')

  const pad = 1
  const textW = w - pad * 2
  const lines = doc.splitTextToSize(String(text || ''), textW)

  let tx = x + pad
  if (align === 'center') tx = x + w / 2
  if (align === 'right') tx = x + w - pad

  const lineH = fontSize * 0.4
  const ty = y + lineH + 0.8

  doc.text(lines, tx, ty, { align, maxWidth: textW })
}

/** Draw a horizontal line */
function hline(doc, x, y, w) {
  doc.setDrawColor('#000000')
  doc.setLineWidth(0.2)
  doc.line(x, y, x + w, y)
}

export function export2550QPDF(formData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setLineWidth(0.2)
  doc.setDrawColor('#000000')

  let y = M

  // === OUTER BORDER ===
  doc.rect(M, M, CW, PH - M * 2, 'S')

  // =========================================================================
  // HEADER SECTION
  // =========================================================================

  // --- Row 1: BIR Use Only | Republic/DOF/BIR ---
  const h1 = 12
  cell(doc, M, y, 22, h1, '')
  doc.setFontSize(5)
  doc.setFont('helvetica', 'normal')
  doc.text('For BIR', M + 1, y + 3)
  doc.text('Use Only', M + 1, y + 5.5)
  doc.setFontSize(4.5)
  doc.text('BCS/', M + 1, y + 8)
  doc.text('Item:', M + 10, y + 8)

  // Center: Republic of the Philippines
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('Republic of the Philippines', M + CW / 2, y + 3, { align: 'center' })
  doc.text('Department of Finance', M + CW / 2, y + 6, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text('Bureau of Internal Revenue', M + CW / 2, y + 9, { align: 'center' })

  hline(doc, M, y + h1, CW)
  y += h1

  // --- Row 2: Form Number | Title | Revision ---
  const h2 = 16
  doc.line(M + 30, y, M + 30, y + h2)
  // Form number
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.text('BIR Form No.', M + 2, y + 3.5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('2550Q', M + 2, y + 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('January 2018 (ENCS)', M + 2, y + 14.5)

  // Center: title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Quarterly Value-Added Tax Return', M + CW / 2, y + 7, { align: 'center' })

  // Right divider + revision
  doc.line(M + CW - 30, y, M + CW - 30, y + h2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('2550Q 01/18ENCS', M + CW - 28, y + 8)

  hline(doc, M, y + h2, CW)
  y += h2

  // =========================================================================
  // RETURN PERIOD SECTION
  // =========================================================================
  const hPeriod = 8
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(5.5)
  doc.text('Fill in all applicable spaces. Mark all appropriate boxes with "X".', M + 2, y + 3)

  // Quarter box
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('For the Quarter', M + 70, y + 3)
  doc.rect(M + 95, y + 0.5, 10, 5, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(String(formData.quarter || ''), M + 100, y + 4.5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('(Q)', M + 100, y + 7, { align: 'center' })

  // Year box
  doc.rect(M + 112, y + 0.5, 16, 5, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(String(formData.year || ''), M + 120, y + 4.5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('(YYYY)', M + 120, y + 7, { align: 'center' })

  // Amended Return checkbox
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Amended Return?', M + 140, y + 3)
  doc.rect(M + 165, y + 0.5, 4, 4, 'S')
  if (formData.amended_return) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('X', M + 167, y + 3.8, { align: 'center' })
  }

  hline(doc, M, y + hPeriod, CW)
  y += hPeriod

  // =========================================================================
  // PART I - BACKGROUND INFORMATION
  // =========================================================================
  const hPartH = 5
  doc.setFillColor('#f0f0f0')
  doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Part I \u2013 Background Information', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW)
  y += hPartH

  const hRow = 6

  // --- TIN Row ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('1', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Taxpayer Identification Number (TIN)', M + 8, y + 4)

  const tinSegs = formData.tin || ['', '', '', '']
  const tinX = M + 70
  const tinBoxW = 14
  for (let i = 0; i < 4; i++) {
    const bx = tinX + i * (tinBoxW + 2)
    doc.rect(bx, y + 1, tinBoxW, 4, 'S')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(tinSegs[i] || '', bx + tinBoxW / 2, y + 4, { align: 'center' })
    if (i < 3) {
      doc.setFontSize(8)
      doc.text('-', bx + tinBoxW + 0.5, y + 4)
    }
  }

  hline(doc, M, y + hRow, CW)
  y += hRow

  // --- RDO Code Row ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('2', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('RDO Code', M + 8, y + 4)
  doc.rect(M + 35, y + 1, 14, 4, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.rdo_code || '', M + 42, y + 4, { align: 'center' })
  hline(doc, M, y + hRow, CW)
  y += hRow

  // --- Taxpayer's Name Row ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('3', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.text("Taxpayer\u2019s Name (Last, First, Middle for Individual OR Registered Name for Non-Individual)", M + 8, y + 3)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.taxpayer_name || '', M + 8, y + 5.5)
  hline(doc, M, y + hRow, CW)
  y += hRow

  // --- Registered Address Row ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('4', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.text('Registered Address', M + 8, y + 3)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.registered_address || '', M + 8, y + 5.5)
  hline(doc, M, y + hRow, CW)
  y += hRow

  // --- Zip Code + Contact Number Row ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('5', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Zip Code', M + 8, y + 4)
  doc.rect(M + 25, y + 1, 14, 4, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.zip_code || '', M + 32, y + 4, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Contact Number', M + 55, y + 4)
  doc.rect(M + 80, y + 1, 30, 4, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.contact_number || '', M + 95, y + 4, { align: 'center' })
  hline(doc, M, y + hRow, CW)
  y += hRow

  // --- Industry Classification Row ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('6', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Line of Business / Industry Classification', M + 8, y + 4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.industry_classification || '', M + 80, y + 4)
  hline(doc, M, y + hRow, CW)
  y += hRow

  // =========================================================================
  // PART IV - TAXABLE SALES/RECEIPTS
  // =========================================================================
  doc.setFillColor('#f0f0f0')
  doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Part IV \u2013 Taxable Sales/Receipts', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW)
  y += hPartH

  const labelW = 130
  const amtW = CW - labelW
  const amtX = M + labelW
  const compRowH = 7

  // Helper for computation rows
  function compRow(lineNo, label, value) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text(lineNo, M + 3, y + 4.5)
    doc.line(M + 10, y, M + 10, y + compRowH)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.text(label, M + 12, y + 4.5)
    doc.rect(amtX, y, amtW, compRowH, 'S')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(money(value), amtX + amtW - 2, y + 4.5, { align: 'right' })
    hline(doc, M, y + compRowH, CW)
    y += compRowH
  }

  compRow('14a', 'Vatable Sales', formData.line_14a)
  compRow('14b', 'Sales to Government', formData.line_14b)
  compRow('14c', 'Zero-Rated Sales', formData.line_14c)
  compRow('14d', 'Exempt Sales', formData.line_14d)
  compRow('15', 'Total Sales/Receipts (Sum of 14a to 14d)', formData.line_15)

  // =========================================================================
  // PART V - OUTPUT TAX
  // =========================================================================
  doc.setFillColor('#f0f0f0')
  doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Part V \u2013 Output Tax', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW)
  y += hPartH

  compRow('16a', 'Output Tax on Vatable Sales (14a x 12%)', formData.line_16a)
  compRow('16b', 'Output Tax on Sales to Government (14b x 12%)', formData.line_16b)
  compRow('17', 'Less: Allowable Input Tax Allocated to Sales to Government', formData.line_17)
  compRow('18', 'Total Output Tax Due (16a + 16b - 17)', formData.line_18)

  // =========================================================================
  // PART VI - ALLOWABLE INPUT TAX
  // =========================================================================
  doc.setFillColor('#f0f0f0')
  doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Part VI \u2013 Allowable Input Tax', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW)
  y += hPartH

  compRow('19a', 'Input Tax on Purchases of Goods other than Capital Goods', formData.line_19a)
  compRow('19b', 'Input Tax on Purchases of Capital Goods', formData.line_19b)
  compRow('19c', 'Input Tax on Purchases of Services', formData.line_19c)
  compRow('19d', 'Input Tax on Importation of Goods other than Capital Goods', formData.line_19d)
  compRow('19e', 'Input Tax on Importation of Capital Goods', formData.line_19e)
  compRow('20', 'Total Current Purchases (Sum of 19a to 19e)', formData.line_20)
  compRow('21', 'Input Tax Deferred from Previous Period', formData.line_21)
  compRow('22', 'Total Allowable Input Tax (20 + 21)', formData.line_22)

  // =========================================================================
  // PART VII - TAX DUE
  // =========================================================================
  doc.setFillColor('#f0f0f0')
  doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Part VII \u2013 Tax Due', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW)
  y += hPartH

  compRow('23', 'VAT Payable (18 - 22)', formData.line_23)
  compRow('24', 'Less: Tax Credits/Payments', formData.line_24)
  compRow('25', 'Tax Still Due/(Overpayment) (23 - 24)', formData.line_25)
  compRow('26', 'Add: Surcharge', formData.line_26)
  compRow('27', 'Add: Interest', formData.line_27)
  compRow('28', 'TOTAL AMOUNT DUE/(Overpayment) (25 + 26 + 27)', formData.line_28)

  // =========================================================================
  // MONTHLY BREAKDOWN TABLE
  // =========================================================================
  y += 2
  doc.setFillColor('#f0f0f0')
  doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Monthly Breakdown', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW)
  y += hPartH

  // Table header
  const colWidths = [38, 39, 39, 39, 39]
  const headers = ['Month', 'Sales', 'Output VAT', 'Purchases', 'Input VAT']
  const tableH = 6

  let cx = M
  for (let i = 0; i < headers.length; i++) {
    cell(doc, cx, y, colWidths[i], tableH, headers[i], { align: 'center', bold: true, fontSize: 6, fill: '#e8e8e8' })
    cx += colWidths[i]
  }
  y += tableH

  // Table rows
  const breakdown = formData.monthly_breakdown || []
  for (let r = 0; r < 3; r++) {
    const row = breakdown[r] || {}
    cx = M
    cell(doc, cx, y, colWidths[0], tableH, row.month || '', { align: 'center', fontSize: 6 })
    cx += colWidths[0]
    cell(doc, cx, y, colWidths[1], tableH, money(row.sales), { align: 'right', fontSize: 6 })
    cx += colWidths[1]
    cell(doc, cx, y, colWidths[2], tableH, money(row.output_vat), { align: 'right', fontSize: 6 })
    cx += colWidths[2]
    cell(doc, cx, y, colWidths[3], tableH, money(row.purchases), { align: 'right', fontSize: 6 })
    cx += colWidths[3]
    cell(doc, cx, y, colWidths[4], tableH, money(row.input_vat), { align: 'right', fontSize: 6 })
    y += tableH
  }

  // =========================================================================
  // SIGNATORY SECTION
  // =========================================================================
  y += 4
  hline(doc, M, y, CW)

  const sigSectionH = 20
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  const declText = 'I declare under the penalties of perjury that this return has been made in good faith, verified by me, and to the best of my knowledge and belief, is true and correct, pursuant to the provisions of the National Internal Revenue Code, as amended, and the regulations issued under authority thereof.'
  const declLines = doc.splitTextToSize(declText, CW - 4)
  doc.text(declLines, M + 2, y + 3)

  // Signatory name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(formData.signatory_name || '', M + CW / 2, y + 12, { align: 'center' })
  hline(doc, M + 40, y + 13, CW - 80)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('Signature over Printed Name of Taxpayer/Authorized Representative/Tax Agent', M + CW / 2, y + 15.5, { align: 'center' })

  // Title/Designation and TIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  const titleTinText = `${formData.signatory_title || ''} / TIN: ${formData.signatory_tin || ''}`
  doc.text(titleTinText, M + CW / 2, y + 18.5, { align: 'center' })

  y += sigSectionH
  hline(doc, M, y, CW)

  // =========================================================================
  // FOOTER
  // =========================================================================
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4.5)
  doc.text('*NOTE: The BIR Data Privacy Policy is in the BIR website (www.bir.gov.ph)', M + 2, PH - M - 1)

  // =========================================================================
  // SAVE
  // =========================================================================
  const name = (formData.taxpayer_name || 'unknown').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
  doc.save(`BIR_2550Q_${name}_Q${formData.quarter}_${formData.year}.pdf`)
}
