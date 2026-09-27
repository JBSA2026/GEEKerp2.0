import { jsPDF } from 'jspdf'

/**
 * BIR Form 1601-C PDF Export
 * Monthly Remittance Return of Income Taxes Withheld on Compensation
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


function drawHeader(doc, y, rpMonth, rpYear, formData) {
  const h1 = 12
  cell(doc, M, y, 22, h1, '')
  doc.setFontSize(5)
  doc.setFont('helvetica', 'normal')
  doc.text('For BIR', M + 1, y + 3)
  doc.text('Use Only', M + 1, y + 5.5)
  doc.setFontSize(4.5)
  doc.text('BCS/', M + 1, y + 8)
  doc.text('Item:', M + 10, y + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('Republic of the Philippines', M + CW / 2, y + 3, { align: 'center' })
  doc.text('Department of Finance', M + CW / 2, y + 6, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text('Bureau of Internal Revenue', M + CW / 2, y + 9, { align: 'center' })

  hline(doc, M, y + h1, CW)
  y += h1

  const h2 = 16
  doc.line(M + 30, y, M + 30, y + h2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.text('BIR Form No.', M + 2, y + 3.5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('1601-C', M + 2, y + 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('January 2018 (ENCS)', M + 2, y + 14.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('Monthly Remittance Return of', M + CW / 2, y + 5, { align: 'center' })
  doc.text('Income Taxes Withheld', M + CW / 2, y + 9, { align: 'center' })
  doc.text('on Compensation', M + CW / 2, y + 13, { align: 'center' })

  doc.line(M + CW - 30, y, M + CW - 30, y + h2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('1601C 01/18ENCS', M + CW - 28, y + 8)

  hline(doc, M, y + h2, CW)
  y += h2

  const hPeriod = 8
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(5.5)
  doc.text('Fill in all applicable spaces. Mark all appropriate boxes with "X".', M + 2, y + 3)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('For the Month', M + 70, y + 3)

  doc.rect(M + 95, y + 0.5, 10, 5, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(rpMonth || '', M + 100, y + 4.5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('(MM)', M + 100, y + 7, { align: 'center' })

  doc.rect(M + 112, y + 0.5, 16, 5, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(rpYear || '', M + 120, y + 4.5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('(YYYY)', M + 120, y + 7, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Amended Return?', M + 140, y + 3)
  doc.rect(M + 165, y + 0.5, 4, 4, 'S')
  doc.text('Yes', M + 170, y + 3.5)
  doc.rect(M + 178, y + 0.5, 4, 4, 'S')
  doc.text('No', M + 183, y + 3.5)
  if (formData.amended_return) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('X', M + 167, y + 3.8, { align: 'center' })
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('X', M + 180, y + 3.8, { align: 'center' })
  }

  hline(doc, M, y + hPeriod, CW)
  y += hPeriod

  return y
}


function drawPartI(doc, y, formData) {
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

  // TIN Row
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

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('RDO Code', M + 145, y + 4)
  doc.rect(M + 163, y + 1, 14, 4, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.rdo_code || '', M + 170, y + 4, { align: 'center' })

  hline(doc, M, y + hRow, CW)
  y += hRow

  // Taxpayer's Name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('2', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.text("Taxpayer\u2019s Name", M + 8, y + 3)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.taxpayer_name || '', M + 8, y + 5.5)
  hline(doc, M, y + hRow, CW)
  y += hRow

  // Registered Address
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('3', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.text('Registered Address', M + 8, y + 3)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.registered_address || '', M + 8, y + 5.5)
  hline(doc, M, y + hRow, CW)
  y += hRow

  // Zip Code + Contact Number
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('4', M + 3, y + 4)
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

  // Category of Withholding Agent
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('5', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Category of Withholding Agent', M + 8, y + 4)
  doc.rect(M + 60, y + 1, 50, 4, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(formData.category_of_agent || '', M + 85, y + 4, { align: 'center' })
  hline(doc, M, y + hRow, CW)
  y += hRow

  // Number of Employees
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('6', M + 3, y + 4)
  doc.line(M + 6, y, M + 6, y + hRow)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Number of Employees', M + 8, y + 4)
  doc.rect(M + 50, y + 1, 20, 4, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(String(formData.number_of_employees || ''), M + 60, y + 4, { align: 'center' })
  hline(doc, M, y + hRow, CW)
  y += hRow

  return y
}


function drawSchedule1(doc, y, formData) {
  const hPartH = 5
  const compRowH = 7
  const labelW = 130
  const amtW = CW - labelW
  const amtX = M + labelW

  doc.setFillColor('#f0f0f0')
  doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Schedule 1 \u2013 Total Amount of Compensation', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW)
  y += hPartH

  const items = [
    ['7', 'Total Compensation Paid', formData.schedule1_total_compensation],
    ['8', 'Less: Statutory Minimum Wage (SMW)', formData.schedule1_statutory_min_wage],
    ['9', 'Less: Holiday Pay, Overtime Pay, Night Shift Differential', formData.schedule1_holiday_ot_night],
    ['10', 'Less: 13th Month Pay and Other Benefits', formData.schedule1_13th_month_benefits],
    ['11', 'Less: De Minimis Benefits', formData.schedule1_deminimis],
    ['12', 'Less: SSS/GSIS/PhilHealth/Pag-IBIG Contributions', formData.schedule1_sss_gsis_philhealth_pagibig],
    ['13', 'Less: Other Non-Taxable Compensation', formData.schedule1_other_nontaxable],
  ]

  for (const [num, label, value] of items) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text(num, M + 3, y + 4.5)
    doc.line(M + 8, y, M + 8, y + compRowH)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.text(label, M + 10, y + 4.5)
    doc.rect(amtX, y, amtW, compRowH, 'S')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(money(value), amtX + amtW - 2, y + 4.5, { align: 'right' })
    hline(doc, M, y + compRowH, CW)
    y += compRowH
  }

  // Taxable Compensation total
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('14', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFontSize(6.5)
  doc.text('Taxable Compensation (Item 7 Less Items 8 to 13)', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.schedule1_taxable_compensation), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  return y
}


function drawPartII(doc, y, formData) {
  const hPartH = 5
  const compRowH = 7
  const subRowH = 6
  const labelW = 130
  const amtW = CW - labelW
  const amtX = M + labelW

  doc.setFillColor('#f0f0f0')
  doc.rect(M, y, CW, hPartH, 'F')
  hline(doc, M, y, CW)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Part II \u2013 Computation of Tax', M + CW / 2, y + 3.5, { align: 'center' })
  hline(doc, M, y + hPartH, CW)
  y += hPartH

  // Line 17
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('17', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Taxes Withheld for the Month', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_17_taxes_withheld), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // Line 18
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('18', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Adjustment from Previous Month(s)', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_18_adjustment), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // Line 19
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('19', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Total (Sum of Items 17 and 18)', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_19_total), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // Line 20
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('20', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Less: Tax Remitted in Return Previously Filed, if Amended Return', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_20_prev_remitted), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // Line 21
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('21', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Tax Still Due/(Overremittance) (Item 19 Less Item 20)', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_21_tax_still_due), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // Line 22 header
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

  // Line 22a
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('22a', M + 12, y + 4)
  doc.text('Surcharge', M + 22, y + 4)
  doc.rect(amtX, y, amtW, subRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_22a_surcharge), amtX + amtW - 2, y + 4, { align: 'right' })
  hline(doc, M, y + subRowH, CW)
  y += subRowH

  // Line 22b
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('22b', M + 12, y + 4)
  doc.text('Interest', M + 22, y + 4)
  doc.rect(amtX, y, amtW, subRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_22b_interest), amtX + amtW - 2, y + 4, { align: 'right' })
  hline(doc, M, y + subRowH, CW)
  y += subRowH

  // Line 22c
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('22c', M + 12, y + 4)
  doc.text('Compromise', M + 22, y + 4)
  doc.rect(amtX, y, amtW, subRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_22c_compromise), amtX + amtW - 2, y + 4, { align: 'right' })
  hline(doc, M, y + subRowH, CW)
  y += subRowH

  // Line 23
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('23', M + 3, y + 4.5)
  doc.line(M + 8, y, M + 8, y + compRowH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('Total Penalties (Sum of Items 22a, 22b, and 22c)', M + 10, y + 4.5)
  doc.rect(amtX, y, amtW, compRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(money(formData.line_23_total_penalties), amtX + amtW - 2, y + 4.5, { align: 'right' })
  hline(doc, M, y + compRowH, CW)
  y += compRowH

  // Line 24
  const totalRowH = 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('24', M + 3, y + 5)
  doc.line(M + 8, y, M + 8, y + totalRowH)
  doc.setFontSize(6.5)
  doc.text('TOTAL AMOUNT DUE/(Overremittance) (Sum of Items 21 & 23)', M + 10, y + 5)
  doc.rect(amtX, y, amtW, totalRowH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(money(formData.line_24_total_due), amtX + amtW - 2, y + 5.5, { align: 'right' })
  hline(doc, M, y + totalRowH, CW)
  y += totalRowH

  return y
}


function drawSignatory(doc, y, formData) {
  const sigSectionH = 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  const declText = 'I declare under the penalties of perjury that this return has been made in good faith, verified by me, and to the best of my knowledge and belief, is true and correct, pursuant to the provisions of the National Internal Revenue Code, as amended, and the regulations issued under authority thereof.'
  const declLines = doc.splitTextToSize(declText, CW - 4)
  doc.text(declLines, M + 2, y + 3)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(formData.signatory_name || '', M + CW / 2, y + 12, { align: 'center' })
  hline(doc, M + 40, y + 13, CW - 80)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text('Signature over Printed Name of Taxpayer/Authorized Representative/Tax Agent', M + CW / 2, y + 15.5, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  const titleTinText = `${formData.signatory_title || ''} / TIN: ${formData.signatory_tin || ''}`
  doc.text(titleTinText, M + CW / 2, y + 18.5, { align: 'center' })

  y += sigSectionH
  hline(doc, M, y, CW)
}

export function export1601CPDF(formData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setLineWidth(0.2)
  doc.setDrawColor('#000000')

  let y = M

  // === OUTER BORDER ===
  doc.rect(M, M, CW, PH - M * 2, 'S')

  // Parse return period (MM/YYYY)
  const [rpMonth, rpYear] = (formData.return_period || '/').split('/')

  // === HEADER SECTION ===
  y = drawHeader(doc, y, rpMonth, rpYear, formData)

  // === PART I - BACKGROUND INFORMATION ===
  y = drawPartI(doc, y, formData)

  // === SCHEDULE 1 - TOTAL COMPENSATION ===
  y = drawSchedule1(doc, y, formData)

  // === PART II - COMPUTATION OF TAX ===
  y = drawPartII(doc, y, formData)

  // === SIGNATORY SECTION ===
  drawSignatory(doc, y, formData)

  // === FOOTER ===
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4.5)
  doc.text('*NOTE: The BIR Data Privacy Policy is in the BIR website (www.bir.gov.ph)', M + 2, PH - M - 1)

  // === SAVE ===
  const name = (formData.taxpayer_name || 'unknown').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
  const period = (formData.return_period || '').replace('/', '-')
  doc.save(`BIR_1601C_${name}_${period}.pdf`)
}
