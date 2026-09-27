"""Audit helpers plus request metadata middleware.

The middleware captures technical HTTP metadata for every request and stores it
on the request context. Route-level audit calls still decide what business event
is worth saving, then the middleware attaches the HTTP metadata before inserting.
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from contextvars import ContextVar
from typing import Any

from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from database import supabase


SECRET_KEY = os.environ.get("JWT_SECRET", "")
ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")

_audit_request_context: ContextVar[dict[str, Any] | None] = ContextVar(
    "audit_request_context",
    default=None,
)


def _extract_jwt_claims(request: Request) -> tuple[int | None, str | None]:
    """Extract employee_id and email from the Authorization header."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None, None
    try:
        payload = jwt.decode(auth[7:], SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("employee_id"), payload.get("email")
    except JWTError:
        return None, None


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else None


def _context_from_request(request: Request | None) -> dict[str, Any] | None:
    if not request:
        return None
    return getattr(request.state, "audit_context", None)


def _base_http_context(request: Request, request_id: str) -> dict[str, Any]:
    return {
        "request_id": request_id,
        "method": request.method,
        "endpoint": request.url.path,
        "ip_address": _client_ip(request),
        "user_agent": request.headers.get("user-agent"),
        "audit_events": [],
    }


def _http_metadata(context: dict[str, Any] | None) -> dict[str, Any] | None:
    if not context:
        return None

    keys = (
        "request_id",
        "method",
        "endpoint",
        "status_code",
        "success",
        "duration_ms",
        "ip_address",
        "user_agent",
        "error",
        "error_details",
    )
    metadata = {key: context.get(key) for key in keys if context.get(key) is not None}
    return metadata or None


def _new_values_with_description(
    description: str,
    new_values: dict[str, Any] | None,
    http_metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    values = dict(new_values or {})
    values.setdefault("description", description)
    if http_metadata:
        values["http"] = http_metadata
    return values


def _insert_audit_event(
    event: dict[str, Any],
    http_metadata: dict[str, Any] | None = None,
) -> None:
    try:
        supabase.table("audit_logs").insert({
            "employee_id": event.get("employee_id"),
            "performed_by": event.get("performed_by"),
            "action": event["action"],
            "module_name": event["module_name"],
            "old_values": event.get("old_values"),
            "new_values": _new_values_with_description(
                event["description"],
                event.get("new_values"),
                http_metadata,
            ),
            "record_id": event.get("record_id"),
            "ip_address": event.get("ip_address") or (http_metadata or {}).get("ip_address"),
        }).execute()
    except Exception:
        pass


def _insert_audit_events(
    events: list[dict[str, Any]],
    http_metadata: dict[str, Any] | None,
) -> None:
    for event in events:
        _insert_audit_event(event, http_metadata)


def _flush_audit_events(context: dict[str, Any]) -> None:
    events = list(context.get("audit_events") or [])
    if not events:
        return

    http_metadata = _http_metadata(context)
    threading.Thread(
        target=_insert_audit_events,
        args=(events, http_metadata),
        daemon=True,
    ).start()


def write_audit_log(
    action: str,
    module_name: str,
    description: str,
    performed_by: str | None = None,
    employee_id: int | None = None,
    record_id: int | str | None = None,
    ip_address: str | None = None,
    old_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    """Queue or insert one business audit event.

    When AuditMiddleware is active, events are queued until the response status
    and duration are known. Without middleware, this falls back to the previous
    fire-and-forget insert behavior.
    """
    event = {
        "employee_id": employee_id,
        "performed_by": performed_by,
        "action": action,
        "module_name": module_name,
        "description": description,
        "record_id": record_id,
        "ip_address": ip_address,
        "old_values": old_values,
        "new_values": new_values,
    }

    context = _context_from_request(request) or _audit_request_context.get()
    if context is not None and "audit_events" in context:
        context["audit_events"].append(event)
        return

    http_metadata = _http_metadata(context)
    threading.Thread(
        target=_insert_audit_event,
        args=(event, http_metadata),
        daemon=True,
    ).start()


class AuditMiddleware(BaseHTTPMiddleware):
    """Adds request_id and HTTP metadata to route-level audit log entries.
    Also invalidates in-memory cache on successful mutations.
    """

    # Methods that mutate data
    _MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        context = _base_http_context(request, request_id)
        token = _audit_request_context.set(context)
        request.state.audit_context = context

        response = None
        started_at = time.perf_counter()
        try:
            response = await call_next(request)
            return response
        except Exception as exc:
            context["status_code"] = 500
            context["success"] = False
            context["error"] = exc.__class__.__name__
            context["error_details"] = str(exc)
            raise
        finally:
            context["duration_ms"] = round((time.perf_counter() - started_at) * 1000, 2)
            if response is not None:
                context["status_code"] = response.status_code
                context["success"] = response.status_code < 400
                response.headers["X-Request-ID"] = request_id

                # Invalidate cache on successful mutations
                if (
                    request.method in self._MUTATION_METHODS
                    and response.status_code < 400
                ):
                    self._invalidate_for_path(request.url.path)

            _flush_audit_events(context)
            _audit_request_context.reset(token)

    @staticmethod
    def _invalidate_for_path(path: str):
        """Invalidate relevant cache entries based on the mutated endpoint."""
        from utils.cache import invalidate_cache

        # Always invalidate dashboard (it aggregates everything)
        invalidate_cache("dashboard:*")

        # Invalidate notifications if a module that feeds them was mutated
        notification_paths = (
            "/quotation", "/purchasing", "/accounts-payable",
            "/payroll", "/hr", "/projects", "/inventory",
            "/workflow-approval", "/delivery-notes",
        )
        for prefix in notification_paths:
            if path.startswith(prefix):
                invalidate_cache("notifications:*")
                break

        # ── Module-specific cache invalidation ────────────────────────────
        if path.startswith("/inventory"):
            invalidate_cache("inventory:*")
            invalidate_cache("master-data:*")
        if path.startswith("/products"):
            invalidate_cache("products:*")
            invalidate_cache("inventory:*")  # products feed inventory views
            invalidate_cache("master-data:*")
        if path.startswith("/clients"):
            invalidate_cache("clients:*")
            invalidate_cache("master-data:*")
            # Clear AR's _customer_map function cache
            from routers.ar import _customer_map
            if hasattr(_customer_map, "_cache"):
                _customer_map._expires = 0
        if path.startswith("/supplier"):
            invalidate_cache("suppliers:*")
            invalidate_cache("master-data:*")
            # Clear AP's _supplier_map function cache
            from routers.ap import _supplier_map
            if hasattr(_supplier_map, "_cache"):
                _supplier_map._expires = 0
        if path.startswith("/services"):
            invalidate_cache("services:*")
            invalidate_cache("master-data:*")
        if path.startswith("/warehouses"):
            invalidate_cache("warehouses:*")
            invalidate_cache("inventory:*")  # warehouses feed inventory meta
            invalidate_cache("master-data:*")
        if path.startswith("/general-ledger"):
            invalidate_cache("gl:*")
        if path.startswith("/master-data"):
            invalidate_cache("master-data:*")
        if path.startswith("/ap"):
            invalidate_cache("ap:*")
        if path.startswith("/ar"):
            invalidate_cache("ar:*")
