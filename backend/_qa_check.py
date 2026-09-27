"""Check for bir_form_history and bir_form_invoices tables."""
from database import supabase

# Check bir_form_history
print("=== bir_form_history ===")
try:
    rows = supabase.table("bir_form_history").select("*").limit(1).execute().data
    if rows:
        print(f"  Columns: {list(rows[0].keys())}")
    else:
        print("  (exists but empty)")
except Exception as e:
    print(f"  MISSING or error: {e}")

# Check bir_form_invoices
print("\n=== bir_form_invoices ===")
try:
    rows = supabase.table("bir_form_invoices").select("*").limit(1).execute().data
    if rows:
        print(f"  Columns: {list(rows[0].keys())}")
    else:
        print("  (exists but empty)")
except Exception as e:
    print(f"  MISSING or error: {e}")

# Check if form_code column exists by trying to query it explicitly
print("\n=== Testing form_code column ===")
try:
    supabase.table("bir_forms").select("form_code").limit(1).execute()
    print("  form_code EXISTS")
except Exception as e:
    print(f"  form_code MISSING: {e}")
