import { jsPDF } from 'jspdf'
import { calculateQuotationTotals, quotationUnitPrice } from './quotationTotals'

/**
 * Coordinate-driven PDF export for Quotation documents.
 * Draws the quotation template cell-by-cell using jsPDF for full layout control.
 */

// A4 portrait dimensions in mm
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 8
const CONTENT_W = PAGE_W - MARGIN * 2 // 194mm usable

// Column widths for the product table (10 columns, total = CONTENT_W)
const COL = [7, 22, 22, 36, 27, 9, 9, 19, 13, 30] // = 194

function moneyFmt(value) {
  return Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(d) {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()
}

/**
 * Draw a bordered cell with text
 */
function cell(doc, x, y, w, h, text, opts = {}) {
  const { align = 'left', bold = false, fontSize = 7, fill = null, color = '#000000', valign = 'top' } = opts

  // Fill background
  if (fill) {
    doc.setFillColor(fill)
    doc.rect(x, y, w, h, 'F')
  }

  // Border
  doc.setDrawColor('#000000')
  doc.setLineWidth(0.3)
  doc.rect(x, y, w, h, 'S')

  // Text
  doc.setFontSize(fontSize)
  doc.setTextColor(color)
  if (bold) doc.setFont('helvetica', 'bold')
  else doc.setFont('helvetica', 'normal')

  const padding = 1.5
  const textW = w - padding * 2
  const lines = doc.splitTextToSize(String(text || ''), textW)
  const lineH = fontSize * 0.4 // approximate line height in mm
  const totalTextH = lines.length * lineH

  let textX = x + padding
  if (align === 'center') textX = x + w / 2
  if (align === 'right') textX = x + w - padding

  let textY = y + fontSize * 0.4 + 1
  if (valign === 'middle') textY = y + (h - totalTextH) / 2 + lineH

  doc.text(lines, textX, textY, { align, maxWidth: textW })
}

/**
 * Draw a row of cells in the product table
 */
function tableRow(doc, y, values, h, opts = {}) {
  let x = MARGIN
  for (let i = 0; i < COL.length; i++) {
    const cellOpts = Array.isArray(opts) ? opts[i] || {} : opts
    cell(doc, x, y, COL[i], h, values[i] || '', cellOpts)
    x += COL[i]
  }
}


/**
 * Load an image URL and return a base64 data URL
 */
function loadImageAsBase64(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * Main export function
 */
export async function exportQuotationPDF(quotation, company) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const q = quotation
  const items = q.items || []
  const client = q.client_list || {}
  const contactName = q.contact_name_snapshot || q.attn_to || ''
  const contactJobTitle = q.contact_job_title_snapshot || ''
  const contactPhone = q.contact_phone_snapshot || ''
  const contactEmail = q.contact_email_snapshot || ''
  const totals = calculateQuotationTotals(q, items)

  // Set consistent border thickness for the entire document
  doc.setDrawColor('#000000')
  doc.setLineWidth(0.3)

  // Load logo image as base64
  const logoBase64 = company.logo ? await loadImageAsBase64(company.logo) : null

  let y = MARGIN

  // ─── TOP SECTION: Logo/Letter (70%) + Quotation Panel (30%) ───
  const leftW = CONTENT_W * 0.7 // ~135.8
  const rightW = CONTENT_W * 0.3 // ~58.2
  const rightX = MARGIN + leftW
  const topStartY = y

  // Draw outer border for top section
  // We'll draw subsections individually

  // ── LEFT SIDE ──
  // Logo area
  const logoH = 22
  doc.rect(MARGIN, y, leftW, logoH, 'S')

  // Company logo image
  if (logoBase64) {
    const imgW = 40
    const imgH = 12
    const imgX = MARGIN + (leftW - imgW) / 2
    doc.addImage(logoBase64, 'PNG', imgX, y + 1, imgW, imgH)
  } else {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#1a3fad')
    doc.text(company.short || company.name, MARGIN + leftW / 2, y + 8, { align: 'center' })
  }
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor('#333333')
  doc.text(company.address, MARGIN + leftW / 2, y + 15, { align: 'center', maxWidth: leftW - 10 })
  doc.text(company.phone, MARGIN + leftW / 2, y + 18.5, { align: 'center' })

  y += logoH

  // Project name row
  const projH = 10
  doc.setFillColor('#dce6f1')
  doc.rect(MARGIN, y, leftW, projH, 'FD')
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#000000')
  doc.text(q.project_name || '', MARGIN + leftW / 2, y + 6.5, { align: 'center' })
  y += projH

  // Letter section — we'll draw this AFTER determining the right panel height
  // For now just record the start position
  const letterStartY = y

  // ── RIGHT SIDE (Quotation Panel) — calculate all heights first ──
  let ry = topStartY
  const qHeaderH = 5
  doc.setFillColor('#d9e2f3')
  doc.rect(rightX, ry, rightW, qHeaderH, 'FD')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#000000')
  doc.text('QUOTATION', rightX + rightW / 2, ry + 3.5, { align: 'center' })
  ry += qHeaderH

  // NO row
  const rowH = 4.5
  doc.rect(rightX, ry, rightW, rowH, 'S')
  doc.line(rightX + 14, ry, rightX + 14, ry + rowH)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('NO:', rightX + 1.5, ry + 3)
  doc.setFont('helvetica', 'normal')
  doc.text(q.quotation_no || '', rightX + 15.5, ry + 3)
  ry += rowH

  // DATE row
  doc.rect(rightX, ry, rightW, rowH, 'S')
  doc.line(rightX + 14, ry, rightX + 14, ry + rowH)
  doc.setFont('helvetica', 'bold')
  doc.text('DATE:', rightX + 1.5, ry + 3)
  doc.text(formatDate(q.created_at), rightX + 15.5, ry + 3)
  ry += rowH

  // Validity
  const termH = 5.5
  doc.rect(rightX, ry, rightW, termH, 'S')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text(`1. Validity: ${q.validity_days || 30} days upon receipt of quotation`, rightX + 1.5, ry + 3.2, { maxWidth: rightW - 3 })
  ry += termH

  // Payment Terms
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#c00000')
  doc.setFontSize(6.5)
  const payText = `2. Payment Terms: ${q.payment_terms || ''}`
  const payLines = doc.splitTextToSize(payText, rightW - 4)
  const payH = Math.max(7, payLines.length * 3 + 2)
  doc.rect(rightX, ry, rightW, payH, 'S')
  doc.text(payLines, rightX + 1.5, ry + 3)
  ry += payH

  // Bank details
  doc.setTextColor('#000000')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  const bankLines = doc.splitTextToSize(q.bank_details || '', rightW - 3)
  const bankH = Math.max(10, bankLines.length * 2.5 + 2)
  doc.rect(rightX, ry, rightW, bankH, 'S')
  doc.text(bankLines, rightX + 1.5, ry + 2.5)
  ry += bankH

  // Terms and Conditions header
  const tcH = 4.5
  doc.rect(rightX, ry, rightW, tcH, 'S')
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text('TERMS AND CONDITIONS:', rightX + 1.5, ry + 3)
  ry += tcH

  // Delivery Terms
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor('#000000')
  const delLabel = '3. Delivery Terms:'
  const delValue = q.delivery_terms || ''
  doc.setTextColor('#c00000')
  const delValueLines = doc.splitTextToSize(delValue, rightW - 4)
  const delH = Math.max(8, 5 + delValueLines.length * 2.8)
  doc.rect(rightX, ry, rightW, delH, 'S')
  doc.setTextColor('#000000')
  doc.text(delLabel, rightX + 1.5, ry + 3)
  doc.setTextColor('#c00000')
  doc.text(delValueLines, rightX + 1.5, ry + 6)
  ry += delH

  // Cancellation
  doc.setTextColor('#000000')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  const canText = `4. ${q.cancellation_fee || '50% Cancellation Fee'}`
  const canLines = doc.splitTextToSize(canText, rightW - 4)
  const canH = Math.max(5, canLines.length * 2.8 + 2)
  doc.rect(rightX, ry, rightW, canH, 'S')
  doc.text(canLines, rightX + 1.5, ry + 3)
  ry += canH

  // Additional notes (fill remaining space)
  // Always draw note 5 - calculate its height first
  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  const noteText = `5. ${q.additional_notes || 'Any installation works if not stated herein can be covered in a separate proposal or shall be done by others, BONDS & PERMITS cost not included'}`
  const noteLines = doc.splitTextToSize(noteText, rightW - 4)
  const minNoteH = Math.max(8, noteLines.length * 2.2 + 3)

  const rightPanelEndY = ry + minNoteH
  // The top section height = max of left side content and right panel content
  const leftFixedH = logoH + projH // logo + project = 32mm
  const minLetterH = 30
  const rightTotalH = rightPanelEndY - topStartY
  const topSectionH = Math.max(leftFixedH + minLetterH, rightTotalH)
  const topEndY = topStartY + topSectionH
  const letterH = topEndY - letterStartY

  // Draw note 5 in remaining space
  const noteActualH = topEndY - ry
  doc.rect(rightX, ry, rightW, noteActualH, 'S')
  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor('#000000')
  doc.text(noteLines, rightX + 1.5, ry + 2.5)

  // Draw the right panel outer border
  doc.rect(rightX, topStartY, rightW, topSectionH, 'S')

  // Now draw the letter section on the left
  doc.rect(MARGIN, letterStartY, leftW, letterH, 'S')
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor('#000000')
  let ly = letterStartY + 5
  doc.text(`Dear ${contactName || 'Sir/Madam'},`, MARGIN + 4, ly)
  ly += 5
  doc.text('We are pleased to submit our proposal for the Supply and Delivery subject items per your requirements.', MARGIN + 4, ly, { maxWidth: leftW - 8 })
  ly += 7
  doc.text('Kindly find time to review details of our proposal.', MARGIN + 4, ly)
  ly += 5
  doc.text('Thank you very much and we look forward to be of service to your requirements.', MARGIN + 4, ly, { maxWidth: leftW - 8 })

  y = topEndY


  // ─── CLIENT SECTION ───
  const clientLeftW = leftW
  const clientRightW = rightW

  // CLIENT NAME header
  const chH = 5
  doc.setFillColor('#4472c4')
  doc.rect(MARGIN, y, clientLeftW, chH, 'FD')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#ffffff')
  doc.text('CLIENT NAME', MARGIN + clientLeftW / 2, y + 3.5, { align: 'center' })

  // NOTES header
  doc.setFillColor('#4472c4')
  doc.rect(rightX, y, clientRightW, chH, 'FD')
  doc.text('NOTES:', rightX + 2, y + 3.5)
  y += chH

  // Client rows
  doc.setTextColor('#000000')
  doc.setFontSize(7)
  const clientFields = [
    ['Client name:', client.company_name],
    ['Address:', client.address],
    ['Vat Reg Tin:', client.tin_number],
    ['Attn to:', contactName],
    ['Designation:', contactJobTitle],
    ['Contact No.', contactPhone],
    ['Email:', contactEmail],
  ]
  const cRowH = 4.2
  const labelW = 22
  const clientStartY = y

  clientFields.forEach(([label, value]) => {
    doc.rect(MARGIN, y, labelW, cRowH, 'S')
    doc.rect(MARGIN + labelW, y, clientLeftW - labelW, cRowH, 'S')
    doc.setFont('helvetica', 'bold')
    doc.text(label, MARGIN + 1.5, y + 3)
    doc.setFont('helvetica', 'normal')
    doc.text(String(value || ''), MARGIN + labelW + 1.5, y + 3, { maxWidth: clientLeftW - labelW - 3 })
    y += cRowH
  })

  // Notes content area (right side, spanning all client rows)
  const notesH = y - clientStartY
  doc.rect(rightX, clientStartY, clientRightW, notesH, 'S')
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'italic')
  const notesText = q.notes || '*Prices provided are applicable only for the quantities specified. Changes in the quantity may lead to adjustments in the actual pricing.'
  doc.text(doc.splitTextToSize(notesText, clientRightW - 4), rightX + 2, clientStartY + 3.5)


  // ─── PRODUCT TABLE ───
  const headers = ['SL. NO.', 'PRODUCT TYPES', 'PRODUCT CODE', 'DESCRIPTION', 'DATASHEET LINKS', 'QTY', 'UOM [1]', 'UNIT COST\n(VAT EX)', 'DISC.\n%', 'NET TOTAL']
  const headerH = 8

  // Header row
  const headerOpts = headers.map(() => ({
    fill: '#c00000', color: '#ffffff', bold: true, fontSize: 6, align: 'center', valign: 'middle'
  }))
  tableRow(doc, y, headers, headerH, headerOpts)
  y += headerH

  // Scope of works row (if any)
  if (q.scope_of_works) {
    const scopeItemH = 5
    doc.setFillColor('#dce6f1')
    doc.rect(MARGIN, y, CONTENT_W, scopeItemH, 'FD')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#000000')
    doc.text(q.scope_of_works, MARGIN + CONTENT_W / 2, y + 3.2, { align: 'center' })
    y += scopeItemH
  }

  // Item rows
  let slNo = 0
  items.forEach(item => {
    // Handle section title rows
    if (item.is_section) {
      const sectionH = 5.5
      if (y + sectionH > PAGE_H - 25) {
        doc.addPage()
        y = MARGIN
      }
      doc.setFillColor('#dce6f1')
      doc.rect(MARGIN, y, CONTENT_W, sectionH, 'FD')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor('#000000')
      doc.text(item.section_title || '', MARGIN + 2, y + 3.5)
      y += sectionH
      return
    }

    slNo++
    const unitPrice = quotationUnitPrice(item)
    const lineTotal = unitPrice * (Number(item.quantity) || 0)
    const discountPercent = Math.min(Math.max(Number(item.discount_percent) || 0, 0), 100)
    const disc = lineTotal * discountPercent / 100
    const netTotal = lineTotal - disc

    // Calculate row height based on content length in all text columns
    doc.setFontSize(6.5)
    const typeLines = doc.splitTextToSize(item.product_type || '', COL[1] - 3)
    const codeLines = doc.splitTextToSize(item.product_code || '', COL[2] - 3)
    const descLines = doc.splitTextToSize(item.description || '', COL[3] - 3)
    const linkLines = doc.splitTextToSize(item.datasheet_link || '', COL[4] - 3)
    const maxLines = Math.max(typeLines.length, codeLines.length, descLines.length, linkLines.length)
    const rowH = Math.max(5.5, maxLines * 2.8 + 2)

    // Check page break
    if (y + rowH > PAGE_H - 25) {
      doc.addPage()
      y = MARGIN
    }

    const values = [
      String(slNo),
      item.product_type || '',
      item.product_code || '',
      item.description || '',
      item.datasheet_link || '',
      String(item.quantity || ''),
      item.uom || '',
      moneyFmt(unitPrice),
      discountPercent > 0 ? `${discountPercent}%` : '',
      moneyFmt(netTotal),
    ]
    const rowOpts = [
      { align: 'center', fontSize: 6.5 },
      { fontSize: 6.5 },
      { fontSize: 6.5, bold: true },
      { fontSize: 6.5 },
      { fontSize: 5.5, color: '#0563C1' },
      { align: 'center', fontSize: 6.5 },
      { align: 'center', fontSize: 6.5 },
      { align: 'right', fontSize: 6.5 },
      { align: 'right', fontSize: 6.5 },
      { align: 'right', fontSize: 6.5, bold: true },
    ]
    tableRow(doc, y, values, rowH, rowOpts)
    y += rowH
  })


  // ─── TOTALS SECTION ───
  // Totals use: cols 0-6 merged (left), cols 7-8 (label), col 9 (value)
  const leftColsW = COL.slice(0, 7).reduce((a, b) => a + b, 0) // sum of first 7 columns
  const labelColW = COL[7] + COL[8]
  const valueColW = COL[9]
  const totRowH = 5

  const totalsData = [
    { label: 'GROSS SUBTOTAL', value: moneyFmt(totals.grossSubtotal), leftFill: '#dce6f1', leftText: '* SCOPE OF WORKS', leftBold: true },
    { label: 'LINE DISCOUNTS', value: totals.itemDiscountAmount > 0 ? `-${moneyFmt(totals.itemDiscountAmount)}` : moneyFmt(0) },
    { label: 'ADDITIONAL DISCOUNT', value: totals.discountAmount > 0 ? `-${moneyFmt(totals.discountAmount)}` : moneyFmt(0) },
    { label: 'TOTAL VATABLE', value: moneyFmt(totals.taxableSubtotal) },
    { label: `VAT ${q.vat_rate}%`, value: moneyFmt(totals.vatAmount) },
    { label: `WHT ${q.wht_rate}%`, value: totals.whtAmount > 0 ? `-${moneyFmt(totals.whtAmount)}` : moneyFmt(0) },
    { label: 'SHIPPING COST', value: totals.shippingCost > 0 ? moneyFmt(totals.shippingCost) : '' },
    { label: 'OTHERS', value: totals.othersCost > 0 ? moneyFmt(totals.othersCost) : '' },
    { label: 'TOTAL AMOUNT', value: moneyFmt(totals.grandTotal), leftFill: '#dce6f1', fill: '#dce6f1', bold: true, fontSize: 6.5 },
  ]

  totalsData.forEach((row) => {
    if (y + totRowH > PAGE_H - 20) {
      doc.addPage()
      y = MARGIN
    }

    // Left merged cell
    if (row.leftFill) doc.setFillColor(row.leftFill)
    doc.rect(MARGIN, y, leftColsW, totRowH, row.leftFill ? 'FD' : 'S')
    if (row.leftText) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor('#000000')
      doc.text(row.leftText, MARGIN + 2, y + 3.5)
    }

    // Label cell
    const lFill = row.fill || null
    if (lFill) doc.setFillColor(lFill)
    doc.rect(MARGIN + leftColsW, y, labelColW, totRowH, lFill ? 'FD' : 'S')
    doc.setFontSize(row.fontSize || 6.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#000000')
    doc.text(row.label, MARGIN + leftColsW + labelColW - 1.5, y + 3.5, { align: 'right' })

    // Value cell
    if (lFill) doc.setFillColor(lFill)
    doc.rect(MARGIN + leftColsW + labelColW, y, valueColW, totRowH, lFill ? 'FD' : 'S')
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
    doc.text(row.value, MARGIN + leftColsW + labelColW + valueColW - 1.5, y + 3.5, { align: 'right' })

    y += totRowH
  })


  // ─── FOOTER ───
  if (y + 30 > PAGE_H - MARGIN) {
    doc.addPage()
    y = MARGIN
  }

  // Confirmation text row - full width
  const footH = 6
  doc.rect(MARGIN, y, CONTENT_W, footH, 'S')
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor('#000000')
  doc.text('We hereby inform you that the above order is accepted and confirmed.', MARGIN + CONTENT_W / 2, y + 3.8, { align: 'center' })
  y += footH

  // Prepared By / Confirmed By
  const sigH = 20
  doc.rect(MARGIN, y, CONTENT_W / 2, sigH, 'S')
  doc.rect(MARGIN + CONTENT_W / 2, y, CONTENT_W / 2, sigH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('PREPARED BY:', MARGIN + 2, y + 4)
  doc.text('CONFIRMED BY:', MARGIN + CONTENT_W / 2 + 2, y + 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text(q.prepared_by_name || 'ACCOUNT SUPPORT TEAM', MARGIN + 2, y + 14)
  doc.text(q.prepared_by_email || company.support_email || '', MARGIN + 2, y + 17)

  // Confirmed by name (if provided)
  if (q.confirmed_by_name) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text(q.confirmed_by_name, MARGIN + CONTENT_W * 0.75, y + 11, { align: 'center' })
    doc.setFont('helvetica', 'normal')
  }

  // Signature line
  const sigLineX = MARGIN + CONTENT_W / 2 + 10
  const sigLineW = CONTENT_W / 2 - 20
  doc.line(sigLineX, y + 14, sigLineX + sigLineW, y + 14)
  doc.setFontSize(6)
  doc.text('Signature over printed name/ date', MARGIN + CONTENT_W * 0.75, y + 17, { align: 'center' })
  y += sigH

  // Contact footer
  const contactH = 5
  doc.rect(MARGIN, y, CONTENT_W, contactH, 'S')
  doc.setFont('helvetica', 'bolditalic')
  doc.setFontSize(6)
  doc.text(
    `If you have any questions about this proposal feel free to contact us @ ${company.contact_phone} and email us at ${company.email}`,
    MARGIN + CONTENT_W / 2, y + 3, { align: 'center', maxWidth: CONTENT_W - 6 }
  )

  // Save
  doc.save(`${q.quotation_no}.pdf`)
}
