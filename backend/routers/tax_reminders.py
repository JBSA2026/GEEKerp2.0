"""Tax Filing Reminder Engine.

Provides configurable tax calendar master data, automatic reminder generation,
escalation logic, auto-detection from BIR form status changes, and validation
rules before releasing reminders.

Key design: the system auto-generates calendar entries from entity tax profiles
and known BIR schedules. No manual seeding required.

Endpoints:
- Tax Calendar viewing + admin overrides
- Automatic reminder generation (creates calendar + reminders in one step)
- Reminder listing, status updates, validation
- Reminder summary for dashboard widgets
- BIR form auto-sync for completion detection
"""

from datetime import date, datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, field_validator

from database import supabase
from middleware.audit_middleware import _extract_jwt_claims, write_audit_log

def _require_uuid(value: str, label: str) -> str:
    """Tax calendar/reminder/notification IDs are UUIDs; anything else can't exist."""
    try:
        return str(UUID(str(value)))
    except ValueError:
        raise HTTPException(status_code=404, detail=f"{label} not found")


router = APIRouter(prefix="/tax/reminders", tags=["tax-reminders"])

MODULE_NAME = "Tax Management"

# ═══════════════════════════════════════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════════════════════════════════════

class TaxCalendarUpdate(BaseModel):
    description: Optional[str] = None
    due_date: Optional[str] = None
    holiday_rule: Optional[str] = None
    reminder_days: Optional[list[int]] = None
    owner_roles: Optional[list[str]] = None
    is_active: Optional[bool] = None
    extension_override: Optional[dict] = None


class ReminderUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_role: Optional[str] = None
    filing_reference: Optional[str] = None
    payment_proof_url: Optional[str] = None
    amount_paid: Optional[float] = None
    notes: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        allowed = (
            "pending", "in_progress", "for_review", "for_approval",
            "filed", "overdue", "completed", "not_applicable", "cancelled",
        )
        if v not in allowed:
            raise ValueError(f"status must be one of {allowed}")
        return v


# ═══════════════════════════════════════════════════════════════════════════════
# BIR Form Schedule Definitions (source of truth)
# ═══════════════════════════════════════════════════════════════════════════════

MONTHLY_FORMS = [
    {"form_type": "0619E", "description": "Monthly EWT Remittance", "tax_type": "EWT", "due_day": 10},
    {"form_type": "1601C", "description": "Monthly Compensation WHT Remittance", "tax_type": "Compensation WHT", "due_day": 10},
    {"form_type": "1600-VT", "description": "Monthly VAT Withholding Remittance", "tax_type": "VAT Withholding", "due_day": 10},
]

QUARTERLY_FORMS = [
    {"form_type": "1601EQ", "description": "Quarterly EWT Return", "tax_type": "EWT", "due_day": 25},
    {"form_type": "2550Q", "description": "Quarterly VAT Return", "tax_type": "VAT", "due_day": 25},
    {"form_type": "1702Q", "description": "Quarterly Income Tax Return", "tax_type": "Income Tax", "due_day": 60},
]

ANNUAL_FORMS = [
    {"form_type": "1702RT", "description": "Annual Income Tax Return", "tax_type": "Income Tax", "due_month": 4, "due_day": 15},
    {"form_type": "1604E", "description": "Annual Information Return (EWT)", "tax_type": "EWT", "due_month": 3, "due_day": 1},
    {"form_type": "2316", "description": "Certificate of Compensation Tax Withheld", "tax_type": "Compensation WHT", "due_month": 1, "due_day": 31},
]

ESCALATION_CONFIG = {
    1: {"type": "preparation", "recipients": ["ACCOUNTING_STAFF"], "message": "Start reconciliation and verify source data"},
    2: {"type": "task", "recipients": ["ACCOUNTING_STAFF", "ACCOUNTING_MANAGER"], "message": "Complete computation and submit for review"},
    3: {"type": "approval", "recipients": ["ACCOUNTING_MANAGER", "FINANCE_TREASURY"], "message": "Approve amount and payment request"},
    4: {"type": "urgent", "recipients": ["FINANCE_TREASURY", "MANAGEMENT"], "message": "Confirm filing/payment schedule"},
    5: {"type": "critical", "recipients": ["ACCOUNTING_STAFF", "ACCOUNTING_MANAGER", "FINANCE_TREASURY"], "message": "File, pay, and upload proof before cut-off"},
    6: {"type": "escalation", "recipients": ["ACCOUNTING_MANAGER", "MANAGEMENT"], "message": "Explain delay and update recovery action"},
    7: {"type": "high_risk", "recipients": ["MANAGEMENT", "SUPER_ADMIN"], "message": "Document incident, penalty estimate, and corrective action"},
}

# ═══════════════════════════════════════════════════════════════════════════════
# Helper Functions
# ═══════════════════════════════════════════════════════════════════════════════

def _is_holiday(d: date) -> bool:
    if d.weekday() >= 5:
        return True
    holidays = supabase.table("ph_holidays").select("holiday_date").execute().data or []
    return d.isoformat() in {r["holiday_date"] for r in holidays}


def _adjust_for_holidays(d: date, rule: str) -> date:
    if rule == "none":
        return d
    if rule == "next_working_day":
        while _is_holiday(d):
            d += timedelta(days=1)
    elif rule == "previous_working_day":
        while _is_holiday(d):
            d -= timedelta(days=1)
    return d


def _compute_escalation_level(due_date: date) -> int:
    days_diff = (due_date - date.today()).days
    if days_diff > 15:
        return 0
    elif days_diff > 7:
        return 1
    elif days_diff > 3:
        return 2
    elif days_diff > 1:
        return 3
    elif days_diff == 1:
        return 4
    elif days_diff == 0:
        return 5
    elif days_diff >= -1:
        return 6
    else:
        return 7


def _generate_notification_message(reminder: dict, escalation_level: int) -> str:
    form = reminder.get("form_type", "")
    period = reminder.get("period_covered", "")
    entity = reminder.get("entity", "")
    config = ESCALATION_CONFIG.get(escalation_level, {})
    action = config.get("message", "Review tax filing status")

    if escalation_level <= 2:
        return f"BIR Form {form} for {period} ({entity}) is due soon. {action}."
    elif escalation_level <= 4:
        return f"URGENT: {form} for {period} ({entity}) — {action}."
    elif escalation_level == 5:
        return f"DUE TODAY: {form} for {period} ({entity}). {action}."
    else:
        return f"OVERDUE: {form} for {period} ({entity}) filing/payment remains open. {action}."


def _create_notification_log(reminder: dict, escalation_level: int):
    config = ESCALATION_CONFIG.get(escalation_level, {})
    if not config:
        return
    message = _generate_notification_message(reminder, escalation_level)
    for role in config.get("recipients", []):
        try:
            supabase.table("tax_reminder_logs").insert({
                "reminder_id": reminder["id"],
                "notification_type": config.get("type", "preparation"),
                "recipient_role": role,
                "message": message,
                "escalation_level": escalation_level,
            }).execute()
        except Exception:
            pass


def _validate_reminder_readiness(reminder: dict) -> dict:
    """Validate source data before releasing a reminder for filing."""
    errors = []
    entity = reminder.get("entity")
    form_type = reminder.get("form_type", "")

    # Check entity tax profile
    profile = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data
    if not profile:
        errors.append(f"Missing entity tax profile for {entity}")
    elif not profile[0].get("tin"):
        errors.append(f"Missing TIN for entity {entity}")

    # EWT forms: check AP bills with EWT
    if form_type in ("0619E", "0619-E"):
        bills = supabase.table("ap_bills").select("bill_id, supplier_id").eq(
            "lifecycle_status", "CONFIRMED"
        ).eq("record_status", "ACTIVE").gt("ewt_material", 0).execute().data or []
        if not bills:
            errors.append("No confirmed AP bills with EWT found for this period")
        else:
            sup_ids = list(set(b.get("supplier_id") for b in bills if b.get("supplier_id")))
            if sup_ids:
                suppliers = supabase.table("supplier_list").select("supplier_id, tin_number").in_("supplier_id", sup_ids).execute().data or []
                missing_tin = [s for s in suppliers if not s.get("tin_number")]
                if missing_tin:
                    errors.append(f"{len(missing_tin)} supplier(s) missing TIN numbers")

    # VAT forms: check AR invoices
    if form_type in ("2550Q", "2550M"):
        count = supabase.table("ar_invoices").select("invoice_id", count="exact").eq(
            "lifecycle_status", "CONFIRMED"
        ).eq("record_status", "ACTIVE").execute().count or 0
        if count == 0:
            errors.append("No confirmed AR invoices found — VAT output may be zero")

    # 1601C: check payroll
    if form_type == "1601C":
        count = supabase.table("payroll_runs").select("run_id", count="exact").eq("status", "APPROVED").execute().count or 0
        if count == 0:
            errors.append("No approved payroll runs found for this period")

    # Check BIR form exists
    bir = supabase.table("bir_forms").select("form_record_id").eq(
        "form_type", form_type
    ).eq("entity", entity).in_("status", ["DRAFT", "COMPUTED", "FOR_REVIEW"]).execute().data or []
    if not bir:
        errors.append(f"No BIR Form {form_type} in DRAFT/COMPUTED state for {entity}")

    return {"valid": len(errors) == 0, "errors": errors}


def _ensure_calendar_entries(entity: str, year: int, performed_by: str) -> int:
    """Auto-generate calendar entries for an entity/year if they don't exist.
    
    This is the key difference from seeding: it runs automatically
    whenever reminders are generated. No user action needed.
    """
    entries = []

    # Monthly
    for month in range(1, 13):
        for form in MONTHLY_FORMS:
            due_month = month + 1 if month < 12 else 1
            due_year = year if month < 12 else year + 1
            due_date = date(due_year, due_month, min(form["due_day"], 28))
            entries.append({
                "entity": entity,
                "form_type": form["form_type"],
                "description": form["description"],
                "tax_type": form["tax_type"],
                "frequency": "Monthly",
                "period_covered": f"{year}-{month:02d}",
                "due_date": due_date.isoformat(),
                "due_date_rule": "fixed",
                "holiday_rule": "next_working_day",
                "reminder_days": [-15, -7, -3, -1, 0, 1, 3],
                "owner_roles": ["ACCOUNTING_STAFF", "ACCOUNTING_MANAGER"],
                "taxable_year": year,
                "is_active": True,
                "created_by": performed_by,
            })

    # Quarterly
    for quarter in range(1, 5):
        qend = quarter * 3
        for form in QUARTERLY_FORMS:
            if form["due_day"] <= 31:
                dm = qend + 1 if qend < 12 else 1
                dy = year if qend < 12 else year + 1
                due_date = date(dy, dm, min(form["due_day"], 28))
            else:
                q_end_date = date(year, qend, 28)
                due_date = q_end_date + timedelta(days=form["due_day"])
            entries.append({
                "entity": entity,
                "form_type": form["form_type"],
                "description": form["description"],
                "tax_type": form["tax_type"],
                "frequency": "Quarterly",
                "period_covered": f"{year}-Q{quarter}",
                "due_date": due_date.isoformat(),
                "due_date_rule": "fixed",
                "holiday_rule": "next_working_day",
                "reminder_days": [-15, -7, -3, -1, 0, 1, 3],
                "owner_roles": ["ACCOUNTING_STAFF", "ACCOUNTING_MANAGER", "FINANCE_TREASURY"],
                "taxable_year": year,
                "is_active": True,
                "created_by": performed_by,
            })

    # Annual (filed in year+1)
    for form in ANNUAL_FORMS:
        due_date = date(year + 1, form["due_month"], form["due_day"])
        entries.append({
            "entity": entity,
            "form_type": form["form_type"],
            "description": form["description"],
            "tax_type": form["tax_type"],
            "frequency": "Annual",
            "period_covered": str(year),
            "due_date": due_date.isoformat(),
            "due_date_rule": "fixed",
            "holiday_rule": "next_working_day",
            "reminder_days": [-15, -7, -3, -1, 0, 1, 3],
            "owner_roles": ["ACCOUNTING_MANAGER", "FINANCE_TREASURY", "MANAGEMENT"],
            "taxable_year": year,
            "is_active": True,
            "created_by": performed_by,
        })

    created = 0
    for entry in entries:
        try:
            supabase.table("tax_calendar").insert(entry).execute()
            created += 1
        except Exception:
            pass  # unique constraint = already exists
    return created


# ═══════════════════════════════════════════════════════════════════════════════
# Tax Calendar Endpoints (view + admin override only)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/calendar")
def list_tax_calendar(
    entity: Optional[str] = Query(None),
    taxable_year: Optional[int] = Query(None),
    form_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
):
    """List tax calendar entries. Auto-populated on first generate."""
    q = supabase.table("tax_calendar").select("*")
    if entity and entity != "All":
        q = q.eq("entity", entity)
    if taxable_year:
        q = q.eq("taxable_year", taxable_year)
    if form_type:
        q = q.eq("form_type", form_type)
    if is_active is not None:
        q = q.eq("is_active", is_active)
    return q.order("due_date").execute().data or []


@router.patch("/calendar/{calendar_id}")
def update_tax_calendar(calendar_id: str, request: Request, payload: TaxCalendarUpdate):
    """Update a calendar entry (extension override, deactivate, etc.)."""
    calendar_id = _require_uuid(calendar_id, "Calendar entry")
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.utcnow().isoformat()

    res = supabase.table("tax_calendar").update(updates).eq("id", calendar_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Calendar entry not found")

    write_audit_log(
        action="UPDATE", module_name=MODULE_NAME,
        description=f"Updated tax calendar {calendar_id}: {list(updates.keys())}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


# ═══════════════════════════════════════════════════════════════════════════════
# Reminder Generation & Management
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/generate", status_code=201)
def generate_reminders(
    request: Request,
    entity: Optional[str] = Query(None),
    taxable_year: Optional[int] = Query(None),
):
    """Generate reminders automatically.
    
    1. Reads all entity tax profiles (or a specific entity)
    2. Auto-creates calendar entries for current year if missing
    3. Generates reminder instances from active calendar entries
    
    No seeding required — call this and everything is created.
    """
    _, performed_by = _extract_jwt_claims(request)
    year = taxable_year or date.today().year

    # Get entities from tax profiles
    if entity and entity != "All":
        entities = [entity]
    else:
        profiles = supabase.table("entity_tax_profiles").select("entity").execute().data or []
        entities = [p["entity"] for p in profiles]

    if not entities:
        return {"generated": 0, "skipped": 0, "message": "No entity tax profiles found. Create profiles first."}

    # Step 1: Auto-ensure calendar entries exist for each entity
    calendar_created = 0
    for ent in entities:
        calendar_created += _ensure_calendar_entries(ent, year, performed_by)

    # Step 2: Get active calendar entries that need reminders
    q = supabase.table("tax_calendar").select("*").eq("is_active", True).eq("taxable_year", year)
    if entity and entity != "All":
        q = q.eq("entity", entity)
    calendar_entries = q.execute().data or []

    # Step 3: Generate reminders (skip if already exists)
    generated = 0
    skipped = 0
    for entry in calendar_entries:
        existing = supabase.table("tax_reminders").select("id").eq("calendar_id", entry["id"]).execute().data
        if existing:
            skipped += 1
            continue

        raw_due = date.fromisoformat(entry["due_date"]) if isinstance(entry["due_date"], str) else entry["due_date"]
        effective_due = _adjust_for_holidays(raw_due, entry.get("holiday_rule", "next_working_day"))
        escalation = _compute_escalation_level(effective_due)
        status = "overdue" if escalation >= 6 else "pending"

        reminder_data = {
            "calendar_id": entry["id"],
            "entity": entry["entity"],
            "form_type": entry["form_type"],
            "description": entry.get("description"),
            "tax_type": entry.get("tax_type"),
            "period_covered": entry["period_covered"],
            "due_date": entry["due_date"],
            "effective_due_date": effective_due.isoformat(),
            "status": status,
            "escalation_level": escalation,
            "assigned_role": (entry.get("owner_roles") or ["ACCOUNTING_STAFF"])[0],
        }

        res = supabase.table("tax_reminders").insert(reminder_data).execute()
        if res.data:
            generated += 1
            if escalation >= 1:
                _create_notification_log(res.data[0], escalation)

    write_audit_log(
        action="CREATE", module_name=MODULE_NAME,
        description=f"Auto-generated {generated} reminders for {year} ({calendar_created} new calendar entries, {skipped} skipped)",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return {"generated": generated, "skipped": skipped, "calendar_created": calendar_created}


@router.get("/")
def list_reminders(
    entity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    form_type: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None),
):
    """List tax reminders with filters. Auto-refreshes escalation levels."""
    q = supabase.table("tax_reminders").select("*")
    if entity and entity != "All":
        q = q.eq("entity", entity)
    if status:
        q = q.eq("status", status)
    if form_type:
        q = q.eq("form_type", form_type)

    reminders = q.order("effective_due_date").execute().data or []
    today = date.today()

    # Refresh escalation levels for active reminders
    for r in reminders:
        if r["status"] in ("filed", "completed", "not_applicable", "cancelled"):
            continue
        eff_due = date.fromisoformat(r["effective_due_date"]) if isinstance(r["effective_due_date"], str) else r["effective_due_date"]
        new_level = _compute_escalation_level(eff_due)
        old_level = r.get("escalation_level", 0)
        if new_level != old_level:
            r["escalation_level"] = new_level
            update_data = {"escalation_level": new_level, "updated_at": datetime.utcnow().isoformat()}
            if new_level >= 6 and r["status"] not in ("filed", "completed"):
                update_data["status"] = "overdue"
                r["status"] = "overdue"
            supabase.table("tax_reminders").update(update_data).eq("id", r["id"]).execute()
            if new_level > old_level:
                _create_notification_log(r, new_level)

    # Apply urgency filter
    if urgency == "overdue":
        reminders = [r for r in reminders if r["status"] == "overdue"]
    elif urgency == "due_today":
        reminders = [r for r in reminders if r.get("effective_due_date") == today.isoformat()]
    elif urgency == "due_soon":
        cutoff = (today + timedelta(days=7)).isoformat()
        reminders = [r for r in reminders if today.isoformat() <= (r.get("effective_due_date") or "") <= cutoff and r["status"] != "overdue"]
    elif urgency == "upcoming":
        reminders = [r for r in reminders if (r.get("effective_due_date") or "") > today.isoformat() and r["status"] not in ("filed", "completed", "overdue")]

    return reminders


@router.get("/summary")
def reminder_summary(entity: Optional[str] = Query(None)):
    """Dashboard widget data: counts by urgency category."""
    q = supabase.table("tax_reminders").select("id, status, effective_due_date, form_type, entity, escalation_level")
    if entity and entity != "All":
        q = q.eq("entity", entity)
    reminders = q.execute().data or []

    today = date.today()
    t3 = (today + timedelta(days=3)).isoformat()
    t7 = (today + timedelta(days=7)).isoformat()
    t15 = (today + timedelta(days=15)).isoformat()

    summary = {
        "total_active": 0,
        "overdue": 0,
        "due_today": 0,
        "due_3_days": 0,
        "due_7_days": 0,
        "due_15_days": 0,
        "pending_approval": 0,
        "filed": 0,
    }

    for r in reminders:
        eff = r.get("effective_due_date", "")
        st = r.get("status", "")

        if st in ("filed", "completed", "not_applicable", "cancelled"):
            if st == "filed":
                summary["filed"] += 1
            continue

        summary["total_active"] += 1
        if st == "overdue" or eff < today.isoformat():
            summary["overdue"] += 1
        elif eff == today.isoformat():
            summary["due_today"] += 1
        elif eff <= t3:
            summary["due_3_days"] += 1
        elif eff <= t7:
            summary["due_7_days"] += 1
        elif eff <= t15:
            summary["due_15_days"] += 1

        if st == "for_approval":
            summary["pending_approval"] += 1

    return summary


# ═══════════════════════════════════════════════════════════════════════════════
# Notification Log Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/notifications")
def list_reminder_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50),
):
    """Get tax reminder notification log entries."""
    q = supabase.table("tax_reminder_logs").select("*")
    if unread_only:
        q = q.eq("is_read", False)
    return q.order("created_at", desc=True).limit(limit).execute().data or []


@router.patch("/notifications/{log_id}/read")
def mark_notification_read(log_id: str):
    """Mark a notification as read."""
    log_id = _require_uuid(log_id, "Notification")
    res = supabase.table("tax_reminder_logs").update({
        "is_read": True, "read_at": datetime.utcnow().isoformat(),
    }).eq("id", log_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Notification not found")
    return res.data[0]


@router.post("/notifications/mark-all-read")
def mark_all_notifications_read(request: Request):
    """Mark all unread tax notifications as read."""
    supabase.table("tax_reminder_logs").update({
        "is_read": True, "read_at": datetime.utcnow().isoformat(),
    }).eq("is_read", False).execute()
    return {"message": "All notifications marked as read"}


@router.get("/{reminder_id}")
def get_reminder(reminder_id: str):
    """Get a single reminder with validation check."""
    reminder_id = _require_uuid(reminder_id, "Reminder")
    reminder = supabase.table("tax_reminders").select("*").eq("id", reminder_id).execute().data
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    logs = supabase.table("tax_reminder_logs").select("*").eq(
        "reminder_id", reminder_id
    ).order("created_at", desc=True).execute().data or []

    validation = _validate_reminder_readiness(reminder[0])
    return {**reminder[0], "notification_logs": logs, "validation": validation}


@router.patch("/{reminder_id}")
def update_reminder(reminder_id: str, request: Request, payload: ReminderUpdate):
    """Update a reminder's status, assignment, or completion data."""
    reminder_id = _require_uuid(reminder_id, "Reminder")
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.utcnow().isoformat()
    if updates.get("status") in ("filed", "completed"):
        updates["completed_at"] = datetime.utcnow().isoformat()
        updates["completed_by"] = performed_by

    res = supabase.table("tax_reminders").update(updates).eq("id", reminder_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Reminder not found")

    write_audit_log(
        action="UPDATE", module_name=MODULE_NAME,
        description=f"Updated tax reminder {reminder_id}: {list(updates.keys())}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.post("/{reminder_id}/validate")
def validate_reminder(reminder_id: str):
    """Run pre-filing validation checks on a reminder."""
    reminder_id = _require_uuid(reminder_id, "Reminder")
    reminder = supabase.table("tax_reminders").select("*").eq("id", reminder_id).execute().data
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return _validate_reminder_readiness(reminder[0])


# ═══════════════════════════════════════════════════════════════════════════════
# Auto-detect completion from BIR Forms
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/sync-bir-forms")
def sync_bir_form_completions(request: Request):
    """Detect filed BIR forms and auto-complete matching reminders."""
    _, performed_by = _extract_jwt_claims(request)

    filed_forms = supabase.table("bir_forms").select(
        "form_record_id, form_type, entity, period_from, period_to, status"
    ).in_("status", ["FILED", "APPROVED"]).execute().data or []

    open_reminders = supabase.table("tax_reminders").select("*").not_.in_(
        "status", ["filed", "completed", "not_applicable", "cancelled"]
    ).execute().data or []

    matched = 0
    for form in filed_forms:
        form_type = form.get("form_type", "")
        entity = form.get("entity", "")
        period_key = (form.get("period_from") or "")[:7]

        for reminder in open_reminders:
            if (reminder.get("form_type") == form_type and
                reminder.get("entity") == entity and
                (reminder.get("period_covered", "").startswith(period_key) or
                 period_key in reminder.get("period_covered", ""))):

                supabase.table("tax_reminders").update({
                    "status": "filed",
                    "bir_form_id": str(form["form_record_id"]),
                    "completed_at": datetime.utcnow().isoformat(),
                    "completed_by": "system:auto-detect",
                    "notes": f"Auto-completed from BIR form #{form['form_record_id']} (status: {form['status']})",
                    "updated_at": datetime.utcnow().isoformat(),
                }).eq("id", reminder["id"]).execute()
                matched += 1
                break

    if matched > 0:
        write_audit_log(
            action="UPDATE", module_name=MODULE_NAME,
            description=f"Auto-completed {matched} reminders from BIR form sync",
            performed_by=performed_by,
            ip_address=request.client.host if request.client else None,
            request=request,
        )
    return {"synced_forms": len(filed_forms), "auto_completed": matched}
