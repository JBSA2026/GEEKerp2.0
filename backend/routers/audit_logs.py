import json
from csv import DictWriter
from io import StringIO

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from database import supabase

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])
AUDIT_SELECT = "log_id, employee_id, action, module_name, record_id, ip_address, performed_by, old_values, new_values, created_at"


# ── Schema ────────────────────────────────────────────────────────────────────

class AuditLogEntry(BaseModel):
    log_id:       int
    employee_id:  Optional[int]  = None
    action:       str
    module_name:  Optional[str]  = None
    record_id:    Optional[int]  = None
    ip_address:   Optional[str]  = None
    performed_by: Optional[str]  = None
    old_values:   Optional[dict] = None
    new_values:   Optional[dict] = None
    created_at:   str


def _normalize_module_name(module_name: Optional[str]) -> Optional[str]:
    if module_name and module_name.strip().lower() == "auth":
        return "Authentication"
    return module_name


def _description_is_empty(description: Optional[str]) -> bool:
    if not description:
        return True
    normalized = description.strip().lower()
    return normalized in {"-", "—", "none"} or normalized.startswith("none ")


def _employee_email_map(rows: list[dict]) -> dict[int, str]:
    employee_ids = sorted({
        row.get("employee_id")
        for row in rows
        if row.get("employee_id") is not None and not row.get("performed_by")
    })
    if not employee_ids:
        return {}

    res = (
        supabase.table("employees")
        .select("employee_id, email")
        .in_("employee_id", employee_ids)
        .execute()
    )
    return {row["employee_id"]: row["email"] for row in (res.data or []) if row.get("email")}


def _normalize_audit_row(row: dict, employee_email_map: dict[int, str]) -> dict:
    row = dict(row)
    row["module_name"] = _normalize_module_name(row.get("module_name"))

    action = (row.get("action") or "").upper()
    if action in {"LOGIN", "LOGOUT", "LOGIN_FAILED"}:
        employee_id = row.get("employee_id")
        performer = row.get("performed_by") or employee_email_map.get(employee_id)
        if performer:
            row["performed_by"] = performer

        values = dict(row.get("new_values") or {})
        description = values.get("description")
        if _description_is_empty(description):
            actor = performer or "Unknown user"
            if action == "LOGIN_FAILED":
                values["description"] = f"Failed login attempt for {actor}"
            else:
                verb = "logged into" if action == "LOGIN" else "logged out of"
                values["description"] = f"{actor} {verb} the system"
        row["new_values"] = values

    return row


def _audit_query(
    search: Optional[str] = None,
    module: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    req = (
        supabase.table("audit_logs")
        .select(AUDIT_SELECT)
        .order("created_at", desc=True)
    )

    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"module_name.ilike.%{s}%,"
            f"action.ilike.%{s}%,"
            f"performed_by.ilike.%{s}%"
        )
    if module:
        if module == "Authentication":
            req = req.in_("module_name", ["Authentication", "auth"])
        else:
            req = req.eq("module_name", module)
    if action:
        req = req.eq("action", action)
    if date_from:
        req = req.gte("created_at", f"{date_from}T00:00:00+00:00")
    if date_to:
        req = req.lte("created_at", f"{date_to}T23:59:59+00:00")

    return req


def _json_dump(value) -> str:
    if value is None:
        return ""
    return json.dumps(value, ensure_ascii=False, default=str)


def _export_row(row: dict) -> dict:
    values = row.get("new_values") or {}
    http = values.get("http") or {}
    error_details = (
        http.get("error_details")
        or http.get("error")
        or values.get("failure_reason")
        or ""
    )

    return {
        "log_id": row.get("log_id"),
        "created_at": row.get("created_at"),
        "action": row.get("action"),
        "module_name": row.get("module_name"),
        "record_id": row.get("record_id"),
        "employee_id": row.get("employee_id"),
        "performed_by": row.get("performed_by"),
        "description": values.get("description", ""),
        "ip_address": row.get("ip_address"),
        "request_id": http.get("request_id", ""),
        "endpoint": http.get("endpoint", ""),
        "method": http.get("method", ""),
        "duration_ms": http.get("duration_ms", ""),
        "status_code": http.get("status_code", ""),
        "success": http.get("success", ""),
        "error_details": error_details,
        "user_agent": http.get("user_agent", ""),
        "old_values": _json_dump(row.get("old_values")),
        "new_values": _json_dump(row.get("new_values")),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[AuditLogEntry])
def list_audit_logs(
    search:    Optional[str] = Query(None),
    module:    Optional[str] = Query(None),
    action:    Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    limit:     int = Query(100, ge=1, le=500),
    offset:    int = Query(0, ge=0),
):
    res = _audit_query(search, module, action, date_from, date_to).limit(limit).offset(offset).execute()
    rows = res.data or []
    employee_email_map = _employee_email_map(rows)
    return [_normalize_audit_row(row, employee_email_map) for row in rows]


@router.get("/export")
def export_audit_logs(
    search:    Optional[str] = Query(None),
    module:    Optional[str] = Query(None),
    action:    Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    limit:     int = Query(5000, ge=1, le=10000),
):
    """Export audit logs with hidden HTTP metadata flattened for IT review."""
    res = _audit_query(search, module, action, date_from, date_to).limit(limit).execute()
    rows = res.data or []
    employee_email_map = _employee_email_map(rows)
    rows = [_normalize_audit_row(row, employee_email_map) for row in rows]

    fieldnames = [
        "log_id",
        "created_at",
        "action",
        "module_name",
        "record_id",
        "employee_id",
        "performed_by",
        "description",
        "ip_address",
        "request_id",
        "endpoint",
        "method",
        "duration_ms",
        "status_code",
        "success",
        "error_details",
        "user_agent",
        "old_values",
        "new_values",
    ]

    output = StringIO()
    writer = DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(_export_row(row) for row in rows)
    output.seek(0)

    headers = {"Content-Disposition": 'attachment; filename="audit-logs.csv"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


@router.get("/meta")
def audit_log_meta():
    """Return distinct module_names and actions for filter dropdowns."""
    modules_res = supabase.table("audit_logs").select("module_name").execute()
    actions_res = supabase.table("audit_logs").select("action").execute()
    modules = sorted({
        _normalize_module_name(r["module_name"])
        for r in (modules_res.data or [])
        if r.get("module_name")
    })
    actions = sorted({r["action"] for r in (actions_res.data or []) if r.get("action")})
    return {"modules": modules, "actions": actions}
