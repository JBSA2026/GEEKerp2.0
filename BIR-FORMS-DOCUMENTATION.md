# BIR Forms in GEEK-ERP — Complete Documentation

## Overview

The system implements **11 BIR forms** covering withholding taxes, VAT, income tax, and payment/remittance obligations. They are stored in a unified `bir_forms` table with a JSON `form_data` column that holds form-specific fields. Each form follows a lifecycle: `DRAFT → PENDING_APPROVAL → FINALIZED`.

There are **three trigger mechanisms** for form generation:
1. **Transaction-triggered** — auto-generated when a source transaction (invoice, bill, payroll) is confirmed/approved
2. **Period close** — bulk-generated via the "Close Period" button for a specific month/entity
3. **Manual creation** — user creates from scratch in the Tax Management UI

### Architecture

- **Backend**: `routers/tax.py` — all BIR form CRUD, auto-populate endpoints, period close logic, and auto-generation functions
- **Frontend Forms**: `pages/tax-management/forms/{formType}/` — coordinate-driven BIR replicas with auto-populate + manual override
- **PDF Generation**: `utils/bir{formType}Pdf.js` — jsPDF-based PDF export matching official BIR form layouts
- **LOA Module**: `pages/loa/BIRFormTab.jsx` — read-only BIR data retrieval for audit/regulatory compliance
- **Database**: `bir_forms` table (unified), `bir_form_invoices` (links 2307 to AR invoices), `bir_form_history` (version/activity log)

---

## Form-by-Form Breakdown

---


### BIR Form 2307 — Certificate of Creditable Tax Withheld at Source

**What it is (BIR purpose):** A certificate issued by the payor (your company) to the payee (your customer) showing the withholding tax deducted from income payments during a quarter. The payee uses this as a tax credit on their income tax return.

**Filing frequency:** Quarterly (issued per customer per quarter)

**Calculation — FIXED, system-computed:**
- WHT rate is determined by the `wht_code` on each AR invoice line item:
  - `WHT_MATERIAL_1` → **1%** of VAT-exclusive amount (ATC code: WC158)
  - `WHT_SERVICE_2` → **2%** of VAT-exclusive amount (ATC code: WC010)
  - `NO_WHT` → 0%
- Formula: `WHT Amount = VAT-exclusive amount × WHT rate`
- These rates are fixed in `ar_ap_calc.py` as pure calculation functions

**What is AUTOMATIC:**
- When an AR invoice with `wht_amount > 0` is **confirmed**, the AR router calls `generate_or_update_2307_for_invoice()` which:
  1. Determines the quarter from the invoice date
  2. Finds or creates a DRAFT 2307 for that entity + customer + quarter
  3. Links the invoice to the form via `bir_form_invoices` table
  4. Recalculates form_data: builds Table A with monthly income breakdown by ATC code, distributes WHT proportionally across ATC codes
- Payor info (your company TIN, name, address, signatory) auto-fills from `entity_tax_profiles`
- Payee info (customer TIN, name, address) auto-fills from `client_list`
- Income breakdown splits by month within the quarter (month1, month2, month3)

**What is MANUAL:**
- Payee signatory name and title/TIN
- Agent accreditation numbers and dates (both payor and payee)
- Table B entries (money payments — rarely used)
- `payee_zip_code` and `payee_foreign_address`
- Any corrections/overrides to auto-calculated amounts

**Example flow:**
1. User confirms invoice INV-202607-001 for Customer ABC, ₱100,000 VAT-exclusive with `WHT_SERVICE_2`
2. System computes: WHT = ₱100,000 × 2% = ₱2,000
3. System auto-creates/updates DRAFT 2307 for ABC, Q3 2026
4. Table A shows: Nature="Professional/Service fees (2%)", ATC=WC010, Month1=₱100,000, Tax Withheld=₱2,000
5. If another invoice for the same customer in Q3 is confirmed later, the form is recalculated to include it

**Module interactions:**
- **AR Module** → triggers creation on invoice confirm
- **Tax Management** → view, edit, finalize, submit for approval
- **LOA Module** → read-only audit access
- **Workflow Approval** → approval flow before finalization

---


### BIR Form 0619-E — Monthly Remittance Return of Creditable Income Taxes Withheld (Expanded)

**What it is (BIR purpose):** Your monthly remittance to BIR of the expanded withholding tax (EWT) you withheld from payments to suppliers. Due on the **10th of the following month**.

**Filing frequency:** Monthly

**Calculation — FIXED, system-computed:**
- EWT rate on AP bills: **1% of VAT-exclusive amount** (hardcoded as `ewt_material` in the AP module)
- Formula: `Total EWT = Sum of ewt_material from all confirmed AP bills for entity + month`
- Line items:
  - Line 12 = Total taxes withheld (sum of EWT from bills)
  - Line 13 = Previous month's remittance (default 0, manual override)
  - Line 14 = Line 12 − Line 13 (tax still due)
  - Lines 15a/b/c = Surcharge/Interest/Compromise (manual, default 0)
  - Line 16 = Line 14 + 15a + 15b + 15c (total amount due)

**What is AUTOMATIC:**
- When an AP bill with `ewt_material > 0` is **confirmed**, the AP router calls `generate_or_update_0619e_for_bill()` which:
  1. Determines month/year from bill date
  2. Finds or creates a DRAFT 0619-E for that entity + month
  3. Queries ALL confirmed AP bills with EWT for that entity + month
  4. Computes total EWT and builds supplier breakdown
- Entity TIN, name, address, RDO code auto-fill from `entity_tax_profiles`
- Supplier breakdown shows each supplier's name, TIN, total EWT, and bill count

**What is MANUAL:**
- Line 13 (previous remittance already made — if you made an advance remittance)
- Lines 15a/b/c (penalties — only apply if filing late)
- Amended return checkbox
- Any override adjustments

**Example flow:**
1. Accountant confirms AP Bill #BILL-202607-003 from Supplier XYZ, VAT-exclusive ₱50,000, EWT = ₱500
2. System auto-creates DRAFT 0619-E for July 2026
3. If more bills are confirmed for July, the form is recalculated each time
4. By the 10th of August, accountant reviews, finalizes, and files

**Module interactions:**
- **AP Module** → triggers creation/update on bill confirm
- **Tax Management** → review, edit penalties, finalize
- **Period Close** → regenerates from all confirmed bills for the month

---


### BIR Form 1600-VT — Monthly Remittance Return of Value-Added Tax Withheld

**What it is (BIR purpose):** Your monthly remittance to BIR of the **5% final withholding VAT** you withheld from payments to VAT-registered suppliers when you're a designated VAT withholding agent. Due on the **10th of the following month**.

**Filing frequency:** Monthly

**Calculation — FIXED, system-computed:**
- VAT withholding rate: **5% of VAT-exclusive amount** (hardcoded: `vat_exclusive_amount × 0.05`)
- This is different from the regular 12% VAT — government agencies and large taxpayers designated as withholding agents withhold 5% from VAT suppliers
- Line items:
  - Line 12 = Total VAT withheld (sum of 5% × VAT-exclusive from all qualifying bills)
  - Line 13 = Previously remitted (default 0)
  - Line 14 = Tax still due
  - Lines 15a/b/c = Penalties (manual)
  - Line 16 = Total due

**What is AUTOMATIC:**
- When an AP bill with `vat_input > 0` is **confirmed**, the AP router calls `generate_or_update_1600vt_for_bill()` which:
  1. Determines month/year from bill date
  2. Finds or creates a DRAFT 1600-VT for that entity + month
  3. Queries all confirmed AP bills with VAT for that entity + month
  4. Calculates 5% VAT withheld per supplier
  5. Builds payee breakdown (supplier name, TIN, gross payments, VAT withheld)

**What is MANUAL:**
- Line 13 (previously remitted amounts)
- Penalties (lines 15a/b/c)
- Category of agent classification

**Example flow:**
1. AP bill confirmed: Supplier DEF, VAT-exclusive ₱200,000, VAT input ₱24,000
2. System calculates VAT withheld = ₱200,000 × 5% = ₱10,000
3. DRAFT 1600-VT for the month is created/updated
4. Payee breakdown shows: DEF, ₱200,000 gross, ₱10,000 withheld

**Module interactions:**
- **AP Module** → triggers creation/update on bill confirm
- **Tax Management** → review, finalize
- **Period Close** → regenerates monthly

---


### BIR Form 1601-C — Monthly Remittance Return of Income Taxes Withheld on Compensation

**What it is (BIR purpose):** Your monthly remittance to BIR of the withholding tax deducted from employee compensation (salaries). Due on the **10th of the following month**.

**Filing frequency:** Monthly

**Calculation — FIXED (BIR TRAIN Law graduated rates):**

The withholding tax on compensation uses the **BIR graduated tax table (TRAIN Law)**:

| Monthly Taxable Income | Tax Rate |
|---|---|
| ₱0 – ₱20,833 | 0% |
| ₱20,834 – ₱33,333 | 15% of excess over ₱20,833 |
| ₱33,334 – ₱66,667 | ₱1,875 + 20% of excess over ₱33,333 |
| ₱66,668 – ₱166,667 | ₱8,541.80 + 25% of excess over ₱66,667 |
| ₱166,668 – ₱666,667 | ₱33,541.80 + 30% of excess over ₱166,667 |
| Over ₱666,667 | ₱183,541.80 + 35% of excess over ₱666,667 |

The taxable income is computed as:
```
Monthly Taxable Income = Monthly Salary − SSS Employee − PhilHealth Employee − Pag-IBIG Employee
```

**What is AUTOMATIC:**
- When a payroll run is **approved**, the Payroll router calls `generate_or_update_1601c_for_payroll()` which:
  1. Determines month/year from payroll period
  2. Creates/updates DRAFT 1601-C for that entity + month
  3. Aggregates all payroll items: total compensation, statutory deductions (SSS/PhilHealth/Pag-IBIG), taxable compensation, total WHT
  4. Builds employee breakdown (per-employee gross, WHT, statutory amounts)
- Schedule 1 auto-fills: Total compensation, statutory contributions, taxable compensation
- Lines 17-24 auto-compute from payroll data

**What is MANUAL:**
- Schedule 1 special items: Statutory minimum wage earners, holiday/OT/night differential (non-taxable), 13th month benefits, de minimis, other non-taxable
- Line 18 (adjustment from previous month)
- Line 20 (previous remittance)
- Penalties (lines 22a/b/c)

**Example flow:**
1. Payroll for July 2026 is generated: 15 employees, total gross ₱750,000, total WHT ₱45,000
2. Payroll is approved → system creates DRAFT 1601-C for July 2026
3. Form shows: 15 employees, ₱750,000 total comp, ₱45,000 taxes withheld
4. Accountant reviews, adjusts non-taxable items if needed, finalizes

**Module interactions:**
- **Payroll Module** → triggers creation on payroll approval
- **Tax Management** → review, adjust, finalize
- **Period Close** → regenerates from all approved payroll runs for the month

---


### BIR Form 1601-EQ — Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)

**What it is (BIR purpose):** Quarterly summary return of all EWT remitted via monthly 0619-E forms during the quarter, plus an **alphalist of payees** (suppliers from whom you withheld tax). Due on the **last day of the month following the quarter end**.

**Filing frequency:** Quarterly (Q1: Apr 30, Q2: Jul 31, Q3: Oct 31, Q4: Jan 31)

**Calculation — FIXED, system-computed:**
- Sources all confirmed AP bills with EWT for the entity within the quarter
- Monthly breakdown: Month 1 and Month 2 are "previously remitted" (from 0619-E), Month 3 is filed with this return
- Line items:
  - Line 15 = Total remitted in months 1 & 2 (sum of their EWT)
  - Line 16 = Tax withheld in 3rd month
  - Line 17 = Total tax due for the quarter
  - Line 20 = Less previously remitted (months 1 & 2)
  - Line 21 = Balance still due (= month 3 amount)
  - Line 24 = Total amount payable

**What is AUTOMATIC:**
- Called via auto-populate endpoint or period close (on quarter-end months: 3, 6, 9, 12)
- Builds complete **alphalist**: each supplier with TIN, address, income payment total, tax withheld, ATC code
- Monthly EWT breakdown across the 3 months
- All computation from confirmed AP bills

**What is MANUAL:**
- Line 18 (over-remittance from previous quarter)
- Penalties (lines 22a/b/c)
- ATC code corrections on alphalist entries
- Amended return flag

**Example flow:**
1. Q3 2026 ends (September)
2. User clicks "Close Period" for September 2026 → system generates 1601-EQ for Q3
3. Form shows: Month 1 (Jul) ₱15,000, Month 2 (Aug) ₱12,000, Month 3 (Sep) ₱18,000
4. Alphalist shows 8 suppliers with their individual EWT totals
5. Balance still due = ₱18,000 (September's amount, since Jul/Aug were already remitted via 0619-E)

**Module interactions:**
- **AP Module** → source data (confirmed bills with EWT)
- **Tax Management** → auto-populate, review, finalize
- **Period Close** → auto-generated on quarter-end months

---


### BIR Form 2550Q — Quarterly Value-Added Tax Return

**What it is (BIR purpose):** Quarterly VAT return reporting your **output VAT** (from sales) minus **input VAT** (from purchases) to determine net VAT payable or excess input VAT carry-over. Due on the **25th of the month following the quarter end**.

**Filing frequency:** Quarterly

**Calculation — FIXED, system-computed:**
- **Output VAT** = Sum of `vat_output` from all confirmed AR invoices for entity + quarter
  - VAT rate: **12% of VAT-exclusive billing subtotal** (from `ar_ap_calc.vat_amount()`)
- **Input VAT** = Sum of `vat_input` from all confirmed AP bills for entity + quarter
  - VAT rate: **12% of VAT-exclusive amount** (from `ar_ap_calc.vat_amount()`)
- Net VAT = Output VAT − Input VAT
  - If positive → VAT payable
  - If negative → Excess input VAT (can carry forward)
- Line items:
  - Line 14a = Vatable sales (total billing subtotal from AR)
  - Line 16a = Output tax on vatable sales
  - Line 17 = Total output tax
  - Line 19a = Purchases from domestic suppliers
  - Line 20 = Total input tax
  - Line 23 = Net VAT payable or excess input VAT
  - Line 28 = Total amount due

**What is AUTOMATIC:**
- Called via auto-populate endpoint or period close
- Sales data from confirmed AR invoices
- Purchase data from confirmed AP bills
- Monthly breakdown within the quarter

**What is MANUAL:**
- Line 14b (sales to government — zero-rated)
- Line 14c (zero-rated sales)
- Line 14d (exempt sales)
- Line 18 (input tax from previous period carried over)
- Line 19b/c/d/e (importation, services, capital goods)
- Line 21 (deferred input VAT)
- Line 24 (tax credits/payments)
- Penalties (lines 26a/b/c)

**Example flow:**
1. Q2 2026: AR invoices total ₱5,000,000 in sales, output VAT = ₱600,000
2. AP bills total ₱3,000,000 in purchases, input VAT = ₱360,000
3. Net VAT payable = ₱600,000 − ₱360,000 = ₱240,000
4. System auto-populates; accountant adjusts for exempt/zero-rated sales, finalizes

**Module interactions:**
- **AR Module** → source of output VAT (confirmed invoices)
- **AP Module** → source of input VAT (confirmed bills)
- **Tax Management** → auto-populate, review, finalize
- **Period Close** → auto-generated on quarter-end months

---


### BIR Form 2316 — Certificate of Compensation Payment/Tax Withheld

**What it is (BIR purpose):** The annual certificate given to each employee showing their total compensation and taxes withheld for the year (Philippine equivalent of a W-2). Must be given to employees on or before **January 31 of the following year**.

**Filing frequency:** Annual (per employee)

**Calculation — FIXED, system-computed:**
- Aggregates all payroll items for the employee across the entire year
- Uses the same TRAIN Law brackets for validation
- Key computations:
  - Gross Compensation = Sum of `gross_pay` across all payroll periods
  - 13th Month = 1 month's basic salary (simplified estimate)
  - Non-taxable 13th Month = min(13th month, ₱90,000) — BIR threshold
  - Statutory deductions = SSS + PhilHealth + Pag-IBIG (annual totals)
  - Total non-taxable = Statutory + Non-taxable 13th month
  - Taxable compensation = Gross + 13th month − Total non-taxable
  - Tax due/withheld = Sum of `withholding_tax` across all payroll periods

**What is AUTOMATIC:**
- Generated during year-end period close (month = 12) for ALL active employees
- Employee info from `employees` + `payroll_employees` tables
- Employer info from `entity_tax_profiles`
- All payroll aggregation: basic, allowance, overtime, statutory deductions, WHT
- Part IVA summary (lines 19-28): gross compensation, non-taxable, taxable, tax due
- Part IVB details (lines 29-52): breakdown of taxable and non-taxable items

**What is MANUAL:**
- Previous employer data (Part II - if employee changed jobs mid-year)
- Holiday pay, night shift differential, hazard pay (detailed breakdown)
- De minimis benefits
- Other non-taxable/taxable compensation details
- Representation, transportation, COLA, housing allowances (detailed lines)
- PERA credit (line 27)
- Commission income (line 46)

**Example flow:**
1. December 2026 period close is triggered
2. System generates DRAFT 2316 for each of 50 active employees
3. Employee Juan dela Cruz: Gross ₱600,000, 13th month ₱50,000, SSS ₱16,200, PhilHealth ₱15,000, Pag-IBIG ₱1,200, WHT ₱52,000
4. Non-taxable = ₱16,200 + ₱15,000 + ₱1,200 + ₱50,000 (13th ≤ 90K) = ₱82,400
5. Taxable = ₱650,000 − ₱82,400 = ₱567,600
6. HR reviews each 2316, adjusts special items, finalizes and distributes to employees

**Module interactions:**
- **Payroll Module** → source of all compensation data
- **HR Module** → employee master data
- **Tax Management** → review, finalize
- **Period Close** → auto-generated for all active employees on year-end

---


### BIR Form 1604-E — Annual Information Return of Creditable Income Taxes Withheld (Expanded)

**What it is (BIR purpose):** Annual summary of ALL expanded withholding taxes remitted during the year, with a complete **alphalist of payees** (all suppliers you withheld EWT from). Due on **January 31 of the following year**.

**Filing frequency:** Annual

**Calculation — FIXED, system-computed:**
- Aggregates ALL confirmed AP bills with EWT for the entity for the full year
- Quarterly breakdown: Q1, Q2, Q3, Q4 totals
- Cross-references with filed 1601-EQ quarterly returns for reconciliation
- Builds per-supplier quarterly breakdown (how much EWT per supplier per quarter)

**What is AUTOMATIC:**
- Generated during year-end period close (month = 12)
- Complete alphalist: every supplier with TIN, address, income payment, tax withheld, per-quarter breakdown
- Quarterly remittance summary from actual AP bill data
- Cross-reference with existing 1601-EQ forms (FINALIZED/PENDING/DRAFT)
- Signatory name and title from entity profile

**What is MANUAL:**
- Reconciliation adjustments if actual remittances differ from computed
- ATC code corrections per supplier
- Any additional payees not captured in AP bills

**Example flow:**
1. Year-end close for 2026
2. System generates 1604-E showing: Q1 ₱45,000, Q2 ₱52,000, Q3 ₱48,000, Q4 ₱55,000 = Total ₱200,000
3. Alphalist shows 25 suppliers with individual annual totals and quarterly breakdown
4. Accountant reconciles against actual bank remittance records, finalizes

**Module interactions:**
- **AP Module** → source data (all confirmed bills with EWT for the year)
- **Tax Management** → auto-populate, review, finalize
- **Period Close** → auto-generated on year-end only

---


### BIR Form 1702Q — Quarterly Income Tax Return for Corporations

**What it is (BIR purpose):** Quarterly corporate income tax return. Reports taxable income and computes income tax or MCIT (Minimum Corporate Income Tax) payable. Due on the **60th day after quarter end** (for Q1-Q3; Q4 uses the annual 1702).

**Filing frequency:** Quarterly (Q1, Q2, Q3 only — Q4 is filed as the annual 1702)

**Calculation — FIXED rates, system-computed from AR/AP data:**
- **Sales** = Sum of `billing_subtotal` from confirmed AR invoices for entity + quarter
- **Cost of Sales** = Sum of `vat_exclusive_amount` from confirmed AP bills for entity + quarter
- **Gross Income** = Sales − Cost of Sales
- **Taxable Income** = Gross Income (simplified — no GL-based deductions yet)
- **Regular Corporate Income Tax (RCIT)** = **25%** of cumulative taxable income to date
- **MCIT (Minimum Corporate Income Tax)** = **2%** of gross income
- **Tax Due** = Higher of RCIT or MCIT
- **Tax Credits (CWT)** = Sum of `wht_amount` from AR invoices (CWT from 2307s received from customers)
- **Tax Still Due** = Tax Due − Tax Credits

**What is AUTOMATIC:**
- Revenue from AR invoices (quarterly and cumulative)
- Cost of sales from AP bills (quarterly and cumulative)
- Cumulative previous quarter data (re-queries Q1 through current quarter)
- CWT credits from AR WHT amounts (year-to-date)
- RCIT vs MCIT comparison (takes the higher)
- Schedule 2 computation (sales, costs, gross income, taxable)
- Schedule 4 tax credits

**What is MANUAL:**
- Non-operating income (line 4)
- Operating deductions (line 6) — would come from GL if fully integrated
- Prior year excess credits
- Previous quarter tax payments already filed
- MCIT from previous quarters
- Calendar vs fiscal year designation
- All penalty fields

**Example flow:**
1. Q2 2026 period close
2. System queries: Q2 sales = ₱2,000,000, Q2 costs = ₱1,200,000
3. Gross income Q2 = ₱800,000
4. Cumulative (Q1+Q2) taxable = ₱1,500,000
5. RCIT = ₱1,500,000 × 25% = ₱375,000
6. MCIT = ₱1,500,000 × 2% = ₱30,000
7. Tax due = ₱375,000 (RCIT is higher)
8. CWT from 2307s = ₱50,000
9. Tax payable = ₱325,000

**Module interactions:**
- **AR Module** → revenue data
- **AP Module** → cost data
- **Tax Management (2307s)** → tax credits (CWT withheld by customers)
- **Period Close** → auto-generated on quarter-end months (Q1-Q3 only)

---


### BIR Form 1702 — Annual Income Tax Return for Corporations

**What it is (BIR purpose):** The annual corporate income tax return, essentially the year-end version of 1702Q covering the full fiscal/calendar year. Due on the **15th day of the 4th month following the close of the taxable year** (April 15 for calendar year filers).

**Filing frequency:** Annual

**Calculation — FIXED rates, system-computed:**
- Same as 1702Q but for the full year
- Additional feature: **Optional Standard Deduction (OSD)** = 40% of gross income (alternative to itemized deductions)
- If OSD is used: `Net Taxable = Gross Income − (Gross Income × 40%)`
- Tax rates:
  - **RCIT** = 25% of net taxable income
  - **MCIT** = 2% of gross income (applies from 4th year of operations)
  - Tax Due = Higher of RCIT or MCIT
- Deducts previous quarterly 1702Q payments from tax due
- Full-year CWT credits from 2307s

**What is AUTOMATIC:**
- Full-year revenue (AR invoices) and costs (AP bills)
- OSD computation (40% of gross income)
- Previous quarterly 1702Q payments (from FINALIZED/PENDING 1702Q forms in the system)
- Full-year CWT from AR invoices with WHT
- RCIT vs MCIT comparison
- Part IV computation (lines 27-56)

**What is MANUAL:**
- Choice of deduction method (OSD vs Itemized) — defaults to OSD
- Itemized deductions if not using OSD (ordinary, special, NOLCO)
- Other income sources (line 32)
- Foreign tax credits (line 50)
- Special tax credits/incentives (line 52)
- Date of incorporation
- Overpayment option (carry forward or refund)
- All penalty fields

**Example flow:**
1. December 2026 period close
2. Full year: Sales ₱20,000,000, Costs ₱12,000,000
3. Gross income = ₱8,000,000
4. OSD = ₱8,000,000 × 40% = ₱3,200,000
5. Net taxable = ₱4,800,000
6. RCIT = ₱4,800,000 × 25% = ₱1,200,000
7. MCIT = ₱8,000,000 × 2% = ₱160,000
8. Tax due = ₱1,200,000 (RCIT higher)
9. Previous quarterly payments = ₱900,000 (from Q1-Q3 1702Q forms)
10. CWT = ₱120,000
11. Net tax payable = ₱1,200,000 − ₱900,000 − ₱120,000 = ₱180,000

**Module interactions:**
- **AR Module** → full-year revenue
- **AP Module** → full-year costs
- **Tax Management (1702Q forms)** → previous quarterly payments
- **Tax Management (2307s)** → CWT credits
- **Period Close** → auto-generated on year-end only

---


### BIR Form 0605 — Payment Form

**What it is (BIR purpose):** A generic payment form used to pay any tax liability (income tax, VAT, withholding tax, percentage tax, penalties, etc.) to BIR. Think of it as the "check" you attach when remitting payment.

**Filing frequency:** As needed (accompanies any tax payment)

**Calculation — FULLY MANUAL (user-defined):**
- This form has **NO automatic calculation** from system data
- User enters:
  - Tax type (Income Tax, VAT, Withholding Tax, Percentage Tax, Other)
  - ATC code
  - Return period being paid for
  - Basic tax amount
  - Surcharge, interest, compromise amounts
- Total payable = Basic tax + Surcharge + Interest + Compromise
- Payment details: Drawee bank, check/payment number, date, amount

**What is AUTOMATIC:**
- Entity TIN, name, address, RDO code (from entity profile)
- Signatory name and title (from entity profile)
- That's it — everything else is manual

**What is MANUAL:**
- Tax type selection
- ATC code
- Return period reference
- All monetary amounts (basic tax, penalties)
- Payment details (bank, check number, date, amount)

**Example flow:**
1. After finalizing 0619-E for July showing ₱15,000 due, accountant creates a 0605
2. Enters: Tax type = "Withholding Tax", ATC = WE010, basic tax = ₱15,000
3. Enters check details from the actual bank payment
4. Saves and prints as proof of payment

**Module interactions:**
- **Tax Management** → manual creation only
- Typically created AFTER another form (0619-E, 1601-C, 2550Q, etc.) determines the amount due
- No automatic triggers from any module

---


## Summary Table: Automatic vs Manual

| Form | Trigger | Frequency | Calculation Type | Key Auto Fields | Key Manual Fields |
|------|---------|-----------|-----------------|-----------------|-------------------|
| **2307** | AR Invoice confirm | Quarterly | Fixed (1% or 2% WHT) | Income table, TIN, amounts | Signatories, Table B |
| **0619-E** | AP Bill confirm | Monthly | Fixed (1% EWT) | Total withheld, supplier breakdown | Penalties, prev remitted |
| **1600-VT** | AP Bill confirm | Monthly | Fixed (5% VAT withheld) | VAT amounts, payee breakdown | Penalties, prev remitted |
| **1601-C** | Payroll approval | Monthly | Fixed (TRAIN Law brackets) | WHT totals, employee breakdown | Non-taxable items, penalties |
| **1601-EQ** | Period close | Quarterly | Fixed (from AP EWT data) | Alphalist, monthly breakdown | Over-remittance, penalties |
| **2550Q** | Period close | Quarterly | Fixed (12% VAT) | Output/Input VAT, net payable | Zero-rated, exempt, carry-over |
| **2316** | Year-end close | Annual/employee | Fixed (TRAIN Law) | All payroll aggregates | Previous employer, de minimis |
| **1604-E** | Year-end close | Annual | Fixed (from AP EWT data) | Complete alphalist, quarterly totals | Reconciliation adjustments |
| **1702Q** | Period close | Quarterly (Q1-Q3) | Fixed (25% RCIT / 2% MCIT) | Revenue, costs, tax computation | Deductions, non-operating income |
| **1702** | Year-end close | Annual | Fixed (25% RCIT + 40% OSD) | Full-year P&L, quarterly payments | Deduction method, special credits |
| **0605** | Manual only | As needed | **Fully manual** | TIN, name, address only | Everything else |

---

## Tax Rate Reference (All Fixed in Code)

| Tax Type | Rate | Source File | Applies To |
|----------|------|-------------|------------|
| VAT (Output/Input) | 12% | `ar_ap_calc.py` → `vat_amount()` | AR Invoices, AP Bills |
| WHT Material | 1% | `ar_ap_calc.py` → `wht_amount()` | AR Invoices (WC158) |
| WHT Service | 2% | `ar_ap_calc.py` → `wht_amount()` | AR Invoices (WC010) |
| EWT Material | 1% | AP module (hardcoded) | AP Bills |
| VAT Withholding | 5% | `tax.py` → 1600-VT logic | AP Bills (VAT agent) |
| Commission WHT | 10% | `commission.py` → `WHT_RATE` | Commission payouts |
| RCIT | 25% | `tax.py` → 1702Q/1702 logic | Corporate income |
| MCIT | 2% | `tax.py` → 1702Q/1702 logic | Corporate income (minimum) |
| SSS | Bracket-based | `payroll.py` → `compute_sss()` | Employee compensation |
| PhilHealth | 5% (split 50/50) | `payroll.py` → `compute_philhealth()` | Employee compensation |
| Pag-IBIG | 1-2% (max ₱100) | `payroll.py` → `compute_pagibig()` | Employee compensation |
| Income Tax (Compensation) | 0-35% graduated | `payroll.py` → `compute_withholding_tax()` | Employee compensation |

---

## Statutory Deduction Tables (Used by 1601-C and 2316)

### SSS 2024 Contribution Brackets

| Monthly Salary | Employee Share | Employer Share |
|---|---|---|
| ≤ ₱4,000 | ₱180 | ₱400 |
| ₱4,001 – ₱5,000 | ₱225 | ₱475 |
| ₱5,001 – ₱10,000 | ₱450 | ₱950 |
| ₱10,001 – ₱15,000 | ₱675 | ₱1,425 |
| ₱15,001 – ₱20,000 | ₱900 | ₱1,900 |
| ₱20,001 – ₱25,000 | ₱1,125 | ₱2,375 |
| ₱25,001 – ₱30,000 | ₱1,350 | ₱2,850 |
| Over ₱30,000 | ₱1,350 | ₱3,000 |

### PhilHealth
- Rate: 5% of monthly salary (capped at ₱100,000 salary)
- Split: 50% employee, 50% employer
- Max contribution: ₱2,500 per side (₱5,000 total)

### Pag-IBIG (HDMF)
- Employee: 1% if salary ≤ ₱1,500, else 2% (max ₱100/month)
- Employer: 2% (max ₱100/month)

---

## Period Close Behavior

The "Close Period" function (`POST /tax/bir-forms/close-period`) generates forms based on timing:

### Every Month (all 12 months):
- **0619-E** — Monthly EWT remittance
- **1601-C** — Monthly compensation WHT remittance
- **1600-VT** — Monthly VAT withholding remittance

### Quarter-End Months Only (March, June, September, December):
- **1601-EQ** — Quarterly EWT summary + alphalist
- **2550Q** — Quarterly VAT return
- **1702Q** — Quarterly income tax (Q1-Q3 only, not Q4)

### Year-End Only (December):
- **1702** — Annual income tax return
- **1604-E** — Annual EWT information return + alphalist
- **2316** — Annual employee tax certificate (one per active employee)

### Never Auto-Generated by Period Close:
- **2307** — Only triggered by AR invoice confirmation (per-customer, per-quarter)
- **0605** — Always manual (payment slip)

---

## Filing Deadline Reference

| Form | Deadline | Period |
|------|----------|--------|
| 0619-E | 10th of following month | Monthly |
| 1600-VT | 10th of following month | Monthly |
| 1601-C | 10th of following month | Monthly |
| 2550Q | 25th of month following quarter end | Quarterly |
| 1601-EQ | Last day of month following quarter end | Quarterly |
| 1702Q | 60th day after quarter end | Quarterly (Q1-Q3) |
| 1702 | April 15 (calendar year) | Annual |
| 1604-E | January 31 | Annual |
| 2316 | January 31 (to employees) | Annual |
| 2307 | Given to payee within 20 days after quarter end | Quarterly |
| 0605 | Same day as tax payment | As needed |

---

## Module Integration Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        GEEK-ERP Tax Integration                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────┐    Invoice Confirm     ┌───────────────────────────────┐   │
│  │   AR    │ ─────────────────────→ │  2307 (auto per customer/qtr) │   │
│  │ Module  │    (WHT 1% or 2%)      └───────────────────────────────┘   │
│  └─────────┘                                                             │
│                                                                          │
│  ┌─────────┐    Bill Confirm        ┌───────────────────────────────┐   │
│  │   AP    │ ─────────────────────→ │  0619-E (auto per entity/mo)  │   │
│  │ Module  │    (EWT 1%)            ├───────────────────────────────┤   │
│  │         │ ─────────────────────→ │  1600-VT (auto per entity/mo) │   │
│  └─────────┘    (VAT 5%)           └───────────────────────────────┘   │
│                                                                          │
│  ┌─────────┐    Payroll Approve     ┌───────────────────────────────┐   │
│  │ Payroll │ ─────────────────────→ │  1601-C (auto per entity/mo)  │   │
│  │ Module  │    (TRAIN Law WHT)     └───────────────────────────────┘   │
│  └─────────┘                                                             │
│                                                                          │
│  ┌─────────┐                        ┌───────────────────────────────┐   │
│  │Commission│   10% WHT on payouts  │  Feeds into 0619-E EWT data   │   │
│  │ Module  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─→ │  (via AP bill for commission) │   │
│  └─────────┘                        └───────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Period Close (Tax Management)                   │   │
│  │  Monthly: 0619-E, 1601-C, 1600-VT                                │   │
│  │  Quarterly: + 1601-EQ, 2550Q, 1702Q                              │   │
│  │  Annual: + 1702, 1604-E, 2316 (per employee)                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────┐                        ┌───────────────────────────────┐   │
│  │  LOA   │    Read-only access     │  All BIR forms (audit view)   │   │
│  │ Module  │ ←─────────────────────  │  VAT/WHT transaction detail   │   │
│  └─────────┘                        └───────────────────────────────┘   │
│                                                                          │
│  ┌─────────┐                        ┌───────────────────────────────┐   │
│  │Workflow │    Approval flow        │  BIR form status management   │   │
│  │Approval │ ←────────────────────→ │  DRAFT → PENDING → FINALIZED  │   │
│  └─────────┘                        └───────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Frontend Implementation Notes

- Each form is rendered as a **coordinate-driven replica** of the official BIR PDF form
- Uses tiny font sizes (8-9px) and absolute positioning to match BIR form fields exactly
- Forms support both **create** and **edit** modes
- Auto-populate button fetches data from backend endpoints (`/tax/bir-forms/{type}/auto-populate`)
- All fields remain editable even after auto-populate (manual override always possible)
- PDF export via jsPDF renders the form to match official BIR layout for printing/filing
- Status badges: DRAFT (amber), PENDING_APPROVAL (blue), FINALIZED (green)

## Commission Module WHT Note

The Commission module applies a flat **10% withholding tax** on all commission payouts:
```
Commission WHT = Commission Amount × 10%
Net Commission = Commission Amount − WHT − Cash Advance Recovery
```
This WHT feeds into the overall EWT obligations but is tracked in the commission system rather than directly generating a BIR form. The payout would typically be processed as an AP bill, which then triggers the 0619-E generation.
