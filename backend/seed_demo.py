"""Load a realistic set of demo records through the running backend API.

Walks one example of every main business flow (HR, master data, inventory,
sales, purchasing → AP, AR, general ledger, payroll, commissions, tax) so every
screen has something to show. Use it on a TEST database, not production data.

Usage (backend must be running):
    cd backend
    uv run python seed_demo.py                      # http://localhost:8000
    uv run python seed_demo.py --api http://host:8000 --email you@x --password ...
"""
import argparse, datetime, sys
import httpx

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--api", default="http://localhost:8000")
ap.add_argument("--email", default="superadmin@geek")
ap.add_argument("--password", default="admin@123")
args = ap.parse_args()

c = httpx.Client(base_url=args.api, timeout=60)
login = c.post("/auth/login", data={"username": args.email, "password": args.password})
if login.status_code != 200:
    sys.exit(f"Login failed ({login.status_code}): {login.text[:200]}")
H = {"Authorization": f"Bearer {login.json()['access_token']}"}
T = datetime.date.today()
D = lambda n=0: (T + datetime.timedelta(days=n)).isoformat()
RESULTS = []


def call(label, method, path, body=None, ok=(200, 201)):
    r = c.request(method, path, json=body, headers=H)
    good = r.status_code in ok
    RESULTS.append((good, label, r.status_code))
    try:
        data = r.json()
    except Exception:
        data = r.text
    mark = "PASS" if good else "FAIL"
    print(f"[{mark}] {label}: {method} {path} -> {r.status_code}" + ("" if good else f"  {str(data)[:300]}"))
    return data if good else None


def first(x, *keys):
    if isinstance(x, list):
        x = x[0] if x else {}
    for k in keys:
        if isinstance(x, dict) and k in x:
            x = x[k]
    return x


# ---------------------------------------------------------------- HR
emp = call("create employee account", "POST", "/employees/", {
    "first_name": "Ana", "last_name": "Reyes", "email": "ana.reyes@example.com",
    "password": "Password123!", "roles": ["SALES_USER"]})
emp_id = first(emp, "employee_id") if emp else 2
e201 = call("create 201 record", "POST", "/hr/201", {
    "first_name": "Ben", "last_name": "Cruz", "email": "ben.cruz@example.com", "department": "Sales",
    "position": "Account Manager", "entity": "Expedia", "date_hired": D(-400), "salary": 30000,
    "sss_number": "12-3456789-0", "philhealth_number": "12-345678901-2", "pagibig_number": "1234-5678-9012",
    "tin_number": "123-456-789-000", "emergency_contact_name": "Carla Cruz", "emergency_contact_number": "09171234567",
    "supervisor_id": 1, "address": "Makati"})
ben = first(e201, "employee_id") or first(e201, "employee", "employee_id") or 3
call("update 201", "PATCH", f"/hr/201/{ben}", {"position": "Senior Account Manager", "salary": 35000})
call("attendance", "POST", "/hr/attendance", {"employee_id": ben, "date": D(-1), "time_in": "08:05:00",
                                             "time_out": "17:10:00", "entity": "Expedia"})
call("leave balances init", "POST", "/hr/leave/balances/init", {"employee_id": ben, "year": T.year})
lv = call("leave request", "POST", "/hr/leave", {"employee_id": ben, "leave_type": "Vacation", "start_date": D(10),
                                                "end_date": D(11), "reason": "Trip", "entity": "Expedia"})
if lv:
    call("approve leave", "PATCH", f"/hr/leave/{first(lv, 'id')}/approve", {"approved_by": 1})
call("ojt trainee", "POST", "/hr/ojt", {"trainee_name": "Dana Lim", "school": "UP", "program": "BSCS",
                                        "department": "IT", "supervisor_id": ben, "entity": "Expedia",
                                        "start_date": D(-30), "end_date": D(60), "required_hours": 300})
job = call("job opening", "POST", "/hr/recruitment", {"position_title": "Accountant", "department": "Finance",
                                                      "entity": "Expedia", "employment_type": "Full-time",
                                                      "target_hire_date": D(30)})
if job:
    call("applicant", "POST", f"/hr/recruitment/{first(job, 'id')}/applicants",
         {"applicant_name": "Eli Tan", "contact_email": "eli@example.com", "source": "LinkedIn"})
call("training", "POST", "/hr/training", {"employee_id": ben, "training_title": "Excel", "training_date": D(5),
                                          "duration_hours": 8, "training_type": "External", "entity": "Expedia"})
call("performance eval", "POST", "/hr/performance", {"employee_id": ben, "evaluator_id": 1,
                                                     "evaluation_period": "Quarterly", "evaluation_date": D(),
                                                     "quality_of_work": 4, "productivity": 4, "communication": 5,
                                                     "teamwork": 4, "initiative": 3, "entity": "Expedia"})

# ---------------------------------------------------------------- master data
wh = call("warehouse", "POST", "/warehouses/", {"warehouse_code": "WH-MAIN", "warehouse_name": "Main", "address": "Pasig"})
wh2 = call("warehouse 2", "POST", "/warehouses/", {"warehouse_code": "WH-CEBU", "warehouse_name": "Cebu"})
wh_id, wh2_id = first(wh, "warehouse_id") or 1, first(wh2, "warehouse_id") or 2
loc = call("location", "POST", "/inventory/locations", {"warehouse_id": str(wh_id), "location_code": "A1",
                                                          "location_name": "Aisle 1"})
loc_id = first(loc, "location_id")
sup = call("supplier", "POST", "/supplier_list/", {"company_name": "Acme Supply", "tin_number": "111-222-333-000",
                                               "supplier_type": "Distributor", "supplier_classification": "LOCAL",
                                               "industry": "IT", "vat_status": "VAT", "billing_address": "QC",
                                               "address": "QC", "payment_terms": "30 days", "employee_id": 1,
                                               "status": "active"})
sup_id = first(sup, "supplier_id") or 1
cli = call("client", "POST", "/clients/", {"company_name": "Globe Corp", "address": "BGC",
                                           "tin_number": "222-333-444-000", "entity": "Expedia", "zip_code": "1634"})
cli_id = first(cli, "client_id") or 1
call("contact", "POST", "/contact_list/", {"client_id": cli_id, "first_name": "Gia", "last_name": "Santos",
                                       "email": "gia@globe.example", "is_primary_contact": True})
call("contact (new primary demotes old)", "POST", "/contact_list/", {"client_id": cli_id, "first_name": "Hugo",
                                                                  "is_primary_contact": True})
prod = call("product", "POST", "/products/", {"product_code": "EXP-2026-PRD-0001", "owner_entity": "Expedia",
                                              "product_brand": "Dell", "product_name": "Laptop", "quantity": 0,
                                              "unit": "Nos", "buying_price_vat": "50000", "selling_price_margin": "65000",
                                              "supplier_name": "Acme Supply", "fulfillment_type": "STOCK"})
pcode = first(prod, "product_code") or "EXP-2026-PRD-0001"

# ---------------------------------------------------------------- inventory
call("stock in", "POST", "/inventory/movements", {"movement_type": "STOCK_IN", "product_code": pcode, "quantity": 10,
                                                  "unit_cost": 50000, "warehouse_id": str(wh_id), "location_id": loc_id})
tr = call("transfer (pending)", "POST", "/inventory/movements", {"movement_type": "TRANSFER", "product_code": pcode,
                                                                 "quantity": 2, "from_warehouse_id": str(wh_id),
                                                                 "from_location_id": loc_id, "to_warehouse_id": str(wh2_id)})
if tr:
    call("receive transfer (RPC receive_inventory_transfer)", "POST",
         f"/inventory/transfers/{first(tr, 'movement_id')}/receive", {})
stock = call("inventory summary", "GET", "/inventory/summary")

# ---------------------------------------------------------------- sales
opp = call("opportunity", "POST", "/opportunities/", {"client_id": cli_id, "project_name": "Laptops for Globe",
                                                      "entity": "Expedia", "estimated_value": 195000, "stage": "Proposal"})
q = call("quotation", "POST", "/quotations/", {"company": "Expedia", "client_id": cli_id, "opportunity_id": first(opp, "opportunity_id"), "project_name": "Laptops for Globe",
                                               "subject": "Laptops", "items": [
                                                   {"product_code": pcode, "description": "Laptop", "quantity": 3,
                                                    "unit_cost": 50000, "selling_price": 65000, "fulfillment_type": "STOCK"},
                                                   {"description": "Custom rack (made to order)", "quantity": 1,
                                                    "unit_cost": 20000, "selling_price": 30000, "fulfillment_type": "MTO"}]})
qid = first(q, "quotation_id")
if qid:
    for st in ("FOR_APPROVAL", "APPROVED", "SENT", "ACCEPTED"):
        call(f"quotation -> {st}", "POST", f"/quotations/{qid}/status", {"status": st})
    call("quotation versions", "GET", f"/quotations/{qid}/versions")
    call("quotation history", "GET", f"/quotations/{qid}/history")
sos = call("sales orders", "GET", "/sales-orders/")
so_id = first(sos, "sales_order_id") if sos else None
if isinstance(sos, dict):
    so_id = first(sos.get("items") or sos.get("data") or [], "sales_order_id")
if so_id:
    so = call("sales order detail", "GET", f"/sales-orders/{so_id}")
    items = (so or {}).get("items") or []
    mto = [i for i in items if (i.get("fulfillment_type") or "").upper() == "MTO"]
    if mto:
        iid = mto[0].get("sales_order_item_id")
        call("SO item submit testing", "POST", f"/sales-orders/{so_id}/items/{iid}/submit-testing")
        call("SO item test result", "POST", f"/sales-orders/{so_id}/items/{iid}/test-result", {"test_result": "PASSED"})
        call("SO item client acceptance", "POST", f"/sales-orders/{so_id}/items/{iid}/client-acceptance", {"accepted": True})
prj = call("project", "POST", "/projects/", {"client_id": cli_id, "project_name": "Globe rollout", "entity": "Expedia",
                                             "quotation_id": qid, "contract_value": 195000, "budget": 150000,
                                             "project_manager_id": ben})
prj_code = first(prj, "project_code")
dn = call("delivery note", "POST", "/delivery-notes/", {"client_id": cli_id, "entity": "Expedia", "delivery_date": D(),
                                                        "address": "BGC", "items": [
                                                            {"product_code": pcode, "description": "Laptop",
                                                             "quantity_ordered": 1, "quantity_delivered": 1}]})
inv = call("AR invoice", "POST", "/ar/invoices", {"customer_id": cli_id, "invoice_date": D(), "project_code": prj_code,
                                                  "items": [{"line_type": "MATERIAL", "description": "Laptops",
                                                             "vat_exclusive_amount": 195000, "vat_code": "VAT_OUTPUT",
                                                             "wht_code": "WHT_MATERIAL_1"}]})
inv_id = first(inv, "invoice_id")
if inv_id:
    call("AR collection", "POST", "/ar/collections", {"invoice_id": inv_id, "collection_amount": 100000,
                                                      "collection_date": D(), "payment_method": "Bank Transfer",
                                                      "or_number": "OR-001"})

# ---------------------------------------------------------------- purchasing -> AP
pr = call("purchase request", "POST", "/purchasing/requests", {"entity": "Expedia", "purchase_source": "LOCAL_PHYSICAL",
                                                               "required_date": D(14), "warehouse_id": wh_id, "items": [
                                                                   {"product_code": pcode, "item_description": "Laptop",
                                                                    "unit": "Nos", "quantity": 5, "estimated_unit_cost": 50000}]})
pr_id = first(pr, "purchase_request_id")
po_id = po_number = None
if pr_id:
    rfq = call("RFQ", "POST", f"/purchasing/requests/{pr_id}/rfq", {"due_date": D(7), "supplier_ids": [sup_id]})
    rfq_id = (rfq or {}).get("rfq_id") or (((rfq or {}).get("rfqs") or [{}])[-1]).get("rfq_id")
    if rfq_id:
        sq = call("supplier quote", "POST", f"/purchasing/rfqs/{rfq_id}/quotes", {
            "supplier_id": sup_id, "valid_until": D(30), "delivery_date": D(10), "freight": 1000, "vat_code": "VAT_INPUT",
            "items": [{"product_code": pcode, "item_description": "Laptop", "unit": "Nos", "quantity": 5, "unit_cost": 48000}]})
        sq_id = (sq or {}).get("supplier_quotation_id") or (((sq or {}).get("quotes") or [{}])[-1]).get("supplier_quotation_id")
        if sq_id:
            call("select quote", "POST", f"/purchasing/quotes/{sq_id}/select")
            po = call("create PO from quote", "POST", f"/purchasing/quotes/{sq_id}/purchase-order")
            if po and "purchase_order_id" not in po:
                po = (po.get("purchase_orders") or [{}])[-1]
            po_id, po_number = (po or {}).get("purchase_order_id"), (po or {}).get("po_number")
if po_id:
    call("PO approve (workflow)", "POST", "/workflow-approval/connected/approve", {
        "reference_module": "Purchasing", "reference_id": po_id, "request_type": "Purchase Order Approval",
        "reference_number": po_number, "entity": "Expedia"})
    pos = call("PO list", "GET", "/purchasing/purchase-orders") or []
    pos = pos if isinstance(pos, list) else (pos.get("items") or pos.get("data") or [])
    pod = next((p for p in pos if p.get("purchase_order_id") == po_id), {})
    prd = call("purchase request detail", "GET", f"/purchasing/requests/{pr_id}") or {}
    po_row = next((p for p in prd.get("purchase_orders") or [] if p.get("purchase_order_id") == po_id), {})
    poi = (po_row.get("items") or [{}])[0]
    call("PO receive", "POST", f"/purchasing/purchase-orders/{po_id}/receive", {
        "warehouse_id": wh_id, "items": [{"purchase_order_item_id": poi.get("purchase_order_item_id"),
                                          "product_code": pcode, "ordered_quantity": 5, "received_quantity": 5,
                                          "unit_cost": 48000}]})
    call("inventory summary after receipt", "GET", "/inventory/summary")
bill = call("AP bill", "POST", "/ap/bills", {"supplier_id": sup_id, "bill_date": D(), "due_date": D(30),
                                             "po_number": po_number or "", "supplier_invoice_number": "SI-1001",
                                             "items": [{"description": "Laptops", "vat_exclusive_amount": 240000,
                                                        "vat_code": "VAT_INPUT"}]})
bill_id = first(bill, "bill_id")
if bill_id:
    bd = call("AP bill detail (generated totals)", "GET", f"/ap/bills/{bill_id}")
    if bd:
        print("      gross/ewt/net:", bd.get("gross_amount"), bd.get("ewt_material"), bd.get("net_payable"))
    v = call("AP voucher", "POST", "/ap/vouchers", {"supplier_id": sup_id, "payment_date": D(), "bill_ids": [bill_id]})
    v_id = first(v, "voucher_id")
    if v_id:
        call("voucher submit", "POST", f"/ap/vouchers/{v_id}/submit")
        call("voucher approve", "POST", f"/ap/vouchers/{v_id}/approve")
        net = (bd or {}).get("net_payable") or 1000
        call("AP payment", "POST", f"/ap/vouchers/{v_id}/payments", {"bill_id": bill_id, "payment_amount": net,
                                                                     "payment_date": D(), "payment_method": "Check"})
        call("AP check", "POST", "/ap/checks", {"voucher_id": v_id, "check_number": "000123", "check_date": D(),
                                                "bank": "BDO", "check_amount": net})

# ---------------------------------------------------------------- GL / books
accts = call("GL accounts", "GET", "/general-ledger/accounts")
ids = [a["account_id"] for a in (accts or [])][:2] or [1, 2]
je = call("journal entry", "POST", "/general-ledger/entries", {"entry_date": D(), "description": "Test", "entity": "Expedia",
                                                              "lines": [{"account_id": ids[0], "debit": 500},
                                                                        {"account_id": ids[1], "credit": 500}]})
if je:
    call("post journal entry", "POST", f"/general-ledger/entries/{first(je, 'entry_id')}/post")
for book in ("sales", "purchases", "cash-receipts", "cash-disbursements", "ledger-postings", "summary"):
    call(f"books {book}", "GET", f"/general-ledger/books/{book}")

# ---------------------------------------------------------------- payroll / commission
call("payroll employee", "POST", "/payroll/employees", {"employee_id": ben, "basic_salary": 35000, "allowance": 2000,
                                                        "date_hired": D(-400), "department": "Sales"})
run = call("payroll run generate", "POST", "/payroll/runs/generate", {"period_start": D(-14), "period_end": D(),
                                                                       "pay_date": D(1)})
run_id = first(run, "run_id") or first(run, "run", "run_id")
if run_id:
    for step in ("submit", "approve", "release"):
        call(f"payroll {step}", "PATCH", f"/payroll/runs/{run_id}/{step}")
call("commission", "POST", "/commission/records", {"commission_type": "Sales", "entity": "Expedia", "employee_id": ben,
                                                   "project_code": prj_code, "contract_value": 195000,
                                                   "total_cost": 150000, "collected_amount": 100000, "commission_rate": 5})

# ---------------------------------------------------------------- tax
call("BIR form 2307 list", "GET", "/tax/bir-forms?form_type=2307")
call("BIR 1601C draft", "POST", "/tax/bir-forms", {"form_type": "1601C", "entity": "Expedia",
                                                   "period_from": D(-30), "period_to": D()})
call("tax reminders generate", "POST", "/tax/reminders/generate")
call("workflow approval", "POST", "/workflow-approval", {"request_type": "Contract Approval", "entity": "Expedia",
                                                         "reference_module": "Projects", "amount": 1000,
                                                         "approver_employee_id": 1})
call("dashboard", "GET", "/dashboard/summary")

bad = [r for r in RESULTS if not r[0]]
print(f"\nDemo data: {len(RESULTS) - len(bad)}/{len(RESULTS)} steps succeeded")
if bad:
    print("Failed steps (re-running on a database that already has demo data can cause some):")
    for _, label, code in bad:
        print(f"  - {label} ({code})")
