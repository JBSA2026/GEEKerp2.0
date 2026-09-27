# Tax Management — Full QA Checklist

## Operational Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AUTOMATIC (Real-Time)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  AR Invoice Confirmed (with WHT)  ──►  BIR 2307 DRAFT created/updated  │
│  AP Bill Confirmed (with EWT)     ──►  BIR 0619-E DRAFT created/updated│
│  AP Bill Confirmed (with VAT)     ──►  BIR 1600-VT DRAFT created/updated│
│  Payroll Run Approved             ──►  BIR 1601-C DRAFT created/updated │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│               CLOSE PERIOD (Button on BIR Forms tab)                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Monthly (every month):     0619-E, 1601-C, 1600-VT                    │
│  Quarterly (Mar/Jun/Sep/Dec): + 1601-EQ, 2550Q, 1702Q                  │
│  Annual (Dec only):          + 1702, 1604-E, 2316 (per employee)       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                       MANUAL ONLY                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  BIR 0605 (Payment Form) — for penalties, surcharges, compromise        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Form Lifecycle

```
DRAFT ──► PENDING_APPROVAL ──► (Approved via Workflow) ──► FINALIZED
  │                                                            │
  └── User can edit, recalculate, delete                       └── Locked, PDF exportable
```

---

## PHASE 0: Prerequisites Setup

### 0.1 — Entity Tax Profiles

Go to: **Tax Management > Tax Codes** (or set up via Supabase directly in `entity_tax_profiles` table)

Each entity needs a tax profile. Create for ALL 4:

| Field | Expedia | GreatnessLab | Exigent | KSI |
|-------|---------|-------------|---------|-----|
| entity | Expedia | GreatnessLab | Exigent | KSI |
| tin | 123-456-789-000 | 234-567-890-000 | 345-678-901-000 | 456-789-012-000 |
| rdo_code | 050 | 050 | 050 | 050 |
| registered_name | Expedia Staffing Solutions Inc. | GreatnessLab Corp | Exigent Corporation | KSI Corp |
| registered_address | 123 BGC, Taguig City | 456 Ortigas, Pasig | 789 Makati Ave, Makati | 101 Alabang, Muntinlupa |
| zip_code | 1634 | 1605 | 1226 | 1780 |
| contact_number | 02-8123-4567 | 02-8234-5678 | 02-8345-6789 | 02-8456-7890 |
| authorized_signatory | Juan Dela Cruz | Maria Santos | Pedro Reyes | Ana Garcia |
| signatory_title | President | CFO | President | Treasurer |
| category | Private | Private | Private | Private |

**Expected result:** Tax Management > entity selector shows all 4 entities. Dashboard shows no "Entity Configuration Gaps."

---

### 0.2 — Create Test Client (for AR/WHT)

Go to: **Master Data > Clients**

| Field | Value |
|-------|-------|
| Company Name | QA Test Client Corp |
| TIN | 987-654-321-000 |
| Entity | Expedia |
| Address | 100 Test Street, Makati |
| Billing Address | 100 Test Street, Makati |
| Contact Person | Test Contact |

### 0.3 — Create Test Supplier (for AP/EWT/VAT)

Go to: **Master Data > Suppliers**

| Field | Value |
|-------|-------|
| Company Name | QA Test Supplier Inc |
| TIN | 876-543-210-000 |
| Entity | Expedia |
| Address | 200 Vendor Road, Quezon City |
| Billing Address | 200 Vendor Road, Quezon City |
| VAT Status | VAT-Registered |
| Classification | LOCAL |

### 0.4 — Create Test Product/Service

Go to: **Master Data > Products/Services**

| Field | Value |
|-------|-------|
| Name | QA Consulting Service |
| Type | Service |
| Unit Price | 100,000.00 |
| VAT Type | Vatable (12%) |

### 0.5 — Create Payroll Employee (for 1601-C/2316)

Go to: **Payroll > Employees**

Ensure at least 1 employee exists for entity "Expedia" with:

| Field | Value |
|-------|-------|
| Employee | (pick existing or create) |
| Basic Salary | 30,000 |
| TIN | 111-222-333-000 |
| SSS Number | 12-3456789-0 |
| PhilHealth | 12-345678901-2 |
| PagIBIG | 1234-5678-9012 |

---

## PHASE 1: BIR 2307 (Certificate of Creditable Tax Withheld at Source)

### Trigger: AR Invoice with WHT confirmed

**Step 1 — Create AR Invoice with WHT**

Go to: **Accounts Receivable > Invoices > New Invoice**

| Field | Value |
|-------|-------|
| Entity | Expedia |
| Customer | QA Test Client Corp |
| Invoice Date | 2026-07-01 |
| Due Date | 2026-07-31 |
| Line Item | QA Consulting Service |
| Quantity | 1 |
| Unit Price | 100,000.00 |
| WHT Code | WHT_SERVICE_2 (2% creditable WHT) |

**Expected line item calculation:**
- VAT Exclusive: ₱100,000.00
- VAT (12%): ₱12,000.00
- WHT (2%): ₱2,000.00
- Net Collectible: ₱110,000.00

**Step 2 — Confirm the Invoice**

Click **Confirm** button on the invoice.

**Step 3 — Verify 2307 Auto-Generated**

Go to: **Tax Management > BIR Forms**

✅ **Expected:**
- [ ] A new `2307` form appears with status **DRAFT**
- [ ] Entity = Expedia
- [ ] Payee = QA Test Client Corp
- [ ] Payee TIN = 987-654-321-000
- [ ] Period = Q3/2026 (2026-07-01 to 2026-09-30)
- [ ] Payor info auto-filled from Expedia entity tax profile
- [ ] Form Data > table_a has row with ATC = WC010, month1 amount = 100,000.00, tax_withheld = 2,000.00

**Step 4 — View the Form**

Click on the 2307 form.

✅ **Expected:**
- [ ] Shows the real BIR 2307 form layout (not cards)
- [ ] Payee TIN segments in boxes
- [ ] Payor TIN segments in boxes
- [ ] Income table shows amounts correctly
- [ ] Period From/To fields populated

**Step 5 — Create another invoice (same customer, same quarter)**

Create another AR invoice for the same customer with:
- Date: 2026-08-15
- Amount: ₱50,000, WHT_SERVICE_2

Confirm it.

✅ **Expected:**
- [ ] NO new 2307 created (the existing DRAFT is updated)
- [ ] The existing 2307 now shows month2 = 50,000, total tax_withheld updated
- [ ] Form history shows "AUTO_UPDATED" entry

**Step 6 — Submit for Approval**

On the 2307 detail page, click **Submit for Approval**, select an approver.

✅ **Expected:**
- [ ] Status changes to PENDING_APPROVAL
- [ ] Form is no longer editable
- [ ] Appears in Workflow Approval module
- [ ] History shows "SUBMITTED_FOR_APPROVAL"

---

## PHASE 2: BIR 0619-E (Monthly Remittance of Creditable Income Taxes Withheld — Expanded)

### Trigger: AP Bill with EWT confirmed

**Step 1 — Create AP Bill with EWT**

Go to: **Accounts Payable > Bills > New Bill**

| Field | Value |
|-------|-------|
| Entity | Expedia |
| Supplier | QA Test Supplier Inc |
| Bill Date | 2026-07-10 |
| Due Date | 2026-08-10 |
| Description | Consulting service from supplier |
| VAT Exclusive Amount | 80,000.00 |
| VAT Input (12%) | 9,600.00 |
| EWT Material (1%) | 800.00 |

**Step 2 — Confirm the Bill**

Click **Confirm** on the bill.

**Step 3 — Verify 0619-E Auto-Generated**

Go to: **Tax Management > BIR Forms**

✅ **Expected:**
- [ ] A new `0619-E` form appears with status **DRAFT**
- [ ] Entity = Expedia
- [ ] Period = 2026-07-01 to 2026-07-31 (monthly)
- [ ] form_data.line_12_total_withheld = 800.00
- [ ] form_data.supplier_breakdown has 1 entry (QA Test Supplier Inc, TIN 876-543-210-000, total_ewt = 800.00)

**Step 4 — Add another AP bill (same month)**

Create another AP bill:
- Supplier: same, Date: 2026-07-20, EWT: ₱500

Confirm it.

✅ **Expected:**
- [ ] Existing 0619-E is UPDATED (not duplicated)
- [ ] line_12_total_withheld = 1,300.00 (800 + 500)
- [ ] supplier_breakdown shows total_ewt = 1,300.00, bill_count = 2
- [ ] History shows "AUTO_UPDATED"

**Step 5 — View the Form**

✅ **Expected:**
- [ ] Real BIR 0619-E layout
- [ ] TIN in boxes
- [ ] Line 12 = 1,300.00
- [ ] Line 14 = 1,300.00 (no previous remittance)
- [ ] Line 16 TOTAL = 1,300.00
- [ ] Signatory auto-filled from entity profile

---

## PHASE 3: BIR 1600-VT (Monthly Remittance Return of VAT Withheld)

### Trigger: AP Bill with VAT confirmed (same bill from Phase 2)

✅ **Expected (already triggered from Phase 2):**
- [ ] A `1600-VT` form exists with status DRAFT
- [ ] Entity = Expedia, Period = July 2026
- [ ] line_12_vat_withheld = ₱4,000.00 (80,000 × 5% VAT withholding)
- [ ] payee_breakdown has QA Test Supplier Inc

**Note:** 1600-VT uses 5% final VAT withholding (not the 12% input VAT). This is the amount withheld by the company as a VAT agent.

**View the form:**

✅ **Expected:**
- [ ] Real BIR 1600-VT layout with all parts
- [ ] Schedule 1 shows payee breakdown
- [ ] TIN segments in boxes

---

## PHASE 4: BIR 1601-C (Monthly Remittance Return of Income Taxes Withheld on Compensation)

### Trigger: Payroll Run Approved

**Step 1 — Create Payroll Run**

Go to: **Payroll > Generate Payroll**

| Field | Value |
|-------|-------|
| Period Start | 2026-07-01 |
| Period End | 2026-07-15 |
| Type | Semi-Monthly |

Include the test employee. Calculate payroll.

**Step 2 — Submit for Review, then Approve**

- Move payroll to FOR_REVIEW status
- Click **Approve**

**Step 3 — Verify 1601-C Auto-Generated**

Go to: **Tax Management > BIR Forms**

✅ **Expected:**
- [ ] A `1601-C` form appears with status DRAFT
- [ ] Period = 2026-07-01 to 2026-07-31
- [ ] form_data.number_of_employees ≥ 1
- [ ] form_data.schedule1_total_compensation = employee's gross pay
- [ ] form_data.line_17_taxes_withheld = total withholding tax from payroll
- [ ] form_data.employee_breakdown lists employees with WHT amounts

**View the form:**

✅ **Expected:**
- [ ] Real BIR 1601-C layout
- [ ] Schedule 1 with compensation breakdown
- [ ] Employee count, statutory deductions shown

---

## PHASE 5: Close Period — Quarterly Forms

### Trigger: "Close Period" button on BIR Forms tab

**Step 1 — Close Period for July 2026**

Go to: **Tax Management > BIR Forms > Close Period button**

| Field | Value |
|-------|-------|
| Entity | Expedia |
| Month | July |
| Year | 2026 |

Click **Generate All**.

✅ **Expected (monthly forms — should show "updated" since they already exist):**
- [ ] 0619-E: updated (was already auto-generated)
- [ ] 1601-C: updated (was already auto-generated)
- [ ] 1600-VT: updated (was already auto-generated)

✅ **Expected (July is NOT a quarter-end, so no quarterly forms):**
- [ ] No 1601-EQ, 2550Q, or 1702Q generated

**Step 2 — Close Period for September 2026 (Quarter End)**

First, create at least one AR invoice and AP bill with dates in Aug/Sep to have data. Then:

Close Period → Entity: Expedia, Month: September, Year: 2026

✅ **Expected (quarterly forms generated):**
- [ ] 1601-EQ created (DRAFT) — covers Q3 (Jul-Sep 2026)
- [ ] 2550Q created (DRAFT) — covers Q3
- [ ] 1702Q created (DRAFT) — covers Q3

---

## PHASE 6: BIR 1601-EQ (Quarterly Remittance Return of Creditable Income Taxes Withheld — Expanded)

**After Phase 5 close-period:**

✅ **Verify form content:**
- [ ] return_period = Q3/2026
- [ ] month1_remittance = July EWT total
- [ ] month2_remittance = August EWT total
- [ ] month3_tax_withheld = September EWT total
- [ ] alphalist shows all suppliers with EWT for the quarter
- [ ] Each alphalist entry has: payee_name, TIN, income_payment, tax_withheld, ATC code

**View the form:**
- [ ] Real BIR 1601-EQ layout
- [ ] Schedule 1 (Alphalist) table with all payee details
- [ ] Computation lines 15-24 calculated correctly

---

## PHASE 7: BIR 2550Q (Quarterly VAT Return)

**After Phase 5 close-period:**

✅ **Verify form content:**
- [ ] return_period = Q3/2026
- [ ] line_14a_vatable_sales = total AR invoice subtotals for Q3
- [ ] line_16a_output_tax_vatable = total output VAT from AR
- [ ] line_19a_purchases_domestic = total AP bill vat_exclusive amounts for Q3
- [ ] line_20_total_input_tax = total input VAT from AP
- [ ] line_23 = net VAT payable (output - input) or excess input VAT
- [ ] monthly_breakdown shows per-month sales/VAT split

**View the form:**
- [ ] Real BIR 2550Q layout with all parts (IV, V, VI, VII)

---

## PHASE 8: BIR 1702Q (Quarterly Income Tax Return)

**After Phase 5 close-period:**

✅ **Verify form content:**
- [ ] return_period = Q3/2026
- [ ] sched2_line1_sales = AR revenue for Q3
- [ ] sched2_line2_cost_of_sales = AP costs for Q3
- [ ] sched2_line3_gross_income = sales minus costs
- [ ] sched2_line10_tax_rate = 25 (RCIT)
- [ ] sched4_line5_cwt_2307_this_qtr = total WHT from AR invoices (creditable tax)
- [ ] part2_line20_tax_payable = tax due minus credits

**View the form:**
- [ ] Real BIR 1702Q layout with Schedules 2 & 4, Part II

---

## PHASE 9: Annual Forms (Close Period — December)

**Step 1 — Ensure data exists across the full year (or at minimum Q3-Q4)**

Create transactions for Oct, Nov, Dec with various amounts.

**Step 2 — Close Period December 2026**

Close Period → Entity: Expedia, Month: December, Year: 2026

✅ **Expected forms generated:**
- [ ] Monthly: 0619-E, 1601-C, 1600-VT (December)
- [ ] Quarterly: 1601-EQ, 2550Q (Q4)
- [ ] Annual: **1702** (full year)
- [ ] Annual: **1604-E** (full year alphalist)
- [ ] Annual: **2316** (one per active employee)

---

## PHASE 10: BIR 1702 (Annual Income Tax Return)

✅ **Verify form content:**
- [ ] tax_year = 2026
- [ ] line_27_sales = full year AR revenue for Expedia
- [ ] line_30_cost_of_sales = full year AP costs
- [ ] line_31_gross_income = revenue minus costs
- [ ] line_38_osd = gross_income × 40% (OSD method)
- [ ] line_39_net_taxable_income = gross - OSD
- [ ] line_41_income_tax_due = net_taxable × 25%
- [ ] line_42_mcit_due = gross_income × 2%
- [ ] line_43_tax_due = higher of income_tax or MCIT
- [ ] line_49_cwt_2307_4th_qtr = total WHT from AR for the year
- [ ] line_46_regular_prev_qtrs = sum of finalized 1702Q payments
- [ ] line_56_net_tax_payable = tax_due minus credits

**View the form:**
- [ ] Real BIR 1702-RT layout with Part I, Part IV, Tax Credits, Part II

---

## PHASE 11: BIR 1604-E (Annual Information Return of EWT)

✅ **Verify form content:**
- [ ] tax_year = 2026
- [ ] q1-q4_taxes_withheld = quarterly EWT totals
- [ ] total_taxes_withheld = sum of all quarters
- [ ] alphalist contains ALL suppliers with EWT for the entire year
- [ ] Each entry has: payee_name, TIN, ATC, income_payment, first/second/third/fourth_quarter
- [ ] number_of_payees matches alphalist length

**View the form:**
- [ ] Real BIR 1604-E layout with quarterly summary table + full alphalist

---

## PHASE 12: BIR 2316 (Certificate of Compensation Payment/Tax Withheld)

✅ **Verify form content (per employee):**
- [ ] tax_year = 2026
- [ ] employee_tin populated from payroll_employees
- [ ] employee_name = Last, First Middle
- [ ] employer_tin from entity tax profile
- [ ] employer_name from entity tax profile
- [ ] line_19_gross_compensation = sum of all payroll gross_pay + 13th month
- [ ] line_36_sss_philhealth_pagibig = total statutory deductions
- [ ] line_24_tax_due = total withholding tax for the year
- [ ] payroll_periods = number of pay periods in year

**View the form:**
- [ ] Real BIR 2316 layout with Part I (Employee), Part II (Employer), Part IVA, Part IVB

---

## PHASE 13: BIR 0605 (Payment Form — Manual)

**Step 1 — Create 0605 manually**

Go to: **Tax Management > BIR Forms > (form type selector) > 0605 > New**

| Field | Value |
|-------|-------|
| Entity | Expedia |
| Filing Month | July |
| Filing Year | 2026 |
| Tax Type | Withholding Tax - Expanded |
| ATC | WC010 |
| Amount (Line 12) | 1,300.00 |
| Particulars | Monthly EWT Remittance |

**Step 2 — View the form**

✅ **Expected:**
- [ ] Real BIR 0605 layout
- [ ] TIN in boxes
- [ ] Tax type, ATC filled
- [ ] Amount computation visible
- [ ] Can save as DRAFT or Finalize

---

## PHASE 14: Multi-Entity Test

Repeat Phase 1-3 using **GreatnessLab** as the entity:

- Create client + supplier under GreatnessLab
- Create AR invoice with WHT → confirm
- Create AP bill with EWT + VAT → confirm

✅ **Expected:**
- [ ] Separate 2307 for GreatnessLab (different payor info)
- [ ] Separate 0619-E for GreatnessLab
- [ ] Separate 1600-VT for GreatnessLab
- [ ] Dashboard entity filter correctly shows only GreatnessLab forms when selected
- [ ] "All" view shows forms from both entities

---

## PHASE 15: Dashboard Verification

Go to: **Tax Management > Dashboard**

✅ **Expected sections visible:**
- [ ] Top alert bar (compliance issues count or "all caught up")
- [ ] Status summary cards (Draft count, Pending Approval, Finalized, Net VAT)
- [ ] Missing Forms — shows forms not yet generated for previous month
- [ ] Overdue — shows DRAFTs from 2+ months ago
- [ ] Needs Your Action — lists all DRAFT + PENDING forms (clickable)
- [ ] Upcoming Deadlines — shows next filing dates with days remaining
- [ ] Entity Configuration Gaps — shows if any entity missing profile/TIN
- [ ] Recent Activity — shows latest form history entries
- [ ] Tax Position summary (Output VAT, Input VAT, WHT, EWT totals)

**Test the "Generate All" button in Missing Forms:**
- [ ] Click generates all missing forms for that entity/period
- [ ] Dashboard refreshes and the missing forms disappear
- [ ] Generated forms appear in "Needs Action" section as DRAFTs

**Test entity filter:**
- [ ] Select "Expedia" → only shows Expedia data
- [ ] Select "All" → shows aggregate

---

## PHASE 16: LOA (Letter of Authority) Retrieval

Go to: **LOA module** (check exact nav location)

### 16.1 — BIR Form Retrieval

- [ ] Select form type (e.g., 2550Q)
- [ ] Select entity and period
- [ ] System retrieves all supporting transactions for that form
- [ ] Shows AR invoices (for output VAT) and AP bills (for input VAT)

### 16.2 — Sales Trail

- [ ] Shows complete trail: Quotation → Sales Order → AR Invoice → Collection
- [ ] Includes invoice number, date, customer, amounts, VAT, WHT
- [ ] Filterable by entity and date range

### 16.3 — Purchase Trail

- [ ] Shows complete trail: PR → PO → AP Bill → Voucher → Payment
- [ ] Includes bill number, date, supplier, amounts, VAT, EWT
- [ ] Filterable by entity and date range

### 16.4 — Missing Documents

- [ ] Detects invoices/bills without linked upstream documents
- [ ] Shows what's missing (e.g., invoice without quotation, bill without PO)
- [ ] Useful for BIR audit preparation

---

## PHASE 17: VAT & WHT Summary Pages

### 17.1 — VAT Summary Tab

Go to: **Tax Management > VAT Summary**

✅ **Expected:**
- [ ] Output VAT total (from AR invoices)
- [ ] Input VAT total (from AP bills)
- [ ] Net VAT (output - input)
- [ ] Monthly breakdown chart/table
- [ ] Transaction-level detail (each invoice and bill listed)
- [ ] Entity filter works

### 17.2 — WHT/EWT Tab

Go to: **Tax Management > WHT / EWT**

✅ **Expected:**
- [ ] WHT from Customers (AR side — amount withheld by clients from us)
- [ ] EWT to Suppliers (AP side — amount we withheld from vendors)
- [ ] Per-customer WHT breakdown
- [ ] Per-supplier EWT breakdown
- [ ] Transaction-level detail

---

## PHASE 18: Filing Deadlines Tab

Go to: **Tax Management > Filing Deadlines**

✅ **Expected:**
- [ ] Shows all upcoming BIR deadlines (BIR 2550M, 0619-E, 2550Q, SSS, PhilHealth, Pag-IBIG)
- [ ] Days remaining calculated from today
- [ ] Color-coded: red (≤3d), amber (≤7d), blue (≤14d)
- [ ] Period covered shown for each

---

## PHASE 19: Tax Codes Tab

Go to: **Tax Management > Tax Codes**

✅ **Expected:**
- [ ] Lists all configured tax codes (WHT_SERVICE_2, WHT_MATERIAL_1, etc.)
- [ ] Shows code, rate, tax type, scope
- [ ] Editable codes can be modified (rate update)
- [ ] Non-editable codes are locked

---

## PHASE 20: Form Edit & Finalization Flow

Pick any DRAFT form (e.g., the 0619-E from Phase 2).

**Step 1 — Edit**
- [ ] Click Edit → opens real BIR form with editable inputs
- [ ] Modify a value (e.g., add surcharge ₱100 to line 15a)
- [ ] Save Draft → returns to detail view with updated value

**Step 2 — Submit for Approval**
- [ ] Click "Submit for Approval"
- [ ] Select approver from dropdown
- [ ] Status changes to PENDING_APPROVAL
- [ ] Form locked (no edit button)

**Step 3 — Approve (from Workflow Approval module)**
- [ ] Go to Workflow Approval
- [ ] Find the BIR Form approval request
- [ ] Approve it
- [ ] Form status → FINALIZED
- [ ] History shows "APPROVED" or "FINALIZED" entry

**Step 4 — Export PDF**
- [ ] Click Export PDF on finalized form
- [ ] PDF downloads with form data

---

## Summary of Expected Auto-Generation Results

After all phases, your BIR Forms list should contain:

| Form | Count | Source |
|------|-------|--------|
| 2307 | 1 per customer per quarter with WHT | Auto from AR confirm |
| 0619-E | 1 per entity per month with EWT bills | Auto from AP confirm |
| 1600-VT | 1 per entity per month with VAT bills | Auto from AP confirm |
| 1601-C | 1 per entity per month with payroll | Auto from Payroll approve |
| 1601-EQ | 1 per entity per quarter | Close Period |
| 2550Q | 1 per entity per quarter | Close Period |
| 1702Q | 1 per entity per quarter (Q1-Q3) | Close Period |
| 1702 | 1 per entity per year | Close Period (Dec) |
| 1604-E | 1 per entity per year | Close Period (Dec) |
| 2316 | 1 per employee per year | Close Period (Dec) |
| 0605 | As needed | Manual |

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| 2307 not created after invoice confirm | Does invoice have wht_amount > 0? Is entity filled? |
| 0619-E not created after bill confirm | Does bill have ewt_material > 0? |
| 1600-VT not created | Does bill have vat_input > 0? |
| 1601-C not created | Was payroll APPROVED (not just submitted)? |
| Close Period shows errors | Check entity_tax_profiles exists for that entity |
| Form shows ₱0 amounts | Check if transactions are CONFIRMED (not DRAFT) and within period dates |
| Dashboard shows "missing forms" | Run Close Period for that entity/month |
| Entity filter shows nothing | Switch entity selector in the header |
