from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.cache import cached
from utils.errors import db_http_error

router = APIRouter(prefix="/services", tags=["services"])


class ServiceCreate(BaseModel):
    service_name: str
    company_name: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    tax_category: Optional[str] = None
    margin_percentage: Optional[float] = None
    warranty: Optional[str] = None
    warranty_period: Optional[str] = None
    service_description: Optional[str] = None
    service_notes: Optional[str] = None


class ServiceUpdate(BaseModel):
    service_name: Optional[str] = None
    company_name: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    tax_category: Optional[str] = None
    margin_percentage: Optional[float] = None
    warranty: Optional[str] = None
    warranty_period: Optional[str] = None
    service_description: Optional[str] = None
    service_notes: Optional[str] = None


@router.get("/")
@cached("services:list:{search}", ttl=60)
def get_services(search: Optional[str] = Query(None)):
    req = supabase.table("services").select("*").order("service_id")
    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"service_name.ilike.%{s}%,"
            f"company_name.ilike.%{s}%,"
            f"category.ilike.%{s}%,"
            f"sub_category.ilike.%{s}%"
        )
    return req.execute().data or []


@router.post("/", status_code=201)
def create_service(request: Request, payload: ServiceCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        res = supabase.table("services").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="Services",
        description=f"Created service: {payload.service_name}",
        performed_by=performed_by,
        record_id=record.get("service_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return record


@router.patch("/{service_id}")
def update_service(service_id: int, request: Request, payload: ServiceUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        existing = supabase.table("services").select("*").eq("service_id", service_id).single().execute()
        return existing.data

    try:
        res = supabase.table("services").update(updates).eq("service_id", service_id).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=404, detail="Service not found")

    write_audit_log(
        action="UPDATE",
        module_name="Services",
        description=f"Updated service ID {service_id}",
        performed_by=performed_by,
        record_id=service_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/{service_id}", status_code=204)
def delete_service(service_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    supabase.table("services").delete().eq("service_id", service_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="Services",
        description=f"Deleted service ID {service_id}",
        performed_by=performed_by,
        record_id=service_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None
