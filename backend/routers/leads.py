from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.errors import db_http_error

router = APIRouter(prefix="/leads", tags=["leads"])


class LeadCreate(BaseModel):
    client_id: Optional[int] = None
    employee_id: Optional[int] = None
    company_name: str
    contact_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    mobile_number: Optional[str] = None
    lead_source: Optional[str] = None
    lead_status: Optional[str] = None
    interest_level: Optional[str] = None
    entity: Optional[str] = None
    remarks: Optional[str] = None


class LeadUpdate(BaseModel):
    client_id: Optional[int] = None
    employee_id: Optional[int] = None
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    mobile_number: Optional[str] = None
    lead_source: Optional[str] = None
    lead_status: Optional[str] = None
    interest_level: Optional[str] = None
    entity: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/")
def get_leads(search: Optional[str] = Query(None)):
    req = supabase.table("leads").select("*").order("lead_id")
    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"company_name.ilike.%{s}%,"
            f"contact_name.ilike.%{s}%,"
            f"first_name.ilike.%{s}%,"
            f"last_name.ilike.%{s}%,"
            f"email.ilike.%{s}%,"
            f"lead_source.ilike.%{s}%,"
            f"lead_status.ilike.%{s}%"
        )
    return req.execute().data or []


@router.post("/", status_code=201)
def create_lead(request: Request, payload: LeadCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    # Auto-populate contact_name from first_name/last_name for backward compat
    if (data.get("first_name") or data.get("last_name")) and not data.get("contact_name"):
        data["contact_name"] = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
    try:
        res = supabase.table("leads").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="Sales",
        description=f"Created lead {payload.company_name}",
        performed_by=performed_by,
        record_id=record.get("lead_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return record


@router.patch("/{lead_id}")
def update_lead(lead_id: int, request: Request, payload: LeadUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)

    # Auto-populate contact_name from first_name/last_name for backward compat
    if "first_name" in updates or "last_name" in updates:
        fn = updates.get("first_name") or ""
        ln = updates.get("last_name") or ""
        if fn or ln:
            updates["contact_name"] = f"{fn} {ln}".strip()

    if not updates:
        existing = supabase.table("leads").select("*").eq("lead_id", lead_id).single().execute()
        return existing.data

    try:
        res = supabase.table("leads").update(updates).eq("lead_id", lead_id).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    write_audit_log(
        action="UPDATE",
        module_name="Sales",
        description=f"Updated lead ID {lead_id}",
        performed_by=performed_by,
        record_id=lead_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/{lead_id}", status_code=204)
def delete_lead(lead_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    supabase.table("leads").delete().eq("lead_id", lead_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="Sales",
        description=f"Deleted lead ID {lead_id}",
        performed_by=performed_by,
        record_id=lead_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None


# ── Lead → Opportunity Conversion ────────────────────────────────────────────

class LeadConvertPayload(BaseModel):
    """Optional overrides when converting a lead to an opportunity."""
    project_name: Optional[str] = None
    estimated_value: Optional[float] = None
    probability_percentage: Optional[float] = None
    expected_closed_date: Optional[str] = None


@router.post("/{lead_id}/convert-to-opportunity", status_code=201)
def convert_lead_to_opportunity(lead_id: int, request: Request, payload: LeadConvertPayload = None):
    """Convert a lead into an opportunity.

    - Creates a new opportunity with data from the lead
    - Sets lead_status to 'Converted'
    - Stores the opportunity_id on the lead for traceability
    """
    _, performed_by = _extract_jwt_claims(request)

    # Fetch the lead
    lead_result = supabase.table("leads").select("*").eq("lead_id", lead_id).limit(1).execute()
    if not lead_result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = lead_result.data[0]

    # Don't convert already-converted leads
    if lead.get("converted_opportunity_id") or (lead.get("lead_status") or "").lower() == "converted":
        raise HTTPException(
            status_code=400,
            detail="This lead has already been converted to an opportunity."
        )

    # Build opportunity data from lead
    extra_info_parts = []
    if lead.get("contact_name"):
        extra_info_parts.append(f"Contact: {lead['contact_name']}")
    if lead.get("email"):
        extra_info_parts.append(f"Email: {lead['email']}")
    if lead.get("mobile_number"):
        extra_info_parts.append(f"Mobile: {lead['mobile_number']}")
    if lead.get("lead_source"):
        extra_info_parts.append(f"Source: {lead['lead_source']}")
    if lead.get("interest_level"):
        extra_info_parts.append(f"Interest: {lead['interest_level']}")

    lead_remarks = lead.get("remarks") or ""
    extra_info = " | ".join(extra_info_parts)
    combined_remarks = f"{lead_remarks}\n[From Lead #{lead_id}] {extra_info}".strip()

    overrides = payload.model_dump(exclude_unset=True) if payload else {}

    opportunity_data = {
        "client_id": lead.get("client_id"),
        "employee_id": lead.get("employee_id"),
        "project_name": overrides.get("project_name") or lead.get("company_name", "Untitled"),
        "estimated_value": overrides.get("estimated_value"),
        "probability_percentage": overrides.get("probability_percentage"),
        "expected_closed_date": overrides.get("expected_closed_date"),
        "stage": "Prospecting",
        "remarks": combined_remarks,
    }
    # Remove None values
    opportunity_data = {k: v for k, v in opportunity_data.items() if v is not None}

    try:
        opp_result = supabase.table("opportunities").insert(opportunity_data).execute()
    except Exception as e:
        raise db_http_error(e)

    if not opp_result.data:
        raise HTTPException(status_code=400, detail="Failed to create opportunity")

    opportunity = opp_result.data[0]
    opportunity_id = opportunity["opportunity_id"]

    # Update lead: mark as converted and link
    update_data = {"lead_status": "Converted"}
    try:
        # Try with the FK column (requires migration)
        supabase.table("leads").update({
            **update_data,
            "converted_opportunity_id": opportunity_id,
        }).eq("lead_id", lead_id).execute()
    except Exception:
        # Column may not exist yet — update status only
        supabase.table("leads").update(update_data).eq("lead_id", lead_id).execute()

    # Audit logs
    write_audit_log(
        action="CREATE",
        module_name="Sales",
        description=f"Converted lead '{lead.get('company_name')}' (#{lead_id}) into opportunity #{opportunity_id}",
        performed_by=performed_by,
        record_id=opportunity_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    write_audit_log(
        action="STATUS_CHANGE",
        module_name="Sales",
        description=f"Lead #{lead_id} converted to opportunity #{opportunity_id}",
        performed_by=performed_by,
        record_id=lead_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {
        "lead": {**lead, "lead_status": "Converted", "converted_opportunity_id": opportunity_id},
        "opportunity": opportunity,
    }
