# GEEK ERP — Comprehensive Operational Flow

> **Scope:** This document maps the complete operational flow of the GEEK ERP platform as a fully integrated enterprise system. All roadmapped features (Phases 1–3) are treated as complete, including Accounts Receivable/Payable, General Ledger, Tax Management, Workflow Approvals, HR, Payroll, and the Executive AI Assistant.

---

## 📑 Table of Contents

### Section 1 — User Personas
| # | Persona | Jump |
|---|---------|------|
| 1 | Sales Representative | [→](#sales-representative) |
| 2 | Sales / Commercial Manager | [→](#sales--commercial-manager) |
| 3 | Procurement Specialist | [→](#procurement-specialist) |
| 4 | Inventory / Warehouse Clerk | [→](#inventory--warehouse-clerk) |
| 5 | Project Manager | [→](#project-manager) |
| 6 | Financial Accountant | [→](#financial-accountant) |
| 7 | HR / Payroll Officer | [→](#hr--payroll-officer) |
| 8 | Executive / Auditor | [→](#executive--auditor) |
| 9 | Workflow Approver | [→](#workflow-approver) |

### Section 2 — End-to-End Lifecycle (Happy Path)
| Stage | Description | Jump |
|-------|-------------|------|
| 1 | Lead Generation & Activity Tracking | [→](#stage-1-lead-generation--activity-tracking-crm) |
| 2 | Pipeline Progression & Quotation | [→](#stage-2-pipeline-progression--quotation) |
| 3 | Cross-Module Approval Workflow | [→](#stage-3-cross-module-approval-workflow) |
| 4A | Automated Project Spawning | [→](#stage-4a-automated-project-spawning-operations) |
| 4B | Purchase Order Routing | [→](#stage-4b-purchase-order-routing-procurement) |
| 5 | Inventory Allocation & Goods Receipt | [→](#stage-5-inventory-allocation--goods-receipt) |
| 6 | Billing, Invoicing & Revenue Recognition | [→](#stage-6-billing-invoicing--revenue-recognition-arapgl) |
| 7 | Tax Form Population (BIR) | [→](#stage-7-tax-form-population-bir-compliance) |
| 8 | Executive Reporting & AI Auditing | [→](#stage-8-executive-reporting--ai-auditing) |

### Section 3 — Module-by-Module UX Flow
| # | Module | Jump |
|---|--------|------|
| 3.1 | Master Data | [→](#31-master-data-module) |
| 3.2 | CRM / Sales | [→](#32-crm--sales-module) |
| 3.3 | Quotation | [→](#33-quotation-module) |
| 3.4 | Purchasing | [→](#34-purchasing-module) |
| 3.5 | Projects | [→](#35-projects-module) |
| 3.6 | Inventory | [→](#36-inventory-module) |
| 3.7 | Finance & Accounting (AR/AP/GL) | [→](#37-finance--accounting-module-ar--ap--gl) |
| 3.8 | Tax & Compliance | [→](#38-tax--compliance-module) |
| 3.9 | HR & Payroll | [→](#39-hr--payroll-module) |
| 3.10 | AI Analytics & Executive Intelligence | [→](#310-ai-analytics--executive-intelligence) |

### Section 4 — Exception Handling & Auditing
| # | Scenario | Jump |
|---|----------|------|
| 4.1 | Approval Rejections | [→](#41-approval-rejections) |
| 4.2 | Financial Discrepancy Flags | [→](#42-financial-discrepancy-flags) |
| 4.3 | Tax Calculation Anomalies | [→](#43-tax-calculation-anomalies) |
| 4.4 | Inventory Constraint Violations | [→](#44-inventory-constraint-violations) |
| 4.5 | Duplicate Record Prevention | [→](#45-duplicate-record-prevention) |
| 4.6 | Authentication & Authorization Failures | [→](#46-authentication--authorization-failures) |
| 4.7 | Comprehensive Audit Trail Architecture | [→](#47-comprehensive-audit-trail-architecture) |
| 4.8 | LOA / BIR Audit Readiness | [→](#48-loa--bir-audit-readiness) |
| 4.9 | Workflow Approval Escalation | [→](#49-workflow-approval-escalation) |

---

## 1. User Persona Directory

### Sales Representative
- **Primary Modules:** CRM, Quotation, Sales Pipeline
- **Core Actions:** Logs leads, records sales activities (calls, meetings, site visits), manages opportunities through the Kanban pipeline, drafts and submits quotations, tracks forecast attainment
- **System Access Level:** `SALES_USER` role

### Sales / Commercial Manager
- **Primary Modules:** CRM, Quotation, Sales Forecast, Workflow Approval, Dashboard
- **Core Actions:** Approves/rejects quotations, monitors pipeline health, sets quota targets, reviews win/loss analytics, assigns salespersons to accounts
- **System Access Level:** `SALES_MANAGER` role

### Procurement Specialist
- **Primary Modules:** Purchasing, Inventory, Supplier Master Data
- **Core Actions:** Creates purchase requests, sends RFQs to suppliers, evaluates supplier quotes, generates purchase orders, processes goods receipts
- **System Access Level:** `PROCUREMENT_USER` role

### Inventory / Warehouse Clerk
- **Primary Modules:** Inventory, Warehouses, Master Data (Products)
- **Core Actions:** Manages stock-in/out, performs warehouse transfers, monitors reorder levels, conducts stock adjustments, receives goods from POs
- **System Access Level:** `INVENTORY_CLERK` role

### Project Manager
- **Primary Modules:** Projects, CRM (Customers), Inventory (Materials)
- **Core Actions:** Creates and manages projects, defines milestones, assigns tasks, tracks budget vs actual cost, manages material allocation, closes projects
- **System Access Level:** `PROJECT_MANAGER` role

### Financial Accountant
- **Primary Modules:** Accounts Receivable, Accounts Payable, General Ledger, Tax Management
- **Core Actions:** Issues invoices, processes payments, records journal entries, manages chart of accounts, reconciles AR/AP aging, prepares financial statements
- **System Access Level:** `FINANCE_ACCOUNTANT` role

### HR / Payroll Officer
- **Primary Modules:** HR Management, Payroll, Commission Management
- **Core Actions:** Maintains 201 files, processes leave/attendance, computes payroll with statutory deductions, generates payslips, manages commission structures
- **System Access Level:** `HR_MANAGER` role

### Executive / Auditor
- **Primary Modules:** Dashboard, BI Analytics, Audit Logs, LOA Retrieval, Executive AI Assistant
- **Core Actions:** Reviews KPIs, drills into module metrics, queries system via natural language, retrieves audit-ready documents for BIR/LOA compliance, monitors system health
- **System Access Level:** `SUPER_ADMIN` or `AUDITOR` role

### Workflow Approver
- **Primary Modules:** Workflow Approval (cross-module), Dashboard (Pending Approvals)
- **Core Actions:** Reviews and approves/rejects quotations, purchase orders, payment vouchers, leave requests, budget allocations
- **System Access Level:** `WORKFLOW_APPROVER` role

---

## 2. The Unified Enterprise Lifecycle (End-to-End "Happy Path")

> This narrative follows a single business thread — from first contact with a prospect through to tax compliance and executive reporting — demonstrating how data flows seamlessly across every module.

---

### Stage 1: Lead Generation & Activity Tracking (CRM)

**Trigger:** A Sales Representative identifies a new business prospect.

1. **Sales Rep creates a Lead** in the CRM module with company name, contact person, email, mobile, lead source (e.g., "Referral"), and interest level ("Hot").
   - System assigns `lead_status = "New"` and logs creation in audit trail.
   - Lead appears on the Sales Rep's activity dashboard.

2. **Sales Rep logs activities** against the lead — calls, emails, meetings, site visits — each with subject, date, and outcome notes.
   - Activities feed into the **Sales Activities timeline** for team visibility.
   - Each activity is audit-logged with the performing employee's identity.

3. **Lead qualifies → Opportunity created.** When the lead shows genuine buying intent, the Sales Rep converts it to an **Opportunity** with:
   - Project name, estimated value (₱), probability %, expected close date, competitor info.
   - Stage set to **"Prospecting"** on the Kanban board.

> **Cross-Module Ripple:** The opportunity's estimated value immediately feeds the **Sales Forecast** module's pipeline_value for the assigned salesperson's current period. The **Dashboard** widget "Open Opportunities" increments.

---

### Stage 2: Pipeline Progression & Quotation

4. **Sales Rep drags Kanban card** from "Prospecting" → "Qualification" → "Proposal" as the deal advances.
   - Each stage change triggers an audit log entry and recalculates the weighted pipeline value.

5. **Sales Rep creates a Quotation** linked to the opportunity's customer:
   - System auto-generates quotation number: `QTN-YYYYMM-NNN`
   - Line items reference products from Master Data (product codes, unit costs, margins)
   - Calculates subtotal, VAT (12%), WHT, shipping, grand total
   - Status: **DRAFT**

6. **Sales Rep submits quotation for approval** → status transitions to **FOR_APPROVAL**.

> **Cross-Module Ripple:** The quotation appears in the Commercial Manager's **Pending Approvals** queue on the Dashboard. The Workflow Approval module creates an approval task with urgency level.

---

### Stage 3: Cross-Module Approval Workflow

7. **Commercial Manager reviews** the quotation in the Workflow Approval module:
   - Views line items, margins, customer credit standing, historical pricing
   - **APPROVES** → quotation status moves to **APPROVED**, `approved_by` and `approved_at` recorded
   - OR **REJECTS** with remarks → status returns to **DRAFT** for revision

8. **Approved quotation is sent** to the customer → status: **SENT**, `sent_at` recorded.

9. **Customer accepts** → Sales Rep marks status **ACCEPTED**.
   - The opportunity's Kanban stage auto-moves to **"Closed Won"**.
   - Sales Forecast `achieve_amount` increments for the period.

> **Cross-Module Ripple:** Acceptance triggers two parallel downstream processes: (A) Project spawning for service/project-based deals, or (B) Purchase Order routing for product supply deals. Finance is signaled to create a draft invoice.

---

### Stage 4A: Automated Project Spawning (Operations)

10. **System auto-creates a Project** from the accepted quotation:
    - Project code generated: `GEEK-YYYY-PRJ-NNNN`
    - Inherits client, contract value, project name from quotation
    - Status: **PLANNING**
    - Line items seed the project's **Materials** tab with quantities and unit costs

11. **Project Manager is assigned** and begins operational planning:
    - Defines milestones with target dates and billing amounts
    - Creates tasks, assigns to team members, sets due dates
    - Adds budget items (labor, overhead, contingency)

12. **Materials trigger inventory check:**
    - If stock available → materials status set to "ALLOCATED", reserved_quantity incremented
    - If stock insufficient → system auto-generates a **Purchase Request** in the Purchasing module

> **Cross-Module Ripple:** Inventory reservation reduces available stock visible to other modules. Purchase Request enters the procurement workflow.

---

### Stage 4B: Purchase Order Routing (Procurement)

13. **Procurement Specialist reviews the Purchase Request** (`PR-YYYYMM-NNN`):
    - Validates items, quantities, estimated costs, required date
    - Status: **TO_PURCHASE**

14. **Creates a Request for Quotation (RFQ)** → `RFQ-YYYYMM-NNN`:
    - Selects 2–3 suppliers from the approved Supplier Master Data
    - RFQ sent to each → PR status moves to **RFQ_SENT**

15. **Supplier Quotes are received** and recorded (`SQ-YYYYMM-NNN`):
    - Each quote captures: unit costs per item, delivery date, payment terms, shipping, duties, taxes, brokerage
    - System computes **landed cost** (item total + all charges) for comparison
    - PR status: **QUOTE_RECEIVED**

16. **Best supplier selected** → unselected quotes marked REJECTED, selected marked SELECTED:
    - PR status: **COMPARISON_DONE**
    - System ranks quotes by landed cost automatically

17. **Purchase Order generated** from selected quote → `PO-YYYYMM-NNN`:
    - PO status: **DRAFT** → submitted for approval
    - Workflow Approval module creates an approval task for the authorized approver
    - Upon approval: `approved_by`, `approved_at` recorded; PO status → **APPROVED** → **PO_SENT**

---

### Stage 5: Inventory Allocation & Goods Receipt

18. **Goods arrive at the warehouse.** Warehouse Clerk creates a **Goods Receipt** (`GR-YYYYMM-NNN`):
    - Records received quantities per PO line item
    - Partial receipt → PO status: **PARTIALLY_RECEIVED**
    - Full receipt → PO status: **RECEIVED**

19. **Inventory stock auto-updates:**
    - The Purchase Request's selected company owns the received stock; older requests may derive the company from the PO number prefix.
    - `quantity_on_hand` increases only on a matching product, warehouse, location, and owning-entity record; stock for different entities is kept separate.
    - A receipt is blocked until an owning company can be determined.
    - Movement record created: type `STOCK_IN`, linked to GR reference
    - Stock status re-evaluated: LOW_STOCK / ACTIVE based on reorder level
    - PR status: **PO_CREATED** (full cycle complete)

20. **If materials were for a Project**, project material status updates to "RECEIVED" and the Project Manager is notified.

> **Cross-Module Ripple:** Inventory value on the Dashboard updates. If received items fulfill a project's material requirement, the project progress can advance. Finance module is signaled to create an **Accounts Payable** entry for the supplier invoice.

---

### Stage 6: Billing, Invoicing & Revenue Recognition (AR/AP/GL)

#### Accounts Receivable (Customer Billing)

21. **Finance creates a Sales Invoice** linked to the quotation/project:
    - Invoice number auto-generated: `INV-YYYY-NNNN`
    - Line items pulled from the accepted quotation
    - VAT computed at 12%, WHT applied per customer agreement
    - Payment terms inherited from customer master data (Net 30, Net 60, COD)
    - Status: **ISSUED**

22. **Milestone-based billing** (for projects):
    - Project Manager marks milestone as complete → triggers billing event
    - Finance issues partial invoice for the milestone's billing amount
    - Milestone flagged `is_billed = true`

23. **Collections recorded:**
    - Official Receipt generated: `OR-YYYY-NNNN`
    - Payment applied against outstanding invoices
    - AR Aging automatically recomputes (Current / 30 / 60 / 90+ days)

> **GL Impact:** Revenue recognition journal entry: DR Accounts Receivable, CR Revenue. Upon payment: DR Cash/Bank, CR Accounts Receivable.

#### Accounts Payable (Supplier Payments)

24. **Supplier invoice matched** against the approved PO and Goods Receipt (3-way match):
    - Discrepancies flagged for review before payment approval
    - AP entry created with due date per supplier payment terms

25. **Payment Voucher submitted** for workflow approval:
    - Approver validates: correct amount, matched to GR, within budget
    - Upon approval: payment processed, check/bank transfer issued
    - AP Aging updates (Current / 30 / 60 / 90+ days)

> **GL Impact:** DR Expense/Inventory, CR Accounts Payable. Upon payment: DR Accounts Payable, CR Cash/Bank.

#### General Ledger

26. **All financial transactions auto-post** to the General Ledger:
    - Chart of Accounts maintains the full account structure (Assets, Liabilities, Equity, Revenue, Expenses)
    - Journal entries created for every AR/AP transaction, adjustments, and accruals
    - Income Statement and General Ledger Report generated on demand

---

### Stage 7: Tax Form Population (BIR Compliance)

27. **Tax Management module auto-computes** from GL data:
    - **Output VAT** — 12% on all invoiced sales
    - **Input VAT** — 12% on VATable purchases (from supplier invoices)
    - **Expanded Withholding Tax (EWT)** — computed per BIR tax code
    - **Creditable Withholding Tax (CWT)** — deducted from collections

28. **BIR Forms auto-populated:**
    - **BIR 2550M** (Monthly VAT Return) — Output VAT less Input VAT
    - **BIR 2550Q** (Quarterly VAT Return) — consolidated quarterly
    - **BIR 1601-EQ** (Quarterly EWT Remittance)
    - **BIR 2307** (Certificate of Creditable Tax Withheld) — per transaction
    - **BIR 1604-E** (Annual Information Return for EWT)

29. **Filing deadlines tracked** on Dashboard:
    - Color-coded urgency: Red (<7 days), Amber (8–14 days), Green (>14 days)
    - SSS, PhilHealth, Pag-IBIG contribution deadlines also monitored

> **Cross-Module Ripple:** Tax payable amounts feed back to Dashboard KPIs. LOA Retrieval module indexes all supporting documents (invoices, receipts, vouchers) for BIR audit readiness.

---

### Stage 8: Executive Reporting & AI Auditing

30. **Executive Dashboard displays real-time KPIs:**
    - Total Revenue, Gross Profit, Collections, AR/AP balances, Inventory Value
    - Open Opportunities, Active Projects, Cash Position, Tax Payables
    - Pending Approvals count with urgency breakdown
    - System Health indicator

31. **BI Analytics provides:**
    - Trend analysis (month-over-month revenue, expense ratios)
    - Pipeline conversion funnel visualization
    - Salesperson performance scorecards (quota vs achievement)
    - Project profitability matrix (contract value vs total cost)
    - Customer lifetime value and churn indicators

32. **Executive AI Assistant** responds to natural language queries:
    - "What's our total revenue this quarter?" → queries GL + AR
    - "Which projects are over budget?" → queries project financials
    - "Show me overdue invoices above ₱1M" → queries AR aging
    - "Who approved PO-202606-003?" → queries audit logs
    - Answers grounded in live ERP data with source references

---

## 3. Module-by-Module User Experience Flow

---

### 3.1 Master Data Module

**Purpose:** Central repository for all reusable reference records shared across the system.

**Resources Managed:** Clients, Products, Employees, Suppliers, Contacts, Leads, Opportunities, Sales Activity, Sales Forecast, Services, Warehouses, Documents

#### User Action
- User navigates to **Master Data** via sidebar → sees tabbed interface with resource count badges
- Selects a resource tab (e.g., "Products") → sees a searchable, filterable data table
- **Creates** a new record via "Add" button → slide-out drawer with validated form fields
- **Edits** an existing record → clicks row → drawer pre-filled with current values
- **Bulk selects** records via checkboxes → can Archive (soft-delete) or Delete (hard-delete)
- **Exports** to CSV with current search/filter applied
- **Searches** across multiple fields simultaneously (case-insensitive)

#### Cross-Module Ripple Effect
- **Product added** → available in Quotation line items, Inventory stock records, Project materials, Purchase Request items
- **Supplier added** → appears in RFQ recipient lists, Purchase Order supplier selection
- **Client added** → available in CRM Customers, Quotation client selection, Project client assignment
- **Employee added** → available as salesperson assignment, project manager, task assignee, approver
- **Warehouse added** → available for inventory stock allocation, goods receipt destination, transfer targets

#### System Automation & Guardrails
- **Auto-timestamps:** `created_at` set on insert, `updated_at` bumped on every update (PostgreSQL triggers)
- **Duplicate prevention:** Unique constraints on product_code, warehouse_code, employee email
- **Referential integrity:** Cannot delete a warehouse that has inventory stock; cannot delete an employee with active role assignments
- **Audit logging:** Every CREATE, UPDATE, DELETE, ARCHIVE action logged with who/when/from-where/what-changed
- **Status management:** Records can be "active" or "archived" — archived records excluded from dropdowns system-wide

---

### 3.2 CRM / Sales Module

**Purpose:** Full sales lifecycle from lead capture to deal closure, with pipeline visualization and forecast tracking.

**Sub-Modules:** Customer List, Contact List, Leads, Opportunities, Sales Activities, Sales Pipeline (Kanban), Sales Forecast, Sales Reports

#### User Action

**Customer List:**
- Sales Rep clicks "New Customer" → form with auto-generated code `GEEK-YYYY-CUS-NNNN`
- Fills: Company Name (required), Trade Name, Customer Type dropdown (Corporate/Government/Individual), Industry combobox, TIN (masked XXX-XXX-XXX-XXX), VAT Status, Billing Address, Assigned Salesperson (searchable employee list), Payment Terms, Credit Limit (₱ formatted)
- Metrics cards show: Total Customers, Active, New This Month, Total Revenue

**Sales Pipeline:**
- Salesperson views the **Kanban board** with 6 columns: Prospecting → Qualification → Proposal → Negotiation → Closed Won → Closed Lost
- **Drags** an opportunity card between columns to update stage
- Each column header shows count and aggregated ₱ value
- Summary bar: Pipeline Value | Open Deals | Total Deals

**Sales Activities:**
- Timeline/feed view showing recent activities chronologically
- "Log Activity" button → drawer with: Type (Call/Email/Meeting/Follow-up/Presentation/Site Visit), Date, Subject, Notes, linked Customer, linked Opportunity
- Filter by activity type

#### Cross-Module Ripple Effect
- **Customer created** → immediately available in Quotation client dropdown, Project client selection
- **Opportunity moved to "Closed Won"** → signals Quotation module that the linked quote is ACCEPTED, triggers project/procurement downstream, updates Sales Forecast achievement
- **Opportunity moved to "Closed Lost"** → loss reason captured, feeds win/loss analytics in Sales Reports
- **Activity logged** → visible in Sales Reports "Recent Activity" feed, contributes to salesperson activity score

#### System Automation & Guardrails
- **Customer code generation:** `GEEK-{year}-CUS-{4-digit sequence}` — system queries highest existing code for the year and increments
- **Input masking:** TIN auto-formats to XXX-XXX-XXX-XXX, phone to +63 9XX XXX XXXX
- **Currency formatting:** All ₱ fields display with thousands separators and 2 decimal places
- **Stage validation:** Pipeline stage must be one of the 6 defined stages — invalid values rejected with 400 error
- **Required field enforcement:** Company Name mandatory; form submit disabled until valid

---

### 3.3 Quotation Module

**Purpose:** Create, revise, approve, and deliver formal price quotations to customers with full PDF generation and revision history.

#### User Action
- Sales Rep clicks "New Quotation" → selects customer from CRM, enters project name
- Adds line items: product type, product code (from Master Data), description, quantity, UOM, unit cost (VAT ex), discount %
- Configures terms: Payment Terms, Delivery Terms, Validity (days), Bank Details, Cancellation Fee
- Sets VAT rate (default 12%), WHT rate, shipping cost, other charges
- **Saves as DRAFT** → can continue editing

**Status Workflow Actions:**
- "Submit for Approval" → DRAFT → FOR_APPROVAL
- Manager "Approve" → FOR_APPROVAL → APPROVED
- "Send to Client" → APPROVED → SENT
- "Mark Accepted" → SENT → ACCEPTED
- "Convert to Project" → ACCEPTED → CONVERTED

**Revision:**
- Click "Create Revision" on an APPROVED/SENT/REJECTED quotation
- System clones the quotation with suffix `-R{n}` and resets to DRAFT
- Original remains unchanged for audit trail

**PDF Export:**
- Click "Download PDF" → generates A4 document with full company letterhead, client details, itemized table, totals, terms, signature block

#### Cross-Module Ripple Effect
- **Quotation ACCEPTED** → CRM opportunity auto-moves to "Closed Won"; Finance signaled to draft invoice; Project module can auto-spawn project record
- **Quotation CONVERTED** → Project created with contract value, client, and material list inherited from line items
- **Revision created** → quotation_history logs the event; parent quotation linked via `parent_quotation_id`
- **Line items reference products** → ensures pricing consistency with Master Data

#### System Automation & Guardrails
- **Number generation:** `QTN-YYYYMM-NNN` with `-R{n}` for revisions
- **Validity date auto-calculated:** `today + validity_days`
- **Status transition enforcement:** Only valid transitions allowed (e.g., cannot go DRAFT → SENT directly)
- **Edit lock:** Only DRAFT or REJECTED quotations can be edited; approved/sent are immutable
- **Delete restriction:** Only DRAFT quotations can be deleted
- **History tracking:** Every status change, edit, and revision logged to `quotation_history` table with snapshot

---

### 3.4 Purchasing Module

**Purpose:** End-to-end procurement from purchase request through supplier evaluation to goods receipt.

**Flow:** PR → RFQ → Supplier Quotes → Comparison → PO → Approval → Goods Receipt

#### User Action

**Purchase Request:**
- Procurement clicks "New Purchase Request" → adds items (product code or description, quantity, estimated unit cost), sets required date, target warehouse
- System generates `PR-YYYYMM-NNN`
- Status: TO_PURCHASE

**Request for Quotation:**
- From a PR, clicks "Create RFQ" → selects suppliers from Supplier Master Data, sets due date
- System generates `RFQ-YYYYMM-NNN`, records each supplier as `rfq_supplier` with `sent_at`
- PR status advances to RFQ_SENT

**Supplier Quote Entry:**
- For each responding supplier, clicks "Add Quote" on the RFQ
- Enters: unit costs per item, delivery date, payment terms, shipping, duties, taxes, brokerage
- System generates `SQ-YYYYMM-NNN`, computes `landed_quote_total`
- PR status: QUOTE_RECEIVED

**Comparison & Selection:**
- Views side-by-side quote comparison (auto-sorted by landed cost, lowest first)
- Clicks "Select" on the winning quote → others marked REJECTED
- PR status: COMPARISON_DONE

**Purchase Order:**
- Clicks "Generate PO" from selected quote → system creates `PO-YYYYMM-NNN`
- PO pre-filled with supplier details, items, costs from the selected quote
- Submits PO for approval via Workflow Approval
- Upon approval: status → APPROVED → PO_SENT to supplier

**Goods Receipt:**
- When goods arrive, clicks "Receive" on the PO → enters received quantities per item
- System generates `GR-YYYYMM-NNN`
- If all items fully received → PO status: RECEIVED
- If partial → PO status: PARTIALLY_RECEIVED

#### Cross-Module Ripple Effect
- **Goods Receipt created** → Inventory module auto-increments stock at the receiving warehouse; movement record logged as STOCK_IN
- **PO Approved** → Accounts Payable creates a liability entry for the expected supplier invoice; Dashboard "PO Approved" count increments
- **Purchase Request from Project** → materials linked back to the project; upon receipt, project material status updates
- **Supplier evaluation data** → quote response times and pricing feed supplier performance analytics

#### System Automation & Guardrails
- **Sequential numbering:** All document numbers (PR, RFQ, SQ, PO, GR) use `PREFIX-YYYYMM-NNN` with auto-increment
- **Landed cost calculation:** item total + shipping + duties + taxes + brokerage (stored internally as `freight` and `other_charges`) — computed server-side
- **3-way match:** PO items cross-referenced against GR quantities — discrepancies flagged
- **Cascade delete protection:** Deleting a PR cascades to RFQs, quotes, POs, and receipts (with full audit trail)
- **Approval recording:** PO approvals stored in `purchase_order_approvals` with approver, decision, date, remarks

---

### 3.5 Projects Module

**Purpose:** Manage project delivery from planning through closure, with budget tracking, milestone billing, and resource allocation.

#### User Action

**Project Creation:**
- Project Manager clicks "New Project" → selects client, enters project name, contract value, budget, dates
- Can link to a converted quotation for traceability
- System generates `GEEK-YYYY-PRJ-NNNN`
- Status: PLANNING

**Project Tabs:**
- **Overview** — KPIs (contract value, total cost, gross profit, margin %), status, progress bar, PM assignment
- **Budget** — Line items: category, description, budgeted amount, actual amount; variance auto-computed
- **Milestones** — Target dates, billing amounts, completion dates, billing status (PENDING/COMPLETED/BILLED)
- **Tasks** — Assignee, start/due dates, status (TODO/IN_PROGRESS/DONE), progress %
- **Materials** — Product code, description, quantity, unit cost, total cost, status (PLANNED/ORDERED/RECEIVED)
- **Documents** — Attached files (contracts, plans, deliverables) with upload metadata
- **Profitability** — Computed view: material cost + budget actual = total cost; gross profit = contract - total cost; gross margin %

**Key Actions:**
- "Assign Manager" → sets project_manager_id, logged in audit
- "Update Progress" → adjusts completion_percent; auto-transitions to IN_PROGRESS when >0%, COMPLETED at 100%
- "Close Project" → sets status CLOSED, records closed_at and closed_by
- "Bill Milestone" → marks milestone is_billed=true, signals Finance to issue invoice

#### Cross-Module Ripple Effect
- **Material added** → checks Inventory for stock availability; if insufficient, can trigger Purchase Request
- **Milestone billed** → Accounts Receivable creates invoice for billing_amount; AR Aging starts tracking
- **Project closed** → final profitability computed; Dashboard "Active Projects" decrements; data feeds BI Analytics
- **Budget exceeded** → warning surfaced on Dashboard; approval required for additional spend via Workflow

#### System Automation & Guardrails
- **Project code generation:** `GEEK-{year}-PRJ-{4-digit sequence}`
- **Financial auto-calculation:** `gross_profit = contract_value - (material_cost + budget_actual)`; `gross_margin = gross_profit / contract_value * 100`
- **Cascade relationships:** Project deletion cascades to budget items, milestones, tasks, materials, documents
- **Status flow:** PLANNING → IN_PROGRESS → ON_HOLD → COMPLETED → CLOSED
- **Material total_cost:** Auto-computed as `quantity × unit_cost` on save

---

### 3.6 Inventory Module

**Purpose:** Real-time stock visibility across warehouses, movement tracking, and reorder management.

#### User Action

**Inventory List:**
- Warehouse Clerk sees all stock records with: item code/name, brand, warehouse, quantity on hand, reserved, available, reorder level, unit cost, inventory value, status badge
- Color-coded statuses: ACTIVE (green), LOW_STOCK (amber), OUT_OF_STOCK (red)
- Summary cards: Inventory Value, Low Stock count, Out of Stock count, Warehouse count

**Stock Operations:**
- **Add Stock** → select product (from Master Data), warehouse, enter quantity, reorder level, unit cost → creates/updates stock record
- **Stock In** → movement type STOCK_IN; increases quantity at target warehouse
- **Stock Out** → movement type STOCK_OUT; decreases quantity (validated: cannot go negative)
- **Transfer** → movement type TRANSFER; decreases source warehouse, increases target warehouse
- **Adjustment** → movement type ADJUSTMENT; sets quantity to a specific value

**Warehouse Management:**
- Create warehouses with code, name, type, address, contact person, contact number
- Track stock levels per warehouse with aggregated value

#### Cross-Module Ripple Effect
- **Stock below reorder level** → status auto-changes to LOW_STOCK; Dashboard "Low Stock" counter increments; Procurement alerted
- **Goods Receipt from PO** → auto STOCK_IN movement; inventory reflects immediately
- **Project material allocation** → reserved_quantity increases, available_quantity decreases
- **Inventory Value change** → Dashboard "Inventory Value" KPI updates; GL asset account adjusted

#### System Automation & Guardrails
- **Movement numbering:** `INV-YYYYMMDDHHMMSSffffff` — unique timestamp-based
- **Negative stock prevention:** Stock Out and Transfer validate `quantity ≤ quantity_on_hand`
- **Auto-status computation:** `quantity_on_hand = 0` → OUT_OF_STOCK; `quantity_on_hand ≤ reorder_level` → LOW_STOCK; else ACTIVE
- **Product validation:** Cannot create stock for a product_code that doesn't exist in Master Data
- **Warehouse validation:** Cannot create stock for a warehouse_id that doesn't exist
- **Movement audit trail:** Every stock change creates an immutable movement record with reference_no and remarks

---

### 3.7 Finance & Accounting Module (AR / AP / GL)

**Purpose:** Complete financial management — billing, payments, ledger, and reporting.

#### User Action

**Accounts Receivable:**
- Finance creates **Sales Invoices** (`INV-YYYY-NNNN`) linked to quotations/projects
- Records **Official Receipts** (`OR-YYYY-NNNN`) when payments arrive
- Views **AR Aging Report**: Current / 1–30 / 31–60 / 61–90 / 90+ days
- Sends payment reminders for overdue accounts
- Applies credit memos and debit notes

**Accounts Payable:**
- Records **Supplier Invoices** matched against POs and Goods Receipts (3-way match)
- Creates **Payment Vouchers** (`PV-YYYY-NNNN`) for approval
- Views **AP Aging Report**: Current / 1–30 / 31–60 / 61–90 / 90+ days
- Processes payments via check or bank transfer
- Tracks early payment discounts

**General Ledger:**
- Manages **Chart of Accounts** (Assets, Liabilities, Equity, Revenue, Expenses)
- Creates manual **Journal Entries** for adjustments, accruals, provisions
- Auto-posts from AR/AP transactions
- Generates: **Income Statement**, **General Ledger Report**
- Supports multi-entity consolidation (EXSSI, GreatnessLab, Exigent, KSI)

#### Cross-Module Ripple Effect
- **Invoice issued** → AR balance increases; Dashboard "Accounts Receivable" KPI updates; Tax module computes Output VAT
- **Payment received** → Cash position increases; AR balance decreases; Revenue recognized
- **Supplier paid** → AP balance decreases; Cash position decreases; Input VAT claimable
- **Journal entry posted** → immediately reflected in financial statements and Dashboard KPIs
- **Month-end close** → all sub-ledger balances reconciled to GL control accounts

#### System Automation & Guardrails
- **Document numbering:** All financial documents auto-numbered with year prefix
- **3-way match enforcement:** Supplier invoice amount validated against PO amount and GR quantities
- **Double-entry enforcement:** Every journal entry must balance (total debits = total credits)
- **Period control:** Closed periods locked — no backdated entries without supervisor override
- **Credit limit check:** Customer invoices blocked if outstanding AR exceeds credit_limit from Master Data
- **Currency standardization:** All amounts in Philippine Peso (₱) with 2 decimal precision

---

### 3.8 Tax & Compliance Module

**Purpose:** Automated Philippine tax computation, BIR form preparation, and LOA audit readiness.

#### User Action

**Tax Dashboard:**
- Finance views current period tax positions: Output VAT, Input VAT, Net VAT payable/claimable
- EWT/CWT tracking per transaction with BIR tax codes
- Filing deadline calendar with color-coded urgency

**BIR Form Generation:**
- Clicks "Generate BIR 2550M" → system pulls all VATable sales and purchases for the month
- Reviews auto-populated form fields, makes adjustments if needed
- Marks as "Filed" with filing date and reference number

**LOA Retrieval:**
- Searches for any document by date range, client, supplier, document type, amount range
- System returns all supporting documents (invoices, receipts, vouchers, POs) with full audit trail
- One-click export to ZIP for BIR examiner delivery

#### Cross-Module Ripple Effect
- **Every Sales Invoice** → Output VAT auto-computed and recorded in tax ledger
- **Every Purchase Invoice** → Input VAT captured, claimable against Output VAT
- **Every payment with WHT** → BIR 2307 certificate auto-generated for the customer/supplier
- **Payroll processed** → withholding tax on compensation auto-computed; SSS/PhilHealth/Pag-IBIG contributions calculated

#### System Automation & Guardrails
- **VAT auto-computation:** 12% on VATable transactions; Non-VAT customers/suppliers flagged from Master Data
- **Tax calendar:** Hardcoded Philippine filing deadlines with countdown alerts on Dashboard
- **BIR form templates:** Pre-mapped fields from GL data — reduces manual data entry errors
- **Document indexing:** All transactions tagged with BIR-relevant metadata for instant LOA retrieval
- **Multi-entity support:** Tax computations per legal entity (EXSSI, GreatnessLab, Exigent, KSI)

---

### 3.9 HR & Payroll Module

**Purpose:** Employee lifecycle management, time tracking, statutory compliance, and compensation processing.

#### User Action

**HR Management:**
- HR maintains employee **201 files**: personal info, employment history, documents, certifications
- Manages **Recruitment pipeline**: Job Postings → Applications → Interview → Offer → Onboarding
- **Leave Management:** Employee submits leave request → Manager approves via Workflow → balance deducted
- **Attendance Tracking:** Daily time records, overtime computation, undertime flags
- **Performance Reviews:** Periodic evaluations linked to employee records

**Payroll Management:**
- HR runs **payroll cycle** (semi-monthly or monthly):
  1. System pulls: basic salary, overtime, allowances, commissions
  2. Auto-deducts: SSS, PhilHealth, Pag-IBIG (based on contribution tables)
  3. Computes: withholding tax on compensation (per BIR tax table)
  4. Applies: loans, cash advances, other deductions
  5. Generates: net pay per employee
- **Payslip generation** with full breakdown
- **13th month pay** auto-computed annually
- **Bank file generation** for mass salary crediting

**Commission Management:**
- Define commission structures per role/salesperson
- System auto-computes: commission = deal value × commission rate (from Closed Won opportunities)
- Commission appears in next payroll cycle as additional compensation

#### Cross-Module Ripple Effect
- **Payroll processed** → GL entries posted (DR Salary Expense, CR Cash; DR various accounts for employer contributions)
- **Statutory deductions** → Tax module captures withholding tax; amounts feed BIR 1601-C monthly remittance
- **Leave approved** → Employee availability reflected in Project task assignment pools
- **Commission earned** → links back to CRM Opportunities with "Closed Won" status and assigned salesperson
- **New employee onboarded** → immediately available in system-wide employee dropdowns (salesperson, PM, approver)

#### System Automation & Guardrails
- **Contribution tables:** SSS, PhilHealth, Pag-IBIG rates auto-applied based on salary bracket
- **Tax table compliance:** Withholding tax computed per BIR graduated tax rate schedule
- **Leave balance enforcement:** Request rejected if balance insufficient
- **Payroll lock:** Approved payroll cannot be modified without reversal journal entry
- **Audit trail:** Every payroll run logged with approver, total amount, employee count

---

### 3.10 AI Analytics & Executive Intelligence

**Purpose:** Natural language querying, predictive insights, and board-level consolidated reporting.

#### User Action

**Executive AI Assistant:**
- Executive types natural language queries in a chat interface
- AI interprets intent, queries relevant modules/tables, returns structured answers
- Examples:
  - "What's our win rate this quarter?" → queries CRM (Won / Total opportunities)
  - "List all pending approvals assigned to me" → queries Workflow Approval
  - "Project GEEK-2026-PRJ-0015 profitability summary" → queries Projects financials
  - "Compare Q1 vs Q2 revenue" → queries GL Revenue accounts by period
- Responses include: data tables, charts, and links to source records

**Board Dashboard:**
- Consolidated view across all 4 entities (EXSSI, GreatnessLab, Exigent, KSI)
- Group-level: Total Revenue, Total Expenses, Net Income, Headcount
- Entity breakdown with drill-down capability
- Year-over-year comparison charts

**BI Analytics:**
- Self-service report builder with drag-and-drop dimensions/measures
- Pre-built reports: Sales Funnel, Revenue Trend, AR Aging, Project Margin Analysis
- Export to PDF/Excel/CSV
- Scheduled report delivery via email

#### Cross-Module Ripple Effect
- **AI queries are read-only** → no data modification through the assistant
- **Board Dashboard** → consolidates GL data across all entities with intercompany elimination
- **Anomaly detection** → AI flags unusual patterns (sudden AR spike, expense outlier, inventory discrepancy) → surfaces as Dashboard alerts

#### System Automation & Guardrails
- **Query audit:** Every AI query and response logged for compliance
- **Data access respects roles:** AI only returns data the user's role permits
- **No hallucination on financials:** AI grounds all numeric responses in actual GL/AR/AP data
- **Rate limiting:** Prevents excessive queries that could impact system performance

---

## 4. Exception Handling & Auditing

---

### 4.1 Approval Rejections

**Scenario:** A quotation, PO, or payment voucher is rejected by the approver.

**System Behavior:**
1. Status transitions to **REJECTED** with mandatory `remarks` from approver
2. Audit log records: who rejected, when, from which IP, with what reason
3. Original submitter is notified (Dashboard "Pending Approvals" reflects rejection)
4. Document returns to editable state (DRAFT for quotations, can be revised and resubmitted)
5. Rejection history preserved in `quotation_history` / `purchase_order_approvals` for audit trail

> **Business Rule:** A rejected document must be revised (new content) before resubmission — the system prevents resubmitting the exact same version without changes.

---

### 4.2 Financial Discrepancy Flags

**Scenario:** A supplier invoice amount doesn't match the PO or Goods Receipt.

**System Behavior:**
1. 3-way match comparison runs: PO line amounts vs GR received quantities × unit cost vs supplier invoice amount
2. If variance exceeds tolerance threshold → invoice flagged as **DISCREPANT**
3. Flag appears in AP dashboard with variance amount and affected line items
4. Requires manual review and either:
   - Adjustment (debit note to supplier for overcharge)
   - Approval override with documented justification (audit-logged)
5. Payment voucher cannot be generated for discrepant invoices until resolved

---

### 4.3 Tax Calculation Anomalies

**Scenario:** A tax computation triggers an unusual result (e.g., negative VAT, WHT exceeding invoice amount).

**System Behavior:**
1. Validation runs on all tax computations before posting
2. Anomalous calculations flagged with warning indicator
3. Finance user must review and either:
   - Correct the source transaction (invoice amount, tax code, VAT status)
   - Override with supervisor approval (logged with justification)
4. BIR form generation blocked until all flagged items resolved
5. System maintains a **Tax Exception Log** visible to auditors

---

### 4.4 Inventory Constraint Violations

**Scenario:** A stock-out operation or transfer requests more quantity than available.

**System Behavior:**
1. Server validates: `requested_quantity ≤ quantity_on_hand` (net of reserved)
2. If violated → HTTP 400 response: "Not enough stock on hand"
3. Operation blocked — no partial fulfillment without explicit user action
4. Warehouse Clerk can:
   - Reduce the requested quantity
   - Perform a stock adjustment first (with documented reason)
   - Create a Purchase Request for the shortfall
5. All validation failures logged in system error logs (not audit trail, as no mutation occurred)

---

### 4.5 Duplicate Record Prevention

**Scenario:** User attempts to create a record with a code/identifier that already exists.

**System Behavior:**
1. Unique constraint check at database level (product_code, warehouse_code, employee email, customer_code)
2. If duplicate detected → HTTP 400/409: "A record with these details already exists" (friendly message via `db_http_error`)
3. Form remains open with user's input preserved — they can modify and retry
4. No partial data saved — transaction rolls back completely

---

### 4.6 Authentication & Authorization Failures

**Scenario:** Invalid login attempt or unauthorized access to a protected resource.

**System Behavior:**

**Failed Login:**
1. System verifies email exists and password hash matches
2. If credentials invalid → HTTP 401: "Incorrect email or password"
3. If account disabled → HTTP 403: "Account is disabled"
4. **Every failed attempt is audit-logged** with: attempted email, IP address, failure reason, timestamp
5. Repeated failures visible in Administration audit view for security monitoring

**Unauthorized Access:**
1. If JWT expired or missing → HTTP 401 with `WWW-Authenticate: Bearer` header
2. If user's roles don't include required role → HTTP 403: "You do not have permission to access this resource"
3. Frontend catches 401 → clears token, redirects to login
4. No sensitive data exposed in error responses

---

### 4.7 Comprehensive Audit Trail Architecture

**Every mutation in the system produces an audit record containing:**

| Field | Description |
|-------|-------------|
| `log_id` | Unique sequential identifier |
| `employee_id` | ID of the acting user |
| `performed_by` | Email of the acting user |
| `action` | Verb: CREATE, UPDATE, DELETE, ARCHIVE, STATUS_CHANGE, LOGIN, LOGOUT, LOGIN_FAILED, REVISE, DUPLICATE |
| `module_name` | Which module (CRM, Purchasing, Projects, Authentication, etc.) |
| `description` | Human-readable summary (e.g., "Updated client TechCorp — address: old → new") |
| `record_id` | ID of the affected record |
| `old_values` | JSON snapshot of record state BEFORE the change |
| `new_values` | JSON snapshot of record state AFTER the change (includes `description` and `http` metadata) |
| `ip_address` | Client IP (respects X-Forwarded-For for proxied requests) |
| `created_at` | Timestamp of the event |

**HTTP Metadata (embedded in `new_values.http`):**

| Field | Description |
|-------|-------------|
| `request_id` | UUID correlating all events in a single HTTP request |
| `method` | HTTP method (GET, POST, PATCH, DELETE) |
| `endpoint` | API path (e.g., `/crm/customers/42`) |
| `status_code` | Response status |
| `success` | Boolean (status < 400) |
| `duration_ms` | Request processing time |
| `user_agent` | Browser/client identifier |

**Audit Log Capabilities:**
- **Search** across module, action, performer
- **Filter** by date range, module, action type
- **Export to CSV** with full HTTP metadata flattened — suitable for BIR LOA submission
- **Immutable** — audit records cannot be modified or deleted through the API

---

### 4.8 LOA / BIR Audit Readiness

**Scenario:** BIR issues a Letter of Authority (LOA) requesting specific financial records.

**System Behavior:**
1. Auditor navigates to **LOA Retrieval** module
2. Searches by: date range, entity (EXSSI/GreatnessLab/Exigent/KSI), document type, client/supplier, amount range
3. System returns all matching records with:
   - Original documents (invoices, receipts, POs, vouchers)
   - Supporting audit trail (who created, approved, modified)
   - GL journal entries linked to each transaction
4. One-click export packages all documents with index sheet
5. Complete chain of custody demonstrated: from quotation → PO → GR → invoice → payment → GL posting

> **Business Rule:** The system retains all records for a minimum of 10 years (Philippine regulatory requirement). No bulk deletion is permitted on financial records without SUPER_ADMIN approval and documented justification.

---

### 4.9 Workflow Approval Escalation

**Scenario:** An approval sits pending beyond the configured SLA.

**System Behavior:**
1. Workflow engine monitors elapsed time since submission
2. At SLA threshold (e.g., 48 hours for quotations, 24 hours for POs):
   - Escalation notification sent to next-level approver
   - Dashboard "Pending Approvals" marks item as **Urgent**
3. At critical threshold (e.g., 72 hours):
   - Escalation to department head
   - System logs escalation event in audit trail
4. Auto-approval is **never** triggered — human approval always required for financial commitments

---

*Document generated from GEEK ERP codebase analysis — June 2026*
