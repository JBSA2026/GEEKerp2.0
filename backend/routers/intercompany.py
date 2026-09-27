"""Inter-Company Transaction Automation.

When a PO is sent to an internal supplier (one with `linked_entity` set),
this module auto-generates a DRAFT AR invoice on the seller entity's books.

Flow:
  1. KSI creates PO against GreatnessLab (supplier with linked_entity='GreatnessLab')
  2. PO status → PO_SENT triggers this module
  3. System finds/creates KSI as a client in GreatnessLab's client_list
  4. System creates a DRAFT AR invoice under GreatnessLab with items from the PO
  5. An intercompany_links record ties the PO to the AR invoice

The seller's accountant reviews and confirms the draft AR invoice as normal.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import Request

from database import supabase
from middleware.audit_middleware import _extract_jwt_claims, write_audit_log
from utils.code_generator import generate_code, get_company_code, CODE_TO_ENTITY


# ── Constants ─────────────────────────────────────────────────────────────────

# Maps entity code prefixes to full entity names
ENTITY_CODE_PREFIX = {
    "EXP": "Expedia",
    "GLB": "GreatnessLab",
    "EXG": "Exigent",
    "KSI": "KSI",
}


# ── Internal Helpers ──────────────────────────────────────────────────────────

# Known entity names for auto-detection
_ENTITY_NAMES = {"Expedia", "GreatnessLab", "Exigent", "KSI"}
# Case-insensitive lookup
_ENTITY_NAMES_LOWER = {name.lower(): name for name in _ENTITY_NAMES}


def _is_internal_supplier(supplier_id: int) -> Optional[str]:
    """Check if a supplier is an internal entity.

    Detection order:
      1. If linked_entity is set, use it (explicit override)
      2. If company_name matches a known entity name (case-insensitive), use that

    Returns the entity name or None for external suppliers.
    """
    if not supplier_id:
        return None
    try:
        res = (
            supabase.table("supplier_list")
            .select("company_name, linked_entity")
            .eq("supplier_id", supplier_id)
            .single()
            .execute()
        )
        data = res.data or {}

        # Explicit linked_entity takes priority
        linked = data.get("linked_entity")
        if linked:
            return linked

        # Auto-detect from company_name
        company_name = (data.get("company_name") or "").strip()
        return _ENTITY_NAMES_LOWER.get(company_name.lower())
    except Exception:
        return None


def get_internal_supplier_entity(supplier_id: int) -> Optional[str]:
    """Public internal-supplier lookup shared by purchasing fulfilment flows."""
    return _is_internal_supplier(supplier_id)


def _entity_from_po(po: dict) -> Optional[str]:
    """Derive the buyer entity from a PO (entity field or document number prefix)."""
    entity = po.get("entity")
    if entity:
        return entity
    po_number = po.get("po_number") or ""
    prefix = po_number.split("-")[0] if "-" in po_number else ""
    return CODE_TO_ENTITY.get(prefix)


def _find_or_create_intercompany_client(
    buyer_entity: str,
    seller_entity: str,
) -> int:
    """Find or create the buyer entity as a client in the seller's client_list.

    For example, if KSI buys from GreatnessLab, this ensures KSI exists as a
    client record owned by GreatnessLab.

    Returns:
        client_id of the buyer in the seller's books.
    """
    # Look for existing client with linked_entity matching the buyer
    existing = (
        supabase.table("client_list")
        .select("client_id")
        .eq("linked_entity", buyer_entity)
        .eq("entity", seller_entity)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return existing[0]["client_id"]

    # Also check by company_name match (in case it was created before linked_entity existed)
    by_name = (
        supabase.table("client_list")
        .select("client_id")
        .eq("company_name", buyer_entity)
        .eq("entity", seller_entity)
        .limit(1)
        .execute()
        .data
        or []
    )
    if by_name:
        # Set linked_entity for future lookups
        supabase.table("client_list").update(
            {"linked_entity": buyer_entity}
        ).eq("client_id", by_name[0]["client_id"]).execute()
        return by_name[0]["client_id"]

    # Create new client record for the buyer entity
    customer_code = generate_code(seller_entity, "CUS", "client_list", "customer_code")
    new_client = {
        "company_name": buyer_entity,
        "customer_code": customer_code,
        "customer_type": "Inter-Company",
        "entity": seller_entity,
        "linked_entity": buyer_entity,
        "status": "active",
    }
    res = supabase.table("client_list").insert(new_client).execute()
    if not res.data:
        raise RuntimeError(f"Failed to create inter-company client for {buyer_entity}")
    return res.data[0]["client_id"]


def _po_items(purchase_order_id: int) -> list:
    """Fetch PO line items."""
    res = (
        supabase.table("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", purchase_order_id)
        .execute()
    )
    return res.data or []


def _seller_product_details(
    buyer_entity: str,
    buyer_product_code: Optional[str],
    seller_entity: str,
) -> Optional[dict]:
    """Resolve an optional buyer-to-seller catalog equivalency for AR text."""
    if not buyer_product_code:
        return None
    try:
        mapping = (
            supabase.table("intercompany_product_mappings")
            .select("seller_product_code")
            .eq("buyer_entity", buyer_entity)
            .eq("buyer_product_code", buyer_product_code)
            .eq("seller_entity", seller_entity)
            .eq("is_active", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not mapping:
            return None
        seller_product_code = mapping[0]["seller_product_code"]
        product = (
            supabase.table("product_list")
            .select("product_code, product_name")
            .eq("product_code", seller_product_code)
            .limit(1)
            .execute()
            .data
            or []
        )
        return product[0] if product else {"product_code": seller_product_code}
    except Exception:
        # The inter-company AR draft is still useful before the optional mapping
        # table has been migrated or when no equivalent has been maintained.
        return None


def _existing_ic_invoice(purchase_order_id: int) -> Optional[dict]:
    """Check if an inter-company AR invoice already exists for this PO."""
    link = (
        supabase.table("intercompany_links")
        .select("target_id, target_number")
        .eq("source_type", "purchase_order")
        .eq("source_id", purchase_order_id)
        .eq("status", "ACTIVE")
        .limit(1)
        .execute()
        .data
        or []
    )
    if link:
        return link[0]
    return None


# ── Main Automation ───────────────────────────────────────────────────────────

def create_intercompany_ar_from_po(
    purchase_order_id: int,
    po: dict,
    request: Request,
) -> Optional[dict]:
    """Create a DRAFT AR invoice on the seller's books when a PO is sent to an internal supplier.

    Args:
        purchase_order_id: The PO being sent
        po: The full PO row (must include supplier_id, po_number, entity)
        request: FastAPI request (for audit logging)

    Returns:
        The created AR invoice dict, or None if not an inter-company transaction.
    """
    supplier_id = po.get("supplier_id")
    seller_entity = _is_internal_supplier(supplier_id)
    if not seller_entity:
        return None  # External supplier, nothing to do

    buyer_entity = _entity_from_po(po)
    if not buyer_entity:
        return None  # Can't determine buyer entity

    # Don't create duplicates
    existing = _existing_ic_invoice(purchase_order_id)
    if existing:
        return existing

    _, performed_by = _extract_jwt_claims(request)
    po_number = po.get("po_number")

    # Find or create buyer as a client in seller's books
    client_id = _find_or_create_intercompany_client(buyer_entity, seller_entity)

    # Generate invoice number under the seller's entity
    invoice_number = generate_code(seller_entity, "INV", "ar_invoices", "invoice_number")

    # Build AR invoice header
    today = date.today()
    header = {
        "invoice_number": invoice_number,
        "customer_id": client_id,
        "entity": seller_entity,
        "invoice_date": today.isoformat(),
        "due_date": today.isoformat(),  # Will be adjusted when confirmed
        "source_po_ref": po_number,
        "lifecycle_status": "DRAFT",
        "record_status": "ACTIVE",
        "billing_subtotal": 0,
        "vat_output": 0,
        "wht_amount": 0,
        "collection_status": "UNPAID",
    }

    res = supabase.table("ar_invoices").insert(header).execute()
    if not res.data:
        return None

    invoice_id = res.data[0]["invoice_id"]

    # Map PO items to AR invoice items
    po_items = _po_items(purchase_order_id)
    total_vat_exclusive = 0.0

    for item in po_items:
        qty = float(item.get("quantity") or 0)
        unit_cost = float(item.get("final_unit_cost") or item.get("unit_cost") or 0)
        line_amount = qty * unit_cost
        total_vat_exclusive += line_amount

        seller_product = _seller_product_details(
            buyer_entity,
            item.get("product_code"),
            seller_entity,
        )
        description = item.get("item_description") or item.get("product_code") or "Item"
        if seller_product:
            seller_code = seller_product.get("product_code")
            seller_name = seller_product.get("product_name") or description
            description = f"{seller_code} — {seller_name}"

        invoice_item = {
            "invoice_id": invoice_id,
            "line_type": "MATERIAL",
            "description": description,
            "vat_exclusive_amount": round(line_amount, 2),
            "vat_code": "VAT_OUTPUT",
            "wht_code": "NO_WHT",
        }
        supabase.table("ar_invoice_items").insert(invoice_item).execute()

    # Update invoice totals
    vat_output = round(total_vat_exclusive * 0.12, 2)  # 12% VAT
    supabase.table("ar_invoices").update({
        "billing_subtotal": round(total_vat_exclusive, 2),
        "vat_output": vat_output,
    }).eq("invoice_id", invoice_id).execute()

    # Create the inter-company link
    supabase.table("intercompany_links").insert({
        "buyer_entity": buyer_entity,
        "seller_entity": seller_entity,
        "source_type": "purchase_order",
        "source_id": purchase_order_id,
        "source_number": po_number,
        "target_type": "ar_invoice",
        "target_id": invoice_id,
        "target_number": invoice_number,
    }).execute()

    # Audit trail
    write_audit_log(
        action="INTERCOMPANY_AR_CREATED",
        module_name="Inter-Company",
        description=(
            f"Auto-created DRAFT AR invoice {invoice_number} on {seller_entity}'s books "
            f"from {buyer_entity}'s PO {po_number}"
        ),
        performed_by=performed_by or "System",
        record_id=invoice_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )

    return {
        "invoice_id": invoice_id,
        "invoice_number": invoice_number,
        "seller_entity": seller_entity,
        "buyer_entity": buyer_entity,
        "source_po": po_number,
    }
