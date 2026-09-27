import { jsPDF } from 'jspdf'

/**
 * BIR Form 1601-EQ PDF Export
 * Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)
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


// =========================================================================
// PART I RENDERER
// =========================================================================
function _renderPartI(doc, y, formData) {
  const hPartH = 5
  const hRow = 6

  doc.setFillColor('#f0f0f0')
  doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Part I \u2013 Background Information', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW)
  y += hPartH

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

  // --- Category of Withholding Agent Row ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('6', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Category of Withholding Agent', M + 8, y + 4)
  doc.rect(M + 70, y + 1, 60, 4, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.category_of_agent || '', M + 100, y + 4, { align: 'center' })
  hline(doc, M, y + hRow, CW)
  y += hRow

  return y
}


// =========================================================================
// PART II RENDERER - COMPUTATION OF TAX
// =========================================================================
function _renderPartII(doc, y, formData) {
  const hPartH = 5
  const labelW = 130
  const amtW = CW - labelW
  const amtX = M + labelW
  const compRowH = 7

  doc.setFillColor('#f0f0f0')
  doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Part II \u2013 Computation of Tax', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW)
  y += hPartH

  // --- Line 15: Taxes Withheld - Month 1 ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('15', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text('Taxes Withheld for the First Month of the Quarter', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_15), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // --- Line 16: Taxes Withheld - Month 2 ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('16', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text('Taxes Withheld for the Second Month of the Quarter', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_16), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // --- Line 17: Taxes Withheld - Month 3 ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('17', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text('Taxes Withheld for the Third Month of the Quarter', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_17), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // --- Line 18: Total Taxes Withheld for the Quarter ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('18', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text('Total Taxes Withheld for the Quarter (Sum of Items 15, 16 & 17)', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_18), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // --- Line 19: Less: Remittances Made (Month 1) ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('19', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Less: Remittances Made for the First Month (per BIR Form 0619-E)', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_19), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // --- Line 20: Less: Remittances Made (Month 2) ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('20', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Less: Remittances Made for the Second Month (per BIR Form 0619-E)', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_20), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // --- Line 21: Tax Still Due/(Overremittance) ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('21', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Tax Still Due/(Overremittance) (Item 18 Less Items 19 & 20)', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_21), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // --- Line 22: Add: Penalties (header) ---
  const penaltyHeaderH = 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('22', M + 3, y + 3.5)
  doc.line(M + 8, y, M + 8, y + penaltyHeaderH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text('Add: Penalties', M + 10, y + 3.5)
  hline(doc, M, y + penaltyHeaderH, CW)
  y += penaltyHeaderH

  const subRowH = 6

  // 22a: Surcharge
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('22a', M + 12, y + 4)
  doc.text('Surcharge', M + 22, y + 4)
  doc.rect(amtX, y, amtW, subRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_22), amtX + amtW - 2, y + 4, { align: 'right' })
  hline(doc, M, y + subRowH, CW)
  y += subRowH

  // 23: Interest
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('23', M + 12, y + 4)
  doc.text('Interest', M + 22, y + 4)
  doc.rect(amtX, y, amtW, subRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_23), amtX + amtW - 2, y + 4, { align: 'right' })
  hline(doc, M, y + subRowH, CW)
  y += subRowH

  // 24: Compromise
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('24', M + 12, y + 4)
  doc.text('Compromise', M + 22, y + 4)
  doc.rect(amtX, y, amtW, subRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_24), amtX + amtW - 2, y + 4, { align: 'right' })
  hline(doc, M, y + subRowH, CW)
  y += subRowH

  // --- Total Amount Still Due ---
  const totalRowH = 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('25', M + 3, y + 5)
  doc.line(M + 8, y, M + 8, y + totalRowH)
  doc.setFontSize(6.5)
  doc.text('TOTAL AMOUNT STILL DUE/(Overremittance) (Sum of Items 21 to 24)', M + 10, y + 5)
  doc.rect(amtX, y, amtW, totalRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  const totalDue = (parseFloat(formData.line_21) || 0) + (parseFloat(formData.line_22) || 0) +
    (parseFloat(formData.line_23) || 0) + (parseFloat(formData.line_24) || 0)
  doc.text(money(totalDue), amtX + amtW - 2, y + 5.5, { align: 'right' })
  hline(doc, M, y + totalRowH, CW)
  y += totalRowH

  return y
}


// =========================================================================
// SIGNATORY RENDERER
// =========================================================================
function _renderSignatory(doc, y, formData) {
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

  // Footer note
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4.5)
  doc.text('*NOTE: The BIR Data Privacy Policy is in the BIR website (www.bir.gov.ph)', M + 2, PH - M - 1)

  return y
}


// =========================================================================
// SCHEDULE 1 RENDERER - ALPHALIST OF PAYEES
// =========================================================================
function _renderSchedule1(doc, formData) {
  const alphalist = formData.alphalist || []
  const rowsPerPage = 20
  const totalPages = Math.max(1, Math.ceil(alphalist.length / rowsPerPage))

  for (let page = 0; page < totalPages; page++) {
    doc.addPage()
    let y = M

    // Page border
    doc.rect(M, M, CW, PH - M * 2, 'S')

    // Schedule header
    doc.setFillColor('#f0f0f0')
    doc.rect(M, y, CW, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('Schedule 1 \u2013 Alphalist of Payees Subjected to Expanded Withholding Tax', M + CW / 2, y + 5, { align: 'center' })
    hline(doc, M, y + 8, CW)
    y += 8

    if (totalPages > 1) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5)
      doc.text(`Page ${page + 1} of ${totalPages}`, M + CW - 2, y + 3, { align: 'right' })
      y += 4
    }

    // Table column definitions
    const cols = [
      { label: 'No.', w: 10 },
      { label: 'Payee Name', w: 55 },
      { label: 'TIN', w: 30 },
      { label: 'ATC Code', w: 22 },
      { label: 'Income Payment', w: 38 },
      { label: 'Tax Withheld', w: 39 },
    ]

    const tableX = M
    const headerH = 7
    const rowH = 6

    // Table header
    let cx = tableX
    for (const col of cols) {
      cell(doc, cx, y, col.w, headerH, col.label, { align: 'center', bold: true, fontSize: 6, fill: '#e8e8e8' })
      cx += col.w
    }
    y += headerH

    // Table rows
    const startIdx = page * rowsPerPage
    const endIdx = Math.min(startIdx + rowsPerPage, alphalist.length)

    for (let i = startIdx; i < endIdx; i++) {
      const row = alphalist[i]
      cx = tableX
      cell(doc, cx, y, cols[0].w, rowH, String(i + 1), { align: 'center', fontSize: 6 })
      cx += cols[0].w
      cell(doc, cx, y, cols[1].w, rowH, row.payee_name || '', { fontSize: 6 })
      cx += cols[1].w
      cell(doc, cx, y, cols[2].w, rowH, row.tin || '', { align: 'center', fontSize: 6 })
      cx += cols[2].w
      cell(doc, cx, y, cols[3].w, rowH, row.atc_code || '', { align: 'center', fontSize: 6 })
      cx += cols[3].w
      cell(doc, cx, y, cols[4].w, rowH, money(row.income_payment), { align: 'right', fontSize: 6 })
      cx += cols[4].w
      cell(doc, cx, y, cols[5].w, rowH, money(row.tax_withheld), { align: 'right', fontSize: 6 })
      y += rowH
    }

    // Draw empty rows to fill page
    const emptyRows = rowsPerPage - (endIdx - startIdx)
    for (let i = 0; i < emptyRows; i++) {
      cx = tableX
      for (const col of cols) {
        cell(doc, cx, y, col.w, rowH, '', { fontSize: 6 })
        cx += col.w
      }
      y += rowH
    }

    // Summary totals (on last page only)
    if (page === totalPages - 1) {
      y += 4

      const summaryH = 7
      const summaryLabelW = 95
      const summaryValW = CW - summaryLabelW

      // Total Income Payments
      cell(doc, M, y, summaryLabelW, summaryH, 'Total Income Payments', { bold: true, fontSize: 7 })
      cell(doc, M + summaryLabelW, y, summaryValW, summaryH, money(formData.total_income_payments), { align: 'right', bold: true, fontSize: 8 })
      y += summaryH

      // Total Taxes Withheld
      cell(doc, M, y, summaryLabelW, summaryH, 'Total Taxes Withheld', { bold: true, fontSize: 7 })
      cell(doc, M + summaryLabelW, y, summaryValW, summaryH, money(formData.total_taxes_withheld), { align: 'right', bold: true, fontSize: 8 })
      y += summaryH

      // Number of Payees
      cell(doc, M, y, summaryLabelW, summaryH, 'Number of Payees', { bold: true, fontSize: 7 })
      cell(doc, M + summaryLabelW, y, summaryValW, summaryH, String(formData.number_of_payees || alphalist.length), { align: 'right', bold: true, fontSize: 8 })
    }
  }
}


// =========================================================================
// MAIN EXPORT FUNCTION
// =========================================================================
export function export1601EQPDF(formData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setLineWidth(0.2)
  doc.setDrawColor('#000000')

  let y = M

  // === OUTER BORDER ===
  doc.rect(M, M, CW, PH - M * 2, 'S')

  // =========================================================================
  // HEADER SECTION
  // =========================================================================
  const h1 = 12
  // BIR Use Only box (left)
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
  doc.setFontSize(16)
  doc.text('1601-EQ', M + 2, y + 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('January 2018 (ENCS)', M + 2, y + 14.5)

  // Center: title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('Quarterly Remittance Return of', M + CW / 2, y + 4, { align: 'center' })
  doc.text('Creditable Income Taxes Withheld', M + CW / 2, y + 8, { align: 'center' })
  doc.text('(Expanded)', M + CW / 2, y + 12, { align: 'center' })

  // Right divider + revision
  doc.line(M + CW - 30, y, M + CW - 30, y + h2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('1601EQ 01/18ENCS', M + CW - 28, y + 8)

  hline(doc, M, y + h2, CW)
  y += h2

  // =========================================================================
  // RETURN PERIOD SECTION
  // =========================================================================
  const hPeriod = 8
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(5.5)
  doc.text('Fill in all applicable spaces. Mark all appropriate boxes with "X".', M + 2, y + 3)

  // Quarter
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
  y = _renderPartI(doc, y, formData)

  // =========================================================================
  // PART II - COMPUTATION OF TAX
  // =========================================================================
  y = _renderPartII(doc, y, formData)

  // =========================================================================
  // SIGNATORY SECTION
  // =========================================================================
  y = _renderSignatory(doc, y, formData)

  // =========================================================================
  // SCHEDULE 1 - ALPHALIST (new page(s))
  // =========================================================================
  _renderSchedule1(doc, formData)

  // =========================================================================
  // SAVE
  // =========================================================================
  const name = (formData.taxpayer_name || 'unknown').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
  doc.save(`BIR_1601EQ_${name}_Q${formData.quarter}_${formData.year}.pdf`)
}
