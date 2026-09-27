from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel
from typing import Literal, Optional
from datetime import datetime
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.cache import cached

router = APIRouter(prefix="/supplier_list", tags=["suppliers"])


class SupplierCreate(BaseModel):
    company_name: str
    tin_number: str
    supplier_type: str
    supplier_classification: Literal["LOCAL", "INTERNATIONAL"]
    industry: str
    vat_status: str
    billing_address: str
    address: Optional[str] = None
    payment_terms: str
    employee_id: Optional[int] = None
    status: str = "active"


class SupplierUpdate(BaseModel):
    company_name: Optional[str] = None
    tin_number: Optional[str] = None
    supplier_type: Optional[str] = None
    supplier_classification: Optional[Literal["LOCAL", "INTERNATIONAL"]] = None
    industry: Optional[str] = None
    vat_status: Optional[str] = None
    billing_address: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None
    employee_id: Optional[int] = None
    status: Optional[str] = None


@router.get("/")
@cached("suppliers:list:{search}:{status_filter}", ttl=60)
def get_suppliers(search: Optional[str] = Query(None), status_filter: Optional[str] = Query(None, alias="status")):
    req = supabase.table("supplier_list").select("*").order("supplier_id")
    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"company_name.ilike.%{s}%,"
            f"tin_number.ilike.%{s}%,"
            f"supplier_type.ilike.%{s}%,"
            f"supplier_classification.ilike.%{s}%,"
            f"industry.ilike.%{s}%,"
            f"vat_status.ilike.%{s}%,"
            f"billing_address.ilike.%{s}%,"
            f"payment_terms.ilike.%{s}%"
        )
    if status_filter and status_filter.lower() != "all":
        req = req.eq("status", status_filter.lower())
    return req.execute().data or []


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_supplier(request: Request, payload: SupplierCreate):
    employee_id, performed_by = _extract_jwt_claims(request)
    now = datetime.now().isoformat()
    body = payload.model_dump(exclude_none=True)
    body["employee_id"] = body.get("employee_id") or employee_id
    if not body.get("employee_id"):
        fallback = supabase.table("employees").select("employee_id").limit(1).execute().data or []
        if fallback:
            body["employee_id"] = fallback[0]["employee_id"]
    if not body.get("employee_id"):
        raise HTTPException(status_code=400, detail="Employee is required to create a supplier")
    body["created_at"] = now
    body["updated_at"] = now
    res = supabase.table("supplier_list").insert(body).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="Suppliers",
        description=f"Created supplier {payload.company_name}",
        performed_by=performed_by,
        record_id=record.get("supplier_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return record


@router.patch("/{supplier_id}")
def update_supplier(supplier_id: str, request: Request, payload: SupplierUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)

    existing = (
        supabase.table("supplier_list")
        .select("supplier_id, company_name")
        .eq("supplier_id", supplier_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Supplier not found")

    if not updates:
        return existing.data

    updates["updated_at"] = datetime.now().isoformat()
    res = supabase.table("supplier_list").update(updates).eq("supplier_id", supplier_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Supplier not found")

    changed = ", ".join(k.replace("_", " ") for k in updates)
    write_audit_log(
        action="UPDATE",
        module_name="Suppliers",
        description=f"Updated supplier {existing.data.get('company_name', supplier_id)}: {changed}",
        performed_by=performed_by,
        record_id=supplier_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(supplier_id: str, request: Request):
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("supplier_list")
        .select("supplier_id, company_name")
        .eq("supplier_id", supplier_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Supplier not found")

    supabase.table("supplier_list").delete().eq("supplier_id", supplier_id).execute()
    write_audit_log(
        action="DELETE",
        module_name="Suppliers",
        description=f"Deleted supplier {existing.data.get('company_name', supplier_id)}",
        performed_by=performed_by,
        record_id=supplier_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None
