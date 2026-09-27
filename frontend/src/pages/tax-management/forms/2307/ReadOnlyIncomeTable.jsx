const HEADER_FONT = { fontSize: '2mm', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.3' }
const CELL_FONT = { fontSize: '2.2mm' }
const ROW_H = '5.5mm'

export function ReadOnlyIncomeTable({ label, rows }) {
  const columnTotal = (field) => {
    return (rows || []).reduce((sum, row) => sum + (parseFloat(row[field]) || 0), 0).toFixed(2)
  }

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
        <tr>
          <th rowSpan={2} className="border border-black px-[1mm] align-middle" style={HEADER_FONT}>{label}</th>
          <th rowSpan={2} className="border border-black align-middle" style={HEADER_FONT}>ATC</th>
          <th colSpan={4} className="border border-black py-[0.5mm]" style={HEADER_FONT}>AMOUNT OF INCOME PAYMENTS</th>
          <th rowSpan={2} className="border border-black px-[0.5mm] align-middle" style={{ ...HEADER_FONT, lineHeight: '1.2' }}>Tax Withheld for the Quarter</th>
        </tr>
        <tr>
          <th className="border border-black py-[0.5mm]" style={{ fontSize: '1.8mm', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.2' }}>1st Month of the Quarter</th>
          <th className="border border-black py-[0.5mm]" style={{ fontSize: '1.8mm', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.2' }}>2nd Month of the Quarter</th>
          <th className="border border-black py-[0.5mm]" style={{ fontSize: '1.8mm', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.2' }}>3rd Month of the Quarter</th>
          <th className="border border-black py-[0.5mm]" style={{ fontSize: '1.8mm', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.2' }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {(rows || []).map((row, idx) => (
          <tr key={idx} style={{ height: ROW_H }}>
            <td className="border border-black p-0 px-[1mm]" style={CELL_FONT}>{row.nature}</td>
            <td className="border border-black p-0 px-[0.5mm] text-center" style={CELL_FONT}>{row.atc}</td>
            <td className="border border-black p-0 px-[1mm] text-right tabular-nums" style={CELL_FONT}>{row.month1}</td>
            <td className="border border-black p-0 px-[1mm] text-right tabular-nums" style={CELL_FONT}>{row.month2}</td>
            <td className="border border-black p-0 px-[1mm] text-right tabular-nums" style={CELL_FONT}>{row.month3}</td>
            <td className="border border-black p-0 px-[1mm] text-right tabular-nums bg-gray-50" style={CELL_FONT}>
              {row.total && row.total !== '0.00' ? row.total : ''}
            </td>
            <td className="border border-black p-0 px-[1mm] text-right tabular-nums" style={CELL_FONT}>{row.tax_withheld}</td>
          </tr>
        ))}
        <tr style={{ height: ROW_H }} className="bg-gray-50">
          <td className="border border-black px-[2mm] font-bold" style={CELL_FONT}>Total</td>
          <td className="border border-black" />
          <td className="border border-black font-bold text-right px-[1mm] tabular-nums" style={CELL_FONT}>
            {columnTotal('month1') !== '0.00' ? columnTotal('month1') : ''}
          </td>
          <td className="border border-black font-bold text-right px-[1mm] tabular-nums" style={CELL_FONT}>
            {columnTotal('month2') !== '0.00' ? columnTotal('month2') : ''}
          </td>
          <td className="border border-black font-bold text-right px-[1mm] tabular-nums" style={CELL_FONT}>
            {columnTotal('month3') !== '0.00' ? columnTotal('month3') : ''}
          </td>
          <td className="border border-black font-bold text-right px-[1mm] tabular-nums" style={CELL_FONT}>
            {columnTotal('total') !== '0.00' ? columnTotal('total') : ''}
          </td>
          <td className="border border-black font-bold text-right px-[1mm] tabular-nums" style={CELL_FONT}>
            {columnTotal('tax_withheld') !== '0.00' ? columnTotal('tax_withheld') : ''}
          </td>
        </tr>
      </tbody>
    </table>
  )
}
