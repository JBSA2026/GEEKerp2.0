"""Accounts Receivable (Module 8) router.

This router is intentionally thin: it validates input, persists to the Supabase
AR tables, and writes audit entries. All financial math (tax, gross, net
collectible, balances, document numbering, status gating) lives in the pure
calculation module ``routers/ar_ap_calc.py`` and is reused here rather than
re-implemented.

Task 4.1 scope: invoice endpoints and lifecycle (meta, list, detail, create,
update, archive, restore). Collections, reports, dashboards, tax-code
configuration, and attachment write endpoints are implemented in later tasks.
"""

from datetime import date, datetime, timedelta
from io import StringIO
from typing import List, Optional
import csv
import re

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel

from database import supabase
from middleware.audit_middleware import _extract_jwt_claims, write_audit_log
from utils.client_contacts import primary_contact_details
from routers.ar_ap_calc import (
    AGING_BUCKETS,
    aging_bucket,
    aging_totals,
    ar_balance,
    can_modify_invoice,
    collection_status,
    format_peso,
    generate_document_number,
    vat_amount,
    wht_amount,
)
from routers.integration_calc import (
    CONFIRMED_LIFECYCLE_STATUS,
    TAX_CODE_RATES,
    active_source_refs,
    aggregate_invoice_totals,
    build_invoice_header,
    build_invoice_lines,
    can_confirm_invoice,
    compute_quotation_invoicing_status,
    confirmed_invoice_updates,
    duplicate_decision,
    invoice_confirmation_blockers,
    quotation_invoicing_eligibility,
    resolve_project_code,
    status_change,
)
from utils.errors import db_http_error
from utils.cache import cached

router = APIRouter(prefix="/ar", tags=["accounts-receivable"])

MODULE_NAME = "Accounts Receivable"

# Tax codes selectable on AR invoice lines (Requirement 9, design data model).
AR_VAT_CODES = ("VAT_OUTPUT", "VAT_EXEMPT")
AR_WHT_CODES = ("WHT_MATERIAL_1", "WHT_SERVICE_2", "NO_WHT")


# ── Pydantic models ───────────────────────────────────────────────────────────

class InvoiceItemPayload(BaseModel):
    line_type: str                      # MATERIAL or SERVICE
    description: str
    vat_exclusive_amount: float = 0
    vat_code: str                       # VAT_OUTPUT or VAT_EXEMPT
    wht_code: str                       # WHT_MATERIAL_1 / WHT_SERVICE_2 / NO_WHT


class InvoiceCreate(BaseModel):
    customer_id: int
    invoice_date: date
    sales_order_ref: Optional[str] = None
    project_code: Optional[str] = None
    items: List[InvoiceItemPayload] = []


class InvoiceUpdate(BaseModel):
    customer_id: Optional[int] = None
    invoice_date: Optional[date] = None
    sales_order_ref: Optional[str] = None
    project_code: Optional[str] = None
    items: Optional[List[InvoiceItemPayload]] = None


class CollectionCreate(BaseModel):
    invoice_id: Optional[int] = None
    invoice_number: Optional[str] = None
    collection_amount: float
    collection_date: date
    payment_method: str
    or_number: Optional[str] = None


class DraftInvoiceFromQuotation(BaseModel):
    """Request body for generating a DRAFT invoice from an approved quotation.

    ``override`` + a non-empty ``override_reason`` authorize generation despite
    the duplicate-invoicing guard.
    """
    sales_order_ref: Optional[str] = None
    override: bool = False
    override_reason: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

class DraftInvoiceFromSalesOrder(BaseModel):
    override: bool = False
    override_reason: Optional[str] = None


def _num(value) -> float:
    return float(value or 0)


def _today_iso() -> str:
    return datetime.now().isoformat()


def _employee_id_for_email(email: Optional[str]):
    if not email:
        return None
    res = supabase.table("employees").select("employee_id").eq("email", email).limit(1).execute()
    return res.data[0]["employee_id"] if res.data else None


def _tax_rate_map() -> dict:
    """Return a {tax_code: rate} map from the configured tax codes.

    Falls back to the hard-coded TAX_CODE_RATES defaults for any codes that are
    missing from the database, ensuring aggregate functions never crash on a
    KeyError when the tax_codes table hasn't been seeded.

    Cached for 120s since tax codes rarely change.
    """
    import time as _time
    now = _time.time()
    if hasattr(_tax_rate_map, "_cache") and _tax_rate_map._expires > now:
        return _tax_rate_map._cache

    from routers.integration_calc import TAX_CODE_RATES

    rows = supabase.table("tax_codes").select("code, rate").execute().data or []
    db_rates = {row["code"]: _num(row["rate"]) for row in rows}
    result = {**TAX_CODE_RATES, **db_rates}
    _tax_rate_map._cache = result
    _tax_rate_map._expires = now + 120
    return result


def _payment_terms_days(payment_terms: Optional[str]) -> int:
    """Convert client payment terms into invoice aging days."""
    text = (payment_terms or "").strip().lower()
    if not text:
        return 0
    if any(term in text for term in ("cod", "cash on delivery", "due on receipt", "immediate")):
        return 0

    net_match = re.search(r"\bnet\s*(\d{1,3})\b", text)
    if net_match:
        return max(int(net_match.group(1)), 0)

    days_match = re.search(r"\b(\d{1,3})\s*(?:calendar\s*)?(?:day|days|d)\b", text)
    if days_match:
        return max(int(days_match.group(1)), 0)

    if re.fullmatch(r"\d{1,3}", text):
        return max(int(text), 0)

    return 0


def _coerce_invoice_date(value) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _client_payment_terms(customer_id: int) -> Optional[str]:
    customer = (
        supabase.table("client_list")
        .select("client_id, payment_terms")
        .eq("client_id", customer_id)
        .limit(1)
        .execute()
    )
    if not customer.data:
        raise HTTPException(
            status_code=400,
            detail={"error": "Customer not found.", "fields": {"customer_id": "No matching client."}},
        )
    return customer.data[0].get("payment_terms")


def _invoice_due_date_from_client_terms(customer_id: int, invoice_date: date) -> date:
    terms = _client_payment_terms(customer_id)
    return invoice_date + timedelta(days=_payment_terms_days(terms))


def _next_invoice_number(entity: str = None) -> str:
    """Generate the next invoice number in standard format: COMPANY-YYYY-INV-NNNN."""
    from utils.code_generator import generate_code
    return generate_code(entity, "INV", "ar_invoices", "invoice_number")


def _entity_from_quotation(quotation: Optional[dict]) -> Optional[str]:
    if not isinstance(quotation, dict):
        return None
    return quotation.get("company") or quotation.get("entity")


def _entity_from_document_number(value: Optional[str]) -> Optional[str]:
    if not (isinstance(value, str) and value.strip()):
        return None
    prefix = value.strip().split("-", 1)[0].upper()
    from utils.code_generator import CODE_TO_ENTITY
    return CODE_TO_ENTITY.get(prefix)


def _company_filter_code(company: Optional[str]) -> Optional[str]:
    if not (isinstance(company, str) and company.strip()) or company == "All":
        return None
    from utils.code_generator import get_company_code
    return get_company_code(company)


def _entity_matches_company(entity: Optional[str], company_code: Optional[str]) -> bool:
    if not company_code:
        return True
    if not (isinstance(entity, str) and entity.strip()):
        return False
    from utils.code_generator import get_company_code
    return get_company_code(entity) == company_code


def _entity_from_project_code(project_code: Optional[str]) -> Optional[str]:
    if not (isinstance(project_code, str) and project_code.strip()):
        return None
    rows = (
        supabase.table("projects")
        .select("entity")
        .eq("project_code", project_code.strip())
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0].get("entity") if rows else None


def _entity_from_sales_order_ref(
    sales_order_ref: Optional[str],
    *,
    fallback_quotation: Optional[dict] = None,
    project_code: Optional[str] = None,
) -> Optional[str]:
    """Resolve AR numbering company from the source sales order or quotation."""
    if isinstance(sales_order_ref, str) and sales_order_ref.strip():
        source_ref = sales_order_ref.strip()
        sales_order_rows = (
            supabase.table("sales_orders")
            .select("quotation_id, quotation_no")
            .eq("so_number", source_ref)
            .limit(1)
            .execute()
            .data
            or []
        )
        if sales_order_rows:
            sales_order = sales_order_rows[0]
            quote_query = supabase.table("quotations").select("company")
            if sales_order.get("quotation_id") is not None:
                quote_rows = (
                    quote_query
                    .eq("quotation_id", sales_order.get("quotation_id"))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
            else:
                quote_rows = (
                    quote_query
                    .eq("quotation_no", sales_order.get("quotation_no"))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
            if quote_rows and quote_rows[0].get("company"):
                return quote_rows[0].get("company")

        quote_rows = (
            supabase.table("quotations")
            .select("company")
            .eq("quotation_no", source_ref)
            .limit(1)
            .execute()
            .data
            or []
        )
        if quote_rows and quote_rows[0].get("company"):
            return quote_rows[0].get("company")

    return _entity_from_quotation(fallback_quotation) or _entity_from_project_code(project_code)


def _invoice_matches_company(invoice: dict, company_code: Optional[str]) -> bool:
    if not company_code:
        return True
    invoice_entity = _entity_from_document_number(invoice.get("invoice_number"))
    if _entity_matches_company(invoice_entity, company_code):
        return True
    source_entity = _entity_from_sales_order_ref(
        invoice.get("sales_order_ref"),
        project_code=invoice.get("project_code"),
    )
    return _entity_matches_company(source_entity, company_code)


def _filter_invoices_by_company(invoices: list[dict], company: Optional[str]) -> list[dict]:
    company_code = _company_filter_code(company)
    if not company_code:
        return invoices
    return [row for row in invoices if _invoice_matches_company(row, company_code)]


def _next_receipt_number(entity: str = None) -> str:
    """Generate the next ``RCPT-YYYYMM-NNN`` number for the current period."""
    if entity:
        from utils.code_generator import generate_code
        return generate_code(entity, "RCPT", "invoice_receipts", "receipt_number")

    period = datetime.now().strftime("%Y%m")
    prefix = f"RCPT-{period}-"
    res = (
        supabase.table("invoice_receipts")
        .select("receipt_number")
        .like("receipt_number", f"{prefix}%")
        .order("receipt_number", desc=True)
        .limit(1)
        .execute()
    )
    sequence = int(res.data[0]["receipt_number"].split("-")[-1]) + 1 if res.data else 1
    return generate_document_number("RCPT", period, sequence)


def _validate_line_codes(item: InvoiceItemPayload, rates: dict) -> None:
    """Reject lines whose tax codes are not valid AR selections."""
    if item.line_type not in ("MATERIAL", "SERVICE"):
        raise HTTPException(
            status_code=400,
            detail={"error": f"Invalid line type '{item.line_type}'. Expected MATERIAL or SERVICE."},
        )
    if item.vat_code not in AR_VAT_CODES or item.vat_code not in rates:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Invalid VAT code '{item.vat_code}' for an AR invoice line."},
        )
    if item.wht_code not in AR_WHT_CODES or item.wht_code not in rates:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Invalid WHT code '{item.wht_code}' for an AR invoice line."},
        )


def _compute_invoice_totals(
    items: List[InvoiceItemPayload],
    rates: dict,
    vat_code_override: Optional[str] = None,
) -> dict:
    """Recompute the server-trusted monetary fields from line inputs.

    Only the source fields are returned; ``gross_amount`` and ``net_collectible``
    are GENERATED STORED columns in the database and must not be written.
    """
    billing_subtotal = 0.0
    vat_output = 0.0
    wht_total = 0.0
    for item in items:
        _validate_line_codes(item, rates)
        amount = _num(item.vat_exclusive_amount)
        vat_code = vat_code_override or item.vat_code
        billing_subtotal += amount
        vat_output += vat_amount(amount, rates[vat_code])
        wht_total += wht_amount(amount, rates[item.wht_code])
    return {
        "billing_subtotal": round(billing_subtotal, 2),
        "vat_output": round(vat_output, 2),
        "wht_amount": round(wht_total, 2),
    }


def _validate_references(
    customer_id: Optional[int],
    project_code: Optional[str],
    sales_order_ref: Optional[str],
) -> None:
    """Validate customer/project/sales-order references against existing data."""
    if customer_id is not None:
        customer = supabase.table("client_list").select("client_id").eq("client_id", customer_id).limit(1).execute()
        if not customer.data:
            raise HTTPException(
                status_code=400,
                detail={"error": "Customer not found.", "fields": {"customer_id": "No matching client."}},
            )
    if project_code:
        project = supabase.table("projects").select("project_code").eq("project_code", project_code).limit(1).execute()
        if not project.data:
            raise HTTPException(
                status_code=400,
                detail={"error": "Project not found.", "fields": {"project_code": "No matching project."}},
            )
    if sales_order_ref:
        sales_order = supabase.table("sales_orders").select("so_number").eq("so_number", sales_order_ref).limit(1).execute()
        quote = supabase.table("quotations").select("quotation_no").eq("quotation_no", sales_order_ref).limit(1).execute()
        if not sales_order.data and not quote.data:
            raise HTTPException(
                status_code=400,
                detail={"error": "Sales order not found.", "fields": {"sales_order_ref": "No matching sales order or quotation."}},
            )


def _customer_map() -> dict:
    """Return {client_id: client_row} map. Cached for 60s at module level."""
    import time as _time
    now = _time.time()
    if hasattr(_customer_map, "_cache") and _customer_map._expires > now:
        return _customer_map._cache
    rows = supabase.table("client_list").select("client_id, company_name, address, tin_number").execute().data or []
    contacts = supabase.table("contact_list").select(
        "client_id, first_name, last_name, email, is_primary_contact"
    ).execute().data or []
    contacts_by_client = {}
    for contact in contacts:
        contacts_by_client.setdefault(contact["client_id"], []).append(contact)
    for row in rows:
        row.update(primary_contact_details(contacts_by_client.get(row["client_id"], [])))
    result = {row["client_id"]: row for row in rows}
    _customer_map._cache = result
    _customer_map._expires = now + 60
    return result


def _get_invoice(invoice_id: int) -> dict:
    """Fetch a single invoice with its line items, active collections, and active attachments."""
    invoice = (
        supabase.table("ar_invoices")
        .select("*")
        .eq("invoice_id", invoice_id)
        .single()
        .execute()
    )
    if not invoice.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    items = (
        supabase.table("ar_invoice_items")
        .select("*")
        .eq("invoice_id", invoice_id)
        .order("item_id")
        .execute()
        .data
        or []
    )
    collections = (
        supabase.table("ar_collections")
        .select("*")
        .eq("invoice_id", invoice_id)
        .eq("record_status", "ACTIVE")
        .order("collection_date")
        .execute()
        .data
        or []
    )
    attachments = (
        supabase.table("ar_ap_attachments")
        .select("*")
        .eq("parent_type", "INVOICE")
        .eq("parent_id", invoice_id)
        .eq("record_status", "ACTIVE")
        .order("uploaded_at")
        .execute()
        .data
        or []
    )

    customer = _customer_map().get(invoice.data.get("customer_id"), {})
    return {
        **invoice.data,
        "customer_name": customer.get("company_name"),
        "customer": customer,
        "items": items,
        "collections": collections,
        "attachments": attachments,
    }


def _insert_items(
    invoice_id: int,
    items: List[InvoiceItemPayload],
    employee_id,
    vat_code_override: Optional[str] = None,
) -> None:
    rows = []
    for item in items:
        rows.append({
            "invoice_id": invoice_id,
            "line_type": item.line_type,
            "description": item.description,
            "vat_exclusive_amount": _num(item.vat_exclusive_amount),
            "vat_code": vat_code_override or item.vat_code,
            "wht_code": item.wht_code,
            "created_by_employee_id": employee_id,
        })
    if rows:
        supabase.table("ar_invoice_items").insert(rows).execute()


def _invoice_lines_from_sales_order(
    sales_order_id: int,
    quotation_vat_rate: float,
) -> tuple[list[dict], dict]:
    so_items = (
        supabase.table("sales_order_items")
        .select("*")
        .eq("sales_order_id", sales_order_id)
        .order("line_no")
        .execute()
        .data
        or []
    )
    invoice_source_lines = [
        {
            "description": item.get("description"),
            "quantity": _num(item.get("quantity_ordered")),
            "selling_price": _num(item.get("selling_price")) or _num(item.get("unit_cost")),
            "discount_percent": _num(item.get("discount_percent")),
            "product_type": "MATERIAL" if item.get("product_code") else "SERVICE",
        }
        for item in so_items
        if _num(item.get("quantity_ordered")) > 0
    ]
    invoice_lines = build_invoice_lines(quotation_vat_rate, invoice_source_lines)
    if not invoice_lines:
        raise HTTPException(status_code=422, detail={"error": "There are no lines to invoice."})
    rates = {**TAX_CODE_RATES, **_tax_rate_map()}
    return invoice_lines, aggregate_invoice_totals(invoice_lines, rates)


def _insert_generated_invoice_lines(invoice_id: int, invoice_lines: list[dict], employee_id) -> None:
    item_rows = [
        {
            "invoice_id": invoice_id,
            "line_type": line["line_type"],
            "description": line.get("description") or "",
            "vat_exclusive_amount": _num(line.get("vat_exclusive_amount")),
            "vat_code": line["vat_code"],
            "wht_code": line["wht_code"],
            "created_by_employee_id": employee_id,
        }
        for line in invoice_lines
    ]
    if item_rows:
        supabase.table("ar_invoice_items").insert(item_rows).execute()


def ensure_draft_invoice_lines_from_sales_order(
    invoice_id: int,
    sales_order_id: int,
    request: Optional[Request] = None,
) -> dict:
    """Backfill a sales-order draft invoice that exists without line items."""
    existing = (
        supabase.table("ar_invoices")
        .select("*")
        .eq("invoice_id", invoice_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice = existing.data[0]
    if invoice.get("lifecycle_status") != "DRAFT":
        return _get_invoice(invoice_id)

    existing_lines = (
        supabase.table("ar_invoice_items")
        .select("item_id")
        .eq("invoice_id", invoice_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing_lines:
        return _get_invoice(invoice_id)

    sales_order_res = (
        supabase.table("sales_orders")
        .select("*")
        .eq("sales_order_id", sales_order_id)
        .limit(1)
        .execute()
    )
    if not sales_order_res.data:
        raise HTTPException(status_code=404, detail="Sales order not found")
    sales_order = sales_order_res.data[0]

    quotation_res = (
        supabase.table("quotations")
        .select("*")
        .eq("quotation_id", sales_order.get("quotation_id"))
        .limit(1)
        .execute()
    )
    if not quotation_res.data:
        raise HTTPException(status_code=404, detail="Source quotation not found")

    performed_by = None
    if request is not None:
        _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)
    invoice_lines, totals = _invoice_lines_from_sales_order(
        sales_order_id,
        quotation_res.data[0].get("vat_rate"),
    )
    _insert_generated_invoice_lines(invoice_id, invoice_lines, employee_id)
    supabase.table("ar_invoices").update({
        "billing_subtotal": totals["billing_subtotal"],
        "vat_output": totals["vat_output"],
        "wht_amount": totals["wht_amount"],
        "updated_at": _today_iso(),
    }).eq("invoice_id", invoice_id).execute()

    if request is not None:
        write_audit_log(
            action="UPDATE",
            module_name=MODULE_NAME,
            description=f"Backfilled draft invoice {invoice.get('invoice_number')} lines from sales order {sales_order.get('so_number')}",
            performed_by=performed_by,
            record_id=invoice_id,
            ip_address=request.client.host if request.client else None,
            request=request,
        )
    return _get_invoice(invoice_id)


def _sync_quotation_invoicing_status(
    quotation_no: Optional[str],
    *,
    triggering_invoice_number: Optional[str] = None,
    performed_by: Optional[str] = None,
    request: Optional[Request] = None,
) -> None:
    """Recompute and persist a source quotation's Quotation_Invoicing_Status.

    This is the AR side of the back-reference status synchronization (Requirement
    10). It is invoked after every event that can change which CONFIRMED +
    ACTIVE invoices reference a quotation: invoice confirmation, a recorded
    collection, and the archive/restore of either an invoice or a collection.

    The flow is intentionally thin; all decision logic lives in the pure
    ``integration_calc`` core:

    1. Resolve the source quotation by ``quotation_no`` (invoices link to it via
       ``ar_invoices.sales_order_ref``). When the quotation cannot be found, or
       its ``record_status`` is ``ARCHIVED``, the recompute is skipped without
       error — the invoice is retained and maintained independently of the
       archived source (Requirements 12.4, 12.5).
    2. Load the ``CONFIRMED`` + ``ACTIVE`` invoices referencing the quotation,
       each carrying its ``collection_status``.
    3. Derive the new status via :func:`compute_quotation_invoicing_status`.
    4. Persist the new ``invoicing_status`` and write a ``STATUS_CHANGE`` audit
       entry (previous, new, ``quotation_no``, triggering invoice number) **only**
       when :func:`status_change` reports a real change; an unchanged recompute
       writes nothing and audits nothing (Requirement 11.2).

    A missing/blank ``quotation_no`` (an invoice not generated from a quotation)
    is a no-op.
    """
    if not (isinstance(quotation_no, str) and quotation_no.strip()):
        return

    source_ref = quotation_no
    quotation_res = (
        supabase.table("quotations")
        .select("*")
        .eq("quotation_no", quotation_no)
        .limit(1)
        .execute()
    )
    # Source quotation not found — skip recompute without error (Req 12.4/12.5).
    if not quotation_res.data:
        sales_order_res = (
            supabase.table("sales_orders")
            .select("quotation_id, quotation_no")
            .eq("so_number", quotation_no)
            .limit(1)
            .execute()
        )
        if not sales_order_res.data:
            return
        quotation_res = (
            supabase.table("quotations")
            .select("*")
            .eq("quotation_id", sales_order_res.data[0].get("quotation_id"))
            .limit(1)
            .execute()
        )
        if not quotation_res.data:
            return
    quotation = quotation_res.data[0]

    # Skip recompute when the source quotation has been archived; the invoice is
    # retained and maintained independently of the archived source (Req 12.5).
    if quotation.get("record_status") == "ARCHIVED":
        return

    confirmed_active_invoices = (
        supabase.table("ar_invoices")
        .select("collection_status")
        .eq("sales_order_ref", source_ref)
        .eq("lifecycle_status", CONFIRMED_LIFECYCLE_STATUS)
        .eq("record_status", "ACTIVE")
        .execute()
        .data
        or []
    )

    computed = compute_quotation_invoicing_status(confirmed_active_invoices)
    previous = quotation.get("invoicing_status") or "NOT_INVOICED"

    # Only persist + audit on a real change; an unchanged value is a no-op
    # (Req 11.2).
    if not status_change(previous, computed):
        return

    supabase.table("quotations").update(
        {"invoicing_status": computed, "updated_at": _today_iso()}
    ).eq("quotation_id", quotation["quotation_id"]).execute()

    description = (
        f"Quotation {quotation_no} invoicing status changed: {previous} → {computed}"
    )
    if triggering_invoice_number:
        description += f" (triggered by invoice {triggering_invoice_number})"

    write_audit_log(
        action="STATUS_CHANGE",
        module_name="Quotations",
        description=description,
        performed_by=performed_by,
        record_id=quotation["quotation_id"],
        ip_address=request.client.host if request and request.client else None,
        request=request,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/meta")
def ar_meta():
    """Form dropdown data: customers, projects, quotations, AR tax codes."""
    return {
        "customers": sorted(_customer_map().values(), key=lambda customer: customer.get("company_name") or ""),
        "projects": supabase.table("projects")
            .select("project_code, project_name, client_id, status")
            .order("project_code").execute().data or [],
        "quotations": supabase.table("quotations")
            .select("quotation_id, quotation_no, project_name, status")
            .order("created_at", desc=True).execute().data or [],
        "tax_codes": supabase.table("tax_codes")
            .select("code, tax_type, rate, scope, editable")
            .in_("scope", ["AR", "BOTH"])
            .order("code").execute().data or [],
    }


@router.get("/invoices")
def list_invoices(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    include_archived: bool = Query(False),
):
    """List invoices. Active invoices only by default."""
    req = supabase.table("ar_invoices").select("*").order("created_at", desc=True)
    if not include_archived:
        req = req.eq("record_status", "ACTIVE")
    if status and status != "All":
        req = req.eq("collection_status", status)
    if search:
        req = req.or_(
            f"invoice_number.ilike.%{search}%,"
            f"sales_order_ref.ilike.%{search}%,"
            f"project_code.ilike.%{search}%"
        )
    rows = _filter_invoices_by_company(req.execute().data or [], company)

    customers = _customer_map()
    # Fetch OR numbers for all invoices in one batch
    invoice_ids = [row["invoice_id"] for row in rows]
    or_map = {}
    if invoice_ids:
        for i in range(0, len(invoice_ids), 100):
            batch = invoice_ids[i:i+100]
            cols = supabase.table("ar_collections").select("invoice_id, or_number").in_("invoice_id", batch).eq("record_status", "ACTIVE").order("collection_id", desc=True).execute().data or []
            for c in cols:
                inv_id = c["invoice_id"]
                if inv_id not in or_map:
                    or_map[inv_id] = []
                if c.get("or_number"):
                    or_map[inv_id].append(c["or_number"])

    return [
        {**row, "customer_name": customers.get(row.get("customer_id"), {}).get("company_name"), "or_numbers": or_map.get(row["invoice_id"], [])}
        for row in rows
    ]


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: int):
    """Get a single invoice with line items, collections, and attachments."""
    return _get_invoice(invoice_id)


@router.post("/invoices", status_code=201)
def create_invoice(request: Request, payload: InvoiceCreate):
    """Create an invoice: INV-YYYYMM-NNN, status UNPAID, record_status ACTIVE."""
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    _validate_references(payload.customer_id, payload.project_code, payload.sales_order_ref)

    rates = _tax_rate_map()
    totals = _compute_invoice_totals(payload.items, rates)
    invoice_number = _next_invoice_number(
        _entity_from_sales_order_ref(payload.sales_order_ref, project_code=payload.project_code)
    )
    due_date = _invoice_due_date_from_client_terms(payload.customer_id, payload.invoice_date)

    header = {
        "invoice_number": invoice_number,
        "customer_id": payload.customer_id,
        "invoice_date": payload.invoice_date.isoformat(),
        "due_date": due_date.isoformat(),
        "sales_order_ref": payload.sales_order_ref,
        "project_code": payload.project_code,
        "billing_subtotal": totals["billing_subtotal"],
        "vat_output": totals["vat_output"],
        "wht_amount": totals["wht_amount"],
        "collection_status": "UNPAID",
        "record_status": "ACTIVE",
        "created_by_employee_id": employee_id,
    }
    try:
        res = supabase.table("ar_invoices").insert(header).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create invoice")

    invoice_id = res.data[0]["invoice_id"]
    _insert_items(invoice_id, payload.items, employee_id)

    write_audit_log(
        action="CREATE",
        module_name=MODULE_NAME,
        description=f"Created invoice {invoice_number}",
        performed_by=performed_by,
        record_id=invoice_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    # Auto-generate DRAFT BIR 2307 if this invoice has withholding tax
    created_invoice = _get_invoice(invoice_id)
    return created_invoice


@router.patch("/invoices/{invoice_id}")
def update_invoice(invoice_id: int, request: Request, payload: InvoiceUpdate):
    """Update an invoice. Only UNPAID invoices may be modified (else 409)."""
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    existing = supabase.table("ar_invoices").select("*").eq("invoice_id", invoice_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Edits are allowed while the invoice is still a DRAFT (pre-confirmation) or
    # while a CONFIRMED invoice remains UNPAID (Req 6.2). A CONFIRMED invoice
    # that has advanced past UNPAID is locked.
    is_draft = existing.data.get("lifecycle_status") == "DRAFT"
    if not is_draft and not can_modify_invoice(existing.data.get("collection_status")):
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Invoice {existing.data.get('invoice_number')} is "
                         f"{existing.data.get('collection_status')} and can no longer be modified.",
            },
        )

    _validate_references(payload.customer_id, payload.project_code, payload.sales_order_ref)

    updates = payload.model_dump(exclude_unset=True, exclude={"items"})
    effective_customer_id = updates.get("customer_id", existing.data.get("customer_id"))
    if "customer_id" in updates or "invoice_date" in updates:
        effective_invoice_date = _coerce_invoice_date(updates.get("invoice_date", existing.data.get("invoice_date")))
        updates["due_date"] = _invoice_due_date_from_client_terms(effective_customer_id, effective_invoice_date)
    if "invoice_date" in updates and updates["invoice_date"]:
        updates["invoice_date"] = updates["invoice_date"].isoformat()
    if "due_date" in updates and updates["due_date"]:
        updates["due_date"] = updates["due_date"].isoformat()

    items_for_totals = payload.items
    # Recompute monetary fields whenever lines change.
    if items_for_totals is not None:
        rates = _tax_rate_map()
        updates.update(_compute_invoice_totals(items_for_totals, rates))

    if updates:
        updates["updated_at"] = _today_iso()
        try:
            supabase.table("ar_invoices").update(updates).eq("invoice_id", invoice_id).execute()
        except Exception as exc:
            raise db_http_error(exc)

    if payload.items is not None:
        supabase.table("ar_invoice_items").delete().eq("invoice_id", invoice_id).execute()
        _insert_items(invoice_id, payload.items, employee_id)

    write_audit_log(
        action="UPDATE",
        module_name=MODULE_NAME,
        description=f"Updated invoice {existing.data.get('invoice_number')}",
        performed_by=performed_by,
        record_id=invoice_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_invoice(invoice_id)


@router.delete("/invoices/{invoice_id}")
def archive_invoice(invoice_id: int, request: Request):
    """Archive an invoice (soft delete). The record is never physically removed."""
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("ar_invoices").select("invoice_id, invoice_number, sales_order_ref, lifecycle_status, record_status").eq("invoice_id", invoice_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    supabase.table("ar_invoices").update(
        {"record_status": "ARCHIVED", "updated_at": _today_iso()}
    ).eq("invoice_id", invoice_id).execute()

    # A draft is "discarded" while a committed invoice is "archived"; both are a
    # non-destructive soft delete that retains the row (Req 6.6). The audit notes
    # the source quotation when the invoice originated from one (Req 6.7).
    source_ref = existing.data.get("sales_order_ref")
    is_draft = existing.data.get("lifecycle_status") == "DRAFT"
    action = "DISCARD" if is_draft else "ARCHIVE"
    verb = "Discarded draft" if is_draft else "Archived"
    description = f"{verb} invoice {existing.data.get('invoice_number')}"
    if source_ref:
        description += f" from quotation {source_ref}"

    write_audit_log(
        action=action,
        module_name=MODULE_NAME,
        description=description,
        performed_by=performed_by,
        record_id=invoice_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    # Archiving a CONFIRMED invoice removes it from the quotation roll-up; recompute
    # the source quotation's invoicing status (Req 10.5). A draft never contributed,
    # so the recompute is a harmless no-op in that case.
    _sync_quotation_invoicing_status(
        source_ref,
        triggering_invoice_number=existing.data.get("invoice_number"),
        performed_by=performed_by,
        request=request,
    )
    return _get_invoice(invoice_id)


@router.post("/invoices/{invoice_id}/restore")
def restore_invoice(invoice_id: int, request: Request):
    """Restore an archived invoice back to ACTIVE."""
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("ar_invoices").select("invoice_id, invoice_number, sales_order_ref, record_status").eq("invoice_id", invoice_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Invoice not found")

    supabase.table("ar_invoices").update(
        {"record_status": "ACTIVE", "updated_at": _today_iso()}
    ).eq("invoice_id", invoice_id).execute()

    write_audit_log(
        action="RESTORE",
        module_name=MODULE_NAME,
        description=f"Restored invoice {existing.data.get('invoice_number')}",
        performed_by=performed_by,
        record_id=invoice_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    # Restoring a CONFIRMED invoice re-adds it to the quotation roll-up; recompute
    # the source quotation's invoicing status (Req 10.5).
    _sync_quotation_invoicing_status(
        existing.data.get("sales_order_ref"),
        triggering_invoice_number=existing.data.get("invoice_number"),
        performed_by=performed_by,
        request=request,
    )
    return _get_invoice(invoice_id)


@router.post("/invoices/draft-from-quotation/{quotation_id}", status_code=201)
def create_draft_invoice_from_quotation(
    quotation_id: int, request: Request, payload: DraftInvoiceFromQuotation
):
    """Generate a DRAFT invoice from an approved quotation.

    Mirrors the manual ``POST /ar/invoices`` create flow but pre-fills the
    header and lines from the source quotation and inserts the invoice in the
    ``DRAFT`` lifecycle (excluded from roll-ups until confirmed). All decision
    logic lives in the pure ``integration_calc`` core; this endpoint validates,
    persists, and audits.

    Responses: ``201`` draft; ``404`` quotation missing; ``409`` not approved /
    not eligible / duplicate; ``422`` no lines / override reason missing;
    ``400`` customer invalid.
    """
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    # 1. Fetch the source quotation (404 if missing).
    quotation_res = (
        supabase.table("quotations")
        .select("*")
        .eq("quotation_id", quotation_id)
        .limit(1)
        .execute()
    )
    if not quotation_res.data:
        raise HTTPException(status_code=404, detail="Quotation not found")
    quotation = quotation_res.data[0]
    quotation_no = quotation.get("quotation_no")
    invoice_source_ref = payload.sales_order_ref or quotation_no

    # 2. Eligibility: only approved quotations may be invoiced (409).
    eligibility = quotation_invoicing_eligibility(quotation.get("status"))
    if eligibility == "NOT_APPROVED":
        raise HTTPException(
            status_code=409,
            detail={"error": f"Quotation {quotation_no} is not approved for invoicing."},
        )
    if eligibility == "NOT_ELIGIBLE":
        raise HTTPException(
            status_code=409,
            detail={"error": f"Quotation {quotation_no} is not eligible for invoicing."},
        )

    # 3. Validate the quotation customer against client_list (400).
    client_id = quotation.get("client_id")
    customer = (
        supabase.table("client_list")
        .select("client_id, vat_status")
        .eq("client_id", client_id)
        .limit(1)
        .execute()
    )
    if not customer.data:
        raise HTTPException(
            status_code=400,
            detail={"error": "Customer not found.", "fields": {"customer_id": "No matching client."}},
        )

    # 4. Resolve the project code from the quotation project name (empty if none).
    projects = supabase.table("projects").select("project_code, project_name").execute().data or []
    project_code = resolve_project_code(quotation.get("project_name"), projects)

    # 5. Duplicate-invoicing guard over ACTIVE invoices referencing the quotation.
    existing_rows = (
        supabase.table("ar_invoices")
        .select("invoice_number, sales_order_ref, record_status")
        .eq("sales_order_ref", invoice_source_ref)
        .execute()
        .data
        or []
    )
    active_refs = active_source_refs(existing_rows, "sales_order_ref")
    decision = duplicate_decision(active_refs, payload.override, payload.override_reason)
    existing_invoice_number = next(
        (r.get("invoice_number") for r in existing_rows if r.get("record_status") == "ACTIVE"),
        None,
    )
    if not decision["allow"]:
        if decision["status"] == 409:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": f"Quotation {quotation_no} is already invoiced by "
                             f"{existing_invoice_number}. Supply an override with a reason "
                             f"to invoice it again.",
                },
            )
        raise HTTPException(
            status_code=422,
            detail={"error": "An override reason is required to invoice a quotation that "
                             "already has an active invoice."},
        )

    # 6. Map quotation lines to invoice lines (422 when there is nothing to invoice).
    q_lines = (
        supabase.table("quotation_items")
        .select("*")
        .eq("quotation_id", quotation_id)
        .order("line_no")
        .execute()
        .data
        or []
    )
    invoice_lines = build_invoice_lines(quotation.get("vat_rate"), q_lines)
    if not invoice_lines:
        raise HTTPException(
            status_code=422,
            detail={"error": "There are no lines to invoice."},
        )

    # 7. Aggregate header totals server-side (DB rates override the defaults).
    rates = {**TAX_CODE_RATES, **_tax_rate_map()}
    totals = aggregate_invoice_totals(invoice_lines, rates)

    # 8. Build the draft header (DRAFT, ACTIVE, source-linked).
    invoice_number = _next_invoice_number(_entity_from_quotation(quotation))
    invoice_date = date.today()
    due_date = _invoice_due_date_from_client_terms(client_id, invoice_date)
    header = build_invoice_header(
        quotation,
        invoice_number,
        customer_id=client_id,
        source_quotation_id=quotation_id,
        sales_order_ref=invoice_source_ref,
        project_code=project_code,
        invoice_date=invoice_date,
        due_date=due_date,
    )
    entity_value = quotation.get("company") or None
    db_header = {
        "invoice_number": header["invoice_number"],
        "customer_id": header["customer_id"],
        "invoice_date": header["invoice_date"].isoformat(),
        "due_date": header["due_date"].isoformat(),
        "sales_order_ref": header["sales_order_ref"],
        "project_code": header["project_code"] or None,
        "source_quotation_id": header["source_quotation_id"],
        "lifecycle_status": header["lifecycle_status"],
        "record_status": header["record_status"],
        "billing_subtotal": totals["billing_subtotal"],
        "vat_output": totals["vat_output"],
        "wht_amount": totals["wht_amount"],
        "collection_status": "UNPAID",
        "created_by_employee_id": employee_id,
        "entity": entity_value,
    }
    try:
        res = supabase.table("ar_invoices").insert(db_header).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create draft invoice")

    invoice_id = res.data[0]["invoice_id"]

    # 9. Insert the generated invoice lines.
    item_rows = [
        {
            "invoice_id": invoice_id,
            "line_type": line["line_type"],
            "description": line.get("description") or "",
            "vat_exclusive_amount": _num(line.get("vat_exclusive_amount")),
            "vat_code": line["vat_code"],
            "wht_code": line["wht_code"],
            "created_by_employee_id": employee_id,
        }
        for line in invoice_lines
    ]
    if item_rows:
        supabase.table("ar_invoice_items").insert(item_rows).execute()

    ip_address = request.client.host if request.client else None

    # 10. Audit the creation (and the override, when one was used).
    write_audit_log(
        action="CREATE",
        module_name=MODULE_NAME,
        description=f"Created draft invoice {invoice_number} from quotation {quotation_no}",
        performed_by=performed_by,
        record_id=invoice_id,
        ip_address=ip_address,
        request=request,
    )
    if decision["used_override"]:
        write_audit_log(
            action="OVERRIDE",
            module_name=MODULE_NAME,
            description=(
                f"Override duplicate-invoicing guard: created draft invoice "
                f"{invoice_number} for quotation {quotation_no} despite existing invoice "
                f"{existing_invoice_number}. Reason: {payload.override_reason}"
            ),
            performed_by=performed_by,
            record_id=invoice_id,
            ip_address=ip_address,
            request=request,
        )

    return _get_invoice(invoice_id)


@router.post("/invoices/draft-from-sales-order/{sales_order_id}", status_code=201)
def create_draft_invoice_from_sales_order(
    sales_order_id: int, request: Request, payload: DraftInvoiceFromSalesOrder
):
    """Generate a DRAFT invoice from a confirmed sales order."""
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    sales_order_res = (
        supabase.table("sales_orders")
        .select("*")
        .eq("sales_order_id", sales_order_id)
        .limit(1)
        .execute()
    )
    if not sales_order_res.data:
        raise HTTPException(status_code=404, detail="Sales order not found")
    sales_order = sales_order_res.data[0]
    so_number = sales_order.get("so_number")

    quotation_res = (
        supabase.table("quotations")
        .select("*")
        .eq("quotation_id", sales_order.get("quotation_id"))
        .limit(1)
        .execute()
    )
    if not quotation_res.data:
        raise HTTPException(status_code=404, detail="Source quotation not found")
    quotation = quotation_res.data[0]

    customer = (
        supabase.table("client_list")
        .select("client_id, vat_status")
        .eq("client_id", sales_order.get("client_id"))
        .limit(1)
        .execute()
    )
    if not customer.data:
        raise HTTPException(
            status_code=400,
            detail={"error": "Customer not found.", "fields": {"customer_id": "No matching client."}},
        )

    existing_rows = (
        supabase.table("ar_invoices")
        .select("invoice_number, sales_order_ref, record_status")
        .eq("sales_order_ref", so_number)
        .execute()
        .data
        or []
    )
    active_refs = active_source_refs(existing_rows, "sales_order_ref")
    decision = duplicate_decision(active_refs, payload.override, payload.override_reason)
    existing_invoice_number = next(
        (row.get("invoice_number") for row in existing_rows if row.get("record_status") == "ACTIVE"),
        None,
    )
    if not decision["allow"]:
        if decision["status"] == 409:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": f"Sales order {so_number} is already invoiced by "
                             f"{existing_invoice_number}. Supply an override with a reason "
                             f"to invoice it again.",
                },
            )
        raise HTTPException(
            status_code=422,
            detail={"error": "An override reason is required to invoice a sales order that "
                             "already has an active invoice."},
        )

    invoice_lines, totals = _invoice_lines_from_sales_order(
        sales_order_id,
        quotation.get("vat_rate"),
    )
    projects = supabase.table("projects").select("project_code, project_name").execute().data or []
    project_code = resolve_project_code(sales_order.get("project_name") or quotation.get("project_name"), projects)

    invoice_number = _next_invoice_number(
        _entity_from_sales_order_ref(
            so_number,
            fallback_quotation=quotation,
            project_code=project_code,
        )
    )
    invoice_date = date.today()
    due_date = _invoice_due_date_from_client_terms(sales_order.get("client_id"), invoice_date)
    header = build_invoice_header(
        quotation,
        invoice_number,
        customer_id=sales_order.get("client_id"),
        source_quotation_id=sales_order.get("quotation_id"),
        sales_order_ref=so_number,
        project_code=project_code,
        invoice_date=invoice_date,
        due_date=due_date,
    )
    entity_value = quotation.get("company") or None
    db_header = {
        "invoice_number": header["invoice_number"],
        "customer_id": header["customer_id"],
        "invoice_date": header["invoice_date"].isoformat(),
        "due_date": header["due_date"].isoformat(),
        "sales_order_ref": header["sales_order_ref"],
        "project_code": header["project_code"] or None,
        "source_quotation_id": header["source_quotation_id"],
        "lifecycle_status": header["lifecycle_status"],
        "record_status": header["record_status"],
        "billing_subtotal": totals["billing_subtotal"],
        "vat_output": totals["vat_output"],
        "wht_amount": totals["wht_amount"],
        "collection_status": "UNPAID",
        "created_by_employee_id": employee_id,
        "entity": entity_value,
    }
    try:
        res = supabase.table("ar_invoices").insert(db_header).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create draft invoice")

    invoice_id = res.data[0]["invoice_id"]
    _insert_generated_invoice_lines(invoice_id, invoice_lines, employee_id)

    ip_address = request.client.host if request.client else None
    write_audit_log(
        action="CREATE",
        module_name=MODULE_NAME,
        description=f"Created draft invoice {invoice_number} from sales order {so_number}",
        performed_by=performed_by,
        record_id=invoice_id,
        ip_address=ip_address,
        request=request,
    )
    if decision["used_override"]:
        write_audit_log(
            action="OVERRIDE",
            module_name=MODULE_NAME,
            description=(
                f"Override duplicate-invoicing guard: created draft invoice "
                f"{invoice_number} for sales order {so_number} despite existing invoice "
                f"{existing_invoice_number}. Reason: {payload.override_reason}"
            ),
            performed_by=performed_by,
            record_id=invoice_id,
            ip_address=ip_address,
            request=request,
        )

    return _get_invoice(invoice_id)


@router.post("/invoices/{invoice_id}/confirm")
def confirm_invoice(invoice_id: int, request: Request):
    """Confirm a DRAFT invoice, committing it to the open receivables lifecycle.

    On success the invoice transitions ``lifecycle_status`` DRAFT -> CONFIRMED
    and ``collection_status`` to UNPAID (Requirements 6.4, 6.5), at which point it
    re-enters Outstanding_Receivables, aging, and collection eligibility. The
    confirmation predicate lives in the pure ``integration_calc`` core.

    Responses: ``200`` confirmed; ``409`` not a draft; ``422`` no lines; ``404``
    invoice missing.
    """
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("ar_invoices")
        .select("*")
        .eq("invoice_id", invoice_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice = existing.data[0]

    # Only a DRAFT invoice can be confirmed (Req 6.4); anything else is a 409.
    if invoice.get("lifecycle_status") != "DRAFT":
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Invoice {invoice.get('invoice_number')} is not a draft "
                         f"and cannot be confirmed.",
            },
        )

    # Count the invoice lines that drive the confirmation predicate.
    line_count = len(
        supabase.table("ar_invoice_items")
        .select("item_id")
        .eq("invoice_id", invoice_id)
        .execute()
        .data
        or []
    )
    if line_count == 0 and invoice.get("sales_order_ref"):
        sales_order_res = (
            supabase.table("sales_orders")
            .select("sales_order_id")
            .eq("so_number", invoice.get("sales_order_ref"))
            .limit(1)
            .execute()
        )
        if sales_order_res.data:
            repaired = ensure_draft_invoice_lines_from_sales_order(
                invoice_id,
                sales_order_res.data[0]["sales_order_id"],
                request,
            )
            line_count = len(repaired.get("items") or [])

    # Confirmation requires at least one invoice line (Req 6.5); reject with the
    # blockers reported by the pure core otherwise.
    if not can_confirm_invoice(line_count):
        raise HTTPException(
            status_code=422,
            detail={
                "error": "This invoice cannot be confirmed.",
                "blockers": invoice_confirmation_blockers(line_count),
            },
        )

    updates = confirmed_invoice_updates()
    updates["updated_at"] = _today_iso()
    try:
        supabase.table("ar_invoices").update(updates).eq("invoice_id", invoice_id).execute()
    except Exception as exc:
        raise db_http_error(exc)

    write_audit_log(
        action="CONFIRM",
        module_name=MODULE_NAME,
        description=(
            f"Confirmed invoice {invoice.get('invoice_number')}"
            + (
                f" from quotation {invoice.get('sales_order_ref')}"
                if invoice.get("sales_order_ref")
                else ""
            )
        ),
        performed_by=performed_by,
        record_id=invoice_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    # Recompute the source quotation's invoicing status now that this invoice is
    # CONFIRMED and contributes to the roll-up (Req 10.5).
    _sync_quotation_invoicing_status(
        invoice.get("sales_order_ref"),
        triggering_invoice_number=invoice.get("invoice_number"),
        performed_by=performed_by,
        request=request,
    )

    # Auto-create Sales Book entry for BIR books
    try:
        from utils.books_integration import create_sales_book_from_ar_invoice
        confirmed_invoice = _get_invoice(invoice_id)
        create_sales_book_from_ar_invoice(confirmed_invoice, performed_by)
    except Exception as exc:
        import logging
        logging.getLogger("books_integration").warning(f"Sales Book entry failed for invoice {invoice_id}: {exc}")

    # Auto-generate DRAFT BIR 2307 if this invoice has withholding tax
    try:
        from routers.tax import generate_or_update_2307_for_invoice
        inv_for_tax = _get_invoice(invoice_id)
        generate_or_update_2307_for_invoice(invoice_id, inv_for_tax)
    except Exception as exc:
        import logging
        logging.getLogger("tax_2307").warning(f"2307 generation failed for invoice {invoice_id}: {exc}")

    return _get_invoice(invoice_id)


# ── Collections ───────────────────────────────────────────────────────────────

def _active_collections_total(invoice_id: int) -> float:
    """Sum the amounts of ACTIVE (non-archived) collections for an invoice."""
    rows = (
        supabase.table("ar_collections")
        .select("collection_amount")
        .eq("invoice_id", invoice_id)
        .eq("record_status", "ACTIVE")
        .execute()
        .data
        or []
    )
    return round(sum(_num(row["collection_amount"]) for row in rows), 2)


def _resolve_invoice_row(invoice_id: Optional[int], invoice_number: Optional[str]) -> dict:
    """Fetch the bare invoice header by id or invoice number (404 if missing)."""
    if invoice_id is not None:
        res = supabase.table("ar_invoices").select("*").eq("invoice_id", invoice_id).limit(1).execute()
    elif invoice_number:
        res = supabase.table("ar_invoices").select("*").eq("invoice_number", invoice_number).limit(1).execute()
    else:
        raise HTTPException(
            status_code=400,
            detail={"error": "An invoice_id or invoice_number is required."},
        )
    if not res.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return res.data[0]


def _recompute_invoice_status(invoice: dict) -> dict:
    """Recompute collection_status + AR balance from ACTIVE collections and persist.

    AR balance = gross_amount - sum(ACTIVE collections) - wht_amount. Archived
    collections never contribute. Returns the updated invoice header.
    """
    invoice_id = invoice["invoice_id"]
    gross = _num(invoice.get("gross_amount"))
    wht = _num(invoice.get("wht_amount"))
    collected = _active_collections_total(invoice_id)

    status = collection_status(gross, wht, collected)
    balance = ar_balance(gross, collected, wht)

    supabase.table("ar_invoices").update(
        {"collection_status": status, "updated_at": _today_iso()}
    ).eq("invoice_id", invoice_id).execute()

    return {**invoice, "collection_status": status, "ar_balance": balance}


def _create_invoice_receipt(invoice: dict, collection: dict, employee_id=None) -> dict:
    """Create the receipt document that mirrors a posted AR collection."""
    entity = (
        _entity_from_sales_order_ref(
            invoice.get("sales_order_ref"),
            project_code=invoice.get("project_code"),
        )
        or _entity_from_document_number(invoice.get("invoice_number"))
    )
    receipt = {
        "receipt_number": _next_receipt_number(entity),
        "invoice_id": invoice["invoice_id"],
        "customer_id": invoice.get("customer_id"),
        "receipt_date": collection.get("collection_date"),
        "payment_method": collection.get("payment_method"),
        "reference_number": collection.get("or_number"),
        "amount_paid": _num(collection.get("collection_amount")),
        "withholding_tax": 0,
        "bank_charges": 0,
        "status": "POSTED",
        "remarks": f"Collection for invoice {invoice.get('invoice_number')}",
        "created_by_employee_id": employee_id,
    }
    try:
        res = supabase.table("invoice_receipts").insert(receipt).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create invoice receipt")
    return res.data[0]


@router.get("/invoice-receipts")
def list_invoice_receipts(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    customer: Optional[int] = Query(None),
    invoice_id: Optional[int] = Query(None),
    export: Optional[str] = Query(None),
):
    req = supabase.table("invoice_receipts").select("*").order("receipt_date", desc=True)
    if from_:
        req = req.gte("receipt_date", from_.isoformat())
    if to:
        req = req.lte("receipt_date", to.isoformat())
    if customer is not None:
        req = req.eq("customer_id", customer)
    if invoice_id is not None:
        req = req.eq("invoice_id", invoice_id)
    receipts = req.execute().data or []

    invoice_ids = {row["invoice_id"] for row in receipts if row.get("invoice_id")}
    invoices = {}
    if invoice_ids:
        inv_rows = (
            supabase.table("ar_invoices")
            .select("invoice_id, invoice_number, project_code")
            .in_("invoice_id", list(invoice_ids))
            .execute()
            .data
            or []
        )
        invoices = {row["invoice_id"]: row for row in inv_rows}

    customers = _customer_map()
    enriched = []
    for row in receipts:
        inv = invoices.get(row.get("invoice_id"), {})
        customer_row = customers.get(row.get("customer_id"), {})
        enriched.append({
            **row,
            "invoice_number": inv.get("invoice_number"),
            "project_code": inv.get("project_code"),
            "customer_name": customer_row.get("company_name"),
        })

    if (export or "").lower() == "csv":
        output = StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=[
                "receipt_number",
                "receipt_date",
                "invoice_number",
                "customer_name",
                "payment_method",
                "reference_number",
                "amount_paid",
                "withholding_tax",
                "bank_charges",
                "net_received",
                "status",
            ],
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(enriched)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=invoice-receipts.csv"},
        )

    return enriched


@router.get("/collections")
def list_collections(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    customer: Optional[int] = Query(None),
    group_by: Optional[str] = Query(None),
):
    """Collection report listing (ACTIVE collections only).

    Supports an optional collection-date range, a customer filter, and basic
    grouping by ``customer`` or ``payment_method``. Detailed report grouping is
    refined in task 10.1; this provides a working listing plus basic grouping.
    """
    req = (
        supabase.table("ar_collections")
        .select("*")
        .eq("record_status", "ACTIVE")
        .order("collection_date", desc=True)
    )
    if from_:
        req = req.gte("collection_date", from_.isoformat())
    if to:
        req = req.lte("collection_date", to.isoformat())
    collections = req.execute().data or []

    # Join customer/invoice context so the report can filter and group by customer.
    invoice_ids = {row["invoice_id"] for row in collections}
    invoices = {}
    if invoice_ids:
        inv_rows = (
            supabase.table("ar_invoices")
            .select("invoice_id, invoice_number, customer_id")
            .in_("invoice_id", list(invoice_ids))
            .execute()
            .data
            or []
        )
        invoices = {row["invoice_id"]: row for row in inv_rows}

    customers = _customer_map()
    enriched = []
    for row in collections:
        inv = invoices.get(row["invoice_id"], {})
        customer_id = inv.get("customer_id")
        if customer is not None and customer_id != customer:
            continue
        enriched.append({
            **row,
            "invoice_number": inv.get("invoice_number"),
            "customer_id": customer_id,
            "customer_name": customers.get(customer_id, {}).get("company_name"),
        })

    if group_by in ("customer", "payment_method"):
        groups: dict = {}
        for row in enriched:
            if group_by == "customer":
                key = row.get("customer_name") or row.get("customer_id")
            else:
                key = row.get("payment_method")
            bucket = groups.setdefault(str(key), {"group": key, "collections": [], "total": 0.0})
            bucket["collections"].append(row)
            bucket["total"] = round(bucket["total"] + _num(row["collection_amount"]), 2)
        return {"group_by": group_by, "groups": list(groups.values())}

    return enriched


@router.post("/collections", status_code=201)
def create_collection(request: Request, payload: CollectionCreate):
    """Record a collection against an invoice.

    Rejects over-collection (400) when the amount exceeds the current remaining
    AR balance. On success, inserts the collection, recomputes the invoice
    collection_status + AR balance from ACTIVE collections, and emits a COLLECT
    audit entry.
    """
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    invoice = _resolve_invoice_row(payload.invoice_id, payload.invoice_number)
    invoice_id = invoice["invoice_id"]

    # A DRAFT invoice is not yet a receivable; collections against it are
    # rejected until it is confirmed (Requirement 6.3).
    if invoice.get("lifecycle_status") == "DRAFT":
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Invoice {invoice.get('invoice_number')} is a draft and "
                         f"cannot receive collections until it is confirmed.",
            },
        )

    amount = _num(payload.collection_amount)
    if amount <= 0:
        raise HTTPException(
            status_code=400,
            detail={"error": "Collection amount must be greater than zero."},
        )

    gross = _num(invoice.get("gross_amount"))
    wht = _num(invoice.get("wht_amount"))
    remaining = ar_balance(gross, _active_collections_total(invoice_id), wht)
    if amount > remaining:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Collection amount {format_peso(amount)} exceeds the "
                         f"remaining balance {format_peso(remaining)}.",
            },
        )

    record = {
        "invoice_id": invoice_id,
        "collection_amount": amount,
        "collection_date": payload.collection_date.isoformat(),
        "payment_method": payload.payment_method,
        "or_number": payload.or_number,
        "record_status": "ACTIVE",
        "created_by_employee_id": employee_id,
    }
    try:
        res = supabase.table("ar_collections").insert(record).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to record collection")

    collection = res.data[0]
    collection_id = collection["collection_id"]
    receipt = _create_invoice_receipt(invoice, collection, employee_id)
    _recompute_invoice_status(invoice)

    write_audit_log(
        action="COLLECT",
        module_name=MODULE_NAME,
        description=(
            f"Recorded collection on invoice {invoice.get('invoice_number')} "
            f"and created receipt {receipt.get('receipt_number')}"
        ),
        performed_by=performed_by,
        record_id=collection_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    # A recorded collection can advance the source quotation to COLLECTED (Req 10.5).
    _sync_quotation_invoicing_status(
        invoice.get("sales_order_ref"),
        triggering_invoice_number=invoice.get("invoice_number"),
        performed_by=performed_by,
        request=request,
    )

    # Auto-create Cash Receipts Book entry for BIR books
    try:
        from utils.books_integration import create_cash_receipt_from_ar_collection
        create_cash_receipt_from_ar_collection(collection, invoice, performed_by)
    except Exception as exc:
        import logging
        logging.getLogger("books_integration").warning(f"Cash Receipts entry failed for collection: {exc}")

    return {"collection": collection, "receipt": receipt, "invoice": _get_invoice(invoice_id)}


@router.delete("/collections/{collection_id}")
def archive_collection(collection_id: int, request: Request):
    """Archive a collection (soft delete) and recompute the parent invoice."""
    _, performed_by = _extract_jwt_claims(request)

    existing = supabase.table("ar_collections").select("*").eq("collection_id", collection_id).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Collection not found")
    collection = existing.data[0]

    supabase.table("ar_collections").update(
        {"record_status": "ARCHIVED", "updated_at": _today_iso()}
    ).eq("collection_id", collection_id).execute()

    invoice = _resolve_invoice_row(collection["invoice_id"], None)
    _recompute_invoice_status(invoice)

    write_audit_log(
        action="ARCHIVE",
        module_name=MODULE_NAME,
        description=f"Archived collection on invoice {invoice.get('invoice_number')}",
        performed_by=performed_by,
        record_id=collection_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    # Archiving a collection can revert the source quotation from COLLECTED back
    # to INVOICED (Req 10.5).
    _sync_quotation_invoicing_status(
        invoice.get("sales_order_ref"),
        triggering_invoice_number=invoice.get("invoice_number"),
        performed_by=performed_by,
        request=request,
    )
    return {"collection_id": collection_id, "invoice": _get_invoice(collection["invoice_id"])}


@router.post("/collections/{collection_id}/restore")
def restore_collection(collection_id: int, request: Request):
    """Restore an archived collection, recomputing the parent invoice.

    Re-checks that restoring would not cause over-collection; rejects (400) if
    the restored amount would push active collections beyond the gross amount.
    """
    _, performed_by = _extract_jwt_claims(request)

    existing = supabase.table("ar_collections").select("*").eq("collection_id", collection_id).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Collection not found")
    collection = existing.data[0]

    invoice = _resolve_invoice_row(collection["invoice_id"], None)
    invoice_id = invoice["invoice_id"]

    # Re-check over-collection against the remaining balance from OTHER active
    # collections (this one is currently archived and excluded).
    gross = _num(invoice.get("gross_amount"))
    wht = _num(invoice.get("wht_amount"))
    remaining = ar_balance(gross, _active_collections_total(invoice_id), wht)
    amount = _num(collection["collection_amount"])
    if amount > remaining:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Restoring this collection ({format_peso(amount)}) would "
                         f"exceed the remaining balance {format_peso(remaining)}.",
            },
        )

    supabase.table("ar_collections").update(
        {"record_status": "ACTIVE", "updated_at": _today_iso()}
    ).eq("collection_id", collection_id).execute()

    _recompute_invoice_status(invoice)

    write_audit_log(
        action="RESTORE",
        module_name=MODULE_NAME,
        description=f"Restored collection on invoice {invoice.get('invoice_number')}",
        performed_by=performed_by,
        record_id=collection_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    # Restoring a collection can re-advance the source quotation to COLLECTED
    # (Req 10.5).
    _sync_quotation_invoicing_status(
        invoice.get("sales_order_ref"),
        triggering_invoice_number=invoice.get("invoice_number"),
        performed_by=performed_by,
        request=request,
    )
    return {"collection_id": collection_id, "invoice": _get_invoice(invoice_id)}


# ── Reports ───────────────────────────────────────────────────────────────────

# Invoices that still carry an outstanding balance and therefore age / become
# overdue. PAID invoices are fully settled and excluded from aging/overdue views.
OUTSTANDING_STATUSES = ("UNPAID", "PARTIALLY_PAID")


def _as_date(value) -> Optional[date]:
    """Coerce a supabase date value (ISO string or date) into a ``date``."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _collections_total_by_invoice(invoice_ids: List[int]) -> dict:
    """Return {invoice_id: sum of ACTIVE collection amounts} for the given ids."""
    totals: dict = {}
    if not invoice_ids:
        return totals
    rows = (
        supabase.table("ar_collections")
        .select("invoice_id, collection_amount")
        .in_("invoice_id", list(invoice_ids))
        .eq("record_status", "ACTIVE")
        .execute()
        .data
        or []
    )
    for row in rows:
        inv_id = row["invoice_id"]
        totals[inv_id] = round(totals.get(inv_id, 0.0) + _num(row["collection_amount"]), 2)
    return totals


def _outstanding_invoices(customer: Optional[int], company: Optional[str] = None) -> list:
    """Fetch ACTIVE invoices with an outstanding balance (UNPAID/PARTIALLY_PAID).

    DRAFT (pre-confirmation) invoices are excluded from aging, overdue, and
    dashboard roll-ups until they are confirmed (Requirement 6.1).
    """
    req = (
        supabase.table("ar_invoices")
        .select("*")
        .eq("record_status", "ACTIVE")
        .neq("lifecycle_status", "DRAFT")
        .in_("collection_status", list(OUTSTANDING_STATUSES))
    )
    if customer is not None:
        req = req.eq("customer_id", customer)
    return _filter_invoices_by_company(req.execute().data or [], company)


def _simple_pdf(title: str, lines: List[str]) -> bytes:
    """Build a minimal, dependency-free single-page PDF (Helvetica) from text.

    Produces a valid PDF 1.4 document so the statement can be downloaded without
    requiring a heavy PDF library. Non-latin glyphs (e.g. ₱) are replaced.
    """
    def esc(text: str) -> str:
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    ops = ["BT", "/F1 12 Tf", "14 TL", "50 750 Td", f"({esc(title)}) Tj"]
    for line in lines:
        ops.append("T*")
        ops.append(f"({esc(line)}) Tj")
    ops.append("ET")
    content = "\n".join(ops).encode("latin-1", "replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += str(index).encode() + b" 0 obj\n" + obj + b"\nendobj\n"

    xref_pos = len(pdf)
    size = len(objects) + 1
    pdf += b"xref\n0 " + str(size).encode() + b"\n"
    pdf += b"0000000000 65535 f \n"
    for off in offsets:
        pdf += ("%010d 00000 n \n" % off).encode("latin-1")
    pdf += b"trailer\n<< /Size " + str(size).encode() + b" /Root 1 0 R >>\n"
    pdf += b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF"
    return bytes(pdf)


def _pdf_escape(text: str) -> str:
    return str(text or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _pdf_money(value: float) -> str:
    return f"PHP {value:,.2f}"


def _pdf_text_width(text: str, size: int, font: str = "F1") -> float:
    factor = 0.6 if font == "F3" else 0.52
    return len(str(text or "")) * size * factor


def _pdf_text(ops: list, text: str, x: float, y: float, *, size: int = 10, font: str = "F1") -> None:
    ops.append(f"BT /{font} {size} Tf 1 0 0 1 {x:.2f} {y:.2f} Tm ({_pdf_escape(text)}) Tj ET")


def _pdf_text_right(ops: list, text: str, right_x: float, y: float, *, size: int = 10, font: str = "F3") -> None:
    x = right_x - _pdf_text_width(text, size, font)
    _pdf_text(ops, text, x, y, size=size, font=font)


def _pdf_line(ops: list, x1: float, y1: float, x2: float, y2: float, *, shade: str = "0.78") -> None:
    ops.append(f"{shade} G {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S 0 G")


def _pdf_fill_rect(ops: list, x: float, y: float, w: float, h: float, *, color: str = "0.93 0.96 0.99") -> None:
    ops.append(f"{color} rg {x:.2f} {y:.2f} {w:.2f} {h:.2f} re f 0 g")


def _pdf_truncate(text: str, max_chars: int) -> str:
    value = str(text or "")
    return value if len(value) <= max_chars else value[: max_chars - 3] + "..."


def _pdf_date(value) -> str:
    return str(value or "")[:10] or "-"


def _statement_period_label(period: dict) -> str:
    start = period.get("from") or "beginning"
    end = period.get("to") or "present"
    return f"{start} to {end}"


def _filename_safe(value: str) -> str:
    forbidden = '<>:"/\\|?*'
    cleaned = "".join("-" if ch in forbidden or ord(ch) < 32 else ch for ch in str(value or ""))
    return " ".join(cleaned.split()).strip(" .") or "statement"


def _statement_pdf_filename(statement: dict) -> str:
    rows = statement.get("rows") or []
    customer_name = statement.get("customer", {}).get("company_name") or "Customer"
    period = _statement_period_label(statement.get("period") or {})
    if not rows:
        invoice_label = "No invoices"
    elif len(rows) == 1:
        invoice_label = rows[0].get("invoice_number") or "Invoice"
    else:
        invoice_label = f"{rows[0].get('invoice_number') or 'Invoice'} plus {len(rows) - 1} more"
    return _filename_safe(f"INV no. {invoice_label} - {customer_name} - {period}") + ".pdf"


def _pdf_document(pages: List[List[str]], *, width: int = 792, height: int = 612) -> bytes:
    """Build a dependency-free PDF from drawing operations."""
    page_count = len(pages)
    first_font_id = 3 + (page_count * 2)
    font_ids = {"F1": first_font_id, "F2": first_font_id + 1, "F3": first_font_id + 2}
    page_ids = [3 + (i * 2) for i in range(page_count)]

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] /Count {page_count} >>".encode(),
    ]
    for index, ops in enumerate(pages):
        page_id = page_ids[index]
        content_id = page_id + 1
        content = "\n".join(ops).encode("latin-1", "replace")
        page_obj = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] "
            f"/Resources << /Font << /F1 {font_ids['F1']} 0 R /F2 {font_ids['F2']} 0 R /F3 {font_ids['F3']} 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode()
        objects.append(page_obj)
        objects.append(b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream")
    objects.extend([
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    ])

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += str(index).encode() + b" 0 obj\n" + obj + b"\nendobj\n"

    xref_pos = len(pdf)
    size = len(objects) + 1
    pdf += b"xref\n0 " + str(size).encode() + b"\n"
    pdf += b"0000000000 65535 f \n"
    for off in offsets:
        pdf += ("%010d 00000 n \n" % off).encode("latin-1")
    pdf += b"trailer\n<< /Size " + str(size).encode() + b" /Root 1 0 R >>\n"
    pdf += b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF"
    return bytes(pdf)


def _statement_pdf(statement: dict) -> bytes:
    """Render a polished landscape Statement of Account PDF."""
    width = 792
    height = 612
    margin = 42
    table_left = margin
    table_right = width - margin
    row_h = 22
    first_row_y = 353
    min_row_y = 84
    rows = statement.get("rows") or []
    pages = []
    period_label = _statement_period_label(statement.get("period") or {})
    customer = statement.get("customer") or {}
    totals = statement.get("totals") or {}

    page_rows = []
    current = []
    y = first_row_y
    for row in rows:
        if y < min_row_y and current:
            page_rows.append(current)
            current = []
            y = first_row_y
        current.append(row)
        y -= row_h
    if current or not rows:
        page_rows.append(current)
    total_pages = len(page_rows)

    def draw_header(ops: list, page_no: int) -> None:
        _pdf_text(ops, "Statement of Account", margin, 558, size=22, font="F2")
        _pdf_text_right(ops, f"Page {page_no} of {total_pages}", table_right, 563, size=8, font="F1")
        _pdf_text(ops, "Customer", margin, 526, size=8, font="F2")
        _pdf_text(ops, customer.get("company_name") or "-", margin, 510, size=12, font="F2")
        _pdf_text(ops, customer.get("address") or "-", margin, 494, size=9, font="F1")
        _pdf_text(ops, f"Contact: {customer.get('primary_contact_name') or '-'}", margin, 478, size=9, font="F1")
        _pdf_text(ops, f"TIN: {customer.get('tin_number') or '-'}", margin, 462, size=9, font="F1")
        _pdf_text(ops, "Period", 530, 526, size=8, font="F2")
        _pdf_text(ops, period_label, 530, 510, size=11, font="F2")
        _pdf_text(ops, f"Generated: {date.today().isoformat()}", 530, 492, size=9, font="F1")
        _pdf_fill_rect(ops, table_left, 378, table_right - table_left, 24)
        _pdf_line(ops, table_left, 378, table_right, 378)
        _pdf_line(ops, table_left, 402, table_right, 402)
        _pdf_text(ops, "Invoice No.", 48, 386, size=8, font="F2")
        _pdf_text(ops, "Inv Date", 210, 386, size=8, font="F2")
        _pdf_text(ops, "Due Date", 286, 386, size=8, font="F2")
        _pdf_text_right(ops, "Gross", 430, 386, size=8, font="F2")
        _pdf_text_right(ops, "WHT", 518, 386, size=8, font="F2")
        _pdf_text_right(ops, "Collections", 632, 386, size=8, font="F2")
        _pdf_text_right(ops, "Balance", 746, 386, size=8, font="F2")

    def draw_row(ops: list, row: dict, y: float) -> None:
        _pdf_text(ops, _pdf_truncate(row.get("invoice_number"), 27), 48, y, size=8, font="F3")
        _pdf_text(ops, _pdf_date(row.get("invoice_date")), 210, y, size=8, font="F3")
        _pdf_text(ops, _pdf_date(row.get("due_date")), 286, y, size=8, font="F3")
        _pdf_text_right(ops, _pdf_money(_num(row.get("gross_amount"))), 430, y, size=8, font="F3")
        _pdf_text_right(ops, _pdf_money(_num(row.get("wht_amount"))), 518, y, size=8, font="F3")
        _pdf_text_right(ops, _pdf_money(_num(row.get("collections"))), 632, y, size=8, font="F3")
        _pdf_text_right(ops, _pdf_money(_num(row.get("balance"))), 746, y, size=8, font="F3")
        _pdf_line(ops, table_left, y - 7, table_right, y - 7, shade="0.88")

    for page_no, rows_on_page in enumerate(page_rows, start=1):
        ops = ["0.35 w"]
        draw_header(ops, page_no)
        if rows_on_page:
            y = first_row_y
            for row in rows_on_page:
                draw_row(ops, row, y)
                y -= row_h
        else:
            _pdf_text(ops, "No invoices in this period.", 48, first_row_y, size=10, font="F1")

        if page_no == total_pages:
            _pdf_fill_rect(ops, 482, 62, 268, 94, color="0.96 0.97 0.98")
            _pdf_text(ops, "Totals", 500, 132, size=10, font="F2")
            _pdf_text(ops, "Invoiced", 500, 114, size=8, font="F1")
            _pdf_text_right(ops, _pdf_money(_num(totals.get("total_invoiced"))), 730, 114, size=8, font="F3")
            _pdf_text(ops, "WHT", 500, 98, size=8, font="F1")
            _pdf_text_right(ops, _pdf_money(_num(totals.get("total_wht"))), 730, 98, size=8, font="F3")
            _pdf_text(ops, "Collections", 500, 82, size=8, font="F1")
            _pdf_text_right(ops, _pdf_money(_num(totals.get("total_collections"))), 730, 82, size=8, font="F3")
            _pdf_line(ops, 500, 76, 730, 76, shade="0.70")
            _pdf_text(ops, "Outstanding", 500, 66, size=8, font="F2")
            _pdf_text_right(ops, _pdf_money(_num(totals.get("total_outstanding"))), 730, 66, size=8, font="F3")
        pages.append(ops)

    return _pdf_document(pages, width=width, height=height)


@router.get("/aging")
def ar_aging_report(
    customer: Optional[int] = Query(None),
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    bucket: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
):
    """AR aging report (Requirement 3).

    Classifies each outstanding (UNPAID/PARTIALLY_PAID) ACTIVE invoice into an
    aging bucket from its due date relative to today, lists per-invoice detail,
    and reports the outstanding balance summed per bucket. Supports customer,
    invoice-date range, and aging-bucket filters — every returned row satisfies
    all applied filters, and the per-bucket totals equal the sum of listed rows.
    """
    today = date.today()
    if bucket is not None and bucket not in AGING_BUCKETS:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Invalid aging bucket '{bucket}'.", "valid": list(AGING_BUCKETS)},
        )

    invoices = _outstanding_invoices(customer, company)
    collections = _collections_total_by_invoice([inv["invoice_id"] for inv in invoices])
    customers = _customer_map()

    rows = []
    aging_records = []
    for inv in invoices:
        invoice_date = _as_date(inv.get("invoice_date"))
        if from_ and (invoice_date is None or invoice_date < from_):
            continue
        if to and (invoice_date is None or invoice_date > to):
            continue

        due_date = _as_date(inv.get("due_date"))
        row_bucket = aging_bucket(due_date, today)
        if bucket is not None and row_bucket != bucket:
            continue

        gross = _num(inv.get("gross_amount"))
        wht = _num(inv.get("wht_amount"))
        balance = ar_balance(gross, collections.get(inv["invoice_id"], 0.0), wht)
        rows.append({
            "invoice_id": inv["invoice_id"],
            "customer_id": inv.get("customer_id"),
            "customer_name": customers.get(inv.get("customer_id"), {}).get("company_name"),
            "invoice_number": inv.get("invoice_number"),
            "invoice_date": inv.get("invoice_date"),
            "due_date": inv.get("due_date"),
            "gross_amount": gross,
            "outstanding_balance": balance,
            "aging_bucket": row_bucket,
        })
        aging_records.append({"due_date": due_date, "balance": balance})

    totals = aging_totals(aging_records, today)
    return {
        "as_of": today.isoformat(),
        "filters": {
            "customer": customer,
            "from": from_.isoformat() if from_ else None,
            "to": to.isoformat() if to else None,
            "bucket": bucket,
            "company": company,
        },
        "rows": rows,
        "bucket_totals": totals,
        "total_outstanding": round(sum(totals.values()), 2),
    }


@router.get("/statements")
def ar_statement(
    customer: int = Query(...),
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
):
    """Customer statement of account (Requirement 4).

    Lists the customer's ACTIVE invoices within the statement period with per
    invoice gross, collections and balance, plus period totals (invoiced,
    collections, outstanding) and the customer's company details.
    """
    return _build_statement(customer, from_, to)


def _build_statement(customer: int, from_: Optional[date], to: Optional[date]) -> dict:
    """Assemble the customer statement payload shared by JSON and PDF endpoints."""
    customer_record = _customer_map().get(customer)
    if customer_record is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    req = (
        supabase.table("ar_invoices")
        .select("*")
        .eq("record_status", "ACTIVE")
        .neq("lifecycle_status", "DRAFT")
        .eq("customer_id", customer)
        .order("invoice_date")
    )
    invoices = req.execute().data or []
    collections = _collections_total_by_invoice([inv["invoice_id"] for inv in invoices])

    rows = []
    total_invoiced = 0.0
    total_wht = 0.0
    total_collections = 0.0
    total_outstanding = 0.0
    for inv in invoices:
        invoice_date = _as_date(inv.get("invoice_date"))
        if from_ and (invoice_date is None or invoice_date < from_):
            continue
        if to and (invoice_date is None or invoice_date > to):
            continue

        gross = _num(inv.get("gross_amount"))
        wht = _num(inv.get("wht_amount"))
        collected = collections.get(inv["invoice_id"], 0.0)
        balance = ar_balance(gross, collected, wht)
        status = inv.get("collection_status")

        rows.append({
            "invoice_id": inv["invoice_id"],
            "invoice_number": inv.get("invoice_number"),
            "invoice_date": inv.get("invoice_date"),
            "due_date": inv.get("due_date"),
            "gross_amount": gross,
            "wht_amount": wht,
            "collections": collected,
            "balance": balance,
            "collection_status": status,
        })
        total_invoiced = round(total_invoiced + gross, 2)
        total_wht = round(total_wht + wht, 2)
        total_collections = round(total_collections + collected, 2)
        if status in OUTSTANDING_STATUSES:
            total_outstanding = round(total_outstanding + balance, 2)

    return {
        "customer": {
            "customer_id": customer,
            "company_name": customer_record.get("company_name"),
            "address": customer_record.get("address"),
            "primary_contact_name": customer_record.get("primary_contact_name"),
            "tin_number": customer_record.get("tin_number"),
        },
        "period": {
            "from": from_.isoformat() if from_ else None,
            "to": to.isoformat() if to else None,
        },
        "rows": rows,
        "totals": {
            "total_invoiced": total_invoiced,
            "total_wht": total_wht,
            "total_collections": total_collections,
            "total_outstanding": total_outstanding,
        },
    }


@router.get("/statements/export.pdf")
def ar_statement_pdf(
    customer: int = Query(...),
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
):
    """Export a customer statement as a PDF (Requirement 4.7).

    Generates a minimal, dependency-free PDF document of the statement. The same
    structured statement payload is available from ``GET /ar/statements``.
    """
    statement = _build_statement(customer, from_, to)
    pdf_bytes = _statement_pdf(statement)
    filename = _statement_pdf_filename(statement)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/overdue-customers")
def ar_overdue_customers(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    company: Optional[str] = Query(None),
):
    """Overdue customers report (Requirement 12).

    Lists every customer with at least one invoice past its due date. Per
    customer: total outstanding balance over overdue invoices, oldest overdue
    invoice date, days overdue (today minus oldest overdue due date), and the
    count of overdue invoices. Customers are sorted by days overdue descending,
    and the total overdue amount across all customers is included.
    """
    today = date.today()
    invoices = _outstanding_invoices(None, company)
    collections = _collections_total_by_invoice([inv["invoice_id"] for inv in invoices])
    customers = _customer_map()

    by_customer: dict = {}
    for inv in invoices:
        due_date = _as_date(inv.get("due_date"))
        if due_date is None or (today - due_date).days <= 0:
            continue  # not yet past due
        if from_ and due_date < from_:
            continue
        if to and due_date > to:
            continue

        customer_id = inv.get("customer_id")
        gross = _num(inv.get("gross_amount"))
        wht = _num(inv.get("wht_amount"))
        balance = ar_balance(gross, collections.get(inv["invoice_id"], 0.0), wht)

        entry = by_customer.setdefault(customer_id, {
            "customer_id": customer_id,
            "customer_name": customers.get(customer_id, {}).get("company_name"),
            "total_outstanding": 0.0,
            "oldest_overdue_date": due_date,
            "overdue_invoice_count": 0,
        })
        entry["total_outstanding"] = round(entry["total_outstanding"] + balance, 2)
        entry["overdue_invoice_count"] += 1
        if due_date < entry["oldest_overdue_date"]:
            entry["oldest_overdue_date"] = due_date

    result = []
    for entry in by_customer.values():
        oldest = entry["oldest_overdue_date"]
        result.append({
            "customer_id": entry["customer_id"],
            "customer_name": entry["customer_name"],
            "total_outstanding": entry["total_outstanding"],
            "oldest_overdue_date": oldest.isoformat(),
            "days_overdue": (today - oldest).days,
            "overdue_invoice_count": entry["overdue_invoice_count"],
        })

    result.sort(key=lambda row: row["days_overdue"], reverse=True)
    return {
        "as_of": today.isoformat(),
        "filters": {
            "from": from_.isoformat() if from_ else None,
            "to": to.isoformat() if to else None,
        },
        "customers": result,
        "total_overdue_amount": round(sum(row["total_outstanding"] for row in result), 2),
    }


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
@cached("ar:dashboard:{company}", ttl=30)
def ar_dashboard(company: Optional[str] = Query(None)):
    """AR dashboard summary, aging chart, and outstanding-invoice table (Req 15).

    Returns the three headline summary metrics (Outstanding_Receivables,
    Current_Due, Overdue_Accounts), the aging analysis chart with all five
    buckets always present, and the outstanding invoices table (UNPAID /
    PARTIALLY_PAID only, sorted ascending by due date).

    Outstanding_Receivables (Req 15.1) is the sum of AR balances over the
    outstanding invoices. Current_Due (Req 15.2) is the sum of those balances
    whose due date is on or after today. Overdue_Accounts (Req 15.3) is the
    whole-number count of distinct customers having at least one invoice past
    its due date. If receivables data cannot be retrieved, an explicit error is
    returned and no partial metrics are emitted (Req 15.12).
    """
    today = date.today()
    try:
        invoices = _outstanding_invoices(None, company)
        collections = _collections_total_by_invoice([inv["invoice_id"] for inv in invoices])
        customers = _customer_map()

        outstanding_receivables = 0.0
        current_due = 0.0
        overdue_customer_ids: set = set()
        aging_records = []
        table_rows = []

        for inv in invoices:
            due_date = _as_date(inv.get("due_date"))
            gross = _num(inv.get("gross_amount"))
            wht = _num(inv.get("wht_amount"))
            balance = ar_balance(gross, collections.get(inv["invoice_id"], 0.0), wht)

            outstanding_receivables = round(outstanding_receivables + balance, 2)
            if due_date is not None and due_date >= today:
                current_due = round(current_due + balance, 2)
            if due_date is not None and due_date < today:
                overdue_customer_ids.add(inv.get("customer_id"))

            aging_records.append({"due_date": due_date, "balance": balance})
            table_rows.append({
                "invoice_id": inv["invoice_id"],
                "invoice_number": inv.get("invoice_number"),
                "client": customers.get(inv.get("customer_id"), {}).get("company_name"),
                "due_date": inv.get("due_date"),
                "balance": balance,
            })

        # All five buckets are always present (0.0 when empty).
        bucket_totals = aging_totals(aging_records, today)
        aging_chart = [
            {"bucket": bucket, "total": bucket_totals[bucket]}
            for bucket in AGING_BUCKETS
        ]

        # Outstanding invoices table sorted ascending by due date.
        table_rows.sort(key=lambda row: _as_date(row["due_date"]) or date.max)

        return {
            "as_of": today.isoformat(),
            "summary": {
                "Outstanding_Receivables": outstanding_receivables,
                "Current_Due": current_due,
                "Overdue_Accounts": len(overdue_customer_ids),
            },
            "aging_chart": aging_chart,
            "outstanding_invoices": table_rows,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=500,
            detail={"error": "Receivables data could not be loaded"},
        )

# ── Tax-code configuration ────────────────────────────────────────────────────
#
# Requirement 9.10/9.11 govern selection and application of tax codes on
# documents (handled on the invoice/bill endpoints), while 9.12 allows
# administrators to modify configured rates and 19.13 requires that every such
# change is audited. The stub auth layer here exposes only employee_id/email via
# ``_extract_jwt_claims`` and carries no role claim, so administrator-only access
# is delegated to the existing auth layer; this router enforces the per-code
# ``editable`` flag and validates the submitted rate.


class TaxCodeRateUpdate(BaseModel):
    rate: float


@router.get("/tax-codes")
def list_tax_codes():
    """List all configured tax codes (code, tax_type, rate, scope, editable)."""
    return (
        supabase.table("tax_codes")
        .select("code, tax_type, rate, scope, editable")
        .order("code")
        .execute()
        .data
        or []
    )


@router.patch("/tax-codes/{code}")
def update_tax_code(code: str, request: Request, payload: TaxCodeRateUpdate):
    """Modify a tax code's rate (administrator action, Req 9.12).

    Validates the code exists and is editable (rejects when ``editable`` is
    false), and that the new rate is a non-negative number within a sane bound
    (0..1). On success the rate is persisted and a TAX_CONFIG audit entry is
    written capturing the old and new rate (Req 19.13).
    """
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    existing = (
        supabase.table("tax_codes")
        .select("code, tax_type, rate, scope, editable")
        .eq("code", code)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Tax code not found")
    tax_code = existing.data[0]

    if not tax_code.get("editable"):
        raise HTTPException(
            status_code=403,
            detail={"error": f"Tax code '{code}' is not editable and its rate cannot be changed."},
        )

    new_rate = payload.rate
    if new_rate is None or new_rate < 0:
        raise HTTPException(
            status_code=400,
            detail={"error": "Rate must be a non-negative number.", "fields": {"rate": "Must be >= 0."}},
        )
    if new_rate > 1:
        raise HTTPException(
            status_code=400,
            detail={"error": "Rate must not exceed 1 (100%).", "fields": {"rate": "Must be <= 1."}},
        )

    new_rate = round(_num(new_rate), 4)
    old_rate = _num(tax_code.get("rate"))

    try:
        res = (
            supabase.table("tax_codes")
            .update({"rate": new_rate, "updated_at": _today_iso()})
            .eq("code", code)
            .execute()
        )
    except Exception as exc:
        raise db_http_error(exc)

    write_audit_log(
        action="TAX_CONFIG",
        module_name=MODULE_NAME,
        description=f"Updated tax code {code} rate from {old_rate} to {new_rate}",
        performed_by=performed_by,
        employee_id=employee_id,
        record_id=code,
        ip_address=request.client.host if request.client else None,
        old_values={"code": code, "rate": old_rate},
        new_values={"code": code, "rate": new_rate},
        request=request,
    )

    updated = res.data[0] if res.data else {**tax_code, "rate": new_rate}
    return {
        "code": updated.get("code", code),
        "tax_type": updated.get("tax_type", tax_code.get("tax_type")),
        "rate": _num(updated.get("rate", new_rate)),
        "scope": updated.get("scope", tax_code.get("scope")),
        "editable": updated.get("editable", tax_code.get("editable")),
    }


# ── Attachments ───────────────────────────────────────────────────────────────
#
# Invoice document attachments are stored in the shared ``ar_ap_attachments``
# table discriminated by ``parent_type`` (INVOICE here). Only file metadata is
# persisted — the binary itself is referenced by ``file_ref``. Multiple
# attachments per invoice are allowed (Req 14.5), and the default listing shows
# only ACTIVE attachments with their file name and upload date (Req 14.7).
# Deletion archives instead of physically removing (Req 14.9, 18.3); archived
# attachments can be restored. Every write emits an audit entry.

ATTACHMENT_FILE_TYPES = ("PDF", "JPG", "PNG", "XLSX")


class AttachmentCreate(BaseModel):
    file_name: str
    file_ref: str
    file_type: str                      # PDF / JPG / PNG / XLSX


def _require_invoice(invoice_id: int) -> dict:
    """Fetch the bare invoice header (404 if missing)."""
    res = (
        supabase.table("ar_invoices")
        .select("invoice_id, invoice_number")
        .eq("invoice_id", invoice_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return res.data[0]


def _require_invoice_attachment(invoice_id: int, attachment_id: int) -> dict:
    """Fetch an attachment that belongs to the given invoice (404 if missing)."""
    res = (
        supabase.table("ar_ap_attachments")
        .select("*")
        .eq("attachment_id", attachment_id)
        .eq("parent_type", "INVOICE")
        .eq("parent_id", invoice_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return res.data[0]


def _list_invoice_attachments(invoice_id: int) -> list:
    """Return the invoice's ACTIVE attachments ordered by upload date."""
    return (
        supabase.table("ar_ap_attachments")
        .select("*")
        .eq("parent_type", "INVOICE")
        .eq("parent_id", invoice_id)
        .eq("record_status", "ACTIVE")
        .order("uploaded_at")
        .execute()
        .data
        or []
    )


@router.post("/invoices/{invoice_id}/attachments", status_code=201)
def add_invoice_attachment(invoice_id: int, request: Request, payload: AttachmentCreate):
    """Attach a document to an invoice (Req 14.5, 14.7).

    Validates the invoice exists and that the file type is one of
    PDF/JPG/PNG/XLSX (rejecting others with 400). Multiple attachments per
    invoice are permitted. Emits a CREATE audit entry.
    """
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    invoice = _require_invoice(invoice_id)

    file_type = (payload.file_type or "").upper()
    if file_type not in ATTACHMENT_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Unsupported file type '{payload.file_type}'. "
                         f"Allowed: {', '.join(ATTACHMENT_FILE_TYPES)}.",
                "fields": {"file_type": "Must be PDF, JPG, PNG, or XLSX."},
            },
        )
    if not payload.file_name or not payload.file_name.strip():
        raise HTTPException(
            status_code=422,
            detail={"error": "File name is required.", "fields": {"file_name": "Required."}},
        )
    if not payload.file_ref or not payload.file_ref.strip():
        raise HTTPException(
            status_code=422,
            detail={"error": "File reference is required.", "fields": {"file_ref": "Required."}},
        )

    record = {
        "parent_type": "INVOICE",
        "parent_id": invoice_id,
        "file_name": payload.file_name.strip(),
        "file_ref": payload.file_ref.strip(),
        "file_type": file_type,
        "uploaded_at": _today_iso(),
        "record_status": "ACTIVE",
        "created_by_employee_id": employee_id,
    }
    try:
        res = supabase.table("ar_ap_attachments").insert(record).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to attach document")

    attachment = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name=MODULE_NAME,
        description=f"Attached document {attachment.get('file_name')} to invoice "
                    f"{invoice.get('invoice_number')}",
        performed_by=performed_by,
        employee_id=employee_id,
        record_id=attachment.get("attachment_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return attachment


@router.get("/invoices/{invoice_id}/attachments")
def list_invoice_attachments(invoice_id: int):
    """List an invoice's ACTIVE attachments with file name + upload date (Req 14.7)."""
    _require_invoice(invoice_id)
    return _list_invoice_attachments(invoice_id)


@router.delete("/invoices/{invoice_id}/attachments/{attachment_id}")
def archive_invoice_attachment(invoice_id: int, attachment_id: int, request: Request):
    """Archive an invoice attachment (soft delete, Req 14.9, 18.3).

    Sets ``record_status`` to ARCHIVED, retaining both the attachment and the
    invoice records, and emits an ARCHIVE audit entry.
    """
    _, performed_by = _extract_jwt_claims(request)
    invoice = _require_invoice(invoice_id)
    attachment = _require_invoice_attachment(invoice_id, attachment_id)

    supabase.table("ar_ap_attachments").update(
        {"record_status": "ARCHIVED", "updated_at": _today_iso()}
    ).eq("attachment_id", attachment_id).execute()

    write_audit_log(
        action="ARCHIVE",
        module_name=MODULE_NAME,
        description=f"Archived attachment {attachment.get('file_name')} on invoice "
                    f"{invoice.get('invoice_number')}",
        performed_by=performed_by,
        record_id=attachment_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return {"attachment_id": attachment_id, "attachments": _list_invoice_attachments(invoice_id)}


@router.post("/invoices/{invoice_id}/attachments/{attachment_id}/restore")
def restore_invoice_attachment(invoice_id: int, attachment_id: int, request: Request):
    """Restore an archived invoice attachment back to ACTIVE (Req 18.15)."""
    _, performed_by = _extract_jwt_claims(request)
    invoice = _require_invoice(invoice_id)
    attachment = _require_invoice_attachment(invoice_id, attachment_id)

    supabase.table("ar_ap_attachments").update(
        {"record_status": "ACTIVE", "updated_at": _today_iso()}
    ).eq("attachment_id", attachment_id).execute()

    write_audit_log(
        action="RESTORE",
        module_name=MODULE_NAME,
        description=f"Restored attachment {attachment.get('file_name')} on invoice "
                    f"{invoice.get('invoice_number')}",
        performed_by=performed_by,
        record_id=attachment_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return {"attachment_id": attachment_id, "attachments": _list_invoice_attachments(invoice_id)}
