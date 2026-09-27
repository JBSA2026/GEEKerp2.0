from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from database import supabase
from middleware.audit_middleware import write_audit_log, _extract_jwt_claims
from utils.errors import db_http_error

router = APIRouter(prefix="/sales_forecast", tags=["sales_forecast"])


class SalesForecastCreate(BaseModel):
    employee_id: Optional[int] = None
    forecast_period: str
    quota_amount: Optional[float] = None
    pipeline_value: Optional[float] = None
    weighted_value: Optional[float] = None
    achieve_amount: Optional[float] = None


class SalesForecastUpdate(BaseModel):
    employee_id: Optional[int] = None
    forecast_period: Optional[str] = None
    quota_amount: Optional[float] = None
    pipeline_value: Optional[float] = None
    weighted_value: Optional[float] = None
    achieve_amount: Optional[float] = None


@router.get("/")
def get_sales_forecasts(search: Optional[str] = Query(None)):
    req = supabase.table("sales_forecast").select("*").order("forecast_id")
    if search and search.strip():
        s = search.strip()
        req = req.or_(f"forecast_period.ilike.%{s}%")
    return req.execute().data or []


@router.post("/", status_code=201)
def create_sales_forecast(request: Request, payload: SalesForecastCreate):
    _, performed_by = _extract_jwt_claims(request)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        res = supabase.table("sales_forecast").insert(data).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    record = res.data[0]
    write_audit_log(
        action="CREATE",
        module_name="Sales",
        description=f"Created forecast for period {payload.forecast_period}",
        performed_by=performed_by,
        record_id=record.get("forecast_id"),
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return record


@router.patch("/{forecast_id}")
def update_sales_forecast(forecast_id: int, request: Request, payload: SalesForecastUpdate):
    _, performed_by = _extract_jwt_claims(request)
    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        existing = supabase.table("sales_forecast").select("*").eq("forecast_id", forecast_id).single().execute()
        return existing.data

    try:
        res = supabase.table("sales_forecast").update(updates).eq("forecast_id", forecast_id).execute()
    except Exception as e:
        raise db_http_error(e)
    if not res.data:
        raise HTTPException(status_code=404, detail="Forecast not found")

    write_audit_log(
        action="UPDATE",
        module_name="Sales",
        description=f"Updated forecast ID {forecast_id}",
        performed_by=performed_by,
        record_id=forecast_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return res.data[0]


@router.delete("/{forecast_id}", status_code=204)
def delete_sales_forecast(forecast_id: int, request: Request):
    _, performed_by = _extract_jwt_claims(request)
    supabase.table("sales_forecast").delete().eq("forecast_id", forecast_id).execute()

    write_audit_log(
        action="DELETE",
        module_name="Sales",
        description=f"Deleted forecast ID {forecast_id}",
        performed_by=performed_by,
        record_id=forecast_id,
        ip_address=request.client.host if request.client else None,
        request=request,
    )
    return None
