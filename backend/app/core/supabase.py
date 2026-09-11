"""
Shared Supabase client provider.
Caches client instance using lru_cache to prevent allocating new HTTP connection pools on every request.
"""
from functools import lru_cache
from supabase import create_client, Client
from app.core.config import settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be configured in settings.")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
