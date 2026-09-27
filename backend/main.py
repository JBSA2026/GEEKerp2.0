from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from routers import clients, products, auth, employees, audit_logs, inventory, suppliers, master_data, quotations, documents, contacts, leads, sales_activity, opportunities, sales_forecast, sales_orders, services, warehouses, purchasing, crm, projects, hr, ar, ap, company_documents, tax, tax_reminders, loa, payroll, general_ledger, workflow_approval, commission, dashboard, delivery_notes, notifications, ojt, reports
from middleware.audit_middleware import AuditMiddleware
import time
import logging
import re

# Use a dedicated logger that won't conflict with uvicorn's custom formatter
timing_logger = logging.getLogger("erp.timing")

app = FastAPI(title="GEEK ERP API")


# ── Request timing middleware ─────────────────────────────────────────────────

@app.middleware("http")
async def ensure_cors_on_errors(request: Request, call_next):
    """Ensure CORS headers are present on error responses so the browser doesn't
    block the error body with 'Failed to fetch'.

    Starlette's CORSMiddleware sometimes fails to add CORS headers on error
    responses that come from exception handlers. This middleware patches them in.
    """
    response = await call_next(request)
    if response.status_code >= 400:
        origin = request.headers.get("origin", "")
        if origin and not response.headers.get("access-control-allow-origin"):
            if re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", origin):
                response.headers["access-control-allow-origin"] = origin
                response.headers["access-control-allow-credentials"] = "true"
                response.headers["vary"] = "Origin"
    return response


@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Response-Time"] = f"{duration_ms:.0f}ms"
    method = request.method
    path = request.url.path
    status_code = response.status_code

    # ANSI color codes
    RESET = "\033[0m"
    BOLD = "\033[1m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    RED = "\033[31m"
    CYAN = "\033[36m"
    MAGENTA = "\033[35m"
    DIM = "\033[2m"

    # Speed badge
    if duration_ms < 200:
        speed_label = f"{GREEN}{BOLD} FAST {RESET}"
    elif duration_ms < 1000:
        speed_label = f"{YELLOW}{BOLD}  OK  {RESET}"
    else:
        speed_label = f"{RED}{BOLD} SLOW {RESET}"

    # Method color
    method_colors = {"GET": CYAN, "POST": GREEN, "PUT": YELLOW, "PATCH": YELLOW, "DELETE": RED}
    method_color = method_colors.get(method, DIM)
    method_str = f"{method_color}{BOLD}{method:<7}{RESET}"

    # Status color
    if status_code < 300:
        status_str = f"{GREEN}{status_code}{RESET}"
    elif status_code < 400:
        status_str = f"{CYAN}{status_code}{RESET}"
    elif status_code < 500:
        status_str = f"{YELLOW}{status_code}{RESET}"
    else:
        status_str = f"{RED}{BOLD}{status_code}{RESET}"

    # Duration color
    if duration_ms < 200:
        time_str = f"{GREEN}{duration_ms:.0f}ms{RESET}"
    elif duration_ms < 1000:
        time_str = f"{YELLOW}{duration_ms:.0f}ms{RESET}"
    else:
        time_str = f"{RED}{BOLD}{duration_ms:.0f}ms{RESET}"

    print(f"  {speed_label} {method_str} {DIM}{path}{RESET} -> {status_str} {DIM}in{RESET} {time_str}")
    return response

# ── Exception handlers (consistent JSON error shape) ──────────────────────────
# Every error response returns: {"error": "<human readable message>", "fields": {<field>: <msg>}}
# so the frontend can show a consolidated message and optionally map field errors.

def _format_validation_errors(exc: RequestValidationError) -> tuple[str, dict[str, str]]:
    fields: dict[str, str] = {}
    for err in exc.errors():
        # loc is like ("body", "field_name") — take the last string segment as the field
        loc = [p for p in err.get("loc", []) if isinstance(p, str) and p != "body"]
        field = loc[-1] if loc else "request"
        msg = err.get("msg", "Invalid value")
        # Pydantic prefixes with "Value error, " for custom validators — strip it
        msg = msg.replace("Value error, ", "")
        fields[field] = msg
    if len(fields) == 1:
        only_field, only_msg = next(iter(fields.items()))
        summary = f"{only_field.replace('_', ' ').capitalize()}: {only_msg}"
    else:
        summary = "Please correct the highlighted fields."
    return summary, fields


def _cors_headers_for_request(request: Request) -> dict:
    """Return CORS headers when the request has a valid local Origin."""
    origin = request.headers.get("origin", "")
    if origin and re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", origin):
        return {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
            "vary": "Origin",
        }
    return {}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    summary, fields = _format_validation_errors(exc)
    return JSONResponse(status_code=422, content={"error": summary, "fields": fields}, headers=_cors_headers_for_request(request))


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    # detail may already be a dict (custom) or a plain string
    if isinstance(detail, dict):
        content = detail
    else:
        content = {"error": str(detail)}
    return JSONResponse(status_code=exc.status_code, content=content, headers=_cors_headers_for_request(request))


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Log the actual traceback so developers can debug
    import traceback
    logging.getLogger("erp.errors").error(
        f"Unhandled error on {request.method} {request.url.path}: {exc}\n{''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))}"
    )
    # Include a truncated error message so the frontend can show what went wrong
    error_message = str(exc)
    if len(error_message) > 300:
        error_message = error_message[:300] + "..."
    return JSONResponse(
        status_code=500,
        content={"error": f"Server error: {error_message}"},
        headers=_cors_headers_for_request(request),
    )


# ── Middleware (outermost first) ──────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

app.add_middleware(AuditMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(clients.router)
app.include_router(products.router)
app.include_router(employees.router)
app.include_router(suppliers.router)
app.include_router(master_data.router)
app.include_router(audit_logs.router)
app.include_router(inventory.router)
app.include_router(quotations.router)
app.include_router(purchasing.router)
app.include_router(documents.router)
app.include_router(contacts.router)
app.include_router(leads.router)
app.include_router(sales_activity.router)
app.include_router(opportunities.router)
app.include_router(sales_forecast.router)
app.include_router(sales_orders.router)
app.include_router(services.router)
app.include_router(warehouses.router)
app.include_router(crm.router)
app.include_router(projects.router)
app.include_router(hr.router)
app.include_router(ar.router)
app.include_router(ap.router)
app.include_router(company_documents.router)
app.include_router(tax.router)
app.include_router(tax_reminders.router)
app.include_router(loa.router)
app.include_router(payroll.router)
app.include_router(general_ledger.router)
app.include_router(workflow_approval.router)
app.include_router(commission.router)
app.include_router(dashboard.router)
app.include_router(delivery_notes.router)
app.include_router(notifications.router)
app.include_router(ojt.router)
app.include_router(reports.router)


# ── Cache management (admin only) ─────────────────────────────────────────────

@app.get("/cache/stats", tags=["Admin"])
def cache_stats():
    from utils.cache import get_cache_stats
    return get_cache_stats()


@app.post("/cache/clear", tags=["Admin"])
def cache_clear():
    from utils.cache import invalidate_cache
    invalidate_cache("*")
    return {"status": "cleared"}
