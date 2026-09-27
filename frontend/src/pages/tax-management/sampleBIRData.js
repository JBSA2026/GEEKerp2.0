/**
 * Sample Mock Data for all 11 BIR Forms
 * Each form includes "THIS IS A MOCK FORM" in the remarks field.
 * Entity: EXSSI (Expedia Staffing Solutions Inc.)
 */

// ============================================================
// BIR Form 2307 - Certificate of Creditable Tax Withheld at Source
// ============================================================
export const MOCK_2307 = {
  period_from: '2026-04-01',
  period_to: '2026-06-30',
  // Payee (the one who earned)
  payee_tin: ['248', '319', '751', '000'],
  payee_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  payee_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  payee_zip_code: '1605',
  payee_foreign_address: '',
  // Payor (the one who withheld)
  payor_tin: ['003', '421', '876', '000'],
  payor_name: 'ABC GLOBAL CORPORATION',
  payor_address: '10/F Pacific Star Bldg., Makati Ave. cor. Sen. Gil Puyat Ave., Makati City',
  payor_zip_code: '1226',
  // Table A - Income Payments Subject to Creditable Withholding Tax
  table_a: [
    { nature: 'Professional Fees - Individual', atc: 'WI100', month1: '125000.00', month2: '130000.00', month3: '128000.00', total: '383000.00', tax_withheld: '38300.00' },
    { nature: 'Rental - Real Property', atc: 'WC100', month1: '85000.00', month2: '85000.00', month3: '85000.00', total: '255000.00', tax_withheld: '12750.00' },
    { nature: 'Management Fees', atc: 'WI160', month1: '200000.00', month2: '210000.00', month3: '195000.00', total: '605000.00', tax_withheld: '60500.00' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
  ],
  // Table B - Money Payments Subject to Final Withholding Tax
  table_b: [
    { nature: 'Interest - Banks', atc: 'WF010', month1: '5000.00', month2: '5200.00', month3: '4800.00', total: '15000.00', tax_withheld: '3000.00' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
    { nature: '', atc: '', month1: '', month2: '', month3: '', total: '', tax_withheld: '' },
  ],
  // Signatory
  payor_signatory_name: 'JUAN CARLOS MENDOZA',
  payor_signatory_title: 'Chief Finance Officer',
  payor_signatory_tin: '123-456-789-000',
  payee_signatory_name: 'MARIA SANTOS REYES',
  payee_signatory_title: 'President',
  payee_signatory_tin: '248-319-751-000',
  remarks: 'THIS IS A MOCK FORM',
}

// ============================================================
// BIR Form 0619-E - Monthly Remittance of Expanded Withholding Tax
// ============================================================
export const MOCK_0619E = {
  return_period: '06/2026',
  tin: ['248', '319', '751', '000'],
  rdo_code: '049',
  taxpayer_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  registered_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  zip_code: '1605',
  contact_number: '(02) 8631-7890',
  category: 'Private',
  amended_return: false,
  any_taxes_withheld: true,
  line_12: '156750.00',
  line_13: '0.00',
  line_15a: '0.00',
  line_15b: '0.00',
  line_15c: '0.00',
  signatory_name: 'MARIA SANTOS REYES',
  signatory_title: 'President',
  signatory_tin: '248-319-751-000',
  agent_accreditation_no: '',
  date_of_issue: '',
  date_of_expiry: '',
  remarks: 'THIS IS A MOCK FORM',
}

// ============================================================
// BIR Form 1601-C - Monthly Remittance of Income Tax Withheld on Compensation
// ============================================================
export const MOCK_1601C = {
  return_period: '06/2026',
  tin: ['248', '319', '751', '000'],
  rdo_code: '049',
  taxpayer_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  registered_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  zip_code: '1605',
  contact_number: '(02) 8631-7890',
  category: 'Private',
  amended_return: false,
  number_of_employees: '47',
  // Schedule 1
  total_compensation: '2850000.00',
  statutory_minimum_wage: '420000.00',
  holiday_ot_night_diff: '185000.00',
  thirteenth_month_benefits: '237500.00',
  de_minimis_benefits: '47000.00',
  sss_philhealth_pagibig: '132000.00',
  other_non_taxable: '28500.00',
  // Part II
  line_17: '245680.00',
  line_18: '0.00',
  line_20: '0.00',
  line_22a: '0.00',
  line_22b: '0.00',
  line_22c: '0.00',
  signatory_name: 'MARIA SANTOS REYES',
  signatory_title: 'President',
  signatory_tin: '248-319-751-000',
  agent_accreditation_no: '',
  date_of_issue: '',
  date_of_expiry: '',
  remarks: 'THIS IS A MOCK FORM',
}

// ============================================================
// BIR Form 1600-VT - Monthly Remittance of VAT Withheld
// ============================================================
export const MOCK_1600VT = {
  return_period: '06/2026',
  tin: ['248', '319', '751', '000'],
  rdo_code: '049',
  taxpayer_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  registered_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  zip_code: '1605',
  contact_number: '(02) 8631-7890',
  category: 'Private',
  amended_return: false,
  any_taxes_withheld: true,
  line_12: '312500.00',
  line_13: '0.00',
  line_15a: '0.00',
  line_15b: '0.00',
  line_15c: '0.00',
  signatory_name: 'MARIA SANTOS REYES',
  signatory_title: 'President',
  signatory_tin: '248-319-751-000',
  remarks: 'THIS IS A MOCK FORM',
}


// ============================================================
// BIR Form 1601-EQ - Quarterly Remittance of Expanded Withholding Tax
// ============================================================
export const MOCK_1601EQ = {
  return_period: '2/2026',
  quarter: 2,
  year: 2026,
  tin: ['248', '319', '751', '000'],
  rdo_code: '049',
  taxpayer_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  registered_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  zip_code: '1605',
  contact_number: '(02) 8631-7890',
  category: 'Private',
  amended_return: false,
  any_taxes_withheld: true,
  line_15: '470250.00',
  line_16: '0.00',
  line_18: '470250.00',
  line_22a: '0.00',
  line_22b: '0.00',
  line_22c: '0.00',
  signatory_name: 'MARIA SANTOS REYES',
  signatory_title: 'President',
  signatory_tin: '248-319-751-000',
  agent_accreditation_no: '',
  date_of_issue: '',
  date_of_expiry: '',
  alphalist: [
    { seq: 1, tin: '003-421-876-000', name: 'ABC GLOBAL CORPORATION', atc: 'WI100', income_payment: '383000.00', tax_withheld: '38300.00' },
    { seq: 2, tin: '187-654-321-000', name: 'XYZ PROPERTIES INC.', atc: 'WC100', income_payment: '255000.00', tax_withheld: '12750.00' },
    { seq: 3, tin: '312-876-543-000', name: 'MEGA LOGISTICS CORP.', atc: 'WI160', income_payment: '605000.00', tax_withheld: '60500.00' },
    { seq: 4, tin: '456-123-789-000', name: 'PREMIER TECH SOLUTIONS', atc: 'WI100', income_payment: '420000.00', tax_withheld: '42000.00' },
    { seq: 5, tin: '789-654-123-000', name: 'GOLDEN SUNRISE TRADING', atc: 'WC160', income_payment: '180000.00', tax_withheld: '9000.00' },
  ],
  remarks: 'THIS IS A MOCK FORM',
}

// ============================================================
// BIR Form 2550Q - Quarterly Value-Added Tax Return
// ============================================================
export const MOCK_2550Q = {
  return_period: '2/2026',
  quarter: 2,
  year: 2026,
  tin: ['248', '319', '751', '000'],
  rdo_code: '049',
  taxpayer_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  registered_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  zip_code: '1605',
  contact_number: '(02) 8631-7890',
  industry_classification: 'Staffing Services',
  // Sales/Receipts
  line_14a: '4500000.00',
  line_14b: '350000.00',
  line_14c: '0.00',
  line_14d: '120000.00',
  // Output VAT
  line_16a: '540000.00',
  line_16b: '42000.00',
  line_18: '0.00',
  // Purchases
  line_19a: '1800000.00',
  line_19b: '450000.00',
  line_19c: '280000.00',
  line_19d: '120000.00',
  line_19e: '0.00',
  line_21: '0.00',
  line_24: '0.00',
  line_26a: '0.00',
  line_26b: '0.00',
  line_26c: '0.00',
  monthly_breakdown: [
    { month: 4, sales: '1450000.00', purchases: '850000.00', vat: '72000.00' },
    { month: 5, sales: '1580000.00', purchases: '920000.00', vat: '79200.00' },
    { month: 6, sales: '1470000.00', purchases: '880000.00', vat: '70800.00' },
  ],
  signatory_name: 'MARIA SANTOS REYES',
  signatory_title: 'President',
  signatory_tin: '248-319-751-000',
  remarks: 'THIS IS A MOCK FORM',
}

// ============================================================
// BIR Form 2316 - Certificate of Compensation Payment/Tax Withheld
// ============================================================
export const MOCK_2316 = {
  tax_year: 2025,
  period_from: '2025-01-01',
  period_to: '2025-12-31',
  // Part I - Employee
  employee_tin: ['198', '765', '432', '000'],
  employee_name: 'DELA CRUZ, JUAN PABLO M.',
  employee_first_name: 'JUAN PABLO',
  employee_last_name: 'DELA CRUZ',
  employee_middle_name: 'MARTINEZ',
  rdo_code: '049',
  employee_address: 'Unit 12B Sunrise Residences, Shaw Blvd., Mandaluyong City',
  employee_zip_code: '1552',
  date_of_birth: '1990-05-15',
  contact_number: '0917-123-4567',
  // Part II - Employer
  employer_tin: ['248', '319', '751', '000'],
  employer_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  employer_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  employer_zip_code: '1605',
  employer_type: 'Main',
  // Part IVA - Summary
  line_19_gross_compensation: '960000.00',
  line_20_nontaxable_compensation: '274800.00',
  line_21_taxable_present: '685200.00',
  line_22_taxable_previous: '0.00',
  line_23_gross_taxable: '685200.00',
  line_24_tax_due: '130740.00',
  line_25a_tax_withheld_present: '130740.00',
  line_25b_tax_withheld_previous: '0.00',
  line_26_total_withheld_adjusted: '130740.00',
  line_27_pera_credit: '0.00',
  line_28_total_taxes_withheld: '130740.00',
  // Part IVB - Non-taxable
  line_29_basic_salary: '0.00',
  line_30_holiday_pay: '48000.00',
  line_31_overtime_pay: '36000.00',
  line_32_night_shift: '12000.00',
  line_33_hazard_pay: '0.00',
  line_34_13th_month: '80000.00',
  line_35_deminimis: '18000.00',
  line_36_sss_philhealth_pagibig: '72000.00',
  line_37_other_nontaxable: '8800.00',
  line_38_total_nontaxable: '274800.00',
  // Part IVB - Taxable
  line_39_basic_salary_taxable: '480000.00',
  line_40_representation: '60000.00',
  line_41_transportation: '36000.00',
  line_42_cola: '24000.00',
  line_43_housing: '0.00',
  line_44_others: '12000.00',
  line_45_overtime_taxable: '0.00',
  line_46_commission: '48000.00',
  line_47_profit_sharing: '0.00',
  line_48_fees: '0.00',
  line_49_taxable_13th: '0.00',
  line_50_hazard_pay_taxable: '0.00',
  line_51_other_taxable: '25200.00',
  line_52_total_taxable: '685200.00',
  // Signatory
  signatory_name: 'MARIA SANTOS REYES',
  signatory_title: 'President',
  remarks: 'THIS IS A MOCK FORM',
}


// ============================================================
// BIR Form 1702Q - Quarterly Income Tax Return (Corporate)
// ============================================================
export const MOCK_1702Q = {
  return_period: '2/2026',
  quarter: 2,
  year: 2026,
  calendar_fiscal: 'Calendar',
  amended_return: false,
  atc: 'IC 010',
  tin: ['248', '319', '751', '000'],
  rdo_code: '049',
  registered_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  registered_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  zip_code: '1605',
  contact_number: '(02) 8631-7890',
  email: 'tax@exssi.com.ph',
  // Schedule 2
  sched2_line1_sales: '9150000.00',
  sched2_line2_cost_of_sales: '5490000.00',
  sched2_line3_gross_income: '3660000.00',
  sched2_line4_non_operating: '85000.00',
  sched2_line5_total_gross: '3745000.00',
  sched2_line6_deductions: '1850000.00',
  sched2_line7_taxable_this_qtr: '1895000.00',
  sched2_line8_taxable_prev_qtrs: '1720000.00',
  sched2_line9_total_taxable: '3615000.00',
  sched2_line10_tax_rate: 25,
  sched2_line11_income_tax_due: '903750.00',
  sched2_line12_mcit: '74900.00',
  sched2_line13_tax_due: '903750.00',
  // Schedule 4
  sched4_line1_prior_year_excess: '0.00',
  sched4_line2_prev_qtr_payments: '430000.00',
  sched4_line3_mcit_prev_qtrs: '0.00',
  sched4_line4_cwt_prev_qtrs: '156750.00',
  sched4_line5_cwt_2307_this_qtr: '111550.00',
  sched4_line6_tax_prev_filed: '0.00',
  sched4_line7_total_credits: '698300.00',
  // Part II
  part2_line14_tax_due: '903750.00',
  part2_line19_total_credits: '698300.00',
  part2_line20_tax_payable: '205450.00',
  part2_line21a_surcharge: '0.00',
  part2_line21b_interest: '0.00',
  part2_line21c_compromise: '0.00',
  part2_line22_total_penalties: '0.00',
  part2_line25_total_due: '205450.00',
  signatory_name: 'MARIA SANTOS REYES',
  signatory_title: 'President',
  signatory_tin: '248-319-751-000',
  remarks: 'THIS IS A MOCK FORM',
}

// ============================================================
// BIR Form 1702 - Annual Income Tax Return (Corporate)
// ============================================================
export const MOCK_1702 = {
  tax_year: 2025,
  calendar_fiscal: 'Calendar',
  amended_return: false,
  short_period: false,
  atc: 'IC 010',
  method_of_deduction: 'Itemized',
  tin: ['248', '319', '751', '000'],
  rdo_code: '049',
  registered_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  registered_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  zip_code: '1605',
  contact_number: '(02) 8631-7890',
  email: 'tax@exssi.com.ph',
  date_of_incorporation: '2015-03-10',
  // Part IV
  line_27_sales: '36800000.00',
  line_28_sales_returns: '450000.00',
  line_29_net_sales: '36350000.00',
  line_30_cost_of_sales: '21810000.00',
  line_31_gross_income: '14540000.00',
  line_32_other_income: '320000.00',
  line_33_total_taxable_income: '14860000.00',
  line_34_ordinary_deductions: '7250000.00',
  line_35_special_deductions: '0.00',
  line_36_nolco: '0.00',
  line_37_total_deductions: '7250000.00',
  line_38_osd: '0.00',
  line_39_net_taxable_income: '7610000.00',
  line_40_tax_rate: 25,
  line_41_income_tax_due: '1902500.00',
  line_42_mcit_due: '297200.00',
  line_43_tax_due: '1902500.00',
  // Credits
  line_44_prior_year_excess: '0.00',
  line_45_mcit_prev_qtrs: '0.00',
  line_46_regular_prev_qtrs: '1350000.00',
  line_47_excess_mcit_applied: '0.00',
  line_48_cwt_prev_qtrs: '312500.00',
  line_49_cwt_2307_4th_qtr: '135000.00',
  line_50_foreign_tax_credits: '0.00',
  line_51_tax_prev_filed: '0.00',
  line_52_special_tax_credits: '0.00',
  line_55_total_credits: '1797500.00',
  line_56_net_tax_payable: '105000.00',
  // Part II
  part2_line14_tax_due: '1902500.00',
  part2_line15_total_credits: '1797500.00',
  part2_line16_net_payable: '105000.00',
  part2_line17_surcharge: '0.00',
  part2_line18_interest: '0.00',
  part2_line19_compromise: '0.00',
  part2_line20_total_penalties: '0.00',
  part2_line21_total_payable: '105000.00',
  overpayment_option: '',
  signatory_name: 'MARIA SANTOS REYES',
  signatory_title: 'President',
  signatory_tin: '248-319-751-000',
  remarks: 'THIS IS A MOCK FORM',
}

// ============================================================
// BIR Form 1604-E - Annual Information Return of EWT (Expanded)
// ============================================================
export const MOCK_1604E = {
  year: 2025,
  tin: ['248', '319', '751', '000'],
  rdo_code: '049',
  taxpayer_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  registered_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  zip_code: '1605',
  contact_number: '(02) 8631-7890',
  category: 'Private',
  quarterly_summary: [
    { quarter: 1, taxes_withheld: '425000.00', taxes_remitted: '425000.00' },
    { quarter: 2, taxes_withheld: '470250.00', taxes_remitted: '470250.00' },
    { quarter: 3, taxes_withheld: '512800.00', taxes_remitted: '512800.00' },
    { quarter: 4, taxes_withheld: '489500.00', taxes_remitted: '489500.00' },
  ],
  alphalist: [
    { seq: 1, tin: '003-421-876-000', name: 'ABC GLOBAL CORPORATION', atc: 'WI100', income_payment: '1532000.00', tax_withheld: '153200.00' },
    { seq: 2, tin: '187-654-321-000', name: 'XYZ PROPERTIES INC.', atc: 'WC100', income_payment: '1020000.00', tax_withheld: '51000.00' },
    { seq: 3, tin: '312-876-543-000', name: 'MEGA LOGISTICS CORP.', atc: 'WI160', income_payment: '2420000.00', tax_withheld: '242000.00' },
    { seq: 4, tin: '456-123-789-000', name: 'PREMIER TECH SOLUTIONS', atc: 'WI100', income_payment: '1680000.00', tax_withheld: '168000.00' },
    { seq: 5, tin: '789-654-123-000', name: 'GOLDEN SUNRISE TRADING', atc: 'WC160', income_payment: '720000.00', tax_withheld: '36000.00' },
    { seq: 6, tin: '654-987-321-000', name: 'PACIFIC RIM CONSULTANTS', atc: 'WI100', income_payment: '2350000.00', tax_withheld: '235000.00' },
    { seq: 7, tin: '321-654-987-000', name: 'ISLAND TECH VENTURES', atc: 'WI120', income_payment: '1150000.00', tax_withheld: '115000.00' },
    { seq: 8, tin: '876-543-210-000', name: 'METRO BUILDERS & SUPPLY', atc: 'WC100', income_payment: '1480000.00', tax_withheld: '74000.00' },
    { seq: 9, tin: '543-210-876-000', name: 'STARLIGHT ENTERPRISES', atc: 'WI160', income_payment: '980000.00', tax_withheld: '98000.00' },
    { seq: 10, tin: '210-876-543-000', name: 'QUANTUM DATA SYSTEMS', atc: 'WI100', income_payment: '1560000.00', tax_withheld: '156000.00' },
  ],
  signatory_name: 'MARIA SANTOS REYES',
  signatory_title: 'President',
  signatory_tin: '248-319-751-000',
  agent_accreditation_no: '',
  date_of_issue: '',
  date_of_expiry: '',
  remarks: 'THIS IS A MOCK FORM',
}

// ============================================================
// BIR Form 0605 - Payment Form
// ============================================================
export const MOCK_0605 = {
  tin: ['248', '319', '751', '000'],
  rdo_code: '049',
  taxpayer_name: 'EXPEDIA STAFFING SOLUTIONS INC.',
  registered_address: '25/F Robinsons Cyberscape Alpha, Sapphire Rd., Ortigas Center, Pasig City',
  zip_code: '1605',
  contact_number: '(02) 8631-7890',
  filing_month: 6,
  filing_year: 2026,
  amended_return: false,
  // Part II
  tax_type: 'Income Tax',
  atc_code: 'IC 010',
  return_period: '06/2026',
  basic_tax: '205450.00',
  surcharge: '0.00',
  interest: '0.00',
  compromise: '0.00',
  // Part III
  drawee_bank: 'BDO UNIBANK INC.',
  payment_number: 'CHK-2026-06-0012345',
  payment_date: '2026-07-15',
  payment_amount: '205450.00',
  // Signatory
  signatory_name: 'MARIA SANTOS REYES',
  signatory_title: 'President',
  remarks: 'THIS IS A MOCK FORM',
}
