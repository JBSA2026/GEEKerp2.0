from csv import DictWriter
from io import StringIO
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.cache import cached

# Router for all master data endpoints.
# This router is mounted at /master-data and handles listing, exporting,
# archiving, and bulk-deleting resources such as clients, products, employees, and suppliers.
router = APIRouter(prefix="/master-data", tags=["master-data"])


class BulkIds(BaseModel):
    # Defines the body payload structure for bulk actions.
    # Used by archive_records and bulk_delete_records.
    ids: list[str | int]


# Static configuration object to describe each supported master data resource.
# Includes the table name, primary identifier field, search and export behavior,
# and optional status field handling for archiving or filtering.
RESOURCE_CONFIG = {
    "clients": {
        "table": "client_list",
        "id_field": "client_id",
        "order": "client_id",
        "name_field": "company_name",
        "module": "Clients",
        "status_field": "status",
        "search_fields": ["company_name", "trade_name", "customer_code", "tin_number", "industry", "assigned_salesperson"],
        "export_fields": [
            "client_id",
            "customer_code",
            "company_name",
            "trade_name",
            "customer_type",
            "industry",
            "tin_number",
            "vat_status",
            "address",
            "billing_address",
            "assigned_salesperson",
            "payment_terms",
            "credit_limit",
            "status",
            "created_at",
            "updated_at",
        ],
    },
    "products": {
        "table": "product_list",
        "id_field": "product_code",
        "order": "product_code",
        "name_field": "product_name",
        "module": "Products / Inventory",
        "status_field": "status",
        "search_fields": ["product_name", "product_brand", "product_code", "supplier_name"],
        "export_fields": [
            "product_code",
            "product_brand",
            "product_name",
            "product_description",
            "quantity",
            "unit",
            "buying_price_vat",
            "selling_price_margin",
            "supplier_name",
            "status",
            "created_at",
            "updated_at",
        ],
    },
    "employees": {
        "table": "employees",
        "id_field": "employee_id",
        "order": "employee_id",
        "name_field": "email",
        "module": "Administration",
        "search_fields": ["first_name", "last_name", "email"],
        "export_fields": [
            "employee_id",
            "first_name",
            "last_name",
            "email",
            "address",
            "is_active",
            "created_at",
            "updated_at",
        ],
        "status_field": "is_active",
    },
    "supplier_list": {
        "table": "supplier_list",
        "id_field": "supplier_id",
        "order": "supplier_id",
        "name_field": "company_name",
        "module": "Suppliers",
        "status_field": "status",
        "search_fields": [
            "company_name",
            "tin_number",
            "supplier_type",
            "industry",
            "vat_status",
            "billing_address",
            "payment_terms",
        ],
        "export_fields": [
            "supplier_id",
            "company_name",
            "tin_number",
            "supplier_type",
            "industry",
            "vat_status",
            "billing_address",
            "payment_terms",
            "employee_id",
            "status",
            "created_at",
            "updated_at",
        ],
    },
    "warehouses": {
        "table": "warehouses",
        "id_field": "warehouse_id",
        "order": "warehouse_name",
        "name_field": "warehouse_name",
        "module": "Warehouse List",
        "status_field": "status",
        "search_fields": [
            "warehouse_code",
            "warehouse_name",
            "warehouse_type",
            "address",
            "contact_person",
            "contact_number",
            "status",
        ],
        "export_fields": [
            "warehouse_id",
            "warehouse_code",
            "warehouse_name",
            "warehouse_type",
            "address",
            "contact_person",
            "contact_number",
            "status",
            "created_at",
            "updated_at",
        ],
    },
    "documents": {
        "table": "company_documents",
        "id_field": "document_id",
        "order": "document_id",
        "name_field": "title",
        "module": "Documents",
        "status_field": "status",
        "search_fields": ["title", "document_type", "document_number", "entity"],
        "export_fields": [
            "document_id",
            "document_number",
            "title",
            "document_type",
            "entity",
            "related_module",
            "related_transaction",
            "owner_name",
            "status",
            "created_at",
            "updated_at",
        ],
    },
    "contact_list": {
        "table": "contact_list",
        "id_field": "contact_id",
        "order": "contact_id",
        "name_field": "first_name",
        "module": "Contacts",
        "status_field": "status",
        "search_fields": ["first_name", "last_name", "job_title", "email"],
        "export_fields": [
            "contact_id",
            "client_id",
            "first_name",
            "last_name",
            "job_title",
            "email",
            "landline",
            "is_primary_contact",
            "created_at",
            "updated_at",
        ],
    },
    "leads": {
        "table": "leads",
        "id_field": "lead_id",
        "order": "lead_id",
        "name_field": "company_name",
        "module": "Sales",
        "status_field": "lead_status",
        "search_fields": ["company_name", "contact_name", "email", "lead_source", "lead_status"],
        "export_fields": [
            "lead_id",
            "client_id",
            "employee_id",
            "company_name",
            "contact_name",
            "email",
            "mobile_number",
            "lead_source",
            "lead_status",
            "interest_level",
            "remarks",
            "created_at",
            "updated_at",
        ],
    },
    "sales_activity": {
        "table": "sales_activity",
        "id_field": "activity_id",
        "order": "activity_id",
        "name_field": "subject",
        "module": "Sales",
        "status_field": "status",
        "search_fields": ["activity_type", "subject", "notes_outcome"],
        "export_fields": [
            "activity_id",
            "employee_id",
            "activity_type",
            "activity_date",
            "subject",
            "notes_outcome",
            "created_at",
            "updated_at",
        ],
    },
    "opportunities": {
        "table": "opportunities",
        "id_field": "opportunity_id",
        "order": "opportunity_id",
        "name_field": "project_name",
        "module": "Sales",
        "status_field": "status",
        "search_fields": ["project_name", "stage", "competitor", "remarks"],
        "export_fields": [
            "opportunity_id",
            "employee_id",
            "client_id",
            "project_name",
            "estimated_value",
            "probability_percentage",
            "stage",
            "expected_closed_date",
            "competitor",
            "loss_reason",
            "remarks",
            "created_at",
            "updated_at",
        ],
    },
    "sales_forecast": {
        "table": "sales_forecast",
        "id_field": "forecast_id",
        "order": "forecast_id",
        "name_field": "forecast_period",
        "module": "Sales",
        "status_field": "status",
        "search_fields": ["forecast_period"],
        "export_fields": [
            "forecast_id",
            "employee_id",
            "forecast_period",
            "quota_amount",
            "pipeline_value",
            "weighted_value",
            "achieve_amount",
            "created_at",
            "updated_at",
        ],
    },
    "services": {
        "table": "services",
        "id_field": "service_id",
        "order": "service_id",
        "name_field": "service_name",
        "module": "Services",
        "status_field": "status",
        "search_fields": ["service_name", "company_name", "category", "sub_category"],
        "export_fields": [
            "service_id",
            "service_name",
            "company_name",
            "category",
            "sub_category",
            "tax_category",
            "margin_percentage",
            "warranty",
            "warranty_period",
            "service_description",
            "service_notes",
            "created_at",
            "updated_at",
        ],
    },
}


def _config(resource: str) -> dict:
    # Retrieve configuration for a resource by slug.
    # Throw a 404 error if the requested resource is not configured.
    config = RESOURCE_CONFIG.get(resource)
    if not config:
        raise HTTPException(status_code=404, detail="Unknown master data resource")
    return config


def _query(resource: str, search: Optional[str] = None, status_filter: Optional[str] = None):
    # Build a query for a resource, applying search and status filters when present.
    config = _config(resource)

    # Select all fields and sort by the configured order field.
    req = supabase.table(config["table"]).select("*").order(config["order"])

    # Apply a case-insensitive search filter across configured search fields.
    if search and search.strip():
        s = search.strip()
        req = req.or_(",".join(f"{field}.ilike.%{s}%" for field in config["search_fields"]))

    # Apply status filtering when supported and not filtering by "all".
    if status_filter and status_filter.lower() != "all" and config.get("status_field"):
        if config["status_field"] == "is_active":
            # Employee status is boolean so map active/inactive to True/False.
            req = req.eq("is_active", status_filter.lower() == "active")
        else:
            # Other resources use string status values (case-insensitive match).
            req = req.ilike(config["status_field"], status_filter.strip())

    return req


def _product_stock_quantity_map() -> dict[str, float]:
    stock_rows = supabase.table("inventory_stock").select("product_code, quantity_on_hand").execute().data or []
    totals: dict[str, float] = {}
    for row in stock_rows:
        product_code = row.get("product_code")
        if not product_code:
            continue
        totals[product_code] = totals.get(product_code, 0.0) + float(row.get("quantity_on_hand") or 0)
    return {
        product_code: int(quantity) if float(quantity).is_integer() else quantity
        for product_code, quantity in totals.items()
    }


def _with_live_product_quantities(rows: list[dict]) -> list[dict]:
    quantities = _product_stock_quantity_map()
    return [
        {**row, "quantity": quantities.get(row.get("product_code"), 0)}
        for row in rows
    ]


def _enrich_contacts_with_company(rows: list[dict]) -> list[dict]:
    """Add _company_name to each contact row by resolving client_id."""
    client_ids = list({r["client_id"] for r in rows if r.get("client_id")})
    if not client_ids:
        return [{**r, "_company_name": None} for r in rows]
    clients = supabase.table("client_list").select("client_id, company_name").in_("client_id", client_ids).execute().data or []
    client_map = {c["client_id"]: c["company_name"] for c in clients}
    return [{**r, "_company_name": client_map.get(r.get("client_id"))} for r in rows]


@router.get("/counts")
@cached("master-data:counts", ttl=60)
def get_counts():
    # Return a count of rows for each configured master data resource.
    counts = {}
    for resource, config in RESOURCE_CONFIG.items():
        if resource == "documents":
            # Fast count: just count native company_documents.
            # The full cross-module aggregation is too slow for a sidebar badge.
            try:
                res = supabase.table("company_documents").select("document_id", count="exact").execute()
                counts[resource] = res.count if hasattr(res, 'count') and res.count is not None else len(res.data or [])
            except Exception:
                counts[resource] = 0
        else:
            try:
                res = supabase.table(config["table"]).select(config["id_field"], count="exact").execute()
                counts[resource] = res.count if hasattr(res, 'count') and res.count is not None else len(res.data or [])
            except Exception:
                counts[resource] = 0
    return counts


@router.get("/{resource}")
def list_resource(
    resource: str,
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    # Documents resource uses the aggregated cross-module list (same as Document Management)
    if resource == "documents":
        from routers.company_documents import _collect_all_documents
        docs = _collect_all_documents()
        # Apply status filter
        if status_filter and status_filter.lower() != "all":
            docs = [d for d in docs if (d.get("status") or "").lower() == status_filter.lower()]
        # Apply search filter
        if search and search.strip():
            s = search.strip().lower()
            docs = [d for d in docs if s in " ".join(
                str(d.get(k) or "") for k in ("title", "document_type", "document_number", "entity", "owner_name", "related_module", "related_transaction")
            ).lower()]
        return docs
    # Return resource rows filtered by optional search and status parameters.
    rows = _query(resource, search, status_filter).execute().data or []
    if resource == "products":
        return _with_live_product_quantities(rows)
    if resource == "contact_list":
        return _enrich_contacts_with_company(rows)
    return rows


@router.post("/{resource}/archive")
def archive_records(resource: str, request: Request, payload: BulkIds):
    # Archive records for a service by changing the configured status field.
    config = _config(resource)

    if not payload.ids:
        # No IDs provided means no rows should be updated.
        return {"updated": 0}

    if not config.get("status_field"):
        # Only resources with status support can be archived.
        raise HTTPException(status_code=400, detail="This resource does not support archiving.")

    # Extract the user identity from the JWT token for audit logging.
    _, performed_by = _extract_jwt_claims(request)
    id_field = config["id_field"]
    status_field = config["status_field"]

    # Employees use a boolean active flag; other resources use the string "archived".
    archive_value = False if resource == "employees" else "archived"

    res = (
        supabase.table(config["table"])
        .update({status_field: archive_value})
        .in_(id_field, payload.ids)
        .execute()
    )

    updated = len(res.data or [])

    # Log the archive action in the audit trail.
    write_audit_log(
        action="ARCHIVE",
        module_name=config["module"],
        description=f"Archived {updated} {resource} record(s)",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
    )
    return {"updated": updated}


@router.post("/{resource}/restore")
def restore_records(resource: str, request: Request, payload: BulkIds):
    # Restore archived records by setting the status field back to active.
    config = _config(resource)

    if not payload.ids:
        return {"updated": 0}

    if not config.get("status_field"):
        raise HTTPException(status_code=400, detail="This resource does not support restoring.")

    _, performed_by = _extract_jwt_claims(request)
    id_field = config["id_field"]
    status_field = config["status_field"]

    # Employees use a boolean active flag; other resources use the string "active".
    restore_value = True if resource == "employees" else "New" if resource == "leads" else "active"

    res = (
        supabase.table(config["table"])
        .update({status_field: restore_value})
        .in_(id_field, payload.ids)
        .execute()
    )

    updated = len(res.data or [])

    write_audit_log(
        action="RESTORE",
        module_name=config["module"],
        description=f"Restored {updated} {resource} record(s)",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
    )
    return {"updated": updated}


@router.post("/{resource}/bulk-delete")
def bulk_delete_records(resource: str, request: Request, payload: BulkIds):
    # Delete multiple records for a resource, optionally cleaning up related data.
    config = _config(resource)

    if not payload.ids:
        return {"deleted": 0}

    _, performed_by = _extract_jwt_claims(request)
    id_field = config["id_field"]

    if resource == "employees":
        # Remove related employee role records before deleting employees.
        supabase.table("employee_roles").delete().in_("employee_id", payload.ids).execute()

    res = supabase.table(config["table"]).delete().in_(id_field, payload.ids).execute()
    deleted = len(res.data or [])

    write_audit_log(
        action="DELETE",
        module_name=config["module"],
        description=f"Deleted {deleted} {resource} record(s)",
        performed_by=performed_by,
        ip_address=request.client.host if request.client else None,
    )
    return {"deleted": deleted}


@router.get("/{resource}/export")
def export_resource(
    resource: str,
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    # Export filtered resource rows to a CSV attachment.
    config = _config(resource)
    rows = _query(resource, search, status_filter).execute().data or []
    if resource == "products":
        rows = _with_live_product_quantities(rows)

    output = StringIO()
    writer = DictWriter(output, fieldnames=config["export_fields"], extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)

    # Return the generated CSV as a streaming response with attachment headers.
    headers = {"Content-Disposition": f'attachment; filename="{resource}.csv"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)
