from datetime import date, datetime, timedelta, timezone
import os
import re
from typing import List, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from database import supabase
from middleware.audit_middleware import _extract_jwt_claims, write_audit_log
from routers import ap as ap_router
from routers import projects as projects_router
from routers import inventory as inventory_router
from routers.integration_calc import po_billing_eligibility
from routers.intercompany import create_intercompany_ar_from_po, get_internal_supplier_entity
from utils.code_generator import get_company_code, normalize_entity

router = APIRouter(prefix="/purchasing", tags=["purchasing"])

PO_PENDING_STOCK_MARKER = "[PO_PENDING_STOCK]"
# The Philippines is UTC+08:00 year-round and does not observe daylight saving time.
PHILIPPINES_TIMEZONE = timezone(timedelta(hours=8), name="Asia/Manila")
FOREX_RATE_API_URL = "https://api.forexrateapi.com/v1/latest"


def _forex_api_key() -> str:
    """Read the ForexRateAPI key without exposing it to clients or audit records."""
    api_key = os.getenv("FOREX_API", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Forex API is not configured. Set FOREX_API before sending an international PO.",
        )
    return api_key


def _fetch_fx_rate_to_php(from_currency: str) -> tuple[float, str]:
    """Fetch the ForexRateAPI rate for one unit of document currency in PHP."""
    source_currency = (from_currency or "PHP").upper()
    if source_currency == "PHP":
        return 1.0, "SYSTEM"

    api_key = _forex_api_key()
    api_url = os.getenv("FOREX_API_URL", FOREX_RATE_API_URL)
    try:
        response = httpx.get(
            api_url,
            params={"api_key": api_key, "base": source_currency, "currencies": "PHP"},
            timeout=httpx.Timeout(15.0, connect=5.0),
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to retrieve the foreign-exchange rate. The PO was not sent; retry after ForexRateAPI is available.",
        ) from exc

    try:
        rate = float(response.json()["rates"]["PHP"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="ForexRateAPI returned an invalid PHP exchange rate. The PO was not sent.",
        ) from exc
    if rate <= 0:
        raise HTTPException(status_code=502, detail="ForexRateAPI returned a non-positive PHP exchange rate. The PO was not sent.")
    return rate, "ForexRateAPI"


def _transaction_fx_snapshot(po: dict) -> dict:
    """Freeze the Philippine transaction date and PHP conversion rate once per PO."""
    existing_rate = po.get("fx_rate_to_php")
    existing_date = po.get("transaction_date")
    if existing_rate and existing_date:
        return {}

    transaction_at = datetime.now(PHILIPPINES_TIMEZONE)
    rate, provider = _fetch_fx_rate_to_php(po.get("currency_code") or "PHP")
    return {
        "transaction_date": transaction_at.date().isoformat(),
        "fx_rate_to_php": rate,
        "fx_rate_timestamp": transaction_at.isoformat(),
        "fx_rate_provider": provider,
    }


class PurchaseRequestItemPayload(BaseModel):
    product_code: Optional[str] = None
    seller_product_code: Optional[str] = None
    item_description: str
    unit: Optional[str] = None
    quantity: float
    estimated_unit_cost: float = 0


class PurchaseRequestPayload(BaseModel):
    entity: Optional[str] = None
    purchase_source: Literal[
        "LOCAL_PHYSICAL", "LOCAL_DIGITAL", "INTERNATIONAL_PHYSICAL",
        "INTERNATIONAL_DIGITAL", "INTERCOMPANY",
    ] = "LOCAL_PHYSICAL"
    source_supplier_id: Optional[int] = None
    source_seller_entity: Optional[str] = None
    required_date: Optional[date] = None
    warehouse_id: Optional[int] = None
    remarks: Optional[str] = None
    items: List[PurchaseRequestItemPayload]


class PurchaseRequestUpdate(BaseModel):
    entity: Optional[str] = None
    purchase_source: Optional[Literal[
        "LOCAL_PHYSICAL", "LOCAL_DIGITAL", "INTERNATIONAL_PHYSICAL",
        "INTERNATIONAL_DIGITAL", "INTERCOMPANY",
    ]] = None
    source_supplier_id: Optional[int] = None
    source_seller_entity: Optional[str] = None
    required_date: Optional[date] = None
    warehouse_id: Optional[int] = None
    status: Optional[str] = None
    remarks: Optional[str] = None
    items: Optional[List[PurchaseRequestItemPayload]] = None


class RFQPayload(BaseModel):
    due_date: date
    supplier_ids: List[int] = []
    remarks: Optional[str] = None


class SupplierQuoteItemPayload(BaseModel):
    product_code: Optional[str] = None
    item_description: str
    unit: Optional[str] = None
    quantity: float
    unit_cost: float


class SupplierQuotePayload(BaseModel):
    supplier_id: int
    valid_until: date
    delivery_date: date
    payment_terms: Optional[str] = None
    freight: float = 0
    duties: float = 0
    vat_code: Literal["VAT_INPUT", "VAT_EXEMPT"] = "VAT_INPUT"
    other_charges: float = 0
    remarks: Optional[str] = None
    replace_existing: bool = False
    items: List[SupplierQuoteItemPayload]


class POStatusPayload(BaseModel):
    status: str
    remarks: Optional[str] = None


class InternalTransferLinePayload(BaseModel):
    purchase_order_item_id: int
    seller_stock_id: Optional[int] = None
    quantity: float


class InternalTransferPayload(BaseModel):
    items: List[InternalTransferLinePayload]


class ReceiveItemPayload(BaseModel):
    purchase_order_item_id: int
    product_code: Optional[str] = None
    ordered_quantity: float = 0
    received_quantity: float
    unit_cost: float = 0


class ReceivePayload(BaseModel):
    warehouse_id: Optional[int] = None
    remarks: Optional[str] = None
    items: List[ReceiveItemPayload]


def _num(value) -> float:
    return float(value or 0)


def _is_international_purchase_source(purchase_source: Optional[str]) -> bool:
    return (purchase_source or "").startswith("INTERNATIONAL_")


def _supplier_classification_for_purchase_source(purchase_source: Optional[str]) -> str:
    if (purchase_source or "").startswith("LOCAL_"):
        return "LOCAL"
    if _is_international_purchase_source(purchase_source):
        return "INTERNATIONAL"
    raise HTTPException(status_code=422, detail="The purchase request has an invalid standard purchase source.")


def _currency_for_purchase_source(purchase_source: Optional[str]) -> str:
    return "USD" if _is_international_purchase_source(purchase_source) else "PHP"


def _currency_for_supplier(supplier: Optional[dict], fallback: str = "PHP") -> str:
    return "USD" if (supplier or {}).get("supplier_classification") == "INTERNATIONAL" else fallback


def _today_iso() -> str:
    return datetime.now().isoformat()


def _stock_status(quantity_on_hand: float, reorder_level: float) -> str:
    if quantity_on_hand <= 0:
        return "OUT_OF_STOCK"
    if reorder_level > 0 and quantity_on_hand < reorder_level:
        return "LOW_STOCK"
    return "ACTIVE"


def _pending_stock_marker(purchase_order_item_id: int) -> str:
    return f"{PO_PENDING_STOCK_MARKER} PO_ITEM:{purchase_order_item_id}"


def _derive_request_status(current_status: Optional[str], purchase_orders=None) -> str:
    purchase_orders = purchase_orders or []

    # Check billing/payment status on POs to derive AP_PAID / AP_OPEN
    for po in purchase_orders:
        billing = po.get("billing_status") or "NOT_BILLED"
        if billing == "PAID":
            return "AP_PAID"
    for po in purchase_orders:
        billing = po.get("billing_status") or "NOT_BILLED"
        if billing in ("BILLED", "PARTIALLY_BILLED"):
            return "AP_OPEN"

    # Fall back to PO lifecycle status
    po_statuses = [row.get("status") for row in purchase_orders]
    for status in ("RECEIVED", "PARTIALLY_RECEIVED", "PO_SENT", "APPROVED", "SUBMITTED", "PO_CREATED"):
        if status in po_statuses:
            return status
    return current_status or "TO_PURCHASE"


def _require_entity(value: Optional[str], field_name: str = "entity") -> str:
    """Return a canonical entity or reject rather than defaulting to Expedia."""
    entity = normalize_entity(value)
    if not entity:
        raise HTTPException(status_code=422, detail=f"A valid {field_name} is required.")
    return entity


def _validate_product_ownership(items, entity: str) -> None:
    """Ensure every selected catalog product belongs to the PR's entity."""
    def product_code(item) -> str:
        value = item.get("product_code") if isinstance(item, dict) else item.product_code
        return (value or "").strip()

    product_codes = sorted({
        product_code(item)
        for item in items
        if product_code(item)
    })
    if not product_codes:
        return

    rows = (
        supabase.table("product_list")
        .select("product_code, owner_entity")
        .in_("product_code", product_codes)
        .execute()
        .data
        or []
    )
    owners = {row["product_code"]: row.get("owner_entity") for row in rows}
    missing = [code for code in product_codes if code not in owners]
    wrong_owner = [
        code for code in product_codes
        if code in owners and owners[code] != entity
    ]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown product code(s): {', '.join(missing)}. Leave Product blank for a new {entity} item request.",
        )
    if wrong_owner:
        raise HTTPException(
            status_code=422,
            detail=f"Product code(s) do not belong to {entity}: {', '.join(wrong_owner)}. Select a {entity} catalog item or leave Product blank for a new item request.",
        )



def _linked_product_mappings(buyer_entity: str, seller_entity: Optional[str] = None) -> list[dict]:
    """Return active reusable buyer-to-seller links for catalog eligibility."""
    query = (
        supabase.table("intercompany_product_mappings")
        .select("buyer_product_code, seller_entity, seller_product_code")
        .eq("buyer_entity", buyer_entity)
        .eq("is_active", True)
    )
    if seller_entity:
        query = query.eq("seller_entity", seller_entity)
    return query.execute().data or []


def _validate_standard_product_eligibility(items, buyer_entity: str) -> None:
    """Standard PRs cannot reuse buyer products assigned to an internal seller."""
    buyer_codes = sorted({_item_product_code(item) for item in items or [] if _item_product_code(item)})
    if not buyer_codes:
        return
    mappings = _linked_product_mappings(buyer_entity)
    linked_sellers = {}
    for mapping in mappings:
        code = mapping.get("buyer_product_code")
        if code in buyer_codes:
            linked_sellers.setdefault(code, set()).add(mapping.get("seller_entity"))
    if linked_sellers:
        details = ", ".join(
            f"{code} ({'/'.join(sorted(seller for seller in sellers if seller))})"
            for code, sellers in sorted(linked_sellers.items())
        )
        raise HTTPException(
            status_code=422,
            detail=(
                "Buyer product code(s) are linked to an intercompany seller and must be purchased through an "
                f"intercompany PR: {details}. Choose a different standard item or create a new standard item."
            ),
        )


def _validate_internal_product_eligibility(items, buyer_entity: str, seller_entity: str, existing_buyer_codes: set[str]) -> None:
    """Existing buyer items must already be linked to this selected sister company."""
    if not existing_buyer_codes:
        return
    mappings = {
        row.get("buyer_product_code"): row.get("seller_product_code")
        for row in _linked_product_mappings(buyer_entity, seller_entity)
    }
    missing = sorted(code for code in existing_buyer_codes if not mappings.get(code))
    if missing:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Existing buyer product code(s) are not linked to {seller_entity}: {', '.join(missing)}. "
                "For this intercompany PR, select a new buyer item or an item previously received from that sister company."
            ),
        )
    mismatched = sorted(
        _item_product_code(item)
        for item in items or []
        if _item_product_code(item) in existing_buyer_codes
        and (_item_value(item, "seller_product_code") or "").strip() != mappings[_item_product_code(item)]
    )
    if mismatched:
        raise HTTPException(
            status_code=422,
            detail=(
                f"The selected seller stock item does not match the {seller_entity} link for buyer product code(s): "
                f"{', '.join(mismatched)}."
            ),
        )


def _item_product_code(item) -> str:
    value = item.get("product_code") if isinstance(item, dict) else item.product_code
    return (value or "").strip()


def _item_value(item, field: str, default=None):
    return item.get(field, default) if isinstance(item, dict) else getattr(item, field, default)


def _internal_source_supplier(supplier_id: Optional[int], buyer_entity: str) -> tuple[dict, str]:
    if not supplier_id:
        raise HTTPException(status_code=422, detail="Select one sister-company supplier for an intercompany purchase request.")
    supplier = (
        supabase.table("supplier_list")
        .select("supplier_id, company_name, payment_terms, linked_entity")
        .eq("supplier_id", supplier_id)
        .single()
        .execute()
        .data
        or {}
    )
    seller_entity = normalize_entity(supplier.get("linked_entity") or supplier.get("company_name"))
    if not seller_entity:
        raise HTTPException(status_code=422, detail="The selected supplier is not linked to a GEEK entity.")
    if seller_entity == buyer_entity:
        raise HTTPException(status_code=422, detail="An entity cannot buy from itself through an intercompany purchase request.")
    return supplier, seller_entity


def _prepare_purchase_request_items(items, buyer_entity: str, purchase_source: str, seller_entity: Optional[str] = None, supplier_name: Optional[str] = None) -> list[dict]:
    """Validate source-specific catalog eligibility and create immutable PR snapshots."""
    prepared = []
    existing_internal_buyer_codes = set()
    for index, item in enumerate(items or [], start=1):
        row = _normalize_item_row(item)
        existing_buyer_code = row.get("product_code")
        if purchase_source != "INTERCOMPANY":
            row["seller_product_code"] = None
        else:
            seller_product_code = (row.get("seller_product_code") or "").strip()
            if not seller_product_code:
                raise HTTPException(status_code=422, detail=f"Select the {seller_entity} stock item for PR line {index}.")
            seller_product = (
                supabase.table("product_list")
                .select("product_code, owner_entity")
                .eq("product_code", seller_product_code)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not seller_product or seller_product[0].get("owner_entity") != seller_entity:
                raise HTTPException(status_code=422, detail=f"Seller item {seller_product_code} does not belong to {seller_entity}.")
            row["seller_product_code"] = seller_product_code
            if existing_buyer_code:
                existing_internal_buyer_codes.add(existing_buyer_code)

        if not row.get("product_code") and purchase_source == "INTERCOMPANY":
            row["product_code"] = _generate_product_code_for_new_item(row.get("item_description"), index, buyer_entity)
            _ensure_product_master(
                row["product_code"], row.get("item_description"), buyer_entity,
                _num(row.get("estimated_unit_cost")), supplier_name, row.get("unit"),
            )
        prepared.append(row)

    _validate_product_ownership(prepared, buyer_entity)
    if purchase_source == "INTERCOMPANY":
        _validate_internal_product_eligibility(prepared, buyer_entity, seller_entity, existing_internal_buyer_codes)
    else:
        _validate_standard_product_eligibility(prepared, buyer_entity)
    return prepared


def _internal_pr_lines(pr: dict, items, supplier_id: Optional[int] = None) -> dict:
    """Resolve internal lines from immutable snapshots, or legacy reusable mappings."""
    if pr.get("purchase_source") != "INTERCOMPANY":
        return _resolve_internal_supplier_lines(pr.get("entity"), supplier_id, items)

    supplier, seller_entity = _internal_source_supplier(pr.get("source_supplier_id"), _require_entity(pr.get("entity")))
    if supplier_id is not None and int(supplier_id) != int(supplier["supplier_id"]):
        raise HTTPException(status_code=422, detail=f"This intercompany PR is locked to {seller_entity} as its supplier.")

    snapshots = [
        (_item_product_code(item), (_item_value(item, "seller_product_code") or "").strip())
        for item in items or []
    ]
    missing = [str(index + 1) for index, (buyer_code, seller_code) in enumerate(snapshots) if not buyer_code or not seller_code]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"This intercompany PR is missing a buyer or seller item snapshot on line(s): {', '.join(missing)}. Edit the PR and select the seller item again.",
        )

    seller_codes = list(dict.fromkeys(seller_code for _, seller_code in snapshots))
    seller_rows = (
        supabase.table("product_list")
        .select("product_code, product_name, unit, owner_entity")
        .in_("product_code", seller_codes)
        .execute()
        .data
        or []
    )
    products = {row.get("product_code"): row for row in seller_rows}
    invalid_seller_codes = [
        code for code in seller_codes
        if code not in products or products[code].get("owner_entity") != seller_entity
    ]
    if invalid_seller_codes:
        raise HTTPException(
            status_code=422,
            detail=(
                f"The stored seller-item snapshot contains missing or non-{seller_entity} catalog code(s): "
                f"{', '.join(invalid_seller_codes)}. Edit the PR and choose valid {seller_entity} stock items."
            ),
        )

    return {
        "is_internal": True,
        "seller_entity": seller_entity,
        "supplier_id": supplier.get("supplier_id"),
        "lines": [
            {
                "buyer_product_code": buyer_code,
                "buyer_item_description": _item_value(item, "item_description") or buyer_code,
                "buyer_unit": _item_value(item, "unit") or "Nos",
                "seller_product_code": seller_code,
                "seller_product_name": products[seller_code].get("product_name") or seller_code,
                "seller_unit": products[seller_code].get("unit") or "Nos",
            }
            for item, (buyer_code, seller_code) in zip(items or [], snapshots)
        ],
    }


def _resolve_internal_supplier_lines(buyer_entity: str, supplier_id: int, items) -> dict:
    """Resolve and validate the seller equivalents for an internal supplier.

    Purchase documents retain the buyer's product code. This resolver proves that
    every buyer catalog line has an active, seller-owned equivalent before an
    internal quote or PO can be created.
    """
    buyer_entity = _require_entity(buyer_entity, "purchase request entity")
    seller_entity = normalize_entity(get_internal_supplier_entity(supplier_id))
    if not seller_entity:
        return {"is_internal": False, "seller_entity": None, "lines": []}
    if seller_entity == buyer_entity:
        raise HTTPException(
            status_code=422,
            detail=f"{seller_entity} cannot be selected as an internal supplier for its own purchase request.",
        )

    source_items = list(items or [])
    blank_lines = [index + 1 for index, item in enumerate(source_items) if not _item_product_code(item)]
    if blank_lines:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Internal supplier {seller_entity} requires a {buyer_entity} catalog product on every line. "
                f"Line(s) without a buyer product code: {', '.join(map(str, blank_lines))}."
            ),
        )

    buyer_codes = list(dict.fromkeys(_item_product_code(item) for item in source_items))
    mapping_rows = (
        supabase.table("intercompany_product_mappings")
        .select("buyer_product_code, seller_product_code")
        .eq("buyer_entity", buyer_entity)
        .eq("seller_entity", seller_entity)
        .eq("is_active", True)
        .in_("buyer_product_code", buyer_codes)
        .execute()
        .data
        or []
    )
    mappings = {row.get("buyer_product_code"): row.get("seller_product_code") for row in mapping_rows}
    missing_codes = [code for code in buyer_codes if not mappings.get(code)]
    if missing_codes:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Internal supplier {seller_entity} has no active catalog mapping for {buyer_entity} product code(s): "
                f"{', '.join(missing_codes)}. Create buyer-to-seller product mappings before recording the quote."
            ),
        )

    seller_codes = list(dict.fromkeys(mappings[code] for code in buyer_codes))
    seller_rows = (
        supabase.table("product_list")
        .select("product_code, product_name, unit, owner_entity")
        .in_("product_code", seller_codes)
        .execute()
        .data
        or []
    )
    seller_products = {row.get("product_code"): row for row in seller_rows}
    invalid_seller_codes = [
        code for code in seller_codes
        if code not in seller_products or seller_products[code].get("owner_entity") != seller_entity
    ]
    if invalid_seller_codes:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Active mapping(s) for {seller_entity} point to missing or non-{seller_entity} catalog product code(s): "
                f"{', '.join(invalid_seller_codes)}. Correct the product mapping before recording the quote."
            ),
        )

    return {
        "is_internal": True,
        "seller_entity": seller_entity,
        "lines": [
            {
                "buyer_product_code": buyer_code,
                "buyer_item_description": _item_value(item, "item_description") or buyer_code,
                "buyer_unit": _item_value(item, "unit") or "Nos",
                "seller_product_code": mappings[buyer_code],
                "seller_product_name": seller_products[mappings[buyer_code]].get("product_name") or mappings[buyer_code],
                "seller_unit": seller_products[mappings[buyer_code]].get("unit") or "Nos",
            }
            for item in source_items
            for buyer_code in [_item_product_code(item)]
        ],
    }


def _validate_internal_quote_items(pr_items, quote_items, seller_entity: str, require_seller_snapshot: bool = False) -> None:
    """Keep an internal supplier quote tied to exactly the RFQ's buyer/seller snapshots."""
    expected_codes = sorted(_item_product_code(item) for item in pr_items or [])
    submitted_codes = sorted(_item_product_code(item) for item in quote_items or [])
    if expected_codes != submitted_codes:
        raise HTTPException(
            status_code=422,
            detail=(
                f"The quote for internal supplier {seller_entity} must contain exactly the purchase request's "
                f"buyer catalog products. Expected: {', '.join(expected_codes) or 'none'}; "
                f"submitted: {', '.join(submitted_codes) or 'none'}."
            ),
        )
    if require_seller_snapshot:
        expected_sellers = {
            _item_product_code(item): (_item_value(item, "seller_product_code") or "").strip()
            for item in pr_items or []
        }
        invalid_codes = [
            _item_product_code(item)
            for item in quote_items or []
            if (_item_value(item, "seller_product_code") or "").strip() != expected_sellers.get(_item_product_code(item))
        ]
        if invalid_codes:
            raise HTTPException(
                status_code=422,
                detail=(
                    "The quote seller-item snapshot no longer matches its purchase request for buyer product code(s): "
                    f"{', '.join(invalid_codes)}. Recreate the quote from the purchase request."
                ),
            )


def _generate_product_code_for_new_item(description: Optional[str], index: int, entity: str) -> str:
    """Generate an entity-owned COMPANY-YYYY-PRD-NNNN product code.

    If a product with the same description already exists under this entity,
    return its existing code instead of generating a duplicate.
    """
    canonical_entity = _require_entity(entity)

    # Check if a product with the same description already exists for this entity
    if description and description.strip():
        desc_trimmed = description.strip()
        existing_match = (
            supabase.table("product_list")
            .select("product_code")
            .eq("owner_entity", canonical_entity)
            .eq("product_name", desc_trimmed)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not existing_match:
            # Fallback: check product_description field
            existing_match = (
                supabase.table("product_list")
                .select("product_code")
                .eq("owner_entity", canonical_entity)
                .eq("product_description", desc_trimmed)
                .limit(1)
                .execute()
                .data
                or []
            )
        if existing_match:
            return existing_match[0]["product_code"]

    try:
        from utils.code_generator import generate_product_code
        return generate_product_code(canonical_entity)
    except Exception:
        prefix = f"{get_company_code(canonical_entity)}-{datetime.now().year}-PRD-"
        existing = (
            supabase.table("product_list")
            .select("product_code")
            .like("product_code", f"{prefix}%")
            .order("product_code", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        try:
            last_seq = int(existing[0]["product_code"].rsplit("-", 1)[-1]) if existing else 0
        except (ValueError, IndexError):
            last_seq = 0
        return f"{prefix}{last_seq + index:04d}"


def _ensure_product_master(
    product_code: str,
    description: Optional[str],
    owner_entity: str,
    unit_cost: float = 0,
    supplier_name: Optional[str] = None,
    unit: Optional[str] = None,
):
    """Create a missing catalog record under its PR/PO owner's entity."""
    canonical_entity = _require_entity(owner_entity, "product owner entity")
    product_code = (product_code or "").strip()
    if not product_code:
        return None
    existing = (
        supabase.table("product_list")
        .select("product_code, owner_entity")
        .eq("product_code", product_code)
        .limit(1)
        .execute()
    )
    if existing.data:
        actual_owner = existing.data[0].get("owner_entity")
        if actual_owner != canonical_entity:
            raise HTTPException(
                status_code=422,
                detail=f"Product {product_code} belongs to {actual_owner or 'an unresolved legacy catalog'}, not {canonical_entity}.",
            )
        return product_code

    supabase.table("product_list").insert({
        "product_code": product_code,
        "owner_entity": canonical_entity,
        "product_brand": "Unbranded",
        "product_name": description or product_code,
        "product_description": description,
        "quantity": 0,
        "unit": (unit or "Nos").strip() or "Nos",
        "buying_price_vat": unit_cost,
        "selling_price_margin": 0,
        "supplier_name": supplier_name or "Unassigned",
        "created_at": _today_iso(),
        "updated_at": _today_iso(),
    }).execute()
    return product_code


def _employee_id_for_email(email: Optional[str]):
    if not email:
        return None
    res = supabase.table("employees").select("employee_id").eq("email", email).limit(1).execute()
    return res.data[0]["employee_id"] if res.data else None


def _generate_no(table: str, column: str, prefix_code: str, entity: str = None) -> str:
    from utils.code_generator import generate_code
    return generate_code(entity, prefix_code, table, column)


def _quote_base_number(value: Optional[str]) -> str:
    return re.sub(r"-V\d+$", "", str(value or ""), flags=re.IGNORECASE)


def _quote_version(value: Optional[str]) -> int:
    match = re.search(r"-V(\d+)$", str(value or ""), flags=re.IGNORECASE)
    return int(match.group(1)) if match else 1


def _generate_supplier_quote_number(rfq_id: int, supplier_id: int) -> str:
    supplier_quotes = (
        supabase.table("supplier_quotations")
        .select("quotation_number, created_at")
        .eq("rfq_id", rfq_id)
        .eq("supplier_id", supplier_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    if supplier_quotes:
        base_number = _quote_base_number(supplier_quotes[0].get("quotation_number"))
        next_version = max(_quote_version(row.get("quotation_number")) for row in supplier_quotes) + 1
        return f"{base_number}-V{next_version}"

    quote_numbers = (
        supabase.table("supplier_quotations")
        .select("quotation_number")
        .execute()
        .data
        or []
    )
    company = "EXP"
    year = datetime.now().year
    prefix = f"{company}-{year}-SQ-"
    max_seq = 0
    for row in quote_numbers:
        number = _quote_base_number(row.get("quotation_number"))
        match = re.match(r"^[A-Z]{3}-\d{4}-SQ-(\d+)$", number)
        if match:
            max_seq = max(max_seq, int(match.group(1)))
    return f"{prefix}{max_seq + 1:04d}"


def _entity_from_document_number(value: Optional[str]) -> Optional[str]:
    prefix = str(value or "").split("-")[0]
    return {
        "EXP": "Expedia",
        "GLB": "GreatnessLab",
        "EXG": "Exigent",
        "KSI": "KSI",
    }.get(prefix)


def _generate_inventory_product_batch(source_number: str = None, entity: str = None) -> str:
    parts = str(source_number or "").split("-")
    if len(parts) >= 4 and parts[-1].isdigit():
        return f"{parts[0]}-{parts[1]}-PRD-{int(parts[-1]):04d}"

    from utils.code_generator import get_company_code
    company = get_company_code(entity)
    year = datetime.now().year
    prefix = f"{company}-{year}-PRD-"
    rows = supabase.table("product_list").select("product_code").like("product_code", f"{prefix}%").execute().data or []
    max_sequence = 0
    for row in rows:
        code = str(row.get("product_code") or "")
        if not code.startswith(prefix):
            continue
        batch_part = code[len(prefix):].split("-", 1)[0]
        if batch_part.isdigit():
            max_sequence = max(max_sequence, int(batch_part))
    return f"{prefix}{max_sequence + 1:04d}"


def _inventory_product_code(batch_code: str, line_no: int) -> str:
    return f"{batch_code}-{line_no:02d}"


def _allocate_charge(total, weights):
    """Allocate a quotation-level charge across PO lines without losing cents."""
    total = round(_num(total), 2)
    if not weights:
        return []

    weight_total = sum(max(_num(weight), 0) for weight in weights)
    if weight_total <= 0:
        weights = [1 for _ in weights]
        weight_total = len(weights)

    allocations = []
    allocated = 0.0
    for index, weight in enumerate(weights):
        if index == len(weights) - 1:
            share = round(total - allocated, 2)
        else:
            remaining = round(total - allocated, 2)
            share = min(round(total * max(_num(weight), 0) / weight_total, 2), remaining)
            allocated += share
        allocations.append(share)
    return allocations


def _purchase_order_item_rows(
    purchase_order_id: int,
    quote_items,
    supplier_name: Optional[str],
    inventory_batch_code: str,
    quote,
    entity: str,
):
    weights = [
        _num(item.get("quantity")) * _num(item.get("unit_cost"))
        for item in quote_items or []
    ]
    freight_allocations = _allocate_charge(quote.get("freight"), weights)
    duties_allocations = _allocate_charge(quote.get("duties"), weights)
    vat_allocations = _allocate_charge(quote.get("vat_amount"), weights)
    other_allocations = _allocate_charge(quote.get("other_charges"), weights)

    rows = []
    for index, item in enumerate(quote_items or [], start=1):
        item_description = item.get("item_description")
        product_code = (item.get("product_code") or "").strip()
        if not product_code:
            product_code = _generate_product_code_for_new_item(item_description, index, entity)
        _ensure_product_master(
            product_code,
            item_description,
            entity,
            _num(item.get("unit_cost")),
            supplier_name,
            item.get("unit"),
        )
        rows.append({
            "purchase_order_id": purchase_order_id,
            "product_code": product_code,
            "seller_product_code": (item.get("seller_product_code") or "").strip() or None,
            "item_description": item_description,
            "unit": item.get("unit") or "Nos",
            "quantity": item.get("quantity"),
            "final_unit_cost": item.get("unit_cost"),
            "freight": freight_allocations[index - 1],
            "duties": duties_allocations[index - 1],
            "vat_amount": vat_allocations[index - 1],
            "vat_code": quote.get("vat_code") or "VAT_EXEMPT",
            "other_charges": other_allocations[index - 1],
        })
    return rows


INTERNAL_AWAITING_TRANSFER_MARKER = "[INTERNAL_AWAITING_TRANSFER]"
INTERNAL_TRANSFERRED_MARKER = "[INTERNAL_TRANSFERRED]"


def _pending_stock_movement(po_number: str, purchase_order_item_id: int) -> Optional[dict]:
    marker = _pending_stock_marker(purchase_order_item_id)
    rows = (
        supabase.table("inventory_movements")
        .select("*")
        .eq("reference_no", po_number)
        .ilike("remarks", f"%{marker}%")
        .execute()
        .data
        or []
    )
    return next(
        (row for row in rows if "[TRANSFER_RECEIVED]" not in (row.get("remarks") or "")),
        None,
    )


def _seller_product_code(buyer_entity: str, buyer_product_code: str, seller_entity: str) -> Optional[str]:
    """Return the required active seller equivalent; never fall back to buyer stock."""
    if not buyer_product_code:
        return None
    mapped = (
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
    return mapped[0].get("seller_product_code") if mapped else None


def _internal_transfer_context(purchase_order_item_id: int) -> dict:
    order_item = (
        supabase.table("purchase_order_items")
        .select("*")
        .eq("purchase_order_item_id", purchase_order_item_id)
        .single()
        .execute()
    )
    if not order_item.data:
        raise HTTPException(status_code=404, detail="Purchase order item not found")

    po = (
        supabase.table("purchase_orders")
        .select("*")
        .eq("purchase_order_id", order_item.data.get("purchase_order_id"))
        .single()
        .execute()
    )
    if not po.data:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    seller_entity = get_internal_supplier_entity(po.data.get("supplier_id"))
    if not seller_entity:
        raise HTTPException(status_code=400, detail="This purchase order is for a standard supplier and cannot use an internal stock transfer.")
    if po.data.get("status") not in {"SUBMITTED", "APPROVED", "PO_SENT", "PARTIALLY_RECEIVED"}:
        raise HTTPException(status_code=409, detail="The purchase order must be submitted, approved, sent, or partially received before stock can be transferred.")

    pr = (
        supabase.table("purchase_requests")
        .select("entity, warehouse_id")
        .eq("purchase_request_id", po.data.get("purchase_request_id"))
        .single()
        .execute()
    )
    if not pr.data:
        raise HTTPException(status_code=404, detail="Related purchase request not found")
    buyer_entity = _require_entity(pr.data.get("entity"), "purchase request entity")
    pending_movement = _pending_stock_movement(po.data.get("po_number"), purchase_order_item_id)
    if not pending_movement:
        raise HTTPException(status_code=409, detail="No pending stock line exists for this purchase order item.")

    buyer_product_code = (order_item.data.get("product_code") or "").strip()
    stored_seller_code = (order_item.data.get("seller_product_code") or "").strip()
    seller_product_code = stored_seller_code or _seller_product_code(buyer_entity, buyer_product_code, seller_entity)
    if not seller_product_code:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Internal transfer requires a seller-item snapshot or active {buyer_entity} to {seller_entity} product mapping "
                f"for buyer product code {buyer_product_code or '(blank)'}."
            ),
        )
    seller_product = (
        supabase.table("product_list")
        .select("product_code, owner_entity")
        .eq("product_code", seller_product_code)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not seller_product or seller_product[0].get("owner_entity") != seller_entity:
        source = "stored seller-item snapshot" if stored_seller_code else "product mapping"
        raise HTTPException(
            status_code=422,
            detail=f"The {source} points to missing or non-{seller_entity} product code {seller_product_code}.",
        )
    seller_rows = (
        supabase.table("inventory_stock")
        .select("*")
        .eq("product_code", seller_product_code)
        .execute()
        .data
        or []
    )
    source_stocks = [
        {
            **row,
            "available_quantity": max(_num(row.get("quantity_on_hand")) - _num(row.get("reserved_quantity")), 0),
        }
        for row in seller_rows
        if row.get("entity") == seller_entity
    ]
    pending_quantity = _num(pending_movement.get("quantity"))
    remaining_quantity = max(
        _num(order_item.data.get("quantity"))
        - _num(order_item.data.get("received_quantity"))
        - pending_quantity,
        0,
    )
    return {
        "po": po.data,
        "pr": pr.data,
        "order_item": order_item.data,
        "pending_movement": pending_movement,
        "buyer_entity": buyer_entity,
        "seller_entity": seller_entity,
        "buyer_product_code": buyer_product_code,
        "seller_product_code": seller_product_code,
        "source_stocks": source_stocks,
        "pending_quantity": pending_quantity,
        "remaining_quantity": remaining_quantity,
    }


def _transfer_shortage_detail(context: dict, requested_quantity: float, available_quantity: float) -> dict:
    shortage_quantity = max(requested_quantity - available_quantity, 0)
    order_item = context["order_item"]
    return {
        "code": "INSUFFICIENT_STOCK",
        "message": (
            f"{context['seller_entity']} has only {available_quantity:g} available of "
            f"{context['seller_product_code']}; {requested_quantity:g} was requested."
        ),
        "requested_quantity": requested_quantity,
        "available_quantity": available_quantity,
        "shortage_quantity": shortage_quantity,
        "prefill": {
            "prefill_entity": context["buyer_entity"],
            "prefill_warehouse_id": context["pr"].get("warehouse_id"),
            "prefill_remarks": (
                f"Inter-company transfer shortage from {context['seller_entity']} for "
                f"PO {context['po'].get('po_number')}: requested {requested_quantity:g}, "
                f"available {available_quantity:g}."
            ),
            "prefill_items": [{
                "product_code": context["buyer_product_code"],
                "item_description": order_item.get("item_description") or context["buyer_product_code"],
                "unit": order_item.get("unit") or "Nos",
                "quantity": shortage_quantity or requested_quantity,
                "estimated_unit_cost": _num(order_item.get("final_unit_cost")),
            }],
        },
    }


def _stage_purchase_order_pending_stock(purchase_order_id: int, request: Request, performed_by: str) -> int:
    employee_id = _employee_id_for_email(performed_by)
    po = supabase.table("purchase_orders").select("*").eq("purchase_order_id", purchase_order_id).single().execute()
    if not po.data:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    pr = (
        supabase.table("purchase_requests")
        .select("warehouse_id, entity")
        .eq("purchase_request_id", po.data.get("purchase_request_id"))
        .single()
        .execute()
    )
    po_entity = _require_entity(
        po.data.get("entity") or (pr.data or {}).get("entity"),
        "purchase request entity",
    )
    warehouse_id = po.data.get("warehouse_id") or (pr.data or {}).get("warehouse_id")
    if not warehouse_id:
        raise HTTPException(status_code=400, detail="Set a warehouse on the purchase request before staging pending stock")

    supplier = supabase.table("supplier_list").select("company_name").eq("supplier_id", po.data.get("supplier_id")).limit(1).execute()
    supplier_name = supplier.data[0].get("company_name") if supplier.data else None
    seller_entity = get_internal_supplier_entity(po.data.get("supplier_id"))
    order_items = supabase.table("purchase_order_items").select("*").eq("purchase_order_id", purchase_order_id).execute().data or []
    inventory_batch_code = _generate_inventory_product_batch(po.data.get("po_number"))
    staged_count = 0

    for index, order_item in enumerate(order_items, start=1):
        remaining_quantity = max(_num(order_item.get("quantity")) - _num(order_item.get("received_quantity")), 0)
        if remaining_quantity <= 0:
            continue

        product_code = (order_item.get("product_code") or "").strip()
        if not product_code:
            product_code = _generate_product_code_for_new_item(order_item.get("item_description"), index, po_entity)
            supabase.table("purchase_order_items").update({"product_code": product_code}).eq("purchase_order_item_id", order_item["purchase_order_item_id"]).execute()

        _ensure_product_master(
            product_code,
            order_item.get("item_description"),
            po_entity,
            order_item.get("final_unit_cost"),
            supplier_name,
        )

        marker = _pending_stock_marker(order_item["purchase_order_item_id"])
        existing_movements = (
            supabase.table("inventory_movements")
            .select("movement_id, remarks")
            .eq("reference_no", po.data.get("po_number"))
            .ilike("remarks", f"%{marker}%")
            .execute()
            .data
            or []
        )
        existing_pending = [
            movement for movement in existing_movements
            if "[TRANSFER_RECEIVED]" not in (movement.get("remarks") or "")
        ]
        if existing_pending:
            continue

        pending_quantity = 0 if seller_entity else remaining_quantity
        pending_suffix = (
            f" {INTERNAL_AWAITING_TRANSFER_MARKER} Awaiting manual transfer from {seller_entity}"
            if seller_entity
            else " Pending stock from supplier"
        )
        movement_no = f"PEND-{po.data.get('po_number')}-{order_item['purchase_order_item_id']}-{datetime.utcnow().strftime('%H%M%S%f')}"
        inserted = supabase.table("inventory_movements").insert({
            "movement_no": movement_no,
            "movement_type": "STOCK_IN",
            "product_code": product_code,
            "to_warehouse_id": warehouse_id,
            "quantity": pending_quantity,
            "unit_cost": _num(order_item.get("final_unit_cost")),
            "reference_no": po.data.get("po_number"),
            "remarks": f"{marker}{pending_suffix}",
            "created_by_employee_id": employee_id,
        }).execute()
        if not inserted.data:
            raise HTTPException(status_code=400, detail="Unable to create pending stock movement")
        staged_count += 1

    write_audit_log(
        action="CREATE",
        module_name="Purchasing",
        description=f"Staged {staged_count} pending stock line(s) for purchase order {po.data.get('po_number')}",
        performed_by=performed_by,
        record_id=purchase_order_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return staged_count


def _supplier_map():
    rows = supabase.table("supplier_list").select("supplier_id, company_name, payment_terms, supplier_classification").execute().data or []
    return {row["supplier_id"]: row for row in rows}


def _product_map():
    rows = supabase.table("product_list").select("product_code, product_name, product_brand, unit, buying_price_vat").execute().data or []
    return {row["product_code"]: row for row in rows}


def _decorate_items(items, products):
    decorated = []
    for item in items or []:
        product = products.get(item.get("product_code")) or {}
        decorated.append({
            **item,
            "product_name": product.get("product_name"),
            "unit": item.get("unit") or product.get("unit"),
        })
    return decorated


def _normalize_item_row(item: BaseModel) -> dict:
    row = item.model_dump()
    row["product_code"] = (row.get("product_code") or "").strip() or None
    row["seller_product_code"] = (row.get("seller_product_code") or "").strip() or None
    row["item_description"] = (row.get("item_description") or "").strip()
    row["unit"] = (row.get("unit") or "Nos").strip() or "Nos"
    return row


def _quote_total(quote, items):
    item_total = sum(_num(item.get("quotation_amount")) for item in items)
    landing_cost = (
        item_total
        + _num(quote.get("freight"))
        + _num(quote.get("duties"))
        + _num(quote.get("other_charges"))
    )
    vat_amount = _num(quote.get("vat_amount"))
    return {
        "quotation_total": round(item_total, 2),
        "landing_cost": round(landing_cost, 2),
        "vat_amount": round(vat_amount, 2),
        "landed_quote_total": round(landing_cost + vat_amount, 2),
    }


def _get_purchase_request(purchase_request_id: int):
    pr = (
        supabase.table("purchase_requests")
        .select("*")
        .eq("purchase_request_id", purchase_request_id)
        .single()
        .execute()
    )
    if not pr.data:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    suppliers = _supplier_map()
    products = _product_map()

    items = (
        supabase.table("purchase_request_items")
        .select("*")
        .eq("purchase_request_id", purchase_request_id)
        .order("purchase_request_item_id")
        .execute()
        .data
        or []
    )
    rfqs = (
        supabase.table("rfqs")
        .select("*")
        .eq("purchase_request_id", purchase_request_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    rfq_ids = [row["rfq_id"] for row in rfqs]

    rfq_supplier_rows = []
    quotes = []
    if rfq_ids:
        rfq_supplier_rows = (
            supabase.table("rfq_suppliers")
            .select("*")
            .in_("rfq_id", rfq_ids)
            .execute()
            .data
            or []
        )
        quotes = (
            supabase.table("supplier_quotations")
            .select("*")
            .in_("rfq_id", rfq_ids)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )

    quote_ids = [row["supplier_quotation_id"] for row in quotes]
    quote_items = []
    if quote_ids:
        quote_items = (
            supabase.table("supplier_quotation_items")
            .select("*")
            .in_("supplier_quotation_id", quote_ids)
            .execute()
            .data
            or []
        )

    items_by_quote = {}
    for item in quote_items:
        items_by_quote.setdefault(item["supplier_quotation_id"], []).append(item)

    decorated_quotes = []
    currency_code = pr.data.get("currency_code") or _currency_for_purchase_source(pr.data.get("purchase_source"))
    for quote in quotes:
        quote_line_items = _decorate_items(items_by_quote.get(quote["supplier_quotation_id"], []), products)
        totals = _quote_total(quote, quote_line_items)
        decorated_quotes.append({
            **quote,
            "currency_code": quote.get("currency_code") or currency_code,
            "supplier_name": suppliers.get(quote.get("supplier_id"), {}).get("company_name"),
            "items": quote_line_items,
            **totals,
        })
    decorated_quotes.sort(key=lambda row: row["landed_quote_total"])

    rfq_suppliers_by_rfq = {}
    for row in rfq_supplier_rows:
        rfq_suppliers_by_rfq.setdefault(row["rfq_id"], []).append({
            **row,
            "supplier_name": suppliers.get(row.get("supplier_id"), {}).get("company_name"),
        })

    decorated_rfqs = []
    for rfq in rfqs:
        decorated_rfqs.append({
            **rfq,
            "suppliers": rfq_suppliers_by_rfq.get(rfq["rfq_id"], []),
            "quotes": [quote for quote in decorated_quotes if quote["rfq_id"] == rfq["rfq_id"]],
        })

    po_rows = (
        supabase.table("purchase_orders")
        .select("*")
        .eq("purchase_request_id", purchase_request_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    po_ids = [row["purchase_order_id"] for row in po_rows]
    po_items = []
    if po_ids:
        po_items = (
            supabase.table("purchase_order_items")
            .select("*")
            .in_("purchase_order_id", po_ids)
            .execute()
            .data
            or []
        )
    items_by_po = {}
    for item in po_items:
        items_by_po.setdefault(item["purchase_order_id"], []).append(item)

    decorated_pos = []
    for po in po_rows:
        billing_status = po.get("billing_status") or "NOT_BILLED"
        decorated_pos.append({
            **po,
            "currency_code": po.get("currency_code") or currency_code,
            "warehouse_id": pr.data.get("warehouse_id"),
            "supplier_name": suppliers.get(po.get("supplier_id"), {}).get("company_name"),
            "billing_status": billing_status,
            "can_create_draft_bill": po_billing_eligibility(po.get("status")) == "ELIGIBLE",
            "items": _decorate_items(items_by_po.get(po["purchase_order_id"], []), products),
        })

    derived_status = _derive_request_status(pr.data.get("status"), decorated_pos)
    currency_code = pr.data.get("currency_code") or _currency_for_purchase_source(pr.data.get("purchase_source"))

    base_pr_total = sum(_num(item.get("pr_total")) for item in items)
    selected_quote = next((quote for quote in decorated_quotes if quote.get("status") == "SELECTED"), None)
    summary_quote = selected_quote or (decorated_quotes[0] if decorated_quotes else None)

    return {
        **pr.data,
        "currency_code": currency_code,
        "status": derived_status,
        "items": _decorate_items(items, products),
        "rfqs": decorated_rfqs,
        "quotes": decorated_quotes,
        "purchase_orders": decorated_pos,
        "pr_base_total": round(base_pr_total, 2),
        "pr_total": summary_quote["landed_quote_total"] if summary_quote else round(base_pr_total, 2),
    }


def _latest_base_unit_costs_by_entity(entities: list[str]) -> dict[str, dict[str, float]]:
    """Return each catalog's latest eligible PO base cost without landed-cost allocations."""
    entity_list = list(dict.fromkeys(entity for entity in entities if entity))
    if not entity_list:
        return {}

    purchase_orders = (
        supabase.table("purchase_orders")
        .select("purchase_order_id, entity, status, created_at")
        .in_("entity", entity_list)
        .execute()
        .data
        or []
    )
    eligible_orders = [
        order for order in purchase_orders
        if (order.get("status") or "").upper() not in {"DRAFT", "CANCELLED"}
    ]
    if not eligible_orders:
        return {}

    order_rank = {
        order["purchase_order_id"]: (str(order.get("created_at") or ""), int(order["purchase_order_id"]))
        for order in eligible_orders
    }
    order_entities = {
        order["purchase_order_id"]: order.get("entity")
        for order in eligible_orders
    }
    po_items = (
        supabase.table("purchase_order_items")
        .select("purchase_order_id, purchase_order_item_id, product_code, final_unit_cost")
        .in_("purchase_order_id", list(order_rank))
        .execute()
        .data
        or []
    )

    latest_costs: dict[str, dict[str, tuple[tuple[str, int, int], float]]] = {}
    for item in po_items:
        purchase_order_id = item.get("purchase_order_id")
        entity = order_entities.get(purchase_order_id)
        product_code = item.get("product_code")
        if not entity or not product_code or item.get("final_unit_cost") is None:
            continue
        try:
            unit_cost = float(item["final_unit_cost"])
        except (TypeError, ValueError):
            continue
        rank = (*order_rank[purchase_order_id], int(item.get("purchase_order_item_id") or 0))
        current = latest_costs.setdefault(entity, {}).get(product_code)
        if current is None or rank > current[0]:
            latest_costs[entity][product_code] = (rank, unit_cost)

    return {
        entity: {product_code: cost for product_code, (_, cost) in product_costs.items()}
        for entity, product_costs in latest_costs.items()
    }


@router.get("/meta")
def purchasing_meta(entity: str = Query(...), seller_entity: Optional[str] = Query(None)):
    owner_entity = _require_entity(entity)
    requested_seller = _require_entity(seller_entity, "seller entity") if seller_entity else None
    if requested_seller == owner_entity:
        raise HTTPException(status_code=422, detail="An entity cannot be its own intercompany seller.")
    supplier_rows = (
        supabase.table("supplier_list")
        .select("supplier_id, company_name, payment_terms, status, linked_entity, supplier_classification")
        .order("company_name")
        .execute()
        .data
        or []
    )
    standard_suppliers = []
    internal_suppliers = []
    for supplier in supplier_rows:
        supplier_entity = normalize_entity(supplier.get("linked_entity") or supplier.get("company_name"))
        if supplier_entity:
            if supplier_entity != owner_entity:
                internal_suppliers.append({**supplier, "seller_entity": supplier_entity})
        else:
            standard_suppliers.append(supplier)

    latest_costs = _latest_base_unit_costs_by_entity([owner_entity, requested_seller])
    buyer_products = [
        {
            **product,
            "latest_base_unit_cost": latest_costs.get(owner_entity, {}).get(product.get("product_code"), 0),
        }
        for product in (
            supabase.table("product_list")
            .select("product_code, product_name, product_brand, unit, buying_price_vat")
            .eq("owner_entity", owner_entity)
            .order("product_code")
            .execute()
            .data
            or []
        )
    ]
    active_mappings = _linked_product_mappings(owner_entity)
    linked_buyer_codes = {row.get("buyer_product_code") for row in active_mappings}
    standard_products = [product for product in buyer_products if product.get("product_code") not in linked_buyer_codes]
    internal_products = []
    seller_products = []
    if requested_seller:
        mappings_for_seller = {
            row.get("buyer_product_code"): row.get("seller_product_code")
            for row in active_mappings
            if row.get("seller_entity") == requested_seller
        }
        internal_products = [
            {**product, "seller_product_code": mappings_for_seller[product.get("product_code")]}
            for product in buyer_products
            if product.get("product_code") in mappings_for_seller
        ]
        seller_rows = [
            {
                **product,
                "latest_base_unit_cost": latest_costs.get(requested_seller, {}).get(product.get("product_code"), 0),
            }
            for product in (
                supabase.table("product_list")
                .select("product_code, product_name, product_brand, unit, buying_price_vat")
                .eq("owner_entity", requested_seller)
                .order("product_code")
                .execute()
                .data
                or []
            )
        ]
        seller_product_codes = [product.get("product_code") for product in seller_rows if product.get("product_code")]
        stock_rows = (
            supabase.table("inventory_stock")
            .select("product_code, quantity_on_hand, reserved_quantity, entity")
            .in_("product_code", seller_product_codes)
            .execute()
            .data
            or []
        ) if seller_product_codes else []
        availability = {}
        for stock in stock_rows:
            if stock.get("entity") != requested_seller:
                continue
            code = stock.get("product_code")
            availability[code] = availability.get(code, 0) + max(_num(stock.get("quantity_on_hand")) - _num(stock.get("reserved_quantity")), 0)
        seller_products = [{**product, "available_quantity": availability.get(product.get("product_code"), 0)} for product in seller_rows]
    return {
        "products": buyer_products,
        "standard_products": standard_products,
        "internal_products": internal_products,
        "seller_products": seller_products,
        "standard_suppliers": standard_suppliers,
        "internal_suppliers": internal_suppliers,
        "warehouses": supabase.table("warehouses").select("warehouse_id, warehouse_name").order("warehouse_name").execute().data or [],
        "vat_codes": supabase.table("tax_codes").select("code, rate, scope").in_("code", ["VAT_INPUT", "VAT_EXEMPT"]).order("code").execute().data or [],
        "companies": ["Expedia", "GreatnessLab", "Exigent", "KSI"],
    }


@router.get("/summary")
def purchasing_summary():
    requests = supabase.table("purchase_requests").select("status").execute().data or []
    orders = supabase.table("purchase_orders").select("status").execute().data or []
    counts = {"TOTAL": len(requests)}
    for row in requests:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    for row in orders:
        key = f"PO_{row['status']}"
        counts[key] = counts.get(key, 0) + 1
    return counts


@router.get("/requests")
def list_purchase_requests(search: Optional[str] = Query(None), status: Optional[str] = Query(None)):
    req = supabase.table("purchase_requests").select("*").order("created_at", desc=True)
    if search:
        req = req.or_(f"pr_number.ilike.%{search}%,remarks.ilike.%{search}%")
    rows = req.execute().data or []

    request_ids = [row["purchase_request_id"] for row in rows]
    items = []
    orders = []
    rfqs = []
    quotes = []
    quote_items = []
    if request_ids:
        items = supabase.table("purchase_request_items").select("*").in_("purchase_request_id", request_ids).execute().data or []
        orders = supabase.table("purchase_orders").select("purchase_request_id, status").in_("purchase_request_id", request_ids).execute().data or []
        rfqs = supabase.table("rfqs").select("rfq_id, purchase_request_id").in_("purchase_request_id", request_ids).execute().data or []
    rfq_ids = [row["rfq_id"] for row in rfqs]
    if rfq_ids:
        quotes = supabase.table("supplier_quotations").select("*").in_("rfq_id", rfq_ids).execute().data or []
    quote_ids = [row["supplier_quotation_id"] for row in quotes]
    if quote_ids:
        quote_items = supabase.table("supplier_quotation_items").select("supplier_quotation_id, quotation_amount").in_("supplier_quotation_id", quote_ids).execute().data or []

    totals = {}
    line_counts = {}
    orders_by_request = {}
    request_by_rfq = {row["rfq_id"]: row["purchase_request_id"] for row in rfqs}
    quote_items_by_quote = {}
    quote_totals_by_request = {}
    for item in items:
        request_id = item["purchase_request_id"]
        totals[request_id] = totals.get(request_id, 0) + _num(item.get("pr_total"))
        line_counts[request_id] = line_counts.get(request_id, 0) + 1
    for order in orders:
        orders_by_request.setdefault(order["purchase_request_id"], []).append(order)
    for item in quote_items:
        quote_items_by_quote.setdefault(item["supplier_quotation_id"], []).append(item)
    for quote in quotes:
        request_id = request_by_rfq.get(quote.get("rfq_id"))
        if request_id is None:
            continue
        quote_totals_by_request.setdefault(request_id, []).append({
            **quote,
            **_quote_total(quote, quote_items_by_quote.get(quote["supplier_quotation_id"], [])),
        })

    def request_total(request_id):
        request_quotes = quote_totals_by_request.get(request_id, [])
        selected = next((quote for quote in request_quotes if quote.get("status") == "SELECTED"), None)
        summary_quote = selected or (min(request_quotes, key=lambda quote: quote["landed_quote_total"]) if request_quotes else None)
        return summary_quote["landed_quote_total"] if summary_quote else totals.get(request_id, 0)

    result = [
        {
            **row,
            "status": _derive_request_status(row.get("status"), orders_by_request.get(row["purchase_request_id"], [])),
            "pr_base_total": round(totals.get(row["purchase_request_id"], 0), 2),
            "pr_total": round(request_total(row["purchase_request_id"]), 2),
            "line_count": line_counts.get(row["purchase_request_id"], 0),
        }
        for row in rows
    ]
    if status and status != "All":
        result = [row for row in result if row.get("status") == status]
    return result


@router.get("/requests/{purchase_request_id}")
def get_purchase_request(purchase_request_id: int):
    return _get_purchase_request(purchase_request_id)


@router.post("/requests", status_code=201)
def create_purchase_request(request: Request, payload: PurchaseRequestPayload):
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)

    entity = _require_entity(payload.entity)
    purchase_source = payload.purchase_source
    supplier = None
    seller_entity = None
    if purchase_source == "INTERCOMPANY":
        supplier, seller_entity = _internal_source_supplier(payload.source_supplier_id, entity)
    prepared_items = _prepare_purchase_request_items(
        payload.items, entity, purchase_source, seller_entity,
        supplier.get("company_name") if supplier else None,
    )
    pr_number = _generate_no("purchase_requests", "pr_number", "PR", entity)

    header = {
        "pr_number": pr_number,
        "requested_by_employee_id": employee_id,
        "required_date": payload.required_date.isoformat() if payload.required_date else None,
        "warehouse_id": payload.warehouse_id,
        "status": "TO_PURCHASE",
        "remarks": payload.remarks,
        "entity": entity,
        "purchase_source": purchase_source,
        "currency_code": _currency_for_purchase_source(purchase_source),
        "source_supplier_id": supplier.get("supplier_id") if supplier else None,
        "source_seller_entity": seller_entity,
    }
    res = supabase.table("purchase_requests").insert(header).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create purchase request")

    purchase_request_id = res.data[0]["purchase_request_id"]
    for row in prepared_items:
        row["purchase_request_id"] = purchase_request_id
    if prepared_items:
        supabase.table("purchase_request_items").insert(prepared_items).execute()

    write_audit_log(
        action="CREATE",
        module_name="Purchasing",
        description=f"Created purchase request {pr_number}",
        performed_by=performed_by,
        record_id=purchase_request_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_purchase_request(purchase_request_id)


@router.patch("/requests/{purchase_request_id}")
def update_purchase_request(purchase_request_id: int, request: Request, payload: PurchaseRequestUpdate):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("purchase_requests").select("*").eq("purchase_request_id", purchase_request_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    updates = payload.model_dump(exclude_unset=True, exclude={"items"})
    requested_purchase_source = updates.get("purchase_source", existing.data.get("purchase_source") or "LOCAL_PHYSICAL")
    requested_supplier_id = updates.get("source_supplier_id", existing.data.get("source_supplier_id"))
    source_fields_changed = (
        requested_purchase_source != (existing.data.get("purchase_source") or "LOCAL_PHYSICAL")
        or requested_supplier_id != existing.data.get("source_supplier_id")
    )
    if payload.items is not None or source_fields_changed:
        has_rfq = supabase.table("rfqs").select("rfq_id").eq("purchase_request_id", purchase_request_id).limit(1).execute().data or []
        if has_rfq:
            raise HTTPException(status_code=409, detail="The purchase source and item snapshots cannot change after an RFQ exists.")

    if "entity" in updates:
        updates["entity"] = _require_entity(updates["entity"])
    if "required_date" in updates and updates["required_date"]:
        updates["required_date"] = updates["required_date"].isoformat()
    target_entity = _require_entity(updates.get("entity") or existing.data.get("entity"), "purchase request entity")
    purchase_source = updates.get("purchase_source") or existing.data.get("purchase_source") or "LOCAL_PHYSICAL"
    supplier = None
    seller_entity = None
    if purchase_source == "INTERCOMPANY":
        supplier_id = updates.get("source_supplier_id", existing.data.get("source_supplier_id"))
        supplier, seller_entity = _internal_source_supplier(supplier_id, target_entity)
    updates["purchase_source"] = purchase_source
    updates["currency_code"] = _currency_for_purchase_source(purchase_source)
    updates["source_supplier_id"] = supplier.get("supplier_id") if supplier else None
    updates["source_seller_entity"] = seller_entity

    source_items = payload.items
    if source_items is None and (source_fields_changed or "entity" in updates):
        source_items = (
            supabase.table("purchase_request_items").select("*")
            .eq("purchase_request_id", purchase_request_id).order("purchase_request_item_id").execute().data or []
        )
    prepared_items = _prepare_purchase_request_items(
        source_items, target_entity, purchase_source, seller_entity,
        supplier.get("company_name") if supplier else None,
    ) if source_items is not None else None

    updates["updated_at"] = _today_iso()
    supabase.table("purchase_requests").update(updates).eq("purchase_request_id", purchase_request_id).execute()
    if prepared_items is not None:
        supabase.table("purchase_request_items").delete().eq("purchase_request_id", purchase_request_id).execute()
        for row in prepared_items:
            row["purchase_request_id"] = purchase_request_id
        if prepared_items:
            supabase.table("purchase_request_items").insert(prepared_items).execute()

    write_audit_log(
        action="UPDATE",
        module_name="Purchasing",
        description=f"Updated purchase request {existing.data.get('pr_number')}",
        performed_by=performed_by,
        record_id=purchase_request_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_purchase_request(purchase_request_id)


@router.delete("/requests/{purchase_request_id}", status_code=204)
def delete_purchase_request(purchase_request_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("purchase_requests").select("*").eq("purchase_request_id", purchase_request_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    rfqs = supabase.table("rfqs").select("rfq_id").eq("purchase_request_id", purchase_request_id).execute().data or []
    rfq_ids = [row["rfq_id"] for row in rfqs]

    quotes = []
    if rfq_ids:
        quotes = supabase.table("supplier_quotations").select("supplier_quotation_id").in_("rfq_id", rfq_ids).execute().data or []
    quote_ids = [row["supplier_quotation_id"] for row in quotes]

    pos = supabase.table("purchase_orders").select("purchase_order_id").eq("purchase_request_id", purchase_request_id).execute().data or []
    po_ids = [row["purchase_order_id"] for row in pos]

    receipt_ids = []
    if po_ids:
        receipts = supabase.table("goods_receipts").select("goods_receipt_id").in_("purchase_order_id", po_ids).execute().data or []
        receipt_ids = [row["goods_receipt_id"] for row in receipts]

    if receipt_ids:
        supabase.table("goods_receipt_items").delete().in_("goods_receipt_id", receipt_ids).execute()
    if po_ids:
        supabase.table("goods_receipts").delete().in_("purchase_order_id", po_ids).execute()
        supabase.table("purchase_order_approvals").delete().in_("purchase_order_id", po_ids).execute()
        supabase.table("purchase_order_items").delete().in_("purchase_order_id", po_ids).execute()
        supabase.table("purchase_orders").delete().in_("purchase_order_id", po_ids).execute()
    if quote_ids:
        supabase.table("supplier_quotation_items").delete().in_("supplier_quotation_id", quote_ids).execute()
    if rfq_ids:
        supabase.table("supplier_quotations").delete().in_("rfq_id", rfq_ids).execute()
        supabase.table("rfq_suppliers").delete().in_("rfq_id", rfq_ids).execute()
        supabase.table("rfqs").delete().in_("rfq_id", rfq_ids).execute()

    supabase.table("purchase_request_items").delete().eq("purchase_request_id", purchase_request_id).execute()
    supabase.table("purchase_requests").delete().eq("purchase_request_id", purchase_request_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="Purchasing",
        description=f"Deleted purchase request {existing.data.get('pr_number')}",
        performed_by=performed_by,
        record_id=purchase_request_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None


@router.post("/requests/{purchase_request_id}/rfq", status_code=201)
def create_rfq(purchase_request_id: int, request: Request, payload: RFQPayload):
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)
    pr = supabase.table("purchase_requests").select("*").eq("purchase_request_id", purchase_request_id).single().execute()
    if not pr.data:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    if pr.data.get("purchase_source") == "INTERCOMPANY":
        supplier, seller_entity = _internal_source_supplier(pr.data.get("source_supplier_id"), _require_entity(pr.data.get("entity")))
        if payload.supplier_ids and set(payload.supplier_ids) != {supplier["supplier_id"]}:
            raise HTTPException(status_code=422, detail=f"This intercompany PR is locked to {seller_entity} as its supplier.")
        supplier_ids = [supplier["supplier_id"]]
    else:
        purchase_source = pr.data.get("purchase_source") or "LOCAL_PHYSICAL"
        supplier_classification = _supplier_classification_for_purchase_source(purchase_source)
        supplier_ids = payload.supplier_ids
        if not supplier_ids:
            raise HTTPException(status_code=422, detail="Select at least one supplier before creating an RFQ.")
        if len(set(supplier_ids)) != len(supplier_ids):
            raise HTTPException(status_code=422, detail="Each supplier can be invited to an RFQ only once.")

        supplier_records = (
            supabase.table("supplier_list")
            .select("supplier_id, company_name, status, supplier_classification, linked_entity")
            .in_("supplier_id", supplier_ids)
            .execute()
            .data
            or []
        )
        suppliers_by_id = {supplier["supplier_id"]: supplier for supplier in supplier_records}
        missing_ids = sorted(set(supplier_ids) - set(suppliers_by_id))
        if missing_ids:
            raise HTTPException(
                status_code=422,
                detail=f"Supplier ID(s) not found: {', '.join(map(str, missing_ids))}.",
            )

        inactive_suppliers = [
            supplier for supplier in supplier_records
            if (supplier.get("status") or "").lower() != "active"
        ]
        if inactive_suppliers:
            names = ", ".join(
                f"{supplier.get('company_name') or supplier['supplier_id']} (ID {supplier['supplier_id']})"
                for supplier in inactive_suppliers
            )
            raise HTTPException(status_code=422, detail=f"RFQ suppliers must be active: {names}.")

        mismatched_suppliers = [
            supplier for supplier in supplier_records
            if supplier.get("supplier_classification") != supplier_classification
            or normalize_entity(supplier.get("linked_entity") or supplier.get("company_name"))
        ]
        if mismatched_suppliers:
            names = ", ".join(
                f"{supplier.get('company_name') or supplier['supplier_id']} (ID {supplier['supplier_id']}, "
                f"{supplier.get('supplier_classification') or 'unclassified'})"
                for supplier in mismatched_suppliers
            )
            raise HTTPException(
                status_code=422,
                detail=f"RFQ suppliers must be active standard {purchase_source.lower().replace('_', ' ')} suppliers: {names}.",
            )

    rfq_number = _generate_no("rfqs", "rfq_number", "RFQ")
    rfq = {
        "rfq_number": rfq_number,
        "purchase_request_id": purchase_request_id,
        "due_date": payload.due_date.isoformat() if payload.due_date else None,
        "prepared_by_employee_id": employee_id,
        "status": "RFQ_SENT",
        "remarks": payload.remarks,
    }
    res = supabase.table("rfqs").insert(rfq).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create RFQ")
    rfq_id = res.data[0]["rfq_id"]

    supplier_rows = [{"rfq_id": rfq_id, "supplier_id": supplier_id, "sent_at": _today_iso(), "email_status": "SENT"} for supplier_id in supplier_ids]
    if supplier_rows:
        supabase.table("rfq_suppliers").insert(supplier_rows).execute()

    supabase.table("purchase_requests").update({"status": "RFQ_SENT", "updated_at": _today_iso()}).eq("purchase_request_id", purchase_request_id).execute()

    write_audit_log(
        action="CREATE",
        module_name="Purchasing",
        description=f"Created RFQ {rfq_number} for {pr.data.get('pr_number')}",
        performed_by=performed_by,
        record_id=rfq_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_purchase_request(purchase_request_id)


def _get_rfq_supplier_context(rfq_id: int, supplier_id: int) -> tuple[dict, dict, list]:
    rfq = supabase.table("rfqs").select("*").eq("rfq_id", rfq_id).single().execute()
    if not rfq.data:
        raise HTTPException(status_code=404, detail="RFQ not found")

    invited = (
        supabase.table("rfq_suppliers")
        .select("supplier_id")
        .eq("rfq_id", rfq_id)
        .eq("supplier_id", supplier_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not invited:
        raise HTTPException(status_code=422, detail="The selected supplier was not invited to this RFQ.")

    pr = (
        supabase.table("purchase_requests")
        .select("purchase_request_id, entity, purchase_source, source_supplier_id, source_seller_entity")
        .eq("purchase_request_id", rfq.data["purchase_request_id"])
        .single()
        .execute()
    )
    if not pr.data:
        raise HTTPException(status_code=404, detail="Purchase request not found")
    pr_items = (
        supabase.table("purchase_request_items")
        .select("product_code, seller_product_code, item_description, unit, quantity")
        .eq("purchase_request_id", pr.data["purchase_request_id"])
        .order("purchase_request_item_id")
        .execute()
        .data
        or []
    )
    return rfq.data, pr.data, pr_items


@router.get("/rfqs/{rfq_id}/supplier-lines")
def get_supplier_quote_lines(rfq_id: int, supplier_id: int = Query(...)):
    """Return an internal supplier's resolved catalog lines for a quote drawer."""
    _, pr, pr_items = _get_rfq_supplier_context(rfq_id, supplier_id)
    return _internal_pr_lines(pr, pr_items, supplier_id)


@router.post("/rfqs/{rfq_id}/quotes", status_code=201)
def create_supplier_quote(rfq_id: int, request: Request, payload: SupplierQuotePayload):
    _, performed_by = _extract_jwt_claims(request)
    rfq, pr, pr_items = _get_rfq_supplier_context(rfq_id, payload.supplier_id)
    supplier = _supplier_map().get(payload.supplier_id)
    if not supplier:
        raise HTTPException(status_code=422, detail="Supplier not found.")
    purchase_source = pr.get("purchase_source") or "LOCAL_PHYSICAL"
    supplier_classification = None if purchase_source == "INTERCOMPANY" else _supplier_classification_for_purchase_source(purchase_source)
    if supplier_classification and supplier.get("supplier_classification") != supplier_classification:
        raise HTTPException(
            status_code=422,
            detail=f"The selected supplier is not classified for {purchase_source.lower().replace('_', ' ')} purchases.",
        )
    currency_code = "PHP" if purchase_source == "INTERCOMPANY" else _currency_for_supplier(
        supplier, _currency_for_purchase_source(purchase_source)
    )
    internal_lines = _internal_pr_lines(pr, pr_items, payload.supplier_id)
    if internal_lines["is_internal"]:
        _validate_internal_quote_items(pr_items, payload.items, internal_lines["seller_entity"])

    # If a quote already exists for this supplier+RFQ, remove it first (replace)
    existing_quote = (
        supabase.table("supplier_quotations")
        .select("supplier_quotation_id")
        .eq("rfq_id", rfq_id)
        .eq("supplier_id", payload.supplier_id)
        .execute()
        .data
        or []
    )
    if existing_quote:
        old_id = existing_quote[0]["supplier_quotation_id"]
        supabase.table("supplier_quotation_items").delete().eq("supplier_quotation_id", old_id).execute()
        supabase.table("supplier_quotations").delete().eq("supplier_quotation_id", old_id).execute()

    tax_codes = (
        supabase.table("tax_codes")
        .select("code, rate, scope")
        .eq("code", payload.vat_code)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not tax_codes or tax_codes[0].get("scope") not in ("AP", "BOTH"):
        raise HTTPException(status_code=400, detail=f"VAT code '{payload.vat_code}' is not configured for AP.")

    item_total = sum(_num(item.quantity) * _num(item.unit_cost) for item in payload.items)
    vat_base = item_total + _num(payload.freight) + _num(payload.duties) + _num(payload.other_charges)
    vat_amount = round(vat_base * _num(tax_codes[0].get("rate")), 2)

    quotation_number = _generate_supplier_quote_number(rfq_id, payload.supplier_id)
    quote = payload.model_dump(exclude={"items", "replace_existing"})
    quote.update({
        "quotation_number": quotation_number,
        "rfq_id": rfq_id,
        "currency_code": currency_code,
        "vat_amount": vat_amount,
        "valid_until": payload.valid_until.isoformat() if payload.valid_until else None,
        "delivery_date": payload.delivery_date.isoformat() if payload.delivery_date else None,
        "status": "RECEIVED",
    })
    try:
        res = supabase.table("supplier_quotations").insert(quote).execute()
    except Exception as exc:
        error = exc.args[0] if getattr(exc, "args", None) and isinstance(exc.args[0], dict) else {}
        if error.get("code") == "23505" or getattr(exc, "code", None) == "23505":
            raise HTTPException(
                status_code=409,
                detail="A quote version was created at the same time. Refresh the request and save your quote again.",
            ) from exc
        raise
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create supplier quotation")

    supplier_quotation_id = res.data[0]["supplier_quotation_id"]
    seller_codes = {line["buyer_product_code"]: line["seller_product_code"] for line in internal_lines.get("lines", [])}
    rows = []
    for item in payload.items:
        row = _normalize_item_row(item)
        row["seller_product_code"] = seller_codes.get(row.get("product_code"))
        row["supplier_quotation_id"] = supplier_quotation_id
        rows.append(row)
    if rows:
        supabase.table("supplier_quotation_items").insert(rows).execute()

    supabase.table("rfqs").update({"status": "QUOTE_RECEIVED", "updated_at": _today_iso()}).eq("rfq_id", rfq_id).execute()
    supabase.table("purchase_requests").update({"status": "QUOTE_RECEIVED", "updated_at": _today_iso()}).eq("purchase_request_id", rfq["purchase_request_id"]).execute()

    write_audit_log(
        action="CREATE",
        module_name="Purchasing",
        description=f"Added supplier quote {quotation_number}",
        performed_by=performed_by,
        record_id=supplier_quotation_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_purchase_request(rfq["purchase_request_id"])


@router.post("/quotes/{supplier_quotation_id}/select")
def select_supplier_quote(supplier_quotation_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    quote = supabase.table("supplier_quotations").select("*").eq("supplier_quotation_id", supplier_quotation_id).single().execute()
    if not quote.data:
        raise HTTPException(status_code=404, detail="Supplier quotation not found")

    rfq_id = quote.data["rfq_id"]
    rfq = supabase.table("rfqs").select("*").eq("rfq_id", rfq_id).single().execute()
    if not rfq.data:
        raise HTTPException(status_code=404, detail="RFQ not found")

    supabase.table("supplier_quotations").update({"status": "REJECTED", "updated_at": _today_iso()}).eq("rfq_id", rfq_id).execute()
    supabase.table("supplier_quotations").update({"status": "SELECTED", "updated_at": _today_iso()}).eq("supplier_quotation_id", supplier_quotation_id).execute()
    supabase.table("rfqs").update({"status": "CLOSED", "updated_at": _today_iso()}).eq("rfq_id", rfq_id).execute()
    supabase.table("purchase_requests").update({"status": "COMPARISON_DONE", "updated_at": _today_iso()}).eq("purchase_request_id", rfq.data["purchase_request_id"]).execute()

    return _get_purchase_request(rfq.data["purchase_request_id"])


@router.get("/purchase-orders")
def list_purchase_orders(search: Optional[str] = Query(None), status: Optional[str] = Query(None)):
    """List all purchase orders with supplier info and totals."""
    req = supabase.table("purchase_orders").select("*").order("created_at", desc=True)
    rows = req.execute().data or []

    if search:
        rows = [
            row for row in rows
            if search.lower() in (row.get("po_number") or "").lower()
            or search.lower() in (row.get("supplier_name") or "").lower()
        ]
    if status and status != "All":
        rows = [row for row in rows if row.get("status") == status]

    po_ids = [row["purchase_order_id"] for row in rows]
    items = []
    if po_ids:
        items = supabase.table("purchase_order_items").select("*").in_("purchase_order_id", po_ids).execute().data or []

    totals = {}
    item_cost_totals = {}
    line_counts = {}
    for item in items:
        po_id = item["purchase_order_id"]
        item_cost = _num(item.get("po_total"))
        landed_cost = item.get("landed_cost")
        item_cost_totals[po_id] = item_cost_totals.get(po_id, 0) + item_cost
        totals[po_id] = totals.get(po_id, 0) + _num(landed_cost if landed_cost is not None else item_cost)
        line_counts[po_id] = line_counts.get(po_id, 0) + 1

    return [
        {
            **row,
            "item_cost_total": round(item_cost_totals.get(row["purchase_order_id"], 0), 2),
            "po_total": round(totals.get(row["purchase_order_id"], 0), 2),
            "line_count": line_counts.get(row["purchase_order_id"], 0),
        }
        for row in rows
    ]


@router.post("/quotes/{supplier_quotation_id}/purchase-order", status_code=201)
def generate_purchase_order(supplier_quotation_id: int, request: Request, force: bool = Query(False)):
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)
    quote = supabase.table("supplier_quotations").select("*").eq("supplier_quotation_id", supplier_quotation_id).single().execute()
    if not quote.data:
        raise HTTPException(status_code=404, detail="Supplier quotation not found")

    rfq = supabase.table("rfqs").select("*").eq("rfq_id", quote.data["rfq_id"]).single().execute()
    if not rfq.data:
        raise HTTPException(status_code=404, detail="RFQ not found")

    pr = (
        supabase.table("purchase_requests")
        .select("pr_number, entity, purchase_source, source_supplier_id, source_seller_entity")
        .eq("purchase_request_id", rfq.data["purchase_request_id"])
        .limit(1)
        .execute()
    )
    pr_entity = _require_entity(
        pr.data[0].get("entity") if pr.data else None,
        "purchase request entity",
    )
    purchase_source = pr.data[0].get("purchase_source") or "LOCAL_PHYSICAL"
    quote_supplier = _supplier_map().get(quote.data.get("supplier_id"), {})
    currency_code = quote.data.get("currency_code") or (
        "PHP" if purchase_source == "INTERCOMPANY" else _currency_for_supplier(
            quote_supplier, _currency_for_purchase_source(purchase_source)
        )
    )

    quote_items = supabase.table("supplier_quotation_items").select("*").eq("supplier_quotation_id", supplier_quotation_id).execute().data or []
    pr_items = (
        supabase.table("purchase_request_items")
        .select("product_code, seller_product_code, item_description, unit, quantity")
        .eq("purchase_request_id", rfq.data["purchase_request_id"])
        .order("purchase_request_item_id")
        .execute()
        .data
        or []
    )
    internal_lines = _internal_pr_lines(pr.data[0], pr_items, quote.data.get("supplier_id"))
    if internal_lines["is_internal"]:
        _validate_internal_quote_items(
            pr_items,
            quote_items,
            internal_lines["seller_entity"],
            require_seller_snapshot=pr.data[0].get("purchase_source") == "INTERCOMPANY",
        )

    # Prevent duplicate POs for the same PR items, while retaining idempotency
    # when this exact supplier quote already has a PO.
    if not force and quote_items:
        new_product_codes = {
            (item.get("product_code") or "").strip()
            for item in quote_items
            if (item.get("product_code") or "").strip()
        }
        if new_product_codes:
            existing_pos = (
                supabase.table("purchase_orders")
                .select("purchase_order_id, po_number, status, supplier_quotation_id")
                .eq("purchase_request_id", rfq.data["purchase_request_id"])
                .execute()
                .data
                or []
            )
            skip_statuses = ("DRAFT", "CANCELLED")
            active_pos = [
                po for po in existing_pos
                if (po.get("status") or "").upper() not in skip_statuses
                and po.get("supplier_quotation_id") != supplier_quotation_id
            ]
            if active_pos:
                active_po_ids = [po["purchase_order_id"] for po in active_pos]
                existing_po_items = (
                    supabase.table("purchase_order_items")
                    .select("purchase_order_id, product_code")
                    .in_("purchase_order_id", active_po_ids)
                    .execute()
                    .data
                    or []
                )
                for po in active_pos:
                    po_product_codes = {
                        (item.get("product_code") or "").strip()
                        for item in existing_po_items
                        if item["purchase_order_id"] == po["purchase_order_id"]
                        and (item.get("product_code") or "").strip()
                    }
                    overlap = new_product_codes & po_product_codes
                    if overlap:
                        raise HTTPException(
                            status_code=409,
                            detail={
                                "error": f"A purchase order ({po['po_number']}) for these items has already been submitted. Create a new one anyway?",
                                "existing_po_number": po["po_number"],
                                "overlapping_items": sorted(overlap),
                                "requires_force": True,
                            },
                        )

    supplier_name = _supplier_map().get(quote.data.get("supplier_id"), {}).get("company_name")
    existing_po = (
        supabase.table("purchase_orders")
        .select("*")
        .eq("supplier_quotation_id", supplier_quotation_id)
        .order("created_at")
        .limit(1)
        .execute()
    )
    if existing_po.data:
        purchase_order = existing_po.data[0]
        purchase_order_id = purchase_order["purchase_order_id"]
        if purchase_order.get("status") == "DRAFT":
            supabase.table("purchase_orders").update({"status": "SUBMITTED", "updated_at": _today_iso()}).eq("purchase_order_id", purchase_order_id).execute()
        existing_items = supabase.table("purchase_order_items").select("purchase_order_item_id").eq("purchase_order_id", purchase_order_id).execute().data or []
        if not existing_items and quote_items:
            inventory_batch_code = _generate_inventory_product_batch(purchase_order.get("po_number"))
            rows = _purchase_order_item_rows(
                purchase_order_id,
                quote_items,
                supplier_name,
                inventory_batch_code,
                quote.data,
                purchase_order.get("entity") or pr_entity,
            )
            supabase.table("purchase_order_items").insert(rows).execute()

        supabase.table("purchase_requests").update({"status": "PO_CREATED", "updated_at": _today_iso()}).eq("purchase_request_id", rfq.data["purchase_request_id"]).execute()
        return _get_purchase_request(rfq.data["purchase_request_id"])

    po_number = _generate_no("purchase_orders", "po_number", "PO", pr_entity)
    po = {
        "po_number": po_number,
        "purchase_request_id": rfq.data["purchase_request_id"],
        "rfq_id": quote.data["rfq_id"],
        "supplier_quotation_id": supplier_quotation_id,
        "supplier_id": quote.data["supplier_id"],
        "currency_code": currency_code,
        "entity": pr_entity,
        "delivery_date": quote.data.get("delivery_date"),
        "payment_terms": quote.data.get("payment_terms"),
        "requested_by_employee_id": employee_id,
        "status": "SUBMITTED",
        "remarks": quote.data.get("remarks"),
    }
    res = supabase.table("purchase_orders").insert(po).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create purchase order")
    purchase_order_id = res.data[0]["purchase_order_id"]

    inventory_batch_code = _generate_inventory_product_batch(po_number)
    rows = _purchase_order_item_rows(
        purchase_order_id,
        quote_items,
        supplier_name,
        inventory_batch_code,
        quote.data,
        pr_entity,
    )
    if rows:
        supabase.table("purchase_order_items").insert(rows).execute()

    # Internal POs appear in Pending Stock immediately, but begin with zero
    # receivable quantity until the seller explicitly transfers stock.
    if get_internal_supplier_entity(po.get("supplier_id")):
        _stage_purchase_order_pending_stock(purchase_order_id, request, performed_by)

    supabase.table("purchase_requests").update({"status": "PO_CREATED", "updated_at": _today_iso()}).eq("purchase_request_id", rfq.data["purchase_request_id"]).execute()

    write_audit_log(
        action="CREATE",
        module_name="Purchasing",
        description=f"Generated purchase order {po_number}",
        performed_by=performed_by,
        record_id=purchase_order_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_purchase_request(rfq.data["purchase_request_id"])


@router.get("/purchase-order-items/{purchase_order_item_id}/internal-transfer-options")
def get_internal_transfer_options(purchase_order_item_id: int):
    context = _internal_transfer_context(purchase_order_item_id)
    warehouse_ids = {str(row.get("warehouse_id")) for row in context["source_stocks"]}
    warehouses = (
        supabase.table("warehouses")
        .select("warehouse_id, warehouse_name")
        .in_("warehouse_id", list(warehouse_ids))
        .execute()
        .data
        or []
    ) if warehouse_ids else []
    warehouse_names = {str(row["warehouse_id"]): row.get("warehouse_name") for row in warehouses}
    return {
        "purchase_order_item_id": purchase_order_item_id,
        "po_number": context["po"].get("po_number"),
        "buyer_entity": context["buyer_entity"],
        "buyer_warehouse_id": context["pr"].get("warehouse_id"),
        "seller_entity": context["seller_entity"],
        "buyer_product_code": context["buyer_product_code"],
        "seller_product_code": context["seller_product_code"],
        "item_description": context["order_item"].get("item_description"),
        "unit": context["order_item"].get("unit") or "Nos",
        "estimated_unit_cost": _num(context["order_item"].get("final_unit_cost")),
        "remaining_quantity": context["remaining_quantity"],
        "pending_quantity": context["pending_quantity"],
        "source_stocks": [
            {
                "stock_id": row.get("stock_id"),
                "warehouse_id": row.get("warehouse_id"),
                "warehouse_name": warehouse_names.get(str(row.get("warehouse_id"))) or str(row.get("warehouse_id")),
                "location_id": row.get("location_id"),
                "quantity_on_hand": _num(row.get("quantity_on_hand")),
                "reserved_quantity": _num(row.get("reserved_quantity")),
                "available_quantity": _num(row.get("available_quantity")),
                "unit_cost": _num(row.get("unit_cost")),
            }
            for row in context["source_stocks"]
        ],
    }


@router.post("/purchase-order-items/internal-transfer")
def create_internal_transfer(request: Request, payload: InternalTransferPayload):
    employee_id, performed_by = _extract_jwt_claims(request)
    if not payload.items:
        raise HTTPException(status_code=422, detail="At least one transfer line is required.")

    prepared = []
    source_allocations = {}
    pending_allocations = {}
    for line in payload.items:
        requested_quantity = _num(line.quantity)
        if requested_quantity <= 0:
            raise HTTPException(status_code=422, detail="Transfer quantity must be greater than zero.")

        context = _internal_transfer_context(line.purchase_order_item_id)
        pending_id = context["pending_movement"].get("movement_id")
        remaining_capacity = max(
            _num(context["remaining_quantity"]) - pending_allocations.get(pending_id, 0),
            0,
        )
        if requested_quantity > remaining_capacity:
            raise HTTPException(
                status_code=422,
                detail=f"Transfer quantity cannot exceed the {remaining_capacity:g} still required by this PO line.",
            )

        source_stock = next(
            (stock for stock in context["source_stocks"] if str(stock.get("stock_id")) == str(line.seller_stock_id)),
            None,
        )
        if not source_stock:
            available_quantity = sum(_num(stock.get("available_quantity")) for stock in context["source_stocks"])
            raise HTTPException(
                status_code=409,
                detail=_transfer_shortage_detail(context, requested_quantity, available_quantity),
            )

        source_id = source_stock.get("stock_id")
        available_quantity = max(
            _num(source_stock.get("available_quantity")) - source_allocations.get(source_id, 0),
            0,
        )
        if requested_quantity > available_quantity:
            raise HTTPException(
                status_code=409,
                detail=_transfer_shortage_detail(context, requested_quantity, available_quantity),
            )

        source_allocations[source_id] = source_allocations.get(source_id, 0) + requested_quantity
        pending_allocations[pending_id] = pending_allocations.get(pending_id, 0) + requested_quantity
        prepared.append((context, source_stock, requested_quantity))

    transferred = []
    for context, source_stock, quantity in prepared:
        source_next_quantity = _num(source_stock.get("quantity_on_hand")) - quantity
        source_update = supabase.table("inventory_stock").update({
            "quantity_on_hand": source_next_quantity,
            "status": _stock_status(source_next_quantity, _num(source_stock.get("reorder_level"))),
            "entity": context["seller_entity"],
            "updated_at": _today_iso(),
        }).eq("stock_id", source_stock.get("stock_id")).execute()
        if not source_update.data:
            raise HTTPException(status_code=400, detail="Unable to deduct the seller's stock.")

        inventory_router._insert_movement_record(
            movement_type="STOCK_OUT",
            product_code=context["seller_product_code"],
            quantity=quantity,
            unit_cost=_num(source_stock.get("unit_cost")),
            reference_no=context["po"].get("po_number"),
            remarks=(
                f"Manual inter-company transfer to {context['buyer_entity']} for PO "
                f"{context['po'].get('po_number')} / PO item {context['order_item'].get('purchase_order_item_id')}"
            ),
            warehouse_id=source_stock.get("warehouse_id"),
            location_id=source_stock.get("location_id"),
            created_by_employee_id=employee_id,
        )

        pending = context["pending_movement"]
        pending_quantity = _num(pending.get("quantity")) + quantity
        pending_remarks = pending.get("remarks") or ""
        if INTERNAL_TRANSFERRED_MARKER not in pending_remarks:
            pending_remarks = f"{pending_remarks} {INTERNAL_TRANSFERRED_MARKER}".strip()
        pending_result = supabase.table("inventory_movements").update({
            "quantity": pending_quantity,
            "from_warehouse_id": source_stock.get("warehouse_id"),
            "from_location_id": source_stock.get("location_id"),
            "remarks": pending_remarks,
        }).eq("movement_id", pending.get("movement_id")).execute()
        if not pending_result.data:
            raise HTTPException(status_code=400, detail="Unable to make stock available for the buyer to receive.")

        inventory_router._sync_product_master_quantity(context["seller_product_code"])
        transferred.append({
            "purchase_order_item_id": context["order_item"].get("purchase_order_item_id"),
            "quantity": quantity,
            "seller_product_code": context["seller_product_code"],
            "buyer_product_code": context["buyer_product_code"],
            "pending_quantity": pending_quantity,
        })

    write_audit_log(
        action="INTERCOMPANY_STOCK_TRANSFER",
        module_name="Purchasing",
        description=f"Manually transferred {len(transferred)} inter-company PO line(s) to buyer pending stock.",
        performed_by=performed_by,
        record_id=prepared[0][0]["po"].get("purchase_order_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return {"ok": True, "transferred": transferred}


@router.post("/purchase-orders/{purchase_order_id}/status")
def update_purchase_order_status(purchase_order_id: int, request: Request, payload: POStatusPayload):
    _, performed_by = _extract_jwt_claims(request)
    po = supabase.table("purchase_orders").select("*").eq("purchase_order_id", purchase_order_id).single().execute()
    if not po.data:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if payload.status in ("APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail="Approve or reject purchase orders from Workflow Approval.")
    if payload.status == "PO_SENT" and po.data.get("status") != "APPROVED":
        raise HTTPException(status_code=400, detail="Only approved purchase orders can be sent.")

    updates = {"status": payload.status, "updated_at": _today_iso()}
    if payload.remarks:
        updates["remarks"] = payload.remarks

    if payload.status == "PO_SENT":
        # Capture the transaction date and XE rate before changing state or staging stock.
        # A rate failure therefore leaves the approved PO untouched and retryable.
        updates.update(_transaction_fx_snapshot(po.data))
        _stage_purchase_order_pending_stock(purchase_order_id, request, performed_by)

    supabase.table("purchase_orders").update(updates).eq("purchase_order_id", purchase_order_id).execute()

    if payload.status == "PO_SENT":
        try:
            ap_router.create_draft_bill_from_po(
                purchase_order_id,
                request,
                ap_router.DraftBillFromPO(),
            )
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            message = detail.get("error") if isinstance(detail, dict) else str(exc.detail)
            if exc.status_code != 409 or "already billed" not in (message or "").lower():
                write_audit_log(
                    action="AP_DRAFT_SKIPPED",
                    module_name="Purchasing",
                    description=f"PO {po.data.get('po_number')} was sent, but AP draft creation was skipped: {message or exc.detail}",
                    performed_by=performed_by,
                    record_id=purchase_order_id,
                    ip_address=request.client.host if request.client else None,
                    request=request,
                )
        except Exception as exc:
            write_audit_log(
                action="AP_DRAFT_SKIPPED",
                module_name="Purchasing",
                description=f"PO {po.data.get('po_number')} was sent, but AP draft creation failed: {exc}",
                performed_by=performed_by,
                record_id=purchase_order_id,
                ip_address=request.client.host if request.client else None,
                request=request,
            )

        # Inter-company: if supplier is a sister entity, auto-create AR on seller's books
        try:
            ic_result = create_intercompany_ar_from_po(purchase_order_id, po.data, request)
            if ic_result:
                write_audit_log(
                    action="INTERCOMPANY_TRIGGERED",
                    module_name="Purchasing",
                    description=(
                        f"PO {po.data.get('po_number')} sent to internal supplier; "
                        f"created AR invoice {ic_result['invoice_number']} on {ic_result['seller_entity']}'s books"
                    ),
                    performed_by=performed_by,
                    record_id=purchase_order_id,
                    ip_address=request.client.host if request.client else None,
                    request=request,
                )
        except Exception as exc:
            write_audit_log(
                action="INTERCOMPANY_FAILED",
                module_name="Purchasing",
                description=f"PO {po.data.get('po_number')} inter-company AR creation failed: {exc}",
                performed_by=performed_by,
                record_id=purchase_order_id,
                ip_address=request.client.host if request.client else None,
                request=request,
            )

    write_audit_log(
        action="STATUS_CHANGE",
        module_name="Purchasing",
        description=f"Purchase order {po.data.get('po_number')} status changed to {payload.status}",
        performed_by=performed_by,
        record_id=purchase_order_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return _get_purchase_request(po.data["purchase_request_id"])


@router.post("/purchase-orders/{purchase_order_id}/pending-stock")
def stage_purchase_order_pending_stock(purchase_order_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    staged_count = _stage_purchase_order_pending_stock(purchase_order_id, request, performed_by)
    return {"staged_count": staged_count}


@router.post("/purchase-orders/{purchase_order_id}/receive")
def receive_purchase_order(purchase_order_id: int, request: Request, payload: ReceivePayload):
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)
    po = supabase.table("purchase_orders").select("*").eq("purchase_order_id", purchase_order_id).single().execute()
    if not po.data:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    pr = supabase.table("purchase_requests").select("*").eq("purchase_request_id", po.data["purchase_request_id"]).single().execute()
    if not pr.data:
        raise HTTPException(status_code=404, detail="Purchase request not found")
    stock_entity = _require_entity(
        pr.data.get("entity") or _entity_from_document_number(po.data.get("po_number")),
        "purchase request entity",
    )
    receive_warehouse_id = pr.data.get("warehouse_id") or payload.warehouse_id
    if not receive_warehouse_id:
        raise HTTPException(status_code=400, detail="Purchase request warehouse is required before receiving")
    warehouse_res = supabase.table("warehouses").select("warehouse_code, warehouse_name").eq("warehouse_id", receive_warehouse_id).limit(1).execute()
    receive_warehouse = warehouse_res.data[0] if warehouse_res.data else {}
    supplier = {}
    if po.data.get("supplier_id"):
        supplier_res = supabase.table("supplier_list").select("company_name").eq("supplier_id", po.data["supplier_id"]).limit(1).execute()
        supplier = supplier_res.data[0] if supplier_res.data else {}

    prepared_items = []
    for item in payload.items:
        order_item = supabase.table("purchase_order_items").select("*").eq("purchase_order_item_id", item.purchase_order_item_id).single().execute()
        if not order_item.data:
            raise HTTPException(status_code=404, detail="Purchase order item not found")
        if order_item.data.get("purchase_order_id") != purchase_order_id:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "A receipt item does not belong to the selected purchase order.",
                    "fields": {
                        "purchase_order_item_id": (
                            f"Item {item.purchase_order_item_id} belongs to a different purchase order."
                        ),
                    },
                },
            )
        remaining_quantity = max(_num(order_item.data.get("quantity")) - _num(order_item.data.get("received_quantity")), 0)
        receive_quantity = min(_num(item.received_quantity), remaining_quantity)
        if receive_quantity <= 0:
            continue
        item.received_quantity = receive_quantity
        prepared_items.append((item, order_item.data))

    if not prepared_items:
        updated = _get_purchase_request(po.data["purchase_request_id"])
        updated["new_stock_items"] = []
        return updated

    receipt_number = _generate_no("goods_receipts", "receipt_number", "GR")
    receipt = {
        "receipt_number": receipt_number,
        "purchase_order_id": purchase_order_id,
        "warehouse_id": receive_warehouse_id,
        "received_by_employee_id": employee_id,
        "status": "RECEIVED",
        "remarks": payload.remarks,
    }
    res = supabase.table("goods_receipts").insert(receipt).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create goods receipt")
    goods_receipt_id = res.data[0]["goods_receipt_id"]

    rows = []
    new_stock_items = []
    inventory_batch_code = _generate_inventory_product_batch(receipt_number)
    for index, (item, order_item) in enumerate(prepared_items, start=1):
        product_code = (item.product_code or order_item.get("product_code") or "").strip()
        if not product_code:
            product_code = _generate_product_code_for_new_item(order_item.get("item_description"), index, stock_entity)

        item.product_code = product_code
        _ensure_product_master(
            product_code,
            order_item.get("item_description"),
            stock_entity,
            item.unit_cost,
            supplier.get("company_name"),
            order_item.get("unit"),
        )

        rows.append({**item.model_dump(), "goods_receipt_id": goods_receipt_id})
        next_received = _num(order_item.get("received_quantity")) + item.received_quantity
        supabase.table("purchase_order_items").update({
            "received_quantity": next_received,
            "product_code": item.product_code,
        }).eq("purchase_order_item_id", item.purchase_order_item_id).execute()
        inventory_router._record_received_intercompany_product_link(
            po.data,
            {**order_item, "product_code": item.product_code},
        )

        default_location = supabase.table("inventory_locations").select("location_id, location_code, location_name").eq("warehouse_id", receive_warehouse_id).limit(1).execute()
        location = default_location.data[0] if default_location.data else {}
        location_id = location.get("location_id")

        # The PR's canonical entity owns stock received for this PO.
        stock = (
            supabase.table("inventory_stock")
            .select("*")
            .eq("product_code", item.product_code)
            .eq("warehouse_id", receive_warehouse_id)
            .execute()
        )
        stock_rows = stock.data or []
        same_location = [
            row for row in stock_rows
            if str(row.get("location_id") or "") == str(location_id or "")
        ]
        # Never merge one entity's inventory into another entity's inventory.
        matching_stock = next(
            (row for row in same_location if row.get("entity") == stock_entity),
            None,
        )
        is_new_stock = not matching_stock

        # Create inventory movement for stock in
        movement_no = f"GR-{receipt_number}-{item.product_code}"
        movement = {
            "movement_no": movement_no,
            "movement_type": "STOCK_IN",
            "product_code": item.product_code,
            "to_warehouse_id": receive_warehouse_id,
            "quantity": item.received_quantity,
            "unit_cost": item.unit_cost,
            "reference_type": "GOODS_RECEIPT",
            "reference_no": receipt_number,
            "remarks": f"{'New stock received. ' if is_new_stock else ''}Received from PO {po.data.get('po_number')} - {payload.remarks or ''}".strip(),
            "created_by_employee_id": employee_id,
        }
        supabase.table("inventory_movements").insert(movement).execute()

        # Update inventory stock
        if matching_stock:
            # Update stock owned by this entity.
            current_qty = _num(matching_stock.get("quantity_on_hand"))
            new_qty = current_qty + item.received_quantity
            supabase.table("inventory_stock").update({
                "quantity_on_hand": new_qty,
                "unit_cost": item.unit_cost,
                "status": _stock_status(new_qty, _num(matching_stock.get("reorder_level"))),
                "entity": stock_entity,
                "updated_at": _today_iso(),
            }).eq("stock_id", matching_stock["stock_id"]).execute()
        else:
            supabase.table("inventory_stock").insert({
                "product_code": item.product_code,
                "warehouse_id": receive_warehouse_id,
                "location_id": location_id,
                "quantity_on_hand": item.received_quantity,
                "unit_cost": item.unit_cost,
                "reserved_quantity": 0,
                "reorder_level": 0,
                "status": _stock_status(item.received_quantity, 0),
                "entity": stock_entity,
            }).execute()
            new_stock_items.append({
                "product_code": item.product_code,
                "item_description": order_item.get("item_description"),
                "quantity": item.received_quantity,
                "warehouse_id": receive_warehouse_id,
                "warehouse_name": receive_warehouse.get("warehouse_name") or receive_warehouse.get("warehouse_code") or str(receive_warehouse_id),
                "location_id": location_id,
                "location_name": location.get("location_name") or location.get("location_code") or "Unassigned area",
            })

        projects_router.reserve_pending_materials_for_product(item.product_code, employee_id, request, performed_by)

    if rows:
        supabase.table("goods_receipt_items").insert(rows).execute()

    order_items = supabase.table("purchase_order_items").select("*").eq("purchase_order_id", purchase_order_id).execute().data or []
    fully_received = all(_num(item.get("received_quantity")) >= _num(item.get("quantity")) for item in order_items)
    next_status = "RECEIVED" if fully_received else "PARTIALLY_RECEIVED"
    supabase.table("purchase_orders").update({"status": next_status, "updated_at": _today_iso()}).eq("purchase_order_id", purchase_order_id).execute()

    draft_bill_number = None
    try:
        draft_bill = ap_router.create_draft_bill_from_po(
            purchase_order_id,
            request,
            ap_router.DraftBillFromPO(),
        )
        draft_bill_number = draft_bill.get("bill_number")
    except Exception as exc:
        write_audit_log(
            action="AP_DRAFT_SKIPPED",
            module_name="Purchasing",
            description=f"Goods receipt {receipt_number} posted, but AP draft bill was not auto-created: {exc}",
            performed_by=performed_by,
            record_id=goods_receipt_id,
            ip_address=request.client.host if request.client else None,
            request=request,
        )

    write_audit_log(
        action="CREATE",
        module_name="Purchasing",
        description=f"Received items for purchase order {po.data.get('po_number')}, updated inventory{f', and created draft AP bill {draft_bill_number}' if draft_bill_number else ''}",
        performed_by=performed_by,
        record_id=goods_receipt_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    updated = _get_purchase_request(po.data["purchase_request_id"])
    updated["new_stock_items"] = new_stock_items
    return updated
