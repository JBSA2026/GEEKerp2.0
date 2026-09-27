# CRM/Sales Workflow — Complete Guide

## Overview

```
Lead → Opportunity → Quotation → Sales Order → Fulfillment → Billing → Collection
         (Pipeline)    (Approval)    (Auto)       (Per Type)    (AR)      (Payments)
```

**Full Flow:**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  LEAD ──► OPPORTUNITY ──► QUOTATION ──► CLOSED WON ──► SALES ORDER             │
│   │        (Pipeline)      (Approval)     (Auto)         │                      │
│   │                                                      ├─► PROJECT            │
│   │                                                      ├─► INVENTORY (DIRECT) │
│   │                                                      └─► AR INVOICE         │
│   │                                                                             │
│   └─ Convert to Opportunity (auto-creates, archives lead)                       │
│                                                                                 │
│  FULFILLMENT PATHS:                                                             │
│    DIRECT:  Reserve Stock → Deliver → Invoice → Collect                         │
│    MTO:     Production → Testing → Client Acceptance → Invoice → Collect        │
│    SERVICE: Ready → Deliver → Invoice → Collect                                 │
│                                                                                 │
│  CONNECTED:                                                                     │
│    Purchasing ← low-stock triggers Purchase Requests                            │
│    AP ← Purchase Orders create AP Bills                                         │
│    Workflow Approval ← Quotation approval, PR approval, PO approval             │
│    Audit Trail ← every mutation logged                                          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Lead Management

### What is a Lead?

A lead is a potential business contact that hasn't been qualified into a sales opportunity yet. It's the entry point of the sales funnel.

### Lead Fields

| Field | Description |
|-------|-------------|
| company_name | Company or prospect name |
| contact_name | Primary contact person |
| email | Contact email |
| mobile_number | Phone number |
| lead_source | How they found us (Referral, Website, Cold Call, Event, Social Media, Partner, Other) |
| lead_status | New, Contacted, Qualified, Unqualified, Converted |
| interest_level | High, Medium, Low |
| remarks | Additional notes |
| client_id | Optional link to existing client |
| employee_id | Assigned salesperson |

### Lead Lifecycle

```
New → Contacted → Qualified → Converted (to Opportunity)
                 └→ Unqualified (dead end)
```

### Converting a Lead to Opportunity

**Trigger:** User clicks "Convert to Opportunity" button on a lead row.

**What happens:**

1. System creates a new Opportunity with:
   - `project_name` = lead's `company_name`
   - `client_id` = lead's `client_id`
   - `employee_id` = lead's `employee_id`
   - `stage` = "Prospecting"
   - `remarks` = lead's remarks + contact info (name, email, mobile, source, interest)
2. Lead's `lead_status` is set to "Converted"
3. Lead's `converted_opportunity_id` links to the new opportunity
4. User is navigated to the Sales Pipeline

**Endpoint:** `POST /leads/{lead_id}/convert-to-opportunity`

---

## Stage 2: Opportunity Pipeline (Sales Pipeline)

### Pipeline Stages

| # | Stage | Description | Gate Requirement |
|---|-------|-------------|------------------|
| 1 | Prospecting | Initial contact, gathering info | None (free entry) |
| 2 | Qualification | Assessing fit and budget | None (free move from Prospecting) |
| 3 | Proposal | Quotation being prepared | **Quotation must exist** for this deal |
| 4 | Negotiation | Client reviewing quotation | **Quotation must be APPROVED + SENT** |
| 5 | Closed Won | Deal won, triggers automation | **Quotation must be APPROVED/SENT** |
| 6 | Closed Lost | Deal lost | Can be reached from any stage |

### Stage Gate Enforcement

#### Moving to Proposal
- System checks if a matching quotation exists (by `opportunity_id` or `client_id + project_name`)
- If no quotation: prompts user to **create one** → navigates to `/quotation/new` with pre-filled data
- If quotation exists: allows the move

#### Moving to Negotiation
- System checks if a matching quotation has been **SENT** (status in: SENT, APPROVED, CONVERTED)
- If not sent: prompts user to go approve/send it → navigates to quotation list with highlight
- If sent: allows the move

#### Moving to Closed Won
- Backend validates quotation is not DRAFT, FOR_APPROVAL, or REJECTED
- If quotation is APPROVED/SENT, it's auto-converted
- **Triggers the Closed Won Automation** (see Stage 4)

#### Moving to Closed Lost
- Confirmation prompt
- No quotation required
- Can be reached from any stage

#### Moving OUT of Closed Won (Reopening)
- Shows warning: "will cancel draft downstream records and release unissued reservations"
- Requires `confirm_reopen: true`
- Reverses: cancels project, cancels SO, archives draft invoices, releases inventory reservations
- Quotation status reset to SENT or REJECTED depending on target stage

### Return to Proposal (from Negotiation or Closed Lost)
- Prompts for a **return reason** (stored on the opportunity as `return_reason`)
- Marks the deal with a "REV" badge on the pipeline card

---

## Stage 3: Quotation

### Quotation Statuses

```
DRAFT → FOR_APPROVAL → APPROVED → SENT → CONVERTED
                      └→ REJECTED → DRAFT (re-edit)
```

| Status | Meaning | Next Actions |
|--------|---------|--------------|
| DRAFT | Being prepared | Submit for Approval |
| FOR_APPROVAL | Waiting for manager sign-off | Approve or Reject |
| APPROVED | Approved, ready to send | Send to client |
| SENT | Client has received it | Convert or Reject |
| REJECTED | Client/manager rejected | Re-draft or create follow-up |
| CONVERTED | Converted to project/SO | Terminal state |

### Quotation Fields

- **Header:** client, project_name, company (entity), validity, payment terms, delivery terms, VAT/WHT rates, discounts, shipping
- **Line Items:** product_type, product_code, description, quantity, UOM, unit_cost, selling_price, discount_percent, **fulfillment_type** (override)
- **Fulfillment Type per line:** Auto (inherit from product), DIRECT, MTO, SERVICE

### Key Quotation Behaviors

1. **Creating a quotation** auto-moves the related opportunity to "Proposal" stage
2. **Sending a quotation** auto-moves opportunity to "Negotiation"
3. **Converting a quotation** auto-moves opportunity to "Closed Won" and triggers automation
4. **Rejecting a sent quotation** creates a follow-up draft automatically
5. **Revising** creates a new version (e.g., QTN-001-R1, QTN-001-R2)

### Workflow Approval Integration

- When status → FOR_APPROVAL: a workflow approval request is created
- Approver sees it in Workflow Approval module
- Approval → status becomes APPROVED
- Rejection → status becomes REJECTED with remarks

---

## Stage 4: Closed Won Automation

**Trigger:** Opportunity moves to "Closed Won" (via pipeline drag or quotation acceptance)

**Endpoint:** `run_closed_won_automation(opportunity_id, performed_by, request)`

### Step-by-step:

1. **Find the latest quotation** for this opportunity (by `opportunity_id`, then by `project_name + client_id`)
2. **Validate quotation status** — must not be DRAFT, FOR_APPROVAL, or REJECTED
3. **Auto-convert** if quotation is APPROVED/SENT (sets status to CONVERTED)
4. **Determine order type** by scanning all quotation line items:
   - Resolves `fulfillment_type` per line: line override > product master default > 'DIRECT'
   - If all lines DIRECT → order_type = `DIRECT`
   - If all lines MTO → order_type = `MTO`
   - If all lines SERVICE → order_type = `SERVICE`
   - Otherwise → order_type = `MIXED`
5. **Reserve inventory** (DIRECT items only):
   - Skips MTO and SERVICE items entirely
   - For DIRECT: checks `inventory_stock` for available quantity
   - If insufficient: **warns but allows** for MIXED orders; **blocks** for pure DIRECT orders
   - Creates reservation plan (stock_id, quantity, warehouse)
   - Updates `reserved_quantity` on `inventory_stock`
6. **Create Sales Order** with:
   - `order_type` = DIRECT/MTO/SERVICE/MIXED
   - `status` = RESERVED (DIRECT) or IN_PRODUCTION (MTO/MIXED)
   - Line items with per-line `fulfillment_type` and `fulfillment_status`
7. **Create Project** (if MTO items exist, or for DIRECT orders for delivery tracking)
8. **Log history** on quotation

### What gets created:

| Entity | When |
|--------|------|
| Sales Order | Always |
| Sales Order Items | Always (with fulfillment tracking) |
| Inventory Reservation | Only for DIRECT items with available stock |
| Project | If MTO items exist OR for DIRECT-only orders |
| AR Invoice | NOT yet — waits for delivery/acceptance |

---

## Stage 5: Sales Order

### Sales Order Fields

| Field | Description |
|-------|-------------|
| so_number | Auto-generated (SO-YYYYMM-NNN) |
| quotation_id | Link back to source quotation |
| order_type | DIRECT, MTO, SERVICE, MIXED |
| status | RESERVED, IN_PRODUCTION, DELIVERED, CANCELLED |
| client_id, project_name | From quotation |
| subtotal, vat_amount, grand_total | Calculated from line items |

### Sales Order Item Fields

| Field | Description |
|-------|-------------|
| fulfillment_type | DIRECT, MTO, SERVICE |
| fulfillment_status | PENDING, READY_TO_FULFILL, IN_PRODUCTION, TESTING, AWAITING_ACCEPTANCE, DELIVERED, CANCELLED |
| quantity_ordered | Original quantity |
| quantity_reserved | Inventory reserved (DIRECT only) |
| quantity_delivered | How much has been delivered |
| warehouse_id | Where stock is allocated from |
| allocated_stock_id | Specific stock record reserved |

### Initial Fulfillment Status by Type

| Fulfillment Type | Initial Status | Reason |
|-----------------|----------------|--------|
| DIRECT (with stock) | READY_TO_FULFILL | Stock reserved, ready to ship |
| DIRECT (no stock) | PENDING | Waiting for stock |
| MTO | IN_PRODUCTION | Needs manufacturing |
| SERVICE | READY_TO_FULFILL | No physical goods needed |

---

## Stage 6: Fulfillment (Per Type)

### DIRECT Fulfillment

```
READY_TO_FULFILL → DELIVERED
```

1. Stock was reserved at Closed Won
2. User clicks "Mark Delivered" on the line item
3. `fulfillment_status` → DELIVERED
4. `quantity_delivered` = `quantity_ordered`
5. When ALL lines are DELIVERED → SO header status → DELIVERED
6. Stock out movement recorded in `inventory_movements`
7. `inventory_stock.quantity_on_hand` decremented
8. `inventory_stock.reserved_quantity` decremented
9. If stock falls below reorder level → auto-creates Purchase Request

**Endpoint:** `POST /sales-orders/{id}/items/{item_id}/deliver`

### MTO Fulfillment (Made-to-Order)

```
IN_PRODUCTION → TESTING → AWAITING_ACCEPTANCE → DELIVERED
                  ↑              │
                  └──── FAILED ──┘ (back to production or testing)
```

#### Step 1: Submit for Testing
- **Trigger:** User clicks "Submit for Testing"
- **Endpoint:** `POST /sales-orders/{id}/items/{item_id}/submit-testing`
- **Status change:** IN_PRODUCTION → TESTING
- **Who does this:** Production/manufacturing team

#### Step 2: Record Test Result
- **Trigger:** QA team tests the product
- **Endpoint:** `POST /sales-orders/{id}/items/{item_id}/test-result`
- **Body:** `{ test_result: "PASSED" | "FAILED" | "PARTIAL", remarks: "..." }`
- **Status changes:**
  - PASSED → AWAITING_ACCEPTANCE
  - FAILED → IN_PRODUCTION (back to manufacturing)
  - PARTIAL → stays in TESTING
- **Records:** Creates entry in `sales_order_testing` table

#### Step 3: Client Acceptance
- **Trigger:** Client reviews and accepts/rejects the product
- **Endpoint:** `POST /sales-orders/{id}/items/{item_id}/client-acceptance`
- **Body:** `{ accepted: true/false, remarks: "..." }`
- **Status changes:**
  - Accepted → DELIVERED + triggers AR invoice eligibility
  - Rejected → TESTING (creates a FAILED test record noting client rejection)
- **Records:** Updates `sales_order_testing` record with `client_accepted`, `accepted_at`, `accepted_by`

### SERVICE Fulfillment

```
READY_TO_FULFILL → DELIVERED
```

Same as DIRECT but no inventory impact. Just mark delivered when service is rendered.

**Endpoint:** `POST /sales-orders/{id}/items/{item_id}/deliver`

---

## Stage 7: Project Management

### When Projects Are Created

- **MTO orders:** Always (tracks production phases)
- **DIRECT orders:** Yes (tracks delivery)
- **SERVICE-only orders:** Not automatically (optional)

### Project Fields (from Sales Order)

| Project Field | Source |
|---------------|--------|
| project_name | From quotation |
| client_id | From quotation |
| contract_value | SO grand_total |
| quotation_id | Link back |
| entity | From quotation company |
| status | PLANNING |

### Project Material Allocation (for MTO)

- Materials needed for production are tracked in `project_materials`
- Stock is allocated via `project_material_allocations`
- When reopening a Closed Won deal, allocations are released

---

## Stage 8: Billing (Accounts Receivable)

### When AR Invoices Are Created

| Fulfillment Type | Invoice Trigger | Timing |
|-----------------|-----------------|--------|
| DIRECT | On delivery | After stock is shipped |
| MTO | On client acceptance | After `client_accepted = true` |
| SERVICE | On delivery | After service rendered |

### AR Invoice Source

- Created from Sales Order (`sales_order_ref = so_number`)
- Links to client, amounts from SO totals
- Initial status: DRAFT
- Lifecycle: DRAFT → CONFIRMED → PAID

### Invoice Fields

- invoice_number, client_id, sales_order_ref, project_code
- subtotal, vat_amount, wht_amount, grand_total
- lifecycle_status (DRAFT, CONFIRMED, PAID)
- record_status (ACTIVE, ARCHIVED)

---

## Stage 9: Collection

### AR Payment Flow

1. Invoice is confirmed (CONFIRMED status)
2. Client makes payment
3. Payment recorded in AR module
4. Invoice marked as PAID (full) or partially paid
5. Aging reports track overdue invoices

### AR Aging Buckets

- Current (not yet due)
- 1-30 days overdue
- 31-60 days overdue
- 61-90 days overdue
- 90+ days overdue

---

## Connected Modules

### Purchasing (Auto-Replenishment)

**Trigger:** When sales delivery consumes inventory and stock falls below reorder level.

**Flow:**
1. Sales delivery → stock out → `quantity_on_hand` drops
2. System checks if `quantity_on_hand < reorder_level`
3. If yes → auto-creates a Purchase Request
4. PR goes through approval workflow
5. Approved PR → Purchase Order → Goods Receipt → Stock replenished

### Accounts Payable

- Purchase Orders create AP Bills when goods are received
- AP tracks what the company owes to suppliers
- Connected to GL for accounting entries

### Workflow Approval

**Entities that need approval:**
- Quotations (FOR_APPROVAL status)
- Purchase Requests
- Purchase Orders
- Leave requests (HR)
- Journal Entries (GL)

### Inventory Module

**Interactions with Sales:**
- `inventory_stock` — tracks quantity_on_hand, reserved_quantity per product per warehouse
- `inventory_movements` — logs every stock in/out (STOCK_IN for receiving, STOCK_OUT for sales delivery)
- Reservation at Closed Won: increases `reserved_quantity`
- Delivery: decreases both `quantity_on_hand` and `reserved_quantity`, creates STOCK_OUT movement

### Audit Trail

Every mutation (POST, PUT, PATCH, DELETE) across all modules is logged with:
- action (CREATE, UPDATE, DELETE, STATUS_CHANGE, ARCHIVE, etc.)
- module_name
- description
- performed_by (email)
- record_id
- IP address
- timestamp

---

## Reopening a Closed Won Deal

**Trigger:** Dragging a deal OUT of Closed Won back to any other stage.

**What gets reversed:**

| Entity | Action |
|--------|--------|
| Project | Status → CANCELLED, materials reset to PLANNED, allocations released |
| Project Material Allocations | Deleted, reserved_quantity on inventory_stock decremented |
| Sales Order | Status → CANCELLED |
| AR Invoices (DRAFT only) | record_status → ARCHIVED |
| Quotation | Status reset to SENT (or REJECTED if moved to Closed Lost) |
| Inventory Reservations | Released (reserved_quantity decremented) |

**Blocks if:**
- Sales Order is already DELIVERED
- Project has already ISSUED materials
- AR Invoice is CONFIRMED (not just DRAFT)

---

## Status Reference Tables

### Lead Statuses
| Status | Description |
|--------|-------------|
| New | Just captured |
| Contacted | Initial outreach done |
| Qualified | Meets criteria for opportunity |
| Unqualified | Does not fit |
| Converted | Turned into an opportunity |
| Archived | Archived/inactive |

### Pipeline Stages
| Stage | Position |
|-------|----------|
| Prospecting | 1 |
| Qualification | 2 |
| Proposal | 3 (requires quotation) |
| Negotiation | 4 (requires sent quotation) |
| Closed Won | 5 (triggers automation) |
| Closed Lost | 6 (terminal) |

### Quotation Statuses
| Status | Next Allowed |
|--------|--------------|
| DRAFT | FOR_APPROVAL |
| FOR_APPROVAL | APPROVED, REJECTED |
| APPROVED | SENT |
| SENT | CONVERTED, REJECTED |
| REJECTED | DRAFT |

### Sales Order Statuses
| Status | Meaning |
|--------|---------|
| RESERVED | DIRECT items have stock reserved |
| IN_PRODUCTION | MTO items being manufactured |
| DELIVERED | All items delivered |
| CANCELLED | Deal was reopened/reversed |

### Fulfillment Types
| Type | Inventory Check | Invoice Trigger | Workflow |
|------|----------------|-----------------|----------|
| DIRECT | Yes (reserve at close) | On delivery | Reserve → Deliver |
| MTO | No | On client acceptance | Production → Test → Accept → Deliver |
| SERVICE | No | On delivery | Ready → Deliver |

### Fulfillment Statuses
| Status | Applies To | Meaning |
|--------|-----------|---------|
| PENDING | DIRECT | Waiting for stock |
| READY_TO_FULFILL | DIRECT, SERVICE | Can be delivered now |
| IN_PRODUCTION | MTO | Being manufactured |
| TESTING | MTO | In QA/testing phase |
| AWAITING_ACCEPTANCE | MTO | Client reviewing |
| DELIVERED | All | Done |
| CANCELLED | All | Reversed |

### AR Invoice Lifecycle
| Status | Meaning |
|--------|---------|
| DRAFT | Created, not yet confirmed |
| CONFIRMED | Sent to client, awaiting payment |
| PAID | Fully collected |

---

## API Endpoints Summary

### Leads
| Method | Endpoint | Action |
|--------|----------|--------|
| GET | /leads/ | List all leads |
| POST | /leads/ | Create a lead |
| PATCH | /leads/{id} | Update a lead |
| POST | /leads/{id}/convert-to-opportunity | Convert to opportunity |

### Pipeline
| Method | Endpoint | Action |
|--------|----------|--------|
| GET | /crm/pipeline | Get all opportunities |
| PATCH | /crm/pipeline/{id}/stage | Move stage (with gate logic) |

### Quotations
| Method | Endpoint | Action |
|--------|----------|--------|
| POST | /quotations/ | Create quotation |
| PATCH | /quotations/{id} | Update quotation |
| POST | /quotations/{id}/status | Change status |
| POST | /quotations/{id}/revise | Create revision |

### Sales Orders
| Method | Endpoint | Action |
|--------|----------|--------|
| GET | /sales-orders/ | List all SOs |
| GET | /sales-orders/{id} | Get SO with items + testing records |
| POST | /sales-orders/{id}/items/{item_id}/submit-testing | MTO: start testing |
| POST | /sales-orders/{id}/items/{item_id}/test-result | MTO: record test |
| POST | /sales-orders/{id}/items/{item_id}/client-acceptance | MTO: client accept/reject |
| POST | /sales-orders/{id}/items/{item_id}/deliver | DIRECT/SERVICE: mark delivered |
| GET | /sales-orders/{id}/testing | Get all test records |
