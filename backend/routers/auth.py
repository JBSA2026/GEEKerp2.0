from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import List
from database import supabase
from postgrest.exceptions import APIError
from middleware.audit_middleware import write_audit_log
import bcrypt
import os

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ── Config ───────────────────────────────────────────────────────────────────

SECRET_KEY = os.environ["JWT_SECRET"]
ALGORITHM  = os.environ.get("JWT_ALGORITHM", "HS256")
EXPIRE_MIN = int(os.environ.get("JWT_EXPIRE_MINUTES", 600))


# ── Helpers ──────────────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(payload: dict) -> str:
    data = payload.copy()
    data["exp"] = datetime.now(timezone.utc) + timedelta(minutes=EXPIRE_MIN)
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


def fetch_roles_by_employee_id(employee_id: int) -> List[str]:
    """
    Join employee_roles → roles to get role_name strings for an employee.
    Returns a list like ['SUPER_ADMIN', 'WORKFLOW_APPROVER'].
    """
    res = (
        supabase.table("employee_roles")
        .select("roles(role_name)")
        .eq("employee_id", employee_id)
        .execute()
    )
    return [row["roles"]["role_name"] for row in (res.data or []) if row.get("roles")]


def fetch_employee_with_roles(email: str) -> dict | None:
    """Return employee row + resolved role name list, or None."""
    try:
        emp_res = (
            supabase.table("employees")
            .select("employee_id, first_name, last_name, email, password_hash, is_active")
            .eq("email", email)
            .single()
            .execute()
        )
        if not emp_res.data:
            return None

        employee = emp_res.data
        employee["roles"] = fetch_roles_by_employee_id(employee["employee_id"])
        return employee
    except APIError as e:
        # Handle case where no employee is found (0 rows)
        if "0 rows" in str(e):
            return None
        raise


def record_last_login(employee_id: int) -> None:
    supabase.table("employees").update(
        {"last_login": datetime.now(timezone.utc).isoformat()}
    ).eq("employee_id", employee_id).execute()


def normalize_login_email(email: str) -> str:
    return (email or "").strip().lower() or "unknown"


# ── Schemas ──────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUser(BaseModel):
    employee_id: int
    email: str
    first_name: str
    last_name: str
    roles: List[str]


# ── Auth dependency ───────────────────────────────────────────────────────────

def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        employee_id: int = payload.get("employee_id")
        if employee_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    emp_res = (
        supabase.table("employees")
        .select("employee_id, email, first_name, last_name, is_active")
        .eq("employee_id", employee_id)
        .single()
        .execute()
    )
    if not emp_res.data or not emp_res.data.get("is_active"):
        raise credentials_exception

    roles = fetch_roles_by_employee_id(employee_id)
    return CurrentUser(**emp_res.data, roles=roles)


def require_roles(*allowed: str):
    """
    Route-level dependency — pass one or more role_name strings.

    Usage:
        @router.get("/admin-only")
        def admin_route(user = Depends(require_roles("SUPER_ADMIN", "HR_MANAGER"))):
            ...
    """
    def _check(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not any(r in current_user.roles for r in allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource",
            )
        return current_user
    return _check


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    attempted_email = normalize_login_email(form.username)
    employee = fetch_employee_with_roles(attempted_email)

    if not employee or not verify_password(form.password, employee["password_hash"]):
        write_audit_log(
            action       = "LOGIN_FAILED",
            module_name  = "Authentication",
            description  = f"Failed login attempt for {attempted_email}",
            performed_by = attempted_email,
            employee_id  = employee["employee_id"] if employee else None,
            ip_address   = request.client.host if request.client else None,
            new_values   = {"failure_reason": "Incorrect email or password"},
            request      = request,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not employee.get("is_active"):
        write_audit_log(
            action       = "LOGIN_FAILED",
            module_name  = "Authentication",
            description  = f"Blocked login attempt for disabled account {employee['email']}",
            performed_by = employee["email"],
            employee_id  = employee["employee_id"],
            ip_address   = request.client.host if request.client else None,
            new_values   = {"failure_reason": "Account is disabled"},
            request      = request,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    record_last_login(employee["employee_id"])

    access_token = create_access_token({
        "employee_id": employee["employee_id"],
        "email":       employee["email"],
        "first_name":  employee["first_name"],
        "last_name":   employee["last_name"],
        "roles":       employee["roles"],
    })

    write_audit_log(
        action       = "LOGIN",
        module_name  = "Authentication",
        description  = f"{employee['email']} logged into the system",
        performed_by = employee["email"],
        employee_id  = employee["employee_id"],
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )

    return {"access_token": access_token}


@router.post("/logout")
def logout(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    write_audit_log(
        action       = "LOGOUT",
        module_name  = "Authentication",
        description  = f"{current_user.email} logged out of the system",
        performed_by = current_user.email,
        employee_id  = current_user.employee_id,
        ip_address   = request.client.host if request.client else None,
        request      = request,
    )

    return {"message": "Logged out successfully"}


@router.get("/me", response_model=CurrentUser)
def get_me(current_user: CurrentUser = Depends(get_current_user)):
    return current_user


# ── Permissions endpoint (for frontend RBAC) ──────────────────────────────────

@router.get("/permissions")
def get_permissions(current_user: CurrentUser = Depends(get_current_user)):
    """Return the effective permission set for the current user.
    
    The frontend uses this to:
    1. Determine which modules to show/hide in sidebar
    2. Show/hide action buttons (create, edit, approve, delete, etc.)
    """
    from middleware.access_control import _fetch_user_permissions
    perms = _fetch_user_permissions(current_user.employee_id)
    return {
        "employee_id": current_user.employee_id,
        "email": current_user.email,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "roles": perms["roles"],
        "modules": perms["modules"],  # { module_key: permission_level }
        "is_super_admin": perms["is_super_admin"],
    }
