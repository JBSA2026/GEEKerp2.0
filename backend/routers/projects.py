from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File, Form
from pydantic import BaseModel, field_validator

from database import supabase
from middleware.audit_middleware import _extract_jwt_claims, write_audit_log
from routers import ar as ar_router
from routers import inventory as inventory_router

router = APIRouter(prefix="/projects", tags=["projects"])

# Companies a project can belong to (shared with HR / Document Management).
PROJECT_ENTITIES = ("Expedia", "GreatnessLab", "Exigent", "KSI")
RESERVING_MATERIAL_STATUSES = {"RESERVED", "ALLOCATED"}
ORDERED_MATERIAL_STATUSES = {"ORDERED"}
ISSUED_MATERIAL_STATUSES = {"ISSUED", "DELIVERED", "CONFIRMED"}


# ── Pydantic models ───────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    client_id: int
    project_name: str
    entity: Optional[str] = None
    quotation_id: Optional[int] = None
    contract_value: float = 0
    budget: float = 0
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    project_manager_id: Optional[int] = None
    status: str = "PLANNING"
    completion_percent: float = 0
    description: Optional[str] = None
    remarks: Optional[str] = None

    @field_validator("entity")
    @classmethod
    def _check_entity_create(cls, v):
        if v is not None and v != "" and v not in PROJECT_ENTITIES:
            raise ValueError(f"Company must be one of: {', '.join(PROJECT_ENTITIES)}")
        return v or None


class ProjectUpdate(BaseModel):
    client_id: Optional[int] = None
    project_name: Optional[str] = None
    entity: Optional[str] = None
    quotation_id: Optional[int] = None
    contract_value: Optional[float] = None
    budget: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    project_manager_id: Optional[int] = None
    status: Optional[str] = None
    completion_percent: Optional[float] = None
    description: Optional[str] = None
    remarks: Optional[str] = None

    @field_validator("entity")
    @classmethod
    def _check_entity_update(cls, v):
        if v is not None and v != "" and v not in PROJECT_ENTITIES:
            raise ValueError(f"Company must be one of: {', '.join(PROJECT_ENTITIES)}")
        return v or None


class AssignManagerPayload(BaseModel):
    project_manager_id: int


class ProgressPayload(BaseModel):
    completion_percent: float
    status: Optional[str] = None


class ClosePayload(BaseModel):
    remarks: Optional[str] = None


class BudgetItemPayload(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    budgeted_amount: float = 0
    actual_amount: float = 0


class MilestonePayload(BaseModel):
    milestone_name: str
    description: Optional[str] = None
    target_date: Optional[date] = None
    completion_date: Optional[date] = None
    billing_amount: float = 0
    status: str = "PENDING"


class MilestoneUpdate(BaseModel):
    milestone_name: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[date] = None
    completion_date: Optional[date] = None
    billing_amount: Optional[float] = None
    status: Optional[str] = None
    is_billed: Optional[bool] = None


class TaskPayload(BaseModel):
    task_name: str
    description: Optional[str] = None
    milestone_id: Optional[int] = None
    assigned_to_employee_id: Optional[int] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    status: str = "TODO"
    progress_percent: float = 0


class TaskUpdate(BaseModel):
    task_name: Optional[str] = None
    description: Optional[str] = None
    milestone_id: Optional[int] = None
    assigned_to_employee_id: Optional[int] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    status: Optional[str] = None
    progress_percent: Optional[float] = None


class MaterialPayload(BaseModel):
    product_code: Optional[str] = None
    description: Optional[str] = None
    quantity: float = 0
    unit_cost: float = 0
    status: str = "PLANNED"


class MaterialUpdate(BaseModel):
    product_code: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit_cost: Optional[float] = None
    status: Optional[str] = None


class DocumentPayload(BaseModel):
    document_name: str
    document_type: Optional[str] = None
    file_url: Optional[str] = None
    remarks: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _num(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _today_iso() -> str:
    return datetime.now().isoformat()


def _iso(value):
    """Return an ISO date string for a date/None."""
    return value.isoformat() if value else None


def _employee_id_for_email(email: Optional[str]):
    if not email:
        return None
    res = supabase.table("employees").select("employee_id").eq("email", email).limit(1).execute()
    return res.data[0]["employee_id"] if res.data else None


def _generate_project_code(entity: str = None) -> str:
    """Generate the next project code in standard format: COMPANY-YYYY-PRJ-NNNN."""
    from utils.code_generator import generate_code
    return generate_code(entity, "PRJ", "projects", "project_code")
def _project_reference(project: dict) -> str:
    return project.get("project_code") or f"PROJECT-{project.get('project_id')}"


def _material_reference(material_id: int) -> str:
    return f"PROJECT-MATERIAL-{material_id}"


def _stock_available(row: dict) -> float:
    return _num(row.get("quantity_on_hand")) - _num(row.get("reserved_quantity"))


def _open_replenishment_request_exists(product_code: str) -> bool:
    open_statuses = ["TO_PURCHASE", "RFQ_SENT", "QUOTE_RECEIVED", "COMPARISON_DONE", "PO_CREATED", "SUBMITTED"]
    existing_items = (
        supabase.table("purchase_request_items")
        .select("purchase_request_id")
        .eq("product_code", product_code)
        .execute()
        .data
        or []
    )
    request_ids = [row["purchase_request_id"] for row in existing_items if row.get("purchase_request_id")]
    if not request_ids:
        return False
    rows = (
        supabase.table("purchase_requests")
        .select("purchase_request_id")
        .in_("purchase_request_id", request_ids)
        .in_("status", open_statuses)
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


def _create_project_material_pr(product_code: str, quantity: float, project: dict, employee_id=None, material_id=None) -> None:
    if not product_code or quantity <= 0 or _open_replenishment_request_exists(product_code):
        return

    product_rows = (
        supabase.table("product_list")
        .select("product_code, product_name, buying_price_vat")
        .eq("product_code", product_code)
        .limit(1)
        .execute()
        .data
        or []
    )
    product = product_rows[0] if product_rows else {}
    warehouse_rows = (
        supabase.table("warehouses")
        .select("warehouse_id")
        .eq("status", "ACTIVE")
        .limit(1)
        .execute()
        .data
        or []
    )
    warehouse_id = project.get("warehouse_id") or (warehouse_rows[0]["warehouse_id"] if warehouse_rows else None)
    material_note = f" Project material #{material_id}." if material_id else ""
    created = supabase.table("purchase_requests").insert({
        "pr_number": inventory_router._purchase_request_no(),
        "requested_by_employee_id": employee_id,
        "required_date": date.today().isoformat(),
        "warehouse_id": warehouse_id,
        "status": "TO_PURCHASE",
        "remarks": f"Auto-created for project {project.get('project_code')} material shortage.{material_note}",
    }).execute()
    if not created.data:
        return

    supabase.table("purchase_request_items").insert({
        "purchase_request_id": created.data[0]["purchase_request_id"],
        "product_code": product_code,
        "item_description": product.get("product_name") or product_code,
        "quantity": quantity,
        "estimated_unit_cost": _num(product.get("buying_price_vat")),
    }).execute()


def _stock_rows_for_product(product_code: str) -> list:
    return (
        supabase.table("inventory_stock")
        .select("*")
        .eq("product_code", product_code)
        .order("warehouse_id")
        .execute()
        .data
        or []
    )


def _reserve_material_stock(project: dict, material: dict, employee_id=None) -> float:
    product_code = (material.get("product_code") or "").strip()
    quantity_needed = _num(material.get("quantity"))
    if not product_code or quantity_needed <= 0:
        return 0.0

    remaining = quantity_needed
    reserved_total = 0.0
    for stock in _stock_rows_for_product(product_code):
        available = _stock_available(stock)
        if available <= 0:
            continue

        reserve_qty = min(remaining, available)
        next_reserved = _num(stock.get("reserved_quantity")) + reserve_qty
        updated = (
            supabase.table("inventory_stock")
            .update({"reserved_quantity": next_reserved, "updated_at": _today_iso()})
            .eq("stock_id", stock["stock_id"])
            .execute()
        )
        if not updated.data:
            raise HTTPException(status_code=400, detail="Unable to reserve inventory")

        supabase.table("project_material_allocations").insert({
            "material_id": material["material_id"],
            "project_id": project["project_id"],
            "stock_id": stock["stock_id"],
            "product_code": product_code,
            "warehouse_id": stock.get("warehouse_id"),
            "location_id": stock.get("location_id"),
            "quantity_reserved": reserve_qty,
            "quantity_issued": 0,
            "reference_no": _material_reference(material["material_id"]),
        }).execute()

        inventory_router._ensure_low_stock_purchase_request(updated.data[0], employee_id)
        remaining -= reserve_qty
        reserved_total += reserve_qty
        if remaining <= 0:
            break

    if remaining > 0:
        _create_project_material_pr(product_code, remaining, project, employee_id, material.get("material_id"))
    return reserved_total


def _material_allocations(material_id: int) -> list:
    return (
        supabase.table("project_material_allocations")
        .select("*")
        .eq("material_id", material_id)
        .order("allocation_id")
        .execute()
        .data
        or []
    )


def reserve_pending_materials_for_product(product_code: str, employee_id=None, request: Request = None, performed_by=None) -> int:
    """Retry project reservations that were waiting for newly received stock."""
    product_code = (product_code or "").strip()
    if not product_code:
        return 0

    materials = (
        supabase.table("project_materials")
        .select("*")
        .eq("product_code", product_code)
        .in_("status", ["ORDERED", "PLANNED", "RESERVED"])
        .order("material_id")
        .execute()
        .data
        or []
    )

    updated_count = 0
    for material in materials:
        material_id = material.get("material_id")
        required = _num(material.get("quantity"))
        allocations = _material_allocations(material_id)
        reserved = sum(
            _num(row.get("quantity_reserved")) - _num(row.get("quantity_issued"))
            for row in allocations
        )
        shortage = max(required - reserved, 0)
        if shortage <= 0:
            if (material.get("status") or "").upper() != "RESERVED":
                supabase.table("project_materials").update({
                    "status": "RESERVED",
                    "updated_at": _today_iso(),
                }).eq("material_id", material_id).execute()
                updated_count += 1
            continue

        project = (
            supabase.table("projects")
            .select("*")
            .eq("project_id", material.get("project_id"))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not project:
            continue

        reserved_now = _reserve_material_stock(project[0], {**material, "quantity": shortage}, employee_id)
        next_reserved = reserved + reserved_now
        next_status = "RESERVED" if next_reserved >= required else "ORDERED"
        if next_status != material.get("status"):
            supabase.table("project_materials").update({
                "status": next_status,
                "updated_at": _today_iso(),
            }).eq("material_id", material_id).execute()
            updated_count += 1

        if reserved_now > 0 and request:
            write_audit_log(
                action="RESERVE",
                module_name="Projects",
                description=(
                    f"Reserved {reserved_now} {product_code} from newly received stock "
                    f"for project material #{material_id}"
                ),
                performed_by=performed_by,
                record_id=material.get("project_id"),
                ip_address=request.client.host if request.client else None,
                request=request,
            )

    return updated_count


def _release_material_reservations(material_id: int) -> None:
    allocations = _material_allocations(material_id)
    for allocation in allocations:
        unreleased = _num(allocation.get("quantity_reserved")) - _num(allocation.get("quantity_issued"))
        if unreleased <= 0:
            continue
        stock = (
            supabase.table("inventory_stock")
            .select("*")
            .eq("stock_id", allocation["stock_id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if not stock:
            continue
        next_reserved = max(_num(stock[0].get("reserved_quantity")) - unreleased, 0)
        supabase.table("inventory_stock").update({
            "reserved_quantity": next_reserved,
            "updated_at": _today_iso(),
        }).eq("stock_id", allocation["stock_id"]).execute()

    supabase.table("project_material_allocations").delete().eq("material_id", material_id).execute()


def _issue_material_stock(project: dict, material: dict) -> float:
    product_code = (material.get("product_code") or "").strip()
    quantity_needed = _num(material.get("quantity"))
    if not product_code or quantity_needed <= 0:
        return 0.0

    allocations = _material_allocations(material["material_id"])
    available_reserved = sum(_num(row.get("quantity_reserved")) - _num(row.get("quantity_issued")) for row in allocations)
    if available_reserved < quantity_needed:
        raise HTTPException(status_code=400, detail="Material must be reserved before it can be issued")

    remaining = quantity_needed
    issued_total = 0.0
    for allocation in allocations:
        issuable = _num(allocation.get("quantity_reserved")) - _num(allocation.get("quantity_issued"))
        if issuable <= 0:
            continue
        issue_qty = min(remaining, issuable)
        stock = (
            supabase.table("inventory_stock")
            .select("*")
            .eq("stock_id", allocation["stock_id"])
            .single()
            .execute()
        )
        if not stock.data:
            raise HTTPException(status_code=400, detail="Reserved stock record was not found")

        next_qty = _num(stock.data.get("quantity_on_hand")) - issue_qty
        if next_qty < 0:
            raise HTTPException(status_code=400, detail="Stock on hand is lower than the issue quantity")

        next_reserved = max(_num(stock.data.get("reserved_quantity")) - issue_qty, 0)
        updated = supabase.table("inventory_stock").update({
            "quantity_on_hand": next_qty,
            "reserved_quantity": next_reserved,
            "status": inventory_router._stock_status(next_qty, _num(stock.data.get("reorder_level"))),
            "updated_at": _today_iso(),
        }).eq("stock_id", allocation["stock_id"]).execute()
        if not updated.data:
            raise HTTPException(status_code=400, detail="Unable to issue inventory")

        supabase.table("project_material_allocations").update({
            "quantity_issued": _num(allocation.get("quantity_issued")) + issue_qty,
            "updated_at": _today_iso(),
        }).eq("allocation_id", allocation["allocation_id"]).execute()

        inventory_router._insert_movement_record(
            movement_type="STOCK_OUT",
            product_code=product_code,
            quantity=issue_qty,
            unit_cost=_num(stock.data.get("unit_cost")),
            reference_no=_project_reference(project),
            remarks=f"Issued to project material #{material['material_id']}",
            warehouse_id=stock.data.get("warehouse_id"),
            location_id=stock.data.get("location_id"),
        )
        inventory_router._ensure_low_stock_purchase_request(updated.data[0])

        remaining -= issue_qty
        issued_total += issue_qty
        if remaining <= 0:
            break

    return issued_total


def _create_draft_invoice_for_milestone(project: dict, milestone: dict, request: Request, performed_by: str) -> Optional[dict]:
    amount = _num(milestone.get("billing_amount"))
    if amount <= 0:
        return None

    marker = f"[PROJECT-MILESTONE-{milestone['milestone_id']}]"
    invoice_rows = (
        supabase.table("ar_invoices")
        .select("invoice_id")
        .eq("project_code", project.get("project_code"))
        .eq("record_status", "ACTIVE")
        .execute()
        .data
        or []
    )
    invoice_ids = [row["invoice_id"] for row in invoice_rows if row.get("invoice_id")]
    if invoice_ids:
        existing_lines = (
            supabase.table("ar_invoice_items")
            .select("invoice_id, description")
            .in_("invoice_id", invoice_ids)
            .execute()
            .data
            or []
        )
        existing_invoice_id = next(
            (row["invoice_id"] for row in existing_lines if marker in (row.get("description") or "")),
            None,
        )
        if existing_invoice_id:
            return ar_router.get_invoice(existing_invoice_id)

    employee_id = _employee_id_for_email(performed_by)
    invoice_number = ar_router._next_invoice_number()
    today = date.today()
    rates = ar_router._tax_rate_map()
    item = ar_router.InvoiceItemPayload(
        line_type="SERVICE",
        description=f"{marker} {milestone.get('milestone_name')}",
        vat_exclusive_amount=amount,
        vat_code="VAT_OUTPUT",
        wht_code="WHT_SERVICE_2",
    )
    totals = ar_router._compute_invoice_totals([item], rates)
    header = {
        "invoice_number": invoice_number,
        "customer_id": project.get("client_id"),
        "invoice_date": today.isoformat(),
        "due_date": today.isoformat(),
        "sales_order_ref": None,
        "project_code": project.get("project_code"),
        "source_quotation_id": project.get("quotation_id"),
        "lifecycle_status": "DRAFT",
        "record_status": "ACTIVE",
        "billing_subtotal": totals["billing_subtotal"],
        "vat_output": totals["vat_output"],
        "wht_amount": totals["wht_amount"],
        "collection_status": "UNPAID",
        "created_by_employee_id": employee_id,
    }
    res = supabase.table("ar_invoices").insert(header).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create milestone draft invoice")
    invoice_id = res.data[0]["invoice_id"]
    ar_router._insert_items(invoice_id, [item], employee_id)

    write_audit_log(
        action="CREATE",
        module_name="Accounts Receivable",
        description=f"Created draft invoice {invoice_number} for milestone {milestone.get('milestone_name')}",
        performed_by=performed_by,
        record_id=invoice_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return ar_router.get_invoice(invoice_id)


def _client_map():
    rows = supabase.table("client_list").select("client_id, company_name").execute().data or []
    return {row["client_id"]: row.get("company_name") for row in rows}


def _employee_map():
    rows = supabase.table("employees").select("employee_id, first_name, last_name").execute().data or []
    return {row["employee_id"]: f"{row.get('first_name', '')} {row.get('last_name', '')}".strip() for row in rows}


def _compute_financials(project: dict, materials: list, budget_items: list, milestones: list) -> dict:
    """Derive cost / profit / margin figures for a project."""
    contract_value = _num(project.get("contract_value"))
    material_cost = sum(_num(row.get("total_cost")) for row in materials)
    budget_actual = sum(_num(row.get("actual_amount")) for row in budget_items)
    total_cost = material_cost + budget_actual
    gross_profit = contract_value - total_cost
    gross_margin = (gross_profit / contract_value * 100) if contract_value else 0
    billed = sum(_num(row.get("billing_amount")) for row in milestones if row.get("is_billed"))
    return {
        "material_cost": material_cost,
        "budget_actual": budget_actual,
        "total_cost": total_cost,
        "gross_profit": gross_profit,
        "gross_margin": round(gross_margin, 2),
        "budget": _num(project.get("budget")),
        "budget_variance": _num(project.get("budget")) - total_cost,
        "billed_amount": billed,
        "uncollected": contract_value - billed,
    }


def _get_project(project_id: int) -> dict:
    project = (
        supabase.table("projects")
        .select("*")
        .eq("project_id", project_id)
        .single()
        .execute()
    )
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    clients = _client_map()
    employees = _employee_map()

    budget_items = (
        supabase.table("project_budget_items")
        .select("*")
        .eq("project_id", project_id)
        .order("budget_item_id")
        .execute()
        .data
        or []
    )
    milestones = (
        supabase.table("project_milestones")
        .select("*")
        .eq("project_id", project_id)
        .order("target_date")
        .execute()
        .data
        or []
    )
    tasks = (
        supabase.table("project_tasks")
        .select("*")
        .eq("project_id", project_id)
        .order("task_id")
        .execute()
        .data
        or []
    )
    materials = (
        supabase.table("project_materials")
        .select("*")
        .eq("project_id", project_id)
        .order("material_id")
        .execute()
        .data
        or []
    )
    material_ids = [row["material_id"] for row in materials if row.get("material_id")]
    allocations = []
    if material_ids:
        allocations = (
            supabase.table("project_material_allocations")
            .select("*")
            .in_("material_id", material_ids)
            .execute()
            .data
            or []
        )
    allocations_by_material = {}
    for allocation in allocations:
        allocations_by_material.setdefault(allocation.get("material_id"), []).append(allocation)
    decorated_materials = []
    for material in materials:
        owned_allocations = allocations_by_material.get(material.get("material_id"), [])
        reserved = sum(_num(row.get("quantity_reserved")) for row in owned_allocations)
        issued = sum(_num(row.get("quantity_issued")) for row in owned_allocations)
        decorated_materials.append({
            **material,
            "reserved_quantity": reserved,
            "issued_quantity": issued,
            "available_reserved_quantity": reserved - issued,
        })
    documents = (
        supabase.table("project_documents")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )

    decorated_tasks = [
        {**task, "assigned_to_name": employees.get(task.get("assigned_to_employee_id"))}
        for task in tasks
    ]

    return {
        **project.data,
        "client_name": clients.get(project.data.get("client_id")),
        "project_manager_name": employees.get(project.data.get("project_manager_id")),
        "budget_items": budget_items,
        "milestones": milestones,
        "tasks": decorated_tasks,
        "materials": decorated_materials,
        "documents": documents,
        "financials": _compute_financials(project.data, decorated_materials, budget_items, milestones),
    }


def _audit(action: str, description: str, performed_by, record_id, request: Request):
    write_audit_log(
        action=action,
        module_name="Projects",
        description=description,
        performed_by=performed_by,
        record_id=record_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )


def create_or_update_from_sales_order(sales_order: dict, performed_by: Optional[str] = None, request: Optional[Request] = None) -> dict:
    """Create the operations project that belongs to an accepted sales order."""
    quotation_id = sales_order.get("quotation_id")
    existing_rows = []
    if quotation_id:
        existing_rows = (
            supabase.table("projects")
            .select("*")
            .eq("quotation_id", quotation_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    if not existing_rows and sales_order.get("project_name"):
        existing_rows = (
            supabase.table("projects")
            .select("*")
            .eq("project_name", sales_order.get("project_name"))
            .eq("client_id", sales_order.get("client_id"))
            .limit(1)
            .execute()
            .data
            or []
        )

    # Map quotation company slug to proper entity name
    COMPANY_TO_ENTITY = {'expedia': 'Expedia', 'greatnesslab': 'GreatnessLab', 'exigent': 'Exigent', 'kyrios': 'KSI'}
    raw_entity = sales_order.get("entity") or None
    mapped_entity = COMPANY_TO_ENTITY.get(raw_entity, raw_entity) if raw_entity else None

    header = {
        "client_id": sales_order.get("client_id"),
        "project_name": sales_order.get("project_name") or sales_order.get("so_number"),
        "quotation_id": quotation_id,
        "contract_value": _num(sales_order.get("grand_total")),
        "budget": _num(sales_order.get("subtotal")),
        "status": "PLANNING",
        "completion_percent": 0,
        "entity": mapped_entity,
        "description": f"Auto-created from sales order {sales_order.get('so_number')}",
        "remarks": f"Source sales order: {sales_order.get('so_number')}",
    }

    if existing_rows:
        project_id = existing_rows[0]["project_id"]
        updated = supabase.table("projects").update({
            **header,
            "updated_at": _today_iso(),
        }).eq("project_id", project_id).execute()
        project = updated.data[0] if updated.data else {**existing_rows[0], **header}
    else:
        created = supabase.table("projects").insert({
            **header,
            "project_code": _generate_project_code(mapped_entity),
        }).execute()
        if not created.data:
            raise HTTPException(status_code=400, detail="Unable to create project from sales order")
        project = created.data[0]
        project_id = project["project_id"]

    existing_materials = (
        supabase.table("project_materials")
        .select("product_code")
        .eq("project_id", project_id)
        .execute()
        .data
        or []
    )
    material_codes = {row.get("product_code") for row in existing_materials if row.get("product_code")}
    sales_items = (
        supabase.table("sales_order_items")
        .select("*")
        .eq("sales_order_id", sales_order.get("sales_order_id"))
        .execute()
        .data
        or []
    )
    material_rows = []
    source_items = []
    for item in sales_items:
        product_code = item.get("product_code")
        quantity = _num(item.get("quantity_ordered"))
        if not product_code or quantity <= 0 or product_code in material_codes:
            continue
        status = "RESERVED" if _num(item.get("quantity_reserved")) > 0 else "PLANNED"
        unit_cost = _num(item.get("unit_cost"))
        material_rows.append({
            "project_id": project_id,
            "product_code": product_code,
            "description": item.get("description") or product_code,
            "quantity": quantity,
            "unit_cost": unit_cost,
            "total_cost": quantity * unit_cost,
            "status": status,
        })
        source_items.append(item)
    if material_rows:
        inserted = supabase.table("project_materials").insert(material_rows).execute()
        for material, item in zip(inserted.data or [], source_items):
            if _num(item.get("quantity_reserved")) <= 0 or not item.get("allocated_stock_id"):
                continue
            supabase.table("project_material_allocations").insert({
                "material_id": material["material_id"],
                "project_id": project_id,
                "stock_id": item.get("allocated_stock_id"),
                "product_code": material.get("product_code"),
                "warehouse_id": item.get("warehouse_id"),
                "location_id": None,
                "quantity_reserved": _num(item.get("quantity_reserved")),
                "quantity_issued": 0,
                "reference_no": sales_order.get("so_number"),
            }).execute()

        # Reserve shortfall from available stock and create PR for remainder
        for material, item in zip(inserted.data or [], source_items):
            required = _num(material.get("quantity"))
            already_reserved = _num(item.get("quantity_reserved"))
            shortage = required - already_reserved
            if shortage <= 0:
                continue
            _reserve_material_stock(
                project,
                {**material, "quantity": shortage},
                _employee_id_for_email(performed_by),
            )
            # Update material status based on total reservations
            allocations = _material_allocations(material["material_id"])
            total_reserved = sum(
                _num(row.get("quantity_reserved")) - _num(row.get("quantity_issued"))
                for row in allocations
            )
            next_status = "RESERVED" if total_reserved >= required else "ORDERED"
            if next_status != material.get("status"):
                supabase.table("project_materials").update({
                    "status": next_status,
                    "updated_at": _today_iso(),
                }).eq("material_id", material["material_id"]).execute()

    if request is not None:
        action = "UPDATE" if existing_rows else "CREATE"
        _audit(
            action,
            f"{'Updated' if existing_rows else 'Created'} project {project.get('project_code')} from sales order {sales_order.get('so_number')}",
            performed_by,
            project_id,
            request,
        )
    return _get_project(project_id)


# ── Meta / summary ─────────────────────────────────────────────────────────────

@router.get("/meta")
def projects_meta():
    quotations = (
        supabase.table("quotations")
        .select("quotation_id, quotation_no, project_name, status")
        .in_("status", ["COMPLETE", "ACCEPTED", "CONVERTED"])
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return {
        "clients": supabase.table("client_list").select("client_id, company_name").order("company_name").execute().data or [],
        "employees": supabase.table("employees").select("employee_id, first_name, last_name").eq("is_active", True).order("first_name").execute().data or [],
        "products": supabase.table("product_list").select("product_code, product_name, unit, buying_price_vat").order("product_code").execute().data or [],
        "quotations": [
            {**quotation, "status": "COMPLETE" if quotation.get("status") in ("ACCEPTED", "CONVERTED") else quotation.get("status")}
            for quotation in quotations
        ],
    }


@router.get("/summary")
def projects_summary():
    rows = (
        supabase.table("projects")
        .select("status, contract_value, completion_percent")
        .eq("record_status", "ACTIVE")
        .execute()
        .data
        or []
    )
    counts = {"TOTAL": len(rows)}
    total_contract = 0.0
    completion_sum = 0.0
    active = 0
    for row in rows:
        status = row.get("status") or "PLANNING"
        counts[status] = counts.get(status, 0) + 1
        total_contract += _num(row.get("contract_value"))
        completion_sum += _num(row.get("completion_percent"))
        if status in ("PLANNING", "IN_PROGRESS", "ON_HOLD"):
            active += 1
    counts["ACTIVE"] = active
    counts["CONTRACT_VALUE"] = total_contract
    counts["AVG_COMPLETION"] = round(completion_sum / len(rows), 1) if rows else 0
    return counts


# ── Project list / detail / CRUD ────────────────────────────────────────────────

@router.get("/")
def list_projects(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    entity: Optional[str] = Query(None),
    include_archived: bool = Query(False),
):
    req = supabase.table("projects").select("*").order("created_at", desc=True)
    if not include_archived:
        req = req.eq("record_status", "ACTIVE")
    if status and status != "All":
        req = req.eq("status", status)
    if entity and entity != "All":
        req = req.eq("entity", entity)
    if search:
        req = req.or_(f"project_code.ilike.%{search}%,project_name.ilike.%{search}%")
    rows = req.execute().data or []

    clients = _client_map()
    employees = _employee_map()
    return [
        {
            **row,
            "client_name": clients.get(row.get("client_id")),
            "project_manager_name": employees.get(row.get("project_manager_id")),
        }
        for row in rows
    ]


@router.get("/{project_id}")
def get_project(project_id: int):
    return _get_project(project_id)


@router.post("/", status_code=201)
def create_project(request: Request, payload: ProjectCreate):
    _, performed_by = _extract_jwt_claims(request)
    project_code = _generate_project_code(payload.entity)

    header = payload.model_dump()
    header["project_code"] = project_code
    header["start_date"] = _iso(payload.start_date)
    header["end_date"] = _iso(payload.end_date)
    header["record_status"] = "ACTIVE"

    res = supabase.table("projects").insert(header).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to create project")

    project_id = res.data[0]["project_id"]
    _audit("CREATE", f"Created project {project_code} — {payload.project_name}", performed_by, project_id, request)
    return _get_project(project_id)


@router.patch("/{project_id}")
def update_project(project_id: int, request: Request, payload: ProjectUpdate):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("projects").select("*").eq("project_id", project_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Project not found")

    updates = payload.model_dump(exclude_unset=True)
    if "start_date" in updates:
        updates["start_date"] = _iso(payload.start_date)
    if "end_date" in updates:
        updates["end_date"] = _iso(payload.end_date)

    if updates:
        updates["updated_at"] = _today_iso()
        supabase.table("projects").update(updates).eq("project_id", project_id).execute()

    _audit("UPDATE", f"Updated project {existing.data.get('project_code')}", performed_by, project_id, request)
    return _get_project(project_id)


@router.delete("/{project_id}")
def archive_project(project_id: int, request: Request):
    """Archive a project (soft delete). The project business status is retained."""
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("projects").select("project_code, record_status").eq("project_id", project_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Project not found")

    supabase.table("projects").update(
        {"record_status": "ARCHIVED", "updated_at": _today_iso()}
    ).eq("project_id", project_id).execute()
    _audit("ARCHIVE", f"Archived project {existing.data.get('project_code')}", performed_by, project_id, request)
    return _get_project(project_id)


# ── Actions: assign manager, progress, close ────────────────────────────────────

@router.post("/{project_id}/assign-manager")
def assign_manager(project_id: int, request: Request, payload: AssignManagerPayload):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("projects").select("project_code").eq("project_id", project_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Project not found")

    employees = _employee_map()
    manager_name = employees.get(payload.project_manager_id, f"#{payload.project_manager_id}")
    supabase.table("projects").update({
        "project_manager_id": payload.project_manager_id,
        "updated_at": _today_iso(),
    }).eq("project_id", project_id).execute()

    _audit("UPDATE", f"Assigned {manager_name} as project manager for {existing.data.get('project_code')}", performed_by, project_id, request)
    return _get_project(project_id)


@router.post("/{project_id}/progress")
def update_progress(project_id: int, request: Request, payload: ProgressPayload):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("projects").select("project_code").eq("project_id", project_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Project not found")

    percent = max(0.0, min(100.0, _num(payload.completion_percent)))
    updates = {"completion_percent": percent, "updated_at": _today_iso()}
    if payload.status:
        updates["status"] = payload.status
    elif percent >= 100:
        updates["status"] = "COMPLETED"
    elif percent > 0:
        updates["status"] = "IN_PROGRESS"

    supabase.table("projects").update(updates).eq("project_id", project_id).execute()
    _audit("UPDATE", f"Updated progress of {existing.data.get('project_code')} to {percent:g}%", performed_by, project_id, request)
    return _get_project(project_id)


@router.post("/{project_id}/close")
def close_project(project_id: int, request: Request, payload: ClosePayload):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("projects").select("project_code, remarks").eq("project_id", project_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Project not found")

    updates = {
        "status": "CLOSED",
        "completion_percent": 100,
        "closed_at": _today_iso(),
        "closed_by_employee_id": _employee_id_for_email(performed_by),
        "updated_at": _today_iso(),
    }
    if payload.remarks:
        updates["remarks"] = payload.remarks
    supabase.table("projects").update(updates).eq("project_id", project_id).execute()

    _audit("STATUS_CHANGE", f"Closed project {existing.data.get('project_code')}", performed_by, project_id, request)
    return _get_project(project_id)


# ── Budget items ────────────────────────────────────────────────────────────────

@router.post("/{project_id}/budget", status_code=201)
def add_budget_item(project_id: int, request: Request, payload: BudgetItemPayload):
    _, performed_by = _extract_jwt_claims(request)
    row = payload.model_dump()
    row["project_id"] = project_id
    res = supabase.table("project_budget_items").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to add budget item")
    _audit("CREATE", f"Added budget item to project #{project_id}", performed_by, project_id, request)
    return _get_project(project_id)


@router.patch("/budget/{budget_item_id}")
def update_budget_item(budget_item_id: int, request: Request, payload: BudgetItemPayload):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("project_budget_items").select("project_id").eq("budget_item_id", budget_item_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Budget item not found")
    project_id = existing.data["project_id"]
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_at"] = _today_iso()
    supabase.table("project_budget_items").update(updates).eq("budget_item_id", budget_item_id).execute()
    _audit("UPDATE", f"Updated budget item #{budget_item_id}", performed_by, project_id, request)
    return _get_project(project_id)


@router.delete("/budget/{budget_item_id}")
def delete_budget_item(budget_item_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("project_budget_items").select("project_id").eq("budget_item_id", budget_item_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Budget item not found")
    project_id = existing.data["project_id"]
    supabase.table("project_budget_items").delete().eq("budget_item_id", budget_item_id).execute()
    _audit("DELETE", f"Deleted budget item #{budget_item_id}", performed_by, project_id, request)
    return _get_project(project_id)


# ── Milestones ──────────────────────────────────────────────────────────────────

@router.post("/{project_id}/milestones", status_code=201)
def add_milestone(project_id: int, request: Request, payload: MilestonePayload):
    _, performed_by = _extract_jwt_claims(request)
    row = payload.model_dump()
    row["project_id"] = project_id
    row["target_date"] = _iso(payload.target_date)
    row["completion_date"] = _iso(payload.completion_date)
    res = supabase.table("project_milestones").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to add milestone")
    _audit("CREATE", f"Added milestone '{payload.milestone_name}' to project #{project_id}", performed_by, project_id, request)
    return _get_project(project_id)


@router.patch("/milestones/{milestone_id}")
def update_milestone(milestone_id: int, request: Request, payload: MilestoneUpdate):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("project_milestones").select("project_id").eq("milestone_id", milestone_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Milestone not found")
    project_id = existing.data["project_id"]
    updates = payload.model_dump(exclude_unset=True)
    if "target_date" in updates:
        updates["target_date"] = _iso(payload.target_date)
    if "completion_date" in updates:
        updates["completion_date"] = _iso(payload.completion_date)
    updates["updated_at"] = _today_iso()
    supabase.table("project_milestones").update(updates).eq("milestone_id", milestone_id).execute()
    _audit("UPDATE", f"Updated milestone #{milestone_id}", performed_by, project_id, request)
    return _get_project(project_id)


@router.post("/milestones/{milestone_id}/bill")
def bill_milestone(milestone_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("project_milestones").select("*").eq("milestone_id", milestone_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Milestone not found")
    project_id = existing.data["project_id"]
    project = supabase.table("projects").select("*").eq("project_id", project_id).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")
    invoice = _create_draft_invoice_for_milestone(project.data, existing.data, request, performed_by)
    supabase.table("project_milestones").update({
        "is_billed": True,
        "status": "BILLED",
        "updated_at": _today_iso(),
    }).eq("milestone_id", milestone_id).execute()
    invoice_note = f" and created draft invoice {invoice.get('invoice_number')}" if invoice else ""
    _audit("STATUS_CHANGE", f"Marked milestone '{existing.data.get('milestone_name')}' as billed{invoice_note}", performed_by, project_id, request)
    return _get_project(project_id)


@router.delete("/milestones/{milestone_id}")
def delete_milestone(milestone_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("project_milestones").select("project_id").eq("milestone_id", milestone_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Milestone not found")
    project_id = existing.data["project_id"]
    supabase.table("project_milestones").delete().eq("milestone_id", milestone_id).execute()
    _audit("DELETE", f"Deleted milestone #{milestone_id}", performed_by, project_id, request)
    return _get_project(project_id)


# ── Tasks ─────────────────────────────────────────────────────────────────────

def _recompute_project_completion(project_id: int) -> None:
    """Auto-calculate a project's completion % from its tasks.
    completion = (DONE tasks / total tasks) × 100. No tasks → 0%.
    Also nudges status: 0% & PLANNING stays; any progress → IN_PROGRESS (unless CLOSED/CANCELLED).
    """
    tasks = (
        supabase.table("project_tasks")
        .select("status")
        .eq("project_id", project_id)
        .execute()
        .data
        or []
    )
    total = len(tasks)
    done = sum(1 for t in tasks if (t.get("status") or "").upper() == "DONE")
    percent = round((done / total) * 100, 1) if total > 0 else 0.0

    updates = {"completion_percent": percent, "updated_at": _today_iso()}

    # Auto-advance status based on progress (don't touch closed/cancelled projects)
    current = supabase.table("projects").select("status").eq("project_id", project_id).single().execute()
    cur_status = (current.data or {}).get("status")
    if cur_status not in ("CLOSED", "CANCELLED"):
        if percent >= 100 and total > 0:
            updates["status"] = "COMPLETED"
        elif percent > 0:
            updates["status"] = "IN_PROGRESS"
        elif cur_status == "COMPLETED":
            # regressed below 100 — back to in progress
            updates["status"] = "IN_PROGRESS"

    supabase.table("projects").update(updates).eq("project_id", project_id).execute()


@router.post("/{project_id}/tasks", status_code=201)
def add_task(project_id: int, request: Request, payload: TaskPayload):
    _, performed_by = _extract_jwt_claims(request)
    row = payload.model_dump()
    row["project_id"] = project_id
    row["start_date"] = _iso(payload.start_date)
    row["due_date"] = _iso(payload.due_date)
    res = supabase.table("project_tasks").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to add task")
    _recompute_project_completion(project_id)
    _audit("CREATE", f"Added task '{payload.task_name}' to project #{project_id}", performed_by, project_id, request)
    return _get_project(project_id)


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, request: Request, payload: TaskUpdate):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("project_tasks").select("project_id").eq("task_id", task_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Task not found")
    project_id = existing.data["project_id"]
    updates = payload.model_dump(exclude_unset=True)
    if "start_date" in updates:
        updates["start_date"] = _iso(payload.start_date)
    if "due_date" in updates:
        updates["due_date"] = _iso(payload.due_date)
    updates["updated_at"] = _today_iso()
    supabase.table("project_tasks").update(updates).eq("task_id", task_id).execute()
    _recompute_project_completion(project_id)
    _audit("UPDATE", f"Updated task #{task_id}", performed_by, project_id, request)
    return _get_project(project_id)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("project_tasks").select("project_id").eq("task_id", task_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Task not found")
    project_id = existing.data["project_id"]
    supabase.table("project_tasks").delete().eq("task_id", task_id).execute()
    _recompute_project_completion(project_id)
    _audit("DELETE", f"Deleted task #{task_id}", performed_by, project_id, request)
    return _get_project(project_id)


# ── Materials ───────────────────────────────────────────────────────────────────

@router.post("/{project_id}/materials", status_code=201)
def add_material(project_id: int, request: Request, payload: MaterialPayload):
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)
    project = supabase.table("projects").select("*").eq("project_id", project_id).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")
    row = payload.model_dump()
    row["project_id"] = project_id
    if not row.get("product_code") and (row.get("status") or "").upper() in RESERVING_MATERIAL_STATUSES:
        row["status"] = "PLANNED"
    row["total_cost"] = _num(payload.quantity) * _num(payload.unit_cost)
    res = supabase.table("project_materials").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to add material")
    material = res.data[0]
    if (material.get("status") or "").upper() in RESERVING_MATERIAL_STATUSES:
        reserved = _reserve_material_stock(project.data, material, employee_id)
        next_status = "RESERVED" if reserved >= _num(material.get("quantity")) else "ORDERED"
        if next_status != material.get("status"):
            supabase.table("project_materials").update({
                "status": next_status,
                "updated_at": _today_iso(),
            }).eq("material_id", material["material_id"]).execute()
    elif (payload.status or "").upper() in ISSUED_MATERIAL_STATUSES:
        raise HTTPException(status_code=400, detail="Reserve the material before issuing it")

    _audit("CREATE", f"Added material to project #{project_id}", performed_by, project_id, request)
    return _get_project(project_id)


@router.patch("/materials/{material_id}")
def update_material(material_id: int, request: Request, payload: MaterialUpdate):
    _, performed_by = _extract_jwt_claims(request)
    employee_id = _employee_id_for_email(performed_by)
    existing = supabase.table("project_materials").select("*").eq("material_id", material_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Material not found")
    project_id = existing.data["project_id"]
    project = supabase.table("projects").select("*").eq("project_id", project_id).single().execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")
    previous_status = (existing.data.get("status") or "PLANNED").upper()
    requested_status = (payload.status or previous_status).upper()
    if previous_status in ISSUED_MATERIAL_STATUSES:
        mutable_fields = payload.model_dump(exclude_unset=True).keys()
        if any(field in mutable_fields for field in ("product_code", "quantity", "status")):
            raise HTTPException(status_code=400, detail="Issued materials cannot be changed")

    updates = payload.model_dump(exclude_unset=True)
    quantity = updates.get("quantity", existing.data.get("quantity"))
    unit_cost = updates.get("unit_cost", existing.data.get("unit_cost"))
    updates["total_cost"] = _num(quantity) * _num(unit_cost)
    updates["updated_at"] = _today_iso()

    material_after = {**existing.data, **updates}
    identity_changed = any(key in updates for key in ("product_code", "quantity"))
    if previous_status in RESERVING_MATERIAL_STATUSES and identity_changed and requested_status not in ISSUED_MATERIAL_STATUSES:
        _release_material_reservations(material_id)

    if requested_status in ISSUED_MATERIAL_STATUSES and previous_status not in ISSUED_MATERIAL_STATUSES:
        _issue_material_stock(project.data, existing.data)
        updates["status"] = "ISSUED"
    elif requested_status in RESERVING_MATERIAL_STATUSES:
        existing_reserved = sum(_num(row.get("quantity_reserved")) - _num(row.get("quantity_issued")) for row in _material_allocations(material_id))
        if identity_changed or existing_reserved <= 0:
            reserved = _reserve_material_stock(project.data, material_after, employee_id)
            updates["status"] = "RESERVED" if reserved >= _num(material_after.get("quantity")) else "ORDERED"
    elif previous_status in RESERVING_MATERIAL_STATUSES and requested_status not in RESERVING_MATERIAL_STATUSES:
        _release_material_reservations(material_id)

    supabase.table("project_materials").update(updates).eq("material_id", material_id).execute()
    _audit("UPDATE", f"Updated material #{material_id}", performed_by, project_id, request)
    return _get_project(project_id)


@router.delete("/materials/{material_id}")
def delete_material(material_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("project_materials").select("*").eq("material_id", material_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Material not found")
    project_id = existing.data["project_id"]
    if (existing.data.get("status") or "").upper() in ISSUED_MATERIAL_STATUSES:
        raise HTTPException(status_code=400, detail="Issued materials cannot be deleted")
    _release_material_reservations(material_id)
    supabase.table("project_materials").delete().eq("material_id", material_id).execute()
    _audit("DELETE", f"Deleted material #{material_id}", performed_by, project_id, request)
    return _get_project(project_id)


# ── Documents ─────────────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {'.pdf', '.csv', '.xlsx', '.xls', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.txt', '.zip'}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


@router.post("/{project_id}/documents", status_code=201)
async def add_document(
    project_id: int,
    request: Request,
    file: UploadFile = File(...),
    document_type: Optional[str] = Form(None),
    remarks: Optional[str] = Form(None),
):
    _, performed_by = _extract_jwt_claims(request)

    # Validate file extension
    import os
    ext = os.path.splitext(file.filename or '')[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' is not allowed. Accepted: PDF, CSV, Excel, Word, PowerPoint, images, TXT, ZIP.")

    # Read the file content (check size)
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds the 100 MB size limit.")

    # Upload to Supabase Storage
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"{project_id}/{timestamp}_{file.filename}"
    storage = supabase.storage.from_("project-documents")
    upload_res = storage.upload(safe_name, contents, {"content-type": file.content_type or "application/octet-stream"})

    if hasattr(upload_res, 'status_code') and upload_res.status_code >= 400:
        raise HTTPException(status_code=400, detail="Failed to upload file to storage.")

    # Get the public URL
    public_url = storage.get_public_url(safe_name)

    # Save metadata to DB
    row = {
        "project_id": project_id,
        "document_name": file.filename,
        "document_type": document_type,
        "file_url": public_url,
        "uploaded_by_employee_id": _employee_id_for_email(performed_by),
        "remarks": remarks,
    }
    res = supabase.table("project_documents").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Unable to save document metadata")

    _audit("CREATE", f"Uploaded document '{file.filename}' to project #{project_id}", performed_by, project_id, request)
    return _get_project(project_id)


@router.delete("/documents/{document_id}")
def delete_document(document_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    existing = supabase.table("project_documents").select("project_id, document_name").eq("document_id", document_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Document not found")
    project_id = existing.data["project_id"]
    supabase.table("project_documents").delete().eq("document_id", document_id).execute()
    _audit("DELETE", f"Removed document '{existing.data.get('document_name')}'", performed_by, project_id, request)
    return _get_project(project_id)
