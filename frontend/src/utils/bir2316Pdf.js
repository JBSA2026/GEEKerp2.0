import { jsPDF } from 'jspdf'

/**
 * BIR Form 2316 PDF Export
 * Certificate of Compensation Payment/Tax Withheld
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

function lineRow(doc, y, num, label, value, h = 5) {
  cell(doc, M, y, 10, h, num, { align: 'center', bold: true, fontSize: 6 })
  cell(doc, M + 10, y, CW - 45, h, label, { fontSize: 6 })
  cell(doc, M + CW - 35, y, 35, h, money(value), { align: 'right', fontSize: 7 })
  return y + h
}

export function export2316PDF(formData) {
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
  doc.line(M + 28, y, M + 28, y + h2)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5)
  doc.text('BIR Form No.', M + 2, y + 3.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text('2316', M + 3, y + 10)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5)
  doc.text('September 2021 (ENCS)', M + 2, y + 13)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('Certificate of Compensation Payment/Tax Withheld', M + CW / 2, y + 5, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
  doc.text('For Compensation Payment With or Without Tax Withheld', M + CW / 2, y + 9, { align: 'center' })
  hline(doc, M, y + h2, CW)
  y += h2

  // Year / Period
  const h3 = 6
  cell(doc, M, y, 50, h3, `1  For the Year: ${formData.tax_year || ''}`, { fontSize: 7 })
  cell(doc, M + 50, y, 72, h3, `2  From: ${(formData.period_from || '').slice(5) || '01-01'}`, { fontSize: 7 })
  cell(doc, M + 122, y, CW - 122, h3, `To: ${(formData.period_to || '').slice(5) || '12-31'}`, { fontSize: 7 })
  y += h3

  // Part I - Employee Info
  cell(doc, M, y, CW, 5, '  Part I — Employee Information', { bold: true, fontSize: 7, fill: '#f0f0f0' })
  y += 5

  const tinStr = (formData.employee_tin || []).join(' - ')
  cell(doc, M, y, 60, 5, `3  TIN: ${tinStr}`, { fontSize: 6 })
  cell(doc, M + 60, y, CW - 90, 5, `4  ${formData.employee_name || ''}`, { fontSize: 7, bold: true })
  cell(doc, M + CW - 30, y, 30, 5, `5  RDO: ${formData.rdo_code || ''}`, { fontSize: 6 })
  y += 5

  cell(doc, M, y, CW, 5, `6  Address: ${formData.employee_address || ''}`, { fontSize: 6 })
  y += 5

  cell(doc, M, y, 40, 5, `6A ZIP: ${formData.employee_zip_code || ''}`, { fontSize: 6 })
  cell(doc, M + 40, y, 50, 5, `7  DOB: ${formData.date_of_birth || ''}`, { fontSize: 6 })
  cell(doc, M + 90, y, CW - 90, 5, `8  Contact: ${formData.contact_number || ''}`, { fontSize: 6 })
  y += 5

  // Part II - Employer
  cell(doc, M, y, CW, 5, '  Part II — Employer Information (Present)', { bold: true, fontSize: 7, fill: '#f0f0f0' })
  y += 5

  const eTinStr = (formData.employer_tin || []).join(' - ')
  cell(doc, M, y, 60, 5, `12  TIN: ${eTinStr}`, { fontSize: 6 })
  cell(doc, M + 60, y, CW - 60, 5, `13  ${formData.employer_name || ''}`, { fontSize: 7, bold: true })
  y += 5

  cell(doc, M, y, CW - 30, 5, `14  Address: ${formData.employer_address || ''}`, { fontSize: 6 })
  cell(doc, M + CW - 30, y, 30, 5, `14A ZIP: ${formData.employer_zip_code || ''}`, { fontSize: 6 })
  y += 5

  // Part IVA - Summary
  cell(doc, M, y, CW, 5, '  Part IVA — Summary', { bold: true, fontSize: 7, fill: '#f0f0f0' })
  y += 5

  y = lineRow(doc, y, '19', 'Gross Compensation Income from Present Employer', formData.line_19_gross_compensation)
  y = lineRow(doc, y, '20', 'Less: Total Non-Taxable/Exempt Compensation Income', formData.line_20_nontaxable_compensation)
  y = lineRow(doc, y, '21', 'Taxable Compensation Income from Present Employer (19 - 20)', formData.line_21_taxable_present)
  y = lineRow(doc, y, '22', 'Add: Taxable Compensation Income from Previous Employer', formData.line_22_taxable_previous)
  y = lineRow(doc, y, '23', 'Gross Taxable Compensation Income (21 + 22)', formData.line_23_gross_taxable)
  y = lineRow(doc, y, '24', 'Tax Due', formData.line_24_tax_due)
  y = lineRow(doc, y, '25A', 'Amount of Taxes Withheld — Present Employer', formData.line_25a_tax_withheld_present)
  y = lineRow(doc, y, '25B', 'Amount of Taxes Withheld — Previous Employer', formData.line_25b_tax_withheld_previous)
  y = lineRow(doc, y, '26', 'Total Amount of Taxes Withheld as Adjusted (25A + 25B)', formData.line_26_total_withheld_adjusted)
  y = lineRow(doc, y, '27', '5% Tax Credit (PERA Act of 2008)', formData.line_27_pera_credit)
  y = lineRow(doc, y, '28', 'Total Taxes Withheld (26 + 27)', formData.line_28_total_taxes_withheld)

  // Part IVB-A Non-Taxable
  cell(doc, M, y, CW, 5, '  Part IV-B — A. Non-Taxable/Exempt Compensation Income', { bold: true, fontSize: 7, fill: '#f0f0f0' })
  y += 5

  y = lineRow(doc, y, '29', 'Basic Salary (including exempt ₱250,000 & below)', formData.line_29_basic_salary)
  y = lineRow(doc, y, '30', 'Holiday Pay (MWE)', formData.line_30_holiday_pay)
  y = lineRow(doc, y, '31', 'Overtime Pay (MWE)', formData.line_31_overtime_pay)
  y = lineRow(doc, y, '32', 'Night Shift Differential (MWE)', formData.line_32_night_shift)
  y = lineRow(doc, y, '33', 'Hazard Pay (MWE)', formData.line_33_hazard_pay)
  y = lineRow(doc, y, '34', '13th Month Pay and Other Benefits (max ₱90,000)', formData.line_34_13th_month)
  y = lineRow(doc, y, '35', 'De Minimis Benefits', formData.line_35_deminimis)
  y = lineRow(doc, y, '36', 'SSS, GSIS, PhilHealth & Pag-IBIG Contributions', formData.line_36_sss_philhealth_pagibig)
  y = lineRow(doc, y, '37', 'Other Non-Taxable Compensation', formData.line_37_other_nontaxable)
  y = lineRow(doc, y, '38', 'Total Non-Taxable/Exempt Compensation Income', formData.line_38_total_nontaxable)

  // Part IVB-B Taxable
  cell(doc, M, y, CW, 5, '  Part IV-B — B. Taxable Compensation Income', { bold: true, fontSize: 7, fill: '#f0f0f0' })
  y += 5

  y = lineRow(doc, y, '39', 'Basic Salary', formData.line_39_basic_salary_taxable)
  y = lineRow(doc, y, '40', 'Representation', formData.line_40_representation)
  y = lineRow(doc, y, '41', 'Transportation', formData.line_41_transportation)
  y = lineRow(doc, y, '42', 'Cost of Living Allowance (COLA)', formData.line_42_cola)
  y = lineRow(doc, y, '43', 'Fixed Housing Allowance', formData.line_43_housing)
  y = lineRow(doc, y, '44', 'Others (Allowances)', formData.line_44_others)
  y = lineRow(doc, y, '45', 'Overtime Pay', formData.line_45_overtime_taxable)
  y = lineRow(doc, y, '46', 'Commission', formData.line_46_commission)
  y = lineRow(doc, y, '47', 'Profit Sharing', formData.line_47_profit_sharing)
  y = lineRow(doc, y, '48', "Fees Including Director's Fees", formData.line_48_fees)
  y = lineRow(doc, y, '49', 'Taxable 13th Month Benefits', formData.line_49_taxable_13th)
  y = lineRow(doc, y, '50', 'Hazard Pay', formData.line_50_hazard_pay_taxable)
  y = lineRow(doc, y, '51', 'Other Taxable Compensation', formData.line_51_other_taxable)
  y = lineRow(doc, y, '52', 'Total Taxable Compensation Income', formData.line_52_total_taxable)

  // Signatory
  if (y < PH - M - 20) {
    y += 3
    cell(doc, M, y, CW, 5, '  Signatory', { bold: true, fontSize: 7, fill: '#f0f0f0' })
    y += 5
    cell(doc, M, y, CW / 2, 8, `Employer/Agent: ${formData.signatory_name || ''}`, { fontSize: 7 })
    cell(doc, M + CW / 2, y, CW / 2, 8, `Title: ${formData.signatory_title || ''}`, { fontSize: 7 })
  }

  const empName = (formData.employee_name || 'Employee').replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(`BIR_2316_${empName}_${formData.tax_year || ''}.pdf`)
}
