from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.errors import db_http_error
from utils.client_contacts import require_client

router = APIRouter(prefix="/contact_list", tags=["contacts"])


class ContactCreate(BaseModel):
    client_id: int
    first_name: str
    last_name: Optional[str] = None
    job_title: Optional[str] = None
    email: Optional[str] = None
    landline: Optional[str] = None
    is_primary_contact: bool = False


class ContactUpdate(BaseModel):
    client_id: Optional[int] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    job_title: Optional[str] = None
    email: Optional[str] = None
    landline: Optional[str] = None
    is_primary_contact: Optional[bool] = None


@router.get("/")
def get_contacts(
    search: Optional[str] = Query(None),
    client_id: Optional[int] = Query(None),
):
    req = supabase.table("contact_list").select("*").order("contact_id")
    if client_id is not None:
        req = req.eq("client_id", client_id)
    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"first_name.ilike.%{s}%,"
            f"last_name.ilike.%{s}%,"
            f"job_title.ilike.%{s}%,"
            f"email.ilike.%{s}%"
        )
    return req.execute().data or []


@router.post("/", status_code=201)
def create_contact(request: Request, payload: ContactCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    require_client(payload.client_id)
    try:
        res = supabase.table("contact_list").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="Contacts",
        description=f"Created contact {payload.first_name} {payload.last_name or ''}".strip(),
        performed_by=performed_by,
        record_id=record.get("contact_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return record


@router.patch("/{contact_id}")
def update_contact(contact_id: int, request: Request, payload: ContactUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)

    existing = supabase.table("contact_list").select("*").eq("contact_id", contact_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Contact not found")

    if not updates:
        return existing.data

    target_client_id = updates.get("client_id", existing.data.get("client_id"))
    if target_client_id is None:
        raise HTTPException(status_code=422, detail="A contact person must belong to a client.")
    require_client(target_client_id)

    try:
        res = supabase.table("contact_list").update(updates).eq("contact_id", contact_id).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=404, detail="Contact not found")

    write_audit_log(
        action="UPDATE",
        module_name="Contacts",
        description=f"Updated contact ID {contact_id}",
        performed_by=performed_by,
        record_id=contact_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    supabase.table("contact_list").delete().eq("contact_id", contact_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="Contacts",
        description=f"Deleted contact ID {contact_id}",
        performed_by=performed_by,
        record_id=contact_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None
