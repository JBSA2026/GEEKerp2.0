import { BIRFormZoomWrapper } from '@/components/ui/bir-form-zoom-wrapper'
import birBgP1 from '@/assets/bir1604e-p1.png'
import birBgP2 from '@/assets/bir1604e-p2.png'
import {
  PAGE_W, PAGE_H,
  FONT_SIZE_TIN, FONT_SIZE_DATE, FONT_SIZE_TEXT, FONT_SIZE_TABLE, FONT_SIZE_SIG,
  TIN_LETTER_SPACING, ZIP_LETTER_SPACING, DATE_LETTER_SPACING, YEAR_LETTER_SPACING, RDO_LETTER_SPACING,
  TEXT_LETTER_SPACING, TABLE_LETTER_SPACING,
  YEAR_DIGITS, AMENDED_YES, AMENDED_NO, SHEETS_ATTACHED,
  TIN_SEGS, RDO_CODE, AGENT_NAME, ADDRESS_LINE1, ADDRESS_LINE2, ZIP_CODE,
  CAT_PRIVATE, CAT_GOVERNMENT, TOP_YES, TOP_NO,
  CONTACT_NUMBER, EMAIL_ADDRESS,
  SCHED1_START_Y, SCHED1_ROW_H, SCHED1_COLS,
  SCHED2_START_Y, SCHED2_ROW_H, SCHED2_COLS,
  SIGNATORY_LEFT, SIGNATORY_RIGHT,
  TAX_AGENT_ACCRED, ATTORNEY_ROLL, DATE_OF_ISSUE, DATE_OF_EXPIRY,
  P2_TIN, P2_AGENT_NAME,
  SCHED3_START_Y, SCHED3_ROW_H, SCHED3_COLS, SCHED3_DATA_ROWS,
  SCHED4_START_Y, SCHED4_ROW_H, SCHED4_COLS, SCHED4_DATA_ROWS,
} from './fieldPositions'

function F({ x, y, w, h = 5, children, align, size = FONT_SIZE_TEXT, bold, spacing }) {
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

function Checkbox({ x, y, w, h, checked }) {
  if (!checked) return null
  return (
    <F x={x} y={y} w={w} h={h} align="center" size="3mm" bold>
      ✓
    </F>
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

// ─── DEBUG: Set to true to force ALL fields visible for alignment tuning ─────
const DEBUG_ALL_FIELDS = true

const DEBUG_DATA = {
  year: '2026',
  amended_return: true, // shows BOTH checkboxes since we force them below
  sheets_attached: '3',
  tin: '123-456-789-00000',
  rdo_code: '049',
  agent_name: 'EXPEDIA SOLUTIONS SPECIALIST INC.',
  address: 'UG24 Cityland Pasongtamo Tower, Calle Estacion Corner Pasongtamo St., Pio Del Pilar, Makati City, Metro Manila',
  zip_code: '1230',
  category: 'Private', // will force BOTH checkboxes below
  top_withholding_agent: true, // will force BOTH checkboxes below
  contact_number: '02-8888-7777',
  email_address: 'tax@expedia-solutions.com.ph',
  signatory_name: 'JUAN MIGUEL DELA CRUZ',
  signatory_name_right: 'MARIA SANTOS REYES',
  tax_agent_accreditation: 'ACCRED-2026-001234',
  attorney_roll_number: 'ROLL-56789',
  date_of_issue: '01/15/2026',
  date_of_expiry: '12/31/2026',
  schedule1: [
    { date: '04/15/2026', bank: 'BPI Makati', tra: 'TRA-2026-Q1-001', taxes: '125000.00', penalties: '0.00', total: '125000.00' },
    { date: '07/15/2026', bank: 'BPI Makati', tra: 'TRA-2026-Q2-001', taxes: '148000.00', penalties: '0.00', total: '148000.00' },
    { date: '10/15/2026', bank: 'BPI Makati', tra: 'TRA-2026-Q3-001', taxes: '132000.00', penalties: '2500.00', total: '134500.00' },
    { date: '01/15/2027', bank: 'BPI Makati', tra: 'TRA-2026-Q4-001', taxes: '155000.00', penalties: '0.00', total: '155000.00' },
    { date: '', bank: '', tra: 'TOTAL', taxes: '560000.00', penalties: '2500.00', total: '562500.00' },
  ],
  schedule2: [
    { date: '02/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-01-001', taxes: '45000.00', penalties: '0.00', total: '45000.00' },
    { date: '03/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-02-001', taxes: '38000.00', penalties: '0.00', total: '38000.00' },
    { date: '04/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-03-001', taxes: '52000.00', penalties: '0.00', total: '52000.00' },
    { date: '05/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-04-001', taxes: '41000.00', penalties: '0.00', total: '41000.00' },
    { date: '06/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-05-001', taxes: '55000.00', penalties: '0.00', total: '55000.00' },
    { date: '07/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-06-001', taxes: '48000.00', penalties: '0.00', total: '48000.00' },
    { date: '08/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-07-001', taxes: '43000.00', penalties: '0.00', total: '43000.00' },
    { date: '09/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-08-001', taxes: '51000.00', penalties: '0.00', total: '51000.00' },
    { date: '10/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-09-001', taxes: '46000.00', penalties: '1500.00', total: '47500.00' },
    { date: '11/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-10-001', taxes: '58000.00', penalties: '0.00', total: '58000.00' },
    { date: '12/10/2026', bank: 'BDO Makati', tra: 'TRA-2026-11-001', taxes: '49000.00', penalties: '0.00', total: '49000.00' },
    { date: '01/10/2027', bank: 'BDO Makati', tra: 'TRA-2026-12-001', taxes: '62000.00', penalties: '0.00', total: '62000.00' },
    { date: '', bank: '', tra: 'TOTAL', taxes: '588000.00', penalties: '1500.00', total: '589500.00' },
  ],
  schedule3: [
    { seq: '1', tin: '123-456-789', name: 'ACME CORP', atc: 'WI010', income: '500000.00', tax_rate: '2%', tax_withheld: '10000.00' },
    { seq: '2', tin: '987-654-321', name: 'BETA INDUSTRIES INC', atc: 'WI020', income: '750000.00', tax_rate: '5%', tax_withheld: '37500.00' },
    { seq: '3', tin: '111-222-333', name: 'GAMMA SERVICES LLC', atc: 'WI030', income: '300000.00', tax_rate: '10%', tax_withheld: '30000.00' },
    { seq: '4', tin: '444-555-666', name: 'DELTA TRADING CO', atc: 'WI040', income: '120000.00', tax_rate: '15%', tax_withheld: '18000.00' },
    { seq: '5', tin: '777-888-999', name: 'EPSILON SOLUTIONS', atc: 'WI050', income: '200000.00', tax_rate: '1%', tax_withheld: '2000.00' },
  ],
  schedule4: [
    { seq: '1', tin: '321-654-987', name: 'GOV AGENCY A', atc: 'WE010', income_nature: 'Consulting', income_amount: '100000.00' },
    { seq: '2', tin: '654-987-321', name: 'GOV AGENCY B', atc: 'WE020', income_nature: 'Professional Fees', income_amount: '250000.00' },
    { seq: '3', tin: '147-258-369', name: 'GOV AGENCY C', atc: 'WE030', income_nature: 'Rental', income_amount: '180000.00' },
    { seq: '4', tin: '258-369-147', name: 'GOV AGENCY D', atc: 'WE040', income_nature: 'Commissions', income_amount: '90000.00' },
    { seq: '5', tin: '369-147-258', name: 'GOV AGENCY E', atc: 'WE050', income_nature: 'Service Fees', income_amount: '320000.00' },
  ],
}

export function FormViewTab1604E({ fd: rawFd, bare }) {
  const fd = DEBUG_ALL_FIELDS ? { ...DEBUG_DATA, ...rawFd, ...DEBUG_DATA } : rawFd
  const sched1 = DEBUG_ALL_FIELDS ? DEBUG_DATA.schedule1 : (fd.schedule1 || [])
  const sched2 = DEBUG_ALL_FIELDS ? DEBUG_DATA.schedule2 : (fd.schedule2 || [])
  const sched3 = DEBUG_ALL_FIELDS ? DEBUG_DATA.schedule3 : (fd.schedule3 || [])
  const sched4 = DEBUG_ALL_FIELDS ? DEBUG_DATA.schedule4 : (fd.schedule4 || [])

  const renderScheduleRows = (rows, startY, rowH, cols, maxRows) => {
    const padded = [...rows]
    while (padded.length < maxRows) padded.push({})
    return padded.slice(0, maxRows).map((row, i) => {
      const y = startY + i * rowH
      return (
        <div key={i}>
          {Object.entries(cols).map(([key, col]) => {
            const isNumeric = key.includes('tax') || key.includes('total') || key.includes('income') || key.includes('penalties') || key.includes('amount')
            return (
              <F key={key} x={col.x} y={y} w={col.w} h={rowH} size={FONT_SIZE_TABLE} align={isNumeric ? 'right' : 'left'} spacing={TABLE_LETTER_SPACING}>
                {row[key] || ''}
              </F>
            )
          })}
        </div>
      )
    })
  }

  const content = (
    <>
      {/* ═══ PAGE 1 ═══ */}
      <div
        className="mx-auto print:shadow-none"
        style={{ width: `${PAGE_W}mm`, height: `${PAGE_H}mm`, position: 'relative', overflow: 'hidden', marginBottom: '10mm' }}
      >
        <img src={birBgP1} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} draggable={false} />

        {/* Year — only last 2 digits (20 is pre-printed) */}
        <F x={YEAR_DIGITS.x} y={YEAR_DIGITS.y} w={YEAR_DIGITS.w} h={YEAR_DIGITS.h} align="center" size={FONT_SIZE_DATE} spacing={YEAR_LETTER_SPACING}>
          {fd.year ? String(fd.year).slice(-2) : ''}
        </F>

        {/* Amended Return — DEBUG: both shown */}
        <Checkbox x={AMENDED_YES.x} y={AMENDED_YES.y} w={AMENDED_YES.w} h={AMENDED_YES.h} checked={DEBUG_ALL_FIELDS || fd.amended_return === true} />
        <Checkbox x={AMENDED_NO.x} y={AMENDED_NO.y} w={AMENDED_NO.w} h={AMENDED_NO.h} checked={DEBUG_ALL_FIELDS || fd.amended_return !== true} />

        {/* Sheets Attached */}
        <F x={SHEETS_ATTACHED.x} y={SHEETS_ATTACHED.y} w={SHEETS_ATTACHED.w} h={SHEETS_ATTACHED.h} align="center" spacing={TEXT_LETTER_SPACING}>
          {fd.sheets_attached || ''}
        </F>

        {/* TIN */}
        <TINSegments value={fd.tin} segs={TIN_SEGS} />

        {/* RDO Code */}
        <F x={RDO_CODE.x} y={RDO_CODE.y} w={RDO_CODE.w} h={RDO_CODE.h} align="center" spacing={RDO_LETTER_SPACING}>
          {fd.rdo_code || ''}
        </F>

        {/* Withholding Agent Name */}
        <F x={AGENT_NAME.x} y={AGENT_NAME.y} w={AGENT_NAME.w} h={AGENT_NAME.h} spacing={TEXT_LETTER_SPACING}>
          {fd.agent_name || ''}
        </F>

        {/* Address */}
        <F x={ADDRESS_LINE1.x} y={ADDRESS_LINE1.y} w={ADDRESS_LINE1.w} h={ADDRESS_LINE1.h} spacing={TEXT_LETTER_SPACING}>
          {fd.address || ''}
        </F>

        {/* ZIP Code */}
        <F x={ZIP_CODE.x} y={ZIP_CODE.y} w={ZIP_CODE.w} h={ZIP_CODE.h} align="center" spacing={ZIP_LETTER_SPACING}>
          {fd.zip_code || ''}
        </F>

        {/* Category — DEBUG: both shown */}
        <Checkbox x={CAT_PRIVATE.x} y={CAT_PRIVATE.y} w={CAT_PRIVATE.w} h={CAT_PRIVATE.h} checked={DEBUG_ALL_FIELDS || fd.category === 'Private'} />
        <Checkbox x={CAT_GOVERNMENT.x} y={CAT_GOVERNMENT.y} w={CAT_GOVERNMENT.w} h={CAT_GOVERNMENT.h} checked={DEBUG_ALL_FIELDS || fd.category === 'Government'} />

        {/* Top Withholding Agent — DEBUG: both shown */}
        <Checkbox x={TOP_YES.x} y={TOP_YES.y} w={TOP_YES.w} h={TOP_YES.h} checked={DEBUG_ALL_FIELDS || fd.top_withholding_agent === true} />
        <Checkbox x={TOP_NO.x} y={TOP_NO.y} w={TOP_NO.w} h={TOP_NO.h} checked={DEBUG_ALL_FIELDS || fd.top_withholding_agent !== true} />

        {/* Contact / Email */}
        <F x={CONTACT_NUMBER.x} y={CONTACT_NUMBER.y} w={CONTACT_NUMBER.w} h={CONTACT_NUMBER.h} spacing={TEXT_LETTER_SPACING}>
          {fd.contact_number || ''}
        </F>
        <F x={EMAIL_ADDRESS.x} y={EMAIL_ADDRESS.y} w={EMAIL_ADDRESS.w} h={EMAIL_ADDRESS.h} spacing={TEXT_LETTER_SPACING}>
          {fd.email_address || ''}
        </F>

        {/* Schedule 1: Quarterly Remittances (4 quarters + TOTAL = 5 rows) */}
        {renderScheduleRows(sched1, SCHED1_START_Y, SCHED1_ROW_H, SCHED1_COLS, 5)}

        {/* Schedule 2: Monthly Remittances (12 months + TOTAL = 13 rows) */}
        {renderScheduleRows(sched2, SCHED2_START_Y, SCHED2_ROW_H, SCHED2_COLS, 13)}

        {/* Signatory — For Individual (left) */}
        <F x={SIGNATORY_LEFT.x} y={SIGNATORY_LEFT.y} w={SIGNATORY_LEFT.w} h={SIGNATORY_LEFT.h} align="center" size={FONT_SIZE_SIG} spacing={TEXT_LETTER_SPACING}>
          {fd.signatory_name || ''}
        </F>

        {/* Signatory — For Non-Individual (right) */}
        <F x={SIGNATORY_RIGHT.x} y={SIGNATORY_RIGHT.y} w={SIGNATORY_RIGHT.w} h={SIGNATORY_RIGHT.h} align="center" size={FONT_SIZE_SIG} spacing={TEXT_LETTER_SPACING}>
          {fd.signatory_name_right || ''}
        </F>

        {/* Tax Agent Info */}
        <F x={TAX_AGENT_ACCRED.x} y={TAX_AGENT_ACCRED.y} w={TAX_AGENT_ACCRED.w} h={TAX_AGENT_ACCRED.h} size={FONT_SIZE_SIG} spacing={TEXT_LETTER_SPACING}>
          {fd.tax_agent_accreditation || ''}
        </F>
        <F x={ATTORNEY_ROLL.x} y={ATTORNEY_ROLL.y} w={ATTORNEY_ROLL.w} h={ATTORNEY_ROLL.h} size={FONT_SIZE_SIG} spacing={TEXT_LETTER_SPACING}>
          {fd.attorney_roll_number || ''}
        </F>
        <F x={DATE_OF_ISSUE.x} y={DATE_OF_ISSUE.y} w={DATE_OF_ISSUE.w} h={DATE_OF_ISSUE.h} align="center" size={FONT_SIZE_SIG} spacing={TEXT_LETTER_SPACING}>
          {fd.date_of_issue || ''}
        </F>
        <F x={DATE_OF_EXPIRY.x} y={DATE_OF_EXPIRY.y} w={DATE_OF_EXPIRY.w} h={DATE_OF_EXPIRY.h} align="center" size={FONT_SIZE_SIG} spacing={TEXT_LETTER_SPACING}>
          {fd.date_of_expiry || ''}
        </F>
      </div>

      {/* ═══ PAGE 2 ═══ */}
      <div
        className="mx-auto print:shadow-none"
        style={{ width: `${PAGE_W}mm`, height: `${PAGE_H}mm`, position: 'relative', overflow: 'hidden' }}
      >
        <img src={birBgP2} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} draggable={false} />

        {/* TIN at top of page 2 */}
        <F x={P2_TIN.x} y={P2_TIN.y} w={P2_TIN.w} h={P2_TIN.h} size={FONT_SIZE_TIN} spacing={TIN_LETTER_SPACING}>
          {fd.tin || ''}
        </F>

        {/* Withholding Agent's Name at top of page 2 */}
        <F x={P2_AGENT_NAME.x} y={P2_AGENT_NAME.y} w={P2_AGENT_NAME.w} h={P2_AGENT_NAME.h} size={FONT_SIZE_TEXT} spacing={TEXT_LETTER_SPACING}>
          {fd.agent_name || ''}
        </F>

        {/* Schedule 3: Alphalist – Expanded Withholding Tax */}
        {renderScheduleRows(sched3, SCHED3_START_Y, SCHED3_ROW_H, SCHED3_COLS, SCHED3_DATA_ROWS)}

        {/* Schedule 4: Other Payees Exempt from WHT */}
        {renderScheduleRows(sched4, SCHED4_START_Y, SCHED4_ROW_H, SCHED4_COLS, SCHED4_DATA_ROWS)}
      </div>
    </>
  )

  if (bare) return content
  return <BIRFormZoomWrapper>{content}</BIRFormZoomWrapper>
}
