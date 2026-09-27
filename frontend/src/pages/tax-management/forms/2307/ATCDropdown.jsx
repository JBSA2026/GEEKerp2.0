import { useState, useRef, useEffect } from 'react'

// Common ATC codes for expanded withholding tax
const ATC_CODES = [
  { code: 'WI010', desc: 'Professional fees (Individual, ≤P3M)' },
  { code: 'WI011', desc: 'Professional fees (Individual, >P3M/VAT reg)' },
  { code: 'WC010', desc: 'Professional fees (Corporation, ≤P720K)' },
  { code: 'WC011', desc: 'Professional fees (Corporation, >P720K)' },
  { code: 'WI020', desc: 'Entertainers/performers (Individual, ≤P3M)' },
  { code: 'WI021', desc: 'Entertainers/performers (Individual, >P3M)' },
  { code: 'WC020', desc: 'Entertainers/performers (Corporation, ≤P720K)' },
  { code: 'WC021', desc: 'Entertainers/performers (Corporation, >P720K)' },
  { code: 'WI030', desc: 'Athletes/jockeys (Individual, ≤P3M)' },
  { code: 'WI031', desc: 'Athletes/jockeys (Individual, >P3M)' },
  { code: 'WC030', desc: 'Athletes/jockeys (Corporation, ≤P720K)' },
  { code: 'WC031', desc: 'Athletes/jockeys (Corporation, >P720K)' },
  { code: 'WI040', desc: 'Directors/producers (Individual)' },
  { code: 'WI041', desc: 'Directors/producers (Individual, >P3M)' },
  { code: 'WI050', desc: 'Management consultants (Individual, ≤P3M)' },
  { code: 'WI051', desc: 'Management consultants (Individual, >P3M)' },
  { code: 'WC050', desc: 'Minerals/quarry purchases (Corporation, ≤P720K)' },
  { code: 'WC051', desc: 'Minerals/quarry purchases (Corporation, >P720K)' },
  { code: 'WI060', desc: 'Bookkeeping agents (Individual, ≤P3M)' },
  { code: 'WI061', desc: 'Bookkeeping agents (Individual, >P3M)' },
  { code: 'WC060', desc: 'Bookkeeping agents (Corporation, ≤P720K)' },
  { code: 'WC061', desc: 'Bookkeeping agents (Corporation, >P720K)' },
  { code: 'WI070', desc: 'Insurance agents (Individual, ≤P3M)' },
  { code: 'WI071', desc: 'Insurance agents (Individual, >P3M)' },
  { code: 'WC070', desc: 'Insurance agents (Corporation, ≤P720K)' },
  { code: 'WC071', desc: 'Insurance agents (Corporation, >P720K)' },
  { code: 'WI080', desc: 'Talent fees (Individual, ≤P3M)' },
  { code: 'WI081', desc: 'Talent fees (Individual, >P3M)' },
  { code: 'WC080', desc: 'Talent fees (Corporation, ≤P720K)' },
  { code: 'WC081', desc: 'Talent fees (Corporation, >P720K)' },
  { code: 'WI090', desc: 'Directors fees (non-employee, Individual, ≤P3M)' },
  { code: 'WI091', desc: 'Directors fees (non-employee, Individual, >P3M)' },
  { code: 'WI100', desc: 'Rentals (Individual, real/personal property)' },
  { code: 'WC100', desc: 'Rentals (Corporation, real/personal property)' },
  { code: 'WI110', desc: 'Cinematographic film rentals (Individual)' },
  { code: 'WC110', desc: 'Cinematographic film rentals (Corporation)' },
  { code: 'WI120', desc: 'Income payments to certain contractors' },
  { code: 'WC120', desc: 'Income payments to certain contractors' },
  { code: 'WI130', desc: 'Income to beneficiaries of estates/trusts' },
  { code: 'WI139', desc: 'Customs/real estate brokers (Individual, ≤P3M)' },
  { code: 'WI140', desc: 'Customs/real estate brokers (Individual, >P3M)' },
  { code: 'WC139', desc: 'Customs/real estate brokers (Corporation, ≤P720K)' },
  { code: 'WC140', desc: 'Customs/real estate brokers (Corporation, >P720K)' },
  { code: 'WI151', desc: 'Medical practitioners (Individual, ≤P3M)' },
  { code: 'WI150', desc: 'Medical practitioners (Individual, >P3M)' },
  { code: 'WC151', desc: 'Medical practitioners (Corporation, ≤P720K)' },
  { code: 'WC150', desc: 'Medical practitioners (Corporation, >P720K)' },
  { code: 'WI152', desc: 'Income payments by GPPPs to partners (Individual)' },
  { code: 'WI153', desc: 'Income payments by GPPPs to partners (Individual, >P720K)' },
  { code: 'WI156', desc: 'Credit card companies (Individual)' },
  { code: 'WC156', desc: 'Credit card companies (Corporation)' },
  { code: 'WI157', desc: 'GOCCs to local/resident suppliers (Individual)' },
  { code: 'WC157', desc: 'GOCCs to local/resident suppliers (Corporation)' },
  { code: 'WI158', desc: 'Top withholding agents - local supplier (Individual)' },
  { code: 'WC158', desc: 'Top withholding agents - local supplier (Corporation)' },
  { code: 'WI159', desc: 'Additional income by gov\'t (Individual)' },
  { code: 'WI160', desc: 'Top WHT agents - other rates (Individual)' },
  { code: 'WC160', desc: 'Top WHT agents - other rates (Corporation)' },
  { code: 'WI515', desc: 'Commissions/rebates (Individual, >P3M)' },
  { code: 'WI516', desc: 'Commissions/rebates (Individual, >P720K)' },
  { code: 'WC515', desc: 'Commissions/rebates (Corporation, >P720K)' },
  { code: 'WC516', desc: 'Commissions/rebates (Corporation, >P720K)' },
  { code: 'WI530', desc: 'Embalmers/funeral parlors (Individual)' },
  { code: 'WI535', desc: 'Pre-need companies to funeral parlors' },
  { code: 'WI540', desc: 'Tolling fees to refineries' },
  { code: 'WI610', desc: 'Agricultural suppliers (Individual)' },
  { code: 'WC610', desc: 'Agricultural suppliers (Corporation)' },
  { code: 'WI630', desc: 'Minerals/quarry - Bangko Sentral (Individual)' },
  { code: 'WC630', desc: 'Minerals/quarry - Bangko Sentral (Corporation)' },
  { code: 'WI632', desc: 'Minerals - BSP gold miners (Individual)' },
  { code: 'WC632', desc: 'Minerals - BSP gold miners (Corporation)' },
  { code: 'WI640', desc: 'Gov\'t to local suppliers (Individual)' },
  { code: 'WC640', desc: 'Gov\'t to local suppliers (Corporation)' },
  { code: 'WI650', desc: 'MERALCO refund - active (Individual)' },
  { code: 'WC650', desc: 'MERALCO refund - active (Corporation)' },
  { code: 'WI651', desc: 'MERALCO refund - terminated (Individual)' },
  { code: 'WC651', desc: 'MERALCO refund - terminated (Corporation)' },
  { code: 'WI660', desc: 'Meter deposit refund - Residential ≤200kwh (Individual)' },
  { code: 'WC660', desc: 'Meter deposit refund - Residential ≤200kwh (Corporation)' },
  { code: 'WI661', desc: 'Meter deposit refund - Non-Residential >200kwh (Individual)' },
  { code: 'WC661', desc: 'Meter deposit refund - Non-Residential >200kwh (Corporation)' },
  { code: 'WI662', desc: 'Meter deposit refund - Residential >200kwh (Individual)' },
  { code: 'WC662', desc: 'Meter deposit refund - Residential >200kwh (Corporation)' },
  { code: 'WI663', desc: 'Meter deposit refund - Non-Residential >200kwh DU (Individual)' },
  { code: 'WC663', desc: 'Meter deposit refund - Non-Residential >200kwh DU (Corporation)' },
  { code: 'WI680', desc: 'Political parties and candidates (Individual)' },
  { code: 'WC680', desc: 'Political parties and candidates (Corporation)' },
  { code: 'WC690', desc: 'REIT income payments' },
  { code: 'WI710', desc: 'Interest from debt instruments (Individual)' },
  { code: 'WC710', desc: 'Interest from debt instruments (Corporation)' },
  { code: 'WI720', desc: 'Locally produced raw sugar - 1.50% (Individual)' },
  { code: 'WC720', desc: 'Locally produced raw sugar - 1.50% (Corporation)' },
  { code: 'WI555', desc: 'Sale of Real Property - 3% (Individual)' },
  { code: 'WC555', desc: 'Sale of Real Property - 3% (Corporation)' },
  { code: 'WI556', desc: 'Sale of Real Property - 5% (Individual)' },
  { code: 'WC556', desc: 'Sale of Real Property - 5% (Corporation)' },
  { code: 'WI557', desc: 'Sale of Real Property - 5% (Individual)' },
  { code: 'WC557', desc: 'Sale of Real Property - 5% (Corporation)' },
  { code: 'WI558', desc: 'Sale of Real Property - 6% (Individual)' },
  { code: 'WC558', desc: 'Sale of Real Property - 6% (Corporation)' },
  // Business tax (Section B)
  { code: 'WB080', desc: 'VAT exempt - Sec.109BB creditable-Government WHT' },
  { code: 'WB082', desc: 'VAT exempt - Sec.109BB creditable-Private WHT' },
  { code: 'WV012', desc: 'VAT on Purchases of Goods (waiver of privilege)' },
  { code: 'WV022', desc: 'VAT on Purchases of Services (waiver of privilege)' },
  { code: 'WB030', desc: 'Tax on Carriers and Keepers of Garages' },
  { code: 'WB040', desc: 'Franchise Tax on Gas and Utilities' },
  { code: 'WB050', desc: 'Franchise Tax on radio/TV broadcasting' },
  { code: 'WB070', desc: 'Tax on Life Insurance Premiums' },
  { code: 'WB090', desc: 'Tax on Overseas Dispatch/Conversation' },
  { code: 'WB103', desc: 'Royalties/profits from exchange (7%)' },
  { code: 'WB104', desc: 'Net trading gains on foreign currency/debt (7%)' },
  { code: 'WB108', desc: 'Non-Bank Financial - maturity ≤5 years (5%)' },
  { code: 'WB109', desc: 'Non-Bank Financial - maturity >5 years (1%)' },
  { code: 'WB110', desc: 'Non-Bank Financial - other items (5%)' },
  { code: 'WB121', desc: 'Agents of Foreign Insurance - Owner of Property' },
  { code: 'WB130', desc: 'Tax on International Carriers' },
  { code: 'WB140', desc: 'Tax on Cockpits' },
  { code: 'WB150', desc: 'Tax on amusement places, cabarets, bars, karaoke' },
  { code: 'WB160', desc: 'Tax on Boxing exhibitions' },
  { code: 'WB170', desc: 'Tax on Professional basketball games' },
  { code: 'WB180', desc: 'Tax on jai-alai and race tracks' },
  { code: 'WB200', desc: 'Tax on sale/barter/exchange of stocks' },
  { code: 'WB201', desc: 'Shares of stock - Not over 25% (4%)' },
  { code: 'WB202', desc: 'Shares of stock - Over 25% but ≤33 1/3% (2%)' },
  { code: 'WB203', desc: 'Shares of stock - Over 33 1/3% (1%)' },
  { code: 'WB120', desc: 'Business Tax on Agents of Foreign Insurance - Insurance Age' },
  { code: 'WB301', desc: 'Bank lending - maturity ≤5 years (5%)' },
  { code: 'WB303', desc: 'Bank lending - maturity >5 years (1%)' },
  { code: 'WB102', desc: 'Dividends/equity shares/net income of subsidiaries (0%)' },
]

export function ATCDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const filtered = ATC_CODES.filter(c =>
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.desc.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20)

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setSearch(e.target.value) }}
        onFocus={() => setOpen(true)}
        className="w-full bg-transparent text-[8px] text-center px-0.5 py-0.5 focus:outline-none focus:bg-blue-50"
        placeholder="ATC"
      />
      {open && (
        <div className="absolute top-full left-0 z-[100] w-[280px] max-h-[200px] overflow-y-auto bg-white border border-gray-300 shadow-lg rounded text-[8px]">
          <div className="sticky top-0 bg-white border-b border-gray-200 p-1">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-[8px] focus:outline-none"
              placeholder="Search ATC code or description..."
              autoFocus
            />
          </div>
          {filtered.map(c => (
            <button
              key={c.code}
              type="button"
              className="w-full text-left px-2 py-1 hover:bg-blue-50 flex items-center gap-2 border-b border-gray-100 last:border-0"
              onClick={() => { onChange(c.code); setOpen(false); setSearch('') }}
            >
              <span className="font-mono font-bold text-[8px] w-[40px] shrink-0">{c.code}</span>
              <span className="text-[7px] text-gray-600 truncate">{c.desc}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-2 text-gray-500 text-[8px]">No matching ATC codes</p>
          )}
        </div>
      )}
    </div>
  )
}

// Export the full list for reference viewing
export { ATC_CODES }
