from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.errors import db_http_error

router = APIRouter(prefix="/sales_activity", tags=["sales_activity"])


class SalesActivityCreate(BaseModel):
    employee_id: Optional[int] = None
    activity_type: Optional[str] = None
    activity_date: Optional[str] = None
    subject: str
    notes_outcome: Optional[str] = None


class SalesActivityUpdate(BaseModel):
    employee_id: Optional[int] = None
    activity_type: Optional[str] = None
    activity_date: Optional[str] = None
    subject: Optional[str] = None
    notes_outcome: Optional[str] = None


@router.get("/")
def get_sales_activities(search: Optional[str] = Query(None)):
    req = supabase.table("sales_activity").select("*").order("activity_id")
    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"activity_type.ilike.%{s}%,"
            f"subject.ilike.%{s}%,"
            f"notes_outcome.ilike.%{s}%"
        )
    return req.execute().data or []


@router.post("/", status_code=201)
def create_sales_activity(request: Request, payload: SalesActivityCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        res = supabase.table("sales_activity").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="Sales",
        description=f"Created sales activity: {payload.subject}",
        performed_by=performed_by,
        record_id=record.get("activity_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return record


@router.patch("/{activity_id}")
def update_sales_activity(activity_id: int, request: Request, payload: SalesActivityUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        existing = supabase.table("sales_activity").select("*").eq("activity_id", activity_id).single().execute()
        return existing.data

    try:
        res = supabase.table("sales_activity").update(updates).eq("activity_id", activity_id).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=404, detail="Sales activity not found")

    write_audit_log(
        action="UPDATE",
        module_name="Sales",
        description=f"Updated sales activity ID {activity_id}",
        performed_by=performed_by,
        record_id=activity_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/{activity_id}", status_code=204)
def delete_sales_activity(activity_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    supabase.table("sales_activity").delete().eq("activity_id", activity_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="Sales",
        description=f"Deleted sales activity ID {activity_id}",
        performed_by=performed_by,
        record_id=activity_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None
