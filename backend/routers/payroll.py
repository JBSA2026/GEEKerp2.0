"""Payroll Management module router.

Handles payroll generation, statutory deduction computation (SSS, PhilHealth,
Pag-IBIG, withholding tax), loans/advances, payroll approval workflow,
and bank file export.
"""

from csv import DictWriter
from datetime import date, datetime
from io import StringIO
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import supabase
from middleware.audit_middleware import _extract_jwt_claims, write_audit_log

router = APIRouter(prefix="/payroll", tags=["payroll"])

MODULE_NAME = "Payroll"


def _num(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


# ══════════════════════════════════════════════════════════════════════════════
# Philippine Statutory Computation Tables (2024-2026)
# ══════════════════════════════════════════════════════════════════════════════

def compute_sss(monthly_salary: float) -> dict:
    """Compute SSS contribution based on 2024 contribution table.
    Returns employee share and employer share (monthly).
    """
    # SSS 2024 table: salary bracket → monthly contribution
    # Minimum: ₱4,000 salary → ₱580 total (employee ₱225, employer ₱355)
    # Maximum: ₱30,000+ salary → ₱4,350 total (employee ₱1,350, employer ₱3,000)
    # Simplified bracket computation:
    if monthly_salary <= 4000:
        return {"employee": 180.0, "employer": 400.0}
    elif monthly_salary <= 5000:
        return {"employee": 225.0, "employer": 475.0}
    elif monthly_salary <= 10000:
        return {"employee": 450.0, "employer": 950.0}
    elif monthly_salary <= 15000:
        return {"employee": 675.0, "employer": 1425.0}
    elif monthly_salary <= 20000:
        return {"employee": 900.0, "employer": 1900.0}
    elif monthly_salary <= 25000:
        return {"employee": 1125.0, "employer": 2375.0}
    elif monthly_salary <= 30000:
        return {"employee": 1350.0, "employer": 2850.0}
    else:
        return {"employee": 1350.0, "employer": 3000.0}


def compute_philhealth(monthly_salary: float) -> dict:
    """Compute PhilHealth contribution: 5% of salary, split 50/50.
    Capped at ₱100,000 monthly salary (max ₱5,000 total).
    """
    rate = 0.05
    capped_salary = min(monthly_salary, 100000.0)
    total = round(capped_salary * rate, 2)
    share = round(total / 2, 2)
    return {"employee": share, "employer": share}


def compute_pagibig(monthly_salary: float) -> dict:
    """Compute Pag-IBIG/HDMF contribution.
    Employee: 1% if salary ≤ ₱1,500, else 2% (max ₱100)
    Employer: 2% (max ₱100)
    """
    if monthly_salary <= 1500:
        emp = round(monthly_salary * 0.01, 2)
    else:
        emp = min(round(monthly_salary * 0.02, 2), 200.0)
    er = min(round(monthly_salary * 0.02, 2), 200.0)
    return {"employee": min(emp, 200.0), "employer": min(er, 200.0)}


def compute_withholding_tax(monthly_taxable_income: float) -> float:
    """Compute monthly withholding tax using BIR graduated tax table (TRAIN Law).
    Monthly brackets (annual ÷ 12):
    - ₱0 to ₱20,833: 0%
    - ₱20,834 to ₱33,333: 15% of excess over ₱20,833
    - ₱33,334 to ₱66,667: ₱1,875 + 20% of excess over ₱33,333
    - ₱66,668 to ₱166,667: ₱8,541.80 + 25% of excess over ₱66,667
    - ₱166,668 to ₱666,667: ₱33,541.80 + 30% of excess over ₱166,667
    - Over ₱666,667: ₱183,541.80 + 35% of excess over ₱666,667
    """
    income = monthly_taxable_income
    if income <= 20833:
        return 0.0
    elif income <= 33333:
        return round((income - 20833) * 0.15, 2)
    elif income <= 66667:
        return round(1875 + (income - 33333) * 0.20, 2)
    elif income <= 166667:
        return round(8541.80 + (income - 66667) * 0.25, 2)
    elif income <= 666667:
        return round(33541.80 + (income - 166667) * 0.30, 2)
    else:
        return round(183541.80 + (income - 666667) * 0.35, 2)


# ══════════════════════════════════════════════════════════════════════════════
# Philippine Overtime Computation (DOLE Labor Code)
# ══════════════════════════════════════════════════════════════════════════════

# Occasion types and their pay multipliers (based on user's reference)
OVERTIME_OCCASIONS = {
    "REGULAR_WORKDAY": {
        "label": "Regular Workday",
        "rate": 1.25,         # 125% of hourly rate
        "exceed_8_rate": None,  # Regular OT: flat 125% for all OT hours
    },
    "SPECIAL_NON_WORKING_HOLIDAY": {
        "label": "Special Non-Working Holiday",
        "rate": 1.30,         # 130% for first 8 hours
        "exceed_8_rate": 1.69,  # 130% × 130% = 169% for hours beyond 8
    },
    "REGULAR_HOLIDAY": {
        "label": "Regular Holiday",
        "rate": 1.50,         # 150% for first 8 hours (when it's also rest day)
        "exceed_8_rate": 1.95,  # 150% × 130% = 195% for hours beyond 8
    },
    "NIGHT_SHIFT": {
        "label": "Night Shift Differential",
        "rate": 0.10,         # Additional 10% on top of per-category pay
        "exceed_8_rate": 0.10,
    },
}


def compute_overtime_pay(hourly_rate: float, entries: list) -> dict:
    """Compute total overtime pay from a list of overtime entries.

    Each entry: {"occasion": str, "hours": float, "night_shift": bool}

    Returns: {"total_overtime_pay": float, "breakdown": [...]}
    """
    breakdown = []
    total = 0.0

    for entry in entries:
        occasion = entry.get("occasion", "REGULAR_WORKDAY")
        hours = _num(entry.get("hours"))
        is_night = entry.get("night_shift", False)

        if hours <= 0:
            continue

        config = OVERTIME_OCCASIONS.get(occasion, OVERTIME_OCCASIONS["REGULAR_WORKDAY"])

        if occasion == "NIGHT_SHIFT":
            # Night shift is just the +10% on top, applied to whatever base
            pay = round(hourly_rate * 0.10 * hours, 2)
        elif config["exceed_8_rate"] and hours > 8:
            # First 8 hours at base rate, excess at exceed_8_rate
            first_8_pay = round(hourly_rate * config["rate"] * 8, 2)
            excess_hours = hours - 8
            excess_pay = round(hourly_rate * config["exceed_8_rate"] * excess_hours, 2)
            pay = first_8_pay + excess_pay
        else:
            pay = round(hourly_rate * config["rate"] * hours, 2)

        # Add night shift differential if applicable
        if is_night and occasion != "NIGHT_SHIFT":
            night_diff = round(pay * 0.10, 2)
            pay += night_diff

        total += pay
        breakdown.append({
            "occasion": occasion,
            "occasion_label": config["label"],
            "hours": hours,
            "rate_multiplier": config["rate"],
            "night_shift": is_night,
            "amount": pay,
        })

    return {"total_overtime_pay": round(total, 2), "breakdown": breakdown}


# ══════════════════════════════════════════════════════════════════════════════
# Pydantic Models
# ══════════════════════════════════════════════════════════════════════════════

class OvertimeEntry(BaseModel):
    occasion: str = "REGULAR_WORKDAY"
    hours: float = 0
    night_shift: bool = False


class PayrollEmployeeCreate(BaseModel):
    employee_id: int
    basic_salary: float = 0
    allowance: float = 0
    sss_contribution: float = 0
    philhealth_contribution: float = 0
    pagibig_contribution: float = 0
    withholding_tax: float = 0
    pay_frequency: str = "semi-monthly"
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    sss_number: Optional[str] = None
    philhealth_number: Optional[str] = None
    pagibig_number: Optional[str] = None
    tin_number: Optional[str] = None
    date_hired: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None


class PayrollEmployeeUpdate(BaseModel):
    basic_salary: Optional[float] = None
    allowance: Optional[float] = None
    sss_contribution: Optional[float] = None
    philhealth_contribution: Optional[float] = None
    pagibig_contribution: Optional[float] = None
    withholding_tax: Optional[float] = None
    pay_frequency: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    sss_number: Optional[str] = None
    philhealth_number: Optional[str] = None
    pagibig_number: Optional[str] = None
    tin_number: Optional[str] = None
    date_hired: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None


class GeneratePayrollRequest(BaseModel):
    period_start: str  # YYYY-MM-DD
    period_end: str
    pay_date: Optional[str] = None
    pay_frequency: str = "semi-monthly"


class LoanCreate(BaseModel):
    employee_id: int
    loan_type: str
    description: Optional[str] = None
    principal_amount: float
    monthly_deduction: float
    start_date: Optional[str] = None
    end_date: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# Employee Compensation Endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/employees")
def list_payroll_employees():
    """List all employees with their compensation info."""
    rows = supabase.table("payroll_employees").select("*").order("employee_id").execute().data or []
    # Enrich with employee names
    emps = supabase.table("employees").select("employee_id, first_name, last_name, email, is_active").execute().data or []
    emp_map = {e["employee_id"]: e for e in emps}
    for r in rows:
        emp = emp_map.get(r.get("employee_id"), {})
        r["employee_name"] = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip()
        r["email"] = emp.get("email", "")
        r["is_active"] = emp.get("is_active", True)
    return rows


@router.post("/employees", status_code=201)
def create_payroll_employee(request: Request, payload: PayrollEmployeeCreate):
    """Register an employee for payroll with their compensation details."""
    _, performed_by = _extract_jwt_claims(request)

    # Validate employee exists
    emp_check = supabase.table("employees").select("employee_id").eq("employee_id", payload.employee_id).execute()
    if not emp_check.data:
        raise HTTPException(status_code=422, detail={"error": f"Employee #{payload.employee_id} does not exist. Please select a valid employee.", "fields": {"employee_id": "Employee not found"}})

    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        res = supabase.table("payroll_employees").insert(data).execute()
    except Exception as e:
        error_msg = str(e)
        if "already exists" in error_msg or "23505" in error_msg:
            raise HTTPException(status_code=409, detail={"error": "This employee is already registered for payroll."})
        raise HTTPException(status_code=400, detail={"error": "Failed to register employee for payroll."})
    if not res.data:
        raise HTTPException(status_code=400, detail={"error": "Failed to create payroll employee"})
    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Registered employee #{payload.employee_id} for payroll", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.patch("/employees/{employee_id}")
def update_payroll_employee(employee_id: int, request: Request, payload: PayrollEmployeeUpdate):
    """Update compensation details for an employee."""
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        existing = supabase.table("payroll_employees").select("*").eq("employee_id", employee_id).execute()
        return existing.data[0] if existing.data else {}
    res = supabase.table("payroll_employees").update(updates).eq("employee_id", employee_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Payroll employee not found")
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Updated payroll info for employee #{employee_id}", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


# ══════════════════════════════════════════════════════════════════════════════
# Payroll Run Endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/runs")
def list_payroll_runs():
    """List all payroll runs."""
    return supabase.table("payroll_runs").select("*").order("created_at", desc=True).execute().data or []


@router.get("/runs/{run_id}")
def get_payroll_run(run_id: int):
    """Get a payroll run with all its items."""
    run = supabase.table("payroll_runs").select("*").eq("run_id", run_id).execute()
    if not run.data:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    items = supabase.table("payroll_items").select("*").eq("run_id", run_id).order("employee_name").execute().data or []
    return {**run.data[0], "items": items}


@router.post("/runs/generate", status_code=201)
def generate_payroll(request: Request, payload: GeneratePayrollRequest):
    """Generate a new payroll run computing all employee pay."""
    _, performed_by = _extract_jwt_claims(request)

    # Get all active payroll employees
    pe_rows = supabase.table("payroll_employees").select("*").eq("status", "active").execute().data or []
    if not pe_rows:
        raise HTTPException(status_code=400, detail="No active payroll employees found")

    # Get employee names
    emp_ids = [r["employee_id"] for r in pe_rows]
    emps = supabase.table("employees").select("employee_id, first_name, last_name").in_("employee_id", emp_ids).execute().data or []
    emp_map = {e["employee_id"]: f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() for e in emps}

    # Get active loans
    loans = supabase.table("payroll_loans").select("*").eq("status", "active").execute().data or []
    loan_map = {}
    for loan in loans:
        eid = loan["employee_id"]
        if eid not in loan_map:
            loan_map[eid] = []
        loan_map[eid].append(loan)

    # Get approved commissions (not yet paid) for inclusion in payroll
    commissions = supabase.table("commission_records").select(
        "commission_id, employee_id, commission_amount, net_payable, withholding_tax, status"
    ).in_("status", ["Approved", "For Payout"]).in_("employee_id", emp_ids).execute().data or []
    commission_map = {}
    for c in commissions:
        eid = c["employee_id"]
        if eid not in commission_map:
            commission_map[eid] = []
        commission_map[eid].append(c)

    # Determine if semi-monthly (divide salary by 2)
    is_semi = payload.pay_frequency == "semi-monthly"
    divisor = 2.0 if is_semi else 1.0

    # Compute each employee
    items = []
    total_gross = 0.0
    total_deductions = 0.0
    total_net = 0.0

    for pe in pe_rows:
        eid = pe["employee_id"]
        monthly_salary = _num(pe.get("basic_salary"))
        monthly_allowance = _num(pe.get("allowance"))

        # Period amounts
        basic = round(monthly_salary / divisor, 2)
        allowance = round(monthly_allowance / divisor, 2)
        overtime_pay = 0.0  # Added per-item via overtime modal after generation

        # Commission earnings (approved, not yet paid)
        emp_commissions = commission_map.get(eid, [])
        commission_pay = round(sum(_num(c.get("net_payable")) for c in emp_commissions), 2)

        gross = round(basic + allowance + overtime_pay + commission_pay, 2)

        # Use manually-entered deductions from Employee Compensation tab
        # These are the PER-CUTOFF values (what the employee actually pays each payroll)
        manual_sss = _num(pe.get("sss_contribution"))
        manual_ph = _num(pe.get("philhealth_contribution"))
        manual_pi = _num(pe.get("pagibig_contribution"))
        manual_wht = _num(pe.get("withholding_tax"))

        if manual_sss > 0:
            sss_ee = manual_sss
            sss_er = manual_sss
        else:
            sss = compute_sss(monthly_salary)
            sss_ee = round(sss["employee"] / divisor, 2)
            sss_er = round(sss["employer"] / divisor, 2)

        if manual_ph > 0:
            ph_ee = manual_ph
            ph_er = manual_ph
        else:
            philhealth = compute_philhealth(monthly_salary)
            ph_ee = round(philhealth["employee"] / divisor, 2)
            ph_er = round(philhealth["employer"] / divisor, 2)

        if manual_pi > 0:
            pi_ee = manual_pi
            pi_er = manual_pi
        else:
            pagibig = compute_pagibig(monthly_salary)
            pi_ee = round(pagibig["employee"] / divisor, 2)
            pi_er = round(pagibig["employer"] / divisor, 2)

        if manual_wht > 0:
            wht = manual_wht
        else:
            wht = round(compute_withholding_tax(monthly_salary - (manual_sss or sss_ee) * divisor - (manual_ph or ph_ee) * divisor - (manual_pi or pi_ee) * divisor) / divisor, 2)

        # Loan deductions for this period
        emp_loans = loan_map.get(eid, [])
        loan_total = sum(round(_num(l.get("monthly_deduction")) / divisor, 2) for l in emp_loans)

        # Totals
        total_ded = round(sss_ee + ph_ee + pi_ee + wht + loan_total, 2)
        net = round(gross - total_ded, 2)

        items.append({
            "employee_id": eid,
            "employee_name": emp_map.get(eid, f"Employee #{eid}"),
            "basic_salary": basic,
            "allowance": allowance,
            "overtime_hours": 0,
            "overtime_rate": 0,
            "overtime_pay": overtime_pay,
            "commission_pay": commission_pay,
            "commission_ids": [c["commission_id"] for c in emp_commissions],
            "other_earnings": 0,
            "gross_pay": gross,
            "sss_employee": sss_ee,
            "sss_employer": sss_er,
            "philhealth_employee": ph_ee,
            "philhealth_employer": ph_er,
            "pagibig_employee": pi_ee,
            "pagibig_employer": pi_er,
            "withholding_tax": wht,
            "loan_deductions": loan_total,
            "other_deductions": 0,
            "total_deductions": total_ded,
            "net_pay": net,
            "days_worked": 15 if is_semi else 30,
            "days_absent": 0,
        })

        total_gross += gross
        total_deductions += total_ded
        total_net += net

    # Create the payroll run
    run_data = {
        "period_start": payload.period_start,
        "period_end": payload.period_end,
        "pay_date": payload.pay_date or payload.period_end,
        "pay_frequency": payload.pay_frequency,
        "status": "DRAFT",
        "total_employees": len(items),
        "total_gross": round(total_gross, 2),
        "total_deductions": round(total_deductions, 2),
        "total_net": round(total_net, 2),
        "generated_by": performed_by,
    }
    run_res = supabase.table("payroll_runs").insert(run_data).execute()
    if not run_res.data:
        raise HTTPException(status_code=500, detail="Failed to create payroll run")

    run_id = run_res.data[0]["run_id"]

    # Insert items
    for item in items:
        item["run_id"] = run_id
    supabase.table("payroll_items").insert(items).execute()

    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Generated payroll run #{run_id} for {len(items)} employees. Period: {payload.period_start} to {payload.period_end}", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)

    return {**run_res.data[0], "items": items}


# ══════════════════════════════════════════════════════════════════════════════
# Payroll Approval Workflow
# ══════════════════════════════════════════════════════════════════════════════

@router.patch("/runs/{run_id}/submit")
def submit_payroll(run_id: int, request: Request):
    """Submit payroll for review. Status: DRAFT → FOR_REVIEW."""
    _, performed_by = _extract_jwt_claims(request)
    run = supabase.table("payroll_runs").select("status").eq("run_id", run_id).execute()
    if not run.data:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    if run.data[0]["status"] != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT payroll can be submitted for review")
    res = supabase.table("payroll_runs").update({"status": "FOR_REVIEW"}).eq("run_id", run_id).execute()
    write_audit_log(action="STATUS_CHANGE", module_name=MODULE_NAME, description=f"Submitted payroll #{run_id} for review", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.patch("/runs/{run_id}/approve")
def approve_payroll(run_id: int, request: Request):
    """Approve payroll. Status: FOR_REVIEW → APPROVED."""
    _, performed_by = _extract_jwt_claims(request)
    run = supabase.table("payroll_runs").select("status").eq("run_id", run_id).execute()
    if not run.data:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    if run.data[0]["status"] != "FOR_REVIEW":
        raise HTTPException(status_code=400, detail="Only FOR_REVIEW payroll can be approved")
    res = supabase.table("payroll_runs").update({"status": "APPROVED", "approved_by": performed_by, "approved_at": datetime.now().isoformat()}).eq("run_id", run_id).execute()
    write_audit_log(action="APPROVE", module_name=MODULE_NAME, description=f"Approved payroll #{run_id}", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)

    # Auto-generate BIR 1601-C draft for tax management
    try:
        from routers.tax import generate_or_update_1601c_for_payroll
        run_detail = supabase.table("payroll_runs").select("*").eq("run_id", run_id).execute()
        if run_detail.data:
            generate_or_update_1601c_for_payroll(run_id, run_detail.data[0])
    except Exception:
        pass  # Tax form generation should not block payroll approval

    return res.data[0]


@router.patch("/runs/{run_id}/release")
def release_payroll(run_id: int, request: Request):
    """Release payroll (mark as paid). Status: APPROVED → RELEASED."""
    _, performed_by = _extract_jwt_claims(request)
    run = supabase.table("payroll_runs").select("*").eq("run_id", run_id).execute()
    if not run.data:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    if run.data[0]["status"] != "APPROVED":
        raise HTTPException(status_code=400, detail="Only APPROVED payroll can be released")
    res = supabase.table("payroll_runs").update({"status": "RELEASED"}).eq("run_id", run_id).execute()
    write_audit_log(action="STATUS_CHANGE", module_name=MODULE_NAME, description=f"Released payroll #{run_id}", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)

    # Auto-create Cash Disbursements Book entries for BIR books
    try:
        from utils.books_integration import create_books_from_payroll_release
        items = supabase.table("payroll_items").select("*").eq("run_id", run_id).execute().data or []
        create_books_from_payroll_release(run.data[0], items, performed_by)
    except Exception:
        pass  # Non-critical: don't block release

    return res.data[0]


# ══════════════════════════════════════════════════════════════════════════════
# Overtime — Compute & Update per-item
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/overtime-occasions")
def list_overtime_occasions():
    """Return the list of available overtime occasion types and their rates."""
    return [
        {"value": key, "label": cfg["label"], "rate": cfg["rate"], "exceed_8_rate": cfg["exceed_8_rate"]}
        for key, cfg in OVERTIME_OCCASIONS.items()
    ]


@router.post("/overtime/compute")
def compute_overtime_preview(monthly_salary: float = Query(...), entries: List[OvertimeEntry] = []):
    """Preview overtime computation without saving. Used for the form live preview."""
    # Hourly rate = monthly salary / 26 days / 8 hours
    hourly_rate = round(monthly_salary / 26 / 8, 2)
    result = compute_overtime_pay(hourly_rate, [e.model_dump() for e in entries])
    return {"hourly_rate": hourly_rate, **result}


@router.patch("/items/{item_id}/overtime")
def update_item_overtime(item_id: int, request: Request, entries: List[OvertimeEntry]):
    """Update overtime entries for a specific payroll item. Recalculates gross/net."""
    _, performed_by = _extract_jwt_claims(request)

    # Fetch the payroll item
    item_res = supabase.table("payroll_items").select("*").eq("item_id", item_id).execute()
    if not item_res.data:
        raise HTTPException(status_code=404, detail="Payroll item not found")
    item = item_res.data[0]

    # Check that the run is still DRAFT
    run = supabase.table("payroll_runs").select("status").eq("run_id", item["run_id"]).execute()
    if run.data and run.data[0]["status"] != "DRAFT":
        raise HTTPException(status_code=400, detail="Cannot modify overtime on a non-DRAFT payroll run")

    # Get employee monthly salary for hourly rate computation
    pe = supabase.table("payroll_employees").select("basic_salary").eq("employee_id", item["employee_id"]).execute()
    monthly_salary = _num(pe.data[0]["basic_salary"]) if pe.data else _num(item.get("basic_salary")) * 2

    # Compute overtime
    hourly_rate = round(monthly_salary / 26 / 8, 2)
    ot_result = compute_overtime_pay(hourly_rate, [e.model_dump() for e in entries])
    overtime_pay = ot_result["total_overtime_pay"]
    total_hours = sum(_num(e.hours) for e in entries)

    # Recalculate gross and net
    basic = _num(item.get("basic_salary"))
    allowance = _num(item.get("allowance"))
    other_earnings = _num(item.get("other_earnings"))
    new_gross = round(basic + allowance + overtime_pay + other_earnings, 2)

    # Deductions stay the same
    total_ded = _num(item.get("total_deductions"))
    new_net = round(new_gross - total_ded, 2)

    # Update the item
    updates = {
        "overtime_hours": total_hours,
        "overtime_pay": overtime_pay,
        "overtime_entries": [e.model_dump() for e in entries],  # Store breakdown as JSON
        "gross_pay": new_gross,
        "net_pay": new_net,
    }
    supabase.table("payroll_items").update(updates).eq("item_id", item_id).execute()

    # Update run totals
    all_items = supabase.table("payroll_items").select("gross_pay, total_deductions, net_pay").eq("run_id", item["run_id"]).execute().data or []
    run_gross = round(sum(_num(i["gross_pay"]) for i in all_items), 2)
    run_ded = round(sum(_num(i["total_deductions"]) for i in all_items), 2)
    run_net = round(sum(_num(i["net_pay"]) for i in all_items), 2)
    supabase.table("payroll_runs").update({"total_gross": run_gross, "total_deductions": run_ded, "total_net": run_net}).eq("run_id", item["run_id"]).execute()

    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Updated overtime for {item.get('employee_name', '')} — {total_hours}h = ₱{overtime_pay:,.2f}", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)

    return {**item, **updates, "hourly_rate": hourly_rate, "overtime_breakdown": ot_result["breakdown"]}


# ══════════════════════════════════════════════════════════════════════════════
# Loans / Advances
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/loans")
def list_loans(employee_id: Optional[int] = Query(None), status: Optional[str] = Query(None)):
    """List loans/advances, optionally filtered by employee or status."""
    q = supabase.table("payroll_loans").select("*").order("loan_id", desc=True)
    if employee_id:
        q = q.eq("employee_id", employee_id)
    if status:
        q = q.eq("status", status)
    return q.execute().data or []


@router.post("/loans", status_code=201)
def create_loan(request: Request, payload: LoanCreate):
    """Create a new loan/advance for an employee."""
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    data["remaining_balance"] = payload.principal_amount
    data["total_paid"] = 0
    res = supabase.table("payroll_loans").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create loan")
    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Created {payload.loan_type} for employee #{payload.employee_id}: ₱{payload.principal_amount}", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.patch("/loans/{loan_id}/complete")
def complete_loan(loan_id: int, request: Request):
    """Mark a loan as completed."""
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("payroll_loans").update({"status": "completed"}).eq("loan_id", loan_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Loan not found")
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Completed loan #{loan_id}", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


# ══════════════════════════════════════════════════════════════════════════════
# Payslip & Reports
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/payslip/{run_id}/{employee_id}")
def get_payslip(run_id: int, employee_id: int):
    """Get individual payslip for an employee in a specific run."""
    item = supabase.table("payroll_items").select("*").eq("run_id", run_id).eq("employee_id", employee_id).execute()
    if not item.data:
        raise HTTPException(status_code=404, detail="Payslip not found")
    run = supabase.table("payroll_runs").select("period_start, period_end, pay_date, status").eq("run_id", run_id).execute()
    return {"payslip": item.data[0], "run": run.data[0] if run.data else {}}


@router.get("/runs/{run_id}/export-bank")
def export_bank_file(run_id: int, request: Request):
    """Export bank file (CSV) for salary crediting."""
    _, performed_by = _extract_jwt_claims(request)
    items = supabase.table("payroll_items").select("employee_id, employee_name, net_pay").eq("run_id", run_id).execute().data or []

    # Get bank details
    emp_ids = [i["employee_id"] for i in items]
    pe_rows = supabase.table("payroll_employees").select("employee_id, bank_name, bank_account_number").in_("employee_id", emp_ids).execute().data or []
    bank_map = {r["employee_id"]: r for r in pe_rows}

    rows = []
    for item in items:
        bank = bank_map.get(item["employee_id"], {})
        rows.append({
            "employee_id": item["employee_id"],
            "employee_name": item["employee_name"],
            "bank_name": bank.get("bank_name", ""),
            "account_number": bank.get("bank_account_number", ""),
            "amount": item["net_pay"],
        })

    output = StringIO()
    writer = DictWriter(output, fieldnames=["employee_id", "employee_name", "bank_name", "account_number", "amount"])
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)

    write_audit_log(action="EXPORT", module_name=MODULE_NAME, description=f"Exported bank file for payroll #{run_id}", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)

    headers = {"Content-Disposition": f'attachment; filename="payroll_{run_id}_bank_file.csv"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


@router.get("/runs/{run_id}/export-register")
def export_payroll_register(run_id: int, request: Request):
    """Export full payroll register as CSV."""
    _, performed_by = _extract_jwt_claims(request)
    items = supabase.table("payroll_items").select("*").eq("run_id", run_id).order("employee_name").execute().data or []

    fields = ["employee_name", "basic_salary", "allowance", "overtime_pay", "gross_pay", "sss_employee", "philhealth_employee", "pagibig_employee", "withholding_tax", "loan_deductions", "total_deductions", "net_pay"]
    output = StringIO()
    writer = DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(items)
    output.seek(0)

    write_audit_log(action="EXPORT", module_name=MODULE_NAME, description=f"Exported payroll register for run #{run_id}", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)

    headers = {"Content-Disposition": f'attachment; filename="payroll_register_{run_id}.csv"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


# ══════════════════════════════════════════════════════════════════════════════
# Dashboard / Summary
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard")
def payroll_dashboard():
    """Summary stats for the payroll module."""
    employees = supabase.table("payroll_employees").select("payroll_employee_id").eq("status", "active").execute().data or []
    runs = supabase.table("payroll_runs").select("run_id, status, total_gross, total_net, period_start, period_end, created_at").order("created_at", desc=True).limit(10).execute().data or []
    active_loans = supabase.table("payroll_loans").select("loan_id, remaining_balance").eq("status", "active").execute().data or []

    latest_run = runs[0] if runs else None
    total_loan_balance = sum(_num(l.get("remaining_balance")) for l in active_loans)

    return {
        "total_employees": len(employees),
        "total_runs": len(runs),
        "latest_run": latest_run,
        "active_loans": len(active_loans),
        "total_loan_balance": round(total_loan_balance, 2),
        "recent_runs": runs[:5],
    }
