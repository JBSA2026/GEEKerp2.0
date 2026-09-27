"""Shared helpers for turning raw database errors into responses that are
readable for BOTH the end user (friendly summary) and the developer (raw detail).

Usage in a router:

    from utils.errors import db_http_error

    try:
        res = supabase.table("leads").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)
"""
from typing import Any
from fastapi import HTTPException


# Postgres SQLSTATE codes → human-friendly summaries.
_CODE_MESSAGES = {
    "23503": "This record references another record that doesn't exist. Please pick a valid related item.",
    "23505": "A record with these details already exists.",
    "23502": "A required field is missing.",
    "23514": "A value violates a table rule (check constraint).",
    "22P02": "A field has an invalid value (wrong type or format).",
    "22007": "A date/time field has an invalid value.",
    "22003": "A number is out of the allowed range.",
    "PGRST204": "One of the submitted fields does not exist on this record.",
}


def _extract(e: Exception) -> tuple[str | None, str]:
    """Return (sqlstate_code, raw_message) from a (Supabase/PostgREST) exception."""
    code = None
    message = str(e)
    # PostgREST APIError stores a dict in args[0] with message/code/details/hint.
    args = getattr(e, "args", None)
    if args and isinstance(args[0], dict):
        info = args[0]
        code = info.get("code")
        message = info.get("message") or message
        details = info.get("details")
        hint = info.get("hint")
        # Build a fuller developer-facing detail string.
        parts = [p for p in [message, details, hint] if p]
        message = " | ".join(parts)
    # Some clients expose .code directly.
    code = code or getattr(e, "code", None)
    return code, message


def friendly_db_error(e: Exception) -> tuple[str, str]:
    """Map an exception to (client_summary, developer_detail)."""
    code, raw = _extract(e)
    summary = _CODE_MESSAGES.get(code or "", "The operation could not be completed.")
    detail = f"[{code}] {raw}" if code else raw
    return summary, detail


def db_http_error(e: Exception, status_code: int = 400) -> HTTPException:
    """Build an HTTPException whose detail carries both a client summary and
    a developer detail. The app's exception handler serializes dict details
    straight through as JSON: {"error": ..., "detail": ...}."""
    summary, detail = friendly_db_error(e)
    payload: dict[str, Any] = {"error": summary, "detail": detail}
    return HTTPException(status_code=status_code, detail=payload)
