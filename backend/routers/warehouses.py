from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.cache import cached

router = APIRouter(prefix="/warehouses", tags=["warehouses"])


class WarehouseCreate(BaseModel):
    warehouse_code: str
    warehouse_name: str
    warehouse_type: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    status: str = "ACTIVE"


class WarehouseUpdate(BaseModel):
    warehouse_code: Optional[str] = None
    warehouse_name: Optional[str] = None
    warehouse_type: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    status: Optional[str] = None


def _safe_record_id(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@router.get("/")
@cached("warehouses:list:{search}", ttl=120)
def get_warehouses(search: Optional[str] = Query(None)):
    req = supabase.table("warehouses").select("*").order("warehouse_name")
    if search:
        req = req.or_(
            f"warehouse_code.ilike.%{search}%,"
            f"warehouse_name.ilike.%{search}%,"
            f"warehouse_type.ilike.%{search}%,"
            f"address.ilike.%{search}%,"
            f"contact_person.ilike.%{search}%,"
            f"contact_number.ilike.%{search}%"
        )
    return req.execute().data or []


@router.post("/", status_code=201)
def create_warehouse(request: Request, payload: WarehouseCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = payload.model_dump(exclude_none=True)
    data["status"] = (data.get("status") or "ACTIVE").upper()

    existing = (
        supabase.table("warehouses")
        .select("warehouse_id")
        .eq("warehouse_code", payload.warehouse_code)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="Warehouse code already exists")

    res = supabase.table("warehouses").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create warehouse")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="Warehouse List",
        description=f"Created warehouse {payload.warehouse_name} ({payload.warehouse_code})",
        performed_by=performed_by,
        record_id=_safe_record_id(record.get("warehouse_id")),
        ip_address=request.client.host if request.client else None,
        new_values=record,
        request=request,
    )
    return record


@router.patch("/{warehouse_id}")
def update_warehouse(warehouse_id: str, request: Request, payload: WarehouseUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "status" in updates:
        updates["status"] = updates["status"].upper()

    existing = (
        supabase.table("warehouses")
        .select("*")
        .eq("warehouse_id", warehouse_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    if not updates:
        return existing.data

    if "warehouse_code" in updates:
        duplicate = (
            supabase.table("warehouses")
            .select("warehouse_id")
            .eq("warehouse_code", updates["warehouse_code"])
            .neq("warehouse_id", warehouse_id)
            .execute()
        )
        if duplicate.data:
            raise HTTPException(status_code=400, detail="Warehouse code already exists")

    res = supabase.table("warehouses").update(updates).eq("warehouse_id", warehouse_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    warehouse_name = existing.data.get("warehouse_name", warehouse_id)
    changed_parts = []
    for key, new_val in updates.items():
        old_val = existing.data.get(key)
        if str(old_val) != str(new_val):
            changed_parts.append(f"{key.replace('_', ' ')}: {old_val} -> {new_val}")
    change_str = "; ".join(changed_parts) if changed_parts else "no effective changes"

    write_audit_log(
        action="UPDATE",
        module_name="Warehouse List",
        description=f"Updated warehouse {warehouse_name} - {change_str}",
        performed_by=performed_by,
        record_id=_safe_record_id(warehouse_id),
        ip_address=request.client.host if request.client else None,
        old_values=existing.data,
        new_values=res.data[0],
        request=request,
    )
    return res.data[0]


@router.delete("/{warehouse_id}", status_code=204)
def delete_warehouse(warehouse_id: str, request: Request):
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("warehouses")
        .select("*")
        .eq("warehouse_id", warehouse_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    stock_refs = (
        supabase.table("inventory_stock")
        .select("stock_id")
        .eq("warehouse_id", warehouse_id)
        .limit(1)
        .execute()
    )
    if stock_refs.data:
        raise HTTPException(status_code=400, detail="Warehouse is used by inventory stock")

    supabase.table("warehouses").delete().eq("warehouse_id", warehouse_id).execute()

    warehouse_name = existing.data.get("warehouse_name", warehouse_id)
    warehouse_code = existing.data.get("warehouse_code", warehouse_id)
    write_audit_log(
        action="DELETE",
        module_name="Warehouse List",
        description=f"Deleted warehouse {warehouse_name} ({warehouse_code})",
        performed_by=performed_by,
        record_id=_safe_record_id(warehouse_id),
        ip_address=request.client.host if request.client else None,
        old_values=existing.data,
        request=request,
    )
    return None
