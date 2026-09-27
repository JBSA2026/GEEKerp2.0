"""Delivery Notes router.

Manages outbound deliveries to clients — partial or full — against Sales Orders.
Tracks preparation, transit, delivery confirmation, and client acknowledgment.
"""
from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel
from typing import Optional
from datetime import date
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.code_generator import generate_code

router = APIRouter(prefix="/delivery-notes", tags=["Delivery Notes"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class DeliveryNoteItemCreate(BaseModel):
    product_code: Optional[str] = None
    description: Optional[str] = None
    quantity_ordered: Optional[float] = 0
    quantity_delivered: float
    uom: Optional[str] = "Nos"
    serial_numbers: Optional[str] = None
    remarks: Optional[str] = None


class DeliveryNoteCreate(BaseModel):
    sales_order_id: Optional[int] = None
    project_id: Optional[int] = None
    client_id: Optional[int] = None
    entity: Optional[str] = None
    delivery_date: Optional[date] = None
    address: Optional[str] = None
    remarks: Optional[str] = None
    items: list[DeliveryNoteItemCreate] = []


class DeliveryNoteStatusUpdate(BaseModel):
    status: str
    received_by: Optional[str] = None
    received_date: Optional[date] = None
    remarks: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_dr_number(entity: Optional[str] = None) -> str:
    return generate_code(entity, "DR", "delivery_notes", "dr_number")


def _get_delivery_note(dn_id: int) -> dict:
    res = supabase.table("delivery_notes").select("*").eq("delivery_note_id", dn_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Delivery note not found."})
    note = res.data[0]
    items = supabase.table("delivery_note_items").select("*").eq("delivery_note_id", dn_id).execute().data or []
    note["items"] = items
    return note


def _update_sales_order_delivery_status(sales_order_id: int):
    """Recalculate and update the sales order status based on total deliveries."""
    if not sales_order_id:
        return
    so_items = supabase.table("sales_order_items").select("sales_order_item_id, quantity_ordered, quantity_delivered").eq("sales_order_id", sales_order_id).execute().data or []
    if not so_items:
        return
    all_delivered = all(float(i.get("quantity_delivered") or 0) >= float(i.get("quantity_ordered") or 0) for i in so_items)
    any_delivered = any(float(i.get("quantity_delivered") or 0) > 0 for i in so_items)

    if all_delivered:
        new_status = "DELIVERED"
    elif any_delivered:
        new_status = "PARTIALLY_DELIVERED"
    else:
        return  # No change needed

    supabase.table("sales_orders").update({"status": new_status}).eq("sales_order_id", sales_order_id).execute()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def list_delivery_notes(
    status_filter: Optional[str] = Query(None, alias="status"),
    entity: Optional[str] = Query(None),
    sales_order_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
):
    """List all delivery notes with optional filters."""
    query = supabase.table("delivery_notes").select("*").order("created_at", desc=True)
    if status_filter and status_filter != "All":
        query = query.eq("status", status_filter)
    if entity and entity != "All":
        query = query.eq("entity", entity)
    if sales_order_id:
        query = query.eq("sales_order_id", sales_order_id)
    if project_id:
        query = query.eq("project_id", project_id)
    rows = query.execute().data or []

    # Attach item counts
    for row in rows:
        items = supabase.table("delivery_note_items").select("delivery_note_item_id, quantity_delivered").eq("delivery_note_id", row["delivery_note_id"]).execute().data or []
        row["item_count"] = len(items)
        row["total_qty_delivered"] = sum(float(i.get("quantity_delivered") or 0) for i in items)
    return rows


@router.get("/metrics")
def delivery_note_metrics(entity: Optional[str] = Query(None)):
    """Return metric card values for dashboard."""
    query = supabase.table("delivery_notes").select("delivery_note_id, status")
    if entity and entity != "All":
        query = query.eq("entity", entity)
    rows = query.execute().data or []
    return {
        "total": len(rows),
        "preparing": sum(1 for r in rows if r.get("status") == "Preparing"),
        "in_transit": sum(1 for r in rows if r.get("status") == "In Transit"),
        "delivered": sum(1 for r in rows if r.get("status") in ("Delivered", "Acknowledged")),
    }


@router.get("/pending-orders")
def get_pending_orders():
    """Get sales orders that still have undelivered items."""
    orders = supabase.table("sales_orders").select("sales_order_id, so_number, project_name, client_id, status, entity").in_("status", ["RESERVED", "PARTIALLY_DELIVERED", "IN_PRODUCTION"]).order("sales_order_id", desc=True).execute().data or []
    result = []
    for so in orders:
        items = supabase.table("sales_order_items").select("sales_order_item_id, product_code, description, quantity_ordered, quantity_delivered, uom").eq("sales_order_id", so["sales_order_id"]).execute().data or []
        pending_items = [i for i in items if float(i.get("quantity_delivered") or 0) < float(i.get("quantity_ordered") or 0)]
        if pending_items:
            so["pending_items"] = pending_items
            so["total_ordered"] = sum(float(i.get("quantity_ordered") or 0) for i in items)
            so["total_delivered"] = sum(float(i.get("quantity_delivered") or 0) for i in items)
            result.append(so)
    return result


@router.get("/{delivery_note_id}")
def get_delivery_note(delivery_note_id: int):
    """Get a single delivery note with its items."""
    return _get_delivery_note(delivery_note_id)


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_delivery_note(request: Request, payload: DeliveryNoteCreate):
    """Create a new delivery note."""
    _, performed_by = _extract_jwt_claims(request)

    if not payload.items:
        raise HTTPException(status_code=422, detail={"error": "At least one item is required."})

    dr_number = _generate_dr_number(payload.entity)

    header = {
        "dr_number": dr_number,
        "sales_order_id": payload.sales_order_id,
        "project_id": payload.project_id,
        "client_id": payload.client_id,
        "entity": payload.entity,
        "status": "Preparing",
        "delivery_date": payload.delivery_date.isoformat() if payload.delivery_date else None,
        "address": payload.address,
        "remarks": payload.remarks,
    }

    res = supabase.table("delivery_notes").insert(header).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail={"error": "Failed to create delivery note."})

    dn_id = res.data[0]["delivery_note_id"]

    # Insert items
    item_rows = []
    for item in payload.items:
        item_rows.append({
            "delivery_note_id": dn_id,
            "product_code": item.product_code,
            "description": item.description,
            "quantity_ordered": item.quantity_ordered,
            "quantity_delivered": item.quantity_delivered,
            "uom": item.uom,
            "serial_numbers": item.serial_numbers,
            "remarks": item.remarks,
        })
    if item_rows:
        supabase.table("delivery_note_items").insert(item_rows).execute()

    write_audit_log(
        action="CREATE",
        module_name="Delivery Notes",
        description=f"Created delivery note {dr_number}",
        performed_by=performed_by,
        record_id=dn_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return _get_delivery_note(dn_id)


@router.patch("/{delivery_note_id}/status")
def update_delivery_note_status(delivery_note_id: int, request: Request, payload: DeliveryNoteStatusUpdate):
    """Update delivery note status (Preparing → In Transit → Delivered → Acknowledged)."""
    _, performed_by = _extract_jwt_claims(request)

    note = _get_delivery_note(delivery_note_id)
    old_status = note["status"]
    new_status = payload.status

    # Validate transitions
    valid_transitions = {
        "Preparing": ["In Transit", "Cancelled"],
        "In Transit": ["Delivered", "Cancelled"],
        "Delivered": ["Acknowledged"],
    }
    allowed = valid_transitions.get(old_status, [])
    if new_status not in allowed:
        raise HTTPException(status_code=422, detail={"error": f"Cannot move from '{old_status}' to '{new_status}'. Allowed: {allowed}"})

    # Require received_by when marking Delivered or Acknowledged
    if new_status in ("Delivered", "Acknowledged") and not payload.received_by:
        raise HTTPException(status_code=422, detail={"error": "Receiver name is required when marking as delivered.", "fields": {"received_by": "Required"}})

    update_data = {"status": new_status}
    if payload.received_by:
        update_data["received_by"] = payload.received_by
    if payload.received_date:
        update_data["received_date"] = payload.received_date.isoformat()
    if payload.remarks:
        update_data["remarks"] = payload.remarks

    supabase.table("delivery_notes").update(update_data).eq("delivery_note_id", delivery_note_id).execute()

    # When marked as Delivered, update quantity_delivered on SO items and create inventory movements
    if new_status == "Delivered" and note.get("sales_order_id"):
        items = note.get("items") or []
        for item in items:
            if not item.get("product_code"):
                continue
            qty = float(item.get("quantity_delivered") or 0)
            if qty <= 0:
                continue
            # Update sales_order_items quantity_delivered
            so_items = supabase.table("sales_order_items").select("sales_order_item_id, quantity_delivered").eq("sales_order_id", note["sales_order_id"]).eq("product_code", item["product_code"]).execute().data or []
            for so_item in so_items:
                new_delivered = float(so_item.get("quantity_delivered") or 0) + qty
                supabase.table("sales_order_items").update({"quantity_delivered": new_delivered}).eq("sales_order_item_id", so_item["sales_order_item_id"]).execute()

        # Update SO status
        _update_sales_order_delivery_status(note["sales_order_id"])

    write_audit_log(
        action="UPDATE",
        module_name="Delivery Notes",
        description=f"Updated delivery note {note['dr_number']} status: {old_status} → {new_status}",
        performed_by=performed_by,
        record_id=delivery_note_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return _get_delivery_note(delivery_note_id)


@router.post("/{delivery_note_id}/attachment", status_code=status.HTTP_200_OK)
async def upload_delivery_attachment(delivery_note_id: int, request: Request, file: "UploadFile" = None):
    """Upload proof of delivery attachment (signed DR, photo, etc.)."""
    from fastapi import File, UploadFile as _UploadFile
    import uuid

    _, performed_by = _extract_jwt_claims(request)

    # Re-parse the file from the request since we need the actual UploadFile
    form = await request.form()
    uploaded = form.get("file")
    if not uploaded:
        raise HTTPException(status_code=422, detail={"error": "No file provided."})

    # Read file content
    file_content = await uploaded.read()
    file_size = len(file_content)
    if file_size > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=422, detail={"error": "File too large. Maximum 10MB."})

    filename = uploaded.filename or "attachment"
    file_uuid = str(uuid.uuid4())
    storage_path = f"delivery-notes/{delivery_note_id}/{file_uuid}_{filename}"

    # Upload to Supabase Storage
    try:
        supabase.storage.from_("hr-documents").upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": uploaded.content_type or "application/octet-stream"},
        )
    except Exception:
        raise HTTPException(status_code=500, detail={"error": "File upload failed."})

    # Update delivery note with attachment info
    supabase.table("delivery_notes").update({
        "attachment_path": storage_path,
        "attachment_filename": filename,
    }).eq("delivery_note_id", delivery_note_id).execute()

    write_audit_log(
        action="UPDATE",
        module_name="Delivery Notes",
        description=f"Uploaded attachment '{filename}' to delivery note #{delivery_note_id}",
        performed_by=performed_by,
        record_id=delivery_note_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {"attachment_path": storage_path, "attachment_filename": filename}
