import { cn } from '@/lib/utils'

function money(v) {
  const n = parseFloat(v)
  if (!n || isNaN(n)) return '₱0.00'
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Field({ label, value, mono, className }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-medium text-[var(--color-muted-fg)] uppercase tracking-wide">{label}</p>
      <p className={cn('text-sm mt-0.5', mono && 'font-mono', !value && 'text-[var(--color-muted-fg)] italic')}>
        {value || '—'}
      </p>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">{title}</h3>
      {children}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function FormDetailsTab({ form }) {
  if (!form) return null

  const fd = form.form_data || {}
  const formType = form.form_type || ''

  return (
    <div className="space-y-5 max-w-4xl p-6">
      {/* Period & Status */}
      <Section title="Filing Period">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Form Type" value={formType} />
          <Field label="Entity" value={form.entity} />
          <Field label="Period From" value={form.period_from} />
          <Field label="Period To" value={form.period_to} />
        </div>
        {form.form_code && (
          <Field label="Form Code" value={form.form_code} mono />
        )}
      </Section>

      {/* Payor/Payee — for forms that have them */}
      {(form.payor_name || fd.payor_name) && (
        <Section title="Payor (Withholding Agent)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="TIN" value={form.payor_tin || fd.payor_tin} mono />
            <Field label="ZIP Code" value={form.payor_zip_code || fd.payor_zip_code} />
          </div>
          <Field label="Registered Name" value={form.payor_name || fd.payor_name} />
          <Field label="Address" value={form.payor_address || fd.payor_address} />
          {(form.payor_signatory_name || fd.payor_signatory_name) && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--color-border)]">
              <Field label="Signatory" value={form.payor_signatory_name || fd.payor_signatory_name} />
              <Field label="Title / TIN" value={form.payor_signatory_title_tin || fd.payor_signatory_title_tin} />
            </div>
          )}
        </Section>
      )}

      {(form.payee_name || fd.payee_name) && (
        <Section title="Payee (Income Recipient)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="TIN" value={form.payee_tin || fd.payee_tin} mono />
            <Field label="ZIP Code" value={form.payee_zip_code || fd.payee_zip_code} />
          </div>
          <Field label="Registered Name" value={form.payee_name || fd.payee_name} />
          <Field label="Address" value={form.payee_address || fd.payee_address} />
          {fd.payee_foreign_address && (
            <Field label="Foreign Address" value={fd.payee_foreign_address} />
          )}
          {(form.payee_signatory_name || fd.payee_signatory_name) && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--color-border)]">
              <Field label="Signatory" value={form.payee_signatory_name || fd.payee_signatory_name} />
              <Field label="Title / TIN" value={form.payee_signatory_title_tin || fd.payee_signatory_title_tin} />
            </div>
          )}
        </Section>
      )}

      {/* Form-specific data sections */}
      {formType === '2307' && <Details2307 fd={fd} />}
      {formType === '0619E' && <Details0619E fd={fd} />}
      {formType === '1601C' && <Details1601C fd={fd} />}
      {formType === '1600VT' && <Details1600VT fd={fd} />}
      {formType === '1601EQ' && <Details1601EQ fd={fd} />}
      {formType === '2550Q' && <Details2550Q fd={fd} />}
      {formType === '1702Q' && <Details1702Q fd={fd} />}
      {formType === '1702' && <Details1702 fd={fd} />}
      {formType === '1604E' && <Details1604E fd={fd} />}
      {formType === '2316' && <Details2316 fd={fd} />}
      {formType === '0605' && <Details0605 fd={fd} />}

      {/* Meta */}
      <Section title="Record Information">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Status" value={form.status} />
          <Field label="Created" value={form.created_at ? new Date(form.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : null} />
          <Field label="Last Updated" value={form.updated_at ? new Date(form.updated_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : null} />
          <Field label="Finalized" value={form.finalized_at ? new Date(form.finalized_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : null} />
        </div>
      </Section>
    </div>
  )
}

// ─── Form-Specific Detail Components ────────────────────────────────────────

function TaxTable({ title, rows, columns }) {
  if (!rows || !rows.some(r => r.nature || r.atc || r.description)) return null
  const filteredRows = rows.filter(r => r.nature || r.atc || r.description)

  return (
    <Section title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-[var(--color-muted-fg)]">
              {columns.map(col => (
                <th key={col.key} className={cn('py-1.5 px-2', col.align === 'right' ? 'text-right' : 'text-left')}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100">
                {columns.map(col => (
                  <td key={col.key} className={cn('py-1.5 px-2 tabular-nums', col.align === 'right' && 'text-right', col.money && 'font-medium')}>
                    {col.money ? money(r[col.key]) : (r[col.key] || '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold border-t">
              <td colSpan={columns.length - 1} className="py-1.5 px-2">Total</td>
              <td className="py-1.5 px-2 text-right tabular-nums">
                {money(filteredRows.reduce((s, r) => s + (parseFloat(r.tax_withheld || r.amount || 0)), 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  )
}

function Details2307({ fd }) {
  const tableACols = [
    { key: 'nature', label: 'Nature of Payment', align: 'left' },
    { key: 'atc', label: 'ATC', align: 'left' },
    { key: 'month1', label: '1st Month', align: 'right' },
    { key: 'month2', label: '2nd Month', align: 'right' },
    { key: 'month3', label: '3rd Month', align: 'right' },
    { key: 'total', label: 'Total', align: 'right' },
    { key: 'tax_withheld', label: 'Tax Withheld', align: 'right', money: true },
  ]

  return (
    <>
      <TaxTable title="Table A — Expanded Withholding Tax" rows={fd.table_a} columns={tableACols} />
      <TaxTable title="Table B — Business Tax (VAT/Percentage)" rows={fd.table_b} columns={tableACols} />
      {fd.money_payments?.length > 0 && (
        <Section title="Money Payments Made">
          <div className="space-y-1.5">
            {fd.money_payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-xs">
                <div>
                  <p className="font-medium">{p.description}</p>
                  <p className="text-[var(--color-muted-fg)]">{p.date} • Check: {p.check_no}</p>
                </div>
                <p className="font-semibold tabular-nums">{money(p.amount)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

function Details0619E({ fd }) {
  return (
    <Section title="Tax Remittance Summary">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Total Tax Base" value={money(fd.total_compensation || fd.total_tax_base)} />
        <Field label="Tax Withheld/Due" value={money(fd.tax_due || fd.total_amount_remitted || fd.tax_withheld)} />
        <Field label="Penalties/Surcharges" value={money(fd.penalties || fd.surcharges)} />
        <Field label="Total Amount Remitted" value={money(fd.total_amount_remitted || fd.total_amount_due)} />
        <Field label="ATC Code" value={fd.atc_code || fd.atc} />
      </div>
    </Section>
  )
}

function Details1601C({ fd }) {
  return (
    <Section title="Compensation Tax Summary">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Total Compensation" value={money(fd.total_compensation)} />
        <Field label="Tax Withheld" value={money(fd.tax_withheld || fd.total_tax_withheld)} />
        <Field label="Total Employees" value={fd.total_employees} />
        <Field label="Adjustment" value={money(fd.adjustment)} />
        <Field label="Total Amount Remitted" value={money(fd.total_amount_remitted)} />
      </div>
    </Section>
  )
}

function Details1600VT({ fd }) {
  return (
    <Section title="VAT Withholding Summary">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Total Purchases (VATable)" value={money(fd.total_purchases || fd.total_tax_base)} />
        <Field label="VAT Withheld" value={money(fd.vat_withheld || fd.tax_due)} />
        <Field label="Total Amount Remitted" value={money(fd.total_amount_remitted)} />
        <Field label="Number of Payees" value={fd.number_of_payees} />
      </div>
    </Section>
  )
}

function Details1601EQ({ fd }) {
  return (
    <Section title="Quarterly EWT Summary">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Total Tax Base" value={money(fd.total_tax_base)} />
        <Field label="Tax This Quarter" value={money(fd.tax_this_quarter || fd.total_tax_withheld)} />
        <Field label="Previous Remittances" value={money(fd.previous_remittances)} />
        <Field label="Tax Still Due" value={money(fd.tax_still_due)} />
        <Field label="Penalties" value={money(fd.penalties)} />
        <Field label="Total Amount Due" value={money(fd.total_amount_due)} />
      </div>
    </Section>
  )
}

function Details2550Q({ fd }) {
  return (
    <Section title="Quarterly VAT Summary">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Vatable Sales" value={money(fd.vatable_sales || fd.line15)} />
        <Field label="VAT Exempt Sales" value={money(fd.vat_exempt_sales || fd.line14a)} />
        <Field label="Zero-Rated Sales" value={money(fd.zero_rated_sales || fd.line14b)} />
        <Field label="Output VAT" value={money(fd.output_vat || fd.line17)} />
        <Field label="Input VAT" value={money(fd.input_vat || fd.line20)} />
        <Field label="Net VAT Payable" value={money(fd.net_vat_payable || fd.line27)} />
        <Field label="Tax Credit" value={money(fd.tax_credit || fd.line22)} />
        <Field label="Total Amount Due" value={money(fd.total_amount_due || fd.line28)} />
      </div>
    </Section>
  )
}

function Details1702Q({ fd }) {
  return (
    <Section title="Quarterly Income Tax Summary">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Gross Income" value={money(fd.gross_income)} />
        <Field label="Total Deductions" value={money(fd.total_deductions)} />
        <Field label="Taxable Income" value={money(fd.taxable_income)} />
        <Field label="Tax Rate" value={fd.tax_rate ? `${fd.tax_rate}%` : null} />
        <Field label="Income Tax Due" value={money(fd.income_tax_due)} />
        <Field label="Tax Credits" value={money(fd.tax_credits)} />
        <Field label="Net Tax Payable" value={money(fd.net_tax_payable || fd.total_amount_due)} />
      </div>
    </Section>
  )
}

function Details1702({ fd }) {
  return (
    <Section title="Annual Income Tax Summary">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Total Revenue" value={money(fd.total_revenue || fd.gross_income)} />
        <Field label="Total Cost/Deductions" value={money(fd.total_deductions || fd.cost_of_sales)} />
        <Field label="Taxable Income" value={money(fd.taxable_income || fd.net_taxable_income)} />
        <Field label="Income Tax Due" value={money(fd.income_tax_due)} />
        <Field label="Quarterly Payments" value={money(fd.quarterly_payments)} />
        <Field label="Creditable Tax Withheld" value={money(fd.creditable_tax_withheld)} />
        <Field label="Tax Still Due/(Overpayment)" value={money(fd.tax_still_due)} />
      </div>
    </Section>
  )
}

function Details1604E({ fd }) {
  return (
    <Section title="Annual Alphalist Summary">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Total Income Payments" value={money(fd.total_income_payments)} />
        <Field label="Total Tax Withheld" value={money(fd.total_tax_withheld)} />
        <Field label="Number of Payees" value={fd.number_of_payees} />
        <Field label="Signatory" value={fd.signatory_name} />
        <Field label="Signatory Title" value={fd.signatory_title} />
      </div>
    </Section>
  )
}

function Details2316({ fd }) {
  return (
    <Section title="Employee Compensation Summary">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Employee Name" value={fd.employee_name} />
        <Field label="Employee TIN" value={fd.employee_tin} mono />
        <Field label="Total Compensation" value={money(fd.total_compensation || fd.gross_compensation)} />
        <Field label="Non-Taxable Compensation" value={money(fd.non_taxable || fd.non_taxable_compensation)} />
        <Field label="Taxable Compensation" value={money(fd.taxable_compensation)} />
        <Field label="Tax Withheld" value={money(fd.tax_withheld || fd.total_tax_withheld)} />
        <Field label="SSS/PhilHealth/PagIBIG" value={money(fd.mandatory_contributions)} />
      </div>
    </Section>
  )
}

function Details0605({ fd }) {
  return (
    <Section title="Annual Registration Fee">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Registration Fee" value={money(fd.registration_fee || fd.amount_due || 500)} />
        <Field label="Penalties" value={money(fd.penalties)} />
        <Field label="Total Amount Due" value={money(fd.total_amount_due || fd.registration_fee || 500)} />
        <Field label="Taxable Year" value={fd.taxable_year} />
      </div>
    </Section>
  )
}
