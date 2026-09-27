import { jsPDF } from 'jspdf'

/**
 * BIR Form 1604-E PDF Export
 * Annual Information Return of Creditable Income Taxes Withheld (Expanded)
 * Coordinate-driven layout matching the official BIR form.
 * A4 portrait, all measurements in mm.
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
  const { align = 'left', bold = false, fontSize = 7, fill = null, italic = false, border = true } = opts
  if (fill) { doc.setFillColor(fill); doc.rect(x, y, w, h, 'F') }
  if (border) { doc.setDrawColor('#000000'); doc.setLineWidth(0.2); doc.rect(x, y, w, h, 'S') }
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
  const ty = y + fontSize * 0.4 + 0.8
  doc.text(lines, tx, ty, { align, maxWidth: textW })
}

function hline(doc, x, y, w) {
  doc.setDrawColor('#000000'); doc.setLineWidth(0.2); doc.line(x, y, x + w, y)
}

function _renderPartI(doc, y, fd) {
  const hPartH = 5, hRow = 6
  doc.setFillColor('#f0f0f0'); doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text('Part I \u2013 Background Information', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW); y += hPartH

  // TIN
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text('1', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
  doc.text('Taxpayer Identification Number (TIN)', M + 8, y + 4)
  const tinSegs = fd.tin || ['', '', '', '']
  for (let i = 0; i < 4; i++) {
    const bx = M + 70 + i * 16
    doc.rect(bx, y + 1, 14, 4, 'S')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
    doc.text(tinSegs[i] || '', bx + 7, y + 4, { align: 'center' })
    if (i < 3) { doc.setFontSize(8); doc.text('-', bx + 14.5, y + 4) }
  }
  hline(doc, M, y + hRow, CW); y += hRow

  // RDO
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text('2', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.text('RDO Code', M + 8, y + 4)
  doc.rect(M + 35, y + 1, 14, 4, 'S')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text(fd.rdo_code || '', M + 42, y + 4, { align: 'center' })
  hline(doc, M, y + hRow, CW); y += hRow

  // Name
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text('3', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5)
  doc.text("Taxpayer\u2019s Name", M + 8, y + 3)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text(fd.taxpayer_name || '', M + 8, y + 5.5)
  hline(doc, M, y + hRow, CW); y += hRow

  // Address
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text('4', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.text('Registered Address', M + 8, y + 3)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text(fd.registered_address || '', M + 8, y + 5.5)
  hline(doc, M, y + hRow, CW); y += hRow

  // Zip + Contact
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text('5', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.text('Zip Code', M + 8, y + 4)
  doc.rect(M + 25, y + 1, 14, 4, 'S')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text(fd.zip_code || '', M + 32, y + 4, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.text('Contact Number', M + 55, y + 4)
  doc.rect(M + 80, y + 1, 30, 4, 'S')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text(fd.contact_number || '', M + 95, y + 4, { align: 'center' })
  hline(doc, M, y + hRow, CW); y += hRow

  // Category
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text('6', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
  doc.text('Category of Withholding Agent', M + 8, y + 4)
  doc.rect(M + 70, y + 1, 60, 4, 'S')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text(fd.category_of_agent || '', M + 100, y + 4, { align: 'center' })
  hline(doc, M, y + hRow, CW); y += hRow

  return y
}


function _renderPartII(doc, y, fd) {
  const hPartH = 5
  doc.setFillColor('#f0f0f0'); doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text('Part II \u2013 Summary of Quarterly Remittances', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW); y += hPartH

  const cols = [
    { label: 'Quarter', w: 30 },
    { label: 'Taxes Withheld', w: 50 },
    { label: 'Taxes Remitted', w: 50 },
    { label: 'Over/(Under) Remittance', w: 64 },
  ]
  const headerH = 7, rowH = 7
  let cx = M
  for (const col of cols) {
    cell(doc, cx, y, col.w, headerH, col.label, { align: 'center', bold: true, fontSize: 6.5, fill: '#e8e8e8' })
    cx += col.w
  }
  y += headerH

  const quarters = fd.quarterly_summary || [
    { quarter: 'Q1', withheld: fd.q1_withheld, remitted: fd.q1_remitted },
    { quarter: 'Q2', withheld: fd.q2_withheld, remitted: fd.q2_remitted },
    { quarter: 'Q3', withheld: fd.q3_withheld, remitted: fd.q3_remitted },
    { quarter: 'Q4', withheld: fd.q4_withheld, remitted: fd.q4_remitted },
  ]
  let totalWithheld = 0, totalRemitted = 0
  for (const q of quarters) {
    const w = parseFloat(q.withheld) || 0
    const r = parseFloat(q.remitted) || 0
    totalWithheld += w; totalRemitted += r
    cx = M
    cell(doc, cx, y, cols[0].w, rowH, q.quarter || '', { align: 'center', fontSize: 7 }); cx += cols[0].w
    cell(doc, cx, y, cols[1].w, rowH, money(w), { align: 'right', fontSize: 7 }); cx += cols[1].w
    cell(doc, cx, y, cols[2].w, rowH, money(r), { align: 'right', fontSize: 7 }); cx += cols[2].w
    cell(doc, cx, y, cols[3].w, rowH, money(w - r), { align: 'right', fontSize: 7 })
    y += rowH
  }
  cx = M
  cell(doc, cx, y, cols[0].w, rowH, 'TOTAL', { align: 'center', bold: true, fontSize: 7, fill: '#f0f0f0' }); cx += cols[0].w
  cell(doc, cx, y, cols[1].w, rowH, money(totalWithheld), { align: 'right', bold: true, fontSize: 7, fill: '#f0f0f0' }); cx += cols[1].w
  cell(doc, cx, y, cols[2].w, rowH, money(totalRemitted), { align: 'right', bold: true, fontSize: 7, fill: '#f0f0f0' }); cx += cols[2].w
  cell(doc, cx, y, cols[3].w, rowH, money(totalWithheld - totalRemitted), { align: 'right', bold: true, fontSize: 7, fill: '#f0f0f0' })
  y += rowH
  return y
}


function _renderPartIII(doc, y, fd) {
  const alphalist = fd.alphalist || []
  const rowsPerPage = 20
  const totalPages = Math.max(1, Math.ceil(alphalist.length / rowsPerPage))

  for (let page = 0; page < totalPages; page++) {
    if (page === 0 && y > PH - 60) {
      doc.addPage(); y = M; doc.rect(M, M, CW, PH - M * 2, 'S')
    } else if (page > 0) {
      doc.addPage(); y = M; doc.rect(M, M, CW, PH - M * 2, 'S')
    }

    const hPartH = 5
    doc.setFillColor('#f0f0f0'); doc.rect(M, y, CW, hPartH, 'F')
    hline(doc, M, y, CW)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
    doc.text('Part III \u2013 Alphalist of Payees Subjected to Expanded Withholding Tax', M + CW / 2, y + 3.5, { align: 'center' })
    hline(doc, M, y + hPartH, CW); y += hPartH

    if (totalPages > 1) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5)
      doc.text(`Page ${page + 1} of ${totalPages}`, M + CW - 2, y + 3, { align: 'right' })
      y += 4
    }

    const cols = [
      { label: 'No.', w: 10 }, { label: 'Payee Name', w: 55 }, { label: 'TIN', w: 30 },
      { label: 'ATC', w: 20 }, { label: 'Income Payment', w: 40 }, { label: 'Tax Withheld', w: 39 },
    ]
    const headerH = 7, rowH = 6
    let cx = M
    for (const col of cols) {
      cell(doc, cx, y, col.w, headerH, col.label, { align: 'center', bold: true, fontSize: 6, fill: '#e8e8e8' })
      cx += col.w
    }
    y += headerH

    const startIdx = page * rowsPerPage
    const endIdx = Math.min(startIdx + rowsPerPage, alphalist.length)
    for (let i = startIdx; i < endIdx; i++) {
      const row = alphalist[i]; cx = M
      cell(doc, cx, y, cols[0].w, rowH, String(i + 1), { align: 'center', fontSize: 6 }); cx += cols[0].w
      cell(doc, cx, y, cols[1].w, rowH, row.payee_name || '', { fontSize: 6 }); cx += cols[1].w
      cell(doc, cx, y, cols[2].w, rowH, row.tin || '', { align: 'center', fontSize: 6 }); cx += cols[2].w
      cell(doc, cx, y, cols[3].w, rowH, row.atc_code || row.atc || '', { align: 'center', fontSize: 6 }); cx += cols[3].w
      cell(doc, cx, y, cols[4].w, rowH, money(row.income_payment), { align: 'right', fontSize: 6 }); cx += cols[4].w
      cell(doc, cx, y, cols[5].w, rowH, money(row.tax_withheld), { align: 'right', fontSize: 6 })
      y += rowH
    }

    const emptyRows = rowsPerPage - (endIdx - startIdx)
    for (let i = 0; i < emptyRows; i++) {
      cx = M
      for (const col of cols) { cell(doc, cx, y, col.w, rowH, '', { fontSize: 6 }); cx += col.w }
      y += rowH
    }

    if (page === totalPages - 1) {
      y += 4
      const sH = 7, sLW = 95, sVW = CW - sLW
      cell(doc, M, y, sLW, sH, 'Total Income Payments', { bold: true, fontSize: 7 })
      cell(doc, M + sLW, y, sVW, sH, money(fd.total_income_payments), { align: 'right', bold: true, fontSize: 8 })
      y += sH
      cell(doc, M, y, sLW, sH, 'Total Taxes Withheld', { bold: true, fontSize: 7 })
      cell(doc, M + sLW, y, sVW, sH, money(fd.total_taxes_withheld), { align: 'right', bold: true, fontSize: 8 })
      y += sH
      cell(doc, M, y, sLW, sH, 'Number of Payees', { bold: true, fontSize: 7 })
      cell(doc, M + sLW, y, sVW, sH, String(fd.number_of_payees || alphalist.length), { align: 'right', bold: true, fontSize: 8 })
    }
  }
  return y
}


function _renderSignatory(doc, y, fd) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5)
  const declText = 'I declare under the penalties of perjury that this return has been made in good faith, verified by me, and to the best of my knowledge and belief, is true and correct, pursuant to the provisions of the National Internal Revenue Code, as amended, and the regulations issued under authority thereof.'
  const declLines = doc.splitTextToSize(declText, CW - 4)
  doc.text(declLines, M + 2, y + 3)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text(fd.signatory_name || '', M + CW / 2, y + 12, { align: 'center' })
  hline(doc, M + 40, y + 13, CW - 80)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5)
  doc.text('Signature over Printed Name of Taxpayer/Authorized Representative/Tax Agent', M + CW / 2, y + 15.5, { align: 'center' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
  doc.text(`${fd.signatory_title || ''} / TIN: ${fd.signatory_tin || ''}`, M + CW / 2, y + 18.5, { align: 'center' })
  y += 20; hline(doc, M, y, CW)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(4.5)
  doc.text('*NOTE: The BIR Data Privacy Policy is in the BIR website (www.bir.gov.ph)', M + 2, PH - M - 1)
  return y
}

export function export1604EPDF(fd) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setLineWidth(0.2); doc.setDrawColor('#000000')
  let y = M
  doc.rect(M, M, CW, PH - M * 2, 'S')

  // Header
  const h1 = 12
  cell(doc, M, y, 22, h1, '')
  doc.setFontSize(5); doc.setFont('helvetica', 'normal')
  doc.text('For BIR', M + 1, y + 3); doc.text('Use Only', M + 1, y + 5.5)
  doc.setFontSize(4.5); doc.text('BCS/', M + 1, y + 8); doc.text('Item:', M + 10, y + 8)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.text('Republic of the Philippines', M + CW / 2, y + 3, { align: 'center' })
  doc.text('Department of Finance', M + CW / 2, y + 6, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text('Bureau of Internal Revenue', M + CW / 2, y + 9, { align: 'center' })
  hline(doc, M, y + h1, CW); y += h1

  // Form number + title
  const h2 = 16
  doc.line(M + 30, y, M + 30, y + h2)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.text('BIR Form No.', M + 2, y + 3.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('1604-E', M + 2, y + 11)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5); doc.text('January 2018 (ENCS)', M + 2, y + 14.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  doc.text('Annual Information Return of', M + CW / 2, y + 4, { align: 'center' })
  doc.text('Creditable Income Taxes Withheld', M + CW / 2, y + 8, { align: 'center' })
  doc.text('(Expanded)', M + CW / 2, y + 12, { align: 'center' })
  doc.line(M + CW - 30, y, M + CW - 30, y + h2)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5); doc.text('1604E 01/18ENCS', M + CW - 28, y + 8)
  hline(doc, M, y + h2, CW); y += h2

  // Return period
  const hPeriod = 8
  doc.setFont('helvetica', 'italic'); doc.setFontSize(5.5)
  doc.text('Fill in all applicable spaces. Mark all appropriate boxes with "X".', M + 2, y + 3)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.text('For the Year', M + 70, y + 3)
  doc.rect(M + 95, y + 0.5, 20, 5, 'S')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text(String(fd.year || ''), M + 105, y + 4.5, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.text('Amended Return?', M + 140, y + 3)
  doc.rect(M + 165, y + 0.5, 4, 4, 'S')
  if (fd.amended_return) { doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('X', M + 167, y + 3.8, { align: 'center' }) }
  hline(doc, M, y + hPeriod, CW); y += hPeriod

  y = _renderPartI(doc, y, fd)
  y = _renderPartII(doc, y, fd)
  y = _renderSignatory(doc, y, fd)
  _renderPartIII(doc, y, fd)

  const name = (fd.taxpayer_name || 'unknown').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
  doc.save(`BIR_1604E_${name}_${fd.year}.pdf`)
}
