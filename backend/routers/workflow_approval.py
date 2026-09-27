"""Workflow Approval router (Module 16).

Cross-module approval engine. Supports Submit, Approve, Reject,
Return for Revision, Escalate, and Add Comment.
Connected to: Quotations, Purchasing (PR/PO), Leave, Payroll, Contracts.
"""
from datetime import datetime
from io import StringIO
from csv import DictWriter
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims

router = APIRouter(prefix="/workflow-approval", tags=["Workflow Approval"])

MODULE_NAME = "Workflow Approval"
ENTITIES = ("Expedia", "GreatnessLab", "Exigent", "KSI")

REQUEST_TYPES = (
    "Quotation Approval",
    "Purchase Request Approval",
    "Purchase Order Approval",
    "Payment Voucher Approval",
    "Payroll Approval",
    "Leave Approval",
    "Contract Approval",
    "BIR Form Approval",
)

STATUSES = ("Pending", "Approved", "Rejected", "Returned", "Escalated", "Cancelled")
PRIORITIES = ("Low", "Normal", "High", "Urgent")
ACTIONS = ("Submitted", "Approved", "Rejected", "Returned", "Escalated", "Cancelled", "Comment")


# ── Schemas ───────────────────────────────────────────────────────────────────

class ApprovalSubmit(BaseModel):
    request_type: str
    entity: Optional[str] = None
    reference_module: Optional[str] = None
    reference_id: Optional[int] = None
    reference_number: Optional[str] = None
    department: Optional[str] = None
    amount: Optional[float] = None
    approver_employee_id: Optional[int] = None
    priority: str = "Normal"
    remarks: Optional[str] = None

    @field_validator("request_type")
    @classmethod
    def _rt(cls, v):
        if v not in REQUEST_TYPES:
            raise ValueError(f"Must be one of: {', '.join(REQUEST_TYPES)}")
        return v

    @field_validator("entity")
    @classmethod
    def _ent(cls, v):
        if v is not None and v != "" and v not in ENTITIES:
            raise ValueError(f"Must be one of: {', '.join(ENTITIES)}")
        return v or None

    @field_validator("priority")
    @classmethod
    def _pri(cls, v):
        if v not in PRIORITIES:
            raise ValueError(f"Must be one of: {', '.join(PRIORITIES)}")
        return v


class ApprovalAction(BaseModel):
    comment: Optional[str] = None


class EscalatePayload(BaseModel):
    new_approver_employee_id: int
    comment: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _employee_name(employee_id: Optional[int]) -> Optional[str]:
    if not employee_id:
        return None
    try:
        res = supabase.table("employees").select("first_name, last_name").eq("employee_id", employee_id).limit(1).execute()
        if res.data:
            r = res.data[0]
            return f"{r.get('first_name', '')} {r.get('last_name', '')}".strip()
    except Exception:
        pass
    return None


def _requestor_from_email(email: Optional[str]) -> tuple:
    """Returns (employee_id, name, department) from email."""
    if not email:
        return None, None, None
    try:
        emp = supabase.table("employees").select("employee_id, first_name, last_name").eq("email", email).limit(1).execute()
        if not emp.data:
            return None, email, None
        e = emp.data[0]
        eid = e["employee_id"]
        name = f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() or email
        # Try to get department from employee_201
        dept_res = supabase.table("employee_201").select("department").eq("employee_id", eid).limit(1).execute()
        dept = dept_res.data[0].get("department") if dept_res.data else None
        return eid, name, dept
    except Exception:
        return None, email, None


def _decorate(approval: dict) -> dict:
    """Attach comment history to an approval row."""
    comments = (
        supabase.table("workflow_approval_comments")
        .select("*")
        .eq("approval_id", approval["approval_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return {**approval, "history": comments.data or []}


# Entity code prefix mapping (document numbers use 3-letter prefixes)
_CODE_PREFIX_TO_ENTITY = {
    "GLB": "GreatnessLab",
    "EXP": "Expedia",
    "EXG": "Exigent",
    "KSI": "KSI",
}

# Company column value to entity mapping (quotations use lowercase company names)
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
    """Derive entity name from a document number prefix (e.g., GLB-2026-PR-0001 → GreatnessLab)."""
    if not code:
        return None
    prefix = code.split("-")[0] if "-" in code else ""
    return _CODE_PREFIX_TO_ENTITY.get(prefix)


def _entity_from_company(company: Optional[str]) -> Optional[str]:
    """Map company column value to standard entity name."""
    if not company:
        return None
    return _COMPANY_TO_ENTITY.get(company.lower())


# ── Endpoints ─────────────────────────────────────────────────────────────────


def _build_connected_items(entity: Optional[str] = None, search: Optional[str] = None, request_type: Optional[str] = None) -> List[dict]:
    """Pull all approval-worthy items from connected modules and normalize them
    into workflow-approval-shaped records for unified display."""
    items = []

    # Gather existing workflow approval reference_ids to avoid duplicates.
    # Only block re-creation if there's a Pending or Approved record — items
    # that were Returned or Rejected should be eligible to appear again when
    # the source is re-submitted.
    existing_refs = set()
    try:
        existing = supabase.table("workflow_approvals").select("reference_module, reference_id, status").execute().data or []
        for row in existing:
            if row.get("reference_module") and row.get("reference_id"):
                if row.get("status") in ("Pending", "Approved"):
                    existing_refs.add((row["reference_module"], int(row["reference_id"])))
    except Exception:
        pass

    # ── Quotations awaiting approval (status = FOR_APPROVAL) ──────────────────
    if not request_type or request_type in ("", "Quotation Approval"):
        try:
            req = supabase.table("quotations").select(
                "quotation_id, quotation_no, project_name, client_id, status, company, created_at, prepared_by"
            ).eq("status", "FOR_APPROVAL")
            # Filter by company if entity is set
            if entity and entity != "All":
                company_values = _ENTITY_TO_COMPANY.get(entity, [])
                if company_values:
                    if len(company_values) == 1:
                        req = req.eq("company", company_values[0])
                    else:
                        req = req.in_("company", company_values)
            quotation_rows = req.execute().data or []

            # Resolve client names and prepared_by names in batch
            client_ids = list(set(q.get("client_id") for q in quotation_rows if q.get("client_id")))
            emp_ids = list(set(q.get("prepared_by") for q in quotation_rows if q.get("prepared_by")))
            client_map = {}
            emp_map = {}
            if client_ids:
                clients = supabase.table("client_list").select("client_id, company_name").in_("client_id", client_ids).execute().data or []
                client_map = {c["client_id"]: c["company_name"] for c in clients}
            if emp_ids:
                emps = supabase.table("employees").select("employee_id, first_name, last_name").in_("employee_id", emp_ids).execute().data or []
                emp_map = {e["employee_id"]: f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() for e in emps}

            for q in quotation_rows:
                if ("Quotations", q["quotation_id"]) in existing_refs:
                    continue
                q_entity = _entity_from_company(q.get("company"))
                client_name = client_map.get(q.get("client_id"), "Unknown")
                prepared_by_name = emp_map.get(q.get("prepared_by"), None)
                item = {
                    "approval_id": f"QTN-{q['quotation_id']}",
                    "request_type": "Quotation Approval",
                    "entity": q_entity,
                    "reference_module": "Quotations",
                    "reference_id": q["quotation_id"],
                    "reference_number": q.get("quotation_no"),
                    "requestor_name": prepared_by_name,
                    "department": None,
                    "amount": None,
                    "approver_name": None,
                    "status": "Pending",
                    "priority": "Normal",
                    "remarks": f"{q.get('project_name', '')} — {client_name}",
                    "submitted_at": q.get("created_at"),
                    "decided_at": None,
                    "is_connected": True,
                    "source_module": "Quotations",
                    "source_status": "FOR_APPROVAL",
                }
                if search and search.strip():
                    s = search.strip().lower()
                    searchable = f"{item.get('reference_number', '')} {item.get('requestor_name', '')} {item.get('remarks', '')}".lower()
                    if s not in searchable:
                        continue
                items.append(item)
        except Exception:
            pass

    # ── Purchase Requests awaiting approval (status = SUBMITTED) ──────────────
    if not request_type or request_type in ("", "Purchase Request Approval"):
        try:
            req = supabase.table("purchase_requests").select(
                "purchase_request_id, pr_number, requested_by_employee_id, status, created_at"
            ).eq("status", "SUBMITTED")
            pr_rows = req.execute().data or []

            # Resolve employee names
            pr_emp_ids = list(set(r.get("requested_by_employee_id") for r in pr_rows if r.get("requested_by_employee_id")))
            pr_emp_map = {}
            if pr_emp_ids:
                emps = supabase.table("employees").select("employee_id, first_name, last_name").in_("employee_id", pr_emp_ids).execute().data or []
                pr_emp_map = {e["employee_id"]: f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() for e in emps}

            for pr in pr_rows:
                if ("Purchasing", pr["purchase_request_id"]) in existing_refs:
                    continue
                # Derive entity from PR number prefix
                pr_entity = _entity_from_code(pr.get("pr_number"))
                if entity and entity != "All" and pr_entity and pr_entity != entity:
                    continue
                requestor = pr_emp_map.get(pr.get("requested_by_employee_id"))
                item = {
                    "approval_id": f"PR-{pr['purchase_request_id']}",
                    "request_type": "Purchase Request Approval",
                    "entity": pr_entity,
                    "reference_module": "Purchasing",
                    "reference_id": pr["purchase_request_id"],
                    "reference_number": pr.get("pr_number"),
                    "requestor_name": requestor,
                    "department": None,
                    "amount": None,
                    "approver_name": None,
                    "status": "Pending",
                    "priority": "Normal",
                    "remarks": f"Purchase request by {requestor or 'Unknown'}",
                    "submitted_at": pr.get("created_at"),
                    "decided_at": None,
                    "is_connected": True,
                    "source_module": "Purchasing",
                    "source_status": "SUBMITTED",
                }
                if search and search.strip():
                    s = search.strip().lower()
                    searchable = f"{item.get('reference_number', '')} {item.get('requestor_name', '')} {item.get('remarks', '')}".lower()
                    if s not in searchable:
                        continue
                items.append(item)
        except Exception:
            pass

    # ── Purchase Orders awaiting approval (status = SUBMITTED) ────────────────
    if not request_type or request_type in ("", "Purchase Order Approval"):
        try:
            req = supabase.table("purchase_orders").select(
                "purchase_order_id, po_number, supplier_id, status, created_at"
            ).eq("status", "SUBMITTED")
            po_rows = req.execute().data or []

            # Resolve supplier names
            sup_ids = list(set(p.get("supplier_id") for p in po_rows if p.get("supplier_id")))
            sup_map = {}
            if sup_ids:
                sups = supabase.table("supplier_list").select("supplier_id, company_name").in_("supplier_id", sup_ids).execute().data or []
                sup_map = {s["supplier_id"]: s["company_name"] for s in sups}

            for po in po_rows:
                if ("Purchasing", po["purchase_order_id"]) in existing_refs:
                    continue
                po_entity = _entity_from_code(po.get("po_number"))
                if entity and entity != "All" and po_entity and po_entity != entity:
                    continue
                supplier_name = sup_map.get(po.get("supplier_id"), "Unknown")
                item = {
                    "approval_id": f"PO-{po['purchase_order_id']}",
                    "request_type": "Purchase Order Approval",
                    "entity": po_entity,
                    "reference_module": "Purchasing",
                    "reference_id": po["purchase_order_id"],
                    "reference_number": po.get("po_number"),
                    "requestor_name": supplier_name,
                    "department": None,
                    "amount": None,
                    "approver_name": None,
                    "status": "Pending",
                    "priority": "Normal",
                    "remarks": f"PO to {supplier_name}",
                    "submitted_at": po.get("created_at"),
                    "decided_at": None,
                    "is_connected": True,
                    "source_module": "Purchasing",
                    "source_status": "SUBMITTED",
                }
                if search and search.strip():
                    s = search.strip().lower()
                    searchable = f"{item.get('reference_number', '')} {item.get('requestor_name', '')} {item.get('remarks', '')}".lower()
                    if s not in searchable:
                        continue
                items.append(item)
        except Exception:
            pass

    # ── Payment Vouchers awaiting approval (status = FOR_APPROVAL) ────────────
    if not request_type or request_type in ("", "Payment Voucher Approval"):
        try:
            req = supabase.table("ap_payment_vouchers").select(
                "voucher_id, voucher_number, supplier_id, status, created_at"
            ).eq("status", "FOR_APPROVAL").eq("record_status", "ACTIVE")
            pv_rows = req.execute().data or []

            # Resolve supplier names
            pv_sup_ids = list(set(p.get("supplier_id") for p in pv_rows if p.get("supplier_id")))
            pv_sup_map = {}
            if pv_sup_ids:
                sups = supabase.table("supplier_list").select("supplier_id, company_name").in_("supplier_id", pv_sup_ids).execute().data or []
                pv_sup_map = {s["supplier_id"]: s["company_name"] for s in sups}

            for pv in pv_rows:
                if ("Accounts Payable", pv["voucher_id"]) in existing_refs:
                    continue
                pv_entity = _entity_from_code(pv.get("voucher_number"))
                if entity and entity != "All" and pv_entity and pv_entity != entity:
                    continue
                supplier_name = pv_sup_map.get(pv.get("supplier_id"), "Unknown")
                item = {
                    "approval_id": f"PV-{pv['voucher_id']}",
                    "request_type": "Payment Voucher Approval",
                    "entity": pv_entity,
                    "reference_module": "Accounts Payable",
                    "reference_id": pv["voucher_id"],
                    "reference_number": pv.get("voucher_number"),
                    "requestor_name": supplier_name,
                    "department": None,
                    "amount": None,
                    "approver_name": None,
                    "status": "Pending",
                    "priority": "Normal",
                    "remarks": f"Payment to {supplier_name}",
                    "submitted_at": pv.get("created_at"),
                    "decided_at": None,
                    "is_connected": True,
                    "source_module": "Accounts Payable",
                    "source_status": "FOR_APPROVAL",
                }
                if search and search.strip():
                    s = search.strip().lower()
                    searchable = f"{item.get('reference_number', '')} {item.get('requestor_name', '')} {item.get('remarks', '')}".lower()
                    if s not in searchable:
                        continue
                items.append(item)
        except Exception:
            pass

    # ── Payroll Runs awaiting approval (status = FOR_REVIEW) ──────────────────
    if not request_type or request_type in ("", "Payroll Approval"):
        try:
            req = supabase.table("payroll_runs").select(
                "run_id, period_start, period_end, pay_date, total_gross, total_net, status, created_at, generated_by"
            ).eq("status", "FOR_REVIEW")
            # payroll_runs has no entity column — show all if entity filter is set
            for pr in (req.execute().data or []):
                if ("Payroll", pr["run_id"]) in existing_refs:
                    continue
                period = f"{pr.get('period_start', '')} to {pr.get('period_end', '')}"
                item = {
                    "approval_id": f"PAY-{pr['run_id']}",
                    "request_type": "Payroll Approval",
                    "entity": None,
                    "reference_module": "Payroll",
                    "reference_id": pr["run_id"],
                    "reference_number": f"PAYROLL-{pr['run_id']}",
                    "requestor_name": pr.get("generated_by"),
                    "department": None,
                    "amount": pr.get("total_net"),
                    "approver_name": None,
                    "status": "Pending",
                    "priority": "Normal",
                    "remarks": f"Payroll run for {period}",
                    "submitted_at": pr.get("created_at"),
                    "decided_at": None,
                    "is_connected": True,
                    "source_module": "Payroll",
                    "source_status": "FOR_REVIEW",
                }
                if search and search.strip():
                    s = search.strip().lower()
                    searchable = f"{item.get('reference_number', '')} {item.get('requestor_name', '')} {item.get('remarks', '')}".lower()
                    if s not in searchable:
                        continue
                items.append(item)
        except Exception:
            pass

    # ── Leave Requests pending (status = Pending) ─────────────────────────────
    if not request_type or request_type in ("", "Leave Approval"):
        try:
            req = supabase.table("leave_requests").select(
                "id, employee_id, leave_type, number_of_days, start_date, end_date, reason, status, entity, filed_date"
            ).eq("status", "Pending")
            if entity and entity != "All":
                req = req.eq("entity", entity)
            for lr in (req.execute().data or []):
                if ("HR Management", lr["id"]) in existing_refs:
                    continue
                # Resolve employee name
                emp_name = None
                try:
                    emp = supabase.table("employees").select("first_name, last_name").eq("employee_id", lr["employee_id"]).limit(1).execute()
                    if emp.data:
                        emp_name = f"{emp.data[0].get('first_name', '')} {emp.data[0].get('last_name', '')}".strip()
                except Exception:
                    pass
                item = {
                    "approval_id": f"LV-{lr['id']}",
                    "request_type": "Leave Approval",
                    "entity": lr.get("entity"),
                    "reference_module": "HR Management",
                    "reference_id": lr["id"],
                    "reference_number": f"LEAVE-{lr['id']}",
                    "requestor_name": emp_name,
                    "department": None,
                    "amount": None,
                    "approver_name": None,
                    "status": "Pending",
                    "priority": "Normal",
                    "remarks": f"{lr.get('leave_type', '')} leave — {lr.get('number_of_days', 0)} day(s). {lr.get('reason') or ''}".strip(),
                    "submitted_at": lr.get("filed_date"),
                    "decided_at": None,
                    "is_connected": True,
                    "source_module": "HR Management",
                    "source_status": "Pending",
                }
                if search and search.strip():
                    s = search.strip().lower()
                    searchable = f"{item.get('reference_number', '')} {item.get('requestor_name', '')} {item.get('remarks', '')}".lower()
                    if s not in searchable:
                        continue
                items.append(item)
        except Exception:
            pass

    # ── Contracts/Projects pending approval (status = PLANNING, has contract) ─
    if not request_type or request_type in ("", "Contract Approval"):
        try:
            req = supabase.table("projects").select(
                "project_id, project_code, project_name, contract_value, status, entity, created_at"
            ).eq("status", "PLANNING").eq("record_status", "ACTIVE").gt("contract_value", 0)
            if entity and entity != "All":
                req = req.eq("entity", entity)
            for proj in (req.execute().data or []):
                if ("Projects", proj["project_id"]) in existing_refs:
                    continue
                item = {
                    "approval_id": f"CTR-{proj['project_id']}",
                    "request_type": "Contract Approval",
                    "entity": proj.get("entity"),
                    "reference_module": "Projects",
                    "reference_id": proj["project_id"],
                    "reference_number": proj.get("project_code"),
                    "requestor_name": None,
                    "department": None,
                    "amount": proj.get("contract_value"),
                    "approver_name": None,
                    "status": "Pending",
                    "priority": "Normal",
                    "remarks": f"Contract for {proj.get('project_name', 'Unknown')}",
                    "submitted_at": proj.get("created_at"),
                    "decided_at": None,
                    "is_connected": True,
                    "source_module": "Projects",
                    "source_status": "PLANNING",
                }
                if search and search.strip():
                    s = search.strip().lower()
                    searchable = f"{item.get('reference_number', '')} {item.get('requestor_name', '')} {item.get('remarks', '')}".lower()
                    if s not in searchable:
                        continue
                items.append(item)
        except Exception:
            pass

    return items


def pending_approval_queue(entity: Optional[str] = None) -> List[dict]:
    """Return the same pending approval queue shown by the Workflow board.

    Pending work can be either a formal ``workflow_approvals`` record or a
    live item inferred from a connected module (for example a quotation that
    is ``FOR_APPROVAL`` or a planning project awaiting contract approval).
    """
    req = supabase.table("workflow_approvals").select("*").eq("status", "Pending")
    if entity and entity != "All":
        req = req.eq("entity", entity)

    formal_items = req.execute().data or []
    for item in formal_items:
        item["is_connected"] = False

    return _build_connected_items(entity=entity) + formal_items


@router.get("")
def list_approvals(
    search: Optional[str] = Query(None),
    request_type: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    entity: Optional[str] = Query(None),
    approver_id: Optional[int] = Query(None),
    reference_module: Optional[str] = Query(None),
    reference_id: Optional[int] = Query(None),
):
    """List all approval requests — merges workflow_approvals records with
    live connected data from other modules (quotations, POs, leaves, etc.).
    """
    # 1. Get records from workflow_approvals table
    req = supabase.table("workflow_approvals").select("*").order("approval_id", desc=True)
    if request_type and request_type != "All":
        req = req.eq("request_type", request_type)
    if status_filter and status_filter != "All":
        req = req.eq("status", status_filter)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if approver_id:
        req = req.eq("approver_employee_id", approver_id)
    if reference_module:
        req = req.eq("reference_module", reference_module)
    if reference_id:
        req = req.eq("reference_id", reference_id)
    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"reference_number.ilike.%{s}%,"
            f"requestor_name.ilike.%{s}%,"
            f"approver_name.ilike.%{s}%,"
            f"department.ilike.%{s}%,"
            f"remarks.ilike.%{s}%"
        )
    db_rows = req.execute().data or []

    # If filtering by specific reference, return immediately (no connected data needed)
    if reference_module and reference_id:
        return db_rows

    # Mark DB rows so frontend knows these are formal approvals
    for row in db_rows:
        row["is_connected"] = False

    # 2. Merge connected pending items (only when viewing Pending or All statuses)
    if not status_filter or status_filter in ("", "Pending"):
        connected = _build_connected_items(entity=entity, search=search, request_type=request_type)

        # If an item has been re-submitted (appears in connected as Pending),
        # hide stale Returned/Rejected records for the same reference from db_rows
        # so the user doesn't see duplicates.
        connected_refs = set()
        for c in connected:
            ref_mod = c.get("reference_module") or c.get("source_module")
            ref_id = c.get("reference_id")
            if ref_mod and ref_id:
                connected_refs.add((ref_mod, int(ref_id)))

        if connected_refs:
            db_rows = [
                row for row in db_rows
                if not (
                    row.get("status") in ("Returned", "Rejected")
                    and row.get("reference_module")
                    and row.get("reference_id")
                    and (row["reference_module"], int(row["reference_id"])) in connected_refs
                )
            ]

        # Connected items go at the top so they're visible immediately
        return connected + db_rows

    # 3. For Returned/Rejected filters, also hide stale records if the item was re-submitted
    if status_filter in ("Returned", "Rejected"):
        # Check which items have been re-submitted (back in pending state in source)
        resubmitted = _build_connected_items(entity=entity, search=None, request_type=None)
        resubmitted_refs = set()
        for c in resubmitted:
            ref_mod = c.get("reference_module") or c.get("source_module")
            ref_id = c.get("reference_id")
            if ref_mod and ref_id:
                resubmitted_refs.add((ref_mod, int(ref_id)))
        if resubmitted_refs:
            db_rows = [
                row for row in db_rows
                if not (
                    row.get("reference_module")
                    and row.get("reference_id")
                    and (row["reference_module"], int(row["reference_id"])) in resubmitted_refs
                )
            ]

    return db_rows


@router.get("/metrics")
def approval_metrics(entity: Optional[str] = Query(None)):
    """Metrics including both formal workflow approvals and connected pending items."""
    req = supabase.table("workflow_approvals").select("approval_id, status, amount, submitted_at")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    rows = req.execute().data or []

    # Count connected items as pending
    connected = _build_connected_items(entity=entity)
    connected_count = len(connected)
    connected_amount = round(sum(float(c.get("amount") or 0) for c in connected), 2)

    total = len(rows) + connected_count
    pending = sum(1 for r in rows if r.get("status") == "Pending") + connected_count
    approved = sum(1 for r in rows if r.get("status") == "Approved")
    rejected = sum(1 for r in rows if r.get("status") == "Rejected")
    pending_amount = round(sum(float(r.get("amount") or 0) for r in rows if r.get("status") == "Pending"), 2) + connected_amount
    return {
        "total_requests": total,
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "pending_amount": pending_amount,
    }


@router.get("/my-approvals")
def my_approvals(request: Request):
    """Get approvals assigned to the current user."""
    employee_id, _ = _extract_jwt_claims(request)
    if not employee_id:
        return []
    return (
        supabase.table("workflow_approvals")
        .select("*")
        .eq("approver_employee_id", employee_id)
        .eq("status", "Pending")
        .order("submitted_at", desc=True)
        .execute()
    ).data or []


@router.get("/connected/pending")
def connected_pending(entity: Optional[str] = Query(None)):
    """Pull pending items from connected modules — delegates to the shared helper."""
    return _build_connected_items(entity=entity)


@router.get("/export")
def export_approvals(
    request_type: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    entity: Optional[str] = Query(None),
):
    rows = list_approvals(search=None, request_type=request_type, status_filter=status_filter, entity=entity, approver_id=None)
    fields = [
        "approval_id", "request_type", "entity", "reference_module", "reference_number",
        "requestor_name", "department", "amount", "approver_name", "status",
        "priority", "remarks", "submitted_at", "decided_at",
    ]
    output = StringIO()
    writer = DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="workflow_approvals.csv"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


@router.get("/{approval_id}")
def get_approval(approval_id: int):
    res = supabase.table("workflow_approvals").select("*").eq("approval_id", approval_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Approval not found."})
    return _decorate(res.data[0])


@router.post("", status_code=status.HTTP_201_CREATED)
def submit_approval(request: Request, payload: ApprovalSubmit):
    """Submit a new approval request."""
    _, performed_by = _extract_jwt_claims(request)
    req_eid, req_name, dept = _requestor_from_email(performed_by)
    approver_name = _employee_name(payload.approver_employee_id)

    data = {
        "request_type": payload.request_type,
        "entity": payload.entity,
        "reference_module": payload.reference_module,
        "reference_id": payload.reference_id,
        "reference_number": payload.reference_number,
        "requestor_employee_id": req_eid,
        "requestor_name": req_name or performed_by,
        "department": payload.department or dept,
        "amount": payload.amount,
        "approver_employee_id": payload.approver_employee_id,
        "approver_name": approver_name,
        "status": "Pending",
        "priority": payload.priority,
        "remarks": payload.remarks,
    }
    res = supabase.table("workflow_approvals").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to submit approval."})
    approval = res.data[0]

    # Record submit action in history
    supabase.table("workflow_approval_comments").insert({
        "approval_id": approval["approval_id"],
        "action": "Submitted",
        "comment": payload.remarks,
        "performed_by_employee_id": req_eid,
        "performed_by_name": req_name or performed_by,
    }).execute()

    write_audit_log(
        action="CREATE", module_name=MODULE_NAME,
        description=f"Submitted {payload.request_type} — {payload.reference_number or 'no ref'}",
        performed_by=performed_by, employee_id=req_eid,
        record_id=approval["approval_id"],
        ip_address=request.client.host if request.client else None, request=request,
    )
    return _decorate(approval)


# ── Connected Item Actions ────────────────────────────────────────────────────
# These endpoints handle approve/reject/return on items that live in their
# source modules (not yet in workflow_approvals table). They:
# 1. Update the source module's status
# 2. Create a workflow_approval record as an audit trail


class ConnectedActionPayload(BaseModel):
    reference_module: str
    reference_id: int
    request_type: str
    reference_number: Optional[str] = None
    entity: Optional[str] = None
    amount: Optional[float] = None
    requestor_name: Optional[str] = None
    department: Optional[str] = None
    remarks: Optional[str] = None
    comment: Optional[str] = None


# Status mappings: what status the source module record should transition to
_SOURCE_APPROVE_STATUS = {
    "Quotations": "APPROVED",
    "Purchasing": "APPROVED",
    "Accounts Payable": "APPROVED",
    "Payroll": "APPROVED",
    "HR Management": "Approved",
    "Projects": "IN_PROGRESS",
}

_SOURCE_REJECT_STATUS = {
    "Quotations": "REJECTED",
    "Purchasing": "REJECTED",
    "Accounts Payable": "REJECTED",
    "Payroll": "DRAFT",
    "HR Management": "Rejected",
    "Projects": "PLANNING",
}


def _update_source_status(
    reference_module: str,
    reference_id: int,
    new_status: str,
    performed_by: str,
    request: Optional[Request] = None,
) -> bool:
    """Update the source record's status in its origin table."""
    try:
        now = datetime.now().isoformat()
        if reference_module == "Quotations":
            supabase.table("quotations").update({"status": new_status, "updated_at": now}).eq("quotation_id", reference_id).execute()
            if new_status == "APPROVED":
                emp = supabase.table("employees").select("employee_id").eq("email", performed_by).limit(1).execute()
                if emp.data:
                    supabase.table("quotations").update({"approved_by": emp.data[0]["employee_id"], "approved_at": now}).eq("quotation_id", reference_id).execute()
        elif reference_module == "Purchasing":
            # Check if it's a PO or PR
            po = supabase.table("purchase_orders").select("purchase_order_id").eq("purchase_order_id", reference_id).execute()
            if po.data:
                supabase.table("purchase_orders").update({"status": new_status, "updated_at": now}).eq("purchase_order_id", reference_id).execute()
                if new_status == "APPROVED":
                    emp_id = None
                    emp = supabase.table("employees").select("employee_id").eq("email", performed_by).limit(1).execute()
                    if emp.data:
                        emp_id = emp.data[0]["employee_id"]
                    supabase.table("purchase_orders").update({"approved_by_employee_id": emp_id, "approved_at": now}).eq("purchase_order_id", reference_id).execute()
                    supabase.table("purchase_order_approvals").insert({"purchase_order_id": reference_id, "approver_employee_id": emp_id, "decision": "APPROVED", "decision_date": now}).execute()
            else:
                supabase.table("purchase_requests").update({"status": new_status, "updated_at": now}).eq("purchase_request_id", reference_id).execute()
        elif reference_module == "Accounts Payable":
            updates = {"status": new_status, "updated_at": now}
            if new_status == "APPROVED":
                emp = supabase.table("employees").select("employee_id").eq("email", performed_by).limit(1).execute()
                if emp.data:
                    updates["approver_employee_id"] = emp.data[0]["employee_id"]
                updates["approved_at"] = now
            supabase.table("ap_payment_vouchers").update(updates).eq("voucher_id", reference_id).execute()
        elif reference_module == "Payroll":
            updates = {"status": new_status}
            if new_status == "APPROVED":
                updates["approved_by"] = performed_by
                updates["approved_at"] = now
            supabase.table("payroll_runs").update(updates).eq("run_id", reference_id).execute()
        elif reference_module == "HR Management":
            supabase.table("leave_requests").update({"status": new_status}).eq("id", reference_id).execute()
        elif reference_module == "Projects":
            supabase.table("projects").update({"status": new_status, "updated_at": now}).eq("project_id", reference_id).execute()
        elif reference_module == "Tax Management":
            # BIR form approval: APPROVED → APPROVED (ready to file), REJECTED → DRAFT
            if new_status == "APPROVED":
                supabase.table("bir_forms").update({
                    "status": "APPROVED",
                    "finalized_at": now,
                    "updated_at": now,
                }).eq("form_record_id", reference_id).execute()
                supabase.table("bir_form_history").insert({
                    "form_record_id": reference_id,
                    "action": "APPROVED",
                    "details": f"Approved by {performed_by} — ready for filing with BIR",
                    "performed_by": performed_by,
                }).execute()
            elif new_status == "REJECTED":
                supabase.table("bir_forms").update({
                    "status": "DRAFT",
                    "updated_at": now,
                }).eq("form_record_id", reference_id).execute()
                supabase.table("bir_form_history").insert({
                    "form_record_id": reference_id,
                    "action": "REJECTED",
                    "details": f"Rejected by {performed_by}, returned to DRAFT",
                    "performed_by": performed_by,
                }).execute()
        elif reference_module == "Sales":
            # A sale is Closed Won only after all downstream records, including
            # its draft AR invoice, have been created successfully.
            if new_status == "APPROVED":
                opp = supabase.table("opportunities").select("stage").eq("opportunity_id", reference_id).limit(1).execute()
                if opp.data and opp.data[0].get("stage") != "Closed Won":
                    from routers.quotations import run_closed_won_automation

                    try:
                        run_closed_won_automation(reference_id, performed_by, request, allow_shortages=True)
                    except HTTPException:
                        raise
                    except Exception as auto_err:
                        import logging
                        logging.getLogger("workflow").error(f"Closed Won automation failed for opportunity {reference_id}: {auto_err}", exc_info=True)
                        raise HTTPException(status_code=500, detail=f"Deal closure automation failed: {str(auto_err)}")
                    supabase.table("opportunities").update({
                        "stage": "Closed Won",
                        "closed_at": now,
                    }).eq("opportunity_id", reference_id).execute()
            elif new_status == "REJECTED":
                # Move back from Approval to Negotiation
                opp = supabase.table("opportunities").select("stage").eq("opportunity_id", reference_id).limit(1).execute()
                if opp.data and opp.data[0].get("stage") == "Approval":
                    supabase.table("opportunities").update({"stage": "Negotiation"}).eq("opportunity_id", reference_id).execute()
        return True
    except Exception:
        return False


@router.post("/connected/approve")
def approve_connected(request: Request, payload: ConnectedActionPayload):
    """Approve a connected item: updates source module + creates approval record."""
    _, performed_by = _extract_jwt_claims(request)
    actor_eid, actor_name, _ = _requestor_from_email(performed_by)

    target_status = _SOURCE_APPROVE_STATUS.get(payload.reference_module)
    if not target_status:
        raise HTTPException(status_code=400, detail={"error": f"Unknown module: {payload.reference_module}"})

    # Update source module
    success = _update_source_status(
        payload.reference_module,
        payload.reference_id,
        target_status,
        performed_by,
        request,
    )
    if not success:
        raise HTTPException(status_code=500, detail={"error": "Failed to update source record."})

    # Remove any prior Returned/Rejected records for the same reference to avoid conflicts
    if payload.reference_module and payload.reference_id:
        supabase.table("workflow_approvals").delete().eq(
            "reference_module", payload.reference_module
        ).eq(
            "reference_id", payload.reference_id
        ).in_(
            "status", ["Returned", "Rejected"]
        ).execute()

    # Create workflow approval record as audit trail
    now = datetime.now().isoformat()
    data = {
        "request_type": payload.request_type,
        "entity": payload.entity,
        "reference_module": payload.reference_module,
        "reference_id": payload.reference_id,
        "reference_number": payload.reference_number,
        "requestor_employee_id": None,
        "requestor_name": payload.requestor_name,
        "department": payload.department,
        "amount": payload.amount,
        "approver_employee_id": actor_eid,
        "approver_name": actor_name or performed_by,
        "status": "Approved",
        "priority": "Normal",
        "remarks": payload.remarks,
        "decided_at": now,
    }
    res = supabase.table("workflow_approvals").insert(data).execute()
    approval_id = res.data[0]["approval_id"] if res.data else None

    if approval_id:
        supabase.table("workflow_approval_comments").insert({
            "approval_id": approval_id,
            "action": "Approved",
            "comment": payload.comment,
            "performed_by_employee_id": actor_eid,
            "performed_by_name": actor_name or performed_by,
        }).execute()

    write_audit_log(
        action="APPROVE", module_name=MODULE_NAME,
        description=f"Approved {payload.request_type} — {payload.reference_number or 'no ref'} (from {payload.reference_module})",
        performed_by=performed_by, record_id=approval_id,
        ip_address=request.client.host if request.client else None, request=request,
    )
    return {"status": "Approved", "approval_id": approval_id}


@router.post("/connected/reject")
def reject_connected(request: Request, payload: ConnectedActionPayload):
    """Reject a connected item: updates source module + creates rejection record."""
    _, performed_by = _extract_jwt_claims(request)
    actor_eid, actor_name, _ = _requestor_from_email(performed_by)

    target_status = _SOURCE_REJECT_STATUS.get(payload.reference_module)
    if not target_status:
        raise HTTPException(status_code=400, detail={"error": f"Unknown module: {payload.reference_module}"})

    success = _update_source_status(payload.reference_module, payload.reference_id, target_status, performed_by)
    if not success:
        raise HTTPException(status_code=500, detail={"error": "Failed to update source record."})

    # Remove any prior Returned/Rejected records for the same reference to avoid duplicates
    if payload.reference_module and payload.reference_id:
        supabase.table("workflow_approvals").delete().eq(
            "reference_module", payload.reference_module
        ).eq(
            "reference_id", payload.reference_id
        ).in_(
            "status", ["Returned", "Rejected"]
        ).execute()

    now = datetime.now().isoformat()
    data = {
        "request_type": payload.request_type,
        "entity": payload.entity,
        "reference_module": payload.reference_module,
        "reference_id": payload.reference_id,
        "reference_number": payload.reference_number,
        "requestor_employee_id": None,
        "requestor_name": payload.requestor_name,
        "department": payload.department,
        "amount": payload.amount,
        "approver_employee_id": actor_eid,
        "approver_name": actor_name or performed_by,
        "status": "Rejected",
        "priority": "Normal",
        "remarks": payload.remarks,
        "decided_at": now,
    }
    res = supabase.table("workflow_approvals").insert(data).execute()
    approval_id = res.data[0]["approval_id"] if res.data else None

    if approval_id:
        supabase.table("workflow_approval_comments").insert({
            "approval_id": approval_id,
            "action": "Rejected",
            "comment": payload.comment,
            "performed_by_employee_id": actor_eid,
            "performed_by_name": actor_name or performed_by,
        }).execute()

    write_audit_log(
        action="REJECT", module_name=MODULE_NAME,
        description=f"Rejected {payload.request_type} — {payload.reference_number or 'no ref'} (from {payload.reference_module})",
        performed_by=performed_by, record_id=approval_id,
        ip_address=request.client.host if request.client else None, request=request,
    )
    return {"status": "Rejected", "approval_id": approval_id}


@router.post("/connected/return")
def return_connected(request: Request, payload: ConnectedActionPayload):
    """Return a connected item for revision: resets source to draft status."""
    _, performed_by = _extract_jwt_claims(request)
    actor_eid, actor_name, _ = _requestor_from_email(performed_by)

    # Return sends back to draft-like status
    _RETURN_STATUS = {
        "Quotations": "DRAFT",
        "Purchasing": "DRAFT",
        "Accounts Payable": "DRAFT",
        "Payroll": "DRAFT",
        "HR Management": "Pending",
        "Projects": "PLANNING",
    }
    target_status = _RETURN_STATUS.get(payload.reference_module)
    if not target_status:
        raise HTTPException(status_code=400, detail={"error": f"Unknown module: {payload.reference_module}"})

    success = _update_source_status(payload.reference_module, payload.reference_id, target_status, performed_by)
    if not success:
        raise HTTPException(status_code=500, detail={"error": "Failed to update source record."})

    # Remove any prior Returned/Rejected records for the same reference to avoid duplicates
    if payload.reference_module and payload.reference_id:
        supabase.table("workflow_approvals").delete().eq(
            "reference_module", payload.reference_module
        ).eq(
            "reference_id", payload.reference_id
        ).in_(
            "status", ["Returned", "Rejected"]
        ).execute()

    now = datetime.now().isoformat()
    data = {
        "request_type": payload.request_type,
        "entity": payload.entity,
        "reference_module": payload.reference_module,
        "reference_id": payload.reference_id,
        "reference_number": payload.reference_number,
        "requestor_employee_id": None,
        "requestor_name": payload.requestor_name,
        "department": payload.department,
        "amount": payload.amount,
        "approver_employee_id": actor_eid,
        "approver_name": actor_name or performed_by,
        "status": "Returned",
        "priority": "Normal",
        "remarks": payload.remarks,
        "decided_at": now,
    }
    res = supabase.table("workflow_approvals").insert(data).execute()
    approval_id = res.data[0]["approval_id"] if res.data else None

    if approval_id:
        supabase.table("workflow_approval_comments").insert({
            "approval_id": approval_id,
            "action": "Returned",
            "comment": payload.comment or "Returned for revision",
            "performed_by_employee_id": actor_eid,
            "performed_by_name": actor_name or performed_by,
        }).execute()

    write_audit_log(
        action="RETURN", module_name=MODULE_NAME,
        description=f"Returned {payload.request_type} — {payload.reference_number or 'no ref'} (from {payload.reference_module})",
        performed_by=performed_by, record_id=approval_id,
        ip_address=request.client.host if request.client else None, request=request,
    )
    return {"status": "Returned", "approval_id": approval_id}


@router.post("/{approval_id}/approve")
def approve(approval_id: int, request: Request, payload: ApprovalAction):
    _, performed_by = _extract_jwt_claims(request)
    return _decide(approval_id, "Approved", performed_by, payload.comment, request)


@router.post("/{approval_id}/reject")
def reject(approval_id: int, request: Request, payload: ApprovalAction):
    _, performed_by = _extract_jwt_claims(request)
    return _decide(approval_id, "Rejected", performed_by, payload.comment, request)


@router.post("/{approval_id}/return")
def return_for_revision(approval_id: int, request: Request, payload: ApprovalAction):
    _, performed_by = _extract_jwt_claims(request)
    return _decide(approval_id, "Returned", performed_by, payload.comment, request)


@router.post("/{approval_id}/cancel")
def cancel_approval(approval_id: int, request: Request, payload: ApprovalAction):
    _, performed_by = _extract_jwt_claims(request)
    return _decide(approval_id, "Cancelled", performed_by, payload.comment, request)


def _decide(approval_id: int, new_status: str, performed_by: str, comment: str, request: Request) -> dict:
    """Shared logic for approve/reject/return/cancel."""
    res = supabase.table("workflow_approvals").select("*").eq("approval_id", approval_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Approval not found."})
    approval = res.data[0]
    if approval["status"] not in ("Pending", "Returned", "Escalated"):
        raise HTTPException(status_code=400, detail={"error": f"Cannot {new_status.lower()} a request that is already {approval['status']}."})

    # Sales automation must succeed before recording the approval. Otherwise the
    # opportunity remains in Approval and the approver can address the failure.
    if (
        new_status == "Approved"
        and approval.get("reference_module") == "Sales"
        and approval.get("reference_id")
    ):
        source_updated = _update_source_status(
            approval["reference_module"],
            approval["reference_id"],
            "APPROVED",
            performed_by,
            request,
        )
        if not source_updated:
            raise HTTPException(
                status_code=500,
                detail={"error": "Failed to complete Closed Won automation."},
            )

    now = datetime.now().isoformat()
    update_data = {"status": new_status, "decided_at": now}
    supabase.table("workflow_approvals").update(update_data).eq("approval_id", approval_id).execute()

    # Resolve actor
    actor_eid, actor_name, _ = _requestor_from_email(performed_by)

    supabase.table("workflow_approval_comments").insert({
        "approval_id": approval_id,
        "action": new_status,
        "comment": comment,
        "performed_by_employee_id": actor_eid,
        "performed_by_name": actor_name or performed_by,
    }).execute()

    # Sync status back to the source module record. Sales was synchronized above
    # so its workflow approval cannot be recorded before automation succeeds.
    if (
        new_status == "Approved"
        and approval.get("reference_module")
        and approval.get("reference_id")
        and approval.get("reference_module") != "Sales"
    ):
        _update_source_status(
            approval["reference_module"],
            approval["reference_id"],
            "APPROVED",
            performed_by,
            request,
        )
    elif new_status == "Rejected" and approval.get("reference_module") and approval.get("reference_id"):
        _update_source_status(
            approval["reference_module"],
            approval["reference_id"],
            "REJECTED",
            performed_by,
            request,
        )

    write_audit_log(
        action="UPDATE", module_name=MODULE_NAME,
        description=f"{new_status} approval #{approval_id} ({approval.get('request_type')})",
        performed_by=performed_by, record_id=approval_id,
        ip_address=request.client.host if request.client else None, request=request,
    )
    return get_approval(approval_id)


@router.post("/{approval_id}/escalate")
def escalate(approval_id: int, request: Request, payload: EscalatePayload):
    """Reassign the approval to a higher-level approver."""
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("workflow_approvals").select("*").eq("approval_id", approval_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Approval not found."})
    approval = res.data[0]
    if approval["status"] not in ("Pending", "Returned"):
        raise HTTPException(status_code=400, detail={"error": f"Cannot escalate a request that is {approval['status']}."})

    new_approver_name = _employee_name(payload.new_approver_employee_id)
    now = datetime.now().isoformat()

    supabase.table("workflow_approvals").update({
        "status": "Escalated",
        "approver_employee_id": payload.new_approver_employee_id,
        "approver_name": new_approver_name,
    }).eq("approval_id", approval_id).execute()

    actor_eid, actor_name, _ = _requestor_from_email(performed_by)
    supabase.table("workflow_approval_comments").insert({
        "approval_id": approval_id,
        "action": "Escalated",
        "comment": payload.comment or f"Escalated to {new_approver_name}",
        "performed_by_employee_id": actor_eid,
        "performed_by_name": actor_name or performed_by,
    }).execute()

    write_audit_log(
        action="UPDATE", module_name=MODULE_NAME,
        description=f"Escalated approval #{approval_id} to {new_approver_name}",
        performed_by=performed_by, record_id=approval_id,
        ip_address=request.client.host if request.client else None, request=request,
    )
    return get_approval(approval_id)


@router.post("/{approval_id}/comment")
def add_comment(approval_id: int, request: Request, payload: ApprovalAction):
    """Add a comment without changing the status."""
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("workflow_approvals").select("approval_id").eq("approval_id", approval_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Approval not found."})
    if not payload.comment:
        raise HTTPException(status_code=422, detail={"error": "Comment is required."})

    actor_eid, actor_name, _ = _requestor_from_email(performed_by)
    supabase.table("workflow_approval_comments").insert({
        "approval_id": approval_id,
        "action": "Comment",
        "comment": payload.comment,
        "performed_by_employee_id": actor_eid,
        "performed_by_name": actor_name or performed_by,
    }).execute()
    return get_approval(approval_id)

