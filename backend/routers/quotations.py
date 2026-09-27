from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from routers.integration_calc import quotation_invoicing_eligibility
from routers import ar as ar_router
from routers import inventory as inventory_router
from routers import projects as projects_router
from routers import sales_orders as sales_orders_router
from utils.code_generator import normalize_entity
from utils.client_contacts import quotation_contact_snapshot
from datetime import date, datetime, timedelta
import re

router = APIRouter(prefix="/quotations", tags=["quotations"])

QUOTATION_COMPLETE = "COMPLETE"
_LEGACY_TERMINAL_QUOTATION_STATUSES = ("ACCEPTED", "CONVERTED")
_TERMINAL_QUOTATION_STATUSES = (QUOTATION_COMPLETE, *_LEGACY_TERMINAL_QUOTATION_STATUSES)


def _canonical_quotation_status(status: Optional[str]) -> Optional[str]:
    """Map historical terminal quotation statuses to the canonical COMPLETE state."""
    if status in _LEGACY_TERMINAL_QUOTATION_STATUSES:
        return QUOTATION_COMPLETE
    return status


def _catalog_entity_for_company(company: Optional[str]) -> str:
    """Resolve quotation company keys, including the legacy kyrios alias."""
    entity = normalize_entity(company)
    if not entity:
        raise HTTPException(status_code=422, detail="A valid issuing company is required.")
    return entity


def _validate_catalog_products(items, entity: str) -> None:
    """Reject quotation product codes that do not belong to its issuing entity."""
    product_codes = sorted({
        (item.product_code or "").strip()
        for item in items
        if not item.is_section and (item.product_code or "").strip()
    })
    if not product_codes:
        return

    rows = (
        supabase.table("product_list")
        .select("product_code, owner_entity")
        .in_("product_code", product_codes)
        .execute()
        .data
        or []
    )
    owners = {row["product_code"]: row.get("owner_entity") for row in rows}
    missing = [code for code in product_codes if code not in owners]
    wrong_owner = [code for code in product_codes if code in owners and owners[code] != entity]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown product code(s): {', '.join(missing)}. Use a {entity} catalog code or leave the code blank for a non-catalog line.",
        )
    if wrong_owner:
        raise HTTPException(
            status_code=422,
            detail=f"Product code(s) do not belong to {entity}: {', '.join(wrong_owner)}.",
        )


# ── Pydantic models ───────────────────────────────────────────────────────────

class QuotationItemCreate(BaseModel):
    line_no: int = 1
    product_type: Optional[str] = None
    product_code: Optional[str] = None
    description: Optional[str] = ''
    datasheet_link: Optional[str] = None
    quantity: float = 1
    uom: str = "Nos"
    unit_cost: float = 0
    selling_price: float = 0
    discount_percent: float = Field(default=0, ge=0, le=100)
    is_section: bool = False
    section_title: Optional[str] = None
    fulfillment_type: Optional[str] = None


class QuotationCreate(BaseModel):
    company: str = "expedia"
    client_id: int
    contact_id: Optional[int] = None
    opportunity_id: Optional[int] = None
    project_name: str
    subject: Optional[str] = None
    attn_to: Optional[str] = None
    validity_date: Optional[str] = None
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    vat_rate: float = 12
    wht_rate: float = 0
    discount_amount: float = Field(default=0, ge=0)
    shipping_cost: float = 0
    others_cost: float = 0
    scope_of_works: Optional[str] = None
    cancellation_fee: Optional[str] = "50% Cancellation Fee"
    validity_days: int = 30
    bank_details: Optional[str] = "BANK: BANCO DE ORO\nACCOUNT NAME: EXPEDIA SOLUTIONS SPECIALIST INC.\nACCOUNT TYPE: CURRENT\nACCOUNT NO: 0048-8800-3921"
    additional_notes: Optional[str] = "Any installation works if not stated herein can be covered in a separate proposal or shall be done by others, BONDS & PERMITS cost not included"
    scope_line_1: Optional[str] = None
    scope_line_2: Optional[str] = None
    scope_line_3: Optional[str] = None
    scope_line_4: Optional[str] = None
    scope_line_5: Optional[str] = None
    items: List[QuotationItemCreate] = []


class QuotationUpdate(BaseModel):
    company: Optional[str] = None
    client_id: Optional[int] = None
    contact_id: Optional[int] = None
    opportunity_id: Optional[int] = None
    project_name: Optional[str] = None
    subject: Optional[str] = None
    attn_to: Optional[str] = None
    validity_date: Optional[str] = None
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    vat_rate: Optional[float] = None
    wht_rate: Optional[float] = None
    discount_amount: Optional[float] = Field(default=None, ge=0)
    shipping_cost: Optional[float] = None
    others_cost: Optional[float] = None
    scope_of_works: Optional[str] = None
    cancellation_fee: Optional[str] = None
    validity_days: Optional[int] = None
    bank_details: Optional[str] = None
    additional_notes: Optional[str] = None
    scope_line_1: Optional[str] = None
    scope_line_2: Optional[str] = None
    scope_line_3: Optional[str] = None
    scope_line_4: Optional[str] = None
    scope_line_5: Optional[str] = None
    items: Optional[List[QuotationItemCreate]] = None
    change_summary: Optional[str] = None  # Describes what changed (for version snapshots)


class StatusUpdate(BaseModel):
    status: str
    remarks: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

# Entity name mapping: quotation 'company' field (lowercase) → inventory 'entity' field (proper case)
_COMPANY_TO_ENTITY = {
    "expedia": "Expedia",
    "greatnesslab": "GreatnessLab",
    "exigent": "Exigent",
    "ksi": "KSI",
    "kyrios": "KSI",  # Legacy quotation company alias
}


def _resolve_entity_name(company: Optional[str]) -> Optional[str]:
    """Convert a quotation 'company' field value to the inventory entity name.

    Handles: 'expedia' → 'Expedia', 'KSI' → 'KSI', None → None
    """
    if not company:
        return None
    return _COMPANY_TO_ENTITY.get(company.lower().strip(), company)


def _generate_quotation_no(entity: str = None) -> str:
    """Generate next quotation number in standard format: COMPANY-YYYY-QTN-NNNN."""
    from utils.code_generator import generate_code
    return generate_code(entity, "QTN", "quotations", "quotation_no")


def _with_invoicing_read_fields(quotation: dict) -> dict:
    """Augment a quotation read payload with integration read-surface fields.

    Legacy ACCEPTED and CONVERTED rows are exposed as COMPLETE while existing
    data is gradually backfilled. New terminal quotations are always persisted
    as COMPLETE.
    """
    if not isinstance(quotation, dict):
        return quotation
    quotation["status"] = _canonical_quotation_status(quotation.get("status"))
    quotation["invoicing_status"] = quotation.get("invoicing_status") or "NOT_INVOICED"
    quotation["can_create_draft_invoice"] = (
        quotation_invoicing_eligibility(quotation.get("status")) == "ELIGIBLE"
    )
    return quotation


def _get_quotation_with_items(quotation_id: int):
    """Fetch a single quotation with its line items."""
    q = (
        supabase.table("quotations")
        .select("*, client_list(client_id, company_name, address, tin_number)")
        .eq("quotation_id", quotation_id)
        .single()
        .execute()
    )
    if not q.data:
        raise HTTPException(status_code=404, detail="Quotation not found")
    items = (
        supabase.table("quotation_items")
        .select("*")
        .eq("quotation_id", quotation_id)
        .order("line_no")
        .execute()
    )
    q.data["items"] = items.data or []
    return _with_invoicing_read_fields(q.data)


def _log_history(quotation_id: int, action: str, performed_by: str, details: str = None, snapshot=None):
    """Write to quotation_history table."""
    payload = {
        "quotation_id": quotation_id,
        "action": action,
        "details": details,
        "snapshot": snapshot,
    }
    # Resolve employee_id from performed_by (email)
    emp = supabase.table("employees").select("employee_id").eq("email", performed_by).limit(1).execute()
    if emp.data:
        payload["performed_by"] = emp.data[0]["employee_id"]
    supabase.table("quotation_history").insert(payload).execute()


def _mark_quotation_complete(quotation: dict, performed_by: Optional[str], request: Request) -> dict:
    """Persist the canonical terminal state after Closed Won automation succeeds."""
    previous_status = quotation.get("status")
    if previous_status == QUOTATION_COMPLETE:
        return quotation

    quotation_id = quotation["quotation_id"]
    supabase.table("quotations").update({
        "status": QUOTATION_COMPLETE,
        "updated_at": datetime.now().isoformat(),
    }).eq("quotation_id", quotation_id).execute()
    _log_history(
        quotation_id,
        "STATUS_COMPLETE",
        performed_by,
        f"Quotation completed after successful Closed Won automation ({previous_status} → {QUOTATION_COMPLETE})",
    )
    write_audit_log(
        action="STATUS_CHANGE",
        module_name="Quotations",
        description=(
            f"Quotation {quotation.get('quotation_no')} status: "
            f"{previous_status} → {QUOTATION_COMPLETE}"
        ),
        performed_by=performed_by,
        record_id=quotation_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return {**quotation, "status": QUOTATION_COMPLETE}


def _create_version_snapshot(
    quotation_id: int,
    performed_by: str,
    change_summary: str = None,
    stage_context: str = None,
):
    """
    Save a full snapshot of the quotation (header + items) as a new version.
    Auto-increments version_number per quotation.

    Only creates a new version if the snapshot actually differs from the latest version.
    If no versions exist yet (initial creation), saves as version 1.
    """
    # Get full current state
    q = (
        supabase.table("quotations")
        .select("*")
        .eq("quotation_id", quotation_id)
        .single()
        .execute()
    )
    if not q.data:
        return None
    items = (
        supabase.table("quotation_items")
        .select("*")
        .eq("quotation_id", quotation_id)
        .order("line_no")
        .execute()
    )
    snapshot = {**q.data, "items": items.data or []}

    # Determine next version number
    latest = (
        supabase.table("quotation_versions")
        .select("version_number, snapshot")
        .eq("quotation_id", quotation_id)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )

    # Resolve employee_id
    emp = supabase.table("employees").select("employee_id").eq("email", performed_by).limit(1).execute()
    created_by = emp.data[0]["employee_id"] if emp.data else None

    if latest.data:
        # Check if the snapshot actually changed compared to the latest version
        last_snapshot = latest.data[0].get("snapshot", {})
        if _snapshots_are_equal(last_snapshot, snapshot):
            return None  # No actual changes, skip versioning

        next_version = latest.data[0]["version_number"] + 1
    else:
        # First version — save as version 1
        next_version = 1

    row = {
        "quotation_id": quotation_id,
        "version_number": next_version,
        "snapshot": snapshot,
        "change_summary": change_summary,
        "stage_context": stage_context,
        "created_by": created_by,
    }
    res = supabase.table("quotation_versions").insert(row).execute()
    return res.data[0] if res.data else None


def _snapshots_are_equal(snap_a: dict, snap_b: dict) -> bool:
    """Compare two quotation snapshots to check if they represent the same data."""
    compare_fields = [
        "project_name", "subject", "attn_to", "payment_terms", "delivery_terms",
        "notes", "vat_rate", "wht_rate", "discount_amount", "shipping_cost",
        "others_cost", "validity_date", "scope_of_works", "cancellation_fee",
        "bank_details", "additional_notes", "scope_line_1", "scope_line_2",
        "scope_line_3", "scope_line_4", "scope_line_5", "company", "client_id", "contact_id",
        "contact_name_snapshot", "contact_job_title_snapshot", "contact_email_snapshot",
        "contact_phone_snapshot",
    ]
    for field in compare_fields:
        if snap_a.get(field) != snap_b.get(field):
            return False

    items_a = snap_a.get("items") or []
    items_b = snap_b.get("items") or []
    if len(items_a) != len(items_b):
        return False

    item_fields = ["description", "quantity", "uom", "unit_cost", "selling_price",
                   "discount_percent", "product_code", "product_type", "is_section",
                   "section_title", "line_no"]
    for a, b in zip(items_a, items_b):
        for f in item_fields:
            if a.get(f) != b.get(f):
                return False
    return True


def _find_related_opportunity(quotation: dict) -> Optional[dict]:
    if quotation.get("opportunity_id"):
        rows = (
            supabase.table("opportunities")
            .select("opportunity_id, stage")
            .eq("opportunity_id", quotation.get("opportunity_id"))
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            return rows[0]

    project_name = (quotation.get("project_name") or "").strip()
    if not project_name:
        return None

    req = (
        supabase.table("opportunities")
        .select("opportunity_id, stage")
        .eq("project_name", project_name)
        .order("opportunity_id", desc=True)
        .limit(1)
    )
    if quotation.get("client_id"):
        req = req.eq("client_id", quotation.get("client_id"))
    rows = req.execute().data or []
    if rows:
        return rows[0]

    rows = (
        supabase.table("opportunities")
        .select("opportunity_id, stage")
        .eq("project_name", project_name)
        .order("opportunity_id", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _resolve_related_opportunity_id(quotation: dict) -> Optional[int]:
    opportunity = _find_related_opportunity(quotation)
    return opportunity.get("opportunity_id") if opportunity else None


def _set_related_opportunity_stage(
    quotation: dict,
    stage: str,
    performed_by: str,
    request: Request,
) -> Optional[dict]:
    opportunity = _find_related_opportunity(quotation)
    if not opportunity or opportunity.get("stage") == stage:
        return opportunity

    updated = (
        supabase.table("opportunities")
        .update({"stage": stage})
        .eq("opportunity_id", opportunity["opportunity_id"])
        .execute()
    )
    if updated.data:
        write_audit_log(
            action="UPDATE",
            module_name="CRM",
            description=(
                f"Moved opportunity #{opportunity['opportunity_id']} to stage "
                f"'{stage}' from quotation {quotation.get('quotation_no')}"
            ),
            performed_by=performed_by,
            record_id=opportunity["opportunity_id"],
            ip_address=request.client.host if request.client else None,
            request=request,
        )
        return updated.data[0]
    return opportunity


def _create_rejected_followup_draft(
    quotation_id: int,
    performed_by: str,
    request: Request,
) -> Optional[dict]:
    source = _get_quotation_with_items(quotation_id)
    new_no = _generate_quotation_no(source.get("company") if source else None)
    excluded = {
        "quotation_id",
        "quotation_no",
        "revision_no",
        "status",
        "approved_by",
        "approved_at",
        "sent_at",
        "created_at",
        "updated_at",
        "items",
        "client_list",
        "can_create_draft_invoice",
    }
    header = {
        key: value
        for key, value in source.items()
        if key not in excluded and not isinstance(value, (dict, list))
    }
    validity_days = int(header.get("validity_days", 30) or 30)
    header.update({
        "quotation_no": new_no,
        "revision_no": 0,
        "status": "DRAFT",
        "validity_date": (date.today() + timedelta(days=validity_days)).isoformat(),
        "parent_quotation_id": quotation_id,
    })

    created = supabase.table("quotations").insert(header).execute()
    if not created.data:
        return None
    new_quotation = created.data[0]
    new_qid = new_quotation["quotation_id"]

    item_rows = []
    for idx, item in enumerate(source.get("items") or [], start=1):
        row = {
            key: value
            for key, value in item.items()
            if key not in {"item_id", "quotation_id", "created_at"}
        }
        row["quotation_id"] = new_qid
        row["line_no"] = idx
        item_rows.append(row)
    if item_rows:
        supabase.table("quotation_items").insert(item_rows).execute()

    _log_history(
        new_qid,
        "CREATED_FROM_REJECTION",
        performed_by,
        f"Draft {new_no} created automatically after rejection of {source.get('quotation_no')}",
    )
    _log_history(
        quotation_id,
        "FOLLOWUP_DRAFT_CREATED",
        performed_by,
        f"Follow-up draft {new_no} created automatically after rejection",
    )
    write_audit_log(
        action="CREATE",
        module_name="Quotations",
        description=f"Auto-created follow-up draft {new_no} after rejection of {source.get('quotation_no')}",
        performed_by=performed_by,
        record_id=new_qid,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_quotation_with_items(new_qid)


def _num(value) -> float:
    return float(value or 0)


def _stock_out_exists_for_quotation(quotation_no: str) -> bool:
    rows = (
        supabase.table("inventory_movements")
        .select("movement_id")
        .eq("movement_type", "STOCK_OUT")
        .eq("reference_no", quotation_no)
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


def _resolve_line_fulfillment_type(line: dict, product_fulfillment_cache: dict[str, str]) -> str:
    """Resolve effective fulfillment type for a quotation/SO line item.

    Priority: line-level override > product master default > 'DIRECT'
    """
    # Line-level override (from quotation_items.fulfillment_type)
    line_override = (line.get("fulfillment_type") or "").strip().upper()
    if line_override in ("DIRECT", "MTO", "SERVICE"):
        return line_override

    # Product master default
    product_code = (line.get("product_code") or "").strip()
    if product_code and product_code in product_fulfillment_cache:
        return product_fulfillment_cache[product_code]

    # Legacy fallback: treat product_type SERVICE as SERVICE fulfillment
    product_type = (line.get("product_type") or "").strip().upper()
    if product_type == "SERVICE":
        return "SERVICE"

    return "DIRECT"


def _build_product_fulfillment_cache(product_codes: list[str]) -> dict[str, str]:
    """Batch-fetch fulfillment_type from product_list for given codes."""
    if not product_codes:
        return {}
    rows = (
        supabase.table("product_list")
        .select("product_code, fulfillment_type")
        .in_("product_code", product_codes)
        .execute()
        .data
        or []
    )
    return {
        row["product_code"]: (row.get("fulfillment_type") or "DIRECT").upper()
        for row in rows
    }


def _quotation_stock_requirements(quotation_id: int) -> list[dict]:
    """Return product-coded quotation lines that need inventory (DIRECT only).

    Skips MTO and SERVICE items — they don't consume stock at reservation time.
    """
    lines = (
        supabase.table("quotation_items")
        .select("*")
        .eq("quotation_id", quotation_id)
        .order("line_no")
        .execute()
        .data
        or []
    )

    # Build fulfillment cache for all product codes in this quotation
    product_codes = list({
        (line.get("product_code") or "").strip()
        for line in lines
        if (line.get("product_code") or "").strip() and not line.get("is_section")
    })
    fulfillment_cache = _build_product_fulfillment_cache(product_codes)

    required: dict[str, float] = {}
    for line in lines:
        product_code = (line.get("product_code") or "").strip()
        if not product_code or line.get("is_section"):
            continue
        quantity = _num(line.get("quantity"))
        if quantity <= 0:
            continue

        # Only DIRECT items need inventory reservation
        effective_type = _resolve_line_fulfillment_type(line, fulfillment_cache)
        if effective_type != "DIRECT":
            continue

        required[product_code] = required.get(product_code, 0.0) + quantity
    return [
        {"product_code": product_code, "quantity": quantity}
        for product_code, quantity in required.items()
    ]


def _prepare_sales_inventory_reservation(quotation_id: int, allow_shortages: bool = False, entity: Optional[str] = None) -> list[dict]:
    """Build a reservation allocation plan, failing before any status is changed.

    Foolproof behavior:
    - If a product code doesn't exist in inventory at all, tells user which products are missing
    - If a product exists but has insufficient stock, tells user exactly how much is available
    - Skips items with NEW- prefix (temporary codes not yet received into inventory)
    - Only processes DIRECT fulfillment items (MTO/SERVICE are skipped by _quotation_stock_requirements)
    - When entity is provided, only reserves stock owned by that entity

    When allow_shortages=True (for mixed orders), shortages are stored as warnings
    on the plan items but don't block the automation.
    """

    plan = []
    shortages = []
    missing_products = []
    requirements = _quotation_stock_requirements(quotation_id)

    # If no DIRECT items require stock, return empty plan (MTO/SERVICE-only order)
    if not requirements:
        return plan

    # Filter out temporary NEW- codes that haven't been received yet
    # These are placeholder codes from PO creation that need goods receipt first
    valid_requirements = []
    for requirement in requirements:
        product_code = requirement["product_code"]
        if product_code.startswith("NEW-"):
            missing_products.append(
                f"{product_code}: this is a pending item that hasn't been received into inventory yet. "
                f"Complete the Goods Receipt in Purchasing first."
            )
        else:
            valid_requirements.append(requirement)

    for requirement in valid_requirements:
        product_code = requirement["product_code"]
        remaining = requirement["quantity"]

        # Filter stock by entity ownership when specified
        query = (
            supabase.table("inventory_stock")
            .select("*")
            .eq("product_code", product_code)
        )
        if entity:
            query = query.eq("entity", entity)

        stock_rows = query.execute().data or []

        if not stock_rows:
            # Check if stock exists under a different entity (inter-company hint)
            all_entity_stock = (
                supabase.table("inventory_stock")
                .select("entity, quantity_on_hand, reserved_quantity")
                .eq("product_code", product_code)
                .execute()
                .data or []
            )
            other_entities = [
                row for row in all_entity_stock
                if row.get("entity") != entity
                and _num(row.get("quantity_on_hand")) - _num(row.get("reserved_quantity")) > 0
            ]

            if other_entities and entity:
                # Stock exists but belongs to another entity
                other_entity_names = sorted(set(r.get("entity") for r in other_entities if r.get("entity")))
                total_elsewhere = sum(
                    _num(r.get("quantity_on_hand")) - _num(r.get("reserved_quantity"))
                    for r in other_entities
                )
                missing_products.append(
                    f"{product_code}: no stock under {entity}, but {total_elsewhere:g} available "
                    f"under {', '.join(other_entity_names)}. "
                    f"Create a Purchase Request to procure from the sister company."
                )
            else:
                # Product code exists nowhere in inventory at all
                product_exists = (
                    supabase.table("product_list")
                    .select("product_code, product_name")
                    .eq("product_code", product_code)
                    .limit(1)
                    .execute()
                    .data or []
                )
                if product_exists:
                    missing_products.append(
                        f"{product_code} ({product_exists[0].get('product_name', '')}): "
                        f"exists in catalog but has no stock in any warehouse. "
                        f"Receive inventory via Purchasing → Goods Receipt first."
                    )
                else:
                    missing_products.append(
                        f"{product_code}: not found in product catalog or inventory. "
                        f"Check if the product code on the quotation matches an existing product."
                    )
            continue

        available_rows = [
            row for row in stock_rows
            if _num(row.get("quantity_on_hand")) - _num(row.get("reserved_quantity")) > 0
        ]
        total_available = sum(
            _num(row.get("quantity_on_hand")) - _num(row.get("reserved_quantity"))
            for row in available_rows
        )
        if total_available < remaining:
            shortages.append(
                f"{product_code}: need {remaining:g}, only {total_available:g} available under {entity or 'all entities'}"
            )
            if not allow_shortages:
                continue
            # With allow_shortages, reserve what we can
            remaining = min(remaining, total_available)
            if remaining <= 0:
                continue

        for row in available_rows:
            if remaining <= 0:
                break
            available_qty = _num(row.get("quantity_on_hand")) - _num(row.get("reserved_quantity"))
            reserve_qty = min(remaining, available_qty)
            if reserve_qty <= 0:
                continue
            plan.append({
                "stock_id": row.get("stock_id"),
                "product_code": product_code,
                "quantity": reserve_qty,
                "warehouse_id": row.get("warehouse_id"),
                "location_id": row.get("location_id"),
                "unit_cost": _num(row.get("unit_cost")),
                "reserved_before": _num(row.get("reserved_quantity")),
            })
            remaining -= reserve_qty

    all_issues = missing_products + shortages
    if all_issues and not allow_shortages:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Not enough inventory to accept this sale.",
                "fields": {"inventory": "; ".join(all_issues)},
            },
        )
    return plan


def _reserve_sales_inventory(plan: list[dict]) -> None:
    for item in plan:
        stock_id = item.get("stock_id")
        if not stock_id:
            continue
        current = (
            supabase.table("inventory_stock")
            .select("reserved_quantity")
            .eq("stock_id", stock_id)
            .single()
            .execute()
        )
        if not current.data:
            raise HTTPException(status_code=400, detail="Stock record not found for reservation")
        next_reserved = _num(current.data.get("reserved_quantity")) + _num(item.get("quantity"))
        supabase.table("inventory_stock").update({
            "reserved_quantity": next_reserved,
            "updated_at": datetime.now().isoformat(),
        }).eq("stock_id", stock_id).execute()


def _get_sales_reservation_plan(quotation_id: int) -> list[dict]:
    rows = (
        supabase.table("quotation_history")
        .select("snapshot")
        .eq("quotation_id", quotation_id)
        .eq("action", "SALES_RESERVED")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return []
    snapshot = rows[0].get("snapshot") or {}
    if isinstance(snapshot, dict):
        return snapshot.get("allocations") or []
    return []


def _validate_sales_delivery_plan(plan: list[dict]) -> None:
    for item in plan:
        stock_id = item.get("stock_id")
        quantity = _num(item.get("quantity"))
        stock = (
            supabase.table("inventory_stock")
            .select("*")
            .eq("stock_id", stock_id)
            .single()
            .execute()
        )
        if not stock.data:
            raise HTTPException(status_code=400, detail="Reserved stock record was not found")
        if _num(stock.data.get("reserved_quantity")) < quantity:
            raise HTTPException(status_code=400, detail="Reserved stock is lower than the delivery quantity")
        if _num(stock.data.get("quantity_on_hand")) < quantity:
            raise HTTPException(status_code=400, detail="Stock on hand is lower than the delivery quantity")


def _deliver_sales_inventory(reference_no: str, plan: list[dict]) -> None:
    if _stock_out_exists_for_quotation(reference_no):
        return
    if not plan:
        return
    _validate_sales_delivery_plan(plan)

    issued_products = set()
    for item in plan:
        issued_products.add(item["product_code"])
        stock_id = item.get("stock_id")
        quantity = _num(item.get("quantity"))
        stock = (
            supabase.table("inventory_stock")
            .select("*")
            .eq("stock_id", stock_id)
            .single()
            .execute()
        )
        if not stock.data:
            raise HTTPException(status_code=400, detail="Reserved stock record was not found")

        next_qty = _num(stock.data.get("quantity_on_hand")) - quantity
        next_reserved = max(_num(stock.data.get("reserved_quantity")) - quantity, 0)
        supabase.table("inventory_stock").update({
            "quantity_on_hand": next_qty,
            "reserved_quantity": next_reserved,
            "status": inventory_router._stock_status(next_qty, _num(stock.data.get("reorder_level"))),
            "updated_at": datetime.now().isoformat(),
        }).eq("stock_id", stock_id).execute()
        inventory_router._insert_movement_record(
            movement_type="STOCK_OUT",
            product_code=item["product_code"],
            quantity=quantity,
            unit_cost=item.get("unit_cost"),
            reference_no=reference_no,
            remarks=f"Sales delivery for {reference_no}",
            warehouse_id=item.get("warehouse_id"),
            location_id=item.get("location_id"),
        )
    _ensure_sales_replenishment_requests(issued_products)


def _ensure_sales_replenishment_requests(product_codes: set[str]) -> None:
    """Create low-stock purchase requests after sales consume inventory."""
    for product_code in product_codes:
        rows = (
            supabase.table("inventory_stock")
            .select("*")
            .eq("product_code", product_code)
            .execute()
            .data
            or []
        )
        if not rows:
            continue
        total_stock = sum(_num(row.get("quantity_on_hand")) for row in rows)
        minimum = max(_num(row.get("reorder_level")) for row in rows)
        if minimum <= 0 or total_stock >= minimum:
            continue
        source = max(rows, key=lambda row: _num(row.get("reorder_level")))
        inventory_router._ensure_low_stock_purchase_request({
            **source,
            "quantity_on_hand": total_stock,
            "reorder_level": minimum,
        })


def _ensure_draft_ar_invoice_from_sales_order(sales_order: dict, request: Request) -> dict:
    """Create the draft AR invoice for a sales order if needed."""
    invoice_source_ref = sales_order.get("so_number")
    existing = (
        supabase.table("ar_invoices")
        .select("invoice_id, lifecycle_status, record_status")
        .eq("sales_order_ref", invoice_source_ref)
        .eq("record_status", "ACTIVE")
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        invoice_id = existing[0]["invoice_id"]
        if existing[0].get("lifecycle_status") == "DRAFT":
            return ar_router.ensure_draft_invoice_lines_from_sales_order(
                invoice_id,
                sales_order["sales_order_id"],
                request,
            )
        return ar_router.get_invoice(invoice_id)

    return ar_router.create_draft_invoice_from_sales_order(
        sales_order["sales_order_id"],
        request,
        ar_router.DraftInvoiceFromSalesOrder(),
    )


def _opportunity_by_id(opportunity_id: int) -> dict:
    rows = (
        supabase.table("opportunities")
        .select("*")
        .eq("opportunity_id", opportunity_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return rows[0]


def _latest_quotation_for_opportunity(opportunity: dict) -> Optional[dict]:
    # 1. Direct link via opportunity_id on the quotation
    rows = (
        supabase.table("quotations")
        .select("*")
        .eq("opportunity_id", opportunity.get("opportunity_id"))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return rows[0]

    # 2. Match by project_name + client_id
    project_name = (opportunity.get("project_name") or "").strip()
    if project_name:
        req = (
            supabase.table("quotations")
            .select("*")
            .eq("project_name", project_name)
            .order("created_at", desc=True)
            .limit(1)
        )
        if opportunity.get("client_id"):
            req = req.eq("client_id", opportunity.get("client_id"))
        rows = req.execute().data or []
        if rows:
            return rows[0]

    # 3. Fallback: any quotation for this client (most recent)
    if opportunity.get("client_id"):
        rows = (
            supabase.table("quotations")
            .select("*")
            .eq("client_id", opportunity.get("client_id"))
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            return rows[0]

    return None


def _determine_order_type(quotation_id: int) -> tuple[str, dict[str, str]]:
    """Determine the overall order type and per-line fulfillment types for a quotation.

    Returns:
        (order_type, line_fulfillment_map)
        - order_type: 'DIRECT', 'MTO', 'SERVICE', or 'MIXED'
        - line_fulfillment_map: dict mapping item_id -> effective fulfillment type
    """
    lines = (
        supabase.table("quotation_items")
        .select("*")
        .eq("quotation_id", quotation_id)
        .order("line_no")
        .execute()
        .data
        or []
    )

    product_codes = list({
        (line.get("product_code") or "").strip()
        for line in lines
        if (line.get("product_code") or "").strip() and not line.get("is_section")
    })
    fulfillment_cache = _build_product_fulfillment_cache(product_codes)

    line_fulfillment_map: dict[str, str] = {}
    types_seen: set[str] = set()

    for line in lines:
        if line.get("is_section"):
            continue
        item_id = str(line.get("item_id"))
        effective_type = _resolve_line_fulfillment_type(line, fulfillment_cache)
        line_fulfillment_map[item_id] = effective_type
        types_seen.add(effective_type)

    # Determine overall order type
    non_service_types = types_seen - {"SERVICE"}
    if not non_service_types:
        order_type = "SERVICE"
    elif non_service_types == {"DIRECT"}:
        order_type = "DIRECT"
    elif non_service_types == {"MTO"}:
        order_type = "MTO"
    else:
        order_type = "MIXED"

    return order_type, line_fulfillment_map


def run_closed_won_automation(opportunity_id: int, performed_by: Optional[str], request: Request, allow_shortages: bool = False) -> dict:
    """Build the operational records when the sale becomes Closed Won.

    Handles three fulfillment paths:
    - DIRECT: reserve inventory, set line status READY_TO_FULFILL
    - MTO: no inventory check, set line status IN_PRODUCTION, create project
    - SERVICE: no inventory impact, set line status READY_TO_FULFILL
    """
    opportunity = _opportunity_by_id(opportunity_id)
    quotation = _latest_quotation_for_opportunity(opportunity)
    if not quotation:
        raise HTTPException(
            status_code=400,
            detail="A sale needs an approved/sent quotation before it can be moved to Closed Won.",
        )

    quotation_id = quotation["quotation_id"]
    quotation_status = quotation.get("status")
    if quotation_status in ("DRAFT", "FOR_APPROVAL", "REJECTED"):
        raise HTTPException(
            status_code=400,
            detail=f"Quotation {quotation.get('quotation_no')} is {quotation_status} and cannot close the sale yet.",
        )

    # Determine order composition
    order_type, line_fulfillment_map = _determine_order_type(quotation_id)
    has_direct_items = any(t == "DIRECT" for t in line_fulfillment_map.values())
    has_mto_items = any(t == "MTO" for t in line_fulfillment_map.values())

    # Handle existing sales order
    sales_order = sales_orders_router.get_sales_order_for_quotation(quotation_id)
    sales_inventory_plan = [] if sales_order and sales_order.get("status") == "CANCELLED" else _get_sales_reservation_plan(quotation_id)
    if sales_order and sales_order.get("status") == "CANCELLED":
        sales_order = None

    if not sales_order:
        # Only reserve inventory for DIRECT items
        if not sales_inventory_plan and has_direct_items:
            # Option A: the selling entity must own available stock before the
            # sale closes. A shortage tells the user to create a PR instead of
            # silently creating an unfulfillable sales order.
            # When allow_shortages=True (e.g. manager-approved deal closure),
            # reserve what is available and proceed anyway.
            selling_entity = _resolve_entity_name(quotation.get("company"))
            sales_inventory_plan = _prepare_sales_inventory_reservation(
                quotation_id,
                allow_shortages=allow_shortages,
                entity=selling_entity,
            )
            if sales_inventory_plan:
                _reserve_sales_inventory(sales_inventory_plan)
                _log_history(
                    quotation_id,
                    "SALES_RESERVED",
                    performed_by,
                    f"Reserved inventory for DIRECT items in closed-won sale {quotation.get('quotation_no')}",
                    snapshot={"allocations": sales_inventory_plan},
                )

        sales_order = sales_orders_router.create_or_update_from_quotation(
            quotation_id,
            sales_inventory_plan,
            performed_by,
            order_type=order_type,
            line_fulfillment_map=line_fulfillment_map,
        )

    # Create project if MTO or SERVICE items exist (production/service tracking needed)
    # Pure DIRECT orders don't need a project — fulfillment is tracked via SO + Delivery
    project = None
    has_service_items = any(t == "SERVICE" for t in line_fulfillment_map.values())
    if has_mto_items or has_service_items:
        project = projects_router.create_or_update_from_sales_order(sales_order, performed_by, request)

    ar_invoice = _ensure_draft_ar_invoice_from_sales_order(sales_order, request)
    quotation = _mark_quotation_complete(quotation, performed_by, request)

    automation_summary = (
        f"Closed Won ({order_type}) created/updated sales order {sales_order.get('so_number')}"
    )
    if project:
        automation_summary += f" and project {project.get('project_code')}"
    if has_mto_items:
        automation_summary += "; MTO items set to IN_PRODUCTION"
    automation_summary += f"; draft AR invoice {ar_invoice.get('invoice_number')} ready"

    _log_history(
        quotation_id,
        "SALES_AUTOMATION",
        performed_by,
        automation_summary,
    )

    return {
        "quotation": _with_invoicing_read_fields(quotation),
        "sales_order": sales_order,
        "project": project,
        "ar_invoice": ar_invoice,
        "order_type": order_type,
    }


def _release_project_allocations(project_id: int) -> None:
    allocations = (
        supabase.table("project_material_allocations")
        .select("*")
        .eq("project_id", project_id)
        .execute()
        .data
        or []
    )
    if any(_num(row.get("quantity_issued")) > 0 for row in allocations):
        raise HTTPException(
            status_code=409,
            detail="This sale has issued project materials and cannot be moved back automatically.",
        )

    for allocation in allocations:
        stock_rows = (
            supabase.table("inventory_stock")
            .select("*")
            .eq("stock_id", allocation.get("stock_id"))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not stock_rows:
            continue
        release_qty = _num(allocation.get("quantity_reserved")) - _num(allocation.get("quantity_issued"))
        next_reserved = max(_num(stock_rows[0].get("reserved_quantity")) - release_qty, 0)
        supabase.table("inventory_stock").update({
            "reserved_quantity": next_reserved,
            "updated_at": datetime.now().isoformat(),
        }).eq("stock_id", allocation.get("stock_id")).execute()

    supabase.table("project_material_allocations").delete().eq("project_id", project_id).execute()


def reopen_closed_won_opportunity(opportunity_id: int, target_stage: str, performed_by: Optional[str], request: Request) -> dict:
    """Reverse draft/unissued downstream records when a Closed Won sale is reopened."""
    opportunity = _opportunity_by_id(opportunity_id)
    quotation = _latest_quotation_for_opportunity(opportunity)
    if not quotation:
        return {"quotation": None, "sales_order": None, "project": None, "archived_invoices": []}

    sales_order = sales_orders_router.get_sales_order_for_quotation(quotation["quotation_id"])
    so_number = sales_order.get("so_number") if sales_order else None
    project_rows = (
        supabase.table("projects")
        .select("*")
        .eq("quotation_id", quotation["quotation_id"])
        .execute()
        .data
        or []
    )
    project = project_rows[0] if project_rows else None

    invoice_query = supabase.table("ar_invoices").select("*").eq("record_status", "ACTIVE")
    invoice_refs = []
    if so_number:
        invoice_refs.append(f"sales_order_ref.eq.{so_number}")
    if project and project.get("project_code"):
        invoice_refs.append(f"project_code.eq.{project.get('project_code')}")
    invoices = invoice_query.or_(",".join(invoice_refs)).execute().data or [] if invoice_refs else []
    if any(row.get("lifecycle_status") != "DRAFT" for row in invoices):
        raise HTTPException(
            status_code=409,
            detail="This sale already has a confirmed invoice. Reverse the AR document before moving it back.",
        )

    if sales_order and sales_order.get("status") == "DELIVERED":
        raise HTTPException(
            status_code=409,
            detail="This sale has already been delivered and cannot be moved back automatically.",
        )

    if project:
        _release_project_allocations(project["project_id"])
        supabase.table("project_materials").update({
            "status": "PLANNED",
            "updated_at": datetime.now().isoformat(),
        }).eq("project_id", project["project_id"]).execute()
        supabase.table("projects").update({
            "status": "CANCELLED",
            "remarks": f"Cancelled after opportunity moved back to {target_stage}",
            "updated_at": datetime.now().isoformat(),
        }).eq("project_id", project["project_id"]).execute()

    archived_invoice_numbers = []
    for invoice in invoices:
        supabase.table("ar_invoices").update({
            "record_status": "ARCHIVED",
            "updated_at": datetime.now().isoformat(),
        }).eq("invoice_id", invoice["invoice_id"]).execute()
        archived_invoice_numbers.append(invoice.get("invoice_number"))

    if sales_order:
        supabase.table("sales_orders").update({
            "status": "CANCELLED",
            "updated_at": datetime.now().isoformat(),
        }).eq("sales_order_id", sales_order["sales_order_id"]).execute()

    next_quote_status = "REJECTED" if target_stage == "Closed Lost" else "SENT"
    if quotation.get("status") in _TERMINAL_QUOTATION_STATUSES:
        supabase.table("quotations").update({
            "status": next_quote_status,
            "updated_at": datetime.now().isoformat(),
        }).eq("quotation_id", quotation["quotation_id"]).execute()
        _log_history(
            quotation["quotation_id"],
            f"STATUS_{next_quote_status}",
            performed_by,
            f"Quotation reset because opportunity moved from Closed Won to {target_stage}",
        )

    write_audit_log(
        action="STATUS_CHANGE",
        module_name="Sales",
        description=f"Reopened Closed Won opportunity #{opportunity_id}; archived draft invoices and released unissued reservations",
        performed_by=performed_by,
        record_id=opportunity_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {
        "quotation": quotation,
        "sales_order": sales_order,
        "project": project,
        "archived_invoices": archived_invoice_numbers,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def list_quotations(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
):
    """List all quotations with client info."""
    req = (
        supabase.table("quotations")
        .select("*, client_list(client_id, company_name)")
        .order("created_at", desc=True)
    )
    if status and status != "All":
        requested_status = _canonical_quotation_status(status)
        if requested_status == QUOTATION_COMPLETE:
            req = req.in_("status", _TERMINAL_QUOTATION_STATUSES)
        else:
            req = req.eq("status", requested_status)
    if company and company != "All":
        req = req.eq("company", company)
    if search:
        req = req.or_(
            f"quotation_no.ilike.%{search}%,"
            f"project_name.ilike.%{search}%"
        )
    rows = req.execute().data or []
    return [_with_invoicing_read_fields(row) for row in rows]


@router.get("/summary")
def quotation_summary():
    """Return counts by status for dashboard cards."""
    all_q = supabase.table("quotations").select("status").execute().data or []
    counts = {}
    for row in all_q:
        s = row["status"]
        counts[s] = counts.get(s, 0) + 1
    counts["TOTAL"] = len(all_q)
    return counts


@router.get("/{quotation_id}")
def get_quotation(quotation_id: int):
    """Get single quotation with items and client info."""
    return _get_quotation_with_items(quotation_id)


@router.get("/{quotation_id}/history")
def get_quotation_history(quotation_id: int):
    """Get revision/action history for a quotation."""
    res = (
        supabase.table("quotation_history")
        .select("*, employees(first_name, last_name, email)")
        .eq("quotation_id", quotation_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data


@router.get("/{quotation_id}/versions")
def get_quotation_versions(quotation_id: int):
    """List all version snapshots for a quotation, newest first."""
    res = (
        supabase.table("quotation_versions")
        .select("version_id, quotation_id, version_number, change_summary, stage_context, created_by, created_at, employees(first_name, last_name, email)")
        .eq("quotation_id", quotation_id)
        .order("version_number", desc=True)
        .execute()
    )
    return res.data or []


@router.get("/{quotation_id}/versions/compare")
def compare_quotation_versions(quotation_id: int, v1: int = Query(...), v2: int = Query(...)):
    """
    Compare two version snapshots. Returns both snapshots plus a diff summary
    highlighting changes in items, pricing, and terms.
    """
    ver1 = (
        supabase.table("quotation_versions")
        .select("*")
        .eq("quotation_id", quotation_id)
        .eq("version_number", v1)
        .single()
        .execute()
    )
    ver2 = (
        supabase.table("quotation_versions")
        .select("*")
        .eq("quotation_id", quotation_id)
        .eq("version_number", v2)
        .single()
        .execute()
    )
    if not ver1.data or not ver2.data:
        raise HTTPException(status_code=404, detail="One or both versions not found")

    snap1 = ver1.data["snapshot"]
    snap2 = ver2.data["snapshot"]

    # Compute diff
    diff = _compute_version_diff(snap1, snap2)

    return {
        "version_a": {"version_number": v1, "snapshot": snap1, "created_at": ver1.data["created_at"]},
        "version_b": {"version_number": v2, "snapshot": snap2, "created_at": ver2.data["created_at"]},
        "diff": diff,
    }


@router.get("/{quotation_id}/versions/{version_number}")
def get_quotation_version(quotation_id: int, version_number: int):
    """Get a single version snapshot (includes full JSONB snapshot)."""
    res = (
        supabase.table("quotation_versions")
        .select("*, employees(first_name, last_name, email)")
        .eq("quotation_id", quotation_id)
        .eq("version_number", version_number)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Version not found")
    return res.data


def _compute_version_diff(snap_a: dict, snap_b: dict) -> dict:
    """Compute a structured diff between two quotation snapshots."""
    # Header field changes
    header_fields = [
        "project_name", "subject", "attn_to", "payment_terms", "delivery_terms", "contact_id",
        "contact_name_snapshot", "contact_job_title_snapshot", "contact_email_snapshot",
        "contact_phone_snapshot",
        "notes", "vat_rate", "wht_rate", "discount_amount", "shipping_cost",
        "others_cost", "validity_date", "scope_of_works", "cancellation_fee",
        "bank_details", "additional_notes",
    ]
    header_changes = []
    for field in header_fields:
        val_a = snap_a.get(field)
        val_b = snap_b.get(field)
        if val_a != val_b:
            header_changes.append({"field": field, "old": val_a, "new": val_b})

    # Item changes
    items_a = snap_a.get("items") or []
    items_b = snap_b.get("items") or []

    # Index items by line_no for comparison
    map_a = {item.get("line_no", i): item for i, item in enumerate(items_a)}
    map_b = {item.get("line_no", i): item for i, item in enumerate(items_b)}

    all_lines = sorted(set(list(map_a.keys()) + list(map_b.keys())))
    item_changes = []
    for line in all_lines:
        a = map_a.get(line)
        b = map_b.get(line)
        if a and not b:
            item_changes.append({"type": "removed", "line_no": line, "item": a})
        elif b and not a:
            item_changes.append({"type": "added", "line_no": line, "item": b})
        elif a and b:
            field_diffs = {}
            compare_fields = ["description", "quantity", "uom", "unit_cost", "selling_price", "discount_percent", "product_code"]
            for f in compare_fields:
                if a.get(f) != b.get(f):
                    field_diffs[f] = {"old": a.get(f), "new": b.get(f)}
            if field_diffs:
                item_changes.append({"type": "modified", "line_no": line, "changes": field_diffs})

    # Totals comparison
    def _calc_subtotal(items):
        return sum(
            (float(it.get("selling_price", 0)) * float(it.get("quantity", 0)))
            * (1 - float(it.get("discount_percent", 0)) / 100)
            for it in items
        )

    subtotal_a = _calc_subtotal(items_a)
    subtotal_b = _calc_subtotal(items_b)

    return {
        "header_changes": header_changes,
        "item_changes": item_changes,
        "totals": {
            "subtotal_a": round(subtotal_a, 2),
            "subtotal_b": round(subtotal_b, 2),
            "delta": round(subtotal_b - subtotal_a, 2),
        },
    }


@router.get("/{quotation_id}/stock-check")
def check_quotation_stock(quotation_id: int):
    """Check entity-owned stock availability for a quotation's DIRECT items.

    The Negotiation step and Closed Won reservation use the same ownership
    scope: only inventory belonging to the quotation's selling company counts.
    """
    q = (
        supabase.table("quotations")
        .select("quotation_id, quotation_no, company")
        .eq("quotation_id", quotation_id)
        .limit(1)
        .execute()
    )
    if not q.data:
        raise HTTPException(status_code=404, detail="Quotation not found")

    selling_entity = _resolve_entity_name(q.data[0].get("company"))
    requirements = _quotation_stock_requirements(quotation_id)
    if not requirements:
        return {"shortages": [], "all_sufficient": True, "entity": selling_entity}

    shortages = []
    for req in requirements:
        product_code = req["product_code"]
        needed = req["quantity"]

        # Skip NEW- prefix items (pending goods receipt)
        if product_code.startswith("NEW-"):
            shortages.append({
                "product_code": product_code,
                "product_name": "Pending item (not yet received)",
                "needed": needed,
                "available": 0,
                "shortage": needed,
                "unit": "Nos",
            })
            continue

        stock_query = (
            supabase.table("inventory_stock")
            .select("quantity_on_hand, reserved_quantity")
            .eq("product_code", product_code)
        )
        if selling_entity:
            stock_query = stock_query.eq("entity", selling_entity)
        stock_rows = stock_query.execute().data or []
        total_available = sum(
            max((row.get("quantity_on_hand") or 0) - (row.get("reserved_quantity") or 0), 0)
            for row in stock_rows
        )

        if total_available < needed:
            # Get product name for display
            product = (
                supabase.table("product_list")
                .select("product_name, unit, fulfillment_type, buying_price_vat")
                .eq("product_code", product_code)
                .limit(1)
                .execute()
                .data or []
            )
            product_name = product[0].get("product_name", product_code) if product else product_code
            unit = product[0].get("unit", "Nos") if product else "Nos"
            fulfillment_type = product[0].get("fulfillment_type", "DIRECT") if product else "DIRECT"
            buying_price = product[0].get("buying_price_vat", 0) if product else 0

            shortages.append({
                "product_code": product_code,
                "product_name": product_name,
                "needed": needed,
                "available": total_available,
                "shortage": needed - total_available,
                "unit": unit,
                "fulfillment_type": fulfillment_type,
                "buying_price": buying_price,
            })

    return {
        "shortages": shortages,
        "all_sufficient": len(shortages) == 0,
        "entity": selling_entity,
    }


@router.get("/{quotation_id}/procurement-status")
def check_procurement_status(quotation_id: int):
    """Check if stock shortages for a quotation have been covered by approved PRs/POs.

    Returns each shortage item with its procurement status:
    - covered_by_pr: PR number if an approved PR covers this item
    - covered_by_po: PO number if a PO has been created for this item
    - status: 'covered' | 'pending_approval' | 'not_covered'
    """
    # Get the shortages first
    stock_result = check_quotation_stock(quotation_id)
    shortages = stock_result.get("shortages", [])
    if not shortages:
        return {"items": [], "all_covered": True}

    # Get the quotation number for matching PR remarks
    q = supabase.table("quotations").select("quotation_no").eq("quotation_id", quotation_id).limit(1).execute()
    quotation_no = q.data[0]["quotation_no"] if q.data else ""

    # Find PRs that reference this quotation (via remarks containing the quotation_no)
    pr_results = supabase.table("purchase_requests").select(
        "purchase_request_id, pr_number, status, remarks"
    ).execute().data or []

    # Filter to PRs that reference this quotation
    relevant_prs = [
        pr for pr in pr_results
        if pr.get("remarks") and quotation_no and quotation_no in pr["remarks"]
    ]
    pr_ids = [pr["purchase_request_id"] for pr in relevant_prs]

    # Get PR items for matching product codes
    pr_items_map = {}  # product_code -> [{pr_number, status, quantity}]
    if pr_ids:
        pr_items = supabase.table("purchase_request_items").select(
            "purchase_request_id, product_code, quantity"
        ).in_("purchase_request_id", pr_ids).execute().data or []

        pr_lookup = {pr["purchase_request_id"]: pr for pr in relevant_prs}
        for item in pr_items:
            code = item.get("product_code")
            if not code:
                continue
            pr = pr_lookup.get(item["purchase_request_id"], {})
            pr_items_map.setdefault(code, []).append({
                "purchase_request_id": pr.get("purchase_request_id"),
                "pr_number": pr.get("pr_number"),
                "pr_status": pr.get("status"),
                "quantity": item.get("quantity", 0),
            })

    # Find POs linked to these PRs
    po_map = {}  # product_code -> [{po_number, status}]
    if pr_ids:
        pos = supabase.table("purchase_orders").select(
            "purchase_order_id, po_number, purchase_request_id, status"
        ).in_("purchase_request_id", pr_ids).execute().data or []

        po_ids = [po["purchase_order_id"] for po in pos]
        po_lookup = {po["purchase_order_id"]: po for po in pos}

        if po_ids:
            po_items = supabase.table("purchase_order_items").select(
                "purchase_order_id, product_code, quantity"
            ).in_("purchase_order_id", po_ids).execute().data or []

            for item in po_items:
                code = item.get("product_code")
                if not code:
                    continue
                po = po_lookup.get(item["purchase_order_id"], {})
                po_map.setdefault(code, []).append({
                    "po_number": po.get("po_number"),
                    "po_status": po.get("status"),
                    "quantity": item.get("quantity", 0),
                })

    # Build result per shortage item
    items = []
    for s in shortages:
        code = s["product_code"]
        pr_coverage = pr_items_map.get(code, [])
        po_coverage = po_map.get(code, [])

        # Determine status — exclude rejected/cancelled
        REJECTED_STATUSES = ("rejected", "cancelled", "canceled", "void", "closed")
        active_pos = [po for po in po_coverage if po.get("po_status", "").lower() not in REJECTED_STATUSES]
        active_prs = [pr for pr in pr_coverage if pr.get("pr_status", "").lower() not in REJECTED_STATUSES]

        has_approved_po = any(po.get("po_status", "").lower() in ("approved", "sent", "received", "partial", "created", "open", "ordered") for po in active_pos)
        has_pr_with_po = any(pr.get("pr_status", "").lower() in ("po_created", "completed", "fulfilled") for pr in active_prs) and len(active_pos) > 0
        has_approved_pr = any(pr.get("pr_status", "").lower() in ("approved",) for pr in active_prs)
        has_pending_pr = any(pr.get("pr_status", "").lower() in ("submitted", "pending", "draft") for pr in active_prs)

        if has_approved_po or has_pr_with_po:
            status = "covered"
            if active_pos:
                proof = f"PO: {active_pos[0]['po_number']}"
            else:
                proof = f"PR: {active_prs[0]['pr_number']} (PO Created)"
        elif has_approved_pr:
            status = "covered"
            proof = f"PR: {active_prs[0]['pr_number']} (Approved)"
        elif has_pending_pr:
            status = "pending_approval"
            proof = f"PR: {active_prs[0]['pr_number']} (Awaiting Approval)"
        else:
            status = "not_covered"
            proof = None

        items.append({
            **s,
            "procurement_status": status,
            "proof": proof,
            "pr_references": [
                {
                    "purchase_request_id": p.get("purchase_request_id"),
                    "pr_number": p["pr_number"],
                    "status": p["pr_status"],
                }
                for p in pr_coverage
            ],
            "po_references": [{"po_number": p["po_number"], "status": p["po_status"]} for p in po_coverage],
        })

    all_covered = all(item["procurement_status"] == "covered" for item in items)
    return {"items": items, "all_covered": all_covered}


@router.post("/", status_code=201)
def create_quotation(request: Request, payload: QuotationCreate):
    """Create a new quotation in DRAFT status."""
    _, performed_by = _extract_jwt_claims(request)
    catalog_entity = _catalog_entity_for_company(payload.company)
    _validate_catalog_products(payload.items, catalog_entity)

    quotation_no = _generate_quotation_no(payload.company if hasattr(payload, "company") else None)

    # Resolve employee_id for prepared_by
    emp = supabase.table("employees").select("employee_id").eq("email", performed_by).limit(1).execute()
    prepared_by_id = emp.data[0]["employee_id"] if emp.data else None

    header = payload.model_dump(exclude={"items"})
    contact_snapshot = quotation_contact_snapshot(payload.client_id, payload.contact_id)
    header.update(contact_snapshot)
    if contact_snapshot["contact_name_snapshot"]:
        header["attn_to"] = contact_snapshot["contact_name_snapshot"]
    header["quotation_no"] = quotation_no
    header["prepared_by"] = prepared_by_id
    if not header.get("opportunity_id"):
        resolved_opportunity_id = _resolve_related_opportunity_id(header)
        if resolved_opportunity_id:
            header["opportunity_id"] = resolved_opportunity_id
    # validity_date = today + validity_days
    validity_days = int(header.get("validity_days", 30) or 30)
    header["validity_date"] = (date.today() + timedelta(days=validity_days)).isoformat()

    try:
        res = supabase.table("quotations").insert(header).execute()
    except Exception:
        # Retry without scope_line fields if columns don't exist yet
        for key in list(header.keys()):
            if key.startswith('scope_line_'):
                del header[key]
        res = supabase.table("quotations").insert(header).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create quotation")

    quotation = res.data[0]
    qid = quotation["quotation_id"]

    # Insert line items
    if payload.items:
        items_data = []
        for idx, item in enumerate(payload.items, start=1):
            d = item.model_dump()
            d["quotation_id"] = qid
            d["line_no"] = idx
            items_data.append(d)
        supabase.table("quotation_items").insert(items_data).execute()

    _log_history(qid, "CREATED", performed_by, f"Quotation {quotation_no} created")
    _set_related_opportunity_stage(quotation, "Proposal", performed_by, request)

    # Create initial version snapshot (v1 = original saved state)
    _create_version_snapshot(
        qid,
        performed_by,
        change_summary="Initial version",
        stage_context="DRAFT",
    )

    write_audit_log(
        action="CREATE",
        module_name="Quotations",
        description=f"Created quotation {quotation_no} for project '{payload.project_name}'",
        performed_by=performed_by,
        record_id=qid,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return _get_quotation_with_items(qid)


@router.patch("/{quotation_id}")
def update_quotation(quotation_id: int, request: Request, payload: QuotationUpdate):
    """Update quotation header and optionally replace items."""
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("quotations")
        .select("*")
        .eq("quotation_id", quotation_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Quotation not found")

    catalog_entity = _catalog_entity_for_company(
        payload.company if payload.company is not None else existing.data.get("company")
    )
    if payload.items is not None:
        _validate_catalog_products(payload.items, catalog_entity)

    # Build update payload
    updates = payload.model_dump(exclude_unset=True, exclude={"items", "change_summary"})
    if "validity_date" in updates and not updates["validity_date"]:
        del updates["validity_date"]
    # Remove empty scope_line fields to avoid issues if columns don't exist yet
    for key in list(updates.keys()):
        if key.startswith('scope_line_') and not updates[key]:
            del updates[key]
    if "contact_id" in updates or ("client_id" in updates and existing.data.get("contact_id")):
        effective_client_id = updates.get("client_id", existing.data["client_id"])
        effective_contact_id = updates.get("contact_id", existing.data.get("contact_id"))
        contact_snapshot = quotation_contact_snapshot(effective_client_id, effective_contact_id)
        updates.update(contact_snapshot)
        if contact_snapshot["contact_name_snapshot"]:
            updates["attn_to"] = contact_snapshot["contact_name_snapshot"]
    if "opportunity_id" not in updates and ("client_id" in updates or "project_name" in updates):
        merged = {**existing.data, **updates}
        resolved_opportunity_id = _resolve_related_opportunity_id(merged)
        if resolved_opportunity_id:
            updates["opportunity_id"] = resolved_opportunity_id
    updates["updated_at"] = datetime.now().isoformat()

    # Automatically set status to FOR_APPROVAL when quotation is edited
    updates["status"] = "FOR_APPROVAL"

    # Reset any existing workflow approval record back to Pending
    try:
        supabase.table("workflow_approvals").update(
            {"status": "Pending"}
        ).eq("reference_module", "Quotations").eq("reference_id", quotation_id).eq("status", "Approved").execute()
    except Exception:
        pass  # Non-critical, continue with update

    if updates:
        try:
            supabase.table("quotations").update(updates).eq("quotation_id", quotation_id).execute()
        except Exception:
            # If update fails (possibly due to missing columns), retry without scope_line fields
            for key in list(updates.keys()):
                if key.startswith('scope_line_'):
                    del updates[key]
            if updates:
                supabase.table("quotations").update(updates).eq("quotation_id", quotation_id).execute()

    # Replace items if provided
    if payload.items is not None:
        # Try delete-and-replace first; if FK constraint blocks it, update in-place
        try:
            supabase.table("quotation_items").delete().eq("quotation_id", quotation_id).execute()
            if payload.items:
                items_data = []
                for idx, item in enumerate(payload.items, start=1):
                    d = item.model_dump()
                    d["quotation_id"] = quotation_id
                    d["line_no"] = idx
                    items_data.append(d)
                supabase.table("quotation_items").insert(items_data).execute()
        except Exception:
            # FK constraint — items are linked to sales orders. Update existing, add new, remove unlinked.
            existing_items = (
                supabase.table("quotation_items")
                .select("item_id, line_no")
                .eq("quotation_id", quotation_id)
                .order("line_no")
                .execute()
            ).data or []
            existing_ids = [ei["item_id"] for ei in existing_items]

            # Update or insert each item by line_no position
            for idx, item in enumerate(payload.items, start=1):
                d = item.model_dump()
                d["quotation_id"] = quotation_id
                d["line_no"] = idx
                if idx <= len(existing_ids):
                    # Update existing item in place
                    supabase.table("quotation_items").update(d).eq("item_id", existing_ids[idx - 1]).execute()
                else:
                    # Insert new item
                    supabase.table("quotation_items").insert(d).execute()

            # Remove extra items that are no longer needed (only if not FK-linked)
            if len(payload.items) < len(existing_ids):
                for old_id in existing_ids[len(payload.items):]:
                    try:
                        supabase.table("quotation_items").delete().eq("item_id", old_id).execute()
                    except Exception:
                        pass  # Skip if FK-linked

    _log_history(quotation_id, "UPDATED", performed_by, "Quotation updated")

    # Auto-snapshot version on every meaningful edit
    _create_version_snapshot(
        quotation_id,
        performed_by,
        change_summary=payload.change_summary or "Quotation updated",
        stage_context=existing.data.get("status"),
    )

    write_audit_log(
        action="UPDATE",
        module_name="Quotations",
        description=f"Updated quotation {existing.data['quotation_no']}",
        performed_by=performed_by,
        record_id=quotation_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return _get_quotation_with_items(quotation_id)


@router.post("/{quotation_id}/status")
def update_status(quotation_id: int, request: Request, payload: StatusUpdate):
    """Transition quotation status through approval, sending, and completion."""
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("quotations")
        .select("*")
        .eq("quotation_id", quotation_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Quotation not found")

    current = _canonical_quotation_status(existing.data["status"])
    new_status = _canonical_quotation_status(payload.status.strip().upper())

    # CONVERTED remains an input alias during rollout, but COMPLETE is the only
    # new terminal state written by the application.
    valid_transitions = {
        "DRAFT": ["FOR_APPROVAL"],
        "FOR_APPROVAL": ["APPROVED", "REJECTED"],
        "APPROVED": ["SENT"],
        "SENT": [QUOTATION_COMPLETE, "REJECTED"],
        "REJECTED": ["DRAFT"],  # Allow re-drafting
    }
    if new_status not in valid_transitions.get(current, []):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from {current} to {new_status}",
        )

    # COMPLETE is persisted only by run_closed_won_automation after every
    # downstream record is successfully created.
    if new_status != QUOTATION_COMPLETE:
        update_data = {"status": new_status, "updated_at": datetime.now().isoformat()}

        if new_status == "APPROVED":
            emp = supabase.table("employees").select("employee_id").eq("email", performed_by).limit(1).execute()
            if emp.data:
                update_data["approved_by"] = emp.data[0]["employee_id"]
            update_data["approved_at"] = datetime.now().isoformat()
            try:
                supabase.table("workflow_approvals").update({"status": "Approved", "decided_at": datetime.now().isoformat()}).eq("reference_module", "Quotations").eq("reference_number", existing.data.get("quotation_no")).eq("status", "Pending").execute()
            except Exception:
                pass
        elif new_status == "REJECTED":
            try:
                supabase.table("workflow_approvals").update({"status": "Rejected", "decided_at": datetime.now().isoformat()}).eq("reference_module", "Quotations").eq("reference_number", existing.data.get("quotation_no")).eq("status", "Pending").execute()
            except Exception:
                pass
        elif new_status == "SENT":
            update_data["sent_at"] = datetime.now().isoformat()

        supabase.table("quotations").update(update_data).eq("quotation_id", quotation_id).execute()

        if new_status == "FOR_APPROVAL":
            try:
                existing_approval = supabase.table("workflow_approvals").select("approval_id").eq("reference_module", "Quotations").eq("reference_number", existing.data.get("quotation_no")).eq("status", "Pending").execute().data
                if not existing_approval:
                    supabase.table("workflow_approvals").insert({
                        "request_type": "Quotation Approval",
                        "entity": existing.data.get("company") or None,
                        "reference_module": "Quotations",
                        "reference_id": quotation_id,
                        "reference_number": existing.data.get("quotation_no"),
                        "requestor_name": performed_by,
                        "amount": existing.data.get("grand_total") or existing.data.get("subtotal"),
                        "status": "Pending",
                        "priority": "Normal",
                        "submitted_at": datetime.now().isoformat(),
                    }).execute()
            except Exception:
                pass  # Don't block the status change if approval creation fails

        details = f"Status changed: {current} → {new_status}"
        if payload.remarks:
            details += f" | Remarks: {payload.remarks}"
        _log_history(quotation_id, f"STATUS_{new_status}", performed_by, details)

        if new_status in ("FOR_APPROVAL", "APPROVED", "SENT"):
            _create_version_snapshot(
                quotation_id,
                performed_by,
                change_summary=f"Status: {current} → {new_status}",
                stage_context=new_status,
            )

        write_audit_log(
            action="STATUS_CHANGE",
            module_name="Quotations",
            description=f"Quotation {existing.data['quotation_no']} status: {current} → {new_status}",
            performed_by=performed_by,
            record_id=quotation_id,
            ip_address=request.client.host if request.client else None,
            request=request,
        )

    if new_status == "SENT":
        _set_related_opportunity_stage(existing.data, "Negotiation", performed_by, request)
    elif new_status == QUOTATION_COMPLETE:
        opportunity = _find_related_opportunity(existing.data)
        if not opportunity:
            raise HTTPException(
                status_code=409,
                detail="A quotation must be linked to an opportunity before it can be completed.",
            )
        run_closed_won_automation(opportunity["opportunity_id"], performed_by, request)
        _set_related_opportunity_stage(existing.data, "Closed Won", performed_by, request)
    elif new_status == "REJECTED" and current == "SENT":
        _set_related_opportunity_stage(existing.data, "Negotiation", performed_by, request)
        _create_rejected_followup_draft(quotation_id, performed_by, request)

    return _get_quotation_with_items(quotation_id)


@router.post("/{quotation_id}/revise")
def revise_quotation(quotation_id: int, request: Request):
    """Create a new revision of an existing quotation."""
    _, performed_by = _extract_jwt_claims(request)

    existing = _get_quotation_with_items(quotation_id)
    if existing["status"] not in ("APPROVED", "SENT", "REJECTED"):
        raise HTTPException(status_code=400, detail="Only APPROVED, SENT, or REJECTED quotations can be revised")

    # Determine base quotation number (strip any -R{n} suffix)
    base_no = re.sub(r'-R\d+$', '', existing["quotation_no"])

    # Find the highest revision number for this base quotation number
    all_revisions = (
        supabase.table("quotations")
        .select("revision_no")
        .like("quotation_no", f"{base_no}%")
        .order("revision_no", desc=True)
        .limit(1)
        .execute()
    )
    max_rev = all_revisions.data[0]["revision_no"] if all_revisions.data else existing["revision_no"]
    new_rev = max_rev + 1

    emp = supabase.table("employees").select("employee_id").eq("email", performed_by).limit(1).execute()
    prepared_by_id = emp.data[0]["employee_id"] if emp.data else None

    new_header = {
        "quotation_no": f"{base_no}-R{new_rev}",
        "revision_no": new_rev,
        "client_id": existing["client_id"],
        "contact_id": existing.get("contact_id"),
        "project_name": existing["project_name"],
        "subject": existing["subject"],
        "attn_to": existing["attn_to"],
        "contact_name_snapshot": existing.get("contact_name_snapshot"),
        "contact_job_title_snapshot": existing.get("contact_job_title_snapshot"),
        "contact_email_snapshot": existing.get("contact_email_snapshot"),
        "contact_phone_snapshot": existing.get("contact_phone_snapshot"),
        "validity_date": existing["validity_date"],
        "payment_terms": existing["payment_terms"],
        "delivery_terms": existing["delivery_terms"],
        "notes": existing["notes"],
        "vat_rate": existing["vat_rate"],
        "wht_rate": existing["wht_rate"],
        "discount_amount": existing["discount_amount"],
        "shipping_cost": existing["shipping_cost"],
        "others_cost": existing["others_cost"],
        "prepared_by": prepared_by_id,
        "parent_quotation_id": quotation_id,
        "status": "DRAFT",
    }

    res = supabase.table("quotations").insert(new_header).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create revision")

    new_qid = res.data[0]["quotation_id"]

    # Copy items
    if existing.get("items"):
        items_data = []
        for item in existing["items"]:
            items_data.append({
                "quotation_id": new_qid,
                "line_no": item["line_no"],
                "product_type": item["product_type"],
                "product_code": item["product_code"],
                "description": item["description"],
                "datasheet_link": item["datasheet_link"],
                "quantity": item["quantity"],
                "uom": item["uom"],
                "unit_cost": item["unit_cost"],
                "selling_price": item["selling_price"],
                "discount_percent": item["discount_percent"],
            })
        supabase.table("quotation_items").insert(items_data).execute()

    _log_history(new_qid, "REVISED", performed_by, f"Revision {new_rev} created from quotation #{quotation_id}")
    _log_history(quotation_id, "REVISED", performed_by, f"New revision {new_rev} created as #{new_qid}")

    write_audit_log(
        action="REVISE",
        module_name="Quotations",
        description=f"Created revision {new_rev} of quotation {existing['quotation_no']}",
        performed_by=performed_by,
        record_id=new_qid,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return _get_quotation_with_items(new_qid)


@router.delete("/{quotation_id}", status_code=204)
def delete_quotation(quotation_id: int, request: Request):
    """Delete a DRAFT quotation."""
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("quotations")
        .select("quotation_id, quotation_no, status")
        .eq("quotation_id", quotation_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if existing.data["status"] != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT quotations can be deleted")

    supabase.table("quotations").delete().eq("quotation_id", quotation_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="Quotations",
        description=f"Deleted quotation {existing.data['quotation_no']}",
        performed_by=performed_by,
        record_id=quotation_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None
