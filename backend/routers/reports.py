"""Reports Module (Report Center) — Module 21.

Aggregates data already recorded in other GEEK-ERP modules into seven
executive/manager-facing report views:

  Executive Overview, Financial Performance, Cash Flow, Project
  Profitability, Sales Performance, AR/AP Health, Compliance Snapshot.

The Reports Module owns no source-of-truth data. Every figure is derived
from the exact same tables and, where applicable, the exact same shared
calculation utilities (`utils/reports_calc.py`, `routers/ar_ap_calc.py`) that
the originating Source Module (General Ledger, AR, AP, Commission, CRM,
Projects, Tax) already uses for its own reports — guaranteeing the figures
reconcile to 2 decimal places, with zero variance.

All endpoints require an `entity` (one of Expedia/GreatnessLab/Exigent/KSI —
no "All") and a `date_from`/`date_to` range, and are RBAC-gated via
`require_module_access("reports")`.
"""
from concurrent.futures import ThreadPoolExecutor
from csv import DictWriter
from datetime import date
from io import StringIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from database import supabase
from middleware.access_control import require_module_access, require_action
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.cache import cached
from utils.reports_calc import compute_income_statement

from routers.general_ledger import _account_map, _posted_lines
from routers.ar_ap_calc import AGING_BUCKETS, aging_bucket, aging_totals
from routers.ar import _outstanding_invoices, _collections_total_by_invoice, _as_date as _ar_as_date
from routers.ap import (
    _outstanding_bills,
    _payments_total_by_bill,
    AP_OUTSTANDING_STATUSES,
)
from routers.ap import _as_date as _ap_as_date
from routers.ar_ap_calc import ar_balance, ap_balance

router = APIRouter(
    prefix="/reports",
    tags=["Reports"],
    dependencies=[Depends(require_module_access("reports"))],
)

ENTITIES = ("Expedia", "GreatnessLab", "Exigent", "KSI")

# Aging bucket calc uses due_date/balance; cash accounts flagged by these codes
CASH_ACCOUNT_CODES = ("1000", "1020")


# ── Shared validation ─────────────────────────────────────────────────────────

def _validate_entity(entity: str) -> str:
    if entity not in ENTITIES:
        raise HTTPException(
            status_code=422,
            detail={
                "error": f"Entity must be one of: {', '.join(ENTITIES)}",
                "fields": {"entity_filter": f"Must be one of: {', '.join(ENTITIES)}"},
            },
        )
    return entity


def _validate_date_range(date_from: Optional[date], date_to: Optional[date]) -> tuple:
    if date_from is None or date_to is None:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Both date_from and date_to are required.",
                "fields": {"date_range": "Both start and end dates are required."},
            },
        )
    if date_from > date_to:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "date_from must be on or before date_to.",
                "fields": {"date_range": "Start date must be on or before end date."},
            },
        )
    return date_from, date_to


def _num(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


# ── Executive Overview ────────────────────────────────────────────────────────

def _fetch_gl_income(entity: str, date_from: date, date_to: date) -> dict:
    accts = _account_map()
    lines = _posted_lines(entity, date_from, date_to)
    return compute_income_statement(lines, accts)


def _fetch_ar_outstanding(entity: str, as_of: date) -> float:
    invoices = _outstanding_invoices(customer=None, company=entity)
    ids = [inv["invoice_id"] for inv in invoices]
    collections = _collections_total_by_invoice(ids)
    total = 0.0
    for inv in invoices:
        gross = _num(inv.get("gross_amount"))
        wht = _num(inv.get("wht_amount"))
        balance = ar_balance(gross, collections.get(inv["invoice_id"], 0.0), wht)
        total += balance
    return round(total, 2)


def _fetch_ap_outstanding(entity: str, as_of: date) -> float:
    bills = _outstanding_bills(supplier=None, company=entity)
    ids = [b["bill_id"] for b in bills]
    payments = _payments_total_by_bill(ids)
    total = 0.0
    for b in bills:
        net_payable_amount = _num(b.get("net_payable"))
        balance = ap_balance(net_payable_amount, payments.get(b["bill_id"], 0.0))
        total += balance
    return round(total, 2)


def _fetch_active_projects(entity: str) -> dict:
    rows = (
        supabase.table("projects")
        .select("project_id, status, contract_value, entity, record_status")
        .eq("entity", entity)
        .eq("record_status", "ACTIVE")
        .execute()
        .data
        or []
    )
    active = [r for r in rows if r.get("status") not in ("COMPLETED", "CLOSED", "CANCELLED")]
    return {
        "active_count": len(active),
        "aggregate_contract_value": round(sum(_num(r.get("contract_value")) for r in active), 2),
    }


def _fetch_open_pipeline(entity: str) -> float:
    rows = (
        supabase.table("opportunities")
        .select("estimated_value, stage, entity")
        .eq("entity", entity)
        .execute()
        .data
        or []
    )
    open_opps = [r for r in rows if r.get("stage") not in ("Closed Won", "Closed Lost")]
    return round(sum(_num(r.get("estimated_value")) for r in open_opps), 2)


@router.get("/executive-overview")
@cached("reports:executive-overview:{entity}:{date_from}:{date_to}", ttl=60)
def executive_overview(
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)

    with ThreadPoolExecutor(max_workers=6) as executor:
        f_income = executor.submit(_fetch_gl_income, entity, date_from, date_to)
        f_ar = executor.submit(_fetch_ar_outstanding, entity, date_to)
        f_ap = executor.submit(_fetch_ap_outstanding, entity, date_to)
        f_projects = executor.submit(_fetch_active_projects, entity)
        f_pipeline = executor.submit(_fetch_open_pipeline, entity)

    income = f_income.result()
    ar_outstanding = f_ar.result()
    ap_outstanding = f_ap.result()
    projects = f_projects.result()
    pipeline_value = f_pipeline.result()

    return {
        "entity": entity,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "revenue": {"value": income["total_revenue"], "source_module": "General Ledger"},
        "net_income": {"value": income["net_income"], "source_module": "General Ledger"},
        "ar_outstanding": {"value": ar_outstanding, "source_module": "General Ledger"},
        "ap_outstanding": {"value": ap_outstanding, "source_module": "General Ledger"},
        "active_projects": {
            "count": projects["active_count"],
            "aggregate_contract_value": projects["aggregate_contract_value"],
            "source_module": "Projects",
        },
        "open_pipeline_value": {"value": pipeline_value, "source_module": "CRM/Sales"},
    }


# ── Financial Performance ─────────────────────────────────────────────────────

def _prior_period(date_from: date, date_to: date) -> tuple:
    span_days = (date_to - date_from).days
    prior_to = date_from.fromordinal(date_from.toordinal() - 1)
    prior_from = prior_to.fromordinal(prior_to.toordinal() - span_days)
    return prior_from, prior_to


@router.get("/financial-performance")
@cached("reports:financial-performance:{entity}:{date_from}:{date_to}", ttl=60)
def financial_performance(
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)

    accts = _account_map()
    current_lines = _posted_lines(entity, date_from, date_to)
    current = compute_income_statement(current_lines, accts)

    prior_from, prior_to = _prior_period(date_from, date_to)
    prior_lines = _posted_lines(entity, prior_from, prior_to)
    prior = compute_income_statement(prior_lines, accts)

    return {
        "entity": entity,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "revenue": current["revenue"],
        "expenses": current["expenses"],
        "total_revenue": current["total_revenue"],
        "total_expenses": current["total_expenses"],
        "net_income": current["net_income"],
        "prior_period": {
            "date_from": prior_from.isoformat(),
            "date_to": prior_to.isoformat(),
            "net_income": prior["net_income"],
        },
    }


# ── Cash Flow ──────────────────────────────────────────────────────────────────

@router.get("/cash-flow")
@cached("reports:cash-flow:{entity}:{date_from}:{date_to}", ttl=60)
def cash_flow(
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)

    receipts = (
        supabase.table("gl_cash_receipts")
        .select("gross_receipt_amount, receipt_date, posting_status, entity")
        .eq("entity", entity)
        .eq("posting_status", "Posted")
        .gte("receipt_date", date_from.isoformat())
        .lte("receipt_date", date_to.isoformat())
        .execute()
        .data
        or []
    )
    disbursements = (
        supabase.table("gl_cash_disbursements")
        .select("gross_payment_amount, disbursement_date, posting_status, entity")
        .eq("entity", entity)
        .eq("posting_status", "Posted")
        .gte("disbursement_date", date_from.isoformat())
        .lte("disbursement_date", date_to.isoformat())
        .execute()
        .data
        or []
    )

    total_receipts = round(sum(_num(r.get("gross_receipt_amount")) for r in receipts), 2)
    total_disbursements = round(sum(_num(d.get("gross_payment_amount")) for d in disbursements), 2)
    net_cash_flow = round(total_receipts - total_disbursements, 2)

    # Cash/bank balance as of date_to: posted GL lines for cash account codes
    accts = _account_map()
    cash_account_ids = {aid for aid, a in accts.items() if a.get("account_code") in CASH_ACCOUNT_CODES}
    lines = _posted_lines(entity, date_to=date_to)
    cash_balance = 0.0
    for ln in lines:
        if ln["account_id"] in cash_account_ids:
            cash_balance += _num(ln.get("debit")) - _num(ln.get("credit"))
    cash_balance = round(cash_balance, 2)

    return {
        "entity": entity,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "total_receipts": total_receipts,
        "total_disbursements": total_disbursements,
        "net_cash_flow": net_cash_flow,
        "cash_and_bank_balance": cash_balance,
    }


# ── Project Profitability ─────────────────────────────────────────────────────

def _project_total_cost(project_id: int) -> float:
    total_cost = 0.0
    try:
        budget_res = supabase.table("project_budget_items").select("actual_amount").eq("project_id", project_id).execute()
        total_cost += sum(_num(r.get("actual_amount")) for r in (budget_res.data or []))
    except Exception:
        pass
    try:
        material_res = supabase.table("project_materials").select("quantity, unit_cost").eq("project_id", project_id).execute()
        total_cost += sum(_num(r.get("quantity")) * _num(r.get("unit_cost")) for r in (material_res.data or []))
    except Exception:
        pass
    return round(total_cost, 2)


@router.get("/project-profitability")
@cached("reports:project-profitability:{entity}:{date_from}:{date_to}", ttl=60)
def project_profitability(
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)

    rows = (
        supabase.table("projects")
        .select("project_id, project_code, project_name, contract_value, entity, start_date, record_status")
        .eq("entity", entity)
        .eq("record_status", "ACTIVE")
        .gte("start_date", date_from.isoformat())
        .lte("start_date", date_to.isoformat())
        .execute()
        .data
        or []
    )

    result = []
    for p in rows:
        pid = p["project_id"]
        contract_value = _num(p.get("contract_value"))
        total_cost = _project_total_cost(pid)
        gross_profit = round(contract_value - total_cost, 2)
        gross_margin_pct = round((gross_profit / contract_value * 100), 2) if contract_value else None
        result.append({
            "project_id": pid,
            "project_code": p.get("project_code"),
            "project_name": p.get("project_name"),
            "contract_value": round(contract_value, 2),
            "total_cost": total_cost,
            "gross_profit": gross_profit,
            "gross_margin_pct": gross_margin_pct,
        })

    result.sort(key=lambda r: (r["gross_margin_pct"] is None, r["gross_margin_pct"] or 0), reverse=True)

    return {
        "entity": entity,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "projects": result,
    }


# ── Sales Performance ─────────────────────────────────────────────────────────

@router.get("/sales-performance")
@cached("reports:sales-performance:{entity}:{date_from}:{date_to}", ttl=60)
def sales_performance(
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)

    opps = (
        supabase.table("opportunities")
        .select("opportunity_id, stage, estimated_value, entity, closed_at, employee_id")
        .eq("entity", entity)
        .execute()
        .data
        or []
    )
    open_opps = [o for o in opps if o.get("stage") not in ("Closed Won", "Closed Lost")]
    by_stage: dict = {}
    for o in open_opps:
        st = o.get("stage") or "Unknown"
        if st not in by_stage:
            by_stage[st] = {"stage": st, "count": 0, "value": 0.0}
        by_stage[st]["count"] += 1
        by_stage[st]["value"] += _num(o.get("estimated_value"))
    for v in by_stage.values():
        v["value"] = round(v["value"], 2)

    closed_won = [
        o for o in opps
        if o.get("stage") == "Closed Won"
        and o.get("closed_at")
        and date_from.isoformat() <= str(o["closed_at"])[:10] <= date_to.isoformat()
    ]
    closed_won_count = len(closed_won)
    closed_won_value = round(sum(_num(o.get("estimated_value")) for o in closed_won), 2)

    commissions = (
        supabase.table("commission_records")
        .select("commission_amount, net_payable, entity, employee_id, employee_name, status, created_at")
        .eq("entity", entity)
        .neq("status", "Cancelled")
        .gte("created_at", date_from.isoformat())
        .lte("created_at", date_to.isoformat())
        .execute()
        .data
        or []
    )
    total_commission = round(sum(_num(c.get("commission_amount")) for c in commissions), 2)
    total_net_payable = round(sum(_num(c.get("net_payable")) for c in commissions), 2)

    by_employee: dict = {}
    for o in closed_won:
        eid = o.get("employee_id")
        if eid is None:
            continue
        by_employee.setdefault(eid, {"employee_id": eid, "closed_won_value": 0.0, "net_payable_commission": 0.0})
        by_employee[eid]["closed_won_value"] += _num(o.get("estimated_value"))
    for c in commissions:
        eid = c.get("employee_id")
        if eid is None:
            continue
        by_employee.setdefault(eid, {"employee_id": eid, "closed_won_value": 0.0, "net_payable_commission": 0.0})
        by_employee[eid]["employee_name"] = c.get("employee_name")
        by_employee[eid]["net_payable_commission"] += _num(c.get("net_payable"))
    for v in by_employee.values():
        v["closed_won_value"] = round(v["closed_won_value"], 2)
        v["net_payable_commission"] = round(v["net_payable_commission"], 2)

    return {
        "entity": entity,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "open_pipeline_by_stage": list(by_stage.values()),
        "closed_won_count": closed_won_count,
        "closed_won_value": closed_won_value,
        "total_commission": total_commission,
        "total_net_payable_commission": total_net_payable,
        "by_employee": list(by_employee.values()),
    }


# ── AR/AP Health ───────────────────────────────────────────────────────────────

@router.get("/ar-ap-health")
@cached("reports:ar-ap-health:{entity}:{date_from}:{date_to}", ttl=60)
def ar_ap_health(
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)
    as_of = date_to

    # AR aging — reuse the exact same outstanding-invoice + aging helpers AR uses.
    invoices = _outstanding_invoices(customer=None, company=entity)
    inv_ids = [inv["invoice_id"] for inv in invoices]
    collections = _collections_total_by_invoice(inv_ids)
    ar_records = []
    total_ar = 0.0
    for inv in invoices:
        due_date = _ar_as_date(inv.get("due_date"))
        gross = _num(inv.get("gross_amount"))
        wht = _num(inv.get("wht_amount"))
        balance = ar_balance(gross, collections.get(inv["invoice_id"], 0.0), wht)
        ar_records.append({"due_date": due_date, "balance": balance})
        total_ar += balance
    ar_aging = aging_totals(ar_records, as_of)
    total_ar = round(total_ar, 2)

    # AP aging — reuse the exact same outstanding-bill + aging helpers AP uses.
    bills = _outstanding_bills(supplier=None, company=entity)
    bill_ids = [b["bill_id"] for b in bills]
    payments = _payments_total_by_bill(bill_ids)
    ap_records = []
    total_ap = 0.0
    for b in bills:
        due_date = _ap_as_date(b.get("due_date"))
        net_payable_amount = _num(b.get("net_payable"))
        balance = ap_balance(net_payable_amount, payments.get(b["bill_id"], 0.0))
        ap_records.append({"due_date": due_date, "balance": balance})
        total_ap += balance
    ap_aging = aging_totals(ap_records, as_of)
    total_ap = round(total_ap, 2)

    net_exposure = round(total_ar - total_ap, 2)

    return {
        "entity": entity,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "as_of": as_of.isoformat(),
        "ar_aging": [{"bucket": b, "total": ar_aging[b]} for b in AGING_BUCKETS],
        "ap_aging": [{"bucket": b, "total": ap_aging[b]} for b in AGING_BUCKETS],
        "total_ar_outstanding": total_ar,
        "total_ap_outstanding": total_ap,
        "net_exposure": net_exposure,
    }


# ── Compliance Snapshot ────────────────────────────────────────────────────────

@router.get("/compliance-snapshot")
@cached("reports:compliance-snapshot:{entity}:{date_from}:{date_to}", ttl=60)
def compliance_snapshot(
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)

    ar_invoices = (
        supabase.table("ar_invoices")
        .select("vat_output, invoice_date, entity, lifecycle_status, record_status")
        .eq("entity", entity)
        .eq("lifecycle_status", "CONFIRMED")
        .eq("record_status", "ACTIVE")
        .gte("invoice_date", date_from.isoformat())
        .lte("invoice_date", date_to.isoformat())
        .execute()
        .data
        or []
    )
    ap_bills = (
        supabase.table("ap_bills")
        .select("vat_input, ewt_material, bill_date, entity, lifecycle_status, record_status")
        .eq("entity", entity)
        .eq("lifecycle_status", "CONFIRMED")
        .eq("record_status", "ACTIVE")
        .gte("bill_date", date_from.isoformat())
        .lte("bill_date", date_to.isoformat())
        .execute()
        .data
        or []
    )

    vat_output = round(sum(_num(i.get("vat_output")) for i in ar_invoices), 2)
    vat_input = round(sum(_num(b.get("vat_input")) for b in ap_bills), 2)
    net_vat_payable = round(vat_output - vat_input, 2)

    wht_withheld = round(sum(_num(b.get("ewt_material")) for b in ap_bills), 2)

    tax_filings = (
        supabase.table("tax_filings")
        .select("form, filing_date, entity")
        .eq("entity", entity)
        .gte("filing_date", date_from.isoformat())
        .lte("filing_date", date_to.isoformat())
        .execute()
        .data
        or []
    )
    wht_remitted = 0.0  # tax_filings does not break down amount by tax type; surfaced via forms below

    bir_forms = (
        supabase.table("bir_forms")
        .select("form_record_id, form_type, entity, period_from, period_to, status")
        .eq("entity", entity)
        .gte("period_from", date_from.isoformat())
        .lte("period_to", date_to.isoformat())
        .execute()
        .data
        or []
    )
    filed_forms = {f["form"] for f in tax_filings}
    forms_status = []
    for f in bir_forms:
        status_val = "FILED" if f["form_type"] in filed_forms else (f.get("status") or "Not Filed")
        forms_status.append({
            "form_type": f["form_type"],
            "period_from": f.get("period_from"),
            "period_to": f.get("period_to"),
            "status": status_val,
        })

    return {
        "entity": entity,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "vat_output": vat_output,
        "vat_input": vat_input,
        "net_vat_payable": net_vat_payable,
        "wht_withheld": wht_withheld,
        "wht_remitted": wht_remitted,
        "bir_forms": forms_status,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ACTION ITEMS — Things that need attention (overdue, unfiled, pending)
# ══════════════════════════════════════════════════════════════════════════════

# BIR statutory deadlines by form type — day of month they are due
BIR_DEADLINES = {
    "0619E": 10,    # Expanded Withholding Tax — every 10th
    "1600VT": 10,   # VAT Withholding — every 10th
    "1601C": 15,    # Compensation WHT — every 15th
    "2550M": 20,    # Monthly VAT — every 20th
    "2550Q": 25,    # Quarterly VAT — 25th of month after quarter
    "1601EQ": 25,   # Quarterly Expanded WHT
    "2307": 25,     # Certificate of CWT
    "1702Q": 60,    # Quarterly Income Tax (60 days after quarter)
}


@router.get("/action-items")
@cached("reports:action-items:{entity}:{date_from}:{date_to}", ttl=60)
def action_items(
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    """Surfaces items that need immediate attention for the selected entity."""
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)
    today = date.today()
    items = []

    # 1. Overdue AR invoices (past due_date, still outstanding)
    try:
        invoices = _outstanding_invoices(customer=None, company=entity)
        inv_ids = [inv["invoice_id"] for inv in invoices]
        collections = _collections_total_by_invoice(inv_ids)
        overdue_ar = []
        for inv in invoices:
            due_date = _ar_as_date(inv.get("due_date"))
            if due_date and due_date < today:
                gross = _num(inv.get("gross_amount"))
                wht = _num(inv.get("wht_amount"))
                balance = ar_balance(gross, collections.get(inv["invoice_id"], 0.0), wht)
                if balance > 0:
                    days_overdue = (today - due_date).days
                    overdue_ar.append({
                        "invoice_id": inv["invoice_id"],
                        "invoice_number": inv.get("invoice_number"),
                        "due_date": due_date.isoformat(),
                        "days_overdue": days_overdue,
                        "balance": balance,
                    })
        overdue_ar.sort(key=lambda x: x["days_overdue"], reverse=True)
        for inv in overdue_ar[:10]:
            items.append({
                "type": "overdue_ar",
                "severity": "high" if inv["days_overdue"] > 30 else "medium",
                "title": f"AR Invoice {inv['invoice_number']} overdue",
                "description": f"{inv['days_overdue']} days overdue · ₱{inv['balance']:,.2f} outstanding",
                "link": f"/accounts-receivable/invoices?highlight={inv['invoice_id']}",
                "due_date": inv["due_date"],
            })
    except Exception:
        pass

    # 2. Overdue AP bills (past due_date, still outstanding)
    try:
        bills = _outstanding_bills(supplier=None, company=entity)
        bill_ids = [b["bill_id"] for b in bills]
        payments_map = _payments_total_by_bill(bill_ids)
        overdue_ap = []
        for b in bills:
            due_date = _ap_as_date(b.get("due_date"))
            if due_date and due_date < today:
                net_payable_amount = _num(b.get("net_payable"))
                balance = ap_balance(net_payable_amount, payments_map.get(b["bill_id"], 0.0))
                if balance > 0:
                    days_overdue = (today - due_date).days
                    overdue_ap.append({
                        "bill_id": b["bill_id"],
                        "bill_number": b.get("bill_number"),
                        "due_date": due_date.isoformat(),
                        "days_overdue": days_overdue,
                        "balance": balance,
                    })
        overdue_ap.sort(key=lambda x: x["days_overdue"], reverse=True)
        for bill in overdue_ap[:10]:
            items.append({
                "type": "overdue_ap",
                "severity": "high" if bill["days_overdue"] > 30 else "medium",
                "title": f"AP Bill {bill['bill_number']} overdue",
                "description": f"{bill['days_overdue']} days overdue · ₱{bill['balance']:,.2f} to pay",
                "link": f"/accounts-payable/bills?highlight={bill['bill_id']}",
                "due_date": bill["due_date"],
            })
    except Exception:
        pass

    # 3. BIR forms that are DRAFT (need to be finalized/filed)
    try:
        draft_forms = (
            supabase.table("bir_forms")
            .select("form_record_id, form_type, period_from, period_to, status")
            .eq("entity", entity)
            .in_("status", ["DRAFT", "PENDING_APPROVAL"])
            .execute()
            .data
            or []
        )
        for f in draft_forms:
            deadline_day = BIR_DEADLINES.get(f["form_type"], 15)
            period_to_date = _ar_as_date(f.get("period_to"))
            if period_to_date:
                # Deadline is typically the Nth day of the month AFTER the period
                deadline_month = period_to_date.month + 1
                deadline_year = period_to_date.year
                if deadline_month > 12:
                    deadline_month = 1
                    deadline_year += 1
                try:
                    deadline_date = date(deadline_year, deadline_month, min(deadline_day, 28))
                except Exception:
                    deadline_date = date(deadline_year, deadline_month, 28)
                days_until = (deadline_date - today).days
                severity = "critical" if days_until < 0 else ("high" if days_until <= 5 else ("medium" if days_until <= 15 else "low"))
                items.append({
                    "type": "bir_unfiled",
                    "severity": severity,
                    "title": f"BIR Form {f['form_type']} — {f['status']}",
                    "description": f"Period {f['period_from']} to {f['period_to']} · {'Overdue by ' + str(abs(days_until)) + ' days' if days_until < 0 else 'Due in ' + str(days_until) + ' days'}",
                    "link": "/tax/forms",
                    "due_date": deadline_date.isoformat(),
                    "days_until": days_until,
                })
    except Exception:
        pass

    # 4. Pending workflow approvals for this entity
    try:
        approvals = (
            supabase.table("workflow_approvals")
            .select("approval_id, reference_number, request_type, status, amount, submitted_at")
            .eq("status", "Pending")
            .execute()
            .data
            or []
        )
        for a in approvals[:8]:
            items.append({
                "type": "pending_approval",
                "severity": "medium",
                "title": f"Pending: {a.get('request_type', 'Approval')}",
                "description": f"{a.get('reference_number', '—')} · ₱{_num(a.get('amount')):,.2f}",
                "link": "/workflow",
                "due_date": str(a.get("submitted_at", ""))[:10],
            })
    except Exception:
        pass

    # Sort: critical first, then high, medium, low
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    items.sort(key=lambda x: severity_order.get(x.get("severity", "low"), 3))

    return {
        "entity": entity,
        "items": items,
        "summary": {
            "critical": sum(1 for i in items if i.get("severity") == "critical"),
            "high": sum(1 for i in items if i.get("severity") == "high"),
            "medium": sum(1 for i in items if i.get("severity") == "medium"),
            "low": sum(1 for i in items if i.get("severity") == "low"),
            "total": len(items),
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# CSV EXPORT ENDPOINTS — require_action("reports", "export")
# ══════════════════════════════════════════════════════════════════════════════

MODULE_NAME = "Reports"


def _write_csv(fields: list, rows: list, headers: list = None) -> str:
    """Write CSV. If headers is provided, use them as column labels instead of field names."""
    output = StringIO()
    if headers:
        # Write custom header row, then use fields as keys
        output.write(",".join(headers) + "\n")
        for row in rows:
            output.write(",".join(str(row.get(k, "")).replace(",", " ") for k in fields) + "\n")
    else:
        writer = DictWriter(output, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fields})
    output.seek(0)
    return output.getvalue()


def _csv_response(csv_content: str, filename: str):
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([csv_content]), media_type="text/csv", headers=headers)


@router.get("/executive-overview/export/csv")
def export_executive_overview_csv(
    request: Request,
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    user=Depends(require_action("reports", "export")),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)
    _, performed_by = _extract_jwt_claims(request)

    data = executive_overview(entity=entity, date_from=date_from, date_to=date_to)
    rows = [
        {"metric": "Revenue", "value": data["revenue"]["value"], "source_module": data["revenue"]["source_module"]},
        {"metric": "Net Income", "value": data["net_income"]["value"], "source_module": data["net_income"]["source_module"]},
        {"metric": "AR Outstanding", "value": data["ar_outstanding"]["value"], "source_module": data["ar_outstanding"]["source_module"]},
        {"metric": "AP Outstanding", "value": data["ap_outstanding"]["value"], "source_module": data["ap_outstanding"]["source_module"]},
        {"metric": "Active Projects Count", "value": data["active_projects"]["count"], "source_module": data["active_projects"]["source_module"]},
        {"metric": "Active Projects Contract Value", "value": data["active_projects"]["aggregate_contract_value"], "source_module": data["active_projects"]["source_module"]},
        {"metric": "Open Pipeline Value", "value": data["open_pipeline_value"]["value"], "source_module": data["open_pipeline_value"]["source_module"]},
    ]
    csv_content = _write_csv(["metric", "value", "source_module"], rows, headers=["METRIC", "AMOUNT", "SOURCE MODULE"])
    write_audit_log(action="EXPORT", module_name=MODULE_NAME, description=f"Exported Executive Overview CSV ({entity}, {date_from} to {date_to})", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return _csv_response(csv_content, f"executive_overview_{entity}_{date_from}_{date_to}.csv")


@router.get("/financial-performance/export/csv")
def export_financial_performance_csv(
    request: Request,
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    user=Depends(require_action("reports", "export")),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)
    _, performed_by = _extract_jwt_claims(request)

    data = financial_performance(entity=entity, date_from=date_from, date_to=date_to)
    rows = []
    for r in data["revenue"]:
        rows.append({"type": "Revenue", "account_code": r["account_code"], "account_name": r["account_name"], "amount": r["amount"]})
    for r in data["expenses"]:
        rows.append({"type": "Expense", "account_code": r["account_code"], "account_name": r["account_name"], "amount": r["amount"]})
    rows.append({"type": "Summary", "account_code": "", "account_name": "Net Income", "amount": data["net_income"]})
    csv_content = _write_csv(["type", "account_code", "account_name", "amount"], rows, headers=["TYPE", "ACCOUNT CODE", "ACCOUNT TITLE", "AMOUNT"])
    write_audit_log(action="EXPORT", module_name=MODULE_NAME, description=f"Exported Financial Performance CSV ({entity}, {date_from} to {date_to})", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return _csv_response(csv_content, f"financial_performance_{entity}_{date_from}_{date_to}.csv")


@router.get("/cash-flow/export/csv")
def export_cash_flow_csv(
    request: Request,
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    user=Depends(require_action("reports", "export")),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)
    _, performed_by = _extract_jwt_claims(request)

    data = cash_flow(entity=entity, date_from=date_from, date_to=date_to)
    rows = [
        {"metric": "Total Cash Receipts", "value": data["total_receipts"]},
        {"metric": "Total Cash Disbursements", "value": data["total_disbursements"]},
        {"metric": "Net Cash Flow", "value": data["net_cash_flow"]},
        {"metric": "Cash & Bank Balance", "value": data["cash_and_bank_balance"]},
    ]
    csv_content = _write_csv(["metric", "value"], rows, headers=["METRIC", "AMOUNT"])
    write_audit_log(action="EXPORT", module_name=MODULE_NAME, description=f"Exported Cash Flow CSV ({entity}, {date_from} to {date_to})", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return _csv_response(csv_content, f"cash_flow_{entity}_{date_from}_{date_to}.csv")


@router.get("/project-profitability/export/csv")
def export_project_profitability_csv(
    request: Request,
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    user=Depends(require_action("reports", "export")),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)
    _, performed_by = _extract_jwt_claims(request)

    data = project_profitability(entity=entity, date_from=date_from, date_to=date_to)
    fields = ["project_code", "project_name", "contract_value", "total_cost", "gross_profit", "gross_margin_pct"]
    csv_content = _write_csv(fields, data["projects"], headers=["PROJECT CODE", "PROJECT NAME", "CONTRACT VALUE", "TOTAL COST", "GROSS PROFIT", "GROSS MARGIN %"])
    write_audit_log(action="EXPORT", module_name=MODULE_NAME, description=f"Exported Project Profitability CSV ({entity}, {date_from} to {date_to})", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return _csv_response(csv_content, f"project_profitability_{entity}_{date_from}_{date_to}.csv")


@router.get("/sales-performance/export/csv")
def export_sales_performance_csv(
    request: Request,
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    user=Depends(require_action("reports", "export")),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)
    _, performed_by = _extract_jwt_claims(request)

    data = sales_performance(entity=entity, date_from=date_from, date_to=date_to)
    rows = [
        {"metric": "Closed Won Deals", "value": data["closed_won_count"]},
        {"metric": "Closed Won Value (₱)", "value": data["closed_won_value"]},
        {"metric": "Total Commission (₱)", "value": data["total_commission"]},
        {"metric": "Total Net Payable Commission (₱)", "value": data["total_net_payable_commission"]},
    ]
    for emp in data.get("by_employee", []):
        rows.append({"metric": emp.get('employee_name', f"Employee #{emp['employee_id']}"), "value": f"Won: ₱{emp['closed_won_value']:,.2f} | Commission: ₱{emp['net_payable_commission']:,.2f}"})
    csv_content = _write_csv(["metric", "value"], rows, headers=["DESCRIPTION", "VALUE"])
    write_audit_log(action="EXPORT", module_name=MODULE_NAME, description=f"Exported Sales Performance CSV ({entity}, {date_from} to {date_to})", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return _csv_response(csv_content, f"sales_performance_{entity}_{date_from}_{date_to}.csv")


@router.get("/ar-ap-health/export/csv")
def export_ar_ap_health_csv(
    request: Request,
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    user=Depends(require_action("reports", "export")),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)
    _, performed_by = _extract_jwt_claims(request)

    data = ar_ap_health(entity=entity, date_from=date_from, date_to=date_to)
    rows = []
    for b in data["ar_aging"]:
        rows.append({"type": "Accounts Receivable", "bucket": b["bucket"], "total": b["total"]})
    for b in data["ap_aging"]:
        rows.append({"type": "Accounts Payable", "bucket": b["bucket"], "total": b["total"]})
    rows.append({"type": "Summary", "bucket": "Total AR Outstanding", "total": data["total_ar_outstanding"]})
    rows.append({"type": "Summary", "bucket": "Total AP Outstanding", "total": data["total_ap_outstanding"]})
    rows.append({"type": "Summary", "bucket": "Net Exposure (AR − AP)", "total": data["net_exposure"]})
    csv_content = _write_csv(["type", "bucket", "total"], rows, headers=["CATEGORY", "AGING BUCKET", "OUTSTANDING AMOUNT"])
    write_audit_log(action="EXPORT", module_name=MODULE_NAME, description=f"Exported AR/AP Health CSV ({entity}, {date_from} to {date_to})", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return _csv_response(csv_content, f"ar_ap_health_{entity}_{date_from}_{date_to}.csv")


@router.get("/compliance-snapshot/export/csv")
def export_compliance_snapshot_csv(
    request: Request,
    entity: str = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    user=Depends(require_action("reports", "export")),
):
    entity = _validate_entity(entity)
    date_from, date_to = _validate_date_range(date_from, date_to)
    _, performed_by = _extract_jwt_claims(request)

    data = compliance_snapshot(entity=entity, date_from=date_from, date_to=date_to)
    rows = [
        {"metric": "VAT Output", "value": data["vat_output"]},
        {"metric": "VAT Input", "value": data["vat_input"]},
        {"metric": "Net VAT Payable", "value": data["net_vat_payable"]},
        {"metric": "Withholding Tax Withheld", "value": data["wht_withheld"]},
        {"metric": "Withholding Tax Remitted", "value": data["wht_remitted"]},
    ]
    for f in data.get("bir_forms", []):
        rows.append({"metric": f"BIR Form {f['form_type']} ({f['period_from']} to {f['period_to']})", "value": f["status"]})
    csv_content = _write_csv(["metric", "value"], rows, headers=["DESCRIPTION", "AMOUNT / STATUS"])
    write_audit_log(action="EXPORT", module_name=MODULE_NAME, description=f"Exported Compliance Snapshot CSV ({entity}, {date_from} to {date_to})", performed_by=performed_by, ip_address=request.client.host if request.client else None, request=request)
    return _csv_response(csv_content, f"compliance_snapshot_{entity}_{date_from}_{date_to}.csv")
