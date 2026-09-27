import { BIRFormZoomWrapper } from '@/components/ui/bir-form-zoom-wrapper'
import birBg from '@/assets/bir2307-bg.png'
import {
  PAGE_W, PAGE_H,
  TIN_LETTER_SPACING, DATE_LETTER_SPACING, ZIP_LETTER_SPACING,
  FONT_SIZE_TIN, FONT_SIZE_DATE, FONT_SIZE_TEXT, FONT_SIZE_TABLE, FONT_SIZE_SIG,
  PERIOD_FROM_MM, PERIOD_FROM_DD, PERIOD_FROM_YYYY,
  PERIOD_TO_MM, PERIOD_TO_DD, PERIOD_TO_YYYY,
  PAYEE_TIN_SEGS, PAYEE_NAME, PAYEE_ADDRESS, PAYEE_ZIP, PAYEE_FOREIGN,
  PAYOR_TIN_SEGS, PAYOR_NAME, PAYOR_ADDRESS, PAYOR_ZIP,
  TABLE_A_Y, TABLE_B_Y, ROW_H, TABLE_COLS,
  PAYOR_SIG, PAYEE_SIG,
} from './fieldPositions'

/**
 * BIR Form 2307 — Jan 2018 ENCS v3
 * Background: actual BIR PDF. Data overlaid using shared field positions.
 */

function F({ x, y, w, h = 5.5, children, align, size = '2.5mm', bold, spacing }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}mm`,
        top: `${y}mm`,
        width: `${w}mm`,
        height: `${h}mm`,
        fontSize: size,
        fontFamily: 'Arial, sans-serif',
        fontWeight: bold ? 'bold' : 'normal',
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        overflow: 'hidden',
        lineHeight: '1',
        paddingLeft: align === 'right' ? '0' : '0.5mm',
        paddingRight: align === 'right' ? '0.5mm' : '0',
        letterSpacing: spacing || 'normal',
      }}
    >
      {children}
    </div>
  )
}

function TINSegments({ value, segs }) {
  const raw = Array.isArray(value)
    ? value.filter(Boolean).join('')
    : (value || '').replace(/[-\s]/g, '')
  const parts = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9), raw.slice(9)]

  return (
    <>
      {segs.map((seg, i) => (
        <F key={i} x={seg.x} y={seg.y} w={seg.w} h={seg.h} align="center" size={FONT_SIZE_TIN} spacing={TIN_LETTER_SPACING}>
          {parts[i] || ''}
        </F>
      ))}
    </>
  )
}

export function FormViewTab({ fd, bare }) {
  const padRows = (rows) => {
    const padded = [...(rows || [])]
    while (padded.length < 10) padded.push({})
    return padded.slice(0, 10)
  }
  const tableA = padRows(fd.table_a)
  const tableB = padRows(fd.table_b)

  const formatDateParts = (val) => {
    if (!val) return { mm: '', dd: '', yyyy: '' }
    if (val.includes('-')) {
      const [y, m, d] = val.split('-')
      return { mm: m || '', dd: d || '', yyyy: y || '' }
    }
    return { mm: '', dd: '', yyyy: '' }
  }
  const fromDate = formatDateParts(fd.period_from)
  const toDate = formatDateParts(fd.period_to)

  const COL = TABLE_COLS

  const renderTableRows = (rows, startY) =>
    rows.map((row, i) => {
      const y = startY + i * ROW_H
      return (
        <div key={i}>
          <F x={COL.nature.x} y={y} w={COL.nature.w} h={ROW_H} size={FONT_SIZE_TABLE}>{row.nature || ''}</F>
          <F x={COL.atc.x} y={y} w={COL.atc.w} h={ROW_H} size={FONT_SIZE_TABLE} align="center">{row.atc || ''}</F>
          <F x={COL.m1.x} y={y} w={COL.m1.w} h={ROW_H} size={FONT_SIZE_TABLE} align="right">{row.month1 || ''}</F>
          <F x={COL.m2.x} y={y} w={COL.m2.w} h={ROW_H} size={FONT_SIZE_TABLE} align="right">{row.month2 || ''}</F>
          <F x={COL.m3.x} y={y} w={COL.m3.w} h={ROW_H} size={FONT_SIZE_TABLE} align="right">{row.month3 || ''}</F>
          <F x={COL.total.x} y={y} w={COL.total.w} h={ROW_H} size={FONT_SIZE_TABLE} align="right">{row.total && row.total !== '0.00' ? row.total : ''}</F>
          <F x={COL.tax.x} y={y} w={COL.tax.w} h={ROW_H} size={FONT_SIZE_TABLE} align="right">{row.tax_withheld || ''}</F>
        </div>
      )
    })

  const renderTotalRow = (rows, startY) => {
    const y = startY + 10 * ROW_H
    const sum = (field) => {
      const s = rows.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0)
      return s ? s.toFixed(2) : ''
    }
    return (
      <div>
        <F x={COL.m1.x} y={y} w={COL.m1.w} h={ROW_H} size={FONT_SIZE_TABLE} align="right" bold>{sum('month1')}</F>
        <F x={COL.m2.x} y={y} w={COL.m2.w} h={ROW_H} size={FONT_SIZE_TABLE} align="right" bold>{sum('month2')}</F>
        <F x={COL.m3.x} y={y} w={COL.m3.w} h={ROW_H} size={FONT_SIZE_TABLE} align="right" bold>{sum('month3')}</F>
        <F x={COL.total.x} y={y} w={COL.total.w} h={ROW_H} size={FONT_SIZE_TABLE} align="right" bold>{sum('total')}</F>
        <F x={COL.tax.x} y={y} w={COL.tax.w} h={ROW_H} size={FONT_SIZE_TABLE} align="right" bold>{sum('tax_withheld')}</F>
      </div>
    )
  }

  const Wrapper = bare ? ({ children }) => <>{children}</> : BIRFormZoomWrapper

  return (
    <Wrapper>
      <div
        className="mx-auto print:shadow-none"
        style={{ width: `${PAGE_W}mm`, height: `${PAGE_H}mm`, position: 'relative', overflow: 'hidden' }}
      >
        <img src={birBg} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} draggable={false} />

        {/* Period */}
        <F x={PERIOD_FROM_MM.x} y={PERIOD_FROM_MM.y} w={PERIOD_FROM_MM.w} h={PERIOD_FROM_MM.h} align="center" size={FONT_SIZE_DATE} spacing={DATE_LETTER_SPACING}>{fromDate.mm}</F>
        <F x={PERIOD_FROM_DD.x} y={PERIOD_FROM_DD.y} w={PERIOD_FROM_DD.w} h={PERIOD_FROM_DD.h} align="center" size={FONT_SIZE_DATE} spacing={DATE_LETTER_SPACING}>{fromDate.dd}</F>
        <F x={PERIOD_FROM_YYYY.x} y={PERIOD_FROM_YYYY.y} w={PERIOD_FROM_YYYY.w} h={PERIOD_FROM_YYYY.h} align="center" size={FONT_SIZE_DATE} spacing={DATE_LETTER_SPACING}>{fromDate.yyyy}</F>
        <F x={PERIOD_TO_MM.x} y={PERIOD_TO_MM.y} w={PERIOD_TO_MM.w} h={PERIOD_TO_MM.h} align="center" size={FONT_SIZE_DATE} spacing={DATE_LETTER_SPACING}>{toDate.mm}</F>
        <F x={PERIOD_TO_DD.x} y={PERIOD_TO_DD.y} w={PERIOD_TO_DD.w} h={PERIOD_TO_DD.h} align="center" size={FONT_SIZE_DATE} spacing={DATE_LETTER_SPACING}>{toDate.dd}</F>
        <F x={PERIOD_TO_YYYY.x} y={PERIOD_TO_YYYY.y} w={PERIOD_TO_YYYY.w} h={PERIOD_TO_YYYY.h} align="center" size={FONT_SIZE_DATE} spacing={DATE_LETTER_SPACING}>{toDate.yyyy}</F>

        {/* Payee TIN */}
        <TINSegments value={fd.payee_tin} segs={PAYEE_TIN_SEGS} />

        {/* Payee Info */}
        <F x={PAYEE_NAME.x} y={PAYEE_NAME.y} w={PAYEE_NAME.w} h={PAYEE_NAME.h} size={FONT_SIZE_TEXT}>{fd.payee_name || ''}</F>
        <F x={PAYEE_ADDRESS.x} y={PAYEE_ADDRESS.y} w={PAYEE_ADDRESS.w} h={PAYEE_ADDRESS.h} size={FONT_SIZE_TEXT}>{fd.payee_address || ''}</F>
        <F x={PAYEE_ZIP.x} y={PAYEE_ZIP.y} w={PAYEE_ZIP.w} h={PAYEE_ZIP.h} align="center" size={FONT_SIZE_DATE} spacing={ZIP_LETTER_SPACING}>{fd.payee_zip_code || ''}</F>
        <F x={PAYEE_FOREIGN.x} y={PAYEE_FOREIGN.y} w={PAYEE_FOREIGN.w} h={PAYEE_FOREIGN.h} size={FONT_SIZE_TEXT}>{fd.payee_foreign_address || ''}</F>

        {/* Payor TIN */}
        <TINSegments value={fd.payor_tin} segs={PAYOR_TIN_SEGS} />

        {/* Payor Info */}
        <F x={PAYOR_NAME.x} y={PAYOR_NAME.y} w={PAYOR_NAME.w} h={PAYOR_NAME.h} size={FONT_SIZE_TEXT}>{fd.payor_name || ''}</F>
        <F x={PAYOR_ADDRESS.x} y={PAYOR_ADDRESS.y} w={PAYOR_ADDRESS.w} h={PAYOR_ADDRESS.h} size={FONT_SIZE_TEXT}>{fd.payor_address || ''}</F>
        <F x={PAYOR_ZIP.x} y={PAYOR_ZIP.y} w={PAYOR_ZIP.w} h={PAYOR_ZIP.h} align="center" size={FONT_SIZE_DATE} spacing={ZIP_LETTER_SPACING}>{fd.payor_zip_code || ''}</F>

        {/* Tables */}
        {renderTableRows(tableA, TABLE_A_Y)}
        {renderTotalRow(tableA, TABLE_A_Y)}
        {renderTableRows(tableB, TABLE_B_Y)}
        {renderTotalRow(tableB, TABLE_B_Y)}

        {/* Signatories */}
        <F x={PAYOR_SIG.x} y={PAYOR_SIG.y} w={PAYOR_SIG.w} h={PAYOR_SIG.h} align="center" size={FONT_SIZE_SIG}>{fd.payor_signatory_name || ''}</F>
        <F x={PAYEE_SIG.x} y={PAYEE_SIG.y} w={PAYEE_SIG.w} h={PAYEE_SIG.h} align="center" size={FONT_SIZE_SIG}>{fd.payee_signatory_name || ''}</F>
      </div>
    </Wrapper>
  )
}
