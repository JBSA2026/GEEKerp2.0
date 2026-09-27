import { jsPDF } from 'jspdf'
import birBg from '@/assets/bir2307-bg.png'
import {
  PAGE_W, PAGE_H,
  FONT_SIZE_TIN, FONT_SIZE_DATE, FONT_SIZE_TEXT, FONT_SIZE_TABLE, FONT_SIZE_SIG,
  PERIOD_FROM_MM, PERIOD_FROM_DD, PERIOD_FROM_YYYY,
  PERIOD_TO_MM, PERIOD_TO_DD, PERIOD_TO_YYYY,
  PAYEE_TIN_SEGS, PAYEE_NAME, PAYEE_ADDRESS, PAYEE_ZIP, PAYEE_FOREIGN,
  PAYOR_TIN_SEGS, PAYOR_NAME, PAYOR_ADDRESS, PAYOR_ZIP,
  TABLE_A_Y, TABLE_B_Y, ROW_H, TABLE_COLS,
  PAYOR_SIG, PAYEE_SIG,
} from '@/pages/tax-management/forms/2307/fieldPositions'

/**
 * BIR Form 2307 PDF Export
 * Same positions and font sizes as the browser FormViewTab.
 * No charSpace — just plain centered text in each box.
 *
 * Uses JPEG compression for the background image to reduce PDF size
 * from ~28MB to ~1-2MB.
 */

// Convert PNG to compressed JPEG data URL via canvas (cached)
let _bgJpegCache = null
function getBgJpeg() {
  if (_bgJpegCache) return Promise.resolve(_bgJpegCache)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      // White background (JPEG has no transparency)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      _bgJpegCache = canvas.toDataURL('image/jpeg', 0.65)
      resolve(_bgJpegCache)
    }
    img.onerror = () => resolve(null)
    img.src = birBg
  })
}

function mmToPt(mmStr) {
  const mm = parseFloat(mmStr)
  return mm * 2.835
}

function tinText(value) {
  if (!value) return ''
  if (Array.isArray(value)) return value.filter(Boolean).join('')
  return (value || '').replace(/[-\s]/g, '')
}

export async function export2307PDF(formData) {
  const fd = formData || {}
  const doc = new jsPDF({ unit: 'mm', format: [PAGE_W, PAGE_H], orientation: 'portrait' })

  // Use compressed JPEG background instead of raw PNG (~28MB → ~1MB)
  const bgJpeg = await getBgJpeg()
  if (bgJpeg) {
    doc.addImage(bgJpeg, 'JPEG', 0, 0, PAGE_W, PAGE_H)
  } else {
    // Fallback to PNG if conversion fails
    doc.addImage(birBg, 'PNG', 0, 0, PAGE_W, PAGE_H)
  }

  function putField(field, text, opts = {}) {
    if (!text) return
    const { sizeMm = FONT_SIZE_TEXT, align = 'left', bold = false, spaced = false } = opts
    const sizePt = mmToPt(sizeMm)
    doc.setFontSize(sizePt)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor('#000000')

    const yBaseline = field.y + field.h * 0.65
    const str = String(text)

    if (spaced && str.length > 1) {
      // Place each character in its own evenly-spaced slot across the box
      const slotWidth = field.w / str.length
      for (let i = 0; i < str.length; i++) {
        const charX = field.x + slotWidth * i + slotWidth / 2 - 0.5
        doc.text(str[i], charX, yBaseline, { align: 'center' })
      }
    } else if (spaced && str.length === 1) {
      doc.text(str, field.x + field.w / 2, yBaseline, { align: 'center' })
    } else {
      let tx
      if (align === 'center') tx = field.x + field.w / 2
      else if (align === 'right') tx = field.x + field.w - 0.5
      else tx = field.x + 0.5
      doc.text(str, tx, yBaseline, { align })
    }
  }

  // Period
  const fmtDate = (val) => {
    if (!val) return { mm: '', dd: '', yyyy: '' }
    if (val.includes('-')) {
      const [yr, mo, da] = val.split('-')
      return { mm: mo || '', dd: da || '', yyyy: yr || '' }
    }
    return { mm: '', dd: '', yyyy: '' }
  }
  const fromDate = fmtDate(fd.period_from)
  const toDate = fmtDate(fd.period_to)

  putField(PERIOD_FROM_MM, fromDate.mm, { sizeMm: FONT_SIZE_DATE, align: 'center', spaced: true })
  putField(PERIOD_FROM_DD, fromDate.dd, { sizeMm: FONT_SIZE_DATE, align: 'center', spaced: true })
  putField(PERIOD_FROM_YYYY, fromDate.yyyy, { sizeMm: FONT_SIZE_DATE, align: 'center', spaced: true })
  putField(PERIOD_TO_MM, toDate.mm, { sizeMm: FONT_SIZE_DATE, align: 'center', spaced: true })
  putField(PERIOD_TO_DD, toDate.dd, { sizeMm: FONT_SIZE_DATE, align: 'center', spaced: true })
  putField(PERIOD_TO_YYYY, toDate.yyyy, { sizeMm: FONT_SIZE_DATE, align: 'center', spaced: true })

  // Payee TIN
  const payeeTin = tinText(fd.payee_tin)
  const payeeTinParts = [payeeTin.slice(0, 3), payeeTin.slice(3, 6), payeeTin.slice(6, 9), payeeTin.slice(9)]
  PAYEE_TIN_SEGS.forEach((seg, i) => {
    putField(seg, payeeTinParts[i], { sizeMm: FONT_SIZE_TIN, align: 'center', spaced: true })
  })

  // Payee Info
  putField(PAYEE_NAME, fd.payee_name, { sizeMm: FONT_SIZE_TEXT })
  putField(PAYEE_ADDRESS, fd.payee_address, { sizeMm: FONT_SIZE_TEXT })
  putField(PAYEE_ZIP, fd.payee_zip_code, { sizeMm: FONT_SIZE_DATE, align: 'center', spaced: true })
  putField(PAYEE_FOREIGN, fd.payee_foreign_address, { sizeMm: FONT_SIZE_TEXT })

  // Payor TIN
  const payorTin = tinText(fd.payor_tin)
  const payorTinParts = [payorTin.slice(0, 3), payorTin.slice(3, 6), payorTin.slice(6, 9), payorTin.slice(9)]
  PAYOR_TIN_SEGS.forEach((seg, i) => {
    putField(seg, payorTinParts[i], { sizeMm: FONT_SIZE_TIN, align: 'center', spaced: true })
  })

  // Payor Info
  putField(PAYOR_NAME, fd.payor_name, { sizeMm: FONT_SIZE_TEXT })
  putField(PAYOR_ADDRESS, fd.payor_address, { sizeMm: FONT_SIZE_TEXT })
  putField(PAYOR_ZIP, fd.payor_zip_code, { sizeMm: FONT_SIZE_DATE, align: 'center', spaced: true })

  // Tables
  const COL = TABLE_COLS
  const renderTable = (rows, startY) => {
    const padded = [...(rows || [])]
    while (padded.length < 10) padded.push({})
    const displayRows = padded.slice(0, 10)

    displayRows.forEach((row, i) => {
      const y = startY + i * ROW_H
      const rf = (col) => ({ x: col.x, y, w: col.w, h: ROW_H })

      if (row.nature) putField(rf(COL.nature), row.nature, { sizeMm: FONT_SIZE_TABLE })
      if (row.atc) putField(rf(COL.atc), row.atc, { sizeMm: FONT_SIZE_TABLE, align: 'center' })
      if (row.month1) putField(rf(COL.m1), row.month1, { sizeMm: FONT_SIZE_TABLE, align: 'right' })
      if (row.month2) putField(rf(COL.m2), row.month2, { sizeMm: FONT_SIZE_TABLE, align: 'right' })
      if (row.month3) putField(rf(COL.m3), row.month3, { sizeMm: FONT_SIZE_TABLE, align: 'right' })
      if (row.total && row.total !== '0.00') putField(rf(COL.total), row.total, { sizeMm: FONT_SIZE_TABLE, align: 'right' })
      if (row.tax_withheld) putField(rf(COL.tax), row.tax_withheld, { sizeMm: FONT_SIZE_TABLE, align: 'right' })
    })

    const totY = startY + 10 * ROW_H
    const tf = (col) => ({ x: col.x, y: totY, w: col.w, h: ROW_H })
    const sum = (field) => {
      const s = displayRows.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0)
      return s ? s.toFixed(2) : ''
    }
    putField(tf(COL.m1), sum('month1'), { sizeMm: FONT_SIZE_TABLE, align: 'right', bold: true })
    putField(tf(COL.m2), sum('month2'), { sizeMm: FONT_SIZE_TABLE, align: 'right', bold: true })
    putField(tf(COL.m3), sum('month3'), { sizeMm: FONT_SIZE_TABLE, align: 'right', bold: true })
    putField(tf(COL.total), sum('total'), { sizeMm: FONT_SIZE_TABLE, align: 'right', bold: true })
    putField(tf(COL.tax), sum('tax_withheld'), { sizeMm: FONT_SIZE_TABLE, align: 'right', bold: true })
  }

  renderTable(fd.table_a, TABLE_A_Y)
  renderTable(fd.table_b, TABLE_B_Y)

  // Signatories
  putField(PAYOR_SIG, fd.payor_signatory_name, { sizeMm: FONT_SIZE_SIG, align: 'center' })
  putField(PAYEE_SIG, fd.payee_signatory_name, { sizeMm: FONT_SIZE_SIG, align: 'center' })

  // Save
  const filename = `BIR_2307_${fd.payee_name || 'form'}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_')
  doc.save(filename)
}
