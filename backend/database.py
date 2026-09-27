from supabase import create_client, Client, ClientOptions
from dotenv import load_dotenv
import httpx
import os

load_dotenv()

_SUPABASE_TIMEOUT = httpx.Timeout(
    timeout=30.0,
    connect=10.0,
    read=30.0,
    write=30.0,
    pool=10.0,
)

# Use an explicit HTTPX client so PostgREST reads have consistent timeout and
# connection-pool behavior on Windows during bursty dashboard/module loads.
supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"],
    options=ClientOptions(
        postgrest_client_timeout=_SUPABASE_TIMEOUT,
        httpx_client=httpx.Client(
            timeout=_SUPABASE_TIMEOUT,
            http1=True,
            http2=False,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
        ),
    ),
)
