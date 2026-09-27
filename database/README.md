# GEEK ERP database

The original database scripts (`sql/employees.sql` and `supabase/migrations/`) were
not in the repository, so this folder holds a **rebuilt** schema. It creates everything
the backend needs on an empty Supabase (or plain PostgreSQL) database.

| File | What it does |
| ---- | ------------ |
| `01_schema.sql` | 114 tables, keys, relationships, indexes, calculated columns, triggers |
| `02_functions.sql` | `gl_ledger_postings` view, `receive_inventory_transfer()` function, API grants |
| `03_seed.sql` | Roles, Super Admin login, the 4 companies, tax codes, starter chart of accounts |
| `04_storage.sql` | Supabase Storage buckets for uploaded files (Supabase only) |
| `05_enable_rls.sql` | **Optional** lock-down for production (read the note inside first) |

## Set up a new database

1. Create a new Supabase project (or use an empty one).
2. Open **SQL Editor** and run the files **in order**: `01` → `02` → `03` → `04`.
   Each file is one paste-and-run.
   (Or from a terminal: `psql "$DATABASE_URL" -f database/01_schema.sql`, and so on.)
3. In **Project Settings → API**, copy the project URL and the **secret** key
   into `backend/.env`:
   ```env
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_KEY=<secret key (sb_secret_... or the service_role key)>
   ```
4. Start the app and log in:

   | Email | Password |
   | ----- | -------- |
   | `superadmin@geek` | `admin@123` |

   **Change this password right away** (Administration → Employees).
5. Fill in each company's TIN, RDO code and registered address before generating
   BIR forms. They are seeded blank in `entity_tax_profiles`.
6. Recommended: once the backend runs with the secret key, run `05_enable_rls.sql`.

### Why the secret key?

The backend is the only thing that talks to the database. The publishable/anon key is
designed to be public, and with it every table (salaries, password hashes, invoices) is
readable by anyone who has the project URL and that key. With the secret key plus
`05_enable_rls.sql`, only the backend can reach the data. The old README said to use the
publishable key. That still works with files 01–04, but it isn't safe for real data.

## How it was rebuilt

1. **Documented tables:** `reference/schema-map.md` (dated 2026-07-16) supplied 95
   tables with column types and defaults.
2. **Code scan:** every `supabase.table(...)` call in `backend/` was scanned for the
   tables, columns, filters, joins and written fields it uses. That added 20 tables
   the map doesn't document (BIR forms, tax calendar/reminders, the BIR books, OJT
   logs/NDAs/evaluations, sales-order testing, entity tax profiles). It also added
   about 270 columns the map was missing or had wrong, including changes from the
   July 20–22 migrations that were never committed.
3. **Tested against the real backend:** the schema was loaded into PostgreSQL 16 behind
   PostgREST (the API layer Supabase uses), and the actual FastAPI backend ran against it:
   - all 233 read endpoints, called while logged in as Super Admin;
   - every create/update endpoint, with request bodies generated from its request model;
   - an end-to-end scenario covering hiring, attendance, leave, OJT and recruitment;
     products and stock transfers; quotation → sales order → delivery; AR invoice →
     collection; purchase request → RFQ → supplier quote → PO → workflow approval →
     goods receipt; AP bill → voucher → payment → check; journal entries and the BIR
     books; payroll generate → approve → release; commissions; BIR forms; tax reminders.

   Every database error PostgREST returned during these runs was logged. The final
   schema produced **no missing table, column or relationship errors**. It was also
   re-tested with `05_enable_rls.sql` applied, with the same result.

## Things that were decided, not recovered

These choices come from the code's behavior, since the original database wasn't available:

- **Primary keys follow the code, not the map.** For example, the HR tables use `id`,
  `payroll_runs` uses `run_id`, and `payroll_employees` uses `payroll_employee_id`.
- **UUID IDs:** `tax_calendar`, `tax_reminders` and `tax_reminder_logs` use UUIDs,
  because the code treats their IDs as text. Inventory locations use UUIDs, as the
  map says.
- **Calculated columns** (the code says they're database-generated and never writes them):
  - `ap_bills`: gross = VAT-exclusive + input VAT; EWT = 1% of VAT-exclusive (PHP
    bills only); net payable = gross − EWT.
  - `ar_invoices`: gross = subtotal + output VAT; net collectible = gross − WHT.
  - `supplier_quotation_items.quotation_amount` = quantity × unit cost.
- **Status defaults** match the exact values the code writes and filters on (for
  example, payroll employees `active`, commissions `Draft`, delivery notes
  `Preparing`, quotations `DRAFT`).
- **Primary contact:** adding a new primary contact automatically demotes the client's
  previous one (trigger), as the schema map describes.
- **Required fields:** `NOT NULL` is only kept where the code always supplies the value.
  This favors "the app works" over strictness.
- **Relationships:** deleting a document deletes its line items. Other links are set to
  empty rather than blocking the delete.
- **`receive_inventory_transfer()`** was rewritten from how the backend calls it: it
  adds the transferred quantity to the destination stock and marks the transfer
  `RECEIVED`.
- **Starter chart of accounts:** contains only the 9 account codes the automatic
  postings need. Add the rest in General Ledger → Accounts.

If you ever get access to the original Supabase project, compare it with this schema;
the original's exact types and constraints would be more authoritative.

## Existing code bugs found during testing (not fixed here)

These come from the backend code, not the database:

- `routers/general_ledger.py`: `RemarksUpdate` is used before it is defined, so the
  interactive API docs (`/docs`, `/openapi.json`) fail to load.
- `routers/tax_reminders.py`: `GET /tax/reminders/notifications` is caught by
  `GET /tax/reminders/{reminder_id}` and returns an error.
- `routers/workflow_approval.py`: `GET /workflow-approval/export` calls another endpoint
  function directly, so it passes placeholder values as filters and fails.
- The backend needs Python 3.14 exactly as `pyproject.toml` says: it doesn't import
  on 3.13 (deferred annotations) or on the 3.14 release candidates.
