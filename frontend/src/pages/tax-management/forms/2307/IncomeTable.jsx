import { ATCDropdown } from './ATCDropdown'

/**
 * Income payment table for BIR 2307 Part III.
 * Exact proportions matching the official form:
 * - Col 1 (Nature): ~28%
 * - Col 2 (ATC): ~8%
 * - Col 3-5 (Month 1,2,3): ~13% each
 * - Col 6 (Total): ~12%
 * - Col 7 (Tax Withheld): ~13%
 */

const ROW_H = '22px'
const HEADER_FONT = 'text-[7px] font-bold text-center leading-tight'
const CELL_FONT = 'text-[8px]'
const NUM_INPUT = 'w-full h-full bg-transparent text-[8px] text-right px-1 tabular-nums focus:outline-none focus:bg-blue-50/40'
const TEXT_INPUT = 'w-full h-full bg-transparent text-[8px] px-1 focus:outline-none focus:bg-blue-50/40'

export function IncomeTable({ label, rows, onUpdateRow, columnTotal }) {
  return (
    <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '28%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '13%' }} />
        <col style={{ width: '13%' }} />
        <col style={{ width: '13%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '13%' }} />
      </colgroup>
      <thead>
        {/* Header row 1 */}
        <tr>
          <th rowSpan={2} className={`border border-black ${HEADER_FONT} px-1 align-middle`}>{label}</th>
          <th rowSpan={2} className={`border border-black ${HEADER_FONT} align-middle`}>ATC</th>
          <th colSpan={4} className={`border border-black ${HEADER_FONT} py-0.5`}>AMOUNT OF INCOME PAYMENTS</th>
          <th rowSpan={2} className={`border border-black ${HEADER_FONT} px-0.5 align-middle leading-[1.2]`}>Tax Withheld for the Quarter</th>
        </tr>
        {/* Header row 2 - month sub-headers */}
        <tr>
          <th className={`border border-black text-[6.5px] font-bold text-center py-0.5 leading-tight`}>1st Month of the Quarter</th>
          <th className={`border border-black text-[6.5px] font-bold text-center py-0.5 leading-tight`}>2nd Month of the Quarter</th>
          <th className={`border border-black text-[6.5px] font-bold text-center py-0.5 leading-tight`}>3rd Month of the Quarter</th>
          <th className={`border border-black text-[6.5px] font-bold text-center py-0.5 leading-tight`}>Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx} style={{ height: ROW_H }}>
            <td className="border border-black p-0">
              <input type="text" value={row.nature} onChange={e => onUpdateRow(idx, 'nature', e.target.value)} className={TEXT_INPUT} />
            </td>
            <td className="border border-black p-0">
              <ATCDropdown value={row.atc} onChange={val => onUpdateRow(idx, 'atc', val)} />
            </td>
            <td className="border border-black p-0">
              <input type="text" inputMode="decimal" value={row.month1} onChange={e => onUpdateRow(idx, 'month1', e.target.value)} className={NUM_INPUT} />
            </td>
            <td className="border border-black p-0">
              <input type="text" inputMode="decimal" value={row.month2} onChange={e => onUpdateRow(idx, 'month2', e.target.value)} className={NUM_INPUT} />
            </td>
            <td className="border border-black p-0">
              <input type="text" inputMode="decimal" value={row.month3} onChange={e => onUpdateRow(idx, 'month3', e.target.value)} className={NUM_INPUT} />
            </td>
            <td className="border border-black p-0 bg-gray-50">
              <input type="text" value={row.total && row.total !== '0.00' ? row.total : ''} readOnly tabIndex={-1}
                className="w-full h-full bg-transparent text-[8px] text-right px-1 tabular-nums text-gray-600" />
            </td>
            <td className="border border-black p-0">
              <input type="text" inputMode="decimal" value={row.tax_withheld} onChange={e => onUpdateRow(idx, 'tax_withheld', e.target.value)} className={NUM_INPUT} />
            </td>
          </tr>
        ))}
        {/* Total row */}
        <tr style={{ height: ROW_H }} className="bg-gray-50">
          <td className="border border-black px-2 text-[8px] font-bold">Total</td>
          <td className="border border-black" />
          <td className="border border-black text-[8px] font-bold text-right px-1 tabular-nums">
            {columnTotal('month1') !== '0.00' ? columnTotal('month1') : ''}
          </td>
          <td className="border border-black text-[8px] font-bold text-right px-1 tabular-nums">
            {columnTotal('month2') !== '0.00' ? columnTotal('month2') : ''}
          </td>
          <td className="border border-black text-[8px] font-bold text-right px-1 tabular-nums">
            {columnTotal('month3') !== '0.00' ? columnTotal('month3') : ''}
          </td>
          <td className="border border-black text-[8px] font-bold text-right px-1 tabular-nums">
            {columnTotal('total') !== '0.00' ? columnTotal('total') : ''}
          </td>
          <td className="border border-black text-[8px] font-bold text-right px-1 tabular-nums">
            {columnTotal('tax_withheld') !== '0.00' ? columnTotal('tax_withheld') : ''}
          </td>
        </tr>
      </tbody>
    </table>
  )
}
