"""Role-Based Access Control (RBAC) middleware.

Provides:
  - can(user, action, module) pattern for permission checks
  - require_module_access() — FastAPI dependency for module-level access
  - require_action() — FastAPI dependency for action-level permission
  - Logs denied access attempts to access_denied_log table
"""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status

from database import supabase
from routers.auth import get_current_user, CurrentUser


# ── Module key mapping (route prefix → module key) ────────────────────────────
ROUTE_TO_MODULE = {
    "/dashboard": "dashboard",
    "/master-data": "masterdata",
    "/crm": "crm",
    "/clients": "crm",
    "/contacts": "crm",
    "/leads": "crm",
    "/opportunities": "crm",
    "/sales-activity": "crm",
    "/sales-forecast": "crm",
    "/quotations": "quotation",
    "/purchasing": "purchasing",
    "/inventory": "inventory",
    "/warehouses": "inventory",
    "/projects": "projects",
    "/ar": "accounts-receivable",
    "/ap": "accounts-payable",
    "/general-ledger": "general-ledger",
    "/hr": "hr",
    "/payroll": "payroll",
    "/tax": "tax",
    "/loa": "loa",
    "/document-management": "documents",
    "/documents": "documents",
    "/workflow-approval": "workflow",
    "/services": "service",
    "/datacenter": "datacenter",
    "/lms": "lms",
    "/ai": "ai",
    "/ojt": "ojt",
    "/commission": "commission",
    "/board": "board",
    "/bi": "bi",
    "/employees": "administration",
    "/audit-logs": "administration",
    "/reports": "reports",
    "/auth": None,  # Auth endpoints are always accessible
}


# ── Permission Level Hierarchy ─────────────────────────────────────────────────
PERMISSION_HIERARCHY = {
    'full': ['view', 'create', 'edit', 'delete', 'approve', 'export', 'admin'],
    'manage': ['view', 'create', 'edit', 'delete', 'approve', 'export'],
    'create_edit': ['view', 'create', 'edit'],
    'approve': ['view', 'approve'],
    'view': ['view'],
    'limited': ['view'],
}


# ══════════════════════════════════════════════════════════════════════════════
# RBAC CORE
# ══════════════════════════════════════════════════════════════════════════════

def _fetch_user_permissions(employee_id: int) -> dict:
    """Fetch the effective permission set for an employee.

    Returns:
        {
            "modules": {"crm": "manage", "dashboard": "view", ...},
            "roles": ["SALES_MANAGER", ...],
            "is_super_admin": bool
        }

    When a user has multiple roles, permissions are the UNION (most permissive level wins).
    """
    er_res = supabase.table("employee_roles").select("role_id").eq("employee_id", employee_id).execute()
    role_ids = [r["role_id"] for r in (er_res.data or [])]

    if not role_ids:
        return {"modules": {}, "roles": [], "is_super_admin": False}

    roles_res = supabase.table("roles").select("role_id, role_name").in_("role_id", role_ids).execute()
    role_names = [r["role_name"] for r in (roles_res.data or [])]
    is_super_admin = "SUPER_ADMIN" in role_names

    modules_res = supabase.table("role_modules").select("module_key, permission_level").in_("role_id", role_ids).execute()

    level_order = ['limited', 'view', 'approve', 'create_edit', 'manage', 'full']
    modules = {}
    for r in (modules_res.data or []):
        key = r["module_key"]
        level = r.get("permission_level") or "view"
        if key not in modules or level_order.index(level) > level_order.index(modules[key]):
            modules[key] = level

    return {
        "modules": modules,
        "roles": role_names,
        "is_super_admin": is_super_admin,
    }


def can(user_perms: dict, action: str, module: str) -> bool:
    """Check if a user's effective permissions allow a specific action on a module."""
    if user_perms.get("is_super_admin"):
        return True

    modules = user_perms.get("modules", {})
    if module not in modules:
        return False

    level = modules[module]
    allowed_actions = PERMISSION_HIERARCHY.get(level, [])
    return action in allowed_actions


# ══════════════════════════════════════════════════════════════════════════════
# ACCESS LOGGING
# ══════════════════════════════════════════════════════════════════════════════

def _log_denied_access(
    employee_id: Optional[int],
    email: Optional[str],
    module: str,
    action: str,
    endpoint: Optional[str] = None,
    ip_address: Optional[str] = None,
    reason: Optional[str] = None,
) -> None:
    """Log a denied access attempt for Super Admin visibility."""
    try:
        supabase.table("access_denied_log").insert({
            "employee_id": employee_id,
            "email": email,
            "attempted_module": module,
            "attempted_action": action,
            "endpoint": endpoint,
            "ip_address": ip_address,
        }).execute()
    except Exception:
        pass  # Don't fail the request because of logging


# ══════════════════════════════════════════════════════════════════════════════
# FASTAPI DEPENDENCIES
# ══════════════════════════════════════════════════════════════════════════════

def get_user_permissions(current_user: CurrentUser = Depends(get_current_user)) -> dict:
    """FastAPI dependency that returns the user's full permission set."""
    perms = _fetch_user_permissions(current_user.employee_id)
    perms["employee_id"] = current_user.employee_id
    perms["email"] = current_user.email
    return perms


def require_module_access(module_key: str):
    """FastAPI dependency factory — verifies the user can access a specific module.

    Returns CurrentUser on success.

    Usage:
        @router.get("/")
        def list_items(user: CurrentUser = Depends(require_module_access("purchasing"))):
            ...
    """
    def _check(
        request: Request,
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        perms = _fetch_user_permissions(current_user.employee_id)
        if not can(perms, "view", module_key):
            _log_denied_access(
                employee_id=current_user.employee_id,
                email=current_user.email,
                module=module_key,
                action="view",
                endpoint=request.url.path,
                ip_address=request.client.host if request.client else None,
                reason="RBAC: module access denied",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have permission to access the {module_key} module.",
            )
        return current_user
    return _check


def require_action(module_key: str, action: str):
    """FastAPI dependency factory — verifies the user can perform a specific action.

    Returns CurrentUser on success.

    Usage:
        @router.post("/")
        def create_item(user: CurrentUser = Depends(require_action("purchasing", "create"))):
            ...
    """
    def _check(
        request: Request,
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        perms = _fetch_user_permissions(current_user.employee_id)
        if not can(perms, action, module_key):
            _log_denied_access(
                employee_id=current_user.employee_id,
                email=current_user.email,
                module=module_key,
                action=action,
                endpoint=request.url.path,
                ip_address=request.client.host if request.client else None,
                reason=f"RBAC: action '{action}' denied on module '{module_key}'",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have permission to {action} in the {module_key} module.",
            )
        return current_user
    return _check
