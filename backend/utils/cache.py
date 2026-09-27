"""In-memory TTL cache for API responses.

Provides a simple decorator to cache endpoint return values in process memory.
Cache hits bypass Supabase entirely, turning 800ms responses into <5ms.

Usage:
    from utils.cache import cached, invalidate_cache

    @router.get("/summary")
    @cached("dashboard:summary:{entity}", ttl=60)
    def get_summary(entity: str = None):
        ...

    @router.post("/clients")
    def create_client(...):
        ...
        invalidate_cache("clients:*")
        return result

Invalidation patterns:
    - "dashboard:*"   → clears all dashboard cache entries
    - "clients:*"     → clears all client list caches
    - "notifications:*" → clears notification caches
    - "*"             → clears everything (nuclear option)
"""
import time
import threading
import fnmatch
from functools import wraps
from typing import Any

# ── Cache storage ─────────────────────────────────────────────────────────────

_cache: dict[str, tuple[Any, float]] = {}  # key → (value, expires_at)
_lock = threading.Lock()

# ── Public API ────────────────────────────────────────────────────────────────


def cached(key_template: str, ttl: int = 60):
    """Decorator that caches the return value of a FastAPI endpoint.

    Args:
        key_template: Cache key with {param} placeholders that match the
                      function's keyword arguments. E.g. "dashboard:{entity}"
        ttl: Time-to-live in seconds. Default 60s.

    Notes:
        - Thread-safe via a lock around cache reads/writes.
        - Expired entries are cleaned up lazily on access.
        - For FastAPI endpoints, function params are passed as kwargs by the
          framework, so {param} substitution works automatically.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Build cache key from function kwargs
            try:
                # Handle None values in key template gracefully
                safe_kwargs = {k: (v if v is not None else "all") for k, v in kwargs.items()}
                cache_key = key_template.format(**safe_kwargs)
            except (KeyError, IndexError):
                # If key building fails, skip caching
                return fn(*args, **kwargs)

            now = time.time()

            # Check cache
            with _lock:
                entry = _cache.get(cache_key)
                if entry is not None:
                    value, expires_at = entry
                    if now < expires_at:
                        return value
                    else:
                        # Expired — remove it
                        del _cache[cache_key]

            # Cache miss — call the real function
            result = fn(*args, **kwargs)

            # Store in cache
            with _lock:
                _cache[cache_key] = (result, now + ttl)

            return result
        return wrapper
    return decorator


def invalidate_cache(pattern: str = "*"):
    """Remove cache entries matching a glob pattern.

    Examples:
        invalidate_cache("dashboard:*")      # all dashboard entries
        invalidate_cache("clients:*")        # all client list entries
        invalidate_cache("*")                # everything
        invalidate_cache("dashboard:summary:Expedia")  # specific key
    """
    with _lock:
        if pattern == "*":
            _cache.clear()
            return

        keys_to_remove = [k for k in _cache if fnmatch.fnmatch(k, pattern)]
        for k in keys_to_remove:
            del _cache[k]


def get_cache_stats() -> dict:
    """Return cache statistics (useful for debugging)."""
    now = time.time()
    with _lock:
        total = len(_cache)
        active = sum(1 for _, (_, exp) in _cache.items() if exp > now)
        expired = total - active
    return {"total_keys": total, "active": active, "expired": expired}


def clear_expired():
    """Manually purge expired entries (optional — happens lazily on access)."""
    now = time.time()
    with _lock:
        expired_keys = [k for k, (_, exp) in _cache.items() if exp <= now]
        for k in expired_keys:
            del _cache[k]
    return len(expired_keys)
