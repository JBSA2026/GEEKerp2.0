"""CRM / Sales router.

Provides CRM-specific views over the shared master data tables.
The Customer List reuses `client_list`; future sub-modules (leads, pipeline,
activities, forecast) will add their own endpoints under /crm/*.
"""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from routers import quotations as quotations_router
from utils.errors import db_http_error

router = APIRouter(prefix="/crm", tags=["crm"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class CustomerCreate(BaseModel):
    customer_code: Optional[str] = None
    company_name: str
    trade_name: Optional[str] = None
    customer_type: Optional[str] = None
    industry: Optional[str] = None
    tin_number: Optional[str] = None
    vat_status: Optional[str] = None
    billing_address: Optional[str] = None
    address: Optional[str] = None
    assigned_salesperson: Optional[str] = None
    payment_terms: Optional[str] = None
    credit_limit: Optional[float] = None
    entity: Optional[str] = None


class CustomerUpdate(BaseModel):
    customer_code: Optional[str] = None
    company_name: Optional[str] = None
    trade_name: Optional[str] = None
    customer_type: Optional[str] = None
    industry: Optional[str] = None
    tin_number: Optional[str] = None
    vat_status: Optional[str] = None
    billing_address: Optional[str] = None
    address: Optional[str] = None
    zip_code: Optional[str] = None
    assigned_salesperson: Optional[str] = None
    payment_terms: Optional[str] = None
    credit_limit: Optional[float] = None
    entity: Optional[str] = None
    status: Optional[str] = None


# ── Customer Metrics ─────────────────────────────────────────────────────────

@router.get("/employees/active")
def list_active_employees():
    """Return active employees for the Assigned Salesperson combobox."""
    res = (
        supabase.table("employees")
        .select("employee_id, first_name, last_name, email")
        .eq("is_active", True)
        .order("first_name")
        .execute()
    )
    return res.data or []


@router.get("/customers/metrics")
def customer_metrics():
    """Return summary metrics for the CRM customer dashboard cards."""
    all_rows = supabase.table("client_list").select("client_id, status, created_at").execute().data or []
    total = len(all_rows)
    active = sum(1 for r in all_rows if (r.get("status") or "active").lower() == "active")

    # New this month: count rows with created_at in current month
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    new_this_month = 0
    for r in all_rows:
        ca = r.get("created_at")
        if ca:
            try:
                dt = datetime.fromisoformat(ca.replace("Z", "+00:00"))
                if dt.year == now.year and dt.month == now.month:
                    new_this_month += 1
            except (ValueError, TypeError):
                pass

    return {
        "total_customers": total,
        "active_customers": active,
        "new_this_month": new_this_month,
        "total_revenue": None,  # Placeholder — will be computed from invoices later
    }


# ── Customer List ────────────────────────────────────────────────────────────

@router.get("/customers")
def list_customers(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """List all customers with optional search and status filter."""
    req = supabase.table("client_list").select("*").order("client_id")

    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"company_name.ilike.%{s}%,"
            f"trade_name.ilike.%{s}%,"
            f"tin_number.ilike.%{s}%,"
            f"customer_code.ilike.%{s}%,"
            f"industry.ilike.%{s}%"
        )

    if status and status.lower() != "all":
        req = req.eq("status", status.lower())

    return req.execute().data or []


@router.post("/customers", status_code=201)
def create_customer(request: Request, payload: CustomerCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}

    # Auto-generate customer_code in standard format: COMPANY-YYYY-CUS-NNNN
    from utils.code_generator import generate_code
    data["customer_code"] = generate_code(data.get("entity") or None, "CUS", "client_list", "customer_code")

    try:
        res = supabase.table("client_list").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)

    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="CRM",
        description=f"Created customer {payload.company_name}",
        performed_by=performed_by,
        record_id=record.get("client_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return record


@router.patch("/customers/{client_id}")
def update_customer(client_id: int, request: Request, payload: CustomerUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        existing = supabase.table("client_list").select("*").eq("client_id", client_id).single().execute()
        return existing.data

    try:
        res = supabase.table("client_list").update(updates).eq("client_id", client_id).execute()
    except Exception as e:
        raise db_http_error(e)

    if not res.data:
        raise HTTPException(status_code=404, detail="Customer not found")

    write_audit_log(
        action="UPDATE",
        module_name="CRM",
        description=f"Updated customer ID {client_id}",
        performed_by=performed_by,
        record_id=client_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/customers/{client_id}", status_code=204)
def delete_customer(client_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)

    existing = supabase.table("client_list").select("client_id, company_name").eq("client_id", client_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Customer not found")

    company_name = existing.data.get("company_name", f"ID #{client_id}")
    supabase.table("client_list").delete().eq("client_id", client_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="CRM",
        description=f"Deleted customer {company_name}",
        performed_by=performed_by,
        record_id=client_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None


# ── Pipeline (Opportunities) ─────────────────────────────────────────────────

PIPELINE_STAGES = [
    "Prospecting",
    "Qualification",
    "Proposal",
    "Negotiation",
    "Approval",
    "Closed Won",
    "Closed Lost",
]


@router.get("/pipeline")
def get_pipeline(closed_days: int = Query(14, description="Only show closed deals from the last N days. Set to 0 for all.")):
    """Return all opportunities for the Kanban board, filtering old closed deals."""
    res = supabase.table("opportunities").select("*").order("opportunity_id", desc=True).execute()
    rows = res.data or []

    if closed_days > 0:
        cutoff = (datetime.now() - timedelta(days=closed_days)).isoformat()
        filtered = []
        for row in rows:
            stage = row.get("stage") or "Prospecting"
            if stage in ("Closed Won", "Closed Lost"):
                closed_at = row.get("closed_at")
                # If closed_at is set and is older than cutoff, exclude
                if closed_at and closed_at < cutoff:
                    continue
            filtered.append(row)
        return filtered

    return rows


@router.patch("/pipeline/{opportunity_id}/stage")
def update_stage(opportunity_id: int, request: Request, payload: dict):
    """Update an opportunity's stage (used by drag-and-drop)."""
    _, performed_by = _extract_jwt_claims(request)
    stage = payload.get("stage")
    if stage not in PIPELINE_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {PIPELINE_STAGES}")

    existing = (
        supabase.table("opportunities")
        .select("*")
        .eq("opportunity_id", opportunity_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    previous_stage = existing.data.get("stage") or "Prospecting"

    # Block move from Proposal to Negotiation unless quotation is approved/sent
    if previous_stage == "Proposal" and stage == "Negotiation":
        quotations = (
            supabase.table("quotations")
            .select("status")
            .eq("opportunity_id", opportunity_id)
            .execute()
            .data or []
        )
        has_approved = any(
            (q.get("status") or "").upper() in ("APPROVED", "SENT")
            for q in quotations
        )
        if not has_approved:
            raise HTTPException(
                status_code=400,
                detail="Quotation must be approved before moving to Negotiation.",
            )
    automation = None
    if previous_stage == "Closed Won" and stage != "Closed Won":
        if not payload.get("confirm_reopen"):
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "Moving this sale out of Closed Won will cancel draft downstream records and release unissued reservations. Confirm to continue.",
                    "requires_confirmation": True,
                },
            )
        automation = quotations_router.reopen_closed_won_opportunity(opportunity_id, stage, performed_by, request)
    elif stage == "Closed Won" and previous_stage != "Closed Won":
        # If deal closure was already approved in workflow, allow inventory shortages
        deal_approved = supabase.table("workflow_approvals").select("status").eq("reference_module", "Sales").eq("reference_id", opportunity_id).eq("status", "Approved").limit(1).execute()
        allow_shortages = bool(deal_approved.data)
        automation = quotations_router.run_closed_won_automation(opportunity_id, performed_by, request, allow_shortages=allow_shortages)

    # Build update payload
    update_data = {"stage": stage}

    # Set closed_at when entering a Closed stage, clear it when leaving
    if stage in ("Closed Won", "Closed Lost") and previous_stage not in ("Closed Won", "Closed Lost"):
        update_data["closed_at"] = datetime.now().isoformat()
    elif previous_stage in ("Closed Won", "Closed Lost") and stage not in ("Closed Won", "Closed Lost"):
        update_data["closed_at"] = None

    # Record return_reason when moving back to Proposal from Negotiation
    return_reason = payload.get("return_reason")
    if return_reason and stage == "Proposal" and previous_stage in ("Negotiation", "Closed Lost"):
        update_data["return_reason"] = return_reason

    try:
        res = supabase.table("opportunities").update(update_data).eq("opportunity_id", opportunity_id).execute()
    except Exception as e:
        raise db_http_error(e)

    if not res.data:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    # Create workflow approval record when moving to Approval stage
    if stage == "Approval" and previous_stage != "Approval":
        opp = res.data[0]
        # Derive entity from linked quotation
        entity = None
        try:
            quotation = supabase.table("quotations").select("company").eq("opportunity_id", opportunity_id).limit(1).execute()
            if quotation.data:
                # Map all known company slug variants to the canonical entity names used in workflow_approvals
                company_map = {
                    "greatnesslab": "GreatnessLab", "glab": "GreatnessLab", "glb": "GreatnessLab",
                    "expedia": "Expedia", "exssi": "Expedia", "exp": "Expedia",
                    "exigent": "Exigent", "exg": "Exigent",
                    "ksi": "KSI", "kyrios": "KSI",
                }
                entity = company_map.get((quotation.data[0].get("company") or "").lower())
        except Exception:
            pass
        try:
            from utils.code_generator import generate_code
            ref_number = generate_code(entity, "SLS", "workflow_approvals", "reference_number")
            supabase.table("workflow_approvals").insert({
                "request_type": "Deal Closure",
                "entity": entity,
                "reference_module": "Sales",
                "reference_id": opportunity_id,
                "reference_number": ref_number,
                "requestor_name": performed_by or "System",
                "department": "Sales",
                "amount": opp.get("estimated_value"),
                "status": "Pending",
                "priority": "High",
                "remarks": f"Deal closure approval for opportunity #{opportunity_id} - {opp.get('project_name', '')}",
            }).execute()
        except Exception:
            pass  # Non-critical — approval record creation failure shouldn't block stage update

    write_audit_log(
        action="UPDATE",
        module_name="CRM",
        description=f"Moved opportunity #{opportunity_id} to stage '{stage}'" + (f" (reason: {return_reason})" if return_reason else ""),
        performed_by=performed_by,
        record_id=opportunity_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return {**res.data[0], "automation": automation}


@router.get("/pipeline/{opportunity_id}/po-status")
def check_opportunity_po_status(opportunity_id: int):
    """Check if there are active POs covering stock shortages for this opportunity.

    Returns whether a PO with status PO_SENT/APPROVED/PARTIALLY_RECEIVED/RECEIVED
    exists for the purchase requests linked to this opportunity's quotation.
    """
    # Find quotation linked to this opportunity
    quotations = (
        supabase.table("quotations")
        .select("quotation_id, quotation_no")
        .eq("opportunity_id", opportunity_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data or []
    )
    if not quotations:
        return {"has_active_po": False, "po_references": []}

    quotation_no = quotations[0].get("quotation_no", "")

    # Find purchase requests linked via remarks containing this quotation number
    all_prs = (
        supabase.table("purchase_requests")
        .select("purchase_request_id, pr_number, remarks")
        .execute()
        .data or []
    )
    relevant_prs = [
        pr for pr in all_prs
        if pr.get("remarks") and quotation_no and quotation_no in pr["remarks"]
    ]
    pr_ids = [pr["purchase_request_id"] for pr in relevant_prs]

    if not pr_ids:
        return {"has_active_po": False, "po_references": []}

    # Find POs linked to these PRs
    pos = (
        supabase.table("purchase_orders")
        .select("purchase_order_id, po_number, status, purchase_request_id")
        .in_("purchase_request_id", pr_ids)
        .execute()
        .data or []
    )

    # Only POs that have actually been sent to the supplier (or beyond) count.
    # "APPROVED" means approved in workflow but NOT yet sent — insufficient.
    SENT_PO_STATUSES = ("PO_SENT", "PARTIALLY_RECEIVED", "RECEIVED")
    sent_pos = [
        po for po in pos
        if (po.get("status") or "").upper() in SENT_PO_STATUSES
    ]

    return {
        "has_active_po": len(sent_pos) > 0,
        "po_references": [
            {"po_number": po.get("po_number"), "status": po.get("status")}
            for po in sent_pos
        ],
    }


@router.get("/pipeline/stages")
def get_stages():
    """Return the ordered list of pipeline stages."""
    return PIPELINE_STAGES


# ── Sales Activities ─────────────────────────────────────────────────────────

ACTIVITY_TYPES = ["Call", "Email", "Meeting", "Follow-up", "Presentation", "Site Visit", "Other"]


class ActivityCreate(BaseModel):
    employee_id: Optional[int] = None
    client_id: Optional[int] = None
    opportunity_id: Optional[int] = None
    activity_type: str
    activity_date: Optional[str] = None
    subject: str
    notes_outcome: Optional[str] = None


class ActivityUpdate(BaseModel):
    employee_id: Optional[int] = None
    client_id: Optional[int] = None
    opportunity_id: Optional[int] = None
    activity_type: Optional[str] = None
    activity_date: Optional[str] = None
    subject: Optional[str] = None
    notes_outcome: Optional[str] = None


@router.get("/activities")
def list_activities(
    activity_type: Optional[str] = Query(None),
    client_id: Optional[int] = Query(None),
):
    """List activities in reverse chronological order."""
    req = supabase.table("sales_activity").select("*").order("activity_id", desc=True)
    if activity_type:
        req = req.eq("activity_type", activity_type)
    if client_id:
        req = req.eq("client_id", client_id)
    return req.execute().data or []


@router.get("/activities/types")
def get_activity_types():
    """Return allowed activity types."""
    return ACTIVITY_TYPES


@router.post("/activities", status_code=201)
def create_activity(request: Request, payload: ActivityCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}

    if payload.activity_type not in ACTIVITY_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid activity type. Must be one of: {ACTIVITY_TYPES}")

    try:
        res = supabase.table("sales_activity").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)

    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="CRM",
        description=f"Logged activity: {payload.subject} ({payload.activity_type})",
        performed_by=performed_by,
        record_id=record.get("activity_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return record


@router.patch("/activities/{activity_id}")
def update_activity(activity_id: int, request: Request, payload: ActivityUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        existing = supabase.table("sales_activity").select("*").eq("activity_id", activity_id).single().execute()
        return existing.data

    if "activity_type" in updates and updates["activity_type"] not in ACTIVITY_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid activity type. Must be one of: {ACTIVITY_TYPES}")

    try:
        res = supabase.table("sales_activity").update(updates).eq("activity_id", activity_id).execute()
    except Exception as e:
        raise db_http_error(e)

    if not res.data:
        raise HTTPException(status_code=404, detail="Activity not found")

    write_audit_log(
        action="UPDATE",
        module_name="CRM",
        description=f"Updated activity #{activity_id}",
        performed_by=performed_by,
        record_id=activity_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/activities/{activity_id}", status_code=204)
def delete_activity(activity_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    supabase.table("sales_activity").delete().eq("activity_id", activity_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="CRM",
        description=f"Deleted activity #{activity_id}",
        performed_by=performed_by,
        record_id=activity_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None
