"""Small retry wrapper for transient Supabase/PostgREST transport errors."""

from __future__ import annotations

import time
from typing import Any

import httpx


_TRANSIENT_EXCEPTIONS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.PoolTimeout,
    httpx.ReadError,
    httpx.ReadTimeout,
    httpx.RemoteProtocolError,
    httpx.WriteError,
    httpx.WriteTimeout,
)


def _is_transient(exc: Exception) -> bool:
    if isinstance(exc, _TRANSIENT_EXCEPTIONS):
        return True
    return "WinError 10035" in str(exc)


def execute_with_retry(request: Any, attempts: int = 3, initial_delay: float = 0.2):
    """Execute a Supabase request, retrying short-lived socket/read failures."""
    last_exc = None
    for attempt in range(attempts):
        try:
            return request.execute()
        except Exception as exc:
            if not _is_transient(exc) or attempt == attempts - 1:
                raise
            last_exc = exc
            time.sleep(initial_delay * (2 ** attempt))
    raise last_exc
