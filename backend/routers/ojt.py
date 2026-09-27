"""OJT & Internship Module Router.

Standalone module for managing interns, task logs, NDA monitoring,
evaluations, and completion certificates.
Hours are auto-tracked (5 days/week × 8 hrs/day from start_date) but editable.
"""
from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime, timedelta
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
import math

router = APIRouter(prefix="/ojt", tags=["OJT & Internship"])

# ── Constants ─────────────────────────────────────────────────────────────────
ENTITY_CHOICES = ("Expedia", "GreatnessLab", "Exigent", "KSI")
OJT_STATUS_CHOICES = ("Active", "Completed", "Withdrawn", "Extended")
TASK_LOG_STATUSES = ("Pending", "Approved", "Rejected")
NDA_STATUSES = ("Pending", "Signed", "Expired", "Waived")
EVAL_STATUSES = ("Draft", "Completed")
RECOMMENDATIONS = ("Retain", "Extend", "Complete", "Terminate", "Hire")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _compute_expected_hours(start_date_str: str, end_date_str: str = None) -> float:
    """Compute expected OJT hours from start_date to today (or end_date).
    Assumes 5 days/week, 8 hours/day.
    """
    try:
        start = date.fromisoformat(start_date_str) if isinstance(start_date_str, str) else start_date_str
    except (ValueError, TypeError):
        return 0.0

    end = date.today()
    if end_date_str:
        try:
            end_d = date.fromisoformat(end_date_str) if isinstance(end_date_str, str) else end_date_str
            if end_d < end:
                end = end_d
        except (ValueError, TypeError):
            pass

    if end < start:
        return 0.0

    # Count weekdays between start and end (inclusive)
    weekdays = 0
    current = start
    while current <= end:
        if current.weekday() < 5:  # Mon-Fri
            weekdays += 1
        current += timedelta(days=1)

    return weekdays * 8.0


def _compute_logged_hours(trainee_id: int) -> float:
    """Sum hours_spent from approved task logs for a trainee."""
    res = (
        supabase.table("ojt_task_logs")
        .select("hours_spent")
        .eq("trainee_id", trainee_id)
        .eq("status", "Approved")
        .execute()
    )
    return sum(float(r.get("hours_spent", 0)) for r in (res.data or []))


def _enrich_trainee(trainee: dict) -> dict:
    """Add computed fields to a trainee record."""
    start = trainee.get("start_date")
    end = trainee.get("end_date")
    required = float(trainee.get("required_hours", 0) or 0)
    hours_rendered = float(trainee.get("hours_rendered", 0) or 0)

    trainee["expected_hours"] = _compute_expected_hours(start, end)
    trainee["completion_percentage"] = round(
        (hours_rendered / required * 100) if required > 0 else 0, 1
    )
    return trainee


# ── Schemas: Intern CRUD ──────────────────────────────────────────────────────

class InternCreate(BaseModel):
    trainee_name: str
    school: str
    program: str
    department: str
    supervisor_id: int
    entity: str
    start_date: date
    end_date: date
    required_hours: float = 480
    assigned_module: Optional[str] = None
    remarks: Optional[str] = None

    @field_validator("entity")
    @classmethod
    def validate_entity(cls, v):
        if v not in ENTITY_CHOICES:
            raise ValueError(f"Entity must be one of: {', '.join(ENTITY_CHOICES)}")
        return v

    @field_validator("required_hours")
    @classmethod
    def validate_hours(cls, v):
        if v < 200 or v > 2000:
            raise ValueError("Required hours must be between 200 and 2000")
        return v


class InternUpdate(BaseModel):
    trainee_name: Optional[str] = None
    school: Optional[str] = None
    program: Optional[str] = None
    department: Optional[str] = None
    supervisor_id: Optional[int] = None
    entity: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    required_hours: Optional[float] = None
    hours_rendered: Optional[float] = None
    assigned_module: Optional[str] = None
    status: Optional[str] = None
    remarks: Optional[str] = None

    @field_validator("entity")
    @classmethod
    def validate_entity(cls, v):
        if v is None:
            return v
        if v not in ENTITY_CHOICES:
            raise ValueError(f"Entity must be one of: {', '.join(ENTITY_CHOICES)}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        if v not in OJT_STATUS_CHOICES:
            raise ValueError(f"Status must be one of: {', '.join(OJT_STATUS_CHOICES)}")
        return v


# ── Schemas: Task Logs ────────────────────────────────────────────────────────

class TaskLogCreate(BaseModel):
    trainee_id: int
    log_date: date = None
    time_in: Optional[str] = None
    time_out: Optional[str] = None
    hours_spent: float = 8.0
    task_description: str
    module_worked: Optional[str] = None

    @field_validator("hours_spent")
    @classmethod
    def validate_hours(cls, v):
        if v < 0 or v > 24:
            raise ValueError("Hours must be between 0 and 24")
        return v


class TaskLogUpdate(BaseModel):
    log_date: Optional[date] = None
    time_in: Optional[str] = None
    time_out: Optional[str] = None
    hours_spent: Optional[float] = None
    task_description: Optional[str] = None
    module_worked: Optional[str] = None
    supervisor_notes: Optional[str] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        if v not in TASK_LOG_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(TASK_LOG_STATUSES)}")
        return v


# ── Schemas: NDA ──────────────────────────────────────────────────────────────

class NDACreate(BaseModel):
    trainee_id: int
    nda_status: str = "Pending"
    signed_date: Optional[date] = None
    expiry_date: Optional[date] = None
    remarks: Optional[str] = None

    @field_validator("nda_status")
    @classmethod
    def validate_status(cls, v):
        if v not in NDA_STATUSES:
            raise ValueError(f"NDA status must be one of: {', '.join(NDA_STATUSES)}")
        return v


class NDAUpdate(BaseModel):
    nda_status: Optional[str] = None
    signed_date: Optional[date] = None
    expiry_date: Optional[date] = None
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    remarks: Optional[str] = None

    @field_validator("nda_status")
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        if v not in NDA_STATUSES:
            raise ValueError(f"NDA status must be one of: {', '.join(NDA_STATUSES)}")
        return v


# ── Schemas: Evaluations ──────────────────────────────────────────────────────

class EvaluationCreate(BaseModel):
    trainee_id: int
    evaluator_id: int
    evaluation_date: date = None
    quality_of_work: int
    initiative: int
    attendance_punctuality: int
    communication: int
    technical_skills: int
    teamwork: int
    comments: Optional[str] = None
    recommendation: Optional[str] = None

    @field_validator("quality_of_work", "initiative", "attendance_punctuality",
                     "communication", "technical_skills", "teamwork")
    @classmethod
    def validate_rating(cls, v):
        if v < 1 or v > 5:
            raise ValueError("Rating must be between 1 and 5")
        return v

    @field_validator("recommendation")
    @classmethod
    def validate_recommendation(cls, v):
        if v is None:
            return v
        if v not in RECOMMENDATIONS:
            raise ValueError(f"Must be one of: {', '.join(RECOMMENDATIONS)}")
        return v


class EvaluationUpdate(BaseModel):
    quality_of_work: Optional[int] = None
    initiative: Optional[int] = None
    attendance_punctuality: Optional[int] = None
    communication: Optional[int] = None
    technical_skills: Optional[int] = None
    teamwork: Optional[int] = None
    comments: Optional[str] = None
    recommendation: Optional[str] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        if v not in EVAL_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(EVAL_STATUSES)}")
        return v


# ══════════════════════════════════════════════════════════════════════════════
# INTERN LIST ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/interns")
def list_interns(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    entity: Optional[str] = Query(None),
):
    """List all interns with search, status, and entity filters."""
    query = (
        supabase.table("ojt_trainees")
        .select("*, employees!ojt_trainees_supervisor_id_fkey(employee_id, first_name, last_name)")
        .order("id", desc=True)
    )

    if status and status != "All":
        query = query.eq("status", status)
    if entity and entity != "All":
        query = query.eq("entity", entity)

    result = query.execute()
    data = result.data or []

    # Enrich with computed fields + supervisor name
    for row in data:
        _enrich_trainee(row)
        emp = row.pop("employees", None)
        if emp:
            row["supervisor_name"] = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip()
        else:
            row["supervisor_name"] = None

    # Client-side search (covers trainee_name, school, supervisor)
    if search:
        s = search.lower()
        data = [r for r in data if s in (r.get("trainee_name") or "").lower()
                or s in (r.get("school") or "").lower()
                or s in (r.get("supervisor_name") or "").lower()
                or s in (r.get("program") or "").lower()]

    return {"data": data, "count": len(data)}


@router.get("/interns/{trainee_id}")
def get_intern(trainee_id: int):
    """Get a single intern by ID with all computed fields."""
    res = (
        supabase.table("ojt_trainees")
        .select("*, employees!ojt_trainees_supervisor_id_fkey(employee_id, first_name, last_name)")
        .eq("id", trainee_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Intern not found."})

    row = res.data[0]
    _enrich_trainee(row)
    emp = row.pop("employees", None)
    if emp:
        row["supervisor_name"] = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip()

    # Also get logged hours from task logs
    row["logged_hours"] = _compute_logged_hours(trainee_id)
    return row


@router.post("/interns", status_code=status.HTTP_201_CREATED)
def create_intern(request: Request, payload: InternCreate):
    """Create a new intern/trainee record."""
    _, performed_by = _extract_jwt_claims(request)

    data = {
        "trainee_name": payload.trainee_name.strip(),
        "school": payload.school.strip(),
        "program": payload.program.strip(),
        "department": payload.department.strip(),
        "supervisor_id": payload.supervisor_id,
        "entity": payload.entity,
        "start_date": payload.start_date.isoformat(),
        "end_date": payload.end_date.isoformat(),
        "required_hours": payload.required_hours,
        "assigned_module": payload.assigned_module,
        "hours_rendered": 0,
        "completion_percentage": 0,
        "status": "Active",
        "remarks": payload.remarks,
    }

    result = supabase.table("ojt_trainees").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create intern."})

    record = result.data[0]
    write_audit_log(
        request=request,
        action="CREATE",
        module_name="OJT & Internship",
        description=f"Created intern record: {payload.trainee_name} ({payload.school})",
        performed_by=performed_by,
        record_id=record.get("id"),
    )
    return record


@router.patch("/interns/{trainee_id}")
def update_intern(trainee_id: int, request: Request, payload: InternUpdate):
    """Update an intern record. Recalculates completion if hours change."""
    _, performed_by = _extract_jwt_claims(request)

    existing_res = (
        supabase.table("ojt_trainees").select("*").eq("id", trainee_id).execute()
    )
    if not existing_res.data:
        raise HTTPException(status_code=404, detail={"error": "Intern not found."})

    existing = existing_res.data[0]
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}

    # Convert dates to ISO strings
    for key in ("start_date", "end_date"):
        if key in update_data and isinstance(update_data[key], date):
            update_data[key] = update_data[key].isoformat()

    # Recalculate completion percentage
    hrs = float(update_data.get("hours_rendered", existing.get("hours_rendered", 0)) or 0)
    req = float(update_data.get("required_hours", existing.get("required_hours", 0)) or 0)
    if req > 0:
        update_data["completion_percentage"] = round(hrs / req * 100, 1)

    # Auto-complete if hours met
    if hrs >= req > 0 and existing.get("status") in ("Active", "Extended"):
        if "status" not in update_data:
            update_data["status"] = "Completed"

    update_data["updated_at"] = datetime.utcnow().isoformat()

    result = (
        supabase.table("ojt_trainees").update(update_data).eq("id", trainee_id).execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to update intern."})

    write_audit_log(
        request=request,
        action="UPDATE",
        module_name="OJT & Internship",
        description=f"Updated intern {existing.get('trainee_name')} (ID: {trainee_id})",
        performed_by=performed_by,
        record_id=trainee_id,
    )
    return result.data[0]


@router.get("/interns/metrics")
def intern_metrics(entity: Optional[str] = Query(None)):
    """Dashboard metrics for OJT module."""
    query = supabase.table("ojt_trainees").select("id, status, completion_percentage, hours_rendered, required_hours")
    if entity and entity != "All":
        query = query.eq("entity", entity)

    result = query.execute()
    data = result.data or []

    total = len(data)
    active = sum(1 for r in data if r.get("status") == "Active")
    completed = sum(1 for r in data if r.get("status") == "Completed")
    avg_completion = (
        round(sum(float(r.get("completion_percentage", 0)) for r in data) / total, 1)
        if total > 0 else 0
    )

    return {
        "total_interns": total,
        "active_interns": active,
        "completed_interns": completed,
        "average_completion": avg_completion,
    }


# ══════════════════════════════════════════════════════════════════════════════
# TASK LOGS ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/task-logs")
def list_task_logs(
    trainee_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """List task logs, optionally filtered by trainee, status, date range."""
    query = supabase.table("ojt_task_logs").select("*").order("log_date", desc=True)

    if trainee_id:
        query = query.eq("trainee_id", trainee_id)
    if status and status != "All":
        query = query.eq("status", status)
    if date_from:
        query = query.gte("log_date", date_from)
    if date_to:
        query = query.lte("log_date", date_to)

    result = query.execute()
    return {"data": result.data or [], "count": len(result.data or [])}


@router.post("/task-logs", status_code=status.HTTP_201_CREATED)
def create_task_log(request: Request, payload: TaskLogCreate):
    """Create a task log entry. Interns use this to log their daily work."""
    _, performed_by = _extract_jwt_claims(request)

    data = {
        "trainee_id": payload.trainee_id,
        "log_date": (payload.log_date or date.today()).isoformat(),
        "time_in": payload.time_in,
        "time_out": payload.time_out,
        "hours_spent": payload.hours_spent,
        "task_description": payload.task_description.strip(),
        "module_worked": payload.module_worked,
        "status": "Pending",
    }

    result = supabase.table("ojt_task_logs").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create task log."})

    write_audit_log(
        request=request,
        action="CREATE",
        module_name="OJT & Internship",
        description=f"Task log created for trainee ID {payload.trainee_id}: {payload.task_description[:50]}",
        performed_by=performed_by,
        record_id=result.data[0].get("id"),
    )
    return result.data[0]


@router.patch("/task-logs/{log_id}")
def update_task_log(log_id: int, request: Request, payload: TaskLogUpdate):
    """Update a task log. Supervisors can approve/reject and add notes."""
    _, performed_by = _extract_jwt_claims(request)

    existing_res = supabase.table("ojt_task_logs").select("*").eq("id", log_id).execute()
    if not existing_res.data:
        raise HTTPException(status_code=404, detail={"error": "Task log not found."})

    existing = existing_res.data[0]
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}

    # Convert date to ISO string
    if "log_date" in update_data and isinstance(update_data["log_date"], date):
        update_data["log_date"] = update_data["log_date"].isoformat()

    update_data["updated_at"] = datetime.utcnow().isoformat()

    result = supabase.table("ojt_task_logs").update(update_data).eq("id", log_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to update task log."})

    # If approved, recalculate trainee hours_rendered from all approved logs
    if update_data.get("status") == "Approved":
        trainee_id = existing.get("trainee_id")
        total_logged = _compute_logged_hours(trainee_id)
        trainee_res = supabase.table("ojt_trainees").select("required_hours, status").eq("id", trainee_id).execute()
        if trainee_res.data:
            req = float(trainee_res.data[0].get("required_hours", 0) or 0)
            pct = round(total_logged / req * 100, 1) if req > 0 else 0
            trainee_update = {"hours_rendered": total_logged, "completion_percentage": pct, "updated_at": datetime.utcnow().isoformat()}
            # Auto-complete
            if total_logged >= req > 0 and trainee_res.data[0].get("status") in ("Active", "Extended"):
                trainee_update["status"] = "Completed"
            supabase.table("ojt_trainees").update(trainee_update).eq("id", trainee_id).execute()

    write_audit_log(
        request=request,
        action="UPDATE",
        module_name="OJT & Internship",
        description=f"Updated task log ID {log_id} (status: {update_data.get('status', 'unchanged')})",
        performed_by=performed_by,
        record_id=log_id,
    )
    return result.data[0]


# ══════════════════════════════════════════════════════════════════════════════
# NDA MONITORING ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/nda")
def list_nda(trainee_id: Optional[int] = Query(None)):
    """List NDA records, optionally filtered by trainee."""
    query = supabase.table("ojt_nda").select("*").order("id", desc=True)
    if trainee_id:
        query = query.eq("trainee_id", trainee_id)
    result = query.execute()
    return {"data": result.data or [], "count": len(result.data or [])}


@router.post("/nda", status_code=status.HTTP_201_CREATED)
def create_nda(request: Request, payload: NDACreate):
    """Create an NDA record for a trainee."""
    _, performed_by = _extract_jwt_claims(request)

    data = {
        "trainee_id": payload.trainee_id,
        "nda_status": payload.nda_status,
        "signed_date": payload.signed_date.isoformat() if payload.signed_date else None,
        "expiry_date": payload.expiry_date.isoformat() if payload.expiry_date else None,
        "remarks": payload.remarks,
    }

    result = supabase.table("ojt_nda").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create NDA record."})

    write_audit_log(
        request=request,
        action="CREATE",
        module_name="OJT & Internship",
        description=f"NDA record created for trainee ID {payload.trainee_id}",
        performed_by=performed_by,
        record_id=result.data[0].get("id"),
    )
    return result.data[0]


@router.patch("/nda/{nda_id}")
def update_nda(nda_id: int, request: Request, payload: NDAUpdate):
    """Update NDA status, dates, or file reference."""
    _, performed_by = _extract_jwt_claims(request)

    existing_res = supabase.table("ojt_nda").select("*").eq("id", nda_id).execute()
    if not existing_res.data:
        raise HTTPException(status_code=404, detail={"error": "NDA record not found."})

    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    for key in ("signed_date", "expiry_date"):
        if key in update_data and isinstance(update_data[key], date):
            update_data[key] = update_data[key].isoformat()

    update_data["updated_at"] = datetime.utcnow().isoformat()

    result = supabase.table("ojt_nda").update(update_data).eq("id", nda_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to update NDA."})

    write_audit_log(
        request=request,
        action="UPDATE",
        module_name="OJT & Internship",
        description=f"Updated NDA ID {nda_id}",
        performed_by=performed_by,
        record_id=nda_id,
    )
    return result.data[0]


# ══════════════════════════════════════════════════════════════════════════════
# EVALUATION ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/evaluations")
def list_evaluations(trainee_id: Optional[int] = Query(None)):
    """List evaluations, optionally filtered by trainee."""
    query = (
        supabase.table("ojt_evaluations")
        .select("*, employees!ojt_evaluations_evaluator_id_fkey(employee_id, first_name, last_name)")
        .order("evaluation_date", desc=True)
    )
    if trainee_id:
        query = query.eq("trainee_id", trainee_id)
    result = query.execute()

    data = result.data or []
    for row in data:
        emp = row.pop("employees", None)
        if emp:
            row["evaluator_name"] = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip()
    return {"data": data, "count": len(data)}


@router.post("/evaluations", status_code=status.HTTP_201_CREATED)
def create_evaluation(request: Request, payload: EvaluationCreate):
    """Create an evaluation for a trainee."""
    _, performed_by = _extract_jwt_claims(request)

    # Compute overall rating (average of 6 criteria)
    scores = [
        payload.quality_of_work, payload.initiative,
        payload.attendance_punctuality, payload.communication,
        payload.technical_skills, payload.teamwork,
    ]
    overall = round(sum(scores) / len(scores), 2)

    data = {
        "trainee_id": payload.trainee_id,
        "evaluator_id": payload.evaluator_id,
        "evaluation_date": (payload.evaluation_date or date.today()).isoformat(),
        "quality_of_work": payload.quality_of_work,
        "initiative": payload.initiative,
        "attendance_punctuality": payload.attendance_punctuality,
        "communication": payload.communication,
        "technical_skills": payload.technical_skills,
        "teamwork": payload.teamwork,
        "overall_rating": overall,
        "comments": payload.comments,
        "recommendation": payload.recommendation,
        "status": "Draft",
    }

    result = supabase.table("ojt_evaluations").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create evaluation."})

    write_audit_log(
        request=request,
        action="CREATE",
        module_name="OJT & Internship",
        description=f"Evaluation created for trainee ID {payload.trainee_id} (rating: {overall})",
        performed_by=performed_by,
        record_id=result.data[0].get("id"),
    )
    return result.data[0]


@router.patch("/evaluations/{eval_id}")
def update_evaluation(eval_id: int, request: Request, payload: EvaluationUpdate):
    """Update an evaluation."""
    _, performed_by = _extract_jwt_claims(request)

    existing_res = supabase.table("ojt_evaluations").select("*").eq("id", eval_id).execute()
    if not existing_res.data:
        raise HTTPException(status_code=404, detail={"error": "Evaluation not found."})

    existing = existing_res.data[0]
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}

    # Recompute overall if any score changed
    score_fields = ["quality_of_work", "initiative", "attendance_punctuality",
                    "communication", "technical_skills", "teamwork"]
    if any(f in update_data for f in score_fields):
        scores = [update_data.get(f, existing.get(f, 3)) for f in score_fields]
        update_data["overall_rating"] = round(sum(scores) / len(scores), 2)

    update_data["updated_at"] = datetime.utcnow().isoformat()

    result = supabase.table("ojt_evaluations").update(update_data).eq("id", eval_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to update evaluation."})

    write_audit_log(
        request=request,
        action="UPDATE",
        module_name="OJT & Internship",
        description=f"Updated evaluation ID {eval_id}",
        performed_by=performed_by,
        record_id=eval_id,
    )
    return result.data[0]
