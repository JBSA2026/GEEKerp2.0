"""Document Management router (Module 15).

Central repository for company documents. Provides:
  * Upload (creates a document register entry + version 1 file)
  * View / list with search + filters + metrics
  * Edit metadata
  * Version control (upload new versions, list version history)
  * Archive / restore
  * Download (short-lived signed URL)
  * Link to transaction (related_module / related_transaction fields)
"""
import time
from datetime import datetime
from io import StringIO
from csv import DictWriter
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims

router = APIRouter(prefix="/document-management", tags=["Document Management"])

MODULE_NAME = "Document Management"
BUCKET = "company-documents"

# ── Domain constants ──────────────────────────────────────────────────────────

DOCUMENT_TYPES = {
    "Quotations", "Contracts", "POs", "Invoices", "ORs",
    "Tax Documents", "HR Files", "NDA", "Project Documents",
}

STATUSES = {"Draft", "Active", "Archived"}

# GEEK Group companies a document can belong to (matches the HR module).
ENTITIES = {"Expedia", "GreatnessLab", "Exigent", "KSI"}

# Modules a document may be linked to (free-form on the DB, validated here for consistency).
RELATED_MODULES = {
    "CRM / Sales", "Quotation", "Purchasing", "Inventory", "Projects",
    "HR Management", "Accounts Receivable", "Accounts Payable",
    "General Ledger", "Tax Management", "Administration", "Other",
}

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
}

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB
SIGNED_URL_TTL = 60 * 10  # 10 minutes


# ── Schemas ─────────────────────────────────────────────────────────────────

class DocumentMetadataUpdate(BaseModel):
    title: Optional[str] = None
    document_type: Optional[str] = None
    related_module: Optional[str] = None
    related_transaction: Optional[str] = None
    entity: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None

    @field_validator("document_type")
    @classmethod
    def _check_type(cls, v):
        if v is not None and v not in DOCUMENT_TYPES:
            raise ValueError(f"Document type must be one of: {', '.join(sorted(DOCUMENT_TYPES))}")
        return v

    @field_validator("entity")
    @classmethod
    def _check_entity(cls, v):
        if v is not None and v not in ENTITIES:
            raise ValueError(f"Entity must be one of: {', '.join(sorted(ENTITIES))}")
        return v

    @field_validator("status")
    @classmethod
    def _check_status(cls, v):
        if v is not None and v not in STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(sorted(STATUSES))}")
        return v


# ── Helpers ───────────────────────────────────────────────────────────────────

def _owner_from_email(email: Optional[str]) -> tuple[Optional[int], Optional[str]]:
    """Resolve the current user's employee_id + display name from their email."""
    if not email:
        return None, None
    try:
        res = (
            supabase.table("employees")
            .select("employee_id, first_name, last_name")
            .eq("email", email)
            .limit(1)
            .execute()
        )
        if res.data:
            row = res.data[0]
            name = f"{row.get('first_name', '')} {row.get('last_name', '')}".strip() or email
            return row.get("employee_id"), name
    except Exception:
        pass
    return None, email


def _next_document_number(entity: str = None) -> str:
    """Generate a sequential document number in standard format."""
    from utils.code_generator import generate_code
    return generate_code(entity, "DOC", "company_documents", "document_number")


def _latest_version(document_id: int) -> Optional[dict]:
    res = (
        supabase.table("document_versions")
        .select("*")
        .eq("document_id", document_id)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _version_summary(document_id: int) -> dict:
    """Return {count, latest} for a document's versions."""
    res = (
        supabase.table("document_versions")
        .select("version_id, version_number, filename, file_size, mime_type, uploaded_at, uploaded_by")
        .eq("document_id", document_id)
        .order("version_number", desc=True)
        .execute()
    )
    rows = res.data or []
    return {"version_count": len(rows), "latest": rows[0] if rows else None}


def _decorate(doc: dict) -> dict:
    """Attach version summary fields to a document row for list/detail responses."""
    summary = _version_summary(doc["document_id"])
    latest = summary["latest"] or {}
    return {
        **doc,
        "version_count": summary["version_count"],
        "latest_filename": latest.get("filename"),
        "latest_file_size": latest.get("file_size"),
        "latest_uploaded_at": latest.get("uploaded_at"),
    }


# ── Cross-module aggregation ───────────────────────────────────────────────
# Document Management is the central repository: in addition to its own uploads,
# it reflects documents stored by other modules (Projects, HR, CRM) as
# read-only, downloadable entries so everything lives in one place.

def _employee_name_map() -> dict:
    try:
        res = supabase.table("employees").select("employee_id, first_name, last_name").execute()
        return {
            r["employee_id"]: f"{r.get('first_name', '')} {r.get('last_name', '')}".strip()
            for r in (res.data or [])
        }
    except Exception:
        return {}


def _native_documents() -> list[dict]:
    rows = supabase.table("company_documents").select("*").order("document_id", desc=True).execute().data or []
    from utils.code_generator import CODE_TO_ENTITY
    out = []
    for row in rows:
        # If entity is missing, try to infer from document_number prefix (e.g. EXP-2026-DOC-0001 → Expedia)
        entity = row.get("entity")
        if not entity:
            doc_num = row.get("document_number") or ""
            prefix = doc_num.split("-")[0] if "-" in doc_num else ""
            entity = CODE_TO_ENTITY.get(prefix)
        out.append({
            **_decorate(row),
            "entity": entity,
            "uid": f"company:{row['document_id']}",
            "source": "Document Management",
            "source_key": "company",
            "source_id": row["document_id"],
            "is_native": True,
        })
    return out


def _project_documents(emp: dict) -> list[dict]:
    try:
        rows = supabase.table("project_documents").select("*").execute().data or []
    except Exception:
        return []
    proj_ids = list({r.get("project_id") for r in rows if r.get("project_id")})
    pmap = {}
    if proj_ids:
        try:
            pres = supabase.table("projects").select("project_id, project_code, project_name, entity").in_("project_id", proj_ids).execute()
            pmap = {p["project_id"]: p for p in (pres.data or [])}
        except Exception:
            pmap = {}
    out = []
    for r in rows:
        did = r.get("document_id")
        proj = pmap.get(r.get("project_id"), {})
        out.append({
            "uid": f"project:{did}",
            "source": "Projects",
            "source_key": "project",
            "source_id": did,
            "is_native": False,
            "document_id": None,
            "document_number": f"PRJ-DOC-{did}",
            "title": r.get("document_name") or "Untitled",
            "document_type": "Project Documents",
            "entity": proj.get("entity"),
            "related_module": "Projects",
            "related_transaction": proj.get("project_code") or (f"Project #{r.get('project_id')}" if r.get("project_id") else None),
            "owner_name": emp.get(r.get("uploaded_by_employee_id")) if r.get("uploaded_by_employee_id") else None,
            "current_version": 1,
            "version_count": 1,
            "status": (r.get("status") or "Active").capitalize(),
            "created_at": r.get("created_at"),
            "latest_filename": r.get("document_name"),
        })
    return out


def _hr_documents_list(emp: dict) -> list[dict]:
    try:
        rows = supabase.table("hr_documents").select("*").execute().data or []
    except Exception:
        return []
    # Look up employee entities for company badge
    employee_ids = list({r.get("employee_id") for r in rows if r.get("employee_id")})
    entity_map = {}
    if employee_ids:
        try:
            eres = supabase.table("employee_201").select("employee_id, entity").in_("employee_id", employee_ids).execute()
            entity_map = {e["employee_id"]: e.get("entity") for e in (eres.data or [])}
        except Exception:
            pass
    out = []
    for r in rows:
        did = r.get("id")
        owner = emp.get(r.get("employee_id")) if r.get("employee_id") else None
        out.append({
            "uid": f"hr:{did}",
            "source": "HR Management",
            "source_key": "hr",
            "source_id": did,
            "is_native": False,
            "document_id": None,
            "document_number": f"HR-DOC-{did}",
            "title": r.get("filename") or "Untitled",
            "document_type": "HR Files",
            "entity": entity_map.get(r.get("employee_id")),
            "related_module": "HR Management",
            "related_transaction": owner or (f"Employee #{r.get('employee_id')}" if r.get("employee_id") else None),
            "owner_name": owner,
            "current_version": 1,
            "version_count": 1,
            "status": "Active",
            "created_at": r.get("uploaded_at") or r.get("created_at"),
            "latest_filename": r.get("filename"),
            "latest_file_size": r.get("file_size"),
        })
    return out


def _crm_documents(emp: dict) -> list[dict]:
    try:
        rows = supabase.table("documents").select("*").execute().data or []
    except Exception:
        return []
    client_ids = list({r.get("client_id") for r in rows if r.get("client_id")})
    cmap = {}
    centity_map = {}
    if client_ids:
        try:
            cres = supabase.table("client_list").select("client_id, company_name, customer_code").in_("client_id", client_ids).execute()
            cmap = {c["client_id"]: c.get("company_name") for c in (cres.data or [])}
            # Infer entity from customer_code prefix (e.g. EXP-2026-CUS-0001 → Expedia)
            from utils.code_generator import CODE_TO_ENTITY
            for c in (cres.data or []):
                code = c.get("customer_code") or ""
                prefix = code.split("-")[0] if "-" in code else ""
                centity_map[c["client_id"]] = CODE_TO_ENTITY.get(prefix)
        except Exception:
            cmap = {}
    out = []
    for r in rows:
        did = r.get("document_id")
        out.append({
            "uid": f"crm:{did}",
            "source": "CRM / Sales",
            "source_key": "crm",
            "source_id": did,
            "is_native": False,
            "document_id": None,
            "document_number": f"CRM-DOC-{did}",
            "title": r.get("document_name") or "Untitled",
            "document_type": r.get("document_type") or "Other",
            "entity": centity_map.get(r.get("client_id")),
            "related_module": "CRM / Sales",
            "related_transaction": cmap.get(r.get("client_id")) or (f"Client #{r.get('client_id')}" if r.get("client_id") else None),
            "owner_name": emp.get(r.get("employee_id")) if r.get("employee_id") else None,
            "current_version": 1,
            "version_count": 1,
            "status": (r.get("status") or "Active").capitalize(),
            "created_at": r.get("created_at"),
            "latest_filename": r.get("document_name"),
        })
    return out


def _quotation_documents(emp: dict) -> list[dict]:
    """Pull quotations as documents — each quotation is a document of type 'Quotations'."""
    try:
        rows = supabase.table("quotations").select(
            "quotation_id, quotation_no, project_name, company, status, revision_no, created_at, prepared_by"
        ).order("created_at", desc=True).execute().data or []
    except Exception:
        return []
    # Get client names
    client_ids = list({r.get("client_id") for r in rows if r.get("client_id")})
    cmap = {}
    if client_ids:
        try:
            cres = supabase.table("client_list").select("client_id, company_name").in_("client_id", client_ids).execute()
            cmap = {c["client_id"]: c.get("company_name") for c in (cres.data or [])}
        except Exception:
            pass

    # Get version counts per quotation from quotation_versions table
    version_counts = {}
    qids = [r.get("quotation_id") for r in rows if r.get("quotation_id")]
    if qids:
        try:
            # Fetch the max version_number per quotation_id
            vrows = supabase.table("quotation_versions").select(
                "quotation_id, version_number"
            ).in_("quotation_id", qids).order("version_number", desc=True).execute().data or []
            for vr in vrows:
                qid = vr["quotation_id"]
                if qid not in version_counts:
                    version_counts[qid] = vr["version_number"]
        except Exception:
            pass

    out = []
    for r in rows:
        qid = r.get("quotation_id")
        company = r.get("company") or None
        # Map company field to entity format for consistency
        from utils.code_generator import ENTITY_CODES, CODE_TO_ENTITY, ENTITY_ALIASES
        entity_match = None
        if company:
            company_lower = company.lower()
            for ent_name in ENTITY_CODES:
                if ent_name.lower() == company_lower:
                    entity_match = ent_name
                    break
            # Check aliases (e.g., "kyrios" → "KSI")
            if not entity_match:
                alias_resolved = ENTITY_ALIASES.get(company_lower)
                if alias_resolved and alias_resolved in ENTITY_CODES:
                    entity_match = alias_resolved
        # Fallback: infer from quotation_no prefix (e.g. EXP-2026-QTN-0005 → Expedia)
        if not entity_match:
            qtn_no = r.get("quotation_no") or ""
            prefix = qtn_no.split("-")[0] if "-" in qtn_no else ""
            entity_match = CODE_TO_ENTITY.get(prefix)
        owner = emp.get(r.get("prepared_by")) if r.get("prepared_by") else None
        v_count = version_counts.get(qid, 0)
        revision = r.get("revision_no") or 0
        out.append({
            "uid": f"quotation:{qid}",
            "source": "Quotation",
            "source_key": "quotation",
            "source_id": qid,
            "is_native": False,
            "has_versions": v_count > 0,
            "document_id": None,
            "document_number": r.get("quotation_no") or f"QTN-{qid}",
            "title": r.get("project_name") or f"Quotation {r.get('quotation_no')}",
            "document_type": "Quotations",
            "entity": entity_match,
            "related_module": "Quotation",
            "related_transaction": r.get("quotation_no"),
            "owner_name": owner,
            "current_version": max(v_count, revision + 1),
            "version_count": max(v_count, 1),
            "status": (r.get("status") or "Draft").capitalize(),
            "created_at": r.get("created_at"),
            "latest_filename": r.get("quotation_no"),
        })
    return out


def _purchasing_documents(emp: dict) -> list[dict]:
    """Pull Purchase Requests, Purchase Orders, RFQs, and Goods Receipts."""
    from utils.code_generator import CODE_TO_ENTITY
    out = []

    # Purchase Requests
    try:
        rows = supabase.table("purchase_requests").select("purchase_request_id, pr_number, status, created_at, requested_by_employee_id").order("created_at", desc=True).execute().data or []
        for r in rows:
            pid = r.get("purchase_request_id")
            pr_num = r.get("pr_number") or ""
            prefix = pr_num.split("-")[0] if "-" in pr_num else ""
            out.append({
                "uid": f"pr:{pid}", "source": "Purchasing", "source_key": "pr", "source_id": pid,
                "is_native": False, "document_id": None,
                "document_number": pr_num or f"PR-{pid}",
                "title": f"Purchase Request {pr_num}",
                "document_type": "POs", "entity": CODE_TO_ENTITY.get(prefix),
                "related_module": "Purchasing", "related_transaction": r.get("pr_number"),
                "owner_name": emp.get(r.get("requested_by_employee_id")),
                "current_version": 1, "version_count": 1,
                "status": (r.get("status") or "Draft").capitalize(),
                "created_at": r.get("created_at"), "latest_filename": r.get("pr_number"),
            })
    except Exception:
        pass

    # Purchase Orders
    try:
        rows = supabase.table("purchase_orders").select("purchase_order_id, po_number, purchase_request_id, supplier_name, status, total_amount, created_at").order("created_at", desc=True).execute().data or []
        for r in rows:
            pid = r.get("purchase_order_id")
            po_num = r.get("po_number") or ""
            prefix = po_num.split("-")[0] if "-" in po_num else ""
            out.append({
                "uid": f"po:{pid}", "source": "Purchasing", "source_key": "po", "source_id": pid,
                "is_native": False, "document_id": None,
                "document_number": po_num or f"PO-{pid}",
                "title": f"PO — {r.get('supplier_name', 'Unknown Supplier')}",
                "document_type": "POs", "entity": CODE_TO_ENTITY.get(prefix),
                "related_module": "Purchasing", "related_transaction": r.get("po_number"),
                "owner_name": r.get("supplier_name"),
                "purchase_request_id": r.get("purchase_request_id"),
                "current_version": 1, "version_count": 1,
                "status": (r.get("status") or "Draft").capitalize(),
                "created_at": r.get("created_at"), "latest_filename": r.get("po_number"),
            })
    except Exception:
        pass

    # RFQs
    try:
        rows = supabase.table("rfqs").select("rfq_id, rfq_number, purchase_request_id, status, created_at").order("created_at", desc=True).execute().data or []
        for r in rows:
            rid = r.get("rfq_id")
            rfq_num = r.get("rfq_number") or ""
            prefix = rfq_num.split("-")[0] if "-" in rfq_num else ""
            out.append({
                "uid": f"rfq:{rid}", "source": "Purchasing", "source_key": "rfq", "source_id": rid,
                "is_native": False, "document_id": None,
                "document_number": rfq_num or f"RFQ-{rid}",
                "title": f"Request for Quotation {rfq_num}",
                "document_type": "POs", "entity": CODE_TO_ENTITY.get(prefix),
                "related_module": "Purchasing", "related_transaction": r.get("rfq_number"),
                "owner_name": None,
                "purchase_request_id": r.get("purchase_request_id"),
                "current_version": 1, "version_count": 1,
                "status": (r.get("status") or "Draft").capitalize(),
                "created_at": r.get("created_at"), "latest_filename": r.get("rfq_number"),
            })
    except Exception:
        pass

    # Goods Receipts
    try:
        rows = supabase.table("goods_receipts").select("goods_receipt_id, receipt_number, purchase_order_id, status, received_date, received_by_employee_id").order("received_date", desc=True).execute().data or []
        # Build PO → PR lookup for navigation
        po_ids = list({r.get("purchase_order_id") for r in rows if r.get("purchase_order_id")})
        po_pr_map = {}
        if po_ids:
            try:
                po_res = supabase.table("purchase_orders").select("purchase_order_id, purchase_request_id").in_("purchase_order_id", po_ids).execute()
                po_pr_map = {p["purchase_order_id"]: p.get("purchase_request_id") for p in (po_res.data or [])}
            except Exception:
                pass
        for r in rows:
            gid = r.get("goods_receipt_id")
            rcpt_num = r.get("receipt_number") or ""
            prefix = rcpt_num.split("-")[0] if "-" in rcpt_num else ""
            out.append({
                "uid": f"gr:{gid}", "source": "Purchasing", "source_key": "gr", "source_id": gid,
                "is_native": False, "document_id": None,
                "document_number": rcpt_num or f"GR-{gid}",
                "title": f"Goods Receipt {rcpt_num}",
                "document_type": "POs", "entity": CODE_TO_ENTITY.get(prefix),
                "related_module": "Purchasing", "related_transaction": r.get("receipt_number"),
                "owner_name": emp.get(r.get("received_by_employee_id")),
                "purchase_request_id": po_pr_map.get(r.get("purchase_order_id")),
                "current_version": 1, "version_count": 1,
                "status": (r.get("status") or "Active").capitalize(),
                "created_at": r.get("received_date"), "latest_filename": r.get("receipt_number"),
            })
    except Exception:
        pass

    return out


def _ar_documents(emp: dict) -> list[dict]:
    """Pull AR Invoices as documents."""
    try:
        rows = supabase.table("ar_invoices").select("invoice_id, invoice_number, client_name, status, total_amount, entity, invoice_date, created_by_employee_id").order("invoice_date", desc=True).execute().data or []
    except Exception:
        return []
    out = []
    for r in rows:
        iid = r.get("invoice_id")
        out.append({
            "uid": f"inv:{iid}", "source": "Accounts Receivable", "source_key": "inv", "source_id": iid,
            "is_native": False, "document_id": None,
            "document_number": r.get("invoice_number") or f"INV-{iid}",
            "title": f"Invoice — {r.get('client_name', 'Unknown')}",
            "document_type": "Invoices", "entity": r.get("entity"),
            "related_module": "Accounts Receivable", "related_transaction": r.get("invoice_number"),
            "owner_name": emp.get(r.get("created_by_employee_id")),
            "current_version": 1, "version_count": 1,
            "status": (r.get("status") or "Draft").capitalize(),
            "created_at": r.get("invoice_date"), "latest_filename": r.get("invoice_number"),
        })
    return out


def _ap_documents(emp: dict) -> list[dict]:
    """Pull AP Bills and Payment Vouchers as documents."""
    out = []

    # Bills
    try:
        rows = supabase.table("ap_bills").select("bill_id, bill_number, supplier_name, status, total_amount, entity, bill_date").order("bill_date", desc=True).execute().data or []
        for r in rows:
            bid = r.get("bill_id")
            out.append({
                "uid": f"bill:{bid}", "source": "Accounts Payable", "source_key": "bill", "source_id": bid,
                "is_native": False, "document_id": None,
                "document_number": r.get("bill_number") or f"BIL-{bid}",
                "title": f"Bill — {r.get('supplier_name', 'Unknown')}",
                "document_type": "Invoices", "entity": r.get("entity"),
                "related_module": "Accounts Payable", "related_transaction": r.get("bill_number"),
                "owner_name": r.get("supplier_name"),
                "current_version": 1, "version_count": 1,
                "status": (r.get("status") or "Draft").capitalize(),
                "created_at": r.get("bill_date"), "latest_filename": r.get("bill_number"),
            })
    except Exception:
        pass

    # Payment Vouchers
    try:
        rows = supabase.table("ap_payment_vouchers").select("voucher_id, voucher_number, supplier_name, status, total_amount, entity, payment_date").order("payment_date", desc=True).execute().data or []
        for r in rows:
            vid = r.get("voucher_id")
            out.append({
                "uid": f"pv:{vid}", "source": "Accounts Payable", "source_key": "pv", "source_id": vid,
                "is_native": False, "document_id": None,
                "document_number": r.get("voucher_number") or f"PV-{vid}",
                "title": f"Payment Voucher — {r.get('supplier_name', 'Unknown')}",
                "document_type": "ORs", "entity": r.get("entity"),
                "related_module": "Accounts Payable", "related_transaction": r.get("voucher_number"),
                "owner_name": r.get("supplier_name"),
                "current_version": 1, "version_count": 1,
                "status": (r.get("status") or "Draft").capitalize(),
                "created_at": r.get("payment_date"), "latest_filename": r.get("voucher_number"),
            })
    except Exception:
        pass

    return out


def _gl_documents(emp: dict) -> list[dict]:
    """Pull GL Journal Entries as documents."""
    try:
        rows = supabase.table("gl_journal_entries").select("entry_id, entry_number, description, status, entity, entry_date, total_debit, posted_by").eq("status", "Posted").order("entry_date", desc=True).execute().data or []
    except Exception:
        return []
    out = []
    for r in rows:
        eid = r.get("entry_id")
        out.append({
            "uid": f"je:{eid}", "source": "General Ledger", "source_key": "je", "source_id": eid,
            "is_native": False, "document_id": None,
            "document_number": r.get("entry_number") or f"JE-{eid}",
            "title": r.get("description") or f"Journal Entry {r.get('entry_number', '')}",
            "document_type": "Tax Documents", "entity": r.get("entity"),
            "related_module": "General Ledger", "related_transaction": r.get("entry_number"),
            "owner_name": r.get("posted_by"),
            "current_version": 1, "version_count": 1,
            "status": "Posted",
            "created_at": r.get("entry_date"), "latest_filename": r.get("entry_number"),
        })
    return out


# ── In-memory cache for cross-module aggregation (30s TTL) ───────────────────
_DOC_CACHE_TTL = 30  # seconds
_doc_cache: dict = {"data": None, "ts": 0}


def _collect_all_documents() -> list[dict]:
    """Merge native + external documents into one chronologically sorted list.
    
    Reflects ALL modules: Document Management (native), Projects, HR, CRM,
    Quotations, Purchase Requests, Purchase Orders, RFQs, Goods Receipts,
    AR Invoices, AP Bills, Payment Vouchers, GL Journal Entries.

    Results are cached for 30 seconds to avoid repeated expensive aggregation.
    """
    now = time.time()
    if _doc_cache["data"] is not None and (now - _doc_cache["ts"]) < _DOC_CACHE_TTL:
        return _doc_cache["data"]

    emp = _employee_name_map()
    combined = (
        _native_documents()
        + _project_documents(emp)
        + _hr_documents_list(emp)
        + _crm_documents(emp)
        + _quotation_documents(emp)
        + _purchasing_documents(emp)
        + _ar_documents(emp)
        + _ap_documents(emp)
        + _gl_documents(emp)
    )
    # Normalize status for cross-module documents: anything not explicitly
    # "Archived" or "Draft" is treated as "Active" in the document context.
    for doc in combined:
        if not doc.get("is_native"):
            raw = (doc.get("status") or "").lower()
            if raw == "archived":
                doc["status"] = "Archived"
            elif raw == "draft":
                doc["status"] = "Draft"
            else:
                doc["status"] = "Active"
    combined.sort(key=lambda d: (d.get("created_at") or ""), reverse=True)

    _doc_cache["data"] = combined
    _doc_cache["ts"] = now
    return combined


def invalidate_document_cache():
    """Call after any mutation to native documents to bust the cache."""
    _doc_cache["data"] = None
    _doc_cache["ts"] = 0


def _matches_filters(doc, search, document_type, status_filter, related_module, entity) -> bool:
    if document_type and document_type != "All" and doc.get("document_type") != document_type:
        return False
    if status_filter and status_filter != "All" and doc.get("status") != status_filter:
        return False
    if related_module and related_module != "All" and doc.get("related_module") != related_module:
        return False
    if entity and entity != "All" and doc.get("entity") != entity:
        return False
    if search and search.strip():
        s = search.strip().lower()
        hay = " ".join(
            str(doc.get(k) or "")
            for k in ("document_number", "title", "related_transaction", "owner_name", "related_module", "source")
        ).lower()
        if s not in hay:
            return False
    return True


def _validate_upload(file: UploadFile, contents: bytes) -> None:
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Unsupported file type.", "fields": {"file": "Accepted: PDF, JPG, PNG, DOCX, XLSX, CSV"}},
        )
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "File too large.", "fields": {"file": "Maximum file size is 25MB."}},
        )


def _signed_url_in(bucket: str, storage_path: str) -> Optional[str]:
    """Create a short-lived signed URL for an object in the given bucket."""
    try:
        res = supabase.storage.from_(bucket).create_signed_url(storage_path, SIGNED_URL_TTL)
    except Exception:
        return None
    if isinstance(res, dict):
        return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
    return None


def _signed_url(storage_path: str) -> Optional[str]:
    """Create a short-lived signed URL for an object in the module's bucket."""
    return _signed_url_in(BUCKET, storage_path)


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("")
def list_documents(
    search: Optional[str] = Query(None),
    document_type: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    related_module: Optional[str] = Query(None, alias="module"),
    entity: Optional[str] = Query(None),
):
    """List all documents across the system (native + Projects/HR/CRM)."""
    docs = _collect_all_documents()
    return [d for d in docs if _matches_filters(d, search, document_type, status_filter, related_module, entity)]


@router.get("/metrics")
def document_metrics():
    """Return metric card values computed across all reflected documents."""
    rows = _collect_all_documents()

    now = datetime.now()
    total = len(rows)
    active = sum(1 for r in rows if r.get("status") == "Active")
    archived = sum(1 for r in rows if r.get("status") == "Archived")
    this_month = 0
    for r in rows:
        created = r.get("created_at")
        if created:
            try:
                dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
                if dt.year == now.year and dt.month == now.month:
                    this_month += 1
            except (ValueError, TypeError):
                pass

    return {
        "total_documents": total,
        "active_documents": active,
        "archived_documents": archived,
        "uploaded_this_month": this_month,
    }


@router.get("/external/versions")
def external_versions(source: str = Query(...), id: int = Query(...)):
    """Return version history for a document owned by another module.

    Currently supports 'quotation' source — returns quotation_versions data.
    """
    if source == "quotation":
        # Check quotation exists
        q = supabase.table("quotations").select("quotation_id, quotation_no, project_name, revision_no").eq("quotation_id", id).execute()
        if not q.data:
            raise HTTPException(status_code=404, detail={"error": "Quotation not found."})
        quotation = q.data[0]

        # Fetch versions from quotation_versions table
        versions = (
            supabase.table("quotation_versions")
            .select("version_id, quotation_id, version_number, change_summary, stage_context, created_by, created_at, employees(first_name, last_name)")
            .eq("quotation_id", id)
            .order("version_number", desc=True)
            .execute()
            .data or []
        )

        # Also include revision info (sibling quotations with same base number)
        revisions = []
        base_no = quotation["quotation_no"].split("-R")[0] if "-R" in (quotation.get("quotation_no") or "") else quotation.get("quotation_no")
        if base_no:
            rev_rows = (
                supabase.table("quotations")
                .select("quotation_id, quotation_no, revision_no, status, created_at")
                .like("quotation_no", f"{base_no}%")
                .order("revision_no")
                .execute()
                .data or []
            )
            revisions = rev_rows

        return {
            "quotation": quotation,
            "versions": versions,
            "revisions": revisions,
        }

    raise HTTPException(status_code=400, detail={"error": f"Version history not available for source '{source}'."})


@router.get("/external/download")
def external_download(source: str = Query(...), id: int = Query(...)):
    """Return a download URL for a document owned by another module.

    Declared before the /{document_id} routes so "external" is not parsed as an id.
    """
    if source == "project":
        r = supabase.table("project_documents").select("file_url, document_name").eq("document_id", id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail={"error": "Document not found."})
        url = r.data[0].get("file_url")
        if not url:
            raise HTTPException(status_code=404, detail={"error": "No file is attached to this document."})
        return {"url": url, "filename": r.data[0].get("document_name")}

    if source == "hr":
        r = supabase.table("hr_documents").select("storage_path, filename").eq("id", id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail={"error": "Document not found."})
        url = _signed_url_in("hr-documents", r.data[0]["storage_path"])
        if not url:
            raise HTTPException(status_code=500, detail={"error": "Could not generate download link."})
        return {"url": url, "filename": r.data[0].get("filename")}

    if source == "crm":
        r = supabase.table("documents").select("file_path, document_name").eq("document_id", id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail={"error": "Document not found."})
        path = r.data[0].get("file_path")
        if not path:
            raise HTTPException(status_code=404, detail={"error": "No file is attached to this document."})
        # CRM documents store either a full URL or a bare path; only URLs are openable.
        if str(path).startswith("http"):
            return {"url": path, "filename": r.data[0].get("document_name")}
        raise HTTPException(status_code=404, detail={"error": "This document has no downloadable file link."})

    if source == "quotation":
        # Quotations don't have a file attachment — they are generated as PDFs on the frontend.
        # Return a reference to view it in the Quotation module instead.
        r = supabase.table("quotations").select("quotation_id, quotation_no, project_name").eq("quotation_id", id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail={"error": "Quotation not found."})
        raise HTTPException(status_code=404, detail={"error": "Quotations are viewed/exported from the Quotation module. No separate file is stored."})

    raise HTTPException(status_code=400, detail={"error": "Unknown document source."})


@router.get("/{document_id}")
def get_document(document_id: int):
    """Return a single document with its full version history."""
    res = supabase.table("company_documents").select("*").eq("document_id", document_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Document not found."})
    versions = (
        supabase.table("document_versions")
        .select("*")
        .eq("document_id", document_id)
        .order("version_number", desc=True)
        .execute()
    )
    return {**_decorate(res.data[0]), "versions": versions.data or []}


@router.get("/{document_id}/versions")
def list_versions(document_id: int):
    res = (
        supabase.table("document_versions")
        .select("*")
        .eq("document_id", document_id)
        .order("version_number", desc=True)
        .execute()
    )
    return {"data": res.data or []}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_document(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    document_type: str = Form(...),
    related_module: Optional[str] = Form(None),
    related_transaction: Optional[str] = Form(None),
    entity: Optional[str] = Form(None),
    status_value: Optional[str] = Form("Active", alias="status"),
    description: Optional[str] = Form(None),
):
    """Upload a new document and store its first version."""
    _, performed_by = _extract_jwt_claims(request)

    if document_type not in DOCUMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Invalid document type.", "fields": {"document_type": "Unknown category"}},
        )
    if entity is not None and entity != "" and entity not in ENTITIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Invalid company/entity.", "fields": {"entity": "Unknown entity"}},
        )
    if status_value and status_value not in STATUSES:
        status_value = "Active"

    contents = await file.read()
    _validate_upload(file, contents)

    owner_id, owner_name = _owner_from_email(performed_by)
    document_number = _next_document_number(entity or None)

    # Insert the document register row first so we have an id for the storage path.
    doc_res = supabase.table("company_documents").insert({
        "document_number": document_number,
        "title": title.strip(),
        "document_type": document_type,
        "related_module": related_module,
        "related_transaction": related_transaction,
        "entity": entity or None,
        "owner_employee_id": owner_id,
        "owner_name": owner_name,
        "current_version": 1,
        "status": status_value or "Active",
        "description": description,
    }).execute()

    if not doc_res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create document record."})

    document = doc_res.data[0]
    document_id = document["document_id"]

    filename = file.filename or "unnamed_file"
    storage_path = f"{document_id}/v1_{filename}"

    try:
        supabase.storage.from_(BUCKET).upload(
            storage_path, contents, {"content-type": file.content_type or "application/octet-stream"}
        )
    except Exception:
        supabase.table("company_documents").delete().eq("document_id", document_id).execute()
        raise HTTPException(status_code=500, detail={"error": "File upload failed. Please try again."})

    try:
        supabase.table("document_versions").insert({
            "document_id": document_id,
            "version_number": 1,
            "filename": filename,
            "storage_path": storage_path,
            "file_size": len(contents),
            "mime_type": file.content_type,
            "change_note": "Initial upload",
            "uploaded_by": owner_name or performed_by,
        }).execute()
    except Exception:
        # Roll back storage + register row.
        try:
            supabase.storage.from_(BUCKET).remove([storage_path])
        except Exception:
            pass
        supabase.table("company_documents").delete().eq("document_id", document_id).execute()
        raise HTTPException(status_code=500, detail={"error": "Failed to save document version."})

    write_audit_log(
        action="CREATE",
        module_name=MODULE_NAME,
        description=f"Uploaded document {document_number} — {title}",
        performed_by=performed_by,
        employee_id=owner_id,
        record_id=document_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    invalidate_document_cache()
    return get_document(document_id)


@router.patch("/{document_id}")
def update_metadata(document_id: int, request: Request, payload: DocumentMetadataUpdate):
    """Edit document metadata and/or link it to a transaction."""
    _, performed_by = _extract_jwt_claims(request)

    existing = supabase.table("company_documents").select("*").eq("document_id", document_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail={"error": "Document not found."})

    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates and updates["title"]:
        updates["title"] = updates["title"].strip()
    if not updates:
        return _decorate(existing.data[0])

    res = supabase.table("company_documents").update(updates).eq("document_id", document_id).execute()

    changes = ", ".join(f"{k}" for k in updates)
    write_audit_log(
        action="UPDATE",
        module_name=MODULE_NAME,
        description=f"Updated document {existing.data[0].get('document_number')} ({changes})",
        performed_by=performed_by,
        record_id=document_id,
        old_values={k: existing.data[0].get(k) for k in updates},
        new_values=updates,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    invalidate_document_cache()
    return _decorate(res.data[0] if res.data else existing.data[0])


@router.post("/{document_id}/versions", status_code=status.HTTP_201_CREATED)
async def upload_version(
    document_id: int,
    request: Request,
    file: UploadFile = File(...),
    change_note: Optional[str] = Form(None),
):
    """Upload a new version of an existing document."""
    _, performed_by = _extract_jwt_claims(request)

    existing = supabase.table("company_documents").select("*").eq("document_id", document_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail={"error": "Document not found."})
    document = existing.data[0]

    contents = await file.read()
    _validate_upload(file, contents)

    latest = _latest_version(document_id)
    next_version = (latest["version_number"] + 1) if latest else 1

    _, owner_name = _owner_from_email(performed_by)
    filename = file.filename or "unnamed_file"
    storage_path = f"{document_id}/v{next_version}_{filename}"

    try:
        supabase.storage.from_(BUCKET).upload(
            storage_path, contents, {"content-type": file.content_type or "application/octet-stream"}
        )
    except Exception:
        raise HTTPException(status_code=500, detail={"error": "File upload failed. Please try again."})

    try:
        supabase.table("document_versions").insert({
            "document_id": document_id,
            "version_number": next_version,
            "filename": filename,
            "storage_path": storage_path,
            "file_size": len(contents),
            "mime_type": file.content_type,
            "change_note": change_note,
            "uploaded_by": owner_name or performed_by,
        }).execute()
    except Exception:
        try:
            supabase.storage.from_(BUCKET).remove([storage_path])
        except Exception:
            pass
        raise HTTPException(status_code=500, detail={"error": "Failed to save document version."})

    supabase.table("company_documents").update(
        {"current_version": next_version}
    ).eq("document_id", document_id).execute()

    write_audit_log(
        action="UPDATE",
        module_name=MODULE_NAME,
        description=f"Uploaded version {next_version} of {document.get('document_number')}",
        performed_by=performed_by,
        record_id=document_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return get_document(document_id)


@router.post("/{document_id}/archive")
def set_archive_state(document_id: int, request: Request, restore: bool = Query(False)):
    """Archive (or restore) a document."""
    _, performed_by = _extract_jwt_claims(request)

    existing = supabase.table("company_documents").select("*").eq("document_id", document_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail={"error": "Document not found."})

    new_status = "Active" if restore else "Archived"
    res = supabase.table("company_documents").update(
        {"status": new_status}
    ).eq("document_id", document_id).execute()

    write_audit_log(
        action="ARCHIVE" if not restore else "UPDATE",
        module_name=MODULE_NAME,
        description=f"{'Restored' if restore else 'Archived'} document {existing.data[0].get('document_number')}",
        performed_by=performed_by,
        record_id=document_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    invalidate_document_cache()
    return _decorate(res.data[0] if res.data else existing.data[0])


@router.get("/{document_id}/download")
def download_document(document_id: int, version_id: Optional[int] = Query(None)):
    """Return a short-lived signed URL for a document version (latest by default)."""
    if version_id is not None:
        ver = supabase.table("document_versions").select("*").eq("version_id", version_id).eq("document_id", document_id).execute()
        version = ver.data[0] if ver.data else None
    else:
        version = _latest_version(document_id)

    if not version:
        raise HTTPException(status_code=404, detail={"error": "No file found for this document."})

    url = _signed_url(version["storage_path"])
    if not url:
        raise HTTPException(status_code=500, detail={"error": "Could not generate download link."})

    return {"url": url, "filename": version["filename"], "version_number": version["version_number"]}


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: int, request: Request):
    """Permanently delete a document, all its versions, and stored files."""
    _, performed_by = _extract_jwt_claims(request)

    existing = supabase.table("company_documents").select("*").eq("document_id", document_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail={"error": "Document not found."})

    versions = supabase.table("document_versions").select("storage_path").eq("document_id", document_id).execute()
    paths = [v["storage_path"] for v in (versions.data or []) if v.get("storage_path")]
    if paths:
        try:
            supabase.storage.from_(BUCKET).remove(paths)
        except Exception:
            pass

    # document_versions rows cascade on delete of the parent.
    supabase.table("company_documents").delete().eq("document_id", document_id).execute()

    write_audit_log(
        action="DELETE",
        module_name=MODULE_NAME,
        description=f"Deleted document {existing.data[0].get('document_number')}",
        performed_by=performed_by,
        record_id=document_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    invalidate_document_cache()
    return None


@router.get("/export/csv")
def export_documents(
    search: Optional[str] = Query(None),
    document_type: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    related_module: Optional[str] = Query(None, alias="module"),
    entity: Optional[str] = Query(None),
):
    """Export the filtered document register as CSV."""
    rows = list_documents(search, document_type, status_filter, related_module, entity)
    fields = [
        "document_number", "title", "document_type", "entity", "source", "related_module",
        "related_transaction", "owner_name", "current_version", "status",
        "version_count", "created_at", "updated_at",
    ]
    output = StringIO()
    writer = DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="company_documents.csv"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)
