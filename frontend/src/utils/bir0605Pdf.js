import { jsPDF } from 'jspdf'

/**
 * BIR Form 0605 PDF Export
 * Payment Form
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


export function export0605PDF(fd) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setLineWidth(0.2); doc.setDrawColor('#000000')
  let y = M
  doc.rect(M, M, CW, PH - M * 2, 'S')

  // ===== HEADER =====
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
  const h2 = 14
  doc.line(M + 30, y, M + 30, y + h2)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.text('BIR Form No.', M + 2, y + 3.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('0605', M + 4, y + 11)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5); doc.text('July 2008 (ENCS)', M + 2, y + 13)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Payment Form', M + CW / 2, y + 8, { align: 'center' })
  doc.line(M + CW - 30, y, M + CW - 30, y + h2)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5); doc.text('0605 07/08ENCS', M + CW - 28, y + 8)
  hline(doc, M, y + h2, CW); y += h2

  // ===== TAXPAYER INFO =====
  const hRow = 7
  const labelW = 50, valW = CW - labelW

  // TIN
  cell(doc, M, y, labelW, hRow, '1  TIN', { bold: true, fontSize: 6.5 })
  const tinSegs = fd.tin || ['', '', '', '']
  let tx = M + labelW
  for (let i = 0; i < 4; i++) {
    doc.rect(tx, y + 1.5, 14, 4, 'S')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
    doc.text(tinSegs[i] || '', tx + 7, y + 4.5, { align: 'center' })
    tx += 16
    if (i < 3) { doc.setFontSize(8); doc.text('-', tx - 2.5, y + 4.5) }
  }
  cell(doc, M + labelW, y, valW, hRow, '', { border: true })
  hline(doc, M, y + hRow, CW); y += hRow

  // RDO Code
  cell(doc, M, y, labelW, hRow, '2  RDO Code', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, fd.rdo_code || '', { fontSize: 7, bold: true })
  hline(doc, M, y + hRow, CW); y += hRow

  // Taxpayer Name
  cell(doc, M, y, labelW, hRow, '3  Taxpayer Name', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, fd.taxpayer_name || '', { fontSize: 7, bold: true })
  hline(doc, M, y + hRow, CW); y += hRow

  // Address
  cell(doc, M, y, labelW, hRow, '4  Address', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, fd.registered_address || fd.address || '', { fontSize: 7, bold: true })
  hline(doc, M, y + hRow, CW); y += hRow

  // Zip Code
  cell(doc, M, y, labelW, hRow, '5  Zip Code', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, fd.zip_code || '', { fontSize: 7, bold: true })
  hline(doc, M, y + hRow, CW); y += hRow

  // ===== TAX DETAILS =====
  y += 2
  doc.setFillColor('#f0f0f0'); doc.rect(M, y, CW, 5, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text('Tax Payment Details', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + 5, CW); y += 5

  // Tax Type
  cell(doc, M, y, labelW, hRow, '6  Tax Type', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, fd.tax_type || '', { fontSize: 7, bold: true })
  hline(doc, M, y + hRow, CW); y += hRow

  // ATC Code
  cell(doc, M, y, labelW, hRow, '7  ATC Code', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, fd.atc_code || '', { fontSize: 7, bold: true })
  hline(doc, M, y + hRow, CW); y += hRow

  // Period
  cell(doc, M, y, labelW, hRow, '8  Return Period', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, fd.return_period || fd.period || '', { fontSize: 7, bold: true })
  hline(doc, M, y + hRow, CW); y += hRow

  // ===== AMOUNT BREAKDOWN =====
  y += 2
  doc.setFillColor('#f0f0f0'); doc.rect(M, y, CW, 5, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text('Amount of Payment', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + 5, CW); y += 5

  const amtLabelW = 130, amtW = CW - amtLabelW
  const amtRows = [
    { num: '9', label: 'Basic Tax', value: fd.basic_tax },
    { num: '10', label: 'Surcharge', value: fd.surcharge },
    { num: '11', label: 'Interest', value: fd.interest },
    { num: '12', label: 'Compromise', value: fd.compromise },
  ]
  for (const r of amtRows) {
    cell(doc, M, y, amtLabelW, hRow, `${r.num}  ${r.label}`, { bold: true, fontSize: 6.5 })
    cell(doc, M + amtLabelW, y, amtW, hRow, money(r.value), { align: 'right', bold: true, fontSize: 8 })
    hline(doc, M, y + hRow, CW); y += hRow
  }

  // Total
  const total = (parseFloat(fd.basic_tax) || 0) + (parseFloat(fd.surcharge) || 0) +
    (parseFloat(fd.interest) || 0) + (parseFloat(fd.compromise) || 0)
  const totalH = 9
  doc.setFillColor('#f0f0f0'); doc.rect(M, y, CW, totalH, 'F')
  cell(doc, M, y, amtLabelW, totalH, '13  TOTAL AMOUNT PAYABLE', { bold: true, fontSize: 7 })
  cell(doc, M + amtLabelW, y, amtW, totalH, money(fd.total_amount || total), { align: 'right', bold: true, fontSize: 9 })
  hline(doc, M, y + totalH, CW); y += totalH

  // ===== PAYMENT DETAILS =====
  y += 2
  doc.setFillColor('#f0f0f0'); doc.rect(M, y, CW, 5, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text('Payment Details', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + 5, CW); y += 5

  cell(doc, M, y, labelW, hRow, '14  Drawee Bank', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, fd.drawee_bank || '', { fontSize: 7, bold: true })
  hline(doc, M, y + hRow, CW); y += hRow

  cell(doc, M, y, labelW, hRow, '15  Number', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, fd.payment_number || fd.check_number || '', { fontSize: 7, bold: true })
  hline(doc, M, y + hRow, CW); y += hRow

  cell(doc, M, y, labelW, hRow, '16  Date', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, fd.payment_date || '', { fontSize: 7, bold: true })
  hline(doc, M, y + hRow, CW); y += hRow

  cell(doc, M, y, labelW, hRow, '17  Amount', { bold: true, fontSize: 6.5 })
  cell(doc, M + labelW, y, valW, hRow, money(fd.payment_amount), { align: 'right', bold: true, fontSize: 8 })
  hline(doc, M, y + hRow, CW); y += hRow

  // ===== SIGNATORY =====
  y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5)
  const declText = 'I declare under the penalties of perjury that this has been made in good faith, verified by me, and to the best of my knowledge and belief, is true and correct, pursuant to the provisions of the National Internal Revenue Code, as amended, and the regulations issued under authority thereof.'
  const declLines = doc.splitTextToSize(declText, CW - 4)
  doc.text(declLines, M + 2, y)
  y += declLines.length * 2.5 + 4

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text(fd.signatory_name || '', M + CW / 2, y, { align: 'center' })
  hline(doc, M + 40, y + 1, CW - 80)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5)
  doc.text('Signature over Printed Name of Taxpayer/Authorized Representative', M + CW / 2, y + 4, { align: 'center' })
  y += 6

  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
  doc.text(`${fd.signatory_title || ''} / TIN: ${fd.signatory_tin || ''}`, M + CW / 2, y, { align: 'center' })

  // Footer
  doc.setFont('helvetica', 'normal'); doc.setFontSize(4.5)
  doc.text('*NOTE: The BIR Data Privacy Policy is in the BIR website (www.bir.gov.ph)', M + 2, PH - M - 1)

  // Save
  const name = (fd.taxpayer_name || 'unknown').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
  doc.save(`BIR_0605_${name}_${fd.return_period || fd.period || ''}.pdf`)
}
