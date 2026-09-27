-- ============================================================================
-- GEEK ERP — OPTIONAL lock-down (recommended for production)
--
-- Only run this AFTER backend/.env uses the Supabase *secret* key
-- (service_role / sb_secret_...) as SUPABASE_KEY. The secret key bypasses
-- Row Level Security, so the backend keeps full access, while the public
-- publishable/anon key can no longer read or change any ERP data.
--
-- If the backend still uses the publishable key, running this file will make
-- every screen fail with permission errors. To undo, re-run 02_functions.sql
-- (restores the grants) and disable RLS per table:
--   ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
        REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
