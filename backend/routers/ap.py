"""Accounts Payable (Module 9) router.

This router is intentionally thin: it validates input, persists to the Supabase
AP tables, and writes audit entries. All financial math (tax, gross, net
payable, balances, document numbering, status gating) lives in the pure
calculation module ``routers/ar_ap_calc.py`` and is reused here rather than
re-implemented.

Task 6.1 scope: bill endpoints and lifecycle (meta, list, detail, create,
update, archive, restore). Payment vouchers, payments, checks, reports,
dashboards, and attachment write endpoints are implemented in later tasks.

Note: ``ap_bills`` derives ``gross_amount``, ``ewt_material``, and
``net_payable`` as GENERATED STORED columns at the database level
(migration 009). This router therefore persists only the source fields
``vat_exclusive_amount`` and ``vat_input`` and lets the database derive the
rest (Requirements 5.8, 5.9, 5.10).
"""

from datetime import date, datetime, timedelta
from io import StringIO
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel

from database import supabase
from middleware.audit_middleware import _extract_jwt_claims, write_audit_log
from routers.ar_ap_calc import (
    AGING_BUCKETS,
    CHECK_TERMINAL_STATUSES,
    aging_bucket,
    aging_totals,
    ap_balance,
    can_modify_invoice,
    can_transition_check,
    generate_document_number,
    is_valid_clearing_date,
    vat_amount,
)
from routers.integration_calc import (
    CONFIRMED_LIFECYCLE_STATUS,
    active_source_refs,
    aggregate_bill_totals,
    bill_confirmation_blockers,
    build_bill_header,
    build_bill_lines,
    can_confirm_bill,
    compute_po_billing_status,
    confirmed_bill_updates,
    duplicate_decision,
    po_billing_eligibility,
    status_change,
)
from utils.errors import db_http_error
from utils.supabase_retry import execute_with_retry
from utils.cache import cached

router = APIRouter(prefix="/ap", tags=["accounts-payable"])

MODULE_NAME = "Accounts Payable"

# Supplier-bill lines reference the same configured tax codes used by PO lines.
AP_VAT_CODES = ("VAT_INPUT", "VAT_EXEMPT")


# ── Pydantic models ───────────────────────────────────────────────────────────

class BillItemPayload(BaseModel):
    description: str
    vat_exclusive_amount: float = 0
    vat_code: str                       # VAT_INPUT or VAT_EXEMPT


class BillCreate(BaseModel):
    supplier_id: int
    bill_date: date
    due_date: date
    po_number: str
    supplier_invoice_number: str
    items: List[BillItemPayload] = []


class DraftBillFromPO(BaseModel):
    """Request body for generating a DRAFT bill from a received PO.

    All fields are optional: ``supplier_invoice_number`` becomes a placeholder
    sentinel when omitted (Requirement 1.7), ``due_date`` defaults to the bill
    date, and ``override`` / ``override_reason`` drive the duplicate-billing
    guard (Requirement 7).
    """
    supplier_invoice_number: Optional[str] = None
    due_date: Optional[date] = None
    override: bool = False
    override_reason: Optional[str] = None


class BillUpdate(BaseModel):
    supplier_id: Optional[int] = None
    bill_date: Optional[date] = None
    due_date: Optional[date] = None
    po_number: Optional[str] = None
    supplier_invoice_number: Optional[str] = None
    items: Optional[List[BillItemPayload]] = None


class VoucherCreate(BaseModel):
    supplier_id: int
    payment_date: date
    bill_ids: List[int] = []


class VoucherReject(BaseModel):
    rejection_remarks: str = ""


class PaymentCreate(BaseModel):
    bill_id: int
    payment_amount: float
    payment_date: date
    payment_method: str
    payment_file_name: Optional[str] = None
    payment_file_ref: Optional[str] = None
    payment_file_type: Optional[str] = None


class CheckCreate(BaseModel):
    voucher_id: int
    check_number: str
    check_date: date
    bank: str
    check_amount: float


class CheckClear(BaseModel):
    clearing_date: date


class PaymentRunCreate(BaseModel):
    from_date: date
    to_date: date
    submit_for_approval: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _num(value) -> float:
    return float(value or 0)


def _sync_php_equivalent_amounts(bill_id: int, fx_rate_to_php) -> None:
    """Persist PHP equivalents using the bill's immutable PO FX snapshot."""
    if fx_rate_to_php is None:
        return
    rate = _num(fx_rate_to_php)
    if rate <= 0:
        raise HTTPException(status_code=422, detail="A positive FX rate is required to calculate PHP bill amounts.")

    bill = supabase.table("ap_bills").select(
        "vat_exclusive_amount, vat_input, gross_amount, net_payable"
    ).eq("bill_id", bill_id).single().execute()
    if not bill.data:
        raise HTTPException(status_code=404, detail="Bill not found while calculating PHP equivalents.")

    values = bill.data
    supabase.table("ap_bills").update({
        "php_vat_exclusive_amount": round(_num(values.get("vat_exclusive_amount")) * rate, 2),
        "php_vat_input": round(_num(values.get("vat_input")) * rate, 2),
        "php_gross_amount": round(_num(values.get("gross_amount")) * rate, 2),
        "php_net_payable": round(_num(values.get("net_payable")) * rate, 2),
    }).eq("bill_id", bill_id).execute()


def _currency_for_supplier(supplier: Optional[dict], fallback: str = "PHP") -> str:
    return "USD" if (supplier or {}).get("supplier_classification") == "INTERNATIONAL" else fallback


def _currency_from_supplier_id(supplier_id: Optional[int], fallback: str = "PHP") -> str:
    return _currency_for_supplier(_supplier_map().get(supplier_id), fallback)


def _today_iso() -> str:
    return datetime.now().isoformat()


def _format_currency(value: float, currency_code: str = "PHP") -> str:
    return f"{currency_code if currency_code in ('PHP', 'USD') else 'PHP'} {value:,.2f}"


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
    """
    from routers.integration_calc import TAX_CODE_RATES

    rows = supabase.table("tax_codes").select("code, rate").execute().data or []
    db_rates = {row["code"]: _num(row["rate"]) for row in rows}
    # Merge defaults underneath so VAT_INPUT/VAT_OUTPUT are always present.
    return {**TAX_CODE_RATES, **db_rates}


def _next_bill_number(entity: str = None) -> str:
    """Generate the next bill number in standard format: COMPANY-YYYY-BIL-NNNN."""
    from utils.code_generator import generate_code
    return generate_code(entity, "BIL", "ap_bills", "bill_number")


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


def _entity_from_purchase_order(po: Optional[dict]) -> Optional[str]:
    if not isinstance(po, dict):
        return None
    entity = po.get("entity") or _entity_from_document_number(po.get("po_number"))
    if entity:
        return entity

    purchase_request_id = po.get("purchase_request_id")
    if purchase_request_id is None:
        return None
    rows = (
        supabase.table("purchase_requests")
        .select("pr_number")
        .eq("purchase_request_id", purchase_request_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return _entity_from_document_number(rows[0].get("pr_number")) if rows else None


def _entity_from_purchase_order_number(po_number: Optional[str]) -> Optional[str]:
    entity = _entity_from_document_number(po_number)
    if entity:
        return entity
    if not (isinstance(po_number, str) and po_number.strip()):
        return None
    rows = (
        supabase.table("purchase_orders")
        .select("po_number, purchase_request_id")
        .eq("po_number", po_number.strip())
        .limit(1)
        .execute()
        .data
        or []
    )
    return _entity_from_purchase_order(rows[0]) if rows else None


def _bill_entity_candidates(bills: list[dict]) -> set[str]:
    entities = set()
    source_po_ids = []
    for bill in bills:
        entity = _entity_from_purchase_order_number(bill.get("po_number"))
        if not entity and bill.get("source_purchase_order_id") is not None:
            source_po_ids.append(bill.get("source_purchase_order_id"))
            continue
        if not entity:
            entity = _entity_from_document_number(bill.get("bill_number"))
        if entity:
            entities.add(entity)

    if source_po_ids:
        po_rows = (
            supabase.table("purchase_orders")
            .select("purchase_order_id, po_number, purchase_request_id")
            .in_("purchase_order_id", list(source_po_ids))
            .execute()
            .data
            or []
        )
        for po in po_rows:
            entity = _entity_from_purchase_order(po)
            if entity:
                entities.add(entity)
    return entities


def _entity_from_bill_ids(bill_ids: List[int]) -> Optional[str]:
    if not bill_ids:
        return None
    bills = (
        supabase.table("ap_bills")
        .select("bill_id, bill_number, po_number, source_purchase_order_id")
        .in_("bill_id", list(bill_ids))
        .execute()
        .data
        or []
    )
    entities = _bill_entity_candidates(bills)
    if len(entities) > 1:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Selected bills belong to different companies. Create separate payment vouchers per company.",
                "fields": {"bill_ids": "Bills must use the same company."},
            },
        )
    return next(iter(entities)) if entities else None


def _bill_matches_company(bill: dict, company_code: Optional[str]) -> bool:
    if not company_code:
        return True
    return any(_entity_matches_company(entity, company_code) for entity in _bill_entity_candidates([bill]))


def _filter_bills_by_company(bills: list[dict], company: Optional[str]) -> list[dict]:
    company_code = _company_filter_code(company)
    if not company_code:
        return bills
    return [row for row in bills if _bill_matches_company(row, company_code)]


def _filter_vouchers_by_company(vouchers: list[dict], company: Optional[str]) -> list[dict]:
    company_code = _company_filter_code(company)
    if not company_code:
        return vouchers
    return [
        row for row in vouchers
        if _entity_matches_company(_entity_from_document_number(row.get("voucher_number")), company_code)
    ]


def _validate_line_vat_code(item: BillItemPayload, rates: dict) -> None:
    """Reject bill lines whose VAT code is not a valid AP selection."""
    if item.vat_code not in AP_VAT_CODES:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Invalid VAT code '{item.vat_code}' for a bill line. "
                         f"Expected VAT_INPUT or VAT_EXEMPT.",
            },
        )
    if item.vat_code not in rates:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Tax code '{item.vat_code}' is not configured."},
        )


def _compute_bill_totals(items: List[BillItemPayload], rates: dict) -> dict:
    """Recompute the server-trusted source fields from line inputs.

    Only ``vat_exclusive_amount`` and ``vat_input`` are returned;
    ``gross_amount``, ``ewt_material``, and ``net_payable`` are GENERATED STORED
    columns in the database and must not be written.
    """
    vat_exclusive_total = 0.0
    vat_input_total = 0.0
    for item in items:
        _validate_line_vat_code(item, rates)
        amount = _num(item.vat_exclusive_amount)
        rate = rates[item.vat_code]
        vat_exclusive_total += amount
        vat_input_total += vat_amount(amount, rate)
    return {
        "vat_exclusive_amount": round(vat_exclusive_total, 2),
        "vat_input": round(vat_input_total, 2),
    }


def _with_fallback_item_inputs(item: dict) -> dict:
    amount = round(_num(item.get("vat_exclusive_amount")), 2)
    return {
        **item,
        "product_code": item.get("product_code"),
        "quantity": 1,
        "unit": item.get("unit") or "-",
        "base_unit_price": amount,
        "unit_price": amount,
        "line_total": amount,
        "source_purchase_order_item_id": item.get("source_purchase_order_item_id"),
    }


def _enrich_bill_items_from_purchase_order(bill: dict, items: list[dict]) -> list[dict]:
    source_po_id = bill.get("source_purchase_order_id")
    if not source_po_id or not items:
        return [_with_fallback_item_inputs(item) for item in items]

    po_items = execute_with_retry(
        supabase.table("purchase_order_items")
        .select("purchase_order_item_id, product_code, item_description, unit, quantity, received_quantity, final_unit_cost")
        .eq("purchase_order_id", source_po_id)
        .order("purchase_order_item_id")
    ).data or []
    po_candidates = [
        row for row in po_items
        if _num(row.get("quantity")) > 0 or _num(row.get("received_quantity")) > 0
    ]

    enriched = []
    for index, item in enumerate(items):
        amount = round(_num(item.get("vat_exclusive_amount")), 2)
        source_line = po_candidates[index] if index < len(po_candidates) else None
        if not source_line:
            enriched.append(_with_fallback_item_inputs(item))
            continue

        unit_price = _num(source_line.get("final_unit_cost"))
        quantity = round(amount / unit_price, 4) if unit_price else _num(source_line.get("quantity"))
        enriched.append({
            **item,
            "product_code": source_line.get("product_code") or item.get("product_code"),
            "quantity": quantity,
            "unit": source_line.get("unit") or item.get("unit") or "Nos",
            "base_unit_price": round(unit_price, 2),
            "unit_price": round(unit_price, 2),
            "line_total": amount,
            "source_purchase_order_item_id": source_line.get("purchase_order_item_id"),
        })
    return enriched


def _validate_references(supplier_id: Optional[int], po_number: Optional[str]) -> None:
    """Validate supplier/PO references against existing data (Req 11.2, 11.5)."""
    if supplier_id is not None:
        supplier = (
            supabase.table("supplier_list")
            .select("supplier_id")
            .eq("supplier_id", supplier_id)
            .limit(1)
            .execute()
        )
        if not supplier.data:
            raise HTTPException(
                status_code=400,
                detail={"error": "Supplier not found.", "fields": {"supplier_id": "No matching supplier."}},
            )
    if po_number:
        po = (
            supabase.table("purchase_orders")
            .select("po_number")
            .eq("po_number", po_number)
            .limit(1)
            .execute()
        )
        if not po.data:
            raise HTTPException(
                status_code=400,
                detail={"error": "Purchase order not found.", "fields": {"po_number": "No matching purchase order."}},
            )


def _require_purchase_order_for_bill(po_number: str, supplier_id: Optional[int]) -> tuple[dict, str]:
    """Resolve the source PO and its owning company for an AP bill."""
    if not (isinstance(po_number, str) and po_number.strip()):
        raise HTTPException(
            status_code=422,
            detail={"error": "PO Number is required.", "fields": {"po_number": "Required."}},
        )

    po_result = (
        supabase.table("purchase_orders")
        .select("purchase_order_id, po_number, supplier_id, entity, purchase_request_id")
        .eq("po_number", po_number.strip())
        .limit(1)
        .execute()
    )
    po = po_result.data[0] if po_result.data else None
    if not po:
        raise HTTPException(
            status_code=400,
            detail={"error": "Purchase order not found.", "fields": {"po_number": "No matching purchase order."}},
        )
    if supplier_id is not None and int(po.get("supplier_id") or 0) != int(supplier_id):
        raise HTTPException(
            status_code=422,
            detail={
                "error": "The bill supplier must match the purchase order supplier.",
                "fields": {"supplier_id": "Must match the selected purchase order."},
            },
        )

    entity = _entity_from_purchase_order(po)
    if not entity:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "The purchase order has no owning company.",
                "fields": {"po_number": "Set an entity on the source purchase request before billing."},
            },
        )
    return po, entity


def _is_placeholder_supplier_invoice_number(value) -> bool:
    if not isinstance(value, str):
        return True
    stripped = value.strip()
    return not stripped or stripped.upper() == "PENDING"


def _reject_duplicate_supplier_invoice(
    supplier_id: Optional[int],
    supplier_invoice_number,
    *,
    exclude_bill_id: Optional[int] = None,
) -> None:
    """Prevent active duplicate supplier invoices for the same supplier."""
    if supplier_id is None or _is_placeholder_supplier_invoice_number(supplier_invoice_number):
        return

    target = supplier_invoice_number.strip().lower()
    rows = (
        supabase.table("ap_bills")
        .select("bill_id, bill_number, supplier_invoice_number")
        .eq("supplier_id", supplier_id)
        .eq("record_status", "ACTIVE")
        .execute()
        .data
        or []
    )
    duplicate = next(
        (
            row for row in rows
            if row.get("bill_id") != exclude_bill_id
            and (row.get("supplier_invoice_number") or "").strip().lower() == target
        ),
        None,
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail={
                "error": (
                    f"Supplier invoice {supplier_invoice_number.strip()} is already "
                    f"recorded on bill {duplicate.get('bill_number')}."
                ),
                "fields": {"supplier_invoice_number": "Duplicate supplier invoice for this supplier."},
            },
        )


def _supplier_map() -> dict:
    """Return {supplier_id: supplier_row} map. Cached for 60s at module level."""
    import time as _time
    now = _time.time()
    # Module-level fast cache to avoid re-fetching within the same process
    if hasattr(_supplier_map, "_cache") and _supplier_map._expires > now:
        return _supplier_map._cache
    rows = execute_with_retry(
        supabase.table("supplier_list")
        .select("supplier_id, company_name, tin_number, billing_address, payment_terms, supplier_classification")
    ).data or []
    result = {row["supplier_id"]: row for row in rows}
    _supplier_map._cache = result
    _supplier_map._expires = now + 60
    return result


def _bill_match_summary(bill: dict, items: list) -> Optional[dict]:
    """Summarize PO/receipt/bill matching for PO-sourced bills."""
    source_po_id = bill.get("source_purchase_order_id")
    if not source_po_id:
        return None

    po_items = execute_with_retry(
        supabase.table("purchase_order_items")
        .select("purchase_order_item_id, item_description, quantity, received_quantity, final_unit_cost, freight, duties, other_charges")
        .eq("purchase_order_id", source_po_id)
    ).data or []
    item_ids = [row["purchase_order_item_id"] for row in po_items]
    po_items_by_id = {row["purchase_order_item_id"]: row for row in po_items}
    receipt_items = []
    if item_ids:
        receipt_items = execute_with_retry(
            supabase.table("goods_receipt_items")
            .select("purchase_order_item_id, received_quantity, unit_cost")
            .in_("purchase_order_item_id", item_ids)
        ).data or []

    receipt_totals: dict = {}
    for row in receipt_items:
        item_id = row.get("purchase_order_item_id")
        po_item = po_items_by_id.get(item_id) or {}
        ordered_quantity = _num(po_item.get("quantity"))
        received_quantity = _num(row.get("received_quantity"))
        charge_ratio = min(received_quantity / ordered_quantity, 1) if ordered_quantity > 0 else 0
        additional_cost = (
            _num(po_item.get("freight"))
            + _num(po_item.get("duties"))
            + _num(po_item.get("other_charges"))
        ) * charge_ratio
        receipt_totals[item_id] = round(
            receipt_totals.get(item_id, 0.0)
            + (received_quantity * _num(row.get("unit_cost")))
            + additional_cost,
            2,
        )

    po_total = round(
        sum(
            (_num(row.get("quantity")) * _num(row.get("final_unit_cost")))
            + _num(row.get("freight"))
            + _num(row.get("duties"))
            + _num(row.get("other_charges"))
            for row in po_items
        ),
        2,
    )
    received_total = round(sum(receipt_totals.values()), 2)
    bill_total = round(sum(_num(row.get("vat_exclusive_amount")) for row in items), 2)
    variance = round(bill_total - received_total, 2)
    status = "MATCHED" if abs(variance) <= 0.01 and bill_total > 0 else "REVIEW"

    return {
        "status": status,
        "po_total": po_total,
        "received_total": received_total,
        "bill_total": bill_total,
        "variance": variance,
        "po_line_count": len(po_items),
        "receipt_line_count": len(receipt_items),
        "bill_line_count": len(items),
    }


def _get_bill(bill_id: int) -> dict:
    """Fetch a single bill with its line items and active attachments."""
    bill = (
        supabase.table("ap_bills")
        .select("*")
        .eq("bill_id", bill_id)
        .single()
        .execute()
    )
    if not bill.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    items = (
        supabase.table("ap_bill_items")
        .select("*")
        .eq("bill_id", bill_id)
        .order("item_id")
        .execute()
        .data
        or []
    )
    items = _enrich_bill_items_from_purchase_order(bill.data, items)
    attachments = (
        supabase.table("ar_ap_attachments")
        .select("*")
        .eq("parent_type", "BILL")
        .eq("parent_id", bill_id)
        .eq("record_status", "ACTIVE")
        .order("uploaded_at")
        .execute()
        .data
        or []
    )
    voucher_links = (
        supabase.table("ap_voucher_bills")
        .select("voucher_id")
        .eq("bill_id", bill_id)
        .execute()
        .data
        or []
    )
    voucher_ids = [row["voucher_id"] for row in voucher_links if row.get("voucher_id") is not None]
    vouchers = []
    if voucher_ids:
        vouchers = (
            supabase.table("ap_payment_vouchers")
            .select("*")
            .in_("voucher_id", voucher_ids)
            .eq("record_status", "ACTIVE")
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )

    payments = (
        supabase.table("ap_payments")
        .select("*")
        .eq("bill_id", bill_id)
        .order("payment_date", desc=True)
        .execute()
        .data
        or []
    )

    checks = []
    if voucher_ids:
        checks = (
            supabase.table("ap_checks")
            .select("*")
            .in_("voucher_id", voucher_ids)
            .eq("record_status", "ACTIVE")
            .order("check_date", desc=True)
            .execute()
            .data
            or []
        )

    supplier = _supplier_map().get(bill.data.get("supplier_id"), {})

    # Related records: PO, goods receipts, tax forms
    related = {}
    po_number = bill.data.get("po_number")
    source_po_id = bill.data.get("source_purchase_order_id")

    # Purchase Order
    if source_po_id or po_number:
        try:
            po_query = supabase.table("purchase_orders").select(
                "purchase_order_id, po_number, status, delivery_date, supplier_id, purchase_request_id"
            )
            if source_po_id:
                po_query = po_query.eq("purchase_order_id", source_po_id)
            else:
                po_query = po_query.eq("po_number", po_number)
            po_rows = po_query.limit(1).execute().data or []
            if po_rows:
                related["purchase_order"] = po_rows[0]
                # Goods Receipts linked to this PO
                po_id = po_rows[0]["purchase_order_id"]
                gr_rows = supabase.table("goods_receipts").select(
                    "goods_receipt_id, receipt_number, dr_number, status, received_date"
                ).eq("purchase_order_id", po_id).order("received_date", desc=True).execute().data or []
                related["goods_receipts"] = gr_rows

                # Purchase Request
                pr_id = po_rows[0].get("purchase_request_id")
                if pr_id:
                    pr_rows = supabase.table("purchase_requests").select(
                        "purchase_request_id, pr_number, status, requested_by"
                    ).eq("purchase_request_id", pr_id).limit(1).execute().data or []
                    if pr_rows:
                        related["purchase_request"] = pr_rows[0]
        except Exception:
            pass

    # Tax Forms linked to this bill (via bir_form_bills)
    try:
        form_links = supabase.table("bir_form_bills").select(
            "form_record_id"
        ).eq("bill_id", bill_id).execute().data or []
        form_ids = list({l["form_record_id"] for l in form_links})
        if form_ids:
            tax_forms = supabase.table("bir_forms").select(
                "form_record_id, form_type, form_code, entity, status, period_from, period_to, payee_name, created_at"
            ).in_("form_record_id", form_ids).order("created_at", desc=True).execute().data or []
            related["tax_forms"] = tax_forms
    except Exception:
        pass

    return {
        **bill.data,
        "supplier_name": supplier.get("company_name"),
        "supplier": supplier,
        "items": items,
        "attachments": attachments,
        "vouchers": vouchers,
        "payments": payments,
        "checks": checks,
        "match_summary": _bill_match_summary(bill.data, items),
        "related": related,
    }


def _insert_items(bill_id: int, items: List[BillItemPayload], employee_id) -> None:
    rows = []
    for item in items:
        rows.append({
            "bill_id": bill_id,
            "description": item.description,
            "vat_exclusive_amount": _num(item.vat_exclusive_amount),
            "vat_code": item.vat_code,
            "created_by_employee_id": employee_id,
        })
    if rows:
        supabase.table("ap_bill_items").insert(rows).execute()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/meta")
def ap_meta():
    """Form dropdown data: suppliers, purchase orders, AP tax codes."""
    return {
        "suppliers": supabase.table("supplier_list")
            .select("supplier_id, company_name, tin_number, billing_address, payment_terms, status")
            .order("company_name").execute().data or [],
        "purchase_orders": supabase.table("purchase_orders")
            .select("purchase_order_id, po_number, supplier_id, status")
            .order("created_at", desc=True).execute().data or [],
        "tax_codes": supabase.table("tax_codes")
            .select("code, tax_type, rate, scope, editable")
            .in_("scope", ["AP", "BOTH"])
            .order("code").execute().data or [],
    }


@router.get("/bills")
def list_bills(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    include_archived: bool = Query(False),
):
    """List bills. Active bills only by default."""
    req = supabase.table("ap_bills").select("*").order("created_at", desc=True)
    if not include_archived:
        req = req.eq("record_status", "ACTIVE")
    if status and status != "All":
        req = req.eq("payment_status", status)
    if search:
        req = req.or_(
            f"bill_number.ilike.%{search}%,"
            f"po_number.ilike.%{search}%,"
            f"supplier_invoice_number.ilike.%{search}%"
        )
    rows = _filter_bills_by_company(execute_with_retry(req).data or [], company)

    suppliers = _supplier_map()
    bill_ids = [row.get("bill_id") for row in rows if row.get("bill_id") is not None]
    voucher_statuses_by_bill = {}
    if bill_ids:
        links = (
            supabase.table("ap_voucher_bills")
            .select("bill_id, voucher_id")
            .in_("bill_id", bill_ids)
            .execute()
            .data
            or []
        )
        voucher_ids = [row.get("voucher_id") for row in links if row.get("voucher_id") is not None]
        voucher_map = {}
        if voucher_ids:
            vouchers = (
                supabase.table("ap_payment_vouchers")
                .select("voucher_id, status")
                .in_("voucher_id", voucher_ids)
                .eq("record_status", "ACTIVE")
                .execute()
                .data
                or []
            )
            voucher_map = {row.get("voucher_id"): row for row in vouchers}
        for link in links:
            voucher = voucher_map.get(link.get("voucher_id"))
            if not voucher:
                continue
            voucher_statuses_by_bill.setdefault(link.get("bill_id"), []).append(voucher.get("status"))

    # Also fetch voucher numbers for display
    voucher_numbers_by_bill = {}
    if bill_ids:
        vlinks = supabase.table("ap_voucher_bills").select("bill_id, voucher_id").in_("bill_id", bill_ids).execute().data or []
        v_ids = list({r["voucher_id"] for r in vlinks if r.get("voucher_id")})
        vnum_map = {}
        if v_ids:
            for i in range(0, len(v_ids), 100):
                batch = v_ids[i:i+100]
                vrows = supabase.table("ap_payment_vouchers").select("voucher_id, voucher_number").in_("voucher_id", batch).execute().data or []
                for vr in vrows:
                    vnum_map[vr["voucher_id"]] = vr.get("voucher_number", "")
        for vl in vlinks:
            vnum = vnum_map.get(vl.get("voucher_id"))
            if vnum:
                voucher_numbers_by_bill.setdefault(vl["bill_id"], []).append(vnum)

    return [
        {
            **row,
            "supplier_name": suppliers.get(row.get("supplier_id"), {}).get("company_name"),
            "voucher_statuses": voucher_statuses_by_bill.get(row.get("bill_id"), []),
            "voucher_numbers": voucher_numbers_by_bill.get(row.get("bill_id"), []),
        }
        for row in rows
    ]


@router.get("/bills/{bill_id}")
def get_bill(bill_id: int):
    """Get a single bill with line items and active attachments."""
    return _get_bill(bill_id)


@router.post("/bills", status_code=201)
def create_bill(request: Request, payload: BillCreate):
    """Create a bill: BILL-YYYYMM-NNN, payment_status UNPAID, record_status ACTIVE."""
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    if not payload.po_number or not payload.po_number.strip():
        raise HTTPException(
            status_code=422,
            detail={"error": "PO Number is required.", "fields": {"po_number": "Required."}},
        )
    if not payload.supplier_invoice_number or not payload.supplier_invoice_number.strip():
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Supplier Invoice Number is required.",
                "fields": {"supplier_invoice_number": "Required."},
            },
        )

    source_purchase_order, entity = _require_purchase_order_for_bill(payload.po_number, payload.supplier_id)
    _reject_duplicate_supplier_invoice(payload.supplier_id, payload.supplier_invoice_number)

    rates = _tax_rate_map()
    totals = _compute_bill_totals(payload.items, rates)
    bill_number = _next_bill_number(entity)
    currency_code = _currency_from_supplier_id(payload.supplier_id)

    header = {
        "bill_number": bill_number,
        "supplier_id": payload.supplier_id,
        "currency_code": currency_code,
        "bill_date": payload.bill_date.isoformat(),
        "due_date": payload.due_date.isoformat(),
        "po_number": source_purchase_order["po_number"],
        "source_purchase_order_id": source_purchase_order["purchase_order_id"],
        "entity": entity,
        "supplier_invoice_number": payload.supplier_invoice_number,
        "vat_exclusive_amount": totals["vat_exclusive_amount"],
        "vat_input": totals["vat_input"],
        "payment_status": "UNPAID",
        "record_status": "ACTIVE",
        "created_by_employee_id": employee_id,
    }
    try:
        res = supabase.table("ap_bills").insert(header).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create bill")

    bill_id = res.data[0]["bill_id"]
    _insert_items(bill_id, payload.items, employee_id)

    write_audit_log(
        action="CREATE",
        module_name=MODULE_NAME,
        description=f"Created bill {bill_number}",
        performed_by=performed_by,
        record_id=bill_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_bill(bill_id)


def _reset_linked_vouchers_to_draft(bill_id, *, performed_by=None, request=None) -> list:
    """Reset any in-flight voucher linked to a bill back to DRAFT.

    Editing a bill invalidates an in-flight approval: the amounts a reviewer
    approved may have changed. Each linked voucher that has advanced past DRAFT
    (``FOR_APPROVAL`` or ``APPROVED``) is therefore returned to ``DRAFT`` and its
    approval metadata cleared, forcing re-submission and re-approval. A
    STATUS_CHANGE audit entry is written per reset voucher. Returns the list of
    reset voucher numbers.
    """
    links = (
        supabase.table("ap_voucher_bills")
        .select("voucher_id")
        .eq("bill_id", bill_id)
        .execute()
        .data
        or []
    )
    voucher_ids = [link["voucher_id"] for link in links]
    if not voucher_ids:
        return []

    vouchers = (
        supabase.table("ap_payment_vouchers")
        .select("voucher_id, voucher_number, status")
        .in_("voucher_id", voucher_ids)
        .execute()
        .data
        or []
    )

    reset_numbers = []
    for voucher in vouchers:
        if voucher.get("status") not in ("FOR_APPROVAL", "APPROVED"):
            continue
        try:
            supabase.table("ap_payment_vouchers").update({
                "status": "DRAFT",
                "approver_employee_id": None,
                "approved_at": None,
                "rejection_remarks": None,
                "updated_at": _today_iso(),
            }).eq("voucher_id", voucher["voucher_id"]).execute()
        except Exception as exc:
            raise db_http_error(exc)

        write_audit_log(
            action="STATUS_CHANGE",
            module_name=MODULE_NAME,
            description=f"Voucher {voucher.get('voucher_number')} reset from "
                        f"{voucher.get('status')} to DRAFT because its linked bill was edited",
            performed_by=performed_by,
            record_id=voucher["voucher_id"],
            ip_address=request.client.host if request and request.client else None,
            request=request,
        )
        reset_numbers.append(voucher.get("voucher_number"))

    return reset_numbers


@router.patch("/bills/{bill_id}")
def update_bill(bill_id: int, request: Request, payload: BillUpdate):
    """Update a bill. Only UNPAID bills may be modified (else 409).

    Editing a confirmed bill resets any linked voucher that is still in flight
    (FOR_APPROVAL / APPROVED) back to DRAFT, since the approved amounts may have
    changed and the voucher must be re-approved.
    """
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    existing = supabase.table("ap_bills").select("*").eq("bill_id", bill_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    # Header/line edits are permitted only while the bill is still a DRAFT
    # (pre-confirmation) or UNPAID (confirmed, before any payment is applied).
    # A CONFIRMED bill that has advanced past UNPAID is immutable (Req 3.2).
    is_draft = existing.data.get("lifecycle_status") == "DRAFT"
    if not (is_draft or can_modify_invoice(existing.data.get("payment_status"))):
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Bill {existing.data.get('bill_number')} is "
                         f"{existing.data.get('payment_status')} and can no longer be modified.",
            },
        )

    _validate_references(payload.supplier_id, payload.po_number)

    updates = payload.model_dump(exclude_unset=True, exclude={"items"})
    resolved_supplier_id = updates.get("supplier_id", existing.data.get("supplier_id"))
    if "supplier_id" in updates:
        resolved_currency = _currency_from_supplier_id(resolved_supplier_id)
        existing_currency = existing.data.get("currency_code") or _currency_from_supplier_id(existing.data.get("supplier_id"))
        if not is_draft and resolved_currency != existing_currency:
            raise HTTPException(
                status_code=409,
                detail="A confirmed bill cannot change currency; create a new bill for the other supplier classification.",
            )
        updates["currency_code"] = resolved_currency
    if "po_number" in updates or "supplier_id" in updates:
        source_purchase_order, entity = _require_purchase_order_for_bill(
            updates.get("po_number", existing.data.get("po_number")),
            resolved_supplier_id,
        )
        updates["po_number"] = source_purchase_order["po_number"]
        updates["source_purchase_order_id"] = source_purchase_order["purchase_order_id"]
        updates["entity"] = entity
    resolved_supplier_invoice = updates.get(
        "supplier_invoice_number",
        existing.data.get("supplier_invoice_number"),
    )
    if "supplier_id" in updates or "supplier_invoice_number" in updates:
        _reject_duplicate_supplier_invoice(
            resolved_supplier_id,
            resolved_supplier_invoice,
            exclude_bill_id=bill_id,
        )
    if "bill_date" in updates and updates["bill_date"]:
        updates["bill_date"] = updates["bill_date"].isoformat()
    if "due_date" in updates and updates["due_date"]:
        updates["due_date"] = updates["due_date"].isoformat()

    # Recompute the server-trusted source fields when the line items change.
    if payload.items is not None:
        rates = _tax_rate_map()
        updates.update(_compute_bill_totals(payload.items, rates))

    if updates:
        updates["updated_at"] = _today_iso()
        try:
            supabase.table("ap_bills").update(updates).eq("bill_id", bill_id).execute()
        except Exception as exc:
            raise db_http_error(exc)

    if payload.items is not None:
        supabase.table("ap_bill_items").delete().eq("bill_id", bill_id).execute()
        _insert_items(bill_id, payload.items, employee_id)
        _sync_php_equivalent_amounts(bill_id, existing.data.get("fx_rate_to_php"))

    # An edit invalidates any in-flight approval on linked vouchers (Req: a bill
    # change returns its voucher to DRAFT for re-approval).
    if updates or payload.items is not None:
        _reset_linked_vouchers_to_draft(bill_id, performed_by=performed_by, request=request)

    write_audit_log(
        action="UPDATE",
        module_name=MODULE_NAME,
        description=f"Updated bill {existing.data.get('bill_number')}",
        performed_by=performed_by,
        record_id=bill_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_bill(bill_id)


@router.delete("/bills/{bill_id}")
def archive_bill(bill_id: int, request: Request):
    """Archive a bill (soft delete). The record is never physically removed.

    Discarding a DRAFT bill is the "discard" action of Requirement 3.6: the
    record moves to ``record_status = ARCHIVED`` and is retained. The audit
    entry distinguishes a draft discard (action ``DISCARD``) from archiving a
    confirmed bill (action ``ARCHIVE``) and names the source ``po_number`` so the
    procurement origin is traceable (Requirement 3.7).
    """
    _, performed_by = _extract_jwt_claims(request)
    existing = (
        supabase.table("ap_bills")
        .select("bill_id, bill_number, po_number, lifecycle_status, record_status")
        .eq("bill_id", bill_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    supabase.table("ap_bills").update(
        {"record_status": "ARCHIVED", "updated_at": _today_iso()}
    ).eq("bill_id", bill_id).execute()

    is_draft = existing.data.get("lifecycle_status") == "DRAFT"
    po_number = existing.data.get("po_number")
    bill_number = existing.data.get("bill_number")
    action = "DISCARD" if is_draft else "ARCHIVE"
    verb = "Discarded draft" if is_draft else "Archived"
    description = f"{verb} bill {bill_number}"
    if po_number:
        description += f" from purchase order {po_number}"

    write_audit_log(
        action=action,
        module_name=MODULE_NAME,
        description=description,
        performed_by=performed_by,
        record_id=bill_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    _sync_po_billing_status(
        po_number,
        triggering_bill_number=bill_number,
        performed_by=performed_by,
        request=request,
    )
    return _get_bill(bill_id)


@router.post("/bills/{bill_id}/restore")
def restore_bill(bill_id: int, request: Request):
    """Restore an archived bill back to ACTIVE."""
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("ap_bills").select("bill_id, bill_number, po_number, record_status").eq("bill_id", bill_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    supabase.table("ap_bills").update(
        {"record_status": "ACTIVE", "updated_at": _today_iso()}
    ).eq("bill_id", bill_id).execute()

    write_audit_log(
        action="RESTORE",
        module_name=MODULE_NAME,
        description=f"Restored bill {existing.data.get('bill_number')}",
        performed_by=performed_by,
        record_id=bill_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    _sync_po_billing_status(
        existing.data.get("po_number"),
        triggering_bill_number=existing.data.get("bill_number"),
        performed_by=performed_by,
        request=request,
    )
    return _get_bill(bill_id)


# ── Draft bill generation from a received purchase order ──────────────────────
#
# Task 4.1: a user-triggered action that creates a DRAFT supplier bill pre-filled
# from a RECEIVED / PARTIALLY_RECEIVED purchase order. All decision logic
# (eligibility, line mapping, totals, duplicate guard) lives in the pure
# ``routers/integration_calc.py`` module; this endpoint stays thin (fetch,
# validate, persist, audit).

def _fetch_po(purchase_order_id: int) -> dict:
    """Fetch a purchase order by id, or raise 404 (Requirement 12.3)."""
    po = (
        supabase.table("purchase_orders")
        .select("*")
        .eq("purchase_order_id", purchase_order_id)
        .single()
        .execute()
    )
    if not po.data:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po.data


def _fetch_po_lines(purchase_order_id: int) -> list:
    """Fetch the purchase order's line items in a stable order."""
    return (
        supabase.table("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", purchase_order_id)
        .order("purchase_order_item_id")
        .execute()
        .data
        or []
    )


def _insert_draft_bill_items(bill_id: int, bill_lines: List[dict], employee_id) -> None:
    """Persist generated draft bill lines (dicts from ``build_bill_lines``)."""
    rows = [
        {
            "bill_id": bill_id,
            "description": line["description"],
            "vat_exclusive_amount": line["vat_exclusive_amount"],
            "vat_code": line["vat_code"],
            "created_by_employee_id": employee_id,
        }
        for line in bill_lines
    ]
    if rows:
        supabase.table("ap_bill_items").insert(rows).execute()


@router.post("/bills/draft-from-po/{purchase_order_id}", status_code=201)
def create_draft_bill_from_po(purchase_order_id: int, request: Request, payload: DraftBillFromPO):
    """Generate a DRAFT supplier bill from a sent or received purchase order.

    Flow (design "Request flow: Create Draft Bill from a Received PO"):
      * fetch PO + lines (404 when missing);
      * gate on ``po_billing_eligibility`` (409 not sent/received / not eligible);
      * validate the PO ``supplier_id`` against ``supplier_list`` (400);
      * apply the duplicate-billing guard over active bills referencing the PO
        ``po_number`` (409 existing bill / 422 override reason missing);
      * map PO lines to bill lines (422 when none are billable);
      * insert the DRAFT/ACTIVE bill + its lines with the source reference;
      * write a CREATE audit entry (plus an OVERRIDE entry when used).
    """
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    po = _fetch_po(purchase_order_id)
    po_status = po.get("status")
    po_number = po.get("po_number")

    # Eligibility gate (Requirements 1.2, 12.1).
    eligibility = po_billing_eligibility(po_status)
    if eligibility == "NOT_RECEIVED":
        raise HTTPException(
            status_code=409,
            detail={"error": f"Purchase order {po_number} has not been sent or received."},
        )
    if eligibility == "NOT_ELIGIBLE":
        raise HTTPException(
            status_code=409,
            detail={"error": f"Purchase order {po_number} is not eligible for billing."},
        )

    # Reference validation: the PO supplier must exist (Requirement 13.1).
    _validate_references(po.get("supplier_id"), None)

    # Duplicate-billing guard over active bills referencing this PO (Req 7).
    existing_bills = (
        supabase.table("ap_bills")
        .select("bill_id, bill_number, po_number, record_status")
        .eq("po_number", po_number)
        .execute()
        .data
        or []
    )
    active_refs = active_source_refs(existing_bills, "po_number")
    existing_active = next(
        (b for b in existing_bills if b.get("record_status") == "ACTIVE"), None
    )
    existing_bill_number = existing_active.get("bill_number") if existing_active else None

    decision = duplicate_decision(active_refs, payload.override, payload.override_reason)
    if not decision["allow"]:
        if decision["status"] == 409:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": f"Purchase order {po_number} is already billed by "
                             f"{existing_bill_number}. Supply an override with a reason to bill it again.",
                },
            )
        raise HTTPException(
            status_code=422,
            detail={
                "error": "An override reason is required to bill an already-billed purchase order.",
                "fields": {"override_reason": "Required when overriding the duplicate-billing guard."},
            },
        )

    # Map PO lines to bill lines; reject when nothing is billable (Req 2.8).
    po_lines = _fetch_po_lines(purchase_order_id)
    bill_lines = build_bill_lines(po_status, po_lines)
    if not bill_lines:
        raise HTTPException(
            status_code=422,
            detail={"error": f"Purchase order {po_number} has no billable lines."},
        )

    # Server-side totals reusing the configured tax rates (Req 2.6, 2.7).
    rates = _tax_rate_map()
    totals = aggregate_bill_totals(bill_lines, rates)

    bill_entity = _entity_from_purchase_order(po)
    if not bill_entity:
        raise HTTPException(
            status_code=422,
            detail="The purchase order has no owning company. Set an entity on the source purchase request before billing.",
        )
    bill_number = _next_bill_number(bill_entity)
    header_core = build_bill_header(
        po,
        bill_number,
        supplier_invoice_number=payload.supplier_invoice_number,
        due_date=payload.due_date,
    )
    header = {
        "bill_number": header_core["bill_number"],
        "supplier_id": header_core["supplier_id"],
        "currency_code": po.get("currency_code") or _currency_from_supplier_id(po.get("supplier_id")),
        "transaction_date": po.get("transaction_date"),
        "fx_rate_to_php": po.get("fx_rate_to_php"),
        "fx_rate_timestamp": po.get("fx_rate_timestamp"),
        "fx_rate_provider": po.get("fx_rate_provider"),
        "po_number": header_core["po_number"],
        "source_purchase_order_id": header_core["source_purchase_order_id"],
        "entity": bill_entity,
        "supplier_invoice_number": header_core["supplier_invoice_number"],
        "bill_date": header_core["bill_date"].isoformat(),
        "due_date": header_core["due_date"].isoformat(),
        "lifecycle_status": header_core["lifecycle_status"],
        "record_status": header_core["record_status"],
        "vat_exclusive_amount": totals["vat_exclusive_amount"],
        "vat_input": totals["vat_input"],
        "created_by_employee_id": employee_id,
    }
    try:
        res = supabase.table("ap_bills").insert(header).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create draft bill")

    bill_id = res.data[0]["bill_id"]
    _sync_php_equivalent_amounts(bill_id, po.get("fx_rate_to_php"))
    _insert_draft_bill_items(bill_id, bill_lines, employee_id)

    ip_address = request.client.host if request.client else None
    write_audit_log(
        action="CREATE",
        module_name=MODULE_NAME,
        description=f"Created draft bill {bill_number} from purchase order {po_number}",
        performed_by=performed_by,
        record_id=bill_id,
        ip_address=ip_address,
        request=request,
    )
    if decision["used_override"]:
        write_audit_log(
            action="OVERRIDE",
            module_name=MODULE_NAME,
            description=f"Override duplicate-billing guard: created draft bill {bill_number} "
                        f"for purchase order {po_number} despite existing bill {existing_bill_number}. "
                        f"Reason: {(payload.override_reason or '').strip()}",
            performed_by=performed_by,
            record_id=bill_id,
            ip_address=ip_address,
            request=request,
        )
    return _get_bill(bill_id)


# ── Draft bill confirmation ───────────────────────────────────────────────────
#
# Task 4.2: confirming a DRAFT bill commits it to the normal payable lifecycle.
# The confirmation predicate (non-empty/non-placeholder supplier_invoice_number
# and >= 1 line) lives in the pure ``integration_calc`` module; this endpoint
# stays thin (fetch, gate, persist, audit).

@router.post("/bills/{bill_id}/confirm")
def confirm_bill(bill_id: int, request: Request):
    """Confirm a DRAFT bill -> CONFIRMED, payment_status UNPAID (Req 3.4, 3.5).

    * 404 when the bill does not exist;
    * 409 when the bill is not a DRAFT (only drafts may be confirmed);
    * 422 when the draft is missing required data (empty/placeholder
      ``supplier_invoice_number`` or no bill lines), listing the blockers;
    * 200 with the confirmed bill otherwise.
    """
    _, performed_by = _extract_jwt_claims(request)

    existing = supabase.table("ap_bills").select("*").eq("bill_id", bill_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = existing.data
    bill_number = bill.get("bill_number")
    if bill.get("lifecycle_status") != "DRAFT":
        raise HTTPException(
            status_code=409,
            detail={"error": f"Bill {bill_number} is not a draft and cannot be confirmed."},
        )

    line_count = len(
        supabase.table("ap_bill_items")
        .select("item_id")
        .eq("bill_id", bill_id)
        .execute()
        .data
        or []
    )
    supplier_invoice_number = bill.get("supplier_invoice_number")

    if not can_confirm_bill(supplier_invoice_number, line_count):
        raise HTTPException(
            status_code=422,
            detail={
                "error": f"Draft bill {bill_number} is missing data required for confirmation.",
                "blockers": bill_confirmation_blockers(supplier_invoice_number, line_count),
            },
        )
    _reject_duplicate_supplier_invoice(
        bill.get("supplier_id"),
        supplier_invoice_number,
        exclude_bill_id=bill_id,
    )

    updates = {**confirmed_bill_updates(), "updated_at": _today_iso()}
    # Ensure entity is set (fallback from bill_number or PO)
    if not bill.get("entity"):
        derived_entity = _entity_from_document_number(bill_number) or _entity_from_purchase_order_number(bill.get("po_number"))
        if derived_entity:
            updates["entity"] = derived_entity
    try:
        supabase.table("ap_bills").update(updates).eq("bill_id", bill_id).execute()
    except Exception as exc:
        raise db_http_error(exc)

    write_audit_log(
        action="CONFIRM",
        module_name=MODULE_NAME,
        description=f"Confirmed bill {bill_number} from purchase order {bill.get('po_number')}",
        performed_by=performed_by,
        record_id=bill_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    _sync_po_billing_status(
        bill.get("po_number"),
        triggering_bill_number=bill_number,
        performed_by=performed_by,
        request=request,
    )

    # Philippine tax and books integrations store PHP figures. Do not post a USD
    # bill without an explicit approved FX conversion policy/rate.
    confirmed_bill = _get_bill(bill_id)
    if (confirmed_bill.get("currency_code") or "PHP") == "PHP":
        try:
            from routers.tax import generate_or_update_1600vt_for_bill
            generate_or_update_1600vt_for_bill(bill_id, confirmed_bill)
        except Exception:
            pass  # Tax form generation should not block bill confirmation

        try:
            from utils.books_integration import create_purchases_book_from_ap_bill
            create_purchases_book_from_ap_bill(confirmed_bill, performed_by)
        except Exception as exc:
            import logging
            logging.getLogger("books_integration").warning(f"Purchases Book entry failed for bill {bill_id}: {exc}")

    return _get_bill(bill_id)


# ── PO billing-status synchronization ─────────────────────────────────────────
#
# Task 4.3: a shared helper that recomputes a source purchase order's
# back-reference ``billing_status`` from its settled bills and persists it only
# when the value actually changes. All decision logic lives in the pure
# ``integration_calc`` module (``compute_po_billing_status`` derives the value,
# ``status_change`` decides whether it differs); this helper stays thin (load,
# compute, conditionally persist + audit). It is invoked after every event that
# can affect a PO's billing status: bill confirm, payment recorded (payment
# voucher paid), bill archive, and bill restore.

def _sync_po_billing_status(
    po_number,
    triggering_bill_number=None,
    *,
    performed_by=None,
    request=None,
    emit_audit=False,
) -> None:
    """Recompute and persist a purchase order's ``billing_status``.

    Loads the source PO referenced by ``po_number`` together with the
    ``CONFIRMED`` + ``ACTIVE`` bills that reference it, derives the PO billing
    status via :func:`compute_po_billing_status`, and persists the result only
    when it differs from the stored value. A STATUS_CHANGE audit is optional and
    only emitted when ``emit_audit`` is true
    (Requirements 9.2–9.7, 11.2).

    The recompute is skipped without error when:

    - ``po_number`` is missing/blank (the triggering bill has no source PO), or
    - no purchase order matches ``po_number``.
    """
    if not (isinstance(po_number, str) and po_number.strip()):
        return

    po = (
        supabase.table("purchase_orders")
        .select("purchase_order_id, po_number, status, billing_status")
        .eq("po_number", po_number)
        .limit(1)
        .execute()
        .data
    )
    if not po:
        return
    po = po[0]

    confirmed_active_bills = (
        supabase.table("ap_bills")
        .select("payment_status")
        .eq("po_number", po_number)
        .eq("lifecycle_status", CONFIRMED_LIFECYCLE_STATUS)
        .eq("record_status", "ACTIVE")
        .execute()
        .data
        or []
    )

    previous = po.get("billing_status") or "NOT_BILLED"
    computed = compute_po_billing_status(po.get("status"), confirmed_active_bills)

    # Persist only on a real change; an unchanged value is a no-op
    # (Requirement 11.2).
    if not status_change(previous, computed):
        return

    try:
        supabase.table("purchase_orders").update(
            {"billing_status": computed, "updated_at": _today_iso()}
        ).eq("purchase_order_id", po.get("purchase_order_id")).execute()
    except Exception as exc:
        raise db_http_error(exc)

    if not emit_audit:
        return

    description = (
        f"Purchase order {po_number} billing status changed "
        f"from {previous} to {computed}"
    )
    if triggering_bill_number:
        description += f" (triggered by bill {triggering_bill_number})"

    write_audit_log(
        action="STATUS_CHANGE",
        module_name=MODULE_NAME,
        description=description,
        performed_by=performed_by,
        record_id=po.get("purchase_order_id"),
        ip_address=request.client.host if request and request.client else None,
        request=request,
    )


# ── Payment voucher state machine ─────────────────────────────────────────────
#
# A voucher's lifecycle is a small explicit state machine (design.md State
# Machines / Property 12). The only legal transitions are:
#   submit:  DRAFT         -> FOR_APPROVAL
#   approve: FOR_APPROVAL  -> APPROVED   (records approver id + timestamp)
#   reject:  FOR_APPROVAL  -> REJECTED   (requires non-empty remarks)
# Any other transition is illegal and rejected with 409. While a voucher is
# FOR_APPROVAL it is immutable (Requirement 6.7).

def _sync_purchase_request_payment_status(
    po_number,
    triggering_bill_number=None,
    *,
    performed_by=None,
    request=None,
) -> None:
    """Advance the purchase request's AP summary status once PO bills settle."""
    if not (isinstance(po_number, str) and po_number.strip()):
        return

    po_rows = (
        supabase.table("purchase_orders")
        .select("purchase_order_id, purchase_request_id, po_number, status")
        .eq("po_number", po_number)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not po_rows:
        return
    po = po_rows[0]
    purchase_request_id = po.get("purchase_request_id")
    if not purchase_request_id:
        return

    bills = (
        supabase.table("ap_bills")
        .select("payment_status")
        .eq("po_number", po_number)
        .eq("lifecycle_status", CONFIRMED_LIFECYCLE_STATUS)
        .eq("record_status", "ACTIVE")
        .execute()
        .data
        or []
    )
    if not bills:
        return

    next_status = "AP_PAID" if all(row.get("payment_status") == "PAID" for row in bills) else "AP_OPEN"
    pr_rows = (
        supabase.table("purchase_requests")
        .select("status")
        .eq("purchase_request_id", purchase_request_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    previous = pr_rows[0].get("status") if pr_rows else None
    if previous == next_status:
        return

    try:
        supabase.table("purchase_requests").update({
            "status": next_status,
            "updated_at": _today_iso(),
        }).eq("purchase_request_id", purchase_request_id).execute()
    except Exception:
        return

    description = f"Purchase request for PO {po_number} AP status advanced from {previous or 'UNKNOWN'} to {next_status}"
    if triggering_bill_number:
        description += f" (triggered by bill {triggering_bill_number})"
    write_audit_log(
        action="STATUS_CHANGE",
        module_name="Purchasing",
        description=description,
        performed_by=performed_by,
        record_id=purchase_request_id,
        ip_address=request.client.host if request and request.client else None,
        request=request,
    )


VOUCHER_TRANSITIONS = {
    "submit": ("DRAFT", "FOR_APPROVAL"),
    "approve": ("FOR_APPROVAL", "APPROVED"),
    "reject": ("FOR_APPROVAL", "REJECTED"),
}


def _voucher_bill_ids(voucher_id: int) -> List[int]:
    """Return the bill ids linked to a voucher via ap_voucher_bills."""
    links = (
        supabase.table("ap_voucher_bills")
        .select("bill_id")
        .eq("voucher_id", voucher_id)
        .execute()
        .data
        or []
    )
    return [link["bill_id"] for link in links]


def _get_voucher(voucher_id: int) -> dict:
    """Fetch a single voucher with its linked bills and bill ids."""
    voucher = (
        supabase.table("ap_payment_vouchers")
        .select("*")
        .eq("voucher_id", voucher_id)
        .single()
        .execute()
    )
    if not voucher.data:
        raise HTTPException(status_code=404, detail="Payment voucher not found")

    bill_ids = _voucher_bill_ids(voucher_id)
    bills = []
    if bill_ids:
        bills = (
            supabase.table("ap_bills")
            .select("*")
            .in_("bill_id", bill_ids)
            .execute()
            .data
            or []
        )

    supplier = _supplier_map().get(voucher.data.get("supplier_id"), {})
    return {
        **voucher.data,
        "supplier_name": supplier.get("company_name"),
        "supplier": supplier,
        "bill_ids": bill_ids,
        "bills": bills,
    }


def _next_voucher_number(entity: str = None) -> str:
    """Generate the next payment voucher number in standard format: COMPANY-YYYY-PV-NNNN."""
    from utils.code_generator import generate_code
    return generate_code(entity, "PV", "ap_payment_vouchers", "voucher_number")


def _validate_supplier(supplier_id: int) -> None:
    """Reject vouchers that reference a non-existent supplier (Req 11.2)."""
    supplier = (
        supabase.table("supplier_list")
        .select("supplier_id")
        .eq("supplier_id", supplier_id)
        .limit(1)
        .execute()
    )
    if not supplier.data:
        raise HTTPException(
            status_code=400,
            detail={"error": "Supplier not found.", "fields": {"supplier_id": "No matching supplier."}},
        )


def _reject_draft_bills(bill_ids: List[int]) -> None:
    """Reject paying any DRAFT bill via a voucher or payment (Requirement 3.3).

    A DRAFT bill is not yet a payable; it must be confirmed before a payment
    voucher or payment may reference it. Raises 409 naming the offending draft.
    """
    if not bill_ids:
        return
    rows = (
        supabase.table("ap_bills")
        .select("bill_id, bill_number, lifecycle_status")
        .in_("bill_id", list(bill_ids))
        .execute()
        .data
        or []
    )
    draft = next((r for r in rows if r.get("lifecycle_status") == "DRAFT"), None)
    if draft is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Bill {draft.get('bill_number')} is a draft and must be "
                         f"confirmed before it can be paid.",
            },
        )


def _active_voucher_links_for_bills(
    bill_ids: List[int],
    *,
    exclude_voucher_id: Optional[int] = None,
) -> dict:
    if not bill_ids:
        return {}

    links = (
        supabase.table("ap_voucher_bills")
        .select("voucher_id, bill_id")
        .in_("bill_id", list(bill_ids))
        .execute()
        .data
        or []
    )
    voucher_ids = list({
        link["voucher_id"]
        for link in links
        if link.get("voucher_id") != exclude_voucher_id
    })
    if not voucher_ids:
        return {}

    vouchers = (
        supabase.table("ap_payment_vouchers")
        .select("voucher_id, voucher_number, status, record_status")
        .in_("voucher_id", voucher_ids)
        .execute()
        .data
        or []
    )
    live_vouchers = {
        row["voucher_id"]: row
        for row in vouchers
        if row.get("record_status") == "ACTIVE" and row.get("status") != "REJECTED"
    }
    result: dict = {}
    for link in links:
        voucher = live_vouchers.get(link.get("voucher_id"))
        if voucher:
            result[link["bill_id"]] = voucher
    return result


def _reject_bills_with_live_vouchers(bill_ids: List[int]) -> None:
    """Reject voucher creation when a bill already has a live voucher."""
    conflicts = _active_voucher_links_for_bills(bill_ids)
    if not conflicts:
        return

    bill_id, voucher = next(iter(conflicts.items()))
    bill = (
        supabase.table("ap_bills")
        .select("bill_number")
        .eq("bill_id", bill_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    bill_number = bill[0].get("bill_number") if bill else f"#{bill_id}"
    raise HTTPException(
        status_code=409,
        detail={
            "error": (
                f"Bill {bill_number} is already linked to active voucher "
                f"{voucher.get('voucher_number')}."
            ),
            "fields": {"bill_ids": "Remove bills that already have an active voucher."},
        },
    )


def _apply_voucher_transition(voucher_id: int, action: str, request: Request, *, updates: Optional[dict] = None) -> dict:
    """Apply a legal voucher status transition and emit a STATUS_CHANGE audit.

    ``action`` is one of ``"submit"``, ``"approve"``, or ``"reject"``. The
    transition is rejected with 409 when the voucher is not in the required
    source status (illegal transition / immutable FOR_APPROVAL handling).
    """
    _, performed_by = _extract_jwt_claims(request)
    existing = (
        supabase.table("ap_payment_vouchers")
        .select("voucher_id, voucher_number, status")
        .eq("voucher_id", voucher_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Payment voucher not found")

    source, target = VOUCHER_TRANSITIONS[action]
    current = existing.data.get("status")
    if current != source:
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Voucher {existing.data.get('voucher_number')} is "
                         f"{current}; cannot {action} (requires {source}).",
            },
        )

    payload = {"status": target, "updated_at": _today_iso()}
    if updates:
        payload.update(updates)
    try:
        supabase.table("ap_payment_vouchers").update(payload).eq("voucher_id", voucher_id).execute()
    except Exception as exc:
        raise db_http_error(exc)

    write_audit_log(
        action="STATUS_CHANGE",
        module_name=MODULE_NAME,
        description=f"Voucher {existing.data.get('voucher_number')} status changed "
                    f"from {source} to {target}",
        performed_by=performed_by,
        record_id=voucher_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_voucher(voucher_id)


# ── Payment voucher endpoints ─────────────────────────────────────────────────

@router.get("/vouchers")
def list_vouchers(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    include_archived: bool = Query(False),
):
    """List payment vouchers. Active vouchers only by default; includes bill ids."""
    req = supabase.table("ap_payment_vouchers").select("*").order("created_at", desc=True)
    if not include_archived:
        req = req.eq("record_status", "ACTIVE")
    if status and status != "All":
        req = req.eq("status", status)
    if search:
        req = req.ilike("voucher_number", f"%{search}%")
    rows = _filter_vouchers_by_company(req.execute().data or [], company)

    suppliers = _supplier_map()
    return [
        {
            **row,
            "supplier_name": suppliers.get(row.get("supplier_id"), {}).get("company_name"),
            "bill_ids": _voucher_bill_ids(row["voucher_id"]),
        }
        for row in rows
    ]


@router.get("/vouchers/{voucher_id}")
def get_voucher(voucher_id: int):
    """Get a single payment voucher with its linked bills."""
    return _get_voucher(voucher_id)


@router.post("/vouchers", status_code=201)
def create_voucher(request: Request, payload: VoucherCreate):
    """Create a voucher: PV-YYYYMM-NNN, status DRAFT, record_status ACTIVE.

    Requires a supplier, a payment date, and at least one bill reference
    (Requirements 6.1, 6.2, 6.3). Bill links are persisted to ap_voucher_bills.
    """
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    if not payload.bill_ids:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "At least one bill reference is required.",
                "fields": {"bill_ids": "Select at least one bill."},
            },
        )

    _validate_supplier(payload.supplier_id)

    # A DRAFT bill is not yet a payable and may not be paid via a voucher until
    # it is confirmed (Requirement 3.3).
    _reject_draft_bills(payload.bill_ids)
    _reject_bills_with_live_vouchers(payload.bill_ids)

    bill_rows = (
        supabase.table("ap_bills")
        .select("bill_id, supplier_id, currency_code")
        .in_("bill_id", payload.bill_ids)
        .execute()
        .data
        or []
    )
    bill_currencies = {row.get("currency_code") or _currency_from_supplier_id(row.get("supplier_id")) for row in bill_rows}
    if len(bill_currencies) > 1:
        raise HTTPException(
            status_code=422,
            detail="A payment voucher can only contain bills in one currency.",
        )
    currency_code = next(iter(bill_currencies), _currency_from_supplier_id(payload.supplier_id))

    voucher_number = _next_voucher_number(_entity_from_bill_ids(payload.bill_ids))
    header = {
        "voucher_number": voucher_number,
        "supplier_id": payload.supplier_id,
        "currency_code": currency_code,
        "payment_date": payload.payment_date.isoformat(),
        "status": "DRAFT",
        "record_status": "ACTIVE",
        "created_by_employee_id": employee_id,
    }
    try:
        res = supabase.table("ap_payment_vouchers").insert(header).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create payment voucher")

    voucher_id = res.data[0]["voucher_id"]

    links = [{"voucher_id": voucher_id, "bill_id": bill_id} for bill_id in payload.bill_ids]
    if links:
        supabase.table("ap_voucher_bills").insert(links).execute()

    write_audit_log(
        action="CREATE",
        module_name=MODULE_NAME,
        description=f"Created payment voucher {voucher_number}",
        performed_by=performed_by,
        record_id=voucher_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_voucher(voucher_id)


@router.post("/vouchers/{voucher_id}/submit")
def submit_voucher(voucher_id: int, request: Request):
    """Submit a voucher for approval: DRAFT -> FOR_APPROVAL (Req 6.4)."""
    return _apply_voucher_transition(voucher_id, "submit", request)


@router.post("/vouchers/{voucher_id}/approve")
def approve_voucher(voucher_id: int, request: Request):
    """Approve a voucher: FOR_APPROVAL -> APPROVED, record approver + timestamp (Req 6.5)."""
    _, performed_by = _extract_jwt_claims(request)
    approver_employee_id = _employee_id_for_email(performed_by)
    return _apply_voucher_transition(
        voucher_id,
        "approve",
        request,
        updates={
            "approver_employee_id": approver_employee_id,
            "approved_at": _today_iso(),
        },
    )


@router.post("/vouchers/{voucher_id}/reject")
def reject_voucher(voucher_id: int, request: Request, payload: VoucherReject):
    """Reject a voucher: FOR_APPROVAL -> REJECTED with mandatory remarks (Req 6.6)."""
    if not payload.rejection_remarks or not payload.rejection_remarks.strip():
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Rejection remarks are required.",
                "fields": {"rejection_remarks": "Required."},
            },
        )
    return _apply_voucher_transition(
        voucher_id,
        "reject",
        request,
        updates={"rejection_remarks": payload.rejection_remarks.strip()},
    )


@router.delete("/vouchers/{voucher_id}")
def archive_voucher(voucher_id: int, request: Request):
    """Archive a voucher (soft delete). Blocked while FOR_APPROVAL (Req 6.7)."""
    _, performed_by = _extract_jwt_claims(request)
    existing = (
        supabase.table("ap_payment_vouchers")
        .select("voucher_id, voucher_number, status, record_status")
        .eq("voucher_id", voucher_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Payment voucher not found")

    if existing.data.get("status") == "FOR_APPROVAL":
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Voucher {existing.data.get('voucher_number')} is pending "
                         f"approval and cannot be modified.",
            },
        )

    supabase.table("ap_payment_vouchers").update(
        {"record_status": "ARCHIVED", "updated_at": _today_iso()}
    ).eq("voucher_id", voucher_id).execute()

    write_audit_log(
        action="ARCHIVE",
        module_name=MODULE_NAME,
        description=f"Archived payment voucher {existing.data.get('voucher_number')}",
        performed_by=performed_by,
        record_id=voucher_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_voucher(voucher_id)


@router.post("/vouchers/{voucher_id}/restore")
def restore_voucher(voucher_id: int, request: Request):
    """Restore an archived voucher back to ACTIVE."""
    _, performed_by = _extract_jwt_claims(request)
    existing = (
        supabase.table("ap_payment_vouchers")
        .select("voucher_id, voucher_number, record_status")
        .eq("voucher_id", voucher_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Payment voucher not found")

    supabase.table("ap_payment_vouchers").update(
        {"record_status": "ACTIVE", "updated_at": _today_iso()}
    ).eq("voucher_id", voucher_id).execute()

    write_audit_log(
        action="RESTORE",
        module_name=MODULE_NAME,
        description=f"Restored payment voucher {existing.data.get('voucher_number')}",
        performed_by=performed_by,
        record_id=voucher_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_voucher(voucher_id)


# ── Payments against approved vouchers ────────────────────────────────────────
#
# Recording an actual payment is permitted only when its voucher is APPROVED
# (Requirements 6.8, design Property 12/13). Each payment is applied to one of
# the voucher's linked bills. After insertion, the bill's outstanding AP balance
# is recomputed as net_payable - sum(payments for that bill) using the pure
# ``ap_balance`` helper, and the bill's payment_status is derived as
# PAID (balance == 0) / PARTIALLY_PAID (payments made, balance > 0) /
# UNPAID (no payments) (Requirements 6.9, 6.10).


def _bill_payments_total(bill_id: int) -> float:
    """Sum the amounts of all payments recorded against a bill."""
    rows = (
        supabase.table("ap_payments")
        .select("payment_amount")
        .eq("bill_id", bill_id)
        .execute()
        .data
        or []
    )
    return round(sum(_num(row["payment_amount"]) for row in rows), 2)


def _derive_bill_payment_status(net_payable_amount: float, payments_total: float) -> str:
    """Derive a bill's payment status from its net payable and payments made.

    PAID when the AP balance is zero (or non-positive after rounding),
    PARTIALLY_PAID when payments exist but a positive balance remains, and
    UNPAID when no payments have been recorded (Requirements 6.9, 6.10).
    """
    balance = ap_balance(net_payable_amount, payments_total)
    if balance <= 0:
        return "PAID"
    if round(payments_total, 2) > 0:
        return "PARTIALLY_PAID"
    return "UNPAID"


def _recompute_bill_payment_status(bill_id: int) -> dict:
    """Recompute and persist a bill's payment_status + AP balance from payments.

    AP balance = net_payable - sum(payments for the bill). Returns the bill
    header augmented with the derived ``ap_balance``.
    """
    bill = (
        supabase.table("ap_bills")
        .select("*")
        .eq("bill_id", bill_id)
        .single()
        .execute()
    )
    if not bill.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    net_payable_amount = _num(bill.data.get("net_payable"))
    payments_total = _bill_payments_total(bill_id)
    status = _derive_bill_payment_status(net_payable_amount, payments_total)
    balance = ap_balance(net_payable_amount, payments_total)

    supabase.table("ap_bills").update(
        {"payment_status": status, "updated_at": _today_iso()}
    ).eq("bill_id", bill_id).execute()

    return {**bill.data, "payment_status": status, "ap_balance": balance}


@router.get("/vouchers/{voucher_id}/payments")
def list_voucher_payments(voucher_id: int):
    """List the payments recorded against a voucher, most recent first."""
    _get_voucher(voucher_id)  # 404 if the voucher does not exist
    return (
        supabase.table("ap_payments")
        .select("*")
        .eq("voucher_id", voucher_id)
        .order("payment_date", desc=True)
        .execute()
        .data
        or []
    )


@router.post("/vouchers/{voucher_id}/payments", status_code=201)
def record_payment(voucher_id: int, request: Request, payload: PaymentCreate):
    """Record a payment against an APPROVED voucher's linked bill.

    Permitted only when the voucher status is APPROVED (else 409). The target
    bill must be one of the voucher's linked bills (else 400). Over-payment
    beyond the bill's remaining AP balance is rejected (400). On success, the
    payment is inserted, the bill's payment_status + AP balance are recomputed,
    and a PAYMENT audit entry is emitted (Requirements 6.8, 6.9, 6.10, 19.11).
    """
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    voucher = (
        supabase.table("ap_payment_vouchers")
        .select("voucher_id, voucher_number, status, currency_code")
        .eq("voucher_id", voucher_id)
        .single()
        .execute()
    )
    if not voucher.data:
        raise HTTPException(status_code=404, detail="Payment voucher not found")

    if voucher.data.get("status") != "APPROVED":
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Voucher {voucher.data.get('voucher_number')} is "
                         f"{voucher.data.get('status')}; payments may only be recorded "
                         f"against an APPROVED voucher.",
            },
        )

    # The bill must be one of the bills this voucher authorizes payment for.
    if payload.bill_id not in _voucher_bill_ids(voucher_id):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Bill is not linked to this voucher.",
                "fields": {"bill_id": "Select a bill referenced by the voucher."},
            },
        )

    amount = _num(payload.payment_amount)
    if amount <= 0:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Payment amount must be greater than zero.",
                "fields": {"payment_amount": "Must be positive."},
            },
        )

    bill = (
        supabase.table("ap_bills")
        .select("bill_id, bill_number, net_payable, lifecycle_status, currency_code")
        .eq("bill_id", payload.bill_id)
        .single()
        .execute()
    )
    if not bill.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill_currency = bill.data.get("currency_code") or _currency_from_supplier_id(None)
    voucher_currency = voucher.data.get("currency_code") or "PHP"
    if bill_currency != voucher_currency:
        raise HTTPException(
            status_code=409,
            detail="Payment currency does not match the bill currency.",
        )

    # A DRAFT bill is not a payable and may not receive a payment (Req 3.3).
    if bill.data.get("lifecycle_status") == "DRAFT":
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Bill {bill.data.get('bill_number')} is a draft and must be "
                         f"confirmed before it can be paid.",
            },
        )

    # Reject over-payment beyond the bill's current remaining AP balance.
    net_payable_amount = _num(bill.data.get("net_payable"))
    remaining = ap_balance(net_payable_amount, _bill_payments_total(payload.bill_id))
    if amount > remaining:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Payment of {amount} exceeds the remaining balance of "
                         f"{remaining} for bill {bill.data.get('bill_number')}.",
                "fields": {"payment_amount": "Exceeds the outstanding balance."},
            },
        )

    record = {
        "voucher_id": voucher_id,
        "bill_id": payload.bill_id,
        "currency_code": bill_currency,
        "payment_amount": amount,
        "payment_date": payload.payment_date.isoformat(),
        "payment_method": payload.payment_method,
        "created_by_employee_id": employee_id,
    }
    if payload.payment_file_name and payload.payment_file_name.strip():
        file_type = (payload.payment_file_type or "").upper()
        if file_type not in ATTACHMENT_FILE_TYPES:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": f"Unsupported payment file type '{payload.payment_file_type}'. "
                             f"Allowed: {', '.join(ATTACHMENT_FILE_TYPES)}.",
                    "fields": {"payment_file_type": "Must be PDF, JPG, PNG, or XLSX."},
                },
            )
        record.update({
            "payment_file_name": payload.payment_file_name.strip(),
            "payment_file_ref": (payload.payment_file_ref or payload.payment_file_name).strip(),
            "payment_file_type": file_type,
        })
    try:
        res = supabase.table("ap_payments").insert(record).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to record payment")

    payment = res.data[0]
    updated_bill = _recompute_bill_payment_status(payload.bill_id)

    write_audit_log(
        action="PAYMENT",
        module_name=MODULE_NAME,
        description=f"Recorded payment of {amount} against bill "
                    f"{bill.data.get('bill_number')} via voucher "
                    f"{voucher.data.get('voucher_number')}",
        performed_by=performed_by,
        record_id=payment["payment_id"],
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    _sync_po_billing_status(
        updated_bill.get("po_number"),
        triggering_bill_number=updated_bill.get("bill_number"),
        performed_by=performed_by,
        request=request,
    )
    _sync_purchase_request_payment_status(
        updated_bill.get("po_number"),
        triggering_bill_number=updated_bill.get("bill_number"),
        performed_by=performed_by,
        request=request,
    )

    # Auto-create Cash Disbursements Book entry for BIR books
    try:
        from utils.books_integration import create_cash_disbursement_from_ap_payment
        create_cash_disbursement_from_ap_payment(payment, bill.data, voucher.data, performed_by)
    except Exception as exc:
        import logging
        logging.getLogger("books_integration").warning(f"Cash Disbursements entry failed: {exc}")

    # Auto-generate BIR 2307 and 0619-E for EWT on this payment
    try:
        from routers.tax import generate_2307_for_payment, generate_0619e_for_payment
        # Fetch full bill details needed for tax calculation
        full_bill = (
            supabase.table("ap_bills")
            .select("bill_id, bill_number, entity, supplier_id, ewt_material, net_payable, vat_exclusive_amount, bill_date")
            .eq("bill_id", payload.bill_id)
            .single()
            .execute()
        ).data
        if full_bill and _num(full_bill.get("ewt_material")) > 0:
            generate_2307_for_payment(payment["payment_id"], payment, full_bill)
            generate_0619e_for_payment(payment["payment_id"], payment, full_bill)
    except Exception as exc:
        import logging
        logging.getLogger("tax_2307").warning(f"EWT form generation failed for payment {payment.get('payment_id')}: {exc}")

    return {
        **payment,
        "bill_payment_status": updated_bill.get("payment_status"),
        "bill_ap_balance": updated_bill.get("ap_balance"),
    }


# ── Check monitoring ──────────────────────────────────────────────────────────
#
# Each check is issued against a Payment_Voucher and tracked through a one-way
# terminal-state machine (design.md State Machines / Property 15):
#   clear:  ISSUED -> CLEARED   (records a clearing date >= check_date, <= today)
#   bounce: ISSUED -> BOUNCED   (reverses the related payment effect on the bill)
#   cancel: ISSUED -> CANCELLED
# Once a check reaches CLEARED, BOUNCED, or CANCELLED it is terminal; any further
# status change is rejected with 409 (Requirements 17.5, 17.7, 17.8). All gating
# is delegated to the pure ``can_transition_check`` / ``is_valid_clearing_date``
# helpers and the ``CHECK_TERMINAL_STATUSES`` set in ``routers/ar_ap_calc.py``.

# Maximum allowed check amount (Requirement 17.1).
CHECK_AMOUNT_MIN = 0.01
CHECK_AMOUNT_MAX = 999999999.99


def _voucher_supplier_id(voucher_id: int):
    """Return the supplier id of a voucher, or None if the voucher is missing."""
    res = (
        supabase.table("ap_payment_vouchers")
        .select("supplier_id")
        .eq("voucher_id", voucher_id)
        .limit(1)
        .execute()
    )
    return res.data[0]["supplier_id"] if res.data else None


def _get_check(check_id: int) -> dict:
    """Fetch a single check augmented with its voucher number and supplier name."""
    check = (
        supabase.table("ap_checks")
        .select("*")
        .eq("check_id", check_id)
        .single()
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Check not found")

    voucher = (
        supabase.table("ap_payment_vouchers")
        .select("voucher_id, voucher_number, supplier_id")
        .eq("voucher_id", check.data.get("voucher_id"))
        .limit(1)
        .execute()
        .data
    )
    voucher = voucher[0] if voucher else {}
    supplier = _supplier_map().get(voucher.get("supplier_id"), {})
    return {
        **check.data,
        "voucher_number": voucher.get("voucher_number"),
        "supplier_id": voucher.get("supplier_id"),
        "supplier_name": supplier.get("company_name"),
    }


def _validate_check_voucher(voucher_id: int) -> None:
    """Reject checks that reference a non-existent payment voucher (Req 17.3)."""
    res = (
        supabase.table("ap_payment_vouchers")
        .select("voucher_id")
        .eq("voucher_id", voucher_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Payment voucher not found.",
                "fields": {"voucher_id": "No matching payment voucher."},
            },
        )


def _validate_check_fields(payload: CheckCreate) -> None:
    """Validate check field presence and amount range (Requirements 17.1, 17.2).

    A submission is rejected with an error and *no* record is created when the
    check number is not 1–50 characters, the bank is missing, or the check
    amount falls outside [0.01, 999,999,999.99]. The check date is required by
    the request schema. Validation runs before any persistence so an invalid
    submission can never produce a check row (Property 14).
    """
    fields: dict = {}
    check_number = (payload.check_number or "").strip()
    if not (1 <= len(check_number) <= 50):
        fields["check_number"] = "Check Number must be 1 to 50 characters."
    if not (payload.bank or "").strip():
        fields["bank"] = "Bank is required."
    amount = _num(payload.check_amount)
    if not (CHECK_AMOUNT_MIN <= amount <= CHECK_AMOUNT_MAX):
        fields["check_amount"] = (
            f"Check Amount must be between {CHECK_AMOUNT_MIN} and {CHECK_AMOUNT_MAX}."
        )
    if fields:
        raise HTTPException(
            status_code=422,
            detail={"error": "Invalid check submission.", "fields": fields},
        )


def _reverse_check_payment(check: dict) -> List[dict]:
    """Reverse the payment effect of a bounced check and recompute its bill(s).

    A check is issued against a Payment_Voucher whose linked bills may carry
    recorded payments. When the check bounces, its corresponding payment is
    reversed: the payment recorded against one of the voucher's bills whose
    amount matches the check amount is removed, and that bill's payment_status
    and AP balance are recomputed *without* it — restoring them to the values
    computed before the payment (Property 13). The check keeps its voucher
    reference (Requirement 17.6). When no exact payment match is found, every
    bill linked to the voucher is recomputed so the related bill payment status
    still reflects the unpaid balance (Requirement 17.11).
    """
    voucher_id = check.get("voucher_id")
    amount = round(_num(check.get("check_amount")), 2)

    payments = (
        supabase.table("ap_payments")
        .select("*")
        .eq("voucher_id", voucher_id)
        .execute()
        .data
        or []
    )
    match = next(
        (p for p in payments if round(_num(p.get("payment_amount")), 2) == amount),
        None,
    )

    affected_bill_ids = set()
    if match:
        supabase.table("ap_payments").delete().eq("payment_id", match["payment_id"]).execute()
        affected_bill_ids.add(match["bill_id"])
    else:
        affected_bill_ids.update(_voucher_bill_ids(voucher_id))

    return [_recompute_bill_payment_status(bill_id) for bill_id in affected_bill_ids]


def _apply_check_transition(
    check_id: int,
    target: str,
    request: Request,
    *,
    updates: Optional[dict] = None,
) -> dict:
    """Apply a legal check status transition and emit a CHECK_STATUS audit.

    The transition is gated by ``can_transition_check``: only ISSUED -> CLEARED
    / BOUNCED / CANCELLED is permitted. Any attempt to change the status of a
    check already in a terminal state (CLEARED / BOUNCED / CANCELLED) is rejected
    with 409 (Requirements 17.5, 17.7, 17.8).
    """
    _, performed_by = _extract_jwt_claims(request)
    existing = (
        supabase.table("ap_checks")
        .select("check_id, check_number, check_status, voucher_id, check_date, check_amount")
        .eq("check_id", check_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Check not found")

    current = existing.data.get("check_status")
    if not can_transition_check(current, target):
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Check {existing.data.get('check_number')} is {current}; "
                         f"cannot transition to {target}."
                         + (
                             " The check is already in a terminal state."
                             if current in CHECK_TERMINAL_STATUSES
                             else ""
                         ),
            },
        )

    payload = {"check_status": target, "updated_at": _today_iso()}
    if updates:
        payload.update(updates)
    try:
        supabase.table("ap_checks").update(payload).eq("check_id", check_id).execute()
    except Exception as exc:
        raise db_http_error(exc)

    write_audit_log(
        action="CHECK_STATUS",
        module_name=MODULE_NAME,
        description=f"Check {existing.data.get('check_number')} status changed "
                    f"from {current} to {target}",
        performed_by=performed_by,
        record_id=check_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return existing.data


# ── Check endpoints ───────────────────────────────────────────────────────────

@router.get("/checks")
def list_checks(
    status: Optional[str] = Query(None),
    supplier: Optional[int] = Query(None),
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    include_archived: bool = Query(False),
):
    """List checks with status, supplier, and inclusive check-date range filters.

    Active checks only by default. Supplier filtering resolves through the
    check's Payment_Voucher (Requirements 17.9, 17.10).
    """
    req = supabase.table("ap_checks").select("*").order("check_date", desc=True)
    if not include_archived:
        req = req.eq("record_status", "ACTIVE")
    if status and status != "All":
        req = req.eq("check_status", status)
    if from_:
        req = req.gte("check_date", from_.isoformat())
    if to:
        req = req.lte("check_date", to.isoformat())

    if supplier is not None:
        voucher_ids = [
            row["voucher_id"]
            for row in (
                supabase.table("ap_payment_vouchers")
                .select("voucher_id")
                .eq("supplier_id", supplier)
                .execute()
                .data
                or []
            )
        ]
        if not voucher_ids:
            return []
        req = req.in_("voucher_id", voucher_ids)

    rows = req.execute().data or []

    # Resolve voucher number + supplier name for the rows in the result set.
    voucher_ids = list({row["voucher_id"] for row in rows})
    vouchers = {}
    if voucher_ids:
        vouchers = {
            v["voucher_id"]: v
            for v in (
                supabase.table("ap_payment_vouchers")
                .select("voucher_id, voucher_number, supplier_id")
                .in_("voucher_id", voucher_ids)
                .execute()
                .data
                or []
            )
        }
    suppliers = _supplier_map()
    result = []
    for row in rows:
        voucher = vouchers.get(row["voucher_id"], {})
        supplier_info = suppliers.get(voucher.get("supplier_id"), {})
        result.append({
            **row,
            "voucher_number": voucher.get("voucher_number"),
            "supplier_id": voucher.get("supplier_id"),
            "supplier_name": supplier_info.get("company_name"),
        })
    return result


@router.get("/checks/{check_id}")
def get_check(check_id: int):
    """Get a single check with its voucher number and supplier name."""
    return _get_check(check_id)


@router.post("/checks", status_code=201)
def create_check(request: Request, payload: CheckCreate):
    """Record a check against a Payment_Voucher.

    Validates the check number (1–50 chars), bank, and amount range *before*
    persisting; an invalid submission is rejected and no record is created
    (Requirements 17.1, 17.2, Property 14). The check is associated with the
    related voucher (Req 17.3) and initialized to check_status ISSUED with
    record_status ACTIVE (Requirements 17.4, 18.10).
    """
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    _validate_check_fields(payload)
    _validate_check_voucher(payload.voucher_id)
    voucher_row = (
        supabase.table("ap_payment_vouchers")
        .select("currency_code")
        .eq("voucher_id", payload.voucher_id)
        .single()
        .execute()
    )
    currency_code = (voucher_row.data or {}).get("currency_code") or "PHP"

    record = {
        "voucher_id": payload.voucher_id,
        "check_number": payload.check_number.strip(),
        "check_date": payload.check_date.isoformat(),
        "currency_code": currency_code,
        "bank": payload.bank.strip(),
        "check_amount": round(_num(payload.check_amount), 2),
        "check_status": "ISSUED",
        "record_status": "ACTIVE",
        "created_by_employee_id": employee_id,
    }
    try:
        res = supabase.table("ap_checks").insert(record).execute()
    except Exception as exc:
        raise db_http_error(exc)
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to record check")

    check_id = res.data[0]["check_id"]
    write_audit_log(
        action="CREATE",
        module_name=MODULE_NAME,
        description=f"Created check {record['check_number']} for voucher "
                    f"{payload.voucher_id}",
        performed_by=performed_by,
        record_id=check_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_check(check_id)


@router.post("/checks/{check_id}/clear")
def clear_check(check_id: int, request: Request, payload: CheckClear):
    """Clear a check: ISSUED -> CLEARED, recording a valid clearing date.

    The clearing date must be on or after the check date and on or before today
    (Requirement 17.5); an invalid clearing date is rejected with 400. The
    transition itself is gated by the one-way check state machine.
    """
    existing = (
        supabase.table("ap_checks")
        .select("check_id, check_date, check_status, check_number")
        .eq("check_id", check_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Check not found")

    check_date = date.fromisoformat(existing.data["check_date"])
    today = date.today()
    if not is_valid_clearing_date(payload.clearing_date, check_date, today):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Clearing date must be on or after the check date and "
                         "on or before today.",
                "fields": {"clearing_date": "Invalid clearing date."},
            },
        )

    _apply_check_transition(
        check_id,
        "CLEARED",
        request,
        updates={"clearing_date": payload.clearing_date.isoformat()},
    )
    return _get_check(check_id)


@router.post("/checks/{check_id}/bounce")
def bounce_check(check_id: int, request: Request):
    """Bounce a check: ISSUED -> BOUNCED, reversing the related payment effect.

    The check retains its Payment_Voucher reference (Req 17.6). The payment the
    check represents is reversed and the related bill's payment status is
    reverted to reflect the unpaid balance (Requirements 17.11, Property 13).
    """
    _apply_check_transition(check_id, "BOUNCED", request)
    check = _get_check(check_id)
    reverted = _reverse_check_payment(check)
    return {
        **check,
        "reverted_bills": [
            {
                "bill_id": bill.get("bill_id"),
                "payment_status": bill.get("payment_status"),
                "ap_balance": bill.get("ap_balance"),
            }
            for bill in reverted
        ],
    }


@router.post("/checks/{check_id}/cancel")
def cancel_check(check_id: int, request: Request):
    """Cancel a check: ISSUED -> CANCELLED (Requirement 17.7)."""
    _apply_check_transition(check_id, "CANCELLED", request)
    return _get_check(check_id)


@router.delete("/checks/{check_id}")
def archive_check(check_id: int, request: Request):
    """Archive a check (soft delete). The record is never physically removed."""
    _, performed_by = _extract_jwt_claims(request)
    existing = (
        supabase.table("ap_checks")
        .select("check_id, check_number, record_status")
        .eq("check_id", check_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Check not found")

    supabase.table("ap_checks").update(
        {"record_status": "ARCHIVED", "updated_at": _today_iso()}
    ).eq("check_id", check_id).execute()

    write_audit_log(
        action="ARCHIVE",
        module_name=MODULE_NAME,
        description=f"Archived check {existing.data.get('check_number')}",
        performed_by=performed_by,
        record_id=check_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_check(check_id)


@router.post("/checks/{check_id}/restore")
def restore_check(check_id: int, request: Request):
    """Restore an archived check back to ACTIVE."""
    _, performed_by = _extract_jwt_claims(request)
    existing = (
        supabase.table("ap_checks")
        .select("check_id, check_number, record_status")
        .eq("check_id", check_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Check not found")

    supabase.table("ap_checks").update(
        {"record_status": "ACTIVE", "updated_at": _today_iso()}
    ).eq("check_id", check_id).execute()

    write_audit_log(
        action="RESTORE",
        module_name=MODULE_NAME,
        description=f"Restored check {existing.data.get('check_number')}",
        performed_by=performed_by,
        record_id=check_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_check(check_id)


# ── Reports ───────────────────────────────────────────────────────────────────
#
# All AP reports operate on ACTIVE records only. Outstanding payables are bills
# that still carry a balance (UNPAID / PARTIALLY_PAID); fully settled PAID bills
# are excluded from aging, payment-schedule and supplier-balance views. The
# per-bill outstanding balance is the pure ``ap_balance`` (net_payable minus the
# sum of payments recorded against the bill); per-bucket aging totals reuse the
# shared ``aging_totals`` helper (design.md routers/ap.py Reports, Properties
# 21-23).

# Bills that still carry an outstanding balance and therefore age / fall due.
AP_OUTSTANDING_STATUSES = ("UNPAID", "PARTIALLY_PAID")


def _as_date(value) -> Optional[date]:
    """Coerce a supabase date value (ISO string or date) into a ``date``."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _outstanding_bills(supplier: Optional[int], company: Optional[str] = None) -> list:
    """Fetch ACTIVE, CONFIRMED bills with an outstanding balance.

    DRAFT bills are excluded from every payables roll-up (aging, payment
    schedule, dashboard) until they are confirmed (Requirement 3.1).
    """
    req = (
        supabase.table("ap_bills")
        .select("*")
        .eq("record_status", "ACTIVE")
        .eq("lifecycle_status", CONFIRMED_LIFECYCLE_STATUS)
        .in_("payment_status", list(AP_OUTSTANDING_STATUSES))
    )
    if supplier is not None:
        req = req.eq("supplier_id", supplier)
    return _filter_bills_by_company(execute_with_retry(req).data or [], company)


def _payments_total_by_bill(bill_ids: List[int]) -> dict:
    """Return {bill_id: sum of payment amounts} for the given bill ids."""
    totals: dict = {}
    if not bill_ids:
        return totals
    rows = execute_with_retry(
        supabase.table("ap_payments")
        .select("bill_id, payment_amount")
        .in_("bill_id", list(bill_ids))
    ).data or []
    for row in rows:
        bill_id = row["bill_id"]
        totals[bill_id] = round(totals.get(bill_id, 0.0) + _num(row["payment_amount"]), 2)
    return totals


def _payments_total_by_bill_as_of(bill_ids: List[int], as_of: date) -> dict:
    """Return {bill_id: sum of payment amounts} posted on or before as_of."""
    totals: dict = {}
    if not bill_ids:
        return totals
    rows = execute_with_retry(
        supabase.table("ap_payments")
        .select("bill_id, payment_amount, payment_date")
        .in_("bill_id", list(bill_ids))
        .lte("payment_date", as_of.isoformat())
    ).data or []
    for row in rows:
        bill_id = row["bill_id"]
        totals[bill_id] = round(totals.get(bill_id, 0.0) + _num(row["payment_amount"]), 2)
    return totals


def _simple_pdf(title: str, lines: List[str]) -> bytes:
    """Build a minimal, dependency-free single-page PDF (Helvetica) from text.

    Produces a valid PDF 1.4 document so a report can be downloaded without
    requiring a heavy PDF library. Non-latin glyphs (e.g. ₱) are replaced. This
    mirrors the AR statement exporter (routers/ar.py).
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


def _csv_response(filename: str, header: List[str], rows: List[List]) -> Response:
    """Build a CSV download response.

    NOTE: A true ``.xlsx`` binary requires an Excel library that is not a
    dependency of this backend. The payment-schedule Excel export therefore
    falls back to CSV (``text/csv``), which Excel opens natively. The structured
    JSON payload remains available from the same endpoint without ``export``.
    """
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/aging")
def ap_aging_report(
    supplier: Optional[int] = Query(None),
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    bucket: Optional[str] = Query(None),
    as_of: Optional[date] = Query(None),
    company: Optional[str] = Query(None),
):
    """AP aging report (Requirement 7).

    Classifies each outstanding (UNPAID / PARTIALLY_PAID) ACTIVE bill into an
    aging bucket from its due date relative to today, lists per-bill detail
    (supplier name, bill number, bill date, due date, gross amount, outstanding
    balance), and reports the outstanding payable summed per bucket. Supports
    supplier, bill-date range, and aging-bucket filters — every returned row
    satisfies all applied filters, and the per-bucket totals equal the sum of
    the listed rows (Requirements 7.1-7.9, Properties 21, 22).
    """
    report_date = as_of or date.today()
    if bucket is not None and bucket not in AGING_BUCKETS:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Invalid aging bucket '{bucket}'.", "valid": list(AGING_BUCKETS)},
        )

    if as_of is None:
        bills = _outstanding_bills(supplier, company)
        payments = _payments_total_by_bill([b["bill_id"] for b in bills])
    else:
        req = (
            supabase.table("ap_bills")
            .select("*")
            .eq("record_status", "ACTIVE")
            .eq("lifecycle_status", CONFIRMED_LIFECYCLE_STATUS)
            .lte("bill_date", as_of.isoformat())
        )
        if supplier is not None:
            req = req.eq("supplier_id", supplier)
        bills = _filter_bills_by_company(execute_with_retry(req).data or [], company)
        payments = _payments_total_by_bill_as_of([b["bill_id"] for b in bills], as_of)
    suppliers = _supplier_map()

    rows = []
    aging_records = []
    for bill in bills:
        bill_date = _as_date(bill.get("bill_date"))
        if from_ and (bill_date is None or bill_date < from_):
            continue
        if to and (bill_date is None or bill_date > to):
            continue

        due_date = _as_date(bill.get("due_date"))
        row_bucket = aging_bucket(due_date, report_date)
        if bucket is not None and row_bucket != bucket:
            continue

        gross = _num(bill.get("gross_amount"))
        net_payable_amount = _num(bill.get("net_payable"))
        balance = ap_balance(net_payable_amount, payments.get(bill["bill_id"], 0.0))
        if balance <= 0:
            continue
        rows.append({
            "bill_id": bill["bill_id"],
            "supplier_id": bill.get("supplier_id"),
            "supplier_name": suppliers.get(bill.get("supplier_id"), {}).get("company_name"),
            "currency_code": bill.get("currency_code") or _currency_from_supplier_id(bill.get("supplier_id")),
            "bill_number": bill.get("bill_number"),
            "bill_date": bill.get("bill_date"),
            "due_date": bill.get("due_date"),
            "gross_amount": gross,
            "outstanding_balance": balance,
            "aging_bucket": row_bucket,
        })
        aging_records.append({"due_date": due_date, "balance": balance})

    totals = aging_totals(aging_records, report_date)
    currency_totals = {}
    for row in rows:
        currency = row.get("currency_code") or "PHP"
        currency_totals[currency] = round(currency_totals.get(currency, 0.0) + row["outstanding_balance"], 2)
    return {
        "as_of": report_date.isoformat(),
        "filters": {
            "supplier": supplier,
            "from": from_.isoformat() if from_ else None,
            "to": to.isoformat() if to else None,
            "bucket": bucket,
            "as_of": as_of.isoformat() if as_of else None,
        },
        "rows": rows,
        "bucket_totals": totals,
        "currency_totals": currency_totals,
        "total_outstanding": round(sum(totals.values()), 2),
    }


def _build_payment_schedule(
    from_: date,
    to: date,
    group_by: Optional[str],
    company: Optional[str] = None,
) -> dict:
    """Assemble the payment-schedule payload shared by JSON and export views.

    Lists ACTIVE unpaid / partially-paid bills whose due date falls within
    ``[from_, to]``, sorted ascending by due date, with supplier name, bill
    number, due date, gross amount, paid amount and outstanding balance. The
    total payment required equals the sum of the listed outstanding balances.
    With ``group_by="supplier"`` the rows are partitioned by supplier without
    loss (Requirements 8.1-8.6, Properties 21, 22, 23).
    """
    bills = _outstanding_bills(None, company)
    payments = _payments_total_by_bill([b["bill_id"] for b in bills])
    suppliers = _supplier_map()

    rows = []
    for bill in bills:
        due_date = _as_date(bill.get("due_date"))
        if due_date is None or due_date < from_ or due_date > to:
            continue

        gross = _num(bill.get("gross_amount"))
        net_payable_amount = _num(bill.get("net_payable"))
        paid = payments.get(bill["bill_id"], 0.0)
        balance = ap_balance(net_payable_amount, paid)
        rows.append({
            "bill_id": bill["bill_id"],
            "supplier_id": bill.get("supplier_id"),
            "supplier_name": suppliers.get(bill.get("supplier_id"), {}).get("company_name"),
            "currency_code": bill.get("currency_code") or _currency_from_supplier_id(bill.get("supplier_id")),
            "bill_number": bill.get("bill_number"),
            "po_number": bill.get("po_number"),
            "source_purchase_order_id": bill.get("source_purchase_order_id"),
            "due_date": bill.get("due_date"),
            "gross_amount": gross,
            "paid_amount": paid,
            "outstanding_balance": balance,
        })

    # Sort by due date ascending (Requirement 8.4).
    rows.sort(key=lambda r: _as_date(r["due_date"]) or date.max)
    total_required = round(sum(r["outstanding_balance"] for r in rows), 2)
    currency_totals = {}
    for row in rows:
        currency = row.get("currency_code") or "PHP"
        currency_totals[currency] = round(currency_totals.get(currency, 0.0) + row["outstanding_balance"], 2)

    payload = {
        "period": {"from": from_.isoformat(), "to": to.isoformat()},
        "rows": rows,
        "currency_totals": currency_totals,
        "total_payment_required": total_required,
    }

    if group_by == "supplier":
        groups: dict = {}
        for row in rows:
            key = (row.get("supplier_name") or row.get("supplier_id"), row.get("currency_code") or "PHP")
            bucket = groups.setdefault(str(key), {"group": key[0], "currency_code": key[1], "bills": [], "total": 0.0})
            bucket["bills"].append(row)
            bucket["total"] = round(bucket["total"] + row["outstanding_balance"], 2)
        payload["group_by"] = "supplier"
        payload["groups"] = list(groups.values())

    return payload


@router.get("/payment-schedule")
def ap_payment_schedule(
    from_: date = Query(..., alias="from"),
    to: date = Query(...),
    group_by: Optional[str] = Query(None),
    export: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
):
    """Payment schedule report (Requirement 8).

    Requires a date range (``from`` / ``to``). Lists unpaid / partially-paid
    ACTIVE bills with due dates in the range, sorted ascending by due date, and
    reports the total payment required for the period. Supports grouping by
    supplier (``group_by=supplier``) and export to PDF (``export=pdf``) or Excel
    (``export=excel`` / ``export=csv``, delivered as CSV — see ``_csv_response``)
    (Requirements 8.1-8.7).
    """
    if to < from_:
        raise HTTPException(
            status_code=400,
            detail={"error": "The 'to' date must be on or after the 'from' date."},
        )

    schedule = _build_payment_schedule(from_, to, group_by, company)

    if export in ("pdf",):
        lines = [
            f"Period: {from_.isoformat()} to {to.isoformat()}",
            "",
            "Supplier            Bill No.        Due Date     Gross         Paid          Balance",
        ]
        for row in schedule["rows"]:
            lines.append(
                f"{str(row['supplier_name'] or ''):<20}"
                f"{str(row['bill_number'] or ''):<16}"
                f"{str(row['due_date'] or ''):<13}"
                f"{_format_currency(row['gross_amount'], row.get('currency_code')):<14}"
                f"{_format_currency(row['paid_amount'], row.get('currency_code')):<14}"
                f"{_format_currency(row['outstanding_balance'], row.get('currency_code'))}"
            )
        lines += ["", "Total Payment Required by Currency:"]
        for currency, total in schedule.get("currency_totals", {}).items():
            lines.append(f"{currency}: {_format_currency(total, currency)}")
        pdf_bytes = _simple_pdf("Payment Schedule", lines)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="payment_schedule.pdf"'},
        )

    if export in ("excel", "xlsx", "csv"):
        header = [
            "Supplier", "Bill Number", "Due Date", "Currency",
            "Gross Amount", "Paid Amount", "Outstanding Balance",
        ]
        data_rows = [
            [
                row["supplier_name"], row["bill_number"], row["due_date"], row.get("currency_code") or "PHP",
                row["gross_amount"], row["paid_amount"], row["outstanding_balance"],
            ]
            for row in schedule["rows"]
        ]
        data_rows.append([])
        for currency, total in schedule.get("currency_totals", {}).items():
            data_rows.append([f"Total Payment Required ({currency})", "", "", currency, "", "", total])
        return _csv_response("payment_schedule.csv", header, data_rows)

    return schedule


@router.post("/payment-runs", status_code=201)
def create_payment_run(request: Request, payload: PaymentRunCreate):
    """Create payment vouchers for due bills in a date range, grouped by supplier."""
    if payload.to_date < payload.from_date:
        raise HTTPException(
            status_code=400,
            detail={"error": "The to date must be on or after the from date."},
        )

    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)
    schedule = _build_payment_schedule(payload.from_date, payload.to_date, None)
    rows = schedule.get("rows", [])
    bill_ids = [row["bill_id"] for row in rows]
    live_links = _active_voucher_links_for_bills(bill_ids)

    grouped: dict = {}
    skipped = []
    for row in rows:
        voucher = live_links.get(row["bill_id"])
        if voucher:
            skipped.append({
                "bill_id": row["bill_id"],
                "bill_number": row.get("bill_number"),
                "reason": f"Already linked to {voucher.get('voucher_number')}",
            })
            continue
        entity = next(iter(_bill_entity_candidates([row])), None)
        currency_code = row.get("currency_code") or "PHP"
        grouped.setdefault((row.get("supplier_id"), entity, currency_code), []).append(row)

    created = []
    for (supplier_id, entity, currency_code), supplier_rows in grouped.items():
        if supplier_id is None or not supplier_rows:
            continue
        voucher_number = _next_voucher_number(entity)
        status = "FOR_APPROVAL" if payload.submit_for_approval else "DRAFT"
        header = {
            "voucher_number": voucher_number,
            "supplier_id": supplier_id,
            "currency_code": currency_code,
            "payment_date": payload.to_date.isoformat(),
            "status": status,
            "record_status": "ACTIVE",
            "created_by_employee_id": employee_id,
        }
        try:
            res = supabase.table("ap_payment_vouchers").insert(header).execute()
        except Exception as exc:
            raise db_http_error(exc)
        if not res.data:
            raise HTTPException(status_code=400, detail="Unable to create payment voucher")

        voucher_id = res.data[0]["voucher_id"]
        links = [{"voucher_id": voucher_id, "bill_id": row["bill_id"]} for row in supplier_rows]
        supabase.table("ap_voucher_bills").insert(links).execute()

        total = round(sum(_num(row.get("outstanding_balance")) for row in supplier_rows), 2)
        created.append({
            "voucher_id": voucher_id,
            "voucher_number": voucher_number,
            "supplier_id": supplier_id,
            "supplier_name": supplier_rows[0].get("supplier_name"),
            "currency_code": currency_code,
            "bill_ids": [row["bill_id"] for row in supplier_rows],
            "bill_count": len(supplier_rows),
            "total_amount": total,
            "status": status,
        })
        write_audit_log(
            action="CREATE",
            module_name=MODULE_NAME,
            description=f"Payment run created voucher {voucher_number} for {len(supplier_rows)} bill(s)",
            performed_by=performed_by,
            record_id=voucher_id,
            ip_address=request.client.host if request.client else None,
            request=request,
        )

    return {
        "period": {
            "from": payload.from_date.isoformat(),
            "to": payload.to_date.isoformat(),
        },
        "created_vouchers": created,
        "skipped_bills": skipped,
        "total_created": len(created),
        "total_skipped": len(skipped),
    }


@router.get("/work-queue")
@cached("ap:work-queue:{company}", ttl=30)
def ap_work_queue(company: Optional[str] = Query(None)):
    """Return actionable AP queues for the dashboard/work queue.

    Optimized: uses ThreadPoolExecutor for independent DB queries and batch
    fetches to eliminate N+1 patterns.
    """
    today = date.today()
    soon = today + timedelta(days=7)

    # ── Phase 1: Parallel independent queries ─────────────────────────────
    def _fetch_suppliers():
        return _supplier_map()

    def _fetch_draft_bills():
        return execute_with_retry(
            supabase.table("ap_bills")
            .select("bill_id, bill_number, supplier_id, po_number, supplier_invoice_number, due_date, net_payable, created_at, source_purchase_order_id")
            .eq("record_status", "ACTIVE")
            .eq("lifecycle_status", "DRAFT")
            .order("created_at", desc=True)
        ).data or []

    def _fetch_approval_vouchers():
        return execute_with_retry(
            supabase.table("ap_payment_vouchers")
            .select("*")
            .eq("record_status", "ACTIVE")
            .eq("status", "FOR_APPROVAL")
            .order("created_at", desc=True)
        ).data or []

    def _fetch_outstanding():
        return _outstanding_bills(None, company)

    def _fetch_issued_checks():
        return execute_with_retry(
            supabase.table("ap_checks")
            .select("check_id, voucher_id, check_number, check_date, bank, check_amount, check_status")
            .eq("record_status", "ACTIVE")
            .eq("check_status", "ISSUED")
            .order("check_date")
        ).data or []

    with ThreadPoolExecutor(max_workers=5) as executor:
        f_suppliers = executor.submit(_fetch_suppliers)
        f_drafts = executor.submit(_fetch_draft_bills)
        f_approvals = executor.submit(_fetch_approval_vouchers)
        f_outstanding = executor.submit(_fetch_outstanding)
        f_checks = executor.submit(_fetch_issued_checks)

    suppliers = f_suppliers.result()
    draft_bills = _filter_bills_by_company(f_drafts.result(), company)
    approval_rows = _filter_vouchers_by_company(f_approvals.result(), company)
    outstanding = f_outstanding.result()
    issued_checks = f_checks.result()

    for bill in draft_bills:
        bill["supplier_name"] = suppliers.get(bill.get("supplier_id"), {}).get("company_name")

    # ── Phase 2: Batch voucher-bill links ─────────────────────────────────
    approval_voucher_ids = [row["voucher_id"] for row in approval_rows]
    all_voucher_links: dict = {}
    if approval_voucher_ids:
        vb_rows = execute_with_retry(
            supabase.table("ap_voucher_bills")
            .select("voucher_id, bill_id")
            .in_("voucher_id", approval_voucher_ids)
        ).data or []
        for vb in vb_rows:
            all_voucher_links.setdefault(vb["voucher_id"], []).append(vb["bill_id"])

    vouchers_for_approval = [
        {
            **row,
            "supplier_name": suppliers.get(row.get("supplier_id"), {}).get("company_name"),
            "bill_ids": all_voucher_links.get(row["voucher_id"], []),
        }
        for row in approval_rows
    ]

    # ── Phase 3: Outstanding bills processing ─────────────────────────────
    outstanding_bill_ids = [bill["bill_id"] for bill in outstanding]
    payments = _payments_total_by_bill(outstanding_bill_ids)
    live_links = _active_voucher_links_for_bills(outstanding_bill_ids)

    overdue_bills = []
    due_soon_bills = []
    unvouchered_bills = []
    for bill in outstanding:
        due_date = _as_date(bill.get("due_date"))
        paid = payments.get(bill["bill_id"], 0.0)
        row = {
            "bill_id": bill["bill_id"],
            "bill_number": bill.get("bill_number"),
            "supplier_id": bill.get("supplier_id"),
            "supplier_name": suppliers.get(bill.get("supplier_id"), {}).get("company_name"),
            "due_date": bill.get("due_date"),
            "net_payable": _num(bill.get("net_payable")),
            "paid_amount": paid,
            "outstanding_balance": ap_balance(_num(bill.get("net_payable")), paid),
            "payment_status": bill.get("payment_status"),
            "voucher_number": (live_links.get(bill["bill_id"]) or {}).get("voucher_number"),
        }
        if due_date and due_date < today:
            overdue_bills.append(row)
        if due_date and today <= due_date <= soon:
            due_soon_bills.append(row)
        if bill["bill_id"] not in live_links:
            unvouchered_bills.append(row)

    # ── Phase 4: Batch attachment + item + PO match checks ────────────────
    candidate_bills = {bill["bill_id"]: bill for bill in [*draft_bills, *outstanding]}
    candidate_bill_ids = list(candidate_bills.keys())

    # Parallel batch queries for attachments, items, and PO data
    def _fetch_attachments():
        if not candidate_bill_ids:
            return set()
        att_rows = execute_with_retry(
            supabase.table("ar_ap_attachments")
            .select("parent_id")
            .eq("parent_type", "BILL")
            .eq("record_status", "ACTIVE")
            .in_("parent_id", candidate_bill_ids)
        ).data or []
        return {row["parent_id"] for row in att_rows}

    def _fetch_bill_items():
        if not candidate_bill_ids:
            return {}
        item_rows = execute_with_retry(
            supabase.table("ap_bill_items")
            .select("*")
            .in_("bill_id", candidate_bill_ids)
        ).data or []
        items_by_bill: dict = {}
        for item in item_rows:
            items_by_bill.setdefault(item["bill_id"], []).append(item)
        return items_by_bill

    def _fetch_po_match_data():
        """Batch-fetch all PO items and receipt items for PO-sourced bills."""
        po_ids = list({
            bill.get("source_purchase_order_id")
            for bill in candidate_bills.values()
            if bill.get("source_purchase_order_id")
        })
        if not po_ids:
            return {}, {}
        po_items = execute_with_retry(
            supabase.table("purchase_order_items")
            .select("purchase_order_id, purchase_order_item_id, item_description, quantity, received_quantity, final_unit_cost, freight, duties, other_charges")
            .in_("purchase_order_id", po_ids)
        ).data or []
        po_item_ids = [row["purchase_order_item_id"] for row in po_items]
        receipt_items = []
        if po_item_ids:
            receipt_items = execute_with_retry(
                supabase.table("goods_receipt_items")
                .select("purchase_order_item_id, received_quantity, unit_cost")
                .in_("purchase_order_item_id", po_item_ids)
            ).data or []
        # Group by PO ID
        po_items_by_po: dict = {}
        for row in po_items:
            po_items_by_po.setdefault(row["purchase_order_id"], []).append(row)
        receipt_by_item: dict = {}
        for row in receipt_items:
            receipt_by_item.setdefault(row["purchase_order_item_id"], []).append(row)
        return po_items_by_po, receipt_by_item

    def _fetch_check_vouchers():
        check_voucher_ids = list({c["voucher_id"] for c in issued_checks if c.get("voucher_id")})
        if not check_voucher_ids:
            return {}
        v_rows = execute_with_retry(
            supabase.table("ap_payment_vouchers")
            .select("voucher_id, voucher_number, supplier_id")
            .in_("voucher_id", check_voucher_ids)
        ).data or []
        return {v["voucher_id"]: v for v in v_rows}

    with ThreadPoolExecutor(max_workers=4) as executor:
        f_att = executor.submit(_fetch_attachments)
        f_items = executor.submit(_fetch_bill_items)
        f_po = executor.submit(_fetch_po_match_data)
        f_cv = executor.submit(_fetch_check_vouchers)

    attachment_bill_ids_with_docs = f_att.result()
    all_bill_items = f_items.result()
    po_items_by_po, receipt_by_item = f_po.result()
    check_voucher_map = f_cv.result()

    # Build no-document and mismatch lists
    no_document_bills = []
    mismatch_bills = []
    for bill_id, bill in candidate_bills.items():
        row = {
            "bill_id": bill_id,
            "bill_number": bill.get("bill_number"),
            "supplier_id": bill.get("supplier_id"),
            "supplier_name": suppliers.get(bill.get("supplier_id"), {}).get("company_name"),
            "due_date": bill.get("due_date"),
            "net_payable": _num(bill.get("net_payable")),
            "payment_status": bill.get("payment_status"),
            "lifecycle_status": bill.get("lifecycle_status"),
        }
        if bill_id not in attachment_bill_ids_with_docs:
            no_document_bills.append(row)

        items = all_bill_items.get(bill_id, [])
        # Inline match summary using pre-fetched PO data (no extra queries)
        source_po_id = bill.get("source_purchase_order_id")
        if source_po_id:
            po_items = po_items_by_po.get(source_po_id, [])
            if po_items:
                po_items_by_id = {r["purchase_order_item_id"]: r for r in po_items}
                receipt_totals: dict = {}
                for po_item in po_items:
                    item_id = po_item["purchase_order_item_id"]
                    for receipt in receipt_by_item.get(item_id, []):
                        ordered_quantity = _num(po_item.get("quantity"))
                        received_quantity = _num(receipt.get("received_quantity"))
                        charge_ratio = min(received_quantity / ordered_quantity, 1) if ordered_quantity > 0 else 0
                        additional_cost = (
                            _num(po_item.get("freight"))
                            + _num(po_item.get("duties"))
                            + _num(po_item.get("other_charges"))
                        ) * charge_ratio
                        receipt_totals[item_id] = round(
                            receipt_totals.get(item_id, 0.0)
                            + (received_quantity * _num(receipt.get("unit_cost")))
                            + additional_cost,
                            2,
                        )
                received_total = round(sum(receipt_totals.values()), 2)
                bill_total = round(sum(_num(i.get("vat_exclusive_amount")) for i in items), 2)
                variance = round(bill_total - received_total, 2)
                if abs(variance) > 0.01 or bill_total == 0:
                    po_total = round(
                        sum(
                            (_num(r.get("quantity")) * _num(r.get("final_unit_cost")))
                            + _num(r.get("freight"))
                            + _num(r.get("duties"))
                            + _num(r.get("other_charges"))
                            for r in po_items
                        ),
                        2,
                    )
                    mismatch_bills.append({
                        **row,
                        "match_summary": {
                            "status": "REVIEW",
                            "po_total": po_total,
                            "received_total": received_total,
                            "bill_total": bill_total,
                            "variance": variance,
                        },
                    })

    # ── Phase 5: Enrich issued checks ─────────────────────────────────────
    for check in issued_checks:
        voucher = check_voucher_map.get(check.get("voucher_id"), {})
        check["voucher_number"] = voucher.get("voucher_number")
        check["supplier_name"] = suppliers.get(voucher.get("supplier_id"), {}).get("company_name")

    # ── Phase 6: Tax-pending bills (EWT not yet fully withheld) ──────────────
    # Since 2307 is generated per payment, show confirmed bills with EWT that
    # haven't been fully paid — meaning EWT hasn't been fully withheld yet.
    tax_pending_bills = []
    try:
        confirmed_with_ewt = execute_with_retry(
            supabase.table("ap_bills")
            .select("bill_id, bill_number, supplier_id, due_date, net_payable, ewt_material, lifecycle_status, payment_status, created_at, currency_code")
            .eq("record_status", "ACTIVE")
            .eq("lifecycle_status", "CONFIRMED")
            .gt("ewt_material", 0)
            .order("created_at", desc=True)
        ).data or []
        confirmed_with_ewt = _filter_bills_by_company(confirmed_with_ewt, company)

        for bill in confirmed_with_ewt:
            pay_status = (bill.get("payment_status") or "").upper()
            # Skip fully paid bills — their 2307 has already been generated
            if pay_status in ("PAID", "FULLY_PAID"):
                continue
            # Compute how much EWT has been withheld so far (proportional to payments made)
            paid_total = _bill_payments_total(bill["bill_id"])
            net_pay = _num(bill.get("net_payable"))
            ewt_total = _num(bill.get("ewt_material"))
            ewt_withheld = round(ewt_total * (paid_total / net_pay), 2) if net_pay > 0 else 0
            ewt_remaining = round(ewt_total - ewt_withheld, 2)

            if ewt_remaining > 0.01:
                tax_pending_bills.append({
                    "bill_id": bill["bill_id"],
                    "bill_number": bill.get("bill_number"),
                    "supplier_id": bill.get("supplier_id"),
                    "supplier_name": suppliers.get(bill.get("supplier_id"), {}).get("company_name"),
                    "due_date": bill.get("due_date"),
                    "net_payable": _num(bill.get("net_payable")),
                    "ewt_amount": ewt_total,
                    "ewt_withheld": ewt_withheld,
                    "ewt_remaining": ewt_remaining,
                    "lifecycle_status": "CONFIRMED",
                    "payment_status": pay_status or "UNPAID",
                    "currency_code": bill.get("currency_code") or "PHP",
                })
    except Exception:
        pass

    queues = {
        "draft_bills": draft_bills,
        "vouchers_for_approval": vouchers_for_approval,
        "overdue_bills": overdue_bills,
        "due_soon_bills": due_soon_bills,
        "unvouchered_bills": unvouchered_bills,
        "no_document_bills": no_document_bills,
        "mismatch_bills": mismatch_bills,
        "issued_checks": issued_checks,
        "tax_pending_bills": tax_pending_bills,
    }
    return {
        "as_of": today.isoformat(),
        "counts": {key: len(value) for key, value in queues.items()},
        **queues,
    }


@router.get("/payments")
def ap_payment_report(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    supplier: Optional[int] = Query(None),
    group_by: Optional[str] = Query(None),
):
    """Payment report (Requirement 10.5-10.8, 10.10).

    Requires a date range. Lists all payments made within ``[from, to]`` with
    supplier name, bill number, payment date, payment amount, payment method and
    voucher number, and reports the total payments for the period. Supports an
    optional supplier filter and grouping by supplier or payment method — each
    reported total equals the sum of its listed rows and grouped output
    partitions the rows without loss (Properties 21, 22, 23).
    """
    if from_ is None or to is None:
        raise HTTPException(
            status_code=400,
            detail={"error": "A date range ('from' and 'to') is required for the payment report."},
        )
    if to < from_:
        raise HTTPException(
            status_code=400,
            detail={"error": "The 'to' date must be on or after the 'from' date."},
        )

    payments = (
        supabase.table("ap_payments")
        .select("*")
        .gte("payment_date", from_.isoformat())
        .lte("payment_date", to.isoformat())
        .order("payment_date", desc=True)
        .execute()
        .data
        or []
    )

    # Join bill (supplier + bill number) and voucher number context.
    bill_ids = list({p["bill_id"] for p in payments if p.get("bill_id") is not None})
    bills = {}
    if bill_ids:
        bills = {
            row["bill_id"]: row
            for row in (
                supabase.table("ap_bills")
                .select("bill_id, bill_number, supplier_id, currency_code")
                .in_("bill_id", bill_ids)
                .execute()
                .data
                or []
            )
        }
    voucher_ids = list({p["voucher_id"] for p in payments if p.get("voucher_id") is not None})
    vouchers = {}
    if voucher_ids:
        vouchers = {
            row["voucher_id"]: row
            for row in (
                supabase.table("ap_payment_vouchers")
                .select("voucher_id, voucher_number")
                .in_("voucher_id", voucher_ids)
                .execute()
                .data
                or []
            )
        }

    suppliers = _supplier_map()
    enriched = []
    for payment in payments:
        bill = bills.get(payment.get("bill_id"), {})
        supplier_id = bill.get("supplier_id")
        if supplier is not None and supplier_id != supplier:
            continue
        voucher = vouchers.get(payment.get("voucher_id"), {})
        enriched.append({
            **payment,
            "supplier_id": supplier_id,
            "supplier_name": suppliers.get(supplier_id, {}).get("company_name"),
            "currency_code": payment.get("currency_code") or bill.get("currency_code") or "PHP",
            "bill_number": bill.get("bill_number"),
            "voucher_number": voucher.get("voucher_number"),
        })

    total_payments = round(sum(_num(p["payment_amount"]) for p in enriched), 2)
    currency_totals = {}
    for row in enriched:
        currency = row.get("currency_code") or "PHP"
        currency_totals[currency] = round(currency_totals.get(currency, 0.0) + _num(row["payment_amount"]), 2)

    if group_by in ("supplier", "payment_method"):
        groups: dict = {}
        for row in enriched:
            if group_by == "supplier":
                label = row.get("supplier_name") or row.get("supplier_id")
            else:
                label = row.get("payment_method")
            key = (label, row.get("currency_code") or "PHP")
            bucket = groups.setdefault(str(key), {"group": key[0], "currency_code": key[1], "payments": [], "total": 0.0})
            bucket["payments"].append(row)
            bucket["total"] = round(bucket["total"] + _num(row["payment_amount"]), 2)
        return {
            "period": {"from": from_.isoformat(), "to": to.isoformat()},
            "group_by": group_by,
            "groups": list(groups.values()),
            "currency_totals": currency_totals,
            "total_payments": total_payments,
        }

    return {
        "period": {"from": from_.isoformat(), "to": to.isoformat()},
        "rows": enriched,
        "currency_totals": currency_totals,
        "total_payments": total_payments,
    }


@router.get("/supplier-balances")
def ap_supplier_balances(
    include_zero: bool = Query(False),
    sort: Optional[str] = Query(None),
    as_of: Optional[date] = Query(None),
):
    """Supplier balance inquiry (Requirement 13).

    Lists suppliers with their total bills amount (sum of net payable over
    ACTIVE bills), total payments made, and current balance (total bills minus
    total payments). When ``as_of`` is supplied, only bills dated on or before
    that date and payments posted on or before that date are counted. Suppliers
    with a zero balance are excluded by default and included when
    ``include_zero=true``. Supports sorting by supplier name
    (``sort=name``) or balance amount (``sort=balance``, descending)
    (Requirements 13.1-13.6, Properties 21, 22, 23).
    """
    req = (
        supabase.table("ap_bills")
        .select("bill_id, supplier_id, net_payable, currency_code")
        .eq("record_status", "ACTIVE")
        .eq("lifecycle_status", CONFIRMED_LIFECYCLE_STATUS)
    )
    if as_of is not None:
        req = req.lte("bill_date", as_of.isoformat())
    bills = execute_with_retry(req).data or []
    bill_ids = [b["bill_id"] for b in bills]
    payments = _payments_total_by_bill_as_of(bill_ids, as_of) if as_of is not None else _payments_total_by_bill(bill_ids)
    suppliers = _supplier_map()

    by_supplier: dict = {}
    for bill in bills:
        supplier_id = bill.get("supplier_id")
        currency_code = bill.get("currency_code") or _currency_from_supplier_id(supplier_id)
        key = (supplier_id, currency_code)
        entry = by_supplier.setdefault(key, {
            "supplier_id": supplier_id,
            "supplier_name": suppliers.get(supplier_id, {}).get("company_name"),
            "currency_code": currency_code,
            "total_bills_amount": 0.0,
            "total_payments_made": 0.0,
        })
        entry["total_bills_amount"] = round(
            entry["total_bills_amount"] + _num(bill.get("net_payable")), 2
        )
        entry["total_payments_made"] = round(
            entry["total_payments_made"] + payments.get(bill["bill_id"], 0.0), 2
        )

    result = []
    for entry in by_supplier.values():
        current_balance = round(entry["total_bills_amount"] - entry["total_payments_made"], 2)
        if not include_zero and current_balance == 0:
            continue
        result.append({**entry, "current_balance": current_balance})

    if sort == "name":
        result.sort(key=lambda r: (r["supplier_name"] or "").lower())
    elif sort == "balance":
        result.sort(key=lambda r: r["current_balance"], reverse=True)

    currency_totals = {}
    for row in result:
        currency = row.get("currency_code") or "PHP"
        currency_totals[currency] = round(currency_totals.get(currency, 0.0) + row["current_balance"], 2)

    return {
        "as_of": (as_of or date.today()).isoformat(),
        "suppliers": result,
        "currency_totals": currency_totals,
        "total_outstanding": round(sum(r["current_balance"] for r in result), 2),
    }


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
@cached("ap:dashboard:{company}", ttl=30)
def ap_dashboard(company: Optional[str] = Query(None)):
    """AP dashboard summary, payables aging chart, and supplier-bills table (Req 16).

    Returns the three headline summary metrics (Outstanding_Payables,
    Due_This_Week, Overdue_Bills), the payables aging analysis chart with all
    five buckets always present, and the supplier bills table (UNPAID /
    PARTIALLY_PAID only, sorted ascending by due date).

    Outstanding_Payables (Req 16.1) is the sum of AP balances over the
    outstanding bills (net_payable minus payments). Due_This_Week (Req 16.2) is
    the sum of those balances whose due date falls within the current calendar
    week (Monday through Sunday). Overdue_Bills (Req 16.3) is the whole-number
    count of bills past their due date with an outstanding balance greater than
    zero. If payables data cannot be retrieved, an explicit error is returned
    and no partial metrics are emitted (Req 16.11).
    """
    today = date.today()
    # Current calendar week, Monday (weekday()==0) through Sunday.
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    try:
        bills = _outstanding_bills(None, company)
        payments = _payments_total_by_bill([b["bill_id"] for b in bills])
        suppliers = _supplier_map()

        outstanding_payables = 0.0
        due_this_week = 0.0
        currency_totals = {"Outstanding_Payables": {}, "Due_This_Week": {}}
        overdue_bills = 0
        aging_records = []
        table_rows = []

        for bill in bills:
            due_date = _as_date(bill.get("due_date"))
            net_payable_amount = _num(bill.get("net_payable"))
            balance = ap_balance(net_payable_amount, payments.get(bill["bill_id"], 0.0))
            currency_code = bill.get("currency_code") or _currency_from_supplier_id(bill.get("supplier_id"))

            outstanding_payables = round(outstanding_payables + balance, 2)
            currency_totals["Outstanding_Payables"][currency_code] = round(currency_totals["Outstanding_Payables"].get(currency_code, 0.0) + balance, 2)
            if due_date is not None and week_start <= due_date <= week_end:
                due_this_week = round(due_this_week + balance, 2)
                currency_totals["Due_This_Week"][currency_code] = round(currency_totals["Due_This_Week"].get(currency_code, 0.0) + balance, 2)
            if due_date is not None and due_date < today and balance > 0:
                overdue_bills += 1

            aging_records.append({"due_date": due_date, "balance": balance})
            table_rows.append({
                "bill_id": bill["bill_id"],
                "bill_number": bill.get("bill_number"),
                "supplier": suppliers.get(bill.get("supplier_id"), {}).get("company_name"),
                "due_date": bill.get("due_date"),
                "currency_code": currency_code,
                "balance": balance,
            })

        # All five buckets are always present (0.0 when empty).
        bucket_totals = aging_totals(aging_records, today)
        aging_chart = [
            {"bucket": bucket, "total": bucket_totals[bucket]}
            for bucket in AGING_BUCKETS
        ]

        # Supplier bills table sorted ascending by due date.
        table_rows.sort(key=lambda row: _as_date(row["due_date"]) or date.max)

        return {
            "as_of": today.isoformat(),
            "summary": {
                "Outstanding_Payables": outstanding_payables,
                "Due_This_Week": due_this_week,
                "Overdue_Bills": overdue_bills,
                "currency_totals": currency_totals,
            },
            "aging_chart": aging_chart,
            "supplier_bills": table_rows,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=500,
            detail={"error": "Payables data could not be loaded"},
        )


# ── Attachments ───────────────────────────────────────────────────────────────
#
# Bill document attachments are stored in the shared ``ar_ap_attachments`` table
# discriminated by ``parent_type`` (BILL here). Only file metadata is persisted —
# the binary itself is referenced by ``file_ref``. Multiple attachments per bill
# are allowed (Req 14.6), and the default listing shows only ACTIVE attachments
# with their file name and upload date (Req 14.8). Deletion archives instead of
# physically removing (Req 14.10, 18.4); archived attachments can be restored.
# Every write emits an audit entry.

ATTACHMENT_FILE_TYPES = ("PDF", "JPG", "PNG", "XLSX")


class AttachmentCreate(BaseModel):
    file_name: str
    file_ref: str
    file_type: str                      # PDF / JPG / PNG / XLSX


def _require_bill(bill_id: int) -> dict:
    """Fetch the bare bill header (404 if missing)."""
    res = (
        supabase.table("ap_bills")
        .select("bill_id, bill_number")
        .eq("bill_id", bill_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Bill not found")
    return res.data[0]


def _require_bill_attachment(bill_id: int, attachment_id: int) -> dict:
    """Fetch an attachment that belongs to the given bill (404 if missing)."""
    res = (
        supabase.table("ar_ap_attachments")
        .select("*")
        .eq("attachment_id", attachment_id)
        .eq("parent_type", "BILL")
        .eq("parent_id", bill_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return res.data[0]


def _list_bill_attachments(bill_id: int) -> list:
    """Return the bill's ACTIVE attachments ordered by upload date."""
    return (
        supabase.table("ar_ap_attachments")
        .select("*")
        .eq("parent_type", "BILL")
        .eq("parent_id", bill_id)
        .eq("record_status", "ACTIVE")
        .order("uploaded_at")
        .execute()
        .data
        or []
    )


@router.post("/bills/{bill_id}/attachments", status_code=201)
def add_bill_attachment(bill_id: int, request: Request, payload: AttachmentCreate):
    """Attach a document to a bill (Req 14.6, 14.8).

    Validates the bill exists and that the file type is one of PDF/JPG/PNG/XLSX
    (rejecting others with 400). Multiple attachments per bill are permitted.
    Emits a CREATE audit entry.
    """
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    bill = _require_bill(bill_id)

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
        "parent_type": "BILL",
        "parent_id": bill_id,
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
        description=f"Attached document {attachment.get('file_name')} to bill "
                    f"{bill.get('bill_number')}",
        performed_by=performed_by,
        employee_id=employee_id,
        record_id=attachment.get("attachment_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return attachment


@router.get("/bills/{bill_id}/attachments")
def list_bill_attachments(bill_id: int):
    """List a bill's ACTIVE attachments with file name + upload date (Req 14.8)."""
    _require_bill(bill_id)
    return _list_bill_attachments(bill_id)


@router.delete("/bills/{bill_id}/attachments/{attachment_id}")
def archive_bill_attachment(bill_id: int, attachment_id: int, request: Request):
    """Archive a bill attachment (soft delete, Req 14.10, 18.4).

    Sets ``record_status`` to ARCHIVED, retaining both the attachment and the
    bill records, and emits an ARCHIVE audit entry.
    """
    _, performed_by = _extract_jwt_claims(request)
    bill = _require_bill(bill_id)
    attachment = _require_bill_attachment(bill_id, attachment_id)

    supabase.table("ar_ap_attachments").update(
        {"record_status": "ARCHIVED", "updated_at": _today_iso()}
    ).eq("attachment_id", attachment_id).execute()

    write_audit_log(
        action="ARCHIVE",
        module_name=MODULE_NAME,
        description=f"Archived attachment {attachment.get('file_name')} on bill "
                    f"{bill.get('bill_number')}",
        performed_by=performed_by,
        record_id=attachment_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return {"attachment_id": attachment_id, "attachments": _list_bill_attachments(bill_id)}


@router.post("/bills/{bill_id}/attachments/{attachment_id}/restore")
def restore_bill_attachment(bill_id: int, attachment_id: int, request: Request):
    """Restore an archived bill attachment back to ACTIVE (Req 18.16)."""
    _, performed_by = _extract_jwt_claims(request)
    bill = _require_bill(bill_id)
    attachment = _require_bill_attachment(bill_id, attachment_id)

    supabase.table("ar_ap_attachments").update(
        {"record_status": "ACTIVE", "updated_at": _today_iso()}
    ).eq("attachment_id", attachment_id).execute()

    write_audit_log(
        action="RESTORE",
        module_name=MODULE_NAME,
        description=f"Restored attachment {attachment.get('file_name')} on bill "
                    f"{bill.get('bill_number')}",
        performed_by=performed_by,
        record_id=attachment_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return {"attachment_id": attachment_id, "attachments": _list_bill_attachments(bill_id)}
