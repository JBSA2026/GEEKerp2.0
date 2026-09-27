# GEEK ERP Platform

## Overview

GEEK ERP is a custom-built Enterprise Resource Planning system designed for the GEEK Group of companies. The platform serves as a centralized business management solution, replacing scattered Excel-based tracking with a unified, web-based application.

**Objective:** To provide a single integrated system that connects Sales, Purchasing, Inventory, Projects, Accounting, Finance, HR, Payroll, Tax, Compliance, Document Management, Workflow Approval, and Executive Reporting — all under one roof, with full audit trail capabilities and LOA-ready data retrieval for regulatory compliance.

**Covered Entities:**
- EXSSI
- GreatnessLab
- Exigent Corporation
- KSI

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS v4, Radix UI, Lucide React, Sonner, react-day-picker, @dnd-kit/core |
| Backend | Python 3.14, FastAPI, Pydantic, Uvicorn, bcrypt, python-jose (JWT) |
| Database | Supabase (PostgreSQL only — no Supabase Auth) |
| Package Manager | uv (backend), npm (frontend) |

---

## Module Status Summary

| # | Module | Status | Backend | Frontend |
|---|--------|--------|---------|----------|
| 1 | Authentication & Access Control | ✅ Complete | auth.py (9.7KB) | Login.jsx (4.7KB) |
| 2 | Master Data Management | ✅ Complete | master_data.py (15.8KB) + 7 resource routers | masterdata/ (82KB across 5 files) |
| 3 | CRM / Sales | ✅ Complete | crm.py + leads.py + opportunities.py + sales_activity.py + sales_forecast.py + sales_orders.py (47KB total) | CRM.jsx (42KB) + 6 sub-pages (127KB) |
| 4 | Quotation | ✅ Complete | quotations.py (51.6KB) | Quotation.jsx (89KB) |
| 5 | Purchasing | ✅ Complete | purchasing.py (44.5KB) + intercompany.py | Purchasing.jsx (85KB) |
| 6 | Projects | ✅ Complete | projects.py (56.9KB) | Projects.jsx (72KB) |
| 7 | Inventory | ✅ Complete | inventory.py (45.2KB) + warehouses.py (6.2KB) | Inventory.jsx (64KB) |
| 8 | Accounts Receivable | ✅ Complete | ar.py (88.3KB) + ar_ap_calc.py (13.5KB) | AccountsReceivable.jsx (42KB) |
| 9 | Accounts Payable | ✅ Complete | ap.py (108.3KB) + ar_ap_calc.py (shared) | AccountsPayable.jsx (61KB) |
| 10 | General Ledger | ✅ Complete | general_ledger.py (36.8KB) | GeneralLedger.jsx (74KB) |
| 11 | HR Management | ✅ Complete | hr.py (148.4KB) + employees.py (12.9KB) | HRManagement.jsx (6KB) + 9 sub-pages (258KB) |
| 12 | Payroll | ✅ Complete | payroll.py (27KB) | Payroll.jsx (43KB) |
| 13 | Tax Management | ✅ Complete | tax.py (17.3KB) | TaxManagement.jsx (49KB) |
| 14 | LOA (Letter of Authority) | ✅ Complete | loa.py (32.8KB) | LOA.jsx (41KB) |
| 15 | Workflow Approval | ✅ Complete | workflow_approval.py (52.4KB) | WorkflowApproval.jsx (31KB) |
| 16 | Document Management | ✅ Complete | company_documents.py (43.8KB) + documents.py (3.6KB) | DocumentManagement.jsx (52KB) |
| 17 | Integration Engine | ✅ Complete | integration_calc.py (40.2KB) | (embedded in AP/AR/Quotation UIs) |
| 18 | Administration | ✅ Complete | employees.py + audit_logs.py (21KB) | Administration.jsx (35KB) |
| 19 | Dashboard | ⚠️ Partial | dashboard.py (summary endpoint) | Dashboard.jsx (24.5KB) — frontend integration pending |
| 20 | Audit Trail | ✅ Complete | audit_logs.py (8.4KB) + AuditMiddleware | Embedded in Administration |
| 21 | Commission Management | 🚧 In Progress | commission.py (10KB) | — |
| 22 | OJT & Internship | 🚧 In Progress | ojt.py (standalone) | OJTManagement.jsx (existing in HR) |
| 23 | Reports (Report Center) | 🚧 In Progress | reports.py (backend only) | moduleRoutes + page scaffolding |

---

## Detailed Module Breakdown

### 1. Authentication & Access Control — ✅ Complete

- Email + password login verified against bcrypt-hashed employee records
- JWT sessions (8-hour lifespan) with embedded role claims
- **RBAC Layer:** Module-level and action-level permission checks via `require_module_access()` and `require_action()` dependencies in `middleware/access_control.py`
- `can(user_perms, action, module)` — pure permission check function
- Permission hierarchy: `limited` < `view` < `approve` < `create_edit` < `manage` < `full`
- Supported roles: SUPER_ADMIN, HR_MANAGER, SALES_USER, FINANCE_USER, PURCHASING_USER, PROJECT_MANAGER, etc.
- Denied access attempts logged to `access_denied_log` table with module, action, and endpoint
- Audit-logged: every login, failed attempt, and logout recorded with IP/timestamp
- Frontend: `hasRole()` utility for conditional UI rendering, `ModuleGuard` for route protection

### 2. Master Data Management — ✅ Complete

**Supported Resources:** Clients, Products, Employees, Suppliers, Documents, Contacts, Leads, Sales Activity, Opportunities, Sales Forecast, Services, Warehouses

**Capabilities:**
- Full CRUD per resource
- Bulk archive, restore, and delete
- Case-insensitive multi-field search
- Status filtering (active/archived)
- CSV export with filters applied
- Tabbed navigation with count badges
- RecordDrawer for add/edit with field definitions per resource
- Automatic `created_at`/`updated_at` timestamps

### 3. CRM / Sales Module — ✅ Complete

**Sub-modules (6 sub-pages + main CRM tab view):**

| Sub-module | File Size | Features |
|-----------|-----------|----------|
| Customer List | Part of CRM.jsx (42KB) | Table with search, status filter, auto-generated codes (GEEK-YYYY-CUS-NNNN), TIN masking, phone formatting, metric cards |
| Leads | Leads.jsx (19.6KB) | Status chips (New/Contacted/Qualified/Unqualified/Converted), color-coded badges, full CRUD |
| Opportunities | Opportunities.jsx (23KB) | Stage filter chips, probability %, estimated value, expected close date, competitor tracking |
| Sales Pipeline | SalesPipeline.jsx (33.7KB) | Drag-and-drop Kanban board (@dnd-kit), 6 stage columns, stage-gate validation (requires quotation for Proposal, sent quotation for Negotiation), deal detail panel with connected modules (quotations, approvals, sales orders, projects) |
| Sales Activities | SalesActivities.jsx (26.8KB) | Timeline feed, activity types (Call/Email/Meeting/Follow-up/Presentation/Site Visit), linked to customers/opportunities |
| Sales Forecast | SalesForecast.jsx (17KB) | Period-based quotas/targets, attainment % color coding |
| Sales Reports | SalesReports.jsx (7.4KB) | KPI cards, pipeline breakdown, recent activity feed |

**Pipeline Stage-Gate Logic:**
- Prospecting → Qualification: free move
- Qualification → Proposal: requires a linked quotation
- Proposal → Negotiation: requires quotation status SENT/APPROVED
- Negotiation → Closed Won: triggers automation (sales order, project creation, inventory reservation, AR invoice)
- Any → Closed Lost: confirmation dialog
- Cannot skip stages; can reopen Closed Won with downstream impact warning

### 4. Quotation Module — ✅ Complete

- Full quotation lifecycle: Draft → For Approval → Approved → Sent → Converted/Rejected
- Line items with product/service selection, quantities, unit prices, tax codes
- Revision tracking with history log
- Auto-generated quotation numbers (QTN-YYYY-NNNN)
- PDF export (quotationPdf.js — 18.7KB, client-side generation with jsPDF)
- Duplicate quotation capability
- Rejected → auto-creates follow-up draft
- **Closed Won Automation:**
  - Creates/updates Sales Order from quotation lines
  - Reserves inventory for product items
  - Creates replenishment Purchase Requests for insufficient stock
  - Triggers Project creation (for service items)
  - Creates draft AR Invoice
- Connected to Workflow Approval module
- Linked to CRM Pipeline (opportunity stage sync)

### 5. Purchasing Module — ✅ Complete

**Full procurement lifecycle:** PR → RFQ → Supplier Quote → PO → Receive

- **Purchase Requests (PR):** Create with line items, auto-numbered, status tracking (Open/Partially Fulfilled/Fulfilled/Cancelled)
- **Request for Quotation (RFQ):** Generate from PR, send to multiple suppliers
- **Supplier Quotes (SQ):** Record supplier responses per RFQ with line-level pricing; suppliers may submit versioned revisions for the same RFQ (for example, `EXP-YYYY-SQ-NNNN-V2`), while each quotation number remains unique; select the winning quote
- **Purchase Orders (PO):** Auto-generated from selected supplier quote, status lifecycle (Draft/Issued/Partially Received/Received/Cancelled)
- **Receiving:** Partial/full receiving with quantity tracking, auto-creates inventory stock entries, generates product codes for new items, and assigns each receipt to the Purchase Request's owning entity (with a legacy PO-prefix fallback). Stock from different entities remains in separate records even when product, warehouse, and location match.
- **Inter-Company Automation:** When a PO is sent to an internal supplier (one with `linked_entity`), the system auto-creates a DRAFT AR invoice on the seller entity's books, finds/creates the buyer as a client, maps PO items to AR invoice items, and records an `intercompany_links` entry tying the two together
- Cross-module integration: Low-stock auto-PR from Inventory, material PR from Projects
- Summary metrics and metadata endpoints

### 6. Projects Module — ✅ Complete

- Project creation with auto-generated codes, client/manager assignment
- **Milestones:** Create, update, bill (triggers AR invoice), completion tracking
- **Tasks:** CRUD with assignment, status, due dates; adding/updating/deleting a task auto-recomputes the project's completion %
- **Budget Items:** Line-level budget tracking with actual vs. planned
- **Materials:** Stock reservation, issuance, auto-PR for insufficient stock, release reservations on cancel
- **Documents:** Attach files to projects
- Status lifecycle: Planning → In Progress → On Hold → Completed → Closed
- Auto-progress tracking: completion % = (DONE tasks / total tasks) × 100; status auto-advances to In Progress on any progress and Completed at 100% (Closed/Cancelled projects are never auto-changed)
- Manager assignment, archive/close
- Auto-created from Closed Won quotation (service-type items)
- Financial computations: budget vs. actual, material costs, billing totals

### 7. Inventory Module — ✅ Complete

- **Stock Management:** Full CRUD with product code, name, quantity, unit, reorder level, warehouse/location assignment
- **Stock Movements:** Stock-in, stock-out, transfer between locations, movement history with reference numbers
- **Locations:** Warehouse → Location hierarchy, create/update/delete locations
- **Pending Transfers:** Inter-location transfers requiring receiving confirmation
- **Low-Stock Auto-PR:** When stock falls below reorder level, automatically creates Purchase Request
- **Summary View:** Aggregated stock status across all warehouses with status indicators (In Stock/Low Stock/Out of Stock)
- Connected to Purchasing (receiving creates stock), Projects (material reservation/issuance), Quotation (Closed Won inventory reservation)

### 8. Accounts Receivable — ✅ Complete

- **Invoices:** Full CRUD with line items, tax codes (VAT/EWT/CWT), auto-numbering (INV-YYYY-NNNN), status lifecycle (Draft → Confirmed → Partially Paid → Paid), archive/restore
- **Draft Invoice Generation:** From quotation (Closed Won) or from Sales Order
- **Collections:** Record payments against invoices, auto-recomputes invoice payment status, archive/restore
- **Invoice Receipts:** Official receipt generation linked to collections
- **Aging Report:** Current/30/60/90+ day buckets with customer breakdown
- **Statements:** Per-customer account statements with PDF generation
- **Overdue Customers:** List of customers with overdue balances
- **Tax Codes:** Manage AR-specific tax rates
- **Attachments:** Upload/manage supporting documents per invoice
- **Dashboard:** Summary metrics (total receivables, overdue amount, collection rate)
- Cross-module: syncs quotation invoicing status, linked to GL for posting

### 9. Accounts Payable — ✅ Complete

- **Bills:** Full CRUD with line items, tax treatment (Inclusive/Exclusive/Exempt), auto-numbering (BILL-YYYY-NNNN), status lifecycle (Draft → Confirmed → Partially Paid → Paid), archive/restore
- **Draft Bill Generation:** From Purchase Order (auto-maps PO lines to bill items)
- **Payment Vouchers:** Create vouchers grouping bills for payment, approval workflow (Draft → For Approval → Approved → Rejected), archive/restore
- **Payments:** Record payments against vouchers/bills, recomputes bill payment status
- **Check Monitoring:** Issue checks, track lifecycle (Issued → Cleared/Bounced/Cancelled), reverse payment on bounce
- **Aging Report:** Current/30/60/90+ day buckets with supplier breakdown
- **Payment Schedule:** Upcoming payment planning based on bill due dates
- **Supplier Balances:** Outstanding balance per supplier
- **Attachments:** Upload/manage supporting documents per bill
- **Dashboard:** Summary metrics (total payables, overdue, upcoming payments)
- Cross-module: syncs PO billing status, syncs PR payment status, linked to GL

### 10. General Ledger — ✅ Complete

- **Shared Calculation Layer (`utils/reports_calc.py`):** Pure-function utilities for Trial Balance, Income Statement, and Balance Sheet computation — framework-free, used by the Reports Module aggregator to guarantee figures are computed identically everywhere
- **Chart of Accounts (CoA):** Full CRUD with account type (Asset/Liability/Equity/Revenue/Expense), account code, parent/child hierarchy, normal balance
- **Journal Entries:** Create with debit/credit lines (must balance), auto-numbered (JE-YYYY-NNNN), post/reverse/delete, review/reject workflow with remarks
- **Entry Templates:** Save and reuse common journal entry patterns
- **Sales Book:** Record sales transactions; recording auto-creates a GL journal entry (Dr: Accounts Receivable, Cr: Revenue + Output VAT)
- **Cash Disbursements Book:** Record cash disbursements; recording auto-creates and posts a GL journal entry (Dr: Accounts Payable, Cr: Cash in Bank + EWT Payable if applicable)
- **Purchases Book:** Record purchase transactions with supplier details, invoice references, tax treatment, and posting status; filterable by entity, date range, and posting status
- **BIR Loose-Leaf Excel Exports:** Cash Receipts Book, Cash Disbursements Book, Sales Book, Purchases Book, and General Journal exportable as XLSX in BIR-compliant loose-leaf format with taxpayer header, bold column headers, and totals row; filterable by entity and date range
- **Income Statement:** Revenue minus expenses for a period
- **General Ledger Report:** Account-level transaction detail with running balance
- **Journal Book Export:** Excel (XLSX) export of all entries
- **Metrics:** Total accounts, posted entries, unposted entries

### 11. HR Management — ✅ Complete

**Sub-modules (9 sub-pages):**

| Sub-module | File Size | Features |
|-----------|-----------|----------|
| Employee 201 | Employee201.jsx (40KB) | Comprehensive employee records, government numbers (SSS/PhilHealth/PagIBIG/TIN) with validation, department/position, employment history, metrics |
| Recruitment | Recruitment.jsx (33KB) | Job openings CRUD, applicant tracking with status pipeline (Applied/Screening/Interview/Testing/Offer/Hired/Rejected), metrics |
| OJT Management | OJTManagement.jsx (25KB) | Intern/trainee tracking, school/program, hours tracking, evaluation, mentor assignment |
| Leave Management | LeaveManagement.jsx (33KB) | Leave request filing with balance checking, approval/rejection workflow, leave types (VL/SL/EL/ML/PL/BL/SPL), balance initialization, PH holidays |
| Attendance | Attendance.jsx (22KB) | Daily time records (time-in/out), tardiness/undertime computation, metrics |
| Performance Evaluation | PerformanceEvaluation.jsx (26KB) | Periodic reviews, rating system, history per employee, department-level metrics |
| Training Records | TrainingRecords.jsx (26KB) | Certifications, courses, training history with date/provider/cost tracking, metrics |
| HR Reports | HRReports.jsx (34KB) | Demographics, leave utilization, attendance summary, training summary — all with CSV export |
| Document Manager | DocumentManager.jsx (17KB) | Employee document uploads (PDF/images) to Supabase Storage |

- Entity filter (GreatnessLab, Expedia, Exigent, KSI) shared across all sub-tabs
- Role-gated access (HR_MANAGER, SUPER_ADMIN)

### 12. Payroll — ✅ Complete

- **Payroll Employees:** Manage payroll-specific data (basic salary, allowances, bank account, statutory contributions opt-in)
- **Payroll Generation:** Compute gross pay, deductions (SSS, PhilHealth, PagIBIG, withholding tax), net pay per employee for a pay period. Manually-entered deductions on the employee record are treated as per-cutoff values (used directly without further division) and take priority; auto-computation from statutory tables is used only when fields are empty/zero. Approved commissions (status "Approved" or "For Payout") are automatically fetched and included as additional compensation in the payroll run.
- **Payroll Runs:** List, view, submit → approve → release lifecycle
- **Statutory Deductions:** Accurate computation tables for SSS (2024 schedule), PhilHealth (5% premium rate), PagIBIG (₱100/₱200 schedule), withholding tax (graduated brackets)
- **Loans:** Track employee loans with amortization, deduction per payroll, mark complete
- **Payslip:** Per-employee payslip view with earnings/deductions breakdown
- **Bank File Export:** Generate bank-uploadable file for salary crediting
- **Payroll Register Export:** CSV export of full payroll run
- **Dashboard:** Summary metrics (total payroll cost, employee count, average salary)

### 13. Tax Management — ✅ Complete

- **Tax Codes:** Manage tax types (VAT, EWT, CWT) with rates
- **VAT Summary:** Computed from AR invoices (output VAT) and AP bills (input VAT) for a period, with net VAT payable
- **WHT Summary:** Withholding tax totals from AP bills grouped by tax code, supplier breakdown
- **Filing Deadlines:** Automated BIR filing calendar (2550M, 2550Q, 1601-C, 1601-EQ, 1701Q, 1702Q, 2316, etc.) with due date computation, period tracking
- **Filing Records:** Record actual filing dates and reference numbers
- **Tax Reminders:** Automatic reminder generation from entity tax profiles and known BIR schedules (creates calendar + reminders in one step), workflow statuses (pending → in progress → for review → for approval → filed), urgency indicators, overdue alerts, and BIR form auto-sync for completion detection
- **Calendar Admin:** View tax calendar entries with admin overrides; entries are auto-generated rather than manually seeded
- **Dashboard:** Summary metrics (next deadline, total tax payable, filing compliance status)

### 14. LOA (Letter of Authority) Retrieval — ✅ Complete

- **BIR Form List:** Retrieve available BIR form types with descriptions
- **BIR Form Data Retrieval:** Pull transaction data matching a specific BIR form for a given period/entity
- **Sales Trail:** Complete audit trail of sales transactions (quotation → sales order → AR invoice → collection) with date/entity/TIN filtering
- **Purchase Trail:** Complete audit trail of purchase transactions (PR → PO → AP bill → payment) with date/entity/TIN filtering
- **Missing Documents:** Identify gaps in document chains (e.g., invoice without OR, PO without receiving report)
- **LOA Search:** Cross-module keyword search across all transaction types by date/entity/TIN/amount/reference number
- **LOA Summary:** Aggregated totals per transaction type for a period
- **LOA Export:** CSV export of search results for BIR submission

### 15. Workflow Approval — ✅ Complete

- **Multi-level Approval Engine:** Submit records from any module for approval
- **Connected Modules:** Quotations, Purchase Requests, Purchase Orders, Payment Vouchers, Leave Requests, Journal Entries, Bills — all trigger approval workflows
- **Approval Actions:** Approve, Reject, Return for Revision, Cancel, Escalate
- **Escalation:** Forward to higher authority with reason
- **Comments:** Add comments/notes to approval records
- **My Approvals:** View pending items assigned to current user
- **Connected Pending:** View items awaiting decisions across all modules
- **Source Status Sync:** Approval/rejection automatically updates the originating record's status
- **Metrics:** Total pending, approved today, rejected, average turnaround time
- **Export:** CSV export of approval history
- **Entity-aware:** Routes to correct approver based on entity/department

### 16. Document Management — ✅ Complete

**Unified document system (company_documents.py) aggregating documents from ALL modules:**

- **Document Sources:** Native uploads, HR documents, Project documents, CRM documents, Quotation documents, Purchasing documents (PR/RFQ/SQ/PO), AR documents (invoices/receipts), AP documents (bills/vouchers/checks), GL documents (journal entries)
- **File Upload:** PDF, images, DOCX, XLSX, CSV (max 25MB) to Supabase Storage
- **Version History:** Upload new versions, track version chain
- **Metadata:** Document type, entity, related module, status, owner, dates
- **Status Lifecycle:** Draft → Active → Archived
- **Search & Filter:** By type, entity, module, status, date range, keyword
- **External Download:** Signed URL generation for sharing
- **Metrics:** Total documents, by type, by entity, recent uploads
- **Export:** Document list CSV export

### 17. Integration Engine — ✅ Complete

**Cross-module computation layer (integration_calc.py):**

- PO billing eligibility (can a PO be billed? what quantities?)
- Quotation invoicing eligibility (can a quotation be invoiced?)
- Bill/invoice line item construction from source documents
- Bill/invoice total aggregation with tax computation
- Bill/invoice header construction with source references
- Duplicate detection (prevent double-billing/invoicing)
- Confirmation validation (all requirements met before confirming)
- Status change propagation across modules

### 18. Administration — ✅ Complete

- **Employee Account Management:** CRUD with password hashing, role assignment (multi-role per employee)
- **Role Configuration:** Assign/revoke roles, view role permissions
- **Audit Log Viewer:** Search, filter by module/action/date/user, view full request/response detail
- **Audit CSV Export:** Download filtered audit log
- **System Metrics:** User counts, active sessions, module usage

### 19. Dashboard — ⚠️ Partial (Backend Ready, Frontend Integration Pending)

The Dashboard page (24.5KB) is **fully designed** with a professional executive layout including:
- Hero stat cards (Total Revenue, Gross Profit)
- Secondary metrics row (Collections, AR, AP, Inventory Value)
- Tertiary metrics (Opportunities, Projects, Cash Position, Tax Payables, Pending Approvals, System Health)
- Revenue/Profit trend chart (SVG-based)
- Business Unit breakdown (horizontal bars)
- Project Status distribution
- Recent Activities feed
- Pending Approvals queue
- Compliance Deadlines

**Backend API (`dashboard.py`):**
- `GET /dashboard/summary?entity=` — Aggregates live metrics from across modules:
  - Opportunities: open count, pipeline value, total count, **by_stage breakdown** (for donut chart)
  - Projects: active count, total count, total budget, **by_status breakdown** (for donut chart)
  - Inventory: total value, item count, low-stock count
  - Accounts Receivable: outstanding balance, active invoice count
  - Accounts Payable: outstanding balance, active bill count
  - Employees: total, active headcount, **by_entity breakdown** (for donut chart)
  - Workflow Approvals: pending count with top 5 items
  - Purchase Orders: open count and total value
  - Recent Activity: last 8 audit log entries
- Entity-filterable (pass entity name or "All" for cross-entity view)

**Remaining:** The frontend still uses hardcoded/static data — needs to be wired to the `/dashboard/summary` endpoint.

### 20. Audit Trail — ✅ Complete

- `AuditMiddleware` captures every HTTP mutation (POST/PUT/PATCH/DELETE) with: user, timestamp, IP, module, action, request metadata
- Request IDs link related log entries
- Searchable/filterable via Administration module
- CSV export capability

### 21. Commission Management — 🚧 In Progress (Backend Only)

**Sub-modules:** Sales Commission, Agent Commission, Commission Approval, Cash Advance Recovery, Commission Payout

**Shared Calculation Layer (`utils/reports_calc.py`):** The `compute_commission()` pure function handles both Sales and Agent commission formulas (including WHT and cash advance recovery), used by both the Commission router and the Reports Module aggregator.

**Calculations:**
- **Sales Commission** = Collected Gross Profit × Commission Rate
- **Agent Commission** = Commission Base × Commission Rate
- **Commission WHT** = Commission Amount × 10% (BIR withholding tax on commissions)
- **Net Commission** = Commission Amount − WHT − Cash Advance Recovery

**Backend Endpoints (commission.py):**
- `GET /commission/records` — List with filters (entity, type, status, employee, search)
- `GET /commission/records/metrics` — Summary KPIs (total, pending, approved, paid, totals)
- `GET /commission/records/{id}` — Single record detail
- `POST /commission/records/compute` — Preview calculation without saving
- `POST /commission/records` — Compute and create commission record (auto-numbered COM-YYYY-NNNN)
- `GET /commission/projects` — Project financial data for commission form (contract value, total cost, gross profit, collected amount)

**Key Features:**
- Auto-generated commission numbers (COMPANY-YYYY-COM-NNNN)
- Configurable commission rates per entity/type (fetched from `commission_rates` table, default 5%)
- Cash advance recovery: automatically deducts outstanding employee advances from net payout
- Gross profit and gross margin percentage computation
- Project-based commission data: auto-populates contract value, total cost (budget actuals + materials), and collected amount (from AR invoices) per project
- Status lifecycle: Draft → Pending Approval → Approved → For Payout → Paid → Cancelled
- Audit-logged on creation

**Not Yet Implemented:**
- Frontend UI
- Commission approval workflow integration
- Payroll integration (commission amounts applied to net pay calculation)
- Payout batch processing endpoints
- Cash advance CRUD endpoints
- CSV export

### 22. OJT & Internship — 🚧 In Progress (Backend Scaffolding)

**Standalone module** extracted from HR Management for managing interns and trainees independently.

**Sub-modules:** Intern Registry, Task Logs, NDA Monitoring, Evaluations, Completion Certificates

**Key Features:**
- Intern CRUD with school, program, department, supervisor assignment, entity scoping
- Auto-generated expected hours (5 days/week × 8 hrs/day from start_date), editable
- Required hours validation (200–2000 range, default 480)
- Completion percentage computed from hours rendered vs. required
- Task logs with time-in/time-out, hours tracking, per-module tagging
- Task log approval workflow (Pending → Approved/Rejected) with supervisor notes
- NDA lifecycle tracking (Pending → Signed/Expired/Waived)
- Evaluation records (Draft → Completed) with recommendations (Retain/Extend/Complete/Terminate/Hire)
- Status lifecycle: Active → Completed/Withdrawn/Extended

**Backend Endpoints (ojt.py):**
- Intern CRUD: `GET /interns`, `GET /interns/{id}`, `POST /interns`, `PATCH /interns/{id}`
- Intern metrics: `GET /interns/metrics`
- Task log CRUD: `GET /task-logs`, `POST /task-logs`, `PATCH /task-logs/{id}`
- Auto-recalculates completion percentage on intern update
- Auto-completes intern status when required hours are met

**Not Yet Implemented:**
- NDA tracking endpoints
- Evaluation endpoints
- Frontend standalone page (currently OJTManagement.jsx lives under HR)
- Completion certificate generation
- Integration with HR module (data migration from HR sub-module)

### 23. Reports (Report Center) — 🚧 In Progress (Backend Only)

**Executive/manager-facing aggregation module** that surfaces data from other GEEK-ERP modules into seven report views. The Reports Module owns no source-of-truth data — every figure is derived from the same tables and shared calculation utilities (`utils/reports_calc.py`, `routers/ar_ap_calc.py`) that the originating modules use, guaranteeing figures reconcile with zero variance.

**Report Views (8 endpoints):**

| Report | Endpoint | Data Sources |
|--------|----------|--------------|
| Executive Overview | `GET /reports/executive-overview` | GL (revenue/net income), AR (outstanding), AP (outstanding), Projects (active count/contract value), CRM (open pipeline) |
| Financial Performance | `GET /reports/financial-performance` | GL posted lines + Income Statement (current vs. prior period comparison) |
| Cash Flow | `GET /reports/cash-flow` | GL Cash Receipts/Disbursements books, cash account balances |
| Project Profitability | `GET /reports/project-profitability` | Projects (contract value), budget items (actual cost), materials (quantity × unit cost) |
| Sales Performance | `GET /reports/sales-performance` | CRM Opportunities (pipeline by stage, closed won), Commission records (by employee) |
| AR/AP Health | `GET /reports/ar-ap-health` | AR invoices + collections (aging buckets), AP bills + payments (aging buckets), net exposure |
| Compliance Snapshot | `GET /reports/compliance-snapshot` | AR invoices (VAT output), AP bills (VAT input, EWT), BIR forms, tax filings |
| Action Items | `GET /reports/action-items` | AR overdue invoices, AP overdue bills, BIR unfiled/draft forms, Workflow pending approvals |

**Key Features:**
- All endpoints require `entity` (single entity — no "All") and `date_from`/`date_to` range
- RBAC-gated via `require_module_access("reports")`
- Response-level caching (60s TTL) via `@cached` decorator
- Concurrent data fetching with `ThreadPoolExecutor` for Executive Overview
- Prior-period comparison in Financial Performance (auto-computes equivalent prior date range)
- Aging buckets (Current/30/60/90+) for AR/AP Health using shared `aging_totals()` utility
- Project profitability sorted by gross margin percentage
- Action Items endpoint surfaces overdue/pending items with severity levels (critical/high/medium/low) and BIR statutory deadline awareness

**Shared Calculation Reuse:**
- `compute_income_statement()` from `utils/reports_calc.py` — same as GL module
- `ar_balance()` / `ap_balance()` from `routers/ar_ap_calc.py` — same as AR/AP modules
- `aging_totals()` / `aging_bucket()` from `routers/ar_ap_calc.py` — same as AR/AP aging reports
- `_account_map()` / `_posted_lines()` from `routers/general_ledger.py` — same as GL reports

**Frontend Routing (in progress):**
- Module route registered in `moduleRoutes.js` with sub-routes: executive-overview, financial-performance, cash-flow, project-profitability, sales-performance, ar-ap-health, compliance-snapshot, action-items

**Not Yet Implemented:**
- Full frontend UI (Report Center page components)
- PDF/CSV export of report views
- Drill-down navigation to source module records
- Cross-entity "All" mode

---

## Cross-Module Integrations

The following automated workflows connect modules:

| Trigger | Action |
|---------|--------|
| Pipeline → Closed Won | Creates Sales Order, reserves inventory, creates Project (services), creates draft AR Invoice |
| Pipeline → Reopen Won | Cancels draft downstream records, releases inventory reservations |
| Low Stock (Inventory) | Auto-creates Purchase Request |
| Project Material Added | Reserves stock or creates Purchase Request if insufficient |
| PO Sent to Internal Supplier | Auto-creates DRAFT AR invoice on the seller entity's books (inter-company), links via `intercompany_links` |
| PO Received | Creates Inventory stock entries with product codes |
| Quotation Approved | Submitted for Workflow Approval |
| Quotation Rejected | Auto-creates follow-up draft quotation |
| AR Invoice Confirmed | Updates quotation invoicing status |
| AP Bill Confirmed | Updates PO billing status, creates Purchases Book entry for BIR books |
| AP Payment Recorded | Updates bill payment status, syncs PR payment status, creates Cash Disbursement Book entry (with proportional VAT/EWT) |
| Check Bounced | Reverses associated payment |
| Cash Disbursement Posted (GL) | Auto-creates posted GL journal entry (Dr AP, Cr Cash + EWT) |
| Workflow Approved/Rejected | Updates source record status in originating module |
| Project Milestone Billed | Creates AR invoice for milestone amount |

---

## System Infrastructure

### Error Handling
- Global exception handlers return consistent JSON: `{"error": "<friendly>", "fields": {...}}`
- Postgres SQLSTATE codes mapped to friendly messages
- Validation errors formatted per-field for frontend form highlighting

### Toast Notifications
- Sonner-based themed toasts (success/error/warning)
- Wired into all CRUD operations across all modules

### Permissions System
- **Backend (RBAC):** `middleware/access_control.py` provides role-based access control:
  - `require_module_access(module)` — verifies module-level access
  - `require_action(module, action)` — verifies action-level permission
  - `can(perms, action, module)` — pure permission check function
  - `get_user_permissions()` — FastAPI dependency that returns the user's full permission set
- **Frontend:** `usePermissions` hook + `ModuleGuard` component for route protection
- Sidebar navigation dynamically shows/hides based on user roles and module access

### Design System
- CSS variable-based theming (dark sidebar, cool slate-blue palette)
- Reusable UI components: Button, Card, Badge, StatusBadge, Form/Field/Input, ConfirmDialog, ModalFrame, Overlay, DatePicker, Combobox, MaskedInput, Separator
- Layout components: AppLayout, Sidebar, Topbar
- Consistent patterns across all modules

---

## Database

**Supabase PostgreSQL** with:
- Custom JWT auth (no Supabase Auth)
- Service-role key for backend operations (bypasses RLS)
- Supabase Storage for file uploads (HR documents, company documents)
- Auto-managed timestamps via PostgreSQL triggers

**Migrations (supabase/migrations/):**
- `20260622030749_create_quotations_tables.sql` — Quotation and line items tables
- `20260622032412_add_quotation_template_fields.sql` — Template fields for quotations
- `20260622034142_add_quotation_company_field.sql` — Company/entity field
- `20260622040000_create_hr_documents_bucket.sql` — Storage bucket for HR files

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.14 with [uv](https://docs.astral.sh/uv/) package manager
- A Supabase project

### Installation

```bash
git clone <repo-url>
cd GEEK-ERP

# Backend
cd backend
uv sync

# Frontend
cd ../frontend
npm install
```

### Running

```bash
# Both servers (from frontend/)
npm run dev

# Or separately:
# Terminal 1
cd backend && uv run uvicorn main:app --reload

# Terminal 2
cd frontend && npm run dev:frontend
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Environment Variables

**Backend** (`backend/.env`):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
JWT_SECRET=your-random-secret-string
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=600
```

**Frontend** (`frontend/.env`):
```
VITE_API_URL=http://localhost:8000
```

---

## What Remains

| Item | Priority | Notes |
|------|----------|-------|
| Dashboard frontend integration | Medium | Backend `/dashboard/summary` endpoint ready; wire frontend to consume live data |
| Reports (Report Center) frontend | Medium | Backend complete (7 endpoints); frontend routing registered with 7 sub-routes; page components + export pending |
| Unit/integration tests | Low | Test framework (Vitest) is set up but coverage is minimal |
| Service Management module | Not Started | Tickets, PMS, SLA tracking |
| LMS Management module | Not Started | Licenses, training courses |
| Commission Management | 🚧 In Progress | Backend router complete (records CRUD, compute, metrics); frontend UI + approval/payout endpoints pending |
| OJT & Internship (standalone) | 🚧 In Progress | Intern CRUD + task log CRUD endpoints complete; NDA/evaluations endpoints, frontend extraction from HR, and certificate generation pending |
| Executive AI Assistant | Not Started | Natural language queries over ERP data |
| Board Dashboard | Not Started | Group-level cross-entity reporting |
| BI Analytics | Not Started | Self-service report builder |

---

*Last updated: July 16, 2026*
