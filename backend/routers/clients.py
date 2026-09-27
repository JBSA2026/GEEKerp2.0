from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.cache import cached

router = APIRouter(prefix="/clients", tags=["clients"])


class ClientCreate(BaseModel):
    company_name:   str
    address:        str
    tin_number:     str
    entity:         Optional[str] = None
    zip_code:       Optional[str] = None


class ClientUpdate(BaseModel):
    company_name:   Optional[str] = None
    address:        Optional[str] = None
    tin_number:     Optional[str] = None
    entity:         Optional[str] = None
    zip_code:       Optional[str] = None


@router.get("/")
@cached("clients:list:{search}", ttl=60)
def get_clients(search: Optional[str] = Query(None)):
    req = supabase.table("client_list").select("*").order("client_id")
    if search:
        req = req.or_(
            f"company_name.ilike.%{search}%,"
            f"tin_number.ilike.%{search}%"
        )
    return req.execute().data


@router.post("/", status_code=201)
def create_client(request: Request, payload: ClientCreate):
    from utils.code_generator import generate_code
    from utils.errors import db_http_error

    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}

    # Auto-generate customer_code in standard format: ENTITY-YYYY-CUS-NNNN
    data["customer_code"] = generate_code(data.get("entity") or None, "CUS", "client_list", "customer_code")

    try:
        res = supabase.table("client_list").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)

    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action       = "CREATE",
        module_name  = "Clients",
        description  = f"Created client {payload.company_name} (TIN: {payload.tin_number})",
        performed_by = performed_by,
        record_id    = record.get("client_id"),
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )
    return record


@router.patch("/{client_id}")
def update_client(client_id: int, request: Request, payload: ClientUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)

    existing = (
        supabase.table("client_list")
        .select("*")
        .eq("client_id", client_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Client not found")

    if not updates:
        return existing.data

    res = (
        supabase.table("client_list")
        .update(updates)
        .eq("client_id", client_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Client not found")

    company_name = existing.data.get("company_name", f"ID #{client_id}")
    # Build change summary showing only what actually changed (old → new)
    changed_parts = []
    for key, new_val in updates.items():
        old_val = existing.data.get(key)
        if old_val != new_val:
            label = key.replace("_", " ")
            changed_parts.append(f"{label}: {old_val} → {new_val}")
    change_str = "; ".join(changed_parts) if changed_parts else "no effective changes"

    write_audit_log(
        action       = "UPDATE",
        module_name  = "Clients",
        description  = f"Updated client {company_name} — {change_str}",
        performed_by = performed_by,
        record_id    = client_id,
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )
    return res.data[0]


@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("client_list")
        .select("client_id, company_name")
        .eq("client_id", client_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Client not found")

    company_name = existing.data.get("company_name", f"ID #{client_id}")
    supabase.table("client_list").delete().eq("client_id", client_id).execute()

    write_audit_log(
        action       = "DELETE",
        module_name  = "Clients",
        description  = f"Deleted client {company_name}",
        performed_by = performed_by,
        record_id    = client_id,
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )
    return None
