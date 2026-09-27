"""LOA Retrieval module router.

Provides comprehensive audit-ready record retrieval for BIR Letter of Authority
compliance. Supports BIR form-based retrieval, full sales/purchase transaction
trails with traceability, VAT/WHT summaries, and missing document detection.
"""

from csv import DictWriter
from datetime import date
from io import StringIO
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from database import supabase
from middleware.audit_middleware import _extract_jwt_claims, write_audit_log
from utils.client_contacts import primary_contact_details

router = APIRouter(prefix="/loa", tags=["loa-retrieval"])

MODULE_NAME = "LOA Retrieval"


def _num(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _safe(v) -> str:
    return str(v) if v is not None else ""


def _customer_map() -> dict:
    rows = supabase.table("client_list").select("client_id, company_name, tin_number, address").execute().data or []
    contacts = supabase.table("contact_list").select(
        "client_id, first_name, last_name, email, is_primary_contact"
    ).execute().data or []
    contacts_by_client = {}
    for contact in contacts:
        contacts_by_client.setdefault(contact["client_id"], []).append(contact)
    for row in rows:
        row.update(primary_contact_details(contacts_by_client.get(row["client_id"], [])))
    return {r["client_id"]: r for r in rows}


def _supplier_map() -> dict:
    rows = supabase.table("supplier_list").select("supplier_id, company_name, tin_number, billing_address, vat_status").execute().data or []
    return {r["supplier_id"]: r for r in rows}


# ── BIR Form Retrieval ────────────────────────────────────────────────────────

BIR_FORMS = {
    "2550M": {
        "name": "Monthly Value-Added Tax Return",
        "description": "Reports Output VAT (from sales) and Input VAT (from purchases) for the month.",
        "data_sources": ["ar_invoices", "ap_bills"],
        "tax_fields": ["vat_output", "vat_input"],
    },
    "2550Q": {
        "name": "Quarterly Value-Added Tax Return",
        "description": "Consolidated quarterly VAT return covering 3 months of sales and purchases.",
        "data_sources": ["ar_invoices", "ap_bills"],
        "tax_fields": ["vat_output", "vat_input"],
    },
    "0619-E": {
        "name": "Monthly Remittance of Expanded Withholding Tax",
        "description": "EWT you withheld from supplier payments and must remit to BIR.",
        "data_sources": ["ap_bills"],
        "tax_fields": ["ewt_material"],
    },
    "1601-EQ": {
        "name": "Quarterly Remittance of EWT",
        "description": "Quarterly consolidated EWT remittance with alphalist of suppliers.",
        "data_sources": ["ap_bills"],
        "tax_fields": ["ewt_material"],
    },
    "2307": {
        "name": "Certificate of Creditable Tax Withheld at Source",
        "description": "Certificates issued per customer showing WHT they withheld from your invoices.",
        "data_sources": ["ar_invoices"],
        "tax_fields": ["wht_amount"],
    },
}


@router.get("/bir-forms")
def list_bir_forms():
    """Return available BIR forms with descriptions."""
    return [{"code": k, **v} for k, v in BIR_FORMS.items()]


@router.get("/bir-form/{form_code}")
def retrieve_bir_form_data(
    form_code: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """Retrieve all supporting data for a specific BIR form."""
    d_from = date_from.strip() if date_from and date_from.strip() else None
    d_to = date_to.strip() if date_to and date_to.strip() else None

    form_info = BIR_FORMS.get(form_code)
    if not form_info:
        return {"error": f"Unknown BIR form: {form_code}"}

    customers = _customer_map()
    suppliers = _supplier_map()
    result = {"form": form_code, "form_name": form_info["name"], "description": form_info["description"], "period_from": d_from, "period_to": d_to}

    # VAT forms (2550M, 2550Q) — need both AR and AP
    if form_code in ("2550M", "2550Q"):
        # Output VAT — from AR invoices
        ar_q = supabase.table("ar_invoices").select("*").eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
        if d_from:
            ar_q = ar_q.gte("invoice_date", d_from)
        if d_to:
            ar_q = ar_q.lte("invoice_date", d_to)
        invoices = ar_q.order("invoice_date", desc=True).execute().data or []

        for inv in invoices:
            c = customers.get(inv.get("customer_id"), {})
            inv["customer_name"] = c.get("company_name", "—")
            inv["customer_tin"] = c.get("tin_number", "—")
            inv["customer_address"] = c.get("address", "—")

        # Input VAT — from AP bills
        ap_q = supabase.table("ap_bills").select("*").eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
        if d_from:
            ap_q = ap_q.gte("bill_date", d_from)
        if d_to:
            ap_q = ap_q.lte("bill_date", d_to)
        bills = ap_q.order("bill_date", desc=True).execute().data or []

        for bill in bills:
            s = suppliers.get(bill.get("supplier_id"), {})
            bill["supplier_name"] = s.get("company_name", "—")
            bill["supplier_tin"] = s.get("tin_number", "—")
            bill["supplier_address"] = s.get("billing_address", "—")

        total_output = sum(_num(i.get("vat_output")) for i in invoices)
        total_input = sum(_num(b.get("vat_input")) for b in bills)
        total_sales = sum(_num(i.get("billing_subtotal")) for i in invoices)
        total_purchases = sum(_num(b.get("vat_exclusive_amount")) for b in bills)

        result["output_vat"] = {"total": round(total_output, 2), "taxable_sales": round(total_sales, 2), "invoice_count": len(invoices), "invoices": invoices}
        result["input_vat"] = {"total": round(total_input, 2), "taxable_purchases": round(total_purchases, 2), "bill_count": len(bills), "bills": bills}
        result["net_vat"] = round(total_output - total_input, 2)
        result["tax_payable"] = max(0, result["net_vat"])
        result["excess_credit"] = max(0, -result["net_vat"])

    # EWT forms (0619-E, 1601-EQ) — from AP bills with EWT
    elif form_code in ("0619-E", "1601-EQ"):
        ap_q = supabase.table("ap_bills").select("*").eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("ewt_material", 0)
        if d_from:
            ap_q = ap_q.gte("bill_date", d_from)
        if d_to:
            ap_q = ap_q.lte("bill_date", d_to)
        bills = ap_q.order("bill_date", desc=True).execute().data or []

        for bill in bills:
            s = suppliers.get(bill.get("supplier_id"), {})
            bill["supplier_name"] = s.get("company_name", "—")
            bill["supplier_tin"] = s.get("tin_number", "—")
            bill["supplier_address"] = s.get("billing_address", "—")

        # Group by supplier (alphalist)
        by_supplier = {}
        for bill in bills:
            sid = bill.get("supplier_id")
            if sid not in by_supplier:
                s = suppliers.get(sid, {})
                by_supplier[sid] = {"supplier_id": sid, "supplier_name": s.get("company_name", "—"), "supplier_tin": s.get("tin_number", "—"), "supplier_address": s.get("billing_address", "—"), "total_ewt": 0, "total_base": 0, "bill_count": 0, "bills": []}
            by_supplier[sid]["total_ewt"] += _num(bill.get("ewt_material"))
            by_supplier[sid]["total_base"] += _num(bill.get("vat_exclusive_amount"))
            by_supplier[sid]["bill_count"] += 1
            by_supplier[sid]["bills"].append(bill)

        for v in by_supplier.values():
            v["total_ewt"] = round(v["total_ewt"], 2)
            v["total_base"] = round(v["total_base"], 2)

        total_ewt = sum(v["total_ewt"] for v in by_supplier.values())
        result["total_ewt"] = round(total_ewt, 2)
        result["total_base"] = round(sum(v["total_base"] for v in by_supplier.values()), 2)
        result["supplier_count"] = len(by_supplier)
        result["bill_count"] = len(bills)
        result["alphalist"] = sorted(by_supplier.values(), key=lambda x: x["supplier_name"])
        result["bills"] = bills

    # BIR 2307 — WHT certificates from AR invoices
    elif form_code == "2307":
        ar_q = supabase.table("ar_invoices").select("*").eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("wht_amount", 0)
        if d_from:
            ar_q = ar_q.gte("invoice_date", d_from)
        if d_to:
            ar_q = ar_q.lte("invoice_date", d_to)
        invoices = ar_q.order("invoice_date", desc=True).execute().data or []

        for inv in invoices:
            c = customers.get(inv.get("customer_id"), {})
            inv["customer_name"] = c.get("company_name", "—")
            inv["customer_tin"] = c.get("tin_number", "—")
            inv["customer_address"] = c.get("address", "—")

        # Group by customer (each customer should issue you a 2307)
        by_customer = {}
        for inv in invoices:
            cid = inv.get("customer_id")
            if cid not in by_customer:
                c = customers.get(cid, {})
                by_customer[cid] = {"customer_id": cid, "customer_name": c.get("company_name", "—"), "customer_tin": c.get("tin_number", "—"), "customer_address": c.get("address", "—"), "total_wht": 0, "total_base": 0, "invoice_count": 0, "invoices": []}
            by_customer[cid]["total_wht"] += _num(inv.get("wht_amount"))
            by_customer[cid]["total_base"] += _num(inv.get("billing_subtotal"))
            by_customer[cid]["invoice_count"] += 1
            by_customer[cid]["invoices"].append(inv)

        for v in by_customer.values():
            v["total_wht"] = round(v["total_wht"], 2)
            v["total_base"] = round(v["total_base"], 2)

        total_wht = sum(v["total_wht"] for v in by_customer.values())
        result["total_wht"] = round(total_wht, 2)
        result["customer_count"] = len(by_customer)
        result["invoice_count"] = len(invoices)
        result["certificates"] = sorted(by_customer.values(), key=lambda x: x["customer_name"])
        result["invoices"] = invoices

    return result


# ── Sales Trail ───────────────────────────────────────────────────────────────

@router.get("/sales-trail")
def sales_trail(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    customer_id: Optional[int] = Query(None),
    invoice_number: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
):
    """Full sales transaction trail: Invoice → Collection → linked Quotation/Project."""
    d_from = date_from.strip() if date_from and date_from.strip() else None
    d_to = date_to.strip() if date_to and date_to.strip() else None
    customers = _customer_map()

    # Get invoices
    ar_q = supabase.table("ar_invoices").select("*").eq("record_status", "ACTIVE")
    if d_from:
        ar_q = ar_q.gte("invoice_date", d_from)
    if d_to:
        ar_q = ar_q.lte("invoice_date", d_to)
    if customer_id:
        ar_q = ar_q.eq("customer_id", customer_id)
    if invoice_number:
        ar_q = ar_q.ilike("invoice_number", f"%{invoice_number}%")
    invoices = ar_q.order("invoice_date", desc=True).execute().data or []

    # Get collections linked to these invoices
    invoice_ids = [i["invoice_id"] for i in invoices]
    collections = []
    if invoice_ids:
        try:
            collections = supabase.table("ar_collections").select("*").in_("invoice_id", invoice_ids).execute().data or []
        except Exception:
            pass

    collection_map = {}
    for col in collections:
        iid = col.get("invoice_id")
        if iid not in collection_map:
            collection_map[iid] = []
        collection_map[iid].append(col)

    # Build trail
    kw = keyword.strip().lower() if keyword and keyword.strip() else None
    trails = []
    for inv in invoices:
        c = customers.get(inv.get("customer_id"), {})
        inv_num = inv.get("invoice_number", "")
        cust_name = c.get("company_name", "")

        if kw and not any(kw in _safe(v).lower() for v in [inv_num, cust_name, c.get("tin_number"), inv.get("project_code"), inv.get("sales_order_ref")]):
            continue

        trail = {
            "invoice": {**inv, "customer_name": cust_name, "customer_tin": c.get("tin_number", "—"), "customer_address": c.get("address", "—")},
            "collections": collection_map.get(inv["invoice_id"], []),
            "total_collected": sum(_num(col.get("amount")) for col in collection_map.get(inv["invoice_id"], [])),
            "balance": _num(inv.get("net_collectible")) - sum(_num(col.get("amount")) for col in collection_map.get(inv["invoice_id"], [])),
            "linked_quotation": inv.get("sales_order_ref"),
            "linked_project": inv.get("project_code"),
            "has_or": len(collection_map.get(inv["invoice_id"], [])) > 0,
        }
        trails.append(trail)

    total_invoiced = sum(_num(t["invoice"].get("gross_amount")) for t in trails)
    total_collected = sum(t["total_collected"] for t in trails)
    total_vat = sum(_num(t["invoice"].get("vat_output")) for t in trails)
    total_wht = sum(_num(t["invoice"].get("wht_amount")) for t in trails)

    return {
        "period_from": d_from, "period_to": d_to,
        "trail_count": len(trails),
        "total_invoiced": round(total_invoiced, 2),
        "total_collected": round(total_collected, 2),
        "total_outstanding": round(total_invoiced - total_collected, 2),
        "total_vat_output": round(total_vat, 2),
        "total_wht": round(total_wht, 2),
        "trails": trails,
    }


# ── Purchase Trail ────────────────────────────────────────────────────────────

@router.get("/purchase-trail")
def purchase_trail(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    supplier_id: Optional[int] = Query(None),
    bill_number: Optional[str] = Query(None),
    po_number: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
):
    """Full purchase transaction trail: PO → Bill → Payment Voucher → EWT."""
    d_from = date_from.strip() if date_from and date_from.strip() else None
    d_to = date_to.strip() if date_to and date_to.strip() else None
    suppliers = _supplier_map()

    # Get bills
    ap_q = supabase.table("ap_bills").select("*").eq("record_status", "ACTIVE")
    if d_from:
        ap_q = ap_q.gte("bill_date", d_from)
    if d_to:
        ap_q = ap_q.lte("bill_date", d_to)
    if supplier_id:
        ap_q = ap_q.eq("supplier_id", supplier_id)
    if bill_number:
        ap_q = ap_q.ilike("bill_number", f"%{bill_number}%")
    if po_number:
        ap_q = ap_q.ilike("po_number", f"%{po_number}%")
    bills = ap_q.order("bill_date", desc=True).execute().data or []

    # Get payment vouchers linked to these bills
    bill_ids = [b["bill_id"] for b in bills]
    voucher_links = []
    vouchers_map = {}
    if bill_ids:
        try:
            voucher_links = supabase.table("ap_voucher_bills").select("*").in_("bill_id", bill_ids).execute().data or []
            voucher_ids = list(set(vl.get("voucher_id") for vl in voucher_links if vl.get("voucher_id")))
            if voucher_ids:
                vouchers = supabase.table("ap_payment_vouchers").select("*").in_("voucher_id", voucher_ids).execute().data or []
                vouchers_map = {v["voucher_id"]: v for v in vouchers}
        except Exception:
            pass

    bill_voucher_map = {}
    for vl in voucher_links:
        bid = vl.get("bill_id")
        vid = vl.get("voucher_id")
        if bid not in bill_voucher_map:
            bill_voucher_map[bid] = []
        if vid in vouchers_map:
            bill_voucher_map[bid].append(vouchers_map[vid])

    # Build trail
    kw = keyword.strip().lower() if keyword and keyword.strip() else None
    trails = []
    for bill in bills:
        s = suppliers.get(bill.get("supplier_id"), {})
        bill_num = bill.get("bill_number", "")
        sup_name = s.get("company_name", "")

        if kw and not any(kw in _safe(v).lower() for v in [bill_num, sup_name, s.get("tin_number"), bill.get("po_number"), bill.get("supplier_invoice_number")]):
            continue

        trail = {
            "bill": {**bill, "supplier_name": sup_name, "supplier_tin": s.get("tin_number", "—"), "supplier_address": s.get("billing_address", "—")},
            "vouchers": bill_voucher_map.get(bill["bill_id"], []),
            "linked_po": bill.get("po_number"),
            "supplier_invoice": bill.get("supplier_invoice_number"),
            "has_voucher": len(bill_voucher_map.get(bill["bill_id"], [])) > 0,
        }
        trails.append(trail)

    total_billed = sum(_num(t["bill"].get("gross_amount")) for t in trails)
    total_vat_input = sum(_num(t["bill"].get("vat_input")) for t in trails)
    total_ewt = sum(_num(t["bill"].get("ewt_material")) for t in trails)

    return {
        "period_from": d_from, "period_to": d_to,
        "trail_count": len(trails),
        "total_billed": round(total_billed, 2),
        "total_vat_input": round(total_vat_input, 2),
        "total_ewt": round(total_ewt, 2),
        "total_net_payable": round(total_billed - total_ewt, 2),
        "trails": trails,
    }


# ── Missing Documents Report ──────────────────────────────────────────────────

@router.get("/missing-documents")
def missing_documents(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """Flag incomplete audit trails: invoices without collections, bills without POs, etc."""
    d_from = date_from.strip() if date_from and date_from.strip() else None
    d_to = date_to.strip() if date_to and date_to.strip() else None
    customers = _customer_map()
    suppliers = _supplier_map()
    issues = []

    # Invoices without collections (unpaid/partially paid)
    try:
        ar_q = supabase.table("ar_invoices").select("invoice_id, invoice_number, invoice_date, customer_id, gross_amount, collection_status, lifecycle_status").eq("record_status", "ACTIVE").eq("lifecycle_status", "CONFIRMED").neq("collection_status", "PAID")
        if d_from:
            ar_q = ar_q.gte("invoice_date", d_from)
        if d_to:
            ar_q = ar_q.lte("invoice_date", d_to)
        unpaid = ar_q.execute().data or []
        for inv in unpaid:
            c = customers.get(inv.get("customer_id"), {})
            issues.append({
                "type": "MISSING_OR",
                "severity": "high",
                "module": "Accounts Receivable",
                "reference": inv.get("invoice_number", "—"),
                "date": inv.get("invoice_date", ""),
                "party": c.get("company_name", "—"),
                "amount": _num(inv.get("gross_amount")),
                "description": f"Invoice {inv.get('invoice_number')} is {inv.get('collection_status', 'UNPAID')} — no OR/collection recorded",
            })
    except Exception:
        pass

    # Bills without PO reference
    try:
        ap_q = supabase.table("ap_bills").select("bill_id, bill_number, bill_date, supplier_id, gross_amount, po_number").eq("record_status", "ACTIVE").eq("lifecycle_status", "CONFIRMED")
        if d_from:
            ap_q = ap_q.gte("bill_date", d_from)
        if d_to:
            ap_q = ap_q.lte("bill_date", d_to)
        bills = ap_q.execute().data or []
        for bill in bills:
            if not bill.get("po_number") or bill.get("po_number", "").strip() == "":
                s = suppliers.get(bill.get("supplier_id"), {})
                issues.append({
                    "type": "MISSING_PO",
                    "severity": "medium",
                    "module": "Accounts Payable",
                    "reference": bill.get("bill_number", "—"),
                    "date": bill.get("bill_date", ""),
                    "party": s.get("company_name", "—"),
                    "amount": _num(bill.get("gross_amount")),
                    "description": f"Bill {bill.get('bill_number')} has no linked Purchase Order",
                })
    except Exception:
        pass

    # Bills without payment voucher
    try:
        ap_q2 = supabase.table("ap_bills").select("bill_id, bill_number, bill_date, supplier_id, gross_amount, payment_status").eq("record_status", "ACTIVE").eq("lifecycle_status", "CONFIRMED").neq("payment_status", "PAID")
        if d_from:
            ap_q2 = ap_q2.gte("bill_date", d_from)
        if d_to:
            ap_q2 = ap_q2.lte("bill_date", d_to)
        unpaid_bills = ap_q2.execute().data or []
        for bill in unpaid_bills:
            s = suppliers.get(bill.get("supplier_id"), {})
            issues.append({
                "type": "UNPAID_BILL",
                "severity": "medium",
                "module": "Accounts Payable",
                "reference": bill.get("bill_number", "—"),
                "date": bill.get("bill_date", ""),
                "party": s.get("company_name", "—"),
                "amount": _num(bill.get("gross_amount")),
                "description": f"Bill {bill.get('bill_number')} is {bill.get('payment_status', 'UNPAID')} — no payment voucher processed",
            })
    except Exception:
        pass

    # Clients without TIN
    try:
        for cid, c in customers.items():
            if not c.get("tin_number") or c.get("tin_number", "").strip() in ("", "—"):
                issues.append({
                    "type": "MISSING_TIN",
                    "severity": "low",
                    "module": "Clients",
                    "reference": _safe(cid),
                    "date": "",
                    "party": c.get("company_name", "—"),
                    "amount": 0,
                    "description": f"Client {c.get('company_name')} has no TIN on record",
                })
    except Exception:
        pass

    # Sort by severity
    severity_order = {"high": 0, "medium": 1, "low": 2}
    issues.sort(key=lambda x: (severity_order.get(x["severity"], 3), x.get("date", "") or ""))

    high = len([i for i in issues if i["severity"] == "high"])
    medium = len([i for i in issues if i["severity"] == "medium"])
    low = len([i for i in issues if i["severity"] == "low"])

    return {
        "total_issues": len(issues),
        "high": high, "medium": medium, "low": low,
        "issues": issues,
    }


# ── Document Search (General) ─────────────────────────────────────────────────

@router.get("/search")
def loa_search(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    module: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    tin: Optional[str] = Query(None),
):
    """General cross-module document search."""
    results = []
    kw = keyword.strip().lower() if keyword and keyword.strip() else None
    d_from = date_from.strip() if date_from and date_from.strip() else None
    d_to = date_to.strip() if date_to and date_to.strip() else None
    tin_val = tin.strip().lower() if tin and tin.strip() else None
    search_all = not module or module.lower() == "all"

    # AR Invoices
    if search_all or module == "ar":
      try:
        ar_q = supabase.table("ar_invoices").select("invoice_id, invoice_number, invoice_date, customer_id, billing_subtotal, vat_output, wht_amount, gross_amount, lifecycle_status").eq("record_status", "ACTIVE")
        if d_from: ar_q = ar_q.gte("invoice_date", d_from)
        if d_to: ar_q = ar_q.lte("invoice_date", d_to)
        ar_rows = ar_q.order("invoice_date", desc=True).execute().data or []
        custs = _customer_map()
        for inv in ar_rows:
            c = custs.get(inv.get("customer_id"), {})
            cn = c.get("company_name", ""); ct = c.get("tin_number", ""); ref = inv.get("invoice_number", "")
            if tin_val and tin_val not in _safe(ct).lower(): continue
            if kw and not any(kw in _safe(v).lower() for v in [ref, cn, ct, str(inv.get("invoice_id", ""))]): continue
            results.append({"module": "AR", "type": "Invoice", "reference": ref, "date": inv.get("invoice_date", ""), "party": cn or "—", "tin": ct or "—", "amount": _num(inv.get("gross_amount")), "vat": _num(inv.get("vat_output")), "wht": _num(inv.get("wht_amount")), "status": inv.get("lifecycle_status", ""), "description": f"Invoice to {cn or '—'}"})
      except Exception: pass

    # AP Bills
    if search_all or module == "ap":
      try:
        ap_q = supabase.table("ap_bills").select("bill_id, bill_number, bill_date, supplier_id, vat_exclusive_amount, vat_input, ewt_material, gross_amount, lifecycle_status").eq("record_status", "ACTIVE")
        if d_from: ap_q = ap_q.gte("bill_date", d_from)
        if d_to: ap_q = ap_q.lte("bill_date", d_to)
        ap_rows = ap_q.order("bill_date", desc=True).execute().data or []
        sups = _supplier_map()
        for bill in ap_rows:
            s = sups.get(bill.get("supplier_id"), {})
            sn = s.get("company_name", ""); st = s.get("tin_number", ""); ref = bill.get("bill_number", "")
            if tin_val and tin_val not in _safe(st).lower(): continue
            if kw and not any(kw in _safe(v).lower() for v in [ref, sn, st, str(bill.get("bill_id", "")), bill.get("po_number", "")]): continue
            results.append({"module": "AP", "type": "Bill", "reference": ref, "date": bill.get("bill_date", ""), "party": sn or "—", "tin": st or "—", "amount": _num(bill.get("gross_amount")), "vat": _num(bill.get("vat_input")), "wht": _num(bill.get("ewt_material")), "status": bill.get("lifecycle_status", ""), "description": f"Bill from {sn or '—'} (PO: {bill.get('po_number', '—')})"})
      except Exception: pass

    # Clients
    if search_all or module == "clients":
      try:
        cl_rows = supabase.table("client_list").select("client_id, company_name, tin_number, created_at").order("company_name").execute().data or []
        contacts = supabase.table("contact_list").select(
            "client_id, first_name, last_name, email, is_primary_contact"
        ).execute().data or []
        contacts_by_client = {}
        for contact in contacts:
            contacts_by_client.setdefault(contact["client_id"], []).append(contact)
        for client in cl_rows:
            client.update(primary_contact_details(contacts_by_client.get(client["client_id"], [])))
        for c in cl_rows:
            if tin_val and tin_val not in _safe(c.get("tin_number")).lower(): continue
            if kw and not any(kw in _safe(v).lower() for v in [c.get("company_name"), c.get("tin_number"), c.get("primary_contact_name"), c.get("primary_contact_email"), str(c.get("client_id", ""))]): continue
            results.append({"module": "Clients", "type": "Customer", "reference": _safe(c.get("client_id")), "date": _safe(c.get("created_at", ""))[:10], "party": c.get("company_name", "—"), "tin": c.get("tin_number", "—") or "—", "amount": 0, "vat": 0, "wht": 0, "status": "Active", "description": f"{c.get('primary_contact_name', '')} · {c.get('primary_contact_email', '')}"})
      except Exception: pass

    # Suppliers
    if search_all or module == "suppliers":
      try:
        sp_rows = supabase.table("supplier_list").select("supplier_id, company_name, tin_number, supplier_type, created_at").order("company_name").execute().data or []
        for s in sp_rows:
            if tin_val and tin_val not in _safe(s.get("tin_number")).lower(): continue
            if kw and not any(kw in _safe(v).lower() for v in [s.get("company_name"), s.get("tin_number"), s.get("supplier_type"), str(s.get("supplier_id", ""))]): continue
            results.append({"module": "Suppliers", "type": "Supplier", "reference": _safe(s.get("supplier_id")), "date": _safe(s.get("created_at", ""))[:10], "party": s.get("company_name", "—"), "tin": s.get("tin_number", "—") or "—", "amount": 0, "vat": 0, "wht": 0, "status": "Active", "description": f"Type: {s.get('supplier_type', '—')}"})
      except Exception: pass

    # Audit Trail
    if search_all or module == "audit":
      try:
        al_q = supabase.table("audit_logs").select("log_id, action, module_name, performed_by, created_at, record_id")
        if d_from: al_q = al_q.gte("created_at", d_from)
        if d_to: al_q = al_q.lte("created_at", d_to + "T23:59:59")
        al_rows = al_q.order("created_at", desc=True).limit(200).execute().data or []
        for a in al_rows:
            if kw and not any(kw in _safe(v).lower() for v in [a.get("performed_by"), a.get("module_name"), a.get("action"), str(a.get("record_id", "")), str(a.get("log_id", ""))]): continue
            results.append({"module": "Audit", "type": a.get("action", "—"), "reference": _safe(a.get("log_id")), "date": _safe(a.get("created_at", ""))[:10], "party": a.get("performed_by", "—"), "tin": "—", "amount": 0, "vat": 0, "wht": 0, "status": a.get("module_name", ""), "description": f"{a.get('action', '')} in {a.get('module_name', '')} (#{a.get('record_id', '—')})"})
      except Exception: pass

    results.sort(key=lambda r: r.get("date", "") or "", reverse=True)
    return {"total": len(results), "results": results}


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary")
def loa_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """Quick counts per module."""
    d_from = date_from.strip() if date_from and date_from.strip() else None
    d_to = date_to.strip() if date_to and date_to.strip() else None
    counts = {}
    try:
        ar_q = supabase.table("ar_invoices").select("invoice_id").eq("record_status", "ACTIVE")
        if d_from: ar_q = ar_q.gte("invoice_date", d_from)
        if d_to: ar_q = ar_q.lte("invoice_date", d_to)
        counts["ar_invoices"] = len(ar_q.execute().data or [])
    except Exception: counts["ar_invoices"] = 0
    try:
        ap_q = supabase.table("ap_bills").select("bill_id").eq("record_status", "ACTIVE")
        if d_from: ap_q = ap_q.gte("bill_date", d_from)
        if d_to: ap_q = ap_q.lte("bill_date", d_to)
        counts["ap_bills"] = len(ap_q.execute().data or [])
    except Exception: counts["ap_bills"] = 0
    try: counts["documents"] = len(supabase.table("company_documents").select("document_id").execute().data or [])
    except Exception: counts["documents"] = 0
    try: counts["clients"] = len(supabase.table("client_list").select("client_id").execute().data or [])
    except Exception: counts["clients"] = 0
    try: counts["suppliers"] = len(supabase.table("supplier_list").select("supplier_id").execute().data or [])
    except Exception: counts["suppliers"] = 0
    counts["total"] = sum(counts.values())
    return counts


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/export")
def loa_export(
    request: Request,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    module: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    tin: Optional[str] = Query(None),
):
    """Export search results as CSV."""
    _, performed_by = _extract_jwt_claims(request)
    data = loa_search(date_from, date_to, module, keyword, tin)

    fields = ["module", "type", "reference", "date", "party", "tin", "amount", "vat", "wht", "status", "description"]
    output = StringIO()
    writer = DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(data["results"])
    output.seek(0)

    write_audit_log(
        action="EXPORT", module_name=MODULE_NAME,
        description=f"LOA export: {data['total']} records",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    headers = {"Content-Disposition": 'attachment; filename="loa_retrieval.csv"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)
