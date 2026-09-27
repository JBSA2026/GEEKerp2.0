"""Tax Management module router.

Aggregates VAT, WHT/EWT data from AR invoices and AP bills to provide
tax position summaries, transaction-level detail, filing period tracking,
and tax code configuration.
"""

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel

from database import supabase
from middleware.audit_middleware import _extract_jwt_claims, write_audit_log
from utils.code_generator import generate_bir_form_code

router = APIRouter(prefix="/tax", tags=["tax-management"])

MODULE_NAME = "Tax Management"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _num(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _check_amendment_conflict(entity: str, form_type: str, period_from: str, period_to: str, trigger_type: str, trigger_id: int, trigger_reference: str = None, trigger_amount: float = 0):
    """Check if a non-DRAFT form exists for this period. If so, create an amendment warning.
    
    Returns True if a conflict was found (form is already submitted/approved/filed).
    """
    existing = supabase.table("bir_forms").select(
        "form_record_id, status"
    ).eq("form_type", form_type).eq("entity", entity).eq(
        "period_from", period_from
    ).eq("period_to", period_to).neq("status", "DRAFT").execute().data or []

    if not existing:
        return False

    form = existing[0]
    message = (
        f"New {trigger_type.replace('_', ' ').lower()} ({trigger_reference or trigger_id}) "
        f"affects period {period_from} to {period_to}, but {form_type} for {entity} "
        f"is already {form['status']}. Amendment may be required."
    )

    # Avoid duplicate warnings for same trigger
    dup = supabase.table("amendment_warnings").select("id").eq(
        "trigger_type", trigger_type
    ).eq("trigger_id", trigger_id).eq("form_record_id", form["form_record_id"]).execute().data
    if dup:
        return True

    supabase.table("amendment_warnings").insert({
        "entity": entity,
        "form_type": form_type,
        "form_record_id": form["form_record_id"],
        "form_status": form["status"],
        "period_from": period_from,
        "period_to": period_to,
        "trigger_type": trigger_type,
        "trigger_id": trigger_id,
        "trigger_reference": trigger_reference,
        "trigger_amount": trigger_amount,
        "message": message,
    }).execute()

    return True


def _quarter_for_date(d: date) -> tuple:
    """Return (quarter_number, year) for a given date."""
    return ((d.month - 1) // 3 + 1, d.year)


# Entity name fallback mapping (used when entity_tax_profiles has no registered_name)
# Keys are canonical (PascalCase) — lookup is case-insensitive
ENTITY_REGISTERED_NAMES = {
    "Expedia": "Expedia Solutions Specialist Inc.",
    "GreatnessLab": "GreatnessLab Inc.",
    "Exigent": "Exigent Corporation",
    "KSI": "Kyrios Solutions Inc.",
}

# Case-insensitive lookup version
_ENTITY_NAMES_LOWER = {k.lower(): v for k, v in ENTITY_REGISTERED_NAMES.items()}

# Canonical entity name mapping (lowercase → proper case)
_ENTITY_CANONICAL = {k.lower(): k for k in ENTITY_REGISTERED_NAMES}


def _normalize_entity(entity: str) -> str:
    """Normalize entity to canonical case (e.g. 'greatnesslab' → 'GreatnessLab')."""
    if not entity:
        return entity
    return _ENTITY_CANONICAL.get(entity.lower(), entity)


def _get_entity_registered_name(entity: str, profile: dict = None) -> str:
    """Get the entity's registered name. Uses authoritative mapping first, then profile fallback."""
    if entity and entity.lower() in _ENTITY_NAMES_LOWER:
        return _ENTITY_NAMES_LOWER[entity.lower()]
    if profile and profile.get("registered_name"):
        return profile["registered_name"]
    return entity or ""


def _quarter_date_range(quarter: int, year: int) -> tuple:
    """Return (period_from, period_to) as ISO strings for a quarter."""
    from datetime import timedelta
    month_start = (quarter - 1) * 3 + 1
    period_from = f"{year}-{month_start:02d}-01"
    if quarter == 4:
        period_to = f"{year}-12-31"
    else:
        period_to = (date(year, month_start + 3, 1) - timedelta(days=1)).isoformat()
    return period_from, period_to


def generate_or_update_2307_for_invoice(invoice_id: int, invoice: dict):
    """Auto-generate or update a DRAFT 2307 when an invoice with WHT is confirmed.
    
    Logic:
    - Find or create a DRAFT 2307 for this entity + customer + quarter
    - Link the invoice to it
    - Recalculate the form data from all linked invoices
    
    This is called from the AR module when an invoice is confirmed.
    """
    wht_amount = _num(invoice.get("wht_amount", 0))
    if wht_amount <= 0:
        return None  # No WHT, no 2307 needed

    entity = _normalize_entity(invoice.get("entity"))
    customer_id = invoice.get("customer_id")
    invoice_date_str = invoice.get("invoice_date", "")

    if not entity or not customer_id or not invoice_date_str:
        return None

    # Determine quarter
    inv_date = date.fromisoformat(invoice_date_str) if isinstance(invoice_date_str, str) else invoice_date_str
    quarter, year = _quarter_for_date(inv_date)
    period_from, period_to = _quarter_date_range(quarter, year)

    # Check if this would conflict with an already-submitted/filed 2307
    _check_amendment_conflict(
        entity=entity, form_type="2307", period_from=period_from, period_to=period_to,
        trigger_type="AR_INVOICE", trigger_id=invoice_id,
        trigger_reference=invoice.get("invoice_number"), trigger_amount=wht_amount,
    )

    # Check if a DRAFT 2307 already exists for this entity+customer+quarter
    existing = supabase.table("bir_forms").select("form_record_id").eq(
        "form_type", "2307"
    ).eq("entity", entity).eq("customer_id", customer_id).eq(
        "period_from", period_from
    ).eq("period_to", period_to).eq("status", "DRAFT").execute().data or []

    if existing:
        form_record_id = existing[0]["form_record_id"]
    else:
        # In AR context: customer is the PAYOR (withholds tax), entity is the PAYEE (income earner)
        # BIR 2307: Payor = party who pays and withholds, Payee = party who receives income
        payee_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
        payee = payee_rows[0] if payee_rows else {}
        payor_rows = supabase.table("client_list").select("company_name, tin_number, address, billing_address, zip_code").eq("client_id", customer_id).execute().data or []
        payor = payor_rows[0] if payor_rows else {}

        # Create new DRAFT 2307
        # Fallback: use entity name if registered_name is not set in tax profile
        payee_name = _get_entity_registered_name(entity, payee)
        new_form = {
            "form_type": "2307",
            "entity": entity,
            "customer_id": customer_id,
            "period_from": period_from,
            "period_to": period_to,
            "status": "DRAFT",
            "form_code": generate_bir_form_code(entity, "2307"),
            "payor_tin": payor.get("tin_number", ""),
            "payor_name": payor.get("company_name", ""),
            "payor_address": payor.get("address") or payor.get("billing_address", ""),
            "payor_zip_code": payor.get("zip_code", ""),
            "payee_tin": payee.get("tin", ""),
            "payee_name": payee_name,
            "payee_address": payee.get("registered_address", ""),
            "form_data": {},
        }
        res = supabase.table("bir_forms").insert(new_form).execute()
        if not res.data:
            return None
        form_record_id = res.data[0]["form_record_id"]

        # Log creation
        supabase.table("bir_form_history").insert({
            "form_record_id": form_record_id,
            "action": "AUTO_GENERATED",
            "details": f"Auto-generated from invoice confirmation. Payee: {payee.get('company_name', '')}",
            "performed_by": "System",
        }).execute()

    # Link invoice to this form (if not already linked)
    existing_link = supabase.table("bir_form_invoices").select("id").eq(
        "form_record_id", form_record_id
    ).eq("invoice_id", invoice_id).execute().data or []

    if not existing_link:
        supabase.table("bir_form_invoices").insert({
            "form_record_id": form_record_id,
            "invoice_id": invoice_id,
        }).execute()

    # Recalculate form_data from all linked invoices
    _recalculate_2307_form_data(form_record_id, entity, customer_id, period_from, period_to)

    return form_record_id


def _recalculate_2307_form_data(form_record_id: int, entity: str, customer_id: int, period_from: str, period_to: str):
    """Recalculate the 2307 form_data from all linked AR invoices."""
    # Get all linked invoice IDs
    links = supabase.table("bir_form_invoices").select("invoice_id").eq("form_record_id", form_record_id).execute().data or []
    invoice_ids = [l["invoice_id"] for l in links]

    if not invoice_ids:
        return

    # Fetch invoices
    invoices = supabase.table("ar_invoices").select(
        "invoice_id, invoice_date, billing_subtotal, wht_amount"
    ).in_("invoice_id", invoice_ids).execute().data or []

    # Fetch line items
    items_data = supabase.table("ar_invoice_items").select(
        "invoice_id, wht_code, vat_exclusive_amount"
    ).in_("invoice_id", invoice_ids).execute().data or []

    items_by_invoice = {}
    for item in items_data:
        items_by_invoice.setdefault(item["invoice_id"], []).append(item)

    # Determine month_start from period_from
    month_start = int(period_from[5:7])

    # WHT code to ATC mapping
    wht_to_atc = {"WHT_MATERIAL_1": "WC158", "WHT_SERVICE_2": "WC010"}

    # Build breakdown
    atc_data = {}
    for inv in invoices:
        inv_month = int(inv["invoice_date"][5:7])
        month_idx = inv_month - month_start
        if month_idx < 0 or month_idx > 2:
            continue
        month_key = f"month{month_idx + 1}"

        items = items_by_invoice.get(inv["invoice_id"], [])
        if not items:
            atc = "WC158"
            atc_data.setdefault(atc, {"nature": "Income payment", "atc": atc, "month1": 0, "month2": 0, "month3": 0, "tax_withheld": 0})
            atc_data[atc][month_key] += _num(inv["billing_subtotal"])
            atc_data[atc]["tax_withheld"] += _num(inv["wht_amount"])
        else:
            for item in items:
                wht_code = item.get("wht_code", "NO_WHT")
                atc = wht_to_atc.get(wht_code)
                if not atc:
                    continue
                nature = "Material purchases (1%)" if "MATERIAL" in wht_code else "Professional/Service fees (2%)"
                atc_data.setdefault(atc, {"nature": nature, "atc": atc, "month1": 0, "month2": 0, "month3": 0, "tax_withheld": 0})
                atc_data[atc][month_key] += _num(item.get("vat_exclusive_amount", 0))

            total_base = sum(_num(it.get("vat_exclusive_amount", 0)) for it in items if wht_to_atc.get(it.get("wht_code")))
            if total_base > 0:
                for item in items:
                    atc = wht_to_atc.get(item.get("wht_code"))
                    if atc:
                        proportion = _num(item.get("vat_exclusive_amount", 0)) / total_base
                        atc_data[atc]["tax_withheld"] += _num(inv["wht_amount"]) * proportion

    # Build table rows
    empty_row = {"nature": "", "atc": "", "month1": "", "month2": "", "month3": "", "total": "", "tax_withheld": ""}
    table_a = []
    for d in atc_data.values():
        total = d["month1"] + d["month2"] + d["month3"]
        table_a.append({
            "nature": d["nature"], "atc": d["atc"],
            "month1": f"{d['month1']:.2f}" if d["month1"] else "",
            "month2": f"{d['month2']:.2f}" if d["month2"] else "",
            "month3": f"{d['month3']:.2f}" if d["month3"] else "",
            "total": f"{total:.2f}" if total else "",
            "tax_withheld": f"{d['tax_withheld']:.2f}" if d["tax_withheld"] else "",
        })
    while len(table_a) < 11:
        table_a.append({**empty_row})
    table_a = table_a[:11]
    table_b = [{**empty_row} for _ in range(11)]

    # In AR context: customer is PAYOR (withholds tax), entity is PAYEE (income earner)
    payee_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    payee_profile = payee_rows[0] if payee_rows else {}
    payor_rows = supabase.table("client_list").select("company_name, tin_number, address, billing_address, zip_code").eq("client_id", customer_id).execute().data or []
    payor_client = payor_rows[0] if payor_rows else {}

    def tin_seg(tin_str):
        raw = (tin_str or "").replace(" ", "")
        if "-" in raw:
            parts = raw.split("-")
        else:
            # No dashes — split into 3-digit segments
            digits = raw.replace(" ", "")
            parts = [digits[i:i+3] for i in range(0, len(digits), 3)]
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    form_data = {
        "period_from": period_from,
        "period_to": period_to,
        "payor_tin": tin_seg(payor_client.get("tin_number", "")),
        "payor_name": payor_client.get("company_name", ""),
        "payor_address": payor_client.get("address") or payor_client.get("billing_address", ""),
        "payor_zip_code": payor_client.get("zip_code", ""),
        "payee_tin": tin_seg(payee_profile.get("tin", "")),
        "payee_name": _get_entity_registered_name(entity, payee_profile),
        "payee_address": payee_profile.get("registered_address", ""),
        "payee_zip_code": payee_profile.get("zip_code", ""),
        "payee_foreign_address": "",
        "payor_signatory_name": "",
        "payor_signatory_title_tin": "",
        "payor_agent_accreditation_no": "",
        "payor_date_of_issue": "", "payor_date_of_expiry": "",
        "payee_signatory_name": payee_profile.get("authorized_signatory", ""),
        "payee_signatory_title_tin": payee_profile.get("signatory_title", ""),
        "payee_agent_accreditation_no": "",
        "payee_date_of_issue": "", "payee_date_of_expiry": "",
        "table_a": table_a,
        "table_b": table_b,
    }

    supabase.table("bir_forms").update({
        "form_data": form_data,
        "payee_name": form_data.get("payee_name", ""),
        "payee_tin": "-".join(form_data.get("payee_tin") or []),
        "payee_address": form_data.get("payee_address", ""),
        "payor_name": form_data.get("payor_name", ""),
        "payor_tin": "-".join(form_data.get("payor_tin") or []),
        "payor_address": form_data.get("payor_address", ""),
    }).eq("form_record_id", form_record_id).execute()


def generate_or_update_2307_for_bill(bill_id: int, bill: dict):
    """Auto-generate or update a DRAFT 2307 when an AP bill with EWT is confirmed.

    In the AP context:
    - GEEK entity is the PAYOR (pays the supplier and withholds tax)
    - Supplier is the PAYEE (receives income, tax withheld from them)

    Logic:
    - Find or create a DRAFT 2307 for this entity + supplier + quarter
    - Link the bill to it
    - Recalculate the form data from all linked bills

    Called from the AP module when a bill is confirmed.
    """
    ewt_amount = _num(bill.get("ewt_material", 0))
    if ewt_amount <= 0:
        return None  # No EWT, no 2307 needed

    entity = _normalize_entity(bill.get("entity"))
    supplier_id = bill.get("supplier_id")
    bill_date_str = bill.get("bill_date", "")

    if not entity or not supplier_id or not bill_date_str:
        return None

    # Determine quarter
    bill_date = date.fromisoformat(bill_date_str) if isinstance(bill_date_str, str) else bill_date_str
    quarter, year = _quarter_for_date(bill_date)
    period_from, period_to = _quarter_date_range(quarter, year)

    # Check if this would conflict with an already-submitted/filed 2307
    _check_amendment_conflict(
        entity=entity, form_type="2307", period_from=period_from, period_to=period_to,
        trigger_type="AP_BILL", trigger_id=bill_id,
        trigger_reference=bill.get("bill_number"), trigger_amount=ewt_amount,
    )

    # Check if a DRAFT 2307 already exists for this entity+supplier+quarter
    existing = supabase.table("bir_forms").select("form_record_id").eq(
        "form_type", "2307"
    ).eq("entity", entity).eq("supplier_id", supplier_id).eq(
        "period_from", period_from
    ).eq("period_to", period_to).eq("status", "DRAFT").execute().data or []

    if existing:
        form_record_id = existing[0]["form_record_id"]
    else:
        # Payor = GEEK entity (withholds tax), Payee = Supplier (receives income)
        payor_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
        payor = payor_rows[0] if payor_rows else {}
        payee_rows = supabase.table("supplier_list").select(
            "company_name, tin_number, billing_address"
        ).eq("supplier_id", supplier_id).execute().data or []
        payee = payee_rows[0] if payee_rows else {}

        new_form = {
            "form_type": "2307",
            "entity": entity,
            "supplier_id": supplier_id,
            "period_from": period_from,
            "period_to": period_to,
            "status": "DRAFT",
            "form_code": generate_bir_form_code(entity, "2307"),
            "payor_tin": payor.get("tin", ""),
            "payor_name": _get_entity_registered_name(entity, payor),
            "payor_address": payor.get("registered_address", ""),
            "payor_zip_code": payor.get("zip_code", ""),
            "payee_tin": payee.get("tin_number", ""),
            "payee_name": payee.get("company_name", ""),
            "payee_address": payee.get("billing_address", ""),
            "form_data": {},
        }
        res = supabase.table("bir_forms").insert(new_form).execute()
        if not res.data:
            return None
        form_record_id = res.data[0]["form_record_id"]

        # Log creation
        supabase.table("bir_form_history").insert({
            "form_record_id": form_record_id,
            "action": "AUTO_GENERATED",
            "details": f"Auto-generated from AP bill confirmation. Payee (supplier): {payee.get('company_name', '')}",
            "performed_by": "System",
        }).execute()

    # Link bill to this form (if not already linked)
    existing_link = supabase.table("bir_form_bills").select("id").eq(
        "form_record_id", form_record_id
    ).eq("bill_id", bill_id).execute().data or []

    if not existing_link:
        supabase.table("bir_form_bills").insert({
            "form_record_id": form_record_id,
            "bill_id": bill_id,
        }).execute()

    # Recalculate form_data from all linked bills
    _recalculate_2307_form_data_from_bills(form_record_id, entity, supplier_id, period_from, period_to)

    return form_record_id


def _recalculate_2307_form_data_from_bills(form_record_id: int, entity: str, supplier_id: int, period_from: str, period_to: str):
    """Recalculate the 2307 form_data from all linked AP bills."""
    # Get all linked bill IDs
    links = supabase.table("bir_form_bills").select("bill_id").eq("form_record_id", form_record_id).execute().data or []
    bill_ids = [l["bill_id"] for l in links]

    if not bill_ids:
        return

    # Fetch bills
    bills = supabase.table("ap_bills").select(
        "bill_id, bill_date, vat_exclusive_amount, ewt_material"
    ).in_("bill_id", bill_ids).execute().data or []

    # Determine month_start from period_from
    month_start = int(period_from[5:7])

    # Build breakdown by month
    # For AP 2307, ATC is typically WC010 (services 2%) or WC158 (materials 1%)
    # Since ap_bills uses ewt_material (1% on materials), default to WC158
    atc = "WC158"
    atc_data = {atc: {"nature": "Material purchases (1%)", "atc": atc, "month1": 0, "month2": 0, "month3": 0, "tax_withheld": 0}}

    for b in bills:
        bill_month = int(b["bill_date"][5:7]) if isinstance(b["bill_date"], str) else b["bill_date"].month
        month_idx = bill_month - month_start
        if month_idx < 0 or month_idx > 2:
            continue
        month_key = f"month{month_idx + 1}"
        atc_data[atc][month_key] += _num(b.get("vat_exclusive_amount", 0))
        atc_data[atc]["tax_withheld"] += _num(b.get("ewt_material", 0))

    # Build table rows
    empty_row = {"nature": "", "atc": "", "month1": "", "month2": "", "month3": "", "total": "", "tax_withheld": ""}
    table_a = []
    for d in atc_data.values():
        total = d["month1"] + d["month2"] + d["month3"]
        table_a.append({
            "nature": d["nature"], "atc": d["atc"],
            "month1": f"{d['month1']:.2f}" if d["month1"] else "",
            "month2": f"{d['month2']:.2f}" if d["month2"] else "",
            "month3": f"{d['month3']:.2f}" if d["month3"] else "",
            "total": f"{total:.2f}" if total else "",
            "tax_withheld": f"{d['tax_withheld']:.2f}" if d["tax_withheld"] else "",
        })
    while len(table_a) < 11:
        table_a.append({**empty_row})
    table_a = table_a[:11]
    table_b = [{**empty_row} for _ in range(11)]

    # Get payor (entity) and payee (supplier) info for TIN segments
    payor_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    payor = payor_rows[0] if payor_rows else {}
    payee_rows = supabase.table("supplier_list").select(
        "company_name, tin_number, billing_address"
    ).eq("supplier_id", supplier_id).execute().data or []
    payee = payee_rows[0] if payee_rows else {}

    def tin_seg(tin_str):
        raw = (tin_str or "").replace(" ", "")
        if "-" in raw:
            parts = raw.split("-")
        else:
            digits = raw.replace(" ", "")
            parts = [digits[i:i+3] for i in range(0, len(digits), 3)]
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    form_data = {
        "period_from": period_from,
        "period_to": period_to,
        "payor_tin": tin_seg(payor.get("tin", "")),
        "payor_name": _get_entity_registered_name(entity, payor),
        "payor_address": payor.get("registered_address", ""),
        "payor_zip_code": payor.get("zip_code", ""),
        "payee_tin": tin_seg(payee.get("tin_number", "")),
        "payee_name": payee.get("company_name", ""),
        "payee_address": payee.get("billing_address", ""),
        "payee_zip_code": "",
        "payee_foreign_address": "",
        "payor_signatory_name": payor.get("authorized_signatory", ""),
        "payor_signatory_title_tin": payor.get("signatory_title", ""),
        "payor_agent_accreditation_no": "",
        "payor_date_of_issue": "", "payor_date_of_expiry": "",
        "payee_signatory_name": "", "payee_signatory_title_tin": "",
        "payee_agent_accreditation_no": "",
        "payee_date_of_issue": "", "payee_date_of_expiry": "",
        "table_a": table_a,
        "table_b": table_b,
    }

    supabase.table("bir_forms").update({
        "form_data": form_data,
        "payee_name": form_data.get("payee_name", ""),
        "payee_tin": "-".join(form_data.get("payee_tin") or []),
        "payee_address": form_data.get("payee_address", ""),
        "payor_name": form_data.get("payor_name", ""),
        "payor_tin": "-".join(form_data.get("payor_tin") or []),
        "payor_address": form_data.get("payor_address", ""),
    }).eq("form_record_id", form_record_id).execute()


# ── Payment-based EWT form generation ─────────────────────────────────────────


def generate_2307_for_payment(payment_id: int, payment: dict, bill: dict):
    """Generate or update a DRAFT 2307 when an AP payment is recorded.

    Per BIR rules, the 2307 should be issued per payment event (not per bill
    confirmation), since the withholding obligation arises when income is actually
    paid or becomes payable.

    For partial payments, the EWT is proportional:
        payment_ewt = bill_ewt * (payment_amount / net_payable)

    Logic:
    - Calculate EWT portion for this payment
    - Find or create a DRAFT 2307 for entity + supplier + quarter
    - Link the payment to it via bir_form_payments
    - Recalculate the form data from all linked payments
    """
    bill_ewt_total = _num(bill.get("ewt_material", 0))
    net_payable = _num(bill.get("net_payable", 0))
    payment_amount = _num(payment.get("payment_amount", 0))

    if bill_ewt_total <= 0 or net_payable <= 0 or payment_amount <= 0:
        return None

    # Proportional EWT for this payment
    ewt_for_payment = round(bill_ewt_total * (payment_amount / net_payable), 2)
    if ewt_for_payment <= 0:
        return None

    entity = _normalize_entity(bill.get("entity"))
    supplier_id = bill.get("supplier_id")
    payment_date_str = payment.get("payment_date", "")

    if not entity or not supplier_id or not payment_date_str:
        return None

    # Use payment date for the period (BIR cares about when tax was withheld)
    pay_date = date.fromisoformat(payment_date_str) if isinstance(payment_date_str, str) else payment_date_str
    quarter, year = _quarter_for_date(pay_date)
    period_from, period_to = _quarter_date_range(quarter, year)

    # Check if this would conflict with an already-submitted/filed 2307
    _check_amendment_conflict(
        entity=entity, form_type="2307", period_from=period_from, period_to=period_to,
        trigger_type="AP_PAYMENT", trigger_id=payment_id,
        trigger_reference=bill.get("bill_number"), trigger_amount=ewt_for_payment,
    )

    # Find or create a DRAFT 2307 for this entity+supplier+quarter
    existing = supabase.table("bir_forms").select("form_record_id").eq(
        "form_type", "2307"
    ).eq("entity", entity).eq("supplier_id", supplier_id).eq(
        "period_from", period_from
    ).eq("period_to", period_to).eq("status", "DRAFT").execute().data or []

    if existing:
        form_record_id = existing[0]["form_record_id"]
    else:
        # Payor = GEEK entity, Payee = Supplier
        payor_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
        payor = payor_rows[0] if payor_rows else {}
        payee_rows = supabase.table("supplier_list").select(
            "company_name, tin_number, billing_address"
        ).eq("supplier_id", supplier_id).execute().data or []
        payee = payee_rows[0] if payee_rows else {}

        new_form = {
            "form_type": "2307",
            "entity": entity,
            "supplier_id": supplier_id,
            "period_from": period_from,
            "period_to": period_to,
            "status": "DRAFT",
            "form_code": generate_bir_form_code(entity, "2307"),
            "payor_tin": payor.get("tin", ""),
            "payor_name": _get_entity_registered_name(entity, payor),
            "payor_address": payor.get("registered_address", ""),
            "payor_zip_code": payor.get("zip_code", ""),
            "payee_tin": payee.get("tin_number", ""),
            "payee_name": payee.get("company_name", ""),
            "payee_address": payee.get("billing_address", ""),
            "form_data": {},
        }
        res = supabase.table("bir_forms").insert(new_form).execute()
        if not res.data:
            return None
        form_record_id = res.data[0]["form_record_id"]

        supabase.table("bir_form_history").insert({
            "form_record_id": form_record_id,
            "action": "AUTO_GENERATED",
            "details": f"Auto-generated from AP payment. Payee (supplier): {payee.get('company_name', '')}",
            "performed_by": "System",
        }).execute()

    # Link payment to this form (if not already linked)
    existing_link = supabase.table("bir_form_payments").select("id").eq(
        "form_record_id", form_record_id
    ).eq("payment_id", payment_id).execute().data or []

    if not existing_link:
        supabase.table("bir_form_payments").insert({
            "form_record_id": form_record_id,
            "payment_id": payment_id,
            "ewt_amount": ewt_for_payment,
            "payment_date": payment_date_str,
        }).execute()

    # Also link the bill (for traceability) via bir_form_bills
    bill_id = bill.get("bill_id") or payment.get("bill_id")
    if bill_id:
        existing_bill_link = supabase.table("bir_form_bills").select("id").eq(
            "form_record_id", form_record_id
        ).eq("bill_id", bill_id).execute().data or []
        if not existing_bill_link:
            supabase.table("bir_form_bills").insert({
                "form_record_id": form_record_id,
                "bill_id": bill_id,
            }).execute()

    # Recalculate form data from all linked payments
    _recalculate_2307_form_data_from_payments(form_record_id, entity, supplier_id, period_from, period_to)

    return form_record_id


def _recalculate_2307_form_data_from_payments(form_record_id: int, entity: str, supplier_id: int, period_from: str, period_to: str):
    """Recalculate the 2307 form_data from all linked AP payments."""
    # Get all linked payments
    links = supabase.table("bir_form_payments").select(
        "payment_id, ewt_amount, payment_date"
    ).eq("form_record_id", form_record_id).execute().data or []

    if not links:
        return

    payment_ids = [l["payment_id"] for l in links]

    # Fetch payment details to get amounts
    payments = supabase.table("ap_payments").select(
        "payment_id, bill_id, payment_amount, payment_date"
    ).in_("payment_id", payment_ids).execute().data or []

    # Get corresponding bills for income amounts
    bill_ids = list({p["bill_id"] for p in payments if p.get("bill_id")})
    bills = {}
    if bill_ids:
        bill_rows = supabase.table("ap_bills").select(
            "bill_id, vat_exclusive_amount, ewt_material, net_payable"
        ).in_("bill_id", bill_ids).execute().data or []
        bills = {b["bill_id"]: b for b in bill_rows}

    # Determine month_start from period_from
    month_start = int(period_from[5:7])

    # ATC: WC158 for material purchases (1% EWT)
    atc = "WC158"
    atc_data = {atc: {"nature": "Material purchases (1%)", "atc": atc, "month1": 0, "month2": 0, "month3": 0, "tax_withheld": 0}}

    # Build ewt_amount lookup from links
    ewt_by_payment = {l["payment_id"]: _num(l["ewt_amount"]) for l in links}

    for p in payments:
        pay_date_str = p.get("payment_date", "")
        if not pay_date_str:
            continue
        pay_month = int(pay_date_str[5:7]) if isinstance(pay_date_str, str) else pay_date_str.month
        month_idx = pay_month - month_start
        if month_idx < 0 or month_idx > 2:
            continue
        month_key = f"month{month_idx + 1}"

        # Income amount is proportional: bill's vat_exclusive * (payment_amount / net_payable)
        bill_data = bills.get(p["bill_id"], {})
        vat_excl = _num(bill_data.get("vat_exclusive_amount", 0))
        net_pay = _num(bill_data.get("net_payable", 0))
        pay_amt = _num(p.get("payment_amount", 0))
        income_portion = round(vat_excl * (pay_amt / net_pay), 2) if net_pay > 0 else 0

        atc_data[atc][month_key] += income_portion
        atc_data[atc]["tax_withheld"] += ewt_by_payment.get(p["payment_id"], 0)

    # Build table rows
    empty_row = {"nature": "", "atc": "", "month1": "", "month2": "", "month3": "", "total": "", "tax_withheld": ""}
    table_a = []
    for d in atc_data.values():
        total = d["month1"] + d["month2"] + d["month3"]
        table_a.append({
            "nature": d["nature"], "atc": d["atc"],
            "month1": f"{d['month1']:.2f}" if d["month1"] else "",
            "month2": f"{d['month2']:.2f}" if d["month2"] else "",
            "month3": f"{d['month3']:.2f}" if d["month3"] else "",
            "total": f"{total:.2f}" if total else "",
            "tax_withheld": f"{d['tax_withheld']:.2f}" if d["tax_withheld"] else "",
        })
    while len(table_a) < 11:
        table_a.append({**empty_row})
    table_a = table_a[:11]
    table_b = [{**empty_row} for _ in range(11)]

    # Get payor and payee info
    payor_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    payor = payor_rows[0] if payor_rows else {}
    payee_rows = supabase.table("supplier_list").select(
        "company_name, tin_number, billing_address"
    ).eq("supplier_id", supplier_id).execute().data or []
    payee = payee_rows[0] if payee_rows else {}

    def tin_seg(tin_str):
        raw = (tin_str or "").replace(" ", "")
        if "-" in raw:
            parts = raw.split("-")
        else:
            digits = raw.replace(" ", "")
            parts = [digits[i:i+3] for i in range(0, len(digits), 3)]
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    form_data = {
        "period_from": period_from,
        "period_to": period_to,
        "payor_tin": tin_seg(payor.get("tin", "")),
        "payor_name": _get_entity_registered_name(entity, payor),
        "payor_address": payor.get("registered_address", ""),
        "payor_zip_code": payor.get("zip_code", ""),
        "payee_tin": tin_seg(payee.get("tin_number", "")),
        "payee_name": payee.get("company_name", ""),
        "payee_address": payee.get("billing_address", ""),
        "payee_zip_code": "",
        "payee_foreign_address": "",
        "payor_signatory_name": payor.get("authorized_signatory", ""),
        "payor_signatory_title_tin": payor.get("signatory_title", ""),
        "payor_agent_accreditation_no": "",
        "payor_date_of_issue": "", "payor_date_of_expiry": "",
        "payee_signatory_name": "", "payee_signatory_title_tin": "",
        "payee_agent_accreditation_no": "",
        "payee_date_of_issue": "", "payee_date_of_expiry": "",
        "table_a": table_a,
        "table_b": table_b,
    }

    supabase.table("bir_forms").update({
        "form_data": form_data,
        "payee_name": form_data.get("payee_name", ""),
        "payee_tin": "-".join(form_data.get("payee_tin") or []),
        "payee_address": form_data.get("payee_address", ""),
        "payor_name": form_data.get("payor_name", ""),
        "payor_tin": "-".join(form_data.get("payor_tin") or []),
        "payor_address": form_data.get("payor_address", ""),
    }).eq("form_record_id", form_record_id).execute()


def generate_0619e_for_payment(payment_id: int, payment: dict, bill: dict):
    """Generate or update a DRAFT 0619-E when an AP payment with EWT is recorded.

    Uses payment date for the period (the month in which the tax was withheld).
    Aggregates all EWT payments made in that month for the entity.
    """
    from calendar import monthrange

    bill_ewt_total = _num(bill.get("ewt_material", 0))
    net_payable = _num(bill.get("net_payable", 0))
    payment_amount = _num(payment.get("payment_amount", 0))

    if bill_ewt_total <= 0 or net_payable <= 0 or payment_amount <= 0:
        return None

    ewt_for_payment = round(bill_ewt_total * (payment_amount / net_payable), 2)
    if ewt_for_payment <= 0:
        return None

    entity = _normalize_entity(bill.get("entity"))
    payment_date_str = payment.get("payment_date", "")

    if not entity or not payment_date_str:
        return None

    # Use payment date for the period
    pay_date = date.fromisoformat(payment_date_str) if isinstance(payment_date_str, str) else payment_date_str
    month = pay_date.month
    year = pay_date.year

    last_day = monthrange(year, month)[1]
    period_from = f"{year}-{month:02d}-01"
    period_to = f"{year}-{month:02d}-{last_day:02d}"

    # Check for amendment conflict
    _check_amendment_conflict(
        entity=entity, form_type="0619E", period_from=period_from, period_to=period_to,
        trigger_type="AP_PAYMENT", trigger_id=payment_id,
        trigger_reference=bill.get("bill_number"), trigger_amount=ewt_for_payment,
    )

    # Find or create DRAFT 0619-E for this entity+month
    existing = supabase.table("bir_forms").select("form_record_id").eq(
        "form_type", "0619E"
    ).eq("entity", entity).eq(
        "period_from", period_from
    ).eq("period_to", period_to).eq("status", "DRAFT").execute().data or []

    if existing:
        form_record_id = existing[0]["form_record_id"]
    else:
        profile_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
        profile = profile_rows[0] if profile_rows else {}

        new_form = {
            "form_type": "0619E",
            "entity": entity,
            "period_from": period_from,
            "period_to": period_to,
            "status": "DRAFT",
            "payor_tin": profile.get("tin", ""),
            "payor_name": _get_entity_registered_name(entity, profile),
            "payor_address": profile.get("registered_address", ""),
            "payor_zip_code": profile.get("zip_code", ""),
            "form_code": generate_bir_form_code(entity, "0619E"),
            "form_data": {},
        }
        res = supabase.table("bir_forms").insert(new_form).execute()
        if not res.data:
            return None
        form_record_id = res.data[0]["form_record_id"]

        supabase.table("bir_form_history").insert({
            "form_record_id": form_record_id,
            "action": "AUTO_GENERATED",
            "details": f"Auto-generated from AP payment for {entity} ({month:02d}/{year})",
            "performed_by": "System",
        }).execute()

    # Recalculate 0619-E using all payments with EWT in this entity+month
    _recalculate_0619e_from_payments(form_record_id, entity, period_from, period_to)

    return form_record_id


def _recalculate_0619e_from_payments(form_record_id: int, entity: str, period_from: str, period_to: str):
    """Recalculate 0619-E form_data by aggregating all EWT from payments in the period."""
    # Get all AP payments in this period for bills with EWT under this entity
    bills_with_ewt = supabase.table("ap_bills").select(
        "bill_id, supplier_id, ewt_material, net_payable"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt(
        "ewt_material", 0
    ).eq("entity", entity).execute().data or []

    if not bills_with_ewt:
        return

    bill_ids = [b["bill_id"] for b in bills_with_ewt]
    bill_map = {b["bill_id"]: b for b in bills_with_ewt}

    # Get all payments for those bills within the period
    payments = supabase.table("ap_payments").select(
        "payment_id, bill_id, payment_amount, payment_date"
    ).in_("bill_id", bill_ids).gte(
        "payment_date", period_from
    ).lte("payment_date", period_to).execute().data or []

    # Calculate total EWT withheld from payments
    suppliers = _supplier_map()
    ewt_by_supplier = {}
    total_taxes_withheld = 0.0

    for p in payments:
        bill_data = bill_map.get(p["bill_id"])
        if not bill_data:
            continue
        bill_ewt = _num(bill_data.get("ewt_material", 0))
        bill_net = _num(bill_data.get("net_payable", 0))
        pay_amt = _num(p.get("payment_amount", 0))

        payment_ewt = round(bill_ewt * (pay_amt / bill_net), 2) if bill_net > 0 else 0
        total_taxes_withheld += payment_ewt

        sid = bill_data.get("supplier_id")
        if sid not in ewt_by_supplier:
            sup = suppliers.get(sid, {})
            ewt_by_supplier[sid] = {
                "supplier_id": sid,
                "supplier_name": sup.get("company_name", "—"),
                "tin": sup.get("tin_number", "—"),
                "total_ewt": 0.0,
                "payment_count": 0,
            }
        ewt_by_supplier[sid]["total_ewt"] += payment_ewt
        ewt_by_supplier[sid]["payment_count"] += 1

    for v in ewt_by_supplier.values():
        v["total_ewt"] = round(v["total_ewt"], 2)

    total_taxes_withheld = round(total_taxes_withheld, 2)
    supplier_breakdown = sorted(ewt_by_supplier.values(), key=lambda x: x["total_ewt"], reverse=True)

    # Build form_data
    profile_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profile_rows[0] if profile_rows else {}

    tin_str = profile.get("tin", "")
    tin_parts = tin_str.split("-") if tin_str else []
    tin_segments = [tin_parts[i] if i < len(tin_parts) else "" for i in range(4)]

    month = int(period_from[5:7])
    year = int(period_from[:4])

    line_12 = total_taxes_withheld
    line_14 = round(line_12, 2)
    line_16 = round(line_14, 2)

    form_data = {
        "return_period": f"{month:02d}/{year}",
        "amended_return": False,
        "tin_segments": tin_segments,
        "rdo_code": profile.get("rdo_code", ""),
        "taxpayer_name": _get_entity_registered_name(entity, profile),
        "address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "line_12_total_withheld": line_12,
        "line_13_prev_remitted": 0,
        "line_14_tax_still_due": line_14,
        "line_15a_surcharge": 0,
        "line_15b_interest": 0,
        "line_15c_compromise": 0,
        "line_16_total_due": line_16,
        "ewt_by_supplier": supplier_breakdown,
    }

    supabase.table("bir_forms").update({"form_data": form_data}).eq("form_record_id", form_record_id).execute()


def generate_or_update_0619e_for_bill(bill_id: int, bill: dict):
    """Auto-generate or update a DRAFT 0619-E when an AP bill with EWT is confirmed.

    Called from the AP module when a bill is confirmed.
    Creates/updates a DRAFT 0619-E for that entity+month.
    """
    from calendar import monthrange

    ewt_material = _num(bill.get("ewt_material", 0))
    if ewt_material <= 0:
        return None

    entity = _normalize_entity(bill.get("entity"))
    bill_date_str = bill.get("bill_date", "")

    if not entity or not bill_date_str:
        return None

    # Determine month/year from bill_date
    bill_date = date.fromisoformat(bill_date_str) if isinstance(bill_date_str, str) else bill_date_str
    month = bill_date.month
    year = bill_date.year

    # Build period range for the month
    last_day = monthrange(year, month)[1]
    period_from = f"{year}-{month:02d}-01"
    period_to = f"{year}-{month:02d}-{last_day:02d}"

    # Check if this would conflict with an already-submitted/filed form
    _check_amendment_conflict(
        entity=entity, form_type="0619E", period_from=period_from, period_to=period_to,
        trigger_type="AP_BILL", trigger_id=bill_id,
        trigger_reference=bill.get("bill_number"), trigger_amount=ewt_material,
    )

    # Check if a DRAFT 0619-E already exists for this entity+month+year
    existing = supabase.table("bir_forms").select("form_record_id").eq(
        "form_type", "0619E"
    ).eq("entity", entity).eq(
        "period_from", period_from
    ).eq("period_to", period_to).eq("status", "DRAFT").execute().data or []

    if existing:
        form_record_id = existing[0]["form_record_id"]
        action = "AUTO_UPDATED"
    else:
        # Get entity tax profile for payor info
        profile_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
        profile = profile_rows[0] if profile_rows else {}

        new_form = {
            "form_type": "0619E",
            "entity": entity,
            "period_from": period_from,
            "period_to": period_to,
            "status": "DRAFT",
            "payor_tin": profile.get("tin", ""),
            "payor_name": _get_entity_registered_name(entity, profile),
            "payor_address": profile.get("registered_address", ""),
            "payor_zip_code": profile.get("zip_code", ""),
            "form_code": generate_bir_form_code(entity, "0619E"),
            "form_data": {},
        }
        res = supabase.table("bir_forms").insert(new_form).execute()
        if not res.data:
            return None
        form_record_id = res.data[0]["form_record_id"]
        action = "AUTO_GENERATED"

    # Recompute form_data using same logic as auto_populate_0619e
    profile_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profile_rows[0] if profile_rows else {}

    # Query AP bills with EWT for this entity+month
    ap_query = supabase.table("ap_bills").select(
        "bill_id, bill_number, bill_date, supplier_id, ewt_material"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("ewt_material", 0).eq("entity", entity)
    ap_query = ap_query.gte("bill_date", period_from).lte("bill_date", period_to)
    ap_bills = ap_query.order("bill_date").execute().data or []

    total_taxes_withheld = round(sum(_num(b.get("ewt_material")) for b in ap_bills), 2)

    # Build supplier breakdown
    suppliers = _supplier_map()
    ewt_by_supplier = {}
    for b in ap_bills:
        sid = b.get("supplier_id")
        if sid not in ewt_by_supplier:
            sup = suppliers.get(sid, {})
            ewt_by_supplier[sid] = {
                "supplier_id": sid,
                "supplier_name": sup.get("company_name", "—"),
                "tin": sup.get("tin_number", "—"),
                "total_ewt": 0.0,
                "bill_count": 0,
            }
        ewt_by_supplier[sid]["total_ewt"] += _num(b.get("ewt_material"))
        ewt_by_supplier[sid]["bill_count"] += 1

    for v in ewt_by_supplier.values():
        v["total_ewt"] = round(v["total_ewt"], 2)

    supplier_breakdown = sorted(ewt_by_supplier.values(), key=lambda x: x["total_ewt"], reverse=True)

    tin_str = profile.get("tin", "")
    tin_parts = tin_str.split("-") if tin_str else []
    tin_segments = [tin_parts[i] if i < len(tin_parts) else "" for i in range(4)]

    line_12 = total_taxes_withheld
    line_14 = round(line_12, 2)
    line_16 = round(line_14, 2)

    form_data = {
        "return_period": f"{month:02d}/{year}",
        "amended_return": False,
        "tin_segments": tin_segments,
        "rdo_code": profile.get("rdo_code", ""),
        "taxpayer_name": _get_entity_registered_name(entity, profile),
        "address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "line_12_total_withheld": line_12,
        "line_13_prev_remitted": 0,
        "line_14_tax_still_due": line_14,
        "line_15a_surcharge": 0,
        "line_15b_interest": 0,
        "line_15c_compromise": 0,
        "line_16_total_due": line_16,
        "supplier_breakdown": supplier_breakdown,
        "auto_populated": True,
    }

    supabase.table("bir_forms").update({"form_data": form_data}).eq("form_record_id", form_record_id).execute()

    # Log to bir_form_history
    supabase.table("bir_form_history").insert({
        "form_record_id": form_record_id,
        "action": action,
        "details": f"{action} from AP bill #{bill_id} confirmation. EWT: {ewt_material:.2f}",
        "performed_by": "System",
    }).execute()

    return form_record_id


def generate_or_update_1600vt_for_bill(bill_id: int, bill: dict):
    """Auto-generate or update a DRAFT 1600-VT when an AP bill with VAT is confirmed.

    Called from the AP module when a bill is confirmed.
    Creates/updates a DRAFT 1600-VT for that entity+month.
    """
    from calendar import monthrange

    vat_input = _num(bill.get("vat_input", 0))
    if vat_input <= 0:
        return None

    entity = _normalize_entity(bill.get("entity"))
    bill_date_str = bill.get("bill_date", "")

    if not entity or not bill_date_str:
        return None

    # Determine month/year from bill_date
    bill_date = date.fromisoformat(bill_date_str) if isinstance(bill_date_str, str) else bill_date_str
    month = bill_date.month
    year = bill_date.year

    # Build period range for the month
    last_day = monthrange(year, month)[1]
    period_from = f"{year}-{month:02d}-01"
    period_to = f"{year}-{month:02d}-{last_day:02d}"

    # Check if this would conflict with an already-submitted/filed form
    _check_amendment_conflict(
        entity=entity, form_type="1600VT", period_from=period_from, period_to=period_to,
        trigger_type="AP_BILL", trigger_id=bill_id,
        trigger_reference=bill.get("bill_number"), trigger_amount=vat_input,
    )

    # Check if a DRAFT 1600-VT already exists for this entity+month+year
    existing = supabase.table("bir_forms").select("form_record_id").eq(
        "form_type", "1600VT"
    ).eq("entity", entity).eq(
        "period_from", period_from
    ).eq("period_to", period_to).eq("status", "DRAFT").execute().data or []

    if existing:
        form_record_id = existing[0]["form_record_id"]
        action = "AUTO_UPDATED"
    else:
        # Get entity tax profile
        profile_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
        profile = profile_rows[0] if profile_rows else {}

        new_form = {
            "form_type": "1600VT",
            "entity": entity,
            "period_from": period_from,
            "period_to": period_to,
            "status": "DRAFT",
            "payor_tin": profile.get("tin", ""),
            "payor_name": _get_entity_registered_name(entity, profile),
            "payor_address": profile.get("registered_address", ""),
            "payor_zip_code": profile.get("zip_code", ""),
            "form_code": generate_bir_form_code(entity, "1600VT"),
            "form_data": {},
        }
        res = supabase.table("bir_forms").insert(new_form).execute()
        if not res.data:
            return None
        form_record_id = res.data[0]["form_record_id"]
        action = "AUTO_GENERATED"

    # Recompute form_data using same logic as auto_populate_1600vt
    profile_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profile_rows[0] if profile_rows else {}

    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    # Get confirmed AP bills for this entity + month with VAT
    q = supabase.table("ap_bills").select(
        "bill_id, bill_number, bill_date, supplier_id, vat_exclusive_amount, vat_input, gross_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
    q = q.eq("entity", entity)
    q = q.gte("bill_date", period_from).lte("bill_date", period_to)
    q = q.gt("vat_input", 0)
    bills = q.order("bill_date").execute().data or []

    # Get supplier info
    supplier_ids = list(set(b["supplier_id"] for b in bills if b.get("supplier_id")))
    supplier_map = {}
    if supplier_ids:
        sup_rows = supabase.table("supplier_list").select(
            "supplier_id, company_name, tin_number, address"
        ).in_("supplier_id", supplier_ids).execute().data or []
        supplier_map = {s["supplier_id"]: s for s in sup_rows}

    # Calculate 5% VAT withheld
    payee_breakdown = {}
    for b in bills:
        sid = b.get("supplier_id")
        vat_withheld = round(_num(b.get("vat_exclusive_amount")) * 0.05, 2)
        if sid not in payee_breakdown:
            sup = supplier_map.get(sid, {})
            payee_breakdown[sid] = {
                "supplier_id": sid,
                "payee_name": sup.get("company_name", ""),
                "tin": sup.get("tin_number", ""),
                "gross_payments": 0,
                "vat_withheld": 0,
                "bill_count": 0,
            }
        payee_breakdown[sid]["gross_payments"] += _num(b.get("vat_exclusive_amount"))
        payee_breakdown[sid]["vat_withheld"] += vat_withheld
        payee_breakdown[sid]["bill_count"] += 1

    payee_list = sorted(payee_breakdown.values(), key=lambda x: x["vat_withheld"], reverse=True)
    for p in payee_list:
        p["gross_payments"] = round(p["gross_payments"], 2)
        p["vat_withheld"] = round(p["vat_withheld"], 2)

    total_vat_withheld = round(sum(p["vat_withheld"] for p in payee_list), 2)

    form_data = {
        "return_period": f"{month:02d}/{year}",
        "amended_return": False,
        "tin": tin_segments(profile.get("tin", "")),
        "rdo_code": profile.get("rdo_code", ""),
        "taxpayer_name": _get_entity_registered_name(entity, profile),
        "registered_address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "category_of_agent": profile.get("category", "Private"),
        "line_12_vat_withheld": total_vat_withheld,
        "line_13_prev_remitted": 0,
        "line_14_tax_still_due": total_vat_withheld,
        "line_15a_surcharge": 0,
        "line_15b_interest": 0,
        "line_15c_compromise": 0,
        "line_16_total_due": total_vat_withheld,
        "payee_breakdown": payee_list,
        "total_gross_payments": round(sum(p["gross_payments"] for p in payee_list), 2),
        "total_vat_withheld": total_vat_withheld,
        "number_of_payees": len(payee_list),
        "auto_populated": True,
    }

    supabase.table("bir_forms").update({"form_data": form_data}).eq("form_record_id", form_record_id).execute()

    # Log to bir_form_history
    supabase.table("bir_form_history").insert({
        "form_record_id": form_record_id,
        "action": action,
        "details": f"{action} from AP bill #{bill_id} confirmation. VAT input: {vat_input:.2f}",
        "performed_by": "System",
    }).execute()

    return form_record_id


def generate_or_update_1601c_for_payroll(run_id: int, run_data: dict):
    """Auto-generate or update a DRAFT 1601-C when payroll is approved.

    Called from the Payroll module when a payroll run is approved.
    Creates/updates a DRAFT 1601-C for each entity for that month.
    """
    from calendar import monthrange

    period_start_str = run_data.get("period_start", "")
    if not period_start_str:
        return None

    # Determine month/year from period_start
    period_start = date.fromisoformat(period_start_str) if isinstance(period_start_str, str) else period_start_str
    month = period_start.month
    year = period_start.year

    # Build period range for the month
    last_day = monthrange(year, month)[1]
    period_from = f"{year}-{month:02d}-01"
    period_to = f"{year}-{month:02d}-{last_day:02d}"

    # Payroll runs don't have entity - get all entity_tax_profiles
    all_profiles = supabase.table("entity_tax_profiles").select("*").execute().data or []
    if not all_profiles:
        return None

    # Use first entity as default (payroll is typically company-wide)
    profile = all_profiles[0]
    entity = profile.get("entity")

    # Check if this would conflict with an already-submitted/filed form
    _check_amendment_conflict(
        entity=entity, form_type="1601C", period_from=period_from, period_to=period_to,
        trigger_type="PAYROLL", trigger_id=run_id,
        trigger_reference=f"Payroll Run #{run_id}",
        trigger_amount=_num(run_data.get("total_gross", 0)),
    )

    # Check if a DRAFT 1601-C already exists for this entity+month+year
    existing = supabase.table("bir_forms").select("form_record_id").eq(
        "form_type", "1601C"
    ).eq("entity", entity).eq(
        "period_from", period_from
    ).eq("period_to", period_to).eq("status", "DRAFT").execute().data or []

    if existing:
        form_record_id = existing[0]["form_record_id"]
        action = "AUTO_UPDATED"
    else:
        new_form = {
            "form_type": "1601C",
            "entity": entity,
            "period_from": period_from,
            "period_to": period_to,
            "status": "DRAFT",
            "payor_tin": profile.get("tin", ""),
            "payor_name": _get_entity_registered_name(entity, profile),
            "payor_address": profile.get("registered_address", ""),
            "payor_zip_code": profile.get("zip_code", ""),
            "form_code": generate_bir_form_code(entity, "1601C"),
            "form_data": {},
        }
        res = supabase.table("bir_forms").insert(new_form).execute()
        if not res.data:
            return None
        form_record_id = res.data[0]["form_record_id"]
        action = "AUTO_GENERATED"

    # Recompute form_data using same logic as auto_populate_1601c
    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    # Get payroll runs for this period (non-DRAFT)
    runs = supabase.table("payroll_runs").select("run_id, period_start, period_end, status").gte(
        "period_start", period_from
    ).lte("period_end", period_to).neq("status", "DRAFT").execute().data or []

    run_ids = [r["run_id"] for r in runs]

    # Get all payroll items for these runs
    items = []
    if run_ids:
        items = supabase.table("payroll_items").select(
            "employee_id, employee_name, gross_pay, withholding_tax, sss_employee, philhealth_employee, pagibig_employee"
        ).in_("run_id", run_ids).execute().data or []

    # Aggregate by employee
    emp_totals = {}
    for item in items:
        eid = item["employee_id"]
        if eid not in emp_totals:
            emp_totals[eid] = {
                "employee_id": eid,
                "employee_name": item.get("employee_name", ""),
                "gross_compensation": 0,
                "withholding_tax": 0,
                "sss": 0, "philhealth": 0, "pagibig": 0,
            }
        emp_totals[eid]["gross_compensation"] += _num(item.get("gross_pay"))
        emp_totals[eid]["withholding_tax"] += _num(item.get("withholding_tax"))
        emp_totals[eid]["sss"] += _num(item.get("sss_employee"))
        emp_totals[eid]["philhealth"] += _num(item.get("philhealth_employee"))
        emp_totals[eid]["pagibig"] += _num(item.get("pagibig_employee"))

    # Totals
    total_compensation = sum(e["gross_compensation"] for e in emp_totals.values())
    total_statutory = sum(e["sss"] + e["philhealth"] + e["pagibig"] for e in emp_totals.values())
    total_taxable = total_compensation - total_statutory
    total_wht = sum(e["withholding_tax"] for e in emp_totals.values())

    form_data = {
        "return_period": f"{month:02d}/{year}",
        "amended_return": False,
        "tin": tin_segments(profile.get("tin", "")),
        "rdo_code": profile.get("rdo_code", ""),
        "taxpayer_name": _get_entity_registered_name(entity, profile),
        "registered_address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "category_of_agent": "Private",
        "number_of_employees": len(emp_totals),
        "schedule1_total_compensation": round(total_compensation, 2),
        "schedule1_statutory_min_wage": 0,
        "schedule1_holiday_ot_night": 0,
        "schedule1_13th_month_benefits": 0,
        "schedule1_deminimis": 0,
        "schedule1_sss_gsis_philhealth_pagibig": round(total_statutory, 2),
        "schedule1_other_nontaxable": 0,
        "schedule1_taxable_compensation": round(total_taxable, 2),
        "line_17_taxes_withheld": round(total_wht, 2),
        "line_18_adjustment_prev_month": 0,
        "line_19_total_withheld": round(total_wht, 2),
        "line_20_prev_remittance": 0,
        "line_21_tax_still_due": round(total_wht, 2),
        "line_22a_surcharge": 0,
        "line_22b_interest": 0,
        "line_22c_compromise": 0,
        "line_23_total_penalties": 0,
        "line_24_total_due": round(total_wht, 2),
        "employee_breakdown": sorted(emp_totals.values(), key=lambda x: x["withholding_tax"], reverse=True),
        "payroll_runs_included": [{"run_id": r["run_id"], "period": f"{r['period_start']} to {r['period_end']}", "status": r["status"]} for r in runs],
        "auto_populated": True,
    }

    supabase.table("bir_forms").update({"form_data": form_data}).eq("form_record_id", form_record_id).execute()

    # Log to bir_form_history
    supabase.table("bir_form_history").insert({
        "form_record_id": form_record_id,
        "action": action,
        "details": f"{action} from payroll run #{run_id} approval. WHT: {total_wht:.2f}",
        "performed_by": "System",
    }).execute()

    return form_record_id






def _period_filter(table_query, date_field: str, period_from: Optional[str], period_to: Optional[str]):
    """Apply date range filter. Expects YYYY-MM-DD strings."""
    if period_from:
        table_query = table_query.gte(date_field, period_from)
    if period_to:
        table_query = table_query.lte(date_field, period_to)
    return table_query


def _customer_map() -> dict:
    rows = supabase.table("client_list").select("client_id, company_name, tin_number").execute().data or []
    return {r["client_id"]: r for r in rows}


def _supplier_map() -> dict:
    rows = supabase.table("supplier_list").select("supplier_id, company_name, tin_number").execute().data or []
    return {r["supplier_id"]: r for r in rows}


# ── Tax Codes CRUD ────────────────────────────────────────────────────────────

class TaxCodeUpdate(BaseModel):
    rate: Optional[float] = None
    tax_type: Optional[str] = None
    scope: Optional[str] = None


@router.get("/codes")
def list_tax_codes():
    """Return all configured tax codes."""
    return supabase.table("tax_codes").select("*").order("code").execute().data or []


@router.patch("/codes/{code}")
def update_tax_code(code: str, request: Request, payload: TaxCodeUpdate):
    """Update a tax code's rate or metadata (only if editable)."""
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("tax_codes").select("*").eq("code", code).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Tax code not found")
    if not existing.data.get("editable", True):
        raise HTTPException(status_code=400, detail="This tax code is not editable")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return existing.data

    res = supabase.table("tax_codes").update(updates).eq("code", code).execute()
    write_audit_log(
        action="UPDATE", module_name=MODULE_NAME,
        description=f"Updated tax code {code}: {updates}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0] if res.data else existing.data


# ── VAT Summary + Detail ─────────────────────────────────────────────────────

@router.get("/vat-summary")
def vat_summary(
    period_from: Optional[str] = Query(None),
    period_to: Optional[str] = Query(None),
):
    """Compute Output VAT (from AR) and Input VAT (from AP) with transaction details."""
    customers = _customer_map()
    suppliers = _supplier_map()

    # Output VAT from confirmed, active AR invoices
    ar_query = supabase.table("ar_invoices").select(
        "invoice_id, invoice_number, invoice_date, customer_id, billing_subtotal, vat_output, gross_amount, wht_amount, net_collectible"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
    ar_query = _period_filter(ar_query, "invoice_date", period_from, period_to)
    ar_invoices = ar_query.order("invoice_date", desc=True).execute().data or []

    # Enrich with customer names
    for inv in ar_invoices:
        cust = customers.get(inv.get("customer_id"), {})
        inv["customer_name"] = cust.get("company_name", "—")
        inv["customer_tin"] = cust.get("tin_number", "—")

    total_output_vat = sum(_num(inv.get("vat_output")) for inv in ar_invoices)
    total_ar_subtotal = sum(_num(inv.get("billing_subtotal")) for inv in ar_invoices)

    # Input VAT from confirmed, active AP bills
    ap_query = supabase.table("ap_bills").select(
        "bill_id, bill_number, bill_date, supplier_id, vat_exclusive_amount, vat_input, gross_amount, ewt_material, net_payable"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
    ap_query = _period_filter(ap_query, "bill_date", period_from, period_to)
    ap_bills = ap_query.order("bill_date", desc=True).execute().data or []

    # Enrich with supplier names
    for bill in ap_bills:
        sup = suppliers.get(bill.get("supplier_id"), {})
        bill["supplier_name"] = sup.get("company_name", "—")
        bill["supplier_tin"] = sup.get("tin_number", "—")

    total_input_vat = sum(_num(bill.get("vat_input")) for bill in ap_bills)
    total_ap_subtotal = sum(_num(bill.get("vat_exclusive_amount")) for bill in ap_bills)

    net_vat = round(total_output_vat - total_input_vat, 2)

    # Monthly breakdown
    monthly = {}
    for inv in ar_invoices:
        month_key = inv["invoice_date"][:7] if inv.get("invoice_date") else "Unknown"
        if month_key not in monthly:
            monthly[month_key] = {"month": month_key, "output_vat": 0, "input_vat": 0}
        monthly[month_key]["output_vat"] += _num(inv.get("vat_output"))
    for bill in ap_bills:
        month_key = bill["bill_date"][:7] if bill.get("bill_date") else "Unknown"
        if month_key not in monthly:
            monthly[month_key] = {"month": month_key, "output_vat": 0, "input_vat": 0}
        monthly[month_key]["input_vat"] += _num(bill.get("vat_input"))

    monthly_list = sorted(monthly.values(), key=lambda m: m["month"])
    for m in monthly_list:
        m["output_vat"] = round(m["output_vat"], 2)
        m["input_vat"] = round(m["input_vat"], 2)
        m["net_vat"] = round(m["output_vat"] - m["input_vat"], 2)

    return {
        "period_from": period_from,
        "period_to": period_to,
        "output_vat": round(total_output_vat, 2),
        "output_vat_base": round(total_ar_subtotal, 2),
        "output_vat_invoices": len(ar_invoices),
        "input_vat": round(total_input_vat, 2),
        "input_vat_base": round(total_ap_subtotal, 2),
        "input_vat_bills": len(ap_bills),
        "net_vat_payable": net_vat if net_vat > 0 else 0,
        "net_vat_claimable": abs(net_vat) if net_vat < 0 else 0,
        "net_vat": net_vat,
        "invoices": ar_invoices,
        "bills": ap_bills,
        "monthly": monthly_list,
    }


# ── WHT/EWT Summary + Detail ─────────────────────────────────────────────────

@router.get("/wht-summary")
def wht_summary(
    period_from: Optional[str] = Query(None),
    period_to: Optional[str] = Query(None),
):
    """Compute WHT (from AR) and EWT (from AP) with per-party breakdowns."""
    customers = _customer_map()
    suppliers = _supplier_map()

    # WHT from AR invoices (withheld by customers)
    ar_query = supabase.table("ar_invoices").select(
        "invoice_id, invoice_number, invoice_date, customer_id, billing_subtotal, wht_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("wht_amount", 0)
    ar_query = _period_filter(ar_query, "invoice_date", period_from, period_to)
    ar_data = ar_query.order("invoice_date", desc=True).execute().data or []

    for inv in ar_data:
        cust = customers.get(inv.get("customer_id"), {})
        inv["customer_name"] = cust.get("company_name", "—")
        inv["customer_tin"] = cust.get("tin_number", "—")

    total_wht = sum(_num(inv.get("wht_amount")) for inv in ar_data)

    # Per-customer WHT totals (for BIR 2307 generation)
    wht_by_customer = {}
    for inv in ar_data:
        cid = inv.get("customer_id")
        if cid not in wht_by_customer:
            cust = customers.get(cid, {})
            wht_by_customer[cid] = {
                "customer_id": cid,
                "customer_name": cust.get("company_name", "—"),
                "customer_tin": cust.get("tin_number", "—"),
                "total_wht": 0, "invoice_count": 0,
            }
        wht_by_customer[cid]["total_wht"] += _num(inv.get("wht_amount"))
        wht_by_customer[cid]["invoice_count"] += 1

    for v in wht_by_customer.values():
        v["total_wht"] = round(v["total_wht"], 2)

    # EWT from AP bills (withheld from suppliers)
    ap_query = supabase.table("ap_bills").select(
        "bill_id, bill_number, bill_date, supplier_id, vat_exclusive_amount, ewt_material"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("ewt_material", 0)
    ap_query = _period_filter(ap_query, "bill_date", period_from, period_to)
    ap_data = ap_query.order("bill_date", desc=True).execute().data or []

    for bill in ap_data:
        sup = suppliers.get(bill.get("supplier_id"), {})
        bill["supplier_name"] = sup.get("company_name", "—")
        bill["supplier_tin"] = sup.get("tin_number", "—")

    total_ewt = sum(_num(bill.get("ewt_material")) for bill in ap_data)

    # Per-supplier EWT totals (for 0619-E filing)
    ewt_by_supplier = {}
    for bill in ap_data:
        sid = bill.get("supplier_id")
        if sid not in ewt_by_supplier:
            sup = suppliers.get(sid, {})
            ewt_by_supplier[sid] = {
                "supplier_id": sid,
                "supplier_name": sup.get("company_name", "—"),
                "supplier_tin": sup.get("tin_number", "—"),
                "total_ewt": 0, "bill_count": 0,
            }
        ewt_by_supplier[sid]["total_ewt"] += _num(bill.get("ewt_material"))
        ewt_by_supplier[sid]["bill_count"] += 1

    for v in ewt_by_supplier.values():
        v["total_ewt"] = round(v["total_ewt"], 2)

    return {
        "period_from": period_from,
        "period_to": period_to,
        "wht_from_customers": round(total_wht, 2),
        "wht_invoice_count": len(ar_data),
        "wht_invoices": ar_data,
        "wht_by_customer": sorted(wht_by_customer.values(), key=lambda x: x["total_wht"], reverse=True),
        "ewt_to_suppliers": round(total_ewt, 2),
        "ewt_bill_count": len(ap_data),
        "ewt_bills": ap_data,
        "ewt_by_supplier": sorted(ewt_by_supplier.values(), key=lambda x: x["total_ewt"], reverse=True),
        "total_withholding": round(total_wht + total_ewt, 2),
    }


# ── Filing Deadlines & Tracker ────────────────────────────────────────────────

class FilingRecord(BaseModel):
    form: str
    period_covered: str
    filing_date: str
    reference_number: Optional[str] = None
    amount_paid: Optional[float] = None
    notes: Optional[str] = None
    entity: Optional[str] = None


@router.get("/filing-deadlines")
def filing_deadlines():
    """Return upcoming BIR filing deadlines based on current date."""
    today = date.today()
    current_month = today.month
    current_year = today.year

    deadlines = []

    # Monthly VAT (BIR 2550M) - due 20th of following month
    vat_month = current_month + 1 if current_month < 12 else 1
    vat_year = current_year if current_month < 12 else current_year + 1
    vat_due = date(vat_year, vat_month, 20)
    deadlines.append({
        "form": "BIR 2550M",
        "description": "Monthly VAT Return",
        "due_date": vat_due.isoformat(),
        "period_covered": f"{date(current_year, current_month, 1).strftime('%B %Y')}",
        "days_remaining": (vat_due - today).days,
        "category": "VAT",
    })

    # EWT Remittance (BIR 0619-E) - due 10th of following month
    ewt_month = current_month + 1 if current_month < 12 else 1
    ewt_year = current_year if current_month < 12 else current_year + 1
    ewt_due = date(ewt_year, ewt_month, 10)
    deadlines.append({
        "form": "BIR 0619-E",
        "description": "Monthly EWT Remittance",
        "due_date": ewt_due.isoformat(),
        "period_covered": f"{date(current_year, current_month, 1).strftime('%B %Y')}",
        "days_remaining": (ewt_due - today).days,
        "category": "WHT",
    })

    # Quarterly VAT (BIR 2550Q) - due 25th of month following quarter end
    quarter = (current_month - 1) // 3 + 1
    quarter_end_month = quarter * 3
    q_filing_month = quarter_end_month + 1 if quarter_end_month < 12 else 1
    q_filing_year = current_year if quarter_end_month < 12 else current_year + 1
    q_due = date(q_filing_year, q_filing_month, 25)
    if q_due < today:
        next_quarter = quarter + 1 if quarter < 4 else 1
        nq_end = next_quarter * 3
        nq_month = nq_end + 1 if nq_end < 12 else 1
        nq_year = current_year if nq_end < 12 else current_year + 1
        q_due = date(nq_year, nq_month, 25)
    deadlines.append({
        "form": "BIR 2550Q",
        "description": "Quarterly VAT Return",
        "due_date": q_due.isoformat(),
        "period_covered": f"Q{quarter} {current_year}",
        "days_remaining": (q_due - today).days,
        "category": "VAT",
    })

    # SSS
    sss_month = current_month + 1 if current_month < 12 else 1
    sss_year = current_year if current_month < 12 else current_year + 1
    sss_due = date(sss_year, sss_month, 15)
    deadlines.append({
        "form": "SSS",
        "description": "SSS Contribution Remittance",
        "due_date": sss_due.isoformat(),
        "period_covered": f"{date(current_year, current_month, 1).strftime('%B %Y')}",
        "days_remaining": (sss_due - today).days,
        "category": "Statutory",
    })

    # PhilHealth
    deadlines.append({
        "form": "PhilHealth",
        "description": "PhilHealth Contribution Remittance",
        "due_date": sss_due.isoformat(),
        "period_covered": f"{date(current_year, current_month, 1).strftime('%B %Y')}",
        "days_remaining": (sss_due - today).days,
        "category": "Statutory",
    })

    # Pag-IBIG
    deadlines.append({
        "form": "Pag-IBIG",
        "description": "Pag-IBIG / HDMF Contribution Remittance",
        "due_date": sss_due.isoformat(),
        "period_covered": f"{date(current_year, current_month, 1).strftime('%B %Y')}",
        "days_remaining": (sss_due - today).days,
        "category": "Statutory",
    })

    deadlines.sort(key=lambda d: d["due_date"])
    return deadlines


@router.get("/filings")
def list_filings():
    """Return all recorded filing entries."""
    try:
        return supabase.table("tax_filings").select("*").order("filing_date", desc=True).execute().data or []
    except Exception:
        return []


@router.post("/filings", status_code=201)
def record_filing(request: Request, payload: FilingRecord):
    """Record that a filing has been submitted."""
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    data["filed_by"] = performed_by
    res = supabase.table("tax_filings").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to record filing")
    write_audit_log(
        action="CREATE", module_name=MODULE_NAME,
        description=f"Recorded filing: {payload.form} for {payload.period_covered}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


# ── Dashboard Summary ─────────────────────────────────────────────────────────

@router.get("/entity-profiles/{entity_name}")
def get_entity_profile(entity_name: str):
    """Get tax profile for a specific entity (for auto-populating forms)."""
    normalized = _normalize_entity(entity_name)
    res = supabase.table("entity_tax_profiles").select("*").eq("entity", normalized).execute()
    if not res.data:
        # Try original value as fallback
        res = supabase.table("entity_tax_profiles").select("*").eq("entity", entity_name).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Entity profile not found")
    return res.data[0]


@router.get("/entity-profiles")
def list_entity_profiles():
    """List all entity tax profiles."""
    return supabase.table("entity_tax_profiles").select("*").order("entity").execute().data or []


# ── BIR Form CRUD ─────────────────────────────────────────────────────────────

class BIRFormCreate(BaseModel):
    form_type: str
    entity: Optional[str] = None
    period_from: str
    period_to: str
    status: Optional[str] = "DRAFT"
    payee_tin: Optional[str] = None
    payee_name: Optional[str] = None
    payee_address: Optional[str] = None
    payee_zip_code: Optional[str] = None
    payor_tin: Optional[str] = None
    payor_name: Optional[str] = None
    payor_address: Optional[str] = None
    payor_zip_code: Optional[str] = None
    form_data: Optional[dict] = {}
    payor_signatory_name: Optional[str] = None
    payor_signatory_title_tin: Optional[str] = None
    payee_signatory_name: Optional[str] = None
    payee_signatory_title_tin: Optional[str] = None


@router.get("/bir-forms")
def list_bir_forms(
    entity: Optional[str] = Query(None),
    form_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    opportunity_id: Optional[int] = Query(None),
    direction: Optional[str] = Query(None, description="'issued' (to suppliers) or 'received' (from clients)"),
):
    """List all BIR form records, optionally filtered."""

    # If filtering by opportunity, resolve related form IDs first
    opportunity_form_ids: list | None = None
    if opportunity_id:
        opportunity_form_ids = _get_form_ids_for_opportunity(opportunity_id)
        if not opportunity_form_ids:
            return []

    q = supabase.table("bir_forms").select("*")
    if entity:
        q = q.eq("entity", entity)
    if form_type:
        q = q.eq("form_type", form_type)
    if status:
        q = q.eq("status", status)
    if opportunity_form_ids is not None:
        q = q.in_("form_record_id", opportunity_form_ids)

    # Direction filter: issued (has supplier_id) vs received (has customer_id)
    if direction == "issued":
        q = q.not_.is_("supplier_id", "null")
    elif direction == "received":
        q = q.not_.is_("customer_id", "null")

    data = q.order("created_at", desc=True).execute().data or []

    # Batch-load customer and supplier names for subject display
    customer_ids = list({r["customer_id"] for r in data if r.get("customer_id")})
    supplier_ids = list({r["supplier_id"] for r in data if r.get("supplier_id")})
    customer_names = {}
    supplier_names = {}
    if customer_ids:
        cust_rows = supabase.table("client_list").select("client_id, company_name").in_("client_id", customer_ids).execute().data or []
        customer_names = {c["client_id"]: c["company_name"] for c in cust_rows}
    if supplier_ids:
        sup_rows = supabase.table("supplier_list").select("supplier_id, company_name").in_("supplier_id", supplier_ids).execute().data or []
        supplier_names = {s["supplier_id"]: s["company_name"] for s in sup_rows}

    # Add display fields and direction indicator
    for row in data:
        row["payee"] = row.get("payee_name", "")
        row["period"] = f"{row.get('period_from', '')} to {row.get('period_to', '')}"
        row["direction"] = "issued" if row.get("supplier_id") else "received" if row.get("customer_id") else "unknown"

        # Compute subject (payee_name for 2307, payor_name for remittance forms)
        if not row.get("payee_name"):
            fd = row.get("form_data") or {}
            row["payee_name"] = fd.get("payee_name", "") or fd.get("taxpayer_name", "")
            row["payee"] = row["payee_name"]

        # Derive subject label: show the OTHER party (not our entity)
        # AR (received): entity=payee, customer=payor → subject = customer's company name
        # AP (issued): entity=payor, supplier=payee → subject = supplier's company name
        if row.get("customer_id") and not row.get("supplier_id"):
            # AR context: show the customer (payor / the other party)
            fd = row.get("form_data") or {}
            subject = row.get("payor_name") or fd.get("payor_name", "") or ""
            entity_name = _get_entity_registered_name(row.get("entity", ""))
            # If subject is empty or matches our own entity, use customer name
            if not subject or subject == entity_name:
                subject = customer_names.get(row["customer_id"], "")
            row["subject"] = subject
        elif row.get("supplier_id"):
            # AP context: show the supplier (payee / the other party)
            fd = row.get("form_data") or {}
            subject = row.get("payee_name") or fd.get("payee_name", "") or ""
            entity_name = _get_entity_registered_name(row.get("entity", ""))
            if not subject or subject == entity_name:
                subject = supplier_names.get(row["supplier_id"], "")
            row["subject"] = subject
        else:
            # Fallback for remittance forms or manual forms — show taxpayer/entity name
            row["subject"] = row.get("payee_name") or row.get("payor_name") or ""

        # Compute total_amount from form_data
        fd = row.get("form_data") or {}
        ft = row.get("form_type", "")
        if ft == "2307":
            # Sum tax_withheld from table_a rows
            table_a = fd.get("table_a") or []
            total = sum(_num(r.get("tax_withheld")) for r in table_a if r.get("tax_withheld"))
            row["total_amount"] = total if total > 0 else None
        elif ft == "0619E":
            row["total_amount"] = _num(fd.get("line_16_total_due")) or _num(fd.get("line_12_total_withheld")) or None
        elif ft == "1600VT":
            row["total_amount"] = _num(fd.get("line_20_total_due")) or _num(fd.get("total_vat_withheld")) or None
        elif ft == "1601EQ":
            row["total_amount"] = _num(fd.get("line_21_total_due")) or None
        else:
            row["total_amount"] = _num(fd.get("total_amount")) or _num(fd.get("tax_due")) or _num(fd.get("total_tax_due")) or None

    return data


def _get_form_ids_for_opportunity(opportunity_id: int) -> list:
    """Resolve all BIR form IDs linked to an opportunity via its invoices and bills."""
    form_ids = set()

    try:
        # Get opportunity's quotations
        opp = supabase.table("opportunities").select("opportunity_id, project_name").eq("opportunity_id", opportunity_id).single().execute().data
        if not opp:
            return []

        quotations = (
            supabase.table("quotations")
            .select("quotation_id, quotation_no")
            .eq("opportunity_id", opportunity_id)
            .execute()
            .data or []
        )
        if not quotations:
            # Fallback: match by project_name
            project_name = opp.get("project_name")
            if project_name:
                quotations = (
                    supabase.table("quotations")
                    .select("quotation_id, quotation_no")
                    .ilike("project_name", project_name)
                    .execute()
                    .data or []
                )

        if not quotations:
            return []

        qtn_ids = [q["quotation_id"] for q in quotations]

        # AR invoices linked to these quotations
        ar_invoices = (
            supabase.table("ar_invoices")
            .select("invoice_id")
            .in_("source_quotation_id", qtn_ids)
            .execute()
            .data or []
        )
        invoice_ids = [inv["invoice_id"] for inv in ar_invoices]

        if invoice_ids:
            links = (
                supabase.table("bir_form_invoices")
                .select("form_record_id")
                .in_("invoice_id", invoice_ids)
                .execute()
                .data or []
            )
            form_ids.update(l["form_record_id"] for l in links)

        # AP bills linked via purchase orders from these quotations
        qtn_numbers = [q.get("quotation_no") for q in quotations if q.get("quotation_no")]
        if qtn_numbers:
            all_prs = supabase.table("purchase_requests").select("purchase_request_id, remarks").execute().data or []
            pr_ids = [pr["purchase_request_id"] for pr in all_prs if any(qn in (pr.get("remarks") or "") for qn in qtn_numbers)]

            if pr_ids:
                pos = supabase.table("purchase_orders").select("purchase_order_id").in_("purchase_request_id", pr_ids).execute().data or []
                po_ids = [po["purchase_order_id"] for po in pos]

                if po_ids:
                    bills = supabase.table("ap_bills").select("bill_id").in_("purchase_order_id", po_ids).execute().data or []
                    bill_ids = [b["bill_id"] for b in bills]

                    if bill_ids:
                        bill_links = (
                            supabase.table("bir_form_bills")
                            .select("form_record_id")
                            .in_("bill_id", bill_ids)
                            .execute()
                            .data or []
                        )
                        form_ids.update(l["form_record_id"] for l in bill_links)
    except Exception:
        pass

    return list(form_ids)


@router.get("/bir-forms/by-invoice/{invoice_id}")
def get_2307_for_invoice(invoice_id: int):
    """Get the BIR 2307 form(s) linked to a specific AR invoice.
    Used to show related 2307 on invoice detail pages."""
    links = supabase.table("bir_form_invoices").select("form_record_id").eq("invoice_id", invoice_id).execute().data or []
    if not links:
        return []
    form_ids = [l["form_record_id"] for l in links]
    forms = supabase.table("bir_forms").select(
        "form_record_id, form_type, entity, period_from, period_to, status, payee_name, payee_tin, created_at"
    ).in_("form_record_id", form_ids).execute().data or []
    return forms


@router.get("/bir-forms/by-customer/{customer_id}")
def get_2307_for_customer(customer_id: int, entity: Optional[str] = Query(None)):
    """Get all BIR 2307 forms for a specific customer.
    Used to show related forms on customer detail pages."""
    q = supabase.table("bir_forms").select("*").eq("customer_id", customer_id).eq("form_type", "2307")
    if entity:
        q = q.eq("entity", entity)
    return q.order("period_from", desc=True).execute().data or []


@router.get("/bir-forms/{form_record_id}")
def get_bir_form(form_record_id: int):
    """Get a single BIR form record."""
    res = supabase.table("bir_forms").select("*").eq("form_record_id", form_record_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Form not found")
    # Include linked invoices
    links = supabase.table("bir_form_invoices").select("invoice_id").eq("form_record_id", form_record_id).execute().data or []
    invoice_ids = [l["invoice_id"] for l in links]
    invoices = []
    if invoice_ids:
        invoices = supabase.table("ar_invoices").select(
            "invoice_id, invoice_number, invoice_date, billing_subtotal, wht_amount, collection_status"
        ).in_("invoice_id", invoice_ids).order("invoice_date").execute().data or []
    res.data["linked_invoices"] = invoices
    return res.data


@router.get("/bir-forms/{form_record_id}/history")
def get_bir_form_history(form_record_id: int):
    """Get version/activity history for a BIR form."""
    history = supabase.table("bir_form_history").select("*").eq(
        "form_record_id", form_record_id
    ).order("created_at", desc=True).execute().data or []
    return history


class SubmitForApprovalPayload(BaseModel):
    approver_employee_id: Optional[int] = None
    remarks: Optional[str] = None
    force_submit: bool = True  # If False and warnings exist, returns warnings without submitting


@router.post("/bir-forms/{form_record_id}/submit-for-approval")
def submit_bir_form_for_approval(form_record_id: int, request: Request, payload: SubmitForApprovalPayload):
    """Submit a DRAFT BIR form for approval. Creates a workflow approval request.
    
    Returns warnings for missing critical fields (but still allows submission).
    """
    _, performed_by = _extract_jwt_claims(request)

    # Validate form exists and is DRAFT or stuck PENDING_APPROVAL (no workflow record)
    existing = supabase.table("bir_forms").select("*").eq("form_record_id", form_record_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Form not found")
    
    form_status = existing.data.get("status")
    if form_status == "PENDING_APPROVAL":
        # Check if workflow record exists — if not, allow re-submit
        wf_check = supabase.table("workflow_approvals").select("approval_id").eq(
            "reference_module", "Tax Management"
        ).eq("reference_id", form_record_id).eq("status", "Pending").execute().data or []
        if wf_check:
            raise HTTPException(status_code=400, detail="Form is already pending approval")
        # No workflow record — allow re-creation
    elif form_status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT forms can be submitted for approval")

    form = existing.data
    fd = form.get("form_data") or {}

    # ── Validation Warnings (non-blocking) ────────────────────────────────
    warnings = []

    # Check payor/payee TIN
    if not form.get("payor_tin") and not fd.get("payor_tin"):
        warnings.append("Payor TIN is empty")
    if not form.get("payee_tin") and not fd.get("payee_tin"):
        warnings.append("Payee TIN is empty")

    # Check payor/payee name
    if not form.get("payor_name") and not fd.get("payor_name"):
        warnings.append("Payor name is empty")
    if not form.get("payee_name") and not fd.get("payee_name"):
        warnings.append("Payee name is empty")

    # Check payor/payee address
    if not form.get("payor_address") and not fd.get("payor_address"):
        warnings.append("Payor address is empty")
    if not form.get("payee_address") and not fd.get("payee_address"):
        warnings.append("Payee address is empty")

    # Check form-specific table data
    form_type = form.get("form_type", "")
    if form_type == "2307":
        table_a = fd.get("table_a") or []
        table_b = fd.get("table_b") or []
        if not any(r.get("nature") or r.get("atc") for r in table_a) and not any(r.get("nature") or r.get("atc") for r in table_b):
            warnings.append("Both Table A and Table B are empty — no income payments recorded")
        total_withheld = sum(float(r.get("tax_withheld") or 0) for r in table_a) + sum(float(r.get("tax_withheld") or 0) for r in table_b)
        if total_withheld == 0:
            warnings.append("Total tax withheld is ₱0.00")
    elif form_type in ("0619E", "1601C", "1600VT", "1601EQ"):
        tax_due = float(fd.get("tax_due") or fd.get("total_tax_due") or fd.get("total_amount_remitted") or 0)
        if tax_due == 0:
            warnings.append("Tax remittance amount is ₱0.00")
    elif form_type == "2550Q":
        net_vat = float(fd.get("net_vat_payable") or fd.get("line27") or 0)
        if net_vat == 0:
            warnings.append("Net VAT payable is ₱0.00")

    # Check period
    if not form.get("period_from"):
        warnings.append("Period From date is not set")
    if not form.get("period_to"):
        warnings.append("Period To date is not set")

    # If payload has force_submit=false and there are warnings, return them without submitting
    if warnings and not getattr(payload, 'force_submit', True):
        return {"success": False, "warnings": warnings, "requires_confirmation": True}

    # Update form status to PENDING_APPROVAL
    supabase.table("bir_forms").update({
        "status": "PENDING_APPROVAL",
        "updated_at": datetime.now().isoformat(),
    }).eq("form_record_id", form_record_id).execute()

    # Create workflow approval request
    from routers.workflow_approval import submit_approval, ApprovalSubmit
    # We call the DB directly to avoid circular dependency issues
    req_eid = None
    req_name = performed_by
    emp_res = supabase.table("employees").select("employee_id, first_name, last_name").eq("email", performed_by).limit(1).execute()
    if emp_res.data:
        req_eid = emp_res.data[0]["employee_id"]
        req_name = f"{emp_res.data[0]['first_name']} {emp_res.data[0]['last_name']}"

    approver_name = ""
    if payload.approver_employee_id:
        approver_res = supabase.table("employees").select("first_name, last_name").eq("employee_id", payload.approver_employee_id).limit(1).execute()
        approver_name = f"{approver_res.data[0]['first_name']} {approver_res.data[0]['last_name']}" if approver_res.data else ""

    approval_data = {
        "request_type": "BIR Form Approval",
        "entity": form.get("entity"),
        "reference_module": "Tax Management",
        "reference_id": form_record_id,
        "reference_number": f"2307-{form.get('payee_name', '')[:30]}-{form.get('period_from', '')}",
        "requestor_employee_id": req_eid,
        "requestor_name": req_name,
        "amount": None,
        "approver_employee_id": payload.approver_employee_id,
        "approver_name": approver_name,
        "status": "Pending",
        "priority": "Normal",
        "remarks": payload.remarks or f"BIR 2307 for {form.get('payee_name')} ({form.get('period_from')} to {form.get('period_to')})",
    }
    try:
        supabase.table("workflow_approvals").insert(approval_data).execute()
    except Exception as e:
        # Revert form status if workflow insert fails
        supabase.table("bir_forms").update({"status": "DRAFT"}).eq("form_record_id", form_record_id).execute()
        raise HTTPException(status_code=500, detail=f"Failed to create approval record: {str(e)}")

    # Log history
    supabase.table("bir_form_history").insert({
        "form_record_id": form_record_id,
        "action": "SUBMITTED_FOR_APPROVAL",
        "details": f"Submitted for approval by {req_name}" + (f" to {approver_name}" if approver_name else ""),
        "performed_by": performed_by,
    }).execute()

    write_audit_log(
        action="SUBMIT", module_name=MODULE_NAME,
        description=f"BIR 2307 #{form_record_id} submitted for approval" + (f" to {approver_name}" if approver_name else ""),
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {"success": True, "status": "PENDING_APPROVAL", "warnings": warnings}


@router.post("/bir-forms", status_code=201)
def create_bir_form(request: Request, payload: BIRFormCreate):
    """Create a new BIR form record (draft or finalized)."""
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    data["created_by_employee_id"] = None  # Will be set from JWT if available
    data["form_code"] = generate_bir_form_code(data.get("entity"), data.get("form_type", ""))

    if data.get("status") == "FINALIZED":
        data["finalized_at"] = datetime.now().isoformat()

    res = supabase.table("bir_forms").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create form")

    # Log history
    supabase.table("bir_form_history").insert({
        "form_record_id": res.data[0]["form_record_id"],
        "action": "CREATED",
        "details": f"Form created as {data.get('status', 'DRAFT')}",
        "performed_by": performed_by,
    }).execute()

    write_audit_log(
        action="CREATE", module_name=MODULE_NAME,
        description=f"Created BIR {payload.form_type} form ({payload.status}) for {payload.payee_name or 'unknown'}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.put("/bir-forms/{form_record_id}")
def update_bir_form(form_record_id: int, request: Request, payload: BIRFormCreate):
    """Update an existing BIR form record."""
    _, performed_by = _extract_jwt_claims(request)

    # Check exists
    existing = supabase.table("bir_forms").select("*").eq("form_record_id", form_record_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Form not found")
    if existing.data.get("status") == "FINALIZED":
        raise HTTPException(status_code=400, detail="Cannot edit a finalized form")

    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    data["updated_at"] = datetime.now().isoformat()

    if data.get("status") == "FINALIZED":
        data["finalized_at"] = datetime.now().isoformat()

    res = supabase.table("bir_forms").update(data).eq("form_record_id", form_record_id).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to update form")

    # Log history with snapshot of previous state
    action = "FINALIZED" if data.get("status") == "FINALIZED" else "UPDATED"
    supabase.table("bir_form_history").insert({
        "form_record_id": form_record_id,
        "action": action,
        "details": f"Form {action.lower()} by {performed_by}",
        "snapshot": existing.data.get("form_data"),
        "performed_by": performed_by,
    }).execute()

    write_audit_log(
        action="UPDATE", module_name=MODULE_NAME,
        description=f"Updated BIR form #{form_record_id} ({payload.status})",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/bir-forms/{form_record_id}")
def delete_bir_form(form_record_id: int, request: Request):
    """Delete a BIR form record (only drafts)."""
    _, performed_by = _extract_jwt_claims(request)

    existing = supabase.table("bir_forms").select("*").eq("form_record_id", form_record_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Form not found")
    if existing.data.get("status") == "FINALIZED":
        raise HTTPException(status_code=400, detail="Cannot delete a finalized form")

    supabase.table("bir_forms").delete().eq("form_record_id", form_record_id).execute()

    write_audit_log(
        action="DELETE", module_name=MODULE_NAME,
        description=f"Deleted BIR form #{form_record_id}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return {"success": True}


@router.post("/bir-forms/repair-names")
def repair_bir_form_names(request: Request):
    """Batch repair BIR forms with missing payee_name or payor_name.
    
    Looks up the correct names from entity_tax_profiles (with fallback mapping)
    and client_list/supplier_list, then updates both top-level columns and form_data.
    """
    _extract_jwt_claims(request)  # Auth check

    # Find all forms with empty payee_name or payor_name
    forms = supabase.table("bir_forms").select(
        "form_record_id, form_type, entity, customer_id, supplier_id, payee_name, payor_name, form_data"
    ).execute().data or []

    fixed = 0
    for form in forms:
        updates = {}
        fd = form.get("form_data") or {}
        entity = form.get("entity") or ""

        # Fix missing payee_name
        if not form.get("payee_name"):
            # For AR-generated 2307: entity is payee
            if form.get("customer_id") and not form.get("supplier_id"):
                payee_name = _get_entity_registered_name(entity)
            # For AP-generated 2307: supplier is payee
            elif form.get("supplier_id"):
                sup_rows = supabase.table("supplier_list").select("company_name").eq(
                    "supplier_id", form["supplier_id"]
                ).execute().data or []
                payee_name = sup_rows[0]["company_name"] if sup_rows else ""
            else:
                payee_name = fd.get("payee_name", "") or _get_entity_registered_name(entity)

            if payee_name:
                updates["payee_name"] = payee_name
                if fd:
                    fd["payee_name"] = payee_name

        # Fix missing payor_name
        if not form.get("payor_name"):
            # For AP-generated 2307: entity is payor
            if form.get("supplier_id"):
                payor_name = _get_entity_registered_name(entity)
            # For AR-generated 2307: customer is payor
            elif form.get("customer_id"):
                cust_rows = supabase.table("client_list").select("company_name").eq(
                    "client_id", form["customer_id"]
                ).execute().data or []
                payor_name = cust_rows[0]["company_name"] if cust_rows else ""
            else:
                payor_name = fd.get("payor_name", "") or _get_entity_registered_name(entity)

            if payor_name:
                updates["payor_name"] = payor_name
                if fd:
                    fd["payor_name"] = payor_name

        if updates:
            if fd and ("payee_name" in updates or "payor_name" in updates):
                updates["form_data"] = fd
            supabase.table("bir_forms").update(updates).eq(
                "form_record_id", form["form_record_id"]
            ).execute()
            fixed += 1

    return {"success": True, "forms_fixed": fixed}


# ── Auto-generate 2307 from AR/Sales data ────────────────────────────────────

@router.get("/bir-forms/2307/auto-populate")
def auto_populate_2307(
    entity: Optional[str] = Query(None),
    customer_id: Optional[int] = Query(None),
    quarter: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
):
    """Auto-populate BIR 2307 from AR invoices.

    Given entity (payee — our company), customer (payor — withholds from us), quarter, and year, pulls:
    - Payee info from entity_tax_profiles (our company)
    - Payor info from client_list (the customer who pays and withholds)
    - Income/WHT breakdown from ar_invoices + ar_invoice_items by month and wht_code
    """
    from datetime import timedelta

    if not entity or not customer_id or not quarter or not year:
        raise HTTPException(status_code=400, detail="entity, customer_id, quarter, and year are required")

    # Quarter date range
    month_start = (quarter - 1) * 3 + 1
    period_from = f"{year}-{month_start:02d}-01"
    if quarter == 4:
        period_to = f"{year}-12-31"
    else:
        period_to = (date(year, month_start + 3, 1) - timedelta(days=1)).isoformat()

    # Payee (our entity — receives income)
    payee_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    payee = payee_rows[0] if payee_rows else {}

    # Payor (customer — pays and withholds tax)
    payor_rows = supabase.table("client_list").select("*").eq("client_id", customer_id).execute().data or []
    payor = payor_rows[0] if payor_rows else {}

    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    # Fetch confirmed invoices with WHT for this customer+entity+quarter
    q = supabase.table("ar_invoices").select(
        "invoice_id, invoice_number, invoice_date, billing_subtotal, wht_amount"
    ).eq("customer_id", customer_id).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("wht_amount", 0)
    q = q.eq("entity", entity)
    q = q.gte("invoice_date", period_from).lte("invoice_date", period_to)
    invoices = q.order("invoice_date").execute().data or []

    # Fetch line items for these invoices
    invoice_ids = [inv["invoice_id"] for inv in invoices]
    items_by_invoice = {}
    if invoice_ids:
        items_data = supabase.table("ar_invoice_items").select(
            "invoice_id, wht_code, vat_exclusive_amount"
        ).in_("invoice_id", invoice_ids).execute().data or []
        for item in items_data:
            items_by_invoice.setdefault(item["invoice_id"], []).append(item)

    # WHT code to ATC mapping
    wht_to_atc = {"WHT_MATERIAL_1": "WC158", "WHT_SERVICE_2": "WC010"}

    # Build breakdown by ATC and month
    atc_data = {}
    for inv in invoices:
        inv_month = int(inv["invoice_date"][5:7])
        month_idx = inv_month - month_start  # 0, 1, or 2
        month_key = f"month{month_idx + 1}"

        items = items_by_invoice.get(inv["invoice_id"], [])
        if not items:
            atc = "WC158"
            if atc not in atc_data:
                atc_data[atc] = {"nature": "Income payment", "atc": atc, "month1": 0, "month2": 0, "month3": 0, "tax_withheld": 0}
            atc_data[atc][month_key] += _num(inv["billing_subtotal"])
            atc_data[atc]["tax_withheld"] += _num(inv["wht_amount"])
        else:
            for item in items:
                wht_code = item.get("wht_code", "NO_WHT")
                atc = wht_to_atc.get(wht_code)
                if not atc:
                    continue
                if atc not in atc_data:
                    nature = "Material purchases (1%)" if "MATERIAL" in wht_code else "Professional/Service fees (2%)"
                    atc_data[atc] = {"nature": nature, "atc": atc, "month1": 0, "month2": 0, "month3": 0, "tax_withheld": 0}
                atc_data[atc][month_key] += _num(item.get("vat_exclusive_amount", 0))

            # Distribute invoice WHT across ATC codes proportionally
            total_base = sum(_num(it.get("vat_exclusive_amount", 0)) for it in items if wht_to_atc.get(it.get("wht_code")))
            if total_base > 0:
                for item in items:
                    atc = wht_to_atc.get(item.get("wht_code"))
                    if atc:
                        proportion = _num(item.get("vat_exclusive_amount", 0)) / total_base
                        atc_data[atc]["tax_withheld"] += _num(inv["wht_amount"]) * proportion

    # Build table_a (11 rows)
    empty_row = {"nature": "", "atc": "", "month1": "", "month2": "", "month3": "", "total": "", "tax_withheld": ""}
    table_a = []
    for d in atc_data.values():
        total = d["month1"] + d["month2"] + d["month3"]
        table_a.append({
            "nature": d["nature"], "atc": d["atc"],
            "month1": f"{d['month1']:.2f}" if d["month1"] else "",
            "month2": f"{d['month2']:.2f}" if d["month2"] else "",
            "month3": f"{d['month3']:.2f}" if d["month3"] else "",
            "total": f"{total:.2f}" if total else "",
            "tax_withheld": f"{d['tax_withheld']:.2f}" if d["tax_withheld"] else "",
        })
    while len(table_a) < 11:
        table_a.append({**empty_row})
    table_b = [{**empty_row} for _ in range(11)]

    return {
        "period_from": period_from,
        "period_to": period_to,
        "payor_tin": tin_segments(payor.get("tin_number", "")),
        "payor_name": payor.get("company_name", ""),
        "payor_address": payor.get("address", "") or payor.get("billing_address", ""),
        "payor_zip_code": payor.get("zip_code", ""),
        "payor_foreign_address": "",
        "payee_tin": tin_segments(payee.get("tin", "")),
        "payee_name": _get_entity_registered_name(entity, payee),
        "payee_address": payee.get("registered_address", ""),
        "payee_zip_code": payee.get("zip_code", ""),
        "payee_foreign_address": "",
        "payor_signatory_name": "",
        "payor_signatory_title_tin": "",
        "payee_signatory_name": payee.get("authorized_signatory", ""),
        "payee_signatory_title_tin": payee.get("signatory_title", ""),
        "payor_agent_accreditation_no": "",
        "payor_date_of_issue": "", "payor_date_of_expiry": "",
        "payee_agent_accreditation_no": "",
        "payee_date_of_issue": "", "payee_date_of_expiry": "",
        "table_a": table_a,
        "table_b": table_b,
        "source_invoices": [{"invoice_id": inv["invoice_id"], "invoice_number": inv["invoice_number"]} for inv in invoices],
        "auto_populated": True,
    }


@router.post("/bir-forms/2307/backfill")
def backfill_2307_forms(request: Request):
    """Generate 2307 forms for ALL existing confirmed invoices with WHT.
    
    Run this once to catch up on historical data. Safe to run multiple times
    — it won't duplicate forms because generate_or_update_2307_for_invoice
    finds existing drafts before creating new ones.
    """
    _, performed_by = _extract_jwt_claims(request)

    # Get all confirmed invoices with WHT > 0
    invoices = supabase.table("ar_invoices").select(
        "invoice_id, invoice_number, invoice_date, customer_id, entity, billing_subtotal, wht_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("wht_amount", 0).execute().data or []

    created = 0
    updated = 0
    errors = 0

    for inv in invoices:
        try:
            # Check if already linked
            existing_link = supabase.table("bir_form_invoices").select("id").eq("invoice_id", inv["invoice_id"]).execute().data or []
            was_new = len(existing_link) == 0

            result = generate_or_update_2307_for_invoice(inv["invoice_id"], inv)
            if result:
                if was_new:
                    created += 1
                else:
                    updated += 1
        except Exception:
            errors += 1

    write_audit_log(
        action="BACKFILL", module_name=MODULE_NAME,
        description=f"Backfilled 2307 forms: {created} new links, {updated} updated, {errors} errors from {len(invoices)} invoices",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {
        "total_invoices_processed": len(invoices),
        "new_links_created": created,
        "existing_updated": updated,
        "errors": errors,
    }


# ── Received 2307 file upload (AR side) ──────────────────────────────────────

ALLOWED_2307_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}
MAX_2307_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/received-2307/{invoice_id}/upload")
async def upload_received_2307(
    invoice_id: int,
    request: Request,
    file: UploadFile = File(...),
):
    """Upload a received BIR 2307 certificate from a client for an AR invoice.

    In the AR context, the client withholds tax from your payment and issues
    you a 2307 certificate. This endpoint stores that file.
    """
    import uuid
    _, performed_by = _extract_jwt_claims(request)

    # Verify invoice exists
    inv = supabase.table("ar_invoices").select(
        "invoice_id, invoice_number, entity, customer_id"
    ).eq("invoice_id", invoice_id).execute().data
    if not inv:
        raise HTTPException(status_code=404, detail={"error": "Invoice not found."})
    invoice = inv[0]

    # Validate MIME type
    if file.content_type not in ALLOWED_2307_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Unsupported file type. Accepted: PDF, JPG, PNG, WEBP.",
                "fields": {"file": "Accepted formats: PDF, JPG, PNG, WEBP"},
            },
        )

    # Read and validate size
    file_content = await file.read()
    if len(file_content) > MAX_2307_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "File too large. Maximum size is 10MB.",
                "fields": {"file": "Maximum file size is 10MB."},
            },
        )

    # Upload to Supabase Storage
    file_uuid = str(uuid.uuid4())
    filename = file.filename or "2307.pdf"
    storage_path = f"received-2307/{invoice_id}/{file_uuid}_{filename}"

    try:
        supabase.storage.from_("tax-documents").upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": file.content_type},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "File upload failed. Please try again."},
        )

    # Get public URL
    file_url = supabase.storage.from_("tax-documents").get_public_url(storage_path)

    # Update the invoice with the file URL
    supabase.table("ar_invoices").update({
        "received_2307_url": file_url,
        "received_2307_uploaded_at": datetime.now().isoformat(),
    }).eq("invoice_id", invoice_id).execute()

    write_audit_log(
        action="UPLOAD", module_name=MODULE_NAME,
        description=f"Uploaded received 2307 for invoice {invoice.get('invoice_number', invoice_id)}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {
        "invoice_id": invoice_id,
        "file_url": file_url,
        "filename": filename,
        "uploaded_at": datetime.now().isoformat(),
    }


@router.delete("/received-2307/{invoice_id}")
def delete_received_2307(invoice_id: int, request: Request):
    """Remove a previously uploaded received 2307 from an AR invoice."""
    _, performed_by = _extract_jwt_claims(request)

    inv = supabase.table("ar_invoices").select(
        "invoice_id, invoice_number, received_2307_url"
    ).eq("invoice_id", invoice_id).execute().data
    if not inv:
        raise HTTPException(status_code=404, detail={"error": "Invoice not found."})
    invoice = inv[0]

    if not invoice.get("received_2307_url"):
        raise HTTPException(status_code=404, detail={"error": "No 2307 file attached to this invoice."})

    # Remove from storage (extract path from URL)
    try:
        url = invoice["received_2307_url"]
        # URL format: .../storage/v1/object/public/tax-documents/received-2307/...
        path_part = url.split("/tax-documents/")[-1] if "/tax-documents/" in url else None
        if path_part:
            supabase.storage.from_("tax-documents").remove([path_part])
    except Exception:
        pass  # Non-critical if storage removal fails

    # Clear from invoice record
    supabase.table("ar_invoices").update({
        "received_2307_url": None,
        "received_2307_uploaded_at": None,
    }).eq("invoice_id", invoice_id).execute()

    write_audit_log(
        action="DELETE", module_name=MODULE_NAME,
        description=f"Removed received 2307 from invoice {invoice.get('invoice_number', invoice_id)}",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {"invoice_id": invoice_id, "message": "Received 2307 removed."}


@router.post("/bir-forms/{form_record_id}/upload-received")
async def upload_received_2307_for_form(
    form_record_id: int,
    request: Request,
    file: UploadFile = File(...),
):
    """Upload the actual received BIR 2307 certificate from a client for a specific form record.

    This attaches the physical document the client handed over to the
    system-generated form record, enabling reconciliation.
    """
    import uuid
    _, performed_by = _extract_jwt_claims(request)

    # Verify form exists and is a receivable (customer_id set)
    form = supabase.table("bir_forms").select("*").eq("form_record_id", form_record_id).execute().data
    if not form:
        raise HTTPException(status_code=404, detail={"error": "Form record not found."})
    form = form[0]

    if not form.get("customer_id"):
        raise HTTPException(status_code=422, detail={"error": "This form is not a receivable 2307 (no customer linked)."})

    # Validate MIME type
    if file.content_type not in ALLOWED_2307_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Unsupported file type. Accepted: PDF, JPG, PNG, WEBP."},
        )

    file_content = await file.read()
    if len(file_content) > MAX_2307_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "File too large. Maximum size is 10MB."},
        )

    # Upload to Supabase Storage
    file_uuid = str(uuid.uuid4())
    filename = file.filename or "2307-received.pdf"
    storage_path = f"received-2307/forms/{form_record_id}/{file_uuid}_{filename}"

    try:
        supabase.storage.from_("tax-documents").upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": file.content_type},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "File upload failed. Please try again."},
        )

    file_url = supabase.storage.from_("tax-documents").get_public_url(storage_path)

    # Store on the form record
    supabase.table("bir_forms").update({
        "received_file_url": file_url,
        "received_file_name": filename,
        "received_at": datetime.now().isoformat(),
    }).eq("form_record_id", form_record_id).execute()

    # Log
    supabase.table("bir_form_history").insert({
        "form_record_id": form_record_id,
        "action": "RECEIVED_UPLOADED",
        "details": f"Uploaded received 2307 from client: {filename}",
        "performed_by": performed_by or "System",
    }).execute()

    write_audit_log(
        action="UPLOAD", module_name=MODULE_NAME,
        description=f"Uploaded received 2307 for form #{form_record_id} ({form.get('form_code', '')})",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {
        "form_record_id": form_record_id,
        "file_url": file_url,
        "filename": filename,
        "uploaded_at": datetime.now().isoformat(),
    }


@router.get("/customers-with-wht")
def customers_with_wht(
    entity: Optional[str] = Query(None),
    quarter: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
):
    """List customers that have WHT on invoices for a given entity+quarter.
    Used by the frontend to show which customers need a 2307 generated."""
    from datetime import timedelta

    if not quarter or not year:
        raise HTTPException(status_code=400, detail="quarter and year are required")

    month_start = (quarter - 1) * 3 + 1
    period_from = f"{year}-{month_start:02d}-01"
    if quarter == 4:
        period_to = f"{year}-12-31"
    else:
        period_to = (date(year, month_start + 3, 1) - timedelta(days=1)).isoformat()

    q = supabase.table("ar_invoices").select(
        "customer_id, billing_subtotal, wht_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("wht_amount", 0)
    q = q.gte("invoice_date", period_from).lte("invoice_date", period_to)
    if entity:
        q = q.eq("entity", entity)
    invoices = q.execute().data or []

    # Group by customer
    customers_map = {}
    for inv in invoices:
        cid = inv["customer_id"]
        if cid not in customers_map:
            customers_map[cid] = {"customer_id": cid, "total_billing": 0, "total_wht": 0, "invoice_count": 0}
        customers_map[cid]["total_billing"] += _num(inv["billing_subtotal"])
        customers_map[cid]["total_wht"] += _num(inv["wht_amount"])
        customers_map[cid]["invoice_count"] += 1

    # Enrich with customer names
    customer_ids = list(customers_map.keys())
    if customer_ids:
        cust_rows = supabase.table("client_list").select("client_id, company_name, tin_number").in_("client_id", customer_ids).execute().data or []
        for c in cust_rows:
            if c["client_id"] in customers_map:
                customers_map[c["client_id"]]["company_name"] = c.get("company_name", "")
                customers_map[c["client_id"]]["tin"] = c.get("tin_number", "")

    result = sorted(customers_map.values(), key=lambda x: x["total_wht"], reverse=True)
    return result


@router.get("/dashboard")
def tax_dashboard(
    period_from: Optional[str] = Query(None),
    period_to: Optional[str] = Query(None),
):
    """Aggregated tax dashboard with all details."""
    vat = vat_summary(period_from, period_to)
    wht = wht_summary(period_from, period_to)
    deadlines = filing_deadlines()

    upcoming_urgent = [d for d in deadlines if d["days_remaining"] <= 7]
    upcoming_warning = [d for d in deadlines if 7 < d["days_remaining"] <= 14]

    return {
        "vat": vat,
        "wht": wht,
        "deadlines": deadlines,
        "alerts": {
            "urgent_count": len(upcoming_urgent),
            "warning_count": len(upcoming_warning),
        },
    }


# ── Compliance Check (Dashboard Intelligence) ────────────────────────────────

@router.get("/compliance-check")
def compliance_check(entity: Optional[str] = Query(None)):
    """Identify missing forms, overdue filings, forms needing action, and upcoming obligations.

    Returns:
    - missing_forms: expected monthly/quarterly forms that haven't been generated yet
    - overdue: deadlines that have passed without a FINALIZED form on record
    - needs_action: DRAFT forms that should be reviewed/finalized, PENDING_APPROVAL forms
    - upcoming: next obligations coming due with days remaining
    - recent_activity: last 10 form history entries
    - entity_gaps: entities without tax profiles or with incomplete data
    """
    from calendar import monthrange
    from datetime import timedelta

    today = date.today()
    current_month = today.month
    current_year = today.year

    # Previous month (the one whose forms should already exist)
    if current_month == 1:
        prev_month, prev_year = 12, current_year - 1
    else:
        prev_month, prev_year = current_month - 1, current_year

    # Two months ago (should definitely be finalized by now)
    if prev_month == 1:
        two_months_ago, two_months_year = 12, prev_year - 1
    else:
        two_months_ago, two_months_year = prev_month - 1, prev_year

    # Get all entities or filter
    entities_to_check = []
    if entity and entity != 'All':
        entities_to_check = [entity]
    else:
        profiles = supabase.table("entity_tax_profiles").select("entity").execute().data or []
        entities_to_check = [p["entity"] for p in profiles]

    # ── Missing Forms ─────────────────────────────────────────────────────────
    # Monthly forms that should exist for prev_month: 0619E, 1601C, 1600VT
    monthly_forms_expected = ["0619E", "1601C", "1600VT"]
    prev_last_day = monthrange(prev_year, prev_month)[1]
    prev_period_from = f"{prev_year}-{prev_month:02d}-01"
    prev_period_to = f"{prev_year}-{prev_month:02d}-{prev_last_day:02d}"

    missing_forms = []

    for ent in entities_to_check:
        for form_type in monthly_forms_expected:
            existing = supabase.table("bir_forms").select("form_record_id, status").eq(
                "form_type", form_type
            ).eq("entity", ent).eq(
                "period_from", prev_period_from
            ).eq("period_to", prev_period_to).execute().data or []

            if not existing:
                missing_forms.append({
                    "form_type": form_type,
                    "entity": ent,
                    "period": f"{prev_month:02d}/{prev_year}",
                    "period_from": prev_period_from,
                    "period_to": prev_period_to,
                    "severity": "high",
                    "message": f"No {form_type} form generated for {ent} ({prev_month:02d}/{prev_year})",
                })

        # Quarterly check (if prev_month was a quarter-end month)
        if prev_month in (3, 6, 9, 12):
            quarter = prev_month // 3
            q_month_start = (quarter - 1) * 3 + 1
            q_period_from = f"{prev_year}-{q_month_start:02d}-01"
            q_period_to = prev_period_to

            quarterly_forms_expected = ["1601EQ", "2550Q"]
            if quarter <= 3:
                quarterly_forms_expected.append("1702Q")

            for form_type in quarterly_forms_expected:
                existing = supabase.table("bir_forms").select("form_record_id, status").eq(
                    "form_type", form_type
                ).eq("entity", ent).eq(
                    "period_from", q_period_from
                ).eq("period_to", q_period_to).execute().data or []

                if not existing:
                    missing_forms.append({
                        "form_type": form_type,
                        "entity": ent,
                        "period": f"Q{quarter}/{prev_year}",
                        "period_from": q_period_from,
                        "period_to": q_period_to,
                        "severity": "high",
                        "message": f"No {form_type} form generated for {ent} (Q{quarter}/{prev_year})",
                    })

    # ── Overdue (forms that exist but are still DRAFT past their deadline) ────
    overdue = []

    # Check forms from 2 months ago that are still DRAFT (should be finalized by now)
    two_last_day = monthrange(two_months_year, two_months_ago)[1]
    two_period_from = f"{two_months_year}-{two_months_ago:02d}-01"
    two_period_to = f"{two_months_year}-{two_months_ago:02d}-{two_last_day:02d}"

    stale_drafts_q = supabase.table("bir_forms").select(
        "form_record_id, form_type, entity, period_from, period_to, status, created_at"
    ).eq("status", "DRAFT").lte("period_to", two_period_to)
    if entity and entity != 'All':
        stale_drafts_q = stale_drafts_q.eq("entity", entity)
    stale_drafts = stale_drafts_q.order("period_from").limit(20).execute().data or []

    for form in stale_drafts:
        overdue.append({
            "form_record_id": form["form_record_id"],
            "form_type": form["form_type"],
            "entity": form.get("entity", "—"),
            "period": f"{form.get('period_from', '')} to {form.get('period_to', '')}",
            "status": form["status"],
            "severity": "high",
            "message": f"{form['form_type']} for {form.get('entity', '?')} ({form.get('period_from', '')}) is still in DRAFT",
        })

    # ── Needs Action (current DRAFT + PENDING_APPROVAL forms) ─────────────────
    needs_action = []

    action_q = supabase.table("bir_forms").select(
        "form_record_id, form_type, entity, period_from, period_to, status, payee_name, created_at"
    ).in_("status", ["DRAFT", "PENDING_APPROVAL"])
    if entity and entity != 'All':
        action_q = action_q.eq("entity", entity)
    action_forms = action_q.order("created_at", desc=True).limit(30).execute().data or []

    for form in action_forms:
        severity = "medium" if form["status"] == "DRAFT" else "low"
        action_label = "Review & Finalize" if form["status"] == "DRAFT" else "Awaiting Approval"
        needs_action.append({
            "form_record_id": form["form_record_id"],
            "form_type": form["form_type"],
            "entity": form.get("entity", "—"),
            "period_from": form.get("period_from", ""),
            "period_to": form.get("period_to", ""),
            "payee_name": form.get("payee_name", ""),
            "status": form["status"],
            "action": action_label,
            "severity": severity,
        })

    # ── Upcoming Obligations ──────────────────────────────────────────────────
    deadlines = filing_deadlines()
    upcoming = [d for d in deadlines if d["days_remaining"] >= 0]

    # ── Recent Activity ───────────────────────────────────────────────────────
    history_q = supabase.table("bir_form_history").select(
        "form_record_id, action, details, performed_by, created_at"
    ).order("created_at", desc=True).limit(15)
    recent_activity = history_q.execute().data or []

    # Enrich with form type
    if recent_activity:
        form_ids = list(set(h["form_record_id"] for h in recent_activity))
        forms_info = supabase.table("bir_forms").select(
            "form_record_id, form_type, entity, payee_name"
        ).in_("form_record_id", form_ids).execute().data or []
        forms_map = {f["form_record_id"]: f for f in forms_info}
        for h in recent_activity:
            f = forms_map.get(h["form_record_id"], {})
            h["form_type"] = f.get("form_type", "—")
            h["entity"] = f.get("entity", "—")
            h["payee_name"] = f.get("payee_name", "")

    # ── Entity Gaps ───────────────────────────────────────────────────────────
    entity_gaps = []
    all_expected_entities = ["Expedia", "GreatnessLab", "Exigent", "KSI"]
    existing_profiles = supabase.table("entity_tax_profiles").select("entity, tin, rdo_code, registered_name").execute().data or []
    existing_entity_names = [p["entity"] for p in existing_profiles]

    for ent_name in all_expected_entities:
        if ent_name not in existing_entity_names:
            entity_gaps.append({
                "entity": ent_name,
                "issue": "No tax profile configured",
                "severity": "high",
            })
        else:
            profile = next((p for p in existing_profiles if p["entity"] == ent_name), {})
            if not profile.get("tin"):
                entity_gaps.append({"entity": ent_name, "issue": "Missing TIN", "severity": "medium"})
            if not profile.get("rdo_code"):
                entity_gaps.append({"entity": ent_name, "issue": "Missing RDO code", "severity": "low"})

    # ── Form Status Summary ───────────────────────────────────────────────────
    status_counts_q = supabase.table("bir_forms").select("status")
    if entity and entity != 'All':
        status_counts_q = status_counts_q.eq("entity", entity)
    all_forms = status_counts_q.execute().data or []

    status_summary = {"DRAFT": 0, "FINALIZED": 0, "PENDING_APPROVAL": 0}
    for f in all_forms:
        s = f.get("status", "DRAFT")
        if s in status_summary:
            status_summary[s] += 1

    # ── Missing Official BIR Forms (finalized but no uploaded copy) ─────────
    missing_official = []
    finalized_q = supabase.table("bir_forms").select(
        "form_record_id, form_type, entity, period_from, period_to, payee_name, status"
    ).eq("status", "FINALIZED")
    if entity and entity != 'All':
        finalized_q = finalized_q.eq("entity", entity)
    finalized_forms = finalized_q.order("period_from", desc=True).limit(50).execute().data or []

    if finalized_forms:
        finalized_ids = [f["form_record_id"] for f in finalized_forms]
        official_uploads = supabase.table("bir_official_forms").select(
            "form_record_id"
        ).in_("form_record_id", finalized_ids).eq("is_current", True).execute().data or []
        uploaded_ids = set(o["form_record_id"] for o in official_uploads)

        for form in finalized_forms:
            if form["form_record_id"] not in uploaded_ids:
                missing_official.append({
                    "form_record_id": form["form_record_id"],
                    "form_type": form["form_type"],
                    "entity": form.get("entity", "—"),
                    "period": f"{form.get('period_from', '')} to {form.get('period_to', '')}",
                    "period_from": form.get("period_from", ""),
                    "period_to": form.get("period_to", ""),
                    "payee_name": form.get("payee_name", ""),
                    "severity": "medium",
                    "message": f"Official filed copy not uploaded for {form['form_type']} ({form.get('entity', '')})",
                })

    return {
        "missing_forms": missing_forms,
        "missing_official": missing_official,
        "overdue": overdue,
        "needs_action": needs_action,
        "upcoming": upcoming,
        "recent_activity": recent_activity,
        "entity_gaps": entity_gaps,
        "status_summary": status_summary,
        "summary": {
            "missing_count": len(missing_forms),
            "missing_official_count": len(missing_official),
            "overdue_count": len(overdue),
            "needs_action_count": len(needs_action),
            "urgent_deadlines": len([d for d in upcoming if d["days_remaining"] <= 7]),
        },
    }


# ── BIR Form 0619-E Auto-Populate ────────────────────────────────────────────

@router.get("/bir-forms/0619E/auto-populate")
def auto_populate_0619e(
    entity: str = Query(..., description="Entity name"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    year: int = Query(..., description="Tax year"),
):
    """Auto-populate BIR Form 0619-E (Monthly Remittance of Creditable Income Taxes Withheld - Expanded).

    Pulls EWT data from confirmed AP bills for the given entity+month+year and
    returns pre-filled form data matching the 0619-E structure.
    """
    # Get entity tax profile
    profile_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    if not profile_rows:
        raise HTTPException(status_code=404, detail="Entity tax profile not found")
    profile = profile_rows[0]

    # Build date range for the month
    period_from = f"{year}-{month:02d}-01"
    if month == 12:
        period_to = f"{year}-12-31"
    else:
        from datetime import timedelta
        period_to = (date(year, month + 1, 1) - timedelta(days=1)).isoformat()

    # Query AP bills with EWT for this entity+month
    ap_query = supabase.table("ap_bills").select(
        "bill_id, bill_number, bill_date, supplier_id, ewt_material"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("ewt_material", 0).eq("entity", entity)
    ap_query = ap_query.gte("bill_date", period_from).lte("bill_date", period_to)
    ap_bills = ap_query.order("bill_date").execute().data or []

    # Calculate total taxes withheld
    total_taxes_withheld = round(sum(_num(bill.get("ewt_material")) for bill in ap_bills), 2)

    # Build supplier breakdown
    suppliers = _supplier_map()
    ewt_by_supplier = {}
    for bill in ap_bills:
        sid = bill.get("supplier_id")
        if sid not in ewt_by_supplier:
            sup = suppliers.get(sid, {})
            ewt_by_supplier[sid] = {
                "supplier_id": sid,
                "supplier_name": sup.get("company_name", "—"),
                "tin": sup.get("tin_number", "—"),
                "total_ewt": 0.0,
                "bill_count": 0,
            }
        ewt_by_supplier[sid]["total_ewt"] += _num(bill.get("ewt_material"))
        ewt_by_supplier[sid]["bill_count"] += 1

    for v in ewt_by_supplier.values():
        v["total_ewt"] = round(v["total_ewt"], 2)

    supplier_breakdown = sorted(ewt_by_supplier.values(), key=lambda x: x["total_ewt"], reverse=True)

    # TIN segments (split by '-')
    tin_str = profile.get("tin", "")
    tin_parts = tin_str.split("-") if tin_str else []
    tin_segments = [tin_parts[i] if i < len(tin_parts) else "" for i in range(4)]

    # Compute line items
    line_12_total_withheld = total_taxes_withheld
    line_13_prev_remitted = 0.0
    line_14_tax_still_due = round(line_12_total_withheld - line_13_prev_remitted, 2)
    line_15a_surcharge = 0.0
    line_15b_interest = 0.0
    line_15c_compromise = 0.0
    line_16_total_due = round(line_14_tax_still_due + line_15a_surcharge + line_15b_interest + line_15c_compromise, 2)

    form_data = {
        "return_period": f"{month:02d}/{year}",
        "amended_return": False,
        "tin_segments": tin_segments,
        "rdo_code": profile.get("rdo_code", ""),
        "taxpayer_name": _get_entity_registered_name(entity, profile),
        "address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "line_12_total_withheld": line_12_total_withheld,
        "line_13_prev_remitted": line_13_prev_remitted,
        "line_14_tax_still_due": line_14_tax_still_due,
        "line_15a_surcharge": line_15a_surcharge,
        "line_15b_interest": line_15b_interest,
        "line_15c_compromise": line_15c_compromise,
        "line_16_total_due": line_16_total_due,
        "supplier_breakdown": supplier_breakdown,
        "auto_populated": True,
    }

    return form_data



# ── BIR Form 1601-C Auto-Populate ────────────────────────────────────────────

@router.get("/bir-forms/1601C/auto-populate")
def auto_populate_1601c(
    entity: str = Query(..., description="Entity name"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    year: int = Query(..., description="Tax year"),
):
    """Auto-populate BIR 1601-C from payroll data.
    
    Aggregates withholding tax on compensation from payroll_items
    for all payroll runs in the given month/year.
    """
    from calendar import monthrange
    
    period_from = f"{year}-{month:02d}-01"
    last_day = monthrange(year, month)[1]
    period_to = f"{year}-{month:02d}-{last_day:02d}"
    
    # Get entity tax profile
    profiles = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profiles[0] if profiles else {}
    
    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]
    
    # Get payroll runs for this period (any status except DRAFT to avoid incomplete data)
    runs = supabase.table("payroll_runs").select("run_id, period_start, period_end, status").gte(
        "period_start", period_from
    ).lte("period_end", period_to).neq("status", "DRAFT").execute().data or []
    
    run_ids = [r["run_id"] for r in runs]
    
    # Get all payroll items for these runs
    items = []
    if run_ids:
        items = supabase.table("payroll_items").select(
            "employee_id, employee_name, gross_pay, withholding_tax, sss_employee, philhealth_employee, pagibig_employee"
        ).in_("run_id", run_ids).execute().data or []
    
    # Aggregate by employee
    emp_totals = {}
    for item in items:
        eid = item["employee_id"]
        if eid not in emp_totals:
            emp_totals[eid] = {
                "employee_id": eid,
                "employee_name": item.get("employee_name", ""),
                "gross_compensation": 0,
                "withholding_tax": 0,
                "sss": 0, "philhealth": 0, "pagibig": 0,
            }
        emp_totals[eid]["gross_compensation"] += _num(item.get("gross_pay"))
        emp_totals[eid]["withholding_tax"] += _num(item.get("withholding_tax"))
        emp_totals[eid]["sss"] += _num(item.get("sss_employee"))
        emp_totals[eid]["philhealth"] += _num(item.get("philhealth_employee"))
        emp_totals[eid]["pagibig"] += _num(item.get("pagibig_employee"))
    
    # Totals
    total_compensation = sum(e["gross_compensation"] for e in emp_totals.values())
    total_statutory = sum(e["sss"] + e["philhealth"] + e["pagibig"] for e in emp_totals.values())
    total_taxable = total_compensation - total_statutory
    total_wht = sum(e["withholding_tax"] for e in emp_totals.values())
    
    return {
        "return_period": f"{month:02d}/{year}",
        "amended_return": False,
        "tin": tin_segments(profile.get("tin", "")),
        "rdo_code": profile.get("rdo_code", ""),
        "taxpayer_name": _get_entity_registered_name(entity, profile),
        "registered_address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "category_of_agent": "Private",
        "number_of_employees": len(emp_totals),
        # Schedule 1 - Compensation
        "schedule1_total_compensation": round(total_compensation, 2),
        "schedule1_statutory_min_wage": 0,
        "schedule1_holiday_ot_night": 0,
        "schedule1_13th_month_benefits": 0,
        "schedule1_deminimis": 0,
        "schedule1_sss_gsis_philhealth_pagibig": round(total_statutory, 2),
        "schedule1_other_nontaxable": 0,
        "schedule1_taxable_compensation": round(total_taxable, 2),
        # Taxes Withheld
        "line_17_taxes_withheld": round(total_wht, 2),
        "line_18_adjustment_prev_month": 0,
        "line_19_total_withheld": round(total_wht, 2),
        "line_20_prev_remittance": 0,
        "line_21_tax_still_due": round(total_wht, 2),
        "line_22a_surcharge": 0,
        "line_22b_interest": 0,
        "line_22c_compromise": 0,
        "line_23_total_penalties": 0,
        "line_24_total_due": round(total_wht, 2),
        # Employee breakdown
        "employee_breakdown": sorted(emp_totals.values(), key=lambda x: x["withholding_tax"], reverse=True),
        "payroll_runs_included": [{"run_id": r["run_id"], "period": f"{r['period_start']} to {r['period_end']}", "status": r["status"]} for r in runs],
        "auto_populated": True,
    }




# ── BIR Form 1601-EQ Auto-Populate ──────────────────────────────────────────

@router.get("/bir-forms/1601EQ/auto-populate")
def auto_populate_1601eq(
    entity: str = Query(..., description="Entity name"),
    quarter: int = Query(..., ge=1, le=4, description="Quarter (1-4)"),
    year: int = Query(..., description="Tax year"),
):
    """Auto-populate BIR 1601-EQ from AP bills EWT data.
    
    The 1601-EQ is a quarterly return that summarizes all expanded
    withholding taxes remitted via 0619-E during the quarter, plus
    an alphalist of payees (suppliers from whom tax was withheld).
    """
    from datetime import timedelta
    from calendar import monthrange
    
    # Quarter date range
    month_start = (quarter - 1) * 3 + 1
    period_from = f"{year}-{month_start:02d}-01"
    if quarter == 4:
        period_to = f"{year}-12-31"
    else:
        period_to = (date(year, month_start + 3, 1) - timedelta(days=1)).isoformat()
    
    # Entity tax profile
    profiles = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profiles[0] if profiles else {}
    
    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]
    
    # Get confirmed AP bills with EWT for this entity + quarter
    q = supabase.table("ap_bills").select(
        "bill_id, bill_number, bill_date, supplier_id, vat_exclusive_amount, ewt_material, gross_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("ewt_material", 0)
    q = q.eq("entity", entity)
    q = q.gte("bill_date", period_from).lte("bill_date", period_to)
    bills = q.order("bill_date").execute().data or []
    
    # Get supplier info
    supplier_ids = list(set(b["supplier_id"] for b in bills if b.get("supplier_id")))
    supplier_map = {}
    if supplier_ids:
        sup_rows = supabase.table("supplier_list").select(
            "supplier_id, company_name, tin_number, address"
        ).in_("supplier_id", supplier_ids).execute().data or []
        supplier_map = {s["supplier_id"]: s for s in sup_rows}
    
    # Monthly breakdown (for the 3 months in the quarter)
    monthly_totals = {1: 0, 2: 0, 3: 0}  # month offset -> total EWT
    for bill in bills:
        bill_month = int(bill["bill_date"][5:7])
        month_idx = bill_month - month_start + 1  # 1, 2, or 3
        if 1 <= month_idx <= 3:
            monthly_totals[month_idx] += _num(bill.get("ewt_material"))
    
    total_ewt = sum(monthly_totals.values())
    
    # Build alphalist (schedule of payees)
    alphalist = {}
    for bill in bills:
        sid = bill.get("supplier_id")
        if not sid:
            continue
        if sid not in alphalist:
            sup = supplier_map.get(sid, {})
            alphalist[sid] = {
                "supplier_id": sid,
                "payee_name": sup.get("company_name", ""),
                "tin": sup.get("tin_number", ""),
                "address": sup.get("address", ""),
                "income_payment": 0,
                "tax_withheld": 0,
                "atc_code": "WC010",  # Default: professional/service
            }
        alphalist[sid]["income_payment"] += _num(bill.get("vat_exclusive_amount"))
        alphalist[sid]["tax_withheld"] += _num(bill.get("ewt_material"))
    
    # Round alphalist values
    alphalist_list = []
    for entry in alphalist.values():
        entry["income_payment"] = round(entry["income_payment"], 2)
        entry["tax_withheld"] = round(entry["tax_withheld"], 2)
        alphalist_list.append(entry)
    alphalist_list.sort(key=lambda x: x["tax_withheld"], reverse=True)
    
    return {
        "return_period": f"Q{quarter}/{year}",
        "quarter": quarter,
        "year": year,
        "amended_return": False,
        "tin": tin_segments(profile.get("tin", "")),
        "rdo_code": profile.get("rdo_code", ""),
        "taxpayer_name": _get_entity_registered_name(entity, profile),
        "registered_address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "category_of_agent": "Private",
        # Monthly remittances (from 0619-E filings)
        "month1_remittance": round(monthly_totals[1], 2),
        "month2_remittance": round(monthly_totals[2], 2),
        "month3_remittance": 0,  # 3rd month is filed with this 1601-EQ
        "month3_tax_withheld": round(monthly_totals[3], 2),
        # Computation
        "line_15_total_remitted_prev": round(monthly_totals[1] + monthly_totals[2], 2),
        "line_16_tax_withheld_3rd_month": round(monthly_totals[3], 2),
        "line_17_total_tax_due": round(total_ewt, 2),
        "line_18_overremittance_prev_qtr": 0,
        "line_19_tax_still_due": round(total_ewt, 2),
        "line_20_less_prev_remitted": round(monthly_totals[1] + monthly_totals[2], 2),
        "line_21_balance_still_due": round(monthly_totals[3], 2),
        "line_22a_surcharge": 0,
        "line_22b_interest": 0,
        "line_22c_compromise": 0,
        "line_23_total_penalties": 0,
        "line_24_total_due": round(monthly_totals[3], 2),
        # Alphalist
        "alphalist": alphalist_list,
        "total_income_payments": round(sum(a["income_payment"] for a in alphalist_list), 2),
        "total_taxes_withheld": round(total_ewt, 2),
        "number_of_payees": len(alphalist_list),
        "auto_populated": True,
    }




# ── BIR Form 2550Q Auto-Populate ───────────────────────────────────────────

@router.get("/bir-forms/2550Q/auto-populate")
def auto_populate_2550q(
    entity: str = Query(..., description="Entity name"),
    quarter: int = Query(..., ge=1, le=4, description="Quarter (1-4)"),
    year: int = Query(..., description="Tax year"),
):
    """Auto-populate BIR 2550Q from AR invoices (output VAT) and AP bills (input VAT).
    
    The 2550Q is a quarterly VAT return that reports:
    - Output VAT from sales (AR invoices)
    - Input VAT from purchases (AP bills)
    - Net VAT payable or excess input VAT
    """
    from datetime import timedelta
    
    # Quarter date range
    month_start = (quarter - 1) * 3 + 1
    period_from = f"{year}-{month_start:02d}-01"
    if quarter == 4:
        period_to = f"{year}-12-31"
    else:
        period_to = (date(year, month_start + 3, 1) - timedelta(days=1)).isoformat()
    
    # Entity tax profile
    profiles = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profiles[0] if profiles else {}
    
    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]
    
    # Output VAT from confirmed AR invoices
    ar_q = supabase.table("ar_invoices").select(
        "invoice_id, invoice_number, invoice_date, customer_id, billing_subtotal, vat_output, gross_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
    ar_q = ar_q.eq("entity", entity)
    ar_q = ar_q.gte("invoice_date", period_from).lte("invoice_date", period_to)
    ar_invoices = ar_q.order("invoice_date").execute().data or []
    
    # Input VAT from confirmed AP bills
    ap_q = supabase.table("ap_bills").select(
        "bill_id, bill_number, bill_date, supplier_id, vat_exclusive_amount, vat_input, gross_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
    ap_q = ap_q.eq("entity", entity)
    ap_q = ap_q.gte("bill_date", period_from).lte("bill_date", period_to)
    ap_bills = ap_q.order("bill_date").execute().data or []
    
    # Calculate totals
    total_sales = sum(_num(inv.get("billing_subtotal")) for inv in ar_invoices)
    total_output_vat = sum(_num(inv.get("vat_output")) for inv in ar_invoices)
    total_purchases = sum(_num(bill.get("vat_exclusive_amount")) for bill in ap_bills)
    total_input_vat = sum(_num(bill.get("vat_input")) for bill in ap_bills)
    
    # Monthly breakdown
    monthly = {}
    for inv in ar_invoices:
        m = inv["invoice_date"][5:7]
        if m not in monthly:
            monthly[m] = {"month": m, "sales": 0, "output_vat": 0, "purchases": 0, "input_vat": 0}
        monthly[m]["sales"] += _num(inv.get("billing_subtotal"))
        monthly[m]["output_vat"] += _num(inv.get("vat_output"))
    for bill in ap_bills:
        m = bill["bill_date"][5:7]
        if m not in monthly:
            monthly[m] = {"month": m, "sales": 0, "output_vat": 0, "purchases": 0, "input_vat": 0}
        monthly[m]["purchases"] += _num(bill.get("vat_exclusive_amount"))
        monthly[m]["input_vat"] += _num(bill.get("vat_input"))
    
    monthly_list = sorted(monthly.values(), key=lambda x: x["month"])
    for m in monthly_list:
        m["sales"] = round(m["sales"], 2)
        m["output_vat"] = round(m["output_vat"], 2)
        m["purchases"] = round(m["purchases"], 2)
        m["input_vat"] = round(m["input_vat"], 2)
    
    net_vat = round(total_output_vat - total_input_vat, 2)
    
    return {
        "return_period": f"Q{quarter}/{year}",
        "quarter": quarter,
        "year": year,
        "amended_return": False,
        "tin": tin_segments(profile.get("tin", "")),
        "rdo_code": profile.get("rdo_code", ""),
        "taxpayer_name": _get_entity_registered_name(entity, profile),
        "registered_address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "industry_classification": profile.get("industry_classification", ""),
        # Part IV - Sales/Receipts
        "line_14a_vatable_sales": round(total_sales, 2),
        "line_14b_sales_to_govt": 0,
        "line_14c_zero_rated_sales": 0,
        "line_14d_exempt_sales": 0,
        "line_15_total_sales": round(total_sales, 2),
        # Part V - Output Tax
        "line_16a_output_tax_vatable": round(total_output_vat, 2),
        "line_16b_output_tax_govt": 0,
        "line_17_total_output_tax": round(total_output_vat, 2),
        "line_18_less_input_tax_carried": 0,
        # Part VI - Allowable Input Tax
        "line_19a_purchases_domestic": round(total_purchases, 2),
        "line_19b_purchases_importation": 0,
        "line_19c_purchases_services": 0,
        "line_19d_capital_goods_domestic": 0,
        "line_19e_capital_goods_import": 0,
        "line_20_total_input_tax": round(total_input_vat, 2),
        "line_21_deferred_input": 0,
        "line_22_allowable_input": round(total_input_vat, 2),
        # Part VII - Tax Due
        "line_23_net_vat_payable": round(net_vat, 2) if net_vat > 0 else 0,
        "line_23_excess_input_vat": round(abs(net_vat), 2) if net_vat < 0 else 0,
        "line_24_less_tax_credit": 0,
        "line_25_tax_still_due": round(net_vat, 2) if net_vat > 0 else 0,
        "line_26a_surcharge": 0,
        "line_26b_interest": 0,
        "line_26c_compromise": 0,
        "line_27_total_penalties": 0,
        "line_28_total_due": round(net_vat, 2) if net_vat > 0 else 0,
        # Supporting data
        "monthly_breakdown": monthly_list,
        "total_invoices": len(ar_invoices),
        "total_bills": len(ap_bills),
        "auto_populated": True,
    }



# ── BIR Form 2316 Auto-Populate ──────────────────────────────────────────────

@router.get("/bir-forms/2316/auto-populate")
def auto_populate_2316(
    entity: str = Query(..., description="Entity name"),
    employee_id: int = Query(..., description="Employee ID"),
    year: int = Query(..., description="Tax year"),
):
    """Auto-populate BIR 2316 (Certificate of Compensation Payment/Tax Withheld).

    Aggregates annualized payroll data for a specific employee for the given year.
    This is the employee's annual tax certificate (equivalent of W-2 in the US).
    """
    from calendar import monthrange

    period_from = f"{year}-01-01"
    period_to = f"{year}-12-31"

    # Entity tax profile (employer info)
    profiles = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profiles[0] if profiles else {}

    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    # Employee info
    emp_rows = supabase.table("employees").select(
        "employee_id, first_name, last_name, middle_name, email, date_of_birth, contact_number"
    ).eq("employee_id", employee_id).execute().data or []
    emp = emp_rows[0] if emp_rows else {}

    # Payroll employee info (TIN, address, etc.)
    pe_rows = supabase.table("payroll_employees").select("*").eq("employee_id", employee_id).execute().data or []
    pe = pe_rows[0] if pe_rows else {}

    # Get all payroll runs for this year (non-DRAFT)
    runs = supabase.table("payroll_runs").select("run_id, period_start, period_end, status").gte(
        "period_start", period_from
    ).lte("period_end", period_to).neq("status", "DRAFT").execute().data or []

    run_ids = [r["run_id"] for r in runs]

    # Get payroll items for this employee across all runs
    items = []
    if run_ids:
        items = supabase.table("payroll_items").select("*").eq(
            "employee_id", employee_id
        ).in_("run_id", run_ids).execute().data or []

    # Aggregate annual totals
    total_basic = sum(_num(i.get("basic_salary")) for i in items)
    total_allowance = sum(_num(i.get("allowance")) for i in items)
    total_overtime = sum(_num(i.get("overtime_pay")) for i in items)
    total_gross = sum(_num(i.get("gross_pay")) for i in items)
    total_sss = sum(_num(i.get("sss_employee")) for i in items)
    total_philhealth = sum(_num(i.get("philhealth_employee")) for i in items)
    total_pagibig = sum(_num(i.get("pagibig_employee")) for i in items)
    total_wht = sum(_num(i.get("withholding_tax")) for i in items)
    total_statutory = total_sss + total_philhealth + total_pagibig

    # 13th month (estimate: 1 month basic / 12 * periods worked)
    monthly_basic = _num(pe.get("basic_salary"))
    thirteenth_month = round(monthly_basic, 2)  # Simplified: 1 month's basic

    # Non-taxable portion of 13th month (max P90,000)
    non_taxable_13th = min(thirteenth_month, 90000)

    # Taxable compensation
    total_nontaxable = total_statutory + non_taxable_13th
    taxable_compensation = total_gross + thirteenth_month - total_nontaxable

    emp_name = f"{emp.get('last_name', '')}, {emp.get('first_name', '')} {emp.get('middle_name', '') or ''}".strip()

    return {
        "tax_year": year,
        "period_from": period_from,
        "period_to": period_to,
        # Part I - Employee Information
        "employee_tin": tin_segments(pe.get("tin_number", "")),
        "employee_name": emp_name,
        "employee_first_name": emp.get("first_name", ""),
        "employee_last_name": emp.get("last_name", ""),
        "employee_middle_name": emp.get("middle_name", ""),
        "rdo_code": profile.get("rdo_code", ""),
        "employee_address": pe.get("address", "") or profile.get("registered_address", ""),
        "employee_zip_code": "",
        "date_of_birth": emp.get("date_of_birth", ""),
        "contact_number": emp.get("contact_number", ""),
        # Part II - Employer Information (Present)
        "employer_tin": tin_segments(profile.get("tin", "")),
        "employer_name": _get_entity_registered_name(entity, profile),
        "employer_address": profile.get("registered_address", ""),
        "employer_zip_code": profile.get("zip_code", ""),
        "employer_type": "Main",
        # Part IVA - Summary
        "line_19_gross_compensation": round(total_gross + thirteenth_month, 2),
        "line_20_nontaxable_compensation": round(total_nontaxable, 2),
        "line_21_taxable_present": round(taxable_compensation, 2),
        "line_22_taxable_previous": 0,
        "line_23_gross_taxable": round(taxable_compensation, 2),
        "line_24_tax_due": round(total_wht, 2),
        "line_25a_tax_withheld_present": round(total_wht, 2),
        "line_25b_tax_withheld_previous": 0,
        "line_26_total_withheld_adjusted": round(total_wht, 2),
        "line_27_pera_credit": 0,
        "line_28_total_taxes_withheld": round(total_wht, 2),
        # Part IVB - Details
        "line_29_basic_salary": round(total_basic, 2),
        "line_30_holiday_pay": 0,
        "line_31_overtime_pay": round(total_overtime, 2),
        "line_32_night_shift": 0,
        "line_33_hazard_pay": 0,
        "line_34_13th_month": round(non_taxable_13th, 2),
        "line_35_deminimis": 0,
        "line_36_sss_philhealth_pagibig": round(total_statutory, 2),
        "line_37_other_nontaxable": 0,
        "line_38_total_nontaxable": round(total_nontaxable, 2),
        # B. Taxable
        "line_39_basic_salary_taxable": round(total_basic, 2),
        "line_40_representation": 0,
        "line_41_transportation": 0,
        "line_42_cola": 0,
        "line_43_housing": 0,
        "line_44_others": round(total_allowance, 2),
        "line_45_overtime_taxable": round(total_overtime, 2),
        "line_46_commission": 0,
        "line_47_profit_sharing": 0,
        "line_48_fees": 0,
        "line_49_taxable_13th": round(max(thirteenth_month - 90000, 0), 2),
        "line_50_hazard_pay_taxable": 0,
        "line_51_other_taxable": 0,
        "line_52_total_taxable": round(taxable_compensation, 2),
        # Supporting
        "payroll_periods": len(items),
        "auto_populated": True,
    }


# ── BIR Form 1600-VT Auto-Populate ──────────────────────────────────────────

@router.get("/bir-forms/1600VT/auto-populate")
def auto_populate_1600vt(
    entity: str = Query(..., description="Entity name"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    year: int = Query(..., description="Tax year"),
):
    """Auto-populate BIR 1600-VT (Monthly Remittance Return of Value-Added Tax Withheld).

    This form is used by VAT withholding agents who withhold 5% VAT
    from payments to VAT-registered suppliers. The withheld VAT is
    remitted to BIR via this form.

    Data source: AP bills where the entity acts as a withholding agent
    for VAT. We look for bills with vat_input > 0 to estimate
    the VAT component withheld.
    """
    from calendar import monthrange

    last_day = monthrange(year, month)[1]
    period_from = f"{year}-{month:02d}-01"
    period_to = f"{year}-{month:02d}-{last_day:02d}"

    # Entity tax profile
    profiles = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profiles[0] if profiles else {}

    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    # Get confirmed AP bills for this entity + month with VAT
    q = supabase.table("ap_bills").select(
        "bill_id, bill_number, bill_date, supplier_id, vat_exclusive_amount, vat_input, gross_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
    q = q.eq("entity", entity)
    q = q.gte("bill_date", period_from).lte("bill_date", period_to)
    q = q.gt("vat_input", 0)
    bills = q.order("bill_date").execute().data or []

    # Get supplier info
    supplier_ids = list(set(b["supplier_id"] for b in bills if b.get("supplier_id")))
    supplier_map = {}
    if supplier_ids:
        sup_rows = supabase.table("supplier_list").select(
            "supplier_id, company_name, tin_number, address"
        ).in_("supplier_id", supplier_ids).execute().data or []
        supplier_map = {s["supplier_id"]: s for s in sup_rows}

    # Calculate 5% VAT withheld (VAT withholding is 5% of gross payment to VAT suppliers)
    # In practice: vat_withheld = vat_exclusive_amount * 0.05 (5% final withholding VAT)
    payee_breakdown = {}
    for bill in bills:
        sid = bill.get("supplier_id")
        vat_withheld = round(_num(bill.get("vat_exclusive_amount")) * 0.05, 2)
        if sid not in payee_breakdown:
            sup = supplier_map.get(sid, {})
            payee_breakdown[sid] = {
                "supplier_id": sid,
                "payee_name": sup.get("company_name", ""),
                "tin": sup.get("tin_number", ""),
                "gross_payments": 0,
                "vat_withheld": 0,
                "bill_count": 0,
            }
        payee_breakdown[sid]["gross_payments"] += _num(bill.get("vat_exclusive_amount"))
        payee_breakdown[sid]["vat_withheld"] += vat_withheld
        payee_breakdown[sid]["bill_count"] += 1

    payee_list = sorted(payee_breakdown.values(), key=lambda x: x["vat_withheld"], reverse=True)
    for p in payee_list:
        p["gross_payments"] = round(p["gross_payments"], 2)
        p["vat_withheld"] = round(p["vat_withheld"], 2)

    total_vat_withheld = round(sum(p["vat_withheld"] for p in payee_list), 2)

    return {
        "return_period": f"{month:02d}/{year}",
        "amended_return": False,
        "tin": tin_segments(profile.get("tin", "")),
        "rdo_code": profile.get("rdo_code", ""),
        "taxpayer_name": _get_entity_registered_name(entity, profile),
        "registered_address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "category_of_agent": profile.get("category", "Private"),
        # Computation
        "line_12_vat_withheld": total_vat_withheld,
        "line_13_prev_remitted": 0,
        "line_14_tax_still_due": total_vat_withheld,
        "line_15a_surcharge": 0,
        "line_15b_interest": 0,
        "line_15c_compromise": 0,
        "line_16_total_due": total_vat_withheld,
        # Payee breakdown (Schedule 1)
        "payee_breakdown": payee_list,
        "total_gross_payments": round(sum(p["gross_payments"] for p in payee_list), 2),
        "total_vat_withheld": total_vat_withheld,
        "number_of_payees": len(payee_list),
        "auto_populated": True,
    }



# ── BIR Form 1702Q Auto-Populate ─────────────────────────────────────────────

@router.get("/bir-forms/1702Q/auto-populate")
def auto_populate_1702q(
    entity: str = Query(..., description="Entity name"),
    quarter: int = Query(..., ge=1, le=3, description="Quarter (1-3, no 4th as that uses annual 1702)"),
    year: int = Query(..., description="Tax year"),
):
    """Auto-populate BIR 1702Q (Quarterly Income Tax Return for Corporations).

    Computes taxable income from GL data (revenue - costs - expenses) or
    from AR/AP aggregates as a proxy for P&L data.
    """
    from datetime import timedelta

    # Quarter date range
    month_start = (quarter - 1) * 3 + 1
    period_from = f"{year}-{month_start:02d}-01"
    if quarter == 4:
        period_to = f"{year}-12-31"
    else:
        period_to = (date(year, month_start + 3, 1) - timedelta(days=1)).isoformat()

    # Entity tax profile
    profiles = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profiles[0] if profiles else {}

    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    # Revenue: from AR invoices (sales/receipts)
    ar_q = supabase.table("ar_invoices").select(
        "billing_subtotal"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
    ar_q = ar_q.eq("entity", entity)
    ar_q = ar_q.gte("invoice_date", period_from).lte("invoice_date", period_to)
    ar_invoices = ar_q.execute().data or []
    sales_this_quarter = sum(_num(inv.get("billing_subtotal")) for inv in ar_invoices)

    # Cost of Sales: from AP bills (purchases/expenses)
    ap_q = supabase.table("ap_bills").select(
        "vat_exclusive_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
    ap_q = ap_q.eq("entity", entity)
    ap_q = ap_q.gte("bill_date", period_from).lte("bill_date", period_to)
    ap_bills = ap_q.execute().data or []
    costs_this_quarter = sum(_num(bill.get("vat_exclusive_amount")) for bill in ap_bills)

    # Gross income
    gross_income = sales_this_quarter - costs_this_quarter

    # Non-operating income (could be enhanced with GL journal entries)
    non_operating_income = 0

    # Deductions (operating expenses - could pull from GL)
    deductions = 0

    # Taxable income this quarter
    total_gross = gross_income + non_operating_income
    taxable_this_quarter = total_gross - deductions

    # Previous quarters (cumulative)
    prev_taxable = 0
    if quarter > 1:
        prev_from = f"{year}-01-01"
        prev_to = (date(year, month_start, 1) - timedelta(days=1)).isoformat()

        prev_ar = supabase.table("ar_invoices").select(
            "billing_subtotal"
        ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").eq(
            "entity", entity
        ).gte("invoice_date", prev_from).lte("invoice_date", prev_to).execute().data or []
        prev_sales = sum(_num(inv.get("billing_subtotal")) for inv in prev_ar)

        prev_ap = supabase.table("ap_bills").select(
            "vat_exclusive_amount"
        ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").eq(
            "entity", entity
        ).gte("bill_date", prev_from).lte("bill_date", prev_to).execute().data or []
        prev_costs = sum(_num(bill.get("vat_exclusive_amount")) for bill in prev_ap)

        prev_taxable = prev_sales - prev_costs

    total_taxable_to_date = taxable_this_quarter + prev_taxable

    # Tax rate (RCIT = 25% for domestic corps effective 2020, was 30%)
    tax_rate = 25.0
    income_tax_due = round(max(total_taxable_to_date, 0) * (tax_rate / 100), 2)

    # MCIT (2% of gross income)
    mcit_rate = 2.0
    total_gross_to_date = total_gross + (prev_sales if quarter > 1 else 0)
    mcit = round(max(total_gross_to_date, 0) * (mcit_rate / 100), 2)

    # Higher of normal tax or MCIT
    tax_due = max(income_tax_due, mcit)

    # Tax credits (creditable withholding tax from 2307s received)
    # Get WHT from AR invoices for the year to date
    wht_q = supabase.table("ar_invoices").select("wht_amount").eq(
        "lifecycle_status", "CONFIRMED"
    ).eq("record_status", "ACTIVE").eq("entity", entity).gte(
        "invoice_date", f"{year}-01-01"
    ).lte("invoice_date", period_to).gt("wht_amount", 0).execute().data or []
    total_cwt = sum(_num(w.get("wht_amount")) for w in wht_q)

    tax_still_due = max(tax_due - total_cwt, 0)

    return {
        "return_period": f"Q{quarter}/{year}",
        "quarter": quarter,
        "year": year,
        "calendar_fiscal": "Calendar",
        "amended_return": False,
        "tin": tin_segments(profile.get("tin", "")),
        "rdo_code": profile.get("rdo_code", ""),
        "registered_name": _get_entity_registered_name(entity, profile),
        "registered_address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "email": profile.get("email", ""),
        "atc": "IC 010",
        # Schedule 2 - Regular Rate
        "sched2_line1_sales": round(sales_this_quarter, 2),
        "sched2_line2_cost_of_sales": round(costs_this_quarter, 2),
        "sched2_line3_gross_income": round(gross_income, 2),
        "sched2_line4_non_operating": round(non_operating_income, 2),
        "sched2_line5_total_gross": round(total_gross, 2),
        "sched2_line6_deductions": round(deductions, 2),
        "sched2_line7_taxable_this_qtr": round(taxable_this_quarter, 2),
        "sched2_line8_taxable_prev_qtrs": round(prev_taxable, 2),
        "sched2_line9_total_taxable": round(total_taxable_to_date, 2),
        "sched2_line10_tax_rate": tax_rate,
        "sched2_line11_income_tax_due": round(income_tax_due, 2),
        "sched2_line12_mcit": round(mcit, 2),
        "sched2_line13_tax_due": round(tax_due, 2),
        # Schedule 4 - Tax Credits
        "sched4_line1_prior_year_excess": 0,
        "sched4_line2_prev_qtr_payments": 0,
        "sched4_line3_mcit_prev_qtrs": 0,
        "sched4_line4_cwt_prev_qtrs": 0,
        "sched4_line5_cwt_2307_this_qtr": round(total_cwt, 2),
        "sched4_line6_tax_prev_filed": 0,
        "sched4_line7_total_credits": round(total_cwt, 2),
        # Part II Summary
        "part2_line14_tax_due": round(tax_due, 2),
        "part2_line19_total_credits": round(total_cwt, 2),
        "part2_line20_tax_payable": round(tax_still_due, 2),
        "part2_line21a_surcharge": 0,
        "part2_line21b_interest": 0,
        "part2_line21c_compromise": 0,
        "part2_line22_total_penalties": 0,
        "part2_line25_total_due": round(tax_still_due, 2),
        # Supporting
        "auto_populated": True,
    }



# ── BIR Form 1702 (Annual) Auto-Populate ─────────────────────────────────────

@router.get("/bir-forms/1702/auto-populate")
def auto_populate_1702(
    entity: str = Query(..., description="Entity name"),
    year: int = Query(..., description="Tax year"),
):
    """Auto-populate BIR 1702-RT (Annual Income Tax Return for Corporations).

    Aggregates full-year income data from AR/AP as a proxy for P&L.
    """
    period_from = f"{year}-01-01"
    period_to = f"{year}-12-31"

    # Entity tax profile
    profiles = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profiles[0] if profiles else {}

    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    # Revenue: AR invoices for the full year
    ar_q = supabase.table("ar_invoices").select(
        "billing_subtotal, wht_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
    ar_q = ar_q.eq("entity", entity)
    ar_q = ar_q.gte("invoice_date", period_from).lte("invoice_date", period_to)
    ar_invoices = ar_q.execute().data or []
    total_sales = sum(_num(inv.get("billing_subtotal")) for inv in ar_invoices)

    # Cost of Sales: AP bills for the full year
    ap_q = supabase.table("ap_bills").select(
        "vat_exclusive_amount"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
    ap_q = ap_q.eq("entity", entity)
    ap_q = ap_q.gte("bill_date", period_from).lte("bill_date", period_to)
    ap_bills = ap_q.execute().data or []
    total_costs = sum(_num(bill.get("vat_exclusive_amount")) for bill in ap_bills)

    # Gross income
    gross_income = total_sales - total_costs

    # OSD (Optional Standard Deduction) = 40% of gross income
    osd = round(gross_income * 0.40, 2) if gross_income > 0 else 0

    # Net taxable income
    net_taxable = gross_income - osd

    # Tax rate (RCIT 25% for domestic corps)
    tax_rate = 25.0
    income_tax_due = round(max(net_taxable, 0) * (tax_rate / 100), 2)

    # MCIT (2% of gross income) - applies from 4th year of operations
    mcit = round(max(gross_income, 0) * 0.02, 2)

    # Tax due = higher of normal or MCIT
    tax_due = max(income_tax_due, mcit)

    # Total CWT from 2307s for the year
    wht_q = supabase.table("ar_invoices").select("wht_amount").eq(
        "lifecycle_status", "CONFIRMED"
    ).eq("record_status", "ACTIVE").eq("entity", entity).gte(
        "invoice_date", period_from
    ).lte("invoice_date", period_to).gt("wht_amount", 0).execute().data or []
    total_cwt = sum(_num(w.get("wht_amount")) for w in wht_q)

    # Quarterly tax payments (from existing 1702Q forms filed this year)
    qtr_forms = supabase.table("bir_forms").select("form_data").eq(
        "form_type", "1702Q"
    ).eq("entity", entity).gte("period_from", period_from).lte(
        "period_to", period_to
    ).in_("status", ["FINALIZED", "PENDING_APPROVAL"]).execute().data or []
    prev_qtr_payments = sum(_num((f.get("form_data") or {}).get("part2_line25_total_due")) for f in qtr_forms)

    net_tax_payable = max(tax_due - total_cwt - prev_qtr_payments, 0)

    return {
        "tax_year": year,
        "calendar_fiscal": "Calendar",
        "amended_return": False,
        "short_period": False,
        "atc": "IC 010",
        "tin": tin_segments(profile.get("tin", "")),
        "rdo_code": profile.get("rdo_code", ""),
        "registered_name": _get_entity_registered_name(entity, profile),
        "registered_address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "email": profile.get("email", ""),
        "date_of_incorporation": profile.get("date_of_incorporation", ""),
        "method_of_deduction": "OSD",
        # Part IV - Computation of Tax
        "line_27_sales": round(total_sales, 2),
        "line_28_sales_returns": 0,
        "line_29_net_sales": round(total_sales, 2),
        "line_30_cost_of_sales": round(total_costs, 2),
        "line_31_gross_income": round(gross_income, 2),
        "line_32_other_income": 0,
        "line_33_total_taxable_income": round(gross_income, 2),
        "line_34_ordinary_deductions": 0,
        "line_35_special_deductions": 0,
        "line_36_nolco": 0,
        "line_37_total_deductions": 0,
        "line_38_osd": round(osd, 2),
        "line_39_net_taxable_income": round(net_taxable, 2),
        "line_40_tax_rate": tax_rate,
        "line_41_income_tax_due": round(income_tax_due, 2),
        "line_42_mcit_due": round(mcit, 2),
        "line_43_tax_due": round(tax_due, 2),
        # Tax Credits
        "line_44_prior_year_excess": 0,
        "line_45_mcit_prev_qtrs": 0,
        "line_46_regular_prev_qtrs": round(prev_qtr_payments, 2),
        "line_47_excess_mcit_applied": 0,
        "line_48_cwt_prev_qtrs": 0,
        "line_49_cwt_2307_4th_qtr": round(total_cwt, 2),
        "line_50_foreign_tax_credits": 0,
        "line_51_tax_prev_filed": 0,
        "line_52_special_tax_credits": 0,
        "line_55_total_credits": round(total_cwt + prev_qtr_payments, 2),
        "line_56_net_tax_payable": round(net_tax_payable, 2),
        # Part II Summary
        "part2_line14_tax_due": round(tax_due, 2),
        "part2_line15_total_credits": round(total_cwt + prev_qtr_payments, 2),
        "part2_line16_net_payable": round(net_tax_payable, 2),
        "part2_line17_surcharge": 0,
        "part2_line18_interest": 0,
        "part2_line19_compromise": 0,
        "part2_line20_total_penalties": 0,
        "part2_line21_total_payable": round(net_tax_payable, 2),
        "overpayment_option": "",
        # Supporting
        "auto_populated": True,
    }




# ── Period Close ──────────────────────────────────────────────────────────────

def _find_or_create_draft_form(form_type: str, entity: str, period_from: str, period_to: str, profile: dict):
    """Find an existing DRAFT form or create a new one. Returns (form_record_id, is_new)."""
    existing = supabase.table("bir_forms").select("form_record_id").eq(
        "form_type", form_type
    ).eq("entity", entity).eq(
        "period_from", period_from
    ).eq("period_to", period_to).eq("status", "DRAFT").execute().data or []

    if existing:
        return existing[0]["form_record_id"], False

    new_form = {
        "form_type": form_type,
        "entity": entity,
        "period_from": period_from,
        "period_to": period_to,
        "status": "DRAFT",
        "payor_tin": profile.get("tin", ""),
        "payor_name": _get_entity_registered_name(entity, profile),
        "payor_address": profile.get("registered_address", ""),
        "payor_zip_code": profile.get("zip_code", ""),
        "form_code": generate_bir_form_code(entity, form_type),
        "form_data": {},
    }
    res = supabase.table("bir_forms").insert(new_form).execute()
    if not res.data:
        return None, False
    return res.data[0]["form_record_id"], True



@router.post("/bir-forms/close-period")
def close_period(request: Request, month: int = Query(...), year: int = Query(...), entity: str = Query(...)):
    """Generate all applicable BIR form drafts for a given month/quarter.

    Monthly forms (generated every month): 0619-E, 1601-C, 1600-VT
    Quarterly forms (generated on quarter-end months 3,6,9,12): 1601-EQ, 2550Q, 1702Q
    Annual forms (generated on month 12): 1702, 2316 (per employee)
    """
    from calendar import monthrange
    from datetime import timedelta

    _, performed_by = _extract_jwt_claims(request)

    # Get entity tax profile
    profile_rows = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    if not profile_rows:
        raise HTTPException(status_code=404, detail="Entity tax profile not found")
    profile = profile_rows[0]

    last_day = monthrange(year, month)[1]
    period_from = f"{year}-{month:02d}-01"
    period_to = f"{year}-{month:02d}-{last_day:02d}"

    summary = {"generated": [], "updated": [], "errors": []}

    # ── Monthly: 0619-E ───────────────────────────────────────────────────────
    try:
        form_id, is_new = _find_or_create_draft_form("0619E", entity, period_from, period_to, profile)
        if form_id:
            # Compute form_data using same logic as auto_populate_0619e
            ap_query = supabase.table("ap_bills").select(
                "bill_id, bill_number, bill_date, supplier_id, ewt_material"
            ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("ewt_material", 0).eq("entity", entity)
            ap_query = ap_query.gte("bill_date", period_from).lte("bill_date", period_to)
            ap_bills = ap_query.order("bill_date").execute().data or []

            total_taxes_withheld = round(sum(_num(b.get("ewt_material")) for b in ap_bills), 2)

            suppliers = _supplier_map()
            ewt_by_supplier = {}
            for b in ap_bills:
                sid = b.get("supplier_id")
                if sid not in ewt_by_supplier:
                    sup = suppliers.get(sid, {})
                    ewt_by_supplier[sid] = {"supplier_id": sid, "supplier_name": sup.get("company_name", "—"), "tin": sup.get("tin_number", "—"), "total_ewt": 0.0, "bill_count": 0}
                ewt_by_supplier[sid]["total_ewt"] += _num(b.get("ewt_material"))
                ewt_by_supplier[sid]["bill_count"] += 1
            for v in ewt_by_supplier.values():
                v["total_ewt"] = round(v["total_ewt"], 2)

            tin_str = profile.get("tin", "")
            tin_parts = tin_str.split("-") if tin_str else []
            tin_segs = [tin_parts[i] if i < len(tin_parts) else "" for i in range(4)]

            form_data_0619e = {
                "return_period": f"{month:02d}/{year}",
                "amended_return": False,
                "tin_segments": tin_segs,
                "rdo_code": profile.get("rdo_code", ""),
                "taxpayer_name": _get_entity_registered_name(entity, profile),
                "address": profile.get("registered_address", ""),
                "zip_code": profile.get("zip_code", ""),
                "contact_number": profile.get("contact_number", ""),
                "line_12_total_withheld": total_taxes_withheld,
                "line_13_prev_remitted": 0,
                "line_14_tax_still_due": total_taxes_withheld,
                "line_15a_surcharge": 0, "line_15b_interest": 0, "line_15c_compromise": 0,
                "line_16_total_due": total_taxes_withheld,
                "supplier_breakdown": sorted(ewt_by_supplier.values(), key=lambda x: x["total_ewt"], reverse=True),
                "auto_populated": True,
            }
            supabase.table("bir_forms").update({"form_data": form_data_0619e}).eq("form_record_id", form_id).execute()

            action = "AUTO_GENERATED" if is_new else "AUTO_UPDATED"
            supabase.table("bir_form_history").insert({
                "form_record_id": form_id, "action": action,
                "details": f"{action} via close_period for {month:02d}/{year}",
                "performed_by": performed_by,
            }).execute()
            (summary["generated"] if is_new else summary["updated"]).append({"form_type": "0619E", "form_record_id": form_id})
    except Exception as e:
        summary["errors"].append({"form_type": "0619E", "error": str(e)})

    # ── Monthly: 1601-C ───────────────────────────────────────────────────────
    try:
        form_id, is_new = _find_or_create_draft_form("1601C", entity, period_from, period_to, profile)
        if form_id:
            # Compute form_data using same logic as auto_populate_1601c
            runs = supabase.table("payroll_runs").select("run_id, period_start, period_end, status").gte(
                "period_start", period_from
            ).lte("period_end", period_to).neq("status", "DRAFT").execute().data or []
            run_ids = [r["run_id"] for r in runs]

            items = []
            if run_ids:
                items = supabase.table("payroll_items").select(
                    "employee_id, employee_name, gross_pay, withholding_tax, sss_employee, philhealth_employee, pagibig_employee"
                ).in_("run_id", run_ids).execute().data or []

            emp_totals = {}
            for item in items:
                eid = item["employee_id"]
                if eid not in emp_totals:
                    emp_totals[eid] = {"employee_id": eid, "employee_name": item.get("employee_name", ""), "gross_compensation": 0, "withholding_tax": 0, "sss": 0, "philhealth": 0, "pagibig": 0}
                emp_totals[eid]["gross_compensation"] += _num(item.get("gross_pay"))
                emp_totals[eid]["withholding_tax"] += _num(item.get("withholding_tax"))
                emp_totals[eid]["sss"] += _num(item.get("sss_employee"))
                emp_totals[eid]["philhealth"] += _num(item.get("philhealth_employee"))
                emp_totals[eid]["pagibig"] += _num(item.get("pagibig_employee"))

            total_comp = sum(e["gross_compensation"] for e in emp_totals.values())
            total_stat = sum(e["sss"] + e["philhealth"] + e["pagibig"] for e in emp_totals.values())
            total_taxable = total_comp - total_stat
            total_wht = sum(e["withholding_tax"] for e in emp_totals.values())

            def _tin_seg(tin_str):
                parts = (tin_str or "").split("-")
                return [parts[i] if i < len(parts) else "" for i in range(4)]

            form_data_1601c = {
                "return_period": f"{month:02d}/{year}",
                "amended_return": False,
                "tin": _tin_seg(profile.get("tin", "")),
                "rdo_code": profile.get("rdo_code", ""),
                "taxpayer_name": _get_entity_registered_name(entity, profile),
                "registered_address": profile.get("registered_address", ""),
                "zip_code": profile.get("zip_code", ""),
                "contact_number": profile.get("contact_number", ""),
                "category_of_agent": "Private",
                "number_of_employees": len(emp_totals),
                "schedule1_total_compensation": round(total_comp, 2),
                "schedule1_statutory_min_wage": 0, "schedule1_holiday_ot_night": 0,
                "schedule1_13th_month_benefits": 0, "schedule1_deminimis": 0,
                "schedule1_sss_gsis_philhealth_pagibig": round(total_stat, 2),
                "schedule1_other_nontaxable": 0,
                "schedule1_taxable_compensation": round(total_taxable, 2),
                "line_17_taxes_withheld": round(total_wht, 2),
                "line_18_adjustment_prev_month": 0,
                "line_19_total_withheld": round(total_wht, 2),
                "line_20_prev_remittance": 0,
                "line_21_tax_still_due": round(total_wht, 2),
                "line_22a_surcharge": 0, "line_22b_interest": 0, "line_22c_compromise": 0,
                "line_23_total_penalties": 0,
                "line_24_total_due": round(total_wht, 2),
                "employee_breakdown": sorted(emp_totals.values(), key=lambda x: x["withholding_tax"], reverse=True),
                "payroll_runs_included": [{"run_id": r["run_id"], "period": f"{r['period_start']} to {r['period_end']}", "status": r["status"]} for r in runs],
                "auto_populated": True,
            }
            supabase.table("bir_forms").update({"form_data": form_data_1601c}).eq("form_record_id", form_id).execute()

            action = "AUTO_GENERATED" if is_new else "AUTO_UPDATED"
            supabase.table("bir_form_history").insert({
                "form_record_id": form_id, "action": action,
                "details": f"{action} via close_period for {month:02d}/{year}",
                "performed_by": performed_by,
            }).execute()
            (summary["generated"] if is_new else summary["updated"]).append({"form_type": "1601C", "form_record_id": form_id})
    except Exception as e:
        summary["errors"].append({"form_type": "1601C", "error": str(e)})

    # ── Monthly: 1600-VT ──────────────────────────────────────────────────────
    try:
        form_id, is_new = _find_or_create_draft_form("1600VT", entity, period_from, period_to, profile)
        if form_id:
            # Compute form_data using same logic as auto_populate_1600vt
            q = supabase.table("ap_bills").select(
                "bill_id, bill_number, bill_date, supplier_id, vat_exclusive_amount, vat_input, gross_amount"
            ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
            q = q.eq("entity", entity).gte("bill_date", period_from).lte("bill_date", period_to).gt("vat_input", 0)
            vat_bills = q.order("bill_date").execute().data or []

            supplier_ids = list(set(b["supplier_id"] for b in vat_bills if b.get("supplier_id")))
            supplier_map = {}
            if supplier_ids:
                sup_rows = supabase.table("supplier_list").select("supplier_id, company_name, tin_number, address").in_("supplier_id", supplier_ids).execute().data or []
                supplier_map = {s["supplier_id"]: s for s in sup_rows}

            payee_breakdown = {}
            for b in vat_bills:
                sid = b.get("supplier_id")
                vat_withheld = round(_num(b.get("vat_exclusive_amount")) * 0.05, 2)
                if sid not in payee_breakdown:
                    sup = supplier_map.get(sid, {})
                    payee_breakdown[sid] = {"supplier_id": sid, "payee_name": sup.get("company_name", ""), "tin": sup.get("tin_number", ""), "gross_payments": 0, "vat_withheld": 0, "bill_count": 0}
                payee_breakdown[sid]["gross_payments"] += _num(b.get("vat_exclusive_amount"))
                payee_breakdown[sid]["vat_withheld"] += vat_withheld
                payee_breakdown[sid]["bill_count"] += 1

            payee_list = sorted(payee_breakdown.values(), key=lambda x: x["vat_withheld"], reverse=True)
            for p in payee_list:
                p["gross_payments"] = round(p["gross_payments"], 2)
                p["vat_withheld"] = round(p["vat_withheld"], 2)
            total_vat_withheld = round(sum(p["vat_withheld"] for p in payee_list), 2)

            def _tin_seg2(tin_str):
                parts = (tin_str or "").split("-")
                return [parts[i] if i < len(parts) else "" for i in range(4)]

            form_data_1600vt = {
                "return_period": f"{month:02d}/{year}",
                "amended_return": False,
                "tin": _tin_seg2(profile.get("tin", "")),
                "rdo_code": profile.get("rdo_code", ""),
                "taxpayer_name": _get_entity_registered_name(entity, profile),
                "registered_address": profile.get("registered_address", ""),
                "zip_code": profile.get("zip_code", ""),
                "contact_number": profile.get("contact_number", ""),
                "category_of_agent": profile.get("category", "Private"),
                "line_12_vat_withheld": total_vat_withheld,
                "line_13_prev_remitted": 0,
                "line_14_tax_still_due": total_vat_withheld,
                "line_15a_surcharge": 0, "line_15b_interest": 0, "line_15c_compromise": 0,
                "line_16_total_due": total_vat_withheld,
                "payee_breakdown": payee_list,
                "total_gross_payments": round(sum(p["gross_payments"] for p in payee_list), 2),
                "total_vat_withheld": total_vat_withheld,
                "number_of_payees": len(payee_list),
                "auto_populated": True,
            }
            supabase.table("bir_forms").update({"form_data": form_data_1600vt}).eq("form_record_id", form_id).execute()

            action = "AUTO_GENERATED" if is_new else "AUTO_UPDATED"
            supabase.table("bir_form_history").insert({
                "form_record_id": form_id, "action": action,
                "details": f"{action} via close_period for {month:02d}/{year}",
                "performed_by": performed_by,
            }).execute()
            (summary["generated"] if is_new else summary["updated"]).append({"form_type": "1600VT", "form_record_id": form_id})
    except Exception as e:
        summary["errors"].append({"form_type": "1600VT", "error": str(e)})



    # ── Quarterly forms (months 3, 6, 9, 12) ─────────────────────────────────
    is_quarter_end = month in (3, 6, 9, 12)
    if is_quarter_end:
        quarter = month // 3
        q_month_start = (quarter - 1) * 3 + 1
        q_period_from = f"{year}-{q_month_start:02d}-01"
        if quarter == 4:
            q_period_to = f"{year}-12-31"
        else:
            q_period_to = (date(year, q_month_start + 3, 1) - timedelta(days=1)).isoformat()

        # ── 1601-EQ ──────────────────────────────────────────────────────────
        try:
            form_id, is_new = _find_or_create_draft_form("1601EQ", entity, q_period_from, q_period_to, profile)
            if form_id:
                # Use same logic as auto_populate_1601eq
                q_bills = supabase.table("ap_bills").select(
                    "bill_id, bill_number, bill_date, supplier_id, vat_exclusive_amount, ewt_material, gross_amount"
                ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("ewt_material", 0)
                q_bills = q_bills.eq("entity", entity).gte("bill_date", q_period_from).lte("bill_date", q_period_to)
                q_bills_data = q_bills.order("bill_date").execute().data or []

                sup_ids = list(set(b["supplier_id"] for b in q_bills_data if b.get("supplier_id")))
                sup_map = {}
                if sup_ids:
                    sup_rows = supabase.table("supplier_list").select("supplier_id, company_name, tin_number, address").in_("supplier_id", sup_ids).execute().data or []
                    sup_map = {s["supplier_id"]: s for s in sup_rows}

                monthly_totals = {1: 0, 2: 0, 3: 0}
                for bill in q_bills_data:
                    bill_month = int(bill["bill_date"][5:7])
                    month_idx = bill_month - q_month_start + 1
                    if 1 <= month_idx <= 3:
                        monthly_totals[month_idx] += _num(bill.get("ewt_material"))

                total_ewt = sum(monthly_totals.values())

                alphalist = {}
                for bill in q_bills_data:
                    sid = bill.get("supplier_id")
                    if not sid:
                        continue
                    if sid not in alphalist:
                        sup = sup_map.get(sid, {})
                        alphalist[sid] = {"supplier_id": sid, "payee_name": sup.get("company_name", ""), "tin": sup.get("tin_number", ""), "address": sup.get("address", ""), "income_payment": 0, "tax_withheld": 0, "atc_code": "WC010"}
                    alphalist[sid]["income_payment"] += _num(bill.get("vat_exclusive_amount"))
                    alphalist[sid]["tax_withheld"] += _num(bill.get("ewt_material"))

                alphalist_list = []
                for entry in alphalist.values():
                    entry["income_payment"] = round(entry["income_payment"], 2)
                    entry["tax_withheld"] = round(entry["tax_withheld"], 2)
                    alphalist_list.append(entry)
                alphalist_list.sort(key=lambda x: x["tax_withheld"], reverse=True)

                def _tin_seg3(tin_str):
                    parts = (tin_str or "").split("-")
                    return [parts[i] if i < len(parts) else "" for i in range(4)]

                form_data_1601eq = {
                    "return_period": f"Q{quarter}/{year}",
                    "quarter": quarter, "year": year,
                    "amended_return": False,
                    "tin": _tin_seg3(profile.get("tin", "")),
                    "rdo_code": profile.get("rdo_code", ""),
                    "taxpayer_name": _get_entity_registered_name(entity, profile),
                    "registered_address": profile.get("registered_address", ""),
                    "zip_code": profile.get("zip_code", ""),
                    "contact_number": profile.get("contact_number", ""),
                    "category_of_agent": "Private",
                    "month1_remittance": round(monthly_totals[1], 2),
                    "month2_remittance": round(monthly_totals[2], 2),
                    "month3_remittance": 0,
                    "month3_tax_withheld": round(monthly_totals[3], 2),
                    "line_15_total_remitted_prev": round(monthly_totals[1] + monthly_totals[2], 2),
                    "line_16_tax_withheld_3rd_month": round(monthly_totals[3], 2),
                    "line_17_total_tax_due": round(total_ewt, 2),
                    "line_18_overremittance_prev_qtr": 0,
                    "line_19_tax_still_due": round(total_ewt, 2),
                    "line_20_less_prev_remitted": round(monthly_totals[1] + monthly_totals[2], 2),
                    "line_21_balance_still_due": round(monthly_totals[3], 2),
                    "line_22a_surcharge": 0, "line_22b_interest": 0, "line_22c_compromise": 0,
                    "line_23_total_penalties": 0,
                    "line_24_total_due": round(monthly_totals[3], 2),
                    "alphalist": alphalist_list,
                    "total_income_payments": round(sum(a["income_payment"] for a in alphalist_list), 2),
                    "total_taxes_withheld": round(total_ewt, 2),
                    "number_of_payees": len(alphalist_list),
                    "auto_populated": True,
                }
                supabase.table("bir_forms").update({"form_data": form_data_1601eq}).eq("form_record_id", form_id).execute()

                action = "AUTO_GENERATED" if is_new else "AUTO_UPDATED"
                supabase.table("bir_form_history").insert({
                    "form_record_id": form_id, "action": action,
                    "details": f"{action} via close_period for Q{quarter}/{year}",
                    "performed_by": performed_by,
                }).execute()
                (summary["generated"] if is_new else summary["updated"]).append({"form_type": "1601EQ", "form_record_id": form_id})
        except Exception as e:
            summary["errors"].append({"form_type": "1601EQ", "error": str(e)})

        # ── 2550Q ────────────────────────────────────────────────────────────
        try:
            form_id, is_new = _find_or_create_draft_form("2550Q", entity, q_period_from, q_period_to, profile)
            if form_id:
                # Revenue from AR invoices
                ar_q = supabase.table("ar_invoices").select(
                    "billing_subtotal, vat_output"
                ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
                ar_q = ar_q.eq("entity", entity).gte("invoice_date", q_period_from).lte("invoice_date", q_period_to)
                ar_invs = ar_q.execute().data or []
                total_sales = sum(_num(inv.get("billing_subtotal")) for inv in ar_invs)
                total_output_vat = sum(_num(inv.get("vat_output")) for inv in ar_invs)

                ap_q2 = supabase.table("ap_bills").select(
                    "vat_exclusive_amount, vat_input"
                ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE")
                ap_q2 = ap_q2.eq("entity", entity).gte("bill_date", q_period_from).lte("bill_date", q_period_to)
                ap_bs = ap_q2.execute().data or []
                total_purchases = sum(_num(b.get("vat_exclusive_amount")) for b in ap_bs)
                total_input_vat = sum(_num(b.get("vat_input")) for b in ap_bs)

                net_vat = round(total_output_vat - total_input_vat, 2)

                def _tin_seg4(tin_str):
                    parts = (tin_str or "").split("-")
                    return [parts[i] if i < len(parts) else "" for i in range(4)]

                form_data_2550q = {
                    "return_period": f"Q{quarter}/{year}",
                    "quarter": quarter, "year": year,
                    "amended_return": False,
                    "tin": _tin_seg4(profile.get("tin", "")),
                    "rdo_code": profile.get("rdo_code", ""),
                    "taxpayer_name": _get_entity_registered_name(entity, profile),
                    "registered_address": profile.get("registered_address", ""),
                    "zip_code": profile.get("zip_code", ""),
                    "contact_number": profile.get("contact_number", ""),
                    "line_14a_vatable_sales": round(total_sales, 2),
                    "line_15_total_sales": round(total_sales, 2),
                    "line_16a_output_tax_vatable": round(total_output_vat, 2),
                    "line_17_total_output_tax": round(total_output_vat, 2),
                    "line_19a_purchases_domestic": round(total_purchases, 2),
                    "line_20_total_input_tax": round(total_input_vat, 2),
                    "line_22_allowable_input": round(total_input_vat, 2),
                    "line_23_net_vat_payable": round(net_vat, 2) if net_vat > 0 else 0,
                    "line_23_excess_input_vat": round(abs(net_vat), 2) if net_vat < 0 else 0,
                    "line_25_tax_still_due": round(net_vat, 2) if net_vat > 0 else 0,
                    "line_28_total_due": round(net_vat, 2) if net_vat > 0 else 0,
                    "auto_populated": True,
                }
                supabase.table("bir_forms").update({"form_data": form_data_2550q}).eq("form_record_id", form_id).execute()

                action = "AUTO_GENERATED" if is_new else "AUTO_UPDATED"
                supabase.table("bir_form_history").insert({
                    "form_record_id": form_id, "action": action,
                    "details": f"{action} via close_period for Q{quarter}/{year}",
                    "performed_by": performed_by,
                }).execute()
                (summary["generated"] if is_new else summary["updated"]).append({"form_type": "2550Q", "form_record_id": form_id})
        except Exception as e:
            summary["errors"].append({"form_type": "2550Q", "error": str(e)})

        # ── 1702Q (only quarters 1-3; quarter 4 uses annual 1702) ────────────
        if quarter <= 3:
            try:
                form_id, is_new = _find_or_create_draft_form("1702Q", entity, q_period_from, q_period_to, profile)
                if form_id:
                    # Revenue
                    ar_q3 = supabase.table("ar_invoices").select("billing_subtotal").eq(
                        "lifecycle_status", "CONFIRMED"
                    ).eq("record_status", "ACTIVE").eq("entity", entity)
                    ar_q3 = ar_q3.gte("invoice_date", q_period_from).lte("invoice_date", q_period_to)
                    ar_data3 = ar_q3.execute().data or []
                    sales_q = sum(_num(inv.get("billing_subtotal")) for inv in ar_data3)

                    # Costs
                    ap_q3 = supabase.table("ap_bills").select("vat_exclusive_amount").eq(
                        "lifecycle_status", "CONFIRMED"
                    ).eq("record_status", "ACTIVE").eq("entity", entity)
                    ap_q3 = ap_q3.gte("bill_date", q_period_from).lte("bill_date", q_period_to)
                    ap_data3 = ap_q3.execute().data or []
                    costs_q = sum(_num(b.get("vat_exclusive_amount")) for b in ap_data3)

                    gross_income_q = sales_q - costs_q
                    taxable_q = gross_income_q

                    # Previous quarters
                    prev_taxable = 0
                    if quarter > 1:
                        prev_from = f"{year}-01-01"
                        prev_to = (date(year, q_month_start, 1) - timedelta(days=1)).isoformat()
                        prev_ar = supabase.table("ar_invoices").select("billing_subtotal").eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").eq("entity", entity).gte("invoice_date", prev_from).lte("invoice_date", prev_to).execute().data or []
                        prev_ap = supabase.table("ap_bills").select("vat_exclusive_amount").eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").eq("entity", entity).gte("bill_date", prev_from).lte("bill_date", prev_to).execute().data or []
                        prev_taxable = sum(_num(inv.get("billing_subtotal")) for inv in prev_ar) - sum(_num(b.get("vat_exclusive_amount")) for b in prev_ap)

                    total_taxable_to_date = taxable_q + prev_taxable
                    tax_rate = 25.0
                    income_tax_due = round(max(total_taxable_to_date, 0) * (tax_rate / 100), 2)
                    total_gross_to_date = gross_income_q + prev_taxable
                    mcit = round(max(total_gross_to_date, 0) * 0.02, 2)
                    tax_due = max(income_tax_due, mcit)

                    # CWT from 2307s
                    wht_q2 = supabase.table("ar_invoices").select("wht_amount").eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").eq("entity", entity).gte("invoice_date", f"{year}-01-01").lte("invoice_date", q_period_to).gt("wht_amount", 0).execute().data or []
                    total_cwt = sum(_num(w.get("wht_amount")) for w in wht_q2)
                    tax_still_due = max(tax_due - total_cwt, 0)

                    def _tin_seg5(tin_str):
                        parts = (tin_str or "").split("-")
                        return [parts[i] if i < len(parts) else "" for i in range(4)]

                    form_data_1702q = {
                        "return_period": f"Q{quarter}/{year}",
                        "quarter": quarter, "year": year,
                        "amended_return": False,
                        "tin": _tin_seg5(profile.get("tin", "")),
                        "rdo_code": profile.get("rdo_code", ""),
                        "registered_name": _get_entity_registered_name(entity, profile),
                        "registered_address": profile.get("registered_address", ""),
                        "zip_code": profile.get("zip_code", ""),
                        "sched2_line1_sales": round(sales_q, 2),
                        "sched2_line2_cost_of_sales": round(costs_q, 2),
                        "sched2_line3_gross_income": round(gross_income_q, 2),
                        "sched2_line7_taxable_this_qtr": round(taxable_q, 2),
                        "sched2_line8_taxable_prev_qtrs": round(prev_taxable, 2),
                        "sched2_line9_total_taxable": round(total_taxable_to_date, 2),
                        "sched2_line10_tax_rate": tax_rate,
                        "sched2_line11_income_tax_due": round(income_tax_due, 2),
                        "sched2_line13_tax_due": round(tax_due, 2),
                        "sched4_line5_cwt_2307_this_qtr": round(total_cwt, 2),
                        "part2_line14_tax_due": round(tax_due, 2),
                        "part2_line19_total_credits": round(total_cwt, 2),
                        "part2_line20_tax_payable": round(tax_still_due, 2),
                        "part2_line25_total_due": round(tax_still_due, 2),
                        "auto_populated": True,
                    }
                    supabase.table("bir_forms").update({"form_data": form_data_1702q}).eq("form_record_id", form_id).execute()

                    action = "AUTO_GENERATED" if is_new else "AUTO_UPDATED"
                    supabase.table("bir_form_history").insert({
                        "form_record_id": form_id, "action": action,
                        "details": f"{action} via close_period for Q{quarter}/{year}",
                        "performed_by": performed_by,
                    }).execute()
                    (summary["generated"] if is_new else summary["updated"]).append({"form_type": "1702Q", "form_record_id": form_id})
            except Exception as e:
                summary["errors"].append({"form_type": "1702Q", "error": str(e)})



    # ── Annual forms (month 12) ───────────────────────────────────────────────
    if month == 12:
        annual_period_from = f"{year}-01-01"
        annual_period_to = f"{year}-12-31"

        # ── 1702 (Annual Income Tax) ─────────────────────────────────────────
        try:
            form_id, is_new = _find_or_create_draft_form("1702", entity, annual_period_from, annual_period_to, profile)
            if form_id:
                # Revenue
                ar_annual = supabase.table("ar_invoices").select("billing_subtotal, wht_amount").eq(
                    "lifecycle_status", "CONFIRMED"
                ).eq("record_status", "ACTIVE").eq("entity", entity).gte(
                    "invoice_date", annual_period_from
                ).lte("invoice_date", annual_period_to).execute().data or []
                total_sales_ann = sum(_num(inv.get("billing_subtotal")) for inv in ar_annual)

                # Costs
                ap_annual = supabase.table("ap_bills").select("vat_exclusive_amount").eq(
                    "lifecycle_status", "CONFIRMED"
                ).eq("record_status", "ACTIVE").eq("entity", entity).gte(
                    "bill_date", annual_period_from
                ).lte("bill_date", annual_period_to).execute().data or []
                total_costs_ann = sum(_num(b.get("vat_exclusive_amount")) for b in ap_annual)

                gross_income_ann = total_sales_ann - total_costs_ann
                osd = round(gross_income_ann * 0.40, 2) if gross_income_ann > 0 else 0
                net_taxable_ann = gross_income_ann - osd
                tax_rate = 25.0
                income_tax_due_ann = round(max(net_taxable_ann, 0) * (tax_rate / 100), 2)
                mcit_ann = round(max(gross_income_ann, 0) * 0.02, 2)
                tax_due_ann = max(income_tax_due_ann, mcit_ann)

                total_cwt_ann = sum(_num(inv.get("wht_amount")) for inv in ar_annual if _num(inv.get("wht_amount")) > 0)

                qtr_forms = supabase.table("bir_forms").select("form_data").eq("form_type", "1702Q").eq("entity", entity).gte("period_from", annual_period_from).lte("period_to", annual_period_to).in_("status", ["FINALIZED", "PENDING_APPROVAL"]).execute().data or []
                prev_qtr_payments = sum(_num((f.get("form_data") or {}).get("part2_line25_total_due")) for f in qtr_forms)

                net_tax_payable_ann = max(tax_due_ann - total_cwt_ann - prev_qtr_payments, 0)

                def _tin_seg6(tin_str):
                    parts = (tin_str or "").split("-")
                    return [parts[i] if i < len(parts) else "" for i in range(4)]

                form_data_1702 = {
                    "tax_year": year,
                    "amended_return": False,
                    "tin": _tin_seg6(profile.get("tin", "")),
                    "rdo_code": profile.get("rdo_code", ""),
                    "registered_name": _get_entity_registered_name(entity, profile),
                    "registered_address": profile.get("registered_address", ""),
                    "zip_code": profile.get("zip_code", ""),
                    "method_of_deduction": "OSD",
                    "line_27_sales": round(total_sales_ann, 2),
                    "line_29_net_sales": round(total_sales_ann, 2),
                    "line_30_cost_of_sales": round(total_costs_ann, 2),
                    "line_31_gross_income": round(gross_income_ann, 2),
                    "line_38_osd": round(osd, 2),
                    "line_39_net_taxable_income": round(net_taxable_ann, 2),
                    "line_40_tax_rate": tax_rate,
                    "line_41_income_tax_due": round(income_tax_due_ann, 2),
                    "line_42_mcit_due": round(mcit_ann, 2),
                    "line_43_tax_due": round(tax_due_ann, 2),
                    "line_46_regular_prev_qtrs": round(prev_qtr_payments, 2),
                    "line_49_cwt_2307_4th_qtr": round(total_cwt_ann, 2),
                    "line_55_total_credits": round(total_cwt_ann + prev_qtr_payments, 2),
                    "line_56_net_tax_payable": round(net_tax_payable_ann, 2),
                    "part2_line21_total_payable": round(net_tax_payable_ann, 2),
                    "auto_populated": True,
                }
                supabase.table("bir_forms").update({"form_data": form_data_1702}).eq("form_record_id", form_id).execute()

                action = "AUTO_GENERATED" if is_new else "AUTO_UPDATED"
                supabase.table("bir_form_history").insert({
                    "form_record_id": form_id, "action": action,
                    "details": f"{action} via close_period for annual {year}",
                    "performed_by": performed_by,
                }).execute()
                (summary["generated"] if is_new else summary["updated"]).append({"form_type": "1702", "form_record_id": form_id})
        except Exception as e:
            summary["errors"].append({"form_type": "1702", "error": str(e)})

        # ── 1604-E (Annual Information Return of EWT) ────────────────────────
        try:
            form_id, is_new = _find_or_create_draft_form("1604E", entity, annual_period_from, annual_period_to, profile)
            if form_id:
                # Get all EWT bills for the year
                ewt_bills_annual = supabase.table("ap_bills").select(
                    "bill_id, bill_date, supplier_id, vat_exclusive_amount, ewt_material"
                ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt(
                    "ewt_material", 0
                ).eq("entity", entity).gte("bill_date", annual_period_from).lte(
                    "bill_date", annual_period_to
                ).order("bill_date").execute().data or []

                # Supplier info
                sup_ids_1604e = list(set(b["supplier_id"] for b in ewt_bills_annual if b.get("supplier_id")))
                sup_map_1604e = {}
                if sup_ids_1604e:
                    sup_rows_1604e = supabase.table("supplier_list").select(
                        "supplier_id, company_name, tin_number, billing_address"
                    ).in_("supplier_id", sup_ids_1604e).execute().data or []
                    sup_map_1604e = {s["supplier_id"]: s for s in sup_rows_1604e}

                # Quarterly breakdown
                q_totals_1604e = {1: 0, 2: 0, 3: 0, 4: 0}
                alphalist_1604e = {}
                for b in ewt_bills_annual:
                    sid = b.get("supplier_id")
                    bm = int(b["bill_date"][5:7])
                    qtr = (bm - 1) // 3 + 1
                    q_totals_1604e[qtr] += _num(b.get("ewt_material"))
                    if sid:
                        if sid not in alphalist_1604e:
                            sup = sup_map_1604e.get(sid, {})
                            alphalist_1604e[sid] = {
                                "supplier_id": sid, "payee_name": sup.get("company_name", ""),
                                "tin": sup.get("tin_number", ""), "address": sup.get("billing_address", ""),
                                "income_payment": 0, "tax_withheld": 0, "atc_code": "WC010",
                                "first_quarter": 0, "second_quarter": 0, "third_quarter": 0, "fourth_quarter": 0,
                            }
                        alphalist_1604e[sid]["income_payment"] += _num(b.get("vat_exclusive_amount"))
                        alphalist_1604e[sid]["tax_withheld"] += _num(b.get("ewt_material"))
                        qtr_key = ["first_quarter", "second_quarter", "third_quarter", "fourth_quarter"][qtr - 1]
                        alphalist_1604e[sid][qtr_key] += _num(b.get("ewt_material"))

                alphalist_list_1604e = []
                for entry in alphalist_1604e.values():
                    entry["income_payment"] = round(entry["income_payment"], 2)
                    entry["tax_withheld"] = round(entry["tax_withheld"], 2)
                    entry["first_quarter"] = round(entry["first_quarter"], 2)
                    entry["second_quarter"] = round(entry["second_quarter"], 2)
                    entry["third_quarter"] = round(entry["third_quarter"], 2)
                    entry["fourth_quarter"] = round(entry["fourth_quarter"], 2)
                    alphalist_list_1604e.append(entry)
                alphalist_list_1604e.sort(key=lambda x: x["tax_withheld"], reverse=True)

                total_ewt_1604e = round(sum(q_totals_1604e.values()), 2)

                def _tin_seg_1604e(tin_str):
                    parts = (tin_str or "").split("-")
                    return [parts[i] if i < len(parts) else "" for i in range(4)]

                form_data_1604e = {
                    "tax_year": year,
                    "amended_return": False,
                    "tin": _tin_seg_1604e(profile.get("tin", "")),
                    "rdo_code": profile.get("rdo_code", ""),
                    "taxpayer_name": _get_entity_registered_name(entity, profile),
                    "registered_address": profile.get("registered_address", ""),
                    "zip_code": profile.get("zip_code", ""),
                    "contact_number": profile.get("contact_number", ""),
                    "category_of_agent": profile.get("category", "Private"),
                    "q1_taxes_withheld": round(q_totals_1604e[1], 2),
                    "q2_taxes_withheld": round(q_totals_1604e[2], 2),
                    "q3_taxes_withheld": round(q_totals_1604e[3], 2),
                    "q4_taxes_withheld": round(q_totals_1604e[4], 2),
                    "total_taxes_withheld": total_ewt_1604e,
                    "alphalist": alphalist_list_1604e,
                    "total_income_payments": round(sum(a["income_payment"] for a in alphalist_list_1604e), 2),
                    "number_of_payees": len(alphalist_list_1604e),
                    "signatory_name": profile.get("authorized_signatory", ""),
                    "signatory_title": profile.get("signatory_title", ""),
                    "auto_populated": True,
                }
                supabase.table("bir_forms").update({"form_data": form_data_1604e}).eq("form_record_id", form_id).execute()

                action = "AUTO_GENERATED" if is_new else "AUTO_UPDATED"
                supabase.table("bir_form_history").insert({
                    "form_record_id": form_id, "action": action,
                    "details": f"{action} via close_period for annual {year}",
                    "performed_by": performed_by,
                }).execute()
                (summary["generated"] if is_new else summary["updated"]).append({"form_type": "1604E", "form_record_id": form_id})
        except Exception as e:
            summary["errors"].append({"form_type": "1604E", "error": str(e)})

        # ── 2316 (per active employee) ───────────────────────────────────────
        try:
            # Get active employees
            active_employees = supabase.table("employees").select(
                "employee_id, first_name, last_name"
            ).eq("status", "Active").execute().data or []

            for emp in active_employees:
                try:
                    emp_id = emp["employee_id"]
                    emp_period_from = annual_period_from
                    emp_period_to = annual_period_to

                    # Check if 2316 DRAFT already exists for this employee+year
                    emp_existing = supabase.table("bir_forms").select("form_record_id").eq(
                        "form_type", "2316"
                    ).eq("entity", entity).eq("customer_id", emp_id).eq(
                        "period_from", emp_period_from
                    ).eq("period_to", emp_period_to).eq("status", "DRAFT").execute().data or []

                    if emp_existing:
                        emp_form_id = emp_existing[0]["form_record_id"]
                        emp_is_new = False
                    else:
                        emp_name = f"{emp.get('last_name', '')}, {emp.get('first_name', '')}"
                        emp_form = {
                            "form_type": "2316",
                            "entity": entity,
                            "customer_id": emp_id,
                            "period_from": emp_period_from,
                            "period_to": emp_period_to,
                            "status": "DRAFT",
                            "payee_name": emp_name,
                            "payor_tin": profile.get("tin", ""),
                            "payor_name": _get_entity_registered_name(entity, profile),
                            "payor_address": profile.get("registered_address", ""),
                            "payor_zip_code": profile.get("zip_code", ""),
                            "form_data": {},
                        }
                        emp_res = supabase.table("bir_forms").insert(emp_form).execute()
                        if not emp_res.data:
                            continue
                        emp_form_id = emp_res.data[0]["form_record_id"]
                        emp_is_new = True

                    # Compute 2316 data for this employee
                    pe_rows = supabase.table("payroll_employees").select("*").eq("employee_id", emp_id).execute().data or []
                    pe = pe_rows[0] if pe_rows else {}

                    runs_annual = supabase.table("payroll_runs").select("run_id").gte(
                        "period_start", annual_period_from
                    ).lte("period_end", annual_period_to).neq("status", "DRAFT").execute().data or []
                    run_ids_ann = [r["run_id"] for r in runs_annual]

                    emp_items = []
                    if run_ids_ann:
                        emp_items = supabase.table("payroll_items").select("*").eq(
                            "employee_id", emp_id
                        ).in_("run_id", run_ids_ann).execute().data or []

                    total_gross_emp = sum(_num(i.get("gross_pay")) for i in emp_items)
                    total_sss_emp = sum(_num(i.get("sss_employee")) for i in emp_items)
                    total_ph_emp = sum(_num(i.get("philhealth_employee")) for i in emp_items)
                    total_pi_emp = sum(_num(i.get("pagibig_employee")) for i in emp_items)
                    total_wht_emp = sum(_num(i.get("withholding_tax")) for i in emp_items)
                    total_stat_emp = total_sss_emp + total_ph_emp + total_pi_emp

                    monthly_basic = _num(pe.get("basic_salary"))
                    thirteenth_month = round(monthly_basic, 2)
                    non_taxable_13th = min(thirteenth_month, 90000)
                    total_nontaxable_emp = total_stat_emp + non_taxable_13th
                    taxable_comp_emp = total_gross_emp + thirteenth_month - total_nontaxable_emp

                    def _tin_seg7(tin_str):
                        parts = (tin_str or "").split("-")
                        return [parts[i] if i < len(parts) else "" for i in range(4)]

                    form_data_2316 = {
                        "tax_year": year,
                        "employee_tin": _tin_seg7(pe.get("tin_number", "")),
                        "employee_name": f"{emp.get('last_name', '')}, {emp.get('first_name', '')}",
                        "employer_tin": _tin_seg7(profile.get("tin", "")),
                        "employer_name": _get_entity_registered_name(entity, profile),
                        "employer_address": profile.get("registered_address", ""),
                        "line_19_gross_compensation": round(total_gross_emp + thirteenth_month, 2),
                        "line_20_nontaxable_compensation": round(total_nontaxable_emp, 2),
                        "line_21_taxable_present": round(taxable_comp_emp, 2),
                        "line_24_tax_due": round(total_wht_emp, 2),
                        "line_25a_tax_withheld_present": round(total_wht_emp, 2),
                        "line_28_total_taxes_withheld": round(total_wht_emp, 2),
                        "line_36_sss_philhealth_pagibig": round(total_stat_emp, 2),
                        "line_34_13th_month": round(non_taxable_13th, 2),
                        "auto_populated": True,
                    }
                    supabase.table("bir_forms").update({"form_data": form_data_2316}).eq("form_record_id", emp_form_id).execute()

                    action = "AUTO_GENERATED" if emp_is_new else "AUTO_UPDATED"
                    supabase.table("bir_form_history").insert({
                        "form_record_id": emp_form_id, "action": action,
                        "details": f"{action} via close_period for {emp.get('last_name', '')} {year}",
                        "performed_by": performed_by,
                    }).execute()
                    (summary["generated"] if emp_is_new else summary["updated"]).append({"form_type": "2316", "form_record_id": emp_form_id, "employee_id": emp_id})
                except Exception:
                    summary["errors"].append({"form_type": "2316", "employee_id": emp.get("employee_id"), "error": "Failed to generate"})
        except Exception as e:
            summary["errors"].append({"form_type": "2316", "error": str(e)})

    # ── Return summary ────────────────────────────────────────────────────────
    write_audit_log(
        action="CLOSE_PERIOD", module_name=MODULE_NAME,
        description=f"Period close for {entity} {month:02d}/{year}: {len(summary['generated'])} generated, {len(summary['updated'])} updated, {len(summary['errors'])} errors",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {
        "month": month,
        "year": year,
        "entity": entity,
        "is_quarter_end": month in (3, 6, 9, 12),
        "is_year_end": month == 12,
        "generated": summary["generated"],
        "updated": summary["updated"],
        "errors": summary["errors"],
        "total_forms_processed": len(summary["generated"]) + len(summary["updated"]),
    }


# ── BIR Form 1604-E Auto-Populate ───────────────────────────────────────────

@router.get("/bir-forms/1604E/auto-populate")
def auto_populate_1604e(
    entity: str = Query(..., description="Entity name"),
    year: int = Query(..., description="Tax year"),
):
    """Auto-populate BIR 1604-E (Annual Information Return of EWT).

    Aggregates full-year EWT data from AP bills to produce:
    - Quarterly remittance summary (from 0619-E totals per quarter)
    - Complete alphalist of payees (all suppliers with EWT during the year)
    - Total income payments and taxes withheld
    """
    period_from = f"{year}-01-01"
    period_to = f"{year}-12-31"

    # Entity tax profile
    profiles = supabase.table("entity_tax_profiles").select("*").eq("entity", entity).execute().data or []
    profile = profiles[0] if profiles else {}

    def tin_segments(tin_str):
        parts = (tin_str or "").split("-")
        return [parts[i] if i < len(parts) else "" for i in range(4)]

    # Get all confirmed AP bills with EWT for this entity + full year
    q = supabase.table("ap_bills").select(
        "bill_id, bill_number, bill_date, supplier_id, vat_exclusive_amount, ewt_material"
    ).eq("lifecycle_status", "CONFIRMED").eq("record_status", "ACTIVE").gt("ewt_material", 0)
    q = q.eq("entity", entity)
    q = q.gte("bill_date", period_from).lte("bill_date", period_to)
    bills = q.order("bill_date").execute().data or []

    # Get supplier info
    supplier_ids = list(set(b["supplier_id"] for b in bills if b.get("supplier_id")))
    supplier_map = {}
    if supplier_ids:
        sup_rows = supabase.table("supplier_list").select(
            "supplier_id, company_name, tin_number, billing_address"
        ).in_("supplier_id", supplier_ids).execute().data or []
        supplier_map = {s["supplier_id"]: s for s in sup_rows}

    # Quarterly breakdown
    quarterly_totals = {1: 0, 2: 0, 3: 0, 4: 0}
    for bill in bills:
        bill_month = int(bill["bill_date"][5:7])
        qtr = (bill_month - 1) // 3 + 1
        quarterly_totals[qtr] += _num(bill.get("ewt_material"))

    total_ewt = round(sum(quarterly_totals.values()), 2)

    # Build alphalist (annual schedule of payees)
    alphalist = {}
    for bill in bills:
        sid = bill.get("supplier_id")
        if not sid:
            continue
        if sid not in alphalist:
            sup = supplier_map.get(sid, {})
            alphalist[sid] = {
                "supplier_id": sid,
                "payee_name": sup.get("company_name", ""),
                "tin": sup.get("tin_number", ""),
                "address": sup.get("billing_address", ""),
                "income_payment": 0,
                "tax_withheld": 0,
                "atc_code": "WC010",
                "first_quarter": 0,
                "second_quarter": 0,
                "third_quarter": 0,
                "fourth_quarter": 0,
            }
        alphalist[sid]["income_payment"] += _num(bill.get("vat_exclusive_amount"))
        alphalist[sid]["tax_withheld"] += _num(bill.get("ewt_material"))
        # Quarter breakdown per supplier
        bill_month = int(bill["bill_date"][5:7])
        qtr = (bill_month - 1) // 3 + 1
        qtr_key = ["first_quarter", "second_quarter", "third_quarter", "fourth_quarter"][qtr - 1]
        alphalist[sid][qtr_key] += _num(bill.get("ewt_material"))

    # Round alphalist values
    alphalist_list = []
    for entry in alphalist.values():
        entry["income_payment"] = round(entry["income_payment"], 2)
        entry["tax_withheld"] = round(entry["tax_withheld"], 2)
        entry["first_quarter"] = round(entry["first_quarter"], 2)
        entry["second_quarter"] = round(entry["second_quarter"], 2)
        entry["third_quarter"] = round(entry["third_quarter"], 2)
        entry["fourth_quarter"] = round(entry["fourth_quarter"], 2)
        alphalist_list.append(entry)
    alphalist_list.sort(key=lambda x: x["tax_withheld"], reverse=True)

    # Get previously filed quarterly 1601-EQ amounts
    qtr_forms = supabase.table("bir_forms").select("form_data, period_from").eq(
        "form_type", "1601EQ"
    ).eq("entity", entity).gte("period_from", period_from).lte(
        "period_to", period_to
    ).in_("status", ["FINALIZED", "PENDING_APPROVAL", "DRAFT"]).execute().data or []

    qtr_remittances = {1: 0, 2: 0, 3: 0, 4: 0}
    for f in qtr_forms:
        fd = f.get("form_data") or {}
        q_num = fd.get("quarter", 0)
        if q_num:
            qtr_remittances[q_num] = _num(fd.get("line_17_total_tax_due", fd.get("line_24_total_due", 0)))

    return {
        "tax_year": year,
        "amended_return": False,
        "tin": tin_segments(profile.get("tin", "")),
        "rdo_code": profile.get("rdo_code", ""),
        "taxpayer_name": _get_entity_registered_name(entity, profile),
        "registered_address": profile.get("registered_address", ""),
        "zip_code": profile.get("zip_code", ""),
        "contact_number": profile.get("contact_number", ""),
        "category_of_agent": profile.get("category", "Private"),
        # Quarterly remittances
        "q1_taxes_withheld": round(quarterly_totals[1], 2),
        "q2_taxes_withheld": round(quarterly_totals[2], 2),
        "q3_taxes_withheld": round(quarterly_totals[3], 2),
        "q4_taxes_withheld": round(quarterly_totals[4], 2),
        "q1_remitted": round(qtr_remittances[1], 2),
        "q2_remitted": round(qtr_remittances[2], 2),
        "q3_remitted": round(qtr_remittances[3], 2),
        "q4_remitted": round(qtr_remittances[4], 2),
        "total_taxes_withheld": total_ewt,
        "total_remitted": round(sum(qtr_remittances.values()), 2),
        # Alphalist
        "alphalist": alphalist_list,
        "total_income_payments": round(sum(a["income_payment"] for a in alphalist_list), 2),
        "number_of_payees": len(alphalist_list),
        # Signatory
        "signatory_name": profile.get("authorized_signatory", ""),
        "signatory_title": profile.get("signatory_title", ""),
        "auto_populated": True,
    }


# ── Official BIR Form Upload & Version History ───────────────────────────────

ALLOWED_OFFICIAL_MIME = {
    "application/pdf": "PDF",
    "image/jpeg": "JPEG",
    "image/jpg": "JPG",
    "image/png": "PNG",
}
MAX_OFFICIAL_FILE_SIZE = 15 * 1024 * 1024  # 15MB


@router.post("/bir-forms/{form_record_id}/official-form", status_code=201)
async def upload_official_form(
    form_record_id: int,
    request: Request,
    file: UploadFile = File(...),
    reason: Optional[str] = Query(None),
    file_category: str = Query("FILED_FORM", description="FILED_FORM or ACKNOWLEDGEMENT"),
):
    """Upload or re-upload the official filed BIR form or acknowledgement receipt.

    file_category: FILED_FORM or ACKNOWLEDGEMENT
    First upload per category: reason is optional.
    Re-upload (new version): reason is REQUIRED.
    Auto-transitions form to FILED status when both documents are uploaded.
    """
    import uuid

    if file_category not in ("FILED_FORM", "ACKNOWLEDGEMENT"):
        raise HTTPException(status_code=422, detail={"error": "file_category must be FILED_FORM or ACKNOWLEDGEMENT"})

    employee_id, performed_by = _extract_jwt_claims(request)

    # Verify form exists and is APPROVED or FILED
    form = supabase.table("bir_forms").select(
        "form_record_id, form_type, entity, form_code, status"
    ).eq("form_record_id", form_record_id).execute().data
    if not form:
        raise HTTPException(status_code=404, detail={"error": "BIR form not found."})
    form = form[0]

    if form["status"] not in ("APPROVED", "FILED"):
        raise HTTPException(
            status_code=400,
            detail={"error": "Official forms can only be uploaded for APPROVED or FILED forms."}
        )

    # Validate MIME type
    file_type = ALLOWED_OFFICIAL_MIME.get(file.content_type)
    if not file_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Unsupported file type. Accepted: PDF, JPG, PNG.",
                "fields": {"file": "Accepted formats: PDF, JPG, PNG"},
            },
        )

    # Read and validate size
    file_content = await file.read()
    if len(file_content) > MAX_OFFICIAL_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "File too large. Maximum size is 15MB.",
                "fields": {"file": "Maximum file size is 15MB."},
            },
        )

    # Check existing versions for this category — if re-uploading, reason is required
    existing = supabase.table("bir_official_forms").select(
        "id, version"
    ).eq("form_record_id", form_record_id).eq(
        "file_category", file_category
    ).order("version", desc=True).limit(1).execute().data

    next_version = 1
    if existing:
        next_version = existing[0]["version"] + 1
        if not reason or not reason.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "A reason is required when re-uploading an official form.",
                    "fields": {"reason": "Please provide a reason for the re-upload."},
                },
            )
        # Mark previous current as not current for this category
        supabase.table("bir_official_forms").update(
            {"is_current": False}
        ).eq("form_record_id", form_record_id).eq(
            "file_category", file_category
        ).eq("is_current", True).execute()

    # Upload to Supabase Storage
    file_uuid = str(uuid.uuid4())
    filename = file.filename or f"official-{form['form_type']}.{file_type.lower()}"
    safe_entity = (form.get("entity") or "unknown").replace(" ", "_")
    storage_path = (
        f"official-bir-forms/{safe_entity}/{form['form_type']}"
        f"/{form_record_id}/v{next_version}_{file_uuid}_{filename}"
    )

    try:
        supabase.storage.from_("tax-documents").upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": file.content_type},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "File upload failed. Please try again."},
        )

    file_url = supabase.storage.from_("tax-documents").get_public_url(storage_path)

    # Insert record
    record = {
        "form_record_id": form_record_id,
        "version": next_version,
        "file_name": filename,
        "storage_path": storage_path,
        "file_type": file_type,
        "file_size": len(file_content),
        "file_category": file_category,
        "reason": reason.strip() if reason else None,
        "uploaded_by_employee_id": employee_id,
        "uploaded_by_name": performed_by,
        "is_current": True,
    }
    inserted = supabase.table("bir_official_forms").insert(record).execute().data

    # Auto-transition to FILED if both documents are now uploaded
    if form["status"] == "APPROVED":
        current_uploads = supabase.table("bir_official_forms").select(
            "file_category"
        ).eq("form_record_id", form_record_id).eq("is_current", True).execute().data or []
        uploaded_categories = set(u["file_category"] for u in current_uploads)
        if "FILED_FORM" in uploaded_categories and "ACKNOWLEDGEMENT" in uploaded_categories:
            supabase.table("bir_forms").update({
                "status": "FILED",
                "updated_at": datetime.now().isoformat(),
            }).eq("form_record_id", form_record_id).execute()
            supabase.table("bir_form_history").insert({
                "form_record_id": form_record_id,
                "action": "FILED",
                "details": f"Both filed form and acknowledgement uploaded — marked as FILED by {performed_by}",
                "performed_by": performed_by,
            }).execute()

    # Audit log
    write_audit_log(
        action="UPLOAD",
        module_name=MODULE_NAME,
        description=(
            f"Uploaded official BIR {form['form_type']} form v{next_version}"
            f" for {form.get('form_code') or form_record_id}"
            + (f" — Reason: {reason.strip()}" if reason else "")
        ),
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {
        "id": inserted[0]["id"] if inserted else None,
        "version": next_version,
        "file_name": filename,
        "file_url": file_url,
        "file_type": file_type,
        "file_size": len(file_content),
        "uploaded_by": performed_by,
        "created_at": datetime.now().isoformat(),
    }


@router.get("/bir-forms/{form_record_id}/official-form")
def get_official_form(form_record_id: int):
    """Get the current official BIR form and acknowledgement for a given form record."""
    records = supabase.table("bir_official_forms").select("*").eq(
        "form_record_id", form_record_id
    ).eq("is_current", True).execute().data or []

    filed_form = None
    acknowledgement = None

    for rec in records:
        rec["file_url"] = supabase.storage.from_("tax-documents").get_public_url(rec["storage_path"])
        if rec["file_category"] == "FILED_FORM":
            filed_form = rec
        elif rec["file_category"] == "ACKNOWLEDGEMENT":
            acknowledgement = rec

    return {
        "exists": bool(filed_form or acknowledgement),
        "filed_form": filed_form,
        "acknowledgement": acknowledgement,
    }


@router.get("/bir-forms/{form_record_id}/official-form/versions")
def get_official_form_versions(form_record_id: int, file_category: Optional[str] = Query(None)):
    """Get all versions of the official BIR form for a given form record, optionally filtered by category."""
    q = supabase.table("bir_official_forms").select("*").eq(
        "form_record_id", form_record_id
    )
    if file_category:
        q = q.eq("file_category", file_category)
    records = q.order("version", desc=True).execute().data or []

    for rec in records:
        rec["file_url"] = supabase.storage.from_("tax-documents").get_public_url(
            rec["storage_path"]
        )

    return records


# ── Linked Documents (per-form connections) ──────────────────────────────────

@router.get("/bir-forms/{form_record_id}/linked-documents")
def get_linked_documents(form_record_id: int):
    """Return linked transactions and related BIR forms for a given form.

    Returns different data depending on form type:
    - 2307: linked AP bills or AR invoices
    - 0619E: AP bills with EWT for that entity+month
    - 1601C: payroll runs for that entity+month
    - 1600VT: AP bills with VAT for that entity+month
    - 1601EQ: related monthly 0619E forms for that quarter
    - 2550Q: AR invoices (output VAT) + AP bills (input VAT) for the quarter
    - 1702Q: quarterly revenue + expense summary
    - 1702: related quarterly 1702Q forms
    - 1604E: all 2307 forms for that entity+year
    - 2316: employee payroll items for the year
    - 0605: no linked documents
    """
    form_row = supabase.table("bir_forms").select("*").eq(
        "form_record_id", form_record_id
    ).execute().data
    if not form_row:
        raise HTTPException(status_code=404, detail={"error": "Form not found"})
    form = form_row[0]

    form_type = form.get("form_type", "")
    entity = form.get("entity", "")
    period_from = form.get("period_from", "")
    period_to = form.get("period_to", "")

    result = {
        "form_type": form_type,
        "transactions": [],
        "related_forms": [],
    }

    if form_type == "2307":
        # Linked bills (via bir_form_bills)
        bill_links = supabase.table("bir_form_bills").select(
            "bill_id"
        ).eq("form_record_id", form_record_id).execute().data or []
        if bill_links:
            bill_ids = [b["bill_id"] for b in bill_links]
            bills = supabase.table("ap_bills").select(
                "bill_id, bill_number, supplier_id, bill_date, vat_exclusive_amount, ewt_material, net_payable, payment_status"
            ).in_("bill_id", bill_ids).execute().data or []
            for b in bills:
                result["transactions"].append({
                    "type": "AP Bill",
                    "id": b["bill_id"],
                    "reference": b.get("bill_number"),
                    "date": b.get("bill_date"),
                    "amount": float(b.get("vat_exclusive_amount") or 0),
                    "tax_amount": float(b.get("ewt_material") or 0),
                    "status": b.get("payment_status"),
                    "url": f"/accounts-payable/bills/{b['bill_id']}",
                })

        # Linked invoices (via bir_form_invoices)
        inv_links = supabase.table("bir_form_invoices").select(
            "invoice_id"
        ).eq("form_record_id", form_record_id).execute().data or []
        if inv_links:
            inv_ids = [i["invoice_id"] for i in inv_links]
            invoices = supabase.table("ar_invoices").select(
                "invoice_id, invoice_number, invoice_date, billing_subtotal, wht_amount, collection_status"
            ).in_("invoice_id", inv_ids).execute().data or []
            for inv in invoices:
                result["transactions"].append({
                    "type": "AR Invoice",
                    "id": inv["invoice_id"],
                    "reference": inv.get("invoice_number"),
                    "date": inv.get("invoice_date"),
                    "amount": float(inv.get("billing_subtotal") or 0),
                    "tax_amount": float(inv.get("wht_amount") or 0),
                    "status": inv.get("collection_status"),
                    "url": f"/accounts-receivable/invoices/{inv['invoice_id']}",
                })

    elif form_type == "0619E":
        # All AP bills with EWT for this entity+month
        bills = supabase.table("ap_bills").select(
            "bill_id, bill_number, bill_date, vat_exclusive_amount, ewt_material, payment_status"
        ).eq("entity", entity).gte("bill_date", period_from).lte(
            "bill_date", period_to
        ).eq("lifecycle_status", "CONFIRMED").execute().data or []
        for b in bills:
            if float(b.get("ewt_material") or 0) > 0:
                result["transactions"].append({
                    "type": "AP Bill",
                    "id": b["bill_id"],
                    "reference": b.get("bill_number"),
                    "date": b.get("bill_date"),
                    "amount": float(b.get("vat_exclusive_amount") or 0),
                    "tax_amount": float(b.get("ewt_material") or 0),
                    "status": b.get("payment_status"),
                    "url": f"/accounts-payable/bills/{b['bill_id']}",
                })

        # Related: parent 1601EQ for this quarter
        related_1601eq = supabase.table("bir_forms").select(
            "form_record_id, form_type, entity, period_from, period_to, status, form_code"
        ).eq("form_type", "1601EQ").eq("entity", entity).lte(
            "period_from", period_from
        ).gte("period_to", period_to).execute().data or []
        for f in related_1601eq:
            result["related_forms"].append({
                "form_record_id": f["form_record_id"],
                "form_type": f["form_type"],
                "form_code": f.get("form_code"),
                "period": f"{f.get('period_from')} to {f.get('period_to')}",
                "status": f.get("status"),
                "url": f"/tax/forms/{f['form_type']}/{f['form_record_id']}",
            })

    elif form_type == "1601C":
        # Payroll runs for this entity+month
        payroll_runs = supabase.table("payroll_runs").select(
            "run_id, period_start, period_end, status, total_employees, total_gross, total_deductions, total_net"
        ).gte("period_start", period_from).lte("period_end", period_to).execute().data or []
        for pr in payroll_runs:
            result["transactions"].append({
                "type": "Payroll Run",
                "id": pr["run_id"],
                "reference": f"Payroll {pr.get('period_start')} to {pr.get('period_end')}",
                "date": pr.get("period_start"),
                "amount": float(pr.get("total_gross") or 0),
                "tax_amount": float(pr.get("total_deductions") or 0),
                "status": pr.get("status"),
                "url": f"/payroll/runs/{pr['run_id']}",
            })

    elif form_type == "1600VT":
        # AP bills with VAT for this entity+month
        bills = supabase.table("ap_bills").select(
            "bill_id, bill_number, bill_date, vat_exclusive_amount, vat_input, payment_status"
        ).eq("entity", entity).gte("bill_date", period_from).lte(
            "bill_date", period_to
        ).eq("lifecycle_status", "CONFIRMED").execute().data or []
        for b in bills:
            if float(b.get("vat_input") or 0) > 0:
                result["transactions"].append({
                    "type": "AP Bill",
                    "id": b["bill_id"],
                    "reference": b.get("bill_number"),
                    "date": b.get("bill_date"),
                    "amount": float(b.get("vat_exclusive_amount") or 0),
                    "tax_amount": float(b.get("vat_input") or 0),
                    "status": b.get("payment_status"),
                    "url": f"/accounts-payable/bills/{b['bill_id']}",
                })

    elif form_type == "1601EQ":
        # Related monthly 0619E forms for this quarter
        monthly_forms = supabase.table("bir_forms").select(
            "form_record_id, form_type, entity, period_from, period_to, status, form_code"
        ).eq("form_type", "0619E").eq("entity", entity).gte(
            "period_from", period_from
        ).lte("period_to", period_to).order("period_from").execute().data or []
        for f in monthly_forms:
            result["related_forms"].append({
                "form_record_id": f["form_record_id"],
                "form_type": f["form_type"],
                "form_code": f.get("form_code"),
                "period": f"{f.get('period_from')} to {f.get('period_to')}",
                "status": f.get("status"),
                "url": f"/tax/forms/{f['form_type']}/{f['form_record_id']}",
            })

    elif form_type == "2550Q":
        # AR invoices (output VAT) for the quarter
        ar_invoices = supabase.table("ar_invoices").select(
            "invoice_id, invoice_number, invoice_date, billing_subtotal, vat_output, collection_status"
        ).eq("entity", entity).gte("invoice_date", period_from).lte(
            "invoice_date", period_to
        ).execute().data or []
        for inv in ar_invoices:
            result["transactions"].append({
                "type": "AR Invoice (Output VAT)",
                "id": inv["invoice_id"],
                "reference": inv.get("invoice_number"),
                "date": inv.get("invoice_date"),
                "amount": float(inv.get("billing_subtotal") or 0),
                "tax_amount": float(inv.get("vat_output") or 0),
                "status": inv.get("collection_status"),
                "url": f"/accounts-receivable/invoices/{inv['invoice_id']}",
            })

        # AP bills (input VAT) for the quarter
        ap_bills = supabase.table("ap_bills").select(
            "bill_id, bill_number, bill_date, vat_exclusive_amount, vat_input, payment_status"
        ).eq("entity", entity).gte("bill_date", period_from).lte(
            "bill_date", period_to
        ).eq("lifecycle_status", "CONFIRMED").execute().data or []
        for b in ap_bills:
            if float(b.get("vat_input") or 0) > 0:
                result["transactions"].append({
                    "type": "AP Bill (Input VAT)",
                    "id": b["bill_id"],
                    "reference": b.get("bill_number"),
                    "date": b.get("bill_date"),
                    "amount": float(b.get("vat_exclusive_amount") or 0),
                    "tax_amount": float(b.get("vat_input") or 0),
                    "status": b.get("payment_status"),
                    "url": f"/accounts-payable/bills/{b['bill_id']}",
                })

    elif form_type == "1702Q":
        # Related: annual 1702 for same entity+year
        year = period_from[:4] if period_from else ""
        if year:
            annual = supabase.table("bir_forms").select(
                "form_record_id, form_type, entity, period_from, period_to, status, form_code"
            ).eq("form_type", "1702").eq("entity", entity).like(
                "period_from", f"{year}%"
            ).execute().data or []
            for f in annual:
                result["related_forms"].append({
                    "form_record_id": f["form_record_id"],
                    "form_type": f["form_type"],
                    "form_code": f.get("form_code"),
                    "period": f"{f.get('period_from')} to {f.get('period_to')}",
                    "status": f.get("status"),
                    "relationship": "Annual Return",
                    "url": f"/tax/forms/{f['form_type']}/{f['form_record_id']}",
                })

    elif form_type == "1702":
        # Related: quarterly 1702Q forms for same entity+year
        year = period_from[:4] if period_from else ""
        if year:
            quarterly = supabase.table("bir_forms").select(
                "form_record_id, form_type, entity, period_from, period_to, status, form_code"
            ).eq("form_type", "1702Q").eq("entity", entity).like(
                "period_from", f"{year}%"
            ).order("period_from").execute().data or []
            for f in quarterly:
                result["related_forms"].append({
                    "form_record_id": f["form_record_id"],
                    "form_type": f["form_type"],
                    "form_code": f.get("form_code"),
                    "period": f"{f.get('period_from')} to {f.get('period_to')}",
                    "status": f.get("status"),
                    "relationship": "Quarterly Return",
                    "url": f"/tax/forms/{f['form_type']}/{f['form_record_id']}",
                })

    elif form_type == "1604E":
        # All 2307 forms for this entity+year
        year = period_from[:4] if period_from else ""
        if year:
            forms_2307 = supabase.table("bir_forms").select(
                "form_record_id, form_type, entity, period_from, period_to, status, form_code, payee_name"
            ).eq("form_type", "2307").eq("entity", entity).like(
                "period_from", f"{year}%"
            ).order("period_from").execute().data or []
            for f in forms_2307:
                result["related_forms"].append({
                    "form_record_id": f["form_record_id"],
                    "form_type": f["form_type"],
                    "form_code": f.get("form_code"),
                    "period": f"{f.get('period_from')} to {f.get('period_to')}",
                    "status": f.get("status"),
                    "payee_name": f.get("payee_name"),
                    "relationship": "Certificate of Tax Withheld",
                    "url": f"/tax/forms/{f['form_type']}/{f['form_record_id']}",
                })

    elif form_type == "2316":
        # Employee payroll items for the year
        fd = form.get("form_data") or {}
        emp_id = fd.get("employee_id")
        year = period_from[:4] if period_from else ""
        if emp_id and year:
            items = supabase.table("payroll_items").select(
                "item_id, run_id, employee_name, gross_pay, withholding_tax, net_pay, created_at"
            ).eq("employee_id", emp_id).execute().data or []
            # Filter by year from created_at
            for item in items:
                item_year = (item.get("created_at") or "")[:4]
                if item_year == year:
                    result["transactions"].append({
                        "type": "Payroll Item",
                        "id": item["item_id"],
                        "reference": f"Run #{item.get('run_id')} — {item.get('employee_name', '')}",
                        "date": (item.get("created_at") or "")[:10],
                        "amount": float(item.get("gross_pay") or 0),
                        "tax_amount": float(item.get("withholding_tax") or 0),
                        "status": "Processed",
                        "url": f"/payroll",
                    })

    # 0605 has no linked documents

    return result


# ── Amendment Warnings ───────────────────────────────────────────────────────

@router.get("/amendment-warnings")
def get_amendment_warnings(entity: Optional[str] = Query(None), resolved: bool = Query(False)):
    """Get amendment warnings — new transactions that landed in already-filed periods."""
    q = supabase.table("amendment_warnings").select("*").eq("is_resolved", resolved)
    if entity and entity != 'All':
        q = q.eq("entity", entity)
    warnings = q.order("created_at", desc=True).limit(50).execute().data or []
    return warnings


@router.post("/amendment-warnings/{warning_id}/resolve")
def resolve_amendment_warning(warning_id: int, request: Request):
    """Mark an amendment warning as resolved with a note."""
    import json
    _, performed_by = _extract_jwt_claims(request)

    body = {}
    try:
        body = json.loads(request._body.decode()) if hasattr(request, '_body') else {}
    except Exception:
        pass

    # Try to get body from sync read
    if not body:
        from starlette.requests import Request as StarletteRequest
        # fallback: just use empty
        pass

    resolution_note = body.get("resolution_note", "resolved")

    existing = supabase.table("amendment_warnings").select("id").eq("id", warning_id).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail={"error": "Warning not found"})

    supabase.table("amendment_warnings").update({
        "is_resolved": True,
        "resolved_at": datetime.now().isoformat(),
        "resolved_by": performed_by,
        "resolution_note": resolution_note,
    }).eq("id", warning_id).execute()

    return {"success": True, "message": "Warning resolved"}
