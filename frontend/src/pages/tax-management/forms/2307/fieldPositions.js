/**
 * BIR Form 2307 — Field position map (shared between browser view and PDF export)
 * All values in mm from the top-left corner of the 215.9mm × 330.2mm page.
 * Edit positions here and both outputs update automatically.
 */

export const PAGE_W = 215.9
export const PAGE_H = 330.2

// ─── Digit spacing (letter-spacing in mm for individual digit boxes) ─────────
// This adds space BETWEEN each character. Keep it small.
export const TIN_LETTER_SPACING = '3.2mm'    // spacing between TIN digits
export const DATE_LETTER_SPACING = '3.2mm'   // spacing between date digits
export const ZIP_LETTER_SPACING = '3mm'    // spacing between ZIP digits

// ─── Font sizes ──────────────────────────────────────────────────────────────
export const FONT_SIZE_TIN = '2.8mm'         // TIN digits
export const FONT_SIZE_DATE = '2.5mm'        // date digits
export const FONT_SIZE_TEXT = '2.2mm'        // names, addresses
export const FONT_SIZE_TABLE = '1.9mm'       // table cell text
export const FONT_SIZE_SIG = '3mm'           // signatory names

// ─── Period (Row 1) ──────────────────────────────────────────────────────────
// From: separate MM, DD, YYYY
export const PERIOD_FROM_MM = { x: 55, y: 37.54, w: 9.28, h: 5.6 }
export const PERIOD_FROM_DD = { x: 64, y: 37.54, w: 9.29, h: 5.6 }
export const PERIOD_FROM_YYYY = { x: 73.5, y: 37.54, w: 18.57, h: 5.6 }
// To: separate MM, DD, YYYY
export const PERIOD_TO_MM = { x: 142, y: 37.29, w: 9.29, h: 5.82 }
export const PERIOD_TO_DD = { x: 151.5, y: 37.29, w: 9.30, h: 5.82 }
export const PERIOD_TO_YYYY = { x: 160.5, y: 37.29, w: 18.59, h: 5.82 }

// ─── Payee TIN (Row 2) ──────────────────────────────────────────────────────
export const PAYEE_TIN_SEGS = [
  { x: 74.5, y: 48.43, w: 13.95, h: 5.51 },
  { x: 92.5, y: 48.43, w: 13.95, h: 5.51 },
  { x: 110.5, y: 48.43, w: 13.95, h: 5.51 },
  { x: 128.5, y: 48.43, w: 26.1, h: 5.51 },
]

// ─── Payee Info (Rows 3–5) ───────────────────────────────────────────────────
export const PAYEE_NAME = { x: 12, y: 58, w: 197, h: 5.6 }
export const PAYEE_ADDRESS = { x: 12, y: 68, w: 177, h: 5.6 }
export const PAYEE_ZIP = { x: 192.1, y: 68, w: 17.6, h: 5.6 }
export const PAYEE_FOREIGN = { x: 12, y: 78, w: 196.4, h: 5.6 }

// ─── Payor TIN (Row 6) ──────────────────────────────────────────────────────
export const PAYOR_TIN_SEGS = [
  { x: 74.5, y: 89.07, w: 13.97, h: 5.66 },
  { x: 92.5, y: 89.07, w: 13.97, h: 5.66 },
  { x: 111.5, y: 89.07, w: 13.97, h: 5.66 },
  { x: 129.5, y: 89.07, w: 26.1, h: 5.66 },
]

// ─── Payor Info (Rows 7–8) ──────────────────────────────────────────────────
export const PAYOR_NAME = { x: 12, y: 98.6, w: 197, h: 5.6 }
export const PAYOR_ADDRESS = { x: 12, y: 108.6, w: 177, h: 5.6 }
export const PAYOR_ZIP = { x: 192.1, y: 108.6, w: 17.6, h: 5.6 }

// ─── Tables ─────────────────────────────────────────────────────────────────
export const TABLE_A_Y = 129
export const TABLE_B_Y = 189
export const ROW_H = 4.85

export const TABLE_COLS = {
  nature: { x: 7, w: 55 },
  atc: { x: 62.5, w: 13.5 },
  m1: { x: 76.5, w: 26 },
  m2: { x: 106, w: 23 },
  m3: { x: 135.5, w: 19 },
  total: { x: 165, w: 15 },
  tax: { x: 181.5, w: 28.5 },
}

// ─── Signatories ────────────────────────────────────────────────────────────
export const PAYOR_SIG = { x: 6.5, y: 256, w: 204, h: 7 }
export const PAYEE_SIG = { x: 6.5, y: 283, w: 204, h: 7 }
