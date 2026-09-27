"""Commission Management router (Module 22).

Submodules: Sales Commission, Agent Commission, Commission Approval,
Cash Advance Recovery, Commission Payout.

Calculations:
  Sales Commission   = Collected Gross Profit × Commission Rate
  Agent Commission   = Commission Base × Commission Rate
  Commission WHT     = Commission Amount × 10%
  Net Commission     = Commission Amount - WHT - Cash Advance Recovery
"""
from datetime import date, datetime
from io import StringIO
from csv import DictWriter
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.code_generator import generate_code
from utils.reports_calc import compute_commission, WHT_RATE_DEFAULT

router = APIRouter(prefix="/commission", tags=["Commission Management"])

MODULE_NAME = "Commission Management"
ENTITIES = ("Expedia", "GreatnessLab", "Exigent", "KSI")
WHT_RATE = WHT_RATE_DEFAULT  # 10% withholding tax on commissions


# ── Schemas ───────────────────────────────────────────────────────────────────

class CommissionCreate(BaseModel):
    commission_type: str  # 'Sales' or 'Agent'
    entity: str
    employee_id: int
    project_id: Optional[int] = None
    project_code: Optional[str] = None
    project_name: Optional[str] = None
    reference_module: Optional[str] = None
    reference_number: Optional[str] = None
    contract_value: float = 0
    total_cost: float = 0
    collected_amount: float = 0
    commission_rate: float  # Required — user decides the rate
    commission_base: Optional[float] = None  # Override base for Agent type
    period: Optional[str] = None
    remarks: Optional[str] = None

    @field_validator("commission_type")
    @classmethod
    def _ct(cls, v):
        if v not in ("Sales", "Agent"):
            raise ValueError("Must be 'Sales' or 'Agent'")
        return v

    @field_validator("entity")
    @classmethod
    def _ent(cls, v):
        if v not in ENTITIES:
            raise ValueError(f"Must be one of: {', '.join(ENTITIES)}")
        return v


class CashAdvanceCreate(BaseModel):
    entity: str
    employee_id: int
    amount: float
    purpose: Optional[str] = None
    advance_date: Optional[date] = None

    @field_validator("entity")
    @classmethod
    def _ent(cls, v):
        if v not in ENTITIES:
            raise ValueError(f"Must be one of: {', '.join(ENTITIES)}")
        return v


class PayoutCreate(BaseModel):
    entity: str
    commission_ids: List[int]
    remarks: Optional[str] = None

    @field_validator("entity")
    @classmethod
    def _ent(cls, v):
        if v not in ENTITIES:
            raise ValueError(f"Must be one of: {', '.join(ENTITIES)}")
        return v


# ── Calculation Engine ────────────────────────────────────────────────────────

def _get_commission_rate(entity: str, commission_type: str) -> float:
    """Fetch the active commission rate for the entity/type. Returns percentage."""
    res = (
        supabase.table("commission_rates")
        .select("rate_percentage")
        .eq("entity", entity)
        .eq("commission_type", commission_type)
        .eq("is_active", True)
        .order("rate_percentage", desc=True)
        .limit(1)
        .execute()
    )
    if res.data:
        return float(res.data[0]["rate_percentage"])
    return 5.0  # Default 5% if not configured


def _get_outstanding_advances(employee_id: int) -> float:
    """Get total outstanding (unrecovered) cash advance balance for an employee."""
    res = (
        supabase.table("cash_advances")
        .select("amount, recovered_amount")
        .eq("employee_id", employee_id)
        .eq("status", "Active")
        .execute()
    )
    total = 0.0
    for r in (res.data or []):
        total += float(r.get("amount", 0)) - float(r.get("recovered_amount", 0))
    return round(total, 2)


def _compute_commission(payload: CommissionCreate) -> dict:
    """Core calculation logic — delegates to the shared, pure
    ``compute_commission`` utility in ``utils/reports_calc.py`` so this router
    and the Reports Module always compute commission figures identically.
    """
    outstanding_advances = _get_outstanding_advances(payload.employee_id)
    return compute_commission(
        commission_type=payload.commission_type,
        contract_value=payload.contract_value,
        total_cost=payload.total_cost,
        collected_amount=payload.collected_amount,
        commission_rate=payload.commission_rate,
        outstanding_advances=outstanding_advances,
        commission_base_override=payload.commission_base,
        wht_rate=WHT_RATE,
    )


def _employee_name(employee_id: int) -> str:
    try:
        r = supabase.table("employees").select("first_name, last_name").eq("employee_id", employee_id).limit(1).execute()
        if r.data:
            return f"{r.data[0].get('first_name', '')} {r.data[0].get('last_name', '')}".strip()
    except Exception:
        pass
    return ""


# ── Commission Records Endpoints ─────────────────────────────────────────────

@router.get("/records")
def list_commissions(
    entity: Optional[str] = Query(None),
    commission_type: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    employee_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
):
    req = supabase.table("commission_records").select("*").order("commission_id", desc=True)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if commission_type and commission_type != "All":
        req = req.eq("commission_type", commission_type)
    if status_filter and status_filter != "All":
        req = req.eq("status", status_filter)
    if employee_id:
        req = req.eq("employee_id", employee_id)
    if search and search.strip():
        s = search.strip()
        req = req.or_(f"commission_number.ilike.%{s}%,employee_name.ilike.%{s}%,project_name.ilike.%{s}%")
    return req.execute().data or []


@router.get("/records/metrics")
def commission_metrics(entity: Optional[str] = Query(None)):
    req = supabase.table("commission_records").select("commission_id, status, commission_amount, net_payable, commission_type")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    rows = req.execute().data or []
    total = len(rows)
    pending = sum(1 for r in rows if r.get("status") == "Pending Approval")
    approved = sum(1 for r in rows if r.get("status") in ("Approved", "For Payout"))
    paid = sum(1 for r in rows if r.get("status") == "Paid")
    total_commission = round(sum(float(r.get("commission_amount") or 0) for r in rows), 2)
    total_net = round(sum(float(r.get("net_payable") or 0) for r in rows if r.get("status") != "Cancelled"), 2)
    return {
        "total_records": total,
        "pending_approval": pending,
        "approved": approved,
        "paid": paid,
        "total_commission": total_commission,
        "total_net_payable": total_net,
    }


@router.get("/records/{commission_id}")
def get_commission(commission_id: int):
    res = supabase.table("commission_records").select("*").eq("commission_id", commission_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Commission record not found."})
    return res.data[0]


@router.post("/records/compute")
def compute_commission_preview(payload: CommissionCreate):
    """Preview commission calculation without saving. Used for the form preview."""
    result = _compute_commission(payload)
    return {"preview": True, **result}


@router.post("/records", status_code=201)
def create_commission(request: Request, payload: CommissionCreate):
    """Compute and save a commission record."""
    _, performed_by = _extract_jwt_claims(request)
    calcs = _compute_commission(payload)
    emp_name = _employee_name(payload.employee_id)
    commission_number = generate_code(payload.entity, "COM", "commission_records", "commission_number")

    data = {
        "commission_number": commission_number,
        "commission_type": payload.commission_type,
        "entity": payload.entity,
        "employee_id": payload.employee_id,
        "employee_name": emp_name,
        "project_id": payload.project_id,
        "project_code": payload.project_code,
        "project_name": payload.project_name,
        "reference_module": payload.reference_module,
        "reference_number": payload.reference_number,
        "period": payload.period,
        "remarks": payload.remarks,
        "status": "Draft",
        **calcs,
    }
    res = supabase.table("commission_records").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create commission record."})

    write_audit_log(
        action="CREATE", module_name=MODULE_NAME,
        description=f"Created {payload.commission_type} commission {commission_number} for {emp_name} — ₱{calcs['net_payable']:,.2f} net",
        performed_by=performed_by, record_id=res.data[0]["commission_id"],
        ip_address=request.client.host if request.client else None, request=request,
    )
    return res.data[0]


@router.post("/records/{commission_id}/submit")
def submit_for_approval(commission_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("commission_records").select("*").eq("commission_id", commission_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Commission not found."})
    if res.data[0]["status"] != "Draft":
        raise HTTPException(status_code=400, detail={"error": "Only Draft commissions can be submitted."})
    supabase.table("commission_records").update({"status": "Pending Approval"}).eq("commission_id", commission_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Submitted commission #{commission_id} for approval", performed_by=performed_by, record_id=commission_id, ip_address=request.client.host if request.client else None, request=request)
    return get_commission(commission_id)


@router.post("/records/{commission_id}/approve")
def approve_commission(commission_id: int, request: Request):
    employee_id, performed_by = _extract_jwt_claims(request)
    res = supabase.table("commission_records").select("*").eq("commission_id", commission_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Commission not found."})
    if res.data[0]["status"] != "Pending Approval":
        raise HTTPException(status_code=400, detail={"error": "Only Pending Approval commissions can be approved."})
    now = datetime.now().isoformat()
    supabase.table("commission_records").update({"status": "Approved", "approved_by": employee_id, "approved_at": now}).eq("commission_id", commission_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Approved commission #{commission_id}", performed_by=performed_by, record_id=commission_id, ip_address=request.client.host if request.client else None, request=request)
    return get_commission(commission_id)


@router.post("/records/{commission_id}/reject")
def reject_commission(commission_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("commission_records").select("*").eq("commission_id", commission_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Commission not found."})
    if res.data[0]["status"] not in ("Pending Approval", "Approved"):
        raise HTTPException(status_code=400, detail={"error": "Cannot reject this commission."})
    supabase.table("commission_records").update({"status": "Cancelled"}).eq("commission_id", commission_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Rejected/cancelled commission #{commission_id}", performed_by=performed_by, record_id=commission_id, ip_address=request.client.host if request.client else None, request=request)
    return get_commission(commission_id)


# ── Cash Advances ─────────────────────────────────────────────────────────────

@router.get("/advances")
def list_advances(entity: Optional[str] = Query(None), employee_id: Optional[int] = Query(None), status_filter: Optional[str] = Query(None, alias="status")):
    req = supabase.table("cash_advances").select("*").order("advance_id", desc=True)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if employee_id:
        req = req.eq("employee_id", employee_id)
    if status_filter and status_filter != "All":
        req = req.eq("status", status_filter)
    return req.execute().data or []


@router.post("/advances", status_code=201)
def create_advance(request: Request, payload: CashAdvanceCreate):
    _, performed_by = _extract_jwt_claims(request)
    emp_name = _employee_name(payload.employee_id)
    advance_number = generate_code(payload.entity, "ADV", "cash_advances", "advance_number")
    data = {
        "advance_number": advance_number,
        "entity": payload.entity,
        "employee_id": payload.employee_id,
        "employee_name": emp_name,
        "amount": payload.amount,
        "recovered_amount": 0,
        "status": "Active",
        "purpose": payload.purpose,
        "advance_date": (payload.advance_date or date.today()).isoformat(),
    }
    res = supabase.table("cash_advances").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create cash advance."})
    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Created cash advance {advance_number} for {emp_name} — ₱{payload.amount:,.2f}", performed_by=performed_by, record_id=res.data[0]["advance_id"], ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


# ── Commission Payout ─────────────────────────────────────────────────────────

@router.post("/payouts", status_code=201)
def create_payout(request: Request, payload: PayoutCreate):
    """Create a payout batch from approved commission records. Recovers cash advances."""
    _, performed_by = _extract_jwt_claims(request)

    if not payload.commission_ids:
        raise HTTPException(status_code=422, detail={"error": "No commission records selected."})

    # Fetch the commission records
    records = supabase.table("commission_records").select("*").in_("commission_id", payload.commission_ids).eq("status", "Approved").execute().data or []
    if not records:
        raise HTTPException(status_code=400, detail={"error": "No approved commissions found in the selection."})

    total_amount = 0.0
    total_wht = 0.0
    total_net = 0.0

    for rec in records:
        total_amount += float(rec.get("commission_amount", 0))
        total_wht += float(rec.get("withholding_tax", 0))
        total_net += float(rec.get("net_payable", 0))

        # Recover cash advances for this employee
        recovery = float(rec.get("cash_advance_recovery", 0))
        if recovery > 0:
            _apply_advance_recovery(rec["employee_id"], recovery)

        # Mark commission as paid
        supabase.table("commission_records").update({"status": "Paid", "paid_at": datetime.now().isoformat()}).eq("commission_id", rec["commission_id"]).execute()

    payout_number = generate_code(payload.entity, "PAY", "commission_payouts", "payout_number")
    payout = {
        "payout_number": payout_number,
        "entity": payload.entity,
        "payout_date": date.today().isoformat(),
        "total_amount": round(total_amount, 2),
        "total_wht": round(total_wht, 2),
        "total_net": round(total_net, 2),
        "commission_count": len(records),
        "status": "Paid",
        "remarks": payload.remarks,
    }
    res = supabase.table("commission_payouts").insert(payout).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create payout record."})

    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Created payout {payout_number} — {len(records)} commissions, ₱{round(total_net, 2):,.2f} net", performed_by=performed_by, record_id=res.data[0]["payout_id"], ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.get("/payouts")
def list_payouts(entity: Optional[str] = Query(None)):
    req = supabase.table("commission_payouts").select("*").order("payout_id", desc=True)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    return req.execute().data or []


def _apply_advance_recovery(employee_id: int, amount: float) -> None:
    """Apply recovery amount to the oldest outstanding cash advances (FIFO)."""
    advances = (
        supabase.table("cash_advances")
        .select("*")
        .eq("employee_id", employee_id)
        .eq("status", "Active")
        .order("advance_date")
        .execute()
    ).data or []

    remaining = amount
    for adv in advances:
        if remaining <= 0:
            break
        balance = float(adv["amount"]) - float(adv["recovered_amount"])
        if balance <= 0:
            continue
        recover = min(remaining, balance)
        new_recovered = float(adv["recovered_amount"]) + recover
        new_status = "Fully Recovered" if new_recovered >= float(adv["amount"]) else "Active"
        supabase.table("cash_advances").update({
            "recovered_amount": round(new_recovered, 2),
            "status": new_status,
        }).eq("advance_id", adv["advance_id"]).execute()
        remaining -= recover


# ── Commission Rates CRUD ─────────────────────────────────────────────────────

@router.get("/rates")
def list_rates(entity: Optional[str] = Query(None)):
    req = supabase.table("commission_rates").select("*").order("entity, commission_type")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    return req.execute().data or []


@router.post("/rates", status_code=201)
def create_rate(request: Request, entity: str = Query(...), commission_type: str = Query(...), rate_name: str = Query(...), rate_percentage: float = Query(...)):
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("commission_rates").insert({
        "entity": entity, "commission_type": commission_type,
        "rate_name": rate_name, "rate_percentage": rate_percentage, "is_active": True,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create rate."})
    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Created rate {rate_name} ({rate_percentage}%) for {entity}/{commission_type}", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/export")
def export_commissions(entity: Optional[str] = Query(None), status_filter: Optional[str] = Query(None, alias="status")):
    rows = list_commissions(entity=entity, commission_type=None, status_filter=status_filter, employee_id=None, search=None)
    fields = ["commission_number", "commission_type", "entity", "employee_name", "project_name", "contract_value", "gross_profit", "gross_margin_pct", "collected_amount", "commission_rate", "commission_amount", "withholding_tax", "cash_advance_recovery", "net_payable", "status", "period", "created_at"]
    output = StringIO()
    writer = DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="commissions.csv"'})


# ── Project Data for Commission ───────────────────────────────────────────────

@router.get("/projects")
def list_projects_for_commission(entity: Optional[str] = Query(None)):
    """Return projects with financial data for the commission form.
    Auto-populates contract_value, total_cost (from budget actuals + materials),
    and collected amount (from AR invoices paid against the project).
    """
    req = supabase.table("projects").select("project_id, project_code, project_name, contract_value, budget, entity, status, client_id")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    req = req.order("created_at", desc=True)
    projects = req.execute().data or []

    result = []
    for p in projects:
        pid = p["project_id"]

        # Total cost: sum of budget actuals + material costs
        total_cost = 0.0
        try:
            budget_res = supabase.table("project_budget_items").select("actual_amount").eq("project_id", pid).execute()
            total_cost += sum(float(r.get("actual_amount") or 0) for r in (budget_res.data or []))
        except Exception:
            pass
        try:
            material_res = supabase.table("project_materials").select("quantity, unit_cost").eq("project_id", pid).execute()
            total_cost += sum(float(r.get("quantity", 0)) * float(r.get("unit_cost", 0)) for r in (material_res.data or []))
        except Exception:
            pass

        # Collected amount: from AR invoices linked to this project
        collected = 0.0
        try:
            inv_res = supabase.table("ar_invoices").select("billing_subtotal, collection_status").eq("project_code", p.get("project_code")).execute()
            for inv in (inv_res.data or []):
                if inv.get("collection_status") in ("PAID", "PARTIALLY_PAID"):
                    collected += float(inv.get("billing_subtotal") or 0)
        except Exception:
            pass

        contract_value = float(p.get("contract_value") or 0)
        gross_profit = round(contract_value - total_cost, 2)

        result.append({
            "project_id": pid,
            "project_code": p.get("project_code"),
            "project_name": p.get("project_name"),
            "entity": p.get("entity"),
            "status": p.get("status"),
            "contract_value": round(contract_value, 2),
            "total_cost": round(total_cost, 2),
            "gross_profit": gross_profit,
            "gross_margin_pct": round((gross_profit / contract_value * 100) if contract_value > 0 else 0, 2),
            "collected_amount": round(collected, 2),
        })

    return result
