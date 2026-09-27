-- Add columns to bir_forms for tracking received 2307 file attachments
ALTER TABLE bir_forms ADD COLUMN IF NOT EXISTS received_file_url TEXT;
ALTER TABLE bir_forms ADD COLUMN IF NOT EXISTS received_file_name TEXT;
ALTER TABLE bir_forms ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
