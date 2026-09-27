-- ============================================================================
-- GEEK ERP — Supabase Storage buckets (Supabase only; skip on plain Postgres)
-- Run after 03_seed.sql, in the Supabase SQL Editor.
-- ============================================================================
-- tax-documents is public because the backend hands out get_public_url() links
-- for BIR form attachments. The other buckets are private; the backend reads
-- them with its API key and issues signed URLs where needed.
INSERT INTO storage.buckets (id, name, public) VALUES
    ('company-documents', 'company-documents', false),
    ('hr-documents',      'hr-documents',      false),
    ('project-documents', 'project-documents', false),
    ('tax-documents',     'tax-documents',     true)
ON CONFLICT (id) DO NOTHING;
