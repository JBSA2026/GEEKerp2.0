"""Notifications endpoint.

Returns role-based notifications for the current user by pulling live data
from connected modules (same architecture as Workflow Approval).

Provides:
- GET /notifications/       — Full notification items (role-filtered)
- GET /notifications/count  — Lightweight count-only check for polling
"""
from fastapi import APIRouter, Request
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import time as _time
from database import supabase
from middleware.audit_middleware import _extract_jwt_claims
from utils.cache import cached, invalidate_cache, _cache, _lock

router = APIRouter(prefix="/notifications", tags=["Notifications"])

# Role → relevant notification categories
ROLE_MODULES = {
    "SUPER_ADMIN": ["*"],
    "SALES_MANAGER": ["Quotation Approval", "Deal Closure", "Purchase Request Approval"],
    "SALES_USER": ["Quotation Approval", "Deal Closure"],
    "PURCHASING_MANAGER": ["Purchase Request Approval", "Purchase Order Approval"],
    "PURCHASING_USER": ["Purchase Request Approval"],
    "ACCOUNTING_MANAGER": ["Payment Voucher Approval", "Quotation Approval", "Purchase Order Approval"],
    "ACCOUNTING_STAFF": ["Payment Voucher Approval"],
    "HR_MANAGER": ["Leave Approval", "Payroll Approval"],
    "HR_STAFF": ["Leave Approval"],
    "PROJECT_MANAGER": ["Purchase Request Approval", "Contract Approval"],
    "FINANCE_TREASURY": ["Payment Voucher Approval", "Payroll Approval"],
    "MANAGEMENT": ["*"],
    "BOARD_CEO": ["*"],
    "WORKFLOW_APPROVER": ["*"],
}

# Entity code prefix → entity name
_CODE_PREFIX_TO_ENTITY = {
    "GLB": "GreatnessLab",
    "EXP": "Expedia",
    "EXG": "Exigent",
    "KSI": "KSI",
}

_COMPANY_TO_ENTITY = {
    "greatnesslab": "GreatnessLab",
    "expedia": "Expedia",
    "exigent": "Exigent",
    "kyrios": "KSI",
    "ksi": "KSI",
}

_ENTITY_TO_COMPANY = {
    "GreatnessLab": ["greatnesslab"],
    "Expedia": ["expedia"],
    "Exigent": ["exigent"],
    "KSI": ["kyrios", "ksi"],
}


def _entity_from_code(code: Optional[str]) -> Optional[str]:
    if not code:
        return None
    prefix = code.split("-")[0] if "-" in code else ""
    return _CODE_PREFIX_TO_ENTITY.get(prefix)


def _entity_from_company(company: Optional[str]) -> Optional[str]:
    if not company:
        return None
    return _COMPANY_TO_ENTITY.get(company.lower())


def _get_user_roles(request: Request) -> tuple[list[str], str]:
    """Extract user roles and email from JWT."""
    _, performed_by = _extract_jwt_claims(request)
    emp = supabase.table("employees").select("employee_id").eq("email", performed_by).limit(1).execute().data
    if not emp:
        return [], performed_by
    employee_id = emp[0]["employee_id"]
    role_rows = supabase.table("employee_roles").select("role_id, roles(role_name)").eq("employee_id", employee_id).execute().data or []
    roles = []
    for r in role_rows:
        role_info = r.get("roles")
        if isinstance(role_info, dict) and role_info.get("role_name"):
            roles.append(role_info["role_name"])
        elif isinstance(role_info, list):
            for ri in role_info:
                if ri.get("role_name"):
                    roles.append(ri["role_name"])
    return roles, performed_by


def _get_relevant_request_types(roles: list[str]) -> list[str]:
    """Determine which workflow request types are relevant for these roles."""
    if not roles:
        return []
    types = set()
    for role in roles:
        modules = ROLE_MODULES.get(role, [])
        if "*" in modules:
            return ["*"]
        types.update(modules)
    return list(types)


def _build_notification_items(relevant_types: list[str]) -> list[dict]:
    """Pull live pending items from connected modules — mirrors workflow approval logic.

    Instead of reading from the workflow_approvals table, this queries source
    modules directly for items in an approval-pending state.
    """
    items = []
    show_all = "*" in relevant_types

    # ── Quotations awaiting approval (status = FOR_APPROVAL) ──────────────────
    if show_all or "Quotation Approval" in relevant_types:
        try:
            rows = supabase.table("quotations").select(
                "quotation_id, quotation_no, project_name, client_id, company, created_at, prepared_by"
            ).eq("status", "FOR_APPROVAL").order("created_at", desc=True).execute().data or []

            # Resolve names in batch
            client_ids = list(set(q.get("client_id") for q in rows if q.get("client_id")))
            emp_ids = list(set(q.get("prepared_by") for q in rows if q.get("prepared_by")))
            client_map = {}
            emp_map = {}
            if client_ids:
                clients = supabase.table("client_list").select("client_id, company_name").in_("client_id", client_ids).execute().data or []
                client_map = {c["client_id"]: c["company_name"] for c in clients}
            if emp_ids:
                emps = supabase.table("employees").select("employee_id, first_name, last_name").in_("employee_id", emp_ids).execute().data or []
                emp_map = {e["employee_id"]: f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() for e in emps}

            for q in rows:
                client_name = client_map.get(q.get("client_id"), "")
                prepared_by = emp_map.get(q.get("prepared_by"), "")
                items.append({
                    "id": f"QTN-{q['quotation_id']}",
                    "type": "approval",
                    "title": "Quotation Approval",
                    "description": f"{q.get('quotation_no', '')} — {q.get('project_name', '')} ({client_name})",
                    "amount": None,
                    "priority": "Normal",
                    "timestamp": q.get("created_at"),
                    "entity": _entity_from_company(q.get("company")),
                    "link": "/workflow",
                    "requestor": prepared_by,
                })
        except Exception:
            pass

    # ── Purchase Requests (status = SUBMITTED) ────────────────────────────────
    if show_all or "Purchase Request Approval" in relevant_types:
        try:
            rows = supabase.table("purchase_requests").select(
                "purchase_request_id, pr_number, requested_by_employee_id, created_at"
            ).eq("status", "SUBMITTED").order("created_at", desc=True).execute().data or []

            emp_ids = list(set(r.get("requested_by_employee_id") for r in rows if r.get("requested_by_employee_id")))
            emp_map = {}
            if emp_ids:
                emps = supabase.table("employees").select("employee_id, first_name, last_name").in_("employee_id", emp_ids).execute().data or []
                emp_map = {e["employee_id"]: f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() for e in emps}

            for pr in rows:
                requestor = emp_map.get(pr.get("requested_by_employee_id"), "Unknown")
                items.append({
                    "id": f"PR-{pr['purchase_request_id']}",
                    "type": "approval",
                    "title": "Purchase Request Approval",
                    "description": f"{pr.get('pr_number', '')} — {requestor}",
                    "amount": None,
                    "priority": "Normal",
                    "timestamp": pr.get("created_at"),
                    "entity": _entity_from_code(pr.get("pr_number")),
                    "link": "/workflow",
                    "requestor": requestor,
                })
        except Exception:
            pass

    # ── Purchase Orders (status = SUBMITTED) ──────────────────────────────────
    if show_all or "Purchase Order Approval" in relevant_types:
        try:
            rows = supabase.table("purchase_orders").select(
                "purchase_order_id, po_number, supplier_id, created_at"
            ).eq("status", "SUBMITTED").order("created_at", desc=True).execute().data or []

            sup_ids = list(set(p.get("supplier_id") for p in rows if p.get("supplier_id")))
            sup_map = {}
            if sup_ids:
                sups = supabase.table("supplier_list").select("supplier_id, company_name").in_("supplier_id", sup_ids).execute().data or []
                sup_map = {s["supplier_id"]: s["company_name"] for s in sups}

            for po in rows:
                supplier_name = sup_map.get(po.get("supplier_id"), "Unknown")
                items.append({
                    "id": f"PO-{po['purchase_order_id']}",
                    "type": "approval",
                    "title": "Purchase Order Approval",
                    "description": f"{po.get('po_number', '')} — {supplier_name}",
                    "amount": None,
                    "priority": "Normal",
                    "timestamp": po.get("created_at"),
                    "entity": _entity_from_code(po.get("po_number")),
                    "link": "/workflow",
                    "requestor": supplier_name,
                })
        except Exception:
            pass

    # ── Payment Vouchers (status = FOR_APPROVAL) ─────────────────────────────
    if show_all or "Payment Voucher Approval" in relevant_types:
        try:
            rows = supabase.table("ap_payment_vouchers").select(
                "voucher_id, voucher_number, supplier_id, total_amount, created_at"
            ).eq("status", "FOR_APPROVAL").eq("record_status", "ACTIVE").order("created_at", desc=True).execute().data or []

            sup_ids = list(set(p.get("supplier_id") for p in rows if p.get("supplier_id")))
            sup_map = {}
            if sup_ids:
                sups = supabase.table("supplier_list").select("supplier_id, company_name").in_("supplier_id", sup_ids).execute().data or []
                sup_map = {s["supplier_id"]: s["company_name"] for s in sups}

            for pv in rows:
                supplier_name = sup_map.get(pv.get("supplier_id"), "Unknown")
                items.append({
                    "id": f"PV-{pv['voucher_id']}",
                    "type": "approval",
                    "title": "Payment Voucher Approval",
                    "description": f"{pv.get('voucher_number', '')} — {supplier_name}",
                    "amount": pv.get("total_amount"),
                    "priority": "High",
                    "timestamp": pv.get("created_at"),
                    "entity": _entity_from_code(pv.get("voucher_number")),
                    "link": "/workflow",
                    "requestor": supplier_name,
                })
        except Exception:
            pass

    # ── Payroll Runs (status = FOR_REVIEW) ────────────────────────────────────
    if show_all or "Payroll Approval" in relevant_types:
        try:
            rows = supabase.table("payroll_runs").select(
                "run_id, period_start, period_end, total_net, status, created_at, generated_by"
            ).eq("status", "FOR_REVIEW").order("created_at", desc=True).execute().data or []

            for pr in rows:
                period = f"{pr.get('period_start', '')} to {pr.get('period_end', '')}"
                items.append({
                    "id": f"PAY-{pr['run_id']}",
                    "type": "approval",
                    "title": "Payroll Approval",
                    "description": f"Payroll run for {period}",
                    "amount": pr.get("total_net"),
                    "priority": "High",
                    "timestamp": pr.get("created_at"),
                    "entity": None,
                    "link": "/workflow",
                    "requestor": pr.get("generated_by"),
                })
        except Exception:
            pass

    # ── Leave Requests (status = Pending) ─────────────────────────────────────
    if show_all or "Leave Approval" in relevant_types:
        try:
            rows = supabase.table("leave_requests").select(
                "id, employee_id, leave_type, number_of_days, start_date, reason, status, entity, filed_date"
            ).eq("status", "Pending").order("filed_date", desc=True).execute().data or []

            emp_ids = list(set(r.get("employee_id") for r in rows if r.get("employee_id")))
            emp_map = {}
            if emp_ids:
                emps = supabase.table("employees").select("employee_id, first_name, last_name").in_("employee_id", emp_ids).execute().data or []
                emp_map = {e["employee_id"]: f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() for e in emps}

            for lr in rows:
                emp_name = emp_map.get(lr.get("employee_id"), "Unknown")
                items.append({
                    "id": f"LV-{lr['id']}",
                    "type": "approval",
                    "title": "Leave Approval",
                    "description": f"{emp_name} — {lr.get('leave_type', '')} ({lr.get('number_of_days', 0)} days)",
                    "amount": None,
                    "priority": "Normal",
                    "timestamp": lr.get("filed_date"),
                    "entity": lr.get("entity"),
                    "link": "/workflow",
                    "requestor": emp_name,
                })
        except Exception:
            pass

    # ── Contracts/Projects pending (status = PLANNING with contract_value) ────
    if show_all or "Contract Approval" in relevant_types:
        try:
            rows = supabase.table("projects").select(
                "project_id, project_code, project_name, contract_value, entity, created_at"
            ).eq("status", "PLANNING").eq("record_status", "ACTIVE").gt("contract_value", 0).order("created_at", desc=True).execute().data or []

            for proj in rows:
                items.append({
                    "id": f"CTR-{proj['project_id']}",
                    "type": "approval",
                    "title": "Contract Approval",
                    "description": f"{proj.get('project_code', '')} — {proj.get('project_name', '')}",
                    "amount": proj.get("contract_value"),
                    "priority": "Normal",
                    "timestamp": proj.get("created_at"),
                    "entity": proj.get("entity"),
                    "link": "/workflow",
                    "requestor": None,
                })
        except Exception:
            pass

    # ── Delivery Notes that need attention (Preparing / In Transit) ───────────
    if show_all or any(t in relevant_types for t in ("Delivery", "Inventory")):
        try:
            rows = supabase.table("delivery_notes").select(
                "delivery_note_id, dr_number, status, entity, delivery_date"
            ).in_("status", ["Preparing", "In Transit"]).order("created_at", desc=True).execute().data or []

            for d in rows:
                items.append({
                    "id": f"DN-{d['delivery_note_id']}",
                    "type": "delivery",
                    "title": f"Delivery {d['status']}",
                    "description": d.get("dr_number", ""),
                    "amount": None,
                    "priority": "Normal",
                    "timestamp": d.get("delivery_date"),
                    "entity": d.get("entity"),
                    "link": "/inventory/deliveries",
                    "requestor": None,
                })
        except Exception:
            pass

    # ── Tax Filing Reminders (due soon / overdue) ─────────────────────────────
    if show_all or any(t in relevant_types for t in ("Tax Filing", "Payment Voucher Approval")):
        try:
            from datetime import date as _date, timedelta as _td
            _today = _date.today()
            _cutoff = (_today + _td(days=7)).isoformat()

            tax_reminders = supabase.table("tax_reminders").select(
                "id, form_type, entity, period_covered, effective_due_date, status, escalation_level, description"
            ).not_.in_(
                "status", ["filed", "completed", "not_applicable", "cancelled"]
            ).lte("effective_due_date", _cutoff).order("effective_due_date").execute().data or []

            for tr in tax_reminders:
                esc = tr.get("escalation_level", 0)
                if esc >= 6:
                    priority = "Urgent"
                elif esc >= 4:
                    priority = "High"
                else:
                    priority = "Normal"

                status_label = "OVERDUE" if tr["status"] == "overdue" else "Due Soon"
                items.append({
                    "id": f"TAX-{tr['id'][:8]}",
                    "type": "tax_reminder",
                    "title": f"Tax Filing {status_label}",
                    "description": f"BIR {tr['form_type']} — {tr.get('description', '')} ({tr['period_covered']})",
                    "amount": None,
                    "priority": priority,
                    "timestamp": tr.get("effective_due_date"),
                    "entity": tr.get("entity"),
                    "link": "/tax-management/reminders",
                    "requestor": None,
                })
        except Exception:
            pass

    items.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return items


@router.get("/count")
def get_notification_count(request: Request):
    """Lightweight count-only endpoint for efficient polling.

    Runs count queries in parallel using ThreadPoolExecutor (same pattern
    as the dashboard) so the total latency is ~1 DB roundtrip instead of 8.
    Results are cached for 30s keyed by role set (users with same roles
    see the same notification count).
    """

    roles, _ = _get_user_roles(request)
    relevant_types = _get_relevant_request_types(roles)

    if not relevant_types:
        return {"count": 0}

    # Cache key based on relevant types (same types = same count)
    cache_key = f"notifications:count:{','.join(sorted(relevant_types))}"
    now = _time.time()
    with _lock:
        entry = _cache.get(cache_key)
        if entry is not None:
            value, expires_at = entry
            if now < expires_at:
                return value

    show_all = "*" in relevant_types

    # Build list of count functions to run in parallel
    def _count_quotations():
        res = supabase.table("quotations").select("quotation_id", count="exact").eq("status", "FOR_APPROVAL").execute()
        return res.count or 0

    def _count_purchase_requests():
        res = supabase.table("purchase_requests").select("purchase_request_id", count="exact").eq("status", "SUBMITTED").execute()
        return res.count or 0

    def _count_purchase_orders():
        res = supabase.table("purchase_orders").select("purchase_order_id", count="exact").eq("status", "SUBMITTED").execute()
        return res.count or 0

    def _count_payment_vouchers():
        res = supabase.table("ap_payment_vouchers").select("voucher_id", count="exact").eq("status", "FOR_APPROVAL").eq("record_status", "ACTIVE").execute()
        return res.count or 0

    def _count_payroll():
        res = supabase.table("payroll_runs").select("run_id", count="exact").eq("status", "FOR_REVIEW").execute()
        return res.count or 0

    def _count_leave():
        res = supabase.table("leave_requests").select("id", count="exact").eq("status", "Pending").execute()
        return res.count or 0

    def _count_contracts():
        res = supabase.table("projects").select("project_id", count="exact").eq("status", "PLANNING").eq("record_status", "ACTIVE").gt("contract_value", 0).execute()
        return res.count or 0

    def _count_deliveries():
        res = supabase.table("delivery_notes").select("delivery_note_id", count="exact").in_("status", ["Preparing", "In Transit"]).execute()
        return res.count or 0

    def _count_tax_reminders():
        from datetime import date as _date, timedelta as _td
        _cutoff = (_date.today() + _td(days=7)).isoformat()
        res = supabase.table("tax_reminders").select("id", count="exact").not_.in_(
            "status", ["filed", "completed", "not_applicable", "cancelled"]
        ).lte("effective_due_date", _cutoff).execute()
        return res.count or 0

    tasks = []
    if show_all or "Quotation Approval" in relevant_types:
        tasks.append(_count_quotations)
    if show_all or "Purchase Request Approval" in relevant_types:
        tasks.append(_count_purchase_requests)
    if show_all or "Purchase Order Approval" in relevant_types:
        tasks.append(_count_purchase_orders)
    if show_all or "Payment Voucher Approval" in relevant_types:
        tasks.append(_count_payment_vouchers)
    if show_all or "Payroll Approval" in relevant_types:
        tasks.append(_count_payroll)
    if show_all or "Leave Approval" in relevant_types:
        tasks.append(_count_leave)
    if show_all or "Contract Approval" in relevant_types:
        tasks.append(_count_contracts)
    if show_all or any(t in relevant_types for t in ("Delivery", "Inventory")):
        tasks.append(_count_deliveries)
    if show_all or any(t in relevant_types for t in ("Tax Filing", "Payment Voucher Approval")):
        tasks.append(_count_tax_reminders)

    total = 0
    with ThreadPoolExecutor(max_workers=len(tasks)) as executor:
        futures = [executor.submit(fn) for fn in tasks]
        for future in as_completed(futures):
            try:
                total += future.result()
            except Exception:
                pass

    result = {"count": total}

    # Store in cache (30s TTL)
    with _lock:
        _cache[cache_key] = (result, now + 30)

    return result


@router.get("/")
def get_notifications(request: Request):
    """Get role-filtered notifications by pulling live data from source modules.
    Cached for 30s keyed by role set (same roles = same notifications).
    """

    roles, _ = _get_user_roles(request)
    relevant_types = _get_relevant_request_types(roles)

    if not relevant_types:
        return {"count": 0, "items": []}

    # Cache key based on relevant types
    cache_key = f"notifications:full:{','.join(sorted(relevant_types))}"
    now = _time.time()
    with _lock:
        entry = _cache.get(cache_key)
        if entry is not None:
            value, expires_at = entry
            if now < expires_at:
                return value

    notifications = _build_notification_items(relevant_types)

    result = {
        "count": len(notifications),
        "items": notifications,
    }

    # Store in cache (30s TTL)
    with _lock:
        _cache[cache_key] = (result, now + 30)

    return result
