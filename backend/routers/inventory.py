from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.cache import cached

router = APIRouter(prefix="/inventory", tags=["inventory"])

PO_PENDING_STOCK_MARKER = "[PO_PENDING_STOCK]"


class StockCreate(BaseModel):
    product_code: str
    warehouse_id: str
    location_id: Optional[str] = None
    quantity_on_hand: float = 0
    reorder_level: float = 0
    unit_cost: float = 0


class StockUpdate(StockCreate):
    pass


class MovementCreate(BaseModel):
    movement_type: str
    product_code: str
    quantity: float
    unit_cost: Optional[float] = None
    reference_no: Optional[str] = None
    remarks: Optional[str] = None
    warehouse_id: Optional[str] = None
    location_id: Optional[str] = None
    from_warehouse_id: Optional[str] = None
    from_location_id: Optional[str] = None
    to_warehouse_id: Optional[str] = None
    to_location_id: Optional[str] = None


class PendingTransferReceive(BaseModel):
    location_id: Optional[str] = None
    received_quantity: Optional[float] = None


class StockMove(BaseModel):
    to_warehouse_id: str
    quantity: Optional[float] = None
    reference_no: Optional[str] = None
    remarks: Optional[str] = None


class StockLocationUpdate(BaseModel):
    location_id: Optional[str] = None


class LocationCreate(BaseModel):
    warehouse_id: str
    location_code: str
    location_name: str
    aisle: Optional[str] = None
    rack: Optional[str] = None
    shelf: Optional[str] = None
    bin: Optional[str] = None
    location_type: str = "STORAGE"
    capacity: Optional[float] = None
    status: str = "ACTIVE"
    notes: Optional[str] = None


class LocationUpdate(LocationCreate):
    pass


def _num(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def sort_pending_stock_items(items: list[dict]) -> list[dict]:
    """Return pending stock newest first with a deterministic ID tie-breaker."""
    return sorted(
        items,
        key=lambda item: (
            str(item.get("activity_at") or item.get("created_at") or ""),
            int(item.get("pending_transfer_id") or 0),
        ),
        reverse=True,
    )


def _movement_no() -> str:
    return f"INV-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"


def _purchase_request_no() -> str:
    prefix = f"PR-{datetime.now().strftime('%Y%m')}-"
    res = (
        supabase.table("purchase_requests")
        .select("pr_number")
        .like("pr_number", f"{prefix}%")
        .order("pr_number", desc=True)
        .limit(1)
        .execute()
    )
    seq = int(res.data[0]["pr_number"].split("-")[-1]) + 1 if res.data else 1
    return f"{prefix}{seq:03d}"


def _stock_status(quantity_on_hand: float, reorder_level: float) -> str:
    if quantity_on_hand <= 0:
        return "OUT_OF_STOCK"
    if reorder_level > 0 and quantity_on_hand < reorder_level:
        return "LOW_STOCK"
    return "ACTIVE"


def _sync_product_master_quantity(product_code: Optional[str]) -> None:
    if not product_code:
        return
    rows = (
        supabase.table("inventory_stock")
        .select("quantity_on_hand")
        .eq("product_code", product_code)
        .execute()
        .data
        or []
    )
    total_quantity = sum(_num(row.get("quantity_on_hand")) for row in rows)
    synced_quantity = int(total_quantity) if float(total_quantity).is_integer() else total_quantity
    supabase.table("product_list").update({"quantity": synced_quantity}).eq("product_code", product_code).execute()


def _ensure_low_stock_purchase_request(stock: dict, employee_id=None):
    quantity_on_hand = _num(stock.get("quantity_on_hand"))
    reserved_quantity = _num(stock.get("reserved_quantity"))
    available_quantity = quantity_on_hand - reserved_quantity
    reorder_level = _num(stock.get("reorder_level"))
    product_code = stock.get("product_code")
    if not product_code or reorder_level <= 0 or available_quantity >= reorder_level:
        return

    open_statuses = ["TO_PURCHASE", "RFQ_SENT", "QUOTE_RECEIVED", "COMPARISON_DONE", "PO_CREATED", "SUBMITTED"]
    existing_items = (
        supabase.table("purchase_request_items")
        .select("purchase_request_id")
        .eq("product_code", product_code)
        .execute()
        .data
        or []
    )
    request_ids = [row["purchase_request_id"] for row in existing_items if row.get("purchase_request_id")]
    if request_ids:
        existing_requests = (
            supabase.table("purchase_requests")
            .select("purchase_request_id")
            .in_("purchase_request_id", request_ids)
            .in_("status", open_statuses)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing_requests:
            return

    product = (
        supabase.table("product_list")
        .select("product_code, product_name, buying_price_vat")
        .eq("product_code", product_code)
        .limit(1)
        .execute()
        .data
        or []
    )
    product_row = product[0] if product else {}
    required_qty = max(reorder_level - available_quantity, 1)
    created = supabase.table("purchase_requests").insert({
        "pr_number": _purchase_request_no(),
        "requested_by_employee_id": employee_id,
        "required_date": (date.today() + timedelta(days=7)).isoformat(),
        "warehouse_id": stock.get("warehouse_id"),
        "status": "TO_PURCHASE",
        "remarks": f"Auto-created because {product_code} available stock is below minimum.",
    }).execute()
    if not created.data:
        return

    estimated_unit_cost = _num(product_row.get("buying_price_vat"))
    supabase.table("purchase_request_items").insert({
        "purchase_request_id": created.data[0]["purchase_request_id"],
        "product_code": product_code,
        "item_description": product_row.get("product_name") or product_code,
        "quantity": required_qty,
        "estimated_unit_cost": estimated_unit_cost,
    }).execute()


def _insert_movement_record(
    movement_type: str,
    product_code: str,
    quantity: float,
    unit_cost: Optional[float] = None,
    reference_no: Optional[str] = None,
    remarks: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    location_id: Optional[str] = None,
    from_warehouse_id: Optional[str] = None,
    from_location_id: Optional[str] = None,
    to_warehouse_id: Optional[str] = None,
    to_location_id: Optional[str] = None,
    transfer_status: Optional[str] = None,
    transfer_group_id: Optional[str] = None,
    created_by_employee_id: Optional[int] = None,
):
    movement_payload = {
        "movement_no": _movement_no(),
        "movement_type": movement_type,
        "product_code": product_code,
        "quantity": quantity,
        "unit_cost": unit_cost or 0,
        "reference_no": reference_no,
        "remarks": remarks,
    }
    if transfer_status:
        movement_payload["transfer_status"] = transfer_status
    if transfer_group_id:
        movement_payload["transfer_group_id"] = transfer_group_id
    if created_by_employee_id:
        movement_payload["created_by_employee_id"] = created_by_employee_id

    if movement_type in {"STOCK_IN", "ADJUSTMENT"}:
        movement_payload["to_warehouse_id"] = to_warehouse_id or warehouse_id
        movement_payload["to_location_id"] = to_location_id or location_id
    elif movement_type == "STOCK_OUT":
        movement_payload["from_warehouse_id"] = from_warehouse_id or warehouse_id
        movement_payload["from_location_id"] = from_location_id or location_id
    else:
        movement_payload["from_warehouse_id"] = from_warehouse_id
        movement_payload["from_location_id"] = from_location_id
        movement_payload["to_warehouse_id"] = to_warehouse_id
        movement_payload["to_location_id"] = to_location_id

    res = supabase.table("inventory_movements").insert(movement_payload).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to save inventory movement")
    return res.data[0]


def _get_stock(
    product_code: str,
    warehouse_id: str,
    location_id: Optional[str] = None,
    entity: Optional[str] = None,
):
    res = (
        supabase.table("inventory_stock")
        .select("*")
        .eq("product_code", product_code)
        .eq("warehouse_id", warehouse_id)
        .execute()
    )
    rows = [
        row for row in (res.data or [])
        if str(row.get("location_id") or "") == str(location_id or "")
    ]
    if entity:
        # Entity-owned stock must never merge across companies.
        return next((row for row in rows if row.get("entity") == entity), None)
    return rows[0] if rows else None


def _get_locations_map():
    try:
        locations = supabase.table("inventory_locations").select("*").execute().data or []
    except Exception:
        locations = []
    return {row.get("location_id"): row for row in locations}


PENDING_TRANSFER_MARKER = "[PENDING_TRANSFER]"
RECEIVED_TRANSFER_MARKER = "[TRANSFER_RECEIVED]"


def _po_item_id_from_pending_stock(remarks: str) -> Optional[int]:
    if PO_PENDING_STOCK_MARKER not in (remarks or ""):
        return None
    marker = "PO_ITEM:"
    try:
        tail = remarks.split(marker, 1)[1]
        return int(tail.split()[0])
    except Exception:
        return None


def _latest_pending_stock_receipt_activity(movements: list[dict]) -> dict[int, str]:
    """Map each PO line to the newest receipt timestamp recorded against it."""
    latest_activity: dict[int, str] = {}
    for movement in movements:
        remarks = movement.get("remarks") or ""
        purchase_order_item_id = _po_item_id_from_pending_stock(remarks)
        if purchase_order_item_id is None or RECEIVED_TRANSFER_MARKER not in remarks:
            continue
        received_at = str(movement.get("created_at") or "")
        if received_at > latest_activity.get(purchase_order_item_id, ""):
            latest_activity[purchase_order_item_id] = received_at
    return latest_activity


def _entity_for_pending_purchase_stock(movement: dict) -> Optional[str]:
    """Resolve the purchasing entity for a pending PO stock movement."""
    po_number = movement.get("reference_no")
    if po_number:
        po = (
            supabase.table("purchase_orders")
            .select("purchase_request_id")
            .eq("po_number", po_number)
            .limit(1)
            .execute()
        )
        if po.data and po.data[0].get("purchase_request_id"):
            pr = (
                supabase.table("purchase_requests")
                .select("entity")
                .eq("purchase_request_id", po.data[0]["purchase_request_id"])
                .limit(1)
                .execute()
            )
            if pr.data and pr.data[0].get("entity"):
                return pr.data[0]["entity"]

        prefix = str(po_number).split("-", 1)[0].upper()
        return {
            "EXP": "Expedia",
            "GLB": "GreatnessLab",
            "EXG": "Exigent",
            "KSI": "KSI",
        }.get(prefix)
    return None


def _record_received_intercompany_product_link(po: dict, order_item: dict) -> None:
    """Make a received internal buyer/seller pair reusable for future PRs."""
    seller_product_code = (order_item.get("seller_product_code") or "").strip()
    if not seller_product_code:
        return
    pr = (
        supabase.table("purchase_requests")
        .select("entity, purchase_source, source_seller_entity")
        .eq("purchase_request_id", po.get("purchase_request_id"))
        .single()
        .execute()
    )
    if not pr.data or pr.data.get("purchase_source") != "INTERCOMPANY":
        return
    buyer_entity = pr.data.get("entity")
    seller_entity = pr.data.get("source_seller_entity")
    buyer_product_code = (order_item.get("product_code") or "").strip()
    if not buyer_entity or not seller_entity or not buyer_product_code:
        return

    existing = (
        supabase.table("intercompany_product_mappings")
        .select("mapping_id, seller_product_code")
        .eq("buyer_entity", buyer_entity)
        .eq("buyer_product_code", buyer_product_code)
        .eq("seller_entity", seller_entity)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return
    supabase.table("intercompany_product_mappings").insert({
        "buyer_entity": buyer_entity,
        "buyer_product_code": buyer_product_code,
        "seller_entity": seller_entity,
        "seller_product_code": seller_product_code,
        "notes": "Created automatically after an intercompany stock receipt.",
        "is_active": True,
    }).execute()


def _sync_purchase_order_from_pending_stock(
    movement: dict,
    received_quantity: float,
    request: Request,
    employee_id,
    performed_by,
):
    purchase_order_item_id = _po_item_id_from_pending_stock(movement.get("remarks") or "")
    if not purchase_order_item_id:
        return

    order_item = (
        supabase.table("purchase_order_items")
        .select("*")
        .eq("purchase_order_item_id", purchase_order_item_id)
        .single()
        .execute()
    )
    if not order_item.data:
        return

    purchase_order_id = order_item.data.get("purchase_order_id")
    po = supabase.table("purchase_orders").select("*").eq("purchase_order_id", purchase_order_id).single().execute()
    if not po.data:
        return

    received_quantity = min(
        _num(received_quantity),
        max(_num(order_item.data.get("quantity")) - _num(order_item.data.get("received_quantity")), 0),
    )
    if received_quantity <= 0:
        return

    receipt_number = f"GR-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
    receipt = supabase.table("goods_receipts").insert({
        "receipt_number": receipt_number,
        "purchase_order_id": purchase_order_id,
        "warehouse_id": movement.get("to_warehouse_id"),
        "received_by_employee_id": employee_id,
        "status": "RECEIVED",
        "remarks": f"Received from pending stock movement {movement.get('movement_no')}",
    }).execute()
    goods_receipt_id = receipt.data[0]["goods_receipt_id"] if receipt.data else None

    if goods_receipt_id:
        supabase.table("goods_receipt_items").insert({
            "goods_receipt_id": goods_receipt_id,
            "purchase_order_item_id": purchase_order_item_id,
            "product_code": movement.get("product_code"),
            "ordered_quantity": _num(order_item.data.get("quantity")),
            "received_quantity": received_quantity,
            "unit_cost": _num(movement.get("unit_cost")),
        }).execute()

    next_received = _num(order_item.data.get("received_quantity")) + received_quantity
    supabase.table("purchase_order_items").update({
        "received_quantity": next_received,
        "product_code": movement.get("product_code") or order_item.data.get("product_code"),
    }).eq("purchase_order_item_id", purchase_order_item_id).execute()
    _record_received_intercompany_product_link(
        po.data,
        {**order_item.data, "product_code": movement.get("product_code") or order_item.data.get("product_code")},
    )

    order_items = supabase.table("purchase_order_items").select("*").eq("purchase_order_id", purchase_order_id).execute().data or []
    fully_received = all(_num(item.get("received_quantity")) >= _num(item.get("quantity")) for item in order_items)
    next_status = "RECEIVED" if fully_received else "PARTIALLY_RECEIVED"
    supabase.table("purchase_orders").update({
        "status": next_status,
        "updated_at": datetime.now().isoformat(),
    }).eq("purchase_order_id", purchase_order_id).execute()

    write_audit_log(
        action="UPDATE",
        module_name="Purchasing",
        description=f"Confirmed pending stock receipt for purchase order {po.data.get('po_number')}",
        performed_by=performed_by,
        record_id=purchase_order_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )


def _update_stock_quantity(
    product_code: str,
    warehouse_id: str,
    delta: float,
    unit_cost: Optional[float] = None,
    location_id: Optional[str] = None,
    delete_when_empty: bool = False,
    entity: Optional[str] = None,
):
    """Adjust stock while preserving entity ownership.

    When ``entity`` is supplied, stock is matched and updated only within that
    entity. New stock records are tagged with the supplied entity.
    """
    stock = _get_stock(product_code, warehouse_id, location_id, entity=entity)
    if not stock:
        if delta < 0:
            raise HTTPException(status_code=400, detail="Stock record not found for this item/warehouse")
        payload = {
            "product_code": product_code,
            "warehouse_id": warehouse_id,
            "location_id": location_id,
            "quantity_on_hand": delta,
            "reserved_quantity": 0,
            "reorder_level": 0,
            "unit_cost": unit_cost or 0,
            "status": _stock_status(delta, 0),
        }
        if entity:
            payload["entity"] = entity
        created = supabase.table("inventory_stock").insert(payload).execute()
        if not created.data:
            raise HTTPException(status_code=400, detail="Unable to create stock record")
        _ensure_low_stock_purchase_request(created.data[0])
        _sync_product_master_quantity(product_code)
        return created.data[0]

    current_qty = _num(stock.get("quantity_on_hand"))
    next_qty = current_qty + delta
    if next_qty < 0:
        raise HTTPException(status_code=400, detail="Not enough stock on hand")

    if delete_when_empty and next_qty == 0:
        _ensure_low_stock_purchase_request({**stock, "quantity_on_hand": 0})
        supabase.table("inventory_stock").delete().eq("stock_id", stock["stock_id"]).execute()
        _sync_product_master_quantity(product_code)
        return {**stock, "quantity_on_hand": 0, "status": "OUT_OF_STOCK"}

    updates = {
        "quantity_on_hand": next_qty,
        "status": _stock_status(next_qty, _num(stock.get("reorder_level"))),
    }
    if unit_cost is not None:
        updates["unit_cost"] = unit_cost
    if entity and not stock.get("entity"):
        updates["entity"] = entity

    updated = (
        supabase.table("inventory_stock")
        .update(updates)
        .eq("stock_id", stock["stock_id"])
        .execute()
    )
    if not updated.data:
        raise HTTPException(status_code=400, detail="Unable to update stock")
    _ensure_low_stock_purchase_request(updated.data[0])
    _sync_product_master_quantity(product_code)
    return updated.data[0]


@router.get("/meta")
@cached("inventory:meta", ttl=120)
def get_inventory_meta():
    products = supabase.table("product_list").select("*").order("product_code").execute().data or []
    warehouses = supabase.table("warehouses").select("*").order("warehouse_name").execute().data or []

    return {
        "products": products,
        "warehouses": warehouses,
    }


@router.post("/stock", status_code=201)
def create_stock(request: Request, payload: StockCreate):
    _, performed_by = _extract_jwt_claims(request)

    product = (
        supabase.table("product_list")
        .select("product_code, product_name, owner_entity")
        .eq("product_code", payload.product_code)
        .single()
        .execute()
    )
    if not product.data:
        raise HTTPException(status_code=404, detail="Product not found")

    warehouse = (
        supabase.table("warehouses")
        .select("warehouse_id")
        .eq("warehouse_id", payload.warehouse_id)
        .single()
        .execute()
    )
    if not warehouse.data:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    existing = _get_stock(payload.product_code, payload.warehouse_id, payload.location_id)
    previous_quantity = _num(existing.get("quantity_on_hand")) if existing else 0
    next_quantity = _num(payload.quantity_on_hand)
    stock_payload = {
        "product_code": payload.product_code,
        "warehouse_id": payload.warehouse_id,
        "location_id": payload.location_id,
        "quantity_on_hand": next_quantity,
        "reserved_quantity": 0,
        "reorder_level": payload.reorder_level,
        "unit_cost": payload.unit_cost,
        "status": _stock_status(next_quantity, payload.reorder_level),
    }
    if product.data.get("owner_entity"):
        stock_payload["entity"] = product.data["owner_entity"]

    if existing:
        res = (
            supabase.table("inventory_stock")
            .update(stock_payload)
            .eq("stock_id", existing["stock_id"])
            .execute()
        )
    else:
        res = supabase.table("inventory_stock").insert(stock_payload).execute()

    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to save stock record")
    _ensure_low_stock_purchase_request(res.data[0])
    _sync_product_master_quantity(payload.product_code)

    delta = next_quantity - previous_quantity
    if delta > 0:
        _insert_movement_record(
            movement_type="STOCK_IN",
            product_code=payload.product_code,
            quantity=delta,
            unit_cost=payload.unit_cost,
            reference_no="INVENTORY-STOCK",
            remarks="Stock added from inventory list",
            warehouse_id=payload.warehouse_id,
        )
    elif delta < 0:
        _insert_movement_record(
            movement_type="ADJUSTMENT",
            product_code=payload.product_code,
            quantity=abs(delta),
            unit_cost=payload.unit_cost,
            reference_no="INVENTORY-STOCK",
            remarks=f"Stock adjusted from {previous_quantity:g} to {next_quantity:g}",
            warehouse_id=payload.warehouse_id,
        )

    write_audit_log(
        action="CREATE" if not existing else "UPDATE",
        module_name="Inventory",
        description=f"Saved inventory item {payload.product_code}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.patch("/stock/{stock_id}")
def update_stock(stock_id: str, request: Request, payload: StockUpdate):
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("inventory_stock")
        .select("*")
        .eq("stock_id", stock_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Stock record not found")

    product = (
        supabase.table("product_list")
        .select("product_code, product_name")
        .eq("product_code", payload.product_code)
        .single()
        .execute()
    )
    if not product.data:
        raise HTTPException(status_code=404, detail="Product not found")

    warehouse = (
        supabase.table("warehouses")
        .select("warehouse_id, warehouse_name")
        .eq("warehouse_id", payload.warehouse_id)
        .single()
        .execute()
    )
    if not warehouse.data:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    previous_quantity = _num(existing.data.get("quantity_on_hand"))
    next_quantity = _num(payload.quantity_on_hand)
    source_warehouse_id = existing.data.get("warehouse_id")
    warehouse_changed = str(source_warehouse_id) != str(payload.warehouse_id)

    stock_payload = {
        "product_code": payload.product_code,
        "warehouse_id": payload.warehouse_id,
        "location_id": payload.location_id,
        "quantity_on_hand": next_quantity,
        "reserved_quantity": _num(existing.data.get("reserved_quantity")),
        "reorder_level": payload.reorder_level,
        "unit_cost": payload.unit_cost,
        "status": _stock_status(next_quantity, payload.reorder_level),
    }

    target_existing = None
    if warehouse_changed:
        target_existing = _get_stock(payload.product_code, payload.warehouse_id, payload.location_id)
        if target_existing and str(target_existing.get("stock_id")) != str(stock_id):
            updated = (
                supabase.table("inventory_stock")
                .update(stock_payload)
                .eq("stock_id", target_existing["stock_id"])
                .execute()
            )
            if not updated.data:
                raise HTTPException(status_code=400, detail="Unable to update target stock")
            supabase.table("inventory_stock").delete().eq("stock_id", stock_id).execute()
            result = updated.data[0]
        else:
            updated = (
                supabase.table("inventory_stock")
                .update(stock_payload)
                .eq("stock_id", stock_id)
                .execute()
            )
            if not updated.data:
                raise HTTPException(status_code=400, detail="Unable to update stock")
            result = updated.data[0]
    else:
        updated = (
            supabase.table("inventory_stock")
            .update(stock_payload)
            .eq("stock_id", stock_id)
            .execute()
        )
        if not updated.data:
            raise HTTPException(status_code=400, detail="Unable to update stock")
        result = updated.data[0]

    if warehouse_changed and next_quantity > 0:
        _insert_movement_record(
            movement_type="TRANSFER",
            product_code=payload.product_code,
            quantity=next_quantity,
            unit_cost=payload.unit_cost,
            reference_no="INVENTORY-EDIT",
            remarks=f"Moved from warehouse {source_warehouse_id} to {payload.warehouse_id}",
            from_warehouse_id=source_warehouse_id,
            to_warehouse_id=payload.warehouse_id,
        )
    elif not warehouse_changed:
        delta = next_quantity - previous_quantity
        if delta > 0:
            _insert_movement_record(
                movement_type="STOCK_IN",
                product_code=payload.product_code,
                quantity=delta,
                unit_cost=payload.unit_cost,
                reference_no="INVENTORY-EDIT",
                remarks="Stock quantity increased from inventory edit",
                warehouse_id=payload.warehouse_id,
            )
        elif delta < 0:
            _insert_movement_record(
                movement_type="ADJUSTMENT",
                product_code=payload.product_code,
                quantity=abs(delta),
                unit_cost=payload.unit_cost,
                reference_no="INVENTORY-EDIT",
                remarks=f"Stock adjusted from {previous_quantity:g} to {next_quantity:g}",
                warehouse_id=payload.warehouse_id,
            )

    write_audit_log(
        action="UPDATE",
        module_name="Inventory",
        description=f"Updated inventory stock row for {payload.product_code}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    _ensure_low_stock_purchase_request(result)
    _sync_product_master_quantity(existing.data.get("product_code"))
    _sync_product_master_quantity(payload.product_code)
    return result


@router.delete("/stock/{stock_id}", status_code=204)
def delete_stock(stock_id: str, request: Request):
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("inventory_stock")
        .select("*")
        .eq("stock_id", stock_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Stock record not found")

    supabase.table("inventory_stock").delete().eq("stock_id", stock_id).execute()
    _sync_product_master_quantity(existing.data.get("product_code"))

    write_audit_log(
        action="DELETE",
        module_name="Inventory",
        description=f"Deleted inventory stock row for {existing.data.get('product_code')}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None


@router.patch("/stock/{stock_id}/location")
def update_stock_location(stock_id: str, request: Request, payload: StockLocationUpdate):
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("inventory_stock")
        .select("*")
        .eq("stock_id", stock_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Stock record not found")

    if payload.location_id:
        location = (
            supabase.table("inventory_locations")
            .select("location_id")
            .eq("location_id", payload.location_id)
            .eq("warehouse_id", existing.data.get("warehouse_id"))
            .single()
            .execute()
        )
        if not location.data:
            raise HTTPException(status_code=400, detail="Area must belong to the item's warehouse")

    updated = (
        supabase.table("inventory_stock")
        .update({"location_id": payload.location_id, "updated_at": datetime.now().isoformat()})
        .eq("stock_id", stock_id)
        .execute()
    )
    if not updated.data:
        raise HTTPException(status_code=400, detail="Unable to update item area")

    write_audit_log(
        action="UPDATE",
        module_name="Inventory",
        description=f"Updated inventory area for {existing.data.get('product_code')}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return updated.data[0]


@router.post("/stock/{stock_id}/move", status_code=201)
def move_stock(stock_id: str, request: Request, payload: StockMove):
    _, performed_by = _extract_jwt_claims(request)

    source = (
        supabase.table("inventory_stock")
        .select("*")
        .eq("stock_id", stock_id)
        .single()
        .execute()
    )
    if not source.data:
        raise HTTPException(status_code=404, detail="Source stock record not found")

    target_warehouse = (
        supabase.table("warehouses")
        .select("warehouse_id, warehouse_name")
        .eq("warehouse_id", payload.to_warehouse_id)
        .single()
        .execute()
    )
    if not target_warehouse.data:
        raise HTTPException(status_code=404, detail="Target warehouse not found")

    current_qty = _num(source.data.get("quantity_on_hand"))
    quantity = _num(payload.quantity) if payload.quantity is not None else current_qty
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
    if quantity > current_qty:
        raise HTTPException(status_code=400, detail="Not enough stock on hand")
    if str(source.data.get("warehouse_id")) == str(payload.to_warehouse_id):
        raise HTTPException(status_code=400, detail="Select a different warehouse")

    remaining_qty = current_qty - quantity
    if remaining_qty <= 0:
        supabase.table("inventory_stock").delete().eq("stock_id", stock_id).execute()
    else:
        source_update = {
            "quantity_on_hand": remaining_qty,
            "status": _stock_status(remaining_qty, _num(source.data.get("reorder_level"))),
        }
        source_res = (
            supabase.table("inventory_stock")
            .update(source_update)
            .eq("stock_id", stock_id)
            .execute()
        )
        if not source_res.data:
            raise HTTPException(status_code=400, detail="Unable to update source stock")
        _ensure_low_stock_purchase_request(source_res.data[0])

    _update_stock_quantity(
        source.data.get("product_code"),
        payload.to_warehouse_id,
        quantity,
        _num(source.data.get("unit_cost")),
        entity=source.data.get("entity"),
    )
    _sync_product_master_quantity(source.data.get("product_code"))

    movement = _insert_movement_record(
        movement_type="TRANSFER",
        product_code=source.data.get("product_code"),
        quantity=quantity,
        unit_cost=_num(source.data.get("unit_cost")),
        reference_no=payload.reference_no,
        remarks=payload.remarks,
        from_warehouse_id=source.data.get("warehouse_id"),
        to_warehouse_id=payload.to_warehouse_id,
    )

    write_audit_log(
        action="CREATE",
        module_name="Inventory",
        description=f"Moved stock row {stock_id} to {target_warehouse.data.get('warehouse_name')}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return movement


@router.post("/movements", status_code=201)
def create_inventory_movement(request: Request, payload: MovementCreate):
    employee_id, performed_by = _extract_jwt_claims(request)
    movement_type = payload.movement_type.upper()
    quantity = _num(payload.quantity)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    transfer_status = None
    if movement_type == "STOCK_IN":
        if not payload.warehouse_id:
            raise HTTPException(status_code=400, detail="Warehouse is required")
        _update_stock_quantity(payload.product_code, payload.warehouse_id, quantity, payload.unit_cost, payload.location_id)
    elif movement_type == "STOCK_OUT":
        if not payload.warehouse_id:
            raise HTTPException(status_code=400, detail="Warehouse is required")
        _update_stock_quantity(payload.product_code, payload.warehouse_id, -quantity, location_id=payload.location_id)
    elif movement_type == "ADJUSTMENT":
        if not payload.warehouse_id:
            raise HTTPException(status_code=400, detail="Warehouse is required")
        stock = _get_stock(payload.product_code, payload.warehouse_id, payload.location_id)
        current_qty = _num(stock.get("quantity_on_hand")) if stock else 0
        _update_stock_quantity(payload.product_code, payload.warehouse_id, quantity - current_qty, payload.unit_cost, payload.location_id)
    elif movement_type == "TRANSFER":
        if not all([payload.from_warehouse_id, payload.to_warehouse_id]):
            raise HTTPException(status_code=400, detail="From and to warehouses are required")
        if str(payload.from_warehouse_id) == str(payload.to_warehouse_id):
            raise HTTPException(status_code=400, detail="From and to warehouses must be different")
        _update_stock_quantity(payload.product_code, payload.from_warehouse_id, -quantity, location_id=payload.from_location_id, delete_when_empty=True)
        transfer_status = "PENDING"
    else:
        raise HTTPException(status_code=400, detail="Unsupported movement type")

    movement = _insert_movement_record(
        movement_type=movement_type,
        product_code=payload.product_code,
        quantity=quantity,
        unit_cost=payload.unit_cost,
        reference_no=payload.reference_no,
        remarks=payload.remarks,
        warehouse_id=payload.warehouse_id,
        location_id=payload.location_id,
        from_warehouse_id=payload.from_warehouse_id,
        from_location_id=payload.from_location_id,
        to_warehouse_id=payload.to_warehouse_id,
        to_location_id=payload.to_location_id,
        transfer_status=transfer_status,
        created_by_employee_id=employee_id,
    )

    write_audit_log(
        action="CREATE",
        module_name="Inventory",
        description=f"Created {movement_type.replace('_', ' ').lower()} for {payload.product_code}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return movement


@router.post("/transfers/{movement_id}/receive")
def receive_pending_transfer(movement_id: int, request: Request, payload: PendingTransferReceive):
    employee_id, performed_by = _extract_jwt_claims(request)
    movement = supabase.table("inventory_movements").select("*").eq("movement_id", movement_id).single().execute()
    if not movement.data:
        raise HTTPException(status_code=404, detail="Pending transfer not found")

    if _po_item_id_from_pending_stock(movement.data.get("remarks") or ""):
        if RECEIVED_TRANSFER_MARKER in (movement.data.get("remarks") or ""):
            raise HTTPException(status_code=409, detail="This pending stock line has already been fully received.")

        stock_entity = _entity_for_pending_purchase_stock(movement.data)
        if not stock_entity:
            raise HTTPException(
                status_code=409,
                detail="The related purchase request has no entity. Select a company on the PR before receiving stock.",
            )

        pending_quantity = _num(movement.data.get("quantity"))
        received_quantity = pending_quantity if payload.received_quantity is None else _num(payload.received_quantity)
        if received_quantity <= 0:
            raise HTTPException(status_code=422, detail="Received quantity must be greater than zero.")
        if received_quantity > pending_quantity:
            raise HTTPException(
                status_code=422,
                detail=f"Received quantity cannot exceed the {pending_quantity:g} currently pending.",
            )

        _update_stock_quantity(
            movement.data.get("product_code"),
            movement.data.get("to_warehouse_id"),
            received_quantity,
            _num(movement.data.get("unit_cost")),
            payload.location_id,
            entity=stock_entity,
        )

        remaining_quantity = pending_quantity - received_quantity
        original_remarks = movement.data.get("remarks") or ""
        if remaining_quantity > 0:
            supabase.table("inventory_movements").update({
                "quantity": remaining_quantity,
                "to_location_id": payload.location_id,
                "remarks": f"{original_remarks} [PARTIALLY_RECEIVED]".strip(),
            }).eq("movement_id", movement_id).execute()
        # A pending staging row cannot be set to quantity 0 because the
        # inventory_movements_quantity_check constraint requires quantity > 0.
        # The immutable receipt movement below preserves the completed receipt;
        # the staging row is removed after PO synchronization when fully received.

        # Preserve a separate immutable receipt movement for every partial quantity.
        _insert_movement_record(
            movement_type="STOCK_IN",
            product_code=movement.data.get("product_code"),
            quantity=received_quantity,
            unit_cost=_num(movement.data.get("unit_cost")),
            reference_no=movement.data.get("reference_no"),
            remarks=f"{original_remarks} {RECEIVED_TRANSFER_MARKER}".strip(),
            to_warehouse_id=movement.data.get("to_warehouse_id"),
            to_location_id=payload.location_id,
            created_by_employee_id=employee_id,
        )
        _sync_purchase_order_from_pending_stock(
            movement.data,
            received_quantity,
            request,
            employee_id,
            performed_by,
        )
        if remaining_quantity <= 0:
            supabase.table("inventory_movements").delete().eq("movement_id", movement_id).execute()
        result = {
            "ok": True,
            "received_quantity": received_quantity,
            "pending_quantity": remaining_quantity,
        }
    else:
        try:
            res = supabase.rpc("receive_inventory_transfer", {
                "p_movement_id": movement_id,
                "p_location_id": payload.location_id,
                "p_received_by_employee_id": employee_id,
            }).execute()
            result = res.data or {"ok": True}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    write_audit_log(
        action="CREATE",
        module_name="Inventory",
        description=f"Received pending transfer #{movement_id}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    _sync_product_master_quantity(movement.data.get("product_code"))
    return result


@router.get("/locations")
@cached("inventory:locations:{warehouse_id}", ttl=120)
def get_inventory_locations(warehouse_id: Optional[str] = None):
    """Get all inventory locations, optionally filtered by warehouse"""
    query = supabase.table("inventory_locations").select("*").order("location_code")
    
    if warehouse_id:
        query = query.eq("warehouse_id", warehouse_id)
    
    res = query.execute()
    return res.data or []


@router.post("/locations", status_code=201)
def create_inventory_location(request: Request, payload: LocationCreate):
    """Create a new inventory location"""
    _, performed_by = _extract_jwt_claims(request)
    
    # Verify warehouse exists
    warehouse = (
        supabase.table("warehouses")
        .select("warehouse_id, warehouse_name")
        .eq("warehouse_id", payload.warehouse_id)
        .single()
        .execute()
    )
    if not warehouse.data:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    
    # Check for duplicate location code within the same warehouse
    existing = (
        supabase.table("inventory_locations")
        .select("location_id")
        .eq("warehouse_id", payload.warehouse_id)
        .eq("location_code", payload.location_code.upper())
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="Location code already exists in this warehouse")
    
    location_payload = {
        "warehouse_id": payload.warehouse_id,
        "location_code": payload.location_code.upper(),
        "location_name": payload.location_name,
        "aisle": payload.aisle,
        "rack": payload.rack,
        "shelf": payload.shelf,
        "bin": payload.bin,
        "location_type": payload.location_type,
        "capacity": payload.capacity,
        "status": payload.status,
        "notes": payload.notes,
    }
    
    res = supabase.table("inventory_locations").insert(location_payload).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create location")
    
    write_audit_log(
        action="CREATE",
        module_name="Inventory Locations",
        description=f"Created location {payload.location_code}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.patch("/locations/{location_id}")
def update_inventory_location(location_id: str, request: Request, payload: LocationUpdate):
    """Update an existing inventory location"""
    _, performed_by = _extract_jwt_claims(request)
    
    # Verify location exists
    existing = (
        supabase.table("inventory_locations")
        .select("*")
        .eq("location_id", location_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Location not found")
    
    # Verify warehouse exists
    warehouse = (
        supabase.table("warehouses")
        .select("warehouse_id, warehouse_name")
        .eq("warehouse_id", payload.warehouse_id)
        .single()
        .execute()
    )
    if not warehouse.data:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    
    # Check for duplicate location code within the same warehouse (excluding current location)
    duplicate = (
        supabase.table("inventory_locations")
        .select("location_id")
        .eq("warehouse_id", payload.warehouse_id)
        .eq("location_code", payload.location_code.upper())
        .neq("location_id", location_id)
        .execute()
    )
    if duplicate.data:
        raise HTTPException(status_code=400, detail="Location code already exists in this warehouse")
    
    location_payload = {
        "warehouse_id": payload.warehouse_id,
        "location_code": payload.location_code.upper(),
        "location_name": payload.location_name,
        "aisle": payload.aisle,
        "rack": payload.rack,
        "shelf": payload.shelf,
        "bin": payload.bin,
        "location_type": payload.location_type,
        "capacity": payload.capacity,
        "status": payload.status,
        "notes": payload.notes,
    }
    
    res = (
        supabase.table("inventory_locations")
        .update(location_payload)
        .eq("location_id", location_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to update location")
    
    write_audit_log(
        action="UPDATE",
        module_name="Inventory Locations",
        description=f"Updated location {payload.location_code}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/locations/{location_id}", status_code=204)
def delete_inventory_location(location_id: str, request: Request):
    """Delete an inventory location"""
    _, performed_by = _extract_jwt_claims(request)
    
    # Verify location exists
    existing = (
        supabase.table("inventory_locations")
        .select("*")
        .eq("location_id", location_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Location not found")
    
    # Check if location is being used in inventory_stock
    stock_usage = (
        supabase.table("inventory_stock")
        .select("stock_id")
        .eq("location_id", location_id)
        .limit(1)
        .execute()
    )
    if stock_usage.data:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete location that is assigned to inventory stock. Remove stock assignments first."
        )
    
    # Check if location is being used in inventory_movements
    movement_usage = (
        supabase.table("inventory_movements")
        .select("movement_id")
        .or_(f"from_location_id.eq.{location_id},to_location_id.eq.{location_id}")
        .limit(1)
        .execute()
    )
    if movement_usage.data:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete location that is referenced in movement history."
        )
    
    supabase.table("inventory_locations").delete().eq("location_id", location_id).execute()
    
    write_audit_log(
        action="DELETE",
        module_name="Inventory Locations",
        description=f"Deleted location {existing.data.get('location_code')}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None


@router.get("/summary")
@cached("inventory:summary", ttl=30)
def get_inventory_summary():
    products = supabase.table("product_list").select("*").execute().data or []
    stock_rows = supabase.table("inventory_stock").select("*").execute().data or []
    warehouses = supabase.table("warehouses").select("*").order("warehouse_name").execute().data or []
    location_map = _get_locations_map()
    movements = (
        supabase.table("inventory_movements")
        .select("*")
        .order("created_at", desc=True)
        .order("movement_id", desc=True)
        .limit(80)
        .execute()
        .data
        or []
    )

    product_map = {p["product_code"]: p for p in products}
    warehouse_map = {w["warehouse_id"]: w for w in warehouses}
    reservation_map = defaultdict(list)

    allocation_rows = (
        supabase.table("project_material_allocations")
        .select("allocation_id, project_id, product_code, warehouse_id, location_id, quantity_reserved, quantity_issued")
        .execute()
        .data
        or []
    )
    project_ids = list({row.get("project_id") for row in allocation_rows if row.get("project_id")})
    project_map = {}
    if project_ids:
        project_rows = (
            supabase.table("projects")
            .select("project_id, project_code, project_name, status")
            .in_("project_id", project_ids)
            .execute()
            .data
            or []
        )
        project_map = {row.get("project_id"): row for row in project_rows}

    for allocation in allocation_rows:
        reserved_quantity = _num(allocation.get("quantity_reserved")) - _num(allocation.get("quantity_issued"))
        if reserved_quantity <= 0:
            continue
        project = project_map.get(allocation.get("project_id"), {})
        key = (allocation.get("product_code"), allocation.get("warehouse_id"), allocation.get("location_id"))
        reservation_map[key].append({
            "allocation_id": allocation.get("allocation_id"),
            "project_id": allocation.get("project_id"),
            "project_code": project.get("project_code"),
            "project_name": project.get("project_name") or project.get("project_code") or f"Project #{allocation.get('project_id')}",
            "project_status": project.get("status"),
            "quantity_reserved": reserved_quantity,
        })

    items = []
    total_value = 0.0
    total_quantity = 0.0
    total_cost = 0.0
    low_stock_count = 0
    out_of_stock_count = 0
    warehouse_levels = defaultdict(lambda: {"quantity_on_hand": 0.0, "inventory_value": 0.0})

    combined_stock = {}
    for row in stock_rows:
        key = (row.get("product_code"), row.get("warehouse_id"), row.get("location_id"))
        if key not in combined_stock:
            combined_stock[key] = {**row}
            continue
        combined_stock[key]["quantity_on_hand"] = _num(combined_stock[key].get("quantity_on_hand")) + _num(row.get("quantity_on_hand"))
        combined_stock[key]["reserved_quantity"] = _num(combined_stock[key].get("reserved_quantity")) + _num(row.get("reserved_quantity"))
        combined_stock[key]["reorder_level"] = max(_num(combined_stock[key].get("reorder_level")), _num(row.get("reorder_level")))
        if _num(row.get("unit_cost")) > 0:
            combined_stock[key]["unit_cost"] = row.get("unit_cost")

    stock_rows = list(combined_stock.values())
    product_stock_totals = defaultdict(float)
    for row in stock_rows:
        product_stock_totals[row.get("product_code")] += _num(row.get("quantity_on_hand"))

    for row in stock_rows:
        product = product_map.get(row.get("product_code"), {})
        warehouse = warehouse_map.get(row.get("warehouse_id"), {})
        location = location_map.get(row.get("location_id"), {})

        quantity_on_hand = _num(row.get("quantity_on_hand"))
        reorder_level = _num(row.get("reorder_level"))
        unit_cost = _num(row.get("unit_cost"))
        inventory_value = quantity_on_hand * unit_cost
        available_quantity = quantity_on_hand - _num(row.get("reserved_quantity"))

        if quantity_on_hand <= 0:
            computed_status = "OUT_OF_STOCK"
            out_of_stock_count += 1
        elif reorder_level > 0 and quantity_on_hand < reorder_level:
            computed_status = "LOW_STOCK"
            low_stock_count += 1
        else:
            computed_status = row.get("status") or "ACTIVE"

        warehouse_name = warehouse.get("warehouse_name") or "Unassigned"
        warehouse_levels[warehouse_name]["quantity_on_hand"] += quantity_on_hand
        warehouse_levels[warehouse_name]["inventory_value"] += inventory_value

        total_value += inventory_value
        total_quantity += quantity_on_hand
        total_cost += inventory_value

        items.append({
            "stock_id": row.get("stock_id"),
            "item_code": row.get("product_code"),
            "item_name": product.get("product_name", "Unknown item"),
            "product_description": product.get("product_description") or "",
            "category": product.get("category") or "Uncategorized",
            "brand": product.get("product_brand") or "-",
            "uom": product.get("unit") or "-",
            "buying_price_vat": _num(product.get("buying_price_vat")),
            "selling_price_margin": _num(product.get("selling_price_margin")),
            "supplier_name": product.get("supplier_name") or "-",
            "fulfillment_type": product.get("fulfillment_type") or "-",
            "product_master_quantity": product_stock_totals.get(row.get("product_code"), 0.0),
            "warehouse_id": row.get("warehouse_id"),
            "warehouse": warehouse_name,
            "warehouse_address": warehouse.get("address") or "-",
            "location_id": row.get("location_id"),
            "location": location.get("location_code") or location.get("location_name") or "-",
            "quantity_on_hand": quantity_on_hand,
            "reserved_quantity": _num(row.get("reserved_quantity")),
            "available_quantity": available_quantity,
            "reorder_level": reorder_level,
            "unit_cost": unit_cost,
            "inventory_value": inventory_value,
            "status": computed_status,
            "barcode": row.get("product_code"),
            "reserved_projects": reservation_map.get((row.get("product_code"), row.get("warehouse_id"), row.get("location_id")), []),
        })

    stocked_product_codes = {row.get("product_code") for row in stock_rows}
    for product in products:
        product_code = product.get("product_code")
        if product_code in stocked_product_codes:
            continue

        out_of_stock_count += 1
        items.append({
            "stock_id": None,
            "item_code": product_code,
            "item_name": product.get("product_name", "Unknown item"),
            "product_description": product.get("product_description") or "",
            "category": product.get("category") or "Uncategorized",
            "brand": product.get("product_brand") or "-",
            "uom": product.get("unit") or "-",
            "buying_price_vat": _num(product.get("buying_price_vat")),
            "selling_price_margin": _num(product.get("selling_price_margin")),
            "supplier_name": product.get("supplier_name") or "-",
            "fulfillment_type": product.get("fulfillment_type") or "-",
            "product_master_quantity": 0,
            "warehouse_id": None,
            "warehouse": "-",
            "warehouse_address": "-",
            "location_id": None,
            "location": "-",
            "quantity_on_hand": 0,
            "reserved_quantity": 0,
            "available_quantity": 0,
            "reorder_level": 0,
            "unit_cost": 0,
            "inventory_value": 0,
            "status": "OUT_OF_STOCK",
            "barcode": product_code,
            "reserved_projects": [],
        })

    movement_type_totals = defaultdict(float)
    movement_trend = defaultdict(lambda: {"stock_in": 0.0, "stock_out": 0.0, "transfer": 0.0, "adjustment": 0.0})
    recent_movements = []
    pending_transfer_items = []
    latest_receipt_activity = _latest_pending_stock_receipt_activity(movements)

    for movement in movements:
        movement_type = movement.get("movement_type") or "UNKNOWN"
        quantity = _num(movement.get("quantity"))
        remarks = movement.get("remarks") or ""
        product = product_map.get(movement.get("product_code"), {})
        from_warehouse = warehouse_map.get(movement.get("from_warehouse_id"), {})
        to_warehouse = warehouse_map.get(movement.get("to_warehouse_id"), {})

        is_po_pending_stock = (
            _po_item_id_from_pending_stock(remarks) is not None
            and RECEIVED_TRANSFER_MARKER not in remarks
            and movement.get("transfer_status") != "RECEIVED"
        )
        is_pending_transfer = (
            movement_type == "TRANSFER"
            and (
                movement.get("transfer_status") == "PENDING"
                or (
                    PENDING_TRANSFER_MARKER in remarks
                    and RECEIVED_TRANSFER_MARKER not in remarks
                    and movement.get("transfer_status") != "RECEIVED"
                )
            )
        ) or is_po_pending_stock
        if is_pending_transfer:
            purchase_order_item_id = _po_item_id_from_pending_stock(remarks)
            created_at = str(movement.get("created_at") or "")
            activity_at = max(created_at, latest_receipt_activity.get(purchase_order_item_id, ""))
            pending_transfer_items.append({
                "pending_transfer_id": movement.get("movement_id"),
                "purchase_order_item_id": purchase_order_item_id,
                "po_number": movement.get("reference_no") if purchase_order_item_id else None,
                "item_code": movement.get("product_code"),
                "item_name": product.get("product_name", "Unknown item"),
                "category": product.get("category") or "Uncategorized",
                "brand": product.get("product_brand") or "-",
                "uom": product.get("unit") or "-",
                "warehouse_id": movement.get("to_warehouse_id"),
                "warehouse": to_warehouse.get("warehouse_name") or "-",
                "from_warehouse_id": movement.get("from_warehouse_id"),
                "from_warehouse": from_warehouse.get("warehouse_name") or "-",
                "location_id": movement.get("to_location_id"),
                "location": "-",
                "quantity_on_hand": quantity,
                "reserved_quantity": 0,
                "available_quantity": quantity,
                "reorder_level": 0,
                "unit_cost": _num(movement.get("unit_cost")),
                "inventory_value": quantity * _num(movement.get("unit_cost")),
                "status": "PENDING_TRANSFER",
                "transfer_status": "PENDING",
                "created_at": created_at or None,
                "activity_at": activity_at or None,
                "barcode": None,
                "is_pending_transfer": True,
                "is_internal_transfer": "[INTERNAL_AWAITING_TRANSFER]" in remarks,
            })
            continue

        movement_type_totals[movement_type] += quantity

        created_at = movement.get("created_at") or ""
        day = created_at[:10] if created_at else "Unknown"
        trend_key = movement_type.lower()
        if trend_key in movement_trend[day]:
            movement_trend[day][trend_key] += quantity

        recent_movements.append({
            "movement_id": movement.get("movement_id"),
            "movement_no": movement.get("movement_no"),
            "movement_type": movement_type,
            "item_code": movement.get("product_code"),
            "item_name": product.get("product_name", "Unknown item"),
            "quantity": quantity,
            "reference_no": movement.get("reference_no"),
            "created_at": movement.get("created_at"),
            "from_warehouse_id": movement.get("from_warehouse_id"),
            "from_warehouse": from_warehouse.get("warehouse_name"),
            "to_warehouse_id": movement.get("to_warehouse_id"),
            "to_warehouse": to_warehouse.get("warehouse_name"),
            "transfer_status": movement.get("transfer_status"),
        })

    average_cost = total_cost / total_quantity if total_quantity else 0.0
    pending_transfer_items = sort_pending_stock_items(pending_transfer_items)

    return {
        "summary": {
            "inventory_value": total_value,
            "low_stock": low_stock_count,
            "out_of_stock": out_of_stock_count,
            "stock_on_hand": total_quantity,
            "average_cost": average_cost,
            "warehouse_count": len(warehouses),
            "location_count": len(location_map),
        },
        "items": items,
        "pending_transfer_items": pending_transfer_items,
        "warehouse_levels": [
            {
                "warehouse": name,
                "quantity_on_hand": values["quantity_on_hand"],
                "inventory_value": values["inventory_value"],
            }
            for name, values in warehouse_levels.items()
        ],
        "movement_type_totals": dict(movement_type_totals),
        "movement_trend": [
            {"date": day, **values}
            for day, values in sorted(movement_trend.items())
        ][-8:],
        "recent_movements": recent_movements[:10],
        "warehouses": [
            {
                "warehouse_id": warehouse.get("warehouse_id"),
                "warehouse_code": warehouse.get("warehouse_code"),
                "warehouse_name": warehouse.get("warehouse_name"),
                "address": warehouse.get("address"),
                "status": warehouse.get("status"),
            }
            for warehouse in warehouses
        ],
    }

