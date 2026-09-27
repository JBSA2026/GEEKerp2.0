-- Add form_code column to bir_forms table
-- This stores the human-readable code (e.g. EXP-2026-BIR2307-0001)

ALTER TABLE bir_forms
ADD COLUMN IF NOT EXISTS form_code TEXT;

-- Create index for code lookups and sequence queries
CREATE INDEX IF NOT EXISTS idx_bir_forms_form_code ON bir_forms(form_code);

-- Add a comment for documentation
COMMENT ON COLUMN bir_forms.form_code IS 'Human-readable code: COMPANY-YYYY-BIR{FORM_TYPE}-NNNN';
