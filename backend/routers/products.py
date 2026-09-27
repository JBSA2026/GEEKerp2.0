from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.cache import cached
from utils.code_generator import get_company_code, normalize_entity

router = APIRouter(prefix="/products", tags=["products"])


class ProductCreate(BaseModel):
    product_code:          str
    owner_entity:          str
    product_brand:         str
    product_name:          str
    product_description:   Optional[str] = None
    quantity:              int
    unit:                  str
    buying_price_vat:     Decimal
    selling_price_margin: Decimal
    supplier_name:         str
    fulfillment_type:      str = "DIRECT"


class ProductUpdate(BaseModel):
    product_code:          Optional[str]     = None
    product_brand:         Optional[str]     = None
    product_name:          Optional[str]     = None
    product_description:   Optional[str]     = None
    quantity:              Optional[int]     = None
    unit:                  Optional[str]     = None
    buying_price_vat:     Optional[Decimal] = None
    selling_price_margin: Optional[Decimal] = None
    supplier_name:         Optional[str]     = None
    fulfillment_type:      Optional[str]     = None


def _require_entity(value: Optional[str]) -> str:
    entity = normalize_entity(value)
    if not entity:
        raise HTTPException(status_code=422, detail="A valid product owner entity is required.")
    return entity


def _validate_product_code_owner(product_code: str, owner_entity: str) -> str:
    code = (product_code or "").strip().upper()
    expected_prefix = f"{get_company_code(owner_entity)}-"
    if not code.startswith(expected_prefix):
        raise HTTPException(
            status_code=422,
            detail=f"Product code must start with {expected_prefix} for {owner_entity}.",
        )
    return code


@router.get("/")
@cached("products:list:{entity}:{search}", ttl=60)
def get_products(entity: str = Query(...), search: Optional[str] = Query(None)):
    owner_entity = _require_entity(entity)
    req = (
        supabase.table("product_list")
        .select("*")
        .eq("owner_entity", owner_entity)
        .order("product_code")
    )
    if search:
        req = req.or_(
            f"product_name.ilike.%{search}%,"
            f"product_brand.ilike.%{search}%,"
            f"product_code.ilike.%{search}%,"
            f"supplier_name.ilike.%{search}%"
        )
    return req.execute().data


@router.post("/", status_code=201)
def create_product(request: Request, payload: ProductCreate):
    _, performed_by = _extract_jwt_claims(request)
    owner_entity = _require_entity(payload.owner_entity)
    record_data = payload.model_dump(mode="json")
    record_data["owner_entity"] = owner_entity
    record_data["product_code"] = _validate_product_code_owner(payload.product_code, owner_entity)
    res = supabase.table("product_list").insert(record_data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")
    record = res.data[0]
    write_audit_log(
        action       = "CREATE",
        module_name  = "Products / Inventory",
        description  = f"Created {owner_entity} product {payload.product_name} (Code: {record_data['product_code']}, Brand: {payload.product_brand}, Supplier: {payload.supplier_name})",
        performed_by = performed_by,
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )
    return record


@router.patch("/{product_code}")
def update_product(product_code: str, request: Request, payload: ProductUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(mode="json", exclude_unset=True)

    existing = (
        supabase.table("product_list")
        .select("*")
        .eq("product_code", product_code)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Product not found")

    product_name = existing.data.get("product_name", product_code)

    if updates.get("product_code"):
        owner_entity = _require_entity(existing.data.get("owner_entity"))
        updates["product_code"] = _validate_product_code_owner(updates["product_code"], owner_entity)

    if not updates:
        return existing.data

    res = supabase.table("product_list").update(updates).eq("product_code", product_code).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Product not found")

    # Build change summary showing only what actually changed (old → new)
    changed_parts = []
    for key, new_val in updates.items():
        old_val = existing.data.get(key)
        if str(old_val) != str(new_val):
            label = key.replace("_", " ")
            changed_parts.append(f"{label}: {old_val} → {new_val}")
    change_str = "; ".join(changed_parts) if changed_parts else "no effective changes"

    write_audit_log(
        action       = "UPDATE",
        module_name  = "Products / Inventory",
        description  = f"Updated product {product_name} ({product_code}) — {change_str}",
        performed_by = performed_by,
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )
    return res.data[0]


@router.delete("/{product_code}", status_code=204)
def delete_product(product_code: str, request: Request):
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("product_list")
        .select("product_code, product_name")
        .eq("product_code", product_code)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Product not found")

    product_name = existing.data.get("product_name", product_code)
    supabase.table("product_list").delete().eq("product_code", product_code).execute()

    write_audit_log(
        action       = "DELETE",
        module_name  = "Products / Inventory",
        description  = f"Deleted product {product_name} ({product_code})",
        performed_by = performed_by,
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )
    return None
