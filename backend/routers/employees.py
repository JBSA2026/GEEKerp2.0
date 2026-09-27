from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
import bcrypt
import re

router = APIRouter(prefix="/employees", tags=["employees"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class EmployeeCreate(BaseModel):
    first_name: str
    last_name:  str
    email:      str
    password:   str
    address:    Optional[str] = None
    is_active:  bool = True
    roles:      list[str] = Field(default_factory=list)  # e.g. ["SUPER_ADMIN"]

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', v):
            raise ValueError('Enter a valid email address.')
        return v.strip().lower()


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name:  Optional[str] = None
    email:      Optional[str] = None
    password:   Optional[str] = None
    address:    Optional[str] = None
    is_active:  Optional[bool] = None
    roles:      Optional[list[str]] = None

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', v):
            raise ValueError('Enter a valid email address.')
        return v.strip().lower()


class EmployeeResponse(BaseModel):
    employee_id: int
    first_name:  str
    last_name:   str
    email:       str
    address:     Optional[str]
    is_active:   bool
    created_at:  str
    updated_at:  Optional[str] = None
    roles:       list[str] = Field(default_factory=list)


class RoleItem(BaseModel):
    role_name:   str
    description: Optional[str] = None


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_role_ids(role_names: list[str]) -> dict[str, int]:
    """Return {role_name: role_id} for the given role_name list."""
    res = (
        supabase.table("roles")
        .select("role_id, role_name")
        .in_("role_name", role_names)
        .execute()
    )
    return {r["role_name"]: r["role_id"] for r in (res.data or [])}


def _get_role_names_for_employees(employee_ids: list[int]) -> dict[int, list[str]]:
    """
    Fetch employee_roles joined to roles for a batch of employee_ids.
    Returns {employee_id: [role_name, ...]}
    """
    res = (
        supabase.table("employee_roles")
        .select("employee_id, roles(role_name)")
        .in_("employee_id", employee_ids)
        .execute()
    )
    mapping: dict[int, list[str]] = {}
    for row in (res.data or []):
        eid = row["employee_id"]
        role_name = row.get("roles", {}).get("role_name")
        if role_name:
            mapping.setdefault(eid, []).append(role_name)
    return mapping


def _attach_roles(employee: dict, roles: list[str] | None = None) -> dict:
    employee["roles"] = roles if roles is not None else _get_role_names_for_employees(
        [employee["employee_id"]]
    ).get(employee["employee_id"], [])
    return employee


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/roles", response_model=list[RoleItem])
def list_roles():
    """Return all available roles."""
    res = (
        supabase.table("roles")
        .select("role_name, description")
        .order("role_name")
        .execute()
    )
    return res.data or []


@router.get("/", response_model=list[EmployeeResponse])
def list_employees(search: Optional[str] = Query(None)):
    req = (
        supabase.table("employees")
        .select("employee_id, first_name, last_name, email, address, is_active, created_at")
        .order("employee_id")
    )
    if search and search.strip():
        s = search.strip()
        req = req.or_(
            f"first_name.ilike.%{s}%,"
            f"last_name.ilike.%{s}%,"
            f"email.ilike.%{s}%"
        )
    employees = req.execute().data or []

    if not employees:
        return []

    ids = [e["employee_id"] for e in employees]
    roles_map = _get_role_names_for_employees(ids)
    for emp in employees:
        emp["roles"] = roles_map.get(emp["employee_id"], [])

    return employees


@router.post("/", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(request: Request, payload: EmployeeCreate):
    _, performed_by = _extract_jwt_claims(request)

    # Duplicate email check
    if supabase.table("employees").select("employee_id").eq("email", payload.email).execute().data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # Validate roles and resolve to role_ids up-front
    role_id_map: dict[str, int] = {}
    if payload.roles:
        role_id_map = _get_role_ids(payload.roles)
        invalid = [r for r in payload.roles if r not in role_id_map]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid role(s): {', '.join(invalid)}",
            )

    # Hash password
    password_hash = bcrypt.hashpw(
        payload.password.encode(), bcrypt.gensalt()
    ).decode()

    # Insert employee
    emp_res = supabase.table("employees").insert({
        "first_name":    payload.first_name,
        "last_name":     payload.last_name,
        "email":         payload.email,
        "password_hash": password_hash,
        "address":       payload.address,
        "is_active":     payload.is_active,
    }).execute()

    if not emp_res.data:
        raise HTTPException(status_code=500, detail="Failed to create employee.")

    employee    = emp_res.data[0]
    employee_id = employee["employee_id"]

    # Insert roles
    assigned_roles: list[str] = []
    if payload.roles and role_id_map:
        rows = [{"employee_id": employee_id, "role_id": role_id_map[r]} for r in payload.roles]
        supabase.table("employee_roles").insert(rows).execute()
        assigned_roles = payload.roles

    employee["roles"] = assigned_roles

    role_str = ", ".join(assigned_roles) if assigned_roles else "no roles"
    write_audit_log(
        action       = "CREATE",
        module_name  = "Administration",
        description  = f"Created new employee {payload.first_name} {payload.last_name} ({payload.email}) with {role_str}",
        performed_by = performed_by,
        employee_id  = employee_id,
        record_id    = employee_id,
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )
    return employee


@router.patch("/{employee_id}", response_model=EmployeeResponse)
def update_employee(employee_id: int, request: Request, payload: EmployeeUpdate):
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("employees")
        .select("employee_id, first_name, last_name, email, address, is_active")
        .eq("employee_id", employee_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

    target_name  = f"{existing.data['first_name']} {existing.data['last_name']}"
    target_email = existing.data["email"]

    updates = payload.model_dump(exclude_unset=True, exclude={"roles", "password"})

    if payload.email and payload.email != existing.data["email"]:
        duplicate = (
            supabase.table("employees")
            .select("employee_id")
            .eq("email", payload.email)
            .neq("employee_id", employee_id)
            .execute()
        )
        if duplicate.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )

    if payload.password:
        updates["password_hash"] = bcrypt.hashpw(
            payload.password.encode(), bcrypt.gensalt()
        ).decode()

    role_id_map: dict[str, int] = {}
    if payload.roles is not None and payload.roles:
        role_id_map = _get_role_ids(payload.roles)
        invalid = [r for r in payload.roles if r not in role_id_map]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid role(s): {', '.join(invalid)}",
            )

    if updates:
        emp_res = (
            supabase.table("employees")
            .update(updates)
            .eq("employee_id", employee_id)
            .execute()
        )
        if not emp_res.data:
            raise HTTPException(status_code=500, detail="Failed to update employee.")
        employee = emp_res.data[0]
    else:
        employee = (
            supabase.table("employees")
            .select("employee_id, first_name, last_name, email, address, is_active, created_at")
            .eq("employee_id", employee_id)
            .single()
            .execute()
            .data
        )

    # Build a readable change summary with old → new values
    changes = []
    for field in ("first_name", "last_name", "email", "address", "is_active"):
        if field in (payload.model_fields_set or set()):
            old_val = existing.data.get(field, "—")
            new_val = updates.get(field, payload.__dict__.get(field))
            if field == "is_active":
                old_val = "active" if existing.data.get(field) else "inactive"
                new_val = "active" if payload.is_active else "inactive"
            label = field.replace("_", " ")
            if str(old_val) != str(new_val):
                changes.append(f"{label}: {old_val} → {new_val}")
    if payload.password:
        changes.append("password changed")
    if payload.roles is not None:
        changes.append(f"roles → {', '.join(payload.roles) if payload.roles else 'none'}")
    change_str = "; ".join(changes) if changes else "no effective changes"

    write_audit_log(
        action       = "UPDATE",
        module_name  = "Administration",
        description  = f"Updated {target_name} ({target_email}): {change_str}",
        performed_by = performed_by,
        employee_id  = employee_id,
        record_id    = employee_id,
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )

    if payload.roles is not None:
        supabase.table("employee_roles").delete().eq("employee_id", employee_id).execute()
        if payload.roles and role_id_map:
            rows = [{"employee_id": employee_id, "role_id": role_id_map[r]} for r in payload.roles]
            supabase.table("employee_roles").insert(rows).execute()
        return _attach_roles(employee, payload.roles)

    return _attach_roles(employee)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(employee_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)

    existing = (
        supabase.table("employees")
        .select("employee_id, first_name, last_name, email")
        .eq("employee_id", employee_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

    target_name  = f"{existing.data['first_name']} {existing.data['last_name']}"
    target_email = existing.data["email"]

    supabase.table("employee_roles").delete().eq("employee_id", employee_id).execute()
    supabase.table("employees").delete().eq("employee_id", employee_id).execute()

    write_audit_log(
        action       = "DELETE",
        module_name  = "Administration",
        description  = f"Deleted employee {target_name} ({target_email})",
        performed_by = performed_by,
        record_id    = employee_id,
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )
    return None
