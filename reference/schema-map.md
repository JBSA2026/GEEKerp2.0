# GEEK-ERP Database Schema Map

> **Generated:** 2026-07-16
> **Schema:** `public`  
> **Database:** Supabase PostgreSQL (managed Postgres, no Supabase Auth)

---

## ⚠️ Important: Entity Config Gap

The `entity_config` table currently only stores **attendance configuration** (start time, grace period). It does **NOT** have columns for:
- `tin` (Tax Identification Number)
- `registered_name`
- `registered_address`
- `rdo_code` (Revenue District Office)

**Action needed:** A new table (e.g., `entity_tax_profiles`) or additional columns are required for BIR tax form auto-population (2307, 2550M/Q, 1601-C, etc.).

---

## Table of Contents

1. [Authentication & Administration](#1-authentication--administration)
2. [Master Data (Clients, Suppliers, Products, Services)](#2-master-data)
3. [CRM / Sales](#3-crm--sales)
4. [Quotations](#4-quotations)
5. [Sales Orders & Delivery](#5-sales-orders--delivery)
6. [Purchasing](#6-purchasing)
7. [Inventory](#7-inventory)
8. [Accounts Receivable (AR)](#8-accounts-receivable)
9. [Accounts Payable (AP)](#9-accounts-payable)
10. [General Ledger (GL)](#10-general-ledger)
11. [Tax Management](#11-tax-management)
12. [HR Management](#12-hr-management)
13. [Payroll](#13-payroll)
14. [Commission Management](#14-commission-management)
15. [Projects](#15-projects)
16. [Document Management](#16-document-management)
17. [Workflow Approval](#17-workflow-approval)
18. [Audit & System](#18-audit--system)

---

## 1. Authentication & Administration

### `employees`
Primary user/account table.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| employee_id | serial | NO | auto | **PK** |
| first_name | varchar(100) | NO | — | |
| last_name | varchar(100) | NO | — | |
| email | varchar(255) | NO | — | Unique, used as login |
| password_hash | text | NO | — | bcrypt hash |
| address | text | YES | — | |
| is_active | boolean | NO | true | Soft-disable accounts |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `roles`
Reference table of system and custom roles.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| role_id | serial | NO | auto | **PK** |
| role_name | varchar(100) | NO | — | Unique |
| description | text | YES | — | |
| is_system | boolean | YES | false | System roles cannot be deleted |
| created_at | timestamptz | YES | now() | |

### `employee_roles`
Junction: assigns roles to employees (M:N).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| employee_id | int | NO | — | **FK → employees** |
| role_id | int | NO | — | **FK → roles** |

Composite PK: (employee_id, role_id)

### `role_modules`
Controls which modules a role can access and at what permission level.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| role_id | int | NO | — | **FK → roles** |
| module_key | varchar | NO | — | e.g. "hr", "ar", "ap" |
| permission_level | varchar | YES | 'view' | full, manage, create_edit, approve, view, limited |

### `role_permissions`
Granular action permissions per role.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| role_id | int | NO | — | **FK → roles** |
| module_key | varchar | NO | — | |
| action | varchar | NO | — | e.g. "create", "delete" |
| created_at | timestamptz | YES | now() | |

### `permissions`
Legacy/alternative permissions table.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| role_id | int | YES | — | **FK → roles** |
| module_name | varchar | YES | — | |
| can_view | boolean | YES | false | |
| can_create | boolean | YES | false | |
| can_edit | boolean | YES | false | |
| can_delete | boolean | YES | false | |

### `refresh_tokens`
JWT refresh token storage.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| employee_id | int | NO | — | **FK → employees** |
| token | text | NO | — | Unique |
| expires_at | timestamptz | NO | — | |
| created_at | timestamptz | YES | now() | |

### `entity_config`
Per-entity attendance configuration.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| entity | varchar(50) | NO | — | Expedia/GreatnessLab/Exigent/KSI |
| standard_start_time | time | NO | 08:00:00 | |
| grace_period_minutes | int | NO | 15 | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

> ⚠️ No TIN/registered_name/address/rdo_code fields. Attendance-only config.


---

## 2. Master Data

### `client_list`
Customer master. Used by AR, CRM, Quotations, Projects.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| client_id | bigint | NO | identity | **PK** |
| customer_code | text | YES | — | Auto-generated code |
| company_name | text | NO | — | |
| trade_name | text | YES | — | |
| customer_type | text | YES | — | |
| industry | text | YES | — | |
| tin_number | varchar | YES | — | Tax ID for BIR forms, Unique |
| vat_status | text | YES | — | VAT/Non-VAT |
| billing_address | text | YES | — | |
| address | text | NO | — | Physical address |
| assigned_salesperson | text | YES | — | |
| payment_terms | text | YES | — | |
| credit_limit | numeric | YES | — | |
| entity | text | YES | — | Owning company |
| linked_entity | varchar | YES | — | Sister company entity name (inter-company) |
| status | text | NO | 'active' | active/inactive |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `supplier_list`
Supplier master. Used by AP, Purchasing.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| supplier_id | bigint | NO | identity | **PK** |
| company_name | text | NO | — | |
| tin_number | varchar | NO | — | Tax ID for BIR forms |
| supplier_type | varchar | NO | — | |
| supplier_classification | text | NO | 'LOCAL' | `LOCAL` or `INTERNATIONAL` (enforced by `supplier_list_classification_valid`) |
| industry | varchar | NO | — | |
| vat_status | varchar | NO | — | VAT/Non-VAT |
| billing_address | text | NO | — | |
| address | text | YES | — | Delivery / mailing address; added by `20260720000200_add_supplier_address.sql` |
| payment_terms | varchar | NO | — | |
| employee_id | bigint | NO | — | **FK → employees** Assigned account manager |
| status | varchar | NO | — | active/inactive |
| linked_entity | varchar | YES | — | Sister company entity name (inter-company) |
| created_at | timestamptz | NO | — | |
| updated_at | timestamptz | NO | — | |

### `contact_list`
Individual people linked to clients. A client can have zero or more contacts.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| contact_id | serial | NO | auto | **PK** |
| client_id | bigint | NO | — | **FK → client_list** (`ON DELETE CASCADE`) |
| first_name | text | NO | — | |
| last_name | text | YES | — | |
| job_title | text | YES | — | |
| email | text | YES | — | |
| landline | text | YES | — | |
| is_primary_contact | boolean | NO | false | At most one primary contact per client |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

> `uq_contact_list_primary_per_client` enforces a single primary contact per client; selecting a new primary automatically demotes the previous one.

### `product_list`
Product catalog.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| product_code | varchar | NO | — | **PK** (natural key). Product catalog and received-stock items use the `PRD` segment: `COMPANY-YYYY-PRD-NNNN`; received line variants may include `-NN`. |
| product_brand | text | NO | — | |
| product_name | text | NO | — | |
| product_description | text | YES | — | |
| quantity | int | YES | 0 | Default stock qty |
| unit | text | YES | — | UOM |
| buying_price_vat | numeric | YES | 0 | Cost incl. VAT |
| selling_price_margin | numeric | YES | 0 | Selling price |
| supplier_name | text | YES | — | |
| fulfillment_type | text | YES | 'DIRECT' | DIRECT/STOCK |
| owner_entity | text | YES | — | Owning catalog entity: Expedia, GreatnessLab, Exigent, or KSI. Must match the product selected in entity-scoped PR and quotation flows. Unresolved legacy products may remain null. |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `intercompany_product_mappings`
Buyer-to-seller catalog links for internal purchasing. The first completed internal receipt creates this link automatically. Later internal PRs can reuse that buyer item only with the linked seller, while standard Local and International PRs exclude all buyer items with an active intercompany link. A first-time internal purchase still starts as a new buyer item and captures its seller-item snapshot.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| mapping_id | bigint | NO | identity | **PK** |
| buyer_entity | text | NO | — | Buyer: Expedia, GreatnessLab, Exigent, or KSI |
| buyer_product_code | varchar | NO | — | **FK → product_list(product_code)**; buyer-owned catalog item |
| seller_entity | text | NO | — | Seller entity; must differ from buyer_entity |
| seller_product_code | varchar | NO | — | **FK → product_list(product_code)**; seller-owned equivalent item |
| notes | text | YES | — | Mapping rationale or commercial notes |
| is_active | boolean | NO | true | Only active mappings can be quoted, ordered, or transferred |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

Unique: `(buyer_entity, buyer_product_code, seller_entity)`.


### `services`
Service catalog.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| service_id | serial | NO | auto | **PK** |
| service_name | text | NO | — | |
| company_name | text | YES | — | Entity offering the service |
| category | text | YES | — | |
| sub_category | text | YES | — | |
| tax_category | text | YES | — | |
| margin_percentage | numeric | YES | — | |
| warranty | text | YES | — | |
| warranty_period | text | YES | — | |
| service_description | text | YES | — | |
| service_notes | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |


---

## 3. CRM / Sales

### `leads`
Sales leads (pre-opportunity).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| lead_id | serial | NO | auto | **PK** |
| client_id | int | YES | — | **FK → client_list** |
| employee_id | int | YES | — | Assigned sales rep |
| company_name | text | NO | — | |
| contact_name | text | YES | — | Auto-derived from first/last |
| first_name | text | YES | — | |
| last_name | text | YES | — | |
| designation | text | YES | — | |
| email | text | YES | — | |
| mobile_number | text | YES | — | |
| lead_source | text | YES | — | Referral, Web, etc. |
| lead_status | text | YES | — | New, Contacted, Qualified, etc. |
| interest_level | text | YES | — | Hot, Warm, Cold |
| entity | text | YES | — | |
| remarks | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `opportunities`
Sales pipeline opportunities.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| opportunity_id | serial | NO | auto | **PK** |
| employee_id | int | YES | — | Assigned sales rep |
| client_id | int | YES | — | **FK → client_list** |
| contact_id | int | YES | — | **FK → contact_list** |
| project_name | text | NO | — | |
| entity | text | YES | — | |
| estimated_value | numeric | YES | — | |
| probability_percentage | numeric | YES | — | 0-100 |
| stage | text | YES | — | Prospecting, Proposal, Negotiation, Closed Won/Lost |
| expected_closed_date | text | YES | — | |
| competitor | text | YES | — | |
| loss_reason | text | YES | — | |
| remarks | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `sales_activity`
Sales activities (calls, meetings, emails).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| activity_id | serial | NO | auto | **PK** |
| employee_id | int | YES | — | Sales rep |
| activity_type | text | YES | — | Call, Meeting, Email, etc. |
| activity_date | text | YES | — | |
| subject | text | NO | — | |
| notes_outcome | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `sales_forecast`
Sales quota and forecast tracking.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| forecast_id | serial | NO | auto | **PK** |
| employee_id | int | YES | — | Sales rep |
| forecast_period | text | NO | — | e.g. "2026-Q1" |
| quota_amount | numeric | YES | — | |
| pipeline_value | numeric | YES | — | |
| weighted_value | numeric | YES | — | |
| achieve_amount | numeric | YES | — | Actual achieved |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |


---

## 4. Quotations

### `quotations`
Quotation headers.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| quotation_id | serial | NO | auto | **PK** |
| quotation_number | text | YES | — | Auto-generated (COMPANY-YYYY-QUO-NNNN) |
| company | text | YES | 'expedia' | Entity code |
| client_id | int | NO | — | **FK → client_list** |
| contact_id | bigint | YES | — | **FK → contact_list** (`ON DELETE SET NULL`) |
| opportunity_id | int | YES | — | **FK → opportunities** |
| project_name | text | NO | — | |
| subject | text | YES | — | |
| attn_to | text | YES | — | |
| contact_name_snapshot | text | YES | — | Name captured when a contact is selected |
| contact_job_title_snapshot | text | YES | — | |
| contact_email_snapshot | text | YES | — | |
| contact_phone_snapshot | text | YES | — | |
| validity_date | text | YES | — | |
| payment_terms | text | YES | — | |
| delivery_terms | text | YES | — | |
| notes | text | YES | — | |
| vat_rate | numeric | YES | 12 | % |
| wht_rate | numeric | YES | 0 | % |
| discount_amount | numeric | YES | 0 | |
| shipping_cost | numeric | YES | 0 | |
| others_cost | numeric | YES | 0 | |
| scope_of_works | text | YES | — | |
| cancellation_fee | text | YES | '50% Cancellation Fee' | |
| validity_days | int | YES | 30 | |
| bank_details | text | YES | — | |
| additional_notes | text | YES | — | |
| scope_line_1..5 | text | YES | — | Custom scope lines |
| status | text | YES | 'Draft' | Draft, Sent, Approved, Rejected, Closed Won/Lost |
| version | int | YES | 1 | Current version number |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `quotation_items`
Line items on a quotation.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| item_id | serial | NO | auto | **PK** |
| quotation_id | int | NO | — | **FK → quotations** |
| line_no | int | YES | 1 | Sort order |
| product_type | text | YES | — | |
| product_code | text | YES | — | **FK → product_list** (soft) |
| description | text | YES | '' | |
| datasheet_link | text | YES | — | |
| quantity | numeric | YES | 1 | |
| uom | text | YES | 'Nos' | Unit of measure |
| unit_cost | numeric | YES | 0 | |
| selling_price | numeric | YES | 0 | |
| discount_percent | numeric | YES | 0 | |
| is_section | boolean | YES | false | Section header flag |
| section_title | text | YES | — | |
| fulfillment_type | text | YES | — | DIRECT/STOCK |
| created_at | timestamptz | YES | now() | |

### `quotation_versions`
Snapshot of quotation at each version point.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| version_id | serial | NO | auto | **PK** |
| quotation_id | int | NO | — | **FK → quotations** |
| version_number | int | NO | — | |
| snapshot_data | jsonb | YES | — | Full quotation state |
| change_summary | text | YES | — | |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |

### `quotation_history`
Audit trail of status changes on quotations.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| history_id | serial | NO | auto | **PK** |
| quotation_id | int | NO | — | **FK → quotations** |
| action | text | YES | — | |
| old_status | text | YES | — | |
| new_status | text | YES | — | |
| performed_by | text | YES | — | |
| remarks | text | YES | — | |
| created_at | timestamptz | YES | now() | |


---

## 5. Sales Orders & Delivery

### `sales_orders`
Sales orders generated from approved quotations.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| sales_order_id | serial | NO | auto | **PK** |
| so_number | text | YES | — | Auto-generated (COMPANY-YYYY-SO-NNNN) |
| quotation_id | int | YES | — | **FK → quotations** |
| client_id | int | YES | — | **FK → client_list** |
| entity | text | YES | — | |
| order_date | date | YES | — | |
| subtotal | numeric | YES | 0 | |
| vat_amount | numeric | YES | 0 | |
| wht_amount | numeric | YES | 0 | |
| discount_amount | numeric | YES | 0 | |
| shipping_cost | numeric | YES | 0 | |
| others_cost | numeric | YES | 0 | |
| grand_total | numeric | YES | 0 | |
| status | text | YES | 'CONFIRMED' | CONFIRMED, PARTIALLY_DELIVERED, DELIVERED, INVOICED |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `sales_order_items`
Line items on a sales order.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| sales_order_item_id | serial | NO | auto | **PK** |
| sales_order_id | int | NO | — | **FK → sales_orders** |
| product_code | text | YES | — | |
| description | text | YES | — | |
| quantity_ordered | numeric | YES | 0 | |
| quantity_delivered | numeric | YES | 0 | Tracks partial delivery |
| uom | text | YES | — | |
| unit_price | numeric | YES | 0 | |
| discount_percent | numeric | YES | 0 | |
| line_total | numeric | YES | 0 | |
| fulfillment_type | text | YES | — | DIRECT/STOCK |
| created_at | timestamptz | YES | now() | |

### `delivery_notes`
Outbound delivery records.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| delivery_note_id | serial | NO | auto | **PK** |
| dr_number | text | YES | — | Auto-generated (COMPANY-YYYY-DR-NNNN) |
| sales_order_id | int | YES | — | **FK → sales_orders** |
| project_id | int | YES | — | **FK → projects** |
| client_id | int | YES | — | **FK → client_list** |
| entity | text | YES | — | |
| delivery_date | date | YES | — | |
| address | text | YES | — | Delivery address |
| status | text | YES | 'PREPARING' | PREPARING, IN_TRANSIT, DELIVERED, ACKNOWLEDGED |
| received_by | text | YES | — | |
| received_date | date | YES | — | |
| remarks | text | YES | — | |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `delivery_note_items`
Line items on a delivery note.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| item_id | serial | NO | auto | **PK** |
| delivery_note_id | int | NO | — | **FK → delivery_notes** |
| product_code | text | YES | — | |
| description | text | YES | — | |
| quantity_ordered | numeric | YES | 0 | |
| quantity_delivered | numeric | NO | — | |
| uom | text | YES | 'Nos' | |
| serial_numbers | text | YES | — | |
| remarks | text | YES | — | |
| created_at | timestamptz | YES | now() | |


---

## 6. Purchasing

### `purchase_requests`
Purchase requisitions record the supplier geography and fulfilment type together: `LOCAL_PHYSICAL`, `LOCAL_DIGITAL`, `INTERNATIONAL_PHYSICAL`, or `INTERNATIONAL_DIGITAL`. The existing immutable `INTERCOMPANY` procurement snapshot remains available for sister-company purchases; it retains the selected supplier and does not depend on a reusable product mapping.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| purchase_request_id | serial | NO | auto | **PK** |
| pr_number | text | YES | — | Auto-generated |
| entity | text | YES | — | Buyer entity |
| purchase_source | text | NO | 'LOCAL_PHYSICAL' | `LOCAL_PHYSICAL`, `LOCAL_DIGITAL`, `INTERNATIONAL_PHYSICAL`, `INTERNATIONAL_DIGITAL`, or `INTERCOMPANY`; standard sources have no source supplier/seller; updated by `20260722040000_consolidate_purchase_request_source.sql` |
| source_supplier_id | bigint | YES | — | **FK → supplier_list**; required only for `INTERCOMPANY` |
| source_seller_entity | text | YES | — | Canonical seller entity snapshot; required only for `INTERCOMPANY` |
| required_date | date | YES | — | |
| warehouse_id | int | YES | — | **FK → warehouses** |
| status | text | YES | 'TO_PURCHASE' | TO_PURCHASE, PO_CREATED, APPROVED, etc. |
| remarks | text | YES | — | |
| requested_by | text | YES | — | Employee email |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `purchase_request_items`
Line items on a purchase request.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| purchase_request_item_id | serial | NO | auto | **PK** |
| purchase_request_id | int | NO | — | **FK → purchase_requests** |
| product_code | text | YES | — | Buyer-owned/local item code |
| seller_product_code | varchar | YES | — | **FK → product_list**; immutable seller fulfillment code for `INTERCOMPANY` (pending migration) |
| item_description | text | NO | — | |
| unit | text | YES | — | |
| quantity | numeric | NO | — | |
| estimated_unit_cost | numeric | YES | 0 | Planning estimate. The PR UI autofills the newest eligible PO's `final_unit_cost` for the selected catalog item; it excludes Shipping, Duties, VAT, and Brokerage. It remains manually editable and is `0` when no PO base-cost history exists. |
| created_at | timestamptz | YES | now() | |

### `rfqs`
Requests for Quotation sent to suppliers.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| rfq_id | serial | NO | auto | **PK** |
| purchase_request_id | int | YES | — | **FK → purchase_requests** |
| rfq_number | text | YES | — | Auto-generated |
| due_date | date | YES | — | |
| status | text | YES | 'OPEN' | OPEN, CLOSED, AWARDED |
| remarks | text | YES | — | |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `rfq_suppliers`
Junction: suppliers invited to an RFQ.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| rfq_id | int | NO | — | **FK → rfqs** |
| supplier_id | int | NO | — | **FK → supplier_list** |
| created_at | timestamptz | YES | now() | |

### `supplier_quotations`
Quotation responses from suppliers.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| supplier_quotation_id | serial | NO | auto | **PK** |
| quotation_number | text | YES | — | Auto-generated; later submissions for the same RFQ and supplier use a `-V2`, `-V3`, … suffix |
| rfq_id | int | YES | — | **FK → rfqs** |
| purchase_request_id | int | YES | — | **FK → purchase_requests** |
| supplier_id | int | NO | — | **FK → supplier_list** |
| valid_until | date | YES | — | |
| delivery_date | date | YES | — | |
| payment_terms | text | YES | — | |
| freight | numeric | YES | 0 | Displayed as Shipping; stored as `freight` for compatibility. |
| duties | numeric | YES | 0 | |
| taxes | numeric | YES | 0 | |
| other_charges | numeric | YES | 0 | Displayed as Brokerage; stored as `other_charges` for compatibility. |
| total_amount | numeric | YES | 0 | Computed |
| remarks | text | YES | — | |
| is_awarded | boolean | YES | false | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

Unique: `(rfq_id, supplier_id, quotation_number)`. This permits multiple versioned quotations from one supplier for an RFQ while preventing duplicate version numbers.

### `supplier_quotation_items`
Line items on a supplier quotation.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| item_id | serial | NO | auto | **PK** |
| supplier_quotation_id | int | NO | — | **FK → supplier_quotations** |
| product_code | text | YES | — | Buyer-owned/local item code |
| seller_product_code | varchar | YES | — | **FK → product_list**; copied from the intercompany PR snapshot (pending migration) |
| item_description | text | NO | — | |
| unit | text | YES | — | |
| quantity | numeric | NO | — | |
| unit_cost | numeric | NO | — | Supplier quote base unit cost, before separate landed-cost components. |
| created_at | timestamptz | YES | now() | |

### `purchase_orders`
Purchase orders to suppliers.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| purchase_order_id | serial | NO | auto | **PK** |
| po_number | text | YES | — | Auto-generated (COMPANY-YYYY-PO-NNNN) |
| purchase_request_id | int | YES | — | **FK → purchase_requests** |
| supplier_quotation_id | int | YES | — | **FK → supplier_quotations** |
| supplier_id | int | YES | — | **FK → supplier_list** |
| entity | text | YES | — | Buyer/owning entity for historical base-cost lookup. |
| order_date | date | YES | — | |
| delivery_date | date | YES | — | |
| payment_terms | text | YES | — | |
| total_amount | numeric | YES | 0 | |
| status | text | YES | 'SUBMITTED' | `DRAFT` and `CANCELLED` orders are excluded from PR base-cost history. |
| billing_status | text | YES | 'NOT_BILLED' | NOT_BILLED, PARTIALLY_BILLED, BILLED, PAID |
| remarks | text | YES | — | |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | Determines newest eligible PO, with PO item ID as the deterministic tie-breaker. |
| updated_at | timestamptz | YES | now() | |

### `purchase_order_items`
Line items on a purchase order.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| purchase_order_item_id | serial | NO | auto | **PK** |
| purchase_order_id | int | NO | — | **FK → purchase_orders** |
| product_code | text | YES | — | Buyer-owned/local receipt code |
| seller_product_code | varchar | YES | — | **FK → product_list**; seller stock code used by manual intercompany fulfillment (pending migration) |
| item_description | text | YES | — | |
| unit | text | YES | — | |
| quantity | numeric | YES | 0 | |
| final_unit_cost | numeric | YES | 0 | Base supplier quote unit cost. Used for PR estimate history; excludes Shipping, Duties, VAT, and Brokerage. |
| freight | numeric | YES | 0 | Per-line Shipping allocation; not part of `final_unit_cost`. |
| duties | numeric | YES | 0 | Per-line duties allocation; not part of `final_unit_cost`. |
| vat_amount | numeric | YES | 0 | Per-line VAT allocation; not part of `final_unit_cost`. |
| vat_code | text | YES | — | VAT treatment used for the allocation. |
| other_charges | numeric | YES | 0 | Per-line Brokerage allocation; not part of `final_unit_cost`. |
| received_quantity | numeric | YES | 0 | |
| created_at | timestamptz | YES | now() | |

### `purchase_order_approvals`
Approval records for POs.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| approval_id | serial | NO | auto | **PK** |
| purchase_order_id | int | NO | — | **FK → purchase_orders** |
| status | text | YES | 'Pending' | Pending, Approved, Rejected |
| approved_by | text | YES | — | |
| remarks | text | YES | — | |
| created_at | timestamptz | YES | now() | |

### `goods_receipts`
Inbound goods receiving records.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| goods_receipt_id | serial | NO | auto | **PK** |
| purchase_order_id | int | YES | — | **FK → purchase_orders** |
| gr_number | text | YES | — | Auto-generated |
| warehouse_id | int | YES | — | **FK → warehouses** |
| receipt_date | date | YES | — | |
| remarks | text | YES | — | |
| received_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |

### `goods_receipt_items`
Line items on a goods receipt.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| item_id | serial | NO | auto | **PK** |
| goods_receipt_id | int | NO | — | **FK → goods_receipts** |
| purchase_order_item_id | int | YES | — | **FK → purchase_order_items** |
| product_code | text | YES | — | |
| ordered_quantity | numeric | YES | 0 | |
| received_quantity | numeric | NO | — | |
| unit_cost | numeric | YES | 0 | |
| created_at | timestamptz | YES | now() | |

### `supplier_invoices`
Invoices received from suppliers (linked to POs).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| invoice_id | serial | NO | auto | **PK** |
| purchase_order_id | int | YES | — | **FK → purchase_orders** |
| supplier_id | int | YES | — | **FK → supplier_list** |
| invoice_number | text | YES | — | Supplier's invoice # |
| invoice_date | date | YES | — | |
| amount | numeric | YES | 0 | |
| status | text | YES | 'PENDING' | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |


---

## 7. Inventory

### `warehouses`
Warehouse master.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| warehouse_id | bigint | NO | identity | **PK** |
| warehouse_code | text | NO | — | Unique code |
| warehouse_name | text | NO | — | |
| address | text | YES | — | |
| city | text | YES | — | |
| province | text | YES | — | |
| contact_person | text | YES | — | |
| contact_number | text | YES | — | |
| status | text | NO | 'ACTIVE' | ACTIVE/INACTIVE |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

### `inventory_locations`
Sub-locations within warehouses (aisle/rack/shelf/bin).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| location_id | text | NO | — | **PK** (UUID) |
| warehouse_id | text | NO | — | **FK → warehouses** |
| location_code | text | NO | — | |
| location_name | text | NO | — | |
| aisle | text | YES | — | |
| rack | text | YES | — | |
| shelf | text | YES | — | |
| bin | text | YES | — | |
| location_type | text | YES | 'STORAGE' | STORAGE, RECEIVING, SHIPPING, QUARANTINE |
| capacity | numeric | YES | — | |
| status | text | YES | 'ACTIVE' | |
| notes | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `inventory_stock`
Current stock levels per product, warehouse, location, and owning entity. Purchase receiving matches stock by all four dimensions so one entity's stock is never merged into another entity's record.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| stock_id | bigint | NO | identity | **PK** |
| product_code | text | NO | — | **FK → product_list** |
| warehouse_id | bigint | NO | — | **FK → warehouses** |
| location_id | bigint | YES | — | **FK → inventory_locations** |
| quantity_on_hand | numeric | NO | 0 | |
| reserved_quantity | numeric | NO | 0 | Quantity reserved for sales orders |
| reorder_level | numeric | NO | 0 | |
| unit_cost | numeric | NO | 0 | Weighted average cost |
| status | text | NO | 'ACTIVE' | ACTIVE, LOW_STOCK, OUT_OF_STOCK, INACTIVE |
| entity | text | YES | — | Owning entity (Expedia/GreatnessLab/Exigent/KSI). All current stock rows are assigned to a canonical entity. |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

### `inventory_movements`
Stock movement ledger (all ins/outs/transfers).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| movement_id | serial | NO | auto | **PK** |
| movement_no | text | YES | — | Auto-generated |
| movement_type | text | NO | — | RECEIVE, ISSUE, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT |
| product_code | text | NO | — | **FK → product_list** |
| quantity | numeric | NO | — | Positive value |
| unit_cost | numeric | YES | 0 | |
| reference_no | text | YES | — | PO#, SO#, etc. |
| remarks | text | YES | — | |
| warehouse_id | text | YES | — | Target warehouse |
| location_id | text | YES | — | Target location |
| from_warehouse_id | text | YES | — | Source (for transfers) |
| from_location_id | text | YES | — | |
| to_warehouse_id | text | YES | — | Destination (for transfers) |
| to_location_id | text | YES | — | |
| status | text | YES | — | COMPLETED, PENDING (for transfers) |
| created_at | timestamptz | YES | now() | |


---

## 8. Accounts Receivable

### `ar_invoices`
AR invoice headers.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| invoice_id | serial | NO | auto | **PK** |
| invoice_number | text | YES | — | Auto-generated (COMPANY-YYYY-INV-NNNN) |
| customer_id | int | NO | — | **FK → client_list** |
| invoice_date | date | NO | — | |
| due_date | date | NO | — | |
| sales_order_ref | text | YES | — | SO number reference |
| project_code | text | YES | — | Project reference |
| billing_subtotal | numeric | YES | 0 | Sum of VAT-exclusive amounts |
| vat_output | numeric | YES | 0 | Total output VAT |
| wht_amount | numeric | YES | 0 | Withholding tax deducted |
| gross_amount | numeric | YES | 0 | Subtotal + VAT |
| net_collectible | numeric | YES | 0 | Gross - WHT |
| entity | text | YES | — | Owning company |
| lifecycle_status | text | YES | 'CONFIRMED' | DRAFT, CONFIRMED, CANCELLED |
| record_status | text | YES | 'ACTIVE' | ACTIVE, ARCHIVED |
| source_quotation_id | int | YES | — | **FK → quotations** |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `ar_invoice_items`
Line items on AR invoices.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| item_id | serial | NO | auto | **PK** |
| invoice_id | int | NO | — | **FK → ar_invoices** |
| line_type | text | NO | — | MATERIAL or SERVICE |
| description | text | NO | — | |
| vat_exclusive_amount | numeric | YES | 0 | |
| vat_code | text | NO | — | VAT_OUTPUT or VAT_EXEMPT |
| wht_code | text | NO | — | WHT_MATERIAL_1, WHT_SERVICE_2, NO_WHT |
| created_at | timestamptz | YES | now() | |

### `ar_collections`
Payments received against AR invoices.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| collection_id | serial | NO | auto | **PK** |
| collection_number | text | YES | — | Auto-generated |
| invoice_id | int | NO | — | **FK → ar_invoices** |
| collection_amount | numeric | NO | — | |
| collection_date | date | NO | — | |
| payment_method | text | NO | — | Cash, Check, Bank Transfer, etc. |
| or_number | text | YES | — | Official Receipt number |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `invoice_receipts`
Official receipts issued for AR collections.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| receipt_id | serial | NO | auto | **PK** |
| invoice_id | int | YES | — | **FK → ar_invoices** |
| collection_id | int | YES | — | **FK → ar_collections** |
| receipt_number | text | YES | — | |
| receipt_date | date | YES | — | |
| amount | numeric | YES | 0 | |
| created_at | timestamptz | YES | now() | |


---

## 9. Accounts Payable

### `ap_bills`
AP bill headers.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| bill_id | serial | NO | auto | **PK** |
| bill_number | text | YES | — | Auto-generated (COMPANY-YYYY-BIL-NNNN) |
| supplier_id | int | NO | — | **FK → supplier_list** |
| bill_date | date | NO | — | |
| due_date | date | NO | — | |
| po_number | text | YES | — | Linked PO reference |
| supplier_invoice_number | text | YES | — | Supplier's invoice # |
| source_purchase_order_id | int | YES | — | **FK → purchase_orders** |
| vat_exclusive_amount | numeric | YES | 0 | Sum of line items |
| vat_input | numeric | YES | 0 | Input VAT (12% of VATable lines) |
| gross_amount | numeric | YES | — | **GENERATED:** vat_exclusive + vat_input |
| ewt_material | numeric | YES | — | **GENERATED:** 1% EWT on local PHP materials; zero for international USD bills |
| net_payable | numeric | YES | — | **GENERATED:** gross - applicable local EWT; international bills equal gross |
| entity | text | YES | — | Derived from and persisted from the linked PO/PR owning company |
| lifecycle_status | text | YES | 'CONFIRMED' | DRAFT, CONFIRMED, CANCELLED |
| record_status | text | YES | 'ACTIVE' | ACTIVE, ARCHIVED |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

> **Note:** `gross_amount`, `ewt_material`, `net_payable` are GENERATED STORED columns.

### `ap_bill_items`
Line items on AP bills.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| item_id | serial | NO | auto | **PK** |
| bill_id | int | NO | — | **FK → ap_bills** |
| description | text | NO | — | |
| vat_exclusive_amount | numeric | YES | 0 | |
| vat_treatment | text | NO | — | VAT_PAYABLE or VAT_EXEMPT |
| created_at | timestamptz | YES | now() | |

### `ap_payment_vouchers`
Payment vouchers grouping bills for payment.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| voucher_id | serial | NO | auto | **PK** |
| voucher_number | text | YES | — | Auto-generated |
| supplier_id | int | NO | — | **FK → supplier_list** |
| payment_date | date | NO | — | |
| total_amount | numeric | YES | 0 | Sum of included bills |
| entity | text | YES | — | |
| status | text | YES | 'DRAFT' | DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, PAID |
| rejection_remarks | text | YES | — | |
| prepared_by | text | YES | — | |
| approved_by | text | YES | — | |
| approved_at | timestamptz | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `ap_voucher_bills`
Junction: bills included in a voucher.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| voucher_id | int | NO | — | **FK → ap_payment_vouchers** |
| bill_id | int | NO | — | **FK → ap_bills** |
| amount | numeric | YES | 0 | Amount allocated from this bill |
| created_at | timestamptz | YES | now() | |

### `ap_payments`
Individual payment records against bills.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| payment_id | serial | NO | auto | **PK** |
| bill_id | int | NO | — | **FK → ap_bills** |
| payment_amount | numeric | NO | — | |
| payment_date | date | NO | — | |
| payment_method | text | NO | — | Cash, Check, Bank Transfer |
| payment_file_name | text | YES | — | Uploaded proof filename |
| payment_file_ref | text | YES | — | Storage path/URL |
| payment_file_type | text | YES | — | MIME type |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `ap_checks`
Check records issued for AP payments.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| check_id | serial | NO | auto | **PK** |
| voucher_id | int | NO | — | **FK → ap_payment_vouchers** |
| check_number | text | NO | — | |
| check_date | date | NO | — | |
| bank | text | NO | — | |
| check_amount | numeric | NO | — | |
| status | text | YES | 'ISSUED' | ISSUED, CLEARED, BOUNCED, CANCELLED, STALE |
| clearing_date | date | YES | — | |
| entity | text | YES | — | |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `ar_ap_attachments`
Shared attachments for AR invoices and AP bills.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| attachment_id | serial | NO | auto | **PK** |
| module | text | NO | — | 'AR' or 'AP' |
| reference_id | int | NO | — | invoice_id or bill_id |
| file_name | text | NO | — | |
| file_path | text | NO | — | Storage path |
| file_type | text | YES | — | MIME type |
| file_size | int | YES | — | Bytes |
| uploaded_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |


---

## 10. General Ledger

### `gl_accounts`
Chart of Accounts.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| account_id | serial | NO | auto | **PK** |
| account_code | text | NO | — | Unique hierarchical code |
| account_name | text | NO | — | |
| account_type | text | NO | — | Asset, Liability, Equity, Revenue, Expense |
| parent_account_id | int | YES | — | **FK → gl_accounts** (self-ref) |
| normal_balance | text | YES | 'Debit' | Debit or Credit |
| description | text | YES | — | |
| entity | text | YES | — | |
| is_active | boolean | YES | true | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `gl_journal_entries`
Journal entry headers.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| entry_id | serial | NO | auto | **PK** |
| entry_number | text | YES | — | Auto-generated (COMPANY-YYYY-JE-NNNN) |
| entry_date | date | NO | — | |
| description | text | YES | — | |
| reference_module | text | YES | — | Source module (AR, AP, Payroll, etc.) |
| reference_number | text | YES | — | Source document number |
| entity | text | YES | — | |
| status | text | YES | 'Draft' | Draft, Posted, Reversed |
| total_debit | numeric | YES | 0 | |
| total_credit | numeric | YES | 0 | |
| posted_by | text | YES | — | |
| posted_at | timestamptz | YES | — | |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `gl_journal_lines`
Individual debit/credit lines in a journal entry.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| line_id | serial | NO | auto | **PK** |
| entry_id | int | NO | — | **FK → gl_journal_entries** |
| account_id | int | NO | — | **FK → gl_accounts** |
| description | text | YES | — | Line-level memo |
| debit | numeric | YES | 0 | |
| credit | numeric | YES | 0 | |
| created_at | timestamptz | YES | now() | |

### `gl_fiscal_periods`
Fiscal period definitions for closing.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| period_id | serial | NO | auto | **PK** |
| period_name | text | YES | — | e.g. "January 2026" |
| start_date | date | NO | — | |
| end_date | date | NO | — | |
| entity | text | YES | — | |
| status | text | YES | 'Open' | Open, Closed |
| closed_by | text | YES | — | |
| closed_at | timestamptz | YES | — | |
| created_at | timestamptz | YES | now() | |


---

## 11. Tax Management

### `tax_codes`
Configurable tax code reference table.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| code | varchar(30) | NO | — | **PK** (natural key, e.g. VAT_OUTPUT, WHT_MATERIAL_1) |
| tax_type | varchar(20) | YES | — | VAT, WHT, EWT |
| rate | numeric | YES | 0 | Decimal rate (e.g. 0.12 = 12%) |
| scope | varchar(10) | YES | — | AR, AP, BOTH |
| editable | boolean | YES | true | false = system-locked |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**Seeded codes:** VAT_OUTPUT (12%), VAT_INPUT (12%), VAT_EXEMPT (0%), WHT_MATERIAL_1 (1%), WHT_SERVICE_2 (2%), NO_WHT (0%)

### `tax_filings`
Tax filing records (BIR compliance tracking).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| filing_id | serial | NO | auto | **PK** |
| form | text | YES | — | BIR form number (2307, 2550M, 1601-C, etc.) |
| period_covered | text | YES | — | e.g. "January 2026", "Q1 2026" |
| filing_date | date | YES | — | Date filed |
| reference_number | text | YES | — | BIR confirmation/reference # |
| amount_paid | numeric | YES | — | Tax amount remitted |
| notes | text | YES | — | |
| entity | text | YES | — | Which company filed |
| filed_by | text | YES | — | Employee who filed |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |


---

## 12. HR Management

### `employee_201`
Extended employee profile (201 file).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| employee_id | int | NO | — | **FK → employees** |
| department | text | YES | — | |
| position | text | YES | — | |
| entity | varchar(50) | YES | — | Expedia/GreatnessLab/Exigent/KSI |
| employment_status | text | YES | 'Active' | Active, Resigned, Terminated, On Leave, Probationary |
| date_hired | date | YES | — | |
| salary | numeric | YES | — | Monthly salary |
| sss_number | text | YES | — | Format: DD-DDDDDDD-D |
| philhealth_number | text | YES | — | Format: DD-DDDDDDDDD-D |
| pagibig_number | text | YES | — | Format: DDDD-DDDD-DDDD |
| tin_number | text | YES | — | Format: DDD-DDD-DDD-DDD |
| emergency_contact_name | text | YES | — | |
| emergency_contact_number | text | YES | — | |
| supervisor_id | int | YES | — | **FK → employees** |
| address | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `attendance_records`
Daily attendance clock-in/out records.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| attendance_id | serial | NO | auto | **PK** |
| employee_id | int | NO | — | **FK → employees** |
| date | date | NO | — | |
| clock_in | timestamptz | YES | — | |
| clock_out | timestamptz | YES | — | |
| status | text | YES | — | On Time, Late, Absent, Half Day |
| hours_worked | numeric | YES | — | Computed |
| overtime_hours | numeric | YES | 0 | |
| remarks | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `leave_requests`
Employee leave applications.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| leave_id | serial | NO | auto | **PK** |
| employee_id | int | NO | — | **FK → employees** |
| leave_type | text | NO | — | Vacation, Sick, Emergency, etc. |
| start_date | date | NO | — | |
| end_date | date | NO | — | |
| days_count | numeric | YES | — | Computed business days |
| reason | text | YES | — | |
| status | text | YES | 'Pending' | Pending, Approved, Rejected, Cancelled |
| approved_by | int | YES | — | **FK → employees** |
| approved_at | timestamptz | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `leave_balances`
Remaining leave credits per employee per type.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| balance_id | serial | NO | auto | **PK** |
| employee_id | int | NO | — | **FK → employees** |
| leave_type | text | NO | — | |
| total_credits | numeric | YES | 0 | |
| used_credits | numeric | YES | 0 | |
| remaining_credits | numeric | YES | 0 | |
| year | int | YES | — | Fiscal year |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `hr_documents`
Documents uploaded to employee 201 files.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| document_id | serial | NO | auto | **PK** |
| employee_id | int | NO | — | **FK → employees** |
| document_type | text | YES | — | Resume, Contract, ID, etc. |
| file_name | text | YES | — | |
| file_path | text | YES | — | Storage path |
| file_size | int | YES | — | |
| uploaded_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |

### `ojt_trainees`
OJT/intern tracking.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| trainee_id | serial | NO | auto | **PK** |
| employee_id | int | YES | — | **FK → employees** |
| school | text | YES | — | |
| program | text | YES | — | |
| required_hours | numeric | YES | — | |
| rendered_hours | numeric | YES | 0 | |
| start_date | date | YES | — | |
| end_date | date | YES | — | |
| status | text | YES | 'Active' | Active, Completed, Withdrawn |
| supervisor_id | int | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `job_openings`
Recruitment job postings.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| job_id | serial | NO | auto | **PK** |
| position_title | text | NO | — | |
| department | text | YES | — | |
| entity | text | YES | — | |
| description | text | YES | — | |
| requirements | text | YES | — | |
| slots | int | YES | 1 | |
| status | text | YES | 'Open' | Open, Closed, On Hold |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `applicants`
Job applicant records.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| applicant_id | serial | NO | auto | **PK** |
| job_id | int | YES | — | **FK → job_openings** |
| first_name | text | NO | — | |
| last_name | text | NO | — | |
| email | text | YES | — | |
| phone | text | YES | — | |
| resume_path | text | YES | — | |
| status | text | YES | 'Applied' | Applied, Screening, Interview, Offered, Hired, Rejected |
| remarks | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `training_records`
Employee training/certifications.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| training_id | serial | NO | auto | **PK** |
| employee_id | int | NO | — | **FK → employees** |
| training_name | text | NO | — | |
| provider | text | YES | — | |
| start_date | date | YES | — | |
| end_date | date | YES | — | |
| status | text | YES | 'Scheduled' | Scheduled, Completed, Cancelled |
| certificate_path | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `performance_evaluations`
Employee performance reviews.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| evaluation_id | serial | NO | auto | **PK** |
| employee_id | int | NO | — | **FK → employees** |
| evaluator_id | int | YES | — | **FK → employees** |
| period | text | YES | — | e.g. "Q1 2026" |
| overall_rating | numeric | YES | — | |
| strengths | text | YES | — | |
| areas_for_improvement | text | YES | — | |
| remarks | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `ph_holidays`
Philippine holiday reference (for attendance/leave computation).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| holiday_id | serial | NO | auto | **PK** |
| holiday_date | date | NO | — | |
| holiday_name | text | NO | — | |
| holiday_type | text | YES | — | Regular, Special Non-Working |
| year | int | YES | — | |
| created_at | timestamptz | YES | now() | |


---

## 13. Payroll

### `payroll_runs`
Payroll batch/run headers.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| payroll_run_id | serial | NO | auto | **PK** |
| run_number | text | YES | — | Auto-generated |
| entity | text | YES | — | |
| period_start | date | NO | — | |
| period_end | date | NO | — | |
| cutoff_type | text | YES | — | Semi-monthly, Monthly |
| status | text | YES | 'DRAFT' | DRAFT, COMPUTED, APPROVED, PAID |
| total_gross | numeric | YES | 0 | |
| total_deductions | numeric | YES | 0 | |
| total_net | numeric | YES | 0 | |
| computed_by | text | YES | — | |
| approved_by | text | YES | — | |
| approved_at | timestamptz | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `payroll_employees`
Per-employee payroll breakdown within a run.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| payroll_run_id | int | NO | — | **FK → payroll_runs** |
| employee_id | int | NO | — | **FK → employees** |
| basic_salary | numeric | YES | 0 | |
| days_worked | numeric | YES | 0 | |
| overtime_hours | numeric | YES | 0 | |
| overtime_pay | numeric | YES | 0 | |
| gross_pay | numeric | YES | 0 | |
| sss_employee | numeric | YES | 0 | |
| sss_employer | numeric | YES | 0 | |
| philhealth_employee | numeric | YES | 0 | |
| philhealth_employer | numeric | YES | 0 | |
| pagibig_employee | numeric | YES | 0 | |
| pagibig_employer | numeric | YES | 0 | |
| withholding_tax | numeric | YES | 0 | |
| total_deductions | numeric | YES | 0 | |
| net_pay | numeric | YES | 0 | |
| loan_deduction | numeric | YES | 0 | |
| created_at | timestamptz | YES | now() | |

### `payroll_items`
Additional payroll line items (allowances, bonuses, deductions).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| item_id | serial | NO | auto | **PK** |
| payroll_run_id | int | NO | — | **FK → payroll_runs** |
| employee_id | int | NO | — | **FK → employees** |
| item_type | text | NO | — | ALLOWANCE, BONUS, DEDUCTION, REIMBURSEMENT |
| description | text | YES | — | |
| amount | numeric | YES | 0 | |
| created_at | timestamptz | YES | now() | |

### `payroll_loans`
Employee loan tracking (for payroll deductions).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| loan_id | serial | NO | auto | **PK** |
| employee_id | int | NO | — | **FK → employees** |
| loan_type | text | YES | — | SSS, Pag-IBIG, Company, etc. |
| principal_amount | numeric | YES | 0 | |
| monthly_amortization | numeric | YES | 0 | |
| total_paid | numeric | YES | 0 | |
| remaining_balance | numeric | YES | 0 | |
| start_date | date | YES | — | |
| end_date | date | YES | — | |
| status | text | YES | 'ACTIVE' | ACTIVE, FULLY_PAID, CANCELLED |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |


---

## 14. Commission Management

### `commission_rates`
Commission rate configuration per entity/type.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| rate_id | serial | NO | auto | **PK** |
| entity | text | NO | — | |
| commission_type | text | NO | — | Sales, Agent |
| rate_percentage | numeric | YES | 0 | |
| effective_from | date | YES | — | |
| effective_to | date | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `commission_records`
Individual commission calculations.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| commission_id | serial | NO | auto | **PK** |
| commission_number | text | YES | — | Auto-generated |
| commission_type | text | NO | — | Sales, Agent |
| entity | text | NO | — | |
| employee_id | int | NO | — | **FK → employees** |
| project_id | int | YES | — | **FK → projects** |
| project_code | text | YES | — | |
| project_name | text | YES | — | |
| reference_module | text | YES | — | |
| reference_number | text | YES | — | |
| contract_value | numeric | YES | 0 | |
| total_cost | numeric | YES | 0 | |
| collected_amount | numeric | YES | 0 | |
| gross_profit | numeric | YES | 0 | Computed: contract_value - total_cost |
| commission_base | numeric | YES | 0 | Base amount for commission calc |
| commission_rate | numeric | NO | — | % rate applied |
| commission_amount | numeric | YES | 0 | Computed |
| wht_amount | numeric | YES | 0 | 10% WHT on commission |
| net_commission | numeric | YES | 0 | After WHT and advances |
| period | text | YES | — | |
| status | text | YES | 'DRAFT' | DRAFT, APPROVED, PAID |
| remarks | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `commission_payouts`
Commission payout batches.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| payout_id | serial | NO | auto | **PK** |
| payout_number | text | YES | — | Auto-generated |
| entity | text | YES | — | |
| employee_id | int | NO | — | **FK → employees** |
| total_commission | numeric | YES | 0 | |
| total_wht | numeric | YES | 0 | |
| total_advances_recovered | numeric | YES | 0 | |
| net_payout | numeric | YES | 0 | |
| payout_date | date | YES | — | |
| status | text | YES | 'PENDING' | PENDING, PAID |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `cash_advances`
Cash advances given to employees (recovered from commissions).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| advance_id | serial | NO | auto | **PK** |
| advance_number | text | YES | — | Auto-generated |
| entity | text | NO | — | |
| employee_id | int | NO | — | **FK → employees** |
| amount | numeric | NO | — | |
| purpose | text | YES | — | |
| advance_date | date | YES | — | |
| recovered_amount | numeric | YES | 0 | |
| remaining_balance | numeric | YES | — | amount - recovered |
| status | text | YES | 'OUTSTANDING' | OUTSTANDING, FULLY_RECOVERED |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |


---

## 15. Projects

### `projects`
Project master records.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| project_id | serial | NO | auto | **PK** |
| project_code | text | YES | — | Auto-generated (COMPANY-YYYY-PRJ-NNNN) |
| client_id | int | NO | — | **FK → client_list** |
| project_name | text | NO | — | |
| entity | text | YES | — | |
| quotation_id | int | YES | — | **FK → quotations** |
| contract_value | numeric | YES | 0 | |
| budget | numeric | YES | 0 | |
| start_date | date | YES | — | |
| end_date | date | YES | — | |
| project_manager_id | int | YES | — | **FK → employees** |
| status | text | YES | 'PLANNING' | PLANNING, IN_PROGRESS, ON_HOLD, COMPLETED, CLOSED |
| completion_percent | numeric | YES | 0 | 0-100 |
| description | text | YES | — | |
| remarks | text | YES | — | |
| created_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `project_tasks`
Tasks within a project (WBS).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| task_id | serial | NO | auto | **PK** |
| project_id | int | NO | — | **FK → projects** |
| task_name | text | NO | — | |
| description | text | YES | — | |
| assigned_to | int | YES | — | **FK → employees** |
| start_date | date | YES | — | |
| due_date | date | YES | — | |
| priority | text | YES | 'Normal' | Low, Normal, High, Urgent |
| status | text | YES | 'TODO' | TODO, IN_PROGRESS, DONE, BLOCKED |
| sort_order | int | YES | 0 | For drag-and-drop reorder |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `project_milestones`
Project milestones (billing triggers).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| milestone_id | serial | NO | auto | **PK** |
| project_id | int | NO | — | **FK → projects** |
| milestone_name | text | NO | — | |
| description | text | YES | — | |
| target_date | date | YES | — | |
| completion_date | date | YES | — | |
| billing_amount | numeric | YES | 0 | Triggers AR invoice |
| status | text | YES | 'PENDING' | PENDING, COMPLETED, INVOICED |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `project_budget_items`
Budget line items for a project.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| budget_item_id | serial | NO | auto | **PK** |
| project_id | int | NO | — | **FK → projects** |
| category | text | YES | — | Labor, Materials, Subcontractor, etc. |
| description | text | YES | — | |
| budgeted_amount | numeric | YES | 0 | |
| actual_amount | numeric | YES | 0 | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `project_materials`
Materials/products needed for a project.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| material_id | serial | NO | auto | **PK** |
| project_id | int | NO | — | **FK → projects** |
| product_code | text | YES | — | **FK → product_list** |
| description | text | YES | — | |
| quantity_required | numeric | YES | 0 | |
| quantity_allocated | numeric | YES | 0 | |
| unit_cost | numeric | YES | 0 | |
| status | text | YES | 'PENDING' | PENDING, RESERVED, ALLOCATED, ORDERED, ISSUED, DELIVERED |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `project_material_allocations`
Allocation records linking project materials to inventory.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| allocation_id | serial | NO | auto | **PK** |
| material_id | int | NO | — | **FK → project_materials** |
| warehouse_id | text | YES | — | **FK → warehouses** |
| quantity_allocated | numeric | YES | 0 | |
| allocated_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |

### `project_documents`
Documents attached to projects.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| document_id | serial | NO | auto | **PK** |
| project_id | int | NO | — | **FK → projects** |
| file_name | text | YES | — | |
| file_path | text | YES | — | Storage path |
| file_type | text | YES | — | |
| uploaded_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |


---

## 16. Document Management

### `company_documents`
Central document register (cross-module).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| document_id | serial | NO | auto | **PK** |
| document_code | text | YES | — | Auto-generated |
| document_name | text | NO | — | |
| document_type | text | YES | — | Quotations, Contracts, POs, Invoices, etc. |
| entity | text | YES | — | |
| related_module | text | YES | — | CRM, Purchasing, HR, etc. |
| related_transaction | text | YES | — | Reference # of linked document |
| file_name | text | YES | — | |
| file_path | text | YES | — | Supabase Storage path |
| file_type | text | YES | — | MIME type |
| file_size | int | YES | — | Bytes |
| status | text | YES | 'Active' | Draft, Active, Archived |
| uploaded_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `document_versions`
Version history for company documents.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| version_id | serial | NO | auto | **PK** |
| document_id | int | NO | — | **FK → company_documents** |
| version_number | int | NO | — | |
| file_name | text | YES | — | |
| file_path | text | YES | — | |
| file_type | text | YES | — | |
| file_size | int | YES | — | |
| change_notes | text | YES | — | What changed |
| uploaded_by | text | YES | — | |
| created_at | timestamptz | YES | now() | |

### `documents`
Legacy/simple document table (CRM-linked).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| document_id | serial | NO | auto | **PK** |
| client_id | int | YES | — | **FK → client_list** |
| document_name | text | NO | — | |
| document_type | text | YES | — | |
| file_path | text | YES | — | |
| employee_id | int | YES | — | Uploader |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |


---

## 17. Workflow Approval

### `workflow_approvals`
Cross-module approval requests.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| approval_id | serial | NO | auto | **PK** |
| request_type | text | NO | — | Quotation, PR, PO, Payment Voucher, Payroll, Leave, Contract |
| entity | text | YES | — | |
| reference_module | text | YES | — | Source module |
| reference_id | int | YES | — | Source record ID |
| reference_number | text | YES | — | Source document # |
| department | text | YES | — | |
| amount | numeric | YES | — | |
| requester_employee_id | int | YES | — | **FK → employees** |
| requester_name | text | YES | — | |
| approver_employee_id | int | YES | — | **FK → employees** |
| approver_name | text | YES | — | |
| priority | text | YES | 'Normal' | Low, Normal, High, Urgent |
| status | text | YES | 'Pending' | Pending, Approved, Rejected, Returned, Escalated, Cancelled |
| remarks | text | YES | — | |
| action_at | timestamptz | YES | — | When approved/rejected |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `workflow_approval_comments`
Comments/audit trail on approval requests.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| comment_id | serial | NO | auto | **PK** |
| approval_id | int | NO | — | **FK → workflow_approvals** |
| action | text | YES | — | Submitted, Approved, Rejected, Returned, Escalated, Comment |
| comment | text | YES | — | |
| performed_by | text | YES | — | |
| performed_by_id | int | YES | — | **FK → employees** |
| created_at | timestamptz | YES | now() | |


---

## 18. Audit & System

### `audit_logs`
Full audit trail of all mutations.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| log_id | serial | NO | auto | **PK** |
| employee_id | int | YES | — | **FK → employees** |
| action | text | NO | — | CREATE, UPDATE, DELETE, ARCHIVE, RESTORE, LOGIN, LOGOUT |
| module_name | text | YES | — | Source module |
| record_id | int | YES | — | Affected record |
| description | text | YES | — | Human-readable summary |
| ip_address | text | YES | — | Client IP |
| performed_by | text | YES | — | Email or name |
| old_values | jsonb | YES | — | Before state |
| new_values | jsonb | YES | — | After state |
| created_at | timestamptz | YES | now() | |

### `access_denied_log`
Failed access attempts (RBAC denials).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| employee_id | int | YES | — | **FK → employees** |
| email | varchar | YES | — | |
| attempted_module | varchar | NO | — | Module access was denied for |
| attempted_action | varchar | NO | — | Action access was denied for |
| endpoint | varchar | YES | — | Request endpoint path |
| ip_address | varchar | YES | — | |
| denied_at | timestamptz | NO | now() | |

---

## 19. Inter-Company

### `intercompany_links`
Tracks paired documents across entities (e.g., KSI's PO ↔ GreatnessLab's AR invoice).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| buyer_entity | varchar | NO | — | Entity that made the purchase |
| seller_entity | varchar | NO | — | Entity that made the sale |
| source_type | varchar | NO | — | 'purchase_order' |
| source_id | int | NO | — | e.g. purchase_order_id |
| source_number | varchar | YES | — | PO number (display) |
| target_type | varchar | NO | — | 'ar_invoice' |
| target_id | int | NO | — | e.g. ar_invoices.invoice_id |
| target_number | varchar | YES | — | Invoice number (display) |
| status | varchar | YES | 'ACTIVE' | ACTIVE, VOIDED |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `employee_entities`
Maps employees to their authorized entities (ABAC).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| employee_id | int | NO | — | **FK → employees** |
| entity | varchar(50) | NO | — | Expedia/GreatnessLab/Exigent/KSI |
| access_level | varchar(20) | NO | 'full' | full, read_only |
| granted_by | int | YES | — | **FK → employees** |
| granted_at | timestamptz | YES | now() | |

Unique constraint: (employee_id, entity)

### `abac_policies`
Attribute-based access control policies (supplements RBAC).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | serial | NO | auto | **PK** |
| policy_name | varchar(100) | NO | — | |
| description | text | YES | — | |
| module_key | varchar(50) | NO | — | Target module or '*' for all |
| action | varchar(50) | NO | — | view, create, edit, delete, approve |
| condition_type | varchar(50) | NO | — | amount_threshold, ownership, department, time_based |
| condition_field | varchar(100) | YES | — | e.g. 'total_amount', 'created_by' |
| condition_operator | varchar(20) | YES | — | lte, gte, eq, neq, in |
| condition_value | text | YES | — | Threshold value or JSON array |
| applies_to_roles | text[] | YES | — | NULL = all roles |
| is_active | boolean | YES | true | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

---

## Cross-Reference: Foreign Key Relationships

| Source Table | Column | → Target Table | Target Column |
|--------------|--------|----------------|---------------|
| employee_roles | employee_id | employees | employee_id |
| employee_roles | role_id | roles | role_id |
| employee_201 | employee_id | employees | employee_id |
| ar_invoices | customer_id | client_list | client_id |
| ar_invoice_items | invoice_id | ar_invoices | invoice_id |
| ar_collections | invoice_id | ar_invoices | invoice_id |
| ap_bills | supplier_id | supplier_list | supplier_id |
| ap_bill_items | bill_id | ap_bills | bill_id |
| ap_payment_vouchers | supplier_id | supplier_list | supplier_id |
| ap_voucher_bills | voucher_id | ap_payment_vouchers | voucher_id |
| ap_voucher_bills | bill_id | ap_bills | bill_id |
| ap_payments | bill_id | ap_bills | bill_id |
| ap_checks | voucher_id | ap_payment_vouchers | voucher_id |
| gl_journal_lines | entry_id | gl_journal_entries | entry_id |
| gl_journal_lines | account_id | gl_accounts | account_id |
| gl_accounts | parent_account_id | gl_accounts | account_id |
| purchase_requests | warehouse_id | warehouses | warehouse_id |
| purchase_orders | purchase_request_id | purchase_requests | purchase_request_id |
| purchase_orders | supplier_id | supplier_list | supplier_id |
| purchase_order_items | purchase_order_id | purchase_orders | purchase_order_id |
| goods_receipts | purchase_order_id | purchase_orders | purchase_order_id |
| sales_orders | quotation_id | quotations | quotation_id |
| sales_orders | client_id | client_list | client_id |
| delivery_notes | sales_order_id | sales_orders | sales_order_id |
| quotations | client_id | client_list | client_id |
| quotation_items | quotation_id | quotations | quotation_id |
| projects | client_id | client_list | client_id |
| projects | project_manager_id | employees | employee_id |
| project_tasks | project_id | projects | project_id |
| project_milestones | project_id | projects | project_id |
| commission_records | employee_id | employees | employee_id |
| payroll_employees | payroll_run_id | payroll_runs | payroll_run_id |
| payroll_employees | employee_id | employees | employee_id |
| workflow_approvals | requester_employee_id | employees | employee_id |
| workflow_approvals | approver_employee_id | employees | employee_id |
| contact_list | client_id | client_list | client_id |
| inventory_stock | product_code | product_list | product_code |
| inventory_stock | warehouse_id | warehouses | warehouse_id |
| inventory_locations | warehouse_id | warehouses | warehouse_id |

---

## Entity Code Mapping

| Entity Name | Code Prefix | Used In |
|-------------|-------------|---------|
| Expedia (EXSSI) | EXP | All document numbers |
| GreatnessLab | GL | All document numbers |
| Exigent Corporation | EXI | All document numbers |
| KSI | KSI | All document numbers |

**Document Number Format:** `{PREFIX}-{YYYY}-{TYPE}-{NNNN}`

Examples:
- `EXP-2026-INV-0001` — Expedia AR Invoice #1
- `GL-2026-PO-0023` — GreatnessLab Purchase Order #23
- `KSI-2026-JE-0005` — KSI Journal Entry #5

### Transaction currency snapshots (migration `20260720000600_add_transaction_currency.sql`)

Purchasing and AP transaction headers now carry `currency_code` (`PHP` or `USD`). The server derives it from the immutable purchasing source/supplier classification: `INTERNATIONAL` → `USD`; `LOCAL` and `INTERCOMPANY` → `PHP`. Existing numeric amount columns remain transaction-currency amounts and are not silently converted. Currency is copied from purchase request → supplier quotation → purchase order → AP bill → payment voucher/payment/check, and reports expose currency-grouped totals so PHP and USD values are not presented as one currency.
