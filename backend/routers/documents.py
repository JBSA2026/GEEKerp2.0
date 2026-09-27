from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.errors import db_http_error

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentCreate(BaseModel):
    client_id: Optional[int] = None
    document_name: str
    document_type: Optional[str] = None
    file_path: Optional[str] = None
    employee_id: Optional[int] = None


class DocumentUpdate(BaseModel):
    client_id: Optional[int] = None
    document_name: Optional[str] = None
    document_type: Optional[str] = None
    file_path: Optional[str] = None
    employee_id: Optional[int] = None


@router.get("/")
def get_documents(search: Optional[str] = Query(None)):
    req = supabase.table("documents").select("*").order("document_id")
    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"document_name.ilike.%{s}%,"
            f"document_type.ilike.%{s}%,"
            f"file_path.ilike.%{s}%"
        )
    return req.execute().data or []


@router.post("/", status_code=201)
def create_document(request: Request, payload: DocumentCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        res = supabase.table("documents").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="Documents",
        description=f"Created document {payload.document_name}",
        performed_by=performed_by,
        record_id=record.get("document_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return record


@router.patch("/{document_id}")
def update_document(document_id: int, request: Request, payload: DocumentUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        existing = supabase.table("documents").select("*").eq("document_id", document_id).single().execute()
        return existing.data

    try:
        res = supabase.table("documents").update(updates).eq("document_id", document_id).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found")

    write_audit_log(
        action="UPDATE",
        module_name="Documents",
        description=f"Updated document ID {document_id}",
        performed_by=performed_by,
        record_id=document_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    supabase.table("documents").delete().eq("document_id", document_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="Documents",
        description=f"Deleted document ID {document_id}",
        performed_by=performed_by,
        record_id=document_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None
