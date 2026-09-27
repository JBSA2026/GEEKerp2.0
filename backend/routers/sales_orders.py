from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from database import supabase


router = APIRouter(prefix="/sales-orders", tags=["sales-orders"])

MODULE_NAME = "Sales Orders"


def _num(value) -> float:
    return float(value or 0)


def _employee_id_for_email(email: Optional[str]) -> Optional[int]:
    if not email:
        return None
    rows = (
        supabase.table("employees")
        .select("employee_id")
        .eq("email", email)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0]["employee_id"] if rows else None


def _next_so_number(entity: str = None) -> str:
    """Generate next SO number using the standard code format: COMPANY-YYYY-SO-NNNN."""
    from utils.code_generator import generate_code
    return generate_code(entity, "SO", "sales_orders", "so_number")


def _quotation_header(quotation_id: int) -> dict:
    rows = (
        supabase.table("quotations")
        .select("*")
        .eq("quotation_id", quotation_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return rows[0]


def _quotation_lines(quotation_id: int) -> list[dict]:
    return (
        supabase.table("quotation_items")
        .select("*")
        .eq("quotation_id", quotation_id)
        .order("line_no")
        .execute()
        .data
        or []
    )


def _sales_order_totals(quotation: dict, lines: list[dict]) -> dict:
    subtotal = 0.0
    for line in lines:
        qty = max(_num(line.get("quantity")), 0)
        selling = _num(line.get("selling_price")) or _num(line.get("unit_cost"))
        discount = min(max(_num(line.get("discount_percent")), 0), 100)
        subtotal += qty * selling * (1 - discount / 100)

    discount_amount = min(max(_num(quotation.get("discount_amount")), 0), subtotal)
    taxable_subtotal = subtotal - discount_amount
    vat_amount = taxable_subtotal * max(_num(quotation.get("vat_rate")), 0) / 100
    wht_amount = taxable_subtotal * max(_num(quotation.get("wht_rate")), 0) / 100
    shipping_cost = max(_num(quotation.get("shipping_cost")), 0)
    others_cost = max(_num(quotation.get("others_cost")), 0)
    grand_total = subtotal + vat_amount - wht_amount - discount_amount + shipping_cost + others_cost

    return {
        "subtotal": round(subtotal, 2),
        "vat_amount": round(vat_amount, 2),
        "wht_amount": round(wht_amount, 2),
        "discount_amount": round(discount_amount, 2),
        "shipping_cost": round(shipping_cost, 2),
        "others_cost": round(others_cost, 2),
        "grand_total": round(grand_total, 2),
    }


def _split_line_allocations(line: dict, allocations_by_product: dict[str, list[dict]]) -> list[dict]:
    product_code = (line.get("product_code") or "").strip()
    quantity_left = _num(line.get("quantity"))
    if not product_code or quantity_left <= 0:
        return [{"quantity": quantity_left, "allocation": None}]

    pieces = []
    product_allocations = allocations_by_product.get(product_code, [])
    while quantity_left > 0 and product_allocations:
        allocation = product_allocations[0]
        available = _num(allocation.get("_remaining"))
        if available <= 0:
            product_allocations.pop(0)
            continue
        qty = min(quantity_left, available)
        allocation["_remaining"] = available - qty
        pieces.append({"quantity": qty, "allocation": allocation})
        quantity_left -= qty
        if allocation["_remaining"] <= 0:
            product_allocations.pop(0)

    if quantity_left > 0:
        pieces.append({"quantity": quantity_left, "allocation": None})
    return pieces


def _build_sales_order_items(
    sales_order_id: int,
    quotation_id: int,
    reservation_plan: list[dict],
    line_fulfillment_map: dict[str, str] | None = None,
) -> list[dict]:
    allocations_by_product: dict[str, list[dict]] = {}
    for allocation in reservation_plan or []:
        row = {**allocation, "_remaining": _num(allocation.get("quantity"))}
        allocations_by_product.setdefault(row.get("product_code"), []).append(row)

    item_rows = []
    for line in _quotation_lines(quotation_id):
        if line.get("is_section"):
            continue
        product_code = (line.get("product_code") or "").strip() or None
        product_type = (line.get("product_type") or "").strip().upper()

        # Resolve fulfillment type for this line
        item_id_str = str(line.get("item_id"))
        fulfillment_type = "DIRECT"
        if line_fulfillment_map and item_id_str in line_fulfillment_map:
            fulfillment_type = line_fulfillment_map[item_id_str]
        elif product_type == "SERVICE":
            fulfillment_type = "SERVICE"

        # Determine initial fulfillment status based on type
        if fulfillment_type == "MTO":
            fulfillment_status = "IN_PRODUCTION"
        elif fulfillment_type == "SERVICE":
            fulfillment_status = "READY_TO_FULFILL"
        else:
            # DIRECT: READY_TO_FULFILL if stock reserved, PENDING otherwise
            fulfillment_status = "PENDING"

        is_inventory_line = (
            bool(product_code)
            and not line.get("is_section")
            and fulfillment_type == "DIRECT"
        )

        for piece in _split_line_allocations(line, allocations_by_product):
            quantity = _num(piece.get("quantity"))
            allocation = piece.get("allocation") or {}

            # If DIRECT and has allocation, mark as READY_TO_FULFILL
            piece_status = fulfillment_status
            if fulfillment_type == "DIRECT" and allocation:
                piece_status = "READY_TO_FULFILL"

            item_rows.append({
                "sales_order_id": sales_order_id,
                "quotation_item_id": line.get("item_id"),
                "line_no": line.get("line_no") or 1,
                "product_code": product_code,
                "description": line.get("description") or product_code or "",
                "quantity_ordered": quantity,
                "quantity_reserved": quantity if is_inventory_line and allocation else 0,
                "quantity_delivered": 0,
                "uom": line.get("uom") or "Nos",
                "unit_cost": _num(line.get("unit_cost")),
                "selling_price": _num(line.get("selling_price")) or _num(line.get("unit_cost")),
                "discount_percent": _num(line.get("discount_percent")),
                "warehouse_id": allocation.get("warehouse_id"),
                "allocated_stock_id": allocation.get("stock_id"),
                "fulfillment_type": fulfillment_type,
                "fulfillment_status": piece_status,
            })
    return item_rows


def get_sales_order_for_quotation(quotation_id: int) -> Optional[dict]:
    rows = (
        supabase.table("sales_orders")
        .select("*")
        .eq("quotation_id", quotation_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def create_or_update_from_quotation(
    quotation_id: int,
    reservation_plan: list[dict],
    performed_by: Optional[str] = None,
    order_type: str = "DIRECT",
    line_fulfillment_map: dict[str, str] | None = None,
) -> dict:
    quotation = _quotation_header(quotation_id)
    lines = _quotation_lines(quotation_id)
    totals = _sales_order_totals(quotation, lines)
    employee_id = _employee_id_for_email(performed_by)

    # Determine SO status based on order type
    if order_type == "MTO":
        so_status = "IN_PRODUCTION"
    elif order_type == "MIXED":
        so_status = "IN_PRODUCTION"
    else:
        so_status = "RESERVED"

    existing = get_sales_order_for_quotation(quotation_id)
    header = {
        "quotation_no": quotation.get("quotation_no"),
        "client_id": quotation.get("client_id"),
        "project_name": quotation.get("project_name"),
        "order_date": date.today().isoformat(),
        "status": so_status,
        "order_type": order_type,
        "prepared_by": employee_id,
        "entity": quotation.get("company") or None,
        "remarks": f"Created from accepted quotation {quotation.get('quotation_no')}",
        **totals,
    }

    if existing:
        if existing.get("status") == "DELIVERED":
            return existing
        updated = (
            supabase.table("sales_orders")
            .update({**header, "updated_at": datetime.now().isoformat()})
            .eq("sales_order_id", existing["sales_order_id"])
            .execute()
        )
        sales_order = updated.data[0] if updated.data else {**existing, **header}
        supabase.table("sales_order_items").delete().eq("sales_order_id", sales_order["sales_order_id"]).execute()
    else:
        created = supabase.table("sales_orders").insert({
            **header,
            "so_number": _next_so_number(quotation.get("company")),
            "quotation_id": quotation_id,
        }).execute()
        if not created.data:
            raise HTTPException(status_code=400, detail="Unable to create sales order")
        sales_order = created.data[0]

    item_rows = _build_sales_order_items(
        sales_order["sales_order_id"],
        quotation_id,
        reservation_plan,
        line_fulfillment_map,
    )
    if item_rows:
        supabase.table("sales_order_items").insert(item_rows).execute()
    return sales_order


def mark_delivered_for_quotation(
    quotation_id: int,
    performed_by: Optional[str] = None,
) -> dict:
    sales_order = get_sales_order_for_quotation(quotation_id)
    if not sales_order:
        raise HTTPException(status_code=400, detail="Sales order not found for this quotation")
    employee_id = _employee_id_for_email(performed_by)
    now = datetime.now().isoformat()
    updated = (
        supabase.table("sales_orders")
        .update({
            "status": "DELIVERED",
            "delivery_date": date.today().isoformat(),
            "delivered_by": employee_id,
            "delivered_at": now,
            "updated_at": now,
        })
        .eq("sales_order_id", sales_order["sales_order_id"])
        .execute()
    )
    sales_order = updated.data[0] if updated.data else sales_order

    items = (
        supabase.table("sales_order_items")
        .select("sales_order_item_id, quantity_ordered")
        .eq("sales_order_id", sales_order["sales_order_id"])
        .execute()
        .data
        or []
    )
    for item in items:
        supabase.table("sales_order_items").update({
            "quantity_delivered": _num(item.get("quantity_ordered")),
            "updated_at": now,
        }).eq("sales_order_item_id", item["sales_order_item_id"]).execute()
    return sales_order


@router.get("/")
def list_sales_orders(search: Optional[str] = Query(None), status: Optional[str] = Query(None)):
    req = (
        supabase.table("sales_orders")
        .select("*, client_list(client_id, company_name)")
        .order("created_at", desc=True)
    )
    if status and status != "All":
        req = req.eq("status", status)
    if search:
        req = req.or_(f"so_number.ilike.%{search}%,quotation_no.ilike.%{search}%,project_name.ilike.%{search}%")
    return req.execute().data or []


@router.get("/{sales_order_id}")
def get_sales_order(sales_order_id: int):
    rows = (
        supabase.table("sales_orders")
        .select("*, client_list(client_id, company_name)")
        .eq("sales_order_id", sales_order_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Sales order not found")
    sales_order = rows[0]
    sales_order["items"] = (
        supabase.table("sales_order_items")
        .select("*")
        .eq("sales_order_id", sales_order_id)
        .order("line_no")
        .execute()
        .data
        or []
    )
    # Include testing records if any MTO items exist
    has_mto = any(
        (item.get("fulfillment_type") or "DIRECT") == "MTO"
        for item in sales_order["items"]
    )
    if has_mto:
        sales_order["testing_records"] = (
            supabase.table("sales_order_testing")
            .select("*, employees!sales_order_testing_tested_by_fkey(first_name, last_name)")
            .eq("sales_order_id", sales_order_id)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
    else:
        sales_order["testing_records"] = []
    return sales_order


# ── MTO Lifecycle Endpoints ──────────────────────────────────────────────────

# Valid MTO status transitions
MTO_TRANSITIONS = {
    "IN_PRODUCTION": ["TESTING"],
    "TESTING": ["IN_PRODUCTION", "AWAITING_ACCEPTANCE"],  # Can go back to production on test failure
    "AWAITING_ACCEPTANCE": ["TESTING", "DELIVERED"],  # Can go back to testing if client rejects
}


def _get_so_item(sales_order_id: int, item_id: int) -> dict:
    """Fetch a single SO item, verifying it belongs to the given SO."""
    rows = (
        supabase.table("sales_order_items")
        .select("*")
        .eq("sales_order_item_id", item_id)
        .eq("sales_order_id", sales_order_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Sales order item not found")
    return rows[0]


def _update_so_header_status(sales_order_id: int) -> None:
    """Recalculate the SO header status based on its line items.

    Rules:
    - All items DELIVERED → SO is DELIVERED
    - Any item IN_PRODUCTION or TESTING → SO is IN_PRODUCTION
    - Any item AWAITING_ACCEPTANCE → SO is IN_PRODUCTION (still in progress)
    - All DIRECT items READY_TO_FULFILL and no MTO items pending → SO is RESERVED
    """
    items = (
        supabase.table("sales_order_items")
        .select("fulfillment_status, fulfillment_type")
        .eq("sales_order_id", sales_order_id)
        .execute()
        .data
        or []
    )
    if not items:
        return

    statuses = {item.get("fulfillment_status") for item in items}

    if statuses == {"DELIVERED"}:
        new_status = "DELIVERED"
    elif statuses <= {"DELIVERED", "CANCELLED"}:
        new_status = "DELIVERED"
    elif "IN_PRODUCTION" in statuses or "TESTING" in statuses or "AWAITING_ACCEPTANCE" in statuses:
        new_status = "IN_PRODUCTION"
    elif statuses <= {"READY_TO_FULFILL", "DELIVERED", "CANCELLED"}:
        new_status = "RESERVED"
    else:
        new_status = "IN_PRODUCTION"

    supabase.table("sales_orders").update({
        "status": new_status,
        "updated_at": datetime.now().isoformat(),
    }).eq("sales_order_id", sales_order_id).execute()


@router.post("/{sales_order_id}/items/{item_id}/submit-testing")
def submit_for_testing(sales_order_id: int, item_id: int):
    """Transition an MTO item from IN_PRODUCTION to TESTING."""
    item = _get_so_item(sales_order_id, item_id)

    if item.get("fulfillment_type") != "MTO":
        raise HTTPException(status_code=400, detail="Only MTO items can be submitted for testing")

    current_status = item.get("fulfillment_status")
    if current_status != "IN_PRODUCTION":
        raise HTTPException(
            status_code=400,
            detail=f"Item must be IN_PRODUCTION to submit for testing (current: {current_status})"
        )

    supabase.table("sales_order_items").update({
        "fulfillment_status": "TESTING",
        "updated_at": datetime.now().isoformat(),
    }).eq("sales_order_item_id", item_id).execute()

    _update_so_header_status(sales_order_id)

    return {"status": "TESTING", "sales_order_item_id": item_id}


class TestResultPayload(BaseModel):
    test_result: str  # PASSED, FAILED, PARTIAL
    remarks: Optional[str] = None
    tested_by_email: Optional[str] = None


@router.post("/{sales_order_id}/items/{item_id}/test-result")
def record_test_result(sales_order_id: int, item_id: int, payload: TestResultPayload):
    """Record a test result for an MTO item.

    - PASSED → moves item to AWAITING_ACCEPTANCE
    - FAILED → moves item back to IN_PRODUCTION
    - PARTIAL → stays in TESTING (needs more work/retesting)
    """
    item = _get_so_item(sales_order_id, item_id)

    if item.get("fulfillment_type") != "MTO":
        raise HTTPException(status_code=400, detail="Only MTO items can have test results")

    if item.get("fulfillment_status") != "TESTING":
        raise HTTPException(status_code=400, detail="Item must be in TESTING status to record a result")

    if payload.test_result not in ("PASSED", "FAILED", "PARTIAL"):
        raise HTTPException(status_code=400, detail="test_result must be PASSED, FAILED, or PARTIAL")

    # Resolve tested_by employee
    tested_by_id = _employee_id_for_email(payload.tested_by_email)

    # Insert testing record
    test_record = {
        "sales_order_id": sales_order_id,
        "sales_order_item_id": item_id,
        "test_date": date.today().isoformat(),
        "tested_by": tested_by_id,
        "test_result": payload.test_result,
        "remarks": payload.remarks,
    }
    supabase.table("sales_order_testing").insert(test_record).execute()

    # Transition item status based on result
    if payload.test_result == "PASSED":
        new_status = "AWAITING_ACCEPTANCE"
    elif payload.test_result == "FAILED":
        new_status = "IN_PRODUCTION"
    else:  # PARTIAL
        new_status = "TESTING"

    supabase.table("sales_order_items").update({
        "fulfillment_status": new_status,
        "updated_at": datetime.now().isoformat(),
    }).eq("sales_order_item_id", item_id).execute()

    _update_so_header_status(sales_order_id)

    return {
        "status": new_status,
        "test_result": payload.test_result,
        "sales_order_item_id": item_id,
    }


class ClientAcceptancePayload(BaseModel):
    accepted: bool
    remarks: Optional[str] = None
    accepted_by_email: Optional[str] = None


@router.post("/{sales_order_id}/items/{item_id}/client-acceptance")
def record_client_acceptance(sales_order_id: int, item_id: int, payload: ClientAcceptancePayload):
    """Record client acceptance/rejection for an MTO item after testing.

    - Accepted → moves to DELIVERED and triggers AR invoice eligibility
    - Rejected → moves back to TESTING (client wants changes)
    """
    item = _get_so_item(sales_order_id, item_id)

    if item.get("fulfillment_type") != "MTO":
        raise HTTPException(status_code=400, detail="Only MTO items can have client acceptance")

    if item.get("fulfillment_status") != "AWAITING_ACCEPTANCE":
        raise HTTPException(status_code=400, detail="Item must be in AWAITING_ACCEPTANCE status")

    accepted_by_id = _employee_id_for_email(payload.accepted_by_email)
    now = datetime.now().isoformat()

    # Update the latest test record with acceptance info
    latest_test = (
        supabase.table("sales_order_testing")
        .select("test_id")
        .eq("sales_order_item_id", item_id)
        .eq("test_result", "PASSED")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if latest_test:
        supabase.table("sales_order_testing").update({
            "client_accepted": payload.accepted,
            "accepted_at": now if payload.accepted else None,
            "accepted_by": accepted_by_id,
            "updated_at": now,
        }).eq("test_id", latest_test[0]["test_id"]).execute()

    if payload.accepted:
        new_status = "DELIVERED"
        # Update item as delivered
        supabase.table("sales_order_items").update({
            "fulfillment_status": new_status,
            "quantity_delivered": _num(item.get("quantity_ordered")),
            "updated_at": now,
        }).eq("sales_order_item_id", item_id).execute()
    else:
        # Client rejected — back to testing
        new_status = "TESTING"
        # Create a new test record noting the rejection
        supabase.table("sales_order_testing").insert({
            "sales_order_id": sales_order_id,
            "sales_order_item_id": item_id,
            "test_date": date.today().isoformat(),
            "tested_by": accepted_by_id,
            "test_result": "FAILED",
            "remarks": f"Client rejected: {payload.remarks or 'No reason given'}",
        }).execute()
        supabase.table("sales_order_items").update({
            "fulfillment_status": new_status,
            "updated_at": now,
        }).eq("sales_order_item_id", item_id).execute()

    _update_so_header_status(sales_order_id)

    return {
        "status": new_status,
        "accepted": payload.accepted,
        "sales_order_item_id": item_id,
    }


@router.post("/{sales_order_id}/items/{item_id}/deliver")
def deliver_item(sales_order_id: int, item_id: int):
    """Mark a DIRECT or SERVICE item as delivered.

    For DIRECT items with stock reservations, this does NOT issue inventory
    (that happens at full SO delivery via mark_delivered_for_quotation).
    This just updates the line-level fulfillment status.
    """
    item = _get_so_item(sales_order_id, item_id)
    fulfillment_type = item.get("fulfillment_type") or "DIRECT"
    current_status = item.get("fulfillment_status")

    # MTO items must go through testing → acceptance flow
    if fulfillment_type == "MTO" and current_status != "AWAITING_ACCEPTANCE":
        raise HTTPException(
            status_code=400,
            detail="MTO items must pass testing and client acceptance before delivery"
        )

    # DIRECT/SERVICE can be delivered from READY_TO_FULFILL (or AWAITING_ACCEPTANCE for MTO)
    valid_from = {"READY_TO_FULFILL", "AWAITING_ACCEPTANCE"}
    if current_status not in valid_from:
        raise HTTPException(
            status_code=400,
            detail=f"Item must be in {' or '.join(valid_from)} to deliver (current: {current_status})"
        )

    now = datetime.now().isoformat()
    supabase.table("sales_order_items").update({
        "fulfillment_status": "DELIVERED",
        "quantity_delivered": _num(item.get("quantity_ordered")),
        "updated_at": now,
    }).eq("sales_order_item_id", item_id).execute()

    _update_so_header_status(sales_order_id)

    return {"status": "DELIVERED", "sales_order_item_id": item_id}


@router.get("/{sales_order_id}/testing")
def get_testing_records(sales_order_id: int):
    """Get all testing records for a sales order."""
    records = (
        supabase.table("sales_order_testing")
        .select("*, employees!sales_order_testing_tested_by_fkey(first_name, last_name)")
        .eq("sales_order_id", sales_order_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return records
