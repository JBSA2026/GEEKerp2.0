"""Main Dashboard aggregator endpoint.

Provides a single endpoint that collects key metrics from across modules
to power the main Super Admin Dashboard. Uses ThreadPoolExecutor to
parallelize Supabase queries for faster response times.
"""
from fastapi import APIRouter, Query
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from database import supabase
from routers.workflow_approval import pending_approval_queue
from utils.cache import cached

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _fetch_opportunities(ent_filter):
    q = supabase.table("opportunities").select("opportunity_id, stage, estimated_value, entity")
    if ent_filter:
        q = q.eq("entity", ent_filter)
    return q.execute().data or []


def _fetch_projects(ent_filter):
    q = supabase.table("projects").select("project_id, status, entity, budget")
    if ent_filter:
        q = q.eq("entity", ent_filter)
    return q.execute().data or []


def _fetch_inventory(ent_filter):
    q = supabase.table("inventory_stock").select("stock_id, quantity_on_hand, reorder_level, unit_cost, entity")
    if ent_filter:
        q = q.eq("entity", ent_filter)
    return q.execute().data or []


def _fetch_ar(ent_filter):
    q = supabase.table("ar_invoices").select("invoice_id, lifecycle_status, collection_status, net_collectible, entity")
    if ent_filter:
        q = q.eq("entity", ent_filter)
    return q.execute().data or []


def _fetch_ap(ent_filter):
    q = supabase.table("ap_bills").select("bill_id, lifecycle_status, payment_status, net_payable, entity")
    if ent_filter:
        q = q.eq("entity", ent_filter)
    return q.execute().data or []


def _fetch_hr(ent_filter):
    q = supabase.table("employee_201").select("employee_id, employment_status, entity")
    if ent_filter:
        q = q.eq("entity", ent_filter)
    return q.execute().data or []


def _fetch_approvals(ent_filter):
    return pending_approval_queue(ent_filter)


def _fetch_audit():
    return supabase.table("audit_logs").select("action, module_name, performed_by, created_at").order("created_at", desc=True).limit(8).execute().data or []


def _fetch_pos():
    return supabase.table("purchase_orders").select("purchase_order_id, status").execute().data or []


def _fetch_all_hr():
    return supabase.table("employee_201").select("employee_id, entity").execute().data or []


@router.get("/summary")
@cached("dashboard:summary:{entity}", ttl=60)
def dashboard_summary(entity: Optional[str] = Query(None)):
    """Aggregate key metrics for the main dashboard (parallelized)."""
    ent_filter = entity if entity and entity != "All" else None

    # Run all queries in parallel
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            'opps': executor.submit(_fetch_opportunities, ent_filter),
            'projects': executor.submit(_fetch_projects, ent_filter),
            'inventory': executor.submit(_fetch_inventory, ent_filter),
            'ar': executor.submit(_fetch_ar, ent_filter),
            'ap': executor.submit(_fetch_ap, ent_filter),
            'hr': executor.submit(_fetch_hr, ent_filter),
            'approvals': executor.submit(_fetch_approvals, ent_filter),
            'audit': executor.submit(_fetch_audit),
            'pos': executor.submit(_fetch_pos),
            'all_hr': executor.submit(_fetch_all_hr),
        }

    opps = futures['opps'].result()
    projects = futures['projects'].result()
    inv_rows = futures['inventory'].result()
    ar_rows = futures['ar'].result()
    ap_rows = futures['ap'].result()
    hr_rows = futures['hr'].result()
    appr_rows = futures['approvals'].result()
    audit_rows = futures['audit'].result()
    po_rows = futures['pos'].result()
    all_hr = futures['all_hr'].result()

    # ── Process results ────────────────────────────────────────────────────
    open_opps = [
        opportunity
        for opportunity in opps
        if str(opportunity.get("stage") or "Prospecting").strip().casefold()
        not in {"closed won", "closed lost"}
    ]
    pipeline_value = sum(float(o.get("estimated_value") or 0) for o in open_opps)

    active_projects = [p for p in projects if p.get("status") not in ("Completed", "Cancelled", "Closed")]
    total_budget = sum(float(p.get("budget") or 0) for p in projects)

    inventory_value = sum(float(r.get("quantity_on_hand") or 0) * float(r.get("unit_cost") or 0) for r in inv_rows)
    low_stock = sum(
        1
        for row in inv_rows
        if float(row.get("quantity_on_hand") or 0) > 0
        and float(row.get("reorder_level") or 0) > 0
        and float(row.get("quantity_on_hand") or 0) < float(row.get("reorder_level") or 0)
    )

    ar_outstanding = sum(float(r.get("net_collectible") or 0) for r in ar_rows if r.get("lifecycle_status") != "DRAFT" and r.get("collection_status") != "PAID")
    ap_outstanding = sum(float(r.get("net_payable") or 0) for r in ap_rows if r.get("lifecycle_status") != "DRAFT" and r.get("payment_status") != "PAID")

    total_employees = len(hr_rows)
    active_employees = sum(1 for r in hr_rows if r.get("employment_status") == "Active")

    pending_approvals = appr_rows
    open_pos = [p for p in po_rows if p.get("status") not in ("RECEIVED", "CANCELLED")]

    # Breakdowns
    project_statuses = {}
    for p in projects:
        st = p.get("status") or "Unknown"
        project_statuses[st] = project_statuses.get(st, 0) + 1

    opp_stages = {}
    for o in opps:
        st = o.get("stage") or "Unknown"
        opp_stages[st] = opp_stages.get(st, 0) + 1

    emp_by_entity = {}
    for e in all_hr:
        ent = e.get("entity") or "Unknown"
        emp_by_entity[ent] = emp_by_entity.get(ent, 0) + 1

    return {
        "opportunities": {
            "open_count": len(open_opps),
            "pipeline_value": pipeline_value,
            "total_count": len(opps),
            "by_stage": opp_stages,
        },
        "projects": {
            "active_count": len(active_projects),
            "total_count": len(projects),
            "total_budget": total_budget,
            "by_status": project_statuses,
        },
        "inventory": {
            "total_value": inventory_value,
            "total_items": len(inv_rows),
            "low_stock_count": low_stock,
        },
        "accounts_receivable": {
            "outstanding": ar_outstanding,
            "invoice_count": len([r for r in ar_rows if r.get("lifecycle_status") != "DRAFT"]),
        },
        "accounts_payable": {
            "outstanding": ap_outstanding,
            "bill_count": len([r for r in ap_rows if r.get("lifecycle_status") != "DRAFT"]),
        },
        "employees": {
            "total": total_employees,
            "active": active_employees,
            "by_entity": emp_by_entity,
        },
        "approvals": {
            "pending_count": len(pending_approvals),
            "items": pending_approvals[:5],
        },
        "purchase_orders": {
            "open_count": len(open_pos),
        },
        "recent_activity": audit_rows,
    }
