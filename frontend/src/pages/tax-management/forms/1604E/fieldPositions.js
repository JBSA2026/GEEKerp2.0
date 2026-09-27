/**
 * BIR Form 1604-E — Field position map
 * Page: 215.9mm × 330.2mm (long bond 8.5" × 13") — 2 pages
 * All values in mm from top-left corner of each page.
 *
 * Measured against the actual background images (bir1604e-p1.png, bir1604e-p2.png).
 * The form has consistent left margin ~9mm, right edge ~207mm, usable width ~198mm.
 */

export const PAGE_W = 215.9
export const PAGE_H = 330.2

// ─── Font sizes ──────────────────────────────────────────────────────────────
export const FONT_SIZE_TIN = '2.8mm'
export const FONT_SIZE_DATE = '2.8mm'
export const FONT_SIZE_TEXT = '2.2mm'
export const FONT_SIZE_TABLE = '2.0mm'
export const FONT_SIZE_SIG = '2.2mm'

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const TIN_LETTER_SPACING = '3.3mm'
export const DATE_LETTER_SPACING = '4mm'
export const ZIP_LETTER_SPACING = '4mm'
export const YEAR_LETTER_SPACING = '4mm'
export const RDO_LETTER_SPACING = '3.2mm'
export const TEXT_LETTER_SPACING = '0.1mm'
export const TABLE_LETTER_SPACING = '0.1mm'

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 1
// ════════════════════════════════════

// ─── Row 1: "1 For the Year (20YY)" ─────────────────────────────────────────
// The "2 0" is pre-printed, user fills last 2 digits in boxes after "20"
export const YEAR_DIGITS = { x: 60.5, y: 43, w: 16, h: 6.5 }

// ─── "2 Amended Return?" Yes / No checkboxes ────────────────────────────────
export const AMENDED_YES = { x: 107.5, y: 44, w: 5, h: 5 }
export const AMENDED_NO = { x: 125.5, y: 44, w: 5, h: 5 }

// ─── "3 Number of Sheet/s Attached" ─────────────────────────────────────────
export const SHEETS_ATTACHED = { x: 176, y: 44, w: 57, h: 5 }

// ─── "Part I – Background Information" divider ≈ y:52 ───────────────────────

// ─── Row 4: TIN (4 segments: xxx-xxx-xxx-xxxxx) ─────────────────────────────
// The TIN fields on this form are individual character boxes
// Segment 1 (3 digits), Segment 2 (3 digits), Segment 3 (3 digits), Segment 4 (5 digits)
export const TIN_SEGS = [
  { x: 85, y: 56.5, w: 14, h: 6 },   // first 3 digits
  { x: 105, y: 56.5, w: 14, h: 6 },   // next 3 digits
  { x: 125, y: 56.5, w: 14, h: 6 },   // next 3 digits
  { x: 144, y: 56.5, w: 25, h: 6 },  // last 5 digits (branch code)
]

// ─── "5 RDO Code" ───────────────────────────────────────────────────────────
export const RDO_CODE = { x: 190, y: 55.5, w: 22, h: 6 }

// ─── Row 6: "6 Withholding Agent's Name" ────────────────────────────────────
export const AGENT_NAME = { x:10, y: 67, w: 194, h: 5.5 }

// ─── Row 7: "7 Registered Address" (2 lines available) ─────────────────────
export const ADDRESS_LINE1 = { x: 10, y: 78, w: 194, h: 5.5 }
export const ADDRESS_LINE2 = { x: 10, y: 86, w: 194, h: 5.5 }

// ─── Row 7A: ZIP Code (right-aligned) ───────────────────────────────────────
export const ZIP_CODE = { x: 188, y: 86, w: 22, h: 5 }

// ─── Row 8: Category of Withholding Agent ───────────────────────────────────
// "Private" checkbox, then "Government" checkbox
export const CAT_PRIVATE = { x: 62, y: 93, w: 5, h: 5 }
export const CAT_GOVERNMENT = { x: 84.5, y: 93, w: 5, h: 5 }

// ─── Row 8A: "If private, top withholding agent?" Yes / No ──────────────────
export const TOP_YES = { x: 173, y: 93, w: 5, h: 5 }
export const TOP_NO = { x: 190.5, y: 93, w: 5, h: 5 }

// ─── Row 9: Contact Number ──────────────────────────────────────────────────
export const CONTACT_NUMBER = { x: 10, y: 104, w: 43, h: 5 }

// ─── Row 10: Email Address ──────────────────────────────────────────────────
export const EMAIL_ADDRESS = { x: 65, y: 104, w: 93.5, h: 5 }

// ─── "Part II – Summary of Remittances" divider ≈ y:107 ─────────────────────

// ─── Schedule 1: Remittance per BIR Form No. 1601-EQ ────────────────────────
// Header row "Schedule 1 – ..." ≈ y:112
// Column headers row ≈ y:117–126 (double-height header with sub-labels)
// Data rows: 1st Quarter, 2nd Quarter, 3rd Quarter, 4th Quarter, TOTAL
// The columns are: Quarter | Date of Remittance | Drawee Bank | TRA/eROR/eAR | Taxes Withheld | Penalties | Total Amount Remitted
// "Quarter" label column is pre-printed. Data starts at column 2.
export const SCHED1_START_Y = 135
export const SCHED1_ROW_H = 5.8
export const SCHED1_COLS = {
  date:      { x: 32, w: 27 },
  bank:      { x: 59, w: 27 },
  tra:       { x: 86, w: 30 },
  taxes:     { x: 116, w: 28 },
  penalties: { x: 144, w: 28 },
  total:     { x: 172, w: 35 },
}

// ─── Schedule 2: Remittance per BIR Form No. 1606 ───────────────────────────
// Header row "Schedule 2 – ..." ≈ y:164
// Column headers ≈ y:168–177
// Data rows: January through December + TOTAL = 13 rows
// Same column structure as Schedule 1
export const SCHED2_START_Y = 184
export const SCHED2_ROW_H = 5.5
export const SCHED2_COLS = {
  date:      { x: 32, w: 27 },
  bank:      { x: 59, w: 27 },
  tra:       { x: 86, w: 30 },
  taxes:     { x: 116, w: 28 },
  penalties: { x: 144, w: 28 },
  total:     { x: 172, w: 35 },
}

// ─── Signatory Section ──────────────────────────────────────────────────────
// "For Individual:" left half, "For Non-Individual:" right half
// Signature line ≈ y:292
export const SIGNATORY_LEFT = { x: 9.5, y: 292, w: 98, h: 6 }
export const SIGNATORY_RIGHT = { x: 108, y: 292, w: 98, h: 6 }

// ─── Tax Agent / Attorney Info (bottom of page 1) ───────────────────────────
export const TAX_AGENT_ACCRED = { x: 9.5, y: 305, w: 98, h: 5 }
export const ATTORNEY_ROLL = { x: 9.5, y: 310, w: 98, h: 5 }
export const DATE_OF_ISSUE = { x: 108, y: 305, w: 50, h: 5 }
export const DATE_OF_EXPIRY = { x: 158, y: 305, w: 48, h: 5 }

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 2
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Top: TIN and Withholding Agent's Name ──────────────────────────────────
export const P2_TIN = { x: 9.5, y: 28, w: 45, h: 5.5 }
export const P2_AGENT_NAME = { x: 90, y: 28, w: 115, h: 5.5 }

// ─── "Part III – Alphabetical List of Payees" divider ≈ y:38 ────────────────

// ─── Schedule 3: Alphalist – Expanded Withholding Tax (BIR Form No. 2307) ───
// Header ≈ y:40-42
// Column headers: SEQ No. | TIN | Name of Payees | ATC | Amount of Income Payment | Tax Rate | Amount of Tax Withheld
// Column header row ≈ y:44-54 (multi-line header)
// Data start ≈ y:56
export const SCHED3_START_Y = 57
export const SCHED3_ROW_H = 7.5
export const SCHED3_COLS = {
  seq:          { x: 9.5, w: 14 },
  tin:          { x: 23.5, w: 30 },
  name:         { x: 53.5, w: 56 },
  atc:          { x: 109.5, w: 16 },
  income:       { x: 125.5, w: 30 },
  tax_rate:     { x: 155.5, w: 16 },
  tax_withheld: { x: 171.5, w: 35 },
}
// Schedule 3 has approximately 5 data rows + TOTAL
export const SCHED3_DATA_ROWS = 5

// ─── Schedule 4: Other Payees Exempt (BIR Form No. 2304) ────────────────────
// Header ≈ y:110-112
// Column headers: SEQ No. | TIN | Name of Payees | ATC | Nature of Income Payment | Amount of Income Payment
// Data start ≈ y:132
export const SCHED4_START_Y = 134
export const SCHED4_ROW_H = 7.5
export const SCHED4_COLS = {
  seq:            { x: 9.5, w: 14 },
  tin:            { x: 23.5, w: 30 },
  name:           { x: 53.5, w: 56 },
  atc:            { x: 109.5, w: 16 },
  income_nature:  { x: 125.5, w: 38 },
  income_amount:  { x: 163.5, w: 43 },
}
// Schedule 4 has approximately 5 data rows + TOTAL
export const SCHED4_DATA_ROWS = 5
