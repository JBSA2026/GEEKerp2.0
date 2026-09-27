"""General Ledger router (Module 10).

Submodules: Chart of Accounts, Journal Entries,
Income Statement, General Ledger Report.
"""
from datetime import date, datetime
from io import StringIO, BytesIO
from csv import DictWriter
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.cache import cached

router = APIRouter(prefix="/general-ledger", tags=["General Ledger"])

MODULE_NAME = "General Ledger"
ENTITIES = ("Expedia", "GreatnessLab", "Exigent", "KSI")
ACCOUNT_TYPES = ("Asset", "Liability", "Equity", "Revenue", "Expense")
ENTRY_STATUSES = ("Draft", "Posted", "Reversed")


# ── Schemas ───────────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    account_code: str
    account_name: str
    account_type: str
    parent_account_id: Optional[int] = None
    normal_balance: str = "Debit"
    description: Optional[str] = None
    entity: Optional[str] = None
    is_active: bool = True

    @field_validator("account_type")
    @classmethod
    def _at(cls, v):
        if v not in ACCOUNT_TYPES:
            raise ValueError(f"Must be one of: {', '.join(ACCOUNT_TYPES)}")
        return v

    @field_validator("normal_balance")
    @classmethod
    def _nb(cls, v):
        if v not in ("Debit", "Credit"):
            raise ValueError("Must be Debit or Credit")
        return v


class AccountUpdate(BaseModel):
    account_name: Optional[str] = None
    account_type: Optional[str] = None
    parent_account_id: Optional[int] = None
    normal_balance: Optional[str] = None
    description: Optional[str] = None
    entity: Optional[str] = None
    is_active: Optional[bool] = None


class RemarksUpdate(BaseModel):
    remarks: Optional[str] = None


class JournalLineInput(BaseModel):
    account_id: int
    description: Optional[str] = None
    debit: float = 0
    credit: float = 0


class JournalEntryCreate(BaseModel):
    entry_date: date
    description: Optional[str] = None
    reference_module: Optional[str] = None
    reference_number: Optional[str] = None
    entity: Optional[str] = None
    lines: List[JournalLineInput]

    @field_validator("entity")
    @classmethod
    def _ent(cls, v):
        if v is not None and v != "" and v not in ENTITIES:
            raise ValueError(f"Must be one of: {', '.join(ENTITIES)}")
        return v or None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _next_entry_number(entity: str = None) -> str:
    from utils.code_generator import generate_code
    return generate_code(entity, "JE", "gl_journal_entries", "entry_number")


def _account_map() -> dict:
    res = supabase.table("gl_accounts").select("account_id, account_code, account_name, account_type, normal_balance").execute()
    return {r["account_id"]: r for r in (res.data or [])}


def _decorate_entry(entry: dict, accts: dict = None) -> dict:
    if accts is None:
        accts = _account_map()
    lines_res = (
        supabase.table("gl_journal_lines")
        .select("*")
        .eq("entry_id", entry["entry_id"])
        .order("line_id")
        .execute()
    )
    lines = []
    for ln in (lines_res.data or []):
        a = accts.get(ln.get("account_id"), {})
        lines.append({
            **ln,
            "account_code": a.get("account_code"),
            "account_name": a.get("account_name"),
            "account_type": a.get("account_type"),
        })
    return {**entry, "lines": lines}


# ══════════════════════════════════════════════════════════════════════════════
# CHART OF ACCOUNTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/accounts")
@cached("gl:accounts:{account_type}:{entity}:{search}:{active_only}", ttl=120)
def list_accounts(
    account_type: Optional[str] = Query(None, alias="type"),
    entity: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    active_only: bool = Query(True),
):
    req = supabase.table("gl_accounts").select("*").order("account_code")
    if active_only:
        req = req.eq("is_active", True)
    if account_type and account_type != "All":
        req = req.eq("account_type", account_type)
    if entity and entity != "All":
        # Show accounts for this entity OR shared accounts (entity is null)
        req = req.or_(f"entity.eq.{entity},entity.is.null")
    if search and search.strip():
        s = search.strip()
        req = req.or_(f"account_code.ilike.%{s}%,account_name.ilike.%{s}%")
    return req.execute().data or []


@router.post("/accounts", status_code=201)
def create_account(request: Request, payload: AccountCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = payload.model_dump(exclude_unset=True)
    dup = supabase.table("gl_accounts").select("account_id").eq("account_code", payload.account_code).execute()
    if dup.data:
        raise HTTPException(status_code=409, detail={"error": "Account code already exists.", "fields": {"account_code": "Duplicate"}})
    res = supabase.table("gl_accounts").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create account."})
    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Created account {payload.account_code} — {payload.account_name}", performed_by=performed_by, record_id=res.data[0]["account_id"], ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.patch("/accounts/{account_id}")
def update_account(account_id: int, request: Request, payload: AccountUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        existing = supabase.table("gl_accounts").select("*").eq("account_id", account_id).execute()
        return existing.data[0] if existing.data else None
    res = supabase.table("gl_accounts").update(updates).eq("account_id", account_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Account not found."})
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Updated account {res.data[0].get('account_code')}", performed_by=performed_by, record_id=account_id, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.delete("/accounts/{account_id}", status_code=204)
def delete_account(account_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    # Check no journal lines reference this account
    used = supabase.table("gl_journal_lines").select("line_id").eq("account_id", account_id).limit(1).execute()
    if used.data:
        raise HTTPException(status_code=400, detail={"error": "Cannot delete account that has journal entries. Deactivate it instead."})
    supabase.table("gl_accounts").delete().eq("account_id", account_id).execute()
    write_audit_log(action="DELETE", module_name=MODULE_NAME, description=f"Deleted account #{account_id}", performed_by=performed_by, record_id=account_id, ip_address=request.client.host if request.client else None, request=request)
    return None


# ══════════════════════════════════════════════════════════════════════════════
# JOURNAL ENTRIES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/entries")
def list_entries(
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    req = supabase.table("gl_journal_entries").select("*").order("entry_id", desc=True)
    if status_filter and status_filter != "All":
        req = req.eq("status", status_filter)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("entry_date", date_from.isoformat())
    if date_to:
        req = req.lte("entry_date", date_to.isoformat())
    if search and search.strip():
        s = search.strip()
        req = req.or_(f"entry_number.ilike.%{s}%,description.ilike.%{s}%,reference_number.ilike.%{s}%")
    return req.execute().data or []


@router.get("/entries/{entry_id}")
def get_entry(entry_id: int):
    res = supabase.table("gl_journal_entries").select("*").eq("entry_id", entry_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Journal entry not found."})
    return _decorate_entry(res.data[0])


@router.post("/entries", status_code=201)
def create_entry(request: Request, payload: JournalEntryCreate):
    _, performed_by = _extract_jwt_claims(request)
    if not payload.lines or len(payload.lines) < 2:
        raise HTTPException(status_code=422, detail={"error": "A journal entry must have at least 2 lines."})
    # Validate: each line should have debit OR credit, not both
    for i, ln in enumerate(payload.lines):
        if ln.debit > 0 and ln.credit > 0:
            raise HTTPException(status_code=422, detail={"error": f"Line {i + 1}: A journal line cannot have both debit and credit. Use separate lines.", "fields": {"lines": "Each line must be either a debit or a credit."}})
    total_debit = round(sum(ln.debit for ln in payload.lines), 2)
    total_credit = round(sum(ln.credit for ln in payload.lines), 2)

    entry_number = _next_entry_number(payload.entity)
    header = {
        "entry_number": entry_number,
        "entry_date": payload.entry_date.isoformat(),
        "description": payload.description,
        "reference_module": payload.reference_module,
        "reference_number": payload.reference_number,
        "entity": payload.entity,
        "status": "Draft",
        "total_debit": total_debit,
        "total_credit": total_credit,
        "prepared_by": performed_by,
    }
    # Resolve employee id
    emp_res = supabase.table("employees").select("employee_id").eq("email", performed_by).limit(1).execute() if performed_by else None
    if emp_res and emp_res.data:
        header["created_by_employee_id"] = emp_res.data[0]["employee_id"]

    res = supabase.table("gl_journal_entries").insert(header).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create journal entry."})
    entry = res.data[0]
    entry_id = entry["entry_id"]

    lines_data = [{"entry_id": entry_id, "account_id": ln.account_id, "description": ln.description, "debit": ln.debit, "credit": ln.credit} for ln in payload.lines]
    supabase.table("gl_journal_lines").insert(lines_data).execute()

    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Created journal entry {entry_number}", performed_by=performed_by, record_id=entry_id, ip_address=request.client.host if request.client else None, request=request)
    return _decorate_entry(entry)


@router.post("/entries/{entry_id}/post")
def post_entry(entry_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_journal_entries").select("*").eq("entry_id", entry_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Journal entry not found."})
    entry = res.data[0]
    if entry["status"] != "Draft":
        raise HTTPException(status_code=400, detail={"error": f"Only Draft entries can be posted (current: {entry['status']})."})
    if entry["total_debit"] != entry["total_credit"]:
        raise HTTPException(status_code=400, detail={"error": "Cannot post an unbalanced entry."})

    now = datetime.now().isoformat()
    supabase.table("gl_journal_entries").update({"status": "Posted", "posted_by": performed_by, "posted_at": now, "reviewed_by": performed_by}).eq("entry_id", entry_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Posted journal entry {entry['entry_number']}", performed_by=performed_by, record_id=entry_id, ip_address=request.client.host if request.client else None, request=request)
    return get_entry(entry_id)


@router.post("/entries/{entry_id}/reverse")
def reverse_entry(entry_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_journal_entries").select("*").eq("entry_id", entry_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Journal entry not found."})
    entry = res.data[0]
    if entry["status"] != "Posted":
        raise HTTPException(status_code=400, detail={"error": "Only Posted entries can be reversed."})

    # Mark original as reversed
    now = datetime.now().isoformat()
    supabase.table("gl_journal_entries").update({"status": "Reversed", "reversed_by": performed_by, "reversed_at": now}).eq("entry_id", entry_id).execute()

    # Create reversal entry (swap debits/credits)
    lines_res = supabase.table("gl_journal_lines").select("*").eq("entry_id", entry_id).execute()
    rev_number = _next_entry_number(entry.get("entity"))
    rev_header = {
        "entry_number": rev_number,
        "entry_date": date.today().isoformat(),
        "description": f"Reversal of {entry['entry_number']}",
        "reference_module": entry.get("reference_module"),
        "reference_number": entry.get("reference_number"),
        "entity": entry.get("entity"),
        "status": "Posted",
        "posted_by": performed_by,
        "posted_at": now,
        "reversal_of": entry_id,
        "total_debit": entry["total_credit"],
        "total_credit": entry["total_debit"],
    }
    rev_res = supabase.table("gl_journal_entries").insert(rev_header).execute()
    rev_entry = rev_res.data[0]
    rev_lines = [{"entry_id": rev_entry["entry_id"], "account_id": ln["account_id"], "description": f"Reversal — {ln.get('description') or ''}", "debit": ln["credit"], "credit": ln["debit"]} for ln in (lines_res.data or [])]
    supabase.table("gl_journal_lines").insert(rev_lines).execute()

    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Reversed journal entry {entry['entry_number']} → {rev_number}", performed_by=performed_by, record_id=entry_id, ip_address=request.client.host if request.client else None, request=request)
    return {"reversed_entry": get_entry(entry_id), "reversal_entry": get_entry(rev_entry["entry_id"])}


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_journal_entries").select("*").eq("entry_id", entry_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Journal entry not found."})
    if res.data[0]["status"] == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Cannot delete a posted entry. Reverse it instead."})
    supabase.table("gl_journal_entries").delete().eq("entry_id", entry_id).execute()
    write_audit_log(action="DELETE", module_name=MODULE_NAME, description=f"Deleted journal entry {res.data[0]['entry_number']}", performed_by=performed_by, record_id=entry_id, ip_address=request.client.host if request.client else None, request=request)
    return None


# ══════════════════════════════════════════════════════════════════════════════
# REPORTS — GL Report
# ══════════════════════════════════════════════════════════════════════════════

def _posted_lines(entity: Optional[str] = None, date_from: Optional[date] = None, date_to: Optional[date] = None):
    """Return all journal lines from posted entries, optionally filtered."""
    req = supabase.table("gl_journal_entries").select("entry_id").eq("status", "Posted")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("entry_date", date_from.isoformat())
    if date_to:
        req = req.lte("entry_date", date_to.isoformat())
    entries = req.execute().data or []
    if not entries:
        return []
    entry_ids = [e["entry_id"] for e in entries]
    # Supabase .in_() has a limit; batch if needed
    all_lines = []
    batch_size = 100
    for i in range(0, len(entry_ids), batch_size):
        batch = entry_ids[i:i+batch_size]
        lr = supabase.table("gl_journal_lines").select("*").in_("entry_id", batch).execute()
        all_lines.extend(lr.data or [])
    return all_lines


@router.get("/reports/ledger")
@cached("gl:ledger:{account_id}:{entity}:{date_from}:{date_to}", ttl=60)
def general_ledger_report(
    account_id: Optional[int] = Query(None),
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """Per-account transaction detail with running balance."""
    accts = _account_map()
    lines = _posted_lines(entity, date_from, date_to)
    if account_id:
        lines = [ln for ln in lines if ln["account_id"] == account_id]

    # Fetch entry headers for dates
    entry_ids = list({ln["entry_id"] for ln in lines})
    entry_map = {}
    if entry_ids:
        for i in range(0, len(entry_ids), 100):
            batch = entry_ids[i:i+100]
            er = supabase.table("gl_journal_entries").select("entry_id, entry_number, entry_date, description, reference_module, reference_number").in_("entry_id", batch).execute()
            for e in (er.data or []):
                entry_map[e["entry_id"]] = e

    # Build report rows sorted by date
    rows = []
    for ln in lines:
        e = entry_map.get(ln["entry_id"], {})
        a = accts.get(ln["account_id"], {})
        rows.append({
            "entry_date": e.get("entry_date"),
            "entry_number": e.get("entry_number"),
            "account_code": a.get("account_code"),
            "account_name": a.get("account_name"),
            "description": ln.get("description") or e.get("description"),
            "debit": float(ln.get("debit") or 0),
            "credit": float(ln.get("credit") or 0),
            "reference_module": e.get("reference_module"),
            "reference_number": e.get("reference_number"),
        })
    rows.sort(key=lambda r: r.get("entry_date") or "")

    # Running balance
    running = 0
    for r in rows:
        running += r["debit"] - r["credit"]
        r["running_balance"] = round(running, 2)
    return {"rows": rows, "total_debit": round(sum(r["debit"] for r in rows), 2), "total_credit": round(sum(r["credit"] for r in rows), 2)}


# ── GL Metrics (for dashboard cards) ─────────────────────────────────────────

@router.get("/metrics")
@cached("gl:metrics:{entity}", ttl=60)
def gl_metrics(entity: Optional[str] = Query(None)):
    req = supabase.table("gl_journal_entries").select("entry_id, status, total_debit, entry_date")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    entries = req.execute().data or []
    accts = supabase.table("gl_accounts").select("account_id").eq("is_active", True).execute().data or []

    total_entries = len(entries)
    posted = sum(1 for e in entries if e.get("status") == "Posted")
    draft = sum(1 for e in entries if e.get("status") == "Draft")
    total_posted_value = round(sum(float(e.get("total_debit") or 0) for e in entries if e.get("status") == "Posted"), 2)
    return {
        "total_entries": total_entries,
        "posted_entries": posted,
        "draft_entries": draft,
        "total_accounts": len(accts),
        "total_posted_value": total_posted_value,
    }


# ── Export GL Data ────────────────────────────────────────────────────────────

@router.get("/export/journal-book")
def export_journal_book(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """Export Journal Book in BIR Excel format."""
    accts = _account_map()
    req = supabase.table("gl_journal_entries").select("*").eq("status", "Posted").order("entry_date")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("entry_date", date_from.isoformat())
    if date_to:
        req = req.lte("entry_date", date_to.isoformat())
    entries = req.execute().data or []

    col_headers = ["Date", "JV No.", "Reference / Source Doc", "Account Code", "Account Title", "Description / Explanation", "Debit", "Credit", "Prepared By", "Reviewed By", "Posting Status", "Remarks"]
    rows = []
    for entry in entries:
        lines_res = supabase.table("gl_journal_lines").select("*").eq("entry_id", entry["entry_id"]).execute()
        for ln in (lines_res.data or []):
            a = accts.get(ln["account_id"], {})
            rows.append([
                entry.get("entry_date", ""),
                entry.get("entry_number", ""),
                entry.get("reference_module") or entry.get("reference_number") or "",
                a.get("account_code", ""),
                a.get("account_name", ""),
                ln.get("description") or entry.get("description") or "",
                float(ln.get("debit") or 0),
                float(ln.get("credit") or 0),
                entry.get("prepared_by", ""),
                entry.get("reviewed_by", ""),
                entry.get("status", ""),
                "",
            ])

    output = _build_bir_xlsx(entity=entity, date_from=date_from, date_to=date_to, book_name="General Journal Book", col_headers=col_headers, rows=rows, sum_columns=[6, 7])
    filename = f"journal_book_{entity or 'all'}_{date.today().isoformat()}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


# ══════════════════════════════════════════════════════════════════════════════
# POSTING TEMPLATES — Standard journal entry patterns
# ══════════════════════════════════════════════════════════════════════════════

# Define standard posting rules per the Philippine accounting conventions used
# by GEEK Group. Each template specifies which accounts to debit/credit and
# how to compute amounts from the base figures (gross amount, VAT rate, tax rate).

POSTING_TEMPLATES = {
    "sales": {
        "name": "Sales Posting",
        "description": "Debit: Accounts Receivable | Credit: Sales Revenue + VAT Output Payable",
        "rules": "Total Debit = Total Credit. VAT = gross × VAT rate.",
        "accounts": {
            "debit": [{"code": "1100", "label": "Accounts Receivable", "compute": "gross_amount"}],
            "credit": [
                {"code": "4000", "label": "Sales Revenue", "compute": "net_amount"},
                {"code": "2210", "label": "VAT Output Payable", "compute": "vat_amount"},
            ],
        },
    },
    "collection": {
        "name": "Collection Posting",
        "description": "Debit: Cash/Bank + CWT Receivable | Credit: Accounts Receivable",
        "rules": "Total Debit = Total Credit. CWT = gross × CWT rate.",
        "accounts": {
            "debit": [
                {"code": "1020", "label": "Cash in Bank", "compute": "net_collection"},
                {"code": "1110", "label": "CWT Receivable", "compute": "cwt_amount"},
            ],
            "credit": [{"code": "1100", "label": "Accounts Receivable", "compute": "gross_amount"}],
        },
    },
    "purchase": {
        "name": "Purchase Posting",
        "description": "Debit: Inventory/Expense + VAT Input | Credit: Accounts Payable",
        "rules": "Total Debit = Total Credit. VAT Input = gross × VAT rate.",
        "accounts": {
            "debit": [
                {"code": "1200", "label": "Inventory / Expense", "compute": "net_amount"},
                {"code": "1120", "label": "VAT Input", "compute": "vat_amount"},
            ],
            "credit": [{"code": "2000", "label": "Accounts Payable", "compute": "gross_amount"}],
        },
    },
    "payment": {
        "name": "Payment Posting",
        "description": "Debit: Accounts Payable | Credit: Cash/Bank + EWT Payable",
        "rules": "Total Debit = Total Credit. EWT = gross × EWT rate.",
        "accounts": {
            "debit": [{"code": "2000", "label": "Accounts Payable", "compute": "gross_amount"}],
            "credit": [
                {"code": "1020", "label": "Cash in Bank", "compute": "net_payment"},
                {"code": "2310", "label": "EWT Payable", "compute": "ewt_amount"},
            ],
        },
    },
}


class TemplatePostPayload(BaseModel):
    template: str
    entry_date: date
    gross_amount: float
    vat_rate: float = 0.12
    tax_rate: float = 0.0  # CWT or EWT rate
    description: Optional[str] = None
    reference_module: Optional[str] = None
    reference_number: Optional[str] = None
    entity: Optional[str] = None
    expense_account_code: Optional[str] = None  # Override the default debit account for purchases

    @field_validator("template")
    @classmethod
    def _tmpl(cls, v):
        if v not in POSTING_TEMPLATES:
            raise ValueError(f"Must be one of: {', '.join(POSTING_TEMPLATES.keys())}")
        return v

    @field_validator("entity")
    @classmethod
    def _ent(cls, v):
        if v is not None and v != "" and v not in ENTITIES:
            raise ValueError(f"Must be one of: {', '.join(ENTITIES)}")
        return v or None


@router.get("/templates")
def list_templates():
    """Return the available posting templates with their rules and account mappings."""
    return [
        {"key": k, **{kk: vv for kk, vv in v.items() if kk != "accounts"}, "accounts": v["accounts"]}
        for k, v in POSTING_TEMPLATES.items()
    ]


@router.post("/templates/post", status_code=201)
def post_from_template(request: Request, payload: TemplatePostPayload):
    """Generate and immediately post a journal entry from a standard template.

    Computations:
      - net_amount = gross_amount / (1 + vat_rate)
      - vat_amount = gross_amount - net_amount
      - cwt_amount = gross_amount × tax_rate
      - net_collection = gross_amount - cwt_amount
      - ewt_amount = gross_amount × tax_rate
      - net_payment = gross_amount - ewt_amount
    """
    _, performed_by = _extract_jwt_claims(request)
    tmpl = POSTING_TEMPLATES[payload.template]

    gross = round(payload.gross_amount, 2)
    vat_rate = payload.vat_rate
    tax_rate = payload.tax_rate

    net_amount = round(gross / (1 + vat_rate), 2) if vat_rate > 0 else gross
    vat_amount = round(gross - net_amount, 2)
    cwt_amount = round(gross * tax_rate, 2)
    ewt_amount = round(gross * tax_rate, 2)
    net_collection = round(gross - cwt_amount, 2)
    net_payment = round(gross - ewt_amount, 2)

    compute_map = {
        "gross_amount": gross,
        "net_amount": net_amount,
        "vat_amount": vat_amount,
        "cwt_amount": cwt_amount,
        "net_collection": net_collection,
        "ewt_amount": ewt_amount,
        "net_payment": net_payment,
    }

    # Resolve account codes → account_ids
    all_codes = set()
    for side in ("debit", "credit"):
        for acct in tmpl["accounts"][side]:
            code = acct["code"]
            # Allow override for expense/inventory account
            if payload.expense_account_code and acct["compute"] == "net_amount" and payload.template == "purchase":
                code = payload.expense_account_code
            all_codes.add(code)

    acct_res = supabase.table("gl_accounts").select("account_id, account_code").in_("account_code", list(all_codes)).execute()
    code_to_id = {a["account_code"]: a["account_id"] for a in (acct_res.data or [])}

    # Build lines
    lines = []
    for acct in tmpl["accounts"]["debit"]:
        code = acct["code"]
        if payload.expense_account_code and acct["compute"] == "net_amount" and payload.template == "purchase":
            code = payload.expense_account_code
        amount = compute_map.get(acct["compute"], 0)
        if amount > 0 and code in code_to_id:
            lines.append(JournalLineInput(account_id=code_to_id[code], description=acct["label"], debit=amount, credit=0))

    for acct in tmpl["accounts"]["credit"]:
        code = acct["code"]
        amount = compute_map.get(acct["compute"], 0)
        if amount > 0 and code in code_to_id:
            lines.append(JournalLineInput(account_id=code_to_id[code], description=acct["label"], debit=0, credit=amount))

    if len(lines) < 2:
        raise HTTPException(status_code=422, detail={"error": "Template produced fewer than 2 lines. Check amounts and account codes."})

    # Validate balance
    total_d = round(sum(ln.debit for ln in lines), 2)
    total_c = round(sum(ln.credit for ln in lines), 2)
    if total_d != total_c:
        raise HTTPException(status_code=422, detail={"error": f"Template produced unbalanced entry: Dr {total_d} ≠ Cr {total_c}. Adjust amounts."})

    # Create and auto-post
    entry_payload = JournalEntryCreate(
        entry_date=payload.entry_date,
        description=payload.description or tmpl["name"],
        reference_module=payload.reference_module,
        reference_number=payload.reference_number,
        entity=payload.entity,
        lines=lines,
    )

    # Use the existing create endpoint logic inline
    entry_number = _next_entry_number(payload.entity)
    header = {
        "entry_number": entry_number,
        "entry_date": payload.entry_date.isoformat(),
        "description": payload.description or tmpl["name"],
        "reference_module": payload.reference_module,
        "reference_number": payload.reference_number,
        "entity": payload.entity,
        "status": "Posted",
        "posted_by": performed_by,
        "posted_at": datetime.now().isoformat(),
        "total_debit": total_d,
        "total_credit": total_c,
    }

    res = supabase.table("gl_journal_entries").insert(header).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create journal entry."})
    entry = res.data[0]
    entry_id = entry["entry_id"]

    lines_data = [{"entry_id": entry_id, "account_id": ln.account_id, "description": ln.description, "debit": ln.debit, "credit": ln.credit} for ln in lines]
    supabase.table("gl_journal_lines").insert(lines_data).execute()

    write_audit_log(
        action="CREATE", module_name=MODULE_NAME,
        description=f"Auto-posted {tmpl['name']} entry {entry_number} (₱{gross:,.2f})",
        performed_by=performed_by, record_id=entry_id,
        ip_address=request.client.host if request.client else None, request=request,
    )
    return _decorate_entry(entry)

# ══════════════════════════════════════════════════════════════════════════════
# BIR 6 BOOKS OF ACCOUNTS — Cash Receipts Book
# ══════════════════════════════════════════════════════════════════════════════

class CashReceiptCreate(BaseModel):
    entity: str
    receipt_date: date
    or_ar_ref_no: Optional[str] = None
    customer_source: Optional[str] = None
    customer_id: Optional[int] = None
    tin: Optional[str] = None
    description: Optional[str] = None
    receipt_mode: Optional[str] = None
    bank_cash_account: Optional[str] = None
    gross_receipt_amount: float = 0
    output_vat: float = 0
    ewt_withholding_tax: float = 0
    net_amount_deposited: float = 0
    invoice_ref: Optional[str] = None
    account_code: Optional[str] = None
    account_id: Optional[int] = None
    remarks: Optional[str] = None

    @field_validator("entity")
    @classmethod
    def _ent(cls, v):
        if v not in ENTITIES:
            raise ValueError(f"Must be one of: {', '.join(ENTITIES)}")
        return v


class CashReceiptUpdate(BaseModel):
    receipt_date: Optional[date] = None
    or_ar_ref_no: Optional[str] = None
    customer_source: Optional[str] = None
    customer_id: Optional[int] = None
    tin: Optional[str] = None
    description: Optional[str] = None
    receipt_mode: Optional[str] = None
    bank_cash_account: Optional[str] = None
    gross_receipt_amount: Optional[float] = None
    output_vat: Optional[float] = None
    ewt_withholding_tax: Optional[float] = None
    net_amount_deposited: Optional[float] = None
    invoice_ref: Optional[str] = None
    account_code: Optional[str] = None
    account_id: Optional[int] = None
    posting_status: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/books/cash-receipts")
def list_cash_receipts(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    posting_status: Optional[str] = Query(None),
):
    req = supabase.table("gl_cash_receipts").select("*").order("receipt_date", desc=True)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("receipt_date", date_from.isoformat())
    if date_to:
        req = req.lte("receipt_date", date_to.isoformat())
    if posting_status:
        req = req.eq("posting_status", posting_status)
    return req.execute().data or []


@router.get("/books/cash-receipts/{receipt_id}")
def get_cash_receipt(receipt_id: int):
    res = supabase.table("gl_cash_receipts").select("*").eq("receipt_id", receipt_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Cash receipt not found."})
    return res.data[0]


@router.post("/books/cash-receipts", status_code=201)
def create_cash_receipt(request: Request, payload: CashReceiptCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = payload.model_dump(exclude_unset=True)
    data["created_by"] = performed_by
    res = supabase.table("gl_cash_receipts").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create cash receipt."})
    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Created cash receipt — {payload.or_ar_ref_no or 'manual'}", performed_by=performed_by, record_id=res.data[0]["receipt_id"], ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.patch("/books/cash-receipts/{receipt_id}")
def update_cash_receipt(receipt_id: int, request: Request, payload: CashReceiptUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return get_cash_receipt(receipt_id)
    updates["updated_at"] = datetime.now().isoformat()
    res = supabase.table("gl_cash_receipts").update(updates).eq("receipt_id", receipt_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Cash receipt not found."})
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Updated cash receipt #{receipt_id}", performed_by=performed_by, record_id=receipt_id, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.delete("/books/cash-receipts/{receipt_id}", status_code=204)
def delete_cash_receipt(receipt_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_cash_receipts").select("*").eq("receipt_id", receipt_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Cash receipt not found."})
    if res.data[0].get("posting_status") == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Cannot delete a posted receipt. Void it instead."})
    supabase.table("gl_cash_receipts").delete().eq("receipt_id", receipt_id).execute()
    write_audit_log(action="DELETE", module_name=MODULE_NAME, description=f"Deleted cash receipt #{receipt_id}", performed_by=performed_by, record_id=receipt_id, ip_address=request.client.host if request.client else None, request=request)
    return None


@router.post("/books/cash-receipts/{receipt_id}/post")
def post_cash_receipt(receipt_id: int, request: Request):
    """Post a cash receipt and auto-create GL journal entry."""
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_cash_receipts").select("*").eq("receipt_id", receipt_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Cash receipt not found."})
    receipt = res.data[0]
    if receipt.get("posting_status") == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Already posted."})
    # Auto-post to GL using collection template logic
    gross = float(receipt.get("gross_receipt_amount") or 0)
    if gross > 0:
        _auto_post_receipt_to_gl(receipt, performed_by, request)
    supabase.table("gl_cash_receipts").update({"posting_status": "Posted", "updated_at": datetime.now().isoformat()}).eq("receipt_id", receipt_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Posted cash receipt #{receipt_id}", performed_by=performed_by, record_id=receipt_id, ip_address=request.client.host if request.client else None, request=request)
    return get_cash_receipt(receipt_id)


def _auto_post_receipt_to_gl(receipt: dict, performed_by: str, request: Request):
    """Create a posted GL journal entry from a cash receipt (collection pattern)."""
    gross = float(receipt.get("gross_receipt_amount") or 0)
    ewt = float(receipt.get("ewt_withholding_tax") or 0)
    net = float(receipt.get("net_amount_deposited") or 0)
    entity = receipt.get("entity")
    entry_number = _next_entry_number(entity)
    now = datetime.now().isoformat()
    desc = f"Cash Receipt — {receipt.get('or_ar_ref_no') or receipt.get('customer_source') or 'Manual'}"

    # Resolve accounts: Cash in Bank (debit), CWT (debit if ewt > 0), AR (credit)
    acct_codes = ["1020", "1100"]
    if ewt > 0:
        acct_codes.append("1110")
    acct_res = supabase.table("gl_accounts").select("account_id, account_code").in_("account_code", acct_codes).execute()
    code_to_id = {a["account_code"]: a["account_id"] for a in (acct_res.data or [])}

    lines = []
    if net > 0 and "1020" in code_to_id:
        lines.append({"account_id": code_to_id["1020"], "description": "Cash in Bank", "debit": round(net, 2), "credit": 0})
    if ewt > 0 and "1110" in code_to_id:
        lines.append({"account_id": code_to_id["1110"], "description": "CWT Receivable", "debit": round(ewt, 2), "credit": 0})
    if gross > 0 and "1100" in code_to_id:
        lines.append({"account_id": code_to_id["1100"], "description": "Accounts Receivable", "debit": 0, "credit": round(gross, 2)})

    if len(lines) < 2:
        return  # Cannot post without proper accounts

    total_d = round(sum(l["debit"] for l in lines), 2)
    total_c = round(sum(l["credit"] for l in lines), 2)
    header = {
        "entry_number": entry_number, "entry_date": receipt.get("receipt_date"),
        "description": desc, "reference_module": "Cash Receipts Book",
        "reference_number": receipt.get("or_ar_ref_no"), "entity": entity,
        "status": "Posted", "posted_by": performed_by, "posted_at": now,
        "total_debit": total_d, "total_credit": total_c,
    }
    res = supabase.table("gl_journal_entries").insert(header).execute()
    if res.data:
        entry_id = res.data[0]["entry_id"]
        for ln in lines:
            ln["entry_id"] = entry_id
        supabase.table("gl_journal_lines").insert(lines).execute()
        supabase.table("gl_cash_receipts").update({"gl_entry_id": entry_id}).eq("receipt_id", receipt["receipt_id"]).execute()


# ══════════════════════════════════════════════════════════════════════════════
# BIR 6 BOOKS OF ACCOUNTS — Cash Disbursements Book
# ══════════════════════════════════════════════════════════════════════════════

class CashDisbursementCreate(BaseModel):
    entity: str
    disbursement_date: date
    cv_check_ref_no: Optional[str] = None
    payee_supplier: Optional[str] = None
    supplier_id: Optional[int] = None
    tin: Optional[str] = None
    description: Optional[str] = None
    payment_mode: Optional[str] = None
    bank_cash_account: Optional[str] = None
    expense_account_title: Optional[str] = None
    gross_payment_amount: float = 0
    input_vat: float = 0
    ewt_withholding_tax: float = 0
    net_cash_paid: float = 0
    invoice_billing_ref: Optional[str] = None
    account_code: Optional[str] = None
    account_id: Optional[int] = None
    remarks: Optional[str] = None

    @field_validator("entity")
    @classmethod
    def _ent(cls, v):
        if v not in ENTITIES:
            raise ValueError(f"Must be one of: {', '.join(ENTITIES)}")
        return v


class CashDisbursementUpdate(BaseModel):
    disbursement_date: Optional[date] = None
    cv_check_ref_no: Optional[str] = None
    payee_supplier: Optional[str] = None
    supplier_id: Optional[int] = None
    tin: Optional[str] = None
    description: Optional[str] = None
    payment_mode: Optional[str] = None
    bank_cash_account: Optional[str] = None
    expense_account_title: Optional[str] = None
    gross_payment_amount: Optional[float] = None
    input_vat: Optional[float] = None
    ewt_withholding_tax: Optional[float] = None
    net_cash_paid: Optional[float] = None
    invoice_billing_ref: Optional[str] = None
    account_code: Optional[str] = None
    account_id: Optional[int] = None
    posting_status: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/books/cash-disbursements")
def list_cash_disbursements(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    posting_status: Optional[str] = Query(None),
):
    req = supabase.table("gl_cash_disbursements").select("*").order("disbursement_date", desc=True)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("disbursement_date", date_from.isoformat())
    if date_to:
        req = req.lte("disbursement_date", date_to.isoformat())
    if posting_status:
        req = req.eq("posting_status", posting_status)
    return req.execute().data or []


@router.get("/books/cash-disbursements/{disbursement_id}")
def get_cash_disbursement(disbursement_id: int):
    res = supabase.table("gl_cash_disbursements").select("*").eq("disbursement_id", disbursement_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Cash disbursement not found."})
    return res.data[0]


@router.post("/books/cash-disbursements", status_code=201)
def create_cash_disbursement(request: Request, payload: CashDisbursementCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = payload.model_dump(exclude_unset=True)
    data["created_by"] = performed_by
    res = supabase.table("gl_cash_disbursements").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create cash disbursement."})
    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Created cash disbursement — {payload.cv_check_ref_no or 'manual'}", performed_by=performed_by, record_id=res.data[0]["disbursement_id"], ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.patch("/books/cash-disbursements/{disbursement_id}")
def update_cash_disbursement(disbursement_id: int, request: Request, payload: CashDisbursementUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return get_cash_disbursement(disbursement_id)
    updates["updated_at"] = datetime.now().isoformat()
    res = supabase.table("gl_cash_disbursements").update(updates).eq("disbursement_id", disbursement_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Cash disbursement not found."})
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Updated cash disbursement #{disbursement_id}", performed_by=performed_by, record_id=disbursement_id, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.delete("/books/cash-disbursements/{disbursement_id}", status_code=204)
def delete_cash_disbursement(disbursement_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_cash_disbursements").select("*").eq("disbursement_id", disbursement_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Cash disbursement not found."})
    if res.data[0].get("posting_status") == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Cannot delete a posted disbursement. Void it instead."})
    supabase.table("gl_cash_disbursements").delete().eq("disbursement_id", disbursement_id).execute()
    write_audit_log(action="DELETE", module_name=MODULE_NAME, description=f"Deleted cash disbursement #{disbursement_id}", performed_by=performed_by, record_id=disbursement_id, ip_address=request.client.host if request.client else None, request=request)
    return None


@router.post("/books/cash-disbursements/{disbursement_id}/post")
def post_cash_disbursement(disbursement_id: int, request: Request):
    """Post a cash disbursement and auto-create GL journal entry."""
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_cash_disbursements").select("*").eq("disbursement_id", disbursement_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Cash disbursement not found."})
    disb = res.data[0]
    if disb.get("posting_status") == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Already posted."})
    gross = float(disb.get("gross_payment_amount") or 0)
    if gross > 0:
        _auto_post_disbursement_to_gl(disb, performed_by, request)
    supabase.table("gl_cash_disbursements").update({"posting_status": "Posted", "updated_at": datetime.now().isoformat()}).eq("disbursement_id", disbursement_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Posted cash disbursement #{disbursement_id}", performed_by=performed_by, record_id=disbursement_id, ip_address=request.client.host if request.client else None, request=request)
    return get_cash_disbursement(disbursement_id)


def _auto_post_disbursement_to_gl(disb: dict, performed_by: str, request: Request):
    """Create a posted GL journal entry from a cash disbursement (payment pattern)."""
    gross = float(disb.get("gross_payment_amount") or 0)
    ewt = float(disb.get("ewt_withholding_tax") or 0)
    net = float(disb.get("net_cash_paid") or 0)
    entity = disb.get("entity")
    entry_number = _next_entry_number(entity)
    now = datetime.now().isoformat()
    desc = f"Cash Disbursement — {disb.get('cv_check_ref_no') or disb.get('payee_supplier') or 'Manual'}"

    acct_codes = ["2000", "1020"]
    if ewt > 0:
        acct_codes.append("2310")
    acct_res = supabase.table("gl_accounts").select("account_id, account_code").in_("account_code", acct_codes).execute()
    code_to_id = {a["account_code"]: a["account_id"] for a in (acct_res.data or [])}

    lines = []
    if gross > 0 and "2000" in code_to_id:
        lines.append({"account_id": code_to_id["2000"], "description": "Accounts Payable", "debit": round(gross, 2), "credit": 0})
    if net > 0 and "1020" in code_to_id:
        lines.append({"account_id": code_to_id["1020"], "description": "Cash in Bank", "debit": 0, "credit": round(net, 2)})
    if ewt > 0 and "2310" in code_to_id:
        lines.append({"account_id": code_to_id["2310"], "description": "EWT Payable", "debit": 0, "credit": round(ewt, 2)})

    if len(lines) < 2:
        return

    total_d = round(sum(l["debit"] for l in lines), 2)
    total_c = round(sum(l["credit"] for l in lines), 2)
    header = {
        "entry_number": entry_number, "entry_date": disb.get("disbursement_date"),
        "description": desc, "reference_module": "Cash Disbursements Book",
        "reference_number": disb.get("cv_check_ref_no"), "entity": entity,
        "status": "Posted", "posted_by": performed_by, "posted_at": now,
        "total_debit": total_d, "total_credit": total_c,
    }
    res = supabase.table("gl_journal_entries").insert(header).execute()
    if res.data:
        entry_id = res.data[0]["entry_id"]
        for ln in lines:
            ln["entry_id"] = entry_id
        supabase.table("gl_journal_lines").insert(lines).execute()
        supabase.table("gl_cash_disbursements").update({"gl_entry_id": entry_id}).eq("disbursement_id", disb["disbursement_id"]).execute()


# ══════════════════════════════════════════════════════════════════════════════
# BIR 6 BOOKS OF ACCOUNTS — Sales Book
# ══════════════════════════════════════════════════════════════════════════════

class SalesBookCreate(BaseModel):
    entity: str
    sales_date: date
    sales_invoice_no: Optional[str] = None
    customer_name: Optional[str] = None
    customer_id: Optional[int] = None
    tin: Optional[str] = None
    description_of_goods_services: Optional[str] = None
    vat_type: str = "VATable"
    vatable_sales: float = 0
    vat_exempt_sales: float = 0
    zero_rated_sales: float = 0
    output_vat: float = 0
    total_invoice_amount: float = 0
    cash_or_ar: str = "Accounts Receivable"
    collection_status: str = "Unpaid"
    account_code: Optional[str] = None
    account_id: Optional[int] = None
    remarks: Optional[str] = None

    @field_validator("entity")
    @classmethod
    def _ent(cls, v):
        if v not in ENTITIES:
            raise ValueError(f"Must be one of: {', '.join(ENTITIES)}")
        return v


class SalesBookUpdate(BaseModel):
    sales_date: Optional[date] = None
    sales_invoice_no: Optional[str] = None
    customer_name: Optional[str] = None
    customer_id: Optional[int] = None
    tin: Optional[str] = None
    description_of_goods_services: Optional[str] = None
    vat_type: Optional[str] = None
    vatable_sales: Optional[float] = None
    vat_exempt_sales: Optional[float] = None
    zero_rated_sales: Optional[float] = None
    output_vat: Optional[float] = None
    total_invoice_amount: Optional[float] = None
    cash_or_ar: Optional[str] = None
    collection_status: Optional[str] = None
    account_code: Optional[str] = None
    account_id: Optional[int] = None
    posting_status: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/books/sales")
def list_sales_book(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    posting_status: Optional[str] = Query(None),
):
    req = supabase.table("gl_sales_book").select("*").order("sales_date", desc=True)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("sales_date", date_from.isoformat())
    if date_to:
        req = req.lte("sales_date", date_to.isoformat())
    if posting_status:
        req = req.eq("posting_status", posting_status)
    rows = req.execute().data or []

    # Sync collection_status from source AR invoices (live lookup)
    ar_source_ids = [r["source_id"] for r in rows if r.get("source_module") == "Accounts Receivable" and r.get("source_id")]
    if ar_source_ids:
        inv_status_map = {}
        for i in range(0, len(ar_source_ids), 100):
            batch = ar_source_ids[i:i+100]
            invoices = supabase.table("ar_invoices").select("invoice_id, collection_status").in_("invoice_id", batch).execute().data or []
            for inv in invoices:
                inv_status_map[inv["invoice_id"]] = inv.get("collection_status", "Unpaid")
        for r in rows:
            if r.get("source_module") == "Accounts Receivable" and r.get("source_id") in inv_status_map:
                r["collection_status"] = inv_status_map[r["source_id"]]

    return rows


@router.get("/books/sales/{sales_book_id}")
def get_sales_book_entry(sales_book_id: int):
    res = supabase.table("gl_sales_book").select("*").eq("sales_book_id", sales_book_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Sales book entry not found."})
    return res.data[0]


@router.post("/books/sales", status_code=201)
def create_sales_book_entry(request: Request, payload: SalesBookCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = payload.model_dump(exclude_unset=True)
    data["created_by"] = performed_by
    res = supabase.table("gl_sales_book").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create sales book entry."})
    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Created sales book entry — {payload.sales_invoice_no or 'manual'}", performed_by=performed_by, record_id=res.data[0]["sales_book_id"], ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.patch("/books/sales/{sales_book_id}")
def update_sales_book_entry(sales_book_id: int, request: Request, payload: SalesBookUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return get_sales_book_entry(sales_book_id)
    updates["updated_at"] = datetime.now().isoformat()
    res = supabase.table("gl_sales_book").update(updates).eq("sales_book_id", sales_book_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Sales book entry not found."})
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Updated sales book entry #{sales_book_id}", performed_by=performed_by, record_id=sales_book_id, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.delete("/books/sales/{sales_book_id}", status_code=204)
def delete_sales_book_entry(sales_book_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_sales_book").select("*").eq("sales_book_id", sales_book_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Sales book entry not found."})
    if res.data[0].get("posting_status") == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Cannot delete a posted entry. Void it instead."})
    supabase.table("gl_sales_book").delete().eq("sales_book_id", sales_book_id).execute()
    write_audit_log(action="DELETE", module_name=MODULE_NAME, description=f"Deleted sales book entry #{sales_book_id}", performed_by=performed_by, record_id=sales_book_id, ip_address=request.client.host if request.client else None, request=request)
    return None


@router.post("/books/sales/{sales_book_id}/post")
def post_sales_book_entry(sales_book_id: int, request: Request):
    """Post a sales book entry and auto-create GL journal entry."""
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_sales_book").select("*").eq("sales_book_id", sales_book_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Sales book entry not found."})
    sale = res.data[0]
    if sale.get("posting_status") == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Already posted."})
    total = float(sale.get("total_invoice_amount") or 0)
    if total > 0:
        _auto_post_sale_to_gl(sale, performed_by, request)
    supabase.table("gl_sales_book").update({"posting_status": "Posted", "updated_at": datetime.now().isoformat()}).eq("sales_book_id", sales_book_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Posted sales book entry #{sales_book_id}", performed_by=performed_by, record_id=sales_book_id, ip_address=request.client.host if request.client else None, request=request)
    return get_sales_book_entry(sales_book_id)


def _auto_post_sale_to_gl(sale: dict, performed_by: str, request: Request):
    """Create a posted GL journal entry from a sales book entry (sales pattern)."""
    total = float(sale.get("total_invoice_amount") or 0)
    vat = float(sale.get("output_vat") or 0)
    net_sales = round(total - vat, 2)
    entity = sale.get("entity")
    entry_number = _next_entry_number(entity)
    now = datetime.now().isoformat()
    desc = f"Sales Book — {sale.get('sales_invoice_no') or sale.get('customer_name') or 'Manual'}"

    acct_codes = ["1100", "4000", "2210"]
    acct_res = supabase.table("gl_accounts").select("account_id, account_code").in_("account_code", acct_codes).execute()
    code_to_id = {a["account_code"]: a["account_id"] for a in (acct_res.data or [])}

    lines = []
    if total > 0 and "1100" in code_to_id:
        lines.append({"account_id": code_to_id["1100"], "description": "Accounts Receivable", "debit": round(total, 2), "credit": 0})
    if net_sales > 0 and "4000" in code_to_id:
        lines.append({"account_id": code_to_id["4000"], "description": "Sales Revenue", "debit": 0, "credit": round(net_sales, 2)})
    if vat > 0 and "2210" in code_to_id:
        lines.append({"account_id": code_to_id["2210"], "description": "VAT Output Payable", "debit": 0, "credit": round(vat, 2)})

    if len(lines) < 2:
        return

    total_d = round(sum(l["debit"] for l in lines), 2)
    total_c = round(sum(l["credit"] for l in lines), 2)
    header = {
        "entry_number": entry_number, "entry_date": sale.get("sales_date"),
        "description": desc, "reference_module": "Sales Book",
        "reference_number": sale.get("sales_invoice_no"), "entity": entity,
        "status": "Posted", "posted_by": performed_by, "posted_at": now,
        "total_debit": total_d, "total_credit": total_c,
    }
    res = supabase.table("gl_journal_entries").insert(header).execute()
    if res.data:
        entry_id = res.data[0]["entry_id"]
        for ln in lines:
            ln["entry_id"] = entry_id
        supabase.table("gl_journal_lines").insert(lines).execute()
        supabase.table("gl_sales_book").update({"gl_entry_id": entry_id}).eq("sales_book_id", sale["sales_book_id"]).execute()


# ══════════════════════════════════════════════════════════════════════════════
# BIR 6 BOOKS OF ACCOUNTS — Purchases Book
# ══════════════════════════════════════════════════════════════════════════════

class PurchasesBookCreate(BaseModel):
    entity: str
    purchase_date: date
    supplier_invoice_or_no: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_id: Optional[int] = None
    tin: Optional[str] = None
    description_of_purchase: Optional[str] = None
    vat_type: str = "VATable"
    purchase_amount: float = 0
    input_vat: float = 0
    total_invoice_amount: float = 0
    cash_or_ap: str = "Accounts Payable"
    payment_status: str = "Unpaid"
    expense_asset_account: Optional[str] = None
    account_code: Optional[str] = None
    account_id: Optional[int] = None
    remarks: Optional[str] = None

    @field_validator("entity")
    @classmethod
    def _ent(cls, v):
        if v not in ENTITIES:
            raise ValueError(f"Must be one of: {', '.join(ENTITIES)}")
        return v


class PurchasesBookUpdate(BaseModel):
    purchase_date: Optional[date] = None
    supplier_invoice_or_no: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_id: Optional[int] = None
    tin: Optional[str] = None
    description_of_purchase: Optional[str] = None
    vat_type: Optional[str] = None
    purchase_amount: Optional[float] = None
    input_vat: Optional[float] = None
    total_invoice_amount: Optional[float] = None
    cash_or_ap: Optional[str] = None
    payment_status: Optional[str] = None
    expense_asset_account: Optional[str] = None
    account_code: Optional[str] = None
    account_id: Optional[int] = None
    posting_status: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/books/purchases")
def list_purchases_book(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    posting_status: Optional[str] = Query(None),
):
    req = supabase.table("gl_purchases_book").select("*").order("purchase_date", desc=True)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("purchase_date", date_from.isoformat())
    if date_to:
        req = req.lte("purchase_date", date_to.isoformat())
    if posting_status:
        req = req.eq("posting_status", posting_status)
    rows = req.execute().data or []

    # Sync payment_status from source AP bills (live lookup)
    ap_source_ids = [r["source_id"] for r in rows if r.get("source_module") == "Accounts Payable" and r.get("source_id")]
    if ap_source_ids:
        bill_status_map = {}
        for i in range(0, len(ap_source_ids), 100):
            batch = ap_source_ids[i:i+100]
            bills = supabase.table("ap_bills").select("bill_id, payment_status").in_("bill_id", batch).execute().data or []
            for b in bills:
                bill_status_map[b["bill_id"]] = b.get("payment_status", "Unpaid")
        for r in rows:
            if r.get("source_module") == "Accounts Payable" and r.get("source_id") in bill_status_map:
                r["payment_status"] = bill_status_map[r["source_id"]]

    return rows


@router.get("/books/purchases/{purchase_book_id}")
def get_purchases_book_entry(purchase_book_id: int):
    res = supabase.table("gl_purchases_book").select("*").eq("purchase_book_id", purchase_book_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Purchases book entry not found."})
    return res.data[0]


@router.post("/books/purchases", status_code=201)
def create_purchases_book_entry(request: Request, payload: PurchasesBookCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = payload.model_dump(exclude_unset=True)
    data["created_by"] = performed_by
    res = supabase.table("gl_purchases_book").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail={"error": "Failed to create purchases book entry."})
    write_audit_log(action="CREATE", module_name=MODULE_NAME, description=f"Created purchases book entry — {payload.supplier_invoice_or_no or 'manual'}", performed_by=performed_by, record_id=res.data[0]["purchase_book_id"], ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.patch("/books/purchases/{purchase_book_id}")
def update_purchases_book_entry(purchase_book_id: int, request: Request, payload: PurchasesBookUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return get_purchases_book_entry(purchase_book_id)
    updates["updated_at"] = datetime.now().isoformat()
    res = supabase.table("gl_purchases_book").update(updates).eq("purchase_book_id", purchase_book_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Purchases book entry not found."})
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Updated purchases book entry #{purchase_book_id}", performed_by=performed_by, record_id=purchase_book_id, ip_address=request.client.host if request.client else None, request=request)
    return res.data[0]


@router.delete("/books/purchases/{purchase_book_id}", status_code=204)
def delete_purchases_book_entry(purchase_book_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_purchases_book").select("*").eq("purchase_book_id", purchase_book_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Purchases book entry not found."})
    if res.data[0].get("posting_status") == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Cannot delete a posted entry. Void it instead."})
    supabase.table("gl_purchases_book").delete().eq("purchase_book_id", purchase_book_id).execute()
    write_audit_log(action="DELETE", module_name=MODULE_NAME, description=f"Deleted purchases book entry #{purchase_book_id}", performed_by=performed_by, record_id=purchase_book_id, ip_address=request.client.host if request.client else None, request=request)
    return None


@router.post("/books/purchases/{purchase_book_id}/post")
def post_purchases_book_entry(purchase_book_id: int, request: Request):
    """Post a purchases book entry and auto-create GL journal entry."""
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_purchases_book").select("*").eq("purchase_book_id", purchase_book_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Purchases book entry not found."})
    purchase = res.data[0]
    if purchase.get("posting_status") == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Already posted."})
    total = float(purchase.get("total_invoice_amount") or 0)
    if total > 0:
        _auto_post_purchase_to_gl(purchase, performed_by, request)
    supabase.table("gl_purchases_book").update({"posting_status": "Posted", "updated_at": datetime.now().isoformat()}).eq("purchase_book_id", purchase_book_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Posted purchases book entry #{purchase_book_id}", performed_by=performed_by, record_id=purchase_book_id, ip_address=request.client.host if request.client else None, request=request)
    return get_purchases_book_entry(purchase_book_id)


def _auto_post_purchase_to_gl(purchase: dict, performed_by: str, request: Request):
    """Create a posted GL journal entry from a purchases book entry."""
    total = float(purchase.get("total_invoice_amount") or 0)
    vat = float(purchase.get("input_vat") or 0)
    net_purchase = float(purchase.get("purchase_amount") or 0)
    entity = purchase.get("entity")
    entry_number = _next_entry_number(entity)
    now = datetime.now().isoformat()
    desc = f"Purchases Book — {purchase.get('supplier_invoice_or_no') or purchase.get('supplier_name') or 'Manual'}"

    acct_codes = ["1200", "1120", "2000"]
    acct_res = supabase.table("gl_accounts").select("account_id, account_code").in_("account_code", acct_codes).execute()
    code_to_id = {a["account_code"]: a["account_id"] for a in (acct_res.data or [])}

    lines = []
    if net_purchase > 0 and "1200" in code_to_id:
        lines.append({"account_id": code_to_id["1200"], "description": "Inventory / Expense", "debit": round(net_purchase, 2), "credit": 0})
    if vat > 0 and "1120" in code_to_id:
        lines.append({"account_id": code_to_id["1120"], "description": "VAT Input", "debit": round(vat, 2), "credit": 0})
    if total > 0 and "2000" in code_to_id:
        lines.append({"account_id": code_to_id["2000"], "description": "Accounts Payable", "debit": 0, "credit": round(total, 2)})

    if len(lines) < 2:
        return

    total_d = round(sum(l["debit"] for l in lines), 2)
    total_c = round(sum(l["credit"] for l in lines), 2)
    header = {
        "entry_number": entry_number, "entry_date": purchase.get("purchase_date"),
        "description": desc, "reference_module": "Purchases Book",
        "reference_number": purchase.get("supplier_invoice_or_no"), "entity": entity,
        "status": "Posted", "posted_by": performed_by, "posted_at": now,
        "total_debit": total_d, "total_credit": total_c,
    }
    res = supabase.table("gl_journal_entries").insert(header).execute()
    if res.data:
        entry_id = res.data[0]["entry_id"]
        for ln in lines:
            ln["entry_id"] = entry_id
        supabase.table("gl_journal_lines").insert(lines).execute()
        supabase.table("gl_purchases_book").update({"gl_entry_id": entry_id}).eq("purchase_book_id", purchase["purchase_book_id"]).execute()


# ══════════════════════════════════════════════════════════════════════════════
# BIR 6 BOOKS — General Ledger Postings (aggregated view)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/books/ledger-postings")
def list_ledger_postings(
    entity: Optional[str] = Query(None),
    account_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    req = supabase.table("gl_ledger_postings").select("*").order("posting_date", desc=True)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if account_id:
        req = req.eq("account_id", account_id)
    if date_from:
        req = req.gte("posting_date", date_from.isoformat())
    if date_to:
        req = req.lte("posting_date", date_to.isoformat())
    return req.execute().data or []


@router.get("/books/summary")
def books_summary(entity: Optional[str] = Query(None)):
    """Summary metrics for the BIR books dashboard."""
    def _count(table, date_col, ent):
        req = supabase.table(table).select("*", count="exact")
        if ent and ent != "All":
            req = req.eq("entity", ent)
        res = req.execute()
        return len(res.data) if res.data else 0

    return {
        "cash_receipts_count": _count("gl_cash_receipts", "receipt_date", entity),
        "cash_disbursements_count": _count("gl_cash_disbursements", "disbursement_date", entity),
        "sales_book_count": _count("gl_sales_book", "sales_date", entity),
        "purchases_book_count": _count("gl_purchases_book", "purchase_date", entity),
    }


# ══════════════════════════════════════════════════════════════════════════════
# BIR BOOKS — XLSX EXPORTS (BIR Loose-Leaf Format)
# ══════════════════════════════════════════════════════════════════════════════


def _build_bir_xlsx(*, entity: Optional[str], date_from: Optional[date], date_to: Optional[date], book_name: str, col_headers: list, rows: list[list], sum_columns: list[int] | None = None):
    """Shared helper to create a BIR-format Excel export with header, bold columns, and totals."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    # Fetch entity tax profile for BIR header
    taxpayer_name = entity or "All Entities"
    taxpayer_address = ""
    taxpayer_tin = ""
    if entity and entity != "All":
        profile_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
        if profile_rows:
            profile = profile_rows[0]
            taxpayer_name = profile.get("registered_name") or entity
            taxpayer_address = profile.get("registered_address") or ""
            taxpayer_tin = profile.get("tin") or ""

    # Build period string
    if date_from and date_to:
        period_str = f"{date_from.strftime('%m/%d/%Y')} - {date_to.strftime('%m/%d/%Y')}"
    elif date_from:
        period_str = f"From {date_from.strftime('%m/%d/%Y')}"
    elif date_to:
        period_str = f"Up to {date_to.strftime('%m/%d/%Y')}"
    else:
        period_str = "All Dates"

    wb = Workbook()
    ws = wb.active
    ws.title = book_name[:31]  # Excel sheet name limit

    # Styles
    bold_font = Font(bold=True)
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    light_blue_fill = PatternFill(start_color="D6E4F0", end_color="D6E4F0", fill_type="solid")
    white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
    blue_border = Border(
        left=Side(style="thin", color="4472C4"),
        right=Side(style="thin", color="4472C4"),
        top=Side(style="thin", color="4472C4"),
        bottom=Side(style="thin", color="4472C4"),
    )
    totals_font = Font(bold=True, size=11)

    # BIR Header
    ws.append(["Name of Taxpayer:", taxpayer_name])
    ws.append(["Address:", taxpayer_address])
    ws.append(["Vat Reg TIN:", taxpayer_tin])
    ws.append(["Kind of Book:", book_name.upper()])
    ws.append(["For the Period:", period_str])
    ws.append([])  # Blank row

    for row_idx in range(1, 6):
        ws.cell(row=row_idx, column=1).font = bold_font

    # Column headers — blue background, white bold text, blue border
    ws.append(col_headers)
    header_row = ws.max_row
    for col_idx in range(1, len(col_headers) + 1):
        cell = ws.cell(row=header_row, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = blue_border
        cell.alignment = Alignment(horizontal="center", vertical="center")

    # Data rows — alternating light blue / white with blue borders
    for row_idx_offset, row in enumerate(rows):
        ws.append(row)
        current_row = ws.max_row
        fill = light_blue_fill if row_idx_offset % 2 == 0 else white_fill
        for col_idx in range(1, len(col_headers) + 1):
            cell = ws.cell(row=current_row, column=col_idx)
            cell.fill = fill
            cell.border = blue_border

    # Totals row — bold, light blue background
    if sum_columns and rows:
        totals = [""] * len(col_headers)
        totals[0] = "TOTALS"
        for col_idx in sum_columns:
            total = sum(float(rows[i][col_idx] or 0) for i in range(len(rows)))
            totals[col_idx] = round(total, 2)
        ws.append([])
        ws.append(totals)
        totals_row = ws.max_row
        for col_idx in range(1, len(col_headers) + 1):
            cell = ws.cell(row=totals_row, column=col_idx)
            cell.font = totals_font
            cell.fill = light_blue_fill
            cell.border = blue_border

    # Auto column widths
    for col_idx in range(1, len(col_headers) + 1):
        max_len = len(str(col_headers[col_idx - 1]))
        for row in ws.iter_rows(min_row=7, max_row=min(ws.max_row, 50), min_col=col_idx, max_col=col_idx):
            for cell in row:
                if cell.value:
                    max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = min(max_len + 2, 40)

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return output


@router.get("/books/cash-receipts/export/csv")
def export_cash_receipts_csv(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """Export Cash Receipts Book in BIR Excel format."""
    req = supabase.table("gl_cash_receipts").select("*").order("receipt_date")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("receipt_date", date_from.isoformat())
    if date_to:
        req = req.lte("receipt_date", date_to.isoformat())
    db_rows = req.execute().data or []

    col_headers = ["Date", "OR / AR / Ref No.", "Customer / Source", "TIN", "Description", "Receipt Mode", "Bank / Cash Account", "Gross Receipt Amount", "Output VAT", "EWT / Withholding Tax", "Net Amount Deposited", "Invoice Ref.", "Remarks"]
    fields = ["receipt_date", "or_ar_ref_no", "customer_source", "tin", "description", "receipt_mode", "bank_cash_account", "gross_receipt_amount", "output_vat", "ewt_withholding_tax", "net_amount_deposited", "invoice_ref", "remarks"]
    rows = [[r.get(k, "") or "" for k in fields] for r in db_rows]

    output = _build_bir_xlsx(entity=entity, date_from=date_from, date_to=date_to, book_name="Cash Receipts Book", col_headers=col_headers, rows=rows, sum_columns=[7, 8, 9, 10])
    filename = f"cash_receipts_book_{entity or 'all'}_{date.today().isoformat()}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@router.get("/books/cash-disbursements/export/csv")
def export_cash_disbursements_csv(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """Export Cash Disbursements Book in BIR Excel format."""
    req = supabase.table("gl_cash_disbursements").select("*").order("disbursement_date")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("disbursement_date", date_from.isoformat())
    if date_to:
        req = req.lte("disbursement_date", date_to.isoformat())
    db_rows = req.execute().data or []

    col_headers = ["Date", "CV / Check / Ref No.", "Payee / Supplier", "TIN", "Description", "Payment Mode", "Bank / Cash Account", "Expense / Account Title", "Gross Payment Amount", "Input VAT", "EWT / Withholding Tax", "Net Cash Paid", "Invoice / Billing Ref.", "Remarks"]
    fields = ["disbursement_date", "cv_check_ref_no", "payee_supplier", "tin", "description", "payment_mode", "bank_cash_account", "expense_account_title", "gross_payment_amount", "input_vat", "ewt_withholding_tax", "net_cash_paid", "invoice_billing_ref", "remarks"]
    rows = [[r.get(k, "") or "" for k in fields] for r in db_rows]

    output = _build_bir_xlsx(entity=entity, date_from=date_from, date_to=date_to, book_name="Cash Disbursements Book", col_headers=col_headers, rows=rows, sum_columns=[8, 9, 10, 11])
    filename = f"cash_disbursements_book_{entity or 'all'}_{date.today().isoformat()}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@router.get("/books/sales/export/csv")
def export_sales_book_csv(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """Export Sales Book in BIR Excel format."""
    req = supabase.table("gl_sales_book").select("*").order("sales_date")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("sales_date", date_from.isoformat())
    if date_to:
        req = req.lte("sales_date", date_to.isoformat())
    db_rows = req.execute().data or []

    col_headers = ["Date", "Sales Invoice No.", "Customer Name", "TIN", "Description of Goods / Services", "VAT Type", "Vatable Sales", "VAT-Exempt Sales", "Zero-Rated Sales", "Output VAT", "Total Invoice Amount", "Cash / AR", "Collection Status", "Remarks"]
    fields = ["sales_date", "sales_invoice_no", "customer_name", "tin", "description_of_goods_services", "vat_type", "vatable_sales", "vat_exempt_sales", "zero_rated_sales", "output_vat", "total_invoice_amount", "cash_or_ar", "collection_status", "remarks"]
    rows = [[r.get(k, "") or "" for k in fields] for r in db_rows]

    output = _build_bir_xlsx(entity=entity, date_from=date_from, date_to=date_to, book_name="Sales Book", col_headers=col_headers, rows=rows, sum_columns=[6, 7, 8, 9, 10])
    filename = f"sales_book_{entity or 'all'}_{date.today().isoformat()}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@router.get("/books/purchases/export/csv")
def export_purchases_book_csv(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """Export Purchases Book in BIR Excel format."""
    req = supabase.table("gl_purchases_book").select("*").order("purchase_date")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("purchase_date", date_from.isoformat())
    if date_to:
        req = req.lte("purchase_date", date_to.isoformat())
    db_rows = req.execute().data or []

    col_headers = ["Date", "Supplier Invoice / OR No.", "Supplier Name", "TIN", "Description of Purchase", "VAT Type", "Purchase Amount", "Input VAT", "Total Invoice Amount", "Cash / AP", "Payment Status", "Expense / Asset Account", "Remarks"]
    fields = ["purchase_date", "supplier_invoice_or_no", "supplier_name", "tin", "description_of_purchase", "vat_type", "purchase_amount", "input_vat", "total_invoice_amount", "cash_or_ap", "payment_status", "expense_asset_account", "remarks"]
    rows = [[r.get(k, "") or "" for k in fields] for r in db_rows]

    output = _build_bir_xlsx(entity=entity, date_from=date_from, date_to=date_to, book_name="Purchases Book", col_headers=col_headers, rows=rows, sum_columns=[6, 7, 8])
    filename = f"purchases_book_{entity or 'all'}_{date.today().isoformat()}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@router.get("/books/general-journal/export/csv")
def export_general_journal_csv(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """Export General Journal in BIR Excel format."""
    accts = _account_map()
    req = supabase.table("gl_journal_entries").select("*").order("entry_date")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("entry_date", date_from.isoformat())
    if date_to:
        req = req.lte("entry_date", date_to.isoformat())
    entries = req.execute().data or []

    col_headers = ["Date", "JV No.", "Reference / Source Doc", "Account Code", "Account Title", "Description / Explanation", "Debit", "Credit", "Prepared By", "Reviewed By", "Posting Status", "Remarks"]
    rows = []
    for entry in entries:
        lines_res = supabase.table("gl_journal_lines").select("*").eq("entry_id", entry["entry_id"]).execute()
        for ln in (lines_res.data or []):
            a = accts.get(ln["account_id"], {})
            rows.append([
                entry.get("entry_date", ""),
                entry.get("entry_number", ""),
                entry.get("reference_module") or entry.get("reference_number") or "",
                a.get("account_code", ""),
                a.get("account_name", ""),
                ln.get("description") or entry.get("description") or "",
                float(ln.get("debit") or 0),
                float(ln.get("credit") or 0),
                entry.get("prepared_by", ""),
                entry.get("reviewed_by", ""),
                entry.get("status", ""),
                "",
            ])

    output = _build_bir_xlsx(entity=entity, date_from=date_from, date_to=date_to, book_name="General Journal Book", col_headers=col_headers, rows=rows, sum_columns=[6, 7])
    filename = f"general_journal_{entity or 'all'}_{date.today().isoformat()}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@router.get("/books/general-ledger/export/csv")
def export_general_ledger_book_csv(
    entity: Optional[str] = Query(None),
    account_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """Export General Ledger (per account with running balance) in BIR Excel format."""
    accts = _account_map()
    lines = _posted_lines(entity, date_from, date_to)
    if account_id:
        lines = [ln for ln in lines if ln["account_id"] == account_id]

    entry_ids = list({ln["entry_id"] for ln in lines})
    entry_map = {}
    if entry_ids:
        for i in range(0, len(entry_ids), 100):
            batch = entry_ids[i:i+100]
            er = supabase.table("gl_journal_entries").select("entry_id, entry_number, entry_date, description, reference_module, reference_number").in_("entry_id", batch).execute()
            for e in (er.data or []):
                entry_map[e["entry_id"]] = e

    data_rows = []
    for ln in lines:
        e = entry_map.get(ln["entry_id"], {})
        a = accts.get(ln["account_id"], {})
        data_rows.append({
            "posting_date": e.get("entry_date"),
            "reference_journal": e.get("entry_number"),
            "account_code": a.get("account_code"),
            "account_title": a.get("account_name"),
            "description": ln.get("description") or e.get("description"),
            "debit": float(ln.get("debit") or 0),
            "credit": float(ln.get("credit") or 0),
            "source_module": e.get("reference_module"),
            "source_ref": e.get("reference_number"),
        })
    data_rows.sort(key=lambda r: (r.get("account_code") or "", r.get("posting_date") or ""))

    # Running balance per account
    acct_running = {}
    for r in data_rows:
        code = r.get("account_code", "")
        acct_running[code] = acct_running.get(code, 0) + r["debit"] - r["credit"]
        r["balance"] = round(acct_running[code], 2)

    col_headers = ["Date", "Reference / Journal", "Account Code", "Account Title", "Description", "Debit", "Credit", "Balance", "Related Party", "Posting Status", "Remarks"]
    fields = ["posting_date", "reference_journal", "account_code", "account_title", "description", "debit", "credit", "balance", "source_module", "source_ref"]
    rows = [[r.get(k, "") or "" for k in fields] + [""] for r in data_rows]

    output = _build_bir_xlsx(entity=entity, date_from=date_from, date_to=date_to, book_name="General Ledger Book", col_headers=col_headers, rows=rows, sum_columns=[5, 6, 7])
    filename = f"general_ledger_book_{entity or 'all'}_{date.today().isoformat()}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


# ══════════════════════════════════════════════════════════════════════════════
# BIR General Journal — Line-Level View (BIR loose-leaf format)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/journal-lines")
def list_entries_expanded(
    entity: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    source_filter: Optional[str] = Query(None),
):
    """Return journal entries expanded to individual debit/credit lines.

    Each row represents one account line within a journal entry, matching
    the BIR General Journal loose-leaf format where each JV has multiple
    rows (one per account affected).

    Optional source_filter: 'Sales Book', 'Cash Receipts Book', 'Purchases Book',
    'Cash Disbursements Book', 'Manual', or None for all.
    """
    accts = _account_map()
    req = supabase.table("gl_journal_entries").select("*").order("entry_date").order("entry_id")
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if date_from:
        req = req.gte("entry_date", date_from.isoformat())
    if date_to:
        req = req.lte("entry_date", date_to.isoformat())
    if source_filter and source_filter != "All":
        if source_filter == "Manual":
            req = req.is_("reference_module", "null")
        else:
            req = req.eq("reference_module", source_filter)
    entries = req.execute().data or []
    if not entries:
        return {"rows": [], "total_debit": 0, "total_credit": 0}

    # Fetch all lines for these entries
    entry_ids = [e["entry_id"] for e in entries]
    all_lines = []
    for i in range(0, len(entry_ids), 100):
        batch = entry_ids[i:i+100]
        lr = supabase.table("gl_journal_lines").select("*").in_("entry_id", batch).order("line_id").execute()
        all_lines.extend(lr.data or [])

    # Build entry lookup
    entry_map = {e["entry_id"]: e for e in entries}

    # Expand to line-level rows
    rows = []
    for ln in all_lines:
        e = entry_map.get(ln["entry_id"], {})
        a = accts.get(ln.get("account_id"), {})
        rows.append({
            "entry_id": e.get("entry_id"),
            "entry_date": e.get("entry_date"),
            "entry_number": e.get("entry_number"),
            "jv_number": e.get("jv_number") or e.get("entry_number"),
            "reference_module": e.get("reference_module"),
            "reference_number": e.get("reference_number"),
            "source_document": e.get("source_document") or e.get("reference_module") or "",
            "account_code": a.get("account_code", ""),
            "account_name": a.get("account_name", ""),
            "description": ln.get("description") or e.get("description", ""),
            "debit": float(ln.get("debit") or 0),
            "credit": float(ln.get("credit") or 0),
            "prepared_by": e.get("posted_by") or e.get("prepared_by") or "",
            "reviewed_by": e.get("reviewed_by") or "",
            "posting_status": e.get("posting_status") or e.get("status", ""),
            "remarks": e.get("remarks") or "",
            "entity": e.get("entity"),
        })

    total_debit = round(sum(r["debit"] for r in rows), 2)
    total_credit = round(sum(r["credit"] for r in rows), 2)
    return {"rows": rows, "total_debit": total_debit, "total_credit": total_credit, "is_balanced": total_debit == total_credit}


# ══════════════════════════════════════════════════════════════════════════════
# Reference Number Autocomplete
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/reference-suggestions")
def reference_suggestions(
    module: str = Query(...),
    search: Optional[str] = Query(None),
    entity: Optional[str] = Query(None),
):
    """Return reference numbers for autocomplete based on module type."""
    results = []
    s = (search or "").strip()

    if module in ("Accounts Receivable", "AR"):
        req = supabase.table("ar_invoices").select("invoice_id, invoice_number, customer_id, gross_amount, invoice_date").eq("lifecycle_status", "CONFIRMED").order("invoice_date", desc=True).limit(20)
        if entity:
            req = req.eq("entity", entity)
        if s:
            req = req.ilike("invoice_number", f"%{s}%")
        rows = req.execute().data or []
        results = [{"value": r["invoice_number"], "label": f"{r['invoice_number']} — ₱{r.get('gross_amount', 0):,.2f}", "id": r["invoice_id"]} for r in rows]

    elif module in ("Accounts Payable", "AP"):
        req = supabase.table("ap_bills").select("bill_id, bill_number, supplier_invoice_number, gross_amount, bill_date").eq("lifecycle_status", "CONFIRMED").order("bill_date", desc=True).limit(20)
        if entity:
            req = req.eq("entity", entity)
        if s:
            req = req.or_(f"bill_number.ilike.%{s}%,supplier_invoice_number.ilike.%{s}%")
        rows = req.execute().data or []
        results = [{"value": r["bill_number"], "label": f"{r['bill_number']} (Sup: {r.get('supplier_invoice_number', '')}) — ₱{r.get('gross_amount', 0):,.2f}", "id": r["bill_id"]} for r in rows]

    elif module == "Payroll":
        req = supabase.table("payroll_runs").select("run_id, period_start, period_end, total_net, status").order("run_id", desc=True).limit(20)
        if s:
            req = req.ilike("status", f"%{s}%")
        rows = req.execute().data or []
        results = [{"value": f"Payroll Run #{r['run_id']}", "label": f"Run #{r['run_id']} ({r['period_start']} to {r['period_end']}) — ₱{r.get('total_net', 0):,.2f}", "id": r["run_id"]} for r in rows]

    elif module in ("Sales Book", "Cash Receipts Book", "Purchases Book", "Cash Disbursements Book"):
        # Search existing GL journal entries from this module
        req = supabase.table("gl_journal_entries").select("entry_id, entry_number, reference_number, description").eq("reference_module", module).order("entry_id", desc=True).limit(20)
        if entity:
            req = req.eq("entity", entity)
        if s:
            req = req.ilike("reference_number", f"%{s}%")
        rows = req.execute().data or []
        results = [{"value": r.get("reference_number") or r["entry_number"], "label": f"{r.get('reference_number') or r['entry_number']} — {r.get('description', '')[:40]}", "id": r["entry_id"]} for r in rows]

    else:
        # Manual or other — no suggestions
        pass

    return results


# ══════════════════════════════════════════════════════════════════════════════
# Source Record Quick-View (fetch source details for inline preview)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/source-preview")
def source_preview(
    module: str = Query(...),
    ref: Optional[str] = Query(None),
    source_id: Optional[int] = Query(None),
):
    """Fetch source record details for inline preview in GL books."""
    mod = module.lower()

    if "receivable" in mod or "ar" in mod:
        # Fetch the invoice directly
        req = supabase.table("ar_invoices").select("*")
        if source_id:
            req = req.eq("invoice_id", source_id)
        elif ref:
            req = req.eq("invoice_number", ref)
        rows = req.limit(1).execute().data or []
        if not rows:
            return {"found": False, "module": module}
        inv = rows[0]
        cust = supabase.table("client_list").select("company_name").eq("client_id", inv.get("customer_id")).limit(1).execute().data or []
        # Fetch collections for this invoice
        collections = supabase.table("ar_collections").select("collection_id, or_number, collection_amount, collection_date, payment_method").eq("invoice_id", inv.get("invoice_id")).eq("record_status", "ACTIVE").execute().data or []
        return {
            "found": True, "module": "Accounts Receivable", "type": "Invoice",
            "number": inv.get("invoice_number"),
            "date": inv.get("invoice_date"),
            "entity": inv.get("entity"),
            "customer": cust[0].get("company_name") if cust else "—",
            "gross_amount": inv.get("gross_amount"),
            "vat": inv.get("vat_output"),
            "wht": inv.get("wht_amount"),
            "status": inv.get("lifecycle_status"),
            "collection_status": inv.get("collection_status"),
            "collections": collections,
            "link": f"/accounts-receivable/invoices/{inv.get('invoice_id')}",
        }

    elif "payable" in mod or "ap" in mod:
        req = supabase.table("ap_bills").select("*")
        if source_id:
            req = req.eq("bill_id", source_id)
        elif ref:
            req = req.eq("bill_number", ref)
        rows = req.limit(1).execute().data or []
        if not rows:
            return {"found": False, "module": module}
        bill = rows[0]
        supp = supabase.table("supplier_list").select("company_name").eq("supplier_id", bill.get("supplier_id")).limit(1).execute().data or []
        return {
            "found": True, "module": "Accounts Payable", "type": "Bill",
            "number": bill.get("bill_number"),
            "supplier_invoice": bill.get("supplier_invoice_number"),
            "date": bill.get("bill_date"),
            "entity": bill.get("entity"),
            "supplier": supp[0].get("company_name") if supp else "—",
            "gross_amount": bill.get("gross_amount"),
            "vat": bill.get("vat_input"),
            "ewt": bill.get("ewt_material"),
            "net_payable": bill.get("net_payable"),
            "status": bill.get("lifecycle_status"),
            "payment_status": bill.get("payment_status"),
            "po_number": bill.get("po_number"),
            "link": f"/accounts-payable/bills/{bill.get('bill_id')}",
        }

    elif "payroll" in mod:
        if source_id:
            rows = supabase.table("payroll_runs").select("*").eq("run_id", source_id).limit(1).execute().data or []
        else:
            return {"found": False, "module": module}
        if not rows:
            return {"found": False, "module": module}
        run = rows[0]
        return {
            "found": True, "module": "Payroll", "type": "Payroll Run",
            "number": f"Run #{run.get('run_id')}",
            "date": run.get("pay_date"),
            "period": f"{run.get('period_start')} to {run.get('period_end')}",
            "total_gross": run.get("total_gross"),
            "total_deductions": run.get("total_deductions"),
            "total_net": run.get("total_net"),
            "status": run.get("status"),
            "employees": run.get("total_employees"),
            "link": "/payroll",
        }

    return {"found": False, "module": module}


# ══════════════════════════════════════════════════════════════════════════════
# Journal Entry Review Workflow
# ══════════════════════════════════════════════════════════════════════════════

@router.put("/entries/{entry_id}/remarks")
def set_entry_remarks(entry_id: int, request: Request, payload: RemarksUpdate):
    """Set remarks on a journal entry."""
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_journal_entries").select("entry_id").eq("entry_id", entry_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Journal entry not found."})
    supabase.table("gl_journal_entries").update({"remarks": payload.remarks}).eq("entry_id", entry_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Updated remarks on entry #{entry_id}", performed_by=performed_by, record_id=entry_id, ip_address=request.client.host if request.client else None, request=request)
    return get_entry(entry_id)


@router.post("/entries/{entry_id}/review")
def review_entry(entry_id: int, request: Request):
    """Mark a journal entry as reviewed. Sets reviewed_by and posting_status to 'Reviewed'."""
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_journal_entries").select("*").eq("entry_id", entry_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Journal entry not found."})
    entry = res.data[0]
    if entry.get("status") == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Cannot review an already posted entry."})
    now = datetime.now().isoformat()
    supabase.table("gl_journal_entries").update({
        "reviewed_by": performed_by,
        "posting_status": "Reviewed",
        "updated_at": now,
    }).eq("entry_id", entry_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Reviewed journal entry {entry.get('entry_number')}", performed_by=performed_by, record_id=entry_id, ip_address=request.client.host if request.client else None, request=request)
    return get_entry(entry_id)


class RejectPayload(BaseModel):
    remarks: Optional[str] = None


@router.post("/entries/{entry_id}/reject")
def reject_entry(entry_id: int, request: Request, payload: RejectPayload):
    """Reject a journal entry back to the preparer with remarks."""
    _, performed_by = _extract_jwt_claims(request)
    res = supabase.table("gl_journal_entries").select("*").eq("entry_id", entry_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"error": "Journal entry not found."})
    entry = res.data[0]
    if entry.get("status") == "Posted":
        raise HTTPException(status_code=400, detail={"error": "Cannot reject an already posted entry."})
    now = datetime.now().isoformat()
    reject_remarks = payload.remarks or ""
    existing_remarks = entry.get("remarks") or ""
    combined_remarks = f"{existing_remarks}\n[REJECTED by {performed_by}]: {reject_remarks}".strip() if reject_remarks else existing_remarks
    supabase.table("gl_journal_entries").update({
        "posting_status": "Rejected",
        "reviewed_by": performed_by,
        "remarks": combined_remarks,
        "updated_at": now,
    }).eq("entry_id", entry_id).execute()
    write_audit_log(action="UPDATE", module_name=MODULE_NAME, description=f"Rejected journal entry {entry.get('entry_number')}: {reject_remarks}", performed_by=performed_by, record_id=entry_id, ip_address=request.client.host if request.client else None, request=request)
    return get_entry(entry_id)
